//! The secret kinds (docs/accounts.md, 「Secret kinds」; docs/boundary.md, 「Secret kinds」): the shapes the
//! console's secret form asks a value in, kept in the service's database and never holding a value. They are the
//! deployment's, so any call reads them, and the administrator alone adds, changes and removes one; a kind that
//! breaks a rule of their shape is refused naming the rule. The file a kind's fields give is the console's to
//! write; the store knows no kind.

use std::collections::HashSet;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use bmo_web_client::{SecretField, SecretInput, SecretKind, SecretKinds};
use sea_orm::QueryResult;
use serde_json::Value;

use crate::routes::{Answer, Body};
use crate::secrets::administrator;
use crate::{Refusal, Service, all, now_ms, one, run};

/// The longest key a kind takes.
pub const KEY_MAX: usize = 64;
/// The longest name a kind or label a field takes, in characters.
pub const NAME_MAX: usize = 100;
/// The longest description a kind takes, in characters.
pub const DESCRIPTION_MAX: usize = 500;
/// The most fields a kind holds.
pub const FIELDS_MAX: usize = 20;
/// The longest key a field takes.
pub const FIELD_KEY_MAX: usize = 128;

/// What a call not made for the administrator is refused as being the administrator's.
const KINDS: &str = "the secret kinds";

fn broken(rule: impl Into<String>) -> Refusal {
  Refusal::bad(rule).coded("bad-kind")
}

fn kind_key(key: &str) -> bool {
  (1..=KEY_MAX).contains(&key.len())
    && key.starts_with(|first: char| first.is_ascii_lowercase())
    && key
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn field_key(key: &str) -> bool {
  (1..=FIELD_KEY_MAX).contains(&key.len())
    && !key.starts_with(|first: char| first.is_ascii_digit())
    && key.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn characters(text: &str) -> usize {
  text.chars().count()
}

/// Whether `kind` keeps every rule of a kind's shape, refused `bad-kind` naming the first it breaks.
pub fn shaped(kind: &SecretKind) -> Result<(), Refusal> {
  if !kind_key(&kind.key) {
    return Err(broken(format!(
      "a kind's key is one to {KEY_MAX} of `a`-`z`, `0`-`9` and `-`, beginning with a letter"
    )));
  }

  if !(1..=NAME_MAX).contains(&characters(&kind.name)) {
    return Err(broken(format!("a kind's name is one to {NAME_MAX} characters")));
  }

  if characters(&kind.description) > DESCRIPTION_MAX {
    return Err(broken(format!("a kind's description is at most {DESCRIPTION_MAX} characters")));
  }

  if !(1..=FIELDS_MAX).contains(&kind.fields.len()) {
    return Err(broken(format!("a kind holds one to {FIELDS_MAX} fields")));
  }

  let mut keys = HashSet::new();

  for field in &kind.fields {
    if !field_key(&field.key) {
      return Err(broken(format!(
        "a field's key is one to {FIELD_KEY_MAX} of `A`-`Z`, `a`-`z`, `0`-`9` and `_`, beginning with no digit"
      )));
    }

    if !(1..=NAME_MAX).contains(&characters(&field.label)) {
      return Err(broken(format!("a field's label is one to {NAME_MAX} characters")));
    }

    if !keys.insert(field.key.as_str()) {
      return Err(broken(format!(
        "the fields' keys are unlike each other, and `{}` stands twice",
        field.key
      )));
    }
  }

  if kind.fields.len() > 1 && kind.fields.iter().any(|field| field.input != SecretInput::Line) {
    return Err(broken(
      "a kind of several fields takes `line` fields alone, its file being one `KEY=VALUE` line to a field; a \
       `lines` or `file` field stands alone in its kind",
    ));
  }

  Ok(())
}

/// The kind a body asks for. A field's `input` the shape does not know breaks a kind's rule and is refused
/// `bad-kind`; any other body that does not read as a kind is refused `bad-request`, naming why.
fn kind_in(body: Value) -> Result<SecretKind, Refusal> {
  let inputs = body.get("fields").and_then(Value::as_array).into_iter().flatten();

  for input in inputs.filter_map(|field| field.get("input")) {
    if input
      .as_str()
      .is_some_and(|input| serde_json::from_value::<SecretInput>(input.into()).is_err())
    {
      return Err(broken("a field's input is `line`, `lines` or `file`"));
    }
  }

  let kind: SecretKind =
    serde_json::from_value(body).map_err(|why| Refusal::bad(format!("the body does not read: {why}")))?;

  shaped(&kind)?;

  Ok(kind)
}

fn fields_text(kind: &SecretKind) -> Result<String, Refusal> {
  serde_json::to_string(&kind.fields).map_err(|why| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("a kind's fields do not write: {why}"))
  })
}

fn kind_of(row: &QueryResult) -> Result<SecretKind, Refusal> {
  let fields: String = row.try_get("", "fields")?;
  let fields: Vec<SecretField> = serde_json::from_str(&fields).map_err(|why| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("a kept kind's fields do not read: {why}"))
      .coded("database")
  })?;

  Ok(SecretKind {
    key: row.try_get("", "key")?,
    name: row.try_get("", "name")?,
    description: row.try_get("", "description")?,
    fields,
  })
}

fn no_kind() -> Refusal {
  Refusal::absent("no kind stands under the key")
}

/// `GET /secret-kinds`: every kind, in the order they were added, for any call, since every person's form asks
/// in them.
async fn list(State(service): State<Service>) -> Answer<SecretKinds> {
  let rows = all(
    &service.db,
    r#"SELECT "key", "name", "description", "fields"::text AS "fields" FROM "secret_kinds"
       ORDER BY "position", "key""#,
    vec![],
  )
  .await?;
  let kinds = rows.iter().map(kind_of).collect::<Result<_, _>>()?;

  Ok(Json(SecretKinds { kinds }))
}

/// `POST /secret-kinds`: a kind added after every kind that stands.
async fn add(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(body): Body<Value>,
) -> Result<(StatusCode, Json<SecretKind>), Refusal> {
  administrator(&headers, KINDS)?;

  let kind = kind_in(body)?;
  let added = one(
    &service.db,
    r#"INSERT INTO "secret_kinds" ("key", "name", "description", "fields", "position", "updated_at")
       SELECT $1, $2, $3, $4::jsonb, COALESCE(MAX("position"), 0) + 1, $5 FROM "secret_kinds"
       ON CONFLICT ("key") DO NOTHING
       RETURNING "key""#,
    vec![
      kind.key.clone().into(),
      kind.name.clone().into(),
      kind.description.clone().into(),
      fields_text(&kind)?.into(),
      now_ms().into(),
    ],
  )
  .await?;

  if added.is_none() {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "a kind stands under the key already").coded("kind-exists"),
    );
  }

  Ok((StatusCode::CREATED, Json(kind)))
}

/// `PUT /secret-kinds/{key}`: a kind changed in its place; its key is the path's, since a key does not change.
async fn change(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(key): Path<String>,
  Body(body): Body<Value>,
) -> Answer<SecretKind> {
  administrator(&headers, KINDS)?;

  let kind = kind_in(body)?;

  if kind.key != key {
    return Err(broken("a kind's key is the path's: a kind's key does not change"));
  }

  let changed = run(
    &service.db,
    r#"UPDATE "secret_kinds" SET "name" = $2, "description" = $3, "fields" = $4::jsonb, "updated_at" = $5
       WHERE "key" = $1"#,
    vec![
      kind.key.clone().into(),
      kind.name.clone().into(),
      kind.description.clone().into(),
      fields_text(&kind)?.into(),
      now_ms().into(),
    ],
  )
  .await?;

  if changed == 0 {
    return Err(no_kind());
  }

  Ok(Json(kind))
}

/// `DELETE /secret-kinds/{key}`: a kind removed.
async fn remove(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(key): Path<String>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers, KINDS)?;

  let removed =
    run(&service.db, r#"DELETE FROM "secret_kinds" WHERE "key" = $1"#, vec![key.into()]).await?;

  if removed == 0 {
    return Err(no_kind());
  }

  Ok(StatusCode::NO_CONTENT)
}

/// The kinds' routes, which the server mounts among those that need the model in force.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/secret-kinds", get(list).post(add))
    .route("/secret-kinds/{key}", axum::routing::put(change).delete(remove))
}
