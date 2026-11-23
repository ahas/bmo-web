//! The delegation chain (docs/accounts.md, 「The delegation chain」): how a setting reaches a person from the
//! platform down through their company and units. The units that use a setting declare its kind; the service
//! keeps each link's entry — a value, a delegation and rules — and resolves what stands for a person or a unit.
//! It holds no kind of its own and knows nothing of what a setting does.

pub mod groups;
pub mod routes;

use std::collections::{HashMap, HashSet};
use std::fmt;

use axum::http::StatusCode;
use bmo_web_client::{
  ChainDelegation, ChainKind, ChainLayer, ChainLevel, ChainMode, ChainPersonWriter, ChainResolution,
  ChainShape,
};
use sea_orm::ConnectionTrait;
use serde_json::Value;
use sumida::api::authz::Authz;

use crate::readers::Reader;
use crate::units::UNIT;
use crate::users::user_subject;
use crate::{Refusal, all, now_ms, one, run};

/// The most characters a text value may hold.
pub const TEXT_MOST: usize = 100_000;
/// The most rules one link may hold.
pub const RULES_MOST: usize = 500;
/// The word an amount says for no limit.
pub const UNLIMITED: &str = "unlimited";

// ---------------------------------------------------------------------------------------------------------
// Links, whom a rule names, and the subject

/// A link of the chain: the platform, a unit, or a person.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Link {
  Platform,
  Unit(i32),
  Person(i32),
}

impl fmt::Display for Link {
  fn fmt(&self, out: &mut fmt::Formatter) -> fmt::Result {
    match self {
      Link::Platform => out.write_str("platform"),
      Link::Unit(unit) => write!(out, "unit:{unit}"),
      Link::Person(user) => write!(out, "person:{user}"),
    }
  }
}

impl Link {
  /// The link a wire word names: `platform`, `unit:<id>` or `person:<user>`.
  pub fn parse(word: &str) -> Option<Link> {
    if word == "platform" {
      return Some(Link::Platform);
    }

    let (level, id) = word.split_once(':')?;
    let id: i32 = id.parse().ok()?;

    match level {
      "unit" => Some(Link::Unit(id)),
      "person" => Some(Link::Person(id)),
      _ => None,
    }
  }

  pub fn level(self) -> ChainLevel {
    match self {
      Link::Platform => ChainLevel::Platform,
      Link::Unit(_) => ChainLevel::Unit,
      Link::Person(_) => ChainLevel::Person,
    }
  }

  fn unit(self) -> Option<i32> {
    match self {
      Link::Unit(unit) => Some(unit),
      _ => None,
    }
  }

  fn person(self) -> Option<i32> {
    match self {
      Link::Person(user) => Some(user),
      _ => None,
    }
  }
}

/// Whom a rule names: one person, a group, or a unit and everyone under it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Who {
  Person(i32),
  Group(i64),
  Unit(i32),
}

impl fmt::Display for Who {
  fn fmt(&self, out: &mut fmt::Formatter) -> fmt::Result {
    match self {
      Who::Person(user) => write!(out, "person:{user}"),
      Who::Group(group) => write!(out, "group:{group}"),
      Who::Unit(unit) => write!(out, "unit:{unit}"),
    }
  }
}

impl Who {
  /// Whom a wire word names: `person:<user>`, `group:<id>` or `unit:<id>`.
  pub fn parse(word: &str) -> Option<Who> {
    let (level, id) = word.split_once(':')?;

    match level {
      "person" => id.parse().ok().map(Who::Person),
      "group" => id.parse().ok().map(Who::Group),
      "unit" => id.parse().ok().map(Who::Unit),
      _ => None,
    }
  }
}

/// What a setting is resolved for: a person, or a unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Subject {
  Person(i32),
  Unit(i32),
}

impl fmt::Display for Subject {
  fn fmt(&self, out: &mut fmt::Formatter) -> fmt::Result {
    match self {
      Subject::Person(user) => write!(out, "person:{user}"),
      Subject::Unit(unit) => write!(out, "unit:{unit}"),
    }
  }
}

/// A subject's chain: its links top first, the subject's own last; the units on it, the company first; and the
/// person at its foot, where the subject is one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Path {
  pub links: Vec<Link>,
  pub units: Vec<i32>,
  pub person: Option<i32>,
}

impl Path {
  /// The chain of a unit standing under `units`, the company first and the unit last.
  pub fn of_units(units: Vec<i32>) -> Path {
    let links = std::iter::once(Link::Platform).chain(units.iter().copied().map(Link::Unit)).collect();

    Path {
      links,
      units,
      person: None,
    }
  }

  /// The chain of a person standing in the last of `units`.
  pub fn of_person(units: Vec<i32>, user: i32) -> Path {
    let mut path = Path::of_units(units);

    path.links.push(Link::Person(user));
    path.person = Some(user);
    path
  }

  /// The platform's own chain: the platform alone.
  pub fn of_platform() -> Path {
    Path {
      links: vec![Link::Platform],
      units: vec![],
      person: None,
    }
  }

  /// The subject's chain as the tree stands; 404 where the subject does not stand.
  pub async fn of<C: ConnectionTrait>(db: &C, subject: Subject) -> Result<Path, Refusal> {
    match subject {
      Subject::Unit(unit) => Ok(Path::of_units(units_down_to(db, unit).await?)),
      Subject::Person(user) => {
        let unit = home_of(db, user).await?;

        Ok(Path::of_person(units_down_to(db, unit).await?, user))
      }
    }
  }

  /// The chain ending at `link`, which a write there is judged on.
  pub async fn ending_at<C: ConnectionTrait>(db: &C, link: Link) -> Result<Path, Refusal> {
    match link {
      Link::Platform => Ok(Path::of_platform()),
      Link::Unit(unit) => Path::of(db, Subject::Unit(unit)).await,
      Link::Person(user) => Path::of(db, Subject::Person(user)).await,
    }
  }
}

/// The units from a unit's company down to it, the company first; 404 where the unit does not stand.
pub async fn units_down_to<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<i32>, Refusal> {
  let rows = all(
    db,
    r#"SELECT "ancestor_id"::integer AS "unit" FROM "org_closure"
        WHERE "descendant_id" = $1::bigint ORDER BY "depth" DESC"#,
    vec![unit.into()],
  )
  .await?;

  if rows.is_empty() {
    return Err(Refusal::absent(format!("no unit {unit}")));
  }

  rows.iter().map(|row| Ok(row.try_get::<i32>("", "unit")?)).collect()
}

/// A person's home unit; 404 where no such person stands.
pub async fn home_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<i32, Refusal> {
  Ok(
    one(
      db,
      r#"SELECT "organization_id"::integer AS "unit" FROM "users" WHERE "id" = $1::bigint"#,
      vec![user.into()],
    )
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?
    .try_get("", "unit")?,
  )
}

// ---------------------------------------------------------------------------------------------------------
// A link's entry

/// What one link holds of one kind.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Entry {
  pub value: Option<Value>,
  pub delegation: ChainDelegation,
  pub rules: Vec<(Who, Value)>,
  pub set_by: Option<i32>,
  pub set_at: Option<i64>,
}

/// A link's word for a subject, and whom the rule it came from names.
#[derive(Debug, Clone, PartialEq)]
pub struct Layer {
  pub link: Link,
  pub value: Value,
  pub rule: Option<Who>,
}

/// A setting resolved for a subject.
#[derive(Debug, Clone, PartialEq)]
pub struct Resolved {
  /// The value standing; none for a layered kind, and where nothing is said and no default stands.
  pub value: Option<Value>,
  pub from: Option<Link>,
  pub rule: Option<Who>,
  /// Every link's word, top first, the links below the lock that cut the chain left out.
  pub layers: Vec<Layer>,
  pub locked_by: Option<Link>,
}

impl Resolved {
  /// The answer the route gives, with the link asked after where one was.
  pub fn wire(
    &self,
    kind: &ChainKind,
    subject: Subject,
    link: Option<bmo_web_client::ChainLinkStanding>,
  ) -> ChainResolution {
    ChainResolution {
      kind: kind.key.clone(),
      subject: subject.to_string(),
      value: self.value.clone(),
      from: self.from.map(|link| link.to_string()),
      rule: self.rule.map(|who| who.to_string()),
      layers: self
        .layers
        .iter()
        .map(|layer| ChainLayer {
          link: layer.link.to_string(),
          value: layer.value.clone(),
          rule: layer.rule.map(|who| who.to_string()),
        })
        .collect(),
      locked_by: self.locked_by.map(|link| link.to_string()),
      link,
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Resolution (docs/accounts.md, 「Resolution」)

/// The farthest link above a path's own, its last, holding a lock.
pub fn lock_above(path: &Path, entries: &HashMap<Link, Entry>) -> Option<Link> {
  let above = &path.links[..path.links.len().saturating_sub(1)];

  above
    .iter()
    .copied()
    .find(|link| entries.get(link).is_some_and(|entry| entry.delegation == ChainDelegation::Lock))
}

/// `nearer` narrowing what `farther` says: a flag holds where both do, an amount is the smaller, and keys are
/// those both name, in the nearer one's order. A value out of the shape leaves the farther one standing.
pub fn narrow(shape: ChainShape, farther: &Value, nearer: &Value) -> Value {
  match shape {
    ChainShape::Flag => {
      Value::Bool(farther.as_bool().unwrap_or(false) && nearer.as_bool().unwrap_or(false))
    }
    ChainShape::Amount => match (farther.as_i64(), nearer.as_i64()) {
      (Some(far), Some(near)) => Value::from(far.min(near)),
      (Some(_), None) => farther.clone(),
      (None, Some(_)) => nearer.clone(),
      (None, None) => Value::from(UNLIMITED),
    },
    ChainShape::Keys => {
      let farther: HashSet<&str> =
        farther.as_array().into_iter().flatten().filter_map(Value::as_str).collect();

      Value::Array(
        nearer
          .as_array()
          .into_iter()
          .flatten()
          .filter(|key| key.as_str().is_some_and(|key| farther.contains(key)))
          .cloned()
          .collect(),
      )
    }
    ChainShape::Text | ChainShape::Json => nearer.clone(),
  }
}

/// What one link says to the subject (docs/accounts.md, 「Resolution」, the first rule): at a person's own link its
/// value; at the platform or a unit, the rule naming the person, then those naming a group they belong to, then
/// the one naming the unit nearest them on their path, and then the link's own value.
fn said(
  kind: &ChainKind,
  link: Link,
  entry: &Entry,
  path: &Path,
  groups: &[i64],
) -> Option<(Value, Option<Who>)> {
  if kind.rules && !matches!(link, Link::Person(_)) {
    if let Some(user) = path.person
      && let Some((who, value)) = entry.rules.iter().find(|(who, _)| *who == Who::Person(user))
    {
      return Some((value.clone(), Some(*who)));
    }

    let mut named: Vec<(i64, &Value)> = entry
      .rules
      .iter()
      .filter_map(|(who, value)| match who {
        Who::Group(group) if groups.contains(group) => Some((*group, value)),
        _ => None,
      })
      .collect();

    named.sort_by_key(|(group, _)| *group);
    if let Some((first, value)) = named.first() {
      if kind.mode != ChainMode::Narrowing {
        return Some(((*value).clone(), Some(Who::Group(*first))));
      }

      // Under a narrowing kind the narrowest group's word stands, so no group widens another.
      let mut narrowest = ((*value).clone(), *first);

      for (group, value) in &named[1..] {
        let narrowed = narrow(kind.shape, &narrowest.0, value);

        if narrowed != narrowest.0 {
          narrowest = (narrowed, *group);
        }
      }

      return Some((narrowest.0, Some(Who::Group(narrowest.1))));
    }

    let nearest_unit = entry
      .rules
      .iter()
      .filter_map(|(who, value)| match who {
        Who::Unit(unit) => path.units.iter().position(|on| on == unit).map(|depth| (depth, *unit, value)),
        _ => None,
      })
      .max_by_key(|(depth, _, _)| *depth);

    if let Some((_, unit, value)) = nearest_unit {
      return Some((value.clone(), Some(Who::Unit(unit))));
    }
  }

  entry.value.clone().map(|value| (value, None))
}

/// A setting resolved for the subject at the foot of `path`, from the entries its links hold and the groups the
/// subject belongs to (docs/accounts.md, 「Resolution」).
pub fn resolve_on(
  kind: &ChainKind,
  path: &Path,
  entries: &HashMap<Link, Entry>,
  groups: &[i64],
) -> Resolved {
  let locked_by = lock_above(path, entries);
  let read = match locked_by {
    Some(lock) => path.links.iter().position(|link| *link == lock).map_or(path.links.len(), |at| at + 1),
    None => path.links.len(),
  };
  let layers: Vec<Layer> = path.links[..read]
    .iter()
    .filter_map(|link| {
      let entry = entries.get(link)?;
      let (value, rule) = said(kind, *link, entry, path, groups)?;

      Some(Layer {
        link: *link,
        value,
        rule,
      })
    })
    .collect();

  let (value, from, rule) = match kind.mode {
    ChainMode::Nearest => match layers.last() {
      Some(layer) => (Some(layer.value.clone()), Some(layer.link), layer.rule),
      None => (kind.default.clone(), None, None),
    },
    ChainMode::Narrowing => {
      let narrowed = layers
        .iter()
        .map(|layer| layer.value.clone())
        .reduce(|farther, nearer| narrow(kind.shape, &farther, &nearer));

      (narrowed.or_else(|| kind.default.clone()), None, None)
    }
    ChainMode::Layered => (None, None, None),
  };

  Resolved {
    value,
    from,
    rule,
    layers,
    locked_by,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Reading the entries

/// The links of `links` as JSON text, which a statement reads as a set.
fn listed(links: &[Link]) -> sea_orm::Value {
  serde_json::to_string(&links.iter().map(Link::to_string).collect::<Vec<_>>())
    .unwrap_or_default()
    .into()
}

fn stored(row: &sea_orm::QueryResult, column: &str) -> Result<Option<Value>, Refusal> {
  row
    .try_get::<Option<String>>("", column)?
    .map(|text| {
      serde_json::from_str(&text).map_err(|why| {
        Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("a stored chain value is no JSON: {why}"))
      })
    })
    .transpose()
}

fn link_of(row: &sea_orm::QueryResult) -> Result<Link, Refusal> {
  let word: String = row.try_get("", "link")?;

  Link::parse(&word)
    .ok_or_else(|| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("`{word}` is no stored link")))
}

/// The entries one kind holds at `links`, every link of the kind where none are named.
pub async fn entries<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  links: Option<&[Link]>,
) -> Result<HashMap<Link, Entry>, Refusal> {
  let within = r#"("link" IN (SELECT jsonb_array_elements_text($2::text::jsonb)) OR $2 IS NULL)"#;
  let named: sea_orm::Value = match links {
    Some(links) => listed(links),
    None => Option::<String>::None.into(),
  };
  let rows = all(
    db,
    &format!(
      r#"SELECT "link", "value"::text AS "value", "delegation", "set_by"::integer AS "set_by", "set_at"
           FROM "chain_links" WHERE "kind" = $1 AND {within}"#
    ),
    vec![kind.into(), named.clone()],
  )
  .await?;
  let mut out: HashMap<Link, Entry> = HashMap::with_capacity(rows.len());

  for row in &rows {
    let word: String = row.try_get("", "delegation")?;

    out.insert(
      link_of(row)?,
      Entry {
        value: stored(row, "value")?,
        delegation: ChainDelegation::parse(&word).unwrap_or_default(),
        rules: vec![],
        set_by: row.try_get("", "set_by")?,
        set_at: Some(row.try_get("", "set_at")?),
      },
    );
  }

  let rules = all(
    db,
    &format!(
      r#"SELECT "link", "who", "value"::text AS "value" FROM "chain_rules"
          WHERE "kind" = $1 AND {within} ORDER BY "link", "who""#
    ),
    vec![kind.into(), named],
  )
  .await?;

  for row in &rules {
    let word: String = row.try_get("", "who")?;
    let who = Who::parse(&word).ok_or_else(|| {
      Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("`{word}` is no stored rule"))
    })?;
    let value = stored(row, "value")?.unwrap_or(Value::Null);

    out.entry(link_of(row)?).or_default().rules.push((who, value));
  }

  Ok(out)
}

/// The groups a person belongs to, by id.
pub async fn groups_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<i64>, Refusal> {
  all(
    db,
    r#"SELECT "group_id" FROM "chain_group_members" WHERE "user_id" = $1::bigint ORDER BY "group_id""#,
    vec![user.into()],
  )
  .await?
  .iter()
  .map(|row| Ok(row.try_get::<i64>("", "group_id")?))
  .collect()
}

/// Every member of the groups a kind's rules name, by group, for resolving many people at once.
pub async fn members_named<C: ConnectionTrait>(
  db: &C,
  kind: &str,
) -> Result<HashMap<i32, Vec<i64>>, Refusal> {
  let rows = all(
    db,
    r#"SELECT m."user_id"::integer AS "user", m."group_id" FROM "chain_group_members" m
        WHERE m."group_id" IN (SELECT "who_group" FROM "chain_rules" WHERE "kind" = $1 AND "who_group" IS NOT NULL)
        ORDER BY m."group_id""#,
    vec![kind.into()],
  )
  .await?;
  let mut out: HashMap<i32, Vec<i64>> = HashMap::new();

  for row in &rows {
    out.entry(row.try_get("", "user")?).or_default().push(row.try_get("", "group_id")?);
  }

  Ok(out)
}

/// A setting resolved for a subject as the chain now stands, with the subject's chain.
pub async fn resolve<C: ConnectionTrait>(
  db: &C,
  kind: &ChainKind,
  subject: Subject,
) -> Result<(Path, Resolved), Refusal> {
  let path = Path::of(db, subject).await?;
  let held = entries(db, &kind.key, Some(&path.links)).await?;
  let groups = match path.person {
    Some(user) if kind.rules => groups_of(db, user).await?,
    _ => vec![],
  };
  let resolved = resolve_on(kind, &path, &held, &groups);

  Ok((path, resolved))
}

/// The farthest link above `link` holding a lock of the kind, which withholds every change at `link`.
pub async fn locked_over<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  link: Link,
) -> Result<Option<Link>, Refusal> {
  let path = Path::ending_at(db, link).await?;
  let held = entries(db, kind, Some(&path.links)).await?;

  Ok(lock_above(&path, &held))
}

// ---------------------------------------------------------------------------------------------------------
// The kinds

fn bad_kind(why: impl Into<String>) -> Refusal {
  Refusal::bad(why).coded("bad-kind")
}

fn bad_value(why: impl Into<String>) -> Refusal {
  Refusal::bad(why).coded("bad-value")
}

fn worded(text: &str, most: usize, dots: bool) -> bool {
  let mut characters = text.chars();

  (1..=most).contains(&text.chars().count())
    && characters.next().is_some_and(|first| first.is_ascii_lowercase())
    && characters.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || (dots && c == '.'))
}

/// Whether a value fits a kind's shape, saying why not where it does not.
pub fn fits(kind: &ChainKind, value: &Value) -> Result<(), String> {
  let fits = match kind.shape {
    ChainShape::Flag => value.is_boolean(),
    ChainShape::Text => value.as_str().is_some_and(|text| text.chars().count() <= TEXT_MOST),
    ChainShape::Amount => {
      value.as_str() == Some(UNLIMITED) || value.as_i64().is_some_and(|amount| amount >= 0)
    }
    ChainShape::Keys => value.as_array().is_some_and(|keys| {
      let mut seen = HashSet::new();

      keys.iter().all(|key| {
        key
          .as_str()
          .is_some_and(|key| kind.choices.iter().any(|choice| choice == key) && seen.insert(key))
      })
    }),
    ChainShape::Json => value.is_object() || value.is_array(),
  };

  if fits { Ok(()) } else { Err(format!("{value} is no value of `{}`", kind.key)) }
}

/// A declaration judged by its own shape.
fn judged(kind: &ChainKind) -> Result<(), Refusal> {
  if !worded(&kind.key, 64, true) {
    return Err(bad_kind(format!("`{}` is no kind's key", kind.key)));
  }
  if !worded(&kind.declared_by, 40, false) {
    return Err(bad_kind(format!("`{}` is no unit's name", kind.declared_by)));
  }
  if kind.levels.is_empty() {
    return Err(bad_kind("a kind is held at one level at least"));
  }
  if kind.mode == ChainMode::Narrowing && matches!(kind.shape, ChainShape::Text | ChainShape::Json) {
    return Err(bad_kind("a narrowing kind is a flag, an amount or keys"));
  }
  if kind.shape == ChainShape::Json && kind.rules {
    return Err(bad_kind("a json kind takes no rules"));
  }
  if kind.shape == ChainShape::Keys {
    let distinct: HashSet<&String> = kind.choices.iter().collect();

    let chosen = |choice: &String| {
      (1..=64).contains(&choice.len())
        && choice
          .chars()
          .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "-_.".contains(c))
    };

    if kind.choices.is_empty() || distinct.len() != kind.choices.len() || !kind.choices.iter().all(chosen) {
      return Err(bad_kind("a keys kind names distinct choices"));
    }
  }
  if !(1..=40).contains(&kind.unit_permission.len())
    || !kind.unit_permission.chars().all(|c| c.is_ascii_lowercase() || c == '_')
  {
    return Err(bad_kind(format!("`{}` is no organisation permission", kind.unit_permission)));
  }
  if let Some(default) = &kind.default {
    fits(kind, default).map_err(bad_kind)?;
  }

  Ok(())
}

fn kind_of(row: &sea_orm::QueryResult) -> Result<ChainKind, Refusal> {
  let text: String = row.try_get("", "declaration")?;

  serde_json::from_str(&text).map_err(|why| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("a stored declaration is no kind: {why}"))
  })
}

/// The kind declared under `key`; 404 `no-such-kind` where none is.
pub async fn kind<C: ConnectionTrait>(db: &C, key: &str) -> Result<ChainKind, Refusal> {
  let row = one(
    db,
    r#"SELECT "declaration"::text AS "declaration" FROM "chain_kinds" WHERE "key" = $1"#,
    vec![key.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no kind `{key}` is declared")).coded("no-such-kind"))?;

  kind_of(&row)
}

/// Every kind declared, by key.
pub async fn kinds<C: ConnectionTrait>(db: &C) -> Result<Vec<ChainKind>, Refusal> {
  all(
    db,
    r#"SELECT "declaration"::text AS "declaration" FROM "chain_kinds" ORDER BY "key""#,
    vec![],
  )
  .await?
  .iter()
  .map(kind_of)
  .collect()
}

/// A kind declared, or declared again by the unit that declared it (docs/accounts.md, 「A setting kind」).
pub async fn declare<C: ConnectionTrait>(db: &C, kind: &ChainKind) -> Result<ChainKind, Refusal> {
  judged(kind)?;

  let standing = one(
    db,
    r#"SELECT "declaration"::text AS "declaration" FROM "chain_kinds" WHERE "key" = $1"#,
    vec![kind.key.clone().into()],
  )
  .await?
  .map(|row| kind_of(&row))
  .transpose()?;

  if let Some(standing) = &standing {
    if standing.declared_by != kind.declared_by {
      return Err(
        Refusal::new(
          StatusCode::CONFLICT,
          format!("`{}` is declared by `{}`", kind.key, standing.declared_by),
        )
        .coded("kind-declared-elsewhere"),
      );
    }

    let in_use = |why: String| Refusal::new(StatusCode::CONFLICT, why).coded("kind-in-use");
    let held = one(
      db,
      r#"SELECT 1 AS "held" WHERE EXISTS (SELECT 1 FROM "chain_links" WHERE "kind" = $1)
                              OR EXISTS (SELECT 1 FROM "chain_rules" WHERE "kind" = $1)"#,
      vec![kind.key.clone().into()],
    )
    .await?
    .is_some();

    if held && (standing.shape != kind.shape || standing.mode != kind.mode) {
      return Err(in_use(format!("`{}` holds entries, so its shape and mode stand", kind.key)));
    }
    for gone in standing.choices.iter().filter(|choice| !kind.choices.contains(choice)) {
      let named = one(
        db,
        r#"SELECT 1 AS "named" WHERE EXISTS (SELECT 1 FROM "chain_links" WHERE "kind" = $1 AND "value" ? $2)
                                 OR EXISTS (SELECT 1 FROM "chain_rules" WHERE "kind" = $1 AND "value" ? $2)"#,
        vec![kind.key.clone().into(), gone.clone().into()],
      )
      .await?
      .is_some();

      if named {
        return Err(in_use(format!("a value of `{}` names `{gone}`", kind.key)));
      }
    }
  }

  run(
    db,
    r#"INSERT INTO "chain_kinds" ("key", "declared_by", "declaration", "declared_at")
       VALUES ($1, $2, $3::text::jsonb, $4)
       ON CONFLICT ("key") DO UPDATE SET "declaration" = $3::text::jsonb, "declared_at" = $4"#,
    vec![
      kind.key.clone().into(),
      kind.declared_by.clone().into(),
      serde_json::to_string(kind).unwrap_or_default().into(),
      now_ms().into(),
    ],
  )
  .await?;

  Ok(kind.clone())
}

// ---------------------------------------------------------------------------------------------------------
// Writing a link

/// A link a write of the kind may change: one of its levels, standing, and under no lock; refused otherwise.
pub async fn open<C: ConnectionTrait>(db: &C, kind: &ChainKind, link: Link) -> Result<Path, Refusal> {
  if !kind.levels.contains(&link.level()) {
    return Err(Refusal::bad(format!("`{}` holds no entry at {link}", kind.key)).coded("bad-link"));
  }

  let path = Path::ending_at(db, link).await?;
  let held = entries(db, &kind.key, Some(&path.links)).await?;

  if let Some(lock) = lock_above(&path, &held) {
    return Err(
      Refusal::new(StatusCode::CONFLICT, format!("`{}` is locked at {lock}, above {link}", kind.key))
        .coded("locked"),
    );
  }

  Ok(path)
}

/// The row of a link, made where none stands, its writer and moment renewed.
async fn touch<C: ConnectionTrait>(db: &C, kind: &str, link: Link, by: Option<i32>) -> Result<(), Refusal> {
  run(
    db,
    r#"INSERT INTO "chain_links" ("kind", "link", "unit_id", "user_id", "delegation", "set_by", "set_at")
       VALUES ($1, $2, $3, $4, 'inherit', $5, $6)
       ON CONFLICT ("kind", "link") DO UPDATE SET "set_by" = $5, "set_at" = $6"#,
    vec![
      kind.into(),
      link.to_string().into(),
      link.unit().map(i64::from).into(),
      link.person().map(i64::from).into(),
      by.map(i64::from).into(),
      now_ms().into(),
    ],
  )
  .await?;

  Ok(())
}

/// A link's row taken away where it holds nothing: no value, `inherit` and no rule.
async fn tidy<C: ConnectionTrait>(db: &C, kind: &str, link: Link) -> Result<(), Refusal> {
  run(
    db,
    r#"DELETE FROM "chain_links" l
        WHERE l."kind" = $1 AND l."link" = $2 AND l."value" IS NULL AND l."delegation" = 'inherit'
          AND NOT EXISTS (SELECT 1 FROM "chain_rules" r WHERE r."kind" = $1 AND r."link" = $2)"#,
    vec![kind.into(), link.to_string().into()],
  )
  .await?;

  Ok(())
}

/// A link's value written, none to follow above, its delegation and rules kept. The consumer of a `json` kind
/// judges its value first; any other value is judged here by the kind's shape.
pub async fn put_value<C: ConnectionTrait>(
  db: &C,
  kind: &ChainKind,
  link: Link,
  value: Option<&Value>,
  by: Option<i32>,
) -> Result<(), Refusal> {
  open(db, kind, link).await?;
  if let Some(value) = value {
    fits(kind, value).map_err(bad_value)?;
  }

  touch(db, &kind.key, link, by).await?;
  run(
    db,
    r#"UPDATE "chain_links" SET "value" = $3::text::jsonb WHERE "kind" = $1 AND "link" = $2"#,
    vec![
      kind.key.clone().into(),
      link.to_string().into(),
      value.map(|value| value.to_string()).into(),
    ],
  )
  .await?;
  tidy(db, &kind.key, link).await
}

/// A link's delegation written; a person's link holds `inherit` alone.
pub async fn put_delegation<C: ConnectionTrait>(
  db: &C,
  kind: &ChainKind,
  link: Link,
  delegation: ChainDelegation,
  by: Option<i32>,
) -> Result<(), Refusal> {
  open(db, kind, link).await?;
  if matches!(link, Link::Person(_)) && delegation != ChainDelegation::Inherit {
    return Err(Refusal::bad("a person's link has nothing below it to delegate to").coded("bad-link"));
  }

  touch(db, &kind.key, link, by).await?;
  run(
    db,
    r#"UPDATE "chain_links" SET "delegation" = $3 WHERE "kind" = $1 AND "link" = $2"#,
    vec![kind.key.clone().into(), link.to_string().into(), delegation.key().into()],
  )
  .await?;
  tidy(db, &kind.key, link).await
}

fn bad_rule(why: impl Into<String>) -> Refusal {
  Refusal::bad(why).coded("bad-rule")
}

/// Whether a rule at `link`, on the chain `path` ending there, may name `who`: a person standing at or under the
/// link, a unit that is the link's or one under it, or a group of the link's company; the platform names anyone.
async fn rule_reaches<C: ConnectionTrait>(db: &C, link: Link, who: Who) -> Result<bool, Refusal> {
  let under = |units: &[i32]| match link {
    Link::Unit(unit) => units.contains(&unit),
    _ => true,
  };

  match who {
    Who::Person(user) => match home_of(db, user).await {
      Ok(unit) => Ok(under(&units_down_to(db, unit).await?)),
      Err(_) => Ok(false),
    },
    Who::Unit(unit) => match units_down_to(db, unit).await {
      Ok(units) => Ok(under(&units)),
      Err(_) => Ok(false),
    },
    Who::Group(group) => {
      let Some(row) = one(
        db,
        r#"SELECT "unit_id"::integer AS "unit" FROM "chain_groups" WHERE "id" = $1"#,
        vec![group.into()],
      )
      .await?
      else {
        return Ok(false);
      };
      let kept_by: i32 = row.try_get("", "unit")?;

      match link {
        Link::Unit(unit) => {
          Ok(units_down_to(db, kept_by).await?.first() == units_down_to(db, unit).await?.first())
        }
        _ => Ok(true),
      }
    }
  }
}

/// A link's rules written whole (docs/accounts.md, 「Rules and groups」).
pub async fn put_rules<C: ConnectionTrait>(
  db: &C,
  kind: &ChainKind,
  link: Link,
  rules: &[(Who, Value)],
  by: Option<i32>,
) -> Result<(), Refusal> {
  open(db, kind, link).await?;
  if !rules.is_empty() && !kind.rules {
    return Err(bad_rule(format!("`{}` takes no rules", kind.key)));
  }
  if !rules.is_empty() && matches!(link, Link::Person(_)) {
    return Err(bad_rule("a person's link holds no rules"));
  }
  if rules.len() > RULES_MOST {
    return Err(bad_rule(format!("a link holds at most {RULES_MOST} rules")));
  }

  let mut seen = HashSet::new();

  for (who, value) in rules {
    if !seen.insert(*who) {
      return Err(bad_rule(format!("{who} is named twice")));
    }
    fits(kind, value).map_err(bad_rule)?;
    if !rule_reaches(db, link, *who).await? {
      return Err(bad_rule(format!("{who} stands under no reach of {link}")));
    }
  }

  touch(db, &kind.key, link, by).await?;
  run(
    db,
    r#"DELETE FROM "chain_rules" WHERE "kind" = $1 AND "link" = $2"#,
    vec![kind.key.clone().into(), link.to_string().into()],
  )
  .await?;

  for (who, value) in rules {
    let (user, group, unit) = match who {
      Who::Person(user) => (Some(i64::from(*user)), None, None),
      Who::Group(group) => (None, Some(*group), None),
      Who::Unit(unit) => (None, None, Some(i64::from(*unit))),
    };

    run(
      db,
      r#"INSERT INTO "chain_rules"
           ("kind", "link", "unit_id", "who", "who_user", "who_group", "who_unit", "value", "set_by", "set_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9, $10)"#,
      vec![
        kind.key.clone().into(),
        link.to_string().into(),
        link.unit().map(i64::from).into(),
        who.to_string().into(),
        user.into(),
        group.into(),
        unit.into(),
        value.to_string().into(),
        by.map(i64::from).into(),
        now_ms().into(),
      ],
    )
    .await?;
  }

  tidy(db, &kind.key, link).await
}

/// A link's entry taken away whole, so the link follows above.
pub async fn clear<C: ConnectionTrait>(db: &C, kind: &ChainKind, link: Link) -> Result<(), Refusal> {
  open(db, kind, link).await?;
  run(
    db,
    r#"DELETE FROM "chain_rules" WHERE "kind" = $1 AND "link" = $2"#,
    vec![kind.key.clone().into(), link.to_string().into()],
  )
  .await?;
  run(
    db,
    r#"DELETE FROM "chain_links" WHERE "kind" = $1 AND "link" = $2"#,
    vec![kind.key.clone().into(), link.to_string().into()],
  )
  .await?;

  Ok(())
}

/// The value a link holds of a kind, none where it follows above.
pub async fn value_at<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  link: Link,
) -> Result<Option<Value>, Refusal> {
  Ok(entries(db, kind, Some(&[link])).await?.remove(&link).and_then(|entry| entry.value))
}

// ---------------------------------------------------------------------------------------------------------
// Who writes a link

/// Whether a reader holds the kind's unit permission on a unit, the platform administrator always.
async fn holds<C: ConnectionTrait>(
  db: &C,
  reader: &Reader,
  kind: &ChainKind,
  unit: i32,
) -> Result<bool, Refusal> {
  if reader.administrator {
    return Ok(true);
  }

  let subject = user_subject(db, reader.user).await?;

  Ok(
    Authz::check(UNIT, unit, &kind.unit_permission, &subject, db)
      .await
      .is_ok_and(|held| held),
  )
}

/// Whether a reader writes a link of a kind (docs/accounts.md, 「Who changes a link」).
pub async fn writes<C: ConnectionTrait>(
  db: &C,
  reader: &Reader,
  kind: &ChainKind,
  link: Link,
) -> Result<bool, Refusal> {
  match link {
    Link::Platform => Ok(reader.administrator),
    Link::Unit(unit) => holds(db, reader, kind, unit).await,
    Link::Person(user) => {
      let own = reader.user == user;
      let heads = || async { holds(db, reader, kind, home_of(db, user).await?).await };

      match kind.person_writer {
        ChainPersonWriter::Own => Ok(own),
        ChainPersonWriter::Heads => heads().await,
        ChainPersonWriter::Both => Ok(own || heads().await?),
      }
    }
  }
}
