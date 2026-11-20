#!/usr/bin/env bash
# Starts the containers the connection tests run against (Podman or Docker):
#   db       PostgreSQL 17 with TLS (certificate for "db" and "localhost", not for 127.0.0.1), published on 127.0.0.1:55432
#   ssh1     SSH bastion with password and key access, published on 127.0.0.1:52222
#   ssh2     second SSH server, reachable only from ssh1 (to test jumps)
#   socks    SOCKS5 proxy (Dante) with user and password, published on 127.0.0.1:51080
#   http     HTTP CONNECT proxy (tinyproxy) with basic auth, published on 127.0.0.1:58888
#   mysql    MySQL 8.4 (TLS with its own certificate), published on 127.0.0.1:53306
#   mariadb  MariaDB 11, published on 127.0.0.1:53307
#   mssql    SQL Server 2022, published on 127.0.0.1:51433, only with ERDB_MSSQL=1 (the image is over 1.5 GB)
#   oracle   Oracle Database 23ai Free with the user tienda, published on 127.0.0.1:51521, only with ERDB_ORACLE=1
# Only db, ssh1, socks and http are published; db is also reachable by name from inside the network.
# Writes the generated keys and certificates to $ERDB_TEST_DIR (default: tests/env/.generated).
set -euo pipefail

ENGINE=${CONTAINER_ENGINE:-$(command -v podman || command -v docker)}
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${ERDB_TEST_DIR:-$HERE/.generated}
mkdir -p "$DIR"
DIR=$(cd "$DIR" && pwd)
NET=erdb-test

"$HERE/down.sh" >/dev/null 2>&1 || true
rm -rf "${DIR:?}"/*

# Certificates: a test CA and a server certificate for db and localhost.
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=ER Studio test CA" -keyout "$DIR/ca.key" -out "$DIR/ca.pem" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=db" -keyout "$DIR/server.key" -out "$DIR/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:db,DNS:localhost\n' >"$DIR/san.ext"
openssl x509 -req -in "$DIR/server.csr" -CA "$DIR/ca.pem" -CAkey "$DIR/ca.key" -CAcreateserial -days 30 -extfile "$DIR/san.ext" -out "$DIR/server.pem" 2>/dev/null
chmod 644 "$DIR"/*

# SSH key for the "tunnel" user.
ssh-keygen -q -t ed25519 -N '' -C erdb-test -f "$DIR/id_ed25519"
ssh-keygen -q -t ed25519 -N 'frase' -C erdb-test-pass -f "$DIR/id_ed25519_pass"
cat "$DIR/id_ed25519.pub" "$DIR/id_ed25519_pass.pub" >"$DIR/authorized_keys"
chmod 644 "$DIR/authorized_keys"

"$ENGINE" network create "$NET" >/dev/null

"$ENGINE" run -d --name erdb-db --network "$NET" --network-alias db -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD=secreto -e POSTGRES_DB=tienda -v "$DIR:/certs:ro,z" \
  --entrypoint sh docker.io/library/postgres:17-alpine -c '
    cp /certs/server.pem /certs/server.key /tmp/ && chown postgres /tmp/server.* && chmod 600 /tmp/server.key
    exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.pem -c ssl_key_file=/tmp/server.key' >/dev/null

SSHD='apk add --no-cache openssh >/dev/null && ssh-keygen -A >/dev/null
  adduser -D tunnel && echo "tunnel:clave-ssh" | chpasswd
  mkdir -p /home/tunnel/.ssh && cp /keys/authorized_keys /home/tunnel/.ssh/ && chown -R tunnel /home/tunnel/.ssh && chmod 700 /home/tunnel/.ssh
  exec /usr/sbin/sshd -D -e -o PasswordAuthentication=yes -o AllowTcpForwarding=yes -o PermitOpen=any'
"$ENGINE" run -d --name erdb-ssh1 --network "$NET" --network-alias ssh1 -p 127.0.0.1:52222:22 -v "$DIR:/keys:ro,z" docker.io/library/alpine:3.20 sh -c "$SSHD" >/dev/null
"$ENGINE" run -d --name erdb-ssh2 --network "$NET" --network-alias ssh2 -v "$DIR:/keys:ro,z" docker.io/library/alpine:3.20 sh -c "$SSHD" >/dev/null

"$ENGINE" run -d --name erdb-socks --network "$NET" --network-alias socks -p 127.0.0.1:51080:1080 docker.io/library/alpine:3.20 sh -c '
  apk add --no-cache dante-server >/dev/null && adduser -D -H proxy && echo "proxy:clave-proxy" | chpasswd
  printf "logoutput: stderr\ninternal: 0.0.0.0 port = 1080\nexternal: eth0\nsocksmethod: username\nuser.privileged: root\nuser.unprivileged: nobody\nclient pass { from: 0.0.0.0/0 to: 0.0.0.0/0 }\nsocks pass { from: 0.0.0.0/0 to: 0.0.0.0/0 command: connect }\n" >/etc/sockd.conf
  exec sockd -f /etc/sockd.conf' >/dev/null

"$ENGINE" run -d --name erdb-http --network "$NET" --network-alias http -p 127.0.0.1:58888:8888 docker.io/library/alpine:3.20 sh -c '
  apk add --no-cache tinyproxy >/dev/null
  printf "Port 8888\nListen 0.0.0.0\nTimeout 60\nAllow 0.0.0.0/0\nConnectPort 5432\nConnectPort 22\nBasicAuth proxy clave-proxy\n" >/etc/tinyproxy/tinyproxy.conf
  exec tinyproxy -d -c /etc/tinyproxy/tinyproxy.conf' >/dev/null

"$ENGINE" run -d --name erdb-mysql --network "$NET" --network-alias mysql -p 127.0.0.1:53306:3306 \
  -e MYSQL_ROOT_PASSWORD=secreto -e MYSQL_DATABASE=tienda docker.io/library/mysql:8.4 >/dev/null
"$ENGINE" run -d --name erdb-mariadb --network "$NET" --network-alias mariadb -p 127.0.0.1:53307:3306 \
  -e MARIADB_ROOT_PASSWORD=secreto -e MARIADB_DATABASE=tienda docker.io/library/mariadb:11 >/dev/null
if [ -n "${ERDB_MSSQL:-}" ]; then
  "$ENGINE" run -d --name erdb-mssql --network "$NET" --network-alias mssql -p 127.0.0.1:51433:1433 \
    -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=Secreto.2026' mcr.microsoft.com/mssql/server:2022-latest >/dev/null
fi
if [ -n "${ERDB_ORACLE:-}" ]; then
  "$ENGINE" run -d --name erdb-oracle --network "$NET" --network-alias oracle -p 127.0.0.1:51521:1521 \
    -e ORACLE_PASSWORD=Secreto2026 -e APP_USER=tienda -e APP_USER_PASSWORD=secreto docker.io/gvenzl/oracle-free:23-slim-faststart >/dev/null
fi

# Wait until every service answers.
wait_for() {
  for _ in $(seq 1 "${3:-90}"); do
    if eval "$2" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $1" >&2
  "$ENGINE" logs "erdb-$1" 2>&1 | tail -20 >&2
  return 1
}
wait_for db "$ENGINE exec erdb-db pg_isready -U postgres -h 127.0.0.1"
wait_for ssh1 "$ENGINE exec erdb-ssh1 sh -c 'nc -z 127.0.0.1 22'"
wait_for ssh2 "$ENGINE exec erdb-ssh2 sh -c 'nc -z 127.0.0.1 22'"
wait_for socks "$ENGINE exec erdb-socks sh -c 'nc -z 127.0.0.1 1080'"
wait_for http "$ENGINE exec erdb-http sh -c 'nc -z 127.0.0.1 8888'"
wait_for mysql "$ENGINE exec erdb-mysql mysql -uroot -psecreto -e 'SELECT 1'"
wait_for mariadb "$ENGINE exec erdb-mariadb mariadb -uroot -psecreto -e 'SELECT 1'"
if [ -n "${ERDB_MSSQL:-}" ]; then
  wait_for mssql "$ENGINE exec erdb-mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P 'Secreto.2026' -Q 'SELECT 1'"
  # CREATE DATABASE cannot run inside a transaction, and the app runs every script in one.
  "$ENGINE" exec erdb-mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P 'Secreto.2026' -Q "IF DB_ID('tienda') IS NULL CREATE DATABASE tienda" >/dev/null
fi

if [ -n "${ERDB_ORACLE:-}" ]; then
  wait_for oracle "$ENGINE logs erdb-oracle 2>&1 | grep -q 'DATABASE IS READY TO USE'" 300
fi

echo "ready: $DIR"
