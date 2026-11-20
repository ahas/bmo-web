//! The supply tests (docs/accounts.md, 「Supply」 and 「Tests」): the layering of the order, the hook against
//! sumida's reservations and quotas, and the permission each relation opens. The database, the rules and
//! sumida stand as every other test file has them; the clock is never waited on, and every moment a test
//! names is fixed into the rows it reads back.

use crate::support::{OWNER, ROOM, Scratch, console_hash, ready};
use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::data_move::{MoveAsk, run_move};
use bmo_web_server::routes::in_force;
use bmo_web_server::users::set_sign_in;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

/// A database of its own with the data move written: the boss made the platform administrator. Every test
/// that changes a platform row needs its own, so none shares it.
async fn fresh() -> Scratch {
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

  scratch
}

async fn app(scratch: &Scratch) -> Router {
  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

/// The platform administrator's user id, as the move made it.
async fn boss(scratch: &Scratch) -> i32 {
  bmo_web_server::one(scratch.db(), r#"SELECT "id" FROM "users" WHERE "username" = 'boss'"#, vec![])
    .await
    .unwrap()
    .unwrap()
    .try_get("", "id")
    .unwrap()
}

/// A person placed in a unit.
async fn person(scratch: &Scratch, name: &str, unit: i32) -> i32 {
  let made = set_sign_in(scratch.db(), name, "the password", false).await.unwrap();

  scratch
    .run(
      r#"UPDATE "users" SET "organization_id" = $1 WHERE "id" = $2"#,
      vec![unit.into(), made.user.into()],
    )
    .await;

  made.user
}

async fn org(scratch: &Scratch, name: &str, parent: Option<i32>) -> i32 {
  bmo_web_server::one(
    scratch.db(),
    r#"INSERT INTO "organizations" ("name", "parent_id") VALUES ($1, $2) RETURNING "id""#,
    vec![name.into(), parent.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "id")
  .unwrap()
}

/// A relation granted: `manager`, `credit_manager` or `subscription_manager` on a unit, held by a user.
async fn relation(scratch: &Scratch, relation: &str, user: i32, unit: i32) {
  scratch
    .run(
      r#"INSERT INTO "relation_tuples"
           ("resource_type", "resource_id", "relation", "subject_type", "subject_id", "subject_relation")
         VALUES ('organization', $1, $2, 'user', $3, '')"#,
      vec![unit.to_string().into(), relation.into(), user.to_string().into()],
    )
    .await;
}

/// A live subscription standing for an owner, on a plan the test has written: a personal one carries the
/// amount quota for global supply, and a credit one prices the action and lets credits be spent.
async fn subscription(
  scratch: &Scratch,
  owner_kind: &str,
  owner_id: i32,
  included: Option<i64>,
  credits_usable: bool,
) -> i32 {
  let plan: i32 = bmo_web_server::one(
    scratch.db(),
    r#"INSERT INTO "membership_plans"
         ("code", "name", "kind", "scope", "price", "currency", "billing_interval", "duration_days", "is_enabled")
       VALUES ($1, $2, 'subscription', $3, 0, 'KRW', 'month', 30, true)
       RETURNING "id""#,
    vec![
      format!("plan-{}", rand_tail()).into(),
      "a plan".into(),
      owner_kind.into(),
    ],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "id")
  .unwrap();

  scratch
    .run(
      r#"INSERT INTO "plan_actions" ("plan_id", "action", "credit_cost", "amount_quota_per_period")
         VALUES ($1, 'supply', $2, $3)"#,
      vec![plan.into(), credits_usable.then_some(1).into(), included.into()],
    )
    .await;

  let allowed = json!({ "supply": Value::Null }).to_string();
  let quotas = included.map_or_else(|| "{}".to_owned(), |quota| json!({ "supply": quota }).to_string());
  let id: i32 = bmo_web_server::one(
    scratch.db(),
    r#"INSERT INTO "subscriptions"
         ("code", "plan_id", "plan_code", "owner_kind", "owner_id", "status",
          "current_period_start", "current_period_end", "allowed_actions", "amount_quotas")
       VALUES ($1, $2, 'plan', $3, $4, 'active', now(), now() + interval '30 days', $5::jsonb, $6::jsonb)
       RETURNING "id""#,
    vec![
      format!("sub-{}", rand_tail()).into(),
      plan.into(),
      owner_kind.into(),
      owner_id.into(),
      allowed.into(),
      quotas.into(),
    ],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "id")
  .unwrap();

  id
}

fn rand_tail() -> String {
  use std::sync::atomic::{AtomicU64, Ordering};
  static NEXT: AtomicU64 = AtomicU64::new(1);

  format!("{:x}", NEXT.fetch_add(1, Ordering::SeqCst))
}

/// What a wallet holds: balance, live reserve, debt.
async fn wallet(scratch: &Scratch, kind: &str, owner: i32) -> (i64, i64, i64) {
  bmo_web_server::one(
    scratch.db(),
    r#"SELECT w."balance", w."debt",
              COALESCE((SELECT SUM(r."amount")::bigint FROM "credit_reservations" r
                         WHERE r."wallet_id" = w."id" AND r."status" = 'held'
                           AND (r."expires_at" IS NULL OR r."expires_at" > now())), 0) AS "held"
         FROM "credit_wallets" w WHERE w."owner_kind" = $1 AND w."owner_id" = $2"#,
    vec![kind.into(), owner.into()],
  )
  .await
  .unwrap()
  .map(|row| {
    (
      row.try_get("", "balance").unwrap(),
      row.try_get("", "held").unwrap(),
      row.try_get("", "debt").unwrap(),
    )
  })
  .unwrap_or((0, 0, 0))
}

/// Credits put into a wallet directly, as a grant would: one lot, no expiry, and the cache moved.
async fn credit(scratch: &Scratch, kind: &str, owner: i32, amount: i64) {
  let wallet_id: i32 = bmo_web_server::one(
    scratch.db(),
    r#"INSERT INTO "credit_wallets" ("owner_kind", "owner_id", "balance")
       VALUES ($1, $2, $3)
       ON CONFLICT ("owner_kind", "owner_id") DO UPDATE SET "balance" = $3
       RETURNING "id""#,
    vec![kind.into(), owner.into(), amount.into()],
  )
  .await
  .unwrap()
  .unwrap()
  .try_get("", "id")
  .unwrap();

  scratch
    .run(
      r#"INSERT INTO "credit_grants" ("wallet_id", "amount_granted", "amount_remaining")
         VALUES ($1, $2, $2)"#,
      vec![wallet_id.into(), amount.into()],
    )
    .await;
}

/// The platform's settings moved, by its hand, in the database: the testbed never waits on the platform's
/// own screen to ask the hook under each setting.
async fn enforce(scratch: &Scratch, on: bool) {
  scratch
    .run(r#"UPDATE "supply_settings" SET "enforce" = $1 WHERE "id" = 1"#, vec![on.into()])
    .await;
}

/// The platform policy turning `sources` on, as an administrator's write of it would: the seeded policy turns
/// on the person's own credential alone (docs/accounts.md, 「Supply」), so a test that asks of a platform
/// source opens it here first. A source the seed leaves locked stays so: on for everyone once turned on.
async fn open_platform(scratch: &Scratch, sources: &str) {
  scratch
    .run(
      r#"UPDATE "supply_platform_policy" SET "allowed" = $1::jsonb WHERE "id" = 1"#,
      vec![sources.into()],
    )
    .await;
}

/// A call as `Owner-Key` names it, with the server's token.
async fn asked(
  app: &Router,
  method: Method,
  path: &str,
  body: Option<Value>,
  key: Option<i32>,
  role: &str,
) -> (StatusCode, Value) {
  let mut request = Request::builder()
    .method(method)
    .uri(path)
    .header("x-real-ip", "127.0.0.1")
    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"));

  if let Some(key) = key {
    request = request.header("owner-key", key.to_string());
  }

  let request = request.header("owner-role", role);
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
  let said = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };

  (status, said)
}

/// The supply hook asked. The point is the service's own; the ask is what each test names.
async fn hook(app: &Router, ask: Value) -> (StatusCode, Value) {
  asked(
    app,
    Method::POST,
    "/supply/hook",
    Some(json!({ "point": "supply", "ask": ask })),
    None,
    "administrator",
  )
  .await
}

fn order(said: &Value) -> Vec<String> {
  said["answer"]["sources"]
    .as_array()
    .expect("the answer names sources")
    .iter()
    .map(Value::as_str)
    .map(|key| key.unwrap().to_owned())
    .collect()
}

// ---- the layering ----

#[tokio::test]
async fn the_order_is_the_platform_default_until_a_later_layer_narrows_it() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  open_platform(&scratch, r#"["personal", "global"]"#).await;

  // With no plan standing, global drops out and personal alone remains, and `stop` is last.
  let (status, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["order"], json!(["personal", "stop"]), "{said}");

  // The plan's inclusion brings global back with room, and credits stay out until a plan prices them.
  subscription(&scratch, "personal", tester, Some(1000), false).await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;

  assert_eq!(said["order"], json!(["personal", "global", "stop"]), "{said}");
  assert_eq!(said["globalRemaining"], 1000, "{said}");

  // The administrator's own resolution sees every source the platform itself allows.
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(boss), "administrator").await;
  assert_eq!(said["sources"].as_array().unwrap().len(), 5, "{said}");
}

#[tokio::test]
async fn a_later_layer_never_switches_a_source_the_layers_above_closed() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), false).await;

  // The platform closed `org_credits`: an organisation policy may not open it.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/supply/org/{company}"),
    Some(json!({ "allowed": ["personal", "global", "org_credits"], "order": ["personal", "global", "org_credits"] })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  assert_eq!(said["code"], "source-not-allowed", "{said}");

  // The platform now opens `org_credits`; only the plan, which carries no credits, closes it.
  open_platform(&scratch, r#"["personal", "global", "org_credits"]"#).await;

  // A person may not switch on a source the plan never carried, and the answer names the plan.
  let (status, said) = asked(
    &app,
    Method::PUT,
    "/supply/me",
    Some(json!({ "order": ["personal", "global", "org_credits"], "off": [], "on": ["org_credits"] })),
    Some(tester),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  assert_eq!(said["code"], "not-in-plan", "{said}");
}

#[tokio::test]
async fn an_organisation_policy_narrows_every_person_beneath_it_and_the_unit_inherits_when_it_goes() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let division = org(&scratch, "division-a", Some(company)).await;
  let tester = person(&scratch, "tester", division).await;
  subscription(&scratch, "personal", tester, Some(1000), true).await;

  // The platform opens the credit sources for the test, so the organisation's closing is what shows.
  scratch
    .run(
      r#"UPDATE "supply_platform_policy" SET "allowed" = '["personal", "global", "org_credits"]' WHERE "id" = 1"#,
      vec![],
    )
    .await;

  // No row anywhere: the person reads the platform's own allow list.
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  assert!(
    said["sources"]
      .as_array()
      .unwrap()
      .iter()
      .any(|row| row["source"] == "org_credits" && row["allowed"] == true),
    "{said}"
  );

  // The company sets a policy that closes it; the division, standing below, inherits that row.
  asked(
    &app,
    Method::PUT,
    &format!("/supply/org/{company}"),
    Some(json!({ "allowed": ["personal", "global"], "order": ["personal", "global", "stop"] })),
    Some(boss),
    "administrator",
  )
  .await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  let closed = said["sources"]
    .as_array()
    .unwrap()
    .iter()
    .find(|row| row["source"] == "org_credits")
    .unwrap();

  assert_eq!(closed["allowed"], false, "{said}");
  assert_eq!(closed["reason"], "blocked-by-organisation", "{said}");

  // The division reads its own inheritance from the unit's own screen.
  let (_, said) =
    asked(&app, Method::GET, &format!("/supply/org/{division}"), None, Some(boss), "administrator").await;
  assert_eq!(said["inherits"], true, "{said}");
  assert_eq!(said["policy"]["from"], company, "{said}");

  // Taking the company's row away lets the platform stand again.
  asked(
    &app,
    Method::DELETE,
    &format!("/supply/org/{company}"),
    None,
    Some(boss),
    "administrator",
  )
  .await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;

  assert!(
    said["sources"]
      .as_array()
      .unwrap()
      .iter()
      .any(|row| row["source"] == "org_credits" && row["allowed"] == true),
    "{said}"
  );
}

/// The platform policy written whole in the database: the sources it turns on, the ones a person may switch,
/// and whether the person's own order is read.
async fn platform(scratch: &Scratch, allowed: &str, overridable: &str, order_overridable: bool) {
  scratch
    .run(
      r#"UPDATE "supply_platform_policy"
             SET "allowed" = $1::jsonb, "overridable" = $2::jsonb, "order_overridable" = $3
           WHERE "id" = 1"#,
      vec![allowed.into(), overridable.into(), order_overridable.into()],
    )
    .await;
}

/// One source's row of the reader's view.
fn source<'a>(said: &'a Value, key: &str) -> &'a Value {
  said["sources"].as_array().unwrap().iter().find(|row| row["source"] == key).unwrap()
}

#[tokio::test]
async fn an_overridable_source_stands_as_the_platform_s_default_until_the_person_switches_it() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), true).await;
  // The person's own credential overridable and on, personal credits overridable and off, global locked on.
  platform(&scratch, r#"["personal", "global"]"#, r#"["personal", "personal_credits"]"#, true).await;

  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  assert_eq!(said["order"], json!(["personal", "global", "stop"]), "{said}");
  assert_eq!(said["orderLocked"], false, "{said}");
  assert_eq!(source(&said, "personal_credits")["off"], true, "{said}");
  assert_eq!(source(&said, "personal_credits")["locked"], false, "{said}");
  assert_eq!(source(&said, "global")["locked"], true, "{said}");

  // Each switched the other way: personal credits on, the person's own credential off.
  let (status, said) = asked(
    &app,
    Method::PUT,
    "/supply/me",
    Some(json!({
      "order": ["personal", "global", "personal_credits"],
      "off": ["personal"],
      "on": ["personal_credits"],
      "personalCreditCredits": 50
    })),
    Some(tester),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["order"], json!(["global", "personal_credits", "stop"]), "{said}");
  assert_eq!(source(&said, "personal")["off"], true, "{said}");
  assert_eq!(source(&said, "personal")["own"], "off", "{said}");
  assert_eq!(source(&said, "personal_credits")["own"], "on", "{said}");
  assert_eq!(said["personalCreditCredits"], 50, "{said}");

  // A source switched both ways at once does not read.
  let (status, said) = asked(
    &app,
    Method::PUT,
    "/supply/me",
    Some(json!({ "order": ["personal", "global", "personal_credits"], "off": ["personal"], "on": ["personal"] })),
    Some(tester),
    "member",
  )
  .await;
  assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");

  // Named neither way, each stands as the platform's default again.
  let (_, said) = asked(
    &app,
    Method::PUT,
    "/supply/me",
    Some(json!({ "order": ["personal", "global", "personal_credits"], "off": [], "on": [] })),
    Some(tester),
    "member",
  )
  .await;

  assert_eq!(said["order"], json!(["personal", "global", "stop"]), "{said}");
  assert!(source(&said, "personal_credits").get("own").is_none(), "{said}");
}

#[tokio::test]
async fn a_locked_source_and_a_locked_order_stand_as_the_platform_says_and_the_person_s_write_is_refused() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), false).await;

  // The administrator locks both sources on and the order with them.
  let (status, said) = asked(
    &app,
    Method::PUT,
    "/supply/platform",
    Some(json!({ "allowed": ["personal", "global"], "order": ["personal", "global"], "overridable": [], "orderOverridable": false })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["overridable"], json!([]), "{said}");
  assert_eq!(said["orderOverridable"], false, "{said}");

  // A setting written before the lock, switching the source off and reordering, is not read.
  scratch
    .run(
      r#"INSERT INTO "supply_user_settings" ("user_id", "order", "off", "on", "updated_at")
         VALUES ($1, '["global", "personal"]', '["personal"]', '[]', 0)"#,
      vec![tester.into()],
    )
    .await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;

  assert_eq!(said["order"], json!(["personal", "global", "stop"]), "{said}");
  assert_eq!(said["orderLocked"], true, "{said}");
  assert_eq!(source(&said, "personal")["locked"], true, "{said}");
  assert_eq!(source(&said, "personal")["off"], false, "{said}");

  // Newly switching a locked source against the platform's value is refused.
  for ask in [
    json!({ "order": ["personal", "global"], "off": ["global"], "on": [] }),
    json!({ "order": ["personal", "global"], "off": [], "on": ["org_credits"] }),
  ] {
    let (status, said) = asked(&app, Method::PUT, "/supply/me", Some(ask), Some(tester), "member").await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
    assert_eq!(said["code"], "locked-by-platform", "{said}");
  }

  // A locked order is neither read nor refused: another order is taken, the order stands as the platform
  // says, and the order stored before the lock stays for the day it is read again.
  let (status, said) = asked(
    &app,
    Method::PUT,
    "/supply/me",
    Some(json!({ "order": ["global"], "off": [], "on": [] })),
    Some(tester),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["order"], json!(["personal", "global", "stop"]), "{said}");
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "supply_user_settings" WHERE "user_id" = $1 AND "order" = '["global", "personal"]'"#,
        vec![tester.into()],
      )
      .await,
    1
  );
}

#[tokio::test]
async fn a_person_s_own_write_is_judged_by_what_it_changes() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), false).await;
  platform(&scratch, r#"["personal", "global"]"#, r#"["personal", "global"]"#, true).await;
  let write = |body: Value| asked(&app, Method::PUT, "/supply/me", Some(body), Some(tester), "member");

  let (status, said) =
    write(json!({ "order": ["personal", "global", "stop"], "off": ["global"], "on": [] })).await;
  assert_eq!(status, StatusCode::OK, "{said}");

  // The plan's quota spent closes global; the person's choice of it, sent back as they hold it, still passes
  // and stays stored.
  scratch
    .run(
      r#"UPDATE "subscriptions" SET "amount_quotas" = '{"supply": 0}'::jsonb WHERE "owner_id" = $1"#,
      vec![tester.into()],
    )
    .await;
  let (status, said) = write(json!({ "order": ["personal", "global"], "off": ["global"], "on": [] })).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(source(&said, "global")["own"], "off", "{said}");

  // Newly switched on, the closed source is refused by the layer that closed it.
  let (status, said) = write(json!({ "order": ["personal", "global"], "off": [], "on": ["global"] })).await;
  assert_eq!((status, said["code"].as_str()), (StatusCode::FORBIDDEN, Some("not-in-plan")), "{said}");

  // The order keeps the sources standing open alone: one the platform locks off and one the plan closed are
  // dropped from it rather than refused.
  let (status, said) =
    write(json!({ "order": ["org_credits", "personal", "global"], "off": ["global"], "on": [] })).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "supply_user_settings" WHERE "user_id" = $1 AND "order" = '["personal"]'"#,
        vec![tester.into()],
      )
      .await,
    1
  );
}

#[tokio::test]
async fn a_reservation_opens_only_for_a_source_the_resolved_order_holds() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(0), true).await;
  credit(&scratch, "personal", tester, 1000).await;
  enforce(&scratch, true).await;
  open_platform(&scratch, r#"["personal", "personal_credits"]"#).await;
  scratch
    .run(
      r#"INSERT INTO "supply_user_settings" ("user_id", "order", "off", "on", "personal_credit_credits", "updated_at")
         VALUES ($1, '[]', '[]', '[]', 100, 0)"#,
      vec![tester.into()],
    )
    .await;
  let reserve = |run: i64| {
    hook(
      &app,
      json!({ "op": "reserve", "run": run, "step": 1, "account": tester, "source": "personal_credits", "key": format!("{run}:1:reserve") }),
    )
  };

  // Under the person's own cap the source stands in the order and reserves.
  let (_, said) = reserve(60).await;
  assert_eq!(said["answer"]["accepted"], true, "{said}");

  // Past it the order no longer holds the source, and the reservation is refused though the wallet could pay.
  scratch
    .run(
      r#"INSERT INTO "supply_costs" ("run", "user_id", "org_id", "source", "credits", "cost_micros", "settled_at", "period")
         VALUES (60, $1, $2, 'personal_credits', 100, 66_667, 1, to_char(now(), 'YYYY-MM'))"#,
      vec![tester.into(), company.into()],
    )
    .await;
  let (_, said) = reserve(61).await;
  assert_eq!(said["answer"]["accepted"], false, "{said}");
}

#[tokio::test]
async fn a_member_cap_closed_out_by_the_month_s_spend_takes_the_source_it_caps() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), true).await;
  scratch
    .run(
      r#"UPDATE "supply_platform_policy" SET "allowed" = '["personal", "org_credits"]' WHERE "id" = 1"#,
      vec![],
    )
    .await;
  asked(
    &app,
    Method::PUT,
    &format!("/supply/org/{company}"),
    Some(json!({ "allowed": ["personal", "org_credits"], "order": ["personal", "org_credits"], "memberCreditCredits": 100 })),
    Some(boss),
    "administrator",
  )
  .await;

  // The month's spend under the cap: the source stands.
  let (status, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said["order"].as_array().unwrap().iter().any(|key| key == "org_credits"), "{said}");

  // And over it: the organisation's cap closes it, named by that layer.
  scratch
    .run(
      r#"INSERT INTO "supply_costs" ("run", "user_id", "org_id", "source", "credits", "cost_micros", "settled_at", "period")
         VALUES (1, $1, $2, 'org_credits', 100, 66_667, 1, to_char(now(), 'YYYY-MM'))"#,
      vec![tester.into(), company.into()],
    )
    .await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  let source = said["sources"]
    .as_array()
    .unwrap()
    .iter()
    .find(|row| row["source"] == "org_credits")
    .unwrap();

  assert_eq!(source["allowed"], false, "{said}");
  assert_eq!(source["reason"], "blocked-by-organisation", "{said}");
}

// ---- the hook against sumida's reservations ----

#[tokio::test]
async fn enforce_off_refuses_nothing_while_every_cost_still_stands() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), true).await;
  platform(
    &scratch,
    r#"["personal", "global", "org_credits"]"#,
    r#"["personal", "personal_credits"]"#,
    true,
  )
  .await;

  // The plan includes global and lets credits be spent, and no wallet stands, yet with nothing enforced the
  // order names every source the layers leave in it — personal credits aside, which the platform leaves off
  // until the person switches them on — and a reservation is accepted at the full size.
  let (status, said) = hook(&app, json!({ "op": "order", "run": 1, "account": tester, "provider": "anthropic", "model": "m", "kind": "job" })).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(order(&said), ["personal", "global", "org_credits"], "{said}");

  let (status, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 1, "step": 1, "account": tester, "source": "org_credits", "key": "1:1:reserve" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["accepted"], true, "{said}");
  assert_eq!(said["answer"]["amountUsd"], 200.0 / 1500.0, "{said}");
  let reservation = said["answer"]["reservation"].as_str().unwrap().to_owned();

  // No sumida hold stands: the reservation is the service's alone.
  assert_eq!(scratch.count(r#"SELECT COUNT(*) FROM "credit_reservations""#, vec![]).await, 0);

  // The capture settles: the cost row stands, and the wallet was never drawn on.
  let (status, said) = hook(
    &app,
    json!({ "op": "capture", "run": 1, "step": 2, "account": tester, "source": "org_credits", "reservation": reservation, "costUsd": 0.1, "key": "1:2:capture" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["taken"], true, "{said}");
  assert_eq!(wallet(&scratch, "organization", company).await, (0, 0, 0));
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "supply_costs" WHERE "source" = 'org_credits' AND credits = 150"#,
        vec![]
      )
      .await,
    1
  );
}

#[tokio::test]
async fn the_same_key_twice_moves_nothing() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(0), true).await;
  credit(&scratch, "organization", company, 1000).await;
  enforce(&scratch, true).await;
  open_platform(&scratch, r#"["personal", "global", "org_credits"]"#).await;

  let (_, first) = hook(
    &app,
    json!({ "op": "reserve", "run": 7, "step": 1, "account": tester, "source": "org_credits", "key": "7:1:reserve" }),
  )
  .await;
  let (balance, held, _) = wallet(&scratch, "organization", company).await;
  assert_eq!(held, 200, "the hold took one reservation unit");

  // The same key answered again: the same reservation, the same amount, the wallet unmoved.
  let (_, again) = hook(
    &app,
    json!({ "op": "reserve", "run": 7, "step": 1, "account": tester, "source": "org_credits", "key": "7:1:reserve" }),
  )
  .await;

  assert_eq!(again["answer"]["reservation"], first["answer"]["reservation"], "{again}");
  assert_eq!(again["answer"]["amountUsd"], 200.0 / 1500.0, "{again}");
  assert_eq!(wallet(&scratch, "organization", company).await, (balance, held, 0));
  assert_eq!(scratch.count(r#"SELECT COUNT(*) FROM "credit_reservations""#, vec![]).await, 1);
}

#[tokio::test]
async fn a_wallet_hold_reserves_extends_captures_and_releases_against_sumida() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(0), true).await;
  credit(&scratch, "organization", company, 1000).await;
  enforce(&scratch, true).await;
  open_platform(&scratch, r#"["personal", "global", "org_credits"]"#).await;

  let (_, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 10, "step": 1, "account": tester, "source": "org_credits", "key": "10:1:reserve" }),
  )
  .await;
  let reservation = said["answer"]["reservation"].as_str().unwrap().to_owned();
  assert_eq!(wallet(&scratch, "organization", company).await.1, 200);

  // Extended: one unit more, the whole answered.
  let (_, said) = hook(
    &app,
    json!({ "op": "extend", "run": 10, "step": 2, "account": tester, "source": "org_credits", "reservation": reservation, "spentUsd": 0.1, "key": "10:2:extend" }),
  )
  .await;
  assert_eq!(said["answer"]["accepted"], true, "{said}");
  assert_eq!(said["answer"]["amountUsd"], 400.0 / 1500.0, "{said}");
  assert_eq!(wallet(&scratch, "organization", company).await.1, 400);

  // Captured at half the hold: what it held is spent and the rest freed.
  let (balance_before, _, _) = wallet(&scratch, "organization", company).await;
  let (status, said) = hook(
    &app,
    json!({ "op": "capture", "run": 10, "step": 3, "account": tester, "source": "org_credits", "reservation": reservation, "costUsd": 0.1, "key": "10:3:capture" }),
  )
  .await;
  let (balance, held, debt) = wallet(&scratch, "organization", company).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["taken"], true, "{said}");
  assert_eq!((held, debt), (0, 0), "the hold is gone and nothing stands owed");
  assert_eq!(balance_before - balance, 150, "150 credits of cost were spent");

  // A second reservation, released: the balance returns whole.
  let (_, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 10, "step": 4, "account": tester, "source": "org_credits", "key": "10:4:reserve" }),
  )
  .await;
  let held_reservation = said["answer"]["reservation"].as_str().unwrap().to_owned();
  let (status, said) = hook(
    &app,
    json!({ "op": "release", "run": 10, "step": 5, "account": tester, "source": "org_credits", "reservation": held_reservation, "key": "10:5:release" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["taken"], true, "{said}");
  assert_eq!(wallet(&scratch, "organization", company).await, (balance, 0, 0));
}

#[tokio::test]
async fn a_capture_may_run_into_debt_of_one_reservation_unit_and_no_further() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(0), true).await;
  credit(&scratch, "organization", company, 300).await;
  enforce(&scratch, true).await;
  open_platform(&scratch, r#"["personal", "global", "org_credits"]"#).await;

  let (_, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 20, "step": 1, "account": tester, "source": "org_credits", "key": "20:1:reserve" }),
  )
  .await;
  let reservation = said["answer"]["reservation"].as_str().unwrap().to_owned();

  // 400 credits were spent against a hold of 200 with a balance of 300: 100 of debt, within the unit.
  let (status, said) = hook(
    &app,
    json!({ "op": "capture", "run": 20, "step": 2, "account": tester, "source": "org_credits", "reservation": reservation, "costUsd": 400.0 / 1500.0, "key": "20:2:capture" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  let (_, _, debt) = wallet(&scratch, "organization", company).await;
  assert_eq!(debt, 100, "{said}");

  // Past the unit the source will not go: captured to the ceiling, the overage recorded and charged nowhere.
  let (_, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 21, "step": 1, "account": tester, "source": "org_credits", "key": "21:1:reserve" }),
  )
  .await;
  assert_eq!(said["answer"]["accepted"], false, "{said}");
}

#[tokio::test]
async fn the_order_never_names_a_platform_source_the_service_would_refuse_to_reserve() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(100), true).await;
  scratch
    .run(
      r#"UPDATE "supply_platform_policy" SET "allowed" = '["personal", "global", "org_credits"]' WHERE "id" = 1"#,
      vec![],
    )
    .await;
  enforce(&scratch, true).await;

  // The quota is smaller than one reservation unit and no wallet stands: neither source can reserve.
  let (_, said) = hook(
    &app,
    json!({ "op": "order", "run": 30, "account": tester, "provider": "anthropic", "model": "m", "kind": "job" }),
  )
  .await;

  assert_eq!(order(&said), ["personal"], "{said}");

  // The wallet and a whole quota bring both back.
  credit(&scratch, "organization", company, 200).await;
  scratch
    .run(
      r#"UPDATE "subscriptions" SET "amount_quotas" = '{"supply": 1000}'::jsonb WHERE owner_id = $1"#,
      vec![tester.into()],
    )
    .await;
  let (_, said) = hook(
    &app,
    json!({ "op": "order", "run": 31, "account": tester, "provider": "anthropic", "model": "m", "kind": "job" }),
  )
  .await;

  assert_eq!(order(&said), ["personal", "global", "org_credits"], "{said}");
}

#[tokio::test]
async fn a_quota_reservation_holds_the_period_and_captures_its_actual_cost() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  subscription(&scratch, "personal", tester, Some(1000), false).await;
  enforce(&scratch, true).await;
  open_platform(&scratch, r#"["personal", "global"]"#).await;

  let (status, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 40, "step": 1, "account": tester, "source": "global", "key": "40:1:reserve" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["accepted"], true, "{said}");
  let reservation = said["answer"]["reservation"].as_str().unwrap().to_owned();
  assert_eq!(
    scratch
      .count(
        r#"SELECT COALESCE(SUM("amount")::bigint, 0) FROM "quota_reservations" WHERE "status" = 'held'"#,
        vec![]
      )
      .await,
    200
  );

  // The reader sees the hold taken out of the period's room.
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  assert_eq!(said["globalRemaining"], 800, "{said}");

  let (status, said) = hook(
    &app,
    json!({ "op": "capture", "run": 40, "step": 2, "account": tester, "source": "global", "reservation": reservation, "costUsd": 0.1, "key": "40:2:capture" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["taken"], true, "{said}");
  assert_eq!(
    scratch
      .count(
        r#"SELECT COALESCE(SUM("amount_used")::bigint, 0) FROM "subscription_usage" WHERE "action" = 'supply'"#,
        vec![]
      )
      .await,
    150
  );
  assert_eq!(
    scratch.count(r#"SELECT COUNT(*) FROM "credit_reservations""#, vec![]).await,
    0,
    "nothing was ever held on a wallet"
  );
}

#[tokio::test]
async fn personal_supply_reserves_nothing_and_records_its_cost_alone() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  enforce(&scratch, true).await;

  let (status, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 50, "step": 1, "account": tester, "source": "personal", "key": "50:1:reserve" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["accepted"], true, "{said}");
  let reservation = said["answer"]["reservation"].as_str().unwrap().to_owned();

  let (status, said) = hook(
    &app,
    json!({ "op": "capture", "run": 50, "step": 2, "account": tester, "source": "personal", "reservation": reservation, "costUsd": 0.2, "key": "50:2:capture" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["taken"], true, "{said}");
  // Its cost stands, and its credits are nought: nobody paid in the platform's money.
  assert_eq!(
    scratch.count(r#"SELECT COUNT(*) FROM "supply_costs" WHERE "source" = 'personal' AND "credits" = 0 AND "cost_micros" = 200000"#, vec![]).await,
    1
  );
  assert_eq!(
    scratch.count(r#"SELECT COUNT(*) FROM "credit_reservations" WHERE TRUE"#, vec![]).await,
    0
  );
}

// ---- the permissions ----

#[tokio::test]
async fn each_relation_opens_its_own_part_of_a_unit_and_nothing_more() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let member = person(&scratch, "plain-member", company).await;
  let credit_keeper = person(&scratch, "credit-keeper", company).await;
  let plan_keeper = person(&scratch, "plan-keeper", company).await;
  relation(&scratch, "credit_manager", credit_keeper, company).await;
  relation(&scratch, "subscription_manager", plan_keeper, company).await;

  // A plain member opens nothing.
  for key in [member] {
    let (status, said) =
      asked(&app, Method::GET, &format!("/supply/org/{company}"), None, Some(key), "member").await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  }

  // The credit manager reads policy and credits, not the plan.
  let (_, said) = asked(
    &app,
    Method::GET,
    &format!("/supply/org/{company}"),
    None,
    Some(credit_keeper),
    "member",
  )
  .await;
  assert!(said.get("wallet").is_some(), "{said}");
  assert_eq!(said["plan"], Value::Null, "{said}");

  // The subscription manager reads the plan alone, and the policy fields stand absent.
  let (_, said) =
    asked(&app, Method::GET, &format!("/supply/org/{company}"), None, Some(plan_keeper), "member").await;
  assert!(
    said.get("policy").is_none_or(Value::is_null) && said.get("wallet").is_none_or(Value::is_null),
    "{said}"
  );

  // A head opens both, as `manager` implies every scope on the unit.
  relation(&scratch, "manager", member, company).await;
  let (status, said) =
    asked(&app, Method::GET, &format!("/supply/org/{company}"), None, Some(member), "member").await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said.get("wallet").is_some(), "{said}");

  // A head of a unit above reaches down, and one beside it does not.
  let beside = org(&scratch, "company-b", None).await;
  let above_head = person(&scratch, "above-head", company).await;
  relation(&scratch, "manager", above_head, company).await;
  let (status, said) =
    asked(&app, Method::GET, &format!("/supply/org/{beside}"), None, Some(above_head), "member").await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // The platform administrator opens everything, and nothing platform-wide opens on a unit's manager.
  let (status, said) =
    asked(&app, Method::GET, "/supply/platform", None, Some(credit_keeper), "member").await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  let (status, said) =
    asked(&app, Method::GET, "/supply/platform", None, Some(boss), "administrator").await;
  assert_eq!(status, StatusCode::OK, "{said}");
}

#[tokio::test]
async fn granting_credits_follows_the_wallet_s_own_gate() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let keeper = person(&scratch, "keeper", company).await;
  let member = person(&scratch, "member-a", company).await;
  relation(&scratch, "credit_manager", keeper, company).await;

  // An organisation's credit manager grants into its wallet.
  let (status, said) = asked(
    &app,
    Method::POST,
    &format!("/supply/org/{company}/credits"),
    Some(json!({ "amount": 100, "words": "the month's opening" })),
    Some(keeper),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["balance"], 100, "{said}");

  // A plain member may not, and neither may anyone grant into a person's wallet from below.
  let (status, said) = asked(
    &app,
    Method::POST,
    &format!("/supply/org/{company}/credits"),
    Some(json!({ "amount": 100 })),
    Some(member),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // A person's own wallet is the administrator's to fill.
  let (status, said) = asked(
    &app,
    Method::POST,
    "/supply/credits",
    Some(json!({ "ownerKind": "user", "ownerId": member, "amount": 50 })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(wallet(&scratch, "personal", member).await.0, 50);

  let (status, said) = asked(
    &app,
    Method::POST,
    "/supply/credits",
    Some(json!({ "ownerKind": "user", "ownerId": member, "amount": 50 })),
    Some(keeper),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // Both grants stand in the audit, each named by its doer.
  let (_, said) =
    asked(&app, Method::GET, "/supply/credits/audit?limit=10", None, Some(boss), "administrator").await;

  assert!(
    said["entries"].as_array().unwrap().iter().any(|entry| entry["kind"] == "grant"),
    "{said}"
  );
  let by = boss.to_string();

  assert!(
    said["entries"]
      .as_array()
      .unwrap()
      .iter()
      .any(|entry| entry["by"].as_str() == Some(by.as_str())),
    "{said}"
  );
}

#[tokio::test]
async fn a_person_s_own_setting_is_theirs_alone() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  let other = person(&scratch, "other", company).await;

  // Their own view opens on their own key.
  let (status, _) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  assert_eq!(status, StatusCode::OK);

  // A call naming no one, and anyone else's key on their own view, are refused.
  let (status, said) = asked(&app, Method::GET, "/supply/me", None, None, "member").await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  assert_eq!(said["code"], "forbidden", "{said}");

  let (status, _) =
    asked(&app, Method::GET, &format!("/supply/org/{company}"), None, Some(other), "member").await;
  assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_per_user_policy_is_the_unit_s_credit_manager_s_and_an_administrator_s_everywhere() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;
  let keeper = person(&scratch, "keeper", company).await;
  subscription(&scratch, "personal", tester, Some(1000), true).await;
  relation(&scratch, "credit_manager", keeper, company).await;
  open_platform(&scratch, r#"["personal", "global"]"#).await;

  let (status, said) = asked(
    &app,
    Method::PUT,
    &format!("/supply/user/{tester}"),
    Some(json!({ "allowed": ["personal", "global"], "order": ["global", "personal"] })),
    Some(keeper),
    "member",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");

  // The order the person now reads is the policy's, and the per-user standing names its holder.
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  assert_eq!(said["order"], json!(["global", "personal", "stop"]), "{said}");

  // A person of another unit's manager cannot.
  let beside = org(&scratch, "company-b", None).await;
  let other = person(&scratch, "other", beside).await;
  let (status, said) =
    asked(&app, Method::GET, &format!("/supply/user/{other}"), None, Some(keeper), "member").await;

  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // The administrator reaches any person, and the DELETE goes back to the organisation's.
  asked(
    &app,
    Method::DELETE,
    &format!("/supply/user/{tester}"),
    None,
    Some(boss),
    "administrator",
  )
  .await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;

  assert_eq!(said["order"], json!(["personal", "global", "stop"]), "{said}");
}

#[tokio::test]
async fn the_person_s_own_view_names_which_providers_their_supply_serves() {
  ready();
  let mut scratch = fresh().await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;

  // The roads come from the agency, stood here as a stand-in before the app is built.
  scratch.service.agency = std::sync::Arc::new(Roads(vec!["codex".to_owned(), "deepseek".to_owned()]));
  let serving = app(&scratch).await;

  let (status, said) = asked(
    &serving,
    Method::GET,
    &format!("/supply/user/{tester}"),
    None,
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["providers"], json!(["codex", "deepseek"]), "{said}");

  // The read is refused, saying so, where no agency is named at all.
  scratch.service.agency = std::sync::Arc::new(bmo_web_server::agency::NoAgency);
  let mute = app(&scratch).await;
  let (status, said) =
    asked(&mute, Method::GET, &format!("/supply/user/{tester}"), None, Some(boss), "administrator").await;

  assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{said}");
  assert_eq!(said["code"], "no-agency", "{said}");
}

/// A stand-in agency answering one person's roads.
struct Roads(Vec<String>);

#[async_trait::async_trait]
impl bmo_web_server::agency::Agency for Roads {
  async fn register_supply(&self, _url: &str, _token: &str) -> Result<(), bmo_web_server::Refusal> {
    Ok(())
  }

  async fn supply_roads(&self, _user: &str) -> Result<Vec<String>, bmo_web_server::Refusal> {
    Ok(self.0.clone())
  }
}

// ---- the platform row, the plans and the ledger ----

#[tokio::test]
async fn the_platform_row_carries_the_seeded_defaults_until_the_administrator_moves_it() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;

  let (status, said) =
    asked(&app, Method::GET, "/supply/platform", None, Some(boss), "administrator").await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["allowed"], json!(["personal"]), "{said}");
  assert_eq!(said["order"], json!(["personal", "stop"]), "{said}");
  assert_eq!(said["overridable"], json!(["personal"]), "{said}");
  assert_eq!(said["orderOverridable"], true, "{said}");
  assert_eq!(said["creditsPerDollar"], 1500, "{said}");
  assert_eq!(said["reservationCredits"], 200, "{said}");
  assert_eq!(said["enforce"], false, "{said}");

  // `stop` may stand last in a written order, as every order is read back, and is dropped there; named
  // anywhere else it is refused.
  let put_order = |order: Value| {
    asked(
      &app,
      Method::PUT,
      "/supply/platform",
      Some(json!({ "order": order })),
      Some(boss),
      "administrator",
    )
  };
  let (status, said) = put_order(json!(["personal", "stop"])).await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["order"], json!(["personal", "stop"]), "{said}");
  let (status, said) = put_order(json!(["stop", "personal"])).await;

  assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");

  // A conversion rate of nought is refused, and every change stands audited.
  let (status, said) = asked(
    &app,
    Method::PUT,
    "/supply/platform",
    Some(json!({ "creditsPerDollar": 0 })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::BAD_REQUEST, "{said}");

  asked(
    &app,
    Method::PUT,
    "/supply/platform",
    Some(json!({ "creditsPerDollar": 1000, "enforce": true })),
    Some(boss),
    "administrator",
  )
  .await;
  let (_, said) = asked(&app, Method::GET, "/supply/platform", None, Some(boss), "administrator").await;

  assert_eq!(said["creditsPerDollar"], 1000, "{said}");
  assert_eq!(said["enforce"], true, "{said}");

  let (_, said) =
    asked(&app, Method::GET, "/supply/credits/audit?limit=10", None, Some(boss), "administrator").await;
  assert!(
    said["entries"].as_array().unwrap().iter().any(|entry| entry["kind"] == "settings"),
    "{said}"
  );
}

#[tokio::test]
async fn plans_are_read_and_written_whole_over_the_membership_plans() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;

  let (status, said) = asked(
    &app,
    Method::POST,
    "/supply/plans",
    Some(json!({ "name": "team", "price": 50_000, "scope": "organisation", "period": "month", "includedCredits": 3000, "creditsUsable": true })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::CREATED, "{said}");
  assert_eq!(said["price"], 50_000, "{said}");
  assert_eq!(said["scope"], "organisation", "{said}");
  assert_eq!(said["includedCredits"], 3000, "{said}");
  assert_eq!(said["creditsUsable"], true, "{said}");
  let plan = said["id"].as_i64().unwrap();

  let (_, said) = asked(&app, Method::GET, "/supply/plans", None, Some(boss), "administrator").await;
  assert!(said["plans"].as_array().unwrap().iter().any(|row| row["id"] == plan), "{said}");

  // Changed: the action keeps the quota it is given and the cost it is not given.
  let (status, said) = asked(
    &app,
    Method::PATCH,
    &format!("/supply/plans/{plan}"),
    Some(json!({ "name": "team plus", "creditsUsable": false })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["name"], "team plus", "{said}");
  assert_eq!(said["includedCredits"], 3000, "{said}");
  assert_eq!(said["creditsUsable"], false, "{said}");

  // Retired: it goes out of the list whole.
  asked(
    &app,
    Method::DELETE,
    &format!("/supply/plans/{plan}"),
    None,
    Some(boss),
    "administrator",
  )
  .await;
  let (_, said) = asked(&app, Method::GET, "/supply/plans", None, Some(boss), "administrator").await;

  assert!(said["plans"].as_array().unwrap().iter().all(|row| row["id"] != plan), "{said}");
}

#[tokio::test]
async fn the_ledger_answers_newest_first_and_paged() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;

  // A grant through the route stands in the ledger with its words.
  asked(
    &app,
    Method::POST,
    &format!("/supply/org/{company}/credits"),
    Some(json!({ "amount": 250, "words": "opening" })),
    Some(boss),
    "administrator",
  )
  .await;
  let (status, said) =
    asked(&app, Method::GET, "/supply/credits/ledger?limit=10", None, Some(boss), "administrator").await;

  assert_eq!(status, StatusCode::OK, "{said}");
  let entries = said["entries"].as_array().unwrap();
  assert!(entries.iter().any(|entry| entry["kind"] == "grant" && entry["amount"] == 250), "{said}");
  assert!(
    entries
      .windows(2)
      .all(|pair| pair[0]["id"].as_i64().unwrap() > pair[1]["id"].as_i64().unwrap()),
    "newest first: {said}"
  );

  // The second page asks after the first's last entry and holds older rows alone.
  let last = entries.last().unwrap()["id"].as_i64().unwrap();
  let (status, said) = asked(
    &app,
    Method::GET,
    &format!("/supply/credits/ledger?after={last}&limit=10"),
    None,
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(
    said["entries"]
      .as_array()
      .unwrap()
      .iter()
      .all(|entry| entry["id"].as_i64().unwrap() < last),
    "{said}"
  );
}

#[tokio::test]
async fn a_cost_records_the_period_it_falls_in() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let tester = person(&scratch, "tester", company).await;

  scratch
    .run(
      r#"INSERT INTO "supply_costs" ("run", "user_id", "org_id", "source", "credits", "cost_micros", "settled_at", "period")
         VALUES (1, $1, $2, 'personal', 0, 50, 1, to_char(now(), 'YYYY-MM'))"#,
      vec![tester.into(), company.into()],
    )
    .await;
  let (_, said) = asked(&app, Method::GET, "/supply/me", None, Some(tester), "member").await;
  let row = said["usage"]
    .as_array()
    .unwrap()
    .iter()
    .find(|row| row["source"] == "personal")
    .expect("personal cost stands");

  assert_eq!(row["costMicros"], 50, "{said}");
}

// ---- the migration of the platform row and the person's switch ----

#[tokio::test]
async fn the_overrides_migration_renews_a_seeded_platform_row_and_keeps_an_administrator_s() {
  use bmo_web_server::migration::Migrator;
  use sea_orm_migration::MigratorTrait;

  ready();
  let scratch = fresh().await;
  let company = org(&scratch, "company-a", None).await;
  let switched_on = person(&scratch, "switched-on", company).await;
  let left_off = person(&scratch, "left-off", company).await;
  let platform_row = || async {
    let row = bmo_web_server::one(
      scratch.db(),
      r#"SELECT "allowed"::text AS "allowed", "order"::text AS "order", "overridable"::text AS "overridable",
                "order_overridable"
           FROM "supply_platform_policy" WHERE "id" = 1"#,
      vec![],
    )
    .await
    .unwrap()
    .unwrap();
    let list =
      |column: &str| serde_json::from_str::<Value>(&row.try_get::<String>("", column).unwrap()).unwrap();

    (
      list("allowed"),
      list("order"),
      list("overridable"),
      row.try_get::<bool>("", "order_overridable").unwrap(),
    )
  };

  // The row as an administrator set it before the overrides stood, and each person's old switch.
  Migrator::down(scratch.db(), Some(1)).await.unwrap();
  scratch
    .run(
      r#"UPDATE "supply_platform_policy"
             SET "allowed" = '["personal", "global", "personal_credits"]',
                 "order" = '["global", "personal", "personal_credits", "stop"]', "updated_by" = 1
           WHERE "id" = 1"#,
      vec![],
    )
    .await;
  scratch
    .run(
      r#"INSERT INTO "supply_user_settings" ("user_id", "order", "off", "personal_credits_on", "updated_at")
         VALUES ($1, '[]', '[]', true, 0), ($2, '[]', '[]', false, 0)"#,
      vec![switched_on.into(), left_off.into()],
    )
    .await;
  Migrator::up(scratch.db(), None).await.unwrap();

  // What it allowed stays open and overridable, personal credits off until a person switches them on. The
  // switch a person turned on is their choice; one left off was the old default and is no choice at all.
  assert_eq!(
    platform_row().await,
    (
      json!(["personal", "global"]),
      json!(["global", "personal", "personal_credits", "stop"]),
      json!(["personal", "global", "personal_credits"]),
      true
    )
  );
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "supply_user_settings"
            WHERE ("user_id" = $1 AND "on" = '["personal_credits"]' AND "off" = '[]')
               OR ("user_id" = $2 AND "on" = '[]' AND "off" = '[]')"#,
        vec![switched_on.into(), left_off.into()],
      )
      .await,
    2
  );

  // A row still standing as seeded takes the new defaults.
  Migrator::down(scratch.db(), Some(1)).await.unwrap();
  scratch
    .run(
      r#"UPDATE "supply_platform_policy"
             SET "allowed" = '["personal", "global"]', "order" = '["personal", "global", "stop"]',
                 "updated_by" = NULL
           WHERE "id" = 1"#,
      vec![],
    )
    .await;
  Migrator::up(scratch.db(), None).await.unwrap();

  assert_eq!(
    platform_row().await,
    (json!(["personal"]), json!(["personal", "stop"]), json!(["personal"]), true)
  );
}

// ---- an organisation's plans ----

/// A plan made through the plans route, as the administrator makes one.
async fn plan(app: &Router, boss: i32, name: &str, scope: &str) -> i64 {
  let (status, said) = asked(
    app,
    Method::POST,
    "/supply/plans",
    Some(json!({ "name": name, "price": 0, "scope": scope, "period": "month", "includedCredits": 1000, "creditsUsable": false })),
    Some(boss),
    "administrator",
  )
  .await;

  assert_eq!(status, StatusCode::CREATED, "{said}");
  said["id"].as_i64().unwrap()
}

/// The unit's subscriptions in sumida, by plan and status, oldest first.
async fn subscriptions_of(scratch: &Scratch, unit: i32) -> Vec<(i64, String)> {
  bmo_web_server::all(
    scratch.db(),
    r#"SELECT "plan_id", "status" FROM "subscriptions"
        WHERE "owner_kind" = 'organization' AND "owner_id" = $1 ORDER BY "id""#,
    vec![unit.into()],
  )
  .await
  .unwrap()
  .iter()
  .map(|row| {
    (
      i64::from(row.try_get::<i32>("", "plan_id").unwrap()),
      row.try_get("", "status").unwrap(),
    )
  })
  .collect()
}

/// A write the administrator makes.
async fn put(app: &Router, boss: i32, path: &str, body: Value) -> (StatusCode, Value) {
  asked(app, Method::PUT, path, Some(body), Some(boss), "administrator").await
}

fn ids_of(list: &Value) -> Vec<i64> {
  list.as_array().unwrap().iter().map(|plan| plan["id"].as_i64().unwrap()).collect()
}

#[tokio::test]
async fn a_unit_runs_on_one_of_its_exposed_plans_applied_through_sumida_s_subscribe() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let first = plan(&app, boss, "team", "organisation").await;
  let second = plan(&app, boss, "team plus", "organisation").await;
  let personal = plan(&app, boss, "solo", "personal").await;
  let plans = format!("/supply/org/{company}/plans");
  let exposed = format!("/supply/org/{company}/plans/exposed");
  let applied = format!("/supply/org/{company}/plans/applied");

  // Only a standing organisation plan is exposed, and only an exposed one applied.
  let (status, said) = put(&app, boss, &exposed, json!({ "plans": [personal] })).await;
  assert_eq!(
    (status, said["code"].as_str()),
    (StatusCode::UNPROCESSABLE_ENTITY, Some("plan-scope")),
    "{said}"
  );
  let (status, said) = put(&app, boss, &exposed, json!({ "plans": [first, 999_999] })).await;
  assert_eq!((status, said["code"].as_str()), (StatusCode::NOT_FOUND, Some("unknown-plan")), "{said}");
  let (status, said) = put(&app, boss, &applied, json!({ "plan": first })).await;
  assert_eq!(
    (status, said["code"].as_str()),
    (StatusCode::CONFLICT, Some("plan-not-exposed")),
    "{said}"
  );
  let (status, said) = put(&app, boss, &applied, json!({})).await;
  assert_eq!(status, StatusCode::BAD_REQUEST, "a body naming no plan: {said}");

  let (status, said) = put(&app, boss, &exposed, json!({ "plans": [first, second] })).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(ids_of(&said["exposed"]), [second, first], "{said}");
  assert!(said["catalogue"].as_array().unwrap().iter().all(|row| row["exposed"] == true), "{said}");
  assert!(said.get("applied").is_none(), "{said}");

  // Applied: one subscription of sumida's on the plan, which the unit's plan card reads.
  let (status, said) = put(&app, boss, &applied, json!({ "plan": first })).await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["applied"]["plan"], first, "{said}");
  assert!(said["applied"]["periodEnd"].as_i64().unwrap() > said["applied"]["since"].as_i64().unwrap());
  assert_eq!(subscriptions_of(&scratch, company).await, [(first, "active".to_owned())]);
  let (_, said) =
    asked(&app, Method::GET, &format!("/supply/org/{company}"), None, Some(boss), "administrator").await;
  assert_eq!(said["plan"]["name"], "team", "{said}");

  // Applying another cancels the first; the applied plan stays shown.
  let (_, said) = put(&app, boss, &applied, json!({ "plan": second })).await;
  assert_eq!(said["applied"]["plan"], second, "{said}");
  assert_eq!(
    subscriptions_of(&scratch, company).await,
    [(first, "canceled".to_owned()), (second, "active".to_owned())]
  );
  let (status, said) = put(&app, boss, &exposed, json!({ "plans": [first] })).await;
  assert_eq!((status, said["code"].as_str()), (StatusCode::CONFLICT, Some("plan-applied")), "{said}");

  // Applying none leaves the unit on no plan, and the plan may then stop being shown.
  let (_, said) = put(&app, boss, &applied, json!({ "plan": null })).await;
  assert!(said.get("applied").is_none(), "{said}");
  assert_eq!(subscriptions_of(&scratch, company).await[1], (second, "canceled".to_owned()));
  let (status, said) = put(&app, boss, &exposed, json!({ "plans": [first] })).await;
  assert_eq!(status, StatusCode::OK, "{said}");

  // Retiring a plan takes its exposures away.
  asked(
    &app,
    Method::DELETE,
    &format!("/supply/plans/{first}"),
    None,
    Some(boss),
    "administrator",
  )
  .await;
  let (_, said) = asked(&app, Method::GET, &plans, None, Some(boss), "administrator").await;
  assert_eq!(said["exposed"], json!([]), "{said}");

  // Every exposure and apply stands audited under the unit.
  let subject = format!("org {company}");
  let (_, said) =
    asked(&app, Method::GET, "/supply/credits/audit?limit=50", None, Some(boss), "administrator").await;
  let acts = said["entries"]
    .as_array()
    .unwrap()
    .iter()
    .filter(|entry| entry["kind"] == "plan" && entry["subject"] == subject.as_str())
    .count();
  assert_eq!(acts, 5, "{said}");
}

#[tokio::test]
async fn global_reserves_against_the_plan_the_nearest_unit_above_applied() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let division = org(&scratch, "division-a", Some(company)).await;
  let tester = person(&scratch, "tester", division).await;
  let team = plan(&app, boss, "team", "organisation").await;
  put(&app, boss, &format!("/supply/org/{company}/plans/exposed"), json!({ "plans": [team] })).await;
  put(&app, boss, &format!("/supply/org/{company}/plans/applied"), json!({ "plan": team })).await;
  open_platform(&scratch, r#"["personal", "global"]"#).await;
  enforce(&scratch, true).await;

  let (_, said) = hook(&app, json!({ "op": "order", "run": 70, "account": tester, "provider": "anthropic", "model": "m", "kind": "job" })).await;
  assert_eq!(order(&said), ["personal", "global"], "{said}");

  // The hold stands on the company's subscription, whose quota the person's supply stands under.
  let (status, said) = hook(
    &app,
    json!({ "op": "reserve", "run": 70, "step": 1, "account": tester, "source": "global", "key": "70:1:reserve" }),
  )
  .await;

  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["answer"]["accepted"], true, "{said}");
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "quota_reservations" r JOIN "subscriptions" s ON s."id" = r."subscription_id"
            WHERE r."status" = 'held' AND s."owner_kind" = 'organization' AND s."owner_id" = $1"#,
        vec![company.into()],
      )
      .await,
    1
  );
}

#[tokio::test]
async fn an_applied_plan_whose_period_ended_is_subscribed_again_on_the_membership_pass() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let team = plan(&app, boss, "team", "organisation").await;

  for (path, body) in [("exposed", json!({ "plans": [team] })), ("applied", json!({ "plan": team }))] {
    let (status, said) = asked(
      &app,
      Method::PUT,
      &format!("/supply/org/{company}/plans/{path}"),
      Some(body),
      Some(boss),
      "administrator",
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{said}");
  }

  // The clock moved past the period's end, as the rows read it.
  scratch
    .run(
      r#"UPDATE "subscriptions"
             SET "current_period_start" = now() - interval '31 days', "current_period_end" = now() - interval '1 hour'
           WHERE "owner_kind" = 'organization' AND "owner_id" = $1"#,
      vec![company.into()],
    )
    .await;

  let renewal = bmo_web_server::supply::plans::membership_pass(&scratch.service).await.unwrap();
  assert_eq!((renewal.renewed, renewal.failed.len()), (1, 0), "{renewal:?}");
  assert_eq!(
    subscriptions_of(&scratch, company).await,
    [(team, "expired".to_owned()), (team, "active".to_owned())]
  );
  let (_, said) = asked(
    &app,
    Method::GET,
    &format!("/supply/org/{company}/plans"),
    None,
    Some(boss),
    "administrator",
  )
  .await;
  assert_eq!(said["applied"]["plan"], team, "{said}");

  // A plan still live is left as it stands.
  let renewal = bmo_web_server::supply::plans::membership_pass(&scratch.service).await.unwrap();
  assert_eq!(renewal.renewed, 0, "{renewal:?}");

  // A period ended that sumida's own pass has not yet seen: the subscription still reads active, and the
  // renewal cancels it before subscribing again.
  scratch
    .run(
      r#"UPDATE "subscriptions"
             SET "current_period_start" = now() - interval '31 days', "current_period_end" = now() - interval '1 hour'
           WHERE "owner_kind" = 'organization' AND "owner_id" = $1 AND "status" = 'active'"#,
      vec![company.into()],
    )
    .await;

  let renewal = bmo_web_server::supply::plans::renew_applied(&scratch.service).await.unwrap();
  assert_eq!((renewal.renewed, renewal.failed.len()), (1, 0), "{renewal:?}");
  assert_eq!(
    subscriptions_of(&scratch, company).await,
    [(team, "expired".to_owned()), (team, "canceled".to_owned()), (team, "active".to_owned())]
  );
}

#[tokio::test]
async fn each_relation_opens_its_own_part_of_a_unit_s_plans() {
  ready();
  let scratch = fresh().await;
  let app = app(&scratch).await;
  let boss = boss(&scratch).await;
  let company = org(&scratch, "company-a", None).await;
  let member = person(&scratch, "plain-member", company).await;
  let credit_keeper = person(&scratch, "credit-keeper", company).await;
  let plan_keeper = person(&scratch, "plan-keeper", company).await;
  relation(&scratch, "credit_manager", credit_keeper, company).await;
  relation(&scratch, "subscription_manager", plan_keeper, company).await;
  let team = plan(&app, boss, "team", "organisation").await;
  let plans = format!("/supply/org/{company}/plans");
  let exposed = format!("/supply/org/{company}/plans/exposed");
  let applied = format!("/supply/org/{company}/plans/applied");

  // Exposure is the administrator's alone, and so is the catalogue.
  for key in [plan_keeper, credit_keeper] {
    let (status, said) =
      asked(&app, Method::PUT, &exposed, Some(json!({ "plans": [team] })), Some(key), "member").await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  }
  let (status, said) = asked(
    &app,
    Method::PUT,
    &exposed,
    Some(json!({ "plans": [team] })),
    Some(boss),
    "administrator",
  )
  .await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert!(said["catalogue"].is_array(), "{said}");

  // The subscription manager and the credit manager read the unit's plans; a plain member does not.
  for key in [plan_keeper, credit_keeper] {
    let (status, said) = asked(&app, Method::GET, &plans, None, Some(key), "member").await;
    assert_eq!(status, StatusCode::OK, "{said}");
    assert!(said.get("catalogue").is_none(), "{said}");
  }
  let (status, said) = asked(&app, Method::GET, &plans, None, Some(member), "member").await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");

  // Applying is the subscription manager's, not the credit manager's.
  let (status, said) = asked(
    &app,
    Method::PUT,
    &applied,
    Some(json!({ "plan": team })),
    Some(credit_keeper),
    "member",
  )
  .await;
  assert_eq!(status, StatusCode::FORBIDDEN, "{said}");
  let (status, said) =
    asked(&app, Method::PUT, &applied, Some(json!({ "plan": team })), Some(plan_keeper), "member").await;
  assert_eq!(status, StatusCode::OK, "{said}");
  assert_eq!(said["applied"]["plan"], team, "{said}");
}
