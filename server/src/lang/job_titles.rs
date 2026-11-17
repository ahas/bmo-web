//! The one line a person's title is shown as (docs/accounts.md, 「Users and senders」): the rank and then the role,
//! joined as the pack writes them.

use serde::Deserialize;

use crate::marks::fill_marks;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JobTitles {
  /// The rank and the role together, `{rank}` and `{role}` filled in.
  pub both: String,
}

crate::part!(pub JOB_TITLES: JobTitles = "job-titles");

/// The line a person's title is shown as: the rank and the role where both are set, the one that is where one
/// is, and the job title kept where neither is.
pub fn shown(rank: &str, role: Option<&str>, kept: &str) -> String {
  let rank = rank.trim();
  let role = role.map(str::trim).filter(|role| !role.is_empty());

  match (rank.is_empty(), role) {
    (false, Some(role)) => fill_marks(&JOB_TITLES.both, &[("rank", rank), ("role", role)]),
    (false, None) => rank.to_owned(),
    (true, Some(role)) => role.to_owned(),
    (true, None) => kept.to_owned(),
  }
}
