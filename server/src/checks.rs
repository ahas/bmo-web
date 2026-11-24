//! The object check (docs/accounts.md, 「Checks」): whether a user holds a relation on a worker, a repository or a
//! tool capability, one of sumida's point checks over the deployment's rules; nothing here decides by itself.

use sea_orm::ConnectionTrait;
use serde::Serialize;
use sumida::api::authz::Authz;
use sumida::api::authz::subject::SubjectSet;

use crate::Refusal;
use crate::rules::RULES;
use crate::users::user_subject;

/// What a check answered: whether it opens, the grant it asked for, and the user it was made for.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
  pub allowed: bool,
  pub grant: String,
  pub user: Option<i32>,
}

/// The permission that opens a relation, as the deployment's rules name it.
fn permission(relation: &str) -> String {
  format!("may_{relation}")
}

/// A kind and relation the deployment's rules declare, or a refusal naming what they do not: a kind of
/// sumida's own is not the deployment's to check here.
pub fn declared(kind: &str, relation: &str) -> Result<(), Refusal> {
  let registry = Authz::registry()?;
  let ours = RULES.iter().any(|file| registry.source_of(kind) == Some(file.name));
  let Some(definition) = registry.get(kind).filter(|_| ours) else {
    return Err(Refusal::bad(format!("`{kind}` is no kind of the deployment's rules")));
  };
  let wanted = permission(relation);

  if definition.permissions.iter().any(|(name, _)| name == &wanted) {
    Ok(())
  } else {
    Err(Refusal::bad(format!("`{kind}` has no relation `{relation}`")))
  }
}

/// The grant a check asks for, as a refusal names it.
pub fn grant_of(kind: &str, object: &str, relation: &str) -> String {
  format!("{kind}:{object}#{relation}")
}

async fn checked<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  object: &str,
  relation: &str,
  subject: &SubjectSet,
) -> Result<bool, Refusal> {
  Ok(Authz::check(kind, object, &permission(relation), subject, db).await?)
}

/// Whether a user holds a relation on a worker, a repository or a tool capability.
pub async fn check_object<C: ConnectionTrait>(
  db: &C,
  kind: &str,
  object: &str,
  relation: &str,
  user: i32,
) -> Result<Answer, Refusal> {
  declared(kind, relation)?;

  let subject = user_subject(db, user).await?;

  Ok(Answer {
    allowed: checked(db, kind, object, relation, &subject).await?,
    grant: grant_of(kind, object, relation),
    user: Some(user),
  })
}
