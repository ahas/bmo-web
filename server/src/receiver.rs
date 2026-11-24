//! What the service asks of the receiver (docs/boundary.md, 「Calls the server makes」): the leaders of a room, which
//! the entry check reads. The receiver keeps the rooms and their members; the service reads none of them itself.

use axum::http::StatusCode;
use serde::Deserialize;

use crate::Refusal;

/// The receiver, as the service asks it.
#[async_trait::async_trait]
pub trait Receiver: Send + Sync {
  /// The users who lead a room: those who own a supervisor the room names.
  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal>;
}

/// The receiver over HTTP, at its base address with its token.
pub struct ReceiverClient {
  base: String,
  token: String,
  http: reqwest::Client,
}

impl ReceiverClient {
  /// A client of the receiver at a plain `http:` base address; any other address is refused.
  pub fn new(base: &str, token: &str) -> Result<Self, String> {
    if !base.starts_with("http://") {
      return Err(format!("the receiver's address {base} is not an http: address"));
    }

    Ok(Self {
      base: base.trim_end_matches('/').to_owned(),
      token: token.to_owned(),
      http: reqwest::Client::new(),
    })
  }
}

#[derive(Deserialize)]
struct Leaders {
  leaders: Vec<i64>,
}

fn unreached(call: &str, why: impl std::fmt::Display) -> Refusal {
  Refusal::new(StatusCode::BAD_GATEWAY, format!("the receiver did not answer {call}: {why}"))
}

#[async_trait::async_trait]
impl Receiver for ReceiverClient {
  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal> {
    let call = "a room's leaders";
    let answer = self
      .http
      .get(format!("{}/rooms/{room}/leaders", self.base))
      .bearer_auth(&self.token)
      .send()
      .await
      .map_err(|why| unreached(call, why))?;

    if !answer.status().is_success() {
      return Err(unreached(call, format!("it answered {}", answer.status())));
    }

    let leaders = answer.json::<Leaders>().await.map_err(|why| unreached(call, why))?.leaders;

    Ok(leaders.into_iter().filter_map(|leader| i32::try_from(leader).ok()).collect())
  }
}

/// The receiver where the settings name none: no room has a leader, so only the administrator lets a person in.
pub struct NoReceiver;

#[async_trait::async_trait]
impl Receiver for NoReceiver {
  async fn leaders_of(&self, _room: i64) -> Result<Vec<i32>, Refusal> {
    Ok(vec![])
  }
}
