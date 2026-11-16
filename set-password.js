#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Sets the password of a personal Argo CD account. The account must be
// listed in configs.cm of argocd/values.yaml. The password is asked for
// without echo and stored as a bcrypt hash in the secret argocd-secret
// only; it never appears in an argument or the process list.
//
// Usage: node set-password.js <account>

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chdir, stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { argoAccounts, checkPassword, Fail, passwordPatch, run } from './lib/common.js';

chdir(dirname(fileURLToPath(import.meta.url)));

/**
 * Reads one line from the terminal without showing it
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function askHidden(prompt) {
  if (!stdin.isTTY) throw new Fail('Run it in a terminal; the password is typed in');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let text = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          done();
          resolve(text);
          return;
        }
        if (ch === '\u0003') {
          done();
          reject(new Fail('Stopped; nothing was changed'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') text = text.slice(0, -1);
        else text += ch;
      }
    };
    const done = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    stdin.on('data', onData);
  });
}

await run(async () => {
  const [account, ...rest] = process.argv.slice(2);
  if (!account || rest.length) throw new Fail('Usage: node set-password.js <account>');

  const accounts = argoAccounts(readFileSync('argocd/values.yaml', 'utf8'));
  if (!accounts.includes(account)) {
    throw new Fail(`'${account}' is not an account in argocd/values.yaml. Known: ${accounts.join(', ')}`);
  }

  const password = await askHidden(`New password for ${account}: `);
  checkPassword(password, await askHidden('Repeat: '));

  // The password goes to htpasswd through stdin only
  const hashed = spawnSync('htpasswd', ['-niBC', '10', ''], { input: password, encoding: 'utf8' });
  if (hashed.status !== 0) throw new Fail('htpasswd failed; it ships with macOS and apache2-utils');
  const hash = hashed.stdout.replace(/[:\n]/g, '');

  const patched = spawnSync(
    'kubectl',
    ['-n', 'argocd', 'patch', 'secret', 'argocd-secret', '--type', 'merge', '--patch-file', '/dev/stdin'],
    { input: passwordPatch(account, hash, new Date()), stdio: ['pipe', 'ignore', 'inherit'] },
  );
  if (patched.status !== 0) throw new Fail('kubectl patch failed');

  console.log(`✅ Password of ${account} set; sign in at http://localhost:8080`);
});
