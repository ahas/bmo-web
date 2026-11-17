//! A company's own words for its organisation (docs/accounts.md, 「Roles and unit kinds」; docs/boundary.md,
//! 「Roles and unit kinds」): its roles, lowest first, and its unit kinds, each an entry of a key that stays and a
//! name the company may change. A list is written whole; an entry still in use is never removed. Anyone of the
//! company reads them, the administrator and a head of the company's own unit write them.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use bmo_web_client::{
  CatalogueEntry, CompanyRoles, CompanyRolesAsk, KindRef, RoleRef, UnitKinds, UnitKindsAsk,
};
use sea_orm::{ConnectionTrait, TransactionTrait};

use crate::readers::{Reader, reader};
use crate::routes::{Answer, Body};
use crate::{Refusal, Service, all, one, run};

/// The most entries a list holds, and the most characters a key or a name has.
const MOST_ENTRIES: usize = 100;
const MOST_CHARACTERS: usize = 40;

/// One list a company keeps: the table it stands in and what keeps an entry of it in use.
pub trait Catalogue {
  /// The table, one row an entry, keyed by the company and the entry's key.
  const TABLE: &'static str;
  /// What an entry is, as a refusal names it.
  const ENTRY: &'static str;
  /// A statement answering a row where the entry `$1` names is in use.
  const IN_USE: &'static str;
  /// The code a removal of an entry in use is refused with.
  const HELD: &'static str;
  /// The code an entry the list does not hold is refused with where it is named.
  const UNKNOWN: &'static str;
}

/// A company's roles, which people carry in their home unit and in their posts.
pub struct Roles;

impl Catalogue for Roles {
  const TABLE: &'static str = "company_roles";
  const ENTRY: &'static str = "role";
  const IN_USE: &'static str = r#"SELECT 1 FROM "user_roles" WHERE "role_id" = $1
    UNION ALL SELECT 1 FROM "unit_posts" WHERE "role_id" = $1 LIMIT 1"#;
  const HELD: &'static str = "role-held";
  const UNKNOWN: &'static str = "no-such-role";
}

/// A company's unit kinds, which its units carry.
pub struct Kinds;

impl Catalogue for Kinds {
  const TABLE: &'static str = "unit_kinds";
  const ENTRY: &'static str = "kind";
  const IN_USE: &'static str = r#"SELECT 1 FROM "unit_attributes" WHERE "kind_id" = $1 LIMIT 1"#;
  const HELD: &'static str = "kind-held";
  const UNKNOWN: &'static str = "no-such-kind";
}

/// One entry as it is kept: its row, its key, its name and its place, counted from 1.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
  pub id: i64,
  pub key: String,
  pub name: String,
  pub place: i32,
}

impl Entry {
  pub fn role(&self) -> RoleRef {
    RoleRef {
      key: self.key.clone(),
      name: self.name.clone(),
      place: self.place,
    }
  }

  pub fn kind(&self) -> KindRef {
    KindRef {
      key: self.key.clone(),
      name: self.name.clone(),
    }
  }
}

fn entry_of(row: &sea_orm::QueryResult) -> Result<Entry, Refusal> {
  Ok(Entry {
    id: row.try_get("", "id")?,
    key: row.try_get("", "key")?,
    name: row.try_get("", "name")?,
    place: row.try_get("", "place")?,
  })
}

/// A company's list, in its order.
pub async fn entries<K: Catalogue, C: ConnectionTrait>(
  db: &C,
  company: i32,
) -> Result<Vec<Entry>, Refusal> {
  let sql = format!(
    r#"SELECT "id", "key", "name", "place" FROM "{}" WHERE "company_id" = $1::bigint ORDER BY "place", "id""#,
    K::TABLE
  );

  all(db, &sql, vec![company.into()]).await?.iter().map(entry_of).collect()
}

/// The entry of a company's list a key names, refused with the list's own code where it holds none.
pub async fn named<K: Catalogue, C: ConnectionTrait>(
  db: &C,
  company: i32,
  key: &str,
) -> Result<Entry, Refusal> {
  let sql = format!(
    r#"SELECT "id", "key", "name", "place" FROM "{}" WHERE "company_id" = $1::bigint AND "key" = $2"#,
    K::TABLE
  );

  match one(db, &sql, vec![company.into(), key.to_owned().into()]).await? {
    Some(row) => entry_of(&row),
    None => Err(Refusal::bad(format!("the company keeps no {} `{key}`", K::ENTRY)).coded(K::UNKNOWN)),
  }
}

/// Whether a key is 1 to 40 lowercase letters, digits and hyphens, beginning with a letter.
fn key_shaped(key: &str) -> bool {
  key.len() <= MOST_CHARACTERS
    && key.starts_with(|first: char| first.is_ascii_lowercase())
    && key.chars().all(|one| one.is_ascii_lowercase() || one.is_ascii_digit() || one == '-')
}

/// A list as asked, its names trimmed, refused where it is out of shape.
fn shaped(asked: &[CatalogueEntry]) -> Result<Vec<CatalogueEntry>, Refusal> {
  let refused = |why: String| Refusal::bad(why).coded("bad-catalogue");

  if asked.len() > MOST_ENTRIES {
    return Err(refused(format!("a list holds at most {MOST_ENTRIES} entries")));
  }

  let mut written: Vec<CatalogueEntry> = Vec::with_capacity(asked.len());

  for entry in asked {
    let key = entry.key.trim();
    let name = entry.name.trim();

    if !key_shaped(key) {
      return Err(refused(format!("`{key}` is no key: 1 to 40 lowercase letters, digits and hyphens")));
    }

    if name.is_empty() || name.chars().count() > MOST_CHARACTERS || name.contains(['\n', '\r']) {
      return Err(refused(format!("the name of `{key}` is not one line of 1 to 40 characters")));
    }

    if written.iter().any(|kept| kept.key == key) {
      return Err(refused(format!("`{key}` is named twice")));
    }

    if written.iter().any(|kept| kept.name.to_lowercase() == name.to_lowercase()) {
      return Err(refused(format!("`{name}` names two entries")));
    }

    written.push(CatalogueEntry {
      key: key.to_owned(),
      name: name.to_owned(),
    });
  }

  Ok(written)
}

/// A company's list written whole, in one transaction: an entry left out is removed where nothing uses it, and
/// every other is written with its place as the list stands it.
pub async fn write<K: Catalogue, C: ConnectionTrait + TransactionTrait>(
  db: &C,
  company: i32,
  asked: &[CatalogueEntry],
) -> Result<(), Refusal> {
  let asked = shaped(asked)?;
  let txn = db.begin().await?;
  let written = written::<K, _>(&txn, company, &asked).await;

  match written {
    Ok(()) => Ok(txn.commit().await?),
    Err(refused) => {
      txn.rollback().await?;

      Err(refused)
    }
  }
}

async fn written<K: Catalogue, C: ConnectionTrait>(
  db: &C,
  company: i32,
  asked: &[CatalogueEntry],
) -> Result<(), Refusal> {
  for kept in entries::<K, _>(db, company).await? {
    if asked.iter().any(|entry| entry.key == kept.key) {
      continue;
    }

    if one(db, K::IN_USE, vec![kept.id.into()]).await?.is_some() {
      return Err(
        Refusal::new(StatusCode::CONFLICT, format!("the {} `{}` is still in use", K::ENTRY, kept.key))
          .coded(K::HELD),
      );
    }

    run(db, &format!(r#"DELETE FROM "{}" WHERE "id" = $1"#, K::TABLE), vec![kept.id.into()]).await?;
  }

  for (at, entry) in asked.iter().enumerate() {
    let place = i32::try_from(at + 1).unwrap_or(i32::MAX);
    let sql = format!(
      r#"INSERT INTO "{}" ("company_id", "key", "name", "place") VALUES ($1::bigint, $2, $3, $4)
         ON CONFLICT ("company_id", "key") DO UPDATE SET "name" = EXCLUDED."name", "place" = EXCLUDED."place""#,
      K::TABLE
    );

    run(
      db,
      &sql,
      vec![company.into(), entry.key.clone().into(), entry.name.clone().into(), place.into()],
    )
    .await?;
  }

  Ok(())
}

/// The company a path names, where it stands as a company the reader reaches; answered as if nothing stood
/// there otherwise.
async fn company_read<C: ConnectionTrait>(db: &C, reader: &Reader, company: &str) -> Result<i32, Refusal> {
  let absent = || Refusal::absent(format!("no company {company}"));
  let company: i32 =
    company.parse().map_err(|_| Refusal::bad(format!("`{company}` is no unit's number")))?;
  let row = one(
    db,
    r#"SELECT "parent_id" FROM "organizations" WHERE "id" = $1::bigint"#,
    vec![company.into()],
  )
  .await?
  .ok_or_else(absent)?;

  if row.try_get::<Option<i32>>("", "parent_id")?.is_some() || !reader.reaches(company) {
    return Err(absent());
  }

  Ok(company)
}

/// The company a path names, where the reader may write its lists: the administrator and a head of its own unit.
async fn company_written<C: ConnectionTrait>(
  db: &C,
  reader: &Reader,
  company: &str,
) -> Result<i32, Refusal> {
  let company = company_read(db, reader, company).await?;

  if !reader.heads(db, company).await? {
    return Err(Refusal::forbidden(
      "a company's lists are written by the administrator and a head of the company's own unit",
    ));
  }

  Ok(company)
}

async fn roles_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
) -> Answer<CompanyRoles> {
  let reader = reader(&service.db, &headers).await?;
  let company = company_read(&service.db, &reader, &company).await?;

  roles_of(&service.db, company).await.map(Json)
}

async fn set_roles_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<CompanyRolesAsk>,
) -> Answer<CompanyRoles> {
  let reader = reader(&service.db, &headers).await?;
  let company = company_written(&service.db, &reader, &company).await?;

  write::<Roles, _>(&service.db, company, &ask.roles).await?;

  roles_of(&service.db, company).await.map(Json)
}

async fn roles_of<C: ConnectionTrait>(db: &C, company: i32) -> Result<CompanyRoles, Refusal> {
  Ok(CompanyRoles {
    roles: entries::<Roles, _>(db, company).await?.iter().map(Entry::role).collect(),
  })
}

async fn kinds_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
) -> Answer<UnitKinds> {
  let reader = reader(&service.db, &headers).await?;
  let company = company_read(&service.db, &reader, &company).await?;

  kinds_of(&service.db, company).await.map(Json)
}

async fn set_kinds_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<UnitKindsAsk>,
) -> Answer<UnitKinds> {
  let reader = reader(&service.db, &headers).await?;
  let company = company_written(&service.db, &reader, &company).await?;

  write::<Kinds, _>(&service.db, company, &ask.kinds).await?;

  kinds_of(&service.db, company).await.map(Json)
}

async fn kinds_of<C: ConnectionTrait>(db: &C, company: i32) -> Result<UnitKinds, Refusal> {
  Ok(UnitKinds {
    kinds: entries::<Kinds, _>(db, company).await?.iter().map(Entry::kind).collect(),
  })
}

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/companies/{company}/roles", get(roles_route).put(set_roles_route))
    .route("/companies/{company}/unit-kinds", get(kinds_route).put(set_kinds_route))
}
