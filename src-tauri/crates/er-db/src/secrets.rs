//! Passwords, passphrases and proxy passwords live in the system keychain (Windows Credential Manager,
//! macOS Keychain, Secret Service on Linux), one entry per connection and slot: "db" for the database
//! password, "wallet" for an Oracle wallet password and "hop0", "hop1"... for each hop. A saved VM has
//! one entry of its own (its id, slot "ssh"), used by every connection and terminal that reaches it. The saved connection never holds them.

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
    set(connection_id, "wallet", None)?;
    set(connection_id, "ssh", None)?;
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
    if config.wallet.as_deref().is_some_and(|w| !w.trim().is_empty()) && missing(&config.wallet_password) {
        config.wallet_password = get(connection_id, "wallet")?;
    }
    fill_hops(&mut config.hops, connection_id)
}

/// Fills the empty secrets of a route: a saved VM's from its own entry, any other hop's from `connection_id`.
pub fn fill_hops(hops: &mut [Hop], connection_id: &str) -> Result<(), String> {
    // Saved VMs do not take a slot of the connection, so the others are numbered without them.
    let mut index = 0;
    for hop in hops.iter_mut() {
        let slot = format!("hop{index}");
        if !matches!(hop, Hop::Ssh { secret_id: Some(_), .. }) {
            index += 1;
        }
        // A saved VM keeps its own secret, shared by every connection that goes through it.
        let (owner, slot) = match hop {
            Hop::Ssh { secret_id: Some(id), .. } => (id.clone(), "ssh".to_string()),
            _ => (connection_id.to_string(), slot),
        };
        let (connection_id, slot) = (owner.as_str(), slot);
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
