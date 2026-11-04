//! Users as the service meets them: a chat identity linked to its user, the subjects a check is made for,
//! and the users the model makes for a person who has none (docs/accounts.md).

use bmo_web_client::UserProfile;
use rand::Rng;
use rand::distr::Alphanumeric;
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::authz::Authz;
use sumida::api::authz::subject::SubjectSet;
use sumida::api::authz::write::{SubjectKey, TupleWrite};

use crate::{Refusal, now_ms, one, run};

/// The organization every user of the deployment belongs to, by name.
pub const ORGANIZATION: &str = "bmo";
/// The role every user of the deployment holds, by name.
pub const ROLE: &str = "member";

/// The subject every member of a room is checked as, in that room alone.
pub fn member_of(room: i64) -> String {
  format!("bmo_member:{room}")
}

/// Whether the name a console change is recorded under is the platform administrator's: a console login,
/// which only the administrator holds, or the username of the user the data move named the administrator. A
/// change that names nobody is no administrator's.
pub async fn is_administrator<C: ConnectionTrait>(db: &C, by: &str) -> Result<bool, Refusal> {
  if by.trim().is_empty() {
    return Ok(false);
  }

  let login = one(db, r#"SELECT 1 AS "held" FROM "web_users" WHERE "name" = $1"#, vec![by.into()]).await?;

  if login.is_some() {
    return Ok(true);
  }

  let named = one(
    db,
    r#"SELECT 1 AS "held" FROM "users" u JOIN "settings" s ON s."key" = $1
       WHERE CAST(u."id" AS TEXT) = TRIM(s."value") AND u."username" = $2"#,
    vec![crate::data_move::ADMINISTRATOR.into(), by.into()],
  )
  .await?;

  Ok(named.is_some())
}

/// The user a sender id is linked to, where it is linked.
pub async fn user_of_sender<C: ConnectionTrait>(db: &C, sender: i64) -> Result<Option<i32>, Refusal> {
  let row = one(
    db,
    r#"SELECT "user_id" FROM "user_senders" WHERE "sender_id" = $1"#,
    vec![sender.into()],
  )
  .await?;

  Ok(match row {
    Some(row) => Some(
      i32::try_from(row.try_get::<i64>("", "user_id")?)
        .map_err(|_| Refusal::bad(format!("sender {sender} is linked to a user id no user can carry")))?,
    ),
    None => None,
  })
}

/// Whether a room is a user's own private room with the chat agent: its road says it is a one-to-one, with
/// a person whose sender id is linked to a user.
pub async fn is_private_room<C: ConnectionTrait>(db: &C, private_to: Option<i64>) -> Result<bool, Refusal> {
  match private_to {
    Some(person) => Ok(user_of_sender(db, person).await?.is_some()),
    None => Ok(false),
  }
}

/// A user's own subjects, as sumida's session would carry them: the user, their role's members and their
/// organization's members.
pub async fn user_subjects<C: ConnectionTrait>(
  db: &C,
  user: i32,
) -> Result<(Vec<String>, Vec<i32>), Refusal> {
  let row = one(
    db,
    r#"SELECT "role_id", "organization_id" FROM "users" WHERE "id" = $1"#,
    vec![user.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let role: i32 = row.try_get("", "role_id")?;
  let organization: i32 = row.try_get("", "organization_id")?;

  Ok((
    vec![
      format!("user:{user}"),
      format!("role:{role}#member"),
      format!("organization:{organization}#member"),
    ],
    vec![user],
  ))
}

/// What one sender in one room is checked as: their user where their identity is linked, and the room's
/// members always.
pub async fn sender_subject<C: ConnectionTrait>(
  db: &C,
  room: i64,
  sender: Option<i64>,
) -> Result<(SubjectSet, Option<i32>), Refusal> {
  let user = match sender {
    Some(sender) => user_of_sender(db, sender).await?,
    None => None,
  };
  let (mut keys, ids) = match user {
    Some(user) => user_subjects(db, user).await?,
    None => (Vec::new(), Vec::new()),
  };

  keys.push(member_of(room));

  Ok((SubjectSet::from_parts(keys, ids), user))
}

/// What a user is checked as outside any room.
pub async fn user_subject<C: ConnectionTrait>(db: &C, user: i32) -> Result<SubjectSet, Refusal> {
  let (keys, ids) = user_subjects(db, user).await?;

  Ok(SubjectSet::from_parts(keys, ids))
}

/// The organization and role the data move made, which every user is given.
pub async fn home<C: ConnectionTrait>(db: &C) -> Result<(i32, i32), Refusal> {
  let organization = one(
    db,
    r#"SELECT "id" FROM "organizations" WHERE "name" = $1 ORDER BY "id" LIMIT 1"#,
    vec![ORGANIZATION.into()],
  )
  .await?;
  let role = one(
    db,
    r#"SELECT "id" FROM "roles" WHERE "name" = $1 ORDER BY "id" LIMIT 1"#,
    vec![ROLE.into()],
  )
  .await?;

  match (organization, role) {
    (Some(organization), Some(role)) => Ok((organization.try_get("", "id")?, role.try_get("", "id")?)),
    _ => Err(Refusal::new(
      axum::http::StatusCode::CONFLICT,
      "the data move has not run, so there is no organization or role to give a user",
    )),
  }
}

/// A password no sign-in can match: not a hash at all, so the check refuses it as it refuses a wrong
/// password, and long and random so no two users share it.
fn unusable_password() -> String {
  let noise: String = rand::rng().sample_iter(&Alphanumeric).take(48).map(char::from).collect();

  format!("!unusable:{noise}")
}

/// The user a sender id is linked to, made and linked where none is: a user with no way to sign in, named
/// after the identity, who holds only what is granted to them.
pub async fn user_for_sender<C: ConnectionTrait>(db: &C, sender: i64) -> Result<i32, Refusal> {
  if let Some(user) = user_of_sender(db, sender).await? {
    return Ok(user);
  }

  let (organization, role) = home(db).await?;
  let made = one(
    db,
    r#"INSERT INTO "users" ("username", "password", "role_id", "organization_id", "is_admin", "is_enabled")
       VALUES ($1, $2, $3, $4, false, false) RETURNING "id""#,
    vec![
      format!("member-{sender}").into(),
      unusable_password().into(),
      role.into(),
      organization.into(),
    ],
  )
  .await?
  .ok_or_else(|| Refusal::bad("the user was not made"))?;
  let user: i32 = made.try_get("", "id")?;

  link(db, sender, user).await?;
  crate::sections::seed_defaults(db, user, "sender-link").await?;

  Ok(user)
}

/// A password hashed as sumida hashes every password.
fn hashed(password: &str) -> Result<String, Refusal> {
  sumida::api::util::user::hash_password(password).map_err(|why| {
    Refusal::new(
      axum::http::StatusCode::INTERNAL_SERVER_ERROR,
      format!("the password could not be hashed: {why}"),
    )
  })
}

/// What the account command wrote: the user, and whether it was made rather than found.
#[derive(Debug, PartialEq, Eq)]
pub struct SignInSet {
  pub user: i32,
  pub made: bool,
}

/// Who the account command is written as, in a tuple's `created_by`.
const ACCOUNT_COMMAND: &str = "account-command";

/// The user a name signs in as, made where none stands and given the password where one does, in one
/// transaction (docs/accounts.md, 「The account command」). A user made is enabled, in the organization and
/// role every user is given, and holds nothing until granted; a user found is enabled again and keeps its
/// grants and links. `administrator` also makes the user the platform administrator.
pub async fn set_sign_in<C: ConnectionTrait + TransactionTrait>(
  db: &C,
  name: &str,
  password: &str,
  administrator: bool,
) -> Result<SignInSet, Refusal> {
  if name.trim().is_empty() || password.is_empty() {
    return Err(Refusal::bad("a user needs a name and a password"));
  }

  let txn = db.begin().await?;

  match sign_in_written(&txn, name, password, administrator).await {
    Ok(set) => {
      txn.commit().await?;

      Ok(set)
    }
    Err(refused) => {
      txn.rollback().await?;

      Err(refused)
    }
  }
}

async fn sign_in_written<C: ConnectionTrait>(
  db: &C,
  name: &str,
  password: &str,
  administrator: bool,
) -> Result<SignInSet, Refusal> {
  let hash = hashed(password)?;
  let standing = one(db, r#"SELECT "id" FROM "users" WHERE "username" = $1"#, vec![name.into()]).await?;
  let set = match standing {
    Some(row) => {
      let user: i32 = row.try_get("", "id")?;

      run(
        db,
        r#"UPDATE "users" SET "password" = $1, "is_enabled" = true, "updated_at" = now() WHERE "id" = $2"#,
        vec![hash.into(), user.into()],
      )
      .await?;

      SignInSet { user, made: false }
    }
    None => {
      let (organization, role) = home(db).await?;
      let user: i32 = one(
        db,
        r#"INSERT INTO "users" ("username", "password", "role_id", "organization_id", "is_admin", "is_enabled")
           VALUES ($1, $2, $3, $4, false, true) RETURNING "id""#,
        vec![name.into(), hash.into(), role.into(), organization.into()],
      )
      .await?
      .ok_or_else(|| Refusal::bad("the user was not made"))?
      .try_get("", "id")?;

      crate::sections::seed_defaults(db, user, ACCOUNT_COMMAND).await?;

      SignInSet { user, made: true }
    }
  };

  if administrator {
    Authz::write_unchecked(
      TupleWrite::new("platform", "root", "admin", SubjectKey::user(set.user)),
      ACCOUNT_COMMAND,
      db,
    )
    .await?;
  }

  Ok(set)
}

/// A user's password changed on the strength of their current one, hashed as sumida hashes every password;
/// a wrong current password changes nothing.
pub async fn change_password<C: ConnectionTrait>(
  db: &C,
  user: i32,
  current: &str,
  next: &str,
) -> Result<(), Refusal> {
  let row = one(db, r#"SELECT "password" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .ok_or_else(|| Refusal::absent(format!("no user {user}")))?;
  let held: String = row.try_get("", "password")?;

  if !sumida::api::service::auth::helper::verify_password(current, &held) {
    return Err(
      Refusal::new(axum::http::StatusCode::UNAUTHORIZED, "the current password does not match")
        .coded("wrong-password"),
    );
  }

  let hashed = hashed(next)?;

  run(
    db,
    r#"UPDATE "users" SET "password" = $1, "updated_at" = now() WHERE "id" = $2"#,
    vec![hashed.into(), user.into()],
  )
  .await?;

  Ok(())
}

/// A user given another name; a name another user holds is refused.
pub async fn rename<C: ConnectionTrait>(db: &C, user: i32, name: &str) -> Result<(), Refusal> {
  let taken = one(
    db,
    r#"SELECT "id" FROM "users" WHERE "username" = $1 AND "id" <> $2"#,
    vec![name.into(), user.into()],
  )
  .await?;

  if taken.is_some() {
    return Err(
      Refusal::new(axum::http::StatusCode::CONFLICT, format!("the name {name} is taken"))
        .coded("name-taken"),
    );
  }

  run(
    db,
    r#"UPDATE "users" SET "username" = $1, "updated_at" = now() WHERE "id" = $2"#,
    vec![name.into(), user.into()],
  )
  .await?;

  Ok(())
}

/// A sender id linked to a user. A sender already linked to another user is refused rather than moved, since
/// a link is the person and moving it moves their grants.
pub async fn link<C: ConnectionTrait>(db: &C, sender: i64, user: i32) -> Result<(), Refusal> {
  if let Some(held) = user_of_sender(db, sender).await? {
    if held == user {
      return Ok(());
    }

    return Err(Refusal::new(
      axum::http::StatusCode::CONFLICT,
      format!("sender {sender} is already linked to user {held}"),
    ));
  }

  run(
    db,
    r#"INSERT INTO "user_senders" ("sender_id", "user_id", "linked_at") VALUES ($1, $2, $3)"#,
    vec![sender.into(), i64::from(user).into(), now_ms().into()],
  )
  .await?;

  Ok(())
}

/// A user's job title and contact details, every field empty where the account keeps no profile
/// (docs/accounts.md, 「Users and senders」). A user that does not stand is answered absent.
pub async fn profile_of<C: ConnectionTrait>(db: &C, user: i32) -> Result<UserProfile, Refusal> {
  let stands = one(db, r#"SELECT 1 AS "one" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .is_some();

  if !stands {
    return Err(Refusal::absent(format!("no user {user}")));
  }

  let held = one(
    db,
    r#"SELECT "job_title", "landline", "mobile", "email" FROM "user_profiles" WHERE "user_id" = $1"#,
    vec![user.into()],
  )
  .await?;

  let Some(row) = held else {
    return Ok(UserProfile::default());
  };

  Ok(UserProfile {
    job_title: row.try_get("", "job_title")?,
    landline: row.try_get("", "landline")?,
    mobile: row.try_get("", "mobile")?,
    email: row.try_get("", "email")?,
  })
}

/// A user's profile written whole, an empty field clearing it. The user must stand, so a profile is never
/// kept for nobody.
pub async fn set_profile<C: ConnectionTrait>(
  db: &C,
  user: i32,
  profile: &UserProfile,
) -> Result<(), Refusal> {
  let stands = one(db, r#"SELECT 1 AS "one" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .is_some();

  if !stands {
    return Err(Refusal::absent(format!("no user {user}")));
  }

  run(
    db,
    r#"INSERT INTO "user_profiles" ("user_id", "job_title", "landline", "mobile", "email", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("user_id") DO UPDATE SET
         "job_title" = $2, "landline" = $3, "mobile" = $4, "email" = $5, "updated_at" = $6"#,
    vec![
      user.into(),
      profile.job_title.clone().into(),
      profile.landline.clone().into(),
      profile.mobile.clone().into(),
      profile.email.clone().into(),
      now_ms().into(),
    ],
  )
  .await?;

  Ok(())
}
