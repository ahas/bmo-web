//! What the server's tests stand on: a database of the test's own on the test server, copied from a
//! template this binary migrates once, or a database a module's tests share, seeded once; the rules
//! standing on it; sumida's settings, set once before its first reading; and a receiver stand-in that knows
//! the messages a test put in rooms. A database is dropped when its guard goes, and what a binary that is gone
//! left behind is dropped by the next binary to make one.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, Once};

use bmo_web_server::migration::Migrator;
use bmo_web_server::receiver::{Holding, Receiver, no_such_message};
use bmo_web_server::routes::stand;
use bmo_web_server::settings::Names;
use bmo_web_server::{Refusal, Service, store};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, Value};
use sea_orm_migration::MigratorTrait;
use sqlx::postgres::{PgConnectOptions, PgConnection};
use sqlx::{Connection as _, Executor};

// What a template's, a copy's and a shared database's names begin with, ahead of the process that made them.
const TEMPLATE: &str = "bmo_web_tmpl_";
const COPY: &str = "bmo_web_copy_";
const SHARED: &str = "bmo_web_shared_";

static COPIES: AtomicU32 = AtomicU32::new(0);
static SHAREDS: AtomicU32 = AtomicU32::new(0);
static MADE: tokio::sync::OnceCell<String> = tokio::sync::OnceCell::const_new();
static SUMIDA: Once = Once::new();

/// sumida's settings: its file, and sessions on a Valkey database of the tests' own. sumida reads them once, at
/// its first reading, so every test that stands up its routes asks this first.
pub fn ready() {
  SUMIDA.call_once(|| {
    // SAFETY: the standard library guards its own reads and writes of the environment with one lock, every read
    // in this process is made through it, and every test that stands up sumida's routes waits here first.
    unsafe {
      std::env::set_var("SUMIDA_SETTINGS", concat!(env!("CARGO_MANIFEST_DIR"), "/sumida.toml"));
      std::env::set_var("SUMIDA_SESSION__REDIS__URL", "redis://127.0.0.1:6379/15");
    }
  });
}

/// The test server, as the suite names it, and the machine's own socket where nothing does.
pub fn test_address() -> String {
  std::env::var("BMO_TEST_POSTGRES")
    .ok()
    .filter(|named| !named.is_empty())
    .unwrap_or_else(|| "postgres:///bmo_test?host=/var/run/postgresql".into())
}

/// Whether a process is alive, read off the kernel's own listing.
fn alive(pid: &str) -> bool {
  std::path::Path::new("/proc").join(pid).exists()
}

/// The test server's address with another database in place of its own.
pub fn address_of(database: &str) -> String {
  let mut address = url::Url::parse(&test_address()).expect("the test server's address is a URL");

  address.set_path(&format!("/{database}"));
  address.to_string()
}

async fn server() -> PgConnection {
  let options = PgConnectOptions::from_str(&address_of("postgres")).expect("the server's address reads");

  PgConnection::connect_with(&options).await.expect("the test server answers")
}

async fn create(admin: &mut PgConnection, database: &str, template: &str) {
  admin
    .execute(format!("CREATE DATABASE \"{database}\" TEMPLATE {template}").as_str())
    .await
    .expect("the database is made");
}

// The template this binary's copies are made from, migrated the first time a test asks. The databases a
// binary that is gone left behind are dropped first.
async fn template() -> String {
  MADE
    .get_or_init(|| async {
      let mut admin = server().await;
      let left: Vec<String> = sqlx::query_scalar(
        "SELECT datname::text FROM pg_database WHERE datname LIKE $1 OR datname LIKE $2 OR datname LIKE $3",
      )
      .bind(format!("{}%", TEMPLATE.replace('_', "\\_")))
      .bind(format!("{}%", COPY.replace('_', "\\_")))
      .bind(format!("{}%", SHARED.replace('_', "\\_")))
      .fetch_all(&mut admin)
      .await
      .expect("the left databases are listed");

      for old in left {
        let pid = old
          .trim_start_matches(TEMPLATE)
          .trim_start_matches(COPY)
          .trim_start_matches(SHARED)
          .split('_')
          .next()
          .unwrap_or_default();

        if !alive(pid) {
          let _ = admin.execute(format!("DROP DATABASE IF EXISTS \"{old}\" WITH (FORCE)").as_str()).await;
        }
      }

      let name = format!("{TEMPLATE}{}", std::process::id());

      create(&mut admin, &name, "template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'").await;
      admin.close().await.expect("the server connection closes");

      let db = connect(&name).await;

      Migrator::up(&db, None).await.expect("the template migrates");
      db.close().await.expect("the template's connection closes");

      name
    })
    .await
    .clone()
}

/// A connection to a database of the test server, through the service's own pool.
pub async fn connect(database: &str) -> DatabaseConnection {
  store::connect(&address_of(database), store::pool(4))
    .await
    .expect("the database answers")
}

/// The messages standing in rooms, as the receiver would say who sent them, and the holders declared to it.
#[derive(Clone, Default)]
pub struct Messages(
  Arc<Mutex<HashMap<(i64, i64), i64>>>,
  pub Arc<Mutex<Vec<(String, String)>>>,
  pub Arc<Mutex<HashMap<i64, Vec<i32>>>>,
);

#[async_trait::async_trait]
impl Receiver for Messages {
  async fn sender_of(&self, room: i64, message: i64) -> Result<Option<i64>, Refusal> {
    let held = self.0.lock().expect("the messages are readable").get(&(room, message)).copied();

    held.map(Some).ok_or_else(|| no_such_message(room, message))
  }

  async fn declare_holder(&self, unit: &str, address: &str, _holdings: &[Holding]) -> Result<(), Refusal> {
    self
      .1
      .lock()
      .expect("the declarations are writable")
      .push((unit.to_owned(), address.to_owned()));

    Ok(())
  }

  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal> {
    Ok(self.2.lock().expect("the leaders are readable").get(&room).cloned().unwrap_or_default())
  }
}

/// A database of the test's own or a binary's shared one, with the rules standing on it.
pub struct Scratch {
  database: String,
  pub service: Service,
  pub messages: Messages,
  kept: bool,
}

/// A database a module's tests share, made and seeded by the first test to ask, one for each value of this type.
/// Each test stands the service on a pool of its own, since a pool lives no longer than the runtime of the test
/// that made it.
pub struct SharedDatabase(tokio::sync::OnceCell<(String, Messages)>);

impl SharedDatabase {
  pub const fn new() -> SharedDatabase {
    SharedDatabase(tokio::sync::OnceCell::const_new())
  }

  pub async fn get<F, Seeded>(&self, seed: F) -> Scratch
  where
    F: FnOnce(Scratch) -> Seeded,
    Seeded: Future<Output = Scratch>,
  {
    let (database, messages) = self
      .0
      .get_or_init(|| async {
        let name = format!("{SHARED}{}_{}", std::process::id(), SHAREDS.fetch_add(1, Ordering::SeqCst));
        let seeded = seed(Scratch::made(&name, true).await).await;

        (seeded.database.clone(), seeded.messages.clone())
      })
      .await
      .clone();
    let service = stand(connect(&database).await, Arc::new(messages.clone()), names())
      .await
      .expect("the rules stand");

    Scratch {
      database,
      service,
      messages,
      kept: true,
    }
  }
}

impl Scratch {
  /// A copy of this binary's migrated, empty template.
  pub async fn new() -> Scratch {
    let name = format!("{COPY}{}_{}", std::process::id(), COPIES.fetch_add(1, Ordering::SeqCst));

    Self::made(&name, false).await
  }

  async fn made(database: &str, kept: bool) -> Scratch {
    let template = template().await;
    let mut admin = server().await;

    create(&mut admin, database, &format!("\"{template}\"")).await;
    admin.close().await.expect("the server connection closes");

    let messages = Messages::default();
    let service = stand(connect(database).await, Arc::new(messages.clone()), names())
      .await
      .expect("the rules stand");

    Scratch {
      database: database.to_owned(),
      service,
      messages,
      kept,
    }
  }

  /// The database's address, as a reader handed one opens it.
  pub fn address(&self) -> String {
    address_of(&self.database)
  }

  pub fn db(&self) -> &DatabaseConnection {
    &self.service.db
  }

  /// A statement run as written.
  pub async fn run(&self, sql: &str, values: Vec<Value>) {
    self
      .db()
      .execute(Statement::from_sql_and_values(DbBackend::Postgres, sql, values))
      .await
      .expect("the statement runs");
  }

  /// A message standing in a room, sent by a sender, as the receiver keeps it.
  pub fn message(&self, room: i64, message: i64, sender: i64) {
    self
      .messages
      .0
      .lock()
      .expect("the messages are writable")
      .insert((room, message), sender);
  }

  /// The console's one account, with a hash of the form the console makes.
  pub async fn console_account(&self, name: &str, hash: &str) {
    self
      .run(
        r#"INSERT INTO "web_users" ("name", "password_hash", "created_at") VALUES ($1, $2, 1)"#,
        vec![name.into(), hash.into()],
      )
      .await;
  }

  /// A count a statement answers.
  pub async fn count(&self, sql: &str, values: Vec<Value>) -> i64 {
    let row = self
      .db()
      .query_one(Statement::from_sql_and_values(DbBackend::Postgres, sql, values))
      .await
      .expect("the statement reads")
      .expect("a row");

    row.try_get_by_index::<i64>(0).expect("a count")
  }
}

impl Drop for Scratch {
  fn drop(&mut self) {
    if self.kept {
      return;
    }

    let database = std::mem::take(&mut self.database);

    // The database goes on a thread of its own, since a guard dropped inside the runtime may not block on
    // it.
    let _ = std::thread::spawn(move || {
      let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("a runtime is built");

      runtime.block_on(async move {
        let mut admin = server().await;

        let _ = admin
          .execute(format!("DROP DATABASE IF EXISTS \"{database}\" WITH (FORCE)").as_str())
          .await;
        let _ = admin.close().await;
      });
    })
    .join();
  }
}

/// A password hash of the kind the console's account command makes: argon2id in its PHC form.
pub fn console_hash(password: &str) -> String {
  use argon2::password_hash::rand_core::OsRng;
  use argon2::password_hash::{PasswordHasher, SaltString};

  let salt = SaltString::generate(&mut OsRng);

  argon2::Argon2::default().hash_password(password.as_bytes(), &salt).unwrap().to_string()
}

/// The fixed numbers a test names the owner and a group room by, the values the testbed's test ids hold.
pub const OWNER: i64 = 42;
pub const ROOM: i64 = -100;

/// The name a test's chat agent goes by.
pub const CHAT_AGENT: &str = "agent-1";

/// The names a test's service fills the pack's lines with.
pub fn names() -> Names {
  Names {
    chat_agent: CHAT_AGENT.to_owned(),
  }
}
