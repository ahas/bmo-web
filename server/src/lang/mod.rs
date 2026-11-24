//! The server's language pack (docs/language-pack.md): every word a person is told, one folder to a
//! language under the server's `lang/` and one YAML file in it to a part, compiled in here and imported by
//! the console's tests from the same files. Each part is read once in each language, on first use, into its
//! type, and a request reads it in the language it names.

use std::ops::Deref;
use std::sync::OnceLock;

use serde::de::DeserializeOwned;
use serde_json::Value;

pub mod account_mail;
pub mod agent_catalogue;
pub mod agents;
pub mod archive_docs;
pub mod backups;
pub mod borrow;
pub mod branch_split;
pub mod browse;
pub mod casebook;
pub mod chat_health;
pub mod chat_turn;
pub mod checkout_holds;
pub mod claude_token;
pub mod consult;
pub mod control_answers;
pub mod deployment;
pub mod dev_servers;
pub mod draws;
pub mod files;
pub mod fixed_lines;
pub mod full_suite;
pub mod gate_eval;
pub mod generation;
pub mod job_ask;
pub mod job_questions;
pub mod job_titles;
pub mod job_wait;
pub mod laya_agreement;
pub mod machine_stand_in;
pub mod memory_verbs;
pub mod models;
pub mod node_land;
pub mod nodes;
pub mod outside_hosting;
pub mod owner_sends;
pub mod particles;
pub mod process_memory;
pub mod providers;
pub mod reference_benches;
pub mod remote_browser;
pub mod remote_desktop;
pub mod resident_turn;
pub mod roads;
pub mod room_grants;
pub mod room_removal;
pub mod run_stop;
pub mod search;
pub mod secret_kinds;
pub mod sends;
pub mod sessions;
pub mod songs;
pub mod span_words;
pub mod status_line;
pub mod supervisors;
pub mod talk;
pub mod test_count;
pub mod todo_blocks;
pub mod todo_reading;
pub mod todo_verbs;
pub mod tool_calls;
pub mod tool_probe;
pub mod usage_report;
pub mod voice;
pub mod voice_script;
pub mod word_chain;
pub mod work_lines;
pub mod work_order_edits;
pub mod work_order_lines;
pub mod work_order_stops;
pub mod worker_fold;

/// One part read from its file's text. A file that does not read as its type is a fault of the build,
/// which every part's own test meets before anything runs on it.
pub fn read<T: DeserializeOwned>(file: &str, text: &str) -> T {
  serde_saphyr::from_str(text)
    .unwrap_or_else(|error| panic!("the language pack's {file} does not read: {error}"))
}

/// A language the pack holds, by the folder its files stand in. Korean is the source every other language is
/// written from key for key, and the language spoken where a request names none.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Language {
  Ko,
  En,
  Ja,
  ZhCn,
}

impl Language {
  /// Every language the pack holds, the source first, in the order a part's texts stand in.
  pub const ALL: [Self; 4] = [Self::Ko, Self::En, Self::Ja, Self::ZhCn];

  /// The language every other is written from, and the one spoken where a request names none.
  pub const SOURCE: Self = Self::Ko;

  /// The language's code, the name of its folder.
  pub const fn code(self) -> &'static str {
    match self {
      Self::Ko => "ko",
      Self::En => "en",
      Self::Ja => "ja",
      Self::ZhCn => "zh-CN",
    }
  }

  const fn place(self) -> usize {
    match self {
      Self::Ko => 0,
      Self::En => 1,
      Self::Ja => 2,
      Self::ZhCn => 3,
    }
  }

  /// The language a code names exactly, letter case aside: one of the folders.
  pub fn coded(code: &str) -> Option<Self> {
    Self::ALL.into_iter().find(|language| language.code().eq_ignore_ascii_case(code.trim()))
  }

  /// The language a BCP 47 tag asks for, by its primary subtag: Korean, Japanese and Chinese of any region or
  /// script to their folder, English to English; any other, none.
  pub fn asked(tag: &str) -> Option<Self> {
    let primary = tag.trim().split(['-', '_']).next().unwrap_or_default().to_ascii_lowercase();

    match primary.as_str() {
      "ko" => Some(Self::Ko),
      "en" => Some(Self::En),
      "ja" => Some(Self::Ja),
      "zh" => Some(Self::ZhCn),
      _ => None,
    }
  }

  /// The language an `Accept-Language` header asks for: the first of its tags the pack holds, in the order of
  /// their weights.
  pub fn accepted(header: &str) -> Option<Self> {
    let mut tags = header
      .split(',')
      .filter_map(|part| {
        let mut pieces = part.split(';');
        let tag = pieces.next()?.trim();
        let weight = pieces
          .find_map(|piece| piece.trim().strip_prefix("q="))
          .map_or(Some(1.0), |weight| weight.trim().parse::<f32>().ok())?;

        (!tag.is_empty() && weight > 0.0).then_some((tag, weight))
      })
      .collect::<Vec<_>>();

    tags.sort_by(|left, right| right.1.total_cmp(&left.1));
    tags.into_iter().find_map(|(tag, _)| Self::asked(tag))
  }
}

tokio::task_local! {
  static SPOKEN: Language;
}

/// The language the work running now speaks: the one its request named, the source where none did.
pub fn spoken() -> Language {
  SPOKEN.try_with(|language| *language).unwrap_or(Language::SOURCE)
}

/// Some work run speaking a language: every part it reads is read in that language.
pub async fn speaking<F: Future>(language: Language, work: F) -> F::Output {
  SPOKEN.scope(language, work).await
}

/// Some work run at once speaking a language, for a caller outside a task.
pub fn speaking_now<R>(language: Language, work: impl FnOnce() -> R) -> R {
  SPOKEN.sync_scope(language, work)
}

/// One part of the pack, compiled in from its file in every language and read in a language once, on first use.
/// It reads as the part in the language the work running now speaks; a key a language's file lacks reads as the
/// source's, so a key Korean gained before its translation did still says something.
pub struct Part<T> {
  file: &'static str,
  texts: [&'static str; 4],
  read: [OnceLock<T>; 4],
}

impl<T: DeserializeOwned> Part<T> {
  /// A part from its file's name and its text in every language, in the order of `Language::ALL`.
  pub const fn new(file: &'static str, texts: [&'static str; 4]) -> Self {
    Self {
      file,
      texts,
      read: [const { OnceLock::new() }; 4],
    }
  }

  /// The part in one language.
  pub fn in_language(&self, language: Language) -> &T {
    self.read[language.place()].get_or_init(|| {
      if language == Language::SOURCE {
        return read(&file_in(self.file, language), self.texts[language.place()]);
      }

      serde_json::from_value(words_in(self.file, &self.texts, language)).unwrap_or_else(|error| {
        panic!("the language pack's {} does not read: {error}", file_in(self.file, language))
      })
    })
  }
}

// A part's file as the pack names it: its language's folder, then its name.
fn file_in(file: &str, language: Language) -> String {
  format!("{}/{file}.yaml", language.code())
}

/// A part's words in one language as they stand in its files, the source's where the language's file says
/// nothing: `texts` is the part's text in every language, in the order of `Language::ALL`.
pub fn words_in(file: &str, texts: &[&str; 4], language: Language) -> Value {
  let source = Language::SOURCE;
  let mut words = read::<Value>(&file_in(file, source), texts[source.place()]);

  if language != source {
    overlaid(&mut words, read::<Value>(&file_in(file, language), texts[language.place()]));
  }

  words
}

impl<T: DeserializeOwned> Deref for Part<T> {
  type Target = T;

  fn deref(&self) -> &T {
    self.in_language(spoken())
  }
}

// The source's words with a language's laid over them, mapping by mapping: what the language says stands, and
// what it does not say stays the source's.
fn overlaid(words: &mut Value, over: Value) {
  match (words, over) {
    (Value::Object(words), Value::Object(over)) => {
      for (key, value) in over {
        match words.get_mut(&key) {
          Some(word) => overlaid(word, value),
          None => {
            words.insert(key, value);
          }
        }
      }
    }
    (words, over) if !over.is_null() => *words = over,
    _ => {}
  }
}

/// A part of the pack, compiled in from its file in every language and read in the language the work running now
/// speaks: `crate::part!(pub WORDS: Words = "word-chain");`.
#[macro_export]
macro_rules! part {
  ($vis:vis $name:ident: $type:ty = $file:literal) => {
    $vis static $name: $crate::lang::Part<$type> = $crate::lang::Part::new($file, $crate::part_texts!($file));
  };
}

/// A part's file as it is written in every language, in the order of `Language::ALL`:
/// `crate::part_texts!("search")`. The languages are named here and nowhere else on this side.
#[macro_export]
macro_rules! part_texts {
  ($file:literal) => {
    [
      include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/lang/ko/", $file, ".yaml")),
      include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/lang/en/", $file, ".yaml")),
      include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/lang/ja/", $file, ".yaml")),
      include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/lang/zh-CN/", $file, ".yaml")),
    ]
  };
}
