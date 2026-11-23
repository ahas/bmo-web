//! The delegation chain's routes (docs/boundary.md, 「The delegation chain」): the kinds declared and declaring one,
//! a setting resolved for a person or a unit, and a link's entry read and written by the login `Owner-Key` names.

use axum::Json;
use axum::Router;
use axum::extract::{Path as Segment, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, put};
use bmo_web_client::{
  ChainDelegationAsk, ChainEntry, ChainKind, ChainKinds, ChainLinkStanding, ChainResolution,
  ChainResolveAsk, ChainRule, ChainRulesAsk, ChainShape, ChainValueAsk,
};

use super::{Link, Subject, Who, entries, kind, kinds, lock_above, writes};
use crate::ids::{parsed, shown};
use crate::readers::{Reader, reader};
use crate::routes::{Answer, Body};
use crate::{Refusal, Service};

/// The routes of the chain, its groups' among them.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/chain/kinds", get(kinds_route))
    .route("/chain/kinds/{key}", get(kind_route).put(declare_route))
    .route("/chain/kinds/{key}/resolve", get(resolve_route))
    .route("/chain/kinds/{key}/links/{link}", get(entry_route).delete(clear_route))
    .route("/chain/kinds/{key}/links/{link}/value", put(value_route))
    .route("/chain/kinds/{key}/links/{link}/delegation", put(delegation_route))
    .route("/chain/kinds/{key}/links/{link}/rules", put(rules_route))
    .merge(super::groups::routes())
}

fn link_in(word: &str) -> Result<Link, Refusal> {
  Link::parse(word).ok_or_else(|| Refusal::bad(format!("`{word}` is no link")).coded("bad-link"))
}

async fn kinds_route(State(service): State<Service>) -> Answer<ChainKinds> {
  Ok(Json(ChainKinds {
    kinds: kinds(&service.db).await?,
  }))
}

async fn kind_route(State(service): State<Service>, Segment(key): Segment<String>) -> Answer<ChainKind> {
  Ok(Json(kind(&service.db, &key).await?))
}

async fn declare_route(
  State(service): State<Service>,
  Segment(key): Segment<String>,
  Body(declared): Body<ChainKind>,
) -> Answer<ChainKind> {
  if declared.key != key {
    return Err(
      Refusal::bad(format!("the body declares `{}`, the path names `{key}`", declared.key))
        .coded("bad-kind"),
    );
  }

  Ok(Json(super::declare(&service.db, &declared).await?))
}

async fn resolve_route(
  State(service): State<Service>,
  Segment(key): Segment<String>,
  Query(ask): Query<ChainResolveAsk>,
) -> Answer<ChainResolution> {
  let db = &service.db;
  let kind = kind(db, &key).await?;
  let subject = match (&ask.person, ask.unit) {
    (Some(user), None) => {
      Subject::Person(parsed(user).ok_or_else(|| Refusal::bad(format!("`{user}` is no user's id")))?)
    }
    (None, Some(unit)) => {
      Subject::Unit(i32::try_from(unit).map_err(|_| Refusal::bad(format!("{unit} is no unit's number")))?)
    }
    _ => return Err(Refusal::bad("a resolution names a person or a unit, one of them")),
  };
  let (_, resolved) = super::resolve(db, &kind, subject).await?;
  let link = match ask.link.as_deref() {
    Some(word) => {
      let link = link_in(word)?;
      let locked_by = super::locked_over(db, &kind.key, link).await?;

      Some(ChainLinkStanding {
        link: link.to_string(),
        may_change: kind.levels.contains(&link.level()) && locked_by.is_none(),
        locked_by: locked_by.map(|lock| lock.to_string()),
      })
    }
    None => None,
  };

  Ok(Json(resolved.wire(&kind, subject, link)))
}

/// The entry of a link as the reader is shown it, with the lock above it and whether they may change it now.
async fn entry_view(service: &Service, who: &Reader, kind: &ChainKind, link: Link) -> Answer<ChainEntry> {
  let db = &service.db;
  let path = super::Path::ending_at(db, link).await?;
  let mut held = entries(db, &kind.key, Some(&path.links)).await?;
  let locked_by = lock_above(&path, &held);
  let writer = writes(db, who, kind, link).await?;

  if !writer && link != Link::Person(who.user) {
    return Err(Refusal::forbidden(format!("{link} of `{}` is read by its writers", kind.key)));
  }

  let entry = held.remove(&link).unwrap_or_default();

  Ok(Json(ChainEntry {
    kind: kind.key.clone(),
    link: link.to_string(),
    value: entry.value,
    delegation: entry.delegation,
    rules: entry
      .rules
      .into_iter()
      .map(|(who, value)| ChainRule {
        who: who.to_string(),
        value,
      })
      .collect(),
    set_by: entry.set_by.map(shown),
    set_at: entry.set_at,
    locked_by: locked_by.map(|lock| lock.to_string()),
    writable: writer && (locked_by.is_none() || who.administrator) && kind.levels.contains(&link.level()),
  }))
}

/// The kind, the link and the reader of a write, refused where the reader does not write the link.
async fn writer(
  service: &Service,
  headers: &HeaderMap,
  key: &str,
  link: &str,
) -> Result<(Reader, ChainKind, Link), Refusal> {
  let db = &service.db;
  let who = reader(db, headers).await?;
  let kind = kind(db, key).await?;
  let link = link_in(link)?;

  super::Path::ending_at(db, link).await?;
  if !writes(db, &who, &kind, link).await? {
    return Err(Refusal::forbidden(format!("{link} of `{key}` is written by its writers alone")));
  }

  Ok((who, kind, link))
}

async fn entry_route(
  State(service): State<Service>,
  Segment((key, link)): Segment<(String, String)>,
  headers: HeaderMap,
) -> Answer<ChainEntry> {
  let who = reader(&service.db, &headers).await?;
  let kind = kind(&service.db, &key).await?;

  entry_view(&service, &who, &kind, link_in(&link)?).await
}

async fn value_route(
  State(service): State<Service>,
  Segment((key, link)): Segment<(String, String)>,
  headers: HeaderMap,
  Body(ask): Body<ChainValueAsk>,
) -> Answer<ChainEntry> {
  let (who, kind, link) = writer(&service, &headers, &key, &link).await?;
  let declarer = headers.get("declared-by").and_then(|value| value.to_str().ok()).map(str::trim);

  // A `json` value is judged by its consumer, which writes it naming itself as the unit that declared the kind.
  if kind.shape == ChainShape::Json && declarer != Some(kind.declared_by.as_str()) {
    return Err(
      Refusal::new(StatusCode::CONFLICT, format!("`{key}` is judged and written by its consumer alone"))
        .coded("consumer-written"),
    );
  }

  super::put_value(&service.db, &kind, link, ask.value.as_ref(), Some(who.user)).await?;
  entry_view(&service, &who, &kind, link).await
}

async fn delegation_route(
  State(service): State<Service>,
  Segment((key, link)): Segment<(String, String)>,
  headers: HeaderMap,
  Body(ask): Body<ChainDelegationAsk>,
) -> Answer<ChainEntry> {
  let (who, kind, link) = writer(&service, &headers, &key, &link).await?;

  super::put_delegation(&service.db, &kind, link, ask.delegation, Some(who.user)).await?;
  entry_view(&service, &who, &kind, link).await
}

async fn rules_route(
  State(service): State<Service>,
  Segment((key, link)): Segment<(String, String)>,
  headers: HeaderMap,
  Body(ask): Body<ChainRulesAsk>,
) -> Answer<ChainEntry> {
  let (who, kind, link) = writer(&service, &headers, &key, &link).await?;
  let rules = ask
    .rules
    .into_iter()
    .map(|rule| {
      Who::parse(&rule.who)
        .map(|named| (named, rule.value))
        .ok_or_else(|| Refusal::bad(format!("`{}` names nobody a rule names", rule.who)).coded("bad-rule"))
    })
    .collect::<Result<Vec<_>, _>>()?;

  super::put_rules(&service.db, &kind, link, &rules, Some(who.user)).await?;
  entry_view(&service, &who, &kind, link).await
}

async fn clear_route(
  State(service): State<Service>,
  Segment((key, link)): Segment<(String, String)>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let (who, kind, link) = writer(&service, &headers, &key, &link).await?;

  super::clear(&service.db, &kind, link, Some(who.user)).await?;

  Ok(StatusCode::NO_CONTENT)
}
