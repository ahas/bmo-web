//! The platform administrator's permanent delete (docs/accounts.md, 「Deleting an account for good」, 「Deleting a
//! unit or a company」 and 「The removal record」): the read counts what the delete removes, each refusal in its
//! order, the secret spaces taken with the rows, another account's rows left standing, and the record kept.

use std::path::{Path, PathBuf};

use crate::support::{OWNER, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::secrets::Store;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

/// The move's administrator's company, with a second administrator and a member in it; another company with a
/// division under it and a team under that, a person in the team; and a secret store on a folder of its own.
struct World {
  scratch: Scratch,
  app: Router,
  _folder: tempfile::TempDir,
  env: PathBuf,
  administrator: i32,
  second_administrator: i32,
  company: i32,
  member: i32,
  bystander: i32,
  other_company: i32,
  division: i32,
  team: i32,
  in_team: i32,
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

async fn placed(scratch: &Scratch, name: &str, unit: i32, administrator: bool) -> i32 {
  let user = set_sign_in(scratch.db(), name, "the password", administrator).await.unwrap().user;

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![unit.into(), user.into()],
    )
    .await;

  user
}

fn secret(env: &Path, space: &str, name: &str) {
  let folder = env.join(space);

  std::fs::create_dir_all(&folder).unwrap();
  std::fs::write(folder.join(name), "a value").unwrap();
}

async fn world() -> World {
  ready();
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
    },
  )
  .await
  .unwrap();
  let administrator = one(scratch.db(), r#"SELECT "id" FROM "users" WHERE "username" = 'boss'"#, vec![])
    .await
    .unwrap()
    .unwrap()
    .try_get::<i32>("", "id")
    .unwrap();
  let company = one(
    scratch.db(),
    r#"SELECT "organization_id" FROM "users" WHERE "id" = $1"#,
    vec![administrator.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<i32>("", "organization_id")
  .unwrap();
  let second_administrator = placed(&scratch, "second-boss", company, true).await;
  let member = placed(&scratch, "member-a", company, false).await;
  let bystander = placed(&scratch, "member-b", company, false).await;
  let other_company = unit(&scratch, "company-b", None).await;
  let division = unit(&scratch, "division-b", Some(other_company)).await;
  let team = unit(&scratch, "team-b", Some(division)).await;
  let in_team = placed(&scratch, "member-team", team, false).await;
  let folder = tempfile::tempdir().unwrap();
  let env = folder.path().join("env");

  std::fs::create_dir_all(&env).unwrap();
  secret(&env, &format!("users/{member}"), "token-a");
  secret(&env, &format!("users/{member}"), "token-a.previous");
  secret(&env, &format!("users/{bystander}"), "token-b");
  secret(&env, &format!("units/{team}"), "unit-key");
  secret(&env, "", "platform-key");

  let service = scratch.service.clone().keeping_secrets(Store::at(&env));
  let app = in_force(service, TOKEN.into()).await.unwrap();

  World {
    scratch,
    app,
    _folder: folder,
    env,
    administrator,
    second_administrator,
    company,
    member,
    bystander,
    other_company,
    division,
    team,
    in_team,
  }
}

impl World {
  /// A request made for `user` in `role`.
  async fn as_role(
    &self,
    method: Method,
    path: &str,
    body: Option<Value>,
    user: i32,
    role: &str,
  ) -> (StatusCode, Value) {
    let request = Request::builder()
      .method(method)
      .uri(path)
      .header("x-real-ip", "127.0.0.1")
      .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
      .header(header::CONTENT_TYPE, "application/json")
      .header("owner-key", user.to_string())
      .header("owner-role", role)
      .body(body.map(|body| Body::from(body.to_string())).unwrap_or_else(Body::empty))
      .unwrap();
    let answer = self.app.clone().oneshot(request).await.unwrap();
    let status = answer.status();
    let bytes = answer.into_body().collect().await.unwrap().to_bytes();
    let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

    (status, said)
  }

  async fn admin(&self, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    self.as_role(method, path, body, self.administrator, "administrator").await
  }

  async fn count(&self, sql: &str, user: i32) -> i64 {
    self.scratch.count(sql, vec![user.into()]).await
  }

  /// Rows of several kinds for `user`: a profile, a sender, a presence switch, a sign-in, a post in `unit` and a grant.
  async fn rows_of(&self, user: i32, unit: i32, sender: i64) {
    let db = &self.scratch;

    db.run(
      r#"INSERT INTO "user_profiles" ("user_id", "job_title", "landline", "mobile", "email", "updated_at")
         VALUES ($1, 'a title', '', '', '', 1)"#,
      vec![user.into()],
    )
    .await;
    db.run(
      r#"INSERT INTO "user_senders" ("sender_id", "user_id", "linked_at") VALUES ($1, $2, 1)"#,
      vec![sender.into(), user.into()],
    )
    .await;
    db.run(
      r#"INSERT INTO "web_presence_hidden" ("user_id", "hidden_at") VALUES ($1, 1)"#,
      vec![user.into()],
    )
    .await;
    db.run(
      r#"INSERT INTO "user_sign_ins" ("user_id", "signed_in_at") VALUES ($1, 1)"#,
      vec![user.into()],
    )
    .await;
    db.run(
      r#"INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
         VALUES ('bmo_section', 'notes', 'read', 'user', $1, '')"#,
      vec![user.to_string().into()],
    )
    .await;
    db.run(
      r#"INSERT INTO "unit_posts" ("user_id", "unit_id", "role_id", "given_by", "given_at") VALUES ($1, $2, NULL, NULL, 1)"#,
      vec![user.into(), unit.into()],
    )
    .await;
  }
}

fn path_of(env: &Path, space: &str) -> PathBuf {
  env.join(space)
}

/// The counts a read answered, beside the counts a delete answered, as maps of whole numbers.
fn counts(said: &Value, field: &str) -> serde_json::Map<String, Value> {
  said[field].as_object().cloned().unwrap_or_default()
}

#[tokio::test]
async fn an_account_is_counted_refused_until_it_left_then_deleted_whole_and_recorded() {
  let world = world().await;
  let member = world.member;
  let bystander = world.bystander;

  world.rows_of(member, world.division, 9001).await;
  world.rows_of(bystander, world.division, 9002).await;

  let (status, read) = world.admin(Method::GET, &format!("/users/{member}/removal"), None).await;
  assert_eq!(status, StatusCode::OK, "{read}");
  assert_eq!(read["name"], "member-a");
  assert_eq!(read["left"], false);
  assert_eq!(read["refusal"], "not-left");
  assert_eq!(read["counts"]["profiles"], 1);
  assert_eq!(read["counts"]["senders"], 1);
  assert_eq!(read["counts"]["console-settings"], 1);
  assert_eq!(read["counts"]["posts"], 1);
  assert_eq!(read["counts"]["users"], 1);
  assert_eq!(read["counts"]["secrets"], 2);
  assert!(read["counts"]["grants"].as_i64().unwrap() >= 1, "{read}");

  let (status, refused) = world
    .admin(Method::DELETE, &format!("/users/{member}"), Some(json!({ "units": {} })))
    .await;
  assert_eq!(status, StatusCode::CONFLICT);
  assert_eq!(refused["code"], "not-left");
  assert!(
    path_of(&world.env, &format!("users/{member}")).exists(),
    "a refused delete removes nothing"
  );

  let (status, _) = world.admin(Method::POST, &format!("/users/{member}/leave"), None).await;
  assert_eq!(status, StatusCode::NO_CONTENT);

  let (_, read) = world.admin(Method::GET, &format!("/users/{member}/removal"), None).await;
  assert_eq!(read["refusal"], Value::Null, "{read}");
  assert_eq!(read["counts"]["departures"], 1);

  let units = json!({ "units": { "agency": { "supervisors": 1 }, "web": { "forged": 7 } } });
  let (status, removed) = world.admin(Method::DELETE, &format!("/users/{member}"), Some(units)).await;
  assert_eq!(status, StatusCode::OK, "{removed}");
  assert_eq!(
    counts(&removed, "removed"),
    counts(&read, "counts"),
    "the delete removes what the read counted"
  );

  assert_eq!(world.count(r#"SELECT count(*) FROM "users" WHERE "id" = $1"#, member).await, 0);
  assert_eq!(
    world
      .count(r#"SELECT count(*) FROM "user_profiles" WHERE "user_id" = $1"#, member)
      .await,
    0
  );
  assert!(!path_of(&world.env, &format!("users/{member}")).exists());

  // Another account's rows and space stand as they stood, and so does the platform's.
  assert_eq!(
    world
      .count(r#"SELECT count(*) FROM "user_profiles" WHERE "user_id" = $1"#, bystander)
      .await,
    1
  );
  assert_eq!(
    world
      .count(r#"SELECT count(*) FROM "unit_posts" WHERE "user_id" = $1"#, bystander)
      .await,
    1
  );
  assert!(path_of(&world.env, &format!("users/{bystander}/token-b")).exists());
  assert!(path_of(&world.env, "platform-key").exists());

  // A removal already finished answers not found, both ways.
  let (status, _) = world.admin(Method::GET, &format!("/users/{member}/removal"), None).await;
  assert_eq!(status, StatusCode::NOT_FOUND);
  let (status, _) = world.admin(Method::DELETE, &format!("/users/{member}"), Some(json!({}))).await;
  assert_eq!(status, StatusCode::NOT_FOUND);

  // The record keeps what each unit handed over, and the service's own result under `web`, never the caller's.
  let (status, records) = world.admin(Method::GET, "/removals", None).await;
  assert_eq!(status, StatusCode::OK);
  let record = &records["removals"][0];
  assert_eq!(record["what"], "account");
  assert_eq!(record["subject"], member);
  assert_eq!(record["login"], "member-a");
  assert_eq!(record["by"], world.administrator.to_string());
  assert_eq!(record["id"], removed["record"]);
  assert_eq!(record["result"]["agency"]["supervisors"], 1);
  assert_eq!(record["result"]["web"], removed["removed"]);
}

#[tokio::test]
async fn an_account_removal_is_refused_in_its_order_and_to_anyone_but_an_administrator() {
  let world = world().await;
  let administrator = world.administrator;
  let second = world.second_administrator;

  let (_, own) = world.admin(Method::GET, &format!("/users/{administrator}/removal"), None).await;
  assert_eq!(own["refusal"], "own-account");
  let (status, refused) =
    world.admin(Method::DELETE, &format!("/users/{administrator}"), Some(json!({}))).await;
  assert_eq!((status, refused["code"].as_str()), (StatusCode::CONFLICT, Some("own-account")));

  let (_, owner) = world
    .as_role(Method::GET, &format!("/users/{administrator}/removal"), None, second, "administrator")
    .await;
  assert_eq!(owner["refusal"], "owner-account", "{owner}");

  let (_, standing) = world.admin(Method::GET, &format!("/users/{second}/removal"), None).await;
  assert_eq!(standing["administrator"], true);
  assert_eq!(standing["refusal"], "not-left", "another administrator stands beside them");

  // A member, and a login naming the role but not held the platform administrator, are refused every route.
  for (user, role) in [(world.bystander, "member"), (world.bystander, "administrator")] {
    let (status, _) = world
      .as_role(Method::GET, &format!("/users/{}/removal", world.member), None, user, role)
      .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = world
      .as_role(Method::DELETE, &format!("/users/{}", world.member), Some(json!({})), user, role)
      .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = world
      .as_role(Method::GET, &format!("/units/{}/removal", world.team), None, user, role)
      .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = world.as_role(Method::GET, "/removals", None, user, role).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
  }
}

#[tokio::test]
async fn a_company_is_refused_while_people_stand_in_it_then_deleted_whole_with_its_units() {
  let world = world().await;
  let (company, division, team) = (world.other_company, world.division, world.team);

  world
    .admin(
      Method::PUT,
      &format!("/companies/{company}/roles"),
      Some(json!({ "roles": [{ "key": "lead", "name": "Lead" }] })),
    )
    .await;
  let (status, _) = world
    .admin(Method::PUT, &format!("/units/{division}/heads/{}", world.bystander), None)
    .await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  world
    .scratch
    .run(
      r#"INSERT INTO "user_invites" ("token", "unit_id", "head", "made_by", "created_at", "expires_at", "full_name")
         VALUES ('an-invite', $1, false, $2, 1, 9999999999999, '')"#,
      vec![team.into(), world.administrator.into()],
    )
    .await;
  // A post another company's person holds in the team goes with the team, whoever holds it.
  world
    .scratch
    .run(
      r#"INSERT INTO "unit_posts" ("user_id", "unit_id", "role_id", "given_by", "given_at") VALUES ($1, $2, NULL, NULL, 1)"#,
      vec![world.bystander.into(), team.into()],
    )
    .await;

  let (status, read) = world.admin(Method::GET, &format!("/units/{company}/removal"), None).await;
  assert_eq!(status, StatusCode::OK, "{read}");
  assert_eq!(read["refusal"], "unit-holds-people");
  assert_eq!(read["company"], company);
  let order: Vec<i64> = read["units"]
    .as_array()
    .unwrap()
    .iter()
    .map(|unit| unit["id"].as_i64().unwrap())
    .collect();
  assert_eq!(
    order,
    vec![i64::from(team), i64::from(division), i64::from(company)],
    "the deepest first"
  );
  assert_eq!(read["people"][0]["user"], world.in_team.to_string());
  assert_eq!(read["people"][0]["left"], false);

  let (status, refused) = world
    .admin(Method::DELETE, &format!("/units/{company}"), Some(json!({ "units": {} })))
    .await;
  assert_eq!((status, refused["code"].as_str()), (StatusCode::CONFLICT, Some("unit-holds-people")));

  // The person goes first, as the console's cascade takes them.
  world.admin(Method::POST, &format!("/users/{}/leave", world.in_team), None).await;
  let (status, _) =
    world.admin(Method::DELETE, &format!("/users/{}", world.in_team), Some(json!({}))).await;
  assert_eq!(status, StatusCode::OK);

  let (_, read) = world.admin(Method::GET, &format!("/units/{company}/removal"), None).await;
  assert_eq!(read["refusal"], Value::Null, "{read}");
  assert_eq!(read["counts"]["units"], 3);
  assert_eq!(read["counts"]["roles"], 1);
  assert_eq!(read["counts"]["invitations"], 1);
  assert_eq!(read["counts"]["posts"], 1);
  assert_eq!(read["counts"]["secrets"], 1);
  assert!(read["counts"]["grants"].as_i64().unwrap() >= 1, "{read}");

  let ask = json!({ "units": { "receiver": { "rooms": 0 } } });
  let (status, removed) = world.admin(Method::DELETE, &format!("/units/{company}"), Some(ask)).await;
  assert_eq!(status, StatusCode::OK, "{removed}");
  assert_eq!(counts(&removed, "removed"), counts(&read, "counts"));

  let gone = world
    .scratch
    .count(
      r#"SELECT count(*) FROM "organizations" WHERE "id" IN ($1, $2, $3)"#,
      vec![company.into(), division.into(), team.into()],
    )
    .await;
  assert_eq!(gone, 0);
  assert!(!path_of(&world.env, &format!("units/{team}")).exists());
  let (status, _) = world.admin(Method::GET, &format!("/units/{company}/removal"), None).await;
  assert_eq!(status, StatusCode::NOT_FOUND);

  // The administrators' company stands, with its people.
  let (status, _) = world.admin(Method::GET, &format!("/units/{}", world.company), None).await;
  assert_eq!(status, StatusCode::OK);
  assert_eq!(world.count(r#"SELECT count(*) FROM "users" WHERE "id" = $1"#, world.bystander).await, 1);

  let (_, records) = world.admin(Method::GET, "/removals", None).await;
  assert_eq!(records["removals"][0]["what"], "unit");
  assert_eq!(records["removals"][0]["name"], "company-b");
  assert_eq!(records["removals"][0]["result"]["receiver"]["rooms"], 0);
}

#[tokio::test]
async fn a_unit_an_administrator_stands_in_is_refused_whatever_else_holds() {
  let world = world().await;

  let (status, read) = world.admin(Method::GET, &format!("/units/{}/removal", world.company), None).await;
  assert_eq!(status, StatusCode::OK);
  assert_eq!(read["refusal"], "unit-holds-administrator");
  let (status, refused) =
    world.admin(Method::DELETE, &format!("/units/{}", world.company), Some(json!({}))).await;
  assert_eq!(
    (status, refused["code"].as_str()),
    (StatusCode::CONFLICT, Some("unit-holds-administrator"))
  );
}
