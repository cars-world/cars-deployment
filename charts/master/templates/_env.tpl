{{/*
@license
Copyright (c) rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
*/}}

{{/* The environment every master gets */}}
{{- define "app.env" -}}
- name: PORT
  value: {{ .Values.port | quote }}
{{- end }}
