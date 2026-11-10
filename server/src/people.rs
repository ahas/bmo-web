//! The people directory (docs/accounts.md, 「The people directory」; docs/boundary.md, 「Users and senders」):
//! the users of the reader's own company, whatever unit of it they stand in, found by their name, their unit and
//! the contact details the reader may see. The contact details stand only for the platform administrator and for the person
//! themselves, and a search matches only the fields its reader may see, so a refused field is not an answer
//! either.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{OWNER_KEY, People as WirePeople, Person};
use sea_orm::{ConnectionTrait, QueryResult};
use serde::Deserialize;
use sumida::api::authz::Authz;

use crate::routes::{Answer, user_in};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one};

/// The most people one search answers, and the most it answers where the call names none.
const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 50;

/// What a search asks: the words and how many people it may answer.
#[derive(Debug, Deserialize)]
pub struct SearchAsk {
  q: Option<String>,
  limit: Option<i64>,
}

/// Who reads the directory: the login's user, their company and whether they are the administrator.
struct Caller {
  user: i32,
  company: i32,
  administrator: bool,
}

/// The users a company holds: those whose unit stands under it.
const IN_COMPANY: &str =
  r#"u."organization_id" IN (SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = $1)"#;

/// The columns one person is read by.
const COLUMNS: &str = r#"
  u."id",
  COALESCE(NULLIF(u."full_name", ''), u."username") AS "name",
  o."name" AS "organization",
  COALESCE(p."job_title", '') AS "job_title",
  COALESCE(p."landline", '') AS "landline",
  COALESCE(p."mobile", '') AS "mobile",
  COALESCE(NULLIF(p."email", ''), NULLIF(u."email", ''), '') AS "email"
"#;

const FROM: &str = r#"
  FROM "users" u
  JOIN "organizations" o ON o."id" = u."organization_id"
  LEFT JOIN "user_profiles" p ON p."user_id" = u."id"
"#;

/// The login reading the directory, refused where the call names no user of this deployment.
async fn caller<C: ConnectionTrait>(db: &C, headers: &HeaderMap) -> Result<Caller, Refusal> {
  let user = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    .ok_or_else(|| {
      Refusal::forbidden("the people are read by a signed-in user, and the call names none")
    })?;
  let row = one(db, r#"SELECT "organization_id" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::forbidden("the call names no user of this deployment"))?;

  let unit: i32 = row.try_get("", "organization_id")?;
  let company = crate::units::company_of(db, unit)
    .await?
    .ok_or_else(|| Refusal::forbidden("the reader's unit stands in no company"))?;

  Ok(Caller {
    user,
    company,
    administrator: Authz::is_superuser(&user_subject(db, user).await?, db).await?,
  })
}

/// One row as the reader may see it: the contact details only for the administrator and the person themselves.
fn person_of(row: &QueryResult, reader: &Caller) -> Result<Person, Refusal> {
  let user: i32 = row.try_get("", "id")?;
  let contact = reader.administrator || user == reader.user;

  Ok(Person {
    user: crate::ids::shown(user),
    name: row.try_get("", "name")?,
    organization: row.try_get("", "organization")?,
    job_title: row.try_get("", "job_title")?,
    landline: contact.then(|| row.try_get::<String>("", "landline")).transpose()?,
    mobile: contact.then(|| row.try_get::<String>("", "mobile")).transpose()?,
    email: contact.then(|| row.try_get::<String>("", "email")).transpose()?,
  })
}

/// The users of the reader's company whose name, unit, job title or permitted contact details hold the words,
/// in the directory's order. Words that are empty, and a search that finds none, answer no
/// one.
async fn search<C: ConnectionTrait>(
  db: &C,
  reader: &Caller,
  words: &str,
  limit: Option<i64>,
) -> Result<Vec<Person>, Refusal> {
  let words = words.trim();

  if words.is_empty() {
    return Ok(Vec::new());
  }

  let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
  // A member matches their own contact details alone; the administrator matches everyone's.
  let contact = if reader.administrator {
    r#"OR strpos(lower(COALESCE(p."landline", '')), lower($2)) > 0
       OR strpos(lower(COALESCE(p."mobile", '')), lower($2)) > 0
       OR strpos(lower(COALESCE(p."email", '')), lower($2)) > 0
       OR strpos(lower(COALESCE(u."email", '')), lower($2)) > 0"#
  } else {
    r#"OR (u."id" = $4 AND (
         strpos(lower(COALESCE(p."landline", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(p."mobile", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(p."email", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(u."email", '')), lower($2)) > 0
       ))"#
  };
  let sql = format!(
    r#"SELECT {COLUMNS} {FROM}
       WHERE {IN_COMPANY} AND (
         strpos(lower(u."username"), lower($2)) > 0
         OR strpos(lower(COALESCE(u."full_name", '')), lower($2)) > 0
         OR strpos(lower(o."name"), lower($2)) > 0
         OR strpos(lower(COALESCE(p."job_title", '')), lower($2)) > 0
         {contact}
       )
       ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), u."id"
       LIMIT $3"#
  );
  let rows = all(
    db,
    &sql,
    vec![reader.company.into(), words.to_owned().into(), limit.into(), reader.user.into()],
  )
  .await?;

  rows.iter().map(|row| person_of(row, reader)).collect()
}

/// One person of the reader's company, or nothing found where the user does not stand or stands in another
/// company.
async fn of<C: ConnectionTrait>(db: &C, reader: &Caller, user: i32) -> Result<Person, Refusal> {
  let sql = format!(r#"SELECT {COLUMNS} {FROM} WHERE {IN_COMPANY} AND u."id" = $2"#);
  let row = one(db, &sql, vec![reader.company.into(), user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no person {user} stands in this company")))?;

  person_of(&row, reader)
}

/// `GET /users/search`: the people the words find.
async fn search_route(
  State(service): State<Service>,
  Query(ask): Query<SearchAsk>,
  headers: HeaderMap,
) -> Answer<WirePeople> {
  let reader = caller(&service.db, &headers).await?;
  let people = search(&service.db, &reader, ask.q.as_deref().unwrap_or_default(), ask.limit).await?;

  Ok(Json(WirePeople { people }))
}

/// `GET /users/{user}/person`: one person of the reader's company.
async fn person_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<Person> {
  let reader = caller(&service.db, &headers).await?;
  let user = user_in(&user)?;

  Ok(Json(of(&service.db, &reader, user).await?))
}

/// The directory's routes, mounted with the service's own.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/search", get(search_route))
    .route("/users/{user}/person", get(person_route))
}
