//! Passwords, passphrases and proxy passwords live in the system keychain (Windows Credential Manager,
//! macOS Keychain, Secret Service on Linux), one entry per connection and slot: "db" for the database
//! password and "hop0", "hop1"... for each hop. The saved connection never holds them.

use crate::config::{ConnectionConfig, Hop, SshAuth};

const SERVICE: &str = "ER Studio";
/// Hops a connection may have; used to clean every slot when it is deleted.
const MAX_HOPS: usize = 8;

fn entry(connection_id: &str, slot: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &format!("{connection_id}/{slot}")).map_err(|e| e.to_string())
}

fn get(connection_id: &str, slot: &str) -> Result<Option<String>, String> {
    match entry(connection_id, slot)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Saves (Some) or removes (None) one secret.
pub fn set(connection_id: &str, slot: &str, value: Option<&str>) -> Result<(), String> {
    let entry = entry(connection_id, slot)?;
    match value {
        Some(value) => entry.set_password(value).map_err(|e| e.to_string()),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}

/// Removes every secret of a deleted connection.
pub fn delete_all(connection_id: &str) -> Result<(), String> {
    set(connection_id, "db", None)?;
    for index in 0..MAX_HOPS {
        set(connection_id, &format!("hop{index}"), None)?;
    }
    Ok(())
}

fn missing(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(str::is_empty)
}

/// Fills each secret the interface left empty with the one saved in the keychain, if any.
pub fn fill(config: &mut ConnectionConfig, connection_id: &str) -> Result<(), String> {
    if missing(&config.password) {
        config.password = get(connection_id, "db")?;
    }
    for (index, hop) in config.hops.iter_mut().enumerate() {
        let slot = format!("hop{index}");
        match hop {
            Hop::Ssh {
                auth: SshAuth::Password { password },
                ..
            } if password.is_empty() => {
                *password = get(connection_id, &slot)?.unwrap_or_default();
            }
            Hop::Ssh {
                auth: SshAuth::Key { passphrase, .. },
                ..
            } if missing(passphrase) => {
                *passphrase = get(connection_id, &slot)?;
            }
            Hop::Socks5 { username, password, .. } | Hop::HttpConnect { username, password, .. } if !missing(username) && missing(password) => {
                *password = get(connection_id, &slot)?;
            }
            _ => {}
        }
    }
    Ok(())
}
