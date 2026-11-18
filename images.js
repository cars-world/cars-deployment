#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Prints the images of the four apps of a stage, one per line, as the
// charts pull them, e.g. to scan them.
//
// Usage: node images.js <stage>   e.g. test

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';

import { Fail, run, stageImages } from './lib/common.js';

chdir(dirname(fileURLToPath(import.meta.url)));

await run(() => {
  const [stage, ...rest] = process.argv.slice(2);
  if (!stage || rest.length) throw new Fail('Usage: node images.js <stage>, e.g. test');
  const read = (name) => readFileSync(`values/${name}.yaml`, 'utf8');
  for (const image of stageImages(read, stage)) console.log(image);
});
