{{/*
Expand the name of the chart.
*/}}
{{- define "clio.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully-qualified app name (used as the prefix for K8s object names).
Kept as the bare release name for backward compatibility with existing installs;
override with fullnameOverride if needed.
*/}}
{{- define "clio.fullname" -}}
{{- .Values.fullnameOverride | default .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Namespace for every object. Defaults to the release namespace (helm -n <ns>);
.Values.namespace remains as an explicit override for existing installs.
*/}}
{{- define "clio.namespace" -}}
{{- .Values.namespace | default .Release.Namespace }}
{{- end }}

{{/*
Common labels applied to every object.
*/}}
{{- define "clio.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "clio.name" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: {{ include "clio.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for a given component.
Usage: {{ include "clio.selectorLabels" (dict "root" . "component" "backend") }}
NOTE: selector labels are immutable on Deployments/StatefulSets — never add
labels here that can change between upgrades.
*/}}
{{- define "clio.selectorLabels" -}}
app.kubernetes.io/name: {{ include "clio.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Image tag for a component: explicit tag wins, else the chart's appVersion.
Usage: {{ include "clio.imageTag" (dict "root" . "image" .Values.backend.image) }}
*/}}
{{- define "clio.imageTag" -}}
{{- .image.tag | default .root.Chart.AppVersion }}
{{- end }}

{{/*
Image pull policy: as configured, but force Always when the effective tag is
"latest" so helm upgrade actually picks up a moved tag.
*/}}
{{- define "clio.imagePullPolicy" -}}
{{- $tag := include "clio.imageTag" . -}}
{{- /* Never always wins — it is the explicit "use the locally-loaded image"
       signal (e.g. local-values.yaml). Otherwise a :latest tag re-pulls every
       start; any other tag falls back to the configured policy. */ -}}
{{- if eq (.image.pullPolicy | toString) "Never" -}}Never{{- else if eq $tag "latest" -}}Always{{- else -}}{{ .image.pullPolicy | default "IfNotPresent" }}{{- end -}}
{{- end }}
