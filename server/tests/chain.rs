//! The delegation chain (docs/accounts.md, 「The delegation chain」 and 「Tests」): resolution over a chain held in
//! memory, by each mode, under a lock and through rules; the routes on a scratch database — declaring a kind, who
//! writes which link, a lock withholding the links below it, rules and groups.

use std::collections::HashMap;

use crate::support::{Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_client::{ChainDelegation, ChainKind, ChainLevel, ChainMode, ChainPersonWriter, ChainShape};
use bmo_web_server::chain::{Entry, Link, Path, Who, resolve_on};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

// ---------------------------------------------------------------------------------------------------------
// Resolution over a chain held in memory

/// A kind of the shape and mode, held at every level.
fn kind(shape: ChainShape, mode: ChainMode, rules: bool, default: Option<Value>) -> ChainKind {
  ChainKind {
    key: "test.setting".to_owned(),
    declared_by: "unit-a".to_owned(),
    description: String::new(),
    shape,
    choices: vec!["a".to_owned(), "b".to_owned(), "c".to_owned()],
    mode,
    default,
    rules,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit, ChainLevel::Person],
    unit_permission: "manage".to_owned(),
    person_writer: ChainPersonWriter::Heads,
  }
}

fn said(value: Value) -> Entry {
  Entry {
    value: Some(value),
    ..Entry::default()
  }
}

fn locked(value: Option<Value>) -> Entry {
  Entry {
    value,
    delegation: ChainDelegation::Lock,
    ..Entry::default()
  }
}

fn ruled(value: Option<Value>, rules: Vec<(Who, Value)>) -> Entry {
  Entry {
    value,
    rules,
    ..Entry::default()
  }
}

/// A person, 9, standing in unit 3, under unit 2, under the company, 1.
fn person_path() -> Path {
  Path::of_person(vec![1, 2, 3], 9)
}

fn held(entries: Vec<(Link, Entry)>) -> HashMap<Link, Entry> {
  entries.into_iter().collect()
}

#[test]
fn the_nearest_value_stands_and_the_default_where_none_is_said() {
  let text = kind(ChainShape::Text, ChainMode::Nearest, false, Some(json!("default")));
  let path = person_path();

  let none = resolve_on(&text, &path, &HashMap::new(), &[]);
  assert_eq!((none.value, none.from), (Some(json!("default")), None));

  let entries =
    held(vec![(Link::Platform, said(json!("platform"))), (Link::Unit(2), said(json!("centre")))]);
  let resolved = resolve_on(&text, &path, &entries, &[]);
  assert_eq!(resolved.value, Some(json!("centre")));
  assert_eq!(resolved.from, Some(Link::Unit(2)));
  assert_eq!(resolved.layers.len(), 2);

  let mut entries = entries;
  entries.insert(Link::Person(9), said(json!("own")));
  let resolved = resolve_on(&text, &path, &entries, &[]);
  assert_eq!((resolved.value, resolved.from), (Some(json!("own")), Some(Link::Person(9))));
}

#[test]
fn a_lock_above_cuts_what_the_links_below_it_say() {
  let text = kind(ChainShape::Text, ChainMode::Nearest, false, None);
  let path = person_path();

  // The company locks its value: the centre's and the person's own are kept and not read.
  let entries = held(vec![
    (Link::Platform, said(json!("platform"))),
    (Link::Unit(1), locked(Some(json!("company")))),
    (Link::Unit(2), said(json!("centre"))),
    (Link::Person(9), said(json!("own"))),
  ]);
  let resolved = resolve_on(&text, &path, &entries, &[]);
  assert_eq!(resolved.value, Some(json!("company")));
  assert_eq!(resolved.locked_by, Some(Link::Unit(1)));
  assert_eq!(
    resolved.layers.iter().map(|layer| layer.link).collect::<Vec<_>>(),
    [Link::Platform, Link::Unit(1)]
  );

  // A lock holding no value of its own stands for what is above it, and the farthest of two locks cuts.
  let entries = held(vec![
    (Link::Platform, said(json!("platform"))),
    (Link::Unit(1), locked(None)),
    (Link::Unit(2), locked(Some(json!("centre")))),
  ]);
  let resolved = resolve_on(&text, &path, &entries, &[]);
  assert_eq!((resolved.value, resolved.locked_by), (Some(json!("platform")), Some(Link::Unit(1))));

  // A lock on the subject's own link binds nothing below it, there being nothing below.
  let unit = Path::of_units(vec![1, 2]);
  let entries = held(vec![
    (Link::Platform, said(json!("platform"))),
    (Link::Unit(2), locked(Some(json!("own")))),
  ]);
  let resolved = resolve_on(&text, &unit, &entries, &[]);
  assert_eq!((resolved.value, resolved.locked_by), (Some(json!("own")), None));
}

#[test]
fn a_narrowing_kind_takes_the_narrowest_and_no_link_widens_it() {
  let path = person_path();

  let amount = kind(ChainShape::Amount, ChainMode::Narrowing, false, Some(json!("unlimited")));
  assert_eq!(resolve_on(&amount, &path, &HashMap::new(), &[]).value, Some(json!("unlimited")));
  let entries = held(vec![
    (Link::Platform, said(json!("unlimited"))),
    (Link::Unit(1), said(json!(500))),
    (Link::Unit(3), said(json!(900))),
  ]);
  assert_eq!(resolve_on(&amount, &path, &entries, &[]).value, Some(json!(500)));

  let keys = kind(ChainShape::Keys, ChainMode::Narrowing, false, None);
  let entries = held(vec![
    (Link::Platform, said(json!(["a", "b", "c"]))),
    (Link::Unit(2), said(json!(["c", "a"]))),
  ]);
  assert_eq!(resolve_on(&keys, &path, &entries, &[]).value, Some(json!(["c", "a"])));
  let mut entries = entries;
  entries.insert(Link::Person(9), said(json!(["b", "a"])));
  assert_eq!(resolve_on(&keys, &path, &entries, &[]).value, Some(json!(["a"])));

  let flag = kind(ChainShape::Flag, ChainMode::Narrowing, false, None);
  let entries = held(vec![(Link::Unit(1), said(json!(false))), (Link::Person(9), said(json!(true)))]);
  assert_eq!(resolve_on(&flag, &path, &entries, &[]).value, Some(json!(false)));
}

#[test]
fn a_layered_kind_answers_every_link_top_first() {
  let layered = kind(ChainShape::Json, ChainMode::Layered, false, None);
  let entries = held(vec![
    (Link::Person(9), said(json!({ "at": "person" }))),
    (Link::Platform, said(json!({ "at": "platform" }))),
    (Link::Unit(2), said(json!({ "at": "centre" }))),
  ]);
  let resolved = resolve_on(&layered, &person_path(), &entries, &[]);

  assert_eq!(resolved.value, None);
  assert_eq!(
    resolved.layers.iter().map(|layer| layer.link).collect::<Vec<_>>(),
    [Link::Platform, Link::Unit(2), Link::Person(9)]
  );
}

#[test]
fn a_person_s_rule_comes_before_a_group_s_before_a_unit_s_before_the_link_s_own() {
  let text = kind(ChainShape::Text, ChainMode::Nearest, true, None);
  let path = person_path();
  let rules = |with: Vec<(Who, Value)>| held(vec![(Link::Unit(1), ruled(Some(json!("company")), with))]);
  let answer = |entries: &HashMap<Link, Entry>, groups: &[i64]| {
    let resolved = resolve_on(&text, &path, entries, groups);

    (resolved.value.unwrap(), resolved.rule)
  };

  let all = vec![
    (Who::Unit(2), json!("centre's people")),
    (Who::Unit(3), json!("team's people")),
    (Who::Group(7), json!("group")),
    (Who::Person(9), json!("person")),
  ];
  assert_eq!(answer(&rules(all.clone()), &[7]), (json!("person"), Some(Who::Person(9))));
  assert_eq!(answer(&rules(all[..3].to_vec()), &[7]), (json!("group"), Some(Who::Group(7))));
  // Not in the group: the rule of the unit nearest the person stands.
  assert_eq!(answer(&rules(all[..3].to_vec()), &[]), (json!("team's people"), Some(Who::Unit(3))));
  assert_eq!(
    answer(&rules(vec![(Who::Person(8), json!("someone else"))]), &[]),
    (json!("company"), None)
  );

  // Of two groups, the one made first stands; under a narrowing kind, the narrowest.
  let two = rules(vec![(Who::Group(5), json!("first")), (Who::Group(7), json!("second"))]);
  assert_eq!(answer(&two, &[5, 7]), (json!("first"), Some(Who::Group(5))));
  let amount = kind(ChainShape::Amount, ChainMode::Narrowing, true, None);
  let two = held(vec![(
    Link::Unit(1),
    ruled(None, vec![(Who::Group(5), json!(300)), (Who::Group(7), json!(100))]),
  )]);
  let resolved = resolve_on(&amount, &path, &two, &[5, 7]);
  assert_eq!((resolved.value, resolved.layers[0].rule), (Some(json!(100)), Some(Who::Group(7))));
}

#[test]
fn the_nearer_link_comes_before_a_rule_of_a_farther_one() {
  let text = kind(ChainShape::Text, ChainMode::Nearest, true, None);
  let entries = held(vec![
    (
      Link::Unit(1),
      ruled(None, vec![(Who::Person(9), json!("company's word for the person"))]),
    ),
    (Link::Unit(3), said(json!("team"))),
  ]);
  let resolved = resolve_on(&text, &person_path(), &entries, &[]);

  assert_eq!(
    (resolved.value, resolved.from, resolved.rule),
    (Some(json!("team")), Some(Link::Unit(3)), None)
  );

  // A unit as the subject is answered by the rules naming a unit on its path alone.
  let entries = held(vec![(
    Link::Unit(1),
    ruled(
      Some(json!("company")),
      vec![(Who::Person(9), json!("person")), (Who::Unit(2), json!("centre"))],
    ),
  )]);
  let resolved = resolve_on(&text, &Path::of_units(vec![1, 2]), &entries, &[]);
  assert_eq!(resolved.value, Some(json!("centre")));
}

// ---------------------------------------------------------------------------------------------------------
// The routes

/// A login a call is made for: its user and its role.
#[derive(Clone, Copy)]
struct Login(i32, &'static str);

/// A JSON request as the login, and the status and body it is answered with.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  login: Login,
) -> (StatusCode, Value) {
  let request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
    .header("owner-key", login.0.to_string())
    .header("owner-role", login.1);
  let request = match body {
    Some(body) => request
      .header(header::CONTENT_TYPE, "application/json")
      .body(Body::from(body.to_string())),
    None => request.body(Body::empty()),
  };
  let answer = app.clone().oneshot(request.unwrap()).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

/// A company with a centre under it and a team under the centre, a person standing in the team, one who heads the
/// centre, one who heads the company, and one standing in another company.
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
  // The tree's database, standing as long as the tree does.
  _scratch: Scratch,
}

async fn unit(app: &Router, admin: Login, name: &str, parent: Option<i64>) -> i64 {
  let (status, made) =
    asked(app, Method::POST, "/units", Some(json!({ "name": name, "parent": parent })), admin).await;

  assert_eq!(status, StatusCode::CREATED, "{made}");

  made["id"].as_i64().unwrap()
}

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
  ready();
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
  async fn ask(
    &self,
    method: Method,
    path: &str,
    body: Option<Value>,
    login: Login,
  ) -> (StatusCode, Value) {
    asked(&self.app, method, path, body, login).await
  }

  async fn declare(&self, declaration: Value) -> (StatusCode, Value) {
    let key = declaration["key"].as_str().unwrap().to_owned();

    self
      .ask(Method::PUT, &format!("/chain/kinds/{key}"), Some(declaration), self.admin)
      .await
  }

  /// A link's value written by a login, answered by its status.
  async fn value(&self, key: &str, link: &str, value: Value, login: Login) -> StatusCode {
    let path = format!("/chain/kinds/{key}/links/{link}/value");
    let (status, said) = self.ask(Method::PUT, &path, Some(json!({ "value": value })), login).await;

    if status != StatusCode::OK {
      assert!(said["code"].is_string(), "{said}");
    }

    status
  }

  async fn resolve(&self, key: &str, query: &str) -> Value {
    let (status, said) = self
      .ask(Method::GET, &format!("/chain/kinds/{key}/resolve?{query}"), None, self.admin)
      .await;

    assert_eq!(status, StatusCode::OK, "{said}");

    said
  }
}

#[tokio::test]
async fn a_kind_is_declared_by_its_unit_and_held_to_its_shape() {
  let tree = tree().await;
  let declaration = json!({
    "key": "test.limit", "declaredBy": "unit-a", "shape": "amount", "mode": "narrowing",
    "default": "unlimited", "rules": true, "levels": ["platform", "unit", "person"],
  });

  let (status, said) = tree.declare(declaration.clone()).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    (said["unitPermission"].clone(), said["personWriter"].clone()),
    (json!("manage"), json!("heads"))
  );

  // The service's own consumers declared theirs as it stood; every kind is listed by its key.
  let (_, said) = tree.ask(Method::GET, "/chain/kinds", None, tree.person).await;
  let keys: Vec<&str> = said["kinds"]
    .as_array()
    .unwrap()
    .iter()
    .map(|kind| kind["key"].as_str().unwrap())
    .collect();
  assert_eq!(
    keys,
    [
      "account.second-factor-required",
      "agent-profile.call-names",
      "agent-profile.name",
      "agent-profile.personalize",
      "agent-profile.picture",
      "supply.credit-allowance",
      "supply.organisation",
      "supply.own",
      "supply.policy",
      "test.limit"
    ]
  );

  // Declared again by its own unit it changes; by another it is refused, and so is a shape out of its rules.
  let mut again = declaration.clone();
  again["description"] = json!("a limit");
  assert_eq!(tree.declare(again).await.0, StatusCode::OK);
  let mut elsewhere = declaration.clone();
  elsewhere["declaredBy"] = json!("unit-b");
  let (status, said) = tree.declare(elsewhere).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("kind-declared-elsewhere")));
  let (status, said) = tree
    .declare(json!({ "key": "test.words", "declaredBy": "unit-a", "shape": "text", "mode": "narrowing", "levels": ["unit"] }))
    .await;
  assert_eq!((status, said["code"].clone()), (StatusCode::BAD_REQUEST, json!("bad-kind")));
  let (status, said) = tree
    .ask(Method::GET, "/chain/kinds/test.nothing/resolve?unit=1", None, tree.admin)
    .await;
  assert_eq!((status, said["code"].clone()), (StatusCode::NOT_FOUND, json!("no-such-kind")));

  // Once a link holds an entry, its shape and mode stand.
  assert_eq!(tree.value("test.limit", "platform", json!(500), tree.admin).await, StatusCode::OK);
  let mut reshaped = declaration;
  reshaped["mode"] = json!("nearest");
  let (status, said) = tree.declare(reshaped).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("kind-in-use")));
}

// "A json kind's value is written by its consumer alone": the chain's own write refuses it, but for the unit that
// declared the kind naming itself, which judged the value; and a resolution names every link of the subject's chain,
// whether or not it says anything.
#[tokio::test]
async fn a_json_value_is_written_by_its_declarer_and_a_resolution_names_the_subject_s_whole_path() {
  let tree = tree().await;
  let declaration = json!({
    "key": "test.shape", "declaredBy": "unit-a", "shape": "json", "mode": "nearest",
    "rules": false, "levels": ["platform", "unit", "person"],
  });

  assert_eq!(tree.declare(declaration).await.0, StatusCode::OK);

  let link = format!("unit:{}", tree.centre);
  let write = |declarer: Option<&'static str>| {
    let mut request = Request::builder()
      .method(Method::PUT)
      .uri(format!("/chain/kinds/test.shape/links/{link}/value"))
      .header("x-real-ip", "127.0.0.1")
      .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
      .header("owner-key", tree.centre_head.0.to_string())
      .header("owner-role", tree.centre_head.1)
      .header(header::CONTENT_TYPE, "application/json");

    if let Some(declarer) = declarer {
      request = request.header("declared-by", declarer);
    }

    request.body(Body::from(json!({ "value": { "roles": {} } }).to_string())).unwrap()
  };

  for (declarer, status) in [
    (None, StatusCode::CONFLICT),
    (Some("unit-b"), StatusCode::CONFLICT),
    (Some("unit-a"), StatusCode::OK),
  ] {
    let answer = tree.app.clone().oneshot(write(declarer)).await.unwrap();

    assert_eq!(answer.status(), status, "{declarer:?}");
  }

  let said = tree.resolve("test.shape", &format!("person={}", tree.person.0)).await;

  assert_eq!(said["value"], json!({ "roles": {} }));
  assert_eq!(
    said["path"],
    json!([
      "platform",
      format!("unit:{}", tree.company),
      format!("unit:{}", tree.centre),
      format!("unit:{}", tree.team),
      format!("person:{}", tree.person.0)
    ])
  );
}

#[tokio::test]
async fn who_writes_which_link_and_a_lock_withholds_every_link_below_it_but_from_the_administrator() {
  let tree = tree().await;
  let (person, centre_head, company_head) = (tree.person, tree.centre_head, tree.company_head);
  let (status, said) = tree
    .declare(json!({
      "key": "test.mode", "declaredBy": "unit-a", "shape": "text", "mode": "nearest",
      "levels": ["platform", "unit", "person"], "personWriter": "both",
    }))
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  let company = format!("unit:{}", tree.company);
  let centre = format!("unit:{}", tree.centre);
  let own = format!("person:{}", person.0);

  // Each link is written by those who head it or a unit above it, a person's by them as well.
  assert_eq!(
    tree.value("test.mode", "platform", json!("platform"), company_head).await,
    StatusCode::FORBIDDEN
  );
  assert_eq!(tree.value("test.mode", "platform", json!("platform"), tree.admin).await, StatusCode::OK);
  assert_eq!(tree.value("test.mode", &company, json!("company"), company_head).await, StatusCode::OK);
  assert_eq!(
    tree.value("test.mode", &company, json!("company"), centre_head).await,
    StatusCode::FORBIDDEN
  );
  assert_eq!(
    tree.value("test.mode", &company, json!("company"), tree.outsider).await,
    StatusCode::FORBIDDEN
  );
  assert_eq!(tree.value("test.mode", &centre, json!("centre"), centre_head).await, StatusCode::OK);
  assert_eq!(
    tree.value("test.mode", &format!("unit:{}", tree.team), json!("team"), person).await,
    StatusCode::FORBIDDEN
  );
  assert_eq!(tree.value("test.mode", &own, json!("own"), person).await, StatusCode::OK);
  assert_eq!(
    tree
      .value("test.mode", &format!("person:{}", centre_head.0), json!("theirs"), person)
      .await,
    StatusCode::FORBIDDEN
  );
  assert_eq!(tree.value("test.mode", &own, json!(7), person).await, StatusCode::BAD_REQUEST);
  let (status, said) = tree
    .ask(
      Method::PUT,
      &format!("/chain/kinds/test.mode/links/{own}/delegation"),
      Some(json!({ "delegation": "allow" })),
      person,
    )
    .await;
  assert_eq!((status, said["code"].clone()), (StatusCode::BAD_REQUEST, json!("bad-link")));

  let said = tree.resolve("test.mode", &format!("person={}&link={centre}", person.0)).await;
  assert_eq!((said["value"].clone(), said["from"].clone()), (json!("own"), json!(own)));
  assert_eq!(said["link"]["mayChange"], true, "{said}");

  // The company locks it: nobody below changes it but the platform administrator, and the company's value stands.
  let (status, said) = tree
    .ask(
      Method::PUT,
      &format!("/chain/kinds/test.mode/links/{company}/delegation"),
      Some(json!({ "delegation": "lock" })),
      company_head,
    )
    .await;
  assert_eq!((status, said["delegation"].clone()), (StatusCode::OK, json!("lock")));
  let path = format!("/chain/kinds/test.mode/links/{centre}/value");
  let (status, said) = tree.ask(Method::PUT, &path, Some(json!({ "value": "again" })), centre_head).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("locked")));
  assert_eq!(tree.value("test.mode", &own, json!("again"), person).await, StatusCode::CONFLICT);
  let (status, said) = tree
    .ask(Method::PUT, &path, Some(json!({ "value": "administrator's" })), tree.admin)
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    (said["value"].clone(), said["writable"].clone()),
    (json!("administrator's"), json!(true))
  );
  let (status, said) = tree
    .ask(
      Method::PUT,
      &format!("/chain/kinds/test.mode/links/{own}/value"),
      Some(json!({ "value": "own by the administrator" })),
      tree.admin,
    )
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(tree.value("test.mode", &own, json!("own"), tree.admin).await, StatusCode::OK);
  assert_eq!(
    tree.value("test.mode", &company, json!("company again"), company_head).await,
    StatusCode::OK
  );

  let said = tree.resolve("test.mode", &format!("person={}&link={centre}", person.0)).await;
  assert_eq!((said["value"].clone(), said["from"].clone()), (json!("company again"), json!(company)));
  assert_eq!(said["lockedBy"], json!(company), "{said}");
  assert_eq!(
    (said["link"]["mayChange"].clone(), said["link"]["lockedBy"].clone()),
    (json!(false), json!(company))
  );
  let said = tree.resolve("test.mode", &format!("unit={}&link={company}", tree.team)).await;
  assert_eq!(said["link"]["mayChange"], true, "{said}");

  let (status, said) = tree
    .ask(Method::GET, &format!("/chain/kinds/test.mode/links/{centre}"), None, centre_head)
    .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    (said["value"].clone(), said["writable"].clone()),
    (json!("administrator's"), json!(false))
  );
  assert_eq!(said["lockedBy"], json!(company), "{said}");
  let (status, _) = tree
    .ask(Method::GET, &format!("/chain/kinds/test.mode/links/{centre}"), None, person)
    .await;
  assert_eq!(status, StatusCode::FORBIDDEN);
  let (status, said) = tree
    .ask(Method::GET, &format!("/chain/kinds/test.mode/links/{own}"), None, person)
    .await;
  assert_eq!((status, said["value"].clone()), (StatusCode::OK, json!("own")));

  // The lock lifted, what stood below it stands again.
  let (status, _) = tree
    .ask(
      Method::PUT,
      &format!("/chain/kinds/test.mode/links/{company}/delegation"),
      Some(json!({ "delegation": "inherit" })),
      company_head,
    )
    .await;
  assert_eq!(status, StatusCode::OK);
  let said = tree.resolve("test.mode", &format!("person={}", person.0)).await;
  assert_eq!(said["value"], json!("own"), "{said}");

  // A json kind's value is its consumer's alone; its delegation is the chain's.
  let path = "/chain/kinds/supply.policy/links/platform";
  let (status, said) = tree
    .ask(Method::PUT, &format!("{path}/value"), Some(json!({ "value": {} })), tree.admin)
    .await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("consumer-written")));
  let (status, said) = tree
    .ask(
      Method::PUT,
      &format!("{path}/delegation"),
      Some(json!({ "delegation": "allow" })),
      tree.admin,
    )
    .await;
  assert_eq!((status, said["delegation"].clone()), (StatusCode::OK, json!("allow")));
}

#[tokio::test]
async fn rules_name_people_groups_and_units_and_a_group_is_kept_by_its_unit() {
  let tree = tree().await;
  let (person, company_head) = (tree.person, tree.company_head);
  tree
    .declare(json!({
      "key": "test.pick", "declaredBy": "unit-a", "shape": "text", "mode": "nearest", "rules": true,
      "levels": ["platform", "unit", "person"],
    }))
    .await;
  let company = format!("unit:{}", tree.company);
  let centre = format!("unit:{}", tree.centre);

  // A group is made by a head of its unit, of people of its company alone, no two of one unit alike.
  let make = |name: &str, members: Vec<String>, login: Login| {
    tree.ask(
      Method::POST,
      "/chain/groups",
      Some(json!({ "unit": tree.company, "name": name, "members": members })),
      login,
    )
  };
  let (status, group) = make("group-a", vec![person.0.to_string()], company_head).await;
  assert_eq!(status, StatusCode::CREATED, "{group}");
  let group_id = group["id"].as_i64().unwrap();
  assert_eq!(make("group-b", vec![], person).await.0, StatusCode::FORBIDDEN);
  let (status, said) = make("group-b", vec![tree.outsider.0.to_string()], company_head).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("other-company")));
  let (status, said) = make("GROUP-A", vec![], company_head).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("group-exists")));
  let (status, said) = tree
    .ask(Method::GET, &format!("/chain/groups?unit={}", tree.company), None, person)
    .await;
  assert_eq!((status, said["groups"][0]["name"].clone()), (StatusCode::OK, json!("group-a")));
  let (status, _) = tree.ask(Method::GET, &format!("/chain/groups/{group_id}"), None, tree.outsider).await;
  assert_eq!(status, StatusCode::NOT_FOUND);

  // The company's rules: the person's own before the group's before the unit's before the company's value.
  let rules_path = format!("/chain/kinds/test.pick/links/{company}/rules");
  let rules =
    |rules: Value| tree.ask(Method::PUT, &rules_path, Some(json!({ "rules": rules })), company_head);
  assert_eq!(tree.value("test.pick", &company, json!("company"), company_head).await, StatusCode::OK);
  let unit_rule = json!({ "who": format!("unit:{}", tree.team), "value": "team's people" });
  let group_rule = json!({ "who": format!("group:{group_id}"), "value": "group" });
  let person_rule = json!({ "who": format!("person:{}", person.0), "value": "person" });
  let subject = format!("person={}", person.0);
  let (status, said) = rules(json!([unit_rule, group_rule, person_rule])).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  let said = tree.resolve("test.pick", &subject).await;
  assert_eq!(
    (said["value"].clone(), said["rule"].clone()),
    (json!("person"), json!(format!("person:{}", person.0)))
  );
  rules(json!([unit_rule, group_rule])).await;
  assert_eq!(tree.resolve("test.pick", &subject).await["value"], json!("group"));
  rules(json!([unit_rule])).await;
  assert_eq!(tree.resolve("test.pick", &subject).await["value"], json!("team's people"));
  let said = tree.resolve("test.pick", &format!("person={}", tree.centre_head.0)).await;
  assert_eq!(said["value"], json!("company"), "{said}");

  // A nearer link's own value comes before a farther link's rule.
  rules(json!([person_rule])).await;
  assert_eq!(
    tree.value("test.pick", &centre, json!("centre"), tree.centre_head).await,
    StatusCode::OK
  );
  let said = tree.resolve("test.pick", &subject).await;
  assert_eq!((said["value"].clone(), said["from"].clone()), (json!("centre"), json!(centre)));

  // A rule names nobody beyond its link's reach, and a person's link holds none.
  let path = format!("/chain/kinds/test.pick/links/{centre}/rules");
  for who in [format!("person:{}", tree.outsider.0), company.clone()] {
    let (status, said) = tree
      .ask(
        Method::PUT,
        &path,
        Some(json!({ "rules": [{ "who": who, "value": "x" }] })),
        tree.centre_head,
      )
      .await;
    assert_eq!((status, said["code"].clone()), (StatusCode::BAD_REQUEST, json!("bad-rule")), "{who}");
  }

  // A group a rule names stays; once no rule names it, it goes.
  rules(json!([group_rule])).await;
  let (status, said) =
    tree.ask(Method::DELETE, &format!("/chain/groups/{group_id}"), None, company_head).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("group-in-use")));
  let (status, _) = tree
    .ask(Method::DELETE, &format!("/chain/kinds/test.pick/links/{company}"), None, company_head)
    .await;
  assert_eq!(status, StatusCode::NO_CONTENT);
  let (status, _) =
    tree.ask(Method::DELETE, &format!("/chain/groups/{group_id}"), None, company_head).await;
  assert_eq!(status, StatusCode::NO_CONTENT);
}
