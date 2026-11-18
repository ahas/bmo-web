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
  asked_as(app, method, path, body, None).await
}

async fn asked_as(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  role: Option<&str>,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header(header::CONTENT_TYPE, "application/json");
  if let Some(role) = role {
    request = request.header("owner-key", "1").header("owner-role", role);
  }
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

#[tokio::test]
async fn the_administrator_builds_the_organisation_and_a_member_builds_nothing() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;
  let admin = Some("administrator");

  // A member is refused every one.
  for (method, path, body) in [
    (Method::GET, "/units".to_owned(), None),
    (Method::POST, "/units".to_owned(), Some(json!({ "name": "x" }))),
    (Method::PUT, format!("/units/{}/heads/{}", tree.team, tree.in_team), None),
  ] {
    let (status, said) = asked_as(&app, method, &path, body, Some("member")).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{path}: {said}");
  }

  // A part under the team, and a new company.
  let (status, part) = asked_as(
    &app,
    Method::POST,
    "/units",
    Some(json!({ "name": "part-a", "parent": tree.team })),
    admin,
  )
  .await;
  assert_eq!(status, StatusCode::CREATED, "{part}");
  assert_eq!(part["company"]["id"], tree.company);
  let part_id = part["id"].as_i64().unwrap();
  let (status, other) =
    asked_as(&app, Method::POST, "/units", Some(json!({ "name": "company-c" })), admin).await;
  assert_eq!(status, StatusCode::CREATED, "{other}");
  assert!(other.get("parent").is_none());

  // Renamed and moved under the centre; never into another company, never under itself.
  let (status, moved) = asked_as(
    &app,
    Method::PATCH,
    &format!("/units/{part_id}"),
    Some(json!({ "name": "part-b", "parent": tree.centre })),
    admin,
  )
  .await;
  assert_eq!(status, StatusCode::OK, "{moved}");
  assert_eq!(moved["name"], "part-b");
  assert_eq!(moved["parent"], tree.centre);
  let (status, said) = asked_as(
    &app,
    Method::PATCH,
    &format!("/units/{part_id}"),
    Some(json!({ "parent": other["id"] })),
    admin,
  )
  .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "other-company");
  let (status, said) = asked_as(
    &app,
    Method::PATCH,
    &format!("/units/{}", tree.centre),
    Some(json!({ "parent": part_id })),
    admin,
  )
  .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "cycle");

  // A head granted and taken away; a user placed.
  let path = format!("/units/{part_id}/heads/{}", tree.in_team);
  assert_eq!(asked_as(&app, Method::PUT, &path, None, admin).await.0, StatusCode::NO_CONTENT);
  let (_, check) = asked(
    &app,
    Method::POST,
    "/checks/unit",
    Some(json!({ "unit": part_id, "user": tree.in_team.to_string() })),
  )
  .await;
  assert_eq!(check["allowed"], true, "{check}");
  assert_eq!(asked_as(&app, Method::DELETE, &path, None, admin).await.0, StatusCode::NO_CONTENT);
  let (_, check) = asked(
    &app,
    Method::POST,
    "/checks/unit",
    Some(json!({ "unit": part_id, "user": tree.in_team.to_string() })),
  )
  .await;
  assert_eq!(check["allowed"], false, "{check}");
  let (status, placed) = asked_as(
    &app,
    Method::PUT,
    &format!("/users/{}/unit", tree.in_team),
    Some(json!({ "unit": part_id })),
    admin,
  )
  .await;
  assert_eq!(status, StatusCode::OK, "{placed}");
  assert_eq!(placed["unit"]["id"], part_id);

  // The whole tree reads companies first, each unit after its parent.
  let (status, units) = asked_as(&app, Method::GET, "/units", None, admin).await;
  assert_eq!(status, StatusCode::OK, "{units}");
  let order: Vec<i64> = units["units"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one["id"].as_i64().unwrap())
    .collect();
  let at = |id: i64| order.iter().position(|one| *one == id).unwrap();
  assert!(at(i64::from(tree.company)) < at(i64::from(tree.centre)));
  assert!(at(i64::from(tree.centre)) < at(part_id));
  let part_row = units["units"].as_array().unwrap().iter().find(|one| one["id"] == part_id).unwrap();
  assert_eq!(part_row["members"], json!([tree.in_team.to_string()]));
}

/// A request made as one user, by their key, in the member role.
async fn asked_by(app: &Router, method: Method, path: &str, user: i32) -> (StatusCode, Value) {
  let request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header("owner-key", user.to_string())
    .header("owner-role", "member")
    .body(Body::empty())
    .unwrap();
  let answer = app.clone().oneshot(request).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

#[tokio::test]
async fn a_head_marks_a_person_of_their_unit_left_and_nobody_else_does() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;

  head(&tree.scratch, tree.in_centre, tree.centre).await;

  // A person who heads nothing marks nobody left.
  let (status, said) =
    asked_by(&app, Method::POST, &format!("/users/{}/leave", tree.in_centre), tree.in_team).await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // A head of a unit beside the person's marks them no more than a person who heads nothing does.
  let beside = unit(&tree.scratch, "team-b", Some(tree.centre)).await;
  let in_beside = placed(&tree.scratch, "member-beside", beside).await;
  head(&tree.scratch, in_beside, beside).await;
  let (status, said) =
    asked_by(&app, Method::POST, &format!("/users/{}/leave", tree.in_team), in_beside).await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // A head of a unit above the person's marks them; their sign-in is disabled and the departure is read back.
  let (status, said) =
    asked_by(&app, Method::POST, &format!("/users/{}/leave", tree.in_team), tree.in_centre).await;
  assert_eq!(status, StatusCode::NO_CONTENT, "{said}");
  let enabled = one(
    tree.scratch.db(),
    r#"SELECT "is_enabled" FROM "users" WHERE "id" = $1"#,
    vec![tree.in_team.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<bool>("", "is_enabled")
  .unwrap();
  assert!(!enabled);
  let (_, node) = asked(&app, Method::GET, &format!("/users/{}/node", tree.in_team), None).await;
  assert_eq!(node["left"], true, "{node}");
  let (_, units) = asked_as(&app, Method::GET, "/units", None, Some("administrator")).await;
  let team = units["units"].as_array().unwrap().iter().find(|one| one["id"] == tree.team).unwrap();
  assert_eq!(team["left"], json!([tree.in_team.to_string()]), "{team}");
  let (_, team) = asked(&app, Method::GET, &format!("/units/{}", tree.team), None).await;
  assert_eq!(team["left"], json!([tree.in_team.to_string()]), "{team}");
  assert!(team["members"].as_array().unwrap().contains(&json!(tree.in_team.to_string())), "{team}");

  // Marking again changes nothing.
  assert_eq!(
    asked_by(&app, Method::POST, &format!("/users/{}/leave", tree.in_team), tree.in_centre)
      .await
      .0,
    StatusCode::NO_CONTENT
  );
}

#[tokio::test]
async fn several_people_move_into_a_unit_in_one_act_each_with_their_role() {
  ready();
  let tree = tree().await;
  let app = app(&tree.scratch).await;
  let admin = Some("administrator");
  let part = unit(&tree.scratch, "part-a", Some(tree.team)).await;
  let also_in_team = placed(&tree.scratch, "member-team-b", tree.team).await;
  head(&tree.scratch, tree.in_centre, tree.centre).await;
  let path = format!("/units/{part}/members");
  let unit_of = |user: i32| format!("/users/{user}/unit");

  // A member moves nobody.
  let body = json!({ "people": [{ "user": tree.in_team.to_string(), "from": tree.team, "head": false }] });
  let (status, said) = asked_as(&app, Method::POST, &path, Some(body), Some("member")).await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // Two people from two units in one act: one a member, the centre's head made the part's head and no longer
  // the centre's.
  let body = json!({ "people": [
    { "user": tree.in_team.to_string(), "from": tree.team, "head": false },
    { "user": tree.in_centre.to_string(), "from": tree.centre, "head": true },
  ] });
  let (status, moved) = asked_as(&app, Method::POST, &path, Some(body), admin).await;
  assert_eq!(status, StatusCode::OK, "{moved}");
  assert_eq!(moved["members"], json!([tree.in_team.to_string(), tree.in_centre.to_string()]));
  assert_eq!(moved["heads"], json!([tree.in_centre.to_string()]));
  let (_, centre) = asked(&app, Method::GET, &format!("/units/{}", tree.centre), None).await;
  assert_eq!(centre["heads"], json!([]), "{centre}");

  // A role changed without a move: the member made head, the head made a member.
  let body = json!({ "people": [
    { "user": tree.in_team.to_string(), "from": part, "head": true },
    { "user": tree.in_centre.to_string(), "from": part, "head": false },
  ] });
  let (status, moved) = asked_as(&app, Method::POST, &path, Some(body), admin).await;
  assert_eq!(status, StatusCode::OK, "{moved}");
  assert_eq!(moved["heads"], json!([tree.in_team.to_string()]));

  // One person moved meanwhile refuses the whole act, and nobody moves.
  let body = json!({ "people": [
    { "user": also_in_team.to_string(), "from": tree.team, "head": false },
    { "user": tree.in_team.to_string(), "from": tree.team, "head": false },
  ] });
  let (status, said) =
    asked_as(&app, Method::POST, &format!("/units/{}/members", tree.centre), Some(body), admin).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "moved");
  let (_, stands) = asked(&app, Method::GET, &unit_of(also_in_team), None).await;
  assert_eq!(stands["unit"]["id"], tree.team, "{stands}");

  // An account that has left is moved nowhere.
  let (status, _) =
    asked_as(&app, Method::POST, &format!("/users/{also_in_team}/leave"), None, admin).await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  let body = json!({ "people": [{ "user": also_in_team.to_string(), "from": tree.team, "head": false }] });
  let (status, said) = asked_as(&app, Method::POST, &path, Some(body), admin).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "left");

  // Nobody, somebody named twice, and a unit that does not stand.
  for (target, body, refused) in [
    (path.clone(), json!({ "people": [] }), StatusCode::BAD_REQUEST),
    (
      path.clone(),
      json!({ "people": [
        { "user": tree.in_team.to_string(), "from": part, "head": false },
        { "user": tree.in_team.to_string(), "from": part, "head": true },
      ] }),
      StatusCode::BAD_REQUEST,
    ),
    (
      "/units/999999/members".to_owned(),
      json!({ "people": [{ "user": tree.in_team.to_string(), "from": part, "head": false }] }),
      StatusCode::NOT_FOUND,
    ),
  ] {
    let (status, said) = asked_as(&app, Method::POST, &target, Some(body), admin).await;
    assert_eq!(status, refused, "{target}: {said}");
  }
  let (_, stands) = asked(&app, Method::GET, &unit_of(tree.in_team), None).await;
  assert_eq!(stands["unit"]["id"], part, "{stands}");
}
