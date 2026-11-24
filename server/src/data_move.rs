//! The data move (docs/accounts.md, 「The data move」): what the model needs written once, in one
//! transaction. The caller hands what only the deployment's configuration holds; the rest is read here.

use sea_orm::{ConnectionTrait, TransactionTrait};
use serde::Serialize;
use sumida::api::authz::Authz;
use sumida::api::authz::write::{SubjectKey, TupleWrite};

use crate::users::{ORGANIZATION, ROLE, link};
use crate::{Refusal, all, now_ms, one, run};

/// The settings key the move is marked done under.
pub const MOVED: &str = "users_moved_at";
/// The settings key naming the platform administrator's user, whose accounts carry the platform's own
/// work.
pub const ADMINISTRATOR: &str = "users_administrator";

/// The tables that hold a user's own rows and that the move hands to the user it makes.
pub const USER_KEYED: [&str; 2] = ["web_push_devices", "web_tab_states"];

/// What the move is written as when nobody grants it, in a tuple's `created_by`.
const MOVER: &str = "data-move";

pub use bmo_web_client::MoveAsk;

/// What the move answered: whether it is done, whether this call wrote it, and the administrator's user.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Moved {
  pub done: bool,
  pub written: bool,
  pub administrator: Option<i32>,
}

/// Whether the move is done.
pub async fn moved<C: ConnectionTrait>(db: &C) -> Result<bool, Refusal> {
  Ok(
    one(db, r#"SELECT 1 AS "held" FROM "settings" WHERE "key" = $1"#, vec![MOVED.into()])
      .await?
      .is_some(),
  )
}

async fn write<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  object: &str,
  relation: &str,
  subject: SubjectKey,
) -> Result<(), Refusal> {
  Ok(Authz::write_unchecked(TupleWrite::new(kind, object, relation, subject), MOVER, db).await?)
}

/// The move, written once; a second call answers that it is done and writes nothing.
///
/// The transaction is committed or rolled back before the answer, never left to its drop: a dropped one
/// only queues its rollback on the pooled connection, which holds the move's locks until the pool next runs.
pub async fn run_move<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  ask: MoveAsk,
) -> Result<Moved, Refusal> {
  let txn = db.begin().await?;

  match written(&txn, ask).await {
    Ok(moved) => {
      txn.commit().await?;

      Ok(moved)
    }
    Err(refused) => {
      txn.rollback().await?;

      Err(refused)
    }
  }
}

async fn written<C: ConnectionTrait>(txn: &C, ask: MoveAsk) -> Result<Moved, Refusal> {
  if moved(txn).await? {
    return Ok(Moved {
      done: true,
      written: false,
      administrator: None,
    });
  }

  let accounts =
    all(txn, r#"SELECT "name", "password_hash" FROM "web_users" ORDER BY "name""#, vec![]).await?;

  if accounts.len() != 1 {
    return Err(Refusal::new(
      axum::http::StatusCode::CONFLICT,
      format!("the console holds {} accounts, and the move carries one, the owner's", accounts.len()),
    ));
  }

  let name: String = accounts[0].try_get("", "name")?;
  let hash: String = accounts[0].try_get("", "password_hash")?;
  let organization: i32 = one(
    txn,
    r#"INSERT INTO "organizations" ("name") VALUES ($1) RETURNING "id""#,
    vec![ORGANIZATION.into()],
  )
  .await?
  .ok_or_else(|| Refusal::bad("the organization was not made"))?
  .try_get("", "id")?;
  let role: i32 = one(
    txn,
    r#"INSERT INTO "roles" ("name", "description") VALUES ($1, $2) RETURNING "id""#,
    vec![ROLE.into(), "everyone the deployment's users are".into()],
  )
  .await?
  .ok_or_else(|| Refusal::bad("the role was not made"))?
  .try_get("", "id")?;
  // The console's account carried as it stands: its argon2id hash is a PHC string sumida verifies as it
  // is, so the same password signs in.
  let administrator: i32 = one(
    txn,
    r#"INSERT INTO "users" ("username", "password", "role_id", "organization_id", "is_admin", "is_enabled")
       VALUES ($1, $2, $3, $4, false, true) RETURNING "id""#,
    vec![name.into(), hash.into(), role.into(), organization.into()],
  )
  .await?
  .ok_or_else(|| Refusal::bad("the administrator's user was not made"))?
  .try_get("", "id")?;

  write(txn, "platform", "root", "admin", SubjectKey::user(administrator)).await?;

  for sender in &ask.owner_senders {
    link(txn, *sender, administrator).await?;
  }

  for table in USER_KEYED {
    run(
      txn,
      &format!(r#"UPDATE "{table}" SET "user_id" = $1 WHERE "user_id" IS NULL"#),
      vec![i64::from(administrator).into()],
    )
    .await?;
  }

  run(
    txn,
    r#"INSERT INTO "settings" ("key", "value") VALUES ($1, $2), ($3, $4)"#,
    vec![
      ADMINISTRATOR.into(),
      administrator.to_string().into(),
      MOVED.into(),
      now_ms().to_string().into(),
    ],
  )
  .await?;

  Ok(Moved {
    done: true,
    written: true,
    administrator: Some(administrator),
  })
}
