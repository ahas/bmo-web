//! Concurrent posts (docs/accounts.md, 「Concurrent posts」; docs/boundary.md, 「Organisation units」): a person's
//! standing in a unit of their company other than their home unit, with a role of the catalogue or none and the
//! unit's head granted or not. A post lists the person in its unit and puts them in its line; their company, path
//! and own projects stay their home unit's. The administrator and a head of the unit or of one above give and take
//! one.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, put};
use bmo_web_client::{ConcurrentPost, HistoryChange, Post, PostAsk, Posts, UnitRef};
use sea_orm::{ConnectionTrait, QueryResult, TransactionTrait};

use crate::catalogue::{Entry, Roles, named};
use crate::history::{Change, record};
use crate::ids::shown;
use crate::readers::reader;
use crate::routes::{Answer, user_in};
use crate::units::{
  company_of, grant_head, heads_lastingly, path_of, take_lasting_head, unit_in, unit_of_user,
};
use crate::{Refusal, Service, all, now_ms, one, run};

/// The columns a post's role is read by, a post's row being `up` and its role's `pr`.
const ROLE_COLUMNS: &str = r#"pr."id" AS "role_id", pr."key" AS "role_key", pr."name" AS "role_name",
  pr."place" AS "role_place""#;

/// A post's role as a row carries it, where it carries one.
pub fn role_of(row: &QueryResult) -> Result<Option<Entry>, Refusal> {
  let id: Option<i64> = row.try_get("", "role_id")?;

  match id {
    Some(id) => Ok(Some(Entry {
      id,
      key: row.try_get("", "role_key")?,
      name: row.try_get("", "role_name")?,
      place: row.try_get("", "role_place")?,
    })),
    None => Ok(None),
  }
}

/// Whether the person `up."user_id"` names holds the head of the unit `up."unit_id"` names lastingly.
const POST_HEAD: &str = r#"EXISTS (
  SELECT 1 FROM "relation_tuples" ph
  WHERE ph."resource_type" = 'organization' AND ph."resource_id" = up."unit_id"::text
    AND ph."relation" = 'manager' AND ph."subject_type" = 'user' AND ph."subject_id" = up."user_id"::text
    AND ph."subject_relation" = '' AND ph."expires_at" IS NULL) AS "head""#;

/// The people holding a post in a unit, in their user ids' order.
pub async fn concurrent_in<C: ConnectionTrait>(db: &C, unit: i32) -> Result<Vec<ConcurrentPost>, Refusal> {
  let sql = format!(
    r#"SELECT up."user_id", {ROLE_COLUMNS}, {POST_HEAD}
       FROM "unit_posts" up
       LEFT JOIN "company_roles" pr ON pr."id" = up."role_id"
       WHERE up."unit_id" = $1::bigint
       ORDER BY up."user_id""#
  );

  all(db, &sql, vec![unit.into()])
    .await?
    .iter()
    .map(|row| {
      Ok(ConcurrentPost {
        user: shown(i32::try_from(row.try_get::<i64>("", "user_id")?).unwrap_or_default()),
        role: role_of(row)?.as_ref().map(Entry::role),
        head: row.try_get("", "head")?,
      })
    })
    .collect()
}

/// A person's posts, in the order of their units' paths.
pub async fn posts_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<Vec<Post>, Refusal> {
  let sql = format!(
    r#"SELECT up."unit_id", o."name" AS "unit_name", up."given_at", up."given_by", {ROLE_COLUMNS}, {POST_HEAD}
       FROM "unit_posts" up
       JOIN "organizations" o ON o."id" = up."unit_id"
       LEFT JOIN "company_roles" pr ON pr."id" = up."role_id"
       WHERE up."user_id" = $1::bigint"#
  );
  let mut posts = Vec::new();

  for row in all(db, &sql, vec![user.into()]).await? {
    let unit: i64 = row.try_get("", "unit_id")?;
    let by: Option<i64> = row.try_get("", "given_by")?;

    posts.push(Post {
      unit: UnitRef {
        id: unit,
        name: row.try_get("", "unit_name")?,
      },
      path: path_of(db, i32::try_from(unit).unwrap_or_default()).await?,
      role: role_of(&row)?.as_ref().map(Entry::role),
      head: row.try_get("", "head")?,
      since: row.try_get("", "given_at")?,
      by: by.map(|by| shown(i32::try_from(by).unwrap_or_default())),
    });
  }

  posts.sort_by_key(|post| post.path.iter().map(|step| step.name.to_lowercase()).collect::<Vec<_>>());

  Ok(posts)
}

/// The post a person holds in a unit and its role, where they hold one.
async fn post_of<C: ConnectionTrait>(
  db: &C,
  user: i32,
  unit: i32,
) -> Result<Option<Option<Entry>>, Refusal> {
  let sql = format!(
    r#"SELECT {ROLE_COLUMNS}
       FROM "unit_posts" up
       LEFT JOIN "company_roles" pr ON pr."id" = up."role_id"
       WHERE up."user_id" = $1::bigint AND up."unit_id" = $2::bigint"#
  );

  one(db, &sql, vec![user.into(), unit.into()])
    .await?
    .map(|row| role_of(&row))
    .transpose()
}

/// A person's post in a unit taken away with the lasting head grant it carried, and kept in their history.
/// Answers whether one stood.
pub async fn take<C: ConnectionTrait>(
  db: &C,
  user: i32,
  unit: i32,
  by: Option<i32>,
) -> Result<bool, Refusal> {
  let Some(role) = post_of(db, user, unit).await? else {
    return Ok(false);
  };

  run(
    db,
    r#"DELETE FROM "unit_posts" WHERE "user_id" = $1::bigint AND "unit_id" = $2::bigint"#,
    vec![user.into(), unit.into()],
  )
  .await?;
  take_lasting_head(db, unit, user, by).await?;
  record(db, by, Change::new(user, HistoryChange::PostTaken).unit(unit).before(role.as_ref())).await?;

  Ok(true)
}

/// Every post of a person's taken away, or those outside one company where `keep` names it.
pub async fn take_every<C: ConnectionTrait>(
  db: &C,
  user: i32,
  keep: Option<i32>,
  by: Option<i32>,
) -> Result<(), Refusal> {
  let units: Vec<i64> = all(
    db,
    r#"SELECT "unit_id" FROM "unit_posts" WHERE "user_id" = $1::bigint ORDER BY "unit_id""#,
    vec![user.into()],
  )
  .await?
  .iter()
  .map(|row| row.try_get("", "unit_id"))
  .collect::<Result<_, _>>()?;

  for unit in units {
    let unit = i32::try_from(unit).map_err(|_| Refusal::bad("a unit's number is out of range"))?;

    if keep.is_some() && company_of(db, unit).await? == keep {
      continue;
    }

    take(db, user, unit, by).await?;
  }

  Ok(())
}

/// A post given or changed: its role and its head grant as asked, each change kept in the history.
async fn give<C: ConnectionTrait>(
  db: &C,
  unit: i32,
  user: i32,
  ask: &PostAsk,
  by: Option<i32>,
) -> Result<(), Refusal> {
  let home = unit_of_user(db, user)
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let left = one(db, r#"SELECT 1 FROM "user_departures" WHERE "user_id" = $1::bigint"#, vec![user.into()])
    .await?
    .is_some();

  if left {
    return Err(Refusal::new(StatusCode::CONFLICT, "an account that has left holds no post").coded("left"));
  }

  if home == unit {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "a person holds no post in their home unit").coded("home-unit"),
    );
  }

  let company = company_of(db, unit).await?.ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;

  if company_of(db, home).await? != Some(company) {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "a post stands in the home unit's company alone")
        .coded("other-company"),
    );
  }

  let role = match ask.role.as_deref().map(str::trim).filter(|key| !key.is_empty()) {
    Some(key) => Some(named::<Roles, _>(db, company, key).await?),
    None => None,
  };

  match post_of(db, user, unit).await? {
    None => {
      run(
        db,
        r#"INSERT INTO "unit_posts" ("user_id", "unit_id", "role_id", "given_by", "given_at")
           VALUES ($1::bigint, $2::bigint, $3, $4::bigint, $5)"#,
        vec![
          user.into(),
          unit.into(),
          role.as_ref().map(|role| role.id).into(),
          by.into(),
          now_ms().into(),
        ],
      )
      .await?;
      record(db, by, Change::new(user, HistoryChange::PostGiven).unit(unit).after(role.as_ref())).await?;
    }
    Some(before) if before.as_ref().map(|role| role.id) != role.as_ref().map(|role| role.id) => {
      run(
        db,
        r#"UPDATE "unit_posts" SET "role_id" = $3 WHERE "user_id" = $1::bigint AND "unit_id" = $2::bigint"#,
        vec![user.into(), unit.into(), role.as_ref().map(|role| role.id).into()],
      )
      .await?;
      record(
        db,
        by,
        Change::new(user, HistoryChange::PostChanged)
          .unit(unit)
          .before(before.as_ref())
          .after(role.as_ref()),
      )
      .await?;
    }
    Some(_) => {}
  }

  if ask.head {
    grant_head(db, unit, user, by).await?;
  } else if heads_lastingly(db, unit, user).await? {
    take_lasting_head(db, unit, user, by).await?;
  }

  Ok(())
}

/// The unit a post's route names, where the reader may give and take posts in it: the administrator and a head
/// of the unit or of one above.
async fn post_unit(service: &Service, headers: &HeaderMap, unit: &str) -> Result<(i32, i32), Refusal> {
  let reader = reader(&service.db, headers).await?;
  let unit = unit_in(unit)?;

  one(
    &service.db,
    r#"SELECT 1 FROM "organizations" WHERE "id" = $1::bigint"#,
    vec![unit.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no unit {unit}")))?;

  if !reader.heads(&service.db, unit).await? {
    return Err(Refusal::forbidden(
      "a post is given by the administrator or a head of the unit or of one above",
    ));
  }

  Ok((unit, reader.user))
}

async fn give_route(
  State(service): State<Service>,
  Path((unit, user)): Path<(String, String)>,
  headers: HeaderMap,
  crate::routes::Body(ask): crate::routes::Body<PostAsk>,
) -> Answer<Post> {
  let (unit, by) = post_unit(&service, &headers, &unit).await?;
  let user = user_in(&user)?;
  let txn = service.db.begin().await?;

  match give(&txn, unit, user, &ask, Some(by)).await {
    Ok(()) => txn.commit().await?,
    Err(refused) => {
      txn.rollback().await?;

      return Err(refused);
    }
  }

  posts_of(&service.db, user)
    .await?
    .into_iter()
    .find(|post| post.unit.id == i64::from(unit))
    .map(Json)
    .ok_or_else(|| Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, "the post does not stand"))
}

async fn take_route(
  State(service): State<Service>,
  Path((unit, user)): Path<(String, String)>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let (unit, by) = post_unit(&service, &headers, &unit).await?;
  let user = user_in(&user)?;
  let txn = service.db.begin().await?;

  match take(&txn, user, unit, Some(by)).await {
    Ok(true) => {
      txn.commit().await?;

      Ok(StatusCode::NO_CONTENT)
    }
    Ok(false) => {
      txn.rollback().await?;

      Err(Refusal::absent(format!("user {user} holds no post in unit {unit}")))
    }
    Err(refused) => {
      txn.rollback().await?;

      Err(refused)
    }
  }
}

/// `GET /users/{user}/posts`: a person's posts, for anyone of their company.
async fn posts_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<Posts> {
  let reader = reader(&service.db, &headers).await?;
  let user = user_in(&user)?;
  let absent = || Refusal::absent(format!("no user {user}"));
  let home = unit_of_user(&service.db, user).await?.ok_or_else(absent)?;
  let company = company_of(&service.db, home).await?.ok_or_else(absent)?;

  if !reader.reaches(company) {
    return Err(absent());
  }

  Ok(Json(Posts {
    posts: posts_of(&service.db, user).await?,
  }))
}

/// The routes of this module.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/units/{unit}/posts/{user}", put(give_route).delete(take_route))
    .route("/users/{user}/posts", get(posts_route))
}
