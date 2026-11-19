//! rustls settings for each TLS mode. The name checked is the real server's, even through a tunnel.

use std::sync::Arc;

use tokio_rustls::rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use tokio_rustls::rustls::client::WebPkiServerVerifier;
use tokio_rustls::rustls::crypto::{ring, verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use tokio_rustls::rustls::pki_types::pem::PemObject;
use tokio_rustls::rustls::pki_types::{CertificateDer, PrivateKeyDer, ServerName, UnixTime};
use tokio_rustls::rustls::{self, ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};

use crate::config::{TlsConfig, TlsMode};
use crate::error::{Error, Result};

fn provider() -> Arc<CryptoProvider> {
    Arc::new(ring::default_provider())
}

fn bad(message: impl std::fmt::Display) -> Error {
    Error::TlsConfig { message: message.to_string() }
}

fn roots(tls: &TlsConfig) -> Result<RootCertStore> {
    let mut store = RootCertStore::empty();
    store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    for cert in rustls_native_certs::load_native_certs().certs {
        let _ = store.add(cert);
    }
    if let Some(pem) = tls.ca_pem.as_deref().filter(|p| !p.trim().is_empty()) {
        let certs: Vec<_> = CertificateDer::pem_slice_iter(pem.as_bytes())
            .collect::<std::result::Result<_, _>>()
            .map_err(bad)?;
        if certs.is_empty() {
            return Err(bad("the CA file has no certificates"));
        }
        for cert in certs {
            store.add(cert).map_err(bad)?;
        }
    }
    Ok(store)
}

/// Accepts any certificate: what "prefer" and "require" mean in libpq.
#[derive(Debug)]
struct AcceptAny(Arc<CryptoProvider>);

impl ServerCertVerifier for AcceptAny {
    fn verify_server_cert(
        &self,
        _: &CertificateDer<'_>,
        _: &[CertificateDer<'_>],
        _: &ServerName<'_>,
        _: &[u8],
        _: UnixTime,
    ) -> std::result::Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

/// Checks the chain against the trusted CAs but not the host name: libpq's "verify-ca".
#[derive(Debug)]
struct ChainOnly(Arc<WebPkiServerVerifier>);

impl ServerCertVerifier for ChainOnly {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp: &[u8],
        now: UnixTime,
    ) -> std::result::Result<ServerCertVerified, rustls::Error> {
        match self.0.verify_server_cert(end_entity, intermediates, server_name, ocsp, now) {
            Err(rustls::Error::InvalidCertificate(rustls::CertificateError::NotValidForName))
            | Err(rustls::Error::InvalidCertificate(rustls::CertificateError::NotValidForNameContext { .. })) => Ok(ServerCertVerified::assertion()),
            other => other,
        }
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        self.0.verify_tls12_signature(message, cert, dss)
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        self.0.verify_tls13_signature(message, cert, dss)
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.supported_verify_schemes()
    }
}

/// The rustls client for the chosen mode, or None when TLS is off.
pub fn client_config(tls: &TlsConfig) -> Result<Option<Arc<ClientConfig>>> {
    let provider = provider();
    let builder = ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(bad)?;
    let builder = match tls.mode {
        TlsMode::Disable => return Ok(None),
        TlsMode::Prefer | TlsMode::Require => builder.dangerous().with_custom_certificate_verifier(Arc::new(AcceptAny(provider.clone()))),
        TlsMode::VerifyCa => {
            let verifier = WebPkiServerVerifier::builder_with_provider(Arc::new(roots(tls)?), provider.clone())
                .build()
                .map_err(bad)?;
            builder.dangerous().with_custom_certificate_verifier(Arc::new(ChainOnly(verifier)))
        }
        TlsMode::VerifyFull => builder.with_root_certificates(roots(tls)?),
    };
    let config = match (tls.client_cert_pem.as_deref(), tls.client_key_pem.as_deref()) {
        (Some(cert), Some(key)) if !cert.trim().is_empty() && !key.trim().is_empty() => {
            let chain: Vec<_> = CertificateDer::pem_slice_iter(cert.as_bytes())
                .collect::<std::result::Result<_, _>>()
                .map_err(bad)?;
            let key = PrivateKeyDer::from_pem_slice(key.as_bytes()).map_err(bad)?;
            builder.with_client_auth_cert(chain, key).map_err(bad)?
        }
        _ => builder.with_no_client_auth(),
    };
    Ok(Some(Arc::new(config)))
}

pub fn server_name(tls: &TlsConfig, host: &str) -> Result<ServerName<'static>> {
    let name = tls.server_name.as_deref().filter(|n| !n.trim().is_empty()).unwrap_or(host);
    ServerName::try_from(name.to_string()).map_err(|_| bad(format!("{name} is not a valid server name")))
}
