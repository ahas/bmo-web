//! The service's routes (docs/boundary.md, 「What the server serves」): sumida's own as sumida mounts them,
//! and the deployment's own, every one of them but the health under the server's bearer token, and every one
//! but the health, the model's state and the move refused while the model is not in force.

use std::sync::Arc;
use std::sync::atomic::Ordering;

use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, Path, Query, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{Next, from_fn, from_fn_with_state};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use bmo_web_client::{
  CheckAnswer as WireCheck, Granted as WireGranted, Grants as WireGrants, Health as WireHealth,
  Holdings as WireHoldings, ModelState as WireModel, Moved as WireMoved, PhoneAdopted as WireAdopted,
  PhoneHolder as WireHolder, PhoneMade as WireMade, Rendered as WireRendered, Revoked as WireRevoked,
  SenderLink as WireSenderLink, SenderLinks as WireSenderLinks, SenderUser as WireSenderUser,
  Senders as WireSenders, SendersAsk, UserView as WireUser,
};
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use sumida::api::Sumida;
use sumida::api::authz::Authz;

use crate::checks::{check_message, check_object, check_room};
use crate::data_move::{MoveAsk, moved, run_move};
use crate::grants::{GrantAsk, RevokeAsk, grant, revoke, standing_in};
use crate::ids::{parsed, shown};
use crate::receiver::Receiver;
use crate::rules::RULES;
use crate::settings::Names;
use crate::users::{link, linked_senders, user_of_sender, user_subject};
use crate::{Refusal, Service, VERSION, all, holdings, one, phones, words};

/// Where sumida's own router is mounted: apart from the deployment's routes, whose paths other units name
/// and some of which sumida's own (its users among them) would take.
pub const SUMIDA_ROOT: &str = "/sumida";

/// sumida's rules and the deployment's, read and held to the database: every table a rule reads stands, and
/// every relation they declare is written where a grant names it. A database the rules do not fit is refused
/// before anything is answered. `names` fill the pack's lines that name one.
pub async fn stand(
  db: DatabaseConnection,
  receiver: Arc<dyn Receiver>,
  names: Names,
) -> Result<Service, Refusal> {
  Authz::install_rules(RULES)?;
  Authz::boot_or_abort(&db).await?;
  Authz::sync_schema(&db).await?;
  // A user who stood before the console's sections did is given the defaults in force, once, and agent
  // management's old single section is moved to its five parts.
  crate::sections::backfill(&db).await?;
  crate::sections::backfill_rooms_write(&db).await?;
  crate::sections::split_agents(&db).await?;

  Ok(Service {
    db,
    receiver,
    names: Arc::new(names),
    seen_in_force: Arc::default(),
    watching: crate::watching::state(),
    secrets: None,
    nodes: None,
    pairings: Arc::default(),
  })
}

/// Every route, with sumida's sessions on Valkey under them; the deployment's own take `token` as their
/// bearer.
pub async fn in_force(service: Service, token: String) -> Result<Router, Refusal> {
  let settings = sumida::infra::settings::get();
  let store = sumida::infra::session::new_store(&settings.session)
    .await
    .map_err(|why| Refusal::new(StatusCode::SERVICE_UNAVAILABLE, format!("the session store: {why}")))?;
  // A session's idle window is extended at every request it is read on, so a console in use stays signed
  // in, as `docs/web.md` 「Access」 has it.
  let sessions = sumida::api::layer::session::new(store)
    .await
    .map_err(|why| Refusal::new(StatusCode::SERVICE_UNAVAILABLE, format!("the session layer: {why}")))?
    .with_always_save(true);
  let token: Arc<str> = token.into();
  let guarded = own()
    .route_layer(from_fn_with_state(service.clone(), model_gate))
    .merge(model())
    .route_layer(from_fn(move |request: Request, next: Next| {
      let token = token.clone();

      async move { bearer(&token, request, next).await }
    }));

  Ok(
    Router::new()
      .nest(SUMIDA_ROOT, Sumida::new(RULES).set_state(&service).router())
      .merge(guarded)
      .route("/health", get(health))
      .layer(sessions)
      .with_state(service)
      .layer(settings.session.ip_source.clone().into_extension()),
  )
}

// The bearer token every route but the health takes.
async fn bearer(token: &str, request: Request, next: Next) -> Response {
  let presented = request
    .headers()
    .get(header::AUTHORIZATION)
    .and_then(|value| value.to_str().ok())
    .and_then(|value| value.strip_prefix("Bearer "));

  if presented == Some(token) {
    next.run(request).await
  } else {
    Refusal::new(StatusCode::UNAUTHORIZED, "the token is missing or wrong").into_response()
  }
}

/// Whether the model is in force: the data move has been written, which once seen stays.
async fn standing(service: &Service) -> Result<bool, Refusal> {
  if service.seen_in_force.load(Ordering::Relaxed) {
    return Ok(true);
  }

  let now = moved(&service.db).await?;

  if now {
    service.seen_in_force.store(true, Ordering::Relaxed);
  }

  Ok(now)
}

// The routes that need the model in force are refused, naming why, until it is.
async fn model_gate(State(service): State<Service>, request: Request, next: Next) -> Response {
  match standing(&service).await {
    Ok(true) => next.run(request).await,
    Ok(false) => not_in_force().into_response(),
    Err(refusal) => refusal.into_response(),
  }
}

fn not_in_force() -> Refusal {
  Refusal::new(
    StatusCode::SERVICE_UNAVAILABLE,
    "the model is not in force: the data move has not been written",
  )
  .coded("not-in-force")
}

/// A JSON body, refused with 400 naming what is wrong where it does not read as the route's shape.
pub struct Body<T>(pub T);

impl<S: Send + Sync, T: DeserializeOwned> FromRequest<S> for Body<T> {
  type Rejection = Refusal;

  async fn from_request(request: Request, state: &S) -> Result<Self, Refusal> {
    Json::<T>::from_request(request, state)
      .await
      .map(|Json(value)| Body(value))
      .map_err(|why: JsonRejection| Refusal::bad(format!("the body does not read: {}", why.body_text())))
  }
}

pub(crate) type Answer<T> = Result<Json<T>, Refusal>;
type Done = Result<StatusCode, Refusal>;

pub(crate) fn user_in(path: &str) -> Result<i32, Refusal> {
  parsed(path).ok_or_else(|| Refusal::bad(format!("`{path}` is no user's id")))
}

/// The routes that stand whether or not the model is in force: its state, the move that brings it, and the
/// fixed lines, which read no account.
fn model() -> Router<Service> {
  Router::new()
    .route("/accounts/model", get(model_route))
    .route("/accounts/move", post(move_route))
    .route("/words/render", post(render_route))
}

/// The routes that need the model in force.
fn own() -> Router<Service> {
  Router::new()
    .route("/senders/{sender}/user", get(sender_user))
    .route("/senders/users", post(sender_links))
    .route("/users/{user}", get(user_route))
    .route("/users/{user}/senders", get(user_senders))
    .route("/users/{user}/senders/{sender}", axum::routing::put(link_route))
    .route("/users/{user}/password", post(password_route))
    .route("/users/{user}/name", post(name_route))
    .route("/checks/room", post(room_check))
    .route("/checks/message", post(message_check))
    .route("/checks/object", post(object_check))
    .route("/grants", get(grants_route).post(grant_route).delete(revoke_route))
    .route("/phones", post(phone_make))
    .route("/phones/adopt", post(phone_adopt))
    .route("/phones/who", post(phone_who))
    .route("/phones/{hash}", axum::routing::delete(phone_delete))
    .route("/rooms/{chat}/holdings", get(holdings_route))
    .route("/watching", get(crate::watching::get).put(crate::watching::put))
    .merge(crate::profiles::routes())
    .merge(crate::people::routes())
    .merge(crate::sections::routes())
    .merge(crate::secrets::routes())
    .merge(crate::secret_kinds::routes())
    .merge(crate::units::routes())
    .merge(crate::callers::routes())
    .merge(crate::invites::routes())
    .merge(crate::machines::routes())
    .merge(crate::pairings::routes())
}

async fn health(State(service): State<Service>) -> Json<WireHealth> {
  let in_force = standing(&service).await.unwrap_or(false);

  Json(WireHealth {
    ok: true,
    version: VERSION.to_owned(),
    in_force,
  })
}

async fn model_route(State(service): State<Service>) -> Answer<WireModel> {
  if standing(&service).await? {
    Ok(Json(WireModel {
      in_force: true,
      why: None,
    }))
  } else {
    Ok(Json(WireModel {
      in_force: false,
      why: Some(not_in_force().detail),
    }))
  }
}

async fn move_route(State(service): State<Service>, Body(ask): Body<MoveAsk>) -> Answer<WireMoved> {
  let moved = run_move(&service.db, ask).await?;

  Ok(Json(WireMoved {
    done: moved.done,
    written: moved.written,
    administrator: moved.administrator.map(shown),
  }))
}

async fn sender_user(State(service): State<Service>, Path(sender): Path<i64>) -> Answer<WireSenderUser> {
  let user = user_of_sender(&service.db, sender)
    .await?
    .ok_or_else(|| Refusal::absent(format!("sender {sender} is linked to no user")))?;

  Ok(Json(WireSenderUser { user: shown(user) }))
}

/// `POST /senders/users`: the senders asked after that are linked to a user, and whether each may sign in.
async fn sender_links(
  State(service): State<Service>,
  Body(ask): Body<SendersAsk>,
) -> Answer<WireSenderLinks> {
  let links = linked_senders(&service.db, &ask.senders)
    .await?
    .into_iter()
    .map(|link| WireSenderLink {
      sender: link.sender,
      user: shown(link.user),
      signs_in: link.signs_in,
    })
    .collect();

  Ok(Json(WireSenderLinks { links }))
}

async fn senders_of(service: &Service, user: i32) -> Result<Vec<i64>, Refusal> {
  all(
    &service.db,
    r#"SELECT "sender_id" FROM "user_senders" WHERE "user_id" = $1 ORDER BY "sender_id""#,
    vec![i64::from(user).into()],
  )
  .await?
  .iter()
  .map(|row| Ok(row.try_get::<i64>("", "sender_id")?))
  .collect()
}

/// A user as the console reads them: their login, the person's name, whether they are the platform
/// administrator, and the sender ids linked to them.
async fn user_route(State(service): State<Service>, Path(user): Path<String>) -> Answer<WireUser> {
  let user = user_in(&user)?;
  let db = &service.db;
  let row = one(
    db,
    r#"SELECT "username", COALESCE("full_name", '') AS "full_name" FROM "users" WHERE "id" = $1"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let name: String = row.try_get("", "username")?;
  let full_name: String = row.try_get("", "full_name")?;
  let administrator = Authz::is_superuser(&user_subject(db, user).await?, db).await?;
  let senders = senders_of(&service, user).await?;

  Ok(Json(WireUser {
    user: shown(user),
    name,
    full_name,
    administrator,
    senders,
  }))
}

async fn user_senders(State(service): State<Service>, Path(user): Path<String>) -> Answer<WireSenders> {
  let user = user_in(&user)?;

  one(&service.db, r#"SELECT "id" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;

  Ok(Json(WireSenders {
    senders: senders_of(&service, user).await?,
  }))
}

/// A sender linked to a user where it is linked to none, by the administrator (docs/accounts.md, 「Users and
/// senders」): the console's server links each account's identity on the record road so.
async fn link_route(
  State(service): State<Service>,
  headers: axum::http::HeaderMap,
  Path((user, sender)): Path<(String, String)>,
) -> Done {
  crate::units::administrator(&headers)?;

  let user = user_in(&user)?;
  let sender: i64 =
    sender.parse().map_err(|_| Refusal::bad(format!("`{sender}` is no sender's number")))?;

  one(&service.db, r#"SELECT "id" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  link(&service.db, sender, user).await?;

  Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct PasswordAsk {
  current: String,
  next: String,
}

#[derive(Deserialize)]
struct NameAsk {
  name: String,
}

async fn password_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  Body(ask): Body<PasswordAsk>,
) -> Done {
  crate::users::change_password(&service.db, user_in(&user)?, &ask.current, &ask.next).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn name_route(
  State(service): State<Service>,
  Path(user): Path<String>,
  Body(ask): Body<NameAsk>,
) -> Done {
  crate::users::rename(&service.db, user_in(&user)?, &ask.name).await?;

  Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct RoomAsk {
  room: i64,
  sender: Option<i64>,
  relation: String,
}

#[derive(Deserialize)]
struct MessageAsk {
  room: i64,
  message: i64,
  relation: String,
}

#[derive(Deserialize)]
struct ObjectAsk {
  kind: String,
  object: String,
  relation: String,
  #[serde(deserialize_with = "crate::ids::user")]
  user: i32,
}

async fn room_check(State(service): State<Service>, Body(ask): Body<RoomAsk>) -> Answer<WireCheck> {
  let answer = check_room(&service.db, ask.room, ask.sender, &ask.relation).await?;

  Ok(Json(WireCheck {
    allowed: answer.allowed,
    grant: answer.grant,
    user: answer.user.map(shown),
    sender: None,
  }))
}

async fn message_check(State(service): State<Service>, Body(ask): Body<MessageAsk>) -> Answer<WireCheck> {
  let answer =
    check_message(&service.db, service.receiver.as_ref(), ask.room, ask.message, &ask.relation).await?;

  Ok(Json(WireCheck {
    allowed: answer.allowed,
    grant: answer.grant,
    user: answer.user.map(shown),
    sender: answer.sender,
  }))
}

async fn object_check(State(service): State<Service>, Body(ask): Body<ObjectAsk>) -> Answer<WireCheck> {
  let answer = check_object(&service.db, &ask.kind, &ask.object, &ask.relation, ask.user).await?;

  Ok(Json(WireCheck {
    allowed: answer.allowed,
    grant: answer.grant,
    user: None,
    sender: None,
  }))
}

#[derive(Deserialize)]
struct RoomQuery {
  room: i64,
}

async fn grants_route(
  State(service): State<Service>,
  Query(query): Query<RoomQuery>,
) -> Answer<WireGrants> {
  Ok(Json(WireGrants {
    grants: standing_in(&service.db, query.room).await?,
  }))
}

async fn grant_route(State(service): State<Service>, Body(ask): Body<GrantAsk>) -> Answer<WireGranted> {
  let granted = grant(&service.db, service.receiver.as_ref(), ask).await?;

  Ok(Json(granted))
}

async fn revoke_route(State(service): State<Service>, Body(ask): Body<RevokeAsk>) -> Answer<WireRevoked> {
  let revoked = revoke(&service.db, service.receiver.as_ref(), ask).await?;

  Ok(Json(revoked))
}

#[derive(Deserialize)]
struct UserAsk {
  #[serde(deserialize_with = "crate::ids::user")]
  user: i32,
}

#[derive(Deserialize)]
struct AdoptAsk {
  token: String,
  #[serde(deserialize_with = "crate::ids::user")]
  user: i32,
}

#[derive(Deserialize)]
struct KeyAsk {
  key: String,
}

async fn phone_make(State(service): State<Service>, Body(ask): Body<UserAsk>) -> Answer<WireMade> {
  let made = phones::make(&service.db, ask.user).await?;

  Ok(Json(WireMade {
    key: made.key,
    hash: made.hash,
  }))
}

async fn phone_adopt(State(service): State<Service>, Body(ask): Body<AdoptAsk>) -> Answer<WireAdopted> {
  Ok(Json(WireAdopted {
    hash: phones::adopt(&service.db, &ask.token, ask.user).await?,
  }))
}

async fn phone_who(State(service): State<Service>, Body(ask): Body<KeyAsk>) -> Answer<WireHolder> {
  let holder = phones::holder(&service.db, &ask.key).await?;

  Ok(Json(WireHolder {
    user: holder.user,
    name: holder.name,
    hash: holder.hash,
  }))
}

async fn phone_delete(State(service): State<Service>, Path(hash): Path<String>) -> Done {
  phones::delete(&service.db, &hash).await?;

  Ok(StatusCode::NO_CONTENT)
}

async fn holdings_route(State(service): State<Service>, Path(chat): Path<i64>) -> Answer<WireHoldings> {
  Ok(Json(WireHoldings {
    holdings: holdings::held(&service.db, chat).await?,
  }))
}

async fn render_route(
  State(service): State<Service>,
  Body(asked): Body<Map<String, Value>>,
) -> Answer<WireRendered> {
  Ok(Json(WireRendered {
    text: words::rendered(&service.db, asked, &service.names).await?,
  }))
}
