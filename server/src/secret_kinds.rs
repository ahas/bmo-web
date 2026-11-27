//! The secret kinds (docs/accounts.md, 「Secret kinds」; docs/boundary.md, 「Secret kinds」): the shapes the
//! console's secret form asks a value in, kept in the service's database and never holding a value. They are the
//! deployment's, so any call reads them, and the administrator alone adds, changes and removes one; a kind that
//! breaks a rule of their shape is refused naming the rule. The file a kind's fields give is the console's to
//! write; the store keeps no kind, and its list reads one off a file's shape.

use std::collections::HashSet;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use bmo_web_client::{
  ChainKind, ChainLevel, ChainMode, ChainPersonWriter, ChainShape, SecretField, SecretInput, SecretKind,
  SecretKinds,
};
use sea_orm::{ConnectionTrait, DatabaseConnection, QueryResult};
use serde_json::Value;

use crate::routes::{Answer, Body};
use crate::secrets::administrator;
use crate::{Refusal, Service, all, now_ms, one, run};

/// The chain kind that limits which of these kinds the links below keep, declared and re-declared by this module.
pub const CHAIN_KIND: &str = "secret.kinds";

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

/// Every kind the service keeps, in the order they were added.
pub async fn kept(db: &DatabaseConnection) -> Result<Vec<SecretKind>, Refusal> {
  let rows = all(
    db,
    r#"SELECT "key", "name", "description", "fields"::text AS "fields" FROM "secret_kinds"
       ORDER BY "position", "key""#,
    vec![],
  )
  .await?;

  rows.iter().map(kind_of).collect()
}

/// The key of the kind a secret's file reads as: the first of `kinds` holding several fields whose file `text`
/// is, one `KEY=VALUE` line to a field it names, none twice, every required one among them. A kind of one field
/// gives its value alone, which no shape tells apart, so no file reads as one; nor does an empty file.
pub fn read_off<'kinds>(text: &str, kinds: &'kinds [SecretKind]) -> Option<&'kinds str> {
  let keys = text
    .lines()
    .map(|line| line.split_once('=').map(|(key, _)| key))
    .collect::<Option<Vec<_>>>()?;

  if keys.is_empty() {
    return None;
  }

  let made_of = |kind: &SecretKind| {
    let mut held = HashSet::new();
    let named = |key: &str| kind.fields.iter().any(|field| field.key == key);

    keys.iter().all(|key| named(key) && held.insert(*key))
      && kind
        .fields
        .iter()
        .filter(|field| field.required)
        .all(|field| held.contains(field.key.as_str()))
  };

  kinds
    .iter()
    .find(|kind| kind.fields.len() > 1 && made_of(kind))
    .map(|kind| kind.key.as_str())
}

/// The chain kind that narrows which secret kinds each link may keep (docs/accounts.md, 「Secret kinds」):
/// `keys`, `narrowing`, every registered kind by default, with rules, at the platform and a unit's link, a
/// unit's head writing its own.
pub fn chain_kind(choices: Vec<String>) -> ChainKind {
  let default = Value::Array(choices.iter().cloned().map(Value::String).collect());

  ChainKind {
    key: CHAIN_KIND.to_owned(),
    declared_by: crate::UNIT.to_owned(),
    description: "The secret kinds the links below may keep, narrowing the kinds offered above them."
      .to_owned(),
    shape: ChainShape::Keys,
    choices,
    mode: ChainMode::Narrowing,
    default: Some(default),
    rules: true,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit],
    unit_permission: crate::units::HEADS.to_owned(),
    person_writer: ChainPersonWriter::Heads,
    person_raises: false,
  }
}

/// The registry's keys, in the order the kinds were added.
pub async fn registry_keys<C: ConnectionTrait>(db: &C) -> Result<Vec<String>, Refusal> {
  Ok(
    all(db, r#"SELECT "key" FROM "secret_kinds" ORDER BY "position", "key""#, vec![])
      .await?
      .into_iter()
      .map(|row| row.try_get::<String>("", "key"))
      .collect::<Result<Vec<_>, _>>()?,
  )
}

/// Declare or re-declare `secret.kinds` to the registry as it now stands. Widening its choices and moving its
/// default are always allowed; a key the registry has let go is taken out of every stored value and rule of the
/// kind first, so the narrower declaration is not refused as standing in use. Where the registry stands empty the
/// kind is left as it stands, since a keys kind names choices.
pub async fn sync_chain(db: &DatabaseConnection) -> Result<(), Refusal> {
  let choices = registry_keys(db).await?;

  if choices.is_empty() {
    return Ok(());
  }

  let kept: HashSet<&String> = choices.iter().collect();

  for row in all(
    db,
    r#"SELECT "link", "value"::text AS "value" FROM "chain_links"
       WHERE "kind" = $1 AND "value" IS NOT NULL AND jsonb_typeof("value") = 'array'"#,
    vec![CHAIN_KIND.into()],
  )
  .await?
  {
    let (link, value) = (row.try_get::<String>("", "link")?, row.try_get::<String>("", "value")?);

    if let Some(pruned) = pruned(&value, &kept) {
      run(
        db,
        r#"UPDATE "chain_links" SET "value" = $2::jsonb WHERE "kind" = $1 AND "link" = $3"#,
        vec![CHAIN_KIND.into(), pruned.into(), link.into()],
      )
      .await?;
    }
  }

  for row in all(
    db,
    r#"SELECT "link", "who", "value"::text AS "value" FROM "chain_rules"
       WHERE "kind" = $1 AND jsonb_typeof("value") = 'array'"#,
    vec![CHAIN_KIND.into()],
  )
  .await?
  {
    let (link, who, value) = (
      row.try_get::<String>("", "link")?,
      row.try_get::<String>("", "who")?,
      row.try_get::<String>("", "value")?,
    );

    if let Some(pruned) = pruned(&value, &kept) {
      run(
        db,
        r#"UPDATE "chain_rules" SET "value" = $3::jsonb WHERE "kind" = $1 AND "link" = $2 AND "who" = $4"#,
        vec![CHAIN_KIND.into(), link.into(), pruned.into(), who.into()],
      )
      .await?;
    }
  }

  crate::chain::declare(db, &chain_kind(choices)).await.map(|_| ())
}

/// The JSON array `text` with every key not in `kept` taken out, as JSON text; none where it already holds only
/// kept keys, so an unchanged row is written no more.
fn pruned(text: &str, kept: &HashSet<&String>) -> Option<String> {
  let keys: Vec<String> = serde_json::from_str(text).ok()?;
  let held: Vec<String> = keys.iter().filter(|key| kept.contains(key)).cloned().collect();

  (held.len() != keys.len()).then(|| serde_json::to_string(&held).unwrap_or_else(|_| "[]".to_owned()))
}

/// The kinds `subject` is offered down the chain, none where the chain says nothing, the kind is not declared or
/// every kind stands; the store writes a value only where the kind it reads as is offered.
pub async fn offered<C: ConnectionTrait>(
  db: &C,
  subject: crate::chain::Subject,
) -> Option<HashSet<String>> {
  let kind = crate::chain::kind(db, CHAIN_KIND).await.ok()?;
  let (_, resolved) = crate::chain::resolve(db, &kind, subject).await.ok()?;
  let standing = resolved.value.or_else(|| kind.default.clone())?;

  Some(standing.as_array()?.iter().filter_map(Value::as_str).map(str::to_owned).collect())
}

/// `GET /secret-kinds`: every kind, in the order they were added, for any call, since every person's form asks
/// in them.
async fn list(State(service): State<Service>) -> Answer<SecretKinds> {
  Ok(Json(SecretKinds {
    kinds: kept(&service.db).await?,
  }))
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

  sync_chain(&service.db).await?;

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

  // The kind's key leaves the chain kind's choices, and every stored value and rule that named it.
  sync_chain(&service.db).await?;

  Ok(StatusCode::NO_CONTENT)
}

/// The kinds' routes, which the server mounts among those that need the model in force.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/secret-kinds", get(list).post(add))
    .route("/secret-kinds/{key}", axum::routing::put(change).delete(remove))
}
