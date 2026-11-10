//! Companies and organisation units (docs/accounts.md, 「Companies and organisation units」): a company is a
//! unit with no parent, a user stands in one unit and belongs to its company, a unit answers its path, its
//! children, its heads and its members, and a head of a unit heads every unit below it and none above.

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

/// A company with a centre under it and a team under the centre, and a user standing in each of the team and
/// the centre.
struct Tree {
  scratch: Scratch,
  company: i32,
  centre: i32,
  team: i32,
  in_team: i32,
  in_centre: i32,
}

async fn unit(scratch: &Scratch, name: &str, parent: Option<i32>) -> i32 {
  one(
    scratch.db(),
    r#"INSERT INTO "organizations" ("name", "parent_id") VALUES ($1, $2) RETURNING "id""#,
    vec![name.into(), parent.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<i32>("", "id")
  .unwrap()
}

async fn placed(scratch: &Scratch, name: &str, unit: i32) -> i32 {
  let user = set_sign_in(scratch.db(), name, "the password", false).await.unwrap().user;

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![unit.into(), user.into()],
    )
    .await;

  user
}

async fn head(scratch: &Scratch, user: i32, unit: i32) {
  scratch
    .run(
      r#"INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
         VALUES ('organization', $1, 'manager', 'user', $2, '')"#,
      vec![unit.to_string().into(), user.to_string().into()],
    )
    .await;
}

async fn tree() -> Tree {
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![ROOM],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();
  let company = unit(&scratch, "company-a", None).await;
  let centre = unit(&scratch, "centre-a", Some(company)).await;
  let team = unit(&scratch, "team-a", Some(centre)).await;
  let in_team = placed(&scratch, "member-team", team).await;
  let in_centre = placed(&scratch, "member-centre", centre).await;

  Tree {
    scratch,
    company,
    centre,
    team,
    in_team,
    in_centre,
  }
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

async fn asked(app: &Router, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
  let request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header(header::CONTENT_TYPE, "application/json");
  let body = body.map(|body| Body::from(body.to_string())).unwrap_or_else(Body::empty);
  let answer = app.clone().oneshot(request.body(body).unwrap()).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

fn ids(said: &Value) -> Vec<i64> {
  said.as_array().unwrap().iter().map(|one| one["id"].as_i64().unwrap()).collect()
}

#[tokio::test]
async fn a_user_reads_their_unit_its_company_and_the_path_between() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;
  let (status, said) = asked(&app, Method::GET, &format!("/users/{}/unit", tree.in_team), None).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["user"], tree.in_team.to_string(), "{said}");
  assert_eq!(said["unit"], json!({ "id": tree.team, "name": "team-a" }), "{said}");
  assert_eq!(said["company"], json!({ "id": tree.company, "name": "company-a" }), "{said}");
  assert_eq!(
    ids(&said["path"]),
    vec![i64::from(tree.company), i64::from(tree.centre), i64::from(tree.team)],
    "{said}"
  );

  let (status, said) = asked(&app, Method::GET, "/users/999999/unit", None).await;

  assert_eq!(status, StatusCode::NOT_FOUND, "{said}");
}

#[tokio::test]
async fn a_unit_answers_its_parent_children_heads_and_members() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;

  head(&tree.scratch, tree.in_centre, tree.centre).await;

  let (status, said) = asked(&app, Method::GET, &format!("/units/{}", tree.centre), None).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["name"], "centre-a", "{said}");
  assert_eq!(said["parent"], tree.company, "{said}");
  assert_eq!(said["company"]["id"], tree.company, "{said}");
  assert_eq!(ids(&said["children"]), vec![i64::from(tree.team)], "{said}");
  assert_eq!(said["heads"], json!([tree.in_centre.to_string()]), "{said}");
  assert_eq!(said["members"], json!([tree.in_centre.to_string()]), "{said}");

  // A company is a unit with no parent: its company and its path are itself.
  let (status, said) = asked(&app, Method::GET, &format!("/units/{}", tree.company), None).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said.get("parent").is_none(), "{said}");
  assert_eq!(said["company"]["id"], tree.company, "{said}");
  assert_eq!(ids(&said["path"]), vec![i64::from(tree.company)], "{said}");

  let (status, said) = asked(&app, Method::GET, "/units/999999", None).await;

  assert_eq!(status, StatusCode::NOT_FOUND, "{said}");
}

#[tokio::test]
async fn a_head_heads_the_units_below_and_not_the_one_above() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;

  head(&tree.scratch, tree.in_centre, tree.centre).await;

  for (unit, user, heads) in [
    (tree.centre, tree.in_centre, true),
    (tree.team, tree.in_centre, true),
    (tree.company, tree.in_centre, false),
    (tree.team, tree.in_team, false),
  ] {
    let (status, said) = asked(
      &app,
      Method::POST,
      "/checks/unit",
      Some(json!({ "unit": unit, "user": user.to_string() })),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{said}");
    assert_eq!(said["allowed"], heads, "unit {unit}, user {user}: {said}");
    assert_eq!(said["grant"], format!("organization:{unit}#manage"), "{said}");
  }

  let (status, said) = asked(
    &app,
    Method::POST,
    "/checks/unit",
    Some(json!({ "unit": 999999, "user": tree.in_centre.to_string() })),
  )
  .await;

  assert_eq!(status, StatusCode::NOT_FOUND, "{said}");
}

#[tokio::test]
async fn the_people_of_a_company_are_found_across_its_units() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;
  let outside_company = unit(&tree.scratch, "company-b", None).await;
  let outsider = placed(&tree.scratch, "member-outside", outside_company).await;
  let key = tree.in_team.to_string();
  let request = |path: String| {
    Request::builder()
      .method(Method::GET)
      .uri(path)
      .header("x-real-ip", "127.0.0.1")
      .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
      .header("owner-key", key.clone())
      .header("owner-role", "member")
      .body(Body::empty())
      .unwrap()
  };
  let answer = app.clone().oneshot(request("/users/search?q=member-".into())).await.unwrap();

  assert_eq!(answer.status(), StatusCode::OK);
  let said: Value =
    serde_json::from_slice(&answer.into_body().collect().await.unwrap().to_bytes()).unwrap();
  let names: Vec<&str> = said["people"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one["name"].as_str().unwrap())
    .collect();

  assert!(names.contains(&"member-team"), "{said}");
  assert!(names.contains(&"member-centre"), "{said}");
  assert!(!names.contains(&"member-outside"), "{said}");

  let answer = app.clone().oneshot(request(format!("/users/{}/person", tree.in_centre))).await.unwrap();

  assert_eq!(answer.status(), StatusCode::OK);

  let answer = app.clone().oneshot(request(format!("/users/{outsider}/person"))).await.unwrap();

  assert_eq!(answer.status(), StatusCode::NOT_FOUND);
}
