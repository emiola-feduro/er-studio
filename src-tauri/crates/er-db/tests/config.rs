//! The JSON the interface sends (camelCase, tagged hops) reads into the Rust settings.

use er_db::{ConnectionConfig, Hop, SshAuth, TlsMode};

#[test]
fn reads_the_interface_json() {
    let json = r#"{
        "engine": "postgres", "host": "db.internal", "port": 5432, "database": "tienda", "user": "app",
        "tls": { "mode": "verifyFull", "serverName": "db.example.com" },
        "hops": [
            { "kind": "httpConnect", "host": "proxy", "port": 3128, "username": "me" },
            { "kind": "ssh", "host": "bastion", "port": 22, "user": "ops", "hostKey": "SHA256:abc",
              "auth": { "method": "key", "privateKeyPath": "~/.ssh/id_ed25519" } },
            { "kind": "socks4", "host": "s4", "port": 1080, "userId": "x" }
        ]
    }"#;
    let config: ConnectionConfig = serde_json::from_str(json).unwrap();
    assert_eq!(config.tls.mode, TlsMode::VerifyFull);
    assert_eq!(config.tls.server_name.as_deref(), Some("db.example.com"));
    assert_eq!(config.timeout_secs, 15);
    assert!(config.password.is_none());
    match &config.hops[1] {
        Hop::Ssh {
            host_key,
            auth: SshAuth::Key {
                private_key_path,
                private_key,
                passphrase,
            },
            ..
        } => {
            assert_eq!(host_key.as_deref(), Some("SHA256:abc"));
            assert_eq!(private_key_path.as_deref(), Some("~/.ssh/id_ed25519"));
            assert!(private_key.is_none() && passphrase.is_none());
        }
        other => panic!("{other:?}"),
    }
    assert!(matches!(&config.hops[2], Hop::Socks4 { user_id: Some(id), .. } if id == "x"));
}

#[test]
fn errors_serialize_with_a_code() {
    let error = er_db::Error::UnknownHostKey {
        host: "bastion".into(),
        fingerprint: "SHA256:x".into(),
    };
    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["code"], "unknownHostKey");
    assert_eq!(json["fingerprint"], "SHA256:x");
}
