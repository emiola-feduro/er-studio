#!/usr/bin/env bash
# Removes the test containers and their network.
ENGINE=${CONTAINER_ENGINE:-$(command -v podman || command -v docker)}
"$ENGINE" rm -f erdb-db erdb-ssh1 erdb-ssh2 erdb-socks erdb-http erdb-mysql erdb-mariadb erdb-mssql >/dev/null 2>&1
"$ENGINE" network rm erdb-test >/dev/null 2>&1
exit 0
