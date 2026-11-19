<!--
@license
Copyright (c) rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# cars-deployment

[English](README.md) | Deutsch

Was im Kubernetes-Cluster `aks-cars` der cars-Anwendung läuft, einer
Beispiel-App auf Rljson: Helm-Charts, eine Value-Datei je App und Stufe
und die Argo-CD-Anwendungen, die den Cluster mit diesem Repo
synchron halten.

## Motivation

- Was im Cluster läuft, ist in git beschrieben; eine Stufe ändert sich
  nur durch einen Commit hier
- Ein Argo CD bedient die Stufen `dev`, `test` und `prod`
- Die Azure-Ressourcen liegen in
  [cars-infra](https://github.com/cars-world/cars-infra); eine Änderung an
  einem Image berührt sie nie

## Aufbau

| Pfad               | Inhalt                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| `charts/master`    | Helm-Chart eines Masters: der Node.js-Dienst einer Seite in einer Stufe             |
| `charts/client`    | Helm-Chart eines Clients: die statische Website, nginx leitet `/api/` zum Master    |
| `charts/stage`     | Helm-Chart einer Stufe: zwei Namespaces, Quoten, Netzwerkrichtlinien, die Gateways  |
| `values`           | `<side>-<service>-<stage>.yaml`, zwölf insgesamt: Seite, Dienst, Stufe, Image-Tag   |
| `stages`           | `dev.yaml`, `test.yaml`, `prod.yaml`                                                |
| `platform`         | Der Namespace `cars-gateway` und die Aussteller von Let's Encrypt                   |
| `argocd`           | Die Werte von Argo CD, die Root-Anwendung und `apps/`, das sie synchronisiert       |
| `bootstrap.js`     | Installiert Argo CD und übergibt ihm die Root-Anwendung                             |
| `promote.js`       | Kopiert die Image-Tags einer Stufe als Commit in die nächste                        |
| `set-password.js`  | Setzt das Passwort eines persönlichen Argo-CD-Kontos                                |
| `set-tag.js`       | Setzt den Image-Tag einer App in einer Stufe, ohne zu committen                     |
| `.github/workflows/build.yaml` | Wiederverwendbarer Workflow: testet eine App, baut ihr Image nach `crcars`, rollt es nach `dev` aus |
| `.github/workflows/promote.yaml` | Befördert eine Stufe als Pull Request in die nächste, mit einem Trivy-Scan als Check `scan` |
| `.github/workflows/scan.yaml` | Meldet den Check `scan` auf jedem Pull Request; scannt, wenn sich `test` oder `prod` ändern |
| `scan-images.sh`   | Scannt Images von `crcars` mit Trivy; genutzt von `promote` und `scan`              |
| `.github/rulesets/main.json` | Die Regel auf `main`: Pull Requests, der Check `scan`, ein Review des Code Owners für `prod` |
| `.github/CODEOWNERS` | Der Reviewer von `values/*-prod.yaml`                                               |
| `images.js`        | Listet die Images der vier Apps einer Stufe                                         |
| `test.js`          | Prüft die Charts und rendert alle zwölf Apps und drei Stufen                        |

```mermaid
flowchart LR
  git["cars-deployment<br/>auf GitHub"] --> root["Argo CD: root"]
  root --> cm["cert-manager"]
  root --> pf["platform"]
  root --> st["ApplicationSet stages<br/>stage-dev, -test, -prod"]
  root --> ap["ApplicationSet apps<br/>zwölf Apps"]
  st --> gw["Gateways cars-&lt;side&gt;-&lt;stage&gt;<br/>Namespaces cars-&lt;side&gt;-&lt;stage&gt;"]
  ap --> pods["Master und Client<br/>je Seite und Stufe"]
```

Jede Seite einer Stufe hat ein Gateway im Namespace `cars-gateway`,
dessen öffentliche IP den kostenlosen Azure-Namen
`cars-<side>-<stage>.germanywestcentral.cloudapp.azure.com` trägt, sechs
insgesamt. Der Client antwortet unter `/` seines Hosts, der Master unter
`/api` desselben Hosts:

| App           | URL in `dev`                                                        |
| ------------- | ------------------------------------------------------------------- |
| origin client | `https://cars-origin-dev.germanywestcentral.cloudapp.azure.com/`    |
| origin master | `https://cars-origin-dev.germanywestcentral.cloudapp.azure.com/api/hello` |
| custom client | `https://cars-custom-dev.germanywestcentral.cloudapp.azure.com/`    |
| custom master | `https://cars-custom-dev.germanywestcentral.cloudapp.azure.com/api/hello` |

http wird auf https umgeleitet. Ein Gateway nimmt nur die Routen seines
eigenen Namespaces an. Das Add-on betreibt zwei Pods je Gateway;
`gatewayResources` in `charts/stage/values.yaml` setzt ihre Anforderungen.
Die Pods einer Seite laufen auf ihrem Node Pool. Verkehr in einen Namespace
kommt nur aus demselben Namespace und von den Gateways; der origin
master nimmt zusätzlich den custom master derselben Stufe an.
cert-manager holt je Gateway ein Zertifikat von Let's Encrypt; `issuer`
in `charts/stage/values.yaml` wählt `letsencrypt`, dessen Zertifikaten
Browser vertrauen, oder `letsencrypt-staging`, um neue Namen unter
großzügigen Grenzen auszuprobieren.

## Verwendung

[Node.js](https://nodejs.org) 22 oder neuer, [Helm](https://helm.sh),
kubectl und kubelogin installieren, dann am Cluster anmelden:

```bash
az aks get-credentials --resource-group rg-cars --name aks-cars
kubelogin convert-kubeconfig -l azurecli
```

Argo CD einmal installieren; danach synchronisiert es alles aus git:

```bash
node bootstrap.js
```

Das Passwort des eigenen Kontos setzen; die Konten stehen in
`configs.cm` von `argocd/values.yaml`, der eingebaute Admin ist aus:

```bash
node set-password.js ben
```

Die Oberfläche von Argo CD unter <http://localhost:8080> öffnen und sich
damit anmelden:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:80
```

Ein Konto hinzufügen: es in `configs.cm` und `configs.rbac` von
`argocd/values.yaml` eintragen, `node bootstrap.js` ausführen, dann
`node set-password.js <account>`.

Eine App ändern: ihre Value-Datei bearbeiten und einen Pull Request
öffnen; Argo CD synchronisiert sie nach dem Merge.

Eine Stufe in die nächste befördern im Reiter **Actions → Promote → Run
workflow**, mit `dev` oder `test`. Der Workflow committet die Beförderung
auf einem eigenen Branch, scannt die Images der nächsten Stufe mit Trivy,
meldet das Ergebnis als Check `scan` und öffnet den Pull Request. Ein
Befund der Schwere hoch oder kritisch, für den es einen Fix gibt, lässt
den Check scheitern. `test` wird ohne Review gemergt, `prod` braucht das
Review seines Code Owners. Dasselbe von Hand, dann den Branch pushen und
einen Pull Request öffnen:

```bash
node promote.js dev test
node promote.js test prod
```

Jeder andere Pull Request bekommt den Check `scan` vom Workflow `scan`:
er besteht sofort, außer der Pull Request ändert die Werte von `test`
oder `prod`, deren Images er dann scannt. Mit **Allow auto-merge** wird
ein Pull Request von selbst gemergt, sobald `scan` besteht und, für
`prod`, sein Code Owner zugestimmt hat.

Die Regel auf `main` steht in `.github/rulesets/main.json`: Änderungen
laufen über Pull Requests mit bestandenem `scan`; die GitHub App
`cars-deploy` und die Owner der Organisation dürfen sie umgehen. Einmal
anwenden, und nach einer Änderung erneut:

```bash
gh api -X POST repos/cars-world/cars-deployment/rulesets --input .github/rulesets/main.json
```

Eine App aus ihrem eigenen Repo nach `dev` ausrollen: bei einem Push auf
`main` ruft es den wiederverwendbaren Workflow `build` auf, der die App
testet, das Image `crcars.azurecr.io/cars-<app>:<version>-<kurzer Commit>`
baut, den Tag mit `set-tag.js` in `values/<app>-dev.yaml` schreibt und
auf `main` pusht. Er meldet sich über OIDC bei Azure an und schreibt hier
mit einem Token der GitHub App `cars-deploy`, deren Schlüssel in
`kv-cars-github` liegt; in GitHub ist kein Secret gespeichert. Der
Aufrufer braucht die Variablen `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID` und `CARS_DEPLOY_APP_ID`:

```yaml
on:
  push:
    branches: ['main']
permissions:
  id-token: write
  contents: read
jobs:
  deploy:
    uses: cars-world/cars-deployment/.github/workflows/build.yaml@main
    with:
      app: origin-master
```

Einen Tag von Hand setzen:

```bash
node set-tag.js origin-master dev 0.1.0-ab12cd3
```

Argo CD folgt `main`, genannt in `targetRevision` und `revision` jeder
Datei in `argocd`; `test.js` prüft, dass sie übereinstimmen. Ein Merge in
`main` rollt aus; Argo CD löscht, was aus `main` verschwindet.

## Test

Vor jedem Commit:

```bash
node test.js
```

## Grenzen

- Nur die Images werden gescannt, nicht die Charts
- `.trivyignore` akzeptiert gelistete Befunde bis zu ihrem Datum `exp`,
  jeden mit seinem Grund; derzeit die nginx-Befunde der Clients bis
  2026-12-03
- Die Oberfläche von Argo CD nur über Port-Forward, mit persönlichen
  Konten; die Anmeldung mit Entra folgt später
- Der Cluster stoppt jeden Abend; mit `az aks start` starten

## Stand

Argo CD läuft in `aks-cars` und hält alle achtzehn Anwendungen synchron:
cert-manager, platform, die drei Stufen und die zwölf Apps. Alle zwölf
URLs antworten über HTTPS mit Zertifikaten von Let's Encrypt.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
