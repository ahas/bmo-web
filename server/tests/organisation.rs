//! A company's own words for its organisation and what stands on its units beside heads and members
//! (docs/accounts.md, 「Users and senders」, 「Companies and organisation units」, 「Roles and unit kinds」,
//! 「Concurrent posts」, 「Acting」, 「The line of a unit」 and 「A person's history」): the role and kind catalogues,
//! a unit's kind, short name and the unit it reports to, the line read through it, acting appointments, posts,
//! the history of a person's place, and a person's rank, duty and the title composed from them.

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::lang::job_titles::JOB_TITLES;
use bmo_web_server::marks::fill_marks;
use bmo_web_server::one;
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

/// A company with a division under it, a site and an office under the division, and a company of its own beside
/// it; a head of the company's own unit, a head of the division, a person in each of the site and the office,
/// and one in the other company.
struct World {
  scratch: Scratch,
  app: Router,
  administrator: i32,
  company: i32,
  division: i32,
  site: i32,
  office: i32,
  other_company: i32,
  company_head: i32,
  division_head: i32,
  in_site: i32,
  in_office: i32,
  outsider: i32,
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

async fn world() -> World {
  ready();
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
  let administrator = one(scratch.db(), r#"SELECT "id" FROM "users" WHERE "username" = 'boss'"#, vec![])
    .await
    .unwrap()
    .unwrap()
    .try_get::<i32>("", "id")
    .unwrap();
  let company = unit(&scratch, "company-a", None).await;
  let division = unit(&scratch, "division-a", Some(company)).await;
  let site = unit(&scratch, "site-a", Some(division)).await;
  let office = unit(&scratch, "office-a", Some(division)).await;
  let other_company = unit(&scratch, "company-b", None).await;
  let company_head = placed(&scratch, "company-head", company).await;
  let division_head = placed(&scratch, "division-head", division).await;
  let in_site = placed(&scratch, "member-site", site).await;
  let in_office = placed(&scratch, "member-office", office).await;
  let outsider = placed(&scratch, "member-other", other_company).await;

  head(&scratch, company_head, company).await;
  head(&scratch, division_head, division).await;

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();

  World {
    scratch,
    app,
    administrator,
    company,
    division,
    site,
    office,
    other_company,
    company_head,
    division_head,
    in_site,
    in_office,
    outsider,
  }
}

impl World {
  /// A request made for `user`, the administrator's role where they are the administrator.
  async fn call(&self, method: Method, path: &str, body: Option<Value>, user: i32) -> (StatusCode, Value) {
    let role = if user == self.administrator { "administrator" } else { "member" };
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
    self.call(method, path, body, self.administrator).await
  }

  /// The company's roles, lowest first: an associate, a lead, a head and an executive.
  async fn roles(&self) {
    let (status, said) = self
      .admin(
        Method::PUT,
        &format!("/companies/{}/roles", self.company),
        Some(json!({ "roles": [
          { "key": "associate", "name": "Associate" },
          { "key": "lead", "name": "Lead" },
          { "key": "head", "name": "Head" },
          { "key": "executive", "name": "Executive" },
        ] })),
      )
      .await;
    assert_eq!(status, StatusCode::OK, "{said}");
  }

  /// `user` standing where they stand, as its head or not, carrying `role`.
  async fn role(&self, user: i32, unit: i32, head: bool, role: Value) -> (StatusCode, Value) {
    let body =
      json!({ "people": [{ "user": user.to_string(), "from": unit, "head": head, "role": role }] });

    self.admin(Method::POST, &format!("/units/{unit}/members"), Some(body)).await
  }

  async fn heads(&self, user: i32, unit: i32) -> bool {
    let (status, said) = self
      .admin(Method::POST, "/checks/unit", Some(json!({ "unit": unit, "user": user.to_string() })))
      .await;
    assert_eq!(status, StatusCode::OK, "{said}");

    said["allowed"].as_bool().unwrap()
  }

  async fn unit(&self, unit: i32) -> Value {
    let (status, said) = self.admin(Method::GET, &format!("/units/{unit}"), None).await;
    assert_eq!(status, StatusCode::OK, "{said}");

    said
  }

  async fn history(&self, user: i32) -> Vec<Value> {
    let (status, said) = self.admin(Method::GET, &format!("/people/{user}"), None).await;
    assert_eq!(status, StatusCode::OK, "{said}");

    said["history"].as_array().unwrap().clone()
  }
}

fn users(said: &Value) -> Vec<String> {
  said
    .as_array()
    .unwrap()
    .iter()
    .map(|one| one["user"].as_str().unwrap().to_owned())
    .collect()
}

#[tokio::test]
async fn a_company_keeps_its_roles_and_kinds_and_a_move_sets_a_role_beside_the_members() {
  let world = world().await;
  let roles = format!("/companies/{}/roles", world.company);
  let kinds = format!("/companies/{}/unit-kinds", world.company);

  world.roles().await;

  // Anyone of the company reads them, lowest first; anyone of another is answered as if no company stood.
  let (status, said) = world.call(Method::GET, &roles, None, world.in_site).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  let places: Vec<(String, i64)> = said["roles"]
    .as_array()
    .unwrap()
    .iter()
    .map(|role| (role["key"].as_str().unwrap().to_owned(), role["place"].as_i64().unwrap()))
    .collect();
  assert_eq!(
    places,
    vec![("associate".into(), 1), ("lead".into(), 2), ("head".into(), 3), ("executive".into(), 4)]
  );
  let (status, _) = world.call(Method::GET, &roles, None, world.outsider).await;
  assert_eq!(status, StatusCode::NOT_FOUND);
  let (status, _) = world
    .call(Method::GET, &format!("/companies/{}/roles", world.division), None, world.in_site)
    .await;
  assert_eq!(status, StatusCode::NOT_FOUND, "a unit that is no company");

  // A head of the company's own unit writes them; a head of a unit below and a member do not.
  let kept = json!({ "kinds": [{ "key": "site", "name": "Site" }, { "key": "branch", "name": "Branch" }] });
  let (status, said) = world.call(Method::PUT, &kinds, Some(kept.clone()), world.company_head).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["kinds"], kept["kinds"]);
  for refused in [world.division_head, world.in_site] {
    let (status, _) = world.call(Method::PUT, &kinds, Some(kept.clone()), refused).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
  }

  // A list out of shape.
  for wrong in [
    json!({ "roles": [{ "key": "Not A Key", "name": "Lead" }] }),
    json!({ "roles": [{ "key": "lead", "name": "Lead" }, { "key": "lead-b", "name": "lead" }] }),
    json!({ "roles": [{ "key": "lead", "name": "" }] }),
  ] {
    let (status, said) = world.admin(Method::PUT, &roles, Some(wrong)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");
    assert_eq!(said["code"], "bad-catalogue");
  }

  // A move sets a role; `GET /units/{unit}` answers it beside the members, which keep their shape.
  let (status, said) = world.role(world.in_site, world.site, false, json!("lead")).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["members"], json!([world.in_site.to_string()]));
  assert_eq!(said["roles"][0]["user"], world.in_site.to_string());
  assert_eq!(said["roles"][0]["role"]["key"], "lead");

  // A move naming no role keeps it for a person who stays.
  let body = json!({ "people": [{ "user": world.in_site.to_string(), "from": world.site, "head": true }] });
  let (status, said) =
    world.admin(Method::POST, &format!("/units/{}/members", world.site), Some(body)).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["roles"][0]["role"]["key"], "lead", "{said}");

  // A role nobody may remove while it is carried, nor a kind while a unit carries it.
  let (status, said) = world
    .admin(
      Method::PUT,
      &roles,
      Some(json!({ "roles": [{ "key": "associate", "name": "Associate" }] })),
    )
    .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "role-held");
  let (status, said) = world
    .admin(Method::PATCH, &format!("/units/{}", world.site), Some(json!({ "kind": "site" })))
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  let (status, said) = world
    .admin(Method::PUT, &kinds, Some(json!({ "kinds": [{ "key": "branch", "name": "Branch" }] })))
    .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "kind-held");

  // A role the company does not keep refuses the move whole.
  let (status, said) = world.role(world.in_site, world.site, false, json!("nobody-keeps-this")).await;
  assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");
  assert_eq!(said["code"], "no-such-role");

  // A person coming from another unit carries no role there until the move names one.
  let body =
    json!({ "people": [{ "user": world.in_site.to_string(), "from": world.site, "head": false }] });
  let (status, said) =
    world.admin(Method::POST, &format!("/units/{}/members", world.office), Some(body)).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["roles"], json!([]), "{said}");

  // A null role takes it away from a person who stays.
  world.role(world.in_office, world.office, false, json!("associate")).await;
  let (_, said) = world.role(world.in_office, world.office, false, Value::Null).await;
  assert_eq!(said["roles"], json!([]), "{said}");
}

#[tokio::test]
async fn a_unit_carries_a_kind_a_short_name_and_the_unit_it_reports_to() {
  let world = world().await;
  let site = format!("/units/{}", world.site);
  let office = format!("/units/{}", world.office);

  world
    .admin(
      Method::PUT,
      &format!("/companies/{}/unit-kinds", world.company),
      Some(json!({ "kinds": [{ "key": "site", "name": "Site" }] })),
    )
    .await;

  let (status, said) = world
    .admin(
      Method::PATCH,
      &site,
      Some(json!({ "kind": "site", "shortName": "S1", "reportsTo": world.office })),
    )
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["kind"], json!({ "key": "site", "name": "Site" }));
  assert_eq!(said["shortName"], "S1");
  assert_eq!(said["reportsTo"], json!({ "id": world.office, "name": "office-a" }));
  assert_eq!(said["parent"], world.division, "the tree stays as it was");

  // A short name another unit of the company holds, case set aside.
  let (status, said) = world.admin(Method::PATCH, &office, Some(json!({ "shortName": "s1" }))).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "short-name-taken");

  // A unit of another company, and a line that would come round.
  let (status, said) = world
    .admin(Method::PATCH, &office, Some(json!({ "reportsTo": world.other_company })))
    .await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "other-company");
  let (status, said) = world.admin(Method::PATCH, &office, Some(json!({ "reportsTo": world.site }))).await;
  assert_eq!(status, StatusCode::CONFLICT, "{said}");
  assert_eq!(said["code"], "cycle");
  let (status, said) = world.admin(Method::PATCH, &office, Some(json!({ "parent": world.site }))).await;
  assert_eq!(status, StatusCode::CONFLICT, "a parent move that brings the line round: {said}");
  assert_eq!(said["code"], "cycle");

  // A kind the company does not keep.
  let (status, said) = world.admin(Method::PATCH, &office, Some(json!({ "kind": "branch" }))).await;
  assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");
  assert_eq!(said["code"], "no-such-kind");

  // A field left out stands as it was; a null one is taken away.
  let (status, said) = world.admin(Method::PATCH, &site, Some(json!({ "shortName": null }))).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said.get("shortName").is_none(), "{said}");
  assert_eq!(said["kind"]["key"], "site");
  assert_eq!(said["reportsTo"]["id"], world.office);

  // A unit made with its attributes.
  let (status, said) = world
    .admin(
      Method::POST,
      "/units",
      Some(json!({ "name": "site-b", "parent": world.division, "kind": "site", "shortName": "S2" })),
    )
    .await;
  assert_eq!(status, StatusCode::CREATED, "{said}");
  assert_eq!(said["kind"]["key"], "site");
  assert_eq!(said["shortName"], "S2");
}

/// An answer with every `kind` field taken out, wherever it stands.
fn without_kind(value: &Value) -> Value {
  match value {
    Value::Object(fields) => Value::Object(
      fields
        .iter()
        .filter(|(key, _)| key.as_str() != "kind")
        .map(|(key, value)| (key.clone(), without_kind(value)))
        .collect(),
    ),
    Value::Array(items) => Value::Array(items.iter().map(without_kind).collect()),
    other => other.clone(),
  }
}

#[tokio::test]
async fn a_units_kind_changes_no_answer_but_the_lists_narrowed_by_it() {
  let world = world().await;
  let company = world.company;

  world.roles().await;
  world.role(world.in_site, world.site, true, json!("lead")).await;
  world
    .admin(
      Method::PUT,
      &format!("/companies/{company}/unit-kinds"),
      Some(json!({ "kinds": [{ "key": "site", "name": "Site" }, { "key": "branch", "name": "Branch" }] })),
    )
    .await;

  let site = world.site;
  let member = world.in_site;
  let reads: Vec<(String, i32)> = vec![
    (format!("/units/{site}"), world.administrator),
    ("/units".to_owned(), world.administrator),
    (format!("/units/{site}/line"), member),
    (format!("/units/{site}/line/head"), member),
    (format!("/users/{member}/unit"), member),
    (format!("/users/{member}/person"), member),
    (format!("/users/{member}/posts"), member),
    ("/users/search?q=member".to_owned(), member),
    ("/users/members".to_owned(), member),
    (format!("/people/{member}"), world.administrator),
    ("/people".to_owned(), world.administrator),
    (format!("/people?unit={site}"), world.administrator),
    (format!("/companies/{company}/roles"), member),
  ];
  let checks = [(member, site), (member, world.division), (world.division_head, site)];
  let read_all = || async {
    let mut answers = Vec::new();

    for (path, user) in &reads {
      let (status, said) = world.call(Method::GET, path, None, *user).await;
      assert_eq!(status, StatusCode::OK, "{path}: {said}");
      answers.push(without_kind(&said));
    }

    for (user, unit) in checks {
      answers.push(json!(world.heads(user, unit).await));
    }

    answers
  };
  let narrowed = |kind: &'static str| {
    let world = &world;

    async move {
      let (_, units) = world.admin(Method::GET, &format!("/units?kind={kind}"), None).await;
      let (_, people) = world.admin(Method::GET, &format!("/people?kind={kind}"), None).await;

      (
        units["units"]
          .as_array()
          .unwrap()
          .iter()
          .map(|unit| unit["id"].as_i64().unwrap())
          .collect::<Vec<_>>(),
        users(&people["people"]),
      )
    }
  };

  let before = read_all().await;
  assert_eq!(narrowed("site").await, (vec![], vec![]));

  for kind in [json!("site"), json!("branch"), Value::Null] {
    let (status, said) = world
      .admin(Method::PATCH, &format!("/units/{site}"), Some(json!({ "kind": kind })))
      .await;
    assert_eq!(status, StatusCode::OK, "{said}");
    assert_eq!(read_all().await, before, "with the kind {kind}");

    let expected = if kind == json!("site") {
      (vec![i64::from(site)], vec![member.to_string()])
    } else {
      (vec![], vec![])
    };
    assert_eq!(narrowed("site").await, expected, "with the kind {kind}");
  }
}

#[tokio::test]
async fn a_line_goes_up_through_the_unit_reported_to_and_the_next_lower_role_acts() {
  let world = world().await;
  let site = world.site;
  let lead_in_site = placed(&world.scratch, "lead-site", site).await;

  world.roles().await;
  world.role(world.in_site, site, false, json!("associate")).await;
  world.role(lead_in_site, site, false, json!("lead")).await;
  world.role(world.in_office, world.office, true, json!("head")).await;
  world.role(world.division_head, world.division, true, json!("executive")).await;
  world
    .admin(Method::PATCH, &format!("/units/{site}"), Some(json!({ "reportsTo": world.office })))
    .await;

  let (status, line) = world.call(Method::GET, &format!("/units/{site}/line"), None, world.in_site).await;
  assert_eq!(status, StatusCode::OK, "{line}");
  let steps: Vec<(i64, String)> = line["steps"]
    .as_array()
    .unwrap()
    .iter()
    .map(|step| (step["unit"]["id"].as_i64().unwrap(), step["via"].as_str().unwrap().to_owned()))
    .collect();
  assert_eq!(
    steps,
    vec![
      (i64::from(site), "start".into()),
      (i64::from(world.office), "reports-to".into()),
      (i64::from(world.division), "parent".into()),
      (i64::from(world.company), "parent".into()),
    ]
  );
  assert_eq!(line["steps"][1]["heads"][0]["user"], world.in_office.to_string());
  assert_eq!(line["steps"][1]["roles"][0]["role"]["key"], "head");
  assert_eq!(users(&line["steps"][0]["roles"][1]["holders"]), vec![lead_in_site.to_string()]);

  // The nearest holder of the role asked stands for it.
  let (_, stand) = world.call(Method::GET, &format!("/units/{site}/line/head"), None, world.in_site).await;
  assert_eq!(users(&stand["holders"]), vec![world.in_office.to_string()], "{stand}");
  assert_eq!(stand["holders"][0]["unit"]["id"], world.office);
  assert_eq!(stand["acting"], false);
  assert_eq!(stand["reason"], Value::Null);

  // With nobody on the line holding it, the next lower role's holder acts, with the reason.
  world.role(world.in_office, world.office, true, Value::Null).await;
  let (_, stand) = world.call(Method::GET, &format!("/units/{site}/line/head"), None, world.in_site).await;
  assert_eq!(users(&stand["holders"]), vec![lead_in_site.to_string()], "{stand}");
  assert_eq!(stand["standing"]["key"], "lead");
  assert_eq!(stand["acting"], true);
  assert_eq!(stand["reason"], "no-holder");

  // Nobody where no role that low stands.
  for user in [world.in_site, lead_in_site] {
    world.role(user, site, false, Value::Null).await;
  }
  let (_, stand) = world.call(Method::GET, &format!("/units/{site}/line/lead"), None, world.in_site).await;
  assert_eq!(stand["holders"], json!([]), "{stand}");
  assert_eq!(stand["standing"], Value::Null);

  // Without the unit it reports to the line follows the parents.
  world
    .admin(Method::PATCH, &format!("/units/{site}"), Some(json!({ "reportsTo": null })))
    .await;
  let (_, line) = world.call(Method::GET, &format!("/units/{site}/line"), None, world.in_site).await;
  let units: Vec<i64> = line["steps"]
    .as_array()
    .unwrap()
    .iter()
    .map(|step| step["unit"]["id"].as_i64().unwrap())
    .collect();
  assert_eq!(units, vec![i64::from(site), i64::from(world.division), i64::from(world.company)]);

  // Anyone of another company is answered as if nothing stood there, and so is a role the company does not keep.
  for path in [format!("/units/{site}/line"), format!("/units/{site}/line/head")] {
    let (status, _) = world.call(Method::GET, &path, None, world.outsider).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
  }
  let (status, _) = world
    .call(Method::GET, &format!("/units/{site}/line/nobody"), None, world.in_site)
    .await;
  assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn an_acting_appointment_starts_and_ends_with_no_act_between() {
  let world = world().await;
  let site = world.site;
  let acting = format!("/units/{site}/acting");
  let until = bmo_web_server::now_ms() + 3_600_000;

  // A head of a unit above appoints; the person passes the unit check and is listed acting.
  assert!(!world.heads(world.in_site, site).await);
  let (status, said) = world
    .call(
      Method::PUT,
      &acting,
      Some(json!({ "user": world.in_site.to_string(), "until": until })),
      world.division_head,
    )
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["user"], world.in_site.to_string());
  assert_eq!(said["until"], until);
  assert_eq!(said["by"], world.division_head.to_string());
  assert!(world.heads(world.in_site, site).await);
  let unit = world.unit(site).await;
  assert_eq!(unit["heads"], json!([world.in_site.to_string()]));
  assert_eq!(unit["acting"]["user"], world.in_site.to_string());
  let (_, units) = world.admin(Method::GET, "/units", None).await;
  let row = units["units"].as_array().unwrap().iter().find(|row| row["id"] == site).unwrap().clone();
  assert_eq!(row["acting"], json!([world.in_site.to_string()]));
  let (_, page) = world.admin(Method::GET, &format!("/people?unit={site}"), None).await;
  assert_eq!(page["people"][0]["acting"], true, "{page}");
  let (_, person) = world.admin(Method::GET, &format!("/people/{}", world.in_site), None).await;
  assert_eq!(person["actingFor"][0]["unit"]["id"], site);
  let (_, line) = world.call(Method::GET, &format!("/units/{site}/line"), None, world.in_site).await;
  assert_eq!(line["steps"][0]["heads"][0]["acting"], true);

  // Its end passing takes the standing away with no act between.
  world
    .scratch
    .run(
      r#"UPDATE "relation_tuples" SET "expires_at" = now() - interval '1 minute'
         WHERE "resource_type" = 'organization' AND "resource_id" = $1 AND "subject_id" = $2"#,
      vec![site.to_string().into(), world.in_site.to_string().into()],
    )
    .await;
  assert!(!world.heads(world.in_site, site).await);
  let unit = world.unit(site).await;
  assert_eq!(unit["heads"], json!([]));
  assert_eq!(unit["acting"], Value::Null);

  // A second appointment ends the first; ending it early takes the standing away.
  for user in [world.in_site, world.in_office] {
    let (status, said) = world
      .call(
        Method::PUT,
        &acting,
        Some(json!({ "user": user.to_string(), "until": until })),
        world.division_head,
      )
      .await;
    assert_eq!(status, StatusCode::OK, "{said}");
  }
  assert!(!world.heads(world.in_site, site).await);
  assert!(world.heads(world.in_office, site).await);
  assert_eq!(world.history(world.in_site).await[0]["change"], "acting-ended");
  let (status, _) = world.call(Method::DELETE, &acting, None, world.division_head).await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  assert!(!world.heads(world.in_office, site).await);

  // A head of the unit itself does not appoint; a lasting head is not appointed; nor is an end gone by or a
  // person of another company.
  head(&world.scratch, world.in_site, site).await;
  let (status, _) = world
    .call(
      Method::PUT,
      &acting,
      Some(json!({ "user": world.in_office.to_string(), "until": until })),
      world.in_site,
    )
    .await;
  assert_eq!(status, StatusCode::FORBIDDEN);
  for (user, end, code) in [
    (world.in_site, until, "already-head"),
    (world.in_office, bmo_web_server::now_ms() - 1, "bad-period"),
    (world.outsider, until, "other-company"),
  ] {
    let (_, said) = world
      .call(
        Method::PUT,
        &acting,
        Some(json!({ "user": user.to_string(), "until": end })),
        world.division_head,
      )
      .await;
    assert_eq!(said["code"], code, "{said}");
  }

  // A company's own unit has nobody above it but the administrator.
  let (status, _) = world
    .call(
      Method::PUT,
      &format!("/units/{}/acting", world.company),
      Some(json!({ "user": world.in_site.to_string(), "until": until })),
      world.company_head,
    )
    .await;
  assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_concurrent_post_lists_a_person_in_its_unit_and_its_line_while_their_home_answers_as_before() {
  let world = world().await;
  let site = world.site;
  let person = world.in_office;
  let post = format!("/units/{site}/posts/{person}");

  world.roles().await;
  let (_, home_before) = world.call(Method::GET, &format!("/users/{person}/unit"), None, person).await;

  // A head above gives a post with a role and the unit's head.
  let (status, said) = world
    .call(Method::PUT, &post, Some(json!({ "role": "lead", "head": true })), world.division_head)
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["unit"]["id"], site);
  assert_eq!(said["role"]["key"], "lead");
  assert_eq!(said["head"], true);
  assert_eq!(said["by"], world.division_head.to_string());

  // Listed concurrent in its unit, apart from its members; holding its role in its line; heading it.
  let unit = world.unit(site).await;
  assert_eq!(unit["members"], json!([world.in_site.to_string()]));
  assert_eq!(
    unit["concurrent"],
    json!([{ "user": person.to_string(), "role": said["role"], "head": true }])
  );
  let (_, line) = world.call(Method::GET, &format!("/units/{site}/line"), None, world.in_site).await;
  assert_eq!(
    line["steps"][0]["roles"][0]["holders"][0],
    json!({ "user": person.to_string(), "name": "member-office", "concurrent": true })
  );
  assert_eq!(line["steps"][0]["heads"][0]["concurrent"], true);
  assert!(world.heads(person, site).await);

  // Their home answers as before; the roster counts them under the post's unit, marked.
  let (_, home) = world.call(Method::GET, &format!("/users/{person}/unit"), None, person).await;
  assert_eq!(home, home_before);
  let (_, page) = world.admin(Method::GET, &format!("/people?unit={site}"), None).await;
  let row = page["people"]
    .as_array()
    .unwrap()
    .iter()
    .find(|row| row["user"] == json!(person.to_string()))
    .unwrap()
    .clone();
  assert_eq!(row["post"]["id"], site, "{row}");
  assert_eq!(row["unit"]["id"], world.office);
  let (_, page) = world.admin(Method::GET, &format!("/people?unit={}", world.office), None).await;
  assert!(page["people"][0].get("post").is_none(), "{page}");

  // A person's posts read for their company and nobody else's.
  let (status, posts) =
    world.call(Method::GET, &format!("/users/{person}/posts"), None, world.in_site).await;
  assert_eq!(status, StatusCode::OK, "{posts}");
  assert_eq!(posts["posts"][0]["path"].as_array().unwrap().len(), 3);
  let (status, _) = world.call(Method::GET, &format!("/users/{person}/posts"), None, world.outsider).await;
  assert_eq!(status, StatusCode::NOT_FOUND);

  // Refusals: a member gives none, nobody holds one in their home unit or in another company, and a role the
  // company does not keep.
  let (status, _) = world.call(Method::PUT, &post, Some(json!({ "head": false })), world.in_site).await;
  assert_eq!(status, StatusCode::FORBIDDEN);
  for (path, body, code) in [
    (format!("/units/{}/posts/{person}", world.office), json!({}), "home-unit"),
    (format!("/units/{}/posts/{person}", world.other_company), json!({}), "other-company"),
    (post.clone(), json!({ "role": "nobody-keeps-this" }), "no-such-role"),
  ] {
    let (_, said) = world.admin(Method::PUT, &path, Some(body)).await;
    assert_eq!(said["code"], code, "{path}: {said}");
  }

  // A move of the home unit leaves the post's head grant standing; a move into the post's unit ends the post.
  let to_division =
    json!({ "people": [{ "user": person.to_string(), "from": world.office, "head": false }] });
  let (status, said) = world
    .admin(Method::POST, &format!("/units/{}/members", world.division), Some(to_division))
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(world.heads(person, site).await);
  let into_site =
    json!({ "people": [{ "user": person.to_string(), "from": world.division, "head": false }] });
  world.admin(Method::POST, &format!("/units/{site}/members"), Some(into_site)).await;
  let (_, posts) = world.call(Method::GET, &format!("/users/{person}/posts"), None, person).await;
  assert_eq!(posts["posts"], json!([]));
  assert!(world.unit(site).await["concurrent"].as_array().unwrap().is_empty());

  // A post taken away takes its head grant with it; a person who leaves loses every post.
  let office_post = format!("/units/{}/posts/{person}", world.office);
  let (status, said) = world.admin(Method::PUT, &office_post, Some(json!({ "head": true }))).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(world.heads(person, world.office).await);
  let (status, _) = world.call(Method::DELETE, &office_post, None, world.division_head).await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  assert!(!world.heads(person, world.office).await);
  let (status, _) = world.call(Method::DELETE, &office_post, None, world.division_head).await;
  assert_eq!(status, StatusCode::NOT_FOUND, "no post stands any more");
  let (status, said) = world.admin(Method::PUT, &office_post, Some(json!({ "head": true }))).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  let (status, _) = world.admin(Method::POST, &format!("/users/{person}/leave"), None).await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  let (_, posts) = world.call(Method::GET, &format!("/users/{person}/posts"), None, world.in_site).await;
  assert_eq!(posts["posts"], json!([]));
  assert!(!world.heads(person, world.office).await);

  // Every change is kept, the newest first, with who did it.
  let changes: Vec<String> = world
    .history(person)
    .await
    .iter()
    .map(|entry| entry["change"].as_str().unwrap().to_owned())
    .collect();
  assert_eq!(
    changes,
    vec![
      "left",
      "post-taken",
      "head-taken",
      "head-granted",
      "post-given",
      "post-taken",
      "head-taken",
      "head-granted",
      "post-given",
      "post-taken",
      "head-taken",
      "placed",
      "placed",
      "head-granted",
      "post-given",
    ],
  );
  let first = world.history(person).await.last().unwrap().clone();
  assert_eq!(first["by"], world.division_head.to_string());
  assert_eq!(first["byName"], "division-head");
  assert_eq!(first["unit"]["id"], site);
  assert_eq!(first["after"]["key"], "lead");
}

#[tokio::test]
async fn a_persons_rank_and_role_compose_the_title_shown_and_their_duty_stands_beside_it() {
  let world = world().await;
  let person = world.in_site;
  let profile = format!("/users/{person}/profile");

  world.roles().await;

  let five = json!({ "fullName": "", "jobTitle": "Engineer", "landline": "", "mobile": "", "email": "" });
  let (status, said) = world
    .call(Method::POST, &profile, Some(json!({ "rank": "Senior", "duty": "Safety", "jobTitle": "Engineer", "fullName": "", "landline": "", "mobile": "", "email": "" })), person)
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!((said["rank"].as_str(), said["duty"].as_str()), (Some("Senior"), Some("Safety")));

  // A body of the five fields alone leaves the rank and the duty as they stand.
  let (_, said) = world.call(Method::POST, &profile, Some(five), person).await;
  assert_eq!(
    (said["rank"].as_str(), said["duty"].as_str(), said["jobTitle"].as_str()),
    (Some("Senior"), Some("Safety"), Some("Engineer"))
  );

  // The directory and the roster show the rank alone, then the rank and the role, as the pack joins them.
  let shown = |reader: i32| {
    let world = &world;

    async move {
      let (_, person_read) =
        world.call(Method::GET, &format!("/users/{person}/person"), None, reader).await;
      let (_, roster) = world.admin(Method::GET, &format!("/people/{person}"), None).await;

      (
        person_read["jobTitle"].as_str().unwrap().to_owned(),
        roster["jobTitle"].as_str().unwrap().to_owned(),
      )
    }
  };
  assert_eq!(shown(world.in_office).await, ("Senior".to_owned(), "Senior".to_owned()));
  world.role(person, world.site, false, json!("lead")).await;
  let both = fill_marks(&JOB_TITLES.both, &[("rank", "Senior"), ("role", "Lead")]);
  assert_eq!(shown(world.in_office).await, (both.clone(), both));
  let (_, read) = world.call(Method::GET, &format!("/users/{person}/person"), None, world.in_office).await;
  assert_eq!(read["duty"], "Safety");
  assert_eq!(read["role"]["key"], "lead");

  // The duty and the role's name answer a search.
  for words in ["safety", "lead"] {
    let (_, found) = world
      .call(Method::GET, &format!("/users/search?q={words}"), None, world.in_office)
      .await;
    assert_eq!(users(&found["people"]), vec![person.to_string()], "{words}");
  }

  // Neither set, the job title kept is shown.
  world.role(person, world.site, false, Value::Null).await;
  world
    .call(Method::POST, &profile, Some(json!({ "rank": "", "jobTitle": "Engineer", "fullName": "", "landline": "", "mobile": "", "email": "" })), person)
    .await;
  assert_eq!(shown(world.in_office).await, ("Engineer".to_owned(), "Engineer".to_owned()));
}
