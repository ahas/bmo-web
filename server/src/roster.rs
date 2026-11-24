//! The people roster (docs/accounts.md, 「The people roster」; docs/boundary.md, 「The people roster」):
//! the people of every company the reader looks through, a page at a time, each with their account's
//! standing, and one person opened with what is theirs. The platform administrator looks through every
//! company, a head of a company's own unit through that company, and nobody else through any. The moment
//! each user last signed in is kept here too, as a sign-in that answered with a session passes.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bmo_web_client::{
  OWNER_KEY, RosterCompanies, RosterDetail, RosterLeft, RosterMachine, RosterPage, RosterPerson,
  RosterState, UnitRef,
};
use sea_orm::{ConnectionTrait, QueryResult, Value};
use serde::Deserialize;
use sumida::api::authz::Authz;

use crate::acting::acting_grant;
use crate::ids::shown;
use crate::people::role_of;
use crate::routes::{Answer, user_in};
use crate::units::{HEAD_GRANT, UNIT, company_of, path_of};
use crate::users::user_subject;
use crate::{Refusal, Service, all, one};

/// How many people a page answers where the call names no limit, and the most it ever answers.
const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/people", get(page_route))
    .route("/people/companies", get(companies_route))
    .route("/people/{user}", get(person_route))
}

/// Who reads the roster: the login's user and whether they are the platform administrator.
struct Reader {
  user: i32,
  administrator: bool,
}

/// The login reading the roster, refused where the call names no user of this deployment.
async fn reader<C: ConnectionTrait>(db: &C, headers: &HeaderMap) -> Result<Reader, Refusal> {
  let user = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    .ok_or_else(|| Refusal::forbidden("the roster is read by a signed-in user, and the call names none"))?;

  one(db, r#"SELECT "id" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::forbidden("the call names no user of this deployment"))?;

  Ok(Reader {
    user,
    administrator: Authz::is_superuser(&user_subject(db, user).await?, db).await?,
  })
}

/// The companies a reader looks through, with `$1` the reader's user as sumida keeps a subject and `$2`
/// whether they are the administrator: every company for the administrator, and otherwise each company
/// whose own unit the reader is granted head of directly.
fn looked_through() -> String {
  format!(
    r#"SELECT c."id" FROM "organizations" c
       WHERE c."parent_id" IS NULL AND ($2::boolean OR EXISTS (
         SELECT 1 FROM "relation_tuples" t
         WHERE t."resource_type" = '{UNIT}' AND t."resource_id" = c."id"::text
           AND t."relation" = '{HEAD_GRANT}'
           AND t."subject_type" = 'user' AND t."subject_id" = $1 AND t."subject_relation" = ''
           AND (t."expires_at" IS NULL OR t."expires_at" > now())))"#
  )
}

/// A person's name: theirs, or the login where none stands.
const NAME: &str = r#"COALESCE(NULLIF(u."full_name", ''), u."username")"#;

/// Whether a person is granted head of the unit they stand in, directly.
fn head() -> String {
  format!(
    r#"EXISTS (
         SELECT 1 FROM "relation_tuples" h
         WHERE h."resource_type" = '{UNIT}' AND h."resource_id" = u."organization_id"::text
           AND h."relation" = '{HEAD_GRANT}' AND h."subject_type" = 'user' AND h."subject_id" = u."id"::text
           AND h."subject_relation" = '' AND (h."expires_at" IS NULL OR h."expires_at" > now()))"#
  )
}

/// Where a person's account stands, as the wire names it.
const STATE: &str = r#"CASE WHEN d."user_id" IS NOT NULL THEN 'left'
  WHEN NOT u."is_enabled" THEN 'pending'
  ELSE 'active' END"#;

/// Every person with their unit, the company at its top and what the roster reads of their account.
const FROM: &str = r#"
  FROM "users" u
  JOIN "organizations" o ON o."id" = u."organization_id"
  JOIN "org_closure" cc ON cc."descendant_id" = u."organization_id"
  JOIN "organizations" c ON c."id" = cc."ancestor_id" AND c."parent_id" IS NULL
  LEFT JOIN "user_profiles" p ON p."user_id" = u."id"
  LEFT JOIN "user_roles" ur ON ur."user_id" = u."id"
  LEFT JOIN "company_roles" r ON r."id" = ur."role_id"
  LEFT JOIN "user_departures" d ON d."user_id" = u."id"
  LEFT JOIN "user_nodes" n ON n."user_id" = u."id"
  LEFT JOIN "user_sign_ins" s ON s."user_id" = u."id"
"#;

/// The columns a page reads of one person, `post` the SQL naming the unit of the post through which they count,
/// or null.
fn columns(post: &str) -> String {
  format!(
    r#"u."id", u."username", {NAME} AS "name", lower({NAME}) AS "sort_name",
       c."id" AS "company_id", c."name" AS "company_name", o."id" AS "unit_id", o."name" AS "unit_name",
       {head} AS "head", ({head} AND {acting}) AS "acting", {STATE} AS "state", n."agent",
       (extract(epoch FROM u."created_at") * 1000)::bigint AS "made_at", s."signed_in_at",
       COALESCE(p."job_title", '') AS "job_title",
       COALESCE(p."rank", '') AS "rank",
       COALESCE(p."duty", '') AS "duty",
       r."key" AS "role_key", r."name" AS "role_name", r."place" AS "role_place",
       ({post})::bigint AS "post_id",
       COALESCE(NULLIF(p."email", ''), NULLIF(u."email", ''), '') AS "email""#,
    head = head(),
    acting = acting_grant(r#"u."organization_id""#, r#"u."id""#),
  )
}

/// The units a page is narrowed to, as conditions on the unit `{x}` stands for: each unit under one named, and
/// each of one kind.
struct Narrowing(Vec<String>);

impl Narrowing {
  /// The condition that the unit `unit` names matches, none where the page is not narrowed.
  fn on(&self, unit: &str) -> Option<String> {
    (!self.0.is_empty())
      .then(|| self.0.iter().map(|one| one.replace("{x}", unit)).collect::<Vec<_>>().join(" AND "))
  }

  /// The condition that a person counts: their home unit matches, or a unit they hold a post in does.
  fn counts(&self) -> Option<String> {
    let home = self.on(r#"u."organization_id""#)?;
    let post = self.on(r#"up."unit_id""#)?;

    Some(format!(
      r#"({home} OR EXISTS (SELECT 1 FROM "unit_posts" up WHERE up."user_id" = u."id" AND {post}))"#
    ))
  }

  /// The unit of the post through which a person counts where their home unit does not match, or null.
  fn post(&self) -> String {
    match (self.on(r#"u."organization_id""#), self.on(r#"up."unit_id""#)) {
      (Some(home), Some(post)) => format!(
        r#"CASE WHEN {home} THEN NULL ELSE (SELECT min(up."unit_id") FROM "unit_posts" up
             WHERE up."user_id" = u."id" AND {post}) END"#
      ),
      _ => "NULL".to_owned(),
    }
  }
}

/// One statement's conditions and the values they are bound to, the reader's two first.
struct Ask {
  conditions: Vec<String>,
  values: Vec<Value>,
}

impl Ask {
  /// The people the reader looks through.
  fn of(reader: &Reader) -> Self {
    Self {
      conditions: vec![format!(r#"c."id" IN ({})"#, looked_through())],
      values: vec![shown(reader.user).into(), reader.administrator.into()],
    }
  }

  /// A value bound to the statement, by the place it is named at.
  fn bind(&mut self, value: impl Into<Value>) -> String {
    self.values.push(value.into());

    format!("${}", self.values.len())
  }

  fn and(&mut self, condition: String) {
    self.conditions.push(condition);
  }

  fn condition(&self) -> String {
    self.conditions.join(" AND ")
  }
}

/// The companies the reader looks through, in name order.
async fn companies<C: ConnectionTrait>(db: &C, reader: &Reader) -> Result<Vec<UnitRef>, Refusal> {
  let sql = format!(
    r#"SELECT o."id", o."name" FROM "organizations" o WHERE o."id" IN ({}) ORDER BY o."name", o."id""#,
    looked_through()
  );
  let rows = all(db, &sql, vec![shown(reader.user).into(), reader.administrator.into()]).await?;

  rows.iter().map(unit_ref).collect()
}

fn unit_ref(row: &QueryResult) -> Result<UnitRef, Refusal> {
  Ok(UnitRef {
    id: i64::from(row.try_get::<i32>("", "id")?),
    name: row.try_get("", "name")?,
  })
}

/// The companies the reader looks through, refused where they look through none.
async fn looked_after<C: ConnectionTrait>(db: &C, reader: &Reader) -> Result<Vec<UnitRef>, Refusal> {
  let companies = companies(db, reader).await?;

  if companies.is_empty() && !reader.administrator {
    return Err(Refusal::forbidden(
      "the roster is read by the administrator and by a head of a company's own unit",
    ));
  }

  Ok(companies)
}

/// What a page is asked for, as the query string carries it; an empty field asks for nothing.
#[derive(Debug, Default, Deserialize)]
pub struct PageAsk {
  q: Option<String>,
  company: Option<String>,
  unit: Option<String>,
  kind: Option<String>,
  role: Option<String>,
  state: Option<String>,
  after: Option<String>,
  limit: Option<String>,
}

fn given(field: &Option<String>) -> Option<&str> {
  field.as_deref().map(str::trim).filter(|value| !value.is_empty())
}

fn number<T: std::str::FromStr>(field: &Option<String>, what: &str) -> Result<Option<T>, Refusal> {
  given(field)
    .map(|value| value.parse().map_err(|_| Refusal::bad(format!("`{value}` is no {what}"))))
    .transpose()
}

/// The place past the last person of a page: their name as the roster sorts it and their user id.
fn cursor(sort_name: &str, user: i32) -> String {
  URL_SAFE_NO_PAD.encode(format!("{user}:{sort_name}"))
}

fn place(after: &str) -> Result<(String, i32), Refusal> {
  let refused = || Refusal::bad("`after` names no place in the roster");
  let bytes = URL_SAFE_NO_PAD.decode(after).map_err(|_| refused())?;
  let text = String::from_utf8(bytes).map_err(|_| refused())?;
  let (user, sort_name) = text.split_once(':').ok_or_else(refused)?;

  Ok((sort_name.to_owned(), user.parse().map_err(|_| refused())?))
}

fn state_of(text: &str) -> Option<RosterState> {
  match text {
    "active" => Some(RosterState::Active),
    "pending" => Some(RosterState::Pending),
    "left" => Some(RosterState::Left),
    _ => None,
  }
}

/// One row as a page answers it to the reader: the email for the administrator alone.
async fn person_of<C: ConnectionTrait>(
  db: &C,
  reader: &Reader,
  row: &QueryResult,
) -> Result<RosterPerson, Refusal> {
  let user: i32 = row.try_get("", "id")?;
  let state: String = row.try_get("", "state")?;
  let rank: String = row.try_get("", "rank")?;
  let role = role_of(row)?;
  let kept: String = row.try_get("", "job_title")?;
  let post = match row.try_get::<Option<i64>>("", "post_id")? {
    Some(id) => Some(UnitRef {
      id,
      name: one(db, r#"SELECT "name" FROM "organizations" WHERE "id" = $1::bigint"#, vec![id.into()])
        .await?
        .map(|row| row.try_get::<String>("", "name"))
        .transpose()?
        .unwrap_or_default(),
    }),
    None => None,
  };

  Ok(RosterPerson {
    user: shown(user),
    login: row.try_get("", "username")?,
    name: row.try_get("", "name")?,
    company: UnitRef {
      id: i64::from(row.try_get::<i32>("", "company_id")?),
      name: row.try_get("", "company_name")?,
    },
    unit: UnitRef {
      id: i64::from(row.try_get::<i32>("", "unit_id")?),
      name: row.try_get("", "unit_name")?,
    },
    head: row.try_get("", "head")?,
    acting: row.try_get("", "acting")?,
    administrator: Authz::is_superuser(&user_subject(db, user).await?, db).await?,
    state: state_of(&state).ok_or_else(|| {
      Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("`{state}` is no account's state"))
    })?,
    machine: row.try_get("", "agent")?,
    made_at: row.try_get("", "made_at")?,
    last_sign_in_at: row.try_get("", "signed_in_at")?,
    job_title: crate::lang::job_titles::shown(&rank, role.as_ref().map(|role| role.name.as_str()), &kept),
    rank,
    role,
    duty: row.try_get("", "duty")?,
    post,
    email: reader.administrator.then(|| row.try_get::<String>("", "email")).transpose()?,
  })
}

/// One page of the people the reader looks through, as `ask` narrows them.
async fn page<C: ConnectionTrait>(db: &C, reader: &Reader, ask: &PageAsk) -> Result<RosterPage, Refusal> {
  let companies = looked_after(db, reader).await?;
  let looks_through = |company: i32| companies.iter().any(|one| one.id == i64::from(company));
  let limit = number::<i64>(&ask.limit, "number of people")?
    .unwrap_or(DEFAULT_LIMIT)
    .clamp(1, MAX_LIMIT);
  let after = given(&ask.after).map(place).transpose()?;
  let mut statement = Ask::of(reader);

  if let Some(words) = given(&ask.q) {
    let words = statement.bind(words.to_owned());
    // The contact details answer the administrator's words alone, so a refused field is no answer either.
    let contact = if reader.administrator {
      format!(
        r#"OR strpos(lower(COALESCE(p."landline", '')), lower({words})) > 0
           OR strpos(lower(COALESCE(p."mobile", '')), lower({words})) > 0
           OR strpos(lower(COALESCE(p."email", '')), lower({words})) > 0
           OR strpos(lower(COALESCE(u."email", '')), lower({words})) > 0"#
      )
    } else {
      String::new()
    };

    statement.and(format!(
      r#"(strpos(lower(u."username"), lower({words})) > 0
          OR strpos(lower(COALESCE(u."full_name", '')), lower({words})) > 0
          OR strpos(lower(o."name"), lower({words})) > 0
          OR strpos(lower(COALESCE(p."job_title", '')), lower({words})) > 0
          OR strpos(lower(COALESCE(p."rank", '')), lower({words})) > 0
          OR strpos(lower(COALESCE(p."duty", '')), lower({words})) > 0
          OR strpos(lower(COALESCE(r."name", '')), lower({words})) > 0
          {contact})"#
    ));
  }

  if let Some(company) = number::<i32>(&ask.company, "company's number")? {
    if !looks_through(company) {
      return Err(Refusal::absent(format!("no company {company} the reader looks through")));
    }

    let company = statement.bind(company);
    statement.and(format!(r#"c."id" = {company}"#));
  }

  let mut narrowing = Narrowing(Vec::new());

  if let Some(unit) = number::<i32>(&ask.unit, "unit's number")? {
    if !company_of(db, unit).await?.is_some_and(looks_through) {
      return Err(Refusal::absent(format!("no unit {unit} the reader looks through")));
    }

    let unit = statement.bind(unit);
    narrowing.0.push(format!(
      r#"{{x}} IN (SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = {unit})"#
    ));
  }

  if let Some(kind) = given(&ask.kind) {
    let kind = statement.bind(kind.to_owned());
    narrowing.0.push(format!(
      r#"{{x}} IN (SELECT a."unit_id" FROM "unit_attributes" a JOIN "unit_kinds" k ON k."id" = a."kind_id"
                   WHERE k."key" = {kind})"#
    ));
  }

  if let Some(counts) = narrowing.counts() {
    statement.and(counts);
  }

  match given(&ask.role) {
    None => {}
    Some("head") => statement.and(head()),
    Some("member") => statement.and(format!("NOT {}", head())),
    Some(other) => return Err(Refusal::bad(format!("`{other}` is no role: `head` or `member`"))),
  }

  if let Some(state) = given(&ask.state) {
    if state_of(state).is_none() {
      return Err(Refusal::bad(format!("`{state}` is no state: `active`, `pending` or `left`")));
    }

    let state = statement.bind(state.to_owned());
    statement.and(format!("({STATE}) = {state}"));
  }

  let counted = format!(r#"SELECT count(*) AS "total" {FROM} WHERE {}"#, statement.condition());
  let total: i64 = one(db, &counted, statement.values.clone())
    .await?
    .map(|row| row.try_get("", "total"))
    .transpose()?
    .unwrap_or_default();

  if let Some((sort_name, user)) = after {
    let sort_name = statement.bind(sort_name);
    let user = statement.bind(user);
    statement.and(format!(r#"(lower({NAME}), u."id") > ({sort_name}, {user})"#));
  }

  let bound = statement.bind(limit + 1);
  let sql = format!(
    r#"SELECT {columns} {FROM} WHERE {condition} ORDER BY lower({NAME}), u."id" LIMIT {bound}"#,
    columns = columns(&narrowing.post()),
    condition = statement.condition(),
  );
  let mut rows = all(db, &sql, statement.values).await?;
  let more = rows.len() as i64 > limit;

  rows.truncate(limit as usize);

  let next = match rows.last() {
    Some(last) if more => Some(cursor(&last.try_get::<String>("", "sort_name")?, last.try_get("", "id")?)),
    _ => None,
  };
  let mut people = Vec::with_capacity(rows.len());

  for row in &rows {
    people.push(person_of(db, reader, row).await?);
  }

  Ok(RosterPage {
    people,
    total,
    next,
  })
}

/// One person the reader looks through, opened.
async fn detail<C: ConnectionTrait>(db: &C, reader: &Reader, user: i32) -> Result<RosterDetail, Refusal> {
  looked_after(db, reader).await?;

  let mut statement = Ask::of(reader);
  let bound = statement.bind(user);

  statement.and(format!(r#"u."id" = {bound}"#));

  let sql = format!(
    r#"SELECT {columns},
         COALESCE(p."landline", '') AS "landline",
         COALESCE(p."mobile", '') AS "mobile",
         n."shared", n."proven_at", d."left_at", d."left_by",
         COALESCE(NULLIF(lb."full_name", ''), lb."username", '') AS "left_by_name"
       {FROM}
       LEFT JOIN "users" lb ON lb."id" = d."left_by"
       WHERE {condition}"#,
    columns = columns("NULL"),
    condition = statement.condition(),
  );
  let row = one(db, &sql, statement.values).await?.ok_or_else(|| {
    Refusal::absent(format!("no person {user} stands in a company the reader looks through"))
  })?;
  let person = person_of(db, reader, &row).await?;
  let contact = |column: &str| -> Result<Option<String>, Refusal> {
    Ok(reader.administrator.then(|| row.try_get::<String>("", column)).transpose()?)
  };
  let left = match row.try_get::<Option<i64>>("", "left_at")? {
    Some(at) => Some(RosterLeft {
      at,
      by: row.try_get::<i64>("", "left_by")?.to_string(),
      by_name: row.try_get("", "left_by_name")?,
    }),
    None => None,
  };
  let machine_standing = match person.machine.clone() {
    Some(name) => Some(RosterMachine {
      name,
      shared: row.try_get("", "shared")?,
      proven_at: row.try_get("", "proven_at")?,
    }),
    None => None,
  };
  let unit =
    i32::try_from(person.unit.id).map_err(|_| Refusal::bad("the unit's number is out of range"))?;

  Ok(RosterDetail {
    landline: contact("landline")?,
    mobile: contact("mobile")?,
    path: path_of(db, unit).await?,
    head_of: head_of(db, user).await?,
    acting_for: crate::acting::acting_for(db, user).await?,
    posts: crate::posts::posts_of(db, user).await?,
    history: crate::history::of(db, user).await?,
    left,
    machine_standing,
    person,
  })
}

/// The units a user is granted head of directly, in name order.
async fn head_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<UnitRef>, Refusal> {
  let rows = all(
    db,
    r#"SELECT DISTINCT o."id", o."name"
       FROM "relation_tuples" t
       JOIN "organizations" o ON o."id"::text = t."resource_id"
       WHERE t."resource_type" = $1 AND t."relation" = $2
         AND t."subject_type" = 'user' AND t."subject_id" = $3 AND t."subject_relation" = ''
         AND (t."expires_at" IS NULL OR t."expires_at" > now())
       ORDER BY o."name", o."id""#,
    vec![UNIT.into(), HEAD_GRANT.into(), shown(user).into()],
  )
  .await?;

  rows.iter().map(unit_ref).collect()
}

/// `GET /people/companies`: the companies the reader looks through.
async fn companies_route(State(service): State<Service>, headers: HeaderMap) -> Answer<RosterCompanies> {
  let reader = reader(&service.db, &headers).await?;

  Ok(Json(RosterCompanies {
    companies: companies(&service.db, &reader).await?,
  }))
}

/// `GET /people`: one page of the roster.
async fn page_route(
  State(service): State<Service>,
  Query(ask): Query<PageAsk>,
  headers: HeaderMap,
) -> Answer<RosterPage> {
  let reader = reader(&service.db, &headers).await?;

  Ok(Json(page(&service.db, &reader, &ask).await?))
}

/// `GET /people/{user}`: one person of the roster.
async fn person_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<RosterDetail> {
  let reader = reader(&service.db, &headers).await?;
  let user = user_in(&user)?;

  Ok(Json(detail(&service.db, &reader, user).await?))
}
