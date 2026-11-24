//! What the console shows of a talk the owner has with the chat agent (docs/web.md).

use serde::Deserialize;

/// The code review's refusals of a row filed out of it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CodeReviewWords {
  pub answering: String,
  pub worker_gone: String,
}

/// Why a document's translation stopped short.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TranslationWords {
  pub unanswered: String,
  pub stopped: String,
  pub unwritten: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TalkWords {
  pub busy: String,
  pub code_review: CodeReviewWords,
  pub seek_unanswered: String,
  pub translation: TranslationWords,
}

crate::part!(pub TALK_WORDS: TalkWords = "talk");
