#!/usr/bin/env node
// @license
// Copyright (c) rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Installs Argo CD into the namespace argocd of the cluster and hands it
// the root application, which syncs everything else from git. Run it
// once, and again to upgrade Argo CD.
//
// Usage: node bootstrap.js [--yes]

import { dirname } from 'node:path';
import { chdir } from 'node:process';
import { fileURLToPath } from 'node:url';

import { ARGO_CD_CHART_VERSION, confirm, CONTEXT, Fail, output, run, show } from './lib/common.js';

chdir(dirname(fileURLToPath(import.meta.url)));

await run(async () => {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--yes')) throw new Fail('Usage: node bootstrap.js [--yes]');

  let context;
  try {
    context = output('kubectl', ['config', 'current-context']);
  } catch {
    throw new Fail(
      `No kubectl context. Run: az aks get-credentials --resource-group rg-cars --name ${CONTEXT}`,
    );
  }
  if (context !== CONTEXT) {
    throw new Fail(`kubectl points at '${context}'. Run: kubectl config use-context ${CONTEXT}`);
  }

  if (
    !args.includes('--yes') &&
    !(await confirm(`Install Argo CD ${ARGO_CD_CHART_VERSION} into '${context}'?`))
  ) {
    throw new Fail('Stopped; nothing was installed');
  }

  show('helm', ['repo', 'add', 'argo', 'https://argoproj.github.io/argo-helm', '--force-update']);
  show('helm', [
    'upgrade', '--install', 'argocd', 'argo/argo-cd',
    '--version', ARGO_CD_CHART_VERSION,
    '--namespace', 'argocd', '--create-namespace',
    '--values', 'argocd/values.yaml',
    '--wait',
  ]);
  show('kubectl', ['apply', '-f', 'argocd/root.yaml']);

  console.log('✅ Argo CD runs and syncs argocd/apps. Set your password and open its UI:');
  console.log('   node set-password.js <account>');
  console.log('   kubectl -n argocd port-forward svc/argocd-server 8080:80');
  console.log('   then http://localhost:8080');
});
