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
{{- if .Values.data.clientId }}
- name: CARS_SQL_SERVER
  value: sql-cars-{{ .Values.side }}.database.windows.net
- name: CARS_SQL_DATABASE
  value: sqldb-cars-{{ .Values.side }}-{{ .Values.stage }}
- name: CARS_BLOB_URL
  value: https://stcars{{ .Values.side }}.blob.core.windows.net
- name: CARS_BLOB_CONTAINER
  value: {{ .Values.stage }}
{{- end }}
{{- end }}
