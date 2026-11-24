//! What the server's tests stand on: a database of the test's own on the test server, copied from a
//! template this binary migrates once, or a database a module's tests share, seeded once; the rules
//! standing on it; sumida's settings, set once before its first reading; and a receiver stand-in that knows
//! the leaders a test gave rooms. A copy is dropped when its guard goes, and the test fails if it cannot
//! be; before a binary makes its first database, the templates, copies and shared databases a binary that is
//! gone left behind are dropped (`docs/checks.md`, 「The scratch databases」).

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, Once};

use bmo_web_server::receiver::Receiver;
use bmo_web_server::routes::stand;
use bmo_web_server::settings::Names;
use bmo_web_server::{Refusal, Service, store};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, Value};
use sqlx::postgres::{PgConnectOptions, PgConnection};
use sqlx::{Connection as _, Executor};

/// What a template's name begins with, followed by the process that made it.
const TEMPLATE: &str = "bmo_web_tmpl_";
/// What a copy's name begins with, followed by the process that made it and a count.
const COPY: &str = "bmo_web_copy_";
/// What a shared database's name begins with, followed by the process that made it and a count.
const SHARED: &str = "bmo_web_shared_";
/// How many times a drop ends the database's sessions and tries again before it gives up.
const DROP_ATTEMPTS: usize = 3;

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

/// The test server's address with another database in place of its own.
pub fn address_of(database: &str) -> String {
  let mut address = url::Url::parse(&test_address()).expect("the test server's address is a URL");

  address.set_path(&format!("/{database}"));
  address.to_string()
}

async fn server() -> Result<PgConnection, sqlx::Error> {
  let options = PgConnectOptions::from_str(&address_of("postgres"))?;

  PgConnection::connect_with(&options).await
}

async fn create(admin: &mut PgConnection, database: &str, template: &str) {
  admin
    .execute(format!("CREATE DATABASE \"{database}\" TEMPLATE {template}").as_str())
    .await
    .expect("the database is made");
}

// The template this binary's copies are made from, migrated the first time a test asks, once the
// databases a binary that is gone left behind are swept.
async fn template() -> String {
  MADE
    .get_or_init(|| async {
      let mut admin = server().await.expect("the test server answers");

      sweep(&mut admin).await;

      let name = format!("{TEMPLATE}{}", std::process::id());

      create(&mut admin, &name, "template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'").await;
      admin.close().await.expect("the server connection closes");

      let db = connect(&name).await;

      bmo_web_server::migration::up(&db).await.expect("the template migrates");
      db.close().await.expect("the template's connection closes");

      name
    })
    .await
    .clone()
}

/// Drops `database`. This role's own sessions on it are ended first, since a drop that forces every session
/// off needs the right to end other roles' processes, an autovacuum worker's among them, which the suite's
/// role need not hold; the plain drop then stops an autovacuum worker itself and waits for the ended sessions
/// to leave. A session that opened between the two is ended on the next attempt.
async fn drop_database(admin: &mut PgConnection, database: &str) -> Result<(), sqlx::Error> {
  let mut attempt = 1;

  loop {
    sqlx::query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
       WHERE datname = $1 AND pid <> pg_backend_pid() AND usename = current_user",
    )
    .bind(database)
    .execute(&mut *admin)
    .await?;

    match admin.execute(format!("DROP DATABASE IF EXISTS \"{database}\"").as_str()).await {
      Ok(_) => return Ok(()),
      Err(error) if attempt == DROP_ATTEMPTS => return Err(error),
      Err(_) => attempt += 1,
    }
  }
}

/// Drops every template, copy and shared database a dead process of this harness left. A database is left
/// alone while its process runs on this machine or a client's session is on it, so a run of another
/// checkout's harness against the same server keeps its own; this process has made none yet, so its own id
/// counts as gone. A database the sweep cannot drop is named on the error stream and left for the next run.
async fn sweep(admin: &mut PgConnection) {
  let unattended: Vec<String> = match sqlx::query_scalar(
    "SELECT datname::text FROM pg_database d WHERE NOT EXISTS \
     (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname AND a.backend_type = 'client backend')",
  )
  .fetch_all(&mut *admin)
  .await
  {
    Ok(names) => names,
    Err(error) => {
      eprintln!("the scratch sweep lists no databases: {error}");
      return;
    }
  };

  for name in unattended {
    let Some(process) = process_of(&name) else {
      continue;
    };

    if lives(process) {
      continue;
    }

    if let Err(error) = drop_database(admin, &name).await {
      eprintln!("the scratch sweep leaves {name}: {error}");
    }
  }
}

/// The process id a template's, a copy's or a shared database's name carries, if the name is one the sweep
/// drops: one of its prefixes followed by the id alone or by the id and a count.
fn process_of(name: &str) -> Option<u32> {
  let rest = [TEMPLATE, COPY, SHARED].into_iter().find_map(|prefix| name.strip_prefix(prefix))?;
  let (process, count) = rest.split_once('_').unwrap_or((rest, "0"));

  count.parse::<u32>().ok()?;
  process.parse().ok()
}

/// Whether process `id`, other than this one, is running on this machine. Where the process table cannot be
/// read every process counts as alive, so nothing is dropped on a guess.
fn lives(id: u32) -> bool {
  let table = std::path::Path::new("/proc");

  id != std::process::id() && (!table.join("self").exists() || table.join(id.to_string()).exists())
}

/// A connection to a database of the test server, through the service's own pool.
pub async fn connect(database: &str) -> DatabaseConnection {
  store::connect(&address_of(database), store::pool(4))
    .await
    .expect("the database answers")
}

/// The leaders of rooms, as the receiver would answer them: the users who own a supervisor a room names.
#[derive(Clone, Default)]
pub struct Leaders(pub Arc<Mutex<HashMap<i64, Vec<i32>>>>);

#[async_trait::async_trait]
impl Receiver for Leaders {
  async fn leaders_of(&self, room: i64) -> Result<Vec<i32>, Refusal> {
    Ok(self.0.lock().expect("the leaders are readable").get(&room).cloned().unwrap_or_default())
  }
}

/// A database of the test's own or a binary's shared one, with the rules standing on it.
pub struct Scratch {
  database: String,
  pub service: Service,
  pub leaders: Leaders,
  kept: bool,
}

/// A database a module's tests share, made and seeded by the first test to ask, one for each value of this type.
/// Each test stands the service on a pool of its own, since a pool lives no longer than the runtime of the test
/// that made it.
pub struct SharedDatabase(tokio::sync::OnceCell<(String, Leaders)>);

impl SharedDatabase {
  pub const fn new() -> SharedDatabase {
    SharedDatabase(tokio::sync::OnceCell::const_new())
  }

  pub async fn get<F, Seeded>(&self, seed: F) -> Scratch
  where
    F: FnOnce(Scratch) -> Seeded,
    Seeded: Future<Output = Scratch>,
  {
    let (database, leaders) = self
      .0
      .get_or_init(|| async {
        let name = format!("{SHARED}{}_{}", std::process::id(), SHAREDS.fetch_add(1, Ordering::SeqCst));
        let seeded = seed(Scratch::made(&name, true).await).await;

        (seeded.database.clone(), seeded.leaders.clone())
      })
      .await
      .clone();
    let service = stand(connect(&database).await, Arc::new(leaders.clone()), names())
      .await
      .expect("the rules stand");

    Scratch {
      database,
      service,
      leaders,
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
    let mut admin = server().await.expect("the test server answers");

    create(&mut admin, database, &format!("\"{template}\"")).await;
    admin.close().await.expect("the server connection closes");

    let leaders = Leaders::default();
    let service = stand(connect(database).await, Arc::new(leaders.clone()), names())
      .await
      .expect("the rules stand");

    Scratch {
      database: database.to_owned(),
      service,
      leaders,
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
    if !self.kept {
      dropped(std::mem::take(&mut self.database));
    }
  }
}

/// A blank database of the test's own, made from no template, for the tests of the migrations themselves; its
/// name is a copy's, so the sweep drops it where its binary left it.
pub struct Blank {
  database: String,
  pub db: DatabaseConnection,
}

impl Blank {
  pub async fn new() -> Blank {
    // The template's making sweeps what dead binaries left first, so the sweep never meets this database.
    template().await;

    let database = format!("{COPY}{}_{}", std::process::id(), COPIES.fetch_add(1, Ordering::SeqCst));
    let mut admin = server().await.expect("the test server answers");

    create(&mut admin, &database, "template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'").await;
    admin.close().await.expect("the server connection closes");

    let db = connect(&database).await;

    Blank { database, db }
  }
}

impl Drop for Blank {
  fn drop(&mut self) {
    dropped(std::mem::take(&mut self.database));
  }
}

/// A test's own database dropped as its guard goes, the test failing where it cannot be. The database goes on a
/// thread of its own, since a guard dropped inside the runtime may not block on it.
fn dropped(database: String) {
  let dropped = std::thread::spawn(move || {
    tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .expect("a runtime is built")
      .block_on(async move {
        let mut admin = server().await.map_err(|error| error.to_string())?;
        let dropped = drop_database(&mut admin, &database)
          .await
          .map_err(|error| format!("{database}: {error}"));
        let _ = admin.close().await;

        dropped
      })
  })
  .join()
  .expect("the drop ends");

  if let Err(error) = dropped
    && !std::thread::panicking()
  {
    panic!("the scratch database is dropped: {error}");
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
