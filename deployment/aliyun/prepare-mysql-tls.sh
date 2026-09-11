#!/bin/sh
set -eu

mysql_image=mysql:8.4.11-oraclelinux9
secret_dir=/opt/ziyoufang/secrets
ca_key="$secret_dir/mysql-ca-key.pem"
ca_cert="$secret_dir/mysql-ca.pem"
server_key="$secret_dir/mysql-server-key.pem"
server_csr="$secret_dir/mysql-server.csr"
server_cert="$secret_dir/mysql-server-cert.pem"

validate_identity() {
  openssl x509 -in "$ca_cert" -noout -checkend 2592000 >/dev/null
  openssl x509 -in "$server_cert" -noout -checkend 2592000 >/dev/null
  openssl x509 -in "$ca_cert" -noout -text |
    grep -A1 'Basic Constraints' | grep -q 'CA:TRUE'
  openssl verify -purpose sslserver -verify_hostname ziyoufang-mysql \
    -CAfile "$ca_cert" "$server_cert" >/dev/null

  ca_cert_public_key=$(
    openssl x509 -in "$ca_cert" -pubkey -noout |
      openssl pkey -pubin -outform DER 2>/dev/null |
      openssl sha256
  )
  ca_private_key_public_key=$(
    openssl pkey -in "$ca_key" -pubout -outform DER 2>/dev/null |
      openssl sha256
  )
  server_cert_public_key=$(
    openssl x509 -in "$server_cert" -pubkey -noout |
      openssl pkey -pubin -outform DER 2>/dev/null |
      openssl sha256
  )
  server_private_key_public_key=$(
    openssl pkey -in "$server_key" -pubout -outform DER 2>/dev/null |
      openssl sha256
  )

  [ "$ca_cert_public_key" = "$ca_private_key_public_key" ]
  [ "$server_cert_public_key" = "$server_private_key_public_key" ]
}

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
  validate_identity
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
  -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -addext 'subjectKeyIdentifier=hash' \
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

validate_identity
echo 'MySQL TLS identity created; keep mysql-ca-key.pem off application containers'
