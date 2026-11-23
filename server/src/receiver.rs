//! What the service asks of the receiver (docs/boundary.md, 「Calls the server makes」): the sender of a
//! message standing in a room, which a message check and a grant are made on, and the declaration of what
//! the service holds for a room, which the receiver asks before it removes one. The receiver keeps the rooms
//! and their messages; the service reads none of them itself.

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};

use crate::Refusal;

/// One thing the service holds for a room, as the receiver's declaration of a holder names it: `kept` where
/// the rows stay and keep the room's chat after it is removed, `warns` where the receiver shows what the
/// service answers before it removes the room.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Holding {
  pub name: &'static str,
  pub effect: &'static str,
}

/// The receiver, as the service asks it.
#[async_trait::async_trait]
pub trait Receiver: Send + Sync {
  /// The sender of a message standing in a room: none where the receiver knows no sender of it, and a
  /// refusal with 404 where no such message stands there.
  async fn sender_of(&self, room: i64, message: i64) -> Result<Option<i64>, Refusal>;

  /// The service declared a holder of the receiver's rooms, under its unit name, at the address the receiver
  /// asks its holdings at.
  async fn declare_holder(&self, unit: &str, address: &str, holdings: &[Holding]) -> Result<(), Refusal>;

  /// The users who lead a room: those who own a supervisor the room names.
  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal>;
}

/// The refusal of a message the receiver does not hold in a room.
pub fn no_such_message(room: i64, message: i64) -> Refusal {
  Refusal::absent(format!("no message {message} stands in room {room}")).coded("no-such-message")
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

// A message as the receiver serves it (bmo-receiver's `docs/api.md`, `Message`): its sender is `senderId`.
#[derive(Deserialize)]
struct Message {
  #[serde(rename = "senderId")]
  sender: Option<i64>,
}

#[derive(Deserialize)]
struct Leaders {
  leaders: Vec<i64>,
}

#[derive(Serialize)]
struct Declaration<'a> {
  address: &'a str,
  holdings: &'a [Holding],
}

fn unreached(call: &str, why: impl std::fmt::Display) -> Refusal {
  Refusal::new(StatusCode::BAD_GATEWAY, format!("the receiver did not answer {call}: {why}"))
}

#[async_trait::async_trait]
impl Receiver for ReceiverClient {
  async fn sender_of(&self, room: i64, message: i64) -> Result<Option<i64>, Refusal> {
    let call = "a message's sender";
    let answer = self
      .http
      .get(format!("{}/rooms/{room}/messages/{message}", self.base))
      .bearer_auth(&self.token)
      .send()
      .await
      .map_err(|why| unreached(call, why))?;

    match answer.status() {
      reqwest::StatusCode::NOT_FOUND => Err(no_such_message(room, message)),
      status if status.is_success() => {
        Ok(answer.json::<Message>().await.map_err(|why| unreached(call, why))?.sender)
      }
      status => Err(unreached(call, format!("it answered {status}"))),
    }
  }

  async fn declare_holder(&self, unit: &str, address: &str, holdings: &[Holding]) -> Result<(), Refusal> {
    let call = "the declaration of a holder";
    let answer = self
      .http
      .put(format!("{}/room-holders/{unit}", self.base))
      .bearer_auth(&self.token)
      .json(&Declaration { address, holdings })
      .send()
      .await
      .map_err(|why| unreached(call, why))?;

    if answer.status().is_success() {
      Ok(())
    } else {
      Err(unreached(call, format!("it answered {}", answer.status())))
    }
  }

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

/// The receiver where the settings name none: a message's sender is refused, saying so, and there is no one
/// to declare a holder to.
pub struct NoReceiver;

#[async_trait::async_trait]
impl Receiver for NoReceiver {
  async fn sender_of(&self, _room: i64, _message: i64) -> Result<Option<i64>, Refusal> {
    Err(
      Refusal::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "no receiver is named in the settings, so no message's sender can be read",
      )
      .coded("no-receiver"),
    )
  }

  async fn declare_holder(
    &self,
    _unit: &str,
    _address: &str,
    _holdings: &[Holding],
  ) -> Result<(), Refusal> {
    Ok(())
  }

  async fn leaders_of(&self, _room: i64) -> Result<Vec<i32>, Refusal> {
    Ok(vec![])
  }
}
