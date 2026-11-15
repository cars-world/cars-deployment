{{/*
@license
Copyright (c) rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
*/}}

{{- define "stage.check" -}}
{{- if not (has .Values.stage (list "dev" "test" "prod")) }}
{{- fail "stage must be dev, test or prod" }}
{{- end }}
{{- end }}

{{- define "stage.host" -}}
cars-{{ .Values.stage }}.{{ .Values.region }}.cloudapp.azure.com
{{- end }}
