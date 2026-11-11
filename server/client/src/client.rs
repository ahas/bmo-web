//! One call for each route of the account service's fixed API (`docs/boundary.md`).

use reqwest::{Client, Method, RequestBuilder, StatusCode, Url};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::types::*;
use crate::wire::{Answer, ClientFailure};

/// The header a call names the role of the login it is made for in, as the console hands it on.
pub const OWNER_ROLE: &str = "owner-role";

/// The header a call names the user of the login it is made for in, as the console hands it on: the id written
/// as a decimal number.
pub const OWNER_KEY: &str = "owner-key";

/// The account service at one base address, called with one bearer token.
#[derive(Debug, Clone)]
pub struct AccountClient {
  http: Client,
  base: Url,
  token: String,
}

impl AccountClient {
  /// The service whose routes stand at `base`, called with `token`; an error where the address does not read.
  pub fn new(base: &str, token: impl Into<String>) -> Result<Self, String> {
    let base = Url::parse(base).map_err(|why| format!("{base} is no address: {why}"))?;
    if base.cannot_be_a_base() {
      return Err(format!("{base} is no base address"));
    }

    Ok(Self {
      http: Client::new(),
      base,
      token: token.into(),
    })
  }

  /// The same service called through another HTTP client, such as one with a timeout of its own.
  pub fn with_http(mut self, http: Client) -> Self {
    self.http = http;
    self
  }

  fn url(&self, segments: &[&str]) -> Url {
    let mut url = self.base.clone();
    {
      let mut path = url.path_segments_mut().expect("the base address takes segments");
      path.pop_if_empty();
      path.extend(segments);
    }
    url
  }

  fn request(&self, method: Method, segments: &[&str]) -> RequestBuilder {
    self.http.request(method, self.url(segments)).bearer_auth(&self.token)
  }

  fn session(&self, method: Method, segments: &[&str], cookie: &str) -> RequestBuilder {
    self.http.request(method, self.url(segments)).header(reqwest::header::COOKIE, cookie)
  }

  async fn answered<T: DeserializeOwned>(request: RequestBuilder) -> Answer<T> {
    let answer = Self::sent(request).await?;
    let bytes = answer.bytes().await.map_err(|why| ClientFailure::Unreadable(why.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|why| ClientFailure::Unreadable(why.to_string()))
  }

  async fn sent(request: RequestBuilder) -> Answer<reqwest::Response> {
    let answer = request.send().await.map_err(|why| ClientFailure::Unreachable(why.to_string()))?;
    let status = answer.status();
    if status.is_success() {
      return Ok(answer);
    }
    let body = answer.bytes().await.unwrap_or_default();

    Err(ClientFailure::Answered {
      status: status.as_u16(),
      answer: serde_json::from_slice(&body).ok(),
    })
  }

  async fn nothing(request: RequestBuilder) -> Answer<()> {
    let answer = Self::sent(request).await?;

    match answer.status() {
      StatusCode::NO_CONTENT => Ok(()),
      status => Err(ClientFailure::Unreadable(format!("{status} where 204 was due"))),
    }
  }

  fn get<Q: Serialize>(&self, segments: &[&str], query: &Q) -> RequestBuilder {
    self.request(Method::GET, segments).query(query)
  }

  fn send<B: Serialize>(&self, method: Method, segments: &[&str], body: &B) -> RequestBuilder {
    self.request(method, segments).json(body)
  }

  /// `GET /health`.
  pub async fn health(&self) -> Answer<Health> {
    Self::answered(self.request(Method::GET, &["health"])).await
  }

  /// `GET /accounts/model`.
  pub async fn model_state(&self) -> Answer<ModelState> {
    Self::answered(self.request(Method::GET, &["accounts", "model"])).await
  }

  /// `POST /accounts/move`.
  pub async fn move_accounts(&self, ask: &MoveAsk) -> Answer<Moved> {
    Self::answered(self.send(Method::POST, &["accounts", "move"], ask)).await
  }

  /// `GET /watching`: the rooms the console has open now.
  pub async fn watching(&self) -> Answer<Watching> {
    Self::answered(self.request(Method::GET, &["watching"])).await
  }

  /// `PUT /watching`: the rooms the console has open now.
  pub async fn put_watching(&self, ask: &WatchingAsk) -> Answer<Watching> {
    Self::answered(self.send(Method::PUT, &["watching"], ask)).await
  }

  /// `GET /senders/{sender}/user`.
  pub async fn sender_user(&self, sender: i64) -> Answer<SenderUser> {
    Self::answered(self.request(Method::GET, &["senders", &sender.to_string(), "user"])).await
  }

  /// `GET /users/{user}`.
  pub async fn user(&self, user: &str) -> Answer<UserView> {
    Self::answered(self.request(Method::GET, &["users", user])).await
  }

  /// `GET /users/{user}/senders`.
  pub async fn user_senders(&self, user: &str) -> Answer<Senders> {
    Self::answered(self.request(Method::GET, &["users", user, "senders"])).await
  }

  /// `GET /users/search`, asked as the login `key` acts for in `role`.
  pub async fn search_people(&self, q: &str, key: &str, role: &str) -> Answer<People> {
    Self::answered(
      self
        .request(Method::GET, &["users", "search"])
        .query(&[("q", q)])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `GET /users/{user}/person`, asked as the login `key` acts for in `role`.
  pub async fn person(&self, user: &str, key: &str, role: &str) -> Answer<Person> {
    Self::answered(
      self
        .request(Method::GET, &["users", user, "person"])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `GET /users`, asked as the login `key` acts for in `role`.
  pub async fn users(&self, key: &str, role: &str) -> Answer<UserList> {
    Self::answered(self.request(Method::GET, &["users"]).header(OWNER_KEY, key).header(OWNER_ROLE, role))
      .await
  }

  /// `GET /users/{user}/sections`, asked as the login `key` acts for in `role`.
  pub async fn user_sections(&self, user: &str, key: &str, role: &str) -> Answer<Sections> {
    Self::answered(
      self
        .request(Method::GET, &["users", user, "sections"])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `PUT /users/{user}/sections`, asked as the login `key` acts for in `role`.
  pub async fn set_user_sections(
    &self,
    user: &str,
    ask: &Sections,
    key: &str,
    role: &str,
  ) -> Answer<Sections> {
    Self::answered(
      self
        .send(Method::PUT, &["users", user, "sections"], ask)
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `POST /users/{user}/password`.
  pub async fn change_password(&self, user: &str, ask: &PasswordAsk) -> Answer<()> {
    Self::nothing(self.send(Method::POST, &["users", user, "password"], ask)).await
  }

  /// `POST /users/{user}/name`.
  pub async fn rename_user(&self, user: &str, ask: &NameAsk) -> Answer<()> {
    Self::nothing(self.send(Method::POST, &["users", user, "name"], ask)).await
  }

  /// `GET /users/{user}/profile`, asked as the login `key` acts for in `role`.
  pub async fn profile(&self, user: &str, key: &str, role: &str) -> Answer<UserProfile> {
    Self::answered(
      self
        .request(Method::GET, &["users", user, "profile"])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `POST /users/{user}/profile`, asked as the login `key` acts for in `role`.
  pub async fn set_profile(
    &self,
    user: &str,
    profile: &UserProfile,
    key: &str,
    role: &str,
  ) -> Answer<UserProfile> {
    Self::answered(
      self
        .send(Method::POST, &["users", user, "profile"], profile)
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `POST /checks/room`.
  pub async fn check_room(&self, ask: &RoomCheckAsk) -> Answer<CheckAnswer> {
    Self::answered(self.send(Method::POST, &["checks", "room"], ask)).await
  }

  /// `POST /checks/message`.
  pub async fn check_message(&self, ask: &MessageCheckAsk) -> Answer<CheckAnswer> {
    Self::answered(self.send(Method::POST, &["checks", "message"], ask)).await
  }

  /// `POST /checks/object`.
  pub async fn check_object(&self, ask: &ObjectCheckAsk) -> Answer<CheckAnswer> {
    Self::answered(self.send(Method::POST, &["checks", "object"], ask)).await
  }

  /// `POST /checks/unit`.
  pub async fn check_unit(&self, ask: &UnitCheckAsk) -> Answer<CheckAnswer> {
    Self::answered(self.send(Method::POST, &["checks", "unit"], ask)).await
  }

  /// `GET /users/{user}/unit`.
  pub async fn user_unit(&self, user: &str) -> Answer<UserUnit> {
    Self::answered(self.request(Method::GET, &["users", user, "unit"])).await
  }

  /// `GET /units/{unit}`.
  pub async fn unit(&self, unit: i64) -> Answer<Unit> {
    Self::answered(self.request(Method::GET, &["units", &unit.to_string()])).await
  }

  /// `GET /units`, asked as the login `key` acts for in `role`.
  pub async fn units(&self, key: &str, role: &str) -> Answer<Units> {
    Self::answered(self.request(Method::GET, &["units"]).header(OWNER_KEY, key).header(OWNER_ROLE, role))
      .await
  }

  /// `POST /units`, asked as the login `key` acts for in `role`.
  pub async fn make_unit(&self, ask: &NewUnit, key: &str, role: &str) -> Answer<Unit> {
    Self::answered(self.send(Method::POST, &["units"], ask).header(OWNER_KEY, key).header(OWNER_ROLE, role))
      .await
  }

  /// `PATCH /units/{unit}`, asked as the login `key` acts for in `role`.
  pub async fn change_unit(&self, unit: i64, ask: &UnitChange, key: &str, role: &str) -> Answer<Unit> {
    Self::answered(
      self
        .send(Method::PATCH, &["units", &unit.to_string()], ask)
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `POST /users/{user}/leave`, asked as the login `key` acts for in `role`.
  pub async fn mark_left(&self, user: &str, key: &str, role: &str) -> Answer<()> {
    Self::nothing(
      self
        .request(Method::POST, &["users", user, "leave"])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `GET /rooms/{chat}/callers`, asked as the login `key` acts for.
  pub async fn room_callers(&self, room: i64, key: &str) -> Answer<RoomCallers> {
    Self::answered(
      self
        .request(Method::GET, &["rooms", &room.to_string(), "callers"])
        .header(OWNER_KEY, key),
    )
    .await
  }

  /// `PUT /rooms/{chat}/callers/{user}` where `caller`, else `DELETE`, asked as the login `key` acts for.
  pub async fn set_room_caller(&self, room: i64, user: &str, caller: bool, key: &str) -> Answer<()> {
    let method = if caller { Method::PUT } else { Method::DELETE };

    Self::nothing(
      self
        .request(method, &["rooms", &room.to_string(), "callers", user])
        .header(OWNER_KEY, key),
    )
    .await
  }

  /// `PUT /units/{unit}/heads/{user}` where `head`, else `DELETE`, asked as the login `key` acts for in `role`.
  pub async fn set_head(&self, unit: i64, user: &str, head: bool, key: &str, role: &str) -> Answer<()> {
    let method = if head { Method::PUT } else { Method::DELETE };

    Self::nothing(
      self
        .request(method, &["units", &unit.to_string(), "heads", user])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `PUT /users/{user}/unit`, asked as the login `key` acts for in `role`.
  pub async fn place_user(
    &self,
    user: &str,
    ask: &UnitPlacement,
    key: &str,
    role: &str,
  ) -> Answer<UserUnit> {
    Self::answered(
      self
        .send(Method::PUT, &["users", user, "unit"], ask)
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `POST /invites`, asked as the login `key` acts for in `role`.
  pub async fn make_invite(&self, ask: &InviteAsk, key: &str, role: &str) -> Answer<Invite> {
    Self::answered(
      self
        .send(Method::POST, &["invites"], ask)
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `GET /invites`, asked as the login `key` acts for in `role`.
  pub async fn invites(&self, key: &str, role: &str) -> Answer<Invites> {
    Self::answered(self.request(Method::GET, &["invites"]).header(OWNER_KEY, key).header(OWNER_ROLE, role))
      .await
  }

  /// `GET /invites/{token}`.
  pub async fn invite(&self, token: &str) -> Answer<InviteView> {
    Self::answered(self.request(Method::GET, &["invites", token])).await
  }

  /// `POST /invites/{token}/accept`.
  pub async fn accept_invite(&self, token: &str, ask: &AcceptAsk) -> Answer<Accepted> {
    Self::answered(self.send(Method::POST, &["invites", token, "accept"], ask)).await
  }

  /// `POST /invites/{token}/proof`.
  pub async fn prove_invite(&self, token: &str) -> Answer<Proof> {
    Self::answered(self.send(Method::POST, &["invites", token, "proof"], &serde_json::json!({}))).await
  }

  /// `GET /users/{user}/node`.
  pub async fn user_node(&self, user: &str) -> Answer<UserNode> {
    Self::answered(self.request(Method::GET, &["users", user, "node"])).await
  }

  /// `PUT /users/{user}/node`, asked as the login `key` acts for in `role`.
  pub async fn rebind_node(&self, user: &str, ask: &NodeBinding, key: &str, role: &str) -> Answer<Rebound> {
    Self::answered(
      self
        .send(Method::PUT, &["users", user, "node"], ask)
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `DELETE /users/{user}/node`, asked as the login `key` acts for in `role`.
  pub async fn unbind_node(&self, user: &str, key: &str, role: &str) -> Answer<()> {
    Self::nothing(
      self
        .request(Method::DELETE, &["users", user, "node"])
        .header(OWNER_KEY, key)
        .header(OWNER_ROLE, role),
    )
    .await
  }

  /// `POST /users/{user}/node/proof`.
  pub async fn prove_node(&self, user: &str) -> Answer<UserNode> {
    Self::answered(self.send(Method::POST, &["users", user, "node", "proof"], &serde_json::json!({}))).await
  }

  /// `GET /grants?room=`.
  pub async fn grants(&self, room: i64) -> Answer<Grants> {
    Self::answered(self.get(&["grants"], &[("room", room.to_string())])).await
  }

  /// `POST /grants`.
  pub async fn grant(&self, ask: &GrantAsk) -> Answer<Granted> {
    Self::answered(self.send(Method::POST, &["grants"], ask)).await
  }

  /// `DELETE /grants`.
  pub async fn revoke(&self, ask: &RevokeAsk) -> Answer<Revoked> {
    Self::answered(self.send(Method::DELETE, &["grants"], ask)).await
  }

  /// `POST /phones`.
  pub async fn make_phone_key(&self, user: &str) -> Answer<PhoneMade> {
    Self::answered(self.send(
      Method::POST,
      &["phones"],
      &PhoneAsk {
        user: user.to_owned(),
      },
    ))
    .await
  }

  /// `POST /phones/adopt`.
  pub async fn adopt_phone(&self, token: &str, user: &str) -> Answer<PhoneAdopted> {
    let ask = PhoneAdoptAsk {
      token: token.to_owned(),
      user: user.to_owned(),
    };

    Self::answered(self.send(Method::POST, &["phones", "adopt"], &ask)).await
  }

  /// `POST /phones/who`.
  pub async fn phone_holder(&self, key: &str) -> Answer<PhoneHolder> {
    let ask = PhoneWhoAsk {
      key: key.to_owned(),
    };

    Self::answered(self.send(Method::POST, &["phones", "who"], &ask)).await
  }

  /// `DELETE /phones/{hash}`.
  pub async fn delete_phone_key(&self, hash: &str) -> Answer<()> {
    Self::nothing(self.request(Method::DELETE, &["phones", hash])).await
  }

  /// `GET /rooms/{chat}/holdings`.
  pub async fn room_holdings(&self, chat: i64) -> Answer<Holdings> {
    Self::answered(self.request(Method::GET, &["rooms", &chat.to_string(), "holdings"])).await
  }

  /// `GET /secrets`, asked in `role`, the role the console's login acts in.
  pub async fn secrets(&self, role: &str) -> Answer<Secrets> {
    Self::answered(self.request(Method::GET, &["secrets"]).header(OWNER_ROLE, role)).await
  }

  /// `PUT /secrets/{name}`, asked in `role`.
  pub async fn put_secret(&self, name: &str, ask: &SecretAsk, role: &str) -> Answer<Secret> {
    Self::answered(self.send(Method::PUT, &["secrets", name], ask).header(OWNER_ROLE, role)).await
  }

  /// `DELETE /secrets/{name}`, asked in `role`.
  pub async fn delete_secret(&self, name: &str, role: &str) -> Answer<()> {
    Self::nothing(self.request(Method::DELETE, &["secrets", name]).header(OWNER_ROLE, role)).await
  }

  /// `POST /words/render`.
  pub async fn render_line(&self, ask: &RenderAsk) -> Answer<Rendered> {
    Self::answered(self.send(Method::POST, &["words", "render"], ask)).await
  }

  /// `POST /sumida/auth/session`: the session's cookie as `name=value`, with the answer it came with.
  pub async fn sign_in(&self, ask: &LoginAsk) -> Answer<String> {
    let answer = Self::sent(self.http.post(self.url(&["sumida", "auth", "session"])).json(ask)).await?;
    let cookie = answer
      .headers()
      .get(reqwest::header::SET_COOKIE)
      .and_then(|value| value.to_str().ok())
      .and_then(|value| value.split(';').next())
      .map(str::trim)
      .filter(|cookie| !cookie.is_empty())
      .map(str::to_owned);

    cookie
      .ok_or_else(|| ClientFailure::Unreadable("the sign-in answered with no session cookie".to_owned()))
  }

  /// `DELETE /sumida/auth/session`.
  pub async fn sign_out(&self, cookie: &str) -> Answer<()> {
    Self::sent(self.session(Method::DELETE, &["sumida", "auth", "session"], cookie))
      .await
      .map(|_| ())
  }

  /// `GET /sumida/me`.
  pub async fn me(&self, cookie: &str) -> Answer<Session> {
    Self::answered(self.session(Method::GET, &["sumida", "me"], cookie)).await
  }
}
