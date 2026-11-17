//! The people directory (docs/accounts.md, 「The people directory」; docs/boundary.md, 「Users and senders」):
//! the users of the reader's own company, whatever unit of it they stand in, and of every company for the platform
//! administrator, found by their name, their unit and the contact details the reader may see. The contact details
//! stand only for the platform administrator and for the person themselves, and a search matches only the fields
//! its reader may see, so a refused field is not an answer either. The members list answers the reader's whole
//! company, each person by key and name alone.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{
  Member, Members, OWNER_KEY, People as WirePeople, Person, PersonDetail, PersonPost, RoleRef,
};
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

impl Caller {
  /// The users the reader's search and person lookup reach: every company's for the administrator, the reader's
  /// own company's, bound as `$1`, for anyone else.
  fn reach(&self) -> &'static str {
    if self.administrator { "TRUE" } else { IN_COMPANY }
  }
}

/// The columns one person is read by.
const COLUMNS: &str = r#"
  u."id",
  COALESCE(NULLIF(u."full_name", ''), u."username") AS "name",
  o."name" AS "organization",
  COALESCE(p."job_title", '') AS "job_title",
  COALESCE(p."rank", '') AS "rank",
  COALESCE(p."duty", '') AS "duty",
  r."key" AS "role_key", r."name" AS "role_name", r."place" AS "role_place",
  COALESCE(p."landline", '') AS "landline",
  COALESCE(p."mobile", '') AS "mobile",
  COALESCE(NULLIF(p."email", ''), NULLIF(u."email", ''), '') AS "email"
"#;

const FROM: &str = r#"
  FROM "users" u
  JOIN "organizations" o ON o."id" = u."organization_id"
  LEFT JOIN "user_profiles" p ON p."user_id" = u."id"
  LEFT JOIN "user_roles" ur ON ur."user_id" = u."id"
  LEFT JOIN "company_roles" r ON r."id" = ur."role_id"
"#;

/// The order the directory answers people in: by name, then by user id.
const ORDER: &str = r#"ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), u."id""#;

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

/// The role a row's person carries in their home unit, where they carry one.
pub fn role_of(row: &QueryResult) -> Result<Option<RoleRef>, Refusal> {
  match row.try_get::<Option<String>>("", "role_key")? {
    Some(key) => Ok(Some(RoleRef {
      key,
      name: row.try_get("", "role_name")?,
      place: row.try_get("", "role_place")?,
    })),
    None => Ok(None),
  }
}

/// One row as the reader may see it: the contact details only for the administrator and the person themselves.
fn person_of(row: &QueryResult, reader: &Caller) -> Result<Person, Refusal> {
  let user: i32 = row.try_get("", "id")?;
  let contact = reader.administrator || user == reader.user;

  let rank: String = row.try_get("", "rank")?;
  let role = role_of(row)?;
  let kept: String = row.try_get("", "job_title")?;

  Ok(Person {
    user: crate::ids::shown(user),
    name: row.try_get("", "name")?,
    organization: row.try_get("", "organization")?,
    job_title: crate::lang::job_titles::shown(&rank, role.as_ref().map(|role| role.name.as_str()), &kept),
    rank,
    role,
    duty: row.try_get("", "duty")?,
    landline: contact.then(|| row.try_get::<String>("", "landline")).transpose()?,
    mobile: contact.then(|| row.try_get::<String>("", "mobile")).transpose()?,
    email: contact.then(|| row.try_get::<String>("", "email")).transpose()?,
  })
}

/// The users the reader reaches whose name, unit, job title or permitted contact details hold the words,
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
       WHERE {reach} AND (
         strpos(lower(u."username"), lower($2)) > 0
         OR strpos(lower(COALESCE(u."full_name", '')), lower($2)) > 0
         OR strpos(lower(o."name"), lower($2)) > 0
         OR strpos(lower(COALESCE(p."job_title", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(p."rank", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(p."duty", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(r."name", '')), lower($2)) > 0
         {contact}
       )
       {ORDER}
       LIMIT $3"#,
    reach = reader.reach(),
  );
  let rows = all(
    db,
    &sql,
    vec![reader.company.into(), words.to_owned().into(), limit.into(), reader.user.into()],
  )
  .await?;

  rows.iter().map(|row| person_of(row, reader)).collect()
}

/// Every member of the reader's company who has not left, by account key and name alone, in the directory's order.
async fn members<C: ConnectionTrait>(db: &C, reader: &Caller) -> Result<Vec<Member>, Refusal> {
  let sql = format!(
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name"
       FROM "users" u
       WHERE {IN_COMPANY}
         AND NOT EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = u."id")
       {ORDER}"#
  );
  let rows = all(db, &sql, vec![reader.company.into()]).await?;

  rows
    .iter()
    .map(|row| {
      Ok(Member {
        user: crate::ids::shown(row.try_get("", "id")?),
        name: row.try_get("", "name")?,
      })
    })
    .collect()
}

/// One person the reader reaches with their posts, or nothing found where the user does not stand or stands
/// beyond the reader's reach.
async fn of<C: ConnectionTrait>(db: &C, reader: &Caller, user: i32) -> Result<PersonDetail, Refusal> {
  let sql = format!(r#"SELECT {COLUMNS} {FROM} WHERE {reach} AND u."id" = $2"#, reach = reader.reach());
  let row = one(db, &sql, vec![reader.company.into(), user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no person {user} stands in the reader's directory")))?;

  Ok(PersonDetail {
    person: person_of(&row, reader)?,
    posts: crate::posts::posts_of(db, user)
      .await?
      .into_iter()
      .map(|post| PersonPost {
        unit: post.unit,
        role: post.role,
      })
      .collect(),
  })
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

/// `GET /users/members`: every member of the reader's company.
async fn members_route(State(service): State<Service>, headers: HeaderMap) -> Answer<Members> {
  let reader = caller(&service.db, &headers).await?;

  Ok(Json(Members {
    members: members(&service.db, &reader).await?,
  }))
}

/// `GET /users/{user}/person`: one person the reader reaches.
async fn person_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<PersonDetail> {
  let reader = caller(&service.db, &headers).await?;
  let user = user_in(&user)?;

  Ok(Json(of(&service.db, &reader, user).await?))
}

/// The directory's routes, mounted with the service's own.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/search", get(search_route))
    .route("/users/members", get(members_route))
    .route("/users/{user}/person", get(person_route))
}
