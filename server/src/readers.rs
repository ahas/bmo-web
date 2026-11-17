//! Who a call is made for, as the console and the units acting for a person name them in `Owner-Key`: the
//! user, the company their home unit belongs to, and whether sumida holds them the platform administrator
//! (docs/accounts.md, 「The platform administrators」). The organisation's reads bound by a company read it.

use axum::http::HeaderMap;
use bmo_web_client::OWNER_KEY;
use sea_orm::ConnectionTrait;
use sumida::api::authz::Authz;

use crate::units::{HEADS, UNIT, company_of};
use crate::users::user_subject;
use crate::{Refusal, one};

/// The user a call is made for, its company and whether they are the platform administrator.
pub struct Reader {
  pub user: i32,
  pub company: Option<i32>,
  pub administrator: bool,
}

impl Reader {
  /// Whether the reader reaches what stands in `company`: the administrator every company, anyone else their own.
  pub fn reaches(&self, company: i32) -> bool {
    self.administrator || self.company == Some(company)
  }

  /// Whether the reader heads `unit`, by sumida's `manage` on it, which the administrator always holds.
  pub async fn heads<C: ConnectionTrait>(&self, db: &C, unit: i32) -> Result<bool, Refusal> {
    if self.administrator {
      return Ok(true);
    }

    let subject = user_subject(db, self.user).await?;

    Ok(Authz::check(UNIT, unit, HEADS, &subject, db).await?)
  }
}

/// The user `Owner-Key` names, where it names a whole number.
pub fn actor(headers: &HeaderMap) -> Option<i32> {
  headers
    .get(OWNER_KEY)
    .and_then(|value| value.to_str().ok())
    .and_then(|key| key.trim().parse::<i32>().ok())
}

/// The reader a call is made for, refused where it names no user of this deployment.
pub async fn reader<C: ConnectionTrait>(db: &C, headers: &HeaderMap) -> Result<Reader, Refusal> {
  let user = actor(headers)
    .ok_or_else(|| Refusal::forbidden("the call is made for a signed-in user, and it names none"))?;
  let unit: i32 = one(
    db,
    r#"SELECT "organization_id" FROM "users" WHERE "id" = $1::bigint"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::forbidden("the call names no user of this deployment"))?
  .try_get("", "organization_id")?;

  Ok(Reader {
    user,
    company: company_of(db, unit).await?,
    administrator: Authz::is_superuser(&user_subject(db, user).await?, db).await?,
  })
}
