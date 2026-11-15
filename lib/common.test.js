// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  appNames,
  argoRevisions,
  Fail,
  parsePromoteArgs,
  promotion,
  readTag,
  writeTag,
} from './common.js';

const values = (tag) => `side: origin\nimage:\n  tag: ${tag}\n`;

describe('appNames', () => {
  it('names twelve apps', () => {
    const names = appNames();
    assert.equal(names.length, 12);
    assert.ok(names.includes('custom-client-prod'));
  });
});

describe('parsePromoteArgs', () => {
  it('accepts the next stage', () => {
    assert.deepEqual(parsePromoteArgs(['dev', 'test']), { from: 'dev', to: 'test' });
    assert.deepEqual(parsePromoteArgs(['test', 'prod']), { from: 'test', to: 'prod' });
  });

  it('rejects skipping a stage, going back and unknown stages', () => {
    assert.throws(() => parsePromoteArgs(['dev', 'prod']), Fail);
    assert.throws(() => parsePromoteArgs(['prod', 'test']), Fail);
    assert.throws(() => parsePromoteArgs(['dev', 'stage']), Fail);
    assert.throws(() => parsePromoteArgs(['dev']), Fail);
  });
});

describe('readTag and writeTag', () => {
  it('reads and replaces image.tag only', () => {
    assert.equal(readTag(values('0.0.1')), '0.0.1');
    assert.equal(writeTag(values('0.0.1'), '0.0.2'), values('0.0.2'));
  });

  it('fails without a tag', () => {
    assert.throws(() => readTag('side: origin\n'), Fail);
  });
});

describe('promotion', () => {
  it('lists the apps whose tag differs', () => {
    const tags = { dev: '0.0.2', test: '0.0.1' };
    const read = (name) =>
      values(name.startsWith('origin-master') ? tags[name.split('-')[2]] : '0.0.1');
    assert.deepEqual(promotion(read, 'dev', 'test'), [
      {
        app: 'origin-master',
        file: 'values/origin-master-test.yaml',
        oldTag: '0.0.1',
        newTag: '0.0.2',
      },
    ]);
  });
});

describe('argoRevisions', () => {
  it('finds the revisions of this repo and skips other charts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'argo-'));
    mkdirSync(join(dir, 'apps'));
    writeFileSync(
      join(dir, 'apps', 'a.yaml'),
      'repoURL: https://github.com/rljson/cars-deployment.git\n    targetRevision: main\n',
    );
    writeFileSync(
      join(dir, 'b.yaml'),
      'repoURL: https://charts.jetstack.io\n    targetRevision: v1\n',
    );
    assert.deepEqual(argoRevisions(dir), [
      { file: join(dir, 'apps', 'a.yaml'), revision: 'main' },
    ]);
  });
});
