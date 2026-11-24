//! What the service asks of the agency (docs/boundary.md, 「Calls the server makes」): the registration of
//! the supply hook as the server starts, and the administrator's read of whose personal supply serves which
//! roads, and the label an agent is shown by, which a fixed line names it with. The agency holds the credentials
//! themselves, on the person's node and in the secret store; nothing read here is ever a key or a secret's value.

use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::json;

use crate::Refusal;

/// The agency, as the service asks it.
#[async_trait::async_trait]
pub trait Agency: Send + Sync {
  /// The supply hook registered at the agency: this service's own address plus `/supply/hook`, answered under
  /// the server's own bearer token. A registration that does not land is the caller's to say and let go.
  async fn register_supply(&self, url: &str, token: &str) -> Result<(), Refusal>;

  /// The roads one person's personal supply serves, as the agency's administrator read answers them.
  async fn supply_roads(&self, user: &str) -> Result<Vec<String>, Refusal>;

  /// The label a supervisor is shown by, as its row at the agency carries it: none where it carries none, no
  /// supervisor has the name, or the agency does not answer, so the caller names the agent by its key.
  async fn label(&self, _agent: &str) -> Option<String> {
    None
  }
}

/// The agency over HTTP, at its base address with its token.
pub struct AgencyClient {
  base: String,
  token: String,
  http: reqwest::Client,
}

impl AgencyClient {
  /// A client of the agency at a plain `http:` base address; any other address is refused.
  pub fn new(base: &str, token: &str) -> Result<Self, String> {
    if !base.starts_with("http://") {
      return Err(format!("the agency's address {base} is not an http: address"));
    }

    Ok(Self {
      base: base.trim_end_matches('/').to_owned(),
      token: token.to_owned(),
      http: reqwest::Client::new(),
    })
  }
}

#[derive(Deserialize)]
struct People {
  #[serde(default)]
  people: Vec<Person>,
}

#[derive(Deserialize)]
struct Person {
  user: serde_json::Value,
  #[serde(default)]
  roads: Vec<String>,
}

#[derive(Deserialize)]
struct Supervisor {
  #[serde(default)]
  label: Option<String>,
}

fn unreached(call: &str, why: impl std::fmt::Display) -> Refusal {
  Refusal::new(StatusCode::BAD_GATEWAY, format!("the agency did not answer {call}: {why}"))
}

#[async_trait::async_trait]
impl Agency for AgencyClient {
  async fn register_supply(&self, url: &str, token: &str) -> Result<(), Refusal> {
    let call = "the registration of the supply hook";
    let answer = self
      .http
      .put(format!("{}/hooks/supply", self.base))
      .bearer_auth(&self.token)
      .json(&json!({ "url": url, "token": token }))
      .send()
      .await
      .map_err(|why| unreached(call, why))?;

    if answer.status().is_success() {
      Ok(())
    } else {
      Err(unreached(call, format!("it answered {}", answer.status())))
    }
  }

  async fn supply_roads(&self, user: &str) -> Result<Vec<String>, Refusal> {
    let call = "a person's personal supply roads";
    let answer = self
      .http
      .get(format!("{}/personal-supply", self.base))
      .bearer_auth(&self.token)
      .header("owner-key", user)
      .header("owner-role", "administrator")
      .send()
      .await
      .map_err(|why| unreached(call, why))?;

    if !answer.status().is_success() {
      return Err(unreached(call, format!("it answered {}", answer.status())));
    }

    let people = answer.json::<People>().await.map_err(|why| unreached(call, why))?.people;

    // The agency answers each person by their account; the roads of the asked one alone are read, and the
    // account may stand as a number or as its decimal text.
    Ok(
      people
        .into_iter()
        .find(|person| {
          person.user.as_str() == Some(user)
            || person.user.as_i64().map(|whole| whole.to_string()).as_deref() == Some(user)
        })
        .map(|person| person.roads)
        .unwrap_or_default(),
    )
  }

  async fn label(&self, agent: &str) -> Option<String> {
    let mut address = reqwest::Url::parse(&format!("{}/supervisors", self.base)).ok()?;

    address.path_segments_mut().ok()?.push(agent);

    // A line is never held up by the agency: one that does not answer in time names the agent by its key.
    let answer = self
      .http
      .get(address)
      .bearer_auth(&self.token)
      .timeout(std::time::Duration::from_secs(3))
      .send()
      .await
      .ok()?;

    if !answer.status().is_success() {
      return None;
    }

    let label = answer.json::<Supervisor>().await.ok()?.label?;
    let label = label.trim();

    (!label.is_empty()).then(|| label.to_owned())
  }
}

/// The agency where the settings name none: nothing to register, and no person's roads to read.
pub struct NoAgency;

#[async_trait::async_trait]
impl Agency for NoAgency {
  async fn register_supply(&self, _url: &str, _token: &str) -> Result<(), Refusal> {
    Ok(())
  }

  async fn supply_roads(&self, _user: &str) -> Result<Vec<String>, Refusal> {
    Err(
      Refusal::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "no agency is named in the settings, so no personal supply can be read",
      )
      .coded("no-agency"),
    )
  }
}
