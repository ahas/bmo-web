//! The account service's OpenAPI 3.1 document (`docs/openapi-accounts.json`): every route the server exposes, in the
//! common wire format. The bodies' schemas are generated from this crate's own types; the TypeScript package is
//! generated from this document.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use schemars::Schema;
use schemars::generate::{SchemaGenerator, SchemaSettings};
use serde_json::{Map, Value, json};

use crate::chain::*;
use crate::organisation::*;
use crate::removal::*;
use crate::security::*;
use crate::supply::*;
use crate::types::*;
use crate::wire::{SessionError, WireError};

/// Where the schemas the routes refer to stand in the document.
const SCHEMAS: &str = "/components/schemas";

const DESCRIPTION: &str = "The web console's server: the account service on sumida, which holds the users, the \
  senders linked to them, the grants they hold, the account model they stand in, the fixed lines a room says, the supply the agency asks who pays for — the sources, \
  the policy layers, the reservations and the settled costs — and the secret store, which writes each person's secrets \
  as files in a space of their own, the administrator's the folder every unit reads the deployment's secrets \
  from, and answers no value, with the kinds its form asks a value in. Its own routes answer \
  in the common wire format: camelCase keys, times as integers of epoch milliseconds, ids as signed 64-bit \
  integers, and every failure as a non-2xx answer carrying code and error. sumida's session routes are mounted under /sumida and take the \
  session cookie instead of the bearer token; their refusals are sumida's own shape. A user's id is answered as \
  the digits of sumida's whole number, a string a caller hands on as it stands.";

/// Which refusal body a route's failures carry.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Refusal {
  /// The service's own two keys, `code` and `error`.
  Wire,
  /// sumida's session shape.
  Session,
}

/// One route as the document states it.
struct Route {
  id: &'static str,
  tag: &'static str,
  summary: &'static str,
  parameters: Vec<Value>,
  body: Option<Value>,
  /// The media type the body is sent in: JSON, or a picture's own bytes.
  media: &'static str,
  answers: Vec<(u16, Option<Value>)>,
  codes: Vec<&'static str>,
  refusal: Refusal,
  security: Option<Value>,
}

/// The `room` parameter's words: what naming a room does to the people directory's search and members list.
const ROOM_PARAMETER: &str = "The number of a room: the people the reader may let into it answer on the entry check's own rule, instead of the reader's company, and none of them marked left; where the reader may let in nobody, nobody answers. A search asked with no words then answers that set whole, up to the limit.";

fn parameter(name: &str, kind: &str, required: bool) -> Value {
  json!({
    "name": name,
    "in": "query",
    "required": required,
    "schema": { "type": kind },
  })
}

/// A query parameter that says what naming it does, where the name alone does not carry the rule.
fn described_parameter(name: &str, kind: &str, required: bool, description: &str) -> Value {
  json!({
    "name": name,
    "in": "query",
    "required": required,
    "description": description,
    "schema": { "type": kind },
  })
}

fn integer_path(name: &str) -> Value {
  json!({
    "name": name,
    "in": "path",
    "required": true,
    "schema": { "type": "integer", "format": "int64" },
  })
}

fn string_path(name: &str) -> Value {
  json!({
    "name": name,
    "in": "path",
    "required": true,
    "schema": { "type": "string" },
  })
}

/// The user of the login a call is made for, which the console hands on.
fn owner_key() -> Value {
  json!({
    "name": "Owner-Key",
    "in": "header",
    "required": true,
    "description": "The user of the login the call is made for, its id written as a decimal number.",
    "schema": { "type": "string" },
  })
}

/// The unit that declared a kind, as it names itself writing a `json` value it judged.
fn declared_by() -> Value {
  json!({
    "name": "Declared-By",
    "in": "header",
    "required": false,
    "description": "The unit that declared the kind, which judged the json value it writes.",
    "schema": { "type": "string" },
  })
}

/// The session the console holds for the call, the value of its `bmo.sid` cookie.
fn session_id(required: bool) -> Value {
  json!({
    "name": "Session-Id",
    "in": "header",
    "required": required,
    "description": "The value of the session cookie the console holds for the signed-in person, which names their device.",
    "schema": { "type": "string" },
  })
}

/// The browser's user agent, as the console hands it on.
fn user_agent() -> Value {
  json!({
    "name": "User-Agent",
    "in": "header",
    "required": false,
    "description": "The browser's user agent, which the sign-in keeps for its record and its notice of a new browser.",
    "schema": { "type": "string" },
  })
}

/// The address of the browser a call is made for, as the console's proxy names it.
fn real_ip() -> Value {
  json!({
    "name": "X-Real-IP",
    "in": "header",
    "required": true,
    "description": "The address the console's proxy took the connection from, which a pairing's limit is kept by.",
    "schema": { "type": "string" },
  })
}

/// The role of the login a call is made for, which the console hands on.
fn owner_role() -> Value {
  json!({
    "name": "Owner-Role",
    "in": "header",
    "required": true,
    "description": "The role of the login the call is made for; a secret kind is changed by `administrator` alone, and a profile answers its holder or an administrator.",
    "schema": { "type": "string", "enum": ["administrator", "member"] },
  })
}

fn json_answer<Answer: JsonSchema>(generator: &mut SchemaGenerator) -> Option<Value> {
  Some(json!({ "application/json": { "schema": generator.subschema_for::<Answer>() } }))
}

/// The body `POST /words/render` takes: one of the fixed line's codes with its fields, and the language.
fn render_body(generator: &mut SchemaGenerator) -> Option<Value> {
  let line = json!(generator.subschema_for::<FixedLineAsk>());

  Some(json!({
    "allOf": [
      line,
      {
        "type": "object",
        "required": ["language"],
        "properties": {
          "language": {
            "type": "string",
            "description": "The pack's language, `ko`.",
          },
        },
      },
    ],
  }))
}

fn no_answer() -> Option<Value> {
  None
}

/// What a BMO's picture is sent and answered as: the bytes of a PNG, JPEG, WebP or GIF, by their own type.
const PICTURE: &str = "image/*";

fn picture() -> Value {
  json!({ "type": "string", "format": "binary" })
}

fn picture_answer() -> Option<Value> {
  Some(json!({ PICTURE: { "schema": picture() } }))
}

impl Route {
  fn operation(self, wire: &Schema, session: &Schema) -> Value {
    let mut responses = Map::new();

    for (status, content) in self.answers {
      let description = match status {
        200 => "Answered.",
        201 => "Made.",
        202 => "Waiting; no content yet.",
        204 => "Done; no content.",
        _ => "Answered.",
      };
      let mut answer = json!({ "description": description });
      if let Some(content) = content {
        answer["content"] = content;
      }
      responses.insert(status.to_string(), answer);
    }

    if !self.codes.is_empty() {
      let error = match self.refusal {
        Refusal::Wire => wire,
        Refusal::Session => session,
      };
      let codes = self.codes.join(", ");
      responses.insert(
        "default".to_owned(),
        json!({
          "description": format!("A refusal or failure: {codes}"),
          "content": { "application/json": { "schema": error } },
        }),
      );
    }

    let mut operation = json!({
      "operationId": self.id,
      "tags": [self.tag],
      "summary": self.summary,
      "responses": responses,
      "x-codes": self.codes,
    });
    if !self.parameters.is_empty() {
      operation["parameters"] = self.parameters.into();
    }
    if let Some(body) = self.body {
      operation["requestBody"] = json!({
        "required": true,
        "content": { self.media: { "schema": body } },
      });
    }
    if let Some(security) = self.security {
      operation["security"] = security;
    }

    operation
  }
}

/// The document as JSON.
pub fn openapi() -> Value {
  let mut generator = SchemaSettings::draft2020_12()
    .for_serialize()
    .with(|settings| {
      settings.definitions_path = SCHEMAS.into();
      settings.meta_schema = None;
    })
    .into_generator();
  let wire: Schema = generator.subschema_for::<WireError>();
  let session: Schema = generator.subschema_for::<SessionError>();
  let mut paths: BTreeMap<String, Value> = BTreeMap::new();

  macro_rules! add {
    (
      $method:literal, $path:literal, $id:literal, $tag:literal, $summary:literal,
      params: $params:expr, body: $body:expr, answers: $answers:expr, codes: $codes:expr
    ) => {{
      add!(
        $method, $path, $id, $tag, $summary,
        params: $params, body: $body, answers: $answers, codes: $codes,
        refusal: Refusal::Wire, security: Value::Null
      )
    }};
    (
      $method:literal, $path:literal, $id:literal, $tag:literal, $summary:literal,
      params: $params:expr, body: $body:expr, answers: $answers:expr, codes: $codes:expr,
      refusal: $refusal:expr, security: $security:expr
    ) => {{
      add!(
        $method, $path, $id, $tag, $summary,
        params: $params, body: $body, media: "application/json", answers: $answers, codes: $codes,
        refusal: $refusal, security: $security
      )
    }};
    (
      $method:literal, $path:literal, $id:literal, $tag:literal, $summary:literal,
      params: $params:expr, body: $body:expr, media: $media:expr, answers: $answers:expr, codes: $codes:expr,
      refusal: $refusal:expr, security: $security:expr
    ) => {{
      let security = match $security {
        Value::Null => None,
        ref other => Some(other.clone()),
      };
      let route = Route {
        id: $id,
        tag: $tag,
        summary: $summary,
        parameters: $params,
        body: $body,
        media: $media,
        answers: $answers,
        codes: $codes,
        refusal: $refusal,
        security,
      };
      let operation = route.operation(&wire, &session);
      let entry = paths.entry($path.to_owned()).or_insert_with(|| json!({}));
      entry[$method.to_lowercase()] = operation;
    }};
  }

  let bearer = || json!([{ "bearerAuth": [] }]);
  let cookie = || json!([{ "session": [] }]);
  let open = || json!([]);

  add!(
    "GET",
    "/health",
    "health",
    "Health",
    "Whether the service is up, its version, and whether the account model is in force.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Health>(&mut generator))],
    codes: vec![],
    refusal: Refusal::Wire,
    security: open()
  );
  add!(
    "GET",
    "/accounts/model",
    "modelState",
    "Account model",
    "Where the account model stands, and why it is not in force where it is not.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<ModelState>(&mut generator))],
    codes: vec!["database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/accounts/move",
    "moveAccounts",
    "Account model",
    "Writes the account model once, in one transaction; a second call writes nothing.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<MoveAsk>())),
    answers: vec![(200, json_answer::<Moved>(&mut generator))],
    codes: vec!["bad-request", "conflict", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/watching",
    "watching",
    "Watching",
    "The rooms the console has open now, which the receiver reads as it starts.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Watching>(&mut generator))],
    codes: vec!["unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/watching",
    "putWatching",
    "Watching",
    "Reports the rooms the console has open now.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<WatchingAsk>())),
    answers: vec![(200, json_answer::<Watching>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/senders/{sender}/user",
    "senderUser",
    "Users and senders",
    "The user a sender is linked to.",
    params: vec![integer_path("sender")],
    body: None,
    answers: vec![(200, json_answer::<SenderUser>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/senders/users",
    "senderLinks",
    "Users and senders",
    "The senders asked after that are linked to a user, each with the user and whether they may sign in.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<SendersAsk>())),
    answers: vec![(200, json_answer::<SenderLinks>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users",
    "users",
    "Users and senders",
    "Every user with their name and whether they are the platform administrator, for the administrator alone.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<UserList>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/search",
    "searchPeople",
    "Users and senders",
    "The people of the reader's organisation whose name, organisation, job title or permitted contact details hold the words; with `room`, the people the reader may let into that room.",
    params: vec![
      parameter("q", "string", true),
      parameter("limit", "integer", false),
      described_parameter("room", "integer", false, ROOM_PARAMETER),
      owner_key(),
      owner_role()
    ],
    body: None,
    answers: vec![(200, json_answer::<People>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/members",
    "members",
    "Users and senders",
    "Every member of the reader's company but those marked left, each by their account key and name alone, in the directory's order; with `room`, the people the reader may let into that room.",
    params: vec![
      described_parameter("room", "integer", false, ROOM_PARAMETER),
      owner_key(),
      owner_role()
    ],
    body: None,
    answers: vec![(200, json_answer::<Members>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/person",
    "person",
    "Users and senders",
    "One person of the reader's organisation, with their posts and the contact details only an administrator or the person themselves may see.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<PersonDetail>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/people/companies",
    "rosterCompanies",
    "People roster",
    "The companies the reader looks through, each by its id and name, in name order: every company for the administrator, the companies whose own unit the reader is granted head of otherwise, and none for anyone else.",
    params: vec![owner_key()],
    body: None,
    answers: vec![(200, json_answer::<RosterCompanies>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/people",
    "roster",
    "People roster",
    "One page of the people the reader looks through, in the order of their names, case set aside, then their user ids, each with their title, rank, role and duty and, for the administrator alone, their email, with how many match the whole ask and the place the next page starts; 50 where no limit is named and never more than 100. A unit or a kind counts the people holding a post in a unit it names, marked with the post.",
    params: vec![
      parameter("q", "string", false),
      parameter("company", "integer", false),
      parameter("unit", "integer", false),
      parameter("kind", "string", false),
      json!({
        "name": "role",
        "in": "query",
        "required": false,
        "schema": { "type": "string", "enum": ["head", "member"] },
      }),
      json!({
        "name": "state",
        "in": "query",
        "required": false,
        "schema": { "type": "string", "enum": ["active", "pending", "left"] },
      }),
      parameter("after", "string", false),
      parameter("limit", "integer", false),
      owner_key(),
    ],
    body: None,
    answers: vec![(200, json_answer::<RosterPage>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/people/{user}",
    "rosterPerson",
    "People roster",
    "One person the reader looks through, as a page answers them, with their landline and mobile for the administrator alone, their unit's path, the units they are granted head of and act for, their posts, their history, their departure and their machine's standing.",
    params: vec![string_path("user"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<RosterDetail>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}",
    "user",
    "Users and senders",
    "One user: their name, whether they are the platform administrator, and the senders linked to them.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserView>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/senders",
    "userSenders",
    "Users and senders",
    "The sender numbers linked to a user.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<Senders>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/senders/{sender}",
    "linkSender",
    "Users and senders",
    "A sender linked to a user where it is linked to none, by the administrator.",
    params: vec![string_path("user"), integer_path("sender"), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "sender-linked", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/password",
    "changePassword",
    "Users and senders",
    "Changes a user's password on the strength of their current one and ends every other session of the account; with `Session-Id` naming the caller's own, a fresh session for it is set on the answer.",
    params: vec![string_path("user"), session_id(false), real_ip(), user_agent()],
    body: Some(json!(generator.subschema_for::<PasswordAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "wrong-password", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/name",
    "renameUser",
    "Users and senders",
    "Gives a user another name.",
    params: vec![string_path("user")],
    body: Some(json!(generator.subschema_for::<NameAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "name-taken", "conflict", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/profile",
    "userProfile",
    "Users and senders",
    "A user's job title and contact details, read by the account's holder or an administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<UserProfile>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/profile",
    "setUserProfile",
    "Users and senders",
    "Writes a user's job title and contact details whole, and their rank and duty where named, by the account's holder or an administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<ProfileAsk>())),
    answers: vec![(200, json_answer::<UserProfile>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/companies/{company}/agent",
    "companyAgent",
    "BMO profiles",
    "A company's default for its people's BMOs: its name, call names and whether it keeps a picture; for the administrator and anyone of the company.",
    params: vec![integer_path("company"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<CompanyAgent>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/companies/{company}/agent",
    "setCompanyAgent",
    "BMO profiles",
    "Replaces a company's default name and call names, by the administrator or the company's heads; answers the default as it stands.",
    params: vec![integer_path("company"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<CompanyAgentAsk>())),
    answers: vec![(200, json_answer::<CompanyAgent>(&mut generator))],
    codes: vec!["bad-request", "bad-agent-profile", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/platform/agent",
    "platformAgent",
    "BMO profiles",
    "The platform's own default for every company's people's BMOs, which a company setting none follows: its name and call names; for any caller.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<CompanyAgent>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/platform/agent",
    "setPlatformAgent",
    "BMO profiles",
    "Replaces the platform's own default name and call names, by the platform administrator; answers the default as it stands.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<CompanyAgentAsk>())),
    answers: vec![(200, json_answer::<CompanyAgent>(&mut generator))],
    codes: vec!["bad-request", "bad-agent-profile", "unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/companies/{company}/agent/picture",
    "companyAgentPicture",
    "BMO profiles",
    "The bytes of a company's default picture with their type, for the callers of the default's read; 404 where none is kept.",
    params: vec![integer_path("company"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, picture_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/companies/{company}/agent/picture",
    "setCompanyAgentPicture",
    "BMO profiles",
    "Sets a company's default picture from the body's bytes, a PNG, JPEG, WebP or GIF of at most 10 MB, by the administrator or the company's heads.",
    params: vec![integer_path("company"), owner_key(), owner_role()],
    body: Some(picture()),
    media: PICTURE,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "not-a-picture", "picture-too-large", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/companies/{company}/agent/picture",
    "deleteCompanyAgentPicture",
    "BMO profiles",
    "Takes a company's default picture away, by the administrator or the company's heads.",
    params: vec![integer_path("company"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/agent",
    "userAgent",
    "BMO profiles",
    "The BMO profile standing for a user, each part with where it came from, whether they may personalise it, and their own parts as kept; for the user themselves, the administrator and a head of the user's unit.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<AgentProfile>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/agent",
    "setUserAgent",
    "BMO profiles",
    "Replaces a person's own name, call names and persona for their BMO, by the user themselves where they may personalise it; answers the profile as it stands.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<OwnAgentAsk>())),
    answers: vec![(200, json_answer::<AgentProfile>(&mut generator))],
    codes: vec!["bad-request", "bad-agent-profile", "unauthorized", "forbidden", "personalize-withheld", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/agent/picture",
    "userAgentPicture",
    "BMO profiles",
    "The bytes of the picture standing for a user's BMO, their own or their company's, with their type; 404 where the deployment's stands.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, picture_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/agent/picture",
    "setUserAgentPicture",
    "BMO profiles",
    "Sets a person's own picture for their BMO from the body's bytes, a PNG, JPEG, WebP or GIF of at most 10 MB, by the user themselves where they may personalise it.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(picture()),
    media: PICTURE,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "not-a-picture", "picture-too-large", "unauthorized", "forbidden", "personalize-withheld", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/users/{user}/agent/picture",
    "deleteUserAgentPicture",
    "BMO profiles",
    "Takes a person's own picture for their BMO away, by the user themselves where they may personalise it.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "personalize-withheld", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/agent-permissions",
    "agentPermissions",
    "BMO profiles",
    "The permission to personalise one's BMO across a unit: the unit and every unit below it, each after its parent, and every person standing in one of them, each with its setting and what it resolves to; for the administrator and a head of the unit.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<AgentPermissions>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/agent-permission",
    "setUnitAgentPermission",
    "BMO profiles",
    "Sets the permission to personalise one's BMO on a unit, inherit removing it; for the administrator and a head of the unit.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<AgentPermissionAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/agent-permission",
    "setUserAgentPermission",
    "BMO profiles",
    "Sets the permission to personalise one's BMO on a person, inherit removing it; for the administrator and a head of the person's unit.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<AgentPermissionAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/sections",
    "userSections",
    "Users and senders",
    "One user's console sections, each with whether they may read and write it: their own or an administrator's.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Sections>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/sections",
    "setUserSections",
    "Users and senders",
    "One user's console sections written whole, by an administrator: every write is also a read.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<Sections>())),
    answers: vec![(200, json_answer::<Sections>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites",
    "makeInvite",
    "Invitations",
    "An invitation made into a unit: by the administrator, or by a head for their unit or one below, never a head's.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<InviteAsk>())),
    answers: vec![(201, json_answer::<Invite>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "no-hub", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites",
    "invites",
    "Invitations",
    "The open invitations the login made, or every open one for the administrator.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Invites>(&mut generator))],
    codes: vec!["forbidden", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites/units",
    "inviteUnits",
    "Invitations",
    "The units the login may invite into.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<InviteUnits>(&mut generator))],
    codes: vec!["forbidden", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/invites/{token}",
    "dropInvite",
    "Invitations",
    "An invitation taken back by whoever made it, or the administrator.",
    params: vec![string_path("token"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites/{token}",
    "invite",
    "Invitations",
    "An invitation as its link shows it to a person with no account.",
    params: vec![string_path("token")],
    body: None,
    answers: vec![(200, json_answer::<InviteView>(&mut generator))],
    codes: vec!["not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites/{token}/accept",
    "acceptInvite",
    "Invitations",
    "An invitation accepted: a disabled account in its unit, bound to its machine, with the machine's install.",
    params: vec![string_path("token")],
    body: Some(json!(generator.subschema_for::<AcceptAsk>())),
    answers: vec![(201, json_answer::<Accepted>(&mut generator))],
    codes: vec!["bad-request", "not-found", "invite-closed", "name-taken", "no-hub", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites/{token}/proof",
    "proveInvite",
    "Invitations",
    "Whether the invited account's machine is attached; attached, the account is enabled.",
    params: vec![string_path("token")],
    body: None,
    answers: vec![(200, json_answer::<Proof>(&mut generator))],
    codes: vec!["not-found", "invite-open", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites/{token}/share",
    "askInviteShare",
    "Invitations",
    "The invitation's waiting account asks to share a machine another agent holds; bound at once where the asking browser's account is bound to it.",
    params: vec![string_path("token")],
    body: Some(json!(generator.subschema_for::<ShareAsk>())),
    answers: vec![(200, json_answer::<ShareAnswer>(&mut generator))],
    codes: vec!["bad-request", "not-found", "no-machine", "invite-open", "account-active", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/invites/{token}/share",
    "inviteShare",
    "Invitations",
    "The invitation's account's ask to share a machine, as it stands.",
    params: vec![string_path("token")],
    body: None,
    answers: vec![(200, json_answer::<ShareAskState>(&mut generator))],
    codes: vec!["not-found", "invite-open", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/machine-shares",
    "machineShares",
    "Invitations",
    "The asks to share a machine the reader may decide, oldest first.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<ShareAsks>(&mut generator))],
    codes: vec!["forbidden", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/machine-shares/{user}/approve",
    "approveMachineShare",
    "Invitations",
    "An ask to share a machine approved: every binding of the machine declared shared and the asking account bound to it shared.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<ShareAnswer>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/machine-shares/{user}/refuse",
    "refuseMachineShare",
    "Invitations",
    "An ask to share a machine refused.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/node",
    "userNode",
    "Invitations",
    "The machine an account is bound to, and whether the hub holds it.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserNode>(&mut generator))],
    codes: vec!["bad-request", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/node",
    "rebindNode",
    "Invitations",
    "An account bound to another machine by the administrator: the one named, or a fresh name, with its install.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<NodeBinding>())),
    answers: vec![(200, json_answer::<Rebound>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "left", "node-taken", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/node/shared",
    "shareNode",
    "Invitations",
    "An account's machine declared shared with other accounts, or no longer shared, by the administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<NodeSharing>())),
    answers: vec![(200, json_answer::<UserNode>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "node-taken", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/users/{user}/node",
    "unbindNode",
    "Invitations",
    "An account bound to no machine any more, by the administrator or by the account itself.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/machines/{agent}/revoke",
    "revokeMachine",
    "Invitations",
    "A machine name bound to no account revoked at the hub, so the machine under it is told to leave.",
    params: vec![string_path("agent")],
    body: None,
    answers: vec![(200, json_answer::<MachineRevoked>(&mut generator))],
    codes: vec!["bad-request", "node-taken", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/node/proof",
    "proveNode",
    "Invitations",
    "The account's machine as the hub holds it now; held, the moment is recorded as its proof.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserNode>(&mut generator))],
    codes: vec!["bad-request", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/desktop/pairings",
    "askPairing",
    "Desktop pairing",
    "A desktop pairing asked with no sign-in: the id the app keeps, the code a person checks, when it closes.",
    params: vec![real_ip()],
    body: None,
    answers: vec![(201, json_answer::<PairingMade>(&mut generator))],
    codes: vec!["too-many-pairings", "no-hub", "unauthorized", "not-in-force", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/desktop/pairings/{pairing}",
    "readPairing",
    "Desktop pairing",
    "A desktop pairing read by the app: waiting, or once approved its machine and credential, answered once.",
    params: vec![string_path("pairing")],
    body: None,
    answers: vec![(200, json_answer::<PairingCredential>(&mut generator)), (202, no_answer())],
    codes: vec!["not-found", "pairing-closed", "no-hub", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/desktop/pairings/code/{code}",
    "pairingByCode",
    "Desktop pairing",
    "A desktop pairing as a signed-in person reads it by its code, with the machine it is for.",
    params: vec![string_path("code"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<PairingView>(&mut generator))],
    codes: vec!["forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/desktop/pairings/code/{code}/approve",
    "approvePairing",
    "Desktop pairing",
    "A desktop pairing approved by a signed-in person for their own machine, a fresh binding where they have none.",
    params: vec![string_path("code"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<PairingApproved>(&mut generator))],
    codes: vec!["forbidden", "not-found", "pairing-closed", "left", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/invites/{token}/pairings/{code}/approve",
    "approveInvitePairing",
    "Desktop pairing",
    "A desktop pairing approved with the invitation that made the account, while that account waits for its machine.",
    params: vec![string_path("token"), string_path("code")],
    body: None,
    answers: vec![(200, json_answer::<PairingApproved>(&mut generator))],
    codes: vec!["not-found", "invite-open", "account-active", "pairing-closed", "left", "no-hub", "upstream-failed", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/desktop/pairings/code/{code}/refuse",
    "refusePairing",
    "Desktop pairing",
    "A desktop pairing refused by a signed-in person.",
    params: vec![string_path("code"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["forbidden", "not-found", "pairing-closed", "unauthorized", "not-in-force", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/unit",
    "checkUnit",
    "Checks",
    "Whether a user heads an organisation unit, through a head grant on it or on a unit above it.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<UnitCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/org-memory",
    "checkOrgMemory",
    "Checks",
    "Whether a user writes an organisation unit's org memory, heading it or a unit above it or holding the unit's grant.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<UnitCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/checks/entry",
    "checkEntry",
    "Checks",
    "Whether a user may let another into a room or take them out: the administrator, a leader of the room or a head of a leader's unit, within the room's company.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<EntryCheckAsk>())),
    answers: vec![(200, json_answer::<CheckAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "upstream-failed", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/unit",
    "userUnit",
    "Organisation units",
    "The unit a user stands in, its company, and the units from the company down to it.",
    params: vec![string_path("user")],
    body: None,
    answers: vec![(200, json_answer::<UserUnit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units",
    "units",
    "Organisation units",
    "Every unit, or the units of one kind, companies first and each unit after its parent, for the administrator alone.",
    params: vec![parameter("kind", "string", false), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Units>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/units",
    "makeUnit",
    "Organisation units",
    "A unit made under a parent, or a new company where none is named, by the administrator.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<NewUnit>())),
    answers: vec![(201, json_answer::<UnitView>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "other-company", "cycle", "short-name-taken", "no-such-kind", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PATCH",
    "/units/{unit}",
    "changeUnit",
    "Organisation units",
    "A unit renamed, moved under another parent of its company, or given its kind, short name and the unit it reports to, by the administrator.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<UnitChange>())),
    answers: vec![(200, json_answer::<UnitView>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "other-company", "cycle", "short-name-taken", "no-such-kind", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/users/{user}/leave",
    "markLeft",
    "Organisation units",
    "An account marked left and its sign-in disabled, by the administrator or a head of the user's unit.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/heads/{user}",
    "grantHead",
    "Organisation units",
    "A user granted head of a unit, by the administrator.",
    params: vec![integer_path("unit"), string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}/heads/{user}",
    "revokeHead",
    "Organisation units",
    "A user's head grant on a unit taken away, by the administrator.",
    params: vec![integer_path("unit"), string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/unit",
    "placeUser",
    "Organisation units",
    "A user placed in a unit, by the administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<UnitPlacement>())),
    answers: vec![(200, json_answer::<UserUnit>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/units/{unit}/members",
    "movePeople",
    "Organisation units",
    "Several people moved into a unit in one act, each its head or a member and with the role named, by the administrator.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<PeopleMove>())),
    answers: vec![(200, json_answer::<UnitView>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "left", "moved", "no-such-role", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}",
    "unit",
    "Organisation units",
    "One organisation unit: its parent, company and path, the units directly under it, its heads and its members, its kind, short name and the unit it reports to, the roles its people carry, the people holding a post in it and the acting appointment running.",
    params: vec![integer_path("unit")],
    body: None,
    answers: vec![(200, json_answer::<UnitView>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/line",
    "unitLine",
    "Organisation units",
    "A unit's line, the unit first and its company last, following the unit it reports to where set and its parent otherwise, each step with its heads and the people holding each role there, for anyone of the unit's company.",
    params: vec![integer_path("unit"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<UnitLine>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/subtree",
    "unitSubtree",
    "Organisation units",
    "A unit and every unit below it in tree order, each with its heads, the acting one marked, its members with their roles and the people holding a post in it, for the administrator and a head of the unit or of a unit above.",
    params: vec![integer_path("unit"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<UnitSubtree>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/memory-writers",
    "memoryWriters",
    "Organisation units",
    "The people granted a unit's org memory write, by name then id, each with who gave it, for the administrator and a head of the unit or of a unit above.",
    params: vec![integer_path("unit"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<MemoryWriters>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/memory-writers/{user}",
    "grantMemoryWrite",
    "Organisation units",
    "A person of the unit's company granted its org memory write, by the administrator or a head of the unit or of a unit above.",
    params: vec![integer_path("unit"), string_path("user"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "other-company", "left", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}/memory-writers/{user}",
    "takeMemoryWrite",
    "Organisation units",
    "A person's grant of a unit's org memory write taken away, by the same callers; none standing changes nothing.",
    params: vec![integer_path("unit"), string_path("user"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/org-memory/units",
    "orgMemoryUnits",
    "Organisation units",
    "The units whose org memory the login writes, companies first and each unit after its parent, each with whether the login heads it.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<OrgMemoryUnits>(&mut generator))],
    codes: vec!["forbidden", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/line/{role}",
    "roleStand",
    "Organisation units",
    "Who stands for one role for a unit: the holders nearest on its line, else the holders of the next lower role, marked acting with the reason.",
    params: vec![integer_path("unit"), string_path("role"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<RoleStand>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/acting",
    "appoint",
    "Organisation units",
    "A person named to act for a unit's head until a moment still to come, by the administrator or a head of a unit above.",
    params: vec![integer_path("unit"), owner_key()],
    body: Some(json!(generator.subschema_for::<AppointmentAsk>())),
    answers: vec![(200, json_answer::<Appointment>(&mut generator))],
    codes: vec!["bad-request", "bad-period", "unauthorized", "forbidden", "not-found", "other-company", "left", "already-head", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}/acting",
    "endAppointment",
    "Organisation units",
    "The acting appointment running on a unit ended, by the administrator or a head of a unit above.",
    params: vec![integer_path("unit"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/posts/{user}",
    "givePost",
    "Organisation units",
    "A post given to a person in a unit of their company other than their home unit, with a role or none and the unit's head or not, by the administrator or a head of the unit or of one above.",
    params: vec![integer_path("unit"), string_path("user"), owner_key()],
    body: Some(json!(generator.subschema_for::<PostAsk>())),
    answers: vec![(200, json_answer::<Post>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "home-unit", "other-company", "left", "no-such-role", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}/posts/{user}",
    "takePost",
    "Organisation units",
    "A post and the head grant it carried taken away, by the administrator or a head of the unit or of one above.",
    params: vec![integer_path("unit"), string_path("user"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/posts",
    "userPosts",
    "Organisation units",
    "A person's posts, each with its unit, path and role, whether it carries the unit's head, and when and by whom it was given, for anyone of the person's company.",
    params: vec![string_path("user"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<Posts>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/companies/{company}/roles",
    "companyRoles",
    "Organisation units",
    "A company's roles, lowest first, for anyone of the company.",
    params: vec![integer_path("company"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<CompanyRoles>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/companies/{company}/roles",
    "setCompanyRoles",
    "Organisation units",
    "A company's roles written whole, lowest first, by the administrator or a head of the company's own unit.",
    params: vec![integer_path("company"), owner_key()],
    body: Some(json!(generator.subschema_for::<CompanyRolesAsk>())),
    answers: vec![(200, json_answer::<CompanyRoles>(&mut generator))],
    codes: vec!["bad-request", "bad-catalogue", "unauthorized", "forbidden", "not-found", "role-held", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/companies/{company}/unit-kinds",
    "unitKinds",
    "Organisation units",
    "A company's unit kinds, in its order, for anyone of the company.",
    params: vec![integer_path("company"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<UnitKinds>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/companies/{company}/unit-kinds",
    "setUnitKinds",
    "Organisation units",
    "A company's unit kinds written whole, by the administrator or a head of the company's own unit.",
    params: vec![integer_path("company"), owner_key()],
    body: Some(json!(generator.subschema_for::<UnitKindsAsk>())),
    answers: vec![(200, json_answer::<UnitKinds>(&mut generator))],
    codes: vec!["bad-request", "bad-catalogue", "unauthorized", "forbidden", "not-found", "kind-held", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/phones",
    "makePhoneKey",
    "Phone keys",
    "Makes a new key for a user's phone, handed out once, with the hash it is kept by.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<PhoneAsk>())),
    answers: vec![(200, json_answer::<PhoneMade>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/phones/adopt",
    "adoptPhone",
    "Phone keys",
    "Carries a token issued before the model onto a key of the same text.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<PhoneAdoptAsk>())),
    answers: vec![(200, json_answer::<PhoneAdopted>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/phones/who",
    "phoneHolder",
    "Phone keys",
    "Whose a phone's key is, where it is a live key of a user who may sign in.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<PhoneWhoAsk>())),
    answers: vec![(200, json_answer::<PhoneHolder>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/phones/{hash}",
    "deletePhoneKey",
    "Phone keys",
    "Takes a phone's key away by its hash.",
    params: vec![string_path("hash")],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/users/{user}/secrets",
    "secrets",
    "Secret store",
    "Every secret the user's own space holds, by its name, with its size and when it last changed; never a value. Asked by that user alone.",
    params: vec![string_path("user"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<Secrets>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/users/{user}/secrets/{name}",
    "putSecret",
    "Secret store",
    "Writes a value under a name in the user's own space, atomically and with mode 600, keeping the value it replaces as <name>.previous; the value is text, or base64 where encoding says so; answers the name, its size and its time alone. Asked by that user alone.",
    params: vec![string_path("user"), string_path("name"), owner_key()],
    body: Some(json!(generator.subschema_for::<SecretAsk>())),
    answers: vec![(200, json_answer::<Secret>(&mut generator)), (201, json_answer::<Secret>(&mut generator))],
    codes: vec!["bad-request", "bad-name", "bad-value", "empty-value", "unauthorized", "forbidden", "not-found", "secret-exists", "not-a-file", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/users/{user}/secrets/{name}",
    "deleteSecret",
    "Secret store",
    "Moves a secret's file in the user's own space to <name>.previous. Asked by that user alone.",
    params: vec![string_path("user"), string_path("name"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-name", "unauthorized", "forbidden", "not-found", "not-a-file", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/secrets",
    "unitSecrets",
    "Secret store",
    "Every secret an organisation unit's space holds, by its name, with its size and when it last changed; never a value. Asked by a head of the unit or the platform administrator.",
    params: vec![string_path("unit"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<Secrets>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/units/{unit}/secrets/{name}",
    "putUnitSecret",
    "Secret store",
    "Writes a value under a name in an organisation unit's space, as a person's is written. Asked by a head of the unit or the platform administrator.",
    params: vec![string_path("unit"), string_path("name"), owner_key()],
    body: Some(json!(generator.subschema_for::<SecretAsk>())),
    answers: vec![(200, json_answer::<Secret>(&mut generator)), (201, json_answer::<Secret>(&mut generator))],
    codes: vec!["bad-request", "bad-name", "bad-value", "empty-value", "unauthorized", "forbidden", "not-found", "secret-exists", "not-a-file", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}/secrets/{name}",
    "deleteUnitSecret",
    "Secret store",
    "Moves a secret's file in an organisation unit's space to <name>.previous. Asked by a head of the unit or the platform administrator.",
    params: vec![string_path("unit"), string_path("name"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-name", "unauthorized", "forbidden", "not-found", "not-a-file", "no-secret-store", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/secret-kinds",
    "secretKinds",
    "Secret kinds",
    "Every secret kind, the shapes every person's secret form asks a value in, in the order they were added; read by any caller.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<SecretKinds>(&mut generator))],
    codes: vec!["unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/secret-kinds",
    "addSecretKind",
    "Secret kinds",
    "Adds a secret kind after the ones that stand; answers the kind as kept.",
    params: vec![owner_role()],
    body: Some(json!(generator.subschema_for::<SecretKind>())),
    answers: vec![(201, json_answer::<SecretKind>(&mut generator))],
    codes: vec!["bad-request", "bad-kind", "unauthorized", "forbidden", "kind-exists", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/secret-kinds/{key}",
    "putSecretKind",
    "Secret kinds",
    "Changes a secret kind in its place, its key the path's; answers the kind as kept.",
    params: vec![string_path("key"), owner_role()],
    body: Some(json!(generator.subschema_for::<SecretKind>())),
    answers: vec![(200, json_answer::<SecretKind>(&mut generator))],
    codes: vec!["bad-request", "bad-kind", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/secret-kinds/{key}",
    "deleteSecretKind",
    "Secret kinds",
    "Removes a secret kind; no secret written in its shape is touched.",
    params: vec![string_path("key"), owner_role()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/words/render",
    "renderLine",
    "Fixed lines",
    "One fixed line, rendered in the room's language from the server's pack.",
    params: vec![],
    body: render_body(&mut generator),
    answers: vec![(200, json_answer::<Rendered>(&mut generator))],
    codes: vec!["bad-request", "not-found", "unknown-language", "unknown-code", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/chain/kinds",
    "chainKinds",
    "The delegation chain",
    "Every setting kind declared on the delegation chain, by key.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<ChainKinds>(&mut generator))],
    codes: vec!["unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/chain/kinds/{key}",
    "chainKind",
    "The delegation chain",
    "One setting kind as its unit declared it.",
    params: vec![string_path("key")],
    body: None,
    answers: vec![(200, json_answer::<ChainKind>(&mut generator))],
    codes: vec!["no-such-kind", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/chain/kinds/{key}",
    "declareChainKind",
    "The delegation chain",
    "Declares a setting kind, or declares it again by the unit that declared it; a shape or mode changed while an entry stands is refused.",
    params: vec![string_path("key")],
    body: Some(json!(generator.subschema_for::<ChainKind>())),
    answers: vec![(200, json_answer::<ChainKind>(&mut generator))],
    codes: vec!["bad-request", "bad-kind", "kind-declared-elsewhere", "kind-in-use", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/chain/kinds/{key}/resolve",
    "resolveChain",
    "The delegation chain",
    "A setting resolved for a person or a unit: its value, the link and rule it came from, every link's word top first, the lock that cut the chain, and whether a link asked after may change it.",
    params: vec![string_path("key"), parameter("person", "string", false), parameter("unit", "integer", false), parameter("link", "string", false)],
    body: None,
    answers: vec![(200, json_answer::<ChainResolution>(&mut generator))],
    codes: vec!["bad-request", "bad-link", "not-found", "no-such-kind", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/chain/kinds/{key}/links/{link}",
    "chainEntry",
    "The delegation chain",
    "A link's entry of a kind, with the lock above it and whether the caller may change it now; for its writers and the person at their own link.",
    params: vec![string_path("key"), string_path("link"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<ChainEntry>(&mut generator))],
    codes: vec!["bad-request", "bad-link", "forbidden", "not-found", "no-such-kind", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/chain/kinds/{key}/links/{link}/value",
    "setChainValue",
    "The delegation chain",
    "A link's value written, null to follow above; a json kind's is its consumer's alone, written by the unit that declared it naming itself in Declared-By.",
    params: vec![string_path("key"), string_path("link"), owner_key(), declared_by()],
    body: Some(json!(generator.subschema_for::<ChainValueAsk>())),
    answers: vec![(200, json_answer::<ChainEntry>(&mut generator))],
    codes: vec!["bad-request", "bad-link", "forbidden", "not-found", "no-such-kind", "locked", "unauthorized", "not-in-force", "database", "failed", "bad-value", "consumer-written"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/chain/kinds/{key}/links/{link}/delegation",
    "setChainDelegation",
    "The delegation chain",
    "A link's delegation written: allow, lock or inherit.",
    params: vec![string_path("key"), string_path("link"), owner_key()],
    body: Some(json!(generator.subschema_for::<ChainDelegationAsk>())),
    answers: vec![(200, json_answer::<ChainEntry>(&mut generator))],
    codes: vec!["bad-request", "bad-link", "forbidden", "not-found", "no-such-kind", "locked", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/chain/kinds/{key}/links/{link}/rules",
    "setChainRules",
    "The delegation chain",
    "A link's rules written whole, each naming a person, a group or a unit under the link.",
    params: vec![string_path("key"), string_path("link"), owner_key()],
    body: Some(json!(generator.subschema_for::<ChainRulesAsk>())),
    answers: vec![(200, json_answer::<ChainEntry>(&mut generator))],
    codes: vec!["bad-request", "bad-link", "forbidden", "not-found", "no-such-kind", "locked", "unauthorized", "not-in-force", "database", "failed", "bad-rule"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/chain/kinds/{key}/links/{link}",
    "clearChainEntry",
    "The delegation chain",
    "A link's entry taken away whole, the link following above.",
    params: vec![string_path("key"), string_path("link"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "bad-link", "forbidden", "not-found", "no-such-kind", "locked", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/chain/groups",
    "chainGroups",
    "The delegation chain",
    "The named groups of people a unit keeps; for the administrator and anyone of its company.",
    params: vec![parameter("unit", "integer", true), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<ChainGroups>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/chain/groups",
    "makeChainGroup",
    "The delegation chain",
    "A named group of people made in a unit, by the administrator or a head of the unit.",
    params: vec![owner_key()],
    body: Some(json!(generator.subschema_for::<ChainGroupAsk>())),
    answers: vec![(201, json_answer::<ChainGroup>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "group-exists", "other-company", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/chain/groups/{group}",
    "chainGroup",
    "The delegation chain",
    "One group, for its readers.",
    params: vec![integer_path("group"), owner_key()],
    body: None,
    answers: vec![(200, json_answer::<ChainGroup>(&mut generator))],
    codes: vec!["forbidden", "not-found", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/chain/groups/{group}",
    "changeChainGroup",
    "The delegation chain",
    "A group's name and members written whole, by its keepers.",
    params: vec![integer_path("group"), owner_key()],
    body: Some(json!(generator.subschema_for::<ChainGroupAsk>())),
    answers: vec![(200, json_answer::<ChainGroup>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "group-exists", "other-company", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/chain/groups/{group}",
    "removeChainGroup",
    "The delegation chain",
    "A group removed by its keepers; refused while a rule names it.",
    params: vec![integer_path("group"), owner_key()],
    body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["forbidden", "not-found", "group-in-use", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/supply/hook",
    "supplyHook",
    "Supply",
    "The agency's supply ask, answered under `answer`: the order, or a reservation taken, extended, captured or released.",
    params: vec![],
    body: Some(json!(generator.subschema_for::<SupplyHookAsk>())),
    answers: vec![(200, json_answer::<SupplyHookAnswer>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/me",
    "supplyMe",
    "Supply",
    "The reader's own supply: the resolved order and whether the platform locks it, each source's standing, reason, lock and the reader's own choice of it, this month's usage, the plan's remaining included amount and the personal credit balance.",
    params: vec![owner_key()],
    body: None,
    answers: vec![(200, json_answer::<SupplyView>(&mut generator))],
    codes: vec!["forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/supply/me",
    "setSupplyMe",
    "Supply",
    "The reader's own setting written whole, its order not read while the platform locks it; a source an earlier layer closed is refused by the closer's code, a source switched against a value the platform locks by `locked-by-platform`, and a source named both on and off by `bad-request`.",
    params: vec![owner_key()],
    body: Some(json!(generator.subschema_for::<SupplySettingAsk>())),
    answers: vec![(200, json_answer::<SupplyView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "source-not-allowed", "not-in-plan", "blocked-by-organisation", "blocked-by-administrator", "locked-by-platform", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/org/{unit}",
    "supplyOrg",
    "Supply",
    "A unit's supply: the policy standing for it, its plan, its wallet and this month's usage per member, each read by the hand that may read it.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyOrgView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/units",
    "supplyUnits",
    "Supply",
    "The companies whose supply the reader holds a part of, each saying whether they hold its policy and credits and whether they hold its plan; every company for a platform administrator.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyUnits>(&mut generator))],
    codes: vec!["forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/supply/org/{unit}",
    "setSupplyOrg",
    "Supply",
    "A unit's supply policy written whole, by its credit manager or its head.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyPolicyAsk>())),
    answers: vec![(200, json_answer::<SupplyOrgView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "source-not-allowed", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/supply/org/{unit}",
    "clearSupplyOrg",
    "Supply",
    "A unit's supply policy taken away, the unit inheriting again.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyOrgView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/supply/org/{unit}/credits",
    "grantSupplyOrgCredits",
    "Supply",
    "Credits into a unit's wallet, answered the wallet as it stands after.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyGrantAsk>())),
    answers: vec![(200, json_answer::<SupplyGranted>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "upstream-failed", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/org/{unit}/plans",
    "supplyOrgPlans",
    "Supply",
    "A unit's plans: the ones it is shown, the one it runs on, and for an administrator every organisation-scope plan with whether the unit is shown it.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyOrgPlans>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/supply/org/{unit}/plans/exposed",
    "setSupplyOrgExposed",
    "Supply",
    "Every plan a unit is shown, written whole by a platform administrator; the applied plan cannot be left out.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyExposedAsk>())),
    answers: vec![(200, json_answer::<SupplyOrgPlans>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "plan-scope", "unknown-plan", "plan-applied", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/supply/org/{unit}/plans/applied",
    "setSupplyOrgApplied",
    "Supply",
    "The plan a unit runs on, one of its exposed plans subscribed through sumida, or none; the plan chosen is subscribed first and only then the standing subscription cancelled. A body naming no `plan` is refused.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyAppliedAsk>())),
    answers: vec![(200, json_answer::<SupplyOrgPlans>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "plan-not-exposed", "not-in-force", "database", "upstream-failed", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/user/{user}",
    "supplyUser",
    "Supply",
    "A person's supply as an administrator reads it: their per-user policy, the roads their personal supply serves, and their resolved order.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyUserView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "no-agency", "upstream-failed", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/supply/user/{user}",
    "setSupplyUser",
    "Supply",
    "A person's per-user policy written whole, narrowing within their organisation.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyPolicyAsk>())),
    answers: vec![(200, json_answer::<SupplyUserView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "source-not-allowed", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/supply/user/{user}",
    "clearSupplyUser",
    "Supply",
    "A person's per-user policy taken away, the person following their organisation's again.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyUserView>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "no-agency", "upstream-failed", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/platform",
    "supplyPlatform",
    "Supply",
    "The platform's policy — the sources it turns on, the ones a person may switch and whether their order is read — and its money settings.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyPlatform>(&mut generator))],
    codes: vec!["forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PUT",
    "/supply/platform",
    "setSupplyPlatform",
    "Supply",
    "Any part of the platform's policy and money settings changed.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyPlatformAsk>())),
    answers: vec![(200, json_answer::<SupplyPlatform>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/plans",
    "supplyPlans",
    "Supply",
    "Every membership plan that stands, retired ones aside.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyPlans>(&mut generator))],
    codes: vec!["forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/supply/plans",
    "addSupplyPlan",
    "Supply",
    "A membership plan made.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyPlanAsk>())),
    answers: vec![(201, json_answer::<SupplyPlan>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "upstream-failed", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "PATCH",
    "/supply/plans/{plan}",
    "changeSupplyPlan",
    "Supply",
    "A membership plan changed.",
    params: vec![integer_path("plan"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyPlanPatch>())),
    answers: vec![(200, json_answer::<SupplyPlan>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "not-in-force", "database", "upstream-failed", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/supply/plans/{plan}",
    "retireSupplyPlan",
    "Supply",
    "A membership plan retired, its exposures taken away and its subscriptions standing on their snapshot until their period ends.",
    params: vec![integer_path("plan"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<SupplyPlans>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-found", "not-in-force", "database", "upstream-failed", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "POST",
    "/supply/credits",
    "grantSupplyCredits",
    "Supply",
    "Credits into anyone's wallet, the platform administrator's act, answered the wallet as it stands after.",
    params: vec![owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<SupplyCreditAsk>())),
    answers: vec![(200, json_answer::<SupplyGranted>(&mut generator))],
    codes: vec!["bad-request", "forbidden", "not-in-force", "database", "upstream-failed", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/credits/ledger",
    "supplyLedger",
    "Supply",
    "The membership wallet ledger, newest first, paged.",
    params: vec![owner_key(), owner_role(), parameter("after", "integer", false), parameter("limit", "integer", false)],
    body: None,
    answers: vec![(200, json_answer::<SupplyLedgerPage>(&mut generator))],
    codes: vec!["forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/supply/credits/audit",
    "supplyAudit",
    "Supply",
    "Every supply act an outsider must be able to name, newest first, paged.",
    params: vec![owner_key(), owner_role(), parameter("after", "integer", false), parameter("limit", "integer", false)],
    body: None,
    answers: vec![(200, json_answer::<SupplyAuditPage>(&mut generator))],
    codes: vec!["forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );

  // Account security (docs/accounts.md, 「Account security」).
  add!(
    "GET", "/mail", "systemMail", "Account security",
    "The system mail as set, whether it is set up, whether its secret stands, and bmo-mail's outgoing servers; the administrator's.",
    params: vec![owner_key()], body: None,
    answers: vec![(200, json_answer::<SystemMail>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"]
  );
  add!(
    "PUT", "/mail", "setSystemMail", "Account security",
    "Writes the system mail whole: bmo-mail's outgoing server, the sender and the secret's name; the administrator's.",
    params: vec![owner_key()], body: Some(json!(generator.subschema_for::<SystemMailAsk>())),
    answers: vec![(200, json_answer::<SystemMail>(&mut generator))],
    codes: vec!["bad-request", "bad-mail", "unauthorized", "forbidden", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/mail/test", "testSystemMail", "Account security",
    "Sends one test mail through the system mail; the administrator's.",
    params: vec![owner_key()], body: Some(json!(generator.subschema_for::<MailTestAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "bad-mail", "unauthorized", "forbidden", "mail-unset", "mail-failed", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/sign-ins", "signIn", "Account security",
    "Signs in with a login and a password: the session cookie in Set-Cookie, or a ticket where the account asks a second factor.",
    params: vec![real_ip(), user_agent()], body: Some(json!(generator.subschema_for::<SignInAsk>())),
    answers: vec![(200, json_answer::<SignedIn>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "wrong-credentials", "account-disabled", "throttled", "locked", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/sign-ins/second-factor", "signInSecondFactor", "Account security",
    "Finishes a sign-in with a code from the authenticator or a recovery code; the session cookie in Set-Cookie.",
    params: vec![real_ip(), user_agent()], body: Some(json!(generator.subschema_for::<SecondFactorAsk>())),
    answers: vec![(200, json_answer::<SignedIn>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "wrong-code", "ticket-gone", "throttled", "locked", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/password-resets", "askPasswordReset", "Account security",
    "Asks a reset link by a login or an email; the answer is the same whatever was asked.",
    params: vec![real_ip()], body: Some(json!(generator.subschema_for::<ResetAsk>())),
    answers: vec![(202, no_answer())],
    codes: vec!["bad-request", "bad-link-base", "unauthorized", "not-in-force", "database", "failed"]
  );
  add!(
    "GET", "/password-resets/{token}", "passwordReset", "Account security",
    "Whether a reset link stands, and the login it is for.",
    params: vec![string_path("token")], body: None,
    answers: vec![(200, json_answer::<ResetLink>(&mut generator))],
    codes: vec!["unauthorized", "link-gone", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/password-resets/{token}", "setPasswordByLink", "Account security",
    "Sets a new password by a reset link and ends every session of the account.",
    params: vec![string_path("token")], body: Some(json!(generator.subschema_for::<NewPasswordAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "weak-password", "unauthorized", "link-gone", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/password-reset", "resetPassword", "Account security",
    "Makes a reset link for a person, mailed or answered to hand over, and ends their sessions; the administrator's and the person's heads'.",
    params: vec![string_path("user"), owner_key()], body: Some(json!(generator.subschema_for::<LinkAsk>())),
    answers: vec![(200, json_answer::<ResetMade>(&mut generator))],
    codes: vec!["bad-request", "bad-link-base", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/email/verification", "verifyEmail", "Account security",
    "Mails a verification link to the profile's email; the holder's or the administrator's.",
    params: vec![string_path("user"), owner_key()], body: Some(json!(generator.subschema_for::<LinkAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "bad-link-base", "no-email", "unauthorized", "forbidden", "mail-unset", "mail-failed", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/email-verifications/{token}", "emailVerified", "Account security",
    "Uses a verification link: the email it was made for is verified.",
    params: vec![string_path("token")], body: None,
    answers: vec![(200, json_answer::<EmailVerified>(&mut generator))],
    codes: vec!["unauthorized", "link-gone", "not-in-force", "database", "failed"]
  );
  add!(
    "GET", "/users/{user}/security", "accountSecurity", "Account security",
    "What stands of an account's security; the holder's, the administrator's and the person's heads'.",
    params: vec![string_path("user"), owner_key()], body: None,
    answers: vec![(200, json_answer::<AccountSecurity>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/second-factor", "enrolSecondFactor", "Account security",
    "Makes a second factor waiting to be confirmed: its secret, its otpauth address and its QR code; the holder's.",
    params: vec![string_path("user"), owner_key()], body: None,
    answers: vec![(200, json_answer::<Enrolment>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "DELETE", "/users/{user}/second-factor", "resetSecondFactor", "Account security",
    "Takes a person's second factor, recovery codes and remembered browsers away; the administrator's and the person's heads'.",
    params: vec![string_path("user"), owner_key()], body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/second-factor/confirm", "confirmSecondFactor", "Account security",
    "Confirms the waiting second factor with a code, answering ten recovery codes once; the holder's.",
    params: vec![string_path("user"), owner_key()], body: Some(json!(generator.subschema_for::<CodeAsk>())),
    answers: vec![(200, json_answer::<RecoveryCodes>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "wrong-code", "nothing-waiting", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/second-factor/off", "turnSecondFactorOff", "Account security",
    "Turns the second factor off with the password; the holder's.",
    params: vec![string_path("user"), owner_key()], body: Some(json!(generator.subschema_for::<PasswordConfirm>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "wrong-password", "second-factor-required", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/recovery-codes", "freshRecoveryCodes", "Account security",
    "Makes ten new recovery codes in place of the old; the holder's.",
    params: vec![string_path("user"), owner_key()], body: None,
    answers: vec![(200, json_answer::<RecoveryCodes>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "no-second-factor", "forbidden", "not-in-force", "database", "failed"]
  );
  add!(
    "GET", "/users/{user}/devices", "accountDevices", "Account security",
    "The account's devices standing, the one `Session-Id` names marked; the holder's.",
    params: vec![string_path("user"), owner_key(), session_id(false)], body: None,
    answers: vec![(200, json_answer::<Devices>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-in-force", "database", "failed"]
  );
  add!(
    "POST", "/users/{user}/devices/others", "endOtherDevices", "Account security",
    "Ends every other session of the account and sets a fresh one for the caller's on the answer; the holder's.",
    params: vec![string_path("user"), owner_key(), session_id(true), real_ip(), user_agent()], body: None,
    answers: vec![(200, json_answer::<Empty>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "no-session", "forbidden", "not-in-force", "database", "failed"]
  );
  add!(
    "DELETE", "/users/{user}/devices/{device}", "endDevice", "Account security",
    "Ends one session of the account; the holder's.",
    params: vec![string_path("user"), integer_path("device"), owner_key()], body: None,
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "GET", "/users/{user}/sign-ins", "signInTries", "Account security",
    "The account's newest 50 sign-ins tried; the holder's or the administrator's.",
    params: vec![string_path("user"), owner_key()], body: None,
    answers: vec![(200, json_answer::<SignInTries>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-in-force", "database", "failed"]
  );
  add!(
    "PUT", "/users/{user}/enabled", "setAccountEnabled", "Account security",
    "Disables an account, ending its sessions, or enables it again; the administrator's.",
    params: vec![string_path("user"), owner_key()], body: Some(json!(generator.subschema_for::<EnabledAsk>())),
    answers: vec![(204, no_answer())],
    codes: vec!["bad-request", "unauthorized", "forbidden", "own-account", "left", "not-found", "not-in-force", "database", "failed"]
  );
  add!(
    "GET",
    "/users/{user}/removal",
    "accountRemoval",
    "Permanent delete",
    "What deleting an account for good would take now, changing nothing: who it is, whether it has left, the refusal that would stop it or none, and the count of each kind of row; for a platform administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<AccountRemoval>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/users/{user}",
    "removeAccount",
    "Permanent delete",
    "An account marked left deleted for good with every row of it and its secret space, the units' results kept in the removal record; for a platform administrator.",
    params: vec![string_path("user"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<RemovalAsk>())),
    answers: vec![(200, json_answer::<Removed>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "own-account", "owner-account", "last-administrator", "not-left", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/units/{unit}/removal",
    "unitRemoval",
    "Permanent delete",
    "What deleting a unit and every unit under it for good would take now, changing nothing: the subtree the deepest first, the people standing in it, the refusal that would stop it or none, and the count of each kind of row; for a platform administrator.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<UnitRemoval>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/units/{unit}",
    "removeUnit",
    "Permanent delete",
    "A unit and every unit under it deleted for good with every row of them and their secret spaces, the units' results kept in the removal record; for a platform administrator.",
    params: vec![integer_path("unit"), owner_key(), owner_role()],
    body: Some(json!(generator.subschema_for::<RemovalAsk>())),
    answers: vec![(200, json_answer::<Removed>(&mut generator))],
    codes: vec!["bad-request", "unauthorized", "forbidden", "not-found", "unit-holds-administrator", "unit-holds-people", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "GET",
    "/removals",
    "removals",
    "Permanent delete",
    "Every removal record, the newest first, at most 200; for a platform administrator.",
    params: vec![owner_key(), owner_role()],
    body: None,
    answers: vec![(200, json_answer::<Removals>(&mut generator))],
    codes: vec!["unauthorized", "forbidden", "not-in-force", "database", "failed"],
    refusal: Refusal::Wire,
    security: bearer()
  );
  add!(
    "DELETE",
    "/sumida/auth/session",
    "signOut",
    "Sessions",
    "Ends the session this request arrives on.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Empty>(&mut generator))],
    codes: vec!["unauthorized"],
    refusal: Refusal::Session,
    security: cookie()
  );
  add!(
    "GET",
    "/sumida/me",
    "me",
    "Sessions",
    "The account behind a session.",
    params: vec![],
    body: None,
    answers: vec![(200, json_answer::<Session>(&mut generator))],
    codes: vec!["unauthorized"],
    refusal: Refusal::Session,
    security: cookie()
  );

  let schemas: Map<String, Value> = generator.take_definitions(true);

  json!({
    "openapi": "3.1.0",
    "info": {
      "title": "bmo-web-server",
      "version": env!("CARGO_PKG_VERSION"),
      "description": DESCRIPTION,
    },
    "x-layer": "downstream",
    "x-stage": 9,
    "paths": paths,
    "components": {
      "schemas": schemas,
      "securitySchemes": {
        "bearerAuth": { "type": "http", "scheme": "bearer" },
        "session": { "type": "apiKey", "in": "cookie", "name": "bmo.sid" },
      },
    },
  })
}

/// The document as `docs/openapi-accounts.json` keeps it: pretty, ending in a line break, its object
/// members in name order. The order is written here rather than left to the JSON map, whose entries follow
/// whatever order the building's features give it, so the kept document is one text however the crate is
/// built.
pub fn openapi_json() -> String {
  let mut written = serde_json::to_string_pretty(&sorted(openapi())).expect("the document is JSON");

  written.push('\n');
  written
}

// A document with every object's members in name order, arrays standing as they are.
fn sorted(value: Value) -> Value {
  match value {
    Value::Object(held) => {
      let mut names: Vec<(String, Value)> =
        held.into_iter().map(|(name, member)| (name, sorted(member))).collect();

      names.sort_by(|one, other| one.0.cmp(&other.0));

      Value::Object(names.into_iter().collect())
    }
    Value::Array(members) => Value::Array(members.into_iter().map(sorted).collect()),
    other => other,
  }
}
