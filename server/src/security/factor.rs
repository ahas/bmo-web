//! The second factor (docs/accounts.md, 「The second factor」): a time-based code from any authenticator (RFC 6238:
//! SHA-1, six digits, 30 seconds, one step either side, each step taken once), enrolled by its holder from a secret
//! drawn as a QR code by the service itself, ten single-use recovery codes beside it, turned off by its holder with
//! their password, and reset by the administrator or the person's heads.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use bmo_web_client::{CodeAsk, Enrolment, HistoryChange, PasswordConfirm, RecoveryCodes};
use qrcode::QrCode;
use qrcode::render::svg;
use rand::Rng;
use sea_orm::{ConnectionTrait, TransactionTrait};
use totp_rs::{Builder, Secret, Totp};

use super::{caller, hashed, heads_person, holder, login_of};
use crate::history::{Change, record};
use crate::routes::{Answer, Body, user_in};
use crate::{Refusal, Service, now_ms, one, run};

/// What an authenticator shows the account under.
const ISSUER: &str = "BMO";
/// How many recovery codes an account is given at once.
pub const RECOVERY_CODES: usize = 10;
/// The letters a recovery code is made of: no 0, 1, I or O, which read as one another.
const CODE_LETTERS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/second-factor", post(enrol_route).delete(reset_route))
    .route("/users/{user}/second-factor/confirm", post(confirm_route))
    .route("/users/{user}/second-factor/off", post(off_route))
    .route("/users/{user}/recovery-codes", post(recovery_route))
}

/// The authenticator a secret and a login make.
fn totp(secret: &str, login: &str) -> Result<Totp, Refusal> {
  let secret = Secret::try_from_base32(secret).map_err(|_| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, "a second factor's secret does not read")
  })?;
  // An account name may hold no colon in an otpauth address.
  let account = login.replace(':', " ");

  Builder::new()
    .with_secret(secret)
    .with_account_name(account.as_str())
    .with_issuer(Some(ISSUER))
    .build()
    .map_err(|why| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the second factor: {why}")))
}

/// A recovery code as it is compared: its letters alone, in upper case.
fn recovery_key(code: &str) -> String {
  code
    .chars()
    .filter(char::is_ascii_alphanumeric)
    .collect::<String>()
    .to_ascii_uppercase()
}

/// Ten fresh recovery codes in place of any the account held, answered as they are shown, `XXXXX-XXXXX`.
async fn fresh_codes<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<String>, Refusal> {
  run(db, r#"DELETE FROM "recovery_codes" WHERE "user_id" = $1"#, vec![user.into()]).await?;

  let mut codes = vec![];

  for _ in 0..RECOVERY_CODES {
    let letters: String = (0..10)
      .map(|_| CODE_LETTERS[rand::rng().random_range(0..CODE_LETTERS.len())] as char)
      .collect();
    let code = format!("{}-{}", &letters[..5], &letters[5..]);

    run(
      db,
      r#"INSERT INTO "recovery_codes" ("user_id", "code_hash") VALUES ($1::bigint, $2)"#,
      vec![user.into(), hashed(&recovery_key(&code)).into()],
    )
    .await?;
    codes.push(code);
  }

  Ok(codes)
}

/// Whether a code signs the account in: a code of its confirmed factor at a step not yet taken, which is then taken,
/// or one of its recovery codes not yet used, which is then used.
pub async fn takes<C: ConnectionTrait>(
  db: &C,
  user: i32,
  login: &str,
  code: &str,
) -> Result<bool, Refusal> {
  let Some(row) = one(
    db,
    r#"SELECT "secret", "last_step" FROM "second_factors" WHERE "user_id" = $1 AND "confirmed_at" IS NOT NULL"#,
    vec![user.into()],
  )
  .await?
  else {
    return Ok(false);
  };
  let secret: String = row.try_get("", "secret")?;
  let last: Option<i64> = row.try_get("", "last_step")?;
  let digits: String = code.chars().filter(|character| !character.is_whitespace()).collect();

  if digits.len() == 6 && digits.chars().all(|character| character.is_ascii_digit()) {
    let now = u64::try_from(now_ms() / 1000).unwrap_or_default();

    return match totp(&secret, login)?.check(&digits, now) {
      Some(step) => {
        let step = i64::try_from(step).unwrap_or(i64::MAX);

        if last.is_some_and(|last| step <= last) {
          return Ok(false);
        }

        run(
          db,
          r#"UPDATE "second_factors" SET "last_step" = $2 WHERE "user_id" = $1"#,
          vec![user.into(), step.into()],
        )
        .await?;

        Ok(true)
      }
      None => Ok(false),
    };
  }

  let used = run(
    db,
    r#"UPDATE "recovery_codes" SET "used_at" = $3
       WHERE "id" = (SELECT "id" FROM "recovery_codes"
                     WHERE "user_id" = $1 AND "code_hash" = $2 AND "used_at" IS NULL LIMIT 1)"#,
    vec![user.into(), hashed(&recovery_key(code)).into(), now_ms().into()],
  )
  .await?;

  Ok(used > 0)
}

/// The recovery codes an account has left.
pub async fn codes_left<C: ConnectionTrait>(db: &C, user: i32) -> Result<i64, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT count(*) AS "left" FROM "recovery_codes" WHERE "user_id" = $1 AND "used_at" IS NULL"#,
      vec![user.into()],
    )
    .await?
    .map(|row| row.try_get::<i64>("", "left"))
    .transpose()?
    .unwrap_or(0),
  )
}

/// The factor, its recovery codes and the browsers remembered for it taken away.
async fn taken<C: ConnectionTrait>(db: &C, user: i32) -> Result<(), Refusal> {
  for table in ["second_factors", "recovery_codes", "remembered_devices"] {
    run(db, &format!(r#"DELETE FROM "{table}" WHERE "user_id" = $1"#), vec![user.into()]).await?;
  }

  Ok(())
}

async fn login(service: &Service, user: i32) -> Result<String, Refusal> {
  Ok(
    login_of(&service.db, user)
      .await?
      .ok_or_else(|| Refusal::absent(format!("no user {user}")))?
      .0,
  )
}

async fn enrol_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<Enrolment> {
  let user = user_in(&user)?;

  holder(&headers, user)?;

  let login = login(&service, user).await?;
  let mut bytes = [0u8; 20];

  rand::rng().fill(&mut bytes);

  let secret = Secret::from(bytes).to_base32();
  let totp = totp(&secret, &login)?;
  let uri = totp.to_url().map_err(|why| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the otpauth address: {why}"))
  })?;
  let qr = QrCode::new(uri.as_bytes())
    .map_err(|why| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the QR code: {why}")))?
    .render::<svg::Color>()
    .min_dimensions(240, 240)
    .quiet_zone(true)
    .build();

  // A factor confirmed stays as it is until the new one is confirmed in its place.
  run(
    &service.db,
    r#"INSERT INTO "second_factors" ("user_id", "waiting") VALUES ($1::bigint, $2)
       ON CONFLICT ("user_id") DO UPDATE SET "waiting" = EXCLUDED."waiting""#,
    vec![user.into(), secret.clone().into()],
  )
  .await?;

  Ok(Json(Enrolment { secret, uri, qr }))
}

async fn confirm_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<CodeAsk>,
) -> Answer<RecoveryCodes> {
  let user = user_in(&user)?;

  holder(&headers, user)?;

  let login = login(&service, user).await?;
  let waiting = one(
    &service.db,
    r#"SELECT "waiting" FROM "second_factors" WHERE "user_id" = $1 AND "waiting" IS NOT NULL"#,
    vec![user.into()],
  )
  .await?
  .map(|row| row.try_get::<String>("", "waiting"))
  .transpose()?
  .ok_or_else(|| {
    Refusal::new(StatusCode::CONFLICT, "no second factor waits to be confirmed").coded("nothing-waiting")
  })?;
  let digits: String = ask.code.chars().filter(|character| !character.is_whitespace()).collect();
  let now = u64::try_from(now_ms() / 1000).unwrap_or_default();
  let step = totp(&waiting, &login)?
    .check(&digits, now)
    .ok_or_else(|| Refusal::new(StatusCode::UNAUTHORIZED, "the code does not match").coded("wrong-code"))?;
  let txn = service.db.begin().await?;

  run(
    &txn,
    r#"UPDATE "second_factors" SET "secret" = "waiting", "waiting" = NULL, "confirmed_at" = $2, "last_step" = $3
       WHERE "user_id" = $1"#,
    vec![user.into(), now_ms().into(), i64::try_from(step).unwrap_or(i64::MAX).into()],
  )
  .await?;
  run(&txn, r#"DELETE FROM "remembered_devices" WHERE "user_id" = $1"#, vec![user.into()]).await?;

  let codes = fresh_codes(&txn, user).await?;

  txn.commit().await?;

  Ok(Json(RecoveryCodes {
    recovery_codes: codes,
  }))
}

async fn recovery_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<RecoveryCodes> {
  let user = user_in(&user)?;

  holder(&headers, user)?;

  if !super::sign_in::holds_factor(&service.db, user).await? {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the account holds no second factor").coded("no-second-factor"),
    );
  }

  Ok(Json(RecoveryCodes {
    recovery_codes: fresh_codes(&service.db, user).await?,
  }))
}

async fn off_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<PasswordConfirm>,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;

  holder(&headers, user)?;

  let hash: String =
    one(&service.db, r#"SELECT "password" FROM "users" WHERE "id" = $1"#, vec![user.into()])
      .await?
      .ok_or_else(|| Refusal::absent(format!("no user {user}")))?
      .try_get("", "password")?;

  if !sumida::api::service::auth::helper::verify_password(&ask.password, &hash) {
    return Err(
      Refusal::new(StatusCode::UNAUTHORIZED, "the password does not match").coded("wrong-password"),
    );
  }

  if super::second_factor_required(&service.db, user).await? {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the person's organisation asks a second factor of them")
        .coded("second-factor-required"),
    );
  }

  taken(&service.db, user).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn reset_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let user = user_in(&user)?;
  let by = caller(&headers)?;

  if !heads_person(&service.db, by, user).await? {
    return Err(Refusal::forbidden(
      "a second factor is reset by the administrator or by a head of the unit the person stands in",
    ));
  }

  let txn = service.db.begin().await?;

  taken(&txn, user).await?;
  record(&txn, Some(by), Change::new(user, HistoryChange::SecondFactorReset)).await?;
  txn.commit().await?;

  Ok(StatusCode::NO_CONTENT)
}
