//! A person's history (docs/accounts.md, 「A person's history」): every change of a person's place kept as it
//! is made — a move, a role, a head grant, an acting appointment, a post, leaving — with who did it and when,
//! never changed or removed, and read back the newest first.

use bmo_web_client::{HistoryChange, HistoryEntry, RoleMark, UnitRef};
use sea_orm::{ConnectionTrait, QueryResult};

use crate::catalogue::Entry;
use crate::ids::shown;
use crate::{Refusal, all, now_ms, run};

/// One change of a person's place, as it is recorded.
pub struct Change {
  user: i32,
  change: HistoryChange,
  unit: Option<i32>,
  from: Option<i32>,
  before: Option<RoleMark>,
  after: Option<RoleMark>,
  until: Option<i64>,
}

impl Change {
  pub fn new(user: i32, change: HistoryChange) -> Self {
    Self {
      user,
      change,
      unit: None,
      from: None,
      before: None,
      after: None,
      until: None,
    }
  }

  /// The unit the change was made in.
  pub fn unit(mut self, unit: i32) -> Self {
    self.unit = Some(unit);
    self
  }

  /// The unit a person moved from.
  pub fn from(mut self, unit: i32) -> Self {
    self.from = Some(unit);
    self
  }

  /// The role carried before, as it was named then.
  pub fn before(mut self, role: Option<&Entry>) -> Self {
    self.before = role.map(mark);
    self
  }

  /// The role carried after, as it is named now.
  pub fn after(mut self, role: Option<&Entry>) -> Self {
    self.after = role.map(mark);
    self
  }

  /// An appointment's end.
  pub fn until(mut self, until: i64) -> Self {
    self.until = Some(until);
    self
  }
}

fn mark(role: &Entry) -> RoleMark {
  RoleMark {
    key: role.key.clone(),
    name: role.name.clone(),
  }
}

/// The word a change is kept by, as the wire names it.
fn word(change: HistoryChange) -> Result<String, Refusal> {
  match serde_json::to_value(change).map_err(|why| Refusal::bad(why.to_string()))? {
    serde_json::Value::String(word) => Ok(word),
    other => Err(Refusal::bad(format!("{other} is no change's word"))),
  }
}

/// A change kept, done by `by`, or by nobody where no person stands behind the call.
pub async fn record<C: ConnectionTrait>(db: &C, by: Option<i32>, change: Change) -> Result<(), Refusal> {
  let (before_key, before_name) = split(change.before);
  let (after_key, after_name) = split(change.after);

  run(
    db,
    r#"INSERT INTO "org_history"
         ("user_id", "at", "by", "change", "unit_id", "from_unit_id",
          "before_key", "before_name", "after_key", "after_name", "until")
       VALUES ($1::bigint, $2, $3::bigint, $4, $5::bigint, $6::bigint, $7, $8, $9, $10, $11)"#,
    vec![
      change.user.into(),
      now_ms().into(),
      by.into(),
      word(change.change)?.into(),
      change.unit.into(),
      change.from.into(),
      before_key.into(),
      before_name.into(),
      after_key.into(),
      after_name.into(),
      change.until.into(),
    ],
  )
  .await?;

  Ok(())
}

fn split(role: Option<RoleMark>) -> (Option<String>, Option<String>) {
  match role {
    Some(role) => (Some(role.key), Some(role.name)),
    None => (None, None),
  }
}

/// Every change of a person's place kept, the newest first, each unit and doer by the name they have now.
pub async fn of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<HistoryEntry>, Refusal> {
  let rows = all(
    db,
    r#"SELECT h."at", h."by", h."change", h."unit_id", h."from_unit_id",
         h."before_key", h."before_name", h."after_key", h."after_name", h."until",
         COALESCE(NULLIF(b."full_name", ''), b."username") AS "by_name",
         uo."name" AS "unit_name", fo."name" AS "from_name"
       FROM "org_history" h
       LEFT JOIN "users" b ON b."id" = h."by"
       LEFT JOIN "organizations" uo ON uo."id" = h."unit_id"
       LEFT JOIN "organizations" fo ON fo."id" = h."from_unit_id"
       WHERE h."user_id" = $1::bigint
       ORDER BY h."id" DESC"#,
    vec![user.into()],
  )
  .await?;

  rows.iter().map(entry_of).collect()
}

fn unit_of(row: &QueryResult, id: &str, name: &str) -> Result<Option<UnitRef>, Refusal> {
  let id: Option<i64> = row.try_get("", id)?;
  let name: Option<String> = row.try_get("", name)?;

  Ok(id.map(|id| UnitRef {
    id,
    name: name.unwrap_or_default(),
  }))
}

fn role_of(row: &QueryResult, key: &str, name: &str) -> Result<Option<RoleMark>, Refusal> {
  let key: Option<String> = row.try_get("", key)?;
  let name: Option<String> = row.try_get("", name)?;

  Ok(key.map(|key| RoleMark {
    key,
    name: name.unwrap_or_default(),
  }))
}

fn entry_of(row: &QueryResult) -> Result<HistoryEntry, Refusal> {
  let word: String = row.try_get("", "change")?;
  let change = serde_json::from_value(serde_json::Value::String(word.clone()))
    .map_err(|_| Refusal::bad(format!("`{word}` is no change of a person's place")))?;
  let by: Option<i64> = row.try_get("", "by")?;

  Ok(HistoryEntry {
    at: row.try_get("", "at")?,
    by: by.map(|by| shown(i32::try_from(by).unwrap_or_default())),
    by_name: row.try_get("", "by_name")?,
    change,
    unit: unit_of(row, "unit_id", "unit_name")?,
    from: unit_of(row, "from_unit_id", "from_name")?,
    before: role_of(row, "before_key", "before_name")?,
    after: role_of(row, "after_key", "after_name")?,
    until: row.try_get("", "until")?,
  })
}
