#!/bin/sh
set -eu

mysql_image=mysql:8.4.11-oraclelinux9
secret_dir=/opt/ziyoufang/secrets
ca_key="$secret_dir/mysql-ca-key.pem"
ca_cert="$secret_dir/mysql-ca.pem"
server_key="$secret_dir/mysql-server-key.pem"
server_csr="$secret_dir/mysql-server.csr"
server_cert="$secret_dir/mysql-server-cert.pem"

if [ "$(id -u)" -ne 0 ]; then
  echo 'run this script as root' >&2
  exit 1
fi

install -d -m 0700 "$secret_dir"

existing=0
for file in "$ca_key" "$ca_cert" "$server_key" "$server_cert"; do
  if [ -e "$file" ]; then existing=$((existing + 1)); fi
done

if [ "$existing" -eq 4 ]; then
  openssl verify -CAfile "$ca_cert" "$server_cert" >/dev/null
  openssl x509 -in "$server_cert" -noout -checkhost ziyoufang-mysql >/dev/null
  echo 'existing MySQL TLS identity is valid'
  exit 0
fi

if [ "$existing" -ne 0 ]; then
  echo 'partial MySQL TLS files found; do not overwrite them automatically' >&2
  exit 1
fi

extension_file=$(mktemp)
trap 'rm -f "$extension_file" "$server_csr"' EXIT HUP INT TERM
cat >"$extension_file" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:ziyoufang-mysql
EOF

umask 077
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
  -subj '/CN=ziyoufang MySQL private CA' \
  -keyout "$ca_key" -out "$ca_cert"
openssl req -newkey rsa:3072 -nodes -sha256 \
  -subj '/CN=ziyoufang-mysql' \
  -addext 'subjectAltName=DNS:ziyoufang-mysql' \
  -keyout "$server_key" -out "$server_csr"
openssl x509 -req -sha256 -days 825 \
  -in "$server_csr" -CA "$ca_cert" -CAkey "$ca_key" -CAcreateserial \
  -extfile "$extension_file" -out "$server_cert"

mysql_gid=$(docker run --rm "$mysql_image" id -g mysql)
chown root:root "$ca_key" "$ca_cert" "$server_cert"
chown root:"$mysql_gid" "$server_key"
chmod 0400 "$ca_key"
chmod 0444 "$ca_cert" "$server_cert"
chmod 0440 "$server_key"

openssl verify -CAfile "$ca_cert" "$server_cert"
openssl x509 -in "$server_cert" -noout -checkhost ziyoufang-mysql
echo 'MySQL TLS identity created; keep mysql-ca-key.pem off application containers'
