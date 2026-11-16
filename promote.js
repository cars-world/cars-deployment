#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Promotes a stage to the next: copies the image tags of the four apps of
// <from> into the values files of <to> and commits them. Push the commit
// and open a pull request; Argo CD syncs <to> after the merge.
//
// Usage: node promote.js <from> <to>   e.g. dev test, test prod

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';

import { Fail, output, parsePromoteArgs, promotion, run, show, writeTag } from './lib/common.js';

chdir(dirname(fileURLToPath(import.meta.url)));

await run(() => {
  const { from, to } = parsePromoteArgs(process.argv.slice(2));

  if (output('git', ['status', '--porcelain', 'values'])) {
    throw new Fail('values/ has uncommitted changes; commit or discard them first');
  }

  const read = (name) => readFileSync(`values/${name}.yaml`, 'utf8');
  const changes = promotion(read, from, to);
  if (!changes.length) {
    console.log(`✅ ${to} already runs the tags of ${from}; nothing to promote`);
    return;
  }

  for (const { file, newTag } of changes) {
    writeFileSync(file, writeTag(readFileSync(file, 'utf8'), newTag));
  }

  const details = changes.map((c) => `${c.app}: ${c.oldTag} → ${c.newTag}`);
  show('git', ['add', ...changes.map((c) => c.file)]);
  show('git', ['commit', '-m', `Promote ${from} to ${to}`, '-m', details.join('\n')]);
  for (const line of details) console.log(`  ${line}`);
  console.log(`✅ Committed the promotion of ${from} to ${to}; push it and open a pull request`);
});
