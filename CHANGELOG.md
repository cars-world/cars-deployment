# Changelog

## Unreleased

- Add the Helm charts `master`, `client` and `stage`, twelve values files
  `values/<side>-<service>-<stage>.yaml` and the stages `dev`, `test` and
  `prod`
- Each stage gets the namespaces `cars-origin-<stage>` and
  `cars-custom-<stage>` with quotas and network policies, and a gateway
  with the free Azure name
  `cars-<stage>.germanywestcentral.cloudapp.azure.com` that reaches each
  app by its path
- Add cert-manager with Let's Encrypt and the Argo CD applications: a
  root application and the ApplicationSets `stages` and `apps`
- Add the Node.js scripts `bootstrap.js`, `promote.js` and `test.js` with
  unit tests
- Certificates come from `letsencrypt` by default; Argo CD ignores the
  CA bundle and the namespace selector that change in the webhooks of
  cert-manager after the sync
- Remove the Helm charts and ArgoCD of the environment `demo`
