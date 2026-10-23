//! Checks that span the repository (docs/checks.md): what its packages and its code may depend on, that no code or
//! test holds Korean, its layout, that no tracked file matches a personal-data pattern or holds a name the list
//! kept outside the repository gives. It is a test target of the server's crate, since the repository's root is a
//! workspace and holds no package.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use std::process::Command;

use regex::Regex;
use serde_json::Value;

/// The repository's root, the folder above the server's crate.
fn root() -> &'static Path {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("the server's crate stands in the repository")
}

/// The only `bmo-*` packages anything here may depend on: the base libraries and the published clients of the
/// units the console calls (docs/boundary.md).
const ALLOWED: [&str; 6] = [
  "bmo-chat",
  "bmo-chat-client",
  "bmo-ui",
  "@agency/client",
  "bmo-job-client",
  "@bmo/receiver-client",
];

/// The server's own crate, which its binary and its tests import by name.
const OWN_CRATE: &str = "bmo_web_server";

/// The service's own client crate, which the server's handlers answer with.
const OWN_CLIENT: &str = "bmo_web_client";
const OWN_CLIENT_PACKAGE: &str = "bmo-web-client";

/// The variable naming the file of names no tracked file may hold. No repository keeps such a list, so it is read
/// from outside the checkout.
const NAMES_LIST: &str = "BMO_NAMES_LIST";

/// The files that declare a package or a project to a build tool, none of which stands at the root but Cargo's.
const MANIFESTS: [&str; 12] = [
  "package.json",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "deno.json",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "pom.xml",
  "build.gradle",
];

/// The places Korean may stand as data: the language packs, the console's data file and the tests' fixtures.
const KOREAN_DATA: [&str; 4] = [
  "server/lang/",
  "client/apps/web/i18n/",
  "client/tests/fixtures/",
  "server/tests/fixtures/",
];

/// The endings of code and test files.
const CODE: [&str; 11] =
  [".rs", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".vue", ".sh", ".py", ".toml", ".service"];

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

fn is_hangul(character: char) -> bool {
  matches!(character as u32, 0x1100..=0x11FF | 0x3130..=0x318F | 0xA960..=0xA97F | 0xAC00..=0xD7AF | 0xD7B0..=0xD7FF | 0xFFA0..=0xFFDC)
}

/// Each `bmo-*` name a package manifest of the console depends on.
fn console_dependencies(manifest: &Value) -> Vec<String> {
  ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
    .iter()
    .filter_map(|table| manifest.get(table).and_then(Value::as_object))
    .flat_map(|table| table.keys().cloned())
    .filter(|name| name.starts_with("bmo-") || name.starts_with("@bmo/"))
    .collect()
}

#[test]
fn no_package_depends_on_another_units_package() {
  let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_owned());
  let output = Command::new(cargo)
    .args(["metadata", "--no-deps", "--format-version", "1", "--offline"])
    .current_dir(root())
    .output()
    .expect("cargo metadata runs");

  assert!(
    output.status.success(),
    "cargo metadata failed: {}",
    String::from_utf8_lossy(&output.stderr)
  );

  let metadata: Value = serde_json::from_slice(&output.stdout).expect("cargo metadata answers JSON");
  let mut found: Vec<String> = metadata["packages"]
    .as_array()
    .expect("the workspace has packages")
    .iter()
    .flat_map(|package| {
      let name = package["name"].as_str().unwrap_or_default().to_owned();

      package["dependencies"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|dependency| dependency["name"].as_str())
        .filter(|dependency| {
          dependency.starts_with("bmo-")
            && *dependency != OWN_CLIENT_PACKAGE
            && !ALLOWED.contains(dependency)
        })
        .map(move |dependency| format!("{name} depends on {dependency}"))
        .collect::<Vec<_>>()
    })
    .collect();

  for path in tracked().iter().filter(|path| path.ends_with("package.json")) {
    let manifest: Value =
      serde_json::from_str(&fs::read_to_string(root().join(path)).expect("a manifest reads"))
        .unwrap_or_else(|why| panic!("{path} is not JSON: {why}"));

    found.extend(
      console_dependencies(&manifest)
        .into_iter()
        .filter(|name| !ALLOWED.contains(&name.as_str()))
        .map(|name| format!("{path} depends on {name}")),
    );
  }

  assert!(found.is_empty(), "dependencies on another unit's package: {found:#?}");
}

/// The crate a Rust path names first, where it is a `bmo_` crate: what follows `use `, `extern crate ` or stands
/// before `::` at the start of a path.
fn bmo_crates_named(text: &str) -> BTreeSet<String> {
  let mut named = BTreeSet::new();

  for (at, _) in text.match_indices("bmo_") {
    let before = text[..at].chars().next_back();

    if before.is_some_and(|character| character.is_alphanumeric() || character == '_') {
      continue;
    }

    let name: String = text[at..]
      .chars()
      .take_while(|character| character.is_alphanumeric() || *character == '_')
      .collect();

    if text[at + name.len()..].starts_with("::") {
      named.insert(name);
    }
  }

  named
}

#[test]
fn no_rust_code_names_another_units_crate() {
  let allowed: Vec<String> = ALLOWED
    .iter()
    .map(|name| name.replace('-', "_"))
    .chain([OWN_CRATE.to_owned(), OWN_CLIENT.to_owned()])
    .collect();
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, _)| path.ends_with(".rs"))
    .flat_map(|(path, text)| {
      bmo_crates_named(&text)
        .into_iter()
        .filter(|name| !allowed.contains(name))
        .map(move |name| format!("{path} names {name}"))
        .collect::<Vec<_>>()
    })
    .collect();

  assert!(found.is_empty(), "Rust code naming another unit's crate: {found:#?}");
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

  imported
}

#[test]
fn no_console_file_imports_another_units_package() {
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, _)| {
      path.starts_with("client/")
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

#[test]
fn no_code_or_test_holds_korean_and_the_ledger_stays_empty() {
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, _)| {
      CODE.iter().any(|end| path.ends_with(end)) && !KOREAN_DATA.iter().any(|place| path.starts_with(place))
    })
    .flat_map(|(path, text)| {
      text
        .lines()
        .enumerate()
        .filter(|(_, line)| line.chars().any(is_hangul))
        .map(|(number, _)| format!("{path}:{}", number + 1))
        .collect::<Vec<_>>()
    })
    .collect();

  assert!(found.is_empty(), "Korean in code or tests: {found:#?}");

  let ledger: Value =
    serde_json::from_str(&fs::read_to_string(root().join("korean-ledger.json")).expect("the ledger reads"))
      .expect("the ledger is JSON");

  assert_eq!(ledger, serde_json::json!({}), "the Korean ledger allows no file any Korean");
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
fn no_directory_is_named_after_its_parent() {
  let found: BTreeSet<String> = tracked()
    .into_iter()
    .flat_map(|path| {
      let parts: Vec<&str> = path.split('/').collect();
      let folders = &parts[..parts.len() - 1];

      folders
        .windows(2)
        .enumerate()
        .filter(|(_, pair)| pair[0] == pair[1])
        .map(|(at, _)| folders[..at + 2].join("/"))
        .collect::<Vec<_>>()
    })
    .collect();

  assert!(found.is_empty(), "directories named after their parent: {found:#?}");
}

#[test]
fn the_root_holds_cargos_manifest_alone() {
  let found: Vec<String> = tracked()
    .into_iter()
    .filter(|path| !path.contains('/') && MANIFESTS.contains(&path.as_str()))
    .collect();

  assert!(found.is_empty(), "manifests at the root: {found:?}");
  assert!(root().join("Cargo.toml").is_file(), "the root holds the Cargo workspace's manifest");
}

#[test]
fn no_test_stands_inside_src_or_beside_its_code() {
  let found: Vec<String> = tracked_texts()
    .into_iter()
    .filter(|(path, text)| {
      let in_src = path.split('/').any(|part| part == "src");
      let test_file = path.contains(".test.") || path.contains(".spec.") || path.ends_with("_test.rs");
      let test_module =
        path.ends_with(".rs") && in_src && (text.contains("#[cfg(test)]") || text.contains("#[test]"));
      let outside_tests = !path.split('/').any(|part| part == "tests");

      test_module || (test_file && outside_tests)
    })
    .map(|(path, _)| path)
    .collect();

  assert!(found.is_empty(), "tests outside a tests folder: {found:#?}");
}

/// A list of the names file, under `key`; none where the file names none.
fn names_list(names: &toml::Table, from: &str, key: &str) -> Vec<String> {
  match names.get(key) {
    None => Vec::new(),
    Some(toml::Value::Array(list)) => list
      .iter()
      .map(|name| {
        name
          .as_str()
          .unwrap_or_else(|| panic!("{from}: {key} holds a name that is not text"))
          .to_owned()
      })
      .collect(),
    Some(_) => panic!("{from}: {key} is not a list"),
  }
}

/// Whether `text` holds `word` standing apart: no letter, digit or underscore on either side.
fn holds_word(text: &str, word: &str) -> bool {
  text.match_indices(word).any(|(at, _)| {
    let apart = |character: Option<char>| {
      character.is_none_or(|character| !(character.is_alphanumeric() || character == '_'))
    };

    apart(text[..at].chars().next_back()) && apart(text[at + word.len()..].chars().next())
  })
}

/// No tracked file holds an agent's, a person's or a machine's name. The list is the TOML file `BMO_NAMES_LIST`
/// names: `words`, matched as whole words in any case; `exact_words`, whole words as written; `anywhere`, matched
/// anywhere, as a Korean name takes its particles with no space; and `allowed`, terms that hold a name as part of
/// themselves, set aside before the names are matched. Where no list is named, the names are not checked here and
/// the run says so.
#[test]
fn no_listed_name_in_a_tracked_file() {
  let Some(from) = std::env::var_os(NAMES_LIST) else {
    eprintln!("{NAMES_LIST} names no list; the names were not checked");
    return;
  };
  let from = from.to_string_lossy().into_owned();
  let names: toml::Table = fs::read_to_string(&from)
    .unwrap_or_else(|why| panic!("{from} is unreadable: {why}"))
    .parse()
    .unwrap_or_else(|why| panic!("{from} is not TOML: {why}"));
  let words: Vec<String> =
    names_list(&names, &from, "words").iter().map(|name| name.to_lowercase()).collect();
  let exact_words = names_list(&names, &from, "exact_words");
  let anywhere = names_list(&names, &from, "anywhere");
  let allowed = names_list(&names, &from, "allowed");
  let mut found = Vec::new();

  for (path, text) in tracked_texts() {
    let text = allowed.iter().fold(text, |text, term| text.replace(term.as_str(), " "));
    let lowered = text.to_lowercase();
    let held = words
      .iter()
      .filter(|name| holds_word(&lowered, name))
      .chain(exact_words.iter().filter(|name| holds_word(&text, name)))
      .chain(anywhere.iter().filter(|name| text.contains(name.as_str())));

    found.extend(held.map(|name| format!("{path}: {name}")));
  }

  assert!(found.is_empty(), "listed names in tracked files: {found:#?}");
}

/// The home folders a neutral example or a test names, so a person's own is not among them.
const NEUTRAL_HOME: [&str; 5] = ["user", "tester", "qa-admin", "placeholder", "example"];

/// Whether a home path's own folder is a neutral example rather than a person's.
fn is_neutral_home(folder: &str) -> bool {
  NEUTRAL_HOME.contains(&folder) || folder.starts_with("agent-")
}

/// Whether a mail address's domain is the reserved example space, where a neutral example address stands.
fn is_example_domain(domain: &str) -> bool {
  let domain = domain.to_lowercase();

  ["example.com", "example.net", "example.org"]
    .iter()
    .any(|example| domain == *example || domain.ends_with(&format!(".{example}")))
    || [".example", ".test", ".invalid", ".localhost"]
      .iter()
      .any(|suffix| domain.ends_with(suffix))
}

/// No tracked file holds personal data: a mail address outside the reserved example domains, a person's home
/// path, a telephone number, a token or a private network address (`PERSONAL-DATA.md`). The neutral forms a
/// test or an example writes are not findings. The third-party packs under `client/vendor/` stand as their
/// publishers shipped them and are passed over.
#[test]
fn no_personal_data_in_a_tracked_file() {
  let mail = Regex::new(concat!(r"\b[A-Za-z0-9._%+-]+@", r"[A-Za-z][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b"))
    .expect("the mail pattern reads");
  let home = Regex::new(r"(?:/home/|/Users/|[A-Za-z]:\\Users\\)([A-Za-z0-9._-]+)")
    .expect("the home path pattern reads");
  let telephone = Regex::new(concat!(
    r"\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b|",
    r"\+\d{1,3}[-. ]?\d{2,4}[-. ]?\d{3,4}[-. ]?\d{4}\b|",
    r"\+\d{9,15}\b"
  ))
  .expect("the telephone pattern reads");
  let token = Regex::new(concat!(
    r"gh[pousr]_[A-Za-z0-9]{20,}|",
    r"github_pat_[A-Za-z0-9_]{20,}|",
    r"sk-[A-Za-z0-9_-]{20,}|",
    r"xox[baprs]-[A-Za-z0-9-]{10,}|",
    r"AKIA[0-9A-Z]{16}|",
    r"AIza[0-9A-Za-z_-]{35}"
  ))
  .expect("the token pattern reads");
  let private = Regex::new(concat!(
    r"(?i)\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|",
    r"192\.168\.\d{1,3}\.\d{1,3}|",
    r"172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b|",
    r"\b(?:f[cd][0-9a-f]{2}|fe80):"
  ))
  .expect("the private address pattern reads");
  let mut found = Vec::new();

  for (path, text) in tracked_texts() {
    if path.starts_with("client/vendor/") {
      continue;
    }

    found.extend(
      mail
        .find_iter(&text)
        .filter(|address| {
          !address.as_str().rsplit_once('@').is_some_and(|(_, domain)| is_example_domain(domain))
        })
        .map(|address| format!("{path}: mail address {}", address.as_str())),
    );
    found.extend(
      home
        .captures_iter(&text)
        .filter(|capture| !capture.get(1).is_some_and(|folder| is_neutral_home(folder.as_str())))
        .map(|capture| format!("{path}: home path {}", &capture[0])),
    );
    found.extend(
      telephone
        .find_iter(&text)
        .map(|number| format!("{path}: telephone number {}", number.as_str())),
    );
    found.extend(token.find_iter(&text).map(|token| format!("{path}: token {}", token.as_str())));
    found.extend(
      private
        .find_iter(&text)
        .map(|address| format!("{path}: private address {}", address.as_str())),
    );
  }

  assert!(found.is_empty(), "personal data in tracked files: {found:#?}");
}
