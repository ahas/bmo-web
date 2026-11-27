//! Signing in (docs/accounts.md, 「Signing in」, 「Sessions and devices」): the password, the guard that counts
//! failures by the login and by the address, the second factor's ticket and the browsers remembered for it, the
//! session made as sumida's own sign-in makes it and kept as a device of its account, the record of tries, and the
//! notice of a new browser. sumida's own sign-in is closed, and its session check refuses a device ended.

use std::collections::HashMap;
use std::sync::Mutex;

use axum::Json;
use axum::Router;
use axum::extract::{Request, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use bmo_web_client::{SecondFactorAsk, SignInAsk, SignInOutcome, SignedIn, TryOutcome, WireError};
use sea_orm::ConnectionTrait;
use sumida::infra::session::UserSession;

use super::mail::{MailKind, notify_to};
use super::{hashed, token};
use crate::ids::shown;
use crate::routes::Body;
use crate::{Refusal, Service, now_ms, one, run};

/// The span the guard looks back over, and how long a lock or an address shut out stands.
pub const WINDOW_MS: i64 = 15 * 60_000;
/// The failure in a row from which a login waits, and the longest it waits.
const LOGIN_WAITS_FROM: i64 = 3;
const LOGIN_WAIT_MOST_S: i64 = 60;
/// The failure that locks a login.
pub const LOGIN_LOCKS_AT: i64 = 10;
/// The failure from which an address waits, the longest it waits, and the one that shuts it out.
const ADDRESS_WAITS_FROM: i64 = 10;
const ADDRESS_WAIT_MOST_S: i64 = 300;
const ADDRESS_SHUT_AT: i64 = 50;
/// How long a ticket stands, and the wrong codes it takes.
const TICKET_MS: i64 = 5 * 60_000;
const TICKET_WRONG_MOST: u8 = 5;
/// How long a browser stays remembered for the second factor.
pub const REMEMBERED_MS: i64 = 30 * 24 * 60 * 60_000;
/// How long a try is kept.
const TRIES_KEPT_MS: i64 = 90 * 24 * 60 * 60_000;
/// How often a device's last moment seen is moved at most.
const SEEN_EVERY_MS: i64 = 60_000;

/// The tickets standing, held in memory alone: a ticket's hash to the account it is for.
#[derive(Default)]
pub struct Tickets(Mutex<HashMap<String, Ticket>>);

#[derive(Clone)]
struct Ticket {
  user: i32,
  login: String,
  expires_at: i64,
  wrong: u8,
}

impl Tickets {
  fn make(&self, user: i32, login: &str) -> String {
    let ticket = token();
    let now = now_ms();
    let mut held = self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);

    held.retain(|_, one| one.expires_at > now);
    held.insert(
      hashed(&ticket),
      Ticket {
        user,
        login: login.to_owned(),
        expires_at: now + TICKET_MS,
        wrong: 0,
      },
    );

    ticket
  }

  fn get(&self, ticket: &str) -> Option<Ticket> {
    let held = self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);

    held.get(&hashed(ticket)).filter(|one| one.expires_at > now_ms()).cloned()
  }

  /// A wrong code counted against a ticket, which goes once it took its last.
  fn wrong(&self, ticket: &str) {
    let mut held = self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let key = hashed(ticket);

    if let Some(one) = held.get_mut(&key) {
      one.wrong += 1;

      if one.wrong >= TICKET_WRONG_MOST {
        held.remove(&key);
      }
    }
  }

  fn take(&self, ticket: &str) {
    self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&hashed(ticket));
  }
}

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/sign-ins", post(sign_in_route))
    .route("/sign-ins/second-factor", post(second_factor_route))
}

/// A try waiting, refused with how long it waits.
enum Held {
  Throttled(i64),
  Locked(i64),
}

impl Held {
  fn outcome(&self) -> TryOutcome {
    match self {
      Self::Throttled(_) => TryOutcome::Throttled,
      Self::Locked(_) => TryOutcome::Locked,
    }
  }

  fn answer(&self) -> Response {
    let (status, code, seconds, error) = match *self {
      Self::Throttled(seconds) => (
        StatusCode::TOO_MANY_REQUESTS,
        "throttled",
        seconds,
        format!("too many failed sign-ins: try again in {seconds} seconds"),
      ),
      Self::Locked(seconds) => (
        StatusCode::LOCKED,
        "locked",
        seconds,
        format!("the login is locked after failed sign-ins: try again in {seconds} seconds"),
      ),
    };
    let mut answer = (
      status,
      Json(WireError {
        code: code.to_owned(),
        error,
      }),
    )
      .into_response();

    answer.headers_mut().insert(header::RETRY_AFTER, HeaderValue::from(seconds.max(1)));
    answer
  }
}

/// The seconds a wait of `base` doubled `over` times comes to, at most `most`.
fn doubled(over: i64, most: i64) -> i64 {
  if over >= 12 { most } else { (1i64 << over).min(most) }
}

/// Whether a try by `login` from `address` waits now, and how long.
async fn held<C: ConnectionTrait>(db: &C, login: &str, address: &str) -> Result<Option<Held>, Refusal> {
  let now = now_ms();

  if let Some(row) = one(
    db,
    r#"SELECT "until" FROM "sign_in_locks" WHERE "login" = $1 AND "until" > $2"#,
    vec![login.into(), now.into()],
  )
  .await?
  {
    let until: i64 = row.try_get("", "until")?;

    return Ok(Some(Held::Locked((until - now + 999) / 1000)));
  }

  let (count, last) = login_run(db, login).await?;

  if count >= LOGIN_WAITS_FROM {
    let wait = doubled(count - LOGIN_WAITS_FROM + 1, LOGIN_WAIT_MOST_S) * 1000;

    if now < last + wait {
      return Ok(Some(Held::Throttled((last + wait - now + 999) / 1000)));
    }
  }

  let row = one(
    db,
    r#"SELECT count(*) AS "count", COALESCE(max("at"), 0) AS "last" FROM "sign_in_tries"
       WHERE "address" = $1 AND "failure" AND "at" > $2"#,
    vec![address.into(), (now - WINDOW_MS).into()],
  )
  .await?;
  let (count, last): (i64, i64) = match row {
    Some(row) => (row.try_get("", "count")?, row.try_get("", "last")?),
    None => (0, 0),
  };
  let wait = if count >= ADDRESS_SHUT_AT {
    WINDOW_MS
  } else if count >= ADDRESS_WAITS_FROM {
    doubled(count - ADDRESS_WAITS_FROM + 1, ADDRESS_WAIT_MOST_S) * 1000
  } else {
    0
  };

  if wait > 0 && now < last + wait {
    return Ok(Some(Held::Throttled((last + wait - now + 999) / 1000)));
  }

  Ok(None)
}

/// The failures of a login in a row within the window, since its last sign-in that went through, and the moment of
/// the last of them.
async fn login_run<C: ConnectionTrait>(db: &C, login: &str) -> Result<(i64, i64), Refusal> {
  let row = one(
    db,
    r#"SELECT count(*) AS "count", COALESCE(max("at"), 0) AS "last" FROM "sign_in_tries"
       WHERE "login" = $1 AND "failure" AND "at" > $2
         AND "at" > COALESCE((SELECT max("at") FROM "sign_in_tries"
                              WHERE "login" = $1 AND "outcome" = 'signed-in'), 0)"#,
    vec![login.into(), (now_ms() - WINDOW_MS).into()],
  )
  .await?;

  match row {
    Some(row) => Ok((row.try_get("", "count")?, row.try_get("", "last")?)),
    None => Ok((0, 0)),
  }
}

/// What a try was made with: the login as typed in lower case, the browser's address and its user agent.
pub struct Trier {
  pub login: String,
  pub address: String,
  pub agent: String,
}

/// A try kept, and the tries past their time let go.
async fn keep<C: ConnectionTrait>(
  db: &C,
  trier: &Trier,
  user: Option<i32>,
  outcome: TryOutcome,
) -> Result<(), Refusal> {
  let failure = matches!(outcome, TryOutcome::WrongPassword | TryOutcome::WrongCode);
  let word = match serde_json::to_value(outcome).map_err(|why| Refusal::bad(why.to_string()))? {
    serde_json::Value::String(word) => word,
    _ => String::new(),
  };
  let now = now_ms();

  run(
    db,
    r#"INSERT INTO "sign_in_tries" ("login", "user_id", "address", "user_agent", "outcome", "failure", "at")
       VALUES ($1, $2::bigint, $3, $4, $5, $6, $7)"#,
    vec![
      trier.login.clone().into(),
      user.into(),
      trier.address.clone().into(),
      trier.agent.clone().into(),
      word.into(),
      failure.into(),
      now.into(),
    ],
  )
  .await?;
  run(db, r#"DELETE FROM "sign_in_tries" WHERE "at" < $1"#, vec![(now - TRIES_KEPT_MS).into()]).await?;

  Ok(())
}

/// A failure kept, and the login locked where it was its tenth in a row, its person mailed once.
async fn failed(
  service: &Service,
  trier: &Trier,
  user: Option<i32>,
  outcome: TryOutcome,
) -> Result<(), Refusal> {
  keep(&service.db, trier, user, outcome).await?;

  let (count, _) = login_run(&service.db, &trier.login).await?;

  if count < LOGIN_LOCKS_AT {
    return Ok(());
  }

  let now = now_ms();

  run(
    &service.db,
    r#"INSERT INTO "sign_in_locks" ("login", "until", "mailed") VALUES ($1, $2, false)
       ON CONFLICT ("login") DO UPDATE SET "until" = EXCLUDED."until", "mailed" = false"#,
    vec![trier.login.clone().into(), (now + WINDOW_MS).into()],
  )
  .await?;
  // The run that locked it is over: a try after the lock starts a run of its own.
  run(
    &service.db,
    r#"UPDATE "sign_in_tries" SET "failure" = false WHERE "login" = $1 AND "failure""#,
    vec![trier.login.clone().into()],
  )
  .await?;

  if let Some(user) = user
    && let Some(email) = super::verified_email(&service.db, user).await?
  {
    let language = super::language_of(&service.db, user).await?;
    let login = super::login_of(&service.db, user).await?.map(|(login, _)| login).unwrap_or_default();
    let span = super::mail::span_words(language, WINDOW_MS / 60_000);
    let time = super::mail::moment(service, now);

    notify_to(
      service,
      MailKind::AccountLocked,
      user,
      &email,
      language,
      &[("login", &login), ("span", &span), ("time", &time), ("address", &trier.address)],
    )
    .await;
    run(
      &service.db,
      r#"UPDATE "sign_in_locks" SET "mailed" = true WHERE "login" = $1"#,
      vec![trier.login.clone().into()],
    )
    .await?;
  }

  Ok(())
}

/// The refusal of a wrong login or password, the same for both.
fn wrong_credentials() -> Refusal {
  Refusal::new(StatusCode::UNAUTHORIZED, "the login or the password does not match")
    .coded("wrong-credentials")
}

/// The account a login names: its user, its password's hash and whether it is enabled.
async fn account<C: ConnectionTrait>(db: &C, login: &str) -> Result<Option<(i32, String, bool)>, Refusal> {
  match one(
    db,
    r#"SELECT "id", "password", "is_enabled" FROM "users" WHERE "username" = $1"#,
    vec![login.into()],
  )
  .await?
  {
    Some(row) => Ok(Some((
      row.try_get("", "id")?,
      row.try_get("", "password")?,
      row.try_get("", "is_enabled")?,
    ))),
    None => Ok(None),
  }
}

/// Whether an account holds a confirmed second factor.
pub async fn holds_factor<C: ConnectionTrait>(db: &C, user: i32) -> Result<bool, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT 1 AS "one" FROM "second_factors" WHERE "user_id" = $1 AND "confirmed_at" IS NOT NULL"#,
      vec![user.into()],
    )
    .await?
    .is_some(),
  )
}

/// Whether a remembered browser's token stands for the account.
async fn remembered<C: ConnectionTrait>(db: &C, user: i32, device: Option<&str>) -> Result<bool, Refusal> {
  let Some(device) = device.filter(|device| !device.is_empty()) else {
    return Ok(false);
  };

  Ok(
    one(
      db,
      r#"SELECT 1 AS "one" FROM "remembered_devices" WHERE "token_hash" = $1 AND "user_id" = $2 AND "expires_at" > $3"#,
      vec![hashed(device).into(), user.into(), now_ms().into()],
    )
    .await?
    .is_some(),
  )
}

fn trier_of(session: &UserSession, login: &str) -> Trier {
  Trier {
    login: login.trim().to_lowercase(),
    address: session.env.ip_address.clone(),
    agent: session.env.user_agent.clone(),
  }
}

async fn sign_in_route(
  State(service): State<Service>,
  mut session: UserSession,
  Body(ask): Body<SignInAsk>,
) -> Result<Response, Refusal> {
  let login = ask.login.trim().to_owned();
  let trier = trier_of(&session, &login);

  if let Some(held) = held(&service.db, &trier.login, &trier.address).await? {
    keep(&service.db, &trier, None, held.outcome()).await?;

    return Ok(held.answer());
  }

  let Some((user, hash, enabled)) = account(&service.db, &login).await? else {
    sumida::api::service::auth::helper::dummy_verify_password(&ask.password);
    failed(&service, &trier, None, TryOutcome::WrongPassword).await?;

    return Err(wrong_credentials());
  };

  if !sumida::api::service::auth::helper::verify_password(&ask.password, &hash) {
    failed(&service, &trier, Some(user), TryOutcome::WrongPassword).await?;

    return Err(wrong_credentials());
  }

  if !enabled {
    keep(&service.db, &trier, Some(user), TryOutcome::Disabled).await?;

    return Err(Refusal::new(StatusCode::FORBIDDEN, "the account is disabled").coded("account-disabled"));
  }

  if holds_factor(&service.db, user).await?
    && !remembered(&service.db, user, ask.device_token.as_deref()).await?
  {
    keep(&service.db, &trier, Some(user), TryOutcome::SecondFactor).await?;

    let ticket = service.tickets.make(user, &login);

    return Ok(
      Json(SignedIn {
        outcome: SignInOutcome::SecondFactor,
        user: None,
        enrol: false,
        ticket: Some(ticket),
        device_token: None,
      })
      .into_response(),
    );
  }

  signed_in(&service, &mut session, &trier, user, &login, None).await
}

async fn second_factor_route(
  State(service): State<Service>,
  mut session: UserSession,
  Body(ask): Body<SecondFactorAsk>,
) -> Result<Response, Refusal> {
  let Some(ticket) = service.tickets.get(&ask.ticket) else {
    return Err(
      Refusal::new(StatusCode::GONE, "the ticket is used up or past its time").coded("ticket-gone"),
    );
  };
  let trier = trier_of(&session, &ticket.login);

  if let Some(held) = held(&service.db, &trier.login, &trier.address).await? {
    keep(&service.db, &trier, Some(ticket.user), held.outcome()).await?;

    return Ok(held.answer());
  }

  if !super::factor::takes(&service.db, ticket.user, &ticket.login, &ask.code).await? {
    service.tickets.wrong(&ask.ticket);
    failed(&service, &trier, Some(ticket.user), TryOutcome::WrongCode).await?;

    return Err(Refusal::new(StatusCode::UNAUTHORIZED, "the code does not match").coded("wrong-code"));
  }

  service.tickets.take(&ask.ticket);

  let device = if ask.remember {
    let device = token();

    run(
      &service.db,
      r#"INSERT INTO "remembered_devices" ("token_hash", "user_id", "expires_at") VALUES ($1, $2::bigint, $3)"#,
      vec![hashed(&device).into(), ticket.user.into(), (now_ms() + REMEMBERED_MS).into()],
    )
    .await?;

    Some(device)
  } else {
    None
  };

  signed_in(&service, &mut session, &trier, ticket.user, &ticket.login, device).await
}

/// A session made for the account, the try kept, the moment of the sign-in kept, and a new browser told.
async fn signed_in(
  service: &Service,
  session: &mut UserSession,
  trier: &Trier,
  user: i32,
  login: &str,
  device_token: Option<String>,
) -> Result<Response, Refusal> {
  let new_browser = new_browser(&service.db, user, &trier.agent).await?;

  mint(service, session, user, login).await?;
  keep(&service.db, trier, Some(user), TryOutcome::SignedIn).await?;
  run(
    &service.db,
    r#"INSERT INTO "user_sign_ins" ("user_id", "signed_in_at") VALUES ($1::bigint, $2)
       ON CONFLICT ("user_id") DO UPDATE SET "signed_in_at" = EXCLUDED."signed_in_at""#,
    vec![user.into(), now_ms().into()],
  )
  .await?;
  run(
    &service.db,
    r#"DELETE FROM "sign_in_locks" WHERE "login" = $1"#,
    vec![trier.login.clone().into()],
  )
  .await?;

  if new_browser && let Some(email) = super::verified_email(&service.db, user).await? {
    let language = super::language_of(&service.db, user).await?;
    let time = super::mail::moment(service, now_ms());

    notify_to(
      service,
      MailKind::NewDevice,
      user,
      &email,
      language,
      &[("login", login), ("time", &time), ("address", &trier.address), ("agent", &trier.agent)],
    )
    .await;
  }

  let enrol =
    !holds_factor(&service.db, user).await? && super::second_factor_required(&service.db, user).await?;

  Ok(
    Json(SignedIn {
      outcome: SignInOutcome::SignedIn,
      user: Some(shown(user)),
      enrol,
      ticket: None,
      device_token,
    })
    .into_response(),
  )
}

/// Whether an account that signed in before signs in with a browser it never signed in with: its user agent read
/// with its version numbers set aside.
async fn new_browser<C: ConnectionTrait>(db: &C, user: i32, agent: &str) -> Result<bool, Refusal> {
  let row = one(
    db,
    r#"SELECT count(*) AS "before",
         count(*) FILTER (WHERE regexp_replace("user_agent", '[0-9]+', '', 'g') = regexp_replace($2, '[0-9]+', '', 'g'))
           AS "same"
       FROM "sign_in_tries" WHERE "user_id" = $1 AND "outcome" = 'signed-in'"#,
    vec![user.into(), agent.into()],
  )
  .await?;

  Ok(match row {
    Some(row) => row.try_get::<i64>("", "before")? > 0 && row.try_get::<i64>("", "same")? == 0,
    None => false,
  })
}

/// A fresh sumida session for the account on the request's own session, made as sumida's sign-in makes it, saved so
/// its id is known, and kept as a device of the account. Answers the session's id.
pub async fn mint(
  service: &Service,
  session: &mut UserSession,
  user: i32,
  login: &str,
) -> Result<String, Refusal> {
  let expiry = sumida::infra::settings::get().session.cookie.expiry.default_expiry().map_err(|why| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the session's window: {why}"))
  })?;

  session.authorize(user, login, Some(expiry), &service.db).await?;
  session
    .inner
    .save()
    .await
    .map_err(|why| Refusal::new(StatusCode::SERVICE_UNAVAILABLE, format!("the session store: {why}")))?;

  let id = session
    .inner
    .id()
    .ok_or_else(|| Refusal::new(StatusCode::SERVICE_UNAVAILABLE, "the session store named no session"))?
    .to_string();
  let now = now_ms();

  run(
    &service.db,
    r#"INSERT INTO "account_devices" ("user_id", "session_hash", "address", "user_agent", "made_at", "seen_at")
       VALUES ($1::bigint, $2, $3, $4, $5, $5)"#,
    vec![
      user.into(),
      hashed(&id).into(),
      session.env.ip_address.clone().into(),
      session.env.user_agent.clone().into(),
      now.into(),
    ],
  )
  .await?;

  Ok(id)
}

/// The session cookie's value a request carries, where it carries one.
fn session_cookie(request: &Request) -> Option<String> {
  let name = sumida::infra::settings::get()
    .session
    .cookie
    .name
    .clone()
    .unwrap_or_else(|| sumida::api::layer::session::DEFAULT_COOKIE_NAME.to_owned());

  request
    .headers()
    .get_all(header::COOKIE)
    .iter()
    .filter_map(|value| value.to_str().ok())
    .flat_map(tower_sessions::cookie::Cookie::split_parse)
    .filter_map(Result::ok)
    .find(|cookie| cookie.name() == name)
    .map(|cookie| cookie.value().to_owned())
}

/// The layer over sumida's routes: its own sign-in closed, since a sign-in past the guard and the second factor
/// would be a road around both, and its session check refusing a device its person ended and moving the moment a
/// device was last seen.
pub async fn sumida_guard(State(service): State<Service>, request: Request, next: Next) -> Response {
  let path = request.uri().path().trim_end_matches('/').to_owned();

  if request.method() == Method::POST && path == sumida::api::controller::auth::session::MOUNT {
    return Refusal::absent("the sign-in is the service's own `POST /sign-ins`").into_response();
  }

  if request.method() != Method::GET || path != sumida::api::controller::me::MOUNT {
    return next.run(request).await;
  }

  let Some(id) = session_cookie(&request) else {
    return next.run(request).await;
  };
  let key = hashed(&id);
  let device = match one(
    &service.db,
    r#"SELECT "ended_at", "seen_at" FROM "account_devices" WHERE "session_hash" = $1"#,
    vec![key.clone().into()],
  )
  .await
  {
    Ok(device) => device,
    Err(why) => return why.into_response(),
  };

  if let Some(device) = &device
    && device.try_get::<Option<i64>>("", "ended_at").ok().flatten().is_some()
  {
    return Refusal::new(StatusCode::UNAUTHORIZED, "the session was ended")
      .coded("unauthorized")
      .into_response();
  }

  let answer = next.run(request).await;

  if answer.status().is_success()
    && let Some(device) = device
    && device.try_get::<i64>("", "seen_at").is_ok_and(|seen| seen + SEEN_EVERY_MS < now_ms())
    && let Err(why) = run(
      &service.db,
      r#"UPDATE "account_devices" SET "seen_at" = $2 WHERE "session_hash" = $1"#,
      vec![key.into(), now_ms().into()],
    )
    .await
  {
    eprintln!("bmo-web-server: a device's last moment seen is not kept: {}", why.detail);
  }

  answer
}
