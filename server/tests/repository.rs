//! Checks that stand beside the console's code and the account service's crate, which the repository-wide
//! sweeps (the quick checks and `tests/literals.rs`) judge over the whole tree in their own way: what a console
//! file may import, how it may assert, and where a test file may stand. It is a module of the account
//! service's test harness, which is where the console's own checks run.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::process::Command;

/// The repository's root, the folder above the server's crate.
fn root() -> &'static Path {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("the server's crate stands in the repository")
}

/// The only `bmo-*` packages the console may import (docs/boundary.md): the base libraries and the published
/// clients of the units the console calls, the agency among them.
const ALLOWED: [&str; 7] = [
  "bmo-chat",
  "bmo-chat-client",
  "bmo-ui",
  "bmo-text",
  "@agency/client",
  "bmo-job-client",
  "@bmo/receiver-client",
];

/// Every file git tracks or would track: the committed ones and the new ones it does not ignore.
fn tracked() -> Vec<String> {
  let output = Command::new("git")
    .args(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .current_dir(root())
    .output()
    .expect("git lists the files");

  assert!(
    output.status.success(),
    "git ls-files failed: {}",
    String::from_utf8_lossy(&output.stderr)
  );

  String::from_utf8(output.stdout)
    .expect("the paths are text")
    .split('\0')
    .filter(|path| !path.is_empty() && root().join(path).is_file())
    .map(str::to_owned)
    .collect()
}

/// The tracked files that read as text, with their text.
fn tracked_texts() -> Vec<(String, String)> {
  tracked()
    .into_iter()
    .filter_map(|path| fs::read_to_string(root().join(&path)).ok().map(|text| (path, text)))
    .collect()
}

/// Each package a console file imports by name: what a `from "…"`, an `import("…")` or a `require("…")` names,
/// cut to its package.
fn console_imports(text: &str) -> BTreeSet<String> {
  let mut imported = BTreeSet::new();

  for marker in ["from \"", "from '", "import(\"", "import('", "require(\"", "require('"] {
    for (at, _) in text.match_indices(marker) {
      let rest = &text[at + marker.len()..];
      let specifier: String =
        rest.chars().take_while(|character| *character != '"' && *character != '\'').collect();
      let mut parts = specifier.split('/');
      let first = parts.next().unwrap_or_default();
      let package = if first.starts_with('@') {
        format!("{first}/{}", parts.next().unwrap_or_default())
      } else {
        first.to_owned()
      };

      imported.insert(package);
    }
  }

  imported.insert(String::new());
  imported.remove("");
  imported
}

#[test]
fn no_console_file_imports_another_units_package() {
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, _)| {
      path.starts_with("client/")
        && !path.starts_with("client/vendor/")
        && [".ts", ".tsx", ".vue", ".js", ".mjs"].iter().any(|end| path.ends_with(end))
    })
    .flat_map(|(path, text)| {
      console_imports(&text)
        .into_iter()
        .filter(|name| {
          (name.starts_with("bmo-") || name.starts_with("@bmo/")) && !ALLOWED.contains(&name.as_str())
        })
        .map(move |name| format!("{path} imports {name}"))
        .collect::<Vec<_>>()
    })
    .collect();

  assert!(found.is_empty(), "console files importing another unit's package: {found:#?}");
}

/// Whether a line asserts a value through `unknown` into another type.
fn asserts_through_unknown(line: &str) -> bool {
  line
    .split_whitespace()
    .collect::<Vec<_>>()
    .windows(3)
    .any(|words| words == ["as", "unknown", "as"])
}

#[test]
fn no_console_file_asserts_through_unknown() {
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, _)| {
      path.starts_with("client/")
        && !path.starts_with("client/vendor/")
        && [".ts", ".tsx", ".vue", ".js", ".mjs"].iter().any(|end| path.ends_with(end))
    })
    .flat_map(|(path, text)| {
      text
        .lines()
        .enumerate()
        .filter(|(_, line)| asserts_through_unknown(line))
        .map(|(number, _)| format!("{path}:{}", number + 1))
        .collect::<Vec<_>>()
    })
    .collect();

  assert!(found.is_empty(), "console files asserting through unknown: {found:#?}");
}

#[test]
fn no_test_stands_inside_src_or_beside_its_code() {
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, text)| {
      // The account service's and console's own rule; the agency part keeps its tests in the root harness.
      let ours = path.starts_with("server/") || path.starts_with("client/");
      let in_src = path.split('/').any(|part| part == "src");
      let test_file = path.contains(".test.") || path.contains(".spec.") || path.ends_with("_test.rs");
      let test_module =
        path.ends_with(".rs") && in_src && (text.contains("#[cfg(test)]") || text.contains("#[test]"));
      let outside_tests = !path.split('/').any(|part| part == "tests");

      ours && (test_module || (test_file && outside_tests))
    })
    .map(|(path, _)| path)
    .collect();

  assert!(found.is_empty(), "tests outside a tests folder: {found:#?}");
}
