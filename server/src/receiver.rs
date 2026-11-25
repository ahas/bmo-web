//! What the service asks of the receiver (docs/boundary.md, 「Calls the server makes」): the leaders of a room, its
//! console members, and a member's rights over its people, which the entry check reads. The receiver keeps the rooms
//! and their members; the service reads none of them itself.

use axum::http::StatusCode;
use serde::Deserialize;

use crate::Refusal;

/// The rights a room member holds over its people, beside its membership, as the receiver keeps them.
#[derive(Clone, Copy, Debug, Default)]
pub struct MemberRights {
  pub let_in: bool,
  pub take_out: bool,
}

/// The receiver, as the service asks it.
#[async_trait::async_trait]
pub trait Receiver: Send + Sync {
  /// The users who lead a room: those who own a supervisor the room names.
  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal>;

  /// The users the receiver holds among a room's console members.
  async fn members_of(&self, room: i64) -> Result<Vec<i32>, Refusal>;

  /// The rights `account` holds over the room's people. Silence where the receiver cannot answer them, which is no
  /// route, no row or no reply, and leaves the entry check on its baseline, as the console reads them too
  /// (`docs/boundary.md`, 「Gaps the console meets」).
  async fn member_rights(&self, room: i64, account: i32) -> MemberRights;
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

#[derive(Deserialize)]
struct Accounts {
  accounts: Vec<Account>,
}

#[derive(Deserialize)]
struct Account {
  account: i64,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Rights {
  let_in: bool,
  take_out: bool,
}

fn unreached(call: &str, why: impl std::fmt::Display) -> Refusal {
  Refusal::new(StatusCode::BAD_GATEWAY, format!("the receiver did not answer {call}: {why}"))
}

impl ReceiverClient {
  /// One read of the receiver's, `call` naming it where the receiver does not answer.
  async fn read<T: serde::de::DeserializeOwned>(&self, path: &str, call: &str) -> Result<T, Refusal> {
    let answer = self
      .http
      .get(format!("{}{path}", self.base))
      .bearer_auth(&self.token)
      .send()
      .await
      .map_err(|why| unreached(call, why))?;

    if !answer.status().is_success() {
      return Err(unreached(call, format!("it answered {}", answer.status())));
    }

    answer.json::<T>().await.map_err(|why| unreached(call, why))
  }
}

/// The users among a receiver's account numbers; a number no user can carry is none of them.
fn users(accounts: impl IntoIterator<Item = i64>) -> Vec<i32> {
  accounts.into_iter().filter_map(|account| i32::try_from(account).ok()).collect()
}

#[async_trait::async_trait]
impl Receiver for ReceiverClient {
  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal> {
    let leaders = self.read::<Leaders>(&format!("/rooms/{room}/leaders"), "a room's leaders").await?;

    Ok(users(leaders.leaders))
  }

  async fn members_of(&self, room: i64) -> Result<Vec<i32>, Refusal> {
    let members = self.read::<Accounts>(&format!("/rooms/{room}/accounts"), "a room's members").await?;

    Ok(users(members.accounts.into_iter().map(|member| member.account)))
  }

  async fn member_rights(&self, room: i64, account: i32) -> MemberRights {
    let path = format!("/rooms/{room}/accounts/{account}/grants?by={account}");

    match self.read::<Rights>(&path, "a member's rights").await {
      Ok(rights) => MemberRights {
        let_in: rights.let_in,
        take_out: rights.take_out,
      },
      // No route for rights, no row, or no reply: the member holds nothing, and the baseline stands alone.
      Err(_) => MemberRights::default(),
    }
  }
}

/// The receiver where the settings name none: no room has a leader, a member or a grant, so only the administrator
/// lets a person in.
pub struct NoReceiver;

#[async_trait::async_trait]
impl Receiver for NoReceiver {
  async fn leaders_of(&self, _room: i64) -> Result<Vec<i32>, Refusal> {
    Ok(vec![])
  }

  async fn members_of(&self, _room: i64) -> Result<Vec<i32>, Refusal> {
    Ok(vec![])
  }

  async fn member_rights(&self, _room: i64, _account: i32) -> MemberRights {
    MemberRights::default()
  }
}
