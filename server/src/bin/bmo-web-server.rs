//! The server's binary (docs/accounts.md): `serve` stands the account service on the address its settings
//! name, `migrate` brings its database up to date, `settings` refuses settings `serve` would not stand on,
//! `health` asks the service standing there whether it answers, `user` is the account command, and `wording` writes
//! the document wording files, one to a language, from the language pack.

use std::fs;
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;

use bmo_web_server::agency::{Agency, AgencyClient, NoAgency};
use bmo_web_server::data_move::moved;
use bmo_web_server::lang::Language;
use bmo_web_server::receiver::{NoReceiver, Receiver, ReceiverClient};
use bmo_web_server::routes::{in_force, stand};
use bmo_web_server::rules::RULES;
use bmo_web_server::settings::Settings;
use bmo_web_server::users::set_sign_in;
use bmo_web_server::wording::{document_wording, wording_file};
use bmo_web_server::{migration, secrets, store};
use clap::{Parser, Subcommand};
use sumida::api::authz::Authz;
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};

// The account service's own runtime: sumida's user-agent parser keeps its scratch tables on every thread
// that reads a session, so the service is kept to these few (docs/accounts.md, 「What it is」).
const ACCOUNT_THREADS: usize = 2;
const ACCOUNT_THREAD_NAME: &str = "account-service";

#[derive(Parser)]
#[command(
  name = "bmo-web-server",
  version,
  about = "The web console's server: the account service on sumida."
)]
struct Cli {
  #[command(subcommand)]
  verb: Verb,
}

#[derive(Subcommand)]
enum Verb {
  /// Stands the account service on the address the settings name, until the process is stopped.
  Serve,
  /// Brings the database the settings name up to date with every migration.
  Migrate,
  /// Reads the settings and refuses, saying why, where `serve` would not stand on them: a deployment asks it before
  /// it puts a release live (docs/boundary.md, 「Settings」).
  Settings,
  /// Asks the service on the address the settings name whether it answers, waiting at most a few seconds:
  /// ends 0 where it does, and 1 otherwise, saying why (docs/accounts.md, 「Where it answers」).
  Health,
  /// Makes the user a name signs in as, or gives one standing a new password, read from standard input
  /// (docs/accounts.md, 「The account command」).
  User {
    /// The name the user signs in with.
    name: String,
    /// Makes the user the platform administrator too.
    #[arg(long)]
    administrator: bool,
  },
  /// Writes the document wording files bmo-artifact reads, one to a language, from the language pack
  /// (docs/language-pack.md, 「What other units read」).
  Wording {
    /// The folder the files are written into, each as `documents.<language>.yaml`.
    folder: PathBuf,
  },
  /// Moves the old archive's exported rows into this store (docs/accounts.md, TODO #1923).
  Import {
    /// The export directory the item's export hand wrote.
    #[arg(long, value_name = "dir")]
    export: PathBuf,
    /// The PostgreSQL database written.
    #[arg(long, value_name = "url")]
    database: String,
    /// Reads, checks and counts everything, and writes nothing.
    #[arg(long)]
    dry_run: bool,
  },
}

fn refused(why: impl std::fmt::Display) -> ExitCode {
  eprintln!("bmo-web-server: {why}");

  ExitCode::FAILURE
}

/// The folder sumida's settings are written into: the user's runtime folder where one stands, the system's
/// temporary folder otherwise.
fn runtime_dir() -> PathBuf {
  std::env::var_os("XDG_RUNTIME_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(std::env::temp_dir)
    .join("bmo-web-server")
}

/// sumida's settings written into the runtime folder and named for sumida, with the values that are not
/// fixed handed in its own environment variables. sumida reads them once, at its first reading, so this runs
/// before anything else does.
fn settle_sumida(settings: &Settings) -> io::Result<()> {
  let dir = runtime_dir();

  fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir)?;

  let path = dir.join(format!("sumida-{}.toml", std::process::id()));

  fs::write(&path, include_str!("../../sumida.toml"))?;
  fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;

  // SAFETY: the process holds one thread yet, so nothing reads the environment while it is written.
  unsafe {
    std::env::set_var("SUMIDA_SETTINGS", &path);
    std::env::set_var("SUMIDA_DATABASE__URL", &settings.database.url);
    std::env::set_var("SUMIDA_SESSION__REDIS__URL", &settings.sessions.valkey);
  }

  Ok(())
}

/// The receiver the settings name, or one naming no room's leader where they name none.
fn receiver(settings: &Settings) -> Result<Arc<dyn Receiver>, String> {
  match (&settings.receiver.base, &settings.receiver.token) {
    (Some(base), Some(token)) => Ok(Arc::new(ReceiverClient::new(base, token)?)),
    (None, None) => Ok(Arc::new(NoReceiver)),
    _ => Err("the receiver's settings name its address and its token together, or neither".to_owned()),
  }
}

async fn stopped() {
  let (Ok(mut term), Ok(mut interrupt)) =
    (signal(SignalKind::terminate()), signal(SignalKind::interrupt()))
  else {
    return std::future::pending().await;
  };

  tokio::select! {
    _ = term.recv() => {}
    _ = interrupt.recv() => {}
  }
}

/// The settings a deployment must set, without which the service does not stand: the token every caller presents,
/// and the chat agent's name a fixed line says it as; and a time zone, where one is set, that reads as one. The token
/// answers where they stand.
fn standing(settings: &Settings) -> Result<String, String> {
  let token = settings
    .server
    .token
    .clone()
    .filter(|token| !token.trim().is_empty())
    .ok_or("the server does not stand without its token, `server.token`")?;

  if settings.names.chat_agent.trim().is_empty() {
    return Err("the server does not stand without the chat agent's name, `names.chat_agent`".to_owned());
  }

  settings.time.zone()?;
  settings.mail.credential()?;

  Ok(token)
}

/// The account service on its address, until the process is stopped. Once it listens it registers its supply hook
/// at the agency; a registration not going through is said, and the service stands, registering again at its next
/// start (docs/accounts.md, 「Supply」).
async fn serve(settings: Settings) -> Result<(), String> {
  let token = standing(&settings)?;

  let listen = settings.server.listen;
  let listener = TcpListener::bind(listen)
    .await
    .map_err(|why| format!("{listen} cannot be listened on: {why}"))?;
  let db = store::connect(&settings.database.url, store::pool(5).min_connections(1))
    .await
    .map_err(|why| format!("the service's database could not be reached: {why}"))?;
  let receiver = receiver(&settings)?;
  let agency = agency(&settings)?;
  let service = stand(db, receiver, settings.names.clone())
    .await
    .map_err(|why| format!("the rules do not stand on the service's database: {why}"))?;
  let service = match settings.secrets.folder() {
    Some(folder) => service.keeping_secrets(secrets::Store::at(folder)),
    None => service,
  };
  let service = match bmo_web_server::nodes::Nodes::from_settings(&settings.jake) {
    Some(nodes) => service.with_nodes(nodes),
    None => service,
  };
  let mail_token = settings.mail.credential()?;
  let mail = bmo_web_server::security::mail::named(settings.mail.base.as_ref(), mail_token.as_ref())?;
  let service = service.calling_agency(agency.clone()).sending_mail(mail).in_zone(settings.time.zone()?);
  // The membership domain's expiry, renewal and notices, run hourly on this service's own state and its
  // own advisory lock, as sumida's membership guide asks, and every applied plan whose period ended subscribed
  // again after them (docs/accounts.md, 「Supply」, 「An organisation's plans」).
  let scheduler = tokio::spawn(membership(service.clone()));
  let app = in_force(service, token.clone()).await.map_err(|why| why.to_string())?;
  let address = settings.server.address();

  println!("bmo-web-server {} on {listen}", bmo_web_server::VERSION);
  let _ = io::stdout().flush();

  let hook_url = format!("{address}/supply/hook");

  tokio::spawn(async move {
    if let Err(why) = agency.register_supply(&hook_url, &token).await {
      eprintln!("bmo-web-server: {why}");
    }
  });

  axum::serve(listener, app)
    .with_graceful_shutdown(stopped())
    .await
    .map_err(|why| why.to_string())?;
  scheduler.abort();

  Ok(())
}

/// The hourly membership pass, the first at once, each failure said and the next pass run all the same.
async fn membership(service: bmo_web_server::Service) {
  let mut ticker = tokio::time::interval(std::time::Duration::from_secs(3600));

  ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
  loop {
    ticker.tick().await;
    match bmo_web_server::supply::plans::membership_pass(&service).await {
      Ok(renewal) => renewal.failed.iter().for_each(|why| eprintln!("bmo-web-server: {why}")),
      Err(why) => eprintln!("bmo-web-server: the applied plans were not renewed: {why}"),
    }
  }
}

/// The agency the settings name, or one that registers nothing and refuses every read where they name none.
fn agency(settings: &Settings) -> Result<Arc<dyn Agency>, String> {
  match (&settings.agency.base, &settings.agency.token) {
    (Some(base), Some(token)) => Ok(Arc::new(AgencyClient::new(base, token)?)),
    (None, None) => Ok(Arc::new(NoAgency)),
    _ => Err("the agency's settings name its address and its token together, or neither".to_owned()),
  }
}

/// The account command: the user written into the database the service reads, refused where the data move
/// has not run, since there the console's own accounts sign in.
async fn user(settings: Settings, name: String, administrator: bool) -> ExitCode {
  let mut password = String::new();

  if let Err(why) = io::stdin().read_line(&mut password) {
    return refused(format!("the password could not be read from standard input: {why}"));
  }

  let password = password.trim_end_matches(['\r', '\n']);
  let db = match store::connect(&settings.database.url, store::pool(1)).await {
    Ok(db) => db,
    Err(why) => return refused(format!("the service's database could not be reached: {why}")),
  };

  match moved(&db).await {
    Ok(true) => {}
    Ok(false) => return refused("the data move has not run, so the console's own accounts sign in"),
    Err(why) => return refused(why),
  }

  // A user made is given their console sections, which are relations of the deployment's rules: the rules are
  // installed here and their schema kept on the database before the user is written.
  if let Err(why) = Authz::install_rules(RULES) {
    return refused(format!("the rules do not stand: {why}"));
  }
  if let Err(why) = Authz::sync_schema(&db).await {
    return refused(format!("the rules' schema does not stand on the database: {why}"));
  }

  match set_sign_in(&db, &name, password, administrator).await {
    Ok(set) => {
      let what = if set.made { "made" } else { "given the new password" };
      let role = if administrator { ", the platform administrator" } else { "" };

      println!("bmo-web-server: user {name} ({}) {what}{role}", set.user);

      ExitCode::SUCCESS
    }
    Err(why) => refused(why),
  }
}

/// Whether the service on the address the settings name answers its health route, and why not where it does not.
/// The ask waits for the service's answer; it ends on that answer or on its connection refused or broken.
async fn health(settings: &Settings) -> Result<(), String> {
  let address = format!("{}/health", settings.server.address());
  let answer = reqwest::Client::new()
    .get(&address)
    .send()
    .await
    .map_err(|why| format!("nothing answered at {address}: {why}"))?;

  if answer.status().is_success() {
    Ok(())
  } else {
    Err(format!("{address} answered {}", answer.status()))
  }
}

// The document wording files written into `folder`, one to a language, from the pack alone, so a release writes
// them with no settings.
fn wording(folder: &Path) -> ExitCode {
  let written = Language::ALL.into_iter().try_for_each(|language| {
    let file = folder.join(wording_file(language));

    document_wording(language).and_then(|text| {
      fs::write(&file, text).map_err(|why| format!("{} cannot be written: {why}", file.display()))
    })
  });

  match written {
    Ok(()) => ExitCode::SUCCESS,
    Err(why) => refused(why),
  }
}

fn main() -> ExitCode {
  let cli = Cli::parse();

  if let Verb::Wording { folder } = &cli.verb {
    return wording(folder);
  }

  // The import reads its own arguments and never the deployment's settings.
  if let Verb::Import {
    export,
    database,
    dry_run,
  } = &cli.verb
  {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build();
    return match runtime.map_err(|why| why.to_string()).and_then(|runtime| {
      runtime.block_on(async {
        match bmo_web_server::import::run(database, export, *dry_run).await {
          Ok(report) => {
            for moved in &report.tables {
              println!("{}: {} exported, {} written", moved.source, moved.exported, moved.written);
            }
            println!(
              "{} at snapshot {} read {}: {} rows sampled, {} failures",
              if report.dry_run { "dry run" } else { "import" },
              report.snapshot,
              report.read_at,
              report.sample.checked,
              report.sample.failures.len()
            );
            for failure in &report.sample.failures {
              eprintln!("  {failure}");
            }
            if report.sample.failures.is_empty() {
              Ok(())
            } else {
              Err("the count-and-sample compare failed".to_owned())
            }
          }
          Err(why) => Err(why),
        }
      })
    }) {
      Ok(()) => ExitCode::SUCCESS,
      Err(why) => refused(why),
    };
  }

  let settings = match Settings::load() {
    Ok(settings) => settings,
    Err(why) => return refused(why),
  };

  // The settings are read and held to what the service stands on, which settles nothing.
  if let Verb::Settings = &cli.verb {
    return match standing(&settings) {
      Ok(_) => ExitCode::SUCCESS,
      Err(why) => refused(why),
    };
  }

  // The health asks the service standing over HTTP and reads nothing sumida keeps, so it settles nothing.
  if let Verb::Health = &cli.verb {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build();

    return match runtime
      .map_err(|why| why.to_string())
      .and_then(|runtime| runtime.block_on(health(&settings)))
    {
      Ok(()) => ExitCode::SUCCESS,
      Err(why) => refused(why),
    };
  }

  if let Err(why) = settle_sumida(&settings) {
    return refused(format!("sumida's settings could not be written: {why}"));
  }

  let runtime = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(ACCOUNT_THREADS)
    .thread_name(ACCOUNT_THREAD_NAME)
    .enable_all()
    .build();
  let runtime = match runtime {
    Ok(runtime) => runtime,
    Err(why) => return refused(format!("the account service's runtime: {why}")),
  };

  runtime.block_on(async move {
    match cli.verb {
      Verb::Serve => match serve(settings).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(why) => refused(why),
      },
      Verb::Migrate => match migration::migrate(&settings.database.url).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(why) => refused(format!("the migrations did not run: {why}")),
      },
      Verb::User {
        name,
        administrator,
      } => user(settings, name, administrator).await,
      Verb::Wording { .. } | Verb::Health | Verb::Settings | Verb::Import { .. } => ExitCode::SUCCESS,
    }
  })
}
