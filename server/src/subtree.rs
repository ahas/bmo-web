//! Everyone under a unit (docs/accounts.md, 「Everyone under a unit」; docs/boundary.md, 「Organisation units」): a
//! unit and every unit below it in one read, in tree order, each with its heads, the acting one marked, its members
//! with their roles and the people holding a post in it. The administrator and a head of the unit or of a unit
//! above read it; anyone of another company is answered as if no unit stood there.

use std::collections::HashMap;

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{KindRef, LineHead, SubtreeMember, SubtreePost, SubtreeUnit, UnitSubtree};
use sea_orm::{ConnectionTrait, QueryResult};

use crate::ids::shown;
use crate::people::role_of;
use crate::posts::{POST_HEAD, ROLE_COLUMNS};
use crate::readers::reader;
use crate::routes::Answer;
use crate::units::{HEAD_GRANT, UNIT};
use crate::{Refusal, Service, all};

/// The units of the subtree of the unit `$1` names, itself among them.
const UNDER: &str = r#"(SELECT "descendant_id" FROM "org_closure" WHERE "ancestor_id" = $1)"#;

/// The name a person goes by, the login where none stands, the user's row being `u`.
const NAME: &str = r#"COALESCE(NULLIF(u."full_name", ''), u."username")"#;

/// The people of each unit, in the order the rows came, by the unit they stand in.
type ByUnit<T> = HashMap<i32, Vec<T>>;

/// Each row's person put under the unit its `unit` column names, in the order the rows came.
fn grouped<T>(
  rows: &[QueryResult],
  unit: &str,
  each: impl Fn(&QueryResult) -> Result<T, Refusal>,
) -> Result<ByUnit<T>, Refusal> {
  let mut grouped: ByUnit<T> = HashMap::new();

  for row in rows {
    let at = i32::try_from(row.try_get::<i64>("", unit)?).unwrap_or_default();

    grouped.entry(at).or_default().push(each(row)?);
  }

  Ok(grouped)
}

/// The heads granted each unit of the subtree directly, an acting grant and a grant through a post marked.
async fn heads<C: ConnectionTrait>(db: &C, unit: i32) -> Result<ByUnit<LineHead>, Refusal> {
  let sql = format!(
    r#"SELECT t."resource_id"::bigint AS "unit", u."id", {NAME} AS "name",
         bool_or(t."expires_at" IS NOT NULL) AS "acting",
         EXISTS (SELECT 1 FROM "unit_posts" up
                 WHERE up."user_id" = u."id" AND up."unit_id" = t."resource_id"::bigint) AS "concurrent"
       FROM "relation_tuples" t
       JOIN "users" u ON u."id"::text = t."subject_id"
       WHERE t."resource_type" = '{UNIT}' AND t."relation" = '{HEAD_GRANT}'
         AND t."subject_type" = 'user' AND t."subject_relation" = ''
         AND (t."expires_at" IS NULL OR t."expires_at" > now())
         AND t."resource_id" IN (SELECT "descendant_id"::text FROM "org_closure" WHERE "ancestor_id" = $1)
       GROUP BY t."resource_id", u."id"
       ORDER BY lower({NAME}), u."id""#
  );

  grouped(&all(db, &sql, vec![unit.into()]).await?, "unit", |row| {
    Ok(LineHead {
      user: shown(row.try_get("", "id")?),
      name: row.try_get("", "name")?,
      acting: row.try_get("", "acting")?,
      concurrent: row.try_get("", "concurrent")?,
    })
  })
}

/// The people whose home unit is a unit of the subtree, each with the role they carry there and whether their
/// account has left.
async fn members<C: ConnectionTrait>(db: &C, unit: i32) -> Result<ByUnit<SubtreeMember>, Refusal> {
  let sql = format!(
    r#"SELECT u."organization_id"::bigint AS "unit", u."id", {NAME} AS "name",
         r."key" AS "role_key", r."name" AS "role_name", r."place" AS "role_place",
         EXISTS (SELECT 1 FROM "user_departures" d WHERE d."user_id" = u."id") AS "left"
       FROM "users" u
       LEFT JOIN "user_roles" ur ON ur."user_id" = u."id"
       LEFT JOIN "company_roles" r ON r."id" = ur."role_id"
       WHERE u."organization_id" IN {UNDER}
       ORDER BY lower({NAME}), u."id""#
  );

  grouped(&all(db, &sql, vec![unit.into()]).await?, "unit", |row| {
    Ok(SubtreeMember {
      user: shown(row.try_get("", "id")?),
      name: row.try_get("", "name")?,
      role: role_of(row)?,
      left: row.try_get("", "left")?,
    })
  })
}

/// The people holding a post in a unit of the subtree, each with the post's role and whether it carries the unit's
/// head.
async fn posts<C: ConnectionTrait>(db: &C, unit: i32) -> Result<ByUnit<SubtreePost>, Refusal> {
  let sql = format!(
    r#"SELECT up."unit_id" AS "unit", up."user_id", {NAME} AS "name", {ROLE_COLUMNS}, {POST_HEAD}
       FROM "unit_posts" up
       JOIN "users" u ON u."id" = up."user_id"
       LEFT JOIN "company_roles" pr ON pr."id" = up."role_id"
       WHERE up."unit_id" IN {UNDER}
       ORDER BY lower({NAME}), up."user_id""#
  );

  grouped(&all(db, &sql, vec![unit.into()]).await?, "unit", |row| {
    Ok(SubtreePost {
      user: shown(i32::try_from(row.try_get::<i64>("", "user_id")?).unwrap_or_default()),
      name: row.try_get("", "name")?,
      role: role_of(row)?,
      head: row.try_get("", "head")?,
    })
  })
}

/// One unit of the subtree as its row stands, before its people are put in.
struct Node {
  id: i32,
  name: String,
  parent: Option<i32>,
  kind: Option<KindRef>,
  short_name: Option<String>,
}

/// The units of the subtree, siblings by name and then by id.
async fn nodes<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<Node>, Refusal> {
  let sql = format!(
    r#"SELECT o."id", o."name", o."parent_id", k."key" AS "kind_key", k."name" AS "kind_name", a."short_name"
       FROM "organizations" o
       LEFT JOIN "unit_attributes" a ON a."unit_id" = o."id"
       LEFT JOIN "unit_kinds" k ON k."id" = a."kind_id"
       WHERE o."id" IN {UNDER}
       ORDER BY o."name", o."id""#
  );

  all(db, &sql, vec![unit.into()])
    .await?
    .iter()
    .map(|row| {
      let key: Option<String> = row.try_get("", "kind_key")?;

      Ok(Node {
        id: row.try_get("", "id")?,
        name: row.try_get("", "name")?,
        parent: row.try_get("", "parent_id")?,
        kind: match key {
          Some(key) => Some(KindRef {
            key,
            name: row.try_get("", "kind_name")?,
          }),
          None => None,
        },
        short_name: row.try_get("", "short_name")?,
      })
    })
    .collect()
}

/// The nodes in tree order from `top`: each followed by every node under it before its next sibling, siblings in
/// the order they came.
fn in_tree_order(top: i32, nodes: Vec<Node>) -> Vec<Node> {
  let mut under: HashMap<Option<i32>, Vec<Node>> = HashMap::new();
  let mut ordered = Vec::with_capacity(nodes.len());
  let mut start = None;

  for node in nodes {
    if node.id == top {
      start = Some(node);
    } else {
      under.entry(node.parent).or_default().push(node);
    }
  }

  // A stack of the nodes still to stand, the next to stand on top: a node's children are pushed last first, so
  // the first of them stands next.
  let mut stack: Vec<Node> = start.into_iter().collect();

  while let Some(node) = stack.pop() {
    if let Some(children) = under.remove(&Some(node.id)) {
      stack.extend(children.into_iter().rev());
    }

    ordered.push(node);
  }

  ordered
}

/// A unit and every unit below it in tree order, each with its heads, its members and the people holding a post
/// in it.
pub async fn subtree<C: ConnectionTrait>(db: &C, unit: i32) -> Result<UnitSubtree, Refusal> {
  let nodes = in_tree_order(unit, nodes(db, unit).await?);
  let mut heads = heads(db, unit).await?;
  let mut members = members(db, unit).await?;
  let mut posts = posts(db, unit).await?;

  Ok(UnitSubtree {
    units: nodes
      .into_iter()
      .map(|node| SubtreeUnit {
        id: i64::from(node.id),
        name: node.name,
        parent: node.parent.map(i64::from),
        kind: node.kind,
        short_name: node.short_name,
        heads: heads.remove(&node.id).unwrap_or_default(),
        members: members.remove(&node.id).unwrap_or_default(),
        concurrent: posts.remove(&node.id).unwrap_or_default(),
      })
      .collect(),
  })
}

async fn subtree_route(
  State(service): State<Service>,
  Path(unit): Path<String>,
  headers: HeaderMap,
) -> Answer<UnitSubtree> {
  let db = &service.db;
  let reader = reader(db, &headers).await?;
  let (unit, _) = reader.reached(db, &unit).await?;

  if !reader.heads(db, unit).await? {
    return Err(Refusal::forbidden(
      "a unit's subtree is read by the administrator or a head of the unit or of a unit above it",
    ));
  }

  Ok(Json(subtree(db, unit).await?))
}

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new().route("/units/{unit}/subtree", get(subtree_route))
}
