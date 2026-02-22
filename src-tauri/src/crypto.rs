use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce, Key
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use sha2::{Sha256, Digest};
use std::path::Path;
use std::fs;

// Key size for AES-256 is 32 bytes
const KEY_SIZE: usize = 32;

pub fn get_or_create_key<P: AsRef<Path>>(path: P) -> Result<Key<Aes256Gcm>, String> {
    if path.as_ref().exists() {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() != KEY_SIZE {
            return Err("Invalid key size".to_string());
        }
        Ok(*Key::<Aes256Gcm>::from_slice(&bytes))
    } else {
        let key = Aes256Gcm::generate_key(OsRng);
        fs::write(&path, key.as_slice()).map_err(|e| e.to_string())?;
        Ok(key)
    }
}

pub fn encrypt(data: &str, key: &Key<Aes256Gcm>) -> Result<String, String> {
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 96-bits; unique per message
    let ciphertext = cipher.encrypt(&nonce, data.as_bytes())
        .map_err(|e| e.to_string())?;
    
    // Return nonce + ciphertext encoded in base64
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    
    Ok(BASE64.encode(combined))
}

pub fn decrypt(data: &str, key: &Key<Aes256Gcm>) -> Result<String, String> {
    let combined = BASE64.decode(data).map_err(|e| e.to_string())?;
    if combined.len() < 12 {
        return Err("Invalid data length".to_string());
    }
    
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(key);
    
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|e| e.to_string())?;
        
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

pub fn hash_identifier(id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(id.as_bytes());
    format!("{:x}", hasher.finalize())
}
