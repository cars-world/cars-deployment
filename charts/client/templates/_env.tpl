{{/*
@license
Copyright (c) rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
*/}}

{{/*
The environment every client gets. nginx resolves MASTER_URL without the
search domains of the pod, so the name is fully qualified.
*/}}
{{- define "app.env" -}}
- name: MASTER_URL
  value: {{ printf "http://master.cars-%s-%s.svc.cluster.local" .Values.side .Values.stage | quote }}
{{- end }}
