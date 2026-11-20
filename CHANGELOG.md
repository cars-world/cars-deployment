# Changelog

## Unreleased

- Chart `master`: with `data.clientId`, the master runs as the service
  account `master` with that workload identity and gets the variables
  `CARS_SQL_SERVER`, `CARS_SQL_DATABASE`, `CARS_BLOB_URL` and
  `CARS_BLOB_CONTAINER`
- Add the workflow `scan`: every pull request into `main` gets the check
  `scan`; it scans the images when the values of `test` or `prod` change
- Move the Trivy scan into `scan-images.sh`, used by `promote` and `scan`
- `.trivyignore`: the workflow `promote` accepts listed findings until
  their date `exp`; the six nginx findings of the client images until
  2026-12-03
- Add the workflow `promote`: it commits a promotion on a branch, scans
  the images with Trivy, reports the check `scan` and opens the pull
  request
- Add the ruleset of `main` and `CODEOWNERS`: pull requests with a
  passing `scan`, a code owner review for `prod`
- Add `images.js`, which lists the images of a stage
- Add the reusable workflow `build`: it tests an app, builds its image
  into `crcars` as `<version>-<short commit>`, signs in through OIDC and
  pushes the tag into the values of `dev` with a token of the GitHub App
  `cars-deploy`
- Add `set-tag.js`, which sets the image tag of one app in one stage
- Move the repository to the GitHub organization `cars-world`: Argo CD
  reads `https://github.com/cars-world/cars-deployment.git`; the package
  is `@cars-world/cars-deployment`
- Argo CD follows `main`
- Add the Helm charts `master`, `client` and `stage`, twelve values files
  `values/<side>-<service>-<stage>.yaml` and the stages `dev`, `test` and
  `prod`
- Each stage gets the namespaces `cars-origin-<stage>` and
  `cars-custom-<stage>` with quotas and network policies, and a gateway
  per side with the free Azure name
  `cars-<side>-<stage>.germanywestcentral.cloudapp.azure.com`: the client
  at `/`, the master under `/api`
- The gateway pods request 25m and 64Mi, set by `gatewayResources`
- `test.js` checks that every app attaches to a gateway of its stage with
  that gateway's host
- Add cert-manager with Let's Encrypt and the Argo CD applications: a
  root application and the ApplicationSets `stages` and `apps`
- Add the Node.js scripts `bootstrap.js`, `promote.js` and `test.js` with
  unit tests
- Certificates come from `letsencrypt` by default; Argo CD ignores the
  CA bundle and the namespace selector that change in the webhooks of
  cert-manager after the sync
- The built-in admin of Argo CD is off; operators sign in with personal
  accounts, starting with `ben`, whose password `set-password.js` sets;
  its URL is the port-forward `http://localhost:8080`
- Remove the Helm charts and ArgoCD of the environment `demo`
