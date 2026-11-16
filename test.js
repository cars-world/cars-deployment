#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The test of cars-deployment: runs the unit tests of lib, lints the
// charts, renders all twelve apps and the three stages, and checks that
// every Argo CD file follows the same revision of this repo. Run it
// before each commit.
//
//   node test.js

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';

import { appNames, argoRevisions, gatewayHosts, routeParents, STAGES } from './lib/common.js';

chdir(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed++;
};
const quiet = (cmd, args) =>
  spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] }).status === 0;

check(
  spawnSync(process.execPath, ['--test', 'lib/'], { stdio: 'inherit' }).status === 0,
  'Unit tests of lib',
);

// A chart fails without side, stage and tag, so each is linted with a
// values file of its own
const lintValues = {
  master: 'values/origin-master-dev.yaml',
  client: 'values/origin-client-dev.yaml',
  stage: 'stages/dev.yaml',
};
for (const [chart, file] of Object.entries(lintValues)) {
  check(
    quiet('helm', ['lint', '--quiet', `charts/${chart}`, '-f', file]),
    `helm lint charts/${chart}`,
  );
}

for (const app of appNames()) {
  const file = `values/${app}.yaml`;
  const service = app.split('-')[1];
  check(
    existsSync(file) && quiet('helm', ['template', app, `charts/${service}`, '-f', file]),
    `renders ${app}`,
  );
}

for (const stage of STAGES) {
  check(
    quiet('helm', ['template', stage, 'charts/stage', '-f', `stages/${stage}.yaml`]),
    `renders the stage ${stage}`,
  );
}

// Each app attaches to a Gateway its stage renders, with that Gateway's host
const render = (args) => spawnSync('helm', ['template', ...args], { encoding: 'utf8' }).stdout ?? '';
for (const app of appNames()) {
  const stage = app.split('-')[2];
  const hosts = gatewayHosts(render([stage, 'charts/stage', '-f', `stages/${stage}.yaml`]));
  const service = app.split('-')[1];
  const parents = routeParents(render([app, `charts/${service}`, '-f', `values/${app}.yaml`]));
  check(
    parents.length > 0 && parents.every((p) => hosts.get(p.gateway) === p.host),
    `${app} attaches to ${parents.map((p) => p.host).join(', ')}`,
  );
}

const revisions = argoRevisions('argocd');
const distinct = [...new Set(revisions.map((r) => r.revision))];
check(
  revisions.length > 0 && distinct.length === 1,
  `Argo CD follows one revision: ${distinct.join(', ')}`,
);

if (failed) {
  console.log(`❌ ${failed} checks failed`);
  process.exit(1);
}
console.log(`✅ All checks pass: ${appNames().length} apps and ${STAGES.length} stages render`);
