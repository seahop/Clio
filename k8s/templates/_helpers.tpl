{{/*
Expand the name of the chart.
*/}}
{{- define "clio.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully-qualified app name (used as the prefix for K8s object names).
*/}}
{{- define "clio.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every object.
*/}}
{{- define "clio.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for a given component.
Usage: {{ include "clio.selectorLabels" (dict "root" . "component" "backend") }}
*/}}
{{- define "clio.selectorLabels" -}}
app.kubernetes.io/name: {{ include "clio.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
