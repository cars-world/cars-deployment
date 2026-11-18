// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Shared settings and checks of the scripts in this repo.

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

/** The stages, in the order a change is promoted through them */
export const STAGES = ['dev', 'test', 'prod'];

/** The sides; each has a node pool and a namespace per stage */
export const SIDES = ['origin', 'custom'];

/** The services of a side; each has a chart in charts/ */
export const SERVICES = ['master', 'client'];

/** The kubectl context of the cluster */
export const CONTEXT = 'aks-cars';

/** The chart argo/argo-cd that bootstrap.js installs */
export const ARGO_CD_CHART_VERSION = '10.18.0';

/** An error whose message is shown to the operator without a stack */
export class Fail extends Error {}

/**
 * The names of the twelve apps: <side>-<service>-<stage>
 * @returns {string[]}
 */
export function appNames() {
  const names = [];
  for (const side of SIDES) {
    for (const service of SERVICES) {
      for (const stage of STAGES) names.push(`${side}-${service}-${stage}`);
    }
  }
  return names;
}

/**
 * Reads the arguments of promote.js
 * @param {string[]} argv - the arguments after the script name
 * @returns {{ from: string, to: string }}
 */
export function parsePromoteArgs(argv) {
  const usage = 'Usage: node promote.js <from> <to>, e.g. dev test';
  const [from, to, ...rest] = argv;
  if (!from || !to || rest.length) throw new Fail(usage);
  for (const stage of [from, to]) {
    if (!STAGES.includes(stage)) {
      throw new Fail(`Unknown stage '${stage}'. Known: ${STAGES.join(', ')}`);
    }
  }
  if (STAGES.indexOf(to) !== STAGES.indexOf(from) + 1) {
    throw new Fail(`'${from}' promotes to the next stage only, not to '${to}'`);
  }
  return { from, to };
}

/** An image tag: a version, optionally followed by a short commit */
const imageTag = /^\d+\.\d+\.\d+(-[0-9a-f]{7,40})?$/;

/**
 * Reads the arguments of set-tag.js
 * @param {string[]} argv - the arguments after the script name
 * @returns {{ app: string, stage: string, tag: string, file: string }}
 */
export function parseSetTagArgs(argv) {
  const usage = 'Usage: node set-tag.js <side>-<service> <stage> <tag>, e.g. origin-master dev 0.1.0-ab12cd3';
  const [app, stage, tag, ...rest] = argv;
  if (!app || !stage || !tag || rest.length) throw new Fail(usage);
  const apps = SIDES.flatMap((side) => SERVICES.map((service) => `${side}-${service}`));
  if (!apps.includes(app)) throw new Fail(`Unknown app '${app}'. Known: ${apps.join(', ')}`);
  if (!STAGES.includes(stage)) {
    throw new Fail(`Unknown stage '${stage}'. Known: ${STAGES.join(', ')}`);
  }
  if (!imageTag.test(tag)) {
    throw new Fail(`'${tag}' is no image tag like 0.1.0 or 0.1.0-ab12cd3`);
  }
  return { app, stage, tag, file: `values/${app}-${stage}.yaml` };
}

const tagLine = /^( {2}tag: *)(\S+)[ \t]*$/m;

/**
 * The image tag of a values file
 * @param {string} text - the content of a values file
 * @returns {string}
 */
export function readTag(text) {
  const match = text.match(tagLine);
  if (!match) throw new Fail('No image.tag found');
  return match[2];
}

/**
 * A values file with another image tag; everything else stays
 * @param {string} text - the content of a values file
 * @param {string} tag
 * @returns {string}
 */
export function writeTag(text, tag) {
  readTag(text);
  return text.replace(tagLine, `$1${tag}`);
}

/**
 * The tag changes a promotion makes, one per app whose tag differs
 * @param {(name: string) => string} read - reads values/<name>.yaml
 * @param {string} from
 * @param {string} to
 * @returns {{ app: string, file: string, oldTag: string, newTag: string }[]}
 */
export function promotion(read, from, to) {
  const changes = [];
  for (const side of SIDES) {
    for (const service of SERVICES) {
      const app = `${side}-${service}`;
      const newTag = readTag(read(`${app}-${from}`));
      const oldTag = readTag(read(`${app}-${to}`));
      if (newTag !== oldTag) {
        changes.push({ app, file: `values/${app}-${to}.yaml`, oldTag, newTag });
      }
    }
  }
  return changes;
}

/**
 * The git revisions the Argo CD files below a folder follow, one entry
 * per occurrence of targetRevision or revision
 * @param {string} dir
 * @returns {{ file: string, revision: string }[]}
 */
export function argoRevisions(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...argoRevisions(path));
      continue;
    }
    if (!entry.name.endsWith('.yaml')) continue;
    const text = readFileSync(path, 'utf8');
    // Only the revisions of this repo; a chart of another repo has its own
    const blocks = text.split(/repoURL:/).slice(1);
    for (const block of blocks) {
      if (!block.trimStart().startsWith('https://github.com/cars-world/cars-deployment')) continue;
      const m = block.match(/^\s*(?:targetRevision|revision): *(\S+)/m);
      if (m) found.push({ file: path, revision: m[1] });
    }
  }
  return found;
}

/** The shortest password set-password.js accepts */
/**
 * Reads the public hosts of the gateways from the output of helm template.
 * @param {string} rendered - The YAML documents of a stage
 * @returns {Map<string, string>} The name of each Gateway to the hostname of
 *   its https listener
 */
export function gatewayHosts(rendered) {
  const hosts = new Map();
  for (const doc of rendered.split(/^---$/m)) {
    if (!/^kind: Gateway$/m.test(doc)) continue;
    const name = doc.match(/^  name: (\S+)$/m)?.[1];
    const https = doc.split(/- name: https$/m)[1] ?? '';
    const host = https.match(/hostname: (\S+)/)?.[1];
    if (name && host) hosts.set(name, host);
  }
  return hosts;
}

/**
 * Reads where the HTTPRoutes of an app attach, from the output of helm
 * template.
 * @param {string} rendered - The YAML documents of an app
 * @returns {{ gateway: string, host: string }[]} The parent Gateway and the
 *   first hostname of each HTTPRoute
 */
export function routeParents(rendered) {
  const parents = [];
  for (const doc of rendered.split(/^---$/m)) {
    if (!/^kind: HTTPRoute$/m.test(doc)) continue;
    const gateway = doc.match(/parentRefs:\n\s+- name: (\S+)/)?.[1];
    const host = doc.match(/hostnames:\n\s+- (\S+)/)?.[1];
    parents.push({ gateway, host });
  }
  return parents;
}

export const MIN_PASSWORD_LENGTH = 12;

/**
 * The personal Argo CD accounts that may sign in, as listed in the
 * values of Argo CD: `accounts.<name>: login`
 * @param {string} values - the content of argocd/values.yaml
 * @returns {string[]}
 */
export function argoAccounts(values) {
  return [...values.matchAll(/^\s*accounts\.([a-z0-9-]+):\s*\S*login/gm)].map((m) => m[1]);
}

/**
 * Throws unless a password is long enough and was typed twice the same
 * @param {string} password
 * @param {string} repeat
 */
export function checkPassword(password, repeat) {
  if (password !== repeat) throw new Fail('The passwords differ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Fail(`The password needs at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

/**
 * The patch of argocd-secret that sets the password of an account
 * @param {string} account
 * @param {string} hash - the bcrypt hash of the password, $2a$ or $2y$
 * @param {Date} now
 * @returns {string} JSON
 */
export function passwordPatch(account, hash, now) {
  if (!/^\$2[aby]\$\d\d\$.{53}$/.test(hash)) throw new Fail('Not a bcrypt hash');
  return JSON.stringify({
    stringData: {
      // Argo CD expects the prefix $2a$
      [`accounts.${account}.password`]: hash.replace(/^\$2[by]\$/, '$2a$'),
      [`accounts.${account}.passwordMtime`]: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  });
}

/**
 * Runs a command and returns its trimmed output
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
export function output(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

/**
 * Runs a command with its output on the console
 * @param {string} cmd
 * @param {string[]} args
 */
export function show(cmd, args) {
  const { status } = spawnSync(cmd, args, { stdio: 'inherit' });
  if (status !== 0) throw new Fail(`${cmd} ${args[0]} failed`);
}

/**
 * Asks a yes/no question on the console
 * @param {string} question
 * @returns {Promise<boolean>} true for y or yes
 */
export async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Runs a script body and prints a Fail as one line
 * @param {() => Promise<void> | void} body
 */
export async function run(body) {
  try {
    await body();
  } catch (e) {
    if (e instanceof Fail) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}
