//! The account service's fixed API (`docs/boundary.md`, `docs/openapi.json`): every body and member as a Rust
//! type, one call for each route, and the OpenAPI document generated from those types. The TypeScript package
//! beside this crate is generated from the same document.
//!
//! The wire format is the common one (`base/chat/docs/conventions.md`, 「The common wire format」): camelCase
//! keys, times as integers of epoch milliseconds, ids as signed 64-bit integers, and every failure as a non-2xx
//! answer carrying `code` and `error`. A user's id is the exception the service's own document states: it is
//! answered as the digits of sumida's whole number, a string a caller hands on as it stands.

mod client;
mod openapi;
mod organisation;
mod types;
mod wire;

pub use client::{AccountClient, OWNER_KEY, OWNER_ROLE};
pub use openapi::{openapi, openapi_json};
pub use organisation::*;
pub use types::*;
pub use wire::{Answer, ClientFailure, SessionError, WireError};

/// The service's version, the repository's.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
