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
import { existsSync, readFileSync } from 'node:fs';
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

// Each master signs in with an identity of its own
const clientIds = appNames()
  .filter((app) => app.split('-')[1] === 'master')
  .map((app) => readFileSync(`values/${app}.yaml`, 'utf8').match(/^ {2}clientId: (\S+)$/m)?.[1]);
check(
  clientIds.every(Boolean) && new Set(clientIds).size === clientIds.length,
  `Each of the ${clientIds.length} masters names a client ID of its own`,
);

// The job sql-users creates the database user of the same identities
const sqlUsers = readFileSync('platform/sql-users.yaml', 'utf8');
check(
  appNames()
    .filter((app) => app.split('-')[1] === 'master')
    .every((app, i) => {
      const [side, , stage] = app.split('-');
      return sqlUsers.includes(`"side": "${side}", "stage": "${stage}", "clientId": "${clientIds[i]}"`);
    }),
  'The job sql-users names the same client IDs as the values of the masters',
);

const revisions = argoRevisions('argocd');
const distinct = [...new Set(revisions.map((r) => r.revision))];
check(
  revisions.length > 0 && distinct.length === 1,
  `Argo CD follows one revision: ${distinct.join(', ')}`,
);

const ruleset = JSON.parse(readFileSync('.github/rulesets/main.json', 'utf8'));
const rule = (type) => ruleset.rules.find((r) => r.type === type)?.parameters;
check(
  rule('required_status_checks')?.required_status_checks.some((c) => c.context === 'scan') &&
    rule('pull_request')?.require_code_owner_review === true,
  'The ruleset of main requires the check scan and the review of the code owner',
);
check(
  /^\/values\/\*-prod\.yaml +@\S+/m.test(readFileSync('.github/CODEOWNERS', 'utf8')),
  'CODEOWNERS names an owner of the values of prod',
);

check(
  /^ {4}name: scan$/m.test(readFileSync('.github/workflows/scan.yaml', 'utf8')),
  'The job of scan.yaml reports the check scan the ruleset requires',
);

const ignored = readFileSync('.trivyignore', 'utf8')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'));
check(
  ignored.every((line) => /^CVE-\d+-\d+ exp:\d{4}-\d{2}-\d{2}$/.test(line.trim())),
  `Each of the ${ignored.length} accepted findings in .trivyignore expires`,
);

if (failed) {
  console.log(`❌ ${failed} checks failed`);
  process.exit(1);
}
console.log(`✅ All checks pass: ${appNames().length} apps and ${STAGES.length} stages render`);
