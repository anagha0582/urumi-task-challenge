
{{- define "store.url" -}}
{{ ternary "https" "http" .Values.ingress.tls.enabled }}://{{ .Values.host }}
{{- end }}

{{- define "store.wpEnv" -}}
- name: WORDPRESS_DB_HOST
  value: {{ .Release.Name }}-mariadb:3306
- name: WORDPRESS_DB_NAME
  value: {{ .Values.mariadb.database | quote }}
- name: WORDPRESS_DB_USER
  value: {{ .Values.mariadb.user | quote }}
- name: WORDPRESS_DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.existingSecret }}
      key: mariadb-password
- name: WORDPRESS_CONFIG_EXTRA
  value: |
    if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') { $_SERVER['HTTPS'] = 'on'; }
{{- end }}
