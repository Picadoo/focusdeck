use crate::model::Collections;
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncSettings {
    pub server: String,
    pub username: String,
    pub since: i64,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub token: String,
    pub expires_at: i64,
    pub username: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    server_now: i64,
    changes: Collections,
}
pub struct SyncResult {
    pub session: Session,
    pub data: Collections,
    pub cursor: i64,
    pub clock_offset: i64,
}

pub fn normalize_server(value: &str) -> Result<String> {
    let value = value.trim().trim_end_matches('/');
    if value.is_empty() {
        bail!("Server address is required");
    }
    let url = if value.starts_with("http://") || value.starts_with("https://") {
        value.to_owned()
    } else {
        format!("http://{value}")
    };
    let authority = url.split("://").nth(1).unwrap().split('/').next().unwrap();
    if authority.is_empty() || authority.contains('@') || url.chars().any(char::is_whitespace) {
        bail!("Invalid server address");
    }
    Ok(url)
}

pub fn run(
    settings: SyncSettings,
    session: Option<Session>,
    password: Option<String>,
    mut data: Collections,
) -> Result<SyncResult> {
    let base = normalize_server(&settings.server)?;
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .build()
        .into();
    let session = if let Some(password) = password {
        agent
            .post(&format!("{base}/api/auth/login"))
            .send_json(serde_json::json!({"username":settings.username,"password":password}))?
            .body_mut()
            .read_json::<Session>()
            .context("Invalid FocusDeck login response")?
    } else {
        session.ok_or_else(|| anyhow::anyhow!("Sign in first"))?
    };
    if session.expires_at <= chrono::Local::now().timestamp_millis() {
        bail!("Session expired; sign in again");
    }
    let clock: serde_json::Value = agent
        .get(&format!("{base}/api/time"))
        .call()?
        .body_mut()
        .read_json()?;
    let clock_offset = clock["serverNow"]
        .as_i64()
        .ok_or_else(|| anyhow::anyhow!("Invalid server clock"))?
        - chrono::Local::now().timestamp_millis();
    let auth = format!("Bearer {}", session.token);
    let pulled = agent
        .get(&format!("{base}/api/sync?since={}", settings.since))
        .header("Authorization", &auth)
        .call()?
        .body_mut()
        .read_json::<Response>()?;
    data.merge(&pulled.changes);
    let pushed = agent
        .post(&format!("{base}/api/sync"))
        .header("Authorization", &auth)
        .send_json(serde_json::json!({"since":settings.since,"changes":data}))?
        .body_mut()
        .read_json::<Response>()?;
    data.merge(&pushed.changes);
    data.validate()?;
    Ok(SyncResult {
        session,
        data,
        cursor: pushed.server_now.max(pulled.server_now),
        clock_offset,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_address_matches_existing_native_client() {
        assert_eq!(
            normalize_server(" 127.0.0.1:8787/ ").unwrap(),
            "http://127.0.0.1:8787"
        );
        assert_eq!(
            normalize_server("https://example.com/focus/").unwrap(),
            "https://example.com/focus"
        );
        assert!(normalize_server("").is_err());
        assert!(normalize_server("http://user:secret@example.com").is_err());
    }
    #[test]
    fn native_sync_uses_existing_login_clock_pull_push_protocol() {
        use std::{
            io::{Read, Write},
            net::TcpListener,
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        eprintln!(
            "sync fixture: PID {}, temporary port {}",
            std::process::id(),
            address.port()
        );
        listener.set_nonblocking(true).unwrap();
        let mut incoming = Collections::seed("zh");
        incoming.tasks[0].title = "Remote update".into();
        incoming.tasks[0].meta.touch();
        let incoming_json = serde_json::to_value(&incoming).unwrap();
        let server_now = chrono::Local::now().timestamp_millis();
        let fixture = std::thread::spawn(move || {
            for index in 0..4 {
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
                let (mut socket, _) = loop {
                    match listener.accept() {
                        Ok(socket) => break socket,
                        Err(e)
                            if e.kind() == std::io::ErrorKind::WouldBlock
                                && std::time::Instant::now() < deadline =>
                        {
                            std::thread::sleep(std::time::Duration::from_millis(5))
                        }
                        Err(e) => panic!("fixture accept: {e}"),
                    }
                };
                socket
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                let mut chunk = [0u8; 4096];
                let header_end = loop {
                    let n = socket.read(&mut chunk).unwrap();
                    assert!(n > 0);
                    request.extend_from_slice(&chunk[..n]);
                    if let Some(pos) = request.windows(4).position(|s| s == b"\r\n\r\n") {
                        break pos + 4;
                    }
                };
                let header = String::from_utf8_lossy(&request[..header_end]).to_string();
                let length = header
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|s| s.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                while request.len() < header_end + length {
                    let n = socket.read(&mut chunk).unwrap();
                    assert!(n > 0);
                    request.extend_from_slice(&chunk[..n]);
                }
                let payload = match index {
                    0 => {
                        assert!(header.starts_with("POST /api/auth/login "));
                        let body: serde_json::Value =
                            serde_json::from_slice(&request[header_end..]).unwrap();
                        assert_eq!(body["username"], "focus");
                        serde_json::json!({"token":"fixture-token","expiresAt":server_now+60000,"username":"focus"})
                    }
                    1 => {
                        assert!(header.starts_with("GET /api/time "));
                        serde_json::json!({"serverNow":server_now})
                    }
                    2 => {
                        assert!(header.starts_with("GET /api/sync?since=0 "));
                        assert!(
                            header
                                .to_lowercase()
                                .contains("authorization: bearer fixture-token")
                        );
                        serde_json::json!({"serverNow":server_now,"changes":incoming_json})
                    }
                    _ => {
                        assert!(header.starts_with("POST /api/sync "));
                        let body: serde_json::Value =
                            serde_json::from_slice(&request[header_end..]).unwrap();
                        assert_eq!(body["changes"]["tasks"][0]["title"], "Remote update");
                        serde_json::json!({"serverNow":server_now+1,"changes":{}})
                    }
                };
                let body = serde_json::to_vec(&payload).unwrap();
                write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
                socket.write_all(&body).unwrap();
            }
            // listener and accepted sockets are dropped before the thread returns.
        });
        let result = run(
            SyncSettings {
                server: format!("http://{address}"),
                username: "focus".into(),
                since: 0,
            },
            None,
            Some("fixture-password".into()),
            Collections::seed("zh"),
        );
        fixture.join().unwrap();
        let result = result.unwrap();
        assert_eq!(result.data.tasks[0].title, "Remote update");
        assert_eq!(result.cursor, server_now + 1);
        let released = TcpListener::bind(address).expect("fixture port should be released");
        drop(released);
    }
}
