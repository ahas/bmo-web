//! A password set again and an email verified, each by a link (docs/accounts.md, 「A password set again」, 「A verified
//! email」): a reset asked from the login screen and answered the same whatever was asked, a reset made by the
//! administrator or the person's heads, mailed or handed, and an email's verification. A link is one use, kept as its
//! token's hash, and stands its own span.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use bmo_web_client::{
  EmailVerified, HistoryChange, LinkAsk, NewPasswordAsk, ResetAsk, ResetLink, ResetMade,
};
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::infra::session::UserEnvironment;

use super::mail::{MailKind, configured, notify, send, span_words};
use super::{
  caller, email_of, end_sessions, hashed, heads_person, holder_or_administrator, language_of, link,
  link_base, login_of, token,
};
use crate::history::{Change, record};
use crate::routes::{Answer, Body, user_in};
use crate::{Refusal, Service, now_ms, one, run};

/// The kinds of link.
const RESET: &str = "reset";
const VERIFY: &str = "verify";
/// How long a reset the person asks stands, one the administrator makes, and a verification.
pub const ASKED_RESET_MINUTES: i64 = 30;
pub const MADE_RESET_MINUTES: i64 = 24 * 60;
pub const VERIFY_MINUTES: i64 = 24 * 60;
/// The most reset links an account is mailed in an hour, and the most asks an address makes in one.
const ACCOUNT_MAILS_AN_HOUR: i64 = 3;
const ADDRESS_ASKS_AN_HOUR: i64 = 10;
const HOUR_MS: i64 = 60 * 60_000;
/// The shortest password taken.
pub const PASSWORD_LEAST: usize = 8;

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/password-resets", post(ask_route))
    .route("/password-resets/{token}", get(read_route).post(set_route))
    .route("/users/{user}/password-reset", post(made_route))
    .route("/users/{user}/email/verification", post(verification_route))
    .route("/email-verifications/{token}", post(verified_route))
}

/// A link of a kind made for a user, standing `minutes`, every other unused link of that kind of theirs let go.
/// Answers its token.
async fn made<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  user: i32,
  address: &str,
  by: Option<i32>,
  minutes: i64,
) -> Result<String, Refusal> {
  let token = token();
  let now = now_ms();

  run(
    db,
    r#"UPDATE "account_links" SET "used_at" = $3 WHERE "user_id" = $1 AND "kind" = $2 AND "used_at" IS NULL"#,
    vec![user.into(), kind.into(), now.into()],
  )
  .await?;
  run(
    db,
    r#"INSERT INTO "account_links" ("kind", "user_id", "token_hash", "address", "made_by", "made_at", "expires_at")
       VALUES ($1, $2::bigint, $3, $4, $5::bigint, $6, $7)"#,
    vec![
      kind.into(),
      user.into(),
      hashed(&token).into(),
      address.into(),
      by.into(),
      now.into(),
      (now + minutes * 60_000).into(),
    ],
  )
  .await?;

  Ok(token)
}

/// The link a token names, where it stands: its id, its user and the address it was made for.
async fn standing<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  token: &str,
) -> Result<(i64, i32, String), Refusal> {
  let row = one(
    db,
    r#"SELECT "id", "user_id"::int AS "user_id", "address" FROM "account_links"
       WHERE "kind" = $1 AND "token_hash" = $2 AND "used_at" IS NULL AND "expires_at" > $3"#,
    vec![kind.into(), hashed(token).into(), now_ms().into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent("the link is used, replaced or past its time").coded("link-gone"))?;

  Ok((row.try_get("", "id")?, row.try_get("", "user_id")?, row.try_get("", "address")?))
}

/// The enabled account a login or a verified email names, with that email.
async fn named_by<C: ConnectionTrait>(db: &C, who: &str) -> Result<Option<(i32, String, String)>, Refusal> {
  let row = one(
    db,
    r#"SELECT u."id", u."username", p."email" FROM "users" u
       JOIN "user_profiles" p ON p."user_id" = u."id"
       JOIN "email_checks" c ON c."user_id" = u."id" AND c."address" = p."email"
       WHERE u."is_enabled" AND p."email" <> ''
         AND (u."username" = $1 OR lower(p."email") = lower($1))
       ORDER BY (u."username" = $1) DESC LIMIT 1"#,
    vec![who.into()],
  )
  .await?;

  match row {
    Some(row) => {
      Ok(Some((row.try_get("", "id")?, row.try_get("", "username")?, row.try_get("", "email")?)))
    }
    None => Ok(None),
  }
}

/// A reset asked from the login screen: answered 202 whatever was asked; a link is mailed only where the words name
/// an enabled account with a verified email, system mail is set up, and neither the account nor the address has
/// asked past its hour's share.
async fn ask_route(
  State(service): State<Service>,
  environment: UserEnvironment,
  Body(ask): Body<ResetAsk>,
) -> Result<StatusCode, Refusal> {
  let base = link_base(&ask.link_base)?;
  let who = ask.who.trim();
  let address = environment.ip_address;
  let now = now_ms();
  let asked: i64 = one(
    &service.db,
    r#"SELECT count(*) AS "asked" FROM "reset_asks" WHERE "address" = $1 AND "at" > $2"#,
    vec![address.clone().into(), (now - HOUR_MS).into()],
  )
  .await?
  .map(|row| row.try_get("", "asked"))
  .transpose()?
  .unwrap_or(0);

  run(
    &service.db,
    r#"INSERT INTO "reset_asks" ("address", "at") VALUES ($1, $2)"#,
    vec![address.into(), now.into()],
  )
  .await?;
  run(&service.db, r#"DELETE FROM "reset_asks" WHERE "at" < $1"#, vec![(now - HOUR_MS).into()]).await?;

  if asked >= ADDRESS_ASKS_AN_HOUR || who.is_empty() || configured(&service).await?.is_none() {
    return Ok(StatusCode::ACCEPTED);
  }

  let Some((user, login, email)) = named_by(&service.db, who).await? else {
    return Ok(StatusCode::ACCEPTED);
  };
  let mailed: i64 = one(
    &service.db,
    r#"SELECT count(*) AS "mailed" FROM "account_links"
       WHERE "user_id" = $1 AND "kind" = 'reset' AND "made_by" IS NULL AND "made_at" > $2"#,
    vec![user.into(), (now - HOUR_MS).into()],
  )
  .await?
  .map(|row| row.try_get("", "mailed"))
  .transpose()?
  .unwrap_or(0);

  if mailed >= ACCOUNT_MAILS_AN_HOUR {
    return Ok(StatusCode::ACCEPTED);
  }

  let token = made(&service.db, RESET, user, &email, None, ASKED_RESET_MINUTES).await?;
  let language = language_of(&service.db, user).await?;
  let span = span_words(language, ASKED_RESET_MINUTES);
  let link = link(&base, "reset-password", &token);

  notify(
    &service,
    MailKind::PasswordReset,
    &email,
    language,
    &[("login", &login), ("link", &link), ("span", &span)],
  )
  .await;

  Ok(StatusCode::ACCEPTED)
}

async fn read_route(State(service): State<Service>, Path(token): Path<String>) -> Answer<ResetLink> {
  let (_, user, _) = standing(&service.db, RESET, &token).await?;
  let (login, _) = login_of(&service.db, user).await?.ok_or_else(|| Refusal::absent("no such account"))?;

  Ok(Json(ResetLink { login }))
}

/// A password that is long enough, refused otherwise.
pub fn strong(password: &str) -> Result<(), Refusal> {
  if password.chars().count() >= PASSWORD_LEAST {
    Ok(())
  } else {
    Err(Refusal::bad(format!("a password is {PASSWORD_LEAST} characters or more")).coded("weak-password"))
  }
}

async fn set_route(
  State(service): State<Service>,
  Path(token): Path<String>,
  Body(ask): Body<NewPasswordAsk>,
) -> Result<StatusCode, Refusal> {
  strong(&ask.password)?;

  let hash = crate::users::hashed(&ask.password)?;
  let txn = service.db.begin().await?;
  let (id, user, _) = standing(&txn, RESET, &token).await?;
  let now = now_ms();

  run(
    &txn,
    r#"UPDATE "account_links" SET "used_at" = $2 WHERE "id" = $1"#,
    vec![id.into(), now.into()],
  )
  .await?;
  // Every other reset link of the account goes, the ones replaced before it among them, so an hour's share of mailed
  // links counts from the password set.
  run(
    &txn,
    r#"DELETE FROM "account_links" WHERE "user_id" = $1 AND "kind" = 'reset' AND "id" <> $2"#,
    vec![user.into(), id.into()],
  )
  .await?;
  run(
    &txn,
    r#"UPDATE "users" SET "password" = $2, "updated_at" = now() WHERE "id" = $1"#,
    vec![user.into(), hash.into()],
  )
  .await?;
  end_sessions(&txn, user).await?;
  txn.commit().await?;
  changed(&service, user).await?;

  Ok(StatusCode::NO_CONTENT)
}

/// The person told their password was changed, where their email is verified.
pub async fn changed(service: &Service, user: i32) -> Result<(), Refusal> {
  if let Some(email) = super::verified_email(&service.db, user).await? {
    let language = language_of(&service.db, user).await?;
    let (login, _) = login_of(&service.db, user).await?.unwrap_or_default();
    let time = super::mail::moment(service, now_ms());

    notify(
      service,
      MailKind::PasswordChanged,
      &email,
      language,
      &[("login", &login), ("time", &time)],
    )
    .await;
  }

  Ok(())
}

async fn made_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<LinkAsk>,
) -> Answer<ResetMade> {
  let user = user_in(&user)?;
  let by = caller(&headers)?;
  let base = link_base(&ask.link_base)?;

  if by == user || !heads_person(&service.db, by, user).await? {
    return Err(Refusal::forbidden(
      "a password is reset by the administrator or by a head of the unit the person stands in, never by the person",
    ));
  }

  let (login, _) = login_of(&service.db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let email = super::verified_email(&service.db, user).await?;
  let mailing = configured(&service).await?.is_some() && email.is_some();
  let txn = service.db.begin().await?;
  let token =
    made(&txn, RESET, user, email.as_deref().unwrap_or_default(), Some(by), MADE_RESET_MINUTES).await?;

  end_sessions(&txn, user).await?;
  record(&txn, Some(by), Change::new(user, HistoryChange::PasswordReset)).await?;
  txn.commit().await?;

  let link = link(&base, "reset-password", &token);

  if mailing && let Some(email) = email {
    let language = language_of(&service.db, user).await?;
    let span = span_words(language, MADE_RESET_MINUTES);

    match send(
      &service,
      MailKind::PasswordReset,
      &email,
      language,
      &[("login", &login), ("link", &link), ("span", &span)],
    )
    .await
    {
      Ok(()) => {
        return Ok(Json(ResetMade {
          mailed: true,
          address: Some(super::hidden(&email)),
          link: None,
        }));
      }
      Err(why) => {
        eprintln!("bmo-web-server: a reset link was not mailed, and is handed instead: {}", why.detail)
      }
    }
  }

  Ok(Json(ResetMade {
    mailed: false,
    address: None,
    link: Some(link),
  }))
}

async fn verification_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<LinkAsk>,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;

  holder_or_administrator(&service.db, &headers, user).await?;

  let base = link_base(&ask.link_base)?;
  let (email, _) = email_of(&service.db, user).await?;

  if email.trim().is_empty() {
    return Err(Refusal::bad("the profile keeps no email").coded("no-email"));
  }

  configured(&service).await?.ok_or_else(super::mail::unset)?;

  let (login, _) = login_of(&service.db, user).await?.unwrap_or_default();
  let token = made(&service.db, VERIFY, user, &email, None, VERIFY_MINUTES).await?;
  let language = language_of(&service.db, user).await?;
  let span = span_words(language, VERIFY_MINUTES);
  let link = link(&base, "verify-email", &token);

  send(
    &service,
    MailKind::EmailVerification,
    &email,
    language,
    &[("login", &login), ("link", &link), ("span", &span)],
  )
  .await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn verified_route(
  State(service): State<Service>,
  Path(token): Path<String>,
) -> Answer<EmailVerified> {
  let txn = service.db.begin().await?;
  let (id, user, address) = standing(&txn, VERIFY, &token).await?;
  let (email, _) = email_of(&txn, user).await?;

  if email != address {
    return Err(Refusal::absent("the profile names another email now").coded("link-gone"));
  }

  let now = now_ms();

  run(
    &txn,
    r#"UPDATE "account_links" SET "used_at" = $2 WHERE "id" = $1"#,
    vec![id.into(), now.into()],
  )
  .await?;
  run(
    &txn,
    r#"INSERT INTO "email_checks" ("user_id", "address", "verified_at") VALUES ($1::bigint, $2, $3)
       ON CONFLICT ("user_id") DO UPDATE SET "address" = EXCLUDED."address", "verified_at" = EXCLUDED."verified_at""#,
    vec![user.into(), address.clone().into(), now.into()],
  )
  .await?;
  txn.commit().await?;

  Ok(Json(EmailVerified { address }))
}
