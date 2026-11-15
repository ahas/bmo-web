//! The secret kinds (docs/accounts.md, 「Secret kinds」; docs/boundary.md, 「Secret kinds」): the defaults the
//! migrations seed, read with their words from the pack, and a store made before the card and delivery-address
//! kinds gaining them once, leaving every kind it keeps as it stands; a kind added, changed in its place and removed by the
//! administrator; each rule a kind can break refused, and a key that is not its path's; and every route refused to
//! any other role. The token and the model's gate in front of the routes are the server's own, held by the
//! routes' tests.

use crate::support;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::lang::secret_kinds::SECRET_KINDS;
use bmo_web_server::migration::Migrator;
use bmo_web_server::secret_kinds;
use http_body_util::BodyExt;
use sea_orm_migration::MigratorTrait;
use serde_json::{Value, json};
use support::Scratch;
use tower::ServiceExt;

const ADMINISTRATOR: Option<&str> = Some("administrator");

/// The kinds' routes as the server mounts them, on a database of the test's own, migrated and so seeded.
async fn app() -> (Scratch, Router) {
  let scratch = Scratch::new().await;
  let app = secret_kinds::routes().with_state(scratch.service.clone());

  (scratch, app)
}

/// A request in `role`, where one is given, and the status and body it is answered with.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<&Value>,
  role: Option<&str>,
) -> (StatusCode, Value) {
  let mut request = Request::builder().method(method).uri(path).header("x-real-ip", "127.0.0.1");

  if let Some(role) = role {
    request = request.header("owner-role", role);
  }

  let request = match body {
    Some(body) => request
      .header(header::CONTENT_TYPE, "application/json")
      .body(Body::from(body.to_string()))
      .unwrap(),
    None => request.body(Body::empty()).unwrap(),
  };
  let answer = app.clone().oneshot(request).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let body = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, body)
}

async fn kinds(app: &Router) -> Vec<Value> {
  let (status, said) = asked(app, Method::GET, "/secret-kinds", None, ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  said["kinds"].as_array().unwrap().clone()
}

fn keys(kinds: &[Value]) -> Vec<&str> {
  kinds.iter().map(|kind| kind["key"].as_str().unwrap()).collect()
}

/// A kind of two line fields, which keeps every rule.
fn a_kind() -> Value {
  json!({
    "key": "mail-relay",
    "name": "Mail relay",
    "description": "The relay's user and password",
    "fields": [
      { "key": "RELAY_USER", "label": "User", "masked": false, "input": "line", "required": true },
      { "key": "RELAY_PASSWORD", "label": "Password", "masked": true, "input": "line", "required": true },
    ],
  })
}

#[tokio::test]
async fn the_defaults_are_seeded_in_their_order_with_their_words_from_the_pack() {
  let (_scratch, app) = app().await;
  let kinds = kinds(&app).await;

  assert_eq!(
    keys(&kinds),
    [
      "api-key",
      "account-login",
      "aws-access-key",
      "oauth-client",
      "database",
      "ssh-private-key",
      "file",
      "card",
      "delivery-address"
    ]
  );

  for kind in &kinds {
    let words = SECRET_KINDS.kind(kind["key"].as_str().unwrap());

    assert_eq!(kind["name"], words.name.as_str());
    assert_eq!(kind["description"], words.description.as_str());
    for field in kind["fields"].as_array().unwrap() {
      assert_eq!(field["label"], words.label(field["key"].as_str().unwrap()));
    }
  }

  let shape = |key: &str| -> Vec<(String, bool, String, bool)> {
    let kind = kinds.iter().find(|kind| kind["key"] == key).unwrap();

    kind["fields"]
      .as_array()
      .unwrap()
      .iter()
      .map(|field| {
        (
          field["key"].as_str().unwrap().to_owned(),
          field["masked"].as_bool().unwrap(),
          field["input"].as_str().unwrap().to_owned(),
          field["required"].as_bool().unwrap(),
        )
      })
      .collect()
  };
  let field = |key: &str, masked: bool, input: &str, required: bool| {
    (key.to_owned(), masked, input.to_owned(), required)
  };

  assert_eq!(
    shape("aws-access-key"),
    [
      field("AWS_ACCESS_KEY_ID", false, "line", true),
      field("AWS_SECRET_ACCESS_KEY", true, "line", true),
      field("AWS_REGION", false, "line", false),
    ]
  );
  assert_eq!(shape("ssh-private-key"), [field("SSH_PRIVATE_KEY", true, "lines", true)]);
  assert_eq!(shape("file"), [field("FILE", false, "file", true)]);
  assert_eq!(
    shape("card"),
    [
      field("CARD_NUMBER", true, "line", true),
      field("CARD_EXPIRY", false, "line", true),
      field("CARD_CVC", true, "line", true),
      field("CARD_HOLDER_NAME", false, "line", true),
    ]
  );
  assert_eq!(
    shape("delivery-address"),
    [
      field("RECIPIENT", false, "line", true),
      field("PHONE", false, "line", true),
      field("POSTAL_CODE", false, "line", true),
      field("ADDRESS", false, "line", true),
      field("ADDRESS_DETAIL", false, "line", false),
    ]
  );
}

/// The store as a deployment made before the card and delivery-address kinds holds it: neither kind, and the
/// migration that seeds them not yet run.
async fn before_card_and_delivery(scratch: &Scratch) {
  scratch
    .run(r#"DELETE FROM "secret_kinds" WHERE "key" IN ('card', 'delivery-address')"#, vec![])
    .await;
  scratch
    .run(
      r#"DELETE FROM "seaql_migrations" WHERE "version" = 'm20261115_000001_card_and_delivery_kinds'"#,
      vec![],
    )
    .await;
}

async fn migrated(scratch: &Scratch) {
  Migrator::up(scratch.db(), None).await.expect("the store migrates");
}

#[tokio::test]
async fn a_store_made_before_the_card_and_delivery_kinds_gains_them_once_after_every_kind_it_keeps() {
  let (scratch, app) = app().await;

  before_card_and_delivery(&scratch).await;

  // The owner's own changes: a default renamed, one removed, and a kind of their own added.
  let mut renamed = kinds(&app).await[0].clone();

  renamed["name"] = json!("Token");

  let changes = [
    (Method::PUT, "/secret-kinds/api-key", Some(renamed.clone()), StatusCode::OK),
    (Method::DELETE, "/secret-kinds/file", None, StatusCode::NO_CONTENT),
    (Method::POST, "/secret-kinds", Some(a_kind()), StatusCode::CREATED),
  ];

  for (method, path, body, expected) in changes {
    let (status, said) = asked(&app, method, path, body.as_ref(), ADMINISTRATOR).await;

    assert_eq!(status, expected, "{path}: {said}");
  }

  let kept = kinds(&app).await;

  migrated(&scratch).await;

  let after = kinds(&app).await;

  assert_eq!(after[..kept.len()], kept[..]);
  assert_eq!(after[0], renamed);
  assert_eq!(keys(&after[kept.len()..]), ["card", "delivery-address"]);

  migrated(&scratch).await;

  assert_eq!(kinds(&app).await, after);
}

#[tokio::test]
async fn a_kind_standing_under_a_seeded_key_is_left_as_it_stands() {
  let (scratch, app) = app().await;

  before_card_and_delivery(&scratch).await;

  let mut own = a_kind();

  own["key"] = json!("card");

  let (status, said) = asked(&app, Method::POST, "/secret-kinds", Some(&own), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::CREATED, "{said}");

  migrated(&scratch).await;

  let after = kinds(&app).await;

  assert_eq!(after.iter().filter(|kind| kind["key"] == "card").collect::<Vec<_>>(), [&own]);
  assert_eq!(keys(&after).last(), Some(&"delivery-address"));
}

#[tokio::test]
async fn the_administrator_adds_changes_in_place_and_removes_a_kind() {
  let (_scratch, app) = app().await;
  let kind = a_kind();
  let (status, added) = asked(&app, Method::POST, "/secret-kinds", Some(&kind), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::CREATED, "{added}");
  assert_eq!(added, kind);
  assert_eq!(kinds(&app).await.last(), Some(&kind));

  let (status, again) = asked(&app, Method::POST, "/secret-kinds", Some(&kind), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::CONFLICT);
  assert_eq!(again["code"], "kind-exists");

  // A default changed keeps its place, the first.
  let mut changed = kinds(&app).await[0].clone();

  changed["name"] = json!("Token");
  changed["fields"][0]["masked"] = json!(false);

  let (status, said) =
    asked(&app, Method::PUT, "/secret-kinds/api-key", Some(&changed), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said, changed);
  assert_eq!(kinds(&app).await[0], changed);

  let (status, _) = asked(&app, Method::DELETE, "/secret-kinds/mail-relay", None, ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::NO_CONTENT);
  assert!(!keys(&kinds(&app).await).contains(&"mail-relay"));

  let (status, gone) = asked(&app, Method::DELETE, "/secret-kinds/mail-relay", None, ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(gone["code"], "not-found");

  let (status, gone) =
    asked(&app, Method::PUT, "/secret-kinds/mail-relay", Some(&kind), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::NOT_FOUND);
  assert_eq!(gone["code"], "not-found");

  // A kind added after a removal still goes last.
  let (status, _) = asked(&app, Method::POST, "/secret-kinds", Some(&kind), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::CREATED);
  assert_eq!(keys(&kinds(&app).await).last(), Some(&"mail-relay"));
}

#[tokio::test]
async fn a_kind_that_breaks_a_rule_is_refused_naming_it_and_its_bounds_are_taken() {
  let (_scratch, app) = app().await;
  let breaking = |change: &dyn Fn(&mut Value)| {
    let mut kind = a_kind();

    change(&mut kind);
    kind
  };
  let one_field = |input: &str| json!([{ "key": "ONE", "label": "One", "masked": false, "input": input, "required": true }]);
  let many_fields = |count: usize| {
    (0..count)
      .map(|at| json!({ "key": format!("F{at}"), "label": "F", "masked": false, "input": "line", "required": true }))
      .collect::<Vec<_>>()
  };
  let broken: Vec<(&str, Value)> = vec![
    ("an empty key", breaking(&|kind| kind["key"] = json!(""))),
    ("a key too long", breaking(&|kind| kind["key"] = json!("k".repeat(65)))),
    ("a key beginning with a digit", breaking(&|kind| kind["key"] = json!("1-kind"))),
    ("a key beginning with a dash", breaking(&|kind| kind["key"] = json!("-kind"))),
    ("a key in capitals", breaking(&|kind| kind["key"] = json!("Mail-relay"))),
    ("a key with an underscore", breaking(&|kind| kind["key"] = json!("mail_relay"))),
    ("an empty name", breaking(&|kind| kind["name"] = json!(""))),
    ("a name too long", breaking(&|kind| kind["name"] = json!("n".repeat(101)))),
    ("a description too long", breaking(&|kind| kind["description"] = json!("d".repeat(501)))),
    ("no fields", breaking(&|kind| kind["fields"] = json!([]))),
    ("too many fields", breaking(&|kind| kind["fields"] = json!(many_fields(21)))),
    ("an empty field key", breaking(&|kind| kind["fields"][0]["key"] = json!(""))),
    (
      "a field key too long",
      breaking(&|kind| kind["fields"][0]["key"] = json!("K".repeat(129))),
    ),
    (
      "a field key beginning with a digit",
      breaking(&|kind| kind["fields"][0]["key"] = json!("1KEY")),
    ),
    (
      "a field key with a dash",
      breaking(&|kind| kind["fields"][0]["key"] = json!("RELAY-USER")),
    ),
    ("an empty label", breaking(&|kind| kind["fields"][0]["label"] = json!(""))),
    (
      "a label too long",
      breaking(&|kind| kind["fields"][0]["label"] = json!("l".repeat(101))),
    ),
    ("an input no kind knows", breaking(&|kind| kind["fields"] = one_field("textarea"))),
    ("fields of one key", breaking(&|kind| kind["fields"][1]["key"] = json!("RELAY_USER"))),
    (
      "a lines field beside another",
      breaking(&|kind| kind["fields"][1]["input"] = json!("lines")),
    ),
    (
      "a file field beside another",
      breaking(&|kind| kind["fields"][0]["input"] = json!("file")),
    ),
  ];

  for (rule, kind) in &broken {
    let (status, said) = asked(&app, Method::POST, "/secret-kinds", Some(kind), ADMINISTRATOR).await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "{rule}: {said}");
    assert_eq!(said["code"], "bad-kind", "{rule}: {said}");
    assert!(!said["error"].as_str().unwrap().is_empty(), "{rule}");
  }

  // A body that does not read as a kind at all is no broken rule.
  let (status, said) =
    asked(&app, Method::POST, "/secret-kinds", Some(&json!({ "key": "a" })), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(said["code"], "bad-request");

  // A key whose body is not its path's is refused, even for a kind that stands under either.
  let mut renamed = kinds(&app).await[0].clone();

  renamed["key"] = json!("file");

  let (status, said) =
    asked(&app, Method::PUT, "/secret-kinds/api-key", Some(&renamed), ADMINISTRATOR).await;

  assert_eq!(status, StatusCode::BAD_REQUEST);
  assert_eq!(said["code"], "bad-kind");

  // The bounds themselves are taken, a length counted in characters; a lone lines or file field is too.
  let taken = [
    breaking(&|kind| {
      kind["key"] = json!(format!("k{}", "-0".repeat(31) + "z"));
      kind["name"] = json!("\u{e9}".repeat(100));
      kind["description"] = json!("");
      kind["fields"] = json!(many_fields(20));
      kind["fields"][0]["key"] = json!(format!("_{}", "k".repeat(127)));
      kind["fields"][0]["label"] = json!("\u{e9}".repeat(100));
    }),
    breaking(&|kind| {
      kind["key"] = json!("one-key-file");
      kind["fields"] = one_field("file");
    }),
    breaking(&|kind| {
      kind["key"] = json!("one-key-lines");
      kind["fields"] = one_field("lines");
    }),
  ];

  for kind in &taken {
    let (status, said) = asked(&app, Method::POST, "/secret-kinds", Some(kind), ADMINISTRATOR).await;

    assert_eq!(status, StatusCode::CREATED, "{said}");
  }
}

#[tokio::test]
async fn any_call_reads_the_kinds_and_every_change_is_refused_to_a_role_other_than_the_administrator() {
  let (_scratch, app) = app().await;
  let before = kinds(&app).await;
  let kind = a_kind();
  let mut changed = before[0].clone();

  changed["name"] = json!("Token");

  for role in [None, Some("member"), Some("Administrator")] {
    let (status, read) = asked(&app, Method::GET, "/secret-kinds", None, role).await;

    assert_eq!(status, StatusCode::OK, "as {role:?}");
    assert_eq!(read["kinds"].as_array().unwrap(), &before);

    for (method, path, body) in [
      (Method::POST, "/secret-kinds", Some(&kind)),
      (Method::PUT, "/secret-kinds/api-key", Some(&changed)),
      (Method::DELETE, "/secret-kinds/api-key", None),
    ] {
      let (status, said) = asked(&app, method.clone(), path, body, role).await;

      assert_eq!(status, StatusCode::FORBIDDEN, "{method} {path} as {role:?}");
      assert_eq!(said["code"], "forbidden");
    }
  }

  assert_eq!(kinds(&app).await, before);
}
