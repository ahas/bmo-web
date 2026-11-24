//! What stands of an account's security and what is done to it (docs/accounts.md, 「Sessions and devices」, 「The
//! administrator's acts on an account」): the account's devices, ended one at a time or all but this one, its record of
//! tries, what stands of it for its holder and its heads, and the administrator's disabling and enabling it.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{delete, get, post, put};
use bmo_web_client::{
  AccountSecurity, Device, Devices, EnabledAsk, HistoryChange, SESSION_ID, SignInTries, SignInTry,
  TryOutcome,
};
use sea_orm::TransactionTrait;
use sumida::infra::session::UserSession;

use super::{
  administers, caller, end_sessions, hashed, heads_person, holder, holder_or_administrator, login_of,
};
use crate::history::{Change, record};
use crate::routes::{Answer, Body, user_in};
use crate::{Refusal, Service, all, now_ms, one, run};

/// How many tries the record answers.
const TRIES_SHOWN: i64 = 50;

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/security", get(security_route))
    .route("/users/{user}/devices", get(devices_route))
    .route("/users/{user}/devices/others", post(others_route))
    .route("/users/{user}/devices/{device}", delete(end_route))
    .route("/users/{user}/sign-ins", get(tries_route))
    .route("/users/{user}/enabled", put(enabled_route))
}

/// The session the call names in `Session-Id`, hashed.
fn session_named(headers: &HeaderMap) -> Option<String> {
  headers
    .get(SESSION_ID)
    .and_then(|value| value.to_str().ok())
    .map(str::trim)
    .filter(|id| !id.is_empty())
    .map(hashed)
}

async fn security_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<AccountSecurity> {
  let user = user_in(&user)?;
  let by = caller(&headers)?;

  if by != user && !heads_person(&service.db, by, user).await? {
    return Err(Refusal::forbidden(
      "an account's security is read by its holder, the administrator and its heads",
    ));
  }

  let (email, email_verified) = super::email_of(&service.db, user).await?;
  let (_, enabled) = login_of(&service.db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let left = one(
    &service.db,
    r#"SELECT 1 AS "one" FROM "user_departures" WHERE "user_id" = $1"#,
    vec![user.into()],
  )
  .await?
  .is_some();
  let last_sign_in = one(
    &service.db,
    r#"SELECT "signed_in_at" FROM "user_sign_ins" WHERE "user_id" = $1"#,
    vec![user.into()],
  )
  .await?
  .map(|row| row.try_get::<i64>("", "signed_in_at"))
  .transpose()?;

  Ok(Json(AccountSecurity {
    email,
    email_verified,
    second_factor: super::sign_in::holds_factor(&service.db, user).await?,
    recovery_codes_left: super::factor::codes_left(&service.db, user).await?,
    second_factor_required: super::second_factor_required(&service.db, user).await?,
    enabled,
    left,
    last_sign_in,
    mail: super::mail::configured(&service).await?.is_some(),
  }))
}

async fn devices_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<Devices> {
  let user = user_in(&user)?;

  holder(&headers, user)?;

  let current = session_named(&headers).unwrap_or_default();
  // A device past the session's idle window is gone with its session, and so is one made before the account's
  // credentials were last reset.
  let rows = all(
    &service.db,
    r#"SELECT d."id", d."address", d."user_agent", d."made_at", d."seen_at", d."session_hash" = $2 AS "current"
       FROM "account_devices" d JOIN "users" u ON u."id" = d."user_id"
       WHERE d."user_id" = $1 AND d."ended_at" IS NULL AND d."seen_at" > $3
         AND (u."credentials_reset_at" IS NULL OR d."made_at" > (extract(epoch FROM u."credentials_reset_at") * 1000)::bigint)
       ORDER BY d."seen_at" DESC"#,
    vec![user.into(), current.into(), (now_ms() - 7 * 24 * 60 * 60_000).into()],
  )
  .await?;
  let devices = rows
    .iter()
    .map(|row| {
      Ok(Device {
        id: row.try_get("", "id")?,
        address: row.try_get("", "address")?,
        user_agent: row.try_get("", "user_agent")?,
        made_at: row.try_get("", "made_at")?,
        seen_at: row.try_get("", "seen_at")?,
        current: row.try_get("", "current")?,
      })
    })
    .collect::<Result<Vec<_>, Refusal>>()?;

  Ok(Json(Devices { devices }))
}

async fn end_route(
  State(service): State<Service>,
  Path((user, device)): Path<(String, String)>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;

  holder(&headers, user)?;

  let device: i64 = device.parse().map_err(|_| Refusal::bad(format!("`{device}` is no device's id")))?;
  let ended = run(
    &service.db,
    r#"UPDATE "account_devices" SET "ended_at" = $3 WHERE "id" = $2 AND "user_id" = $1 AND "ended_at" IS NULL"#,
    vec![user.into(), device.into(), now_ms().into()],
  )
  .await?;

  if ended == 0 {
    return Err(Refusal::absent(format!("the account holds no device {device} standing")));
  }

  Ok(StatusCode::NO_CONTENT)
}

/// Every session of the account but this one ended, and a fresh session answered for this one.
async fn others_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  mut session: UserSession,
) -> Result<Json<serde_json::Value>, Refusal> {
  let user = user_in(&user)?;

  holder(&headers, user)?;
  renew(&service, &headers, &mut session, user).await?;

  Ok(Json(serde_json::json!({})))
}

/// Every session of an account ended, and a fresh one made for the device the call's `Session-Id` names, where it
/// names one of the account's; refused 409 `no-session` where it names none of them.
pub async fn renew(
  service: &Service,
  headers: &HeaderMap,
  session: &mut UserSession,
  user: i32,
) -> Result<(), Refusal> {
  let current = session_named(headers).ok_or_else(no_session)?;
  let device = one(
    &service.db,
    r#"SELECT "id", "address", "user_agent" FROM "account_devices"
       WHERE "user_id" = $1 AND "session_hash" = $2 AND "ended_at" IS NULL"#,
    vec![user.into(), current.into()],
  )
  .await?
  .ok_or_else(no_session)?;
  let (login, _) = login_of(&service.db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  end_sessions(&service.db, user).await?;
  // The fresh session stands where the old one was made, and the device's own row goes with the old session.
  if session.env.ip_address.is_empty() {
    session.env.ip_address = device.try_get("", "address")?;
  }

  if session.env.user_agent.is_empty() {
    session.env.user_agent = device.try_get("", "user_agent")?;
  }

  super::sign_in::mint(service, session, user, &login).await?;

  Ok(())
}

fn no_session() -> Refusal {
  Refusal::new(StatusCode::CONFLICT, "the call names no session of the account's").coded("no-session")
}

async fn tries_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<SignInTries> {
  let user = user_in(&user)?;

  holder_or_administrator(&service.db, &headers, user).await?;

  let rows = all(
    &service.db,
    r#"SELECT "at", "outcome", "address", "user_agent" FROM "sign_in_tries"
       WHERE "user_id" = $1 ORDER BY "at" DESC, "id" DESC LIMIT $2"#,
    vec![user.into(), TRIES_SHOWN.into()],
  )
  .await?;
  let tries = rows
    .iter()
    .filter_map(|row| {
      let outcome: TryOutcome =
        serde_json::from_value(serde_json::Value::String(row.try_get("", "outcome").ok()?)).ok()?;

      Some(SignInTry {
        at: row.try_get("", "at").ok()?,
        outcome,
        address: row.try_get("", "address").ok()?,
        user_agent: row.try_get("", "user_agent").ok()?,
      })
    })
    .collect();

  Ok(Json(SignInTries { tries }))
}

async fn enabled_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<EnabledAsk>,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;
  let by = caller(&headers)?;

  if !administers(&service.db, by).await? {
    return Err(Refusal::forbidden("an account is disabled and enabled by the administrator"));
  }

  if by == user {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the administrator's own account is not disabled here")
        .coded("own-account"),
    );
  }

  login_of(&service.db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  if one(
    &service.db,
    r#"SELECT 1 AS "one" FROM "user_departures" WHERE "user_id" = $1"#,
    vec![user.into()],
  )
  .await?
  .is_some()
  {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the account was marked left, which is for good").coded("left"),
    );
  }

  let txn = service.db.begin().await?;

  run(
    &txn,
    r#"UPDATE "users" SET "is_enabled" = $2, "updated_at" = now() WHERE "id" = $1"#,
    vec![user.into(), ask.enabled.into()],
  )
  .await?;

  if !ask.enabled {
    end_sessions(&txn, user).await?;
  }

  let change = if ask.enabled { HistoryChange::Enabled } else { HistoryChange::Disabled };

  record(&txn, Some(by), Change::new(user, change)).await?;
  txn.commit().await?;

  Ok(StatusCode::NO_CONTENT)
}
