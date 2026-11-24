//! A person's BMO profile (docs/accounts.md, 「A person's BMO profile」; docs/boundary.md, 「BMO profiles」): each
//! company's default for its people's BMOs, each person's own, and the permission to personalise one's BMO set on
//! a unit or a person. The profile standing for a person takes each part from their own where they may
//! personalise and it is set, then from their company's default where it is set, then from the deployment.
//!
//! Every route takes the login it is made for in `Owner-Key` and `Owner-Role`, as the profile's routes do.

use std::collections::HashMap;

use axum::Json;
use axum::Router;
use axum::body::Bytes;
use axum::extract::rejection::{BytesRejection, FailedToBufferBody};
use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use bmo_web_client::{
  AgentCallNames, AgentName, AgentPermissionAsk, AgentPermissionPerson, AgentPermissionUnit,
  AgentPermissions, AgentPersona, AgentPicture, AgentProfile, AgentSetting, AgentSource, ChainKind,
  ChainLevel, ChainMode, ChainPersonWriter, ChainShape, CompanyAgent, CompanyAgentAsk, OWNER_KEY,
  OWNER_ROLE, OwnAgent, OwnAgentAsk, UnitRef,
};
use sea_orm::{ConnectionTrait, QueryResult, Value};
use sumida::api::authz::Authz;

use crate::chain::{self, Link, Subject};
use crate::ids::shown;
use crate::profiles::ADMINISTRATOR;
use crate::routes::{Answer, Body, user_in};
use crate::units::{company_of, heads, path_of, unit_of_user};
use crate::users::user_subject;
use crate::{Refusal, Service, all, now_ms, one, run};

/// The most bytes a picture may hold.
pub const PICTURE_MOST: usize = 10 * 1024 * 1024;
/// The most characters a name or a call name may hold.
pub const NAME_MOST: usize = 40;
/// The most call names a profile may hold.
pub const CALL_NAMES_MOST: usize = 10;
/// The most characters a persona may hold: the agency's ceiling for a supervisor's persona.
pub const PERSONA_MOST: usize = 100_000;

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/companies/{company}/agent", get(company_route).put(set_company_route))
    .route("/platform/agent", get(platform_route).put(set_platform_route))
    .route(
      "/companies/{company}/agent/picture",
      get(company_picture_route)
        .put(set_company_picture_route)
        .delete(drop_company_picture_route)
        .layer(DefaultBodyLimit::max(PICTURE_MOST)),
    )
    .route("/users/{user}/agent", get(profile_route).put(set_own_route))
    .route(
      "/users/{user}/agent/picture",
      get(profile_picture_route)
        .put(set_own_picture_route)
        .delete(drop_own_picture_route)
        .layer(DefaultBodyLimit::max(PICTURE_MOST)),
    )
    .route("/users/{user}/agent-permission", put(set_user_permission_route))
    .route("/units/{unit}/agent-permission", put(set_unit_permission_route))
    .route("/units/{unit}/agent-permissions", get(permissions_route))
}

// ---------------------------------------------------------------------------------------------------------
// Who calls

/// The login a call is made for: its user, where the call names one, and whether it is made as the
/// administrator.
struct Caller {
  user: Option<i32>,
  administrator: bool,
}

fn caller(headers: &HeaderMap) -> Caller {
  let user = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok());
  let administrator = headers.get(OWNER_ROLE).and_then(|value| value.to_str().ok()) == Some(ADMINISTRATOR);

  Caller {
    user,
    administrator,
  }
}

/// Whether the caller is the administrator or a head of the unit.
async fn heads_unit<C: ConnectionTrait>(db: &C, caller: &Caller, unit: i32) -> Result<bool, Refusal> {
  if caller.administrator {
    return Ok(true);
  }

  match caller.user {
    Some(user) if unit_of_user(db, user).await?.is_some() => heads(db, user, unit).await,
    _ => Ok(false),
  }
}

/// Whether the caller is the administrator or anyone of the company.
async fn of_company<C: ConnectionTrait>(db: &C, caller: &Caller, company: i32) -> Result<bool, Refusal> {
  if caller.administrator {
    return Ok(true);
  }

  let Some(user) = caller.user else {
    return Ok(false);
  };
  let Some(unit) = unit_of_user(db, user).await? else {
    return Ok(false);
  };

  Ok(company_of(db, unit).await? == Some(company))
}

/// Whether the caller is the user themselves, the administrator, or a head of the user's unit.
async fn reads_profile<C: ConnectionTrait>(
  db: &C,
  caller: &Caller,
  user: i32,
  unit: i32,
) -> Result<bool, Refusal> {
  Ok(caller.user == Some(user) || heads_unit(db, caller, unit).await?)
}

/// A company named in a path: a unit with no parent, which stands.
async fn company_in<C: ConnectionTrait>(db: &C, path: &str) -> Result<i32, Refusal> {
  let company: i32 = path.parse().map_err(|_| Refusal::bad(format!("`{path}` is no company's number")))?;
  let row = one(
    db,
    r#"SELECT "parent_id" FROM "organizations" WHERE "id" = $1::bigint"#,
    vec![company.into()],
  )
  .await?;

  match row {
    Some(row) if row.try_get::<Option<i32>>("", "parent_id")?.is_none() => Ok(company),
    _ => Err(Refusal::absent(format!("no company {company}"))),
  }
}

/// A unit named in a path, which stands.
async fn unit_in<C: ConnectionTrait>(db: &C, path: &str) -> Result<i32, Refusal> {
  let unit: i32 = path.parse().map_err(|_| Refusal::bad(format!("`{path}` is no unit's number")))?;

  one(db, r#"SELECT "id" FROM "organizations" WHERE "id" = $1::bigint"#, vec![unit.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;

  Ok(unit)
}

/// A user named in a path, which stands, and the unit they stand in.
async fn person_in<C: ConnectionTrait>(db: &C, path: &str) -> Result<(i32, i32), Refusal> {
  let user = user_in(path)?;
  let unit = unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok((user, unit))
}

// ---------------------------------------------------------------------------------------------------------
// The values a profile holds

fn out_of_shape(why: String) -> Refusal {
  Refusal::bad(why).coded("bad-agent-profile")
}

fn one_line(text: &str) -> bool {
  !text.contains(['\n', '\r'])
}

/// A name as kept: trimmed, an empty one none, and one line of at most 40 characters.
pub fn name_of(name: Option<&str>) -> Result<Option<String>, Refusal> {
  let name = name.map(str::trim).unwrap_or_default();

  if name.is_empty() {
    return Ok(None);
  }
  if !one_line(name) || name.chars().count() > NAME_MOST {
    return Err(out_of_shape(format!("the name is not one line of 1 to {NAME_MOST} characters")));
  }

  Ok(Some(name.to_owned()))
}

/// Call names as kept: each trimmed, one line of 1 to 40 characters with no comma, at most 10 of them, and no
/// two the same but for case.
pub fn call_names_of(names: &[String]) -> Result<Vec<String>, Refusal> {
  if names.len() > CALL_NAMES_MOST {
    return Err(out_of_shape(format!("the call names are more than {CALL_NAMES_MOST}")));
  }

  let mut kept: Vec<String> = Vec::with_capacity(names.len());

  for name in names {
    let name = name.trim();

    if name.is_empty() || !one_line(name) || name.contains(',') || name.chars().count() > NAME_MOST {
      return Err(out_of_shape(format!(
        "the call name `{name}` is not one line of 1 to {NAME_MOST} characters with no comma"
      )));
    }
    if kept.iter().any(|one| one.to_lowercase() == name.to_lowercase()) {
      return Err(out_of_shape(format!("the call name `{name}` is named twice")));
    }

    kept.push(name.to_owned());
  }

  Ok(kept)
}

/// A persona as kept: an empty one none, and at most 100,000 characters.
pub fn persona_of(persona: Option<&str>) -> Result<Option<String>, Refusal> {
  let Some(persona) = persona.filter(|persona| !persona.trim().is_empty()) else {
    return Ok(None);
  };

  if persona.chars().count() > PERSONA_MOST {
    return Err(out_of_shape(format!("the persona is longer than {PERSONA_MOST} characters")));
  }

  Ok(Some(persona.to_owned()))
}

/// The type of a picture's bytes, read off their first bytes: a PNG, JPEG, WebP or GIF, or none.
pub fn picture_type(bytes: &[u8]) -> Option<&'static str> {
  if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
    Some("image/png")
  } else if bytes.starts_with(b"\xff\xd8\xff") {
    Some("image/jpeg")
  } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
    Some("image/gif")
  } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
    Some("image/webp")
  } else {
    None
  }
}

/// A picture sent as the request's body, with its type; refused where it is no picture or larger than 10 MB.
fn picture_in(body: Result<Bytes, BytesRejection>) -> Result<(Vec<u8>, &'static str), Refusal> {
  let bytes = body.map_err(|why| match why {
    BytesRejection::FailedToBufferBody(FailedToBufferBody::LengthLimitError(_)) => {
      Refusal::new(StatusCode::PAYLOAD_TOO_LARGE, format!("a picture holds at most {PICTURE_MOST} bytes"))
        .coded("picture-too-large")
    }
    other => Refusal::bad(format!("the picture does not read: {}", other.body_text())),
  })?;
  let kind = picture_type(&bytes).ok_or_else(|| {
    Refusal::bad("the bytes are no PNG, JPEG, WebP or GIF picture").coded("not-a-picture")
  })?;

  Ok((bytes.to_vec(), kind))
}

/// A picture's bytes answered with their type.
fn picture_answer(bytes: Vec<u8>, kind: String) -> Response {
  ([(header::CONTENT_TYPE, kind)], bytes).into_response()
}

/// Call names as a statement binds them: a JSON array, which the statement reads into the column's array.
fn bound_names(names: &[String]) -> Value {
  serde_json::to_string(names).unwrap_or_else(|_| "[]".to_owned()).into()
}

/// The call names a writing statement binds as its third value, read into a text array in their order.
const BOUND_NAMES: &str = r#"ARRAY(SELECT "name" FROM jsonb_array_elements_text($3::text::jsonb)
  WITH ORDINALITY AS "named" ("name", "at") ORDER BY "at")"#;

/// The call names a row holds, read through the JSON the statement made of them.
fn names_in(row: &QueryResult) -> Result<Vec<String>, Refusal> {
  let text: String = row.try_get("", "call_names")?;

  serde_json::from_str(&text)
    .map_err(|why| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the call names: {why}")))
}

// ---------------------------------------------------------------------------------------------------------
// A company's default

/// The kinds an organisation's default for its people's BMOs stands as on the delegation chain (docs/accounts.md,
/// 「A person's BMO profile」): the name, the names that call it, and whether the link keeps a picture, each
/// resolved nearest first down a person's units, set at a unit by its heads and locked there for the units below.
pub fn default_kinds() -> [ChainKind; 3] {
  let kind = |key: &str, description: &str, shape: ChainShape| ChainKind {
    key: key.to_owned(),
    declared_by: crate::UNIT.to_owned(),
    description: description.to_owned(),
    shape,
    choices: vec![],
    mode: ChainMode::Nearest,
    default: None,
    rules: false,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit],
    unit_permission: crate::units::HEADS.to_owned(),
    person_writer: ChainPersonWriter::Heads,
  };

  [
    kind(
      NAME_KIND,
      "The name the BMOs of the people here are called by, where they set none of their own.",
      ChainShape::Text,
    ),
    kind(
      CALL_NAMES_KIND,
      "The names that call the BMOs of the people here in a room, where they set none of their own.",
      ChainShape::Json,
    ),
    kind(
      PICTURE_KIND,
      "Whether the BMOs of the people here show the picture this link keeps, where they set none of their own.",
      ChainShape::Flag,
    ),
  ]
}

/// The default's name on the chain.
pub const NAME_KIND: &str = "agent-profile.name";
/// The default's call names on the chain, a list judged here.
pub const CALL_NAMES_KIND: &str = "agent-profile.call-names";
/// Whether a link's own picture stands as the default; the bytes are kept beside the chain by the unit.
pub const PICTURE_KIND: &str = "agent-profile.picture";

fn default_kind(key: &str) -> ChainKind {
  default_kinds()
    .into_iter()
    .find(|kind| kind.key == key)
    .expect("a default kind is declared")
}

/// A unit's own default as its links hold it, every part empty where none is set.
pub async fn company_agent<C: ConnectionTrait>(db: &C, company: i32) -> Result<CompanyAgent, Refusal> {
  link_agent(db, Link::Unit(company)).await
}

/// A link's own default as it holds it, every part empty where none is set: a company's, or the platform's, which
/// keeps no picture.
async fn link_agent<C: ConnectionTrait>(db: &C, link: Link) -> Result<CompanyAgent, Refusal> {
  let name = chain::value_at(db, NAME_KIND, link).await?;
  let call_names = chain::value_at(db, CALL_NAMES_KIND, link).await?;
  let picture = chain::value_at(db, PICTURE_KIND, link).await?;

  Ok(CompanyAgent {
    name: name.and_then(|name| name.as_str().map(str::to_owned)),
    call_names: listed_names(call_names.as_ref()),
    picture: picture.and_then(|on| on.as_bool()).unwrap_or(false),
  })
}

/// The call names a value of the chain holds, none where it holds no list of texts.
fn listed_names(value: Option<&serde_json::Value>) -> Vec<String> {
  value
    .and_then(serde_json::Value::as_array)
    .map(|names| names.iter().filter_map(|name| name.as_str().map(str::to_owned)).collect())
    .unwrap_or_default()
}

async fn set_company_agent<C: ConnectionTrait>(
  db: &C,
  company: i32,
  by: Option<i32>,
  ask: &CompanyAgentAsk,
) -> Result<(), Refusal> {
  set_link_agent(db, Link::Unit(company), by, ask).await
}

/// A link's own name and call names written, a company's or the platform's.
async fn set_link_agent<C: ConnectionTrait>(
  db: &C,
  link: Link,
  by: Option<i32>,
  ask: &CompanyAgentAsk,
) -> Result<(), Refusal> {
  let name = name_of(ask.name.as_deref())?;
  let call_names = call_names_of(&ask.call_names)?;
  let names = (!call_names.is_empty()).then(|| serde_json::json!(call_names));

  chain::put_value(db, &default_kind(NAME_KIND), link, name.map(serde_json::Value::from).as_ref(), by)
    .await?;
  chain::put_value(db, &default_kind(CALL_NAMES_KIND), link, names.as_ref(), by).await
}

async fn set_company_picture<C: ConnectionTrait>(
  db: &C,
  company: i32,
  by: Option<i32>,
  picture: Option<(Vec<u8>, &'static str)>,
) -> Result<(), Refusal> {
  let kept = picture.is_some();

  match picture {
    Some((bytes, kind)) => {
      run(
        db,
        r#"INSERT INTO "company_agents" ("company_id", "picture", "picture_type", "set_by", "set_at")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("company_id") DO UPDATE SET
             "picture" = $2, "picture_type" = $3, "set_by" = $4, "set_at" = $5"#,
        vec![company.into(), bytes.into(), kind.into(), by.into(), now_ms().into()],
      )
      .await?;
    }
    None => {
      run(db, r#"DELETE FROM "company_agents" WHERE "company_id" = $1"#, vec![company.into()]).await?;
    }
  }

  let on = kept.then_some(serde_json::Value::Bool(true));

  chain::put_value(db, &default_kind(PICTURE_KIND), Link::Unit(company), on.as_ref(), by).await
}

/// The bytes of a picture a row keeps, with their type.
async fn picture_kept<C: ConnectionTrait>(
  db: &C,
  sql: &str,
  key: i32,
) -> Result<Option<(Vec<u8>, String)>, Refusal> {
  let Some(row) = one(db, sql, vec![key.into()]).await? else {
    return Ok(None);
  };
  let bytes: Option<Vec<u8>> = row.try_get("", "picture")?;
  let kind: Option<String> = row.try_get("", "picture_type")?;

  Ok(bytes.zip(kind))
}

const COMPANY_PICTURE: &str =
  r#"SELECT "picture", "picture_type" FROM "company_agents" WHERE "company_id" = $1"#;
const OWN_PICTURE: &str = r#"SELECT "picture", "picture_type" FROM "own_agents" WHERE "user_id" = $1"#;

// ---------------------------------------------------------------------------------------------------------
// A person's own, and the permission to use it

/// A person's own parts as kept, whether or not they may use them.
pub async fn own_agent<C: ConnectionTrait>(db: &C, user: i32) -> Result<OwnAgent, Refusal> {
  let row = one(
    db,
    r#"SELECT "name", array_to_json("call_names")::text AS "call_names", "persona",
         "picture" IS NOT NULL AS "has_picture"
       FROM "own_agents" WHERE "user_id" = $1"#,
    vec![user.into()],
  )
  .await?;

  let Some(row) = row else {
    return Ok(OwnAgent::default());
  };

  Ok(OwnAgent {
    name: row.try_get("", "name")?,
    call_names: names_in(&row)?,
    persona: row.try_get("", "persona")?,
    picture: row.try_get("", "has_picture")?,
  })
}

async fn set_own_agent<C: ConnectionTrait>(db: &C, user: i32, ask: &OwnAgentAsk) -> Result<(), Refusal> {
  let name = name_of(ask.name.as_deref())?;
  let call_names = call_names_of(&ask.call_names)?;
  let persona = persona_of(ask.persona.as_deref())?;

  run(
    db,
    &format!(
      r#"INSERT INTO "own_agents" ("user_id", "name", "call_names", "persona", "set_at")
         VALUES ($1, $2, {BOUND_NAMES}, $4, $5)
         ON CONFLICT ("user_id") DO UPDATE SET
           "name" = $2, "call_names" = EXCLUDED."call_names", "persona" = $4, "set_at" = $5"#
    ),
    vec![user.into(), name.into(), bound_names(&call_names), persona.into(), now_ms().into()],
  )
  .await?;

  Ok(())
}

async fn set_own_picture<C: ConnectionTrait>(
  db: &C,
  user: i32,
  picture: Option<(Vec<u8>, &'static str)>,
) -> Result<(), Refusal> {
  let (bytes, kind) = match picture {
    Some((bytes, kind)) => (Some(bytes), Some(kind.to_owned())),
    None => (None, None),
  };

  run(
    db,
    r#"INSERT INTO "own_agents" ("user_id", "picture", "picture_type", "set_at")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("user_id") DO UPDATE SET "picture" = $2, "picture_type" = $3, "set_at" = $4"#,
    vec![user.into(), bytes.into(), kind.into(), now_ms().into()],
  )
  .await?;

  Ok(())
}

/// The setting a row of the permissions keeps, `inherit` where there is none.
fn setting_of(allowed: Option<bool>) -> AgentSetting {
  match allowed {
    Some(true) => AgentSetting::Allow,
    Some(false) => AgentSetting::Deny,
    None => AgentSetting::Inherit,
  }
}

/// The kind the permission to personalise one's BMO stands as on the delegation chain (docs/accounts.md, 「A
/// person's BMO profile」): a flag resolved nearest first, set on units and people by their heads, withheld where
/// nothing is set.
pub fn personalize_kind() -> ChainKind {
  ChainKind {
    key: "agent-profile.personalize".to_owned(),
    declared_by: crate::UNIT.to_owned(),
    description:
      "Whether a person may personalise their own BMO: its name, call names, picture and persona."
        .to_owned(),
    shape: ChainShape::Flag,
    choices: vec![],
    mode: ChainMode::Nearest,
    default: Some(serde_json::Value::Bool(false)),
    rules: false,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit, ChainLevel::Person],
    unit_permission: crate::units::HEADS.to_owned(),
    person_writer: ChainPersonWriter::Heads,
  }
}

/// A stored flag read as a setting's own value, none where the link follows above.
fn flag_of(value: Option<serde_json::Value>) -> Option<bool> {
  value.and_then(|value| value.as_bool())
}

/// What a unit resolves to: the nearest setting on it or on a unit above it, up to the company, a lock above
/// standing over what lies below it; withheld where none of them is set.
pub async fn unit_allows<C: ConnectionTrait>(db: &C, unit: i32) -> Result<bool, Refusal> {
  let (_, resolved) = chain::resolve(db, &personalize_kind(), Subject::Unit(unit)).await?;

  Ok(flag_of(resolved.value).unwrap_or(false))
}

async fn is_administrator<C: ConnectionTrait>(db: &C, user: i32) -> Result<bool, Refusal> {
  Ok(Authz::is_superuser(&user_subject(db, user).await?, db).await?)
}

/// Whether a person standing in `unit` may personalise their BMO: always for a platform administrator, else as the
/// chain resolves for them, their own setting first.
pub async fn may_personalize<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<bool, Refusal> {
  if is_administrator(db, user).await? {
    return Ok(true);
  }

  let kind = personalize_kind();
  let path = chain::Path::of_person(chain::units_down_to(db, unit).await?, user);
  let held = chain::entries(db, &kind.key, Some(&path.links)).await?;

  Ok(flag_of(chain::resolve_on(&kind, &path, &held, &[]).value).unwrap_or(false))
}

async fn set_permission<C: ConnectionTrait>(
  db: &C,
  link: Link,
  by: Option<i32>,
  setting: AgentSetting,
) -> Result<(), Refusal> {
  let value = match setting {
    AgentSetting::Allow => Some(serde_json::Value::Bool(true)),
    AgentSetting::Deny => Some(serde_json::Value::Bool(false)),
    AgentSetting::Inherit => None,
  };

  chain::put_value(db, &personalize_kind(), link, value.as_ref(), by).await
}

// ---------------------------------------------------------------------------------------------------------
// The profile standing for a person

/// What a person's profile is read from: whether they may personalise their BMO, their company, its default and
/// their own parts.
struct Standing {
  personalize: bool,
  company: Option<UnitRef>,
  default: CompanyAgent,
  /// The unit whose kept picture is the default's, where one is.
  picture_unit: Option<i32>,
  own: OwnAgent,
}

impl Standing {
  async fn of<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<Self, Refusal> {
    let personalize = may_personalize(db, user, unit).await?;
    let company = path_of(db, unit).await?.into_iter().next();
    let path = chain::Path::of_person(chain::units_down_to(db, unit).await?, user);
    let nearest = |key: &'static str| {
      let path = &path;

      async move {
        let kind = default_kind(key);
        let held = chain::entries(db, &kind.key, Some(&path.links)).await?;

        Ok::<_, Refusal>(chain::resolve_on(&kind, path, &held, &[]))
      }
    };
    let name = nearest(NAME_KIND).await?;
    let call_names = nearest(CALL_NAMES_KIND).await?;
    let picture = nearest(PICTURE_KIND).await?;
    let picture_unit = match (picture.value.as_ref().and_then(serde_json::Value::as_bool), picture.from) {
      (Some(true), Some(Link::Unit(unit))) => Some(unit),
      _ => None,
    };
    let default = CompanyAgent {
      name: name.value.as_ref().and_then(|name| name.as_str().map(str::to_owned)),
      call_names: listed_names(call_names.value.as_ref()),
      picture: picture_unit.is_some(),
    };
    let own = own_agent(db, user).await?;

    Ok(Self {
      personalize,
      company,
      default,
      picture_unit,
      own,
    })
  }

  /// Which picture stands: the person's own, their company's, or the deployment's.
  fn picture_from(&self) -> AgentSource {
    if self.personalize && self.own.picture {
      AgentSource::Own
    } else if self.default.picture {
      AgentSource::Company
    } else {
      AgentSource::Deployment
    }
  }

  /// The profile standing, each part by the one order.
  fn profile(self) -> AgentProfile {
    let Self {
      personalize,
      company,
      default,
      own,
      ..
    } = &self;
    let name = match (personalize, &own.name, &default.name) {
      (true, Some(name), _) => AgentName {
        from: AgentSource::Own,
        name: Some(name.clone()),
      },
      (_, _, Some(name)) => AgentName {
        from: AgentSource::Company,
        name: Some(name.clone()),
      },
      _ => AgentName {
        from: AgentSource::Deployment,
        name: None,
      },
    };
    let call_names = if *personalize && !own.call_names.is_empty() {
      AgentCallNames {
        from: AgentSource::Own,
        call_names: own.call_names.clone(),
      }
    } else if !default.call_names.is_empty() {
      AgentCallNames {
        from: AgentSource::Company,
        call_names: default.call_names.clone(),
      }
    } else {
      AgentCallNames {
        from: AgentSource::Deployment,
        call_names: Vec::new(),
      }
    };
    let persona = match (personalize, &own.persona) {
      (true, Some(persona)) => AgentPersona {
        from: AgentSource::Own,
        persona: Some(persona.clone()),
      },
      _ => AgentPersona {
        from: AgentSource::Deployment,
        persona: None,
      },
    };
    let picture = AgentPicture {
      from: self.picture_from(),
    };

    AgentProfile {
      personalize: *personalize,
      company: company.clone(),
      name,
      call_names,
      persona,
      picture,
      own: own.clone(),
    }
  }
}

/// The profile standing for a person who stands in `unit`.
pub async fn profile<C: ConnectionTrait>(db: &C, user: i32, unit: i32) -> Result<AgentProfile, Refusal> {
  Ok(Standing::of(db, user, unit).await?.profile())
}

/// The bytes of the picture standing for a person, none where the deployment's stands.
async fn profile_picture<C: ConnectionTrait>(
  db: &C,
  user: i32,
  unit: i32,
) -> Result<Option<(Vec<u8>, String)>, Refusal> {
  let standing = Standing::of(db, user, unit).await?;

  match standing.picture_from() {
    AgentSource::Own => picture_kept(db, OWN_PICTURE, user).await,
    AgentSource::Company => match standing.picture_unit {
      Some(unit) => picture_kept(db, COMPANY_PICTURE, unit).await,
      None => Ok(None),
    },
    AgentSource::Deployment => Ok(None),
  }
}

// ---------------------------------------------------------------------------------------------------------
// The routes

async fn company_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
) -> Answer<CompanyAgent> {
  let db = &service.db;
  let company = company_in(db, &company).await?;

  if !of_company(db, &caller(&headers), company).await? {
    return Err(Refusal::forbidden(
      "a company's default is read by the administrator or anyone of the company",
    ));
  }

  Ok(Json(company_agent(db, company).await?))
}

/// The company a change of its default names, once the caller is found to be the administrator or its head.
async fn company_set_by<C: ConnectionTrait>(db: &C, path: &str, caller: &Caller) -> Result<i32, Refusal> {
  let company = company_in(db, path).await?;

  if !heads_unit(db, caller, company).await? {
    return Err(Refusal::forbidden(
      "a company's default is set by the administrator or the company's heads",
    ));
  }

  Ok(company)
}

/// `GET /platform/agent`: the platform's own default, which every company setting none follows; any caller.
async fn platform_route(State(service): State<Service>) -> Answer<CompanyAgent> {
  Ok(Json(link_agent(&service.db, Link::Platform).await?))
}

/// `PUT /platform/agent`: the platform's own name and call names, the platform administrator's alone.
async fn set_platform_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<CompanyAgentAsk>,
) -> Answer<CompanyAgent> {
  let db = &service.db;
  let caller = caller(&headers);

  if !caller.administrator {
    return Err(Refusal::forbidden("the platform's default is set by the platform administrator"));
  }

  set_link_agent(db, Link::Platform, caller.user, &ask).await?;

  Ok(Json(link_agent(db, Link::Platform).await?))
}

async fn set_company_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<CompanyAgentAsk>,
) -> Answer<CompanyAgent> {
  let db = &service.db;
  let caller = caller(&headers);
  let company = company_set_by(db, &company, &caller).await?;

  set_company_agent(db, company, caller.user, &ask).await?;

  Ok(Json(company_agent(db, company).await?))
}

async fn company_picture_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
) -> Result<Response, Refusal> {
  let db = &service.db;
  let company = company_in(db, &company).await?;

  if !of_company(db, &caller(&headers), company).await? {
    return Err(Refusal::forbidden(
      "a company's default is read by the administrator or anyone of the company",
    ));
  }

  let (bytes, kind) = picture_kept(db, COMPANY_PICTURE, company)
    .await?
    .ok_or_else(|| Refusal::absent(format!("company {company} keeps no picture")))?;

  Ok(picture_answer(bytes, kind))
}

async fn set_company_picture_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
  body: Result<Bytes, BytesRejection>,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let caller = caller(&headers);
  let company = company_set_by(db, &company, &caller).await?;
  let picture = picture_in(body)?;

  set_company_picture(db, company, caller.user, Some(picture)).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn drop_company_picture_route(
  State(service): State<Service>,
  Path(company): Path<String>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let caller = caller(&headers);
  let company = company_set_by(db, &company, &caller).await?;

  set_company_picture(db, company, caller.user, None).await?;

  Ok(StatusCode::NO_CONTENT)
}

/// The person a read of a profile names, once the caller is found to be them, the administrator or a head of
/// their unit.
async fn profile_read_by<C: ConnectionTrait>(
  db: &C,
  path: &str,
  headers: &HeaderMap,
) -> Result<(i32, i32), Refusal> {
  let (user, unit) = person_in(db, path).await?;

  if !reads_profile(db, &caller(headers), user, unit).await? {
    return Err(Refusal::forbidden(
      "a BMO profile is read by its person, the administrator or a head of the person's unit",
    ));
  }

  Ok((user, unit))
}

/// The person a change of their own profile names, once the caller is found to be them and permitted.
async fn own_set_by<C: ConnectionTrait>(
  db: &C,
  path: &str,
  headers: &HeaderMap,
) -> Result<(i32, i32), Refusal> {
  let (user, unit) = person_in(db, path).await?;

  if caller(headers).user != Some(user) {
    return Err(Refusal::forbidden("a person's own BMO profile is set by the person themselves"));
  }
  if !may_personalize(db, user, unit).await? {
    return Err(
      Refusal::forbidden("the person may not personalise their BMO").coded("personalize-withheld"),
    );
  }

  Ok((user, unit))
}

async fn profile_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<AgentProfile> {
  let db = &service.db;
  let (user, unit) = profile_read_by(db, &user, &headers).await?;

  Ok(Json(profile(db, user, unit).await?))
}

async fn set_own_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<OwnAgentAsk>,
) -> Answer<AgentProfile> {
  let db = &service.db;
  let (user, unit) = own_set_by(db, &user, &headers).await?;

  set_own_agent(db, user, &ask).await?;

  Ok(Json(profile(db, user, unit).await?))
}

async fn profile_picture_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Result<Response, Refusal> {
  let db = &service.db;
  let (user, unit) = profile_read_by(db, &user, &headers).await?;
  let (bytes, kind) = profile_picture(db, user, unit)
    .await?
    .ok_or_else(|| Refusal::absent(format!("the deployment's picture stands for user {user}")))?;

  Ok(picture_answer(bytes, kind))
}

async fn set_own_picture_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  body: Result<Bytes, BytesRejection>,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let (user, _) = own_set_by(db, &user, &headers).await?;
  let picture = picture_in(body)?;

  set_own_picture(db, user, Some(picture)).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn drop_own_picture_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let (user, _) = own_set_by(db, &user, &headers).await?;

  set_own_picture(db, user, None).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn set_unit_permission_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<AgentPermissionAsk>,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let caller = caller(&headers);
  let unit = unit_in(db, &unit).await?;

  if !heads_unit(db, &caller, unit).await? {
    return Err(Refusal::forbidden(
      "a unit's permission is set by the administrator or a head of the unit",
    ));
  }

  set_permission(db, Link::Unit(unit), caller.user, ask.setting).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn set_user_permission_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(ask): Body<AgentPermissionAsk>,
) -> Result<StatusCode, Refusal> {
  let db = &service.db;
  let caller = caller(&headers);
  let (user, unit) = person_in(db, &user).await?;

  if !heads_unit(db, &caller, unit).await? {
    return Err(Refusal::forbidden(
      "a person's permission is set by the administrator or a head of the person's unit",
    ));
  }

  set_permission(db, Link::Person(user), caller.user, ask.setting).await?;

  Ok(StatusCode::NO_CONTENT)
}

/// The permission across a unit: the unit and every unit below it, each after its parent, and every person
/// standing in one of them, each with its own setting and what the chain resolves it to.
pub async fn permissions<C: ConnectionTrait>(db: &C, unit: i32) -> Result<AgentPermissions, Refusal> {
  let kind = personalize_kind();
  let held = chain::entries(db, &kind.key, None).await?;
  let rows = all(
    db,
    r#"SELECT o."id", o."name", o."parent_id",
         (SELECT string_agg(lpad(c."ancestor_id"::text, 10, '0'), '/' ORDER BY c."depth" DESC)
            FROM "org_closure" c WHERE c."descendant_id" = o."id") AS "place"
       FROM "organizations" o
       WHERE o."id" IN (SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = $1)
       ORDER BY "place""#,
    vec![unit.into()],
  )
  .await?;
  let own = |link: Link| flag_of(held.get(&link).and_then(|entry| entry.value.clone()));
  let mut paths: HashMap<i32, Vec<i32>> = HashMap::new();
  let mut units = Vec::with_capacity(rows.len());

  for row in &rows {
    let id: i32 = row.try_get("", "id")?;
    let parent: Option<i32> = row.try_get("", "parent_id")?;
    // Every unit comes after its parent, so a unit below the asked one stands on its parent's path; the asked
    // unit's path is read from the tree.
    let path = match parent.and_then(|parent| paths.get(&parent)) {
      Some(above) => above.iter().copied().chain(std::iter::once(id)).collect(),
      None => chain::units_down_to(db, id).await?,
    };
    let allowed = flag_of(chain::resolve_on(&kind, &chain::Path::of_units(path.clone()), &held, &[]).value)
      .unwrap_or(false);

    paths.insert(id, path);
    units.push(AgentPermissionUnit {
      id: i64::from(id),
      name: row.try_get("", "name")?,
      parent: parent.map(i64::from),
      setting: setting_of(own(Link::Unit(id))),
      allowed,
    });
  }

  let rows = all(
    db,
    r#"SELECT u."id", COALESCE(NULLIF(u."full_name", ''), u."username") AS "name", u."organization_id"
       FROM "users" u
       WHERE u."organization_id" IN (SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = $1)
       ORDER BY lower(COALESCE(NULLIF(u."full_name", ''), u."username")), u."id""#,
    vec![unit.into()],
  )
  .await?;
  let mut people = Vec::with_capacity(rows.len());

  for row in &rows {
    let user: i32 = row.try_get("", "id")?;
    let stands_in: i32 = row.try_get("", "organization_id")?;
    let path = chain::Path::of_person(paths.get(&stands_in).cloned().unwrap_or_default(), user);
    let allowed = is_administrator(db, user).await?
      || flag_of(chain::resolve_on(&kind, &path, &held, &[]).value).unwrap_or(false);

    people.push(AgentPermissionPerson {
      user: shown(user),
      name: row.try_get("", "name")?,
      unit: i64::from(stands_in),
      setting: setting_of(own(Link::Person(user))),
      allowed,
    });
  }

  Ok(AgentPermissions { units, people })
}

async fn permissions_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
) -> Answer<AgentPermissions> {
  let db = &service.db;
  let unit = unit_in(db, &unit).await?;

  if !heads_unit(db, &caller(&headers), unit).await? {
    return Err(Refusal::forbidden(
      "a unit's permissions are read by the administrator or a head of the unit",
    ));
  }

  Ok(Json(permissions(db, unit).await?))
}
