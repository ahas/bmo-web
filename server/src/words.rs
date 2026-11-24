//! A fixed line rendered from the server's pack (docs/boundary.md, 「Fixed lines」): a code another unit
//! answers with and the fields it carries beside it, made into the sentence a room reads. A line naming accounts
//! names each by its shown name, read from the service's own users; a line a chat service handed over names each
//! person by the name it carries for them.

use std::collections::HashMap;

use axum::http::StatusCode;
use sea_orm::ConnectionTrait;
use serde::Deserialize;
use serde_json::{Map, Value};

use crate::lang::chat_health::CHAT_HEALTH_WORDS;
use crate::lang::draws::DRAWS;
use crate::lang::fixed_lines::FIXED_LINES;
use crate::lang::particles::{PARTICLES, Particle};
use crate::lang::roads::ROAD_WORDS;
use crate::lang::supervisors::SUPERVISOR_WORDS;
use crate::lang::{Language, speaking_now};
use crate::marks::fill_marks;
use crate::settings::Names;
use crate::{Refusal, one};

/// A fixed line as the receiver names it (its `docs/codes.md`, 「Fixed lines」): the code, with the fields it
/// carries beside it.
#[derive(Debug, Deserialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum FixedLine {
  /// A usage limit begins; the line names no time, so the `until` it carries is not read.
  RestBegins {},
  ProviderDown,
  Compacting,
  CompactFailed,
  RunBroken {
    agent: String,
    cause: Option<String>,
    record: Option<String>,
  },
  ChatDenied,
  GoingDownForUpdate {
    items: Vec<i64>,
  },
  GoingDown,
  SupervisorEngineError {
    kind: EngineError,
  },
  SupervisorCut {
    agent: String,
    reason: String,
  },
  Draw(DrawLine),
  /// A round's draft turn ran past its bound and goes on: said once in the round.
  StillWorking,
  /// The chat agent's session is replaced and its memory tidied: the room's words wait for the fresh session.
  MemoryTidying,
  /// An account let into a room in the console by another.
  AccountLetIn {
    account: AccountKey,
    by: AccountKey,
  },
  /// An account went out of a room in the console by itself.
  AccountLeft {
    account: AccountKey,
  },
  /// An account taken out of a room in the console by another.
  AccountTakenOut {
    account: AccountKey,
    by: AccountKey,
  },
  /// Several accounts let into a room in the console by another, at once.
  AccountsLetIn {
    accounts: Vec<AccountKey>,
    by: AccountKey,
  },
  /// An organisation's people let into a room in the console by another, the organisation by its name; the unit's
  /// number and the accounts let in, which it also carries, are not read.
  UnitLetIn {
    #[serde(rename = "unitName")]
    unit_name: String,
    by: AccountKey,
  },
  /// People came into a room of a chat service (bmo-chat's `docs/contract.md`, 「Lines」): `by` is given only where
  /// someone other than those who came brought them in.
  PeopleJoined {
    people: Vec<LinePerson>,
    by: Option<LinePerson>,
  },
  /// A person went out of a room of a chat service: `by` is given only where someone other than the person took
  /// them out.
  PersonLeft {
    person: LinePerson,
    by: Option<LinePerson>,
  },
  /// A person's run found no supply source left: why, as the agency names it; the moment the source reopens, which it
  /// also carries, is not read.
  SupplyClosed {
    why: SupplyShortfall,
  },
  /// An agent's session handed over or reset (the receiver's `docs/unified-bmo.md`, 「Replacing the session」): the
  /// agent by its name, the cause, the asker's words where one gave any and the account that asked where a person did.
  SessionHandedOver {
    agent: String,
    cause: SessionCause,
    reason: Option<String>,
    by: Option<AccountKey>,
  },
  /// A code the pack holds no sentence for.
  #[serde(other)]
  Unknown,
}

/// Why a person's run found no supply source left, as the agency names it (its docs/supply.md, 「Why none is left」).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SupplyShortfall {
  NoOrder,
  Withheld,
  NoPersonal,
  OwnRefused,
  NoOrganisation,
  OrganisationRefused,
  NoLendable,
  SharedNode,
  Owned,
  Refused,
  RanOut,
  /// A reason this pack holds no sentence for, said in the general sentence.
  #[serde(other)]
  Other,
}

impl SupplyShortfall {
  fn text(&self) -> String {
    let words = &FIXED_LINES.supply_closed;

    match self {
      Self::NoOrder => &words.no_order,
      Self::Withheld => &words.withheld,
      Self::NoPersonal => &words.no_personal,
      Self::OwnRefused => &words.own_refused,
      Self::NoOrganisation => &words.no_organisation,
      Self::OrganisationRefused => &words.organisation_refused,
      Self::NoLendable => &words.no_lendable,
      Self::SharedNode => &words.shared_node,
      Self::Owned => &words.owned,
      Self::Refused => &words.refused,
      Self::RanOut => &words.ran_out,
      Self::Other => &words.other,
    }
    .clone()
  }
}

/// Why a session was handed over or reset, as the receiver names it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionCause {
  Asked,
  Reset,
  Full,
  Road,
  Documents,
  /// A cause this pack holds no words for, said as the line alone.
  #[serde(other)]
  Other,
}

/// An account as a line names it: its key, a number or the decimal text of one.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum AccountKey {
  Number(i64),
  Text(String),
}

impl AccountKey {
  fn key(&self) -> Option<i64> {
    match self {
      Self::Number(key) => Some(*key),
      Self::Text(key) => key.trim().parse().ok(),
    }
  }

  // The account's shown name where the service holds one, else its key as it was given.
  fn shown(&self, accounts: &HashMap<i64, String>) -> String {
    self.key().and_then(|key| accounts.get(&key).cloned()).unwrap_or_else(|| match self {
      Self::Number(key) => key.to_string(),
      Self::Text(key) => key.clone(),
    })
  }
}

/// A person as a chat service's line names them: their number in the room's sender numbering, which is carried and
/// not read, and the name the service shows for them.
#[derive(Debug, Deserialize)]
pub struct LinePerson {
  pub name: String,
}

impl LinePerson {
  fn shown(&self) -> String {
    person_named(&self.name)
  }
}

// A person a line names, by the name they are shown by.
fn person_named(name: &str) -> String {
  fill_marks(&FIXED_LINES.person, &[("name", name)])
}

// People a line names together, each by the name they are shown by, every one named; none where it names nobody.
fn people_named<'a>(names: impl IntoIterator<Item = &'a str>) -> Option<String> {
  let named = names.into_iter().map(person_named).collect::<Vec<_>>();

  (!named.is_empty()).then(|| named.join(&FIXED_LINES.people_joiner))
}

/// How a supervisor's engine ended its turn.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EngineError {
  Busy,
  Refused,
  TooLong,
  Failed,
}

/// Everything a draw's room line carries.
#[derive(Debug, Deserialize)]
pub struct DrawLine {
  pub label: Option<String>,
  pub asked: DrawAsked,
  pub result: DrawResult,
  pub number: i64,
  pub seed: String,
  pub method: String,
  pub answered: Option<String>,
  pub next: String,
}

/// What a draw asked, by its shape.
#[derive(Debug, Deserialize)]
#[serde(tag = "shape", rename_all = "kebab-case")]
pub enum DrawAsked {
  Dice {
    count: i64,
    sides: i64,
    modifier: i64,
  },
  Range {
    min: i64,
    max: i64,
  },
  Pick {
    items: usize,
    take: i64,
  },
  Shuffle {
    items: usize,
  },
}

/// What a draw came to, by its shape.
#[derive(Debug, Deserialize)]
#[serde(tag = "shape", rename_all = "kebab-case")]
pub enum DrawResult {
  Dice { faces: Vec<i64>, total: i64 },
  Range { value: i64 },
  Pick { picked: Vec<String> },
  Shuffle { order: Vec<String> },
}

/// The sentence a render request asks for: its `language`, a language tag the pack holds a folder for by its
/// primary subtag, then its code with the fields beside it. A language the pack does not have and a code it holds
/// no sentence for are refused 404; a request that does not read as its code's shape, 400.
pub async fn rendered<C: ConnectionTrait>(
  db: &C,
  mut asked: Map<String, Value>,
  names: &Names,
) -> Result<String, Refusal> {
  let language = match asked.remove("language") {
    Some(Value::String(language)) => language,
    _ => return Err(Refusal::bad("a render request names its `language`")),
  };

  let Some(language) = Language::asked(&language) else {
    return Err(
      Refusal::new(StatusCode::NOT_FOUND, format!("the pack has no language `{language}`"))
        .coded("unknown-language"),
    );
  };

  let code = asked.get("code").and_then(Value::as_str).unwrap_or_default().to_owned();
  let line = serde_json::from_value::<FixedLine>(Value::Object(asked))
    .map_err(|why| Refusal::bad(format!("the `{code}` line does not read: {why}")))?;

  if let FixedLine::AccountsLetIn { accounts, .. } = &line
    && accounts.is_empty()
  {
    return Err(Refusal::bad(format!("the `{code}` line names no account")));
  }

  if let FixedLine::PeopleJoined { people, .. } = &line
    && people.is_empty()
  {
    return Err(Refusal::bad(format!("the `{code}` line names no person")));
  }

  let accounts = shown_names(db, &line.accounts()).await?;

  speaking_now(language, || line.text(names, &accounts)).ok_or_else(|| {
    Refusal::new(StatusCode::NOT_FOUND, format!("the pack holds no line for `{code}`"))
      .coded("unknown-code")
  })
}

/// The shown name of each account a line names, by its key: its full name where it keeps one, else its username;
/// an account the service does not hold is left out.
async fn shown_names<C: ConnectionTrait>(db: &C, keys: &[i64]) -> Result<HashMap<i64, String>, Refusal> {
  let mut named = HashMap::new();

  for key in keys {
    let Ok(user) = i32::try_from(*key) else { continue };
    let row = one(
      db,
      r#"SELECT COALESCE(NULLIF("full_name", ''), "username") AS "name" FROM "users" WHERE "id" = $1"#,
      vec![user.into()],
    )
    .await?;

    if let Some(row) = row {
      named.insert(*key, row.try_get::<String>("", "name")?);
    }
  }

  Ok(named)
}

impl FixedLine {
  /// The accounts the line names, by key.
  fn accounts(&self) -> Vec<i64> {
    match self {
      Self::AccountLetIn { account, by } | Self::AccountTakenOut { account, by } => {
        [account.key(), by.key()].into_iter().flatten().collect()
      }
      Self::AccountLeft { account } => account.key().into_iter().collect(),
      Self::AccountsLetIn { accounts, by } => {
        accounts.iter().chain([by]).filter_map(AccountKey::key).collect()
      }
      Self::UnitLetIn { by, .. } => by.key().into_iter().collect(),
      Self::SessionHandedOver { by, .. } => by.iter().filter_map(AccountKey::key).collect(),
      _ => Vec::new(),
    }
  }

  /// The line's sentence, or none for a code the pack holds no sentence for; an account it names stands as its
  /// shown name in `accounts`.
  pub fn text(&self, names: &Names, accounts: &HashMap<i64, String>) -> Option<String> {
    let health = &CHAT_HEALTH_WORDS;
    let agent_name = [("chat_agent", names.chat_agent.as_str())];

    Some(match self {
      Self::RestBegins {} => fill_marks(&FIXED_LINES.rest_begins, &agent_name),
      Self::ProviderDown => fill_marks(&health.rest.outage, &agent_name),
      Self::Compacting => health.fold.going.clone(),
      Self::CompactFailed => health.fold.failed.clone(),
      Self::RunBroken {
        agent,
        cause,
        record,
      } => run_broken(agent, cause.as_deref(), record.as_deref()),
      Self::ChatDenied => FIXED_LINES.chat_denied.clone(),
      Self::GoingDownForUpdate { items } => going_down(Some(items)),
      Self::GoingDown => going_down(None),
      Self::SupervisorEngineError { kind } => {
        let words = &SUPERVISOR_WORDS.engine_error;

        match kind {
          EngineError::Busy => words.busy.clone(),
          EngineError::Refused => words.refused.clone(),
          EngineError::TooLong => words.too_long.clone(),
          EngineError::Failed => words.failed.clone(),
        }
      }
      Self::SupervisorCut { agent, reason } => {
        fill_marks(&FIXED_LINES.supervisor_cut, &[("name", agent), ("reason", reason)])
      }
      Self::Draw(draw) => draw.text(),
      Self::StillWorking => FIXED_LINES.still_working.clone(),
      Self::MemoryTidying => FIXED_LINES.memory_tidying.clone(),
      Self::AccountLetIn { account, by } => fill_marks(
        &FIXED_LINES.account_let_in,
        &[("account", &account.shown(accounts)), ("by", &by.shown(accounts))],
      ),
      Self::AccountLeft { account } => {
        fill_marks(&FIXED_LINES.account_left, &[("account", &account.shown(accounts))])
      }
      Self::AccountTakenOut { account, by } => fill_marks(
        &FIXED_LINES.account_taken_out,
        &[("account", &account.shown(accounts)), ("by", &by.shown(accounts))],
      ),
      Self::AccountsLetIn {
        accounts: let_in,
        by,
      } => match let_in.as_slice() {
        [] => return None,
        [account] => fill_marks(
          &FIXED_LINES.account_let_in,
          &[("account", &account.shown(accounts)), ("by", &by.shown(accounts))],
        ),
        // Two are both named, as the people a chat service brought in are.
        [first, second] => fill_marks(
          &FIXED_LINES.people_joined_by,
          &[
            (
              "people",
              &people_named([first.shown(accounts).as_str(), second.shown(accounts).as_str()])?,
            ),
            ("by", &person_named(&by.shown(accounts))),
          ],
        ),
        [first, rest @ ..] => fill_marks(
          &FIXED_LINES.accounts_let_in,
          &[
            ("account", &first.shown(accounts)),
            ("others", &rest.len().to_string()),
            ("by", &by.shown(accounts)),
          ],
        ),
      },
      Self::UnitLetIn { unit_name, by, .. } => fill_marks(
        &FIXED_LINES.unit_let_in,
        &[("unit", &as_object(unit_name)), ("by", &by.shown(accounts))],
      ),
      Self::PeopleJoined { people, by } => {
        let people = people_named(people.iter().map(|person| person.name.as_str()))?;

        match by {
          None => fill_marks(&FIXED_LINES.people_joined, &[("people", &people)]),
          Some(by) => {
            fill_marks(&FIXED_LINES.people_joined_by, &[("people", &people), ("by", &by.shown())])
          }
        }
      }
      Self::PersonLeft { person, by } => match by {
        None => fill_marks(&FIXED_LINES.person_left, &[("person", &person.shown())]),
        Some(by) => {
          fill_marks(&FIXED_LINES.person_taken_out, &[("person", &person.shown()), ("by", &by.shown())])
        }
      },
      Self::SupplyClosed { why } => why.text(),
      Self::SessionHandedOver {
        agent,
        cause,
        reason,
        by,
      } => session_handed_over(agent, cause, reason.as_deref(), by.as_ref().map(|by| by.shown(accounts))),
      Self::Unknown => return None,
    })
  }
}

// An agent's session handed over or reset: the line, then the asker's words, else the words of its cause where the
// pack holds any, then who asked where a person did.
fn session_handed_over(
  agent: &str,
  cause: &SessionCause,
  reason: Option<&str>,
  by: Option<String>,
) -> String {
  let words = &FIXED_LINES.session_handed_over;
  let line = match cause {
    SessionCause::Reset => &words.reset,
    _ => &words.handed_over,
  };
  let mut text = fill_marks(line, &[("agent", agent), ("subject", &as_subject(agent))]);
  let why = reason
    .map(str::trim)
    .filter(|reason| !reason.is_empty())
    .map(str::to_owned)
    .or_else(|| match cause {
      SessionCause::Full => Some(words.causes.full.clone()),
      SessionCause::Road => Some(words.causes.road.clone()),
      SessionCause::Documents => Some(words.causes.documents.clone()),
      SessionCause::Asked | SessionCause::Reset | SessionCause::Other => None,
    });

  if let Some(why) = why {
    text.push_str(&fill_marks(&words.why, &[("why", &why)]));
  }

  if let Some(by) = by {
    text.push_str(&fill_marks(&words.by, &[("by", &by)]));
  }

  text
}

// The last resort where no session can answer an order about a broken run: the run's account, its cause
// where one was read and its record where one is kept, then why the line comes from the service itself.
fn run_broken(agent: &str, cause: Option<&str>, record: Option<&str>) -> String {
  let health = &CHAT_HEALTH_WORDS;
  let words = &health.account;
  let opening = fill_marks(&words.broke, &[("agent", agent)]);
  let cause = cause
    .map(|cause| cause.trim().trim_end_matches('.'))
    .filter(|cause| !cause.is_empty())
    .unwrap_or(&health.causes.unknown);
  let rest = record.map_or_else(String::new, |record| fill_marks(&words.record, &[("record", record)]));
  let account = fill_marks(
    &words.line,
    &[("opening", &opening), ("room", ""), ("cause", cause), ("said", ""), ("rest", &rest)],
  );
  let speaking = fill_marks(&health.last_resort.speaking, &[("subject", &as_subject(agent))]);

  format!("{}\n{speaking}", account.trim_end())
}

// The service's notice as it stops: for a deployment, with the items going live where it named any, and for a
// restart no deployment announced.
fn going_down(items: Option<&[i64]>) -> String {
  let words = &ROAD_WORDS.service;
  let line = match items {
    None => words.stopping.restarting.clone(),
    Some(items) => {
      let named = if items.is_empty() {
        String::new()
      } else {
        let items = items.iter().map(|item| format!("#{item}")).collect::<Vec<_>>().join(", ");

        fill_marks(&words.stopping.items, &[("items", &items)])
      };

      fill_marks(&words.stopping.deploying, &[("items", &named)])
    }
  };

  format!("{} {line}", words.mark)
}

impl DrawLine {
  /// The line a draw posts into a room: plain text a person can check the draw from, with the whole seed and
  /// both commitments.
  pub fn text(&self) -> String {
    let line = &DRAWS.line;
    let head = match &self.label {
      None => line.head.clone(),
      Some(label) => fill_marks(&line.labelled, &[("label", label)]),
    };

    [
      fill_marks(&line.asked, &[("head", &head), ("asked", &self.asked.text())]),
      fill_marks(&line.result, &[("result", &self.result.text())]),
      fill_marks(&line.draw, &[("number", &self.number.to_string()), ("seed", &self.seed)]),
      fill_marks(&line.method, &[("method", &self.method)]),
      self.answered.as_ref().map_or_else(
        || line.first.clone(),
        |commitment| fill_marks(&line.answered, &[("commitment", commitment)]),
      ),
      fill_marks(&line.next, &[("next", &self.next)]),
    ]
    .join("\n")
  }
}

impl DrawAsked {
  /// What was asked, in the room's words.
  pub fn text(&self) -> String {
    let words = &DRAWS.spec;

    match self {
      Self::Dice {
        count,
        sides,
        modifier,
      } => {
        let modifier = match modifier.signum() {
          0 => String::new(),
          1 => format!(" + {modifier}"),
          _ => format!(" - {}", -modifier),
        };

        fill_marks(
          &words.dice,
          &[("sides", &sides.to_string()), ("count", &count.to_string()), ("modifier", &modifier)],
        )
      }
      Self::Range { min, max } => {
        fill_marks(&words.range, &[("min", &min.to_string()), ("max", &max.to_string())])
      }
      Self::Pick { items, take } => {
        fill_marks(&words.pick, &[("items", &items.to_string()), ("take", &take.to_string())])
      }
      Self::Shuffle { items } => fill_marks(&words.shuffle, &[("items", &items.to_string())]),
    }
  }
}

impl DrawResult {
  /// What came out, in the room's words: one die alone as its face, more dice or a modifier as each face and
  /// the total.
  pub fn text(&self) -> String {
    match self {
      Self::Dice { faces, total } if faces.len() == 1 && faces[0] == *total => total.to_string(),
      Self::Dice { faces, total } => {
        let faces = faces.iter().map(i64::to_string).collect::<Vec<_>>().join(", ");

        fill_marks(&DRAWS.dice_total, &[("faces", &faces), ("total", &total.to_string())])
      }
      Self::Range { value } => value.to_string(),
      Self::Pick { picked } => picked.join(", "),
      Self::Shuffle { order } => order
        .iter()
        .enumerate()
        .map(|(at, item)| format!("{}. {item}", at + 1))
        .collect::<Vec<_>>()
        .join(" / "),
    }
  }
}

/// A name with its subject particle from the pack, chosen by whether the name's last sound closes on a
/// consonant; both particles where its spelling does not say.
pub fn as_subject(name: &str) -> String {
  with_particle(name, &PARTICLES.subject)
}

/// A name with the object particle its last sound takes.
pub fn as_object(name: &str) -> String {
  with_particle(name, &PARTICLES.object)
}

fn with_particle(name: &str, words: &Particle) -> String {
  let particle = match final_sound(name) {
    Some(false) => &words.open,
    Some(true) => &words.closed,
    None => &words.unknown,
  };

  format!("{name}{particle}")
}

// The first and last Hangul syllables as code points, and how many finals each initial and medial pair
// runs through.
const SYLLABLES: std::ops::RangeInclusive<u32> = 0xAC00..=0xD7A3;
const FINALS: u32 = 28;

// Whether a name's last sound closes on a consonant, past any closing bracket or quotation mark: a Hangul
// syllable by its own final, a figure as it is read aloud, and anything else unknown.
fn final_sound(name: &str) -> Option<bool> {
  let last = name
    .trim_end_matches([
      ')', ']', '}', '\u{300D}', '\u{300F}', '"', '\'', '\u{201D}', '\u{2019}', '\u{300B}', '\u{3009}',
    ])
    .chars()
    .last()?;

  match last {
    syllable if SYLLABLES.contains(&(syllable as u32)) => {
      Some(!(syllable as u32 - *SYLLABLES.start()).is_multiple_of(FINALS))
    }
    '0' | '1' | '3' | '6' | '7' | '8' => Some(true),
    '0'..='9' => Some(false),
    _ => None,
  }
}
