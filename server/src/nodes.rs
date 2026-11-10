//! The machines invited accounts run on (docs/accounts.md, 「Invitations and a person's machine」): the jake hub
//! asked which agents are attached, and a machine's credential made for its name alone.

use std::sync::Arc;

use hmac::{Hmac, Mac};

use crate::Refusal;
use crate::settings::Jake;

/// The hub as the service asks it.
#[async_trait::async_trait]
pub trait NodeHub: Send + Sync {
  /// The names of the agents attached now.
  async fn attached(&self) -> Result<Vec<String>, Refusal>;
}

/// The hub's loopback control API.
pub struct HubClient {
  http: reqwest::Client,
  control: String,
  token: String,
}

#[async_trait::async_trait]
impl NodeHub for HubClient {
  async fn attached(&self) -> Result<Vec<String>, Refusal> {
    let answer: serde_json::Value = self
      .http
      .get(format!("{}/status", self.control.trim_end_matches('/')))
      .bearer_auth(&self.token)
      .send()
      .await
      .and_then(reqwest::Response::error_for_status)
      .map_err(|why| {
        Refusal::new(axum::http::StatusCode::BAD_GATEWAY, format!("the jake hub: {why}"))
          .coded("upstream-failed")
      })?
      .json()
      .await
      .map_err(|why| {
        Refusal::new(axum::http::StatusCode::BAD_GATEWAY, format!("the jake hub's status: {why}"))
          .coded("upstream-failed")
      })?;

    Ok(
      answer["agents"]
        .as_array()
        .map(|agents| agents.iter().filter_map(|agent| agent["name"].as_str().map(str::to_owned)).collect())
        .unwrap_or_default(),
    )
  }
}

/// What the service holds of the hub: how to ask it, and what an invited machine is told.
pub struct Nodes {
  pub hub: Arc<dyn NodeHub>,
  pub hub_url: String,
  pub install_base: String,
  pub agent_key: String,
}

impl Nodes {
  /// The hub the settings name, where they name all of it.
  pub fn from_settings(jake: &Jake) -> Option<Self> {
    let filled = |value: &Option<String>| {
      value.as_deref().map(str::trim).filter(|value| !value.is_empty()).map(str::to_owned)
    };

    Some(Self {
      hub: Arc::new(HubClient {
        http: reqwest::Client::builder().no_proxy().build().ok()?,
        control: filled(&jake.control)?,
        token: filled(&jake.control_token)?,
      }),
      hub_url: filled(&jake.hub_url)?,
      install_base: filled(&jake.install_base)?.trim_end_matches('/').to_owned(),
      agent_key: filled(&jake.agent_key)?,
    })
  }

  /// A machine's credential: its name, a dot, and the lowercase hex of HMAC-SHA256 over the name keyed by the
  /// hub's agent key, as jake's hub verifies it.
  pub fn credential(&self, agent: &str) -> String {
    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(self.agent_key.as_bytes())
      .expect("HMAC takes a key of any length");

    mac.update(agent.as_bytes());

    let hex: String = mac.finalize().into_bytes().iter().map(|byte| format!("{byte:02x}")).collect();

    format!("{agent}.{hex}")
  }
}

/// The machine name an account is bound to.
pub fn agent_of(user: i32) -> String {
  format!("u{user}")
}

impl Nodes {
  /// The one-line installs of a machine, Linux or WSL and Windows, each naming the hub, the credential and the name.
  pub fn installs(&self, agent: &str) -> (String, String) {
    let credential = self.credential(agent);
    let base = &self.install_base;
    let hub = &self.hub_url;

    (
      format!(
        "curl -fsSL {base}/install.sh | bash -s -- --hub-url '{hub}' --secret '{credential}' --agent-name '{agent}'"
      ),
      format!(
        "powershell -c \"& ([scriptblock]::Create((irm {base}/install.ps1))) -HubUrl '{hub}' -Secret '{credential}' -AgentName '{agent}'\""
      ),
    )
  }
}
