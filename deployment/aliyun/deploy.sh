#!/bin/sh
set -eu

deployment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$deployment_dir"
secrets_file=/opt/ziyoufang/secrets/prod.env

if [ ! -r "$secrets_file" ]; then
  echo 'production environment file is missing or unreadable' >&2
  exit 1
fi

set -a
. "$secrets_file"
set +a

if [ -z "${MYSQL_ADDRESS:-}" ] || [ -z "${MYSQL_DATABASE:-}" ] \
  || [ -z "${MYSQL_USERNAME:-}" ] || [ -z "${MYSQL_USER:-}" ] \
  || [ -z "${MYSQL_PASSWORD:-}" ] || [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo 'required MySQL production variables are missing' >&2
  exit 1
fi

if [ "$MYSQL_ADDRESS" != 'ziyoufang-mysql' ] || [ "$MYSQL_DATABASE" != 'ziyoufang' ]; then
  echo 'MySQL address or database does not match the production contract' >&2
  exit 1
fi
if [ "$MYSQL_USERNAME" != "$MYSQL_USER" ]; then
  echo 'MYSQL_USERNAME and MYSQL_USER must identify the same application account' >&2
  exit 1
fi
if [ "$MYSQL_PASSWORD" = "$MYSQL_ROOT_PASSWORD" ]; then
  echo 'application and root database passwords must be distinct' >&2
  exit 1
fi
case "$MYSQL_PASSWORD:$MYSQL_ROOT_PASSWORD" in
  *replace-with-*)
    echo 'database password placeholders must be replaced before deployment' >&2
    exit 1
    ;;
esac

for file in mysql-ca.pem mysql-server-cert.pem mysql-server-key.pem; do
  if [ ! -r "/opt/ziyoufang/secrets/$file" ]; then
    echo "$file is missing; run prepare-mysql-tls.sh as root" >&2
    exit 1
  fi
done

openssl verify -CAfile /opt/ziyoufang/secrets/mysql-ca.pem \
  /opt/ziyoufang/secrets/mysql-server-cert.pem >/dev/null
openssl x509 -in /opt/ziyoufang/secrets/mysql-server-cert.pem \
  -noout -checkhost ziyoufang-mysql >/dev/null

compose() {
  docker compose -f compose.yaml -f compose.host-nginx.yaml "$@"
}

compose --profile migration run --rm migrate
compose up -d --build --remove-orphans
compose ps
compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --host=ziyoufang-mysql --user="$MYSQL_USER" --database="$MYSQL_DATABASE" --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/mysql/ziyoufang-ca.pem --batch --skip-column-names --execute="SELECT 1"' >/dev/null
curl --fail --silent http://127.0.0.1:18080/health >/dev/null
