//! The committed OpenAPI document is the one the code generates.

use std::path::PathBuf;

fn document() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/openapi-accounts.json")
}

#[test]
fn the_kept_document_is_the_one_the_code_generates() {
  let kept = std::fs::read_to_string(document()).expect("docs/openapi-accounts.json is committed");
  let made = bmo_web_client::openapi_json();

  assert_eq!(
    kept, made,
    "docs/openapi-accounts.json differs from the document the code generates: run \
     `cargo run -p bmo-web-client --example openapi > docs/openapi-accounts.json`"
  );
}
