{{/*
@license
Copyright (c) rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
*/}}

{{/* Fails unless side, stage and image.tag are set */}}
{{- define "app.check" -}}
{{- if not (has .Values.side (list "origin" "custom")) }}
{{- fail "side must be origin or custom" }}
{{- end }}
{{- if not (has .Values.stage (list "dev" "test" "prod")) }}
{{- fail "stage must be dev, test or prod" }}
{{- end }}
{{- if not .Values.image.tag }}
{{- fail "image.tag is missing" }}
{{- end }}
{{- end }}

{{/* origin-master, custom-client, … */}}
{{- define "app.name" -}}
{{ .Values.side }}-{{ .Chart.Name }}
{{- end }}

{{/* The gateway of the side and stage, cars-origin-dev, … */}}
{{- define "app.gateway" -}}
cars-{{ .Values.side }}-{{ .Values.stage }}
{{- end }}

{{/* The free Azure name of that gateway */}}
{{- define "app.host" -}}
{{ include "app.gateway" . }}.{{ .Values.region }}.cloudapp.azure.com
{{- end }}

{{- define "app.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/part-of: cars
cars-side: {{ .Values.side }}
cars-stage: {{ .Values.stage }}
{{- end }}
