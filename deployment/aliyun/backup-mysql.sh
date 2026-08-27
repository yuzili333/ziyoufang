#!/bin/sh
set -eu

secrets_file=/opt/ziyoufang/secrets/prod.env
backup_dir=/opt/ziyoufang/backups
mkdir -p "$backup_dir"
set -a
. "$secrets_file"
set +a

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/ziyoufang-$timestamp.sql.gz"
MYSQL_PWD="$MYSQL_PASSWORD" mysqldump \
  --host="$MYSQL_ADDRESS" --port="$MYSQL_PORT" --user="$MYSQL_USERNAME" \
  --ssl-mode="$MYSQL_SSL_MODE" --ssl-ca="$MYSQL_SSL_CA_FILE" \
  --single-transaction --set-gtid-purged=OFF --databases "$MYSQL_DATABASE" | gzip -9 > "$backup_file"

ossutil cp "$backup_file" "oss://$OSS_BUCKET/database-backups/daily/$(basename "$backup_file")" \
  --ecs-role-name "$OSS_RAM_ROLE_NAME" --force
find "$backup_dir" -type f -name 'ziyoufang-*.sql.gz' -mtime +7 -delete
