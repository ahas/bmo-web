//! A unit's org memory (docs/accounts.md, 「A unit's org memory」): a head of a unit gives its org memory write to a
//! person of its company, the grant reaches that unit alone, and the org memory check answers a head and a holder as
//! writers.

use crate::support::{OWNER, Scratch, console_hash, ready};
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

/// A call made for the login `key` names, as the console makes it for a person signed in.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  key: Option<i32>,
  body: Option<Value>,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header(header::CONTENT_TYPE, "application/json");
  if let Some(key) = key {
    request = request.header("owner-key", key.to_string()).header("owner-role", "member");
  }
  let body = body.map(|body| Body::from(body.to_string())).unwrap_or_else(Body::empty);
  let answer = app.clone().oneshot(request.body(body).unwrap()).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

async fn writes(app: &Router, unit: i32, user: i32) -> bool {
  let (status, said) = asked(
    app,
    Method::POST,
    "/checks/org-memory",
    None,
    Some(json!({ "unit": unit, "user": user.to_string() })),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["grant"], format!("bmo_org_memory:{unit}#may_write"), "{said}");

  said["allowed"].as_bool().unwrap()
}

#[tokio::test]
async fn a_head_gives_a_units_org_memory_write_which_reaches_that_unit_alone() {
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

  let company = unit(&scratch, "company-a", None).await;
  let centre = unit(&scratch, "centre-a", Some(company)).await;
  let team = unit(&scratch, "team-a", Some(centre)).await;
  let elsewhere = unit(&scratch, "company-b", None).await;
  let head = placed(&scratch, "head-centre", centre).await;
  let writer = placed(&scratch, "member-team", team).await;
  let stranger = placed(&scratch, "member-b", elsewhere).await;

  scratch
    .run(
      r#"INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
         VALUES ('organization', $1, 'manager', 'user', $2, '')"#,
      vec![centre.to_string().into(), head.to_string().into()],
    )
    .await;

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let writers = format!("/units/{team}/memory-writers");

  // A head of the centre writes the team's memory by heading it; the member does not until granted.
  assert!(writes(&app, team, head).await);
  assert!(!writes(&app, team, writer).await);

  // Only a head gives the grant, and only to a person of the unit's company.
  let (status, said) = asked(&app, Method::PUT, &format!("{writers}/{head}"), Some(writer), None).await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  let (status, said) = asked(&app, Method::PUT, &format!("{writers}/{stranger}"), Some(head), None).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("other-company")), "{said}");

  let (status, said) = asked(&app, Method::PUT, &format!("{writers}/{writer}"), Some(head), None).await;
  assert_eq!(status, StatusCode::NO_CONTENT, "{said}");

  let (status, said) = asked(&app, Method::GET, &writers, Some(head), None).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    said["writers"],
    json!([{ "user": writer.to_string(), "name": "member-team", "by": head.to_string() }]),
    "{said}"
  );

  // The grant is the team's alone: the holder writes the team's memory and not the centre's.
  assert!(writes(&app, team, writer).await);
  assert!(!writes(&app, centre, writer).await);

  let (status, said) = asked(&app, Method::GET, "/org-memory/units", Some(writer), None).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    said["units"],
    json!([{ "id": team, "name": "team-a", "parent": centre, "company": { "id": company, "name": "company-a" }, "head": false }]),
    "{said}"
  );
  let (_, said) = asked(&app, Method::GET, "/org-memory/units", Some(head), None).await;
  let heads: Vec<(i64, bool)> = said["units"]
    .as_array()
    .unwrap()
    .iter()
    .map(|one| (one["id"].as_i64().unwrap(), one["head"].as_bool().unwrap()))
    .collect();
  assert_eq!(heads, vec![(i64::from(centre), true), (i64::from(team), true)], "{said}");

  // Taken away, the holder writes it no more.
  let (status, said) = asked(&app, Method::DELETE, &format!("{writers}/{writer}"), Some(head), None).await;
  assert_eq!(status, StatusCode::NO_CONTENT, "{said}");
  assert!(!writes(&app, team, writer).await);
}
