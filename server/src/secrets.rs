//! The secret store (docs/accounts.md, 「The secret store」; docs/boundary.md, 「The secret store」): the files under
//! the data root's `env/` every unit reads a secret from by its name. The store writes a value under a name and
//! answers the name, its size and its time; no route reads a value back, and nothing here logs one.

use std::fs::{self, DirBuilder, File, Metadata, OpenOptions, Permissions};
use std::io::{self, ErrorKind, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::UNIX_EPOCH;

use axum::body::Bytes;
use axum::extract::{Path as Segment, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, put};
use axum::{Json, Router};
use bmo_web_client::{OWNER_ROLE, Secret, SecretAsk, Secrets};

use crate::{Refusal, Service};

/// What the value a name held before is kept under: the name, then this.
pub const PREVIOUS: &str = ".previous";
/// The longest name the store takes, so the name with the store's own suffixes stays a file name.
pub const NAME_MAX: usize = 200;
/// The one role the store answers.
pub const ADMINISTRATOR: &str = "administrator";

/// A file's mode: its owner reads and writes it, and nobody else anything.
const FILE_MODE: u32 = 0o600;
/// The folder's mode, where the store makes it.
const FOLDER_MODE: u32 = 0o700;

/// The folder the store writes, and the lock that takes its writes one at a time.
#[derive(Debug)]
pub struct Store {
  folder: PathBuf,
  writing: Mutex<()>,
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
  }
}

fn removed_if_there(path: &Path) -> io::Result<()> {
  match fs::remove_file(path) {
    Err(why) if why.kind() != ErrorKind::NotFound => Err(why),
    _ => Ok(()),
  }
}

/// `value` written whole to a new file of mode 600 and brought to the disk.
fn written_whole(path: &Path, value: &str) -> io::Result<()> {
  removed_if_there(path)?;

  let mut file = OpenOptions::new().write(true).create_new(true).mode(FILE_MODE).open(path)?;

  file.write_all(value.as_bytes())?;
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

  fn path(&self, name: &str) -> PathBuf {
    self.folder.join(name)
  }

  fn previous(&self, name: &str) -> PathBuf {
    self.folder.join(format!("{name}{PREVIOUS}"))
  }

  fn lock(&self) -> MutexGuard<'_, ()> {
    self.writing.lock().unwrap_or_else(PoisonError::into_inner)
  }

  // The folder's own entry brought to the disk, so a move onto a name outlives a crash.
  fn synced(&self) -> io::Result<()> {
    File::open(&self.folder)?.sync_all()
  }

  /// Every secret the folder holds, in the order of their names: its regular files whose names the store takes.
  /// A folder that does not stand yet holds none.
  pub fn list(&self) -> Result<Vec<Secret>, Refusal> {
    let entries = match fs::read_dir(&self.folder) {
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

  /// `value` written under `name`: whole to a hidden file of mode 600 beside it, then moved onto the name. A name
  /// that stands is replaced only where `replace` says so, and the value it held stays as `<name>.previous`.
  pub fn put(&self, name: &str, value: &str, replace: bool) -> Result<(Secret, Written), Refusal> {
    named(name)?;

    if value.is_empty() {
      return Err(Refusal::bad("the value is empty").coded("empty-value"));
    }

    let _writing = self.lock();
    let path = self.path(name);
    let previous = self.previous(name);
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
      .create(&self.folder)
      .map_err(|why| failed("the store's folder cannot be made", &why))?;

    let hidden = self.folder.join(format!(".{name}.{}.writing", std::process::id()));
    let moved = written_whole(&hidden, value).and_then(|()| {
      if standing {
        // The value standing is kept by a second name on the same file, so the name never stands empty.
        removed_if_there(&previous)?;
        fs::hard_link(&path, &previous)?;
        fs::set_permissions(&previous, Permissions::from_mode(FILE_MODE))?;
      }

      fs::rename(&hidden, &path)?;
      self.synced()
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

  /// The secret under `name` moved to `<name>.previous`, in place of any earlier one.
  pub fn remove(&self, name: &str) -> Result<(), Refusal> {
    named(name)?;

    let _writing = self.lock();
    let path = self.path(name);
    let previous = self.previous(name);

    if !regular(&path)? {
      return Err(Refusal::absent("no secret stands under the name"));
    }

    regular(&previous)?;

    fs::rename(&path, &previous)
      .and_then(|()| fs::set_permissions(&previous, Permissions::from_mode(FILE_MODE)))
      .and_then(|()| self.synced())
      .map_err(|why| failed("the secret could not be moved aside", &why))
  }
}

/// The call is made for the administrator, as the console hands on the login's role.
fn administrator(headers: &HeaderMap) -> Result<(), Refusal> {
  match headers.get(OWNER_ROLE).and_then(|role| role.to_str().ok()) {
    Some(ADMINISTRATOR) => Ok(()),
    _ => Err(Refusal::forbidden(
      "the secret store is the administrator's: the call names no `Owner-Role: administrator`",
    )),
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
    .route("/secrets", get(list))
    .route("/secrets/{name}", put(write).delete(delete))
}

/// `GET /secrets`: every secret's name, size and time.
pub async fn list(State(service): State<Service>, headers: HeaderMap) -> Result<Json<Secrets>, Refusal> {
  administrator(&headers)?;

  let store = store_of(&service)?;
  let secrets = blocking(move || store.list()).await?;

  Ok(Json(Secrets { secrets }))
}

/// `PUT /secrets/{name}`: a value written under a name. The body is read here rather than by the routes' own
/// reader, whose refusal repeats what did not read, so no refusal carries a value.
pub async fn write(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment(name): Segment<String>,
  body: Bytes,
) -> Result<(StatusCode, Json<Secret>), Refusal> {
  administrator(&headers)?;

  let ask: SecretAsk = serde_json::from_slice(&body)
    .map_err(|_| Refusal::bad("the body does not read as a secret's `value` and `replace?`"))?;
  let store = store_of(&service)?;
  let (kept, written) = blocking(move || store.put(&name, &ask.value, ask.replace)).await?;
  let status = match written {
    Written::Made => StatusCode::CREATED,
    Written::Replaced => StatusCode::OK,
  };

  Ok((status, Json(kept)))
}

/// `DELETE /secrets/{name}`: the secret moved aside to `<name>.previous`.
pub async fn delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Segment(name): Segment<String>,
) -> Result<StatusCode, Refusal> {
  administrator(&headers)?;

  let store = store_of(&service)?;

  blocking(move || store.remove(&name)).await?;

  Ok(StatusCode::NO_CONTENT)
}
