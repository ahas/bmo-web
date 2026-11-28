//! A person's BMO profile (docs/accounts.md, 「A person's BMO profile」; docs/boundary.md, 「BMO profiles」): each
//! part standing from the person's own while they may personalise, then their company's default, then the
//! deployment's; the permission read nearest first; who may set what; and the pictures kept and answered.

use crate::support::{Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::agents::picture_type;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";
const PNG: &[u8] = b"\x89PNG\r\n\x1a\nthe company's picture";
const JPEG: &[u8] = b"\xff\xd8\xff\xe0the person's own picture";

/// A login a call is made for: its user and its role.
#[derive(Clone, Copy)]
struct Login(i32, &'static str);

/// A company with a centre under it and a team under the centre, a person standing in the team, one in the
/// centre who heads it, one who heads the company, and one standing in another company.
struct Tree {
  app: Router,
  admin: Login,
  company: i64,
  centre: i64,
  team: i64,
  person: Login,
  centre_head: Login,
  company_head: Login,
  outsider: Login,
  _scratch: Scratch,
}

/// A request with the token as the login, and the status, the type and the bytes it is answered with.
async fn sent(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<(&str, Vec<u8>)>,
  login: Login,
) -> (StatusCode, String, Vec<u8>) {
  let request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header("owner-key", login.0.to_string())
    .header("owner-role", login.1);
  let request = match body {
    Some((kind, bytes)) => request.header(header::CONTENT_TYPE, kind).body(Body::from(bytes)),
    None => request.body(Body::empty()),
  };
  let answer = app.clone().oneshot(request.unwrap()).await.unwrap();
  let status = answer.status();
  let kind = answer
    .headers()
    .get(header::CONTENT_TYPE)
    .map(|kind| kind.to_str().unwrap().to_owned())
    .unwrap_or_default();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes().to_vec();

  (status, kind, bytes)
}

/// A JSON request as the login, and the status and body it is answered with.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  login: Login,
) -> (StatusCode, Value) {
  let body = body.map(|body| ("application/json", body.to_string().into_bytes()));
  let (status, _, bytes) = sent(app, method, path, body, login).await;
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

/// A unit made by the administrator, under `parent` or as a company.
async fn unit(app: &Router, admin: Login, name: &str, parent: Option<i64>) -> i64 {
  let (status, made) =
    asked(app, Method::POST, "/units", Some(json!({ "name": name, "parent": parent })), admin).await;

  assert_eq!(status, StatusCode::CREATED, "{made}");

  made["id"].as_i64().unwrap()
}

/// A member placed by the administrator in a unit, its head where `head` says so.
async fn person(scratch: &Scratch, app: &Router, admin: Login, name: &str, unit: i64, head: bool) -> Login {
  let user = set_sign_in(scratch.db(), name, "the password", false).await.unwrap().user;
  let (status, said) =
    asked(app, Method::PUT, &format!("/users/{user}/unit"), Some(json!({ "unit": unit })), admin).await;

  assert_eq!(status, StatusCode::OK, "{said}");

  if head {
    let (status, said) = asked(app, Method::PUT, &format!("/units/{unit}/heads/{user}"), None, admin).await;

    assert_eq!(status, StatusCode::NO_CONTENT, "{said}");
  }

  Login(user, "member")
}

async fn tree() -> Tree {
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &console_hash("the password")).await;

  let moved = run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![],
    },
  )
  .await
  .unwrap();
  let admin = Login(moved.administrator.expect("the move names the administrator"), "administrator");
  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let company = unit(&app, admin, "company-a", None).await;
  let centre = unit(&app, admin, "centre-a", Some(company)).await;
  let team = unit(&app, admin, "team-a", Some(centre)).await;
  let other = unit(&app, admin, "company-b", None).await;

  Tree {
    person: person(&scratch, &app, admin, "agent-a", team, false).await,
    centre_head: person(&scratch, &app, admin, "agent-b", centre, true).await,
    company_head: person(&scratch, &app, admin, "agent-c", company, true).await,
    outsider: person(&scratch, &app, admin, "agent-d", other, false).await,
    app,
    admin,
    company,
    centre,
    team,
    _scratch: scratch,
  }
}

impl Tree {
  async fn profile(&self, login: Login) -> Value {
    let (status, said) =
      asked(&self.app, Method::GET, &format!("/users/{}/agent", login.0), None, login).await;

    assert_eq!(status, StatusCode::OK, "{said}");

    said
  }

  /// A permission set as the administrator on a unit, or on a person where `user` names one.
  async fn permit(&self, unit: Option<i64>, user: Option<i32>, setting: &str) {
    let path = match (unit, user) {
      (Some(unit), _) => format!("/units/{unit}/agent-permission"),
      (_, Some(user)) => format!("/users/{user}/agent-permission"),
      _ => unreachable!("a permission is set on a unit or a person"),
    };
    let (status, said) =
      asked(&self.app, Method::PUT, &path, Some(json!({ "setting": setting })), self.admin).await;

    assert_eq!(status, StatusCode::NO_CONTENT, "{said}");
  }

  async fn personalizes(&self, login: Login) -> bool {
    self.profile(login).await["personalize"].as_bool().unwrap()
  }

  /// The picture standing for the person, as its type and bytes, or the status where none is answered.
  async fn picture(&self) -> Result<(String, Vec<u8>), StatusCode> {
    let path = format!("/users/{}/agent/picture", self.person.0);
    let (status, kind, bytes) = sent(&self.app, Method::GET, &path, None, self.person).await;

    if status == StatusCode::OK { Ok((kind, bytes)) } else { Err(status) }
  }
}

#[tokio::test]
async fn each_part_stands_from_the_persons_own_then_the_company_then_the_deployment() {
  ready();
  let tree = tree().await;
  let person = tree.person;

  // Nothing set: the deployment's every part, and the person's company named.
  let said = tree.profile(person).await;

  assert_eq!(said["personalize"], false, "{said}");
  assert_eq!(said["company"]["id"], tree.company, "{said}");
  assert_eq!(said["name"], json!({ "from": "deployment" }), "{said}");
  assert_eq!(said["callNames"], json!({ "from": "deployment", "callNames": [] }), "{said}");
  assert_eq!(said["picture"], json!({ "from": "deployment" }), "{said}");

  // The company's default, where set.
  let path = format!("/companies/{}/agent", tree.company);
  let (status, default) = asked(
    &tree.app,
    Method::PUT,
    &path,
    Some(json!({ "name": "Helper", "callNames": ["helper", "hey"] })),
    tree.admin,
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{default}");
  assert_eq!(default, json!({ "name": "Helper", "callNames": ["helper", "hey"], "picture": false }));

  let said = tree.profile(person).await;

  assert_eq!(said["name"], json!({ "from": "company", "name": "Helper" }), "{said}");
  assert_eq!(
    said["callNames"],
    json!({ "from": "company", "callNames": ["helper", "hey"] }),
    "{said}"
  );

  // The person's own, once permitted, part by part: call names they left empty stay the company's.
  tree.permit(Some(tree.team), None, "allow").await;

  let own = json!({ "name": "Mine", "callNames": [] });
  let (status, said) =
    asked(&tree.app, Method::PUT, &format!("/users/{}/agent", person.0), Some(own), person).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["personalize"], true, "{said}");
  assert_eq!(said["name"], json!({ "from": "own", "name": "Mine" }), "{said}");
  assert_eq!(said["callNames"]["from"], "company", "{said}");

  // Withdrawn, the company's stands again and the person's own is kept as it was.
  tree.permit(Some(tree.team), None, "deny").await;

  let said = tree.profile(person).await;

  assert_eq!(said["personalize"], false, "{said}");
  assert_eq!(said["name"]["from"], "company", "{said}");
  assert_eq!(said["own"], json!({ "name": "Mine", "callNames": [], "picture": false }), "{said}");

  // Given back, it finds the person's own as it was.
  tree.permit(Some(tree.team), None, "allow").await;

  let said = tree.profile(person).await;

  assert_eq!(said["name"], json!({ "from": "own", "name": "Mine" }), "{said}");
}

// "An organisation sets a default for its people's BMOs" on the delegation chain: a unit below the company names its
// own where the company leaves it open, the nearest unit's standing for its people, and a company's lock holds its own
// for every unit below it.
#[tokio::test]
async fn a_unit_below_names_its_own_default_where_the_company_does_not_lock_it() {
  ready();
  let tree = tree().await;
  let company = format!("/companies/{}/agent", tree.company);
  let (status, said) = asked(
    &tree.app,
    Method::PUT,
    &company,
    Some(json!({ "name": "Helper", "callNames": [] })),
    tree.admin,
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");

  let centre_name = format!("/chain/kinds/agent-profile.name/links/unit:{}/value", tree.centre);
  let (status, said) =
    asked(&tree.app, Method::PUT, &centre_name, Some(json!({ "value": "Dear" })), tree.centre_head).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(tree.profile(tree.person).await["name"], json!({ "from": "company", "name": "Dear" }));
  assert_eq!(
    tree.profile(tree.company_head).await["name"],
    json!({ "from": "company", "name": "Helper" })
  );

  let lock = format!("/chain/kinds/agent-profile.name/links/unit:{}/delegation", tree.company);
  let (status, said) =
    asked(&tree.app, Method::PUT, &lock, Some(json!({ "delegation": "lock" })), tree.admin).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    tree.profile(tree.person).await["name"]["name"],
    "Helper",
    "a lock above holds the company's"
  );

  let (status, said) = asked(
    &tree.app,
    Method::PUT,
    &centre_name,
    Some(json!({ "value": "Other" })),
    tree.centre_head,
  )
  .await;

  assert_eq!((status, said["code"].as_str()), (StatusCode::CONFLICT, Some("locked")));
}

#[tokio::test]
async fn the_permission_is_read_nearest_first_and_withheld_where_none_is_set() {
  ready();
  let tree = tree().await;
  let person = tree.person;

  assert!(!tree.personalizes(person).await, "none set is withheld");

  // Each step sets the one nearer the person, then each is taken away again from the nearest.
  for (unit, user, setting, personalizes) in [
    (Some(tree.company), None, "allow", true),
    (Some(tree.centre), None, "deny", false),
    (Some(tree.team), None, "allow", true),
    (None, Some(person.0), "deny", false),
    (None, Some(person.0), "inherit", true),
    (Some(tree.team), None, "inherit", false),
    (Some(tree.centre), None, "inherit", true),
  ] {
    tree.permit(unit, user, setting).await;

    assert_eq!(
      tree.personalizes(person).await,
      personalizes,
      "{setting} on unit {unit:?}, person {user:?}"
    );
  }

  // The administrator may always, with nothing set on them or their company.
  assert!(tree.personalizes(tree.admin).await);

  // Across the company: each unit after its parent with its setting and what it resolves to, and each person.
  tree.permit(Some(tree.centre), None, "deny").await;
  tree.permit(None, Some(person.0), "allow").await;

  let (status, said) = asked(
    &tree.app,
    Method::GET,
    &format!("/units/{}/agent-permissions", tree.company),
    None,
    tree.admin,
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  let units: Vec<(i64, &str, Option<i64>, &str, bool)> = said["units"]
    .as_array()
    .unwrap()
    .iter()
    .map(|unit| {
      (
        unit["id"].as_i64().unwrap(),
        unit["name"].as_str().unwrap(),
        unit["parent"].as_i64(),
        unit["setting"].as_str().unwrap(),
        unit["allowed"].as_bool().unwrap(),
      )
    })
    .collect();

  assert_eq!(
    units,
    [
      (tree.company, "company-a", None, "allow", true),
      (tree.centre, "centre-a", Some(tree.company), "deny", false),
      (tree.team, "team-a", Some(tree.centre), "inherit", false),
    ],
    "{said}"
  );

  let people: Vec<(String, &str, i64, &str, bool)> = said["people"]
    .as_array()
    .unwrap()
    .iter()
    .map(|person| {
      (
        person["user"].as_str().unwrap().to_owned(),
        person["name"].as_str().unwrap(),
        person["unit"].as_i64().unwrap(),
        person["setting"].as_str().unwrap(),
        person["allowed"].as_bool().unwrap(),
      )
    })
    .collect();

  assert_eq!(
    people,
    [
      (person.0.to_string(), "agent-a", tree.team, "allow", true),
      (tree.centre_head.0.to_string(), "agent-b", tree.centre, "inherit", false),
      (tree.company_head.0.to_string(), "agent-c", tree.company, "inherit", true),
    ],
    "{said}"
  );
}

#[tokio::test]
async fn who_may_set_what_and_what_is_refused() {
  ready();
  let tree = tree().await;
  let app = &tree.app;
  let person = tree.person;
  let own = format!("/users/{}/agent", person.0);
  let own_picture = format!("/users/{}/agent/picture", person.0);
  let default = format!("/companies/{}/agent", tree.company);
  let a_default = Some(json!({ "name": "Helper", "callNames": [] }));
  let allow = || Some(json!({ "setting": "allow" }));

  // A person who may not personalise keeps nothing of their own.
  let (status, said) = asked(app, Method::PUT, &own, Some(json!({ "name": "Mine" })), person).await;

  assert_eq!((status, said["code"].as_str()), (StatusCode::FORBIDDEN, Some("personalize-withheld")));

  for method in [Method::PUT, Method::DELETE] {
    let body = (method == Method::PUT).then(|| ("image/jpeg", JPEG.to_vec()));
    let (status, _, bytes) = sent(app, method, &own_picture, body, person).await;
    let said: Value = serde_json::from_slice(&bytes).unwrap();

    assert_eq!((status, said["code"].as_str()), (StatusCode::FORBIDDEN, Some("personalize-withheld")));
  }

  // Another person sets nobody's own, and reads it only as a head of the person's unit.
  let (status, said) = asked(app, Method::PUT, &own, Some(json!({ "name": "Mine" })), tree.outsider).await;

  assert_eq!((status, said["code"].as_str()), (StatusCode::FORBIDDEN, Some("forbidden")));
  assert_eq!(asked(app, Method::GET, &own, None, tree.outsider).await.0, StatusCode::FORBIDDEN);
  assert_eq!(asked(app, Method::GET, &own, None, tree.centre_head).await.0, StatusCode::OK);

  // A member heading nothing sets no default and no permission; anyone of the company reads the default.
  for (path, body) in [
    (default.clone(), a_default.clone()),
    (format!("/units/{}/agent-permission", tree.team), allow()),
    (format!("/users/{}/agent-permission", person.0), allow()),
  ] {
    let (status, said) = asked(app, Method::PUT, &path, body, person).await;

    assert_eq!((status, said["code"].as_str()), (StatusCode::FORBIDDEN, Some("forbidden")), "{path}");
  }

  assert_eq!(asked(app, Method::GET, &default, None, person).await.0, StatusCode::OK);
  assert_eq!(asked(app, Method::GET, &default, None, tree.outsider).await.0, StatusCode::FORBIDDEN);

  // A head of the centre sets the permission on it, below it and on a person standing there, never above it,
  // and no company default; the company's head sets that.
  for (path, allowed) in [
    (format!("/units/{}/agent-permission", tree.centre), true),
    (format!("/units/{}/agent-permission", tree.team), true),
    (format!("/users/{}/agent-permission", person.0), true),
    (format!("/units/{}/agent-permission", tree.company), false),
  ] {
    let (status, said) = asked(app, Method::PUT, &path, allow(), tree.centre_head).await;
    let due = if allowed { StatusCode::NO_CONTENT } else { StatusCode::FORBIDDEN };

    assert_eq!(status, due, "{path}: {said}");
  }

  for (path, due) in [
    (format!("/units/{}/agent-permissions", tree.centre), StatusCode::OK),
    (format!("/units/{}/agent-permissions", tree.company), StatusCode::FORBIDDEN),
  ] {
    assert_eq!(asked(app, Method::GET, &path, None, tree.centre_head).await.0, due, "{path}");
  }

  assert_eq!(
    asked(app, Method::PUT, &default, a_default.clone(), tree.centre_head).await.0,
    StatusCode::FORBIDDEN
  );
  assert_eq!(
    asked(app, Method::PUT, &default, a_default.clone(), tree.company_head).await.0,
    StatusCode::OK
  );

  // A unit that is no company, and one that does not stand, has no default.
  for path in [format!("/companies/{}/agent", tree.centre), "/companies/999999/agent".to_owned()] {
    let (status, said) = asked(app, Method::GET, &path, None, tree.admin).await;

    assert_eq!((status, said["code"].as_str()), (StatusCode::NOT_FOUND, Some("not-found")), "{path}");
  }

  // Values out of shape, the person now permitted.
  let long = "x".repeat(41);
  let eleven: Vec<String> = (0..11).map(|at| format!("name-{at}")).collect();

  for body in [
    json!({ "name": long }),
    json!({ "name": "two\nlines" }),
    json!({ "callNames": [""] }),
    json!({ "callNames": ["one, two"] }),
    json!({ "callNames": [long] }),
    json!({ "callNames": eleven }),
    json!({ "callNames": ["Helper", "helper"] }),
  ] {
    let (status, said) = asked(app, Method::PUT, &own, Some(body.clone()), person).await;

    assert_eq!(
      (status, said["code"].as_str()),
      (StatusCode::BAD_REQUEST, Some("bad-agent-profile")),
      "{body}"
    );
  }

  let (status, said) =
    asked(app, Method::PUT, &default, Some(json!({ "callNames": ["a,b"] })), tree.admin).await;

  assert_eq!((status, said["code"].as_str()), (StatusCode::BAD_REQUEST, Some("bad-agent-profile")));

  // Bytes that are no picture, and a picture larger than 10 MB.
  let (status, _, bytes) =
    sent(app, Method::PUT, &own_picture, Some(("image/png", b"not a picture".to_vec())), person).await;
  let said: Value = serde_json::from_slice(&bytes).unwrap();

  assert_eq!((status, said["code"].as_str()), (StatusCode::BAD_REQUEST, Some("not-a-picture")));

  let mut large = PNG.to_vec();
  large.resize(10 * 1024 * 1024 + 1, 0);
  let (status, _, bytes) = sent(app, Method::PUT, &own_picture, Some(("image/png", large)), person).await;
  let said: Value = serde_json::from_slice(&bytes).unwrap();

  assert_eq!(
    (status, said["code"].as_str()),
    (StatusCode::PAYLOAD_TOO_LARGE, Some("picture-too-large"))
  );
}

#[tokio::test]
async fn the_company_picture_stands_for_a_member_until_their_own_takes_its_place() {
  ready();
  let tree = tree().await;
  let app = &tree.app;
  let person = tree.person;
  let default_picture = format!("/companies/{}/agent/picture", tree.company);
  let own_picture = format!("/users/{}/agent/picture", person.0);

  assert_eq!(tree.picture().await, Err(StatusCode::NOT_FOUND), "the deployment's stands");

  let (status, _, _) =
    sent(app, Method::PUT, &default_picture, Some(("image/png", PNG.to_vec())), tree.admin).await;

  assert_eq!(status, StatusCode::NO_CONTENT);

  let (status, kind, bytes) = sent(app, Method::GET, &default_picture, None, person).await;

  assert_eq!((status, kind.as_str(), bytes.as_slice()), (StatusCode::OK, "image/png", PNG));
  assert_eq!(tree.picture().await, Ok(("image/png".to_owned(), PNG.to_vec())));
  assert_eq!(tree.profile(person).await["picture"]["from"], "company");

  // The person's own, while permitted.
  tree.permit(None, Some(person.0), "allow").await;

  let (status, _, _) =
    sent(app, Method::PUT, &own_picture, Some(("image/jpeg", JPEG.to_vec())), person).await;

  assert_eq!(status, StatusCode::NO_CONTENT);
  assert_eq!(tree.picture().await, Ok(("image/jpeg".to_owned(), JPEG.to_vec())));

  let said = tree.profile(person).await;

  assert_eq!(
    (said["picture"]["from"].as_str(), said["own"]["picture"].as_bool()),
    (Some("own"), Some(true))
  );

  tree.permit(None, Some(person.0), "deny").await;

  assert_eq!(tree.picture().await, Ok(("image/png".to_owned(), PNG.to_vec())));

  // Taken away, the company's stands again, and with that gone the deployment's.
  tree.permit(None, Some(person.0), "allow").await;

  let (status, _, _) = sent(app, Method::DELETE, &own_picture, None, person).await;

  assert_eq!(status, StatusCode::NO_CONTENT);
  assert_eq!(tree.picture().await, Ok(("image/png".to_owned(), PNG.to_vec())));

  let (status, _, _) = sent(app, Method::DELETE, &default_picture, None, tree.admin).await;

  assert_eq!(status, StatusCode::NO_CONTENT);
  assert_eq!(tree.picture().await, Err(StatusCode::NOT_FOUND));
  assert_eq!(sent(app, Method::GET, &default_picture, None, person).await.0, StatusCode::NOT_FOUND);
}

#[test]
fn a_picture_is_known_by_its_first_bytes() {
  assert_eq!(picture_type(PNG), Some("image/png"));
  assert_eq!(picture_type(JPEG), Some("image/jpeg"));
  assert_eq!(picture_type(b"GIF89a and the rest"), Some("image/gif"));
  assert_eq!(picture_type(b"RIFF\x10\0\0\0WEBPVP8 "), Some("image/webp"));
  assert_eq!(picture_type(b"RIFF\x10\0\0\0WAVEfmt "), None);
  assert_eq!(picture_type(b"<svg></svg>"), None);
}
