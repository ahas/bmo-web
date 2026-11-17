//! What a unit carries beside its name and its parent (docs/accounts.md, 「Companies and organisation units」):
//! a kind of its company's list, a short name held once in its company, and the unit of its company its matters
//! go up through where that is not its parent. The kind is read by no permission, check or behaviour; the unit it
//! reports to changes nothing of the tree, only the line a unit's matters go up (「The line of a unit」).

use std::collections::HashSet;

use axum::http::StatusCode;
use bmo_web_client::{KindRef, LineVia, UnitRef};
use sea_orm::ConnectionTrait;

use crate::catalogue::{Kinds, named};
use crate::units::company_of;
use crate::{Refusal, one, run};

/// The most characters a short name has.
const SHORT_NAME: usize = 20;

/// A unit's kind, short name and the unit it reports to, each where set.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Attributes {
  pub kind: Option<KindRef>,
  pub short_name: Option<String>,
  pub reports_to: Option<UnitRef>,
}

/// What a unit carries, none of it where it sets none.
pub async fn of<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Attributes, Refusal> {
  let Some(row) = one(
    db,
    r#"SELECT k."key", k."name" AS "kind_name", a."short_name", a."reports_to", r."name" AS "reports_name"
       FROM "unit_attributes" a
       LEFT JOIN "unit_kinds" k ON k."id" = a."kind_id"
       LEFT JOIN "organizations" r ON r."id" = a."reports_to"
       WHERE a."unit_id" = $1::bigint"#,
    vec![unit.into()],
  )
  .await?
  else {
    return Ok(Attributes::default());
  };
  let key: Option<String> = row.try_get("", "key")?;
  let reports_to: Option<i64> = row.try_get("", "reports_to")?;

  Ok(Attributes {
    kind: match key {
      Some(key) => Some(KindRef {
        key,
        name: row.try_get("", "kind_name")?,
      }),
      None => None,
    },
    short_name: row.try_get("", "short_name")?,
    reports_to: match reports_to {
      Some(id) => Some(UnitRef {
        id,
        name: row.try_get::<Option<String>>("", "reports_name")?.unwrap_or_default(),
      }),
      None => None,
    },
  })
}

/// What a write of a unit's attributes changes: each field absent left as it stands, and some none taken away.
#[derive(Debug, Clone, Default)]
pub struct Change {
  pub kind: Option<Option<String>>,
  pub short_name: Option<Option<String>>,
  pub reports_to: Option<Option<i64>>,
}

impl Change {
  fn is_empty(&self) -> bool {
    self.kind.is_none() && self.short_name.is_none() && self.reports_to.is_none()
  }
}

/// A short name as asked: trimmed, an empty one none, refused where it is not one line of 1 to 20 characters.
fn short_name_of(asked: Option<&str>) -> Result<Option<String>, Refusal> {
  let Some(name) = asked.map(str::trim).filter(|name| !name.is_empty()) else {
    return Ok(None);
  };

  if name.chars().count() > SHORT_NAME || name.contains(['\n', '\r']) {
    return Err(Refusal::bad("a short name is one line of 1 to 20 characters"));
  }

  Ok(Some(name.to_owned()))
}

/// The unit a unit's line goes to next and how: the unit it reports to where set, its parent otherwise, none at
/// its company.
pub async fn next_of<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Option<(i32, LineVia)>, Refusal> {
  let row = one(
    db,
    r#"SELECT o."parent_id", a."reports_to"
       FROM "organizations" o
       LEFT JOIN "unit_attributes" a ON a."unit_id" = o."id"
       WHERE o."id" = $1::bigint"#,
    vec![unit.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let reports_to: Option<i64> = row.try_get("", "reports_to")?;
  let parent: Option<i32> = row.try_get("", "parent_id")?;

  Ok(match (reports_to, parent) {
    (Some(reports_to), _) => Some((
      i32::try_from(reports_to).map_err(|_| Refusal::bad("a unit's number is out of range"))?,
      LineVia::ReportsTo,
    )),
    (None, Some(parent)) => Some((parent, LineVia::Parent)),
    (None, None) => None,
  })
}

/// Whether a line going on from `next` comes back to `unit`, which a unit whose line goes to `next` would then
/// pass twice. A line that comes round elsewhere, which no write lets stand, ends where it comes round.
pub async fn comes_round<C: ConnectionTrait>(db: &C, unit: i32, next: i32) -> Result<bool, Refusal> {
  let mut seen = HashSet::new();
  let mut at = Some(next);

  while let Some(step) = at {
    if step == unit {
      return Ok(true);
    }

    if !seen.insert(step) {
      return Ok(false);
    }

    at = next_of(db, step).await?.map(|(next, _)| next);
  }

  Ok(false)
}

fn cycle() -> Refusal {
  Refusal::new(StatusCode::CONFLICT, "a unit's line would pass one unit twice").coded("cycle")
}

/// A unit's attributes written as `change` asks, each refused before anything is written where it does not fit.
pub async fn write<C: ConnectionTrait>(db: &C, unit: i32, change: &Change) -> Result<(), Refusal> {
  if change.is_empty() {
    return Ok(());
  }

  let company = company_of(db, unit).await?.ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;
  let kept = one(
    db,
    r#"SELECT "kind_id", "short_name", "reports_to" FROM "unit_attributes" WHERE "unit_id" = $1::bigint"#,
    vec![unit.into()],
  )
  .await?;
  let mut kind: Option<i64> = kept.as_ref().map(|row| row.try_get("", "kind_id")).transpose()?.flatten();
  let mut short_name: Option<String> =
    kept.as_ref().map(|row| row.try_get("", "short_name")).transpose()?.flatten();
  let mut reports_to: Option<i64> =
    kept.as_ref().map(|row| row.try_get("", "reports_to")).transpose()?.flatten();

  if let Some(asked) = &change.kind {
    kind = match asked.as_deref().map(str::trim).filter(|key| !key.is_empty()) {
      Some(key) => Some(named::<Kinds, _>(db, company, key).await?.id),
      None => None,
    };
  }

  if let Some(asked) = &change.short_name {
    short_name = short_name_of(asked.as_deref())?;

    if let Some(name) = &short_name {
      let taken = one(
        db,
        r#"SELECT 1 FROM "unit_attributes"
           WHERE "company_id" = $1::bigint AND lower("short_name") = lower($2) AND "unit_id" <> $3::bigint"#,
        vec![company.into(), name.clone().into(), unit.into()],
      )
      .await?
      .is_some();

      if taken {
        return Err(
          Refusal::new(StatusCode::CONFLICT, "another unit of the company holds this short name")
            .coded("short-name-taken"),
        );
      }
    }
  }

  if let Some(asked) = change.reports_to {
    reports_to = match asked {
      Some(target) => {
        let target =
          i32::try_from(target).map_err(|_| Refusal::bad(format!("{target} is no unit's number")))?;

        if target == unit {
          return Err(Refusal::bad("a unit does not report to itself"));
        }

        let target_company = company_of(db, target)
          .await?
          .ok_or_else(|| Refusal::absent(format!("no unit {target}")))?;

        if target_company != company {
          return Err(
            Refusal::new(StatusCode::CONFLICT, "a unit reports to a unit of its own company alone")
              .coded("other-company"),
          );
        }

        if comes_round(db, unit, target).await? {
          return Err(cycle());
        }

        Some(i64::from(target))
      }
      None => None,
    };
  }

  if kind.is_none() && short_name.is_none() && reports_to.is_none() {
    run(db, r#"DELETE FROM "unit_attributes" WHERE "unit_id" = $1::bigint"#, vec![unit.into()]).await?;

    return Ok(());
  }

  run(
    db,
    r#"INSERT INTO "unit_attributes" ("unit_id", "company_id", "kind_id", "short_name", "reports_to")
       VALUES ($1::bigint, $2::bigint, $3, $4, $5)
       ON CONFLICT ("unit_id") DO UPDATE SET
         "company_id" = EXCLUDED."company_id", "kind_id" = EXCLUDED."kind_id",
         "short_name" = EXCLUDED."short_name", "reports_to" = EXCLUDED."reports_to""#,
    vec![unit.into(), company.into(), kind.into(), short_name.into(), reports_to.into()],
  )
  .await?;

  Ok(())
}

/// Whether moving `unit` under `parent` would make its line pass one unit twice: where it reports to no unit,
/// its line goes on to its parent.
pub async fn parent_comes_round<C: ConnectionTrait>(db: &C, unit: i32, parent: i32) -> Result<(), Refusal> {
  let reports = one(
    db,
    r#"SELECT 1 FROM "unit_attributes" WHERE "unit_id" = $1::bigint AND "reports_to" IS NOT NULL"#,
    vec![unit.into()],
  )
  .await?
  .is_some();

  if !reports && comes_round(db, unit, parent).await? {
    return Err(cycle());
  }

  Ok(())
}
