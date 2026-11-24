//! The people roster (docs/accounts.md, 「The people roster」): a page at a time in name order, walked to
//! its end by `next`; the search, the filters of role, state and unit; the administrator looking through
//! every company, a head of a company's own unit through that company alone and without contact details,
//! and a head of a unit below a company or a member through none.

use crate::support::{OWNER, Scratch, SharedDatabase, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_client::ProfileAsk;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::users::{set_profile, set_sign_in};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

/// The people of company-a beside its heads and the member of its team, each by login and the person's
/// name; one name carries the characters a place in the roster must carry whole.
const PEOPLE: [(&str, &str); 6] = [
  ("person-1", "Echo"),
  ("person-2", "alpha"),
  ("person-3", "Delta: one/two?"),
  ("person-4", "charlie"),
  ("person-5", ""),
  ("person-6", "Bravo"),
];

async fn moved() -> Scratch {
  static SHARED: SharedDatabase = SharedDatabase::new();

  SHARED.get(seed).await
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

async fn placed(scratch: &Scratch, login: &str, name: &str, unit: i32) -> i32 {
  let user = set_sign_in(scratch.db(), login, "the password", false).await.unwrap().user;

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![unit.into(), user.into()],
    )
    .await;
  set_profile(
    scratch.db(),
    user,
    &ProfileAsk {
      full_name: name.into(),
      job_title: "Engineer".into(),
      landline: String::new(),
      mobile: String::new(),
      email: format!("{login}@example.com"),
      ..ProfileAsk::default()
    },
  )
  .await
  .unwrap();

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

/// Two companies: company-a with a centre and a team under it, its head, the centre's head, a member of
/// the team, the people above, one person not yet enabled, one who left and one bound to a machine; and
/// company-b with one person.
async fn seed(scratch: Scratch) -> Scratch {
  scratch.console_account("boss", &console_hash("the password")).await;
  run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
    },
  )
  .await
  .unwrap();

  let company = unit(&scratch, "company-a", None).await;
  let centre = unit(&scratch, "centre-a", Some(company)).await;
  let team = unit(&scratch, "team-a", Some(centre)).await;
  let other = unit(&scratch, "company-b", None).await;
  let head_a = placed(&scratch, "head-a", "Head A", company).await;
  let head_centre = placed(&scratch, "head-centre", "Head Centre", centre).await;

  head(&scratch, head_a, company).await;
  head(&scratch, head_centre, centre).await;
  placed(&scratch, "member-team", "Member Team", team).await;

  for (login, name) in PEOPLE {
    placed(&scratch, login, name, company).await;
  }

  let pending = placed(&scratch, "person-pending", "Pending", company).await;
  let left = placed(&scratch, "person-left", "Left", centre).await;
  let bound = placed(&scratch, "person-bound", "Bound", company).await;

  scratch
    .run(r#"UPDATE "users" SET "is_enabled" = false WHERE "id" = $1"#, vec![pending.into()])
    .await;
  scratch
    .run(
      r#"INSERT INTO "user_departures" ("user_id", "left_at", "left_by")
         VALUES ($1::bigint, 1000, $2::bigint)"#,
      vec![left.into(), head_a.into()],
    )
    .await;
  scratch
    .run(
      r#"INSERT INTO "user_nodes" ("user_id", "agent", "shared", "proven_at")
         VALUES ($1::bigint, 'machine-a', true, 2000)"#,
      vec![bound.into()],
    )
    .await;
  placed(&scratch, "person-b", "Person B", other).await;

  scratch
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

async fn asked(app: &Router, path: &str, key: &str) -> (StatusCode, Value) {
  let request = Request::builder()
    .method(Method::GET)
    .uri(path)
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header("owner-key", key);
  let answer = app.clone().oneshot(request.body(Body::empty()).unwrap()).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let body = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, body)
}

async fn id_of(scratch: &Scratch, table: &str, column: &str, name: &str) -> i32 {
  one(
    scratch.db(),
    &format!(r#"SELECT "id" FROM "{table}" WHERE "{column}" = $1"#),
    vec![name.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get::<i32>("", "id")
  .unwrap()
}

async fn user(scratch: &Scratch, login: &str) -> String {
  id_of(scratch, "users", "username", login).await.to_string()
}

async fn unit_id(scratch: &Scratch, name: &str) -> i32 {
  id_of(scratch, "organizations", "name", name).await
}

fn logins(said: &Value) -> Vec<&str> {
  said["people"]
    .as_array()
    .expect("people is a list")
    .iter()
    .map(|one| one["login"].as_str().unwrap())
    .collect()
}

fn sorted(mut logins: Vec<&str>) -> Vec<&str> {
  logins.sort_unstable();
  logins
}

#[tokio::test]
async fn walking_next_answers_every_person_once_in_name_order() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = user(&scratch, "boss").await;
  let company = unit_id(&scratch, "company-a").await;
  let mut after: Option<String> = None;
  let mut walked: Vec<(String, String)> = Vec::new();

  // A page of one person ends at every person, so each place the walk asks from is one person's.
  loop {
    let place = after.as_deref().map(|after| format!("&after={after}")).unwrap_or_default();
    let (status, said) = asked(&app, &format!("/people?company={company}&limit=1{place}"), &boss).await;

    assert_eq!(status, StatusCode::OK, "{said}");
    assert_eq!(said["total"], 12, "{said}");
    for person in said["people"].as_array().unwrap() {
      walked.push((
        person["name"].as_str().unwrap().to_lowercase(),
        person["user"].as_str().unwrap().to_owned(),
      ));
    }

    match said["next"].as_str() {
      Some(next) => after = Some(next.to_owned()),
      None => break,
    }
  }

  let mut ordered = walked.clone();

  ordered.sort();
  ordered.dedup();
  assert_eq!(walked, ordered);
  assert_eq!(walked.len(), 12);
  assert!(walked.iter().any(|(name, _)| name == "delta: one/two?"), "{walked:?}");
  assert!(walked.iter().any(|(name, _)| name == "person-5"), "{walked:?}");

  let (status, said) = asked(&app, "/people?after=not-a-place", &boss).await;

  assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");
}

#[tokio::test]
async fn the_search_and_the_filters_narrow_the_roster() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = user(&scratch, "boss").await;
  let head_a = user(&scratch, "head-a").await;
  let company = unit_id(&scratch, "company-a").await;
  let centre = unit_id(&scratch, "centre-a").await;
  let asks = [
    ("q=%20delta%20", &boss, vec!["person-3"]),
    ("q=team-a", &boss, vec!["member-team"]),
    ("q=person-1@example", &boss, vec!["person-1"]),
    ("q=person-1@example", &head_a, vec![]),
    ("role=head", &boss, vec!["head-a", "head-centre"]),
    ("state=left", &boss, vec!["person-left"]),
    ("state=pending", &boss, vec!["person-pending"]),
    ("unit=CENTRE", &boss, vec!["head-centre", "member-team", "person-left"]),
  ];

  for (ask, key, found) in asks {
    let ask = ask.replace("CENTRE", &centre.to_string());
    let (status, said) = asked(&app, &format!("/people?company={company}&{ask}"), key).await;

    assert_eq!(status, StatusCode::OK, "{ask}: {said}");
    assert_eq!(sorted(logins(&said)), found, "{ask}: {said}");
    assert_eq!(said["total"], found.len(), "{ask}: {said}");
  }

  let (_, said) = asked(&app, &format!("/people?company={company}&role=member"), &boss).await;

  assert!(!logins(&said).contains(&"head-a"), "{said}");
  assert!(logins(&said).contains(&"member-team"), "{said}");

  for ask in ["role=chief", "state=gone", "limit=many"] {
    let (status, said) = asked(&app, &format!("/people?{ask}"), &boss).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "{ask}: {said}");
  }
}

#[tokio::test]
async fn a_person_opened_carries_their_unit_their_heads_their_departure_and_their_machine() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = user(&scratch, "boss").await;
  let head_a = user(&scratch, "head-a").await;
  let company = unit_id(&scratch, "company-a").await;
  let centre = unit_id(&scratch, "centre-a").await;

  let (status, said) =
    asked(&app, &format!("/people/{}", user(&scratch, "person-left").await), &boss).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["state"], "left", "{said}");
  assert_eq!(said["company"]["id"], company, "{said}");
  assert_eq!(said["path"].as_array().unwrap().len(), 2, "{said}");
  assert_eq!(said["left"]["at"], 1000, "{said}");
  assert_eq!(said["left"]["by"], head_a, "{said}");
  assert_eq!(said["left"]["byName"], "Head A", "{said}");
  assert_eq!(said["machine"], Value::Null, "{said}");
  assert_eq!(said["machineStanding"], Value::Null, "{said}");
  assert_eq!(said["lastSignInAt"], Value::Null, "{said}");
  assert_eq!(said["email"], "person-left@example.com", "{said}");

  let (_, said) = asked(&app, &format!("/people/{}", user(&scratch, "person-bound").await), &boss).await;

  assert_eq!(said["machine"], "machine-a", "{said}");
  assert_eq!(said["machineStanding"]["shared"], true, "{said}");
  assert_eq!(said["machineStanding"]["provenAt"], 2000, "{said}");
  assert_eq!(said["state"], "active", "{said}");
  assert!(said["madeAt"].as_i64().unwrap() > 0, "{said}");

  let (_, said) = asked(&app, &format!("/people/{}", user(&scratch, "head-centre").await), &boss).await;

  assert_eq!(said["head"], true, "{said}");
  assert_eq!(said["headOf"][0]["id"], centre, "{said}");
  assert_eq!(said["administrator"], false, "{said}");

  let (_, said) = asked(&app, &format!("/people/{boss}"), &boss).await;

  assert_eq!(said["administrator"], true, "{said}");
}

#[tokio::test]
async fn each_reader_looks_through_the_companies_they_are_given() {
  ready();
  let scratch = moved().await;
  let app = app(&scratch).await;
  let boss = user(&scratch, "boss").await;
  let head_a = user(&scratch, "head-a").await;
  let person_b = user(&scratch, "person-b").await;
  let person_1 = user(&scratch, "person-1").await;
  let other = unit_id(&scratch, "company-b").await;

  // The administrator looks through every company, and sees contact details.
  let (status, said) = asked(&app, "/people/companies", &boss).await;
  let names: Vec<&str> = said["companies"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one["name"].as_str().unwrap())
    .collect();

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(names.contains(&"company-a") && names.contains(&"company-b"), "{said}");
  assert_eq!(asked(&app, &format!("/people/{person_b}"), &boss).await.0, StatusCode::OK);

  let (_, said) = asked(&app, &format!("/people?company={other}"), &boss).await;

  assert_eq!(said["people"][0]["jobTitle"], "Engineer", "{said}");
  assert_eq!(said["people"][0]["email"], "person-b@example.com", "{said}");

  // A head of a company's own unit looks through that company alone, and sees no contact details.
  let (status, said) = asked(&app, "/people/companies", &head_a).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["companies"].as_array().unwrap().len(), 1, "{said}");
  assert_eq!(said["companies"][0]["name"], "company-a", "{said}");

  let (status, said) = asked(&app, "/people?limit=100", &head_a).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["total"], 12, "{said}");
  assert!(!logins(&said).contains(&"person-b"), "{said}");
  for row in said["people"].as_array().unwrap() {
    assert_eq!(row["jobTitle"], "Engineer", "{row}");
    assert!(row.get("email").is_none(), "{row}");
  }
  assert_eq!(asked(&app, &format!("/people/{person_b}"), &head_a).await.0, StatusCode::NOT_FOUND);
  assert_eq!(asked(&app, &format!("/people?company={other}"), &head_a).await.0, StatusCode::NOT_FOUND);

  let (status, said) = asked(&app, &format!("/people/{person_1}"), &head_a).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["jobTitle"], "Engineer", "{said}");
  for field in ["email", "landline", "mobile"] {
    assert!(said.get(field).is_none(), "{field}: {said}");
  }

  // A head of a unit below a company and a plain member look through none.
  for login in ["head-centre", "member-team"] {
    let key = user(&scratch, login).await;
    let (status, said) = asked(&app, "/people/companies", &key).await;

    assert_eq!(status, StatusCode::OK, "{said}");
    assert_eq!(said["companies"], serde_json::json!([]), "{said}");
    for path in ["/people".to_owned(), format!("/people/{person_1}")] {
      let (status, said) = asked(&app, &path, &key).await;

      assert_eq!(status, StatusCode::FORBIDDEN, "{login} {path}: {said}");
      assert_eq!(said["code"], "forbidden", "{said}");
    }
  }

  // A login that names no user is refused every route.
  assert_eq!(asked(&app, "/people/companies", "999999").await.0, StatusCode::FORBIDDEN);
}
