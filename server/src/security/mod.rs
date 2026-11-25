//! What keeps an account its holder's beyond the password (docs/accounts.md, 「Account security」): the platform's own
//! mail through bmo-mail, the sign-in with its guard and its second factor, a password set again by a link, an
//! email's verification, the sessions a person sees and ends, and the administrator's and a person's heads' acts on
//! an account. Every token, code and session id is kept hashed; nothing here answers a secret's value.

pub mod account;
pub mod factor;
pub mod links;
pub mod mail;
pub mod sign_in;

use axum::Router;
use axum::http::HeaderMap;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bmo_web_client::{ChainKind, ChainLevel, ChainMode, ChainPersonWriter, ChainShape};
use rand::RngCore;
use sea_orm::ConnectionTrait;
use sha2::{Digest, Sha256};
use sumida::api::authz::Authz;

use crate::lang::Language;
use crate::readers::actor;
use crate::users::user_subject;
use crate::{Refusal, Service, one};

/// Every route of the module, mounted with the service's own.
pub fn routes() -> Router<Service> {
  Router::new()
    .merge(mail::routes())
    .merge(sign_in::routes())
    .merge(links::routes())
    .merge(factor::routes())
    .merge(account::routes())
}

/// A fresh token: 32 random bytes, URL-safe base64 with no padding.
pub fn token() -> String {
  let mut bytes = [0u8; 32];

  rand::rng().fill_bytes(&mut bytes);
  URL_SAFE_NO_PAD.encode(bytes)
}

/// What a token, a code or a session id is kept as: its SHA-256, in lower-case hex.
pub fn hashed(value: &str) -> String {
  Sha256::digest(value.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The user a call is made for, refused where it names none.
pub fn caller(headers: &HeaderMap) -> Result<i32, Refusal> {
  actor(headers)
    .ok_or_else(|| Refusal::forbidden("the call is made for a signed-in user, and it names none"))
}

/// Whether sumida holds a user the platform administrator.
pub async fn administers<C: ConnectionTrait>(db: &C, user: i32) -> Result<bool, Refusal> {
  Ok(Authz::is_superuser(&user_subject(db, user).await?, db).await?)
}

/// Whether `actor` heads `person`: the platform administrator, or a head of the unit the person stands in or of a
/// unit above it, as for a departure (docs/accounts.md, 「A person who leaves」).
pub async fn heads_person<C: ConnectionTrait>(db: &C, actor: i32, person: i32) -> Result<bool, Refusal> {
  if administers(db, actor).await? {
    return Ok(true);
  }

  match crate::units::unit_of_user(db, person).await? {
    Some(unit) => crate::units::heads(db, actor, unit).await,
    None => Err(Refusal::absent(format!("no user {person}"))),
  }
}

/// The call is made by the account's holder.
pub fn holder(headers: &HeaderMap, user: i32) -> Result<(), Refusal> {
  if caller(headers)? == user {
    Ok(())
  } else {
    Err(Refusal::forbidden("this is the account's holder's alone"))
  }
}

/// The call is made by the account's holder or the platform administrator.
pub async fn holder_or_administrator<C: ConnectionTrait>(
  db: &C,
  headers: &HeaderMap,
  user: i32,
) -> Result<(), Refusal> {
  let by = caller(headers)?;

  if by == user || administers(db, by).await? {
    Ok(())
  } else {
    Err(Refusal::forbidden("this is the account's holder's or the administrator's"))
  }
}

/// A user's login, and whether the account is enabled; none where no such user stands.
pub async fn login_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Option<(String, bool)>, Refusal> {
  match one(db, r#"SELECT "username", "is_enabled" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
  {
    Some(row) => Ok(Some((row.try_get("", "username")?, row.try_get("", "is_enabled")?))),
    None => Ok(None),
  }
}

/// The language a person reads the console in, Korean where they chose none, which their mail is written in.
pub async fn language_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Language, Refusal> {
  let row = one(
    db,
    r#"SELECT l."language" FROM "web_languages" l JOIN "users" u ON u."id" = $1
       WHERE l."user_id" = u."id" OR l."user_name" = u."username"
       ORDER BY (l."user_id" = u."id") DESC NULLS LAST LIMIT 1"#,
    vec![user.into()],
  )
  .await?;

  Ok(match row {
    Some(row) => Language::coded(&row.try_get::<String>("", "language")?).unwrap_or(Language::SOURCE),
    None => Language::SOURCE,
  })
}

/// A user's email as the profile keeps it, and whether it is verified: a verification made for that very address.
pub async fn email_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<(String, bool), Refusal> {
  let row = one(
    db,
    r#"SELECT COALESCE(p."email", '') AS "email",
         (c."address" IS NOT NULL AND c."address" = p."email" AND p."email" <> '') AS "verified"
       FROM "users" u
       LEFT JOIN "user_profiles" p ON p."user_id" = u."id"
       LEFT JOIN "email_checks" c ON c."user_id" = u."id"
       WHERE u."id" = $1"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok((row.try_get("", "email")?, row.try_get::<Option<bool>>("", "verified")?.unwrap_or(false)))
}

/// The verified email of a user, none where it is not verified.
pub async fn verified_email<C: ConnectionTrait>(db: &C, user: i32) -> Result<Option<String>, Refusal> {
  let (email, verified) = email_of(db, user).await?;

  Ok(verified.then_some(email))
}

/// A mail address partly hidden: its first letter and its domain, `a***@example.com`.
pub fn hidden(address: &str) -> String {
  match address.split_once('@') {
    Some((local, domain)) => {
      let first: String = local.chars().take(1).collect();

      format!("{first}***@{domain}")
    }
    None => "***".to_owned(),
  }
}

/// A link under the console's public address: its path and the token.
pub fn link(base: &str, path: &str, token: &str) -> String {
  format!("{}/{path}?token={token}", base.trim_end_matches('/'))
}

/// The console's public address as a call names it, refused where it is no `http:` or `https:` address.
pub fn link_base(base: &str) -> Result<String, Refusal> {
  let base = base.trim();

  if (base.starts_with("https://") || base.starts_with("http://")) && !base.contains(char::is_whitespace) {
    Ok(base.trim_end_matches('/').to_owned())
  } else {
    Err(Refusal::bad("`linkBase` is no http: or https: address").coded("bad-link-base"))
  }
}

/// The chain's kind an organisation asks a second factor of its people by (docs/accounts.md, 「The second factor」).
pub fn second_factor_kind() -> ChainKind {
  ChainKind {
    key: "account.second-factor-required".to_owned(),
    declared_by: crate::UNIT.to_owned(),
    description: "Whether the people under a link must hold a second factor to sign in.".to_owned(),
    shape: ChainShape::Flag,
    choices: vec![],
    mode: ChainMode::Nearest,
    default: Some(serde_json::Value::Bool(false)),
    rules: false,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit],
    unit_permission: crate::units::HEADS.to_owned(),
    person_writer: ChainPersonWriter::Heads,
    person_raises: false,
  }
}

/// Whether a person's organisation asks a second factor of them.
pub async fn second_factor_required<C: ConnectionTrait>(db: &C, user: i32) -> Result<bool, Refusal> {
  let (_, resolved) =
    crate::chain::resolve(db, &second_factor_kind(), crate::chain::Subject::Person(user)).await?;

  Ok(resolved.value.and_then(|value| value.as_bool()).unwrap_or(false))
}

/// Every session of an account ended: sumida's mark of the credentials' reset, which refuses every session made
/// before it, and every device of it marked ended.
pub async fn end_sessions<C: ConnectionTrait>(db: &C, user: i32) -> Result<(), Refusal> {
  crate::run(
    db,
    r#"UPDATE "users" SET "credentials_reset_at" = now() WHERE "id" = $1"#,
    vec![user.into()],
  )
  .await?;
  crate::run(
    db,
    r#"UPDATE "account_devices" SET "ended_at" = $2 WHERE "user_id" = $1 AND "ended_at" IS NULL"#,
    vec![user.into(), crate::now_ms().into()],
  )
  .await?;

  Ok(())
}
