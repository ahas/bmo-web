//! A person's messenger accounts (docs/accounts.md, 「A person's messenger accounts」): the chat services an
//! organisation lets its people use, on the delegation chain as `chat.services`, and, for each service a person
//! is let use, the messenger account they use there, their own login or the one already signed in on their own
//! node, kept at their own link of the service's `chat.<service>.account`. The service judges an account's value
//! before the chain keeps it, so no account stands for a service the person is not let use.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use bmo_web_client::{
  ChainKind, ChainLevel, ChainMode, ChainPersonWriter, ChainShape, Messenger, MessengerAccount as Account,
  MessengerSet, Messengers,
};
use serde_json::{Value, json};

use crate::chain::{Link, Subject};
use crate::readers::reader;
use crate::routes::{Answer, Body, user_in};
use crate::{Refusal, Service};

/// The kind that names the chat services the links below may use.
pub const SERVICES_KIND: &str = "chat.services";

/// The kind a person's messenger account on `service` is kept under.
pub fn account_key(service: &str) -> String {
  format!("chat.{service}.account")
}

/// The chat services the links below may use, out of those the receiver lists, every one where nothing narrows them.
pub fn services_kind(choices: Vec<String>) -> ChainKind {
  let default = Value::Array(choices.iter().cloned().map(Value::String).collect());

  ChainKind {
    key: SERVICES_KIND.to_owned(),
    declared_by: crate::UNIT.to_owned(),
    description: "The chat services the links below may use, narrowing the services offered above them."
      .to_owned(),
    shape: ChainShape::Keys,
    choices,
    mode: ChainMode::Narrowing,
    default: Some(default),
    rules: true,
    levels: vec![ChainLevel::Platform, ChainLevel::Unit],
    unit_permission: crate::units::HEADS.to_owned(),
    person_writer: ChainPersonWriter::Heads,
    person_raises: false,
  }
}

/// A person's messenger account on one chat service, kept at their own link and written by this service alone.
pub fn account_kind(service: &str) -> ChainKind {
  ChainKind {
    key: account_key(service),
    declared_by: crate::UNIT.to_owned(),
    description: format!(
      "The messenger account a person uses on {service}: their own login, or their node's."
    ),
    shape: ChainShape::Json,
    choices: vec![],
    mode: ChainMode::Nearest,
    default: None,
    rules: false,
    levels: vec![ChainLevel::Person],
    unit_permission: crate::units::HEADS.to_owned(),
    person_writer: ChainPersonWriter::Both,
    person_raises: false,
  }
}

/// The kinds declared for the chat services the receiver lists now: their offer and an account kind for each.
async fn declared(service: &Service) -> Result<Vec<crate::receiver::ChatService>, Refusal> {
  let services = service.receiver.chat_services().await?;
  let keys: Vec<String> = services.iter().map(|one| one.key.clone()).collect();

  crate::chain::declare(&service.db, &services_kind(keys)).await?;

  for one in &services {
    crate::chain::declare(&service.db, &account_kind(&one.key)).await?;
  }

  Ok(services)
}

/// The chat services a person is let use, as the chain resolves them for them.
async fn offered(service: &Service, user: i32) -> Result<Vec<String>, Refusal> {
  let kind = crate::chain::kind(&service.db, SERVICES_KIND).await?;
  let (_, resolved) = crate::chain::resolve(&service.db, &kind, Subject::Person(user)).await?;

  Ok(
    resolved
      .value
      .as_ref()
      .and_then(Value::as_array)
      .into_iter()
      .flatten()
      .filter_map(|key| key.as_str().map(str::to_owned))
      .collect(),
  )
}

/// Every chat service the receiver lists, with whether the person is let use it and the account they set there.
pub async fn messengers(service: &Service, user: i32) -> Result<Vec<Messenger>, Refusal> {
  let services = declared(service).await?;
  let offered = offered(service, user).await?;
  let mut listed = Vec::new();

  for one in services {
    let kind = crate::chain::kind(&service.db, &account_key(&one.key)).await?;
    let (_, resolved) = crate::chain::resolve(&service.db, &kind, Subject::Person(user)).await?;

    listed.push(Messenger {
      offered: offered.contains(&one.key),
      account: resolved.value.and_then(|value| serde_json::from_value(value).ok()),
      registration: one.registration,
      service: one.key,
    });
  }

  Ok(listed)
}

/// A person's account on a chat service set, refused `not-offered` where the chain does not let them use it and
/// `unknown-service` for a service the receiver does not list.
pub async fn set(
  service: &Service,
  user: i32,
  chat: &str,
  account: Option<&Account>,
  by: i32,
) -> Result<(), Refusal> {
  let services = declared(service).await?;

  if !services.iter().any(|one| one.key == chat) {
    return Err(Refusal::bad(format!("no chat service is named {chat}")).coded("unknown-service"));
  }

  if account.is_some() && !offered(service, user).await?.iter().any(|one| one == chat) {
    return Err(
      Refusal::forbidden(format!(
        "{chat} is not among the chat services this person's organisation lets them use; a head of their unit lets it on the chat services setting"
      ))
      .coded("not-offered"),
    );
  }

  let value = account.map(|account| json!(account));
  let kind = crate::chain::kind(&service.db, &account_key(chat)).await?;

  crate::chain::put_value(&service.db, &kind, Link::Person(user), value.as_ref(), Some(by)).await
}

// The person a call reads or writes the messenger accounts of: the reader themself, or anyone for the administrator.
async fn whose(service: &Service, headers: &HeaderMap, user: &str) -> Result<(i32, i32), Refusal> {
  let reader = reader(&service.db, headers).await?;
  let user = user_in(user)?;

  if reader.user != user && !reader.administrator {
    return Err(Refusal::forbidden("a person's messenger accounts are their own to read and set"));
  }

  Ok((user, reader.user))
}

async fn list_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<Messengers> {
  let (user, _) = whose(&service, &headers, &user).await?;

  Ok(Json(Messengers {
    items: messengers(&service, user).await?,
  }))
}

async fn put_route(
  State(service): State<Service>,
  Path((user, chat)): Path<(String, String)>,
  headers: HeaderMap,
  Body(account): Body<Account>,
) -> Answer<MessengerSet> {
  let (user, by) = whose(&service, &headers, &user).await?;

  set(&service, user, &chat, Some(&account), by).await?;

  Ok(Json(MessengerSet {
    service: chat,
    account,
  }))
}

async fn delete_route(
  State(service): State<Service>,
  Path((user, chat)): Path<(String, String)>,
  headers: HeaderMap,
) -> Result<StatusCode, Refusal> {
  let (user, by) = whose(&service, &headers, &user).await?;

  set(&service, user, &chat, None, by).await?;

  Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/messengers", get(list_route))
    .route("/users/{user}/messengers/{service}", axum::routing::put(put_route).delete(delete_route))
}
