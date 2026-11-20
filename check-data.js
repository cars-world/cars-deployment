#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Checks the data of the masters from inside the cluster. For each side of
// the given stages it starts a short-lived pod as the service account
// master in cars-<side>-<stage>, signed in through the workload identity
// of that master, and checks:
//
// - its own database: sign-in and SELECT USER_NAME() succeed
// - its own container: a blob is written, read back and deleted
// - the database and the container of the other side: refused
//
// Needs kubectl with rights to create pods in the namespaces of the
// masters, and a running cluster. The pods are deleted afterwards.
//
// Usage: node check-data.js [dev|test|prod|all]   (default: dev)

import { spawnSync } from 'node:child_process';

import { Fail, run, SIDES, STAGES } from './lib/common.js';

// Runs in the pod; reads the names from the environment
const probe = `
import sql from 'mssql';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

const { SIDE, OTHER, STAGE } = process.env;
const credential = new DefaultAzureCredential();
let failed = 0;
const result = (ok, label) => { console.log((ok ? '✅ ' : '❌ ') + label); if (!ok) failed++; };

async function signIn(side) {
  const pool = new sql.ConnectionPool({
    server: 'sql-cars-' + side + '.database.windows.net',
    database: 'sqldb-cars-' + side + '-' + STAGE,
    options: { encrypt: true },
    authentication: { type: 'azure-active-directory-default', options: {} },
  });
  try {
    await pool.connect();
    const r = await pool.request().query('SELECT USER_NAME() AS u');
    return r.recordset[0].u;
  } finally {
    await pool.close();
  }
}

async function container(side) {
  const service = new BlobServiceClient('https://stcars' + side + '.blob.core.windows.net', credential);
  return service.getContainerClient(STAGE);
}

try {
  const user = await signIn(SIDE);
  result(user === 'id-cars-' + SIDE + '-master-' + STAGE, 'own database as ' + user);
} catch (e) { result(false, 'own database: ' + e.message); }

try {
  await signIn(OTHER);
  result(false, 'database of ' + OTHER + ' was NOT refused');
} catch (e) { result(true, 'database of ' + OTHER + ' refused'); }

try {
  const blob = (await container(SIDE)).getBlockBlobClient('check-data-' + Date.now());
  await blob.upload('ok', 2);
  const text = (await blob.downloadToBuffer()).toString();
  await blob.delete();
  result(text === 'ok', 'own container: write, read, delete');
} catch (e) { result(false, 'own container: ' + e.message); }

try {
  for await (const b of (await container(OTHER)).listBlobsFlat()) break;
  result(false, 'container of ' + OTHER + ' was NOT refused');
} catch (e) { result(e.statusCode === 403, 'container of ' + OTHER + ' refused (' + e.statusCode + ')'); }

process.exit(failed ? 1 : 0);
`;

function checkSide(side, stage) {
  const other = SIDES.find((s) => s !== side);
  const namespace = `cars-${side}-${stage}`;
  const pod = 'check-data';
  const overrides = {
    metadata: { labels: { 'azure.workload.identity/use': 'true' } },
    spec: {
      serviceAccountName: 'master',
      automountServiceAccountToken: false,
      nodeSelector: { side },
      tolerations: [{ key: 'side', operator: 'Equal', value: side, effect: 'NoSchedule' }],
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
      containers: [
        {
          name: pod,
          image: 'node:22-alpine',
          workingDir: '/work',
          command: ['sh', '-c'],
          args: [
            'npm install --no-audit --no-fund --loglevel=error mssql@11.0.1 @azure/storage-blob@12 @azure/identity@4 && ' +
              'printf "%s" "$PROBE" > probe.mjs && node probe.mjs',
          ],
          env: [
            { name: 'HOME', value: '/work' },
            { name: 'SIDE', value: side },
            { name: 'OTHER', value: other },
            { name: 'STAGE', value: stage },
            { name: 'PROBE', value: probe },
          ],
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
          volumeMounts: [{ name: 'work', mountPath: '/work' }],
          resources: { requests: { cpu: '50m', memory: '128Mi' }, limits: { memory: '256Mi' } },
        },
      ],
      volumes: [{ name: 'work', emptyDir: {} }],
    },
  };
  console.log(`\n🔎 ${namespace}`);
  const res = spawnSync(
    'kubectl',
    ['run', pod, '-n', namespace, '--rm', '-i', '--restart=Never', '--quiet', '--pod-running-timeout=3m',
      '--image=node:22-alpine', `--overrides=${JSON.stringify(overrides)}`],
    { stdio: 'inherit' },
  );
  return res.status === 0;
}

await run(() => {
  const arg = process.argv[2] ?? 'dev';
  const stages = arg === 'all' ? STAGES : [arg];
  if (!stages.every((s) => STAGES.includes(s))) {
    throw new Fail('Usage: node check-data.js [dev|test|prod|all]');
  }
  const failed = stages.flatMap((stage) => SIDES.filter((side) => !checkSide(side, stage)).map((s) => `${s}-${stage}`));
  if (failed.length) throw new Fail(`Failed: ${failed.join(', ')}`);
  console.log('\n✅ Each master reaches its own data and is refused at the other side');
});
