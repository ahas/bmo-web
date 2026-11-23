//! The grant tests (docs/accounts.md, 「Checks」, 「Grants」 and 「The data move」), against sumida's own
//! evaluation on a migrated scratch database, with a receiver stand-in saying who sent each message.

use crate::support;

use bmo_web_server::Refusal;
use bmo_web_server::checks::{check_message, check_object, check_room};
use bmo_web_server::data_move::{MEMBER_DEFAULTS, MoveAsk, RoomRule, run_move};
use bmo_web_server::grants::{GrantAsk, Holder, On, RevokeAsk, Target, grant, revoke};
use bmo_web_server::migration::m20261019_000001_tables::USER_KEYED;
use bmo_web_server::phones;
use support::{OWNER, ROOM, Scratch, SharedDatabase, console_hash};

const MEMBER: i64 = 777;
const STRANGER: i64 = 888;
const OTHER: i64 = -200;
const UNANSWERED: i64 = -300;
// A room whose members are granted asking about the system, which no other test grants anything in.
const ASKING: i64 = -400;
// A holder of its own for each test that grants, since the tests share one database.
const UNGRANTED: i64 = 801;
const LAUNCHER: i64 = 802;
const EXPIRING: i64 = 803;
const DEPLOYER: i64 = 804;

/// Every relation a room holds, as the deployment's rules declare them.
const RELATIONS: [&str; 15] = [
  "ask",
  "search",
  "notes",
  "memories",
  "reminders",
  "file_todo",
  "approve",
  "launch",
  "watch",
  "room_rules",
  "deploy",
  "worker_talk",
  "console",
  "system",
  "rule",
];

/// A migrated database the move has run on: the owner's account, two rooms the deployment answers, a room
/// rule in the first, and messages standing in each room. Every test of this file shares it, so a test that
/// grants grants to a holder of its own.
async fn moved() -> Scratch {
  static SHARED: SharedDatabase = SharedDatabase::new();

  SHARED.get(seed).await
}

async fn seed(scratch: Scratch) -> Scratch {
  scratch.console_account("boss", &console_hash("the password")).await;
  scratch
    .run(
      r#"INSERT INTO "web_tab_states" ("user_name", "screen", "state", "updated_at") VALUES ('boss', 'room', '{}', 1)"#,
      vec![],
    )
    .await;
  for (room, message, sender) in [
    (ROOM, 1, OWNER),
    (ROOM, 2, MEMBER),
    (ROOM, 3, STRANGER),
    (OTHER, 1, OWNER),
    (OTHER, 2, MEMBER),
    (ASKING, 1, OWNER),
  ] {
    scratch.message(room, message, sender);
  }

  let moved = run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![ROOM, OTHER],
      room_rules: vec![RoomRule {
        room: ROOM,
        id: "auto-approve".into(),
        subject: MEMBER,
        words: "may have their own items approved".into(),
      }],
    },
  )
  .await
  .unwrap();

  assert!(moved.written);

  scratch
}

fn on(room: i64, id: i64) -> On {
  On { room, id }
}

fn to_sender(sender: i64) -> Holder {
  Holder {
    sender: Some(sender),
    user: None,
    members: false,
  }
}

fn in_room(room: i64, relation: &str) -> Target {
  Target {
    room: Some(room),
    kind: None,
    object: None,
    relation: relation.into(),
  }
}

async fn granted(scratch: &Scratch, ask: GrantAsk) -> Result<bmo_web_server::grants::Granted, Refusal> {
  grant(scratch.db(), &scratch.messages, ask).await
}

#[tokio::test]
async fn a_user_with_no_grant_is_refused_every_acting_relation_with_the_grant_named() {
  let scratch = moved().await;
  // A user of their own, made by a grant elsewhere, who holds nothing in the room the deployment does not
  // answer.
  granted(
    &scratch,
    GrantAsk {
      target: in_room(OTHER, "approve"),
      to: to_sender(UNGRANTED),
      words: None,
      expires_at: None,
      message: on(OTHER, 1),
    },
  )
  .await
  .unwrap();

  for relation in RELATIONS {
    let answer = check_room(scratch.db(), UNANSWERED, Some(UNGRANTED), relation).await.unwrap();

    assert!(!answer.allowed, "{relation} opened in a room with no grant");
    assert_eq!(answer.grant, format!("bmo_room:{UNANSWERED}#{relation}"));
    assert!(answer.user.is_some(), "the holder's user is named");
  }
}

#[tokio::test]
async fn a_grant_in_one_room_opens_nothing_in_another() {
  let scratch = moved().await;

  granted(
    &scratch,
    GrantAsk {
      target: in_room(ROOM, "launch"),
      to: to_sender(LAUNCHER),
      words: Some("may launch the room's jobs".into()),
      expires_at: None,
      message: on(ROOM, 1),
    },
  )
  .await
  .unwrap();

  assert!(check_room(scratch.db(), ROOM, Some(LAUNCHER), "launch").await.unwrap().allowed);
  assert!(!check_room(scratch.db(), OTHER, Some(LAUNCHER), "launch").await.unwrap().allowed);
  assert!(!check_room(scratch.db(), UNANSWERED, Some(LAUNCHER), "launch").await.unwrap().allowed);
  // A room's member grant is no subject in another room either.
  assert!(!check_room(scratch.db(), UNANSWERED, Some(LAUNCHER), "ask").await.unwrap().allowed);
}

#[tokio::test]
async fn an_expired_grant_refuses_as_an_absent_one() {
  let scratch = moved().await;
  let soon = chrono::Utc::now().timestamp_millis() + 3_600_000;

  granted(
    &scratch,
    GrantAsk {
      target: in_room(ROOM, "deploy"),
      to: to_sender(EXPIRING),
      words: None,
      expires_at: Some(soon),
      message: on(ROOM, 1),
    },
  )
  .await
  .unwrap();

  let held = check_room(scratch.db(), ROOM, Some(EXPIRING), "deploy").await.unwrap();

  assert!(held.allowed);

  // The hour passes.
  scratch
    .run(
      r#"UPDATE "relation_tuples" SET "expires_at" = now() - interval '1 minute' WHERE "subject_key" = $1"#,
      vec![format!("user:{}", held.user.unwrap()).into()],
    )
    .await;

  let answer = check_room(scratch.db(), ROOM, Some(EXPIRING), "deploy").await.unwrap();

  assert!(!answer.allowed);
  assert_eq!(answer.grant, format!("bmo_room:{ROOM}#deploy"));
}

#[tokio::test]
async fn every_room_the_move_was_handed_holds_the_default_member_grant() {
  let scratch = moved().await;

  for room in [ROOM, OTHER] {
    let held = scratch
      .count(
        r#"SELECT COUNT(*) FROM "relation_tuples" WHERE "resource_type" = 'bmo_room' AND "resource_id" = $1
           AND "subject_key" = $2"#,
        vec![room.to_string().into(), format!("bmo_member:{room}").into()],
      )
      .await;

    assert_eq!(held, MEMBER_DEFAULTS.len() as i64);

    for relation in RELATIONS {
      let opens = check_room(scratch.db(), room, None, relation).await.unwrap().allowed;

      assert_eq!(opens, MEMBER_DEFAULTS.contains(&relation), "{relation} in {room}");
    }
  }

  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "relation_tuples" WHERE "resource_id" = $1"#,
        vec![UNANSWERED.to_string().into()]
      )
      .await,
    0,
    "a room the deployment does not answer holds no member grant"
  );
}

#[tokio::test]
async fn the_administrator_passes_every_check_in_every_room() {
  let scratch = moved().await;

  for room in [ROOM, OTHER, UNANSWERED] {
    for relation in RELATIONS {
      assert!(
        check_room(scratch.db(), room, Some(OWNER), relation).await.unwrap().allowed,
        "{relation} in {room}"
      );
    }
  }

  let administrator = check_room(scratch.db(), ROOM, Some(OWNER), "ask").await.unwrap().user.unwrap();

  for (kind, relation) in [
    ("bmo_worker", "run"),
    ("bmo_repository", "change"),
    ("bmo_repository", "deploy"),
    ("bmo_tools", "use"),
  ] {
    assert!(
      check_object(scratch.db(), kind, "anything", relation, administrator)
        .await
        .unwrap()
        .allowed
    );
  }
}

#[tokio::test]
async fn an_unlinked_sender_holds_the_member_grant_and_a_standing_rule_opens_its_room_alone() {
  let scratch = moved().await;

  for relation in RELATIONS {
    let unlinked = check_room(scratch.db(), ROOM, Some(99_999), relation).await.unwrap();

    assert_eq!(unlinked.allowed, MEMBER_DEFAULTS.contains(&relation), "{relation}");
    assert_eq!(unlinked.user, None);

    let ruled = check_room(scratch.db(), ROOM, Some(MEMBER), relation).await.unwrap();

    assert!(ruled.allowed, "the standing rule opens {relation}");
    assert_eq!(
      check_room(scratch.db(), OTHER, Some(MEMBER), relation).await.unwrap().allowed,
      MEMBER_DEFAULTS.contains(&relation),
      "the rule is the room's alone: {relation}"
    );
  }

  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "grant_words" WHERE "relation" = 'rule' AND "words" LIKE '%approved%'"#,
        vec![]
      )
      .await,
    1,
    "the rule's words stand beside it"
  );
}

#[tokio::test]
async fn the_members_granted_asking_about_the_system_hold_that_alone_and_in_their_room_alone() {
  let scratch = moved().await;
  let to_members = Holder {
    sender: None,
    user: None,
    members: true,
  };

  granted(
    &scratch,
    GrantAsk {
      target: in_room(ASKING, "system"),
      to: to_members,
      words: Some("anyone here may ask how the agent works".into()),
      expires_at: None,
      message: on(ASKING, 1),
    },
  )
  .await
  .unwrap();

  assert!(check_room(scratch.db(), ASKING, Some(STRANGER), "system").await.unwrap().allowed);
  assert!(check_room(scratch.db(), ASKING, None, "system").await.unwrap().allowed);
  assert!(!check_room(scratch.db(), ASKING, Some(STRANGER), "launch").await.unwrap().allowed);
  assert!(!check_room(scratch.db(), ROOM, Some(STRANGER), "system").await.unwrap().allowed);
}

#[tokio::test]
async fn a_message_is_checked_where_it_stands_and_nowhere_else() {
  let scratch = moved().await;

  assert!(check_message(scratch.db(), &scratch.messages, ROOM, 1, "deploy").await.unwrap().allowed);
  assert!(!check_message(scratch.db(), &scratch.messages, ROOM, 3, "deploy").await.unwrap().allowed);

  let absent: Refusal =
    check_message(scratch.db(), &scratch.messages, OTHER, 3, "deploy").await.unwrap_err();

  assert_eq!(absent.status, axum::http::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn only_the_administrator_grants_and_revokes() {
  let scratch = moved().await;
  let by_member = granted(
    &scratch,
    GrantAsk {
      target: in_room(ROOM, "deploy"),
      to: to_sender(DEPLOYER),
      words: None,
      expires_at: None,
      message: on(ROOM, 2),
    },
  )
  .await
  .unwrap_err();

  assert_eq!(by_member.status, axum::http::StatusCode::FORBIDDEN);

  let elsewhere = granted(
    &scratch,
    GrantAsk {
      target: in_room(ROOM, "deploy"),
      to: to_sender(DEPLOYER),
      words: None,
      expires_at: None,
      message: on(OTHER, 1),
    },
  )
  .await
  .unwrap_err();

  assert_eq!(
    elsewhere.status,
    axum::http::StatusCode::FORBIDDEN,
    "a room's grant is made on its own message"
  );

  granted(
    &scratch,
    GrantAsk {
      target: in_room(ROOM, "deploy"),
      to: to_sender(DEPLOYER),
      words: Some("may deploy the room's project".into()),
      expires_at: None,
      message: on(ROOM, 1),
    },
  )
  .await
  .unwrap();

  let revoked = revoke(
    scratch.db(),
    &scratch.messages,
    RevokeAsk {
      target: in_room(ROOM, "deploy"),
      to: to_sender(DEPLOYER),
      message: on(ROOM, 1),
    },
  )
  .await
  .unwrap();

  assert_eq!(revoked.revoked, 1);
  assert!(!check_room(scratch.db(), ROOM, Some(DEPLOYER), "deploy").await.unwrap().allowed);
  assert_eq!(
    scratch
      .count(r#"SELECT COUNT(*) FROM "grant_words" WHERE "words" LIKE '%room''s project%'"#, vec![])
      .await,
    0
  );
}

#[tokio::test]
async fn the_move_runs_once_and_leaves_no_account_row_without_a_user() {
  let scratch = moved().await;
  let again = run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![UNANSWERED],
      room_rules: vec![],
    },
  )
  .await
  .unwrap();

  assert!(again.done && !again.written);
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "relation_tuples" WHERE "resource_id" = $1"#,
        vec![UNANSWERED.to_string().into()]
      )
      .await,
    0
  );

  for table in USER_KEYED {
    let left = scratch
      .count(&format!(r#"SELECT COUNT(*) FROM "{table}" WHERE "user_id" IS NULL"#), vec![])
      .await;

    assert_eq!(left, 0, "{table} holds a row with no user");
  }
  assert_eq!(
    scratch
      .count(r#"SELECT COUNT(*) FROM "web_tab_states" WHERE "user_id" IS NOT NULL"#, vec![])
      .await,
    1
  );

  // A row written after it for nobody in particular is the platform's, keyed by the administrator.
  scratch
    .run(
      r#"INSERT INTO "web_push_devices" ("endpoint", "user_name", "p256dh", "auth", "kinds", "created_at")
         VALUES ('https://push.example/one', 'boss', 'key', 'auth', 'all', 1)"#,
      vec![],
    )
    .await;
  assert_eq!(
    scratch
      .count(
        r#"SELECT COUNT(*) FROM "web_push_devices" d JOIN "user_senders" s ON s."user_id" = d."user_id" WHERE s."sender_id" = $1"#,
        vec![OWNER.into()],
      )
      .await,
    1
  );
}

#[tokio::test]
async fn the_move_refuses_a_console_holding_more_than_one_account() {
  let scratch = Scratch::new().await;

  scratch.console_account("one", &console_hash("a")).await;
  scratch.console_account("two", &console_hash("b")).await;

  let refused = run_move(
    scratch.db(),
    MoveAsk {
      owner_senders: vec![OWNER],
      rooms: vec![],
      room_rules: vec![],
    },
  )
  .await
  .unwrap_err();

  assert_eq!(refused.status, axum::http::StatusCode::CONFLICT);
  assert_eq!(
    scratch.count(r#"SELECT COUNT(*) FROM "users""#, vec![]).await,
    0,
    "nothing of the move is written"
  );
}

#[tokio::test]
async fn a_phone_key_names_its_user_until_it_is_deleted() {
  let scratch = moved().await;
  let user = check_room(scratch.db(), ROOM, Some(OWNER), "ask").await.unwrap().user.unwrap();
  let made = phones::make(scratch.db(), user).await.unwrap();
  let holder = phones::holder(scratch.db(), &made.key).await.unwrap();

  assert_eq!(holder.user, user.to_string());
  assert_eq!(holder.name, "boss");

  let token = "a-token-issued-before-the-model-0123456789abcdef";
  let adopted = phones::adopt(scratch.db(), token, user).await.unwrap();

  assert_eq!(phones::holder(scratch.db(), token).await.unwrap().hash, adopted);
  assert_eq!(phones::delete(scratch.db(), &made.hash).await.unwrap(), 1);
  assert_eq!(
    phones::holder(scratch.db(), &made.key).await.unwrap_err().status,
    axum::http::StatusCode::UNAUTHORIZED
  );
}
