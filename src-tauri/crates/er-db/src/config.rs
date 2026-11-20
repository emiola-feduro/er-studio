//! Connection settings as the interface sends them. Secrets travel inline: the app fills them from the
//! system keychain right before connecting and never stores them here.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Engine {
    #[default]
    Postgres,
    /// MySQL and MariaDB (same protocol).
    Mysql,
    SqlServer,
    /// A SQLite file on this computer.
    Sqlite,
    /// Oracle Database and Autonomous Database.
    Oracle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TlsMode {
    /// No TLS at all.
    Disable,
    /// TLS when the server offers it, without checking the certificate.
    #[default]
    Prefer,
    /// TLS required, without checking the certificate.
    Require,
    /// TLS required, certificate signed by a trusted CA; the host name is not checked.
    VerifyCa,
    /// TLS required, trusted certificate issued for the host name.
    VerifyFull,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TlsConfig {
    pub mode: TlsMode,
    /// Extra CA certificates (PEM), trusted along with the system ones.
    pub ca_pem: Option<String>,
    /// Client certificate and key (PEM) for servers that ask for one.
    pub client_cert_pem: Option<String>,
    pub client_key_pem: Option<String>,
    /// Name to check the certificate against when it differs from the host (an IP behind a tunnel, for example).
    pub server_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "method")]
pub enum SshAuth {
    Password {
        password: String,
    },
    /// Private key in OpenSSH or PEM format, as text or as the path of the key file.
    Key {
        #[serde(default)]
        private_key: Option<String>,
        #[serde(default)]
        private_key_path: Option<String>,
        #[serde(default)]
        passphrase: Option<String>,
    },
    /// Keys held by the running SSH agent (ssh-agent, Pageant or the Windows OpenSSH agent).
    Agent,
}

/// One step between this computer and the database server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind")]
pub enum Hop {
    Ssh {
        host: String,
        port: u16,
        user: String,
        auth: SshAuth,
        /// SHA256 fingerprint the person accepted ("SHA256:..."). Without it, ~/.ssh/known_hosts decides.
        host_key: Option<String>,
    },
    Socks5 {
        host: String,
        port: u16,
        username: Option<String>,
        password: Option<String>,
    },
    Socks4 {
        host: String,
        port: u16,
        user_id: Option<String>,
    },
    HttpConnect {
        host: String,
        port: u16,
        username: Option<String>,
        password: Option<String>,
    },
}

impl Hop {
    pub fn address(&self) -> (String, u16) {
        match self {
            Hop::Ssh { host, port, .. } | Hop::Socks5 { host, port, .. } | Hop::Socks4 { host, port, .. } | Hop::HttpConnect { host, port, .. } => {
                (host.clone(), *port)
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub engine: Engine,
    /// Server name or address. A path starting with "/" is a Unix socket directory (PostgreSQL) or file (MySQL).
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub database: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub tls: TlsConfig,
    /// From this computer outward: the first hop is reached directly, each next one through the previous.
    #[serde(default)]
    pub hops: Vec<Hop>,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Without it every query runs in a transaction that is rolled back, so nothing can change.
    #[serde(default)]
    pub allow_writes: bool,
    /// SQL Server named instance (SERVER\\INSTANCE); its port comes from SQL Browser when none is given.
    #[serde(default)]
    pub instance: Option<String>,
    /// SQL Server with the Windows account of this computer instead of a SQL login (Windows only).
    #[serde(default)]
    pub integrated_auth: bool,
    /// SQLite: the database file, and whether to open it read-only.
    #[serde(default)]
    pub file: Option<String>,
    #[serde(default)]
    pub read_only_file: bool,
    /// Oracle: a connect descriptor, Easy Connect string or tnsnames.ora alias, in place of host, port and service.
    #[serde(default)]
    pub connect_string: Option<String>,
    /// Oracle: `database` is a SID instead of a service name.
    #[serde(default)]
    pub sid: bool,
    /// Oracle: the wallet (the zip of an Autonomous Database, or its folder) and its password.
    #[serde(default)]
    pub wallet: Option<String>,
    #[serde(default)]
    pub wallet_password: Option<String>,
    /// Oracle: "sysdba" or "sysoper" to connect with that privilege.
    #[serde(default)]
    pub role: Option<String>,
}

fn default_timeout() -> u64 {
    15
}
