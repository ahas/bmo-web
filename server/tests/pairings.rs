//! Desktop pairing (docs/accounts.md, 「Desktop pairing」): a pairing asked with no sign-in, read as waiting, approved
//! by a signed-in person for their own machine and read once with that machine's credential; a person bound to none
//! given a fresh binding; a refused or expired pairing closed; and no pairing answering a credential for any machine
//! but the approving person's. The pairings read a clock of the test's own, so nothing waits on the real one.

use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::Refusal;
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::nodes::{NodeHub, Nodes};
use bmo_web_server::one;
use bmo_web_server::pairings::{LIFETIME_MS, PER_ADDRESS};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use hmac::{Hmac, Mac};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";
const AGENT_KEY: &str = "agent-key";
const START: i64 = 1_800_000_000_000;

struct NoAgents;

#[async_trait::async_trait]
impl NodeHub for NoAgents {
  async fn attached(&self) -> Result<Vec<String>, Refusal> {
    Ok(Vec::new())
  }
}

struct Stood {
  app: Router,
  clock: Arc<AtomicI64>,
  scratch: Scratch,
  /// A person whose account is bound to the machine `u<bound>`.
  bound: i32,
  /// A person whose account is bound to no machine.
  unbound: i32,
}

async fn stood() -> Stood {
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
  let bound = set_sign_in(scratch.db(), "bound-a", "the password", false).await.unwrap().user;
  let unbound = set_sign_in(scratch.db(), "unbound-a", "the password", false).await.unwrap().user;

  scratch
    .run(
      r#"INSERT INTO "user_nodes" ("user_id", "agent") VALUES ($1::bigint, $2)"#,
      vec![bound.into(), format!("u{bound}").into()],
    )
    .await;
  let clock = Arc::new(AtomicI64::new(START));
  let read = clock.clone();
  let nodes = Nodes {
    hub: Arc::new(NoAgents),
    hub_url: "wss://hub.invalid".into(),
    install_base: "https://install.invalid/jake".into(),
    agent_key: AGENT_KEY.into(),
  };
  let service = scratch
    .service
    .clone()
    .with_nodes(nodes)
    .pairing_by(Arc::new(move || read.load(Ordering::Relaxed)));
  let app = in_force(service, TOKEN.into()).await.unwrap();

  Stood {
    app,
    clock,
    scratch,
    bound,
    unbound,
  }
}

impl Stood {
  fn pass(&self, ms: i64) {
    self.clock.fetch_add(ms, Ordering::Relaxed);
  }

  async fn asked(
    &self,
    method: Method,
    path: &str,
    reader: Option<i32>,
    address: &str,
  ) -> (StatusCode, Value) {
    let mut request = Request::builder()
      .method(method)
      .uri(path)
      .header("x-real-ip", address)
      .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

    if let Some(user) = reader {
      request = request.header("owner-key", user.to_string());
    }

    let answer = self.app.clone().oneshot(request.body(Body::empty()).unwrap()).await.unwrap();
    let status = answer.status();
    let bytes = answer.into_body().collect().await.unwrap().to_bytes();

    (
      status,
      if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() },
    )
  }

  /// A pairing asked from one address: its id and its code.
  async fn paired(&self) -> (String, String) {
    let (status, made) = self.asked(Method::POST, "/desktop/pairings", None, "192.0.2.1").await;

    assert_eq!(status, StatusCode::CREATED, "{made}");
    (made["pairing"].as_str().unwrap().to_owned(), made["code"].as_str().unwrap().to_owned())
  }

  async fn read(&self, pairing: &str) -> (StatusCode, Value) {
    self
      .asked(Method::GET, &format!("/desktop/pairings/{pairing}"), None, "192.0.2.1")
      .await
  }

  async fn view(&self, code: &str, reader: i32) -> (StatusCode, Value) {
    self
      .asked(Method::GET, &format!("/desktop/pairings/code/{code}"), Some(reader), "192.0.2.9")
      .await
  }

  async fn approve(&self, code: &str, reader: i32) -> (StatusCode, Value) {
    self
      .asked(
        Method::POST,
        &format!("/desktop/pairings/code/{code}/approve"),
        Some(reader),
        "192.0.2.9",
      )
      .await
  }

  async fn refuse(&self, code: &str, reader: i32) -> (StatusCode, Value) {
    self
      .asked(
        Method::POST,
        &format!("/desktop/pairings/code/{code}/refuse"),
        Some(reader),
        "192.0.2.9",
      )
      .await
  }

  async fn machine_of(&self, user: i32) -> Option<String> {
    one(
      self.scratch.db(),
      r#"SELECT "agent" FROM "user_nodes" WHERE "user_id" = $1::bigint"#,
      vec![user.into()],
    )
    .await
    .unwrap()
    .map(|row| row.try_get::<String>("", "agent").unwrap())
  }
}

/// The credential jake's hub accepts for a machine: its name, a dot, and HMAC-SHA256 over the name keyed by the
/// hub's agent key, in lowercase hex.
fn verified(credential: &str, machine: &str) -> bool {
  let Some((name, hex)) = credential.split_once('.') else {
    return false;
  };
  let mut mac = Hmac::<sha2::Sha256>::new_from_slice(AGENT_KEY.as_bytes()).unwrap();

  mac.update(name.as_bytes());
  let expected: String = mac.finalize().into_bytes().iter().map(|byte| format!("{byte:02x}")).collect();

  name == machine && hex == expected
}

#[tokio::test]
async fn a_pairing_approved_for_the_approvers_machine_is_read_once_with_its_credential() {
  ready();
  let stood = stood().await;
  let (pairing, code) = stood.paired().await;
  let machine = format!("u{}", stood.bound);

  assert_eq!(code.len(), 9, "{code}");
  assert_eq!(code.as_bytes()[4], b'-', "{code}");
  assert!(pairing.len() >= 64, "{pairing}");

  // Waiting: the app reads nothing yet, and the person reads the code with the machine it will be for, in either case
  // and without its dash.
  assert_eq!(stood.read(&pairing).await, (StatusCode::ACCEPTED, Value::Null));
  let (status, view) = stood.view(&code.replace('-', "").to_lowercase(), stood.bound).await;
  assert_eq!(status, StatusCode::OK, "{view}");
  assert_eq!(view["state"], "waiting");
  assert_eq!(view["machine"], json!(machine));
  assert_eq!(view["code"], json!(code));

  let (status, approved) = stood.approve(&code, stood.bound).await;
  assert_eq!(status, StatusCode::OK, "{approved}");
  assert_eq!(approved["machine"], json!(machine));
  let (_, view) = stood.view(&code, stood.bound).await;
  assert_eq!((view["state"].clone(), view["machine"].clone()), (json!("approved"), json!(machine)));
  // Another person reads it approved, and not whose machine it went to.
  let (_, view) = stood.view(&code, stood.unbound).await;
  assert_eq!((view["state"].clone(), view.get("machine").cloned()), (json!("approved"), None));

  let (status, read) = stood.read(&pairing).await;
  assert_eq!(status, StatusCode::OK, "{read}");
  assert_eq!(read["node"], json!(machine));
  assert_eq!(read["hubUrl"], "wss://hub.invalid");
  assert!(verified(read["credential"].as_str().unwrap(), &machine), "{read}");
  assert!(!read.to_string().contains(AGENT_KEY), "{read}");

  // Answered once: the pairing is gone, and its code with it.
  assert_eq!(stood.read(&pairing).await.0, StatusCode::NOT_FOUND);
  assert_eq!(stood.view(&code, stood.bound).await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_person_bound_to_no_machine_is_given_a_fresh_binding() {
  ready();
  let stood = stood().await;
  let (pairing, code) = stood.paired().await;

  let (_, view) = stood.view(&code, stood.unbound).await;
  assert_eq!((view["state"].clone(), view.get("machine").cloned()), (json!("waiting"), None));

  let (status, approved) = stood.approve(&code, stood.unbound).await;
  assert_eq!(status, StatusCode::OK, "{approved}");
  let machine = approved["machine"].as_str().unwrap().to_owned();
  assert!(machine.starts_with(&format!("u{}-", stood.unbound)), "{machine}");
  assert_eq!(stood.machine_of(stood.unbound).await, Some(machine.clone()));

  let (status, read) = stood.read(&pairing).await;
  assert_eq!(status, StatusCode::OK, "{read}");
  assert!(verified(read["credential"].as_str().unwrap(), &machine), "{read}");
}

#[tokio::test]
async fn a_refused_or_expired_pairing_is_closed_and_then_forgotten() {
  ready();
  let stood = stood().await;
  let (refused, refused_code) = stood.paired().await;

  assert_eq!(stood.refuse(&refused_code, stood.bound).await.0, StatusCode::NO_CONTENT);
  let (_, view) = stood.view(&refused_code, stood.bound).await;
  assert_eq!(view["state"], "refused");
  for (status, said) in [
    stood.read(&refused).await,
    stood.approve(&refused_code, stood.bound).await,
    stood.refuse(&refused_code, stood.bound).await,
  ] {
    assert_eq!((status, said["code"].clone()), (StatusCode::GONE, json!("pairing-closed")));
  }

  // Unanswered for its ten minutes, a pairing expires, approved or not; an approved one unread gives nothing.
  let (expired, expired_code) = stood.paired().await;
  let (approved, approved_code) = stood.paired().await;
  assert_eq!(stood.approve(&approved_code, stood.bound).await.0, StatusCode::OK);
  stood.pass(LIFETIME_MS);
  let (_, view) = stood.view(&expired_code, stood.bound).await;
  assert_eq!(view["state"], "expired");
  assert_eq!(stood.read(&expired).await.0, StatusCode::GONE);
  assert_eq!(stood.approve(&expired_code, stood.bound).await.0, StatusCode::GONE);
  assert_eq!(stood.read(&approved).await.0, StatusCode::GONE);

  // Ten minutes past its close a pairing is forgotten.
  stood.pass(LIFETIME_MS);
  for pairing in [&refused, &expired, &approved] {
    assert_eq!(stood.read(pairing).await.0, StatusCode::NOT_FOUND);
  }
}

#[tokio::test]
async fn a_pairing_gives_no_credential_for_any_machine_but_the_approvers() {
  ready();
  let stood = stood().await;

  // A second approver is refused, and the first approver's machine is the one read.
  let (pairing, code) = stood.paired().await;
  assert_eq!(stood.approve(&code, stood.bound).await.0, StatusCode::OK);
  assert_eq!(stood.approve(&code, stood.unbound).await.0, StatusCode::GONE);
  assert_eq!(stood.machine_of(stood.unbound).await, None);
  let (_, read) = stood.read(&pairing).await;
  assert_eq!(read["node"], json!(format!("u{}", stood.bound)));

  // An approver bound to another machine before the read gets no credential, for either machine.
  let (pairing, code) = stood.paired().await;
  assert_eq!(stood.approve(&code, stood.bound).await.0, StatusCode::OK);
  stood
    .scratch
    .run(
      r#"UPDATE "user_nodes" SET "agent" = 'machine-b' WHERE "user_id" = $1::bigint"#,
      vec![stood.bound.into()],
    )
    .await;
  let (status, read) = stood.read(&pairing).await;
  assert_eq!((status, read.get("credential").cloned()), (StatusCode::GONE, None));
  assert_eq!(stood.read(&pairing).await.0, StatusCode::NOT_FOUND);

  // An approver marked left before the read gets none, and one who has left approves nothing.
  let (pairing, code) = stood.paired().await;
  assert_eq!(stood.approve(&code, stood.bound).await.0, StatusCode::OK);
  stood
    .scratch
    .run(
      r#"INSERT INTO "user_departures" ("user_id", "left_at", "left_by") VALUES ($1::bigint, 0, $1::bigint)"#,
      vec![stood.bound.into()],
    )
    .await;
  assert_eq!(stood.read(&pairing).await.0, StatusCode::GONE);
  let (_, code) = stood.paired().await;
  let (status, said) = stood.approve(&code, stood.bound).await;
  assert_eq!((status, said["code"].clone()), (StatusCode::CONFLICT, json!("left")));
  let (_, view) = stood.view(&code, stood.bound).await;
  assert_eq!(view["state"], "waiting");

  // A call naming nobody approves nothing.
  let (status, _) = stood
    .asked(Method::POST, &format!("/desktop/pairings/code/{code}/approve"), None, "x")
    .await;
  assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn an_address_is_refused_past_its_tenth_pairing_until_its_window_passes() {
  ready();
  let stood = stood().await;

  for _ in 0..PER_ADDRESS {
    assert_eq!(
      stood.asked(Method::POST, "/desktop/pairings", None, "198.51.100.7").await.0,
      StatusCode::CREATED
    );
  }
  let (status, said) = stood.asked(Method::POST, "/desktop/pairings", None, "198.51.100.7").await;
  assert_eq!(
    (status, said["code"].clone()),
    (StatusCode::TOO_MANY_REQUESTS, json!("too-many-pairings"))
  );
  assert_eq!(
    stood.asked(Method::POST, "/desktop/pairings", None, "198.51.100.8").await.0,
    StatusCode::CREATED
  );

  stood.pass(LIFETIME_MS);
  assert_eq!(
    stood.asked(Method::POST, "/desktop/pairings", None, "198.51.100.7").await.0,
    StatusCode::CREATED
  );
}
