//! A fixed line rendered from the server's pack (docs/boundary.md, 「Fixed lines」): a code another unit
//! answers with and the fields it carries beside it, made into the sentence a room reads.

use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Map, Value};

use crate::Refusal;
use crate::lang::LANGUAGE;
use crate::lang::chat_health::CHAT_HEALTH_WORDS;
use crate::lang::draws::DRAWS;
use crate::lang::fixed_lines::FIXED_LINES;
use crate::lang::particles::PARTICLES;
use crate::lang::roads::ROAD_WORDS;
use crate::lang::supervisors::SUPERVISOR_WORDS;
use crate::marks::fill_marks;
use crate::settings::Names;

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
  /// A code the pack holds no sentence for.
  #[serde(other)]
  Unknown,
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

/// The sentence a render request asks for: its `language`, then its code with the fields beside it. A
/// language the pack does not have and a code it holds no sentence for are refused 404; a request that does
/// not read as its code's shape, 400.
pub fn rendered(mut asked: Map<String, Value>, names: &Names) -> Result<String, Refusal> {
  let language = match asked.remove("language") {
    Some(Value::String(language)) => language,
    _ => return Err(Refusal::bad("a render request names its `language`")),
  };

  if language != LANGUAGE {
    return Err(
      Refusal::new(StatusCode::NOT_FOUND, format!("the pack has no language `{language}`"))
        .coded("unknown-language"),
    );
  }

  let code = asked.get("code").and_then(Value::as_str).unwrap_or_default().to_owned();
  let line = serde_json::from_value::<FixedLine>(Value::Object(asked))
    .map_err(|why| Refusal::bad(format!("the `{code}` line does not read: {why}")))?;

  line.text(names).ok_or_else(|| {
    Refusal::new(StatusCode::NOT_FOUND, format!("the pack holds no line for `{code}`"))
      .coded("unknown-code")
  })
}

impl FixedLine {
  /// The line's sentence, or none for a code the pack holds no sentence for.
  pub fn text(&self, names: &Names) -> Option<String> {
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
      Self::Unknown => return None,
    })
  }
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
  let words = &PARTICLES.subject;
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
