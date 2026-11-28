//! Whether a person's node holds what a chat service reads their account through there (docs/accounts.md, 「A
//! person's messenger accounts」), asked as a run of the node service's on that node: the probe command the chat
//! service declares, exiting 0 where the node holds it. A service that names no node service knows nothing, and
//! refuses nothing for it.

use std::time::Duration;

use bmo_web_client::ChatNodeProbe;
use serde_json::json;

use crate::Refusal;

/// The node service, as the account service asks it for a person's node.
#[async_trait::async_trait]
pub trait NodeProbe: Send + Sync {
  /// Whether `node` holds what `probe` asks of it, for the person `account`: true or false where the probe ran,
  /// none where it could not be asked.
  async fn holds(&self, node: &str, account: i32, probe: &ChatNodeProbe) -> Option<bool>;
}

/// No node service named: nothing is known of any node.
pub struct NoProbe;

#[async_trait::async_trait]
impl NodeProbe for NoProbe {
  async fn holds(&self, _node: &str, _account: i32, _probe: &ChatNodeProbe) -> Option<bool> {
    None
  }
}

/// The node service at `base`, asked as the caller its `token` names (the node service's `docs/api.md`, 「Runs」).
pub struct NodeService {
  base: String,
  token: String,
  http: reqwest::Client,
}

impl NodeService {
  pub fn new(base: &str, token: &str) -> Result<Self, Refusal> {
    Ok(Self {
      base: base.trim_end_matches('/').to_owned(),
      token: token.to_owned(),
      http: reqwest::Client::builder().timeout(Duration::from_secs(60)).build().map_err(|why| {
        Refusal::new(
          axum::http::StatusCode::INTERNAL_SERVER_ERROR,
          format!("the node service's client: {why}"),
        )
      })?,
    })
  }
}

#[async_trait::async_trait]
impl NodeProbe for NodeService {
  async fn holds(&self, node: &str, account: i32, probe: &ChatNodeProbe) -> Option<bool> {
    let (shell, command) = match (&probe.powershell, &probe.linux) {
      (Some(command), _) => ("powershell", command),
      (None, Some(command)) => ("linux", command),
      (None, None) => return None,
    };
    let answer = self
      .http
      .post(format!("{}/nodes/{node}/runs", self.base))
      .bearer_auth(&self.token)
      .json(&json!({ "account": account.to_string(), "command": command, "shell": shell }))
      .send()
      .await
      .ok()?;

    if !answer.status().is_success() {
      return None;
    }

    let ran: serde_json::Value = answer.json().await.ok()?;

    ran["exitCode"].as_i64().map(|code| code == 0)
  }
}
