//! Desktop pairing (docs/accounts.md, 「Desktop pairing」; docs/boundary.md, 「Desktop pairing」): the console's
//! desktop app asks for a pairing with no sign-in, a signed-in person approves it for their own machine, and the
//! app reads the machine and its credential once. Pairings are held in memory alone, and a pairing holds the
//! approving user and their machine's name, never a credential: the credential is made at the one read.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use axum::Json;
use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use bmo_web_client::{
  NodeBinding, OWNER_KEY, PairingApproved, PairingCredential, PairingMade, PairingView,
};
use rand::{Rng, RngCore};
use sea_orm::ConnectionTrait;

use crate::invites::node_of;
use crate::machines::rebind;
use crate::nodes::Nodes;
use crate::routes::Answer;
use crate::{Refusal, Service, now_ms};

/// How long a pairing stands open.
pub const LIFETIME_MS: i64 = 10 * 60_000;
/// How long a refused or expired pairing goes on answering that it is closed before it is forgotten.
const KEPT_CLOSED_MS: i64 = 10 * 60_000;
/// How many pairings one address may ask within one lifetime.
pub const PER_ADDRESS: usize = 10;
/// How many pairings may wait at once, across every address.
pub const MOST_WAITING: usize = 1000;
/// How long the app waits between reads.
const POLL_AFTER_SECONDS: u32 = 3;
/// The letters a code is made of: no 0, 1, I or O, which read as one another.
const CODE_LETTERS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH: usize = 8;

/// Where the service reads the time from, in epoch milliseconds.
pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/desktop/pairings", post(ask_route))
    .route("/desktop/pairings/{pairing}", get(read_route))
    .route("/desktop/pairings/code/{code}", get(view_route))
    .route("/desktop/pairings/code/{code}/approve", post(approve_route))
    .route("/desktop/pairings/code/{code}/refuse", post(refuse_route))
}

#[derive(Clone, PartialEq, Eq)]
enum Stage {
  Waiting,
  /// A person's approval is being written; nobody else may approve or refuse it meanwhile.
  Approving,
  Approved {
    user: i32,
    agent: String,
  },
  Refused {
    at: i64,
  },
}

struct Pending {
  code: String,
  expires_at: i64,
  stage: Stage,
}

/// Where a pairing stands at a moment.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Standing {
  Waiting,
  Approved,
  Refused,
  Expired,
}

impl Standing {
  fn word(self) -> &'static str {
    match self {
      Standing::Waiting => "waiting",
      Standing::Approved => "approved",
      Standing::Refused => "refused",
      Standing::Expired => "expired",
    }
  }
}

impl Pending {
  fn state(&self, now: i64) -> Standing {
    match &self.stage {
      Stage::Refused { .. } => Standing::Refused,
      // An approval being written is let finish; it is read as expired once it is done.
      Stage::Approving => Standing::Waiting,
      _ if now >= self.expires_at => Standing::Expired,
      Stage::Waiting => Standing::Waiting,
      Stage::Approved { .. } => Standing::Approved,
    }
  }

  /// When it stopped being answerable as more than closed.
  fn closed_at(&self) -> i64 {
    match self.stage {
      Stage::Refused { at } => at.min(self.expires_at),
      _ => self.expires_at,
    }
  }

  fn forgotten(&self, now: i64) -> bool {
    self.stage != Stage::Approving && now >= self.closed_at() + KEPT_CLOSED_MS
  }
}

#[derive(Default)]
struct Book {
  by_id: HashMap<String, Pending>,
  /// The pairing a code names, by the code written without its dash.
  by_code: HashMap<String, String>,
  /// When each address asked, within the last lifetime.
  asked: HashMap<String, VecDeque<i64>>,
}

impl Book {
  fn sweep(&mut self, now: i64) {
    let forgotten: Vec<String> = self
      .by_id
      .iter()
      .filter(|(_, pending)| pending.forgotten(now))
      .map(|(id, _)| id.clone())
      .collect();

    for id in forgotten {
      self.forget(&id);
    }

    self.asked.retain(|_, times| {
      while times.front().is_some_and(|at| now - at >= LIFETIME_MS) {
        times.pop_front();
      }
      !times.is_empty()
    });
  }

  fn forget(&mut self, id: &str) {
    if let Some(pending) = self.by_id.remove(id) {
      self.by_code.remove(&pending.code);
    }
  }

  fn by_code(&mut self, code: &str) -> Result<&mut Pending, Refusal> {
    let id = self.by_code.get(&code_key(code)).ok_or_else(no_code)?;

    self.by_id.get_mut(id).ok_or_else(no_code)
  }
}

/// What the app's read of a pairing found.
pub enum Taken {
  Waiting,
  Approved { user: i32, agent: String },
}

/// The pairings that stand now, in the service's memory alone.
pub struct Pairings {
  book: Mutex<Book>,
  clock: Clock,
}

impl Default for Pairings {
  fn default() -> Self {
    Self::new(Arc::new(now_ms))
  }
}

fn closed() -> Refusal {
  Refusal::new(StatusCode::GONE, "the pairing is approved, refused or expired").coded("pairing-closed")
}

fn no_code() -> Refusal {
  Refusal::absent("no pairing has this code")
}

/// A code as it is kept: its letters alone, upper case, with no dash or space.
fn code_key(code: &str) -> String {
  code
    .chars()
    .filter(|c| c.is_ascii_alphanumeric())
    .collect::<String>()
    .to_ascii_uppercase()
}

/// A code as a person reads it, in two groups of four.
fn code_shown(key: &str) -> String {
  let (first, second) = key.split_at(key.len() / 2);

  format!("{first}-{second}")
}

fn fresh_code() -> String {
  let mut rng = rand::rng();

  (0..CODE_LENGTH)
    .map(|_| char::from(CODE_LETTERS[rng.random_range(0..CODE_LETTERS.len())]))
    .collect()
}

fn fresh_id() -> String {
  let mut bytes = [0u8; 32];

  rand::rng().fill_bytes(&mut bytes);
  bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

impl Pairings {
  /// Pairings reading the time from `clock`.
  pub fn new(clock: Clock) -> Self {
    Self {
      book: Mutex::new(Book::default()),
      clock,
    }
  }

  fn book(&self) -> (std::sync::MutexGuard<'_, Book>, i64) {
    let now = (self.clock)();
    let mut book = self.book.lock().unwrap_or_else(std::sync::PoisonError::into_inner);

    book.sweep(now);
    (book, now)
  }

  /// A pairing asked from `address`, refused past the address's share or the pairings waiting in all.
  pub fn ask(&self, address: &str) -> Result<PairingMade, Refusal> {
    let (mut book, now) = self.book();
    let waiting = book.by_id.values().filter(|pending| pending.state(now) == Standing::Waiting).count();
    let asked = book.asked.get(address).map_or(0, VecDeque::len);

    if asked >= PER_ADDRESS || waiting >= MOST_WAITING {
      return Err(
        Refusal::new(StatusCode::TOO_MANY_REQUESTS, "too many pairings were asked; ask again later")
          .coded("too-many-pairings"),
      );
    }

    let code = loop {
      let code = fresh_code();

      if !book.by_code.contains_key(&code) {
        break code;
      }
    };
    let id = fresh_id();
    let expires_at = now + LIFETIME_MS;

    book.asked.entry(address.to_owned()).or_default().push_back(now);
    book.by_code.insert(code.clone(), id.clone());
    book.by_id.insert(
      id.clone(),
      Pending {
        code: code.clone(),
        expires_at,
        stage: Stage::Waiting,
      },
    );

    Ok(PairingMade {
      pairing: id,
      code: code_shown(&code),
      expires_at,
      poll_after_seconds: POLL_AFTER_SECONDS,
    })
  }

  /// A pairing as `reader` reads it by its code; `bound` is the machine the reader's account is bound to.
  pub fn view(&self, code: &str, reader: i32, bound: Option<String>) -> Result<PairingView, Refusal> {
    let (mut book, now) = self.book();
    let pending = book.by_code(code)?;
    let state = pending.state(now);
    let machine = match (&pending.stage, state) {
      (_, Standing::Waiting) => bound,
      (Stage::Approved { user, agent }, Standing::Approved) if *user == reader => Some(agent.clone()),
      _ => None,
    };

    Ok(PairingView {
      code: code_shown(&pending.code),
      expires_at: pending.expires_at,
      state: state.word().to_owned(),
      machine,
    })
  }

  /// The pairing held for one approver while their binding is written; closed to everyone else meanwhile.
  fn begin_approval(&self, code: &str) -> Result<(), Refusal> {
    let (mut book, now) = self.book();
    let pending = book.by_code(code)?;

    if pending.stage != Stage::Waiting || pending.state(now) != Standing::Waiting {
      return Err(closed());
    }

    pending.stage = Stage::Approving;
    Ok(())
  }

  /// The approval written: the pairing approved for `approved`, or waiting again where it was not written.
  fn finish_approval(&self, code: &str, approved: Option<(i32, String)>) -> Result<(), Refusal> {
    let (mut book, now) = self.book();
    let pending = book.by_code(code)?;

    pending.stage = match approved {
      Some((user, agent)) => Stage::Approved { user, agent },
      None => Stage::Waiting,
    };

    if pending.state(now) == Standing::Expired { Err(closed()) } else { Ok(()) }
  }

  /// A pairing refused by a signed-in person.
  pub fn refuse(&self, code: &str) -> Result<(), Refusal> {
    let (mut book, now) = self.book();
    let pending = book.by_code(code)?;

    if pending.stage != Stage::Waiting || pending.state(now) != Standing::Waiting {
      return Err(closed());
    }

    pending.stage = Stage::Refused { at: now };
    Ok(())
  }

  /// The app's read: an approved pairing is taken away as it is read, so it is answered once.
  pub fn take(&self, pairing: &str) -> Result<Taken, Refusal> {
    let (mut book, now) = self.book();
    let pending = book.by_id.get(pairing).ok_or_else(|| Refusal::absent("no pairing has this id"))?;

    match (pending.state(now), pending.stage.clone()) {
      (Standing::Waiting, _) => Ok(Taken::Waiting),
      (Standing::Approved, Stage::Approved { user, agent }) => {
        book.forget(pairing);
        Ok(Taken::Approved { user, agent })
      }
      _ => Err(closed()),
    }
  }

  /// A pairing approved by `user` for their machine: the one their account is bound to, or a fresh binding made as
  /// the administrator's rebind makes one where it is bound to none.
  pub async fn approve<C: ConnectionTrait>(
    &self,
    db: &C,
    nodes: &Nodes,
    code: &str,
    user: i32,
  ) -> Result<PairingApproved, Refusal> {
    self.begin_approval(code)?;

    let machine = machine_of(db, nodes, user).await;
    let approved = machine.as_ref().ok().map(|agent| (user, agent.clone()));
    let finished = self.finish_approval(code, approved);
    let machine = machine?;

    finished?;
    Ok(PairingApproved { machine })
  }

  /// The app's read answered: the credential made now for the machine approved, where the approver's account is
  /// still bound to it.
  pub async fn read<C: ConnectionTrait>(
    &self,
    db: &C,
    nodes: &Nodes,
    pairing: &str,
  ) -> Result<Option<PairingCredential>, Refusal> {
    let Taken::Approved { user, agent } = self.take(pairing)? else {
      return Ok(None);
    };
    let node = node_of(db, None, user).await?;

    if node.left || node.agent.as_deref() != Some(agent.as_str()) {
      return Err(closed());
    }

    Ok(Some(PairingCredential {
      credential: nodes.credential(&agent),
      node: agent,
      hub_url: nodes.hub_url.clone(),
    }))
  }
}

/// The machine a pairing approved by `user` is for.
async fn machine_of<C: ConnectionTrait>(db: &C, nodes: &Nodes, user: i32) -> Result<String, Refusal> {
  let node = node_of(db, None, user).await?;

  if node.left {
    return Err(
      Refusal::new(StatusCode::CONFLICT, "the account has left, so it is bound to no machine")
        .coded("left"),
    );
  }

  match node.agent {
    Some(agent) => Ok(agent),
    None => Ok(rebind(db, nodes, user, &NodeBinding::default()).await?.agent),
  }
}

/// The signed-in person the console names.
fn reader(headers: &HeaderMap) -> Result<i32, Refusal> {
  headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.parse::<i32>().ok())
    .ok_or_else(|| Refusal::forbidden("a pairing is answered by a signed-in user, and the call names none"))
}

fn hub(service: &Service) -> Result<&Nodes, Refusal> {
  service.nodes.as_deref().ok_or_else(|| {
    Refusal::new(StatusCode::SERVICE_UNAVAILABLE, "no jake hub is set, so no machine can be paired")
      .coded("no-hub")
  })
}

async fn ask_route(
  State(service): State<Service>,
  headers: HeaderMap,
) -> Result<(StatusCode, Json<PairingMade>), Refusal> {
  hub(&service)?;
  let address = headers.get("x-real-ip").and_then(|value| value.to_str().ok()).unwrap_or("").trim();

  Ok((StatusCode::CREATED, Json(service.pairings.ask(address)?)))
}

async fn read_route(
  State(service): State<Service>,
  Path(pairing): Path<String>,
) -> Result<Response, Refusal> {
  let nodes = hub(&service)?;

  Ok(match service.pairings.read(&service.db, nodes, &pairing).await? {
    Some(credential) => Json(credential).into_response(),
    None => StatusCode::ACCEPTED.into_response(),
  })
}

async fn view_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(code): Path<String>,
) -> Answer<PairingView> {
  let user = reader(&headers)?;
  let bound = node_of(&service.db, None, user).await?.agent;

  Ok(Json(service.pairings.view(&code, user, bound)?))
}

async fn approve_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(code): Path<String>,
) -> Answer<PairingApproved> {
  let user = reader(&headers)?;
  let nodes = hub(&service)?;

  Ok(Json(service.pairings.approve(&service.db, nodes, &code, user).await?))
}

async fn refuse_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(code): Path<String>,
) -> Result<StatusCode, Refusal> {
  reader(&headers)?;
  service.pairings.refuse(&code)?;

  Ok(StatusCode::NO_CONTENT)
}
