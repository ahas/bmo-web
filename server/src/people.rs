//! The people directory (docs/accounts.md, 「The people directory」; docs/boundary.md, 「Users and senders」):
//! the users of the reader's own company, whatever unit of it they stand in, and of every company for the platform
//! administrator, found by their name, their unit and the contact details the reader may see. Asked with a room,
//! the search and the members list answer instead the people the reader may let into that room, on the entry
//! check's own rule (docs/accounts.md, 「A room's callers」), and none of them marked left. The contact details
//! stand only for the platform administrator and for the person themselves, and a search matches only the fields
//! its reader may see, so a refused field is not an answer either. The members list answers the reader's whole
//! company, each person by key and name alone.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{
  EntryAct, Member, Members, OWNER_KEY, People as WirePeople, Person, PersonDetail, PersonPost, RoleRef,
};
use sea_orm::{ConnectionTrait, QueryResult};
use serde::Deserialize;
use sumida::api::authz::Authz;

use crate::entry::{EntryBound, entry_set};
use crate::receiver::Receiver;
use crate::routes::{Answer, user_in};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one};

/// The most people one search answers, and the most it answers where the call names none.
const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 50;

/// What a search asks: the words, how many people it may answer, and the room whose letting-in rule bounds it
/// where one is named.
#[derive(Debug, Deserialize)]
pub struct SearchAsk {
  q: Option<String>,
  limit: Option<i64>,
  room: Option<i64>,
}

/// What a members list asks: the room whose letting-in rule bounds it where one is named.
#[derive(Debug, Deserialize)]
pub struct MembersAsk {
  room: Option<i64>,
}

/// Who reads the directory: the login's user, the company their unit stands in where it stands in one, and
/// whether they are the administrator.
struct Caller {
  user: i32,
  company: Option<i32>,
  administrator: bool,
}

/// The users a company holds: those whose unit stands under it.
const IN_COMPANY: &str =
  r#"u."organization_id" IN (SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = $1)"#;

/// Every person of the deployment stands in the reach; the company-bound reach binds its company as `$1`.
const EVERYONE: &str = "TRUE";

impl Caller {
  /// The company the reader's road reaches, refused where their unit stands in none.
  fn company(&self) -> Result<i32, Refusal> {
    self.company.ok_or_else(|| Refusal::forbidden("the reader's unit stands in no company"))
  }

  /// The users the reader's own-company road reaches: every company's for the administrator.
  fn reach(&self) -> &'static str {
    if self.administrator { EVERYONE } else { IN_COMPANY }
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

/// The people who have not left: a room is never offered a person its letting-in road marks left.
const NOT_LEFT: &str = r#"NOT EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = u."id")"#;

/// The order the directory answers people in: by name, then by user id.
const ORDER: &str = r#"ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), u."id""#;

/// The login reading the directory, refused where the call names no user of this deployment. A reader whose unit
/// stands in no company is refused by the roads that read a company, not here: a room's road may not need one.
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

  Ok(Caller {
    user,
    company: crate::units::company_of(db, unit).await?,
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

/// Whom one road reaches and what `$1` binds, from the reader's own company or from the room's letting-in rule.
enum Reach {
  Bounded { reach: &'static str, bind: i32 },
  None,
}

/// The bound the room's road answers: nobody where the reader may let in nobody, else the people the act
/// reaches, and people marked left are none of it.
async fn room_reach<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  reader: &Caller,
  room: i64,
) -> Result<Reach, Refusal> {
  Ok(match entry_set(db, receiver, reader.user, room, EntryAct::LetIn).await? {
    EntryBound::NoOne => Reach::None,
    EntryBound::Company(company) => Reach::Bounded {
      reach: IN_COMPANY,
      bind: company,
    },
    EntryBound::Everyone => Reach::Bounded {
      reach: EVERYONE,
      bind: reader.user,
    },
  })
}

/// The users the reader reaches whose name, unit, job title or permitted contact details hold the words,
/// in the directory's order. Words that are empty answer nobody, unless a room is named, where they answer
/// the whole set the reader may let into it. A search that finds none answers no one.
async fn search<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  reader: &Caller,
  words: &str,
  limit: Option<i64>,
  room: Option<i64>,
) -> Result<Vec<Person>, Refusal> {
  let words = words.trim();
  let (reach, bind, left) = match room {
    None => {
      if words.is_empty() {
        return Ok(Vec::new());
      }

      (reader.reach(), reader.company()?, String::new())
    }
    Some(room) => match room_reach(db, receiver, reader, room).await? {
      Reach::None => return Ok(Vec::new()),
      Reach::Bounded { reach, bind } => (reach, bind, format!("AND {NOT_LEFT}")),
    },
  };

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
  // A room's road asked with no words answers the whole set it reaches; words narrow it as every search does.
  let matched = if words.is_empty() {
    String::new()
  } else {
    format!(
      r#"AND (
         strpos(lower(u."username"), lower($2)) > 0
         OR strpos(lower(COALESCE(u."full_name", '')), lower($2)) > 0
         OR strpos(lower(o."name"), lower($2)) > 0
         OR strpos(lower(COALESCE(p."job_title", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(p."rank", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(p."duty", '')), lower($2)) > 0
         OR strpos(lower(COALESCE(r."name", '')), lower($2)) > 0
         {contact}
       )"#
    )
  };
  let sql = format!(
    r#"SELECT {COLUMNS} {FROM}
       WHERE {reach} {left} {matched}
       {ORDER}
       LIMIT $3"#,
  );
  let rows =
    all(db, &sql, vec![bind.into(), words.to_owned().into(), limit.into(), reader.user.into()]).await?;

  rows.iter().map(|row| person_of(row, reader)).collect()
}

/// Every member of the reader's company who has not left, by account key and name alone, in the directory's
/// order; or, with a room, the people the reader may let into it, none marked left, in the same order.
async fn members<C: ConnectionTrait>(
  db: &C,
  receiver: &dyn Receiver,
  reader: &Caller,
  room: Option<i64>,
) -> Result<Vec<Member>, Refusal> {
  let (reach, bind) = match room {
    None => (IN_COMPANY, reader.company()?),
    Some(room) => match room_reach(db, receiver, reader, room).await? {
      Reach::None => return Ok(Vec::new()),
      Reach::Bounded { reach, bind } => (reach, bind),
    },
  };

  let sql = format!(
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name"
       FROM "users" u
       WHERE {reach}
         AND {NOT_LEFT}
       {ORDER}"#
  );
  let rows = all(db, &sql, vec![bind.into()]).await?;

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
  let company = reader.company()?;
  let reach = reader.reach();
  let sql = format!(r#"SELECT {COLUMNS} {FROM} WHERE {reach} AND u."id" = $2"#);
  let row = one(db, &sql, vec![company.into(), user.into()])
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

/// `GET /users/search`: the people the words find, bounded by the reader's company or by a named room's
/// letting-in rule.
async fn search_route(
  State(service): State<Service>,
  Query(ask): Query<SearchAsk>,
  headers: HeaderMap,
) -> Answer<WirePeople> {
  let reader = caller(&service.db, &headers).await?;
  let people = search(
    &service.db,
    service.receiver.as_ref(),
    &reader,
    ask.q.as_deref().unwrap_or_default(),
    ask.limit,
    ask.room,
  )
  .await?;

  Ok(Json(WirePeople { people }))
}

/// `GET /users/members`: every member of the reader's company, or the people a named room's letting-in rule
/// reaches for the reader.
async fn members_route(
  State(service): State<Service>,
  Query(ask): Query<MembersAsk>,
  headers: HeaderMap,
) -> Answer<Members> {
  let reader = caller(&service.db, &headers).await?;

  Ok(Json(Members {
    members: members(&service.db, service.receiver.as_ref(), &reader, ask.room).await?,
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
