//! The secret store (docs/accounts.md, 「The secret store」; docs/boundary.md, 「The secret store」): the files under
//! the data root's `env/` every unit reads a secret from by its name, the platform's space and one to each other
//! person, and one to each organisation unit. The platform's space is the folder itself, held by every platform
//! administrator, every other person's a folder of their own under `users/`, and a unit's a folder of its own under
//! `units/`, held by the unit's heads. The store writes a value under a name in a space and answers the
//! name, its size and its time; no route reads a value back, and nothing here logs one. The list reads only the keys
//! of a file's lines, to name the kind it reads as. A space is its own holders' alone, the platform's included.

use std::fs::{self, DirBuilder, File, Metadata, OpenOptions, Permissions};
use std::io::{self, ErrorKind, Read, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::UNIX_EPOCH;

use axum::body::Bytes;
use axum::extract::{Path as Segment, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, put};
use axum::{Json, Router};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use bmo_web_client::{OWNER_KEY, Secret, SecretAsk, SecretEncoding, SecretKind, Secrets};
use sumida::api::authz::Authz;

use crate::routes::user_in;
use crate::secret_kinds;
use crate::users::user_subject;
use crate::{Refusal, Service, one};

/// What the value a name held before is kept under: the name, then this.
pub const PREVIOUS: &str = ".previous";
/// The longest name the store takes, so the name with the store's own suffixes stays a file name.
pub const NAME_MAX: usize = 200;
/// The one role a change of the deployment's own, a secret kind among them, is made in.
pub const ADMINISTRATOR: &str = "administrator";
/// The folder under the store's own that every person's space but the administrator's stands in, and so a name no
/// secret of the administrator's takes.
pub const PEOPLE: &str = "users";
/// The folder under the store's own that every organisation unit's space stands in, and so another name no secret
/// of the administrator's takes.
pub const UNITS: &str = "units";

/// A file's mode: its owner reads and writes it, and nobody else anything.
const FILE_MODE: u32 = 0o600;
/// The folder's mode, where the store makes it.
const FOLDER_MODE: u32 = 0o700;
/// The largest file whose kind the list reads: a kind's file is at most twenty short lines.
const KIND_TEXT_MAX: u64 = 16 * 1024;

/// The folder the store writes, and the lock that takes its writes one at a time.
#[derive(Debug)]
pub struct Store {
  folder: PathBuf,
  writing: Mutex<()>,
}

/// Whose secrets a call reaches: the platform's, the store's own folder, which every platform administrator holds
/// and every unit reads the deployment's secrets from, or another person's, by their user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Space {
  Administrator,
  Person(i32),
  /// An organisation unit's, held by its heads and the platform administrator (「An organisation's space」).
  Unit(i32),
}

impl Space {
  /// The folder the space stands in, under the store's own.
  fn folder(self, store: &Path) -> PathBuf {
    match self {
      Self::Administrator => store.to_path_buf(),
      Self::Person(user) => store.join(PEOPLE).join(user.to_string()),
      Self::Unit(unit) => store.join(UNITS).join(unit.to_string()),
    }
  }

  /// Whether the space takes `name`: a plain file name, and in the administrator's never the people's folder.
  fn takes(self, name: &str) -> Result<(), Refusal> {
    named(name)?;

    if self == Self::Administrator && (name == PEOPLE || name == UNITS) {
      return Err(
        Refusal::bad(format!(
          "`{name}` is a folder other people's or organisations' secrets stand in, and no secret's name"
        ))
        .coded("bad-name"),
      );
    }

    Ok(())
  }
}

/// What a write did: made a name, or replaced the value one held.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Written {
  Made,
  Replaced,
}

/// Whether `name` is one the store takes: a plain file name of letters, digits, `.`, `_` and `-`, beginning with
/// no dot and not ending in `.previous`. The refusal does not repeat the name, since a value pasted into the wrong
/// box would be repeated with it.
pub fn named(name: &str) -> Result<(), Refusal> {
  let plain = !name.is_empty()
    && name.len() <= NAME_MAX
    && name
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    && !name.starts_with('.')
    && !name.ends_with(PREVIOUS);

  if plain {
    Ok(())
  } else {
    Err(
      Refusal::bad(format!(
        "the name is no secret's: a plain file name of at most {NAME_MAX} letters, digits, `.`, `_` and `-`, \
         beginning with no dot and not ending in `{PREVIOUS}`"
      ))
      .coded("bad-name"),
    )
  }
}

fn failed(what: &str, why: &io::Error) -> Refusal {
  Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("{what}: {why}"))
}

/// Whether a regular file stands at `path`: false where nothing does, and a refusal where something else does.
fn regular(path: &Path) -> Result<bool, Refusal> {
  match fs::symlink_metadata(path) {
    Ok(standing) if standing.file_type().is_file() => Ok(true),
    Ok(_) => Err(
      Refusal::new(
        StatusCode::CONFLICT,
        "the name stands in the store's folder as something other than a file, a folder or a link",
      )
      .coded("not-a-file"),
    ),
    Err(why) if why.kind() == ErrorKind::NotFound => Ok(false),
    Err(why) => Err(failed("the store's folder cannot be read", &why)),
  }
}

/// A file's name, size and time, as the store answers them.
fn kept(name: String, standing: &Metadata) -> Secret {
  let changed_at = standing
    .modified()
    .ok()
    .and_then(|at| at.duration_since(UNIX_EPOCH).ok())
    .map_or(0, |since| i64::try_from(since.as_millis()).unwrap_or(i64::MAX));

  Secret {
    name,
    bytes: i64::try_from(standing.len()).unwrap_or(i64::MAX),
    changed_at,
    kind: None,
  }
}

fn removed_if_there(path: &Path) -> io::Result<()> {
  match fs::remove_file(path) {
    Err(why) if why.kind() != ErrorKind::NotFound => Err(why),
    _ => Ok(()),
  }
}

/// The folder a removal may take: a person's or a unit's, never the platform's.
fn removable(space: Space, store: &Path) -> Result<PathBuf, Refusal> {
  match space {
    Space::Administrator => Err(Refusal::forbidden("the platform's space is never removed")),
    Space::Person(_) | Space::Unit(_) => Ok(space.folder(store)),
  }
}

/// Every file under a folder, its folders' files among them; a link is counted as the file it is and never
/// followed.
fn files_under(folder: &Path) -> io::Result<i64> {
  let mut count = 0;

  for entry in fs::read_dir(folder)? {
    let entry = entry?;

    count += if entry.file_type()?.is_dir() { files_under(&entry.path())? } else { 1 };
  }

  Ok(count)
}

/// `value` written whole to a new file of mode 600 and brought to the disk.
fn written_whole(path: &Path, value: &[u8]) -> io::Result<()> {
  removed_if_there(path)?;

  let mut file = OpenOptions::new().write(true).create_new(true).mode(FILE_MODE).open(path)?;

  file.write_all(value)?;
  file.sync_all()
}

impl Store {
  /// The store on `folder`, the data root's `env/`.
  pub fn at(folder: impl Into<PathBuf>) -> Self {
    Self {
      folder: folder.into(),
      writing: Mutex::new(()),
    }
  }

  pub fn folder(&self) -> &Path {
    &self.folder
  }

  fn lock(&self) -> MutexGuard<'_, ()> {
    self.writing.lock().unwrap_or_else(PoisonError::into_inner)
  }

  /// How many files a person's or a unit's space holds, every file under its folder counted, a value kept before
  /// among them; none where the folder does not stand. The platform's space is no space a removal reaches, and is
  /// refused (docs/accounts.md, 「Deleting an account for good」).
  pub fn files_in(&self, space: Space) -> Result<i64, Refusal> {
    let folder = removable(space, &self.folder)?;

    match fs::symlink_metadata(&folder) {
      Ok(standing) if standing.is_dir() => {
        files_under(&folder).map_err(|why| failed("the space's folder cannot be read", &why))
      }
      Ok(_) => Err(
        Refusal::new(
          StatusCode::CONFLICT,
          "the space stands in the store's folder as something other than a folder",
        )
        .coded("not-a-folder"),
      ),
      Err(why) if why.kind() == ErrorKind::NotFound => Ok(0),
      Err(why) => Err(failed("the space's folder cannot be read", &why)),
    }
  }

  /// A person's or a unit's space removed whole, answering how many files it held; a space whose folder does not
  /// stand holds none and is removed already. The platform's space is refused.
  pub fn remove_space(&self, space: Space) -> Result<i64, Refusal> {
    let _writing = self.lock();
    let held = self.files_in(space)?;
    let folder = removable(space, &self.folder)?;

    match fs::remove_dir_all(&folder) {
      Err(why) if why.kind() != ErrorKind::NotFound => {
        return Err(failed("the space's folder cannot be removed", &why));
      }
      _ => {}
    }

    Ok(held)
  }

  /// Every secret a space holds, in the order of their names: its regular files whose names the store takes. A
  /// space whose folder does not stand yet holds none, and a folder in it, another person's among them, is none.
  pub fn list(&self, space: Space) -> Result<Vec<Secret>, Refusal> {
    let entries = match fs::read_dir(space.folder(&self.folder)) {
      Ok(entries) => entries,
      Err(why) if why.kind() == ErrorKind::NotFound => return Ok(vec![]),
      Err(why) => return Err(failed("the store's folder cannot be read", &why)),
    };
    let mut listed = vec![];

    for entry in entries {
      let entry = entry.map_err(|why| failed("the store's folder cannot be read", &why))?;
      let Ok(name) = entry.file_name().into_string() else {
        continue;
      };

      if named(&name).is_err() {
        continue;
      }

      // An entry's own metadata does not follow a link, so a link is passed over with a folder.
      match entry.metadata() {
        Ok(standing) if standing.file_type().is_file() => listed.push(kept(name, &standing)),
        _ => {}
      }
    }

    listed.sort_by(|one, other| one.name.cmp(&other.name));

    Ok(listed)
  }

  /// The text of the secret `name` in a space, for its kind to be read off, never answered: none where it is
  /// larger than any kind's file, does not read as UTF-8 or cannot be read, so such a secret is listed with no
  /// kind.
  fn text_of(&self, space: Space, name: &str) -> Option<String> {
    let mut text = String::new();
    let file = File::open(space.folder(&self.folder).join(name)).ok()?;

    file.take(KIND_TEXT_MAX + 1).read_to_string(&mut text).ok()?;

    (text.len() as u64 <= KIND_TEXT_MAX).then_some(text)
  }

  /// Every secret a space holds as `list` answers it, each with the kind its file reads as among `kinds`.
  pub fn list_with_kinds(&self, space: Space, kinds: &[SecretKind]) -> Result<Vec<Secret>, Refusal> {
    let mut listed = self.list(space)?;

    for secret in &mut listed {
      secret.kind = self
        .text_of(space, &secret.name)
        .and_then(|text| secret_kinds::read_off(&text, kinds).map(str::to_owned));
    }

    Ok(listed)
  }

  /// `value` written under `name` in a space: whole to a hidden file of mode 600 beside it, then moved onto the
  /// name. A name that stands is replaced only where `replace` says so, and the value it held stays as
  /// `<name>.previous`.
  pub fn put(
    &self,
    space: Space,
    name: &str,
    value: &[u8],
    replace: bool,
  ) -> Result<(Secret, Written), Refusal> {
    space.takes(name)?;

    if value.is_empty() {
      return Err(Refusal::bad("the value is empty").coded("empty-value"));
    }

    let _writing = self.lock();
    let folder = space.folder(&self.folder);
    let path = folder.join(name);
    let previous = folder.join(format!("{name}{PREVIOUS}"));
    let standing = regular(&path)?;

    regular(&previous)?;

    if standing && !replace {
      return Err(
        Refusal::new(
          StatusCode::CONFLICT,
          "a secret stands under the name, and replacing it was not asked",
        )
        .coded("secret-exists"),
      );
    }

    DirBuilder::new()
      .recursive(true)
      .mode(FOLDER_MODE)
      .create(&folder)
      .map_err(|why| failed("the store's folder cannot be made", &why))?;

    let hidden = folder.join(format!(".{name}.{}.writing", std::process::id()));
    let moved = written_whole(&hidden, value).and_then(|()| {
      if standing {
        // The value standing is kept by a second name on the same file, so the name never stands empty.
        removed_if_there(&previous)?;
        fs::hard_link(&path, &previous)?;
        fs::set_permissions(&previous, Permissions::from_mode(FILE_MODE))?;
      }

      fs::rename(&hidden, &path)?;
      synced(&folder)
    });

    if let Err(why) = moved {
      let _ = fs::remove_file(&hidden);

      return Err(failed("the value could not be written", &why));
    }

    let written =
      fs::symlink_metadata(&path).map_err(|why| failed("the value written cannot be read", &why))?;
    let what = if standing { Written::Replaced } else { Written::Made };

    Ok((kept(name.to_owned(), &written), what))
  }

  /// The secret under `name` in a space moved to `<name>.previous`, in place of any earlier one.
  pub fn remove(&self, space: Space, name: &str) -> Result<(), Refusal> {
    space.takes(name)?;

    let _writing = self.lock();
    let folder = space.folder(&self.folder);
    let path = folder.join(name);
    let previous = folder.join(format!("{name}{PREVIOUS}"));

    if !regular(&path)? {
      return Err(Refusal::absent("no secret stands under the name"));
    }

    regular(&previous)?;

    fs::rename(&path, &previous)
      .and_then(|()| fs::set_permissions(&previous, Permissions::from_mode(FILE_MODE)))
      .and_then(|()| synced(&folder))
      .map_err(|why| failed("the secret could not be moved aside", &why))
  }
}

// A folder's own entry brought to the disk, so a move onto a name outlives a crash.
fn synced(folder: &Path) -> io::Result<()> {
  File::open(folder)?.sync_all()
}

/// The call is made for the administrator, as the console hands on the login's role; `what` is what the
/// refusal says is the administrator's.
pub fn administrator(headers: &HeaderMap, what: &str) -> Result<(), Refusal> {
  match headers.get(bmo_web_client::OWNER_ROLE).and_then(|role| role.to_str().ok()) {
    Some(ADMINISTRATOR) => Ok(()),
    _ => Err(Refusal::forbidden(format!(
      "{what} is the administrator's: the call names no `Owner-Role: administrator`"
    ))),
  }
}

/// The space the path's user holds, for a call made by that user alone, as the console hands on the login's
/// user: the platform's where sumida names them a platform administrator now, their own under the people's folder
/// otherwise. A user the service holds none of is absent.
async fn space_of(service: &Service, headers: &HeaderMap, user: &str) -> Result<Space, Refusal> {
  let user = user_in(user)?;
  let key = headers.get(OWNER_KEY).and_then(|key| key.to_str().ok()).and_then(crate::ids::parsed);

  if key != Some(user) {
    return Err(Refusal::forbidden(
      "a person's secrets are their own: the call's `Owner-Key` is not the space's user",
    ));
  }

  let stands = one(&service.db, r#"SELECT 1 AS "one" FROM "users" WHERE "id" = $1"#, vec![user.into()])
    .await?
    .is_some();

  if !stands {
    return Err(Refusal::absent(format!("no user {user}")));
  }

  let administrator = Authz::is_superuser(&user_subject(&service.db, user).await?, &service.db).await?;

  Ok(if administrator { Space::Administrator } else { Space::Person(user) })
}

/// The space of the unit the path names, for a call made by one of its heads or the platform administrator; a unit
/// the reader's company does not hold is absent.
async fn unit_space_of(service: &Service, headers: &HeaderMap, unit: &str) -> Result<Space, Refusal> {
  let reader = crate::readers::reader(&service.db, headers).await?;
  let (unit, _) = reader.reached(&service.db, unit).await?;

  if !reader.heads(&service.db, unit).await? {
    return Err(Refusal::forbidden(
      "a unit's secrets are its heads': the call's `Owner-Key` heads no such unit",
    ));
  }

  Ok(Space::Unit(unit))
}

/// The bytes a value carries under its encoding. A value that does not decode is refused naming nothing of it.
pub fn bytes_of(value: String, encoding: SecretEncoding) -> Result<Vec<u8>, Refusal> {
  match encoding {
    SecretEncoding::Text => Ok(value.into_bytes()),
    SecretEncoding::Base64 => STANDARD.decode(value).map_err(|_| {
      Refusal::bad("the value does not decode as base64 under the standard alphabet").coded("bad-value")
    }),
  }
}

fn store_of(service: &Service) -> Result<Arc<Store>, Refusal> {
  service.secrets.clone().ok_or_else(|| {
    Refusal::new(
      StatusCode::SERVICE_UNAVAILABLE,
      "the server's settings name no folder for the secret store, `secrets.dir`",
    )
    .coded("no-secret-store")
  })
}

// The store's work is the file system's, done off the runtime's own threads.
async fn blocking<T: Send + 'static>(
  work: impl FnOnce() -> Result<T, Refusal> + Send + 'static,
) -> Result<T, Refusal> {
  tokio::task::spawn_blocking(work).await.map_err(|why| {
    Refusal::new(StatusCode::INTERNAL_SERVER_ERROR, format!("the store's work did not finish: {why}"))
  })?
}

/// The store's routes, which the server mounts among those that need the model in force.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/users/{user}/secrets", get(list))
    .route("/users/{user}/secrets/{name}", put(write).delete(delete))
    .route("/units/{unit}/secrets", get(unit_list))
    .route("/units/{unit}/secrets/{name}", put(unit_write).delete(unit_delete))
}

/// `GET /units/{unit}/secrets`: every secret's name, size and time in the unit's space, as a person's are listed.
pub async fn unit_list(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment(unit): Segment<String>,
) -> Result<Json<Secrets>, Refusal> {
  let space = unit_space_of(&service, &headers, &unit).await?;
  let store = store_of(&service)?;
  let kinds = secret_kinds::kept(&service.db).await?;
  let secrets = blocking(move || store.list_with_kinds(space, &kinds)).await?;

  Ok(Json(Secrets { secrets }))
}

/// `PUT /units/{unit}/secrets/{name}`: a value written under a name in the unit's space, as a person's is.
pub async fn unit_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment((unit, name)): Segment<(String, String)>,
  body: Bytes,
) -> Result<(StatusCode, Json<Secret>), Refusal> {
  let space = unit_space_of(&service, &headers, &unit).await?;

  put_in(&service, space, name, &body).await
}

/// `DELETE /units/{unit}/secrets/{name}`: the secret moved aside to `<name>.previous` in the unit's space.
pub async fn unit_delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment((unit, name)): Segment<(String, String)>,
) -> Result<StatusCode, Refusal> {
  let space = unit_space_of(&service, &headers, &unit).await?;
  let store = store_of(&service)?;

  blocking(move || store.remove(space, &name)).await?;

  Ok(StatusCode::NO_CONTENT)
}

// The value refused where it reads as a secret kind the space's chain is not offered; a file that reads as no
// kind, one that is not text, and the platform's own space are passed over (docs/accounts.md, 「Secret kinds」).
async fn offered_kind(service: &Service, space: Space, value: &[u8]) -> Result<(), Refusal> {
  let subject = match space {
    Space::Administrator => return Ok(()),
    Space::Person(user) => crate::chain::Subject::Person(user),
    Space::Unit(unit) => crate::chain::Subject::Unit(unit),
  };
  let Some(text) = std::str::from_utf8(value).ok() else {
    return Ok(());
  };
  let kinds = secret_kinds::kept(&service.db).await?;
  let Some(read) = secret_kinds::read_off(text, &kinds) else {
    return Ok(());
  };

  if secret_kinds::offered(&service.db, subject)
    .await
    .is_some_and(|allowed| !allowed.contains(read))
  {
    return Err(
      Refusal::forbidden(format!("the secret kind `{read}` is not offered down this chain"))
        .coded("kind-not-offered"),
    );
  }

  Ok(())
}

// A value written under a name in a space, answered with the status of what the write did. A file that reads as
// one of the secret kinds is refused where that kind is not offered down the space's chain (`secret.kinds`).
async fn put_in(
  service: &Service,
  space: Space,
  name: String,
  body: &[u8],
) -> Result<(StatusCode, Json<Secret>), Refusal> {
  let ask: SecretAsk = serde_json::from_slice(body).map_err(|_| {
    Refusal::bad("the body does not read as a secret's `value`, `replace?` and `encoding?`")
  })?;
  let store = store_of(service)?;
  let value = bytes_of(ask.value.clone(), ask.encoding)?;

  offered_kind(service, space, &value).await?;

  let (kept, written) = blocking(move || store.put(space, &name, &value, ask.replace)).await?;
  let status = match written {
    Written::Made => StatusCode::CREATED,
    Written::Replaced => StatusCode::OK,
  };

  Ok((status, Json(kept)))
}

/// `GET /users/{user}/secrets`: every secret's name, size and time in the user's space, and the kind each reads as.
pub async fn list(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment(user): Segment<String>,
) -> Result<Json<Secrets>, Refusal> {
  let space = space_of(&service, &headers, &user).await?;
  let store = store_of(&service)?;
  let kinds = secret_kinds::kept(&service.db).await?;
  let secrets = blocking(move || store.list_with_kinds(space, &kinds)).await?;

  Ok(Json(Secrets { secrets }))
}

/// `PUT /users/{user}/secrets/{name}`: a value written under a name in the user's space. The body is read here
/// rather than by the routes' own reader, whose refusal repeats what did not read, so no refusal carries a value.
pub async fn write(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment((user, name)): Segment<(String, String)>,
  body: Bytes,
) -> Result<(StatusCode, Json<Secret>), Refusal> {
  let space = space_of(&service, &headers, &user).await?;

  put_in(&service, space, name, &body).await
}

/// `DELETE /users/{user}/secrets/{name}`: the secret moved aside to `<name>.previous` in the user's space.
pub async fn delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment((user, name)): Segment<(String, String)>,
) -> Result<StatusCode, Refusal> {
  let space = space_of(&service, &headers, &user).await?;
  let store = store_of(&service)?;

  blocking(move || store.remove(space, &name)).await?;

  Ok(StatusCode::NO_CONTENT)
}
