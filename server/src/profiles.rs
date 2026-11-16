//! A user's profile (docs/accounts.md, 「Users and senders」; docs/boundary.md, 「Users and senders」): the
//! person's name, job title and contact details an account keeps, read and written whole. Its holder or an
//! administrator keeps it; the call names the login it is made for in `Owner-Key` and `Owner-Role`, and any
//! other login is refused before a row is read or written.

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::get;
use bmo_web_client::{OWNER_KEY, OWNER_ROLE, UserProfile};

use crate::routes::{Answer, Body, user_in};
use crate::{Refusal, Service};

/// The one role that keeps any account's profile.
pub const ADMINISTRATOR: &str = "administrator";

/// Whether the call is made by the account's holder or an administrator, as the console hands on the login's
/// user and role. The key and the path are read as the same whole number the service names a user by.
fn allowed(headers: &HeaderMap, user: i32) -> Result<(), Refusal> {
  let role = headers.get(OWNER_ROLE).and_then(|value| value.to_str().ok());
  let key = headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok());

  if role == Some(ADMINISTRATOR) || key == Some(user) {
    Ok(())
  } else {
    Err(Refusal::forbidden(
      "a profile is its account's holder's or an administrator's: the call names neither",
    ))
  }
}

/// A user's profile, every field empty where the account keeps none.
async fn read(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
) -> Answer<UserProfile> {
  let user = user_in(&user)?;

  allowed(&headers, user)?;

  Ok(Json(crate::users::profile_of(&service.db, user).await?))
}

/// A user's profile written whole; the answer is the profile as it now stands.
async fn write(
  State(service): State<Service>,
  Path(user): Path<String>,
  headers: HeaderMap,
  Body(profile): Body<UserProfile>,
) -> Answer<UserProfile> {
  let user = user_in(&user)?;

  allowed(&headers, user)?;
  crate::users::set_profile(&service.db, user, &profile).await?;

  Ok(Json(crate::users::profile_of(&service.db, user).await?))
}

/// The profile's routes, mounted with the service's own.
pub fn routes() -> Router<Service> {
  Router::new().route("/users/{user}/profile", get(read).post(write))
}
