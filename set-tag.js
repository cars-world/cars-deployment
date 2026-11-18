#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Sets the image tag of one app in one stage: writes it into
// values/<side>-<service>-<stage>.yaml and nothing else. Committing and
// pushing is left to the caller; Argo CD syncs the stage after the push.
//
// Usage: node set-tag.js <side>-<service> <stage> <tag>
//        e.g. origin-master dev 0.1.0-ab12cd3

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseSetTagArgs, readTag, run, writeTag } from './lib/common.js';

chdir(dirname(fileURLToPath(import.meta.url)));

await run(() => {
  const { app, stage, tag, file } = parseSetTagArgs(process.argv.slice(2));
  const text = readFileSync(file, 'utf8');
  const oldTag = readTag(text);
  if (oldTag === tag) {
    console.log(`✅ ${app}-${stage} already runs ${tag}`);
    return;
  }
  writeFileSync(file, writeTag(text, tag));
  console.log(`✅ ${app}-${stage}: ${oldTag} → ${tag}`);
});
