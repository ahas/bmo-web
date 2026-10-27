//! The rooms the console has open (docs/web.md, 「Notifications」; docs/boundary.md, 「What the server serves」): the
//! console server reports the visible room of every open tab, and the receiver reads the set as the serving path
//! hands a restarted agent the rooms it is waiting on. The report is good for a short while: a console that dies
//! stops refreshing it and the rooms fall away.

use std::sync::{Arc, Mutex};

use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};

use crate::{Refusal, Service, now_ms};

/// How long a report stands: a console reports every few seconds, and one quiet for this long is gone.
pub const STALE_MS: i64 = 120_000;

/// The rooms the console last reported open.
#[derive(Debug, Default)]
pub struct Watching {
  rooms: Vec<i64>,
  at: Option<i64>,
}

impl Watching {
  /// The rooms of `rooms`, sorted and without a repeat, kept as the set now.
  pub fn put(&mut self, rooms: Vec<i64>) {
    let mut rooms: Vec<i64> = rooms.into_iter().filter(|room| *room != 0).collect();

    rooms.sort_unstable();
    rooms.dedup();
    self.rooms = rooms;
    self.at = Some(now_ms());
  }

  /// The rooms standing now, and when they were reported; none where the report is stale.
  pub fn standing(&self) -> (Vec<i64>, Option<i64>) {
    match self.at {
      Some(at) if now_ms() - at <= STALE_MS => (self.rooms.clone(), Some(at)),
      _ => (vec![], self.at),
    }
  }
}

/// The rooms a console reports open.
#[derive(Debug, Deserialize)]
pub struct Ask {
  #[serde(default)]
  pub rooms: Vec<i64>,
}

/// The rooms open, and when the console last said so.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
  pub rooms: Vec<i64>,
  pub at: Option<i64>,
}

/// `PUT /watching`: the console's visible rooms as it now has them.
pub async fn put(State(service): State<Service>, Json(ask): Json<Ask>) -> Result<Json<Answer>, Refusal> {
  let mut watching = service.watching.lock().unwrap_or_else(std::sync::PoisonError::into_inner);

  watching.put(ask.rooms);

  let (rooms, at) = watching.standing();

  Ok(Json(Answer { rooms, at }))
}

/// `GET /watching`: the rooms open now, for the receiver.
pub async fn get(State(service): State<Service>) -> Result<Json<Answer>, Refusal> {
  let watching = service.watching.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
  let (rooms, at) = watching.standing();

  Ok(Json(Answer { rooms, at }))
}

/// The state one service keeps, made once as it stands.
pub fn state() -> Arc<Mutex<Watching>> {
  Arc::new(Mutex::new(Watching::default()))
}
