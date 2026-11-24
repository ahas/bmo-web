//! The crate's one test harness (bmo-chat's docs/conventions.md, 「Rust builds」): each file of tests a
//! module of it, sharing the process.

mod support;

mod agents;
mod baseline;
mod chain;
mod document_talk;
mod entry;
mod import;
mod invites;
mod language_pack;
mod org_memory;
mod organisation;
mod pairings;
mod people;
mod profiles;
mod removal;
// The checks that span the repository, which stand in the root's tests/ (docs/checks.md); the root is a
// workspace and holds no package, so this crate runs them.
#[path = "../../tests/repository.rs"]
mod repository;
mod roster;
mod routes;
mod secret_kinds;
mod secrets;
mod sections;
mod security;
mod supply;
mod units;
mod words;
