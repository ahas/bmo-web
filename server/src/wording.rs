//! The document wording files bmo-artifact reads (docs/language-pack.md, 「What other units read」): the pack's
//! parts its keys stand in, written out in each language under the groups bmo-artifact reads them by.

use serde_json::{Map, Value};

use crate::lang::{Language, words_in};

/// The name a language's file is written under: `documents.<code>.yaml`.
pub fn wording_file(language: Language) -> String {
  format!("documents.{}.yaml", language.code())
}

/// One language's file text: every part bmo-artifact's 「Wording」 table names, under its group, and nothing
/// else. A key the language's file lacks is written as the source's.
pub fn document_wording(language: Language) -> Result<String, String> {
  let parts = [
    ("archive_docs", "archive-docs", crate::part_texts!("archive-docs")),
    ("search", "search", crate::part_texts!("search")),
  ];
  let file = parts
    .into_iter()
    .map(|(group, part, texts)| (group.to_owned(), words_in(part, &texts, language)))
    .collect::<Map<String, Value>>();
  let text = serde_saphyr::to_string(&Value::Object(file))
    .map_err(|why| format!("the document wording does not write: {why}"))?;

  Ok(format!(
    "# The document wording file bmo-artifact reads, written from bmo-web's language pack ({}).\n{text}",
    language.code()
  ))
}
