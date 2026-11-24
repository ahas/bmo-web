//! The fixed lines (`docs/boundary.md`, 「Fixed lines」), asked over the router as the receiver asks them: each
//! of its `FixedLine` codes with the fields it carries beside it and the room's language, answered with the
//! sentence built here from the pack's keys; and the document wording file, held to bmo-artifact's keys.

use crate::support;

use std::collections::{BTreeMap, BTreeSet, HashMap};

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use bmo_web_server::lang::Language;
use bmo_web_server::lang::chat_health::CHAT_HEALTH_WORDS;
use bmo_web_server::lang::draws::DRAWS;
use bmo_web_server::lang::fixed_lines::FIXED_LINES;
use bmo_web_server::lang::particles::PARTICLES;
use bmo_web_server::lang::roads::ROAD_WORDS;
use bmo_web_server::lang::supervisors::SUPERVISOR_WORDS;
use bmo_web_server::marks::fill_marks;
use bmo_web_server::routes::in_force;
use bmo_web_server::wording::document_wording;
use bmo_web_server::words::{Clock, FixedLine, as_subject};
use chrono::{TimeZone, Utc};

// The language a room speaks where a test names none: the source the pack is written in.
const LANGUAGE: &str = Language::SOURCE.code();
use http_body_util::BodyExt;
use serde_json::{Map, Value, json};
use support::{CHAT_AGENT, Scratch, SharedDatabase, names, ready};
use tower::ServiceExt;

const TOKEN: &str = "the server's token";

// The router on a database the data move has not run on, so every line here is asked before the model is in
// force.
async fn app() -> Router {
  static SHARED: SharedDatabase = SharedDatabase::new();

  ready();
  let scratch = SHARED.get(|scratch: Scratch| async move { scratch }).await;

  in_force(scratch.service.clone(), TOKEN.into()).await.unwrap()
}

// A line asked as the receiver asks it, with `token` where one is presented: its code, its fields beside it and
// the language; the status and body it is answered with.
async fn render_with(
  code: &str,
  fields: Value,
  language: &str,
  token: Option<&str>,
) -> (StatusCode, Value) {
  let mut body = Map::new();

  body.insert("code".into(), code.into());
  body.extend(fields.as_object().cloned().unwrap_or_default());
  body.insert("language".into(), language.into());

  let mut request = Request::builder()
    .method(Method::POST)
    .uri("/words/render")
    .header(header::CONTENT_TYPE, "application/json");

  if let Some(token) = token {
    request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
  }

  let request = request.body(Body::from(Value::Object(body).to_string())).unwrap();
  let answer = app().await.oneshot(request).await.unwrap();
  let status = answer.status();
  let bytes = answer.into_body().collect().await.unwrap().to_bytes();

  (status, serde_json::from_slice(&bytes).unwrap())
}

// The sentence a line is rendered as, where it renders.
async fn rendered(code: &str, fields: Value) -> String {
  let (status, body) = render_with(code, fields, LANGUAGE, Some(TOKEN)).await;

  assert_eq!(status, StatusCode::OK, "{code}: {body}");

  body["text"].as_str().unwrap().to_owned()
}

// A rest's line as `text` renders it against a clock standing at `now` in `zone`, both as epoch seconds and a name.
fn rest_line(until: Option<i64>, now: i64, zone: &str) -> String {
  let line: FixedLine = serde_json::from_value(json!({ "code": "rest-begins", "until": until })).unwrap();
  let clock = Clock {
    now: Utc.timestamp_opt(now, 0).unwrap(),
    zone: zone.parse().unwrap(),
  };

  line.text(&names(), &HashMap::new(), clock).unwrap()
}

// The rest's line naming the moment it is kept to, `moment` already told.
fn rest_until(moment: &str) -> String {
  fill_marks(&FIXED_LINES.rest_begins.until, &[("chat_agent", CHAT_AGENT), ("until", moment)])
}

// The moment on another day, by its month (January as 1), day, hour and minute.
fn another_day(month: usize, day: &str, hour: &str, minute: &str) -> String {
  let words = &FIXED_LINES.rest_begins;

  fill_marks(
    &words.another_day,
    &[("month", &words.months[month - 1]), ("day", day), ("hour", hour), ("minute", minute)],
  )
}

#[tokio::test]
async fn rest_begins_with_no_moment_says_the_agent_comes_back_soon() {
  let expected = fill_marks(&FIXED_LINES.rest_begins.soon, &[("chat_agent", CHAT_AGENT)]);

  assert_eq!(rendered("rest-begins", json!({ "until": null })).await, expected);
  assert_eq!(rendered("rest-begins", json!({})).await, expected);
}

#[tokio::test]
async fn rest_begins_on_another_day_names_the_day_and_the_time() {
  // The service tells moments in UTC where no zone is set: 4 March 2100, 05:06.
  let until = Utc.with_ymd_and_hms(2100, 3, 4, 5, 6, 0).unwrap().timestamp();

  assert_eq!(
    rendered("rest-begins", json!({ "until": until })).await,
    rest_until(&another_day(3, "4", "05", "06"))
  );
}

#[test]
fn rest_begins_on_the_same_day_in_the_owners_zone_names_the_time_alone() {
  let now = Utc.with_ymd_and_hms(2026, 11, 24, 10, 0, 0).unwrap().timestamp();
  // 12:30 UTC is 21:30 in Seoul, the same day there.
  let until = Utc.with_ymd_and_hms(2026, 11, 24, 12, 30, 0).unwrap().timestamp();
  let today = fill_marks(&FIXED_LINES.rest_begins.today, &[("hour", "21"), ("minute", "30")]);

  assert_eq!(rest_line(Some(until), now, "Asia/Seoul"), rest_until(&today));
}

#[test]
fn rest_begins_past_midnight_in_the_owners_zone_names_the_day() {
  let now = Utc.with_ymd_and_hms(2026, 11, 24, 10, 0, 0).unwrap().timestamp();
  // 16:30 UTC is the same day in UTC but 01:30 the next day in Seoul.
  let until = Utc.with_ymd_and_hms(2026, 11, 24, 16, 30, 0).unwrap().timestamp();

  assert_eq!(
    rest_line(Some(until), now, "Asia/Seoul"),
    rest_until(&another_day(11, "25", "01", "30"))
  );
  assert_eq!(
    rest_line(Some(until), now, "UTC"),
    rest_until(&fill_marks(&FIXED_LINES.rest_begins.today, &[("hour", "16"), ("minute", "30")]))
  );
}

#[tokio::test]
async fn provider_down_is_the_outages_rest() {
  let expected = fill_marks(&CHAT_HEALTH_WORDS.rest.outage, &[("chat_agent", CHAT_AGENT)]);

  assert_eq!(rendered("provider-down", json!({})).await, expected);
}

#[tokio::test]
async fn compacting_is_the_folds_going() {
  assert_eq!(rendered("compacting", json!({})).await, CHAT_HEALTH_WORDS.fold.going);
}

#[tokio::test]
async fn compact_failed_is_the_folds_failure() {
  assert_eq!(rendered("compact-failed", json!({})).await, CHAT_HEALTH_WORDS.fold.failed);
}

#[tokio::test]
async fn run_broken_is_the_runs_account_and_the_last_resort() {
  let health = &CHAT_HEALTH_WORDS;
  let words = &health.account;
  // A name ending on 2 is read as open, on 1 as closed.
  let speaking = |agent: &str, particle: &str| {
    fill_marks(&health.last_resort.speaking, &[("subject", &format!("{agent}{particle}"))])
  };
  let account = |agent: &str, cause: &str, rest: &str| {
    fill_marks(
      &words.line,
      &[
        ("opening", &fill_marks(&words.broke, &[("agent", agent)])),
        ("room", ""),
        ("cause", cause),
        ("said", ""),
        ("rest", rest),
      ],
    )
  };

  assert_eq!(
    rendered(
      "run-broken",
      json!({ "agent": "agent-2", "cause": "the run exited.", "record": "run 7" })
    )
    .await,
    format!(
      "{}\n{}",
      account("agent-2", "the run exited", &fill_marks(&words.record, &[("record", "run 7")])),
      speaking("agent-2", &PARTICLES.subject.open),
    ),
  );
  assert_eq!(
    rendered("run-broken", json!({ "agent": "agent-1", "cause": null, "record": null })).await,
    format!(
      "{}\n{}",
      account("agent-1", &health.causes.unknown, "").trim_end(),
      speaking("agent-1", &PARTICLES.subject.closed),
    ),
  );
}

#[tokio::test]
async fn chat_denied_tells_the_shut_room() {
  assert_eq!(rendered("chat-denied", json!({})).await, FIXED_LINES.chat_denied);
}

// The service's stop is kept and drawn as a system line (the receiver's `docs/voiced-notices.md`, 「System
// notices」), so its words open with no mark in any language.
#[tokio::test]
async fn going_down_for_update_names_its_items_with_no_mark() {
  let words = &ROAD_WORDS.service;
  let items = fill_marks(&words.stopping.items, &[("items", "#12, #34")]);

  assert_eq!(
    rendered("going-down-for-update", json!({ "items": [12, 34] })).await,
    fill_marks(&words.stopping.deploying, &[("items", &items)]),
  );
  assert_eq!(
    rendered("going-down-for-update", json!({ "items": [] })).await,
    fill_marks(&words.stopping.deploying, &[("items", "")]),
  );
}

#[tokio::test]
async fn going_down_is_the_restart_alone_in_every_language() {
  for language in Language::ALL {
    let (status, body) = render_with("going-down", json!({}), language.code(), Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
      body["text"].as_str(),
      Some(ROAD_WORDS.in_language(language).service.stopping.restarting.as_str()),
      "{language:?}"
    );
  }
}

#[tokio::test]
async fn supervisor_engine_error_is_its_kinds_line() {
  let words = &SUPERVISOR_WORDS.engine_error;

  for (kind, line) in [
    ("busy", &words.busy),
    ("refused", &words.refused),
    ("too-long", &words.too_long),
    ("failed", &words.failed),
  ] {
    assert_eq!(rendered("supervisor-engine-error", json!({ "kind": kind })).await, *line, "{kind}");
  }
}

#[tokio::test]
async fn still_working_is_the_fixed_lines_own() {
  assert_eq!(rendered("still-working", json!({})).await, FIXED_LINES.still_working);
}

#[tokio::test]
async fn memory_tidying_is_the_fixed_lines_own() {
  assert_eq!(rendered("memory-tidying", json!({})).await, FIXED_LINES.memory_tidying);
}

// A person as a chat service's line names them, and as the line's sentence writes them.
fn person(sender: i64, name: &str) -> Value {
  json!({ "senderId": sender, "name": name })
}

fn shown(name: &str) -> String {
  fill_marks(&FIXED_LINES.person, &[("name", name)])
}

#[tokio::test]
async fn people_joined_names_who_came_and_who_brought_them_where_given() {
  let words = &FIXED_LINES;
  let (a, b, c) = (person(1, "person-a"), person(2, "person-b"), person(3, "person-c"));

  assert_eq!(
    rendered("people-joined", json!({ "people": [a] })).await,
    fill_marks(&words.people_joined, &[("people", &shown("person-a"))])
  );
  // Every person is named, joined as the pack joins them.
  let two = [shown("person-a"), shown("person-b")].join(&words.people_joiner);

  assert_eq!(
    rendered("people-joined", json!({ "people": [a, b], "by": c })).await,
    fill_marks(&words.people_joined_by, &[("people", &two), ("by", &shown("person-c"))])
  );
  let many = [shown("person-a"), shown("person-b"), shown("person-c")].join(&words.people_joiner);

  assert_eq!(
    rendered("people-joined", json!({ "people": [a, b, c], "by": null })).await,
    fill_marks(&words.people_joined, &[("people", &many)])
  );

  let (status, body) = render_with("people-joined", json!({ "people": [] }), LANGUAGE, Some(TOKEN)).await;

  assert_eq!(
    (status, body["code"].as_str()),
    (StatusCode::BAD_REQUEST, Some("bad-request")),
    "{body}"
  );
}

#[tokio::test]
async fn person_left_names_who_went_and_who_took_them_out_where_given() {
  let words = &FIXED_LINES;

  assert_eq!(
    rendered("person-left", json!({ "person": person(1, "person-a") })).await,
    fill_marks(&words.person_left, &[("person", &shown("person-a"))])
  );
  assert_eq!(
    rendered("person-left", json!({ "person": person(1, "person-a"), "by": person(2, "person-b") })).await,
    fill_marks(&words.person_taken_out, &[("person", &shown("person-a")), ("by", &shown("person-b"))])
  );
}

#[tokio::test]
async fn supervisor_cut_names_the_supervisor_and_the_guards_reason() {
  assert_eq!(
    rendered("supervisor-cut", json!({ "agent": "agent-a", "reason": "The turn ran too long." })).await,
    fill_marks(
      &FIXED_LINES.supervisor_cut,
      &[("name", "agent-a"), ("reason", "The turn ran too long.")]
    ),
  );
}

#[tokio::test]
async fn session_handed_over_says_the_line_then_why_then_who_asked() {
  let words = &FIXED_LINES.session_handed_over;
  let handed = fill_marks(&words.handed_over, &[("agent", "agent-a"), ("subject", &as_subject("agent-a"))]);
  let reset = fill_marks(&words.reset, &[("agent", "agent-a")]);
  let why = |why: &str| fill_marks(&words.why, &[("why", why)]);
  let by = |by: &str| fill_marks(&words.by, &[("by", by)]);

  // The asker's words stand for why, and an account no user holds stands as its key.
  assert_eq!(
    rendered(
      "session-handed-over",
      json!({ "agent": "agent-a", "cause": "asked", "reason": "a fresh start", "by": 9999 })
    )
    .await,
    format!("{handed}{}{}", why("a fresh start"), by("9999"))
  );
  // A cause the pack holds words for says them where nobody gave words; one asked by nobody names nobody.
  assert_eq!(
    rendered("session-handed-over", json!({ "agent": "agent-a", "cause": "full" })).await,
    format!("{handed}{}", why(&words.causes.full))
  );
  assert_eq!(
    rendered("session-handed-over", json!({ "agent": "agent-a", "cause": "reset", "by": "9999" })).await,
    format!("{reset}{}", by("9999"))
  );
  // A cause the pack does not know reads as the line alone.
  assert_eq!(
    rendered("session-handed-over", json!({ "agent": "agent-a", "cause": "something-new" })).await,
    handed
  );
}

#[tokio::test]
async fn slept_names_the_agent_the_day_and_what_its_sleep_learned_merged_and_closed() {
  let expected = fill_marks(
    &FIXED_LINES.slept,
    &[
      ("agent", "agent-a"),
      ("subject", &as_subject("agent-a")),
      ("date", "2026-11-24"),
      ("learned", "3"),
      ("merged", "1"),
      ("closed", "2"),
    ],
  );

  assert_eq!(
    rendered(
      "slept",
      json!({ "agent": "agent-a", "date": "2026-11-24", "learned": 3, "merged": 1, "closed": 2 })
    )
    .await,
    expected
  );
  assert!(!expected.contains('{'), "{expected}");
}

#[tokio::test]
async fn draw_is_the_line_a_person_checks_it_from() {
  let line = &DRAWS.line;
  let expected = |head: String, asked: String, result: String, number: &str, answered: Option<&str>| {
    [
      fill_marks(&line.asked, &[("head", &head), ("asked", &asked)]),
      fill_marks(&line.result, &[("result", &result)]),
      fill_marks(&line.draw, &[("number", number), ("seed", "ab12")]),
      fill_marks(&line.method, &[("method", "sha256-stream")]),
      answered.map_or_else(
        || line.first.clone(),
        |commitment| fill_marks(&line.answered, &[("commitment", commitment)]),
      ),
      fill_marks(&line.next, &[("next", "cd34")]),
    ]
    .join("\n")
  };

  assert_eq!(
    rendered(
      "draw",
      json!({
        "label": "who goes first",
        "asked": { "shape": "dice", "count": 2, "sides": 6, "modifier": -1 },
        "result": { "shape": "dice", "faces": [3, 5], "total": 7 },
        "number": 1, "seed": "ab12", "method": "sha256-stream", "answered": null, "next": "cd34",
      })
    )
    .await,
    expected(
      fill_marks(&line.labelled, &[("label", "who goes first")]),
      fill_marks(&DRAWS.spec.dice, &[("sides", "6"), ("count", "2"), ("modifier", " - 1")]),
      fill_marks(&DRAWS.dice_total, &[("faces", "3, 5"), ("total", "7")]),
      "1",
      None,
    ),
  );
  assert_eq!(
    rendered(
      "draw",
      json!({
        "label": null,
        "asked": { "shape": "shuffle", "items": 2 },
        "result": { "shape": "shuffle", "order": ["b", "a"] },
        "number": 2, "seed": "ab12", "method": "sha256-stream", "answered": "ef56", "next": "cd34",
      })
    )
    .await,
    expected(
      line.head.clone(),
      fill_marks(&DRAWS.spec.shuffle, &[("items", "2")]),
      "1. b / 2. a".to_owned(),
      "2",
      Some("ef56"),
    ),
  );
  assert_eq!(
    rendered(
      "draw",
      json!({
        "label": null,
        "asked": { "shape": "dice", "count": 1, "sides": 20, "modifier": 0 },
        "result": { "shape": "dice", "faces": [14], "total": 14 },
        "number": 3, "seed": "ab12", "method": "sha256-stream", "answered": "ef56", "next": "cd34",
      })
    )
    .await,
    expected(
      line.head.clone(),
      fill_marks(&DRAWS.spec.dice, &[("sides", "20"), ("count", "1"), ("modifier", "")]),
      "14".to_owned(),
      "3",
      Some("ef56"),
    ),
  );
}

#[tokio::test]
async fn supply_closed_says_why_in_one_sentence_to_each_reason_in_every_language() {
  let words = &FIXED_LINES.supply_closed;
  let reasons = [
    ("no-order", &words.no_order),
    ("withheld", &words.withheld),
    ("no-personal", &words.no_personal),
    ("own-refused", &words.own_refused),
    ("no-organisation", &words.no_organisation),
    ("organisation-refused", &words.organisation_refused),
    ("no-lendable", &words.no_lendable),
    ("shared-node", &words.shared_node),
    ("owned", &words.owned),
    ("refused", &words.refused),
    ("ran-out", &words.ran_out),
  ];

  for (why, sentence) in reasons {
    assert_eq!(
      rendered("supply-closed", json!({ "why": why, "until": 1_700_000_000 })).await,
      *sentence,
      "{why}"
    );
  }

  // A reason the pack does not know is said in the general sentence, never as its word.
  assert_eq!(
    rendered("supply-closed", json!({ "why": "a-new-reason", "until": null })).await,
    words.other
  );

  // Every language says each reason in a sentence of its own, none the general one's.
  for language in Language::ALL {
    let mut said = BTreeSet::new();

    for (why, _) in reasons.iter().chain([("a-new-reason", &words.other)].iter()) {
      let (status, body) =
        render_with("supply-closed", json!({ "why": why }), language.code(), Some(TOKEN)).await;

      assert_eq!(status, StatusCode::OK, "{why} in {}: {body}", language.code());
      said.insert(body["text"].as_str().unwrap().to_owned());
    }

    assert_eq!(said.len(), reasons.len() + 1, "{} says two reasons alike", language.code());
  }

  let (status, body) = render_with("supply-closed", json!({}), LANGUAGE, Some(TOKEN)).await;

  assert_eq!(
    (status, body["code"].as_str()),
    (StatusCode::BAD_REQUEST, Some("bad-request")),
    "a line naming no reason does not read: {body}"
  );
}

#[tokio::test]
async fn a_code_or_a_language_the_pack_lacks_is_refused_by_its_code() {
  let (status, body) = render_with("no-such-line", json!({}), LANGUAGE, Some(TOKEN)).await;

  assert_eq!((status, body["code"].as_str()), (StatusCode::NOT_FOUND, Some("unknown-code")), "{body}");

  let (status, body) = render_with("compacting", json!({}), "xx", Some(TOKEN)).await;

  assert_eq!(
    (status, body["code"].as_str()),
    (StatusCode::NOT_FOUND, Some("unknown-language")),
    "{body}"
  );

  let (status, body) =
    render_with("supervisor-cut", json!({ "agent": "agent-a" }), LANGUAGE, Some(TOKEN)).await;

  assert_eq!(
    (status, body["code"].as_str()),
    (StatusCode::BAD_REQUEST, Some("bad-request")),
    "{body}"
  );

  let (status, _) = render_with("compacting", json!({}), LANGUAGE, None).await;

  assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// Every `{name}` mark a line holds.
fn marks_of(line: &str) -> BTreeSet<String> {
  line
    .split('{')
    .skip(1)
    .filter_map(|after| after.split_once('}').map(|(name, _)| name.to_owned()))
    .filter(|name| !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
    .collect()
}

// Each line's key, its groups joined by dots, with the line.
fn lines_of(value: &Value, at: &str, into: &mut BTreeMap<String, String>) {
  match value {
    Value::Object(groups) => {
      for (key, value) in groups {
        let key = if at.is_empty() { key.clone() } else { format!("{at}.{key}") };

        lines_of(value, &key, into);
      }
    }
    Value::String(line) => {
      into.insert(at.to_owned(), line.clone());
    }
    other => panic!("{at} is no line: {other}"),
  }
}

// Every language the pack holds renders a line in its own words, and a tag of any region names its language's folder.
#[tokio::test]
async fn a_line_is_rendered_in_the_language_the_request_names() {
  for language in Language::ALL {
    let (status, body) = render_with("compacting", json!({}), language.code(), Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["text"].as_str(), Some(CHAT_HEALTH_WORDS.in_language(language).fold.going.as_str()));
  }

  for (tag, language) in [
    ("ko-KR", Language::Ko),
    ("EN-gb", Language::En),
    ("ja-JP", Language::Ja),
    ("zh-TW", Language::ZhCn),
  ] {
    let (_, body) = render_with("compacting", json!({}), tag, Some(TOKEN)).await;

    assert_eq!(
      body["text"].as_str(),
      Some(CHAT_HEALTH_WORDS.in_language(language).fold.going.as_str()),
      "{tag}"
    );
  }

  assert_ne!(
    CHAT_HEALTH_WORDS.in_language(Language::En).fold.going,
    CHAT_HEALTH_WORDS.in_language(Language::Ko).fold.going
  );
}

#[test]
fn the_document_wording_file_holds_every_artifact_key_and_no_other() {
  for language in Language::ALL {
    document_wording_holds_every_artifact_key(language);
  }
}

fn document_wording_holds_every_artifact_key(language: Language) {
  let wanted: BTreeMap<String, BTreeSet<String>> = include_str!("fixtures/artifact-wording.txt")
    .lines()
    .filter(|line| !line.starts_with('#') && !line.trim().is_empty())
    .map(|line| {
      let mut words = line.split_whitespace();
      let key = words.next().unwrap().to_owned();

      (key, words.map(|mark| mark.trim_matches(['{', '}']).to_owned()).collect())
    })
    .collect();
  let file: Value = serde_saphyr::from_str(&document_wording(language).unwrap()).unwrap();
  let mut held = BTreeMap::new();

  lines_of(&file, "", &mut held);

  assert_eq!(wanted.len(), 78);
  assert_eq!(held.keys().collect::<Vec<_>>(), wanted.keys().collect::<Vec<_>>());
  for (key, line) in &held {
    assert!(!line.is_empty(), "{}: {key}", language.code());
    assert_eq!(marks_of(line), wanted[key], "{}: {key}: {line}", language.code());
  }
}

#[tokio::test]
async fn an_account_line_names_each_account_by_its_shown_name_and_one_not_held_by_its_key() {
  ready();
  let scratch = Scratch::new().await;

  scratch.console_account("boss", &support::console_hash("the password")).await;
  bmo_web_server::data_move::run_move(
    scratch.db(),
    bmo_web_server::data_move::MoveAsk {
      owner_senders: vec![support::OWNER],
      rooms: vec![support::ROOM],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();

  let opener = bmo_web_server::users::set_sign_in(scratch.db(), "opener-a", "the password", false)
    .await
    .unwrap()
    .user;
  let colleague = bmo_web_server::users::set_sign_in(scratch.db(), "colleague-a", "the password", false)
    .await
    .unwrap()
    .user;

  scratch
    .run(
      r#"UPDATE "users" SET "full_name" = 'Colleague A' WHERE "id" = $1"#,
      vec![colleague.into()],
    )
    .await;

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let said = |code: &str, fields: Value| {
    let mut body = fields.as_object().cloned().unwrap_or_default();

    body.insert("code".into(), code.into());
    body.insert("language".into(), LANGUAGE.into());

    let request = Request::builder()
      .method(Method::POST)
      .uri("/words/render")
      .header(header::CONTENT_TYPE, "application/json")
      .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
      .body(Body::from(Value::Object(body).to_string()))
      .unwrap();
    let app = app.clone();

    async move {
      let answer = app.oneshot(request).await.unwrap();
      let bytes = answer.into_body().collect().await.unwrap().to_bytes();
      let body: Value = serde_json::from_slice(&bytes).unwrap();

      body["text"].as_str().unwrap().to_owned()
    }
  };

  assert_eq!(
    said("account-let-in", json!({ "account": colleague, "by": opener })).await,
    fill_marks(&FIXED_LINES.account_let_in, &[("account", "Colleague A"), ("by", "opener-a")])
  );
  assert_eq!(
    said("account-taken-out", json!({ "account": colleague.to_string(), "by": opener })).await,
    fill_marks(&FIXED_LINES.account_taken_out, &[("account", "Colleague A"), ("by", "opener-a")])
  );
  assert_eq!(
    said("account-left", json!({ "account": 9999 })).await,
    fill_marks(&FIXED_LINES.account_left, &[("account", "9999")])
  );
  // Several accounts at once name the first and count the rest; one alone reads as the single line.
  assert_eq!(
    said("accounts-let-in", json!({ "accounts": [colleague, 9998, 9999], "by": opener })).await,
    fill_marks(
      &FIXED_LINES.accounts_let_in,
      &[("account", "Colleague A"), ("others", "2"), ("by", "opener-a")]
    )
  );
  // Two are both named, as the people a chat service brought in are.
  let two = [
    fill_marks(&FIXED_LINES.person, &[("name", "Colleague A")]),
    fill_marks(&FIXED_LINES.person, &[("name", "9999")]),
  ]
  .join(&FIXED_LINES.people_joiner);

  assert_eq!(
    said("accounts-let-in", json!({ "accounts": [colleague, 9999], "by": opener })).await,
    fill_marks(
      &FIXED_LINES.people_joined_by,
      &[("people", &two), ("by", &fill_marks(&FIXED_LINES.person, &[("name", "opener-a")]))]
    )
  );
  assert_eq!(
    said("accounts-let-in", json!({ "accounts": [colleague], "by": opener })).await,
    fill_marks(&FIXED_LINES.account_let_in, &[("account", "Colleague A"), ("by", "opener-a")])
  );
  // An organisation stands by its name with the object particle, both forms where its last sound cannot be read.
  assert_eq!(
    said(
      "unit-let-in",
      json!({ "unit": 7, "unitName": "unit-a", "accounts": [colleague], "by": opener })
    )
    .await,
    fill_marks(
      &FIXED_LINES.unit_let_in,
      &[("unit", &format!("unit-a{}", PARTICLES.object.unknown)), ("by", "opener-a")]
    )
  );
}

/// A stand-in agency answering the label each agent it lists is shown by.
struct Labels(Vec<(&'static str, &'static str)>);

#[async_trait::async_trait]
impl bmo_web_server::agency::Agency for Labels {
  async fn register_supply(&self, _url: &str, _token: &str) -> Result<(), bmo_web_server::Refusal> {
    Ok(())
  }

  async fn supply_roads(&self, _user: &str) -> Result<Vec<String>, bmo_web_server::Refusal> {
    Ok(Vec::new())
  }

  async fn label(&self, agent: &str) -> Option<String> {
    self.0.iter().find(|(key, _)| *key == agent).map(|(_, label)| (*label).to_owned())
  }
}

// An agent a line names stands as the label the agency shows it by, with the particle that label's last sound takes;
// an agent the agency gives no label stands as its key.
#[tokio::test]
async fn a_line_naming_an_agent_names_it_by_its_label_and_one_with_none_by_its_key() {
  ready();
  let mut scratch = Scratch::new().await;

  scratch.service.agency = std::sync::Arc::new(Labels(vec![("agent-a", "ABC"), ("agent-b", "XYL")]));

  let app = in_force(scratch.service.clone(), TOKEN.into()).await.unwrap();
  let said = |fields: Value| {
    let mut body = fields.as_object().cloned().unwrap_or_default();

    body.insert("language".into(), LANGUAGE.into());

    let request = Request::builder()
      .method(Method::POST)
      .uri("/words/render")
      .header(header::CONTENT_TYPE, "application/json")
      .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
      .body(Body::from(Value::Object(body).to_string()))
      .unwrap();
    let app = app.clone();

    async move {
      let answer = app.oneshot(request).await.unwrap();
      let bytes = answer.into_body().collect().await.unwrap().to_bytes();
      let body: Value = serde_json::from_slice(&bytes).unwrap();

      body["text"].as_str().unwrap().to_owned()
    }
  };
  let words = &FIXED_LINES.session_handed_over;
  let handed =
    |name: &str| fill_marks(&words.handed_over, &[("agent", name), ("subject", &as_subject(name))]);

  assert_eq!(
    said(json!({ "code": "session-handed-over", "agent": "agent-a", "cause": "asked" })).await,
    handed("ABC")
  );
  assert_eq!(
    said(json!({ "code": "session-handed-over", "agent": "agent-b", "cause": "asked" })).await,
    handed("XYL")
  );
  assert_eq!(
    said(json!({ "code": "session-handed-over", "agent": "agent-c", "cause": "asked" })).await,
    handed("agent-c"),
    "an agent the agency gives no label stands as its key"
  );
  assert_eq!(
    said(json!({
      "code": "slept", "agent": "agent-a", "date": "2026-11-24", "learned": 1, "merged": 0, "closed": 0,
    }))
    .await,
    fill_marks(
      &FIXED_LINES.slept,
      &[
        ("agent", "ABC"),
        ("subject", &as_subject("ABC")),
        ("date", "2026-11-24"),
        ("learned", "1"),
        ("merged", "0"),
        ("closed", "0"),
      ],
    )
  );
}

// A name of capitals takes the particle its last letter's own name closes with, so no such name stands with both.
#[test]
fn a_name_of_capitals_takes_the_particle_its_last_letters_name_closes_with() {
  let subject = &PARTICLES.subject;

  assert_eq!(as_subject("ABC"), format!("ABC{}", subject.open));
  assert_eq!(as_subject("XYL"), format!("XYL{}", subject.closed));
  assert_eq!(as_subject("agent-M"), format!("agent-M{}", subject.closed));
  assert_eq!(as_subject("(ABN)"), format!("(ABN){}", subject.closed));
  assert_eq!(as_subject("agent-a"), format!("agent-a{}", subject.unknown));
}
