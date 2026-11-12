//! The crate's one test harness (bmo-chat's docs/conventions.md, 「Rust builds」): each file of tests a
//! module of it, sharing the process.

mod support;

mod callers;
mod document_talk;
mod grants;
mod import;
mod invites;
mod language_pack;
mod people;
mod profiles;
// The checks that span the repository, which stand in the root's tests/ (docs/checks.md); the root is a
// workspace and holds no package, so this crate runs them.
#[path = "../../tests/repository.rs"]
mod repository;
mod routes;
mod secret_kinds;
mod secrets;
mod sections;
mod units;
mod words;
