//! The settings: `settings.toml`, overridden by `settings.local.toml` and then by the environment
//! (docs/boundary.md, 「Settings」). Both files are read from the directory the process starts in.

use std::net::SocketAddr;

use config::{Config, Environment, File, FileFormat};
use serde::Deserialize;

/// The settings file every deployment reads.
pub const SETTINGS_FILE: &str = "settings.toml";
/// The file a deployment overrides it with, which git ignores.
pub const LOCAL_SETTINGS_FILE: &str = "settings.local.toml";
/// What every environment variable that sets a key begins with.
pub const ENVIRONMENT_PREFIX: &str = "BMO_WEB_SERVER";

/// Everything the server and its verbs are started with.
#[derive(Clone, Debug, Deserialize)]
pub struct Settings {
  pub server: Server,
  pub database: Database,
  pub sessions: Sessions,
  /// Nothing set here leaves the receiver unknown.
  #[serde(default)]
  pub receiver: Unit,
  /// Nothing set here leaves the agency unknown: no supply hook is registered and no person's personal
  /// supply roads are readable (docs/accounts.md, 「Supply」).
  #[serde(default)]
  pub agency: Unit,
  #[serde(default)]
  pub names: Names,
  /// Nothing set here leaves the secret store standing on no folder.
  #[serde(default)]
  pub secrets: SecretStore,
  /// Nothing set here makes no invitation and reads every machine as gone.
  #[serde(default)]
  pub jake: Jake,
}

/// The jake hub invited machines attach to (docs/accounts.md, 「Invitations and a person's machine」).
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Jake {
  /// The address a machine dials, which its install names.
  pub hub_url: Option<String>,
  /// The folder jake's install scripts are served under, `https://host/path`.
  pub install_base: Option<String>,
  /// The key a machine's credential is made with, the hub's own.
  pub agent_key: Option<String>,
  /// The hub's loopback control address, `http://host:port`.
  pub control: Option<String>,
  pub control_token: Option<String>,
}

/// The folder the secret store writes (docs/accounts.md, 「The secret store」).
#[derive(Clone, Debug, Default, Deserialize)]
pub struct SecretStore {
  /// The data root's `env/`; a leading `~/` stands for the home of the user the server runs as.
  pub dir: Option<String>,
}

impl SecretStore {
  /// The folder as a path, a leading `~/` read against `HOME`; none where nothing is set, or where it names the
  /// home and no home is known.
  pub fn folder(&self) -> Option<std::path::PathBuf> {
    let dir = self.dir.as_deref().map(str::trim).filter(|dir| !dir.is_empty())?;

    match dir.strip_prefix("~/") {
      Some(rest) => std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(|home| std::path::PathBuf::from(home).join(rest)),
      None => Some(dir.into()),
    }
  }
}

/// The names the pack's lines are filled with where a line names one, since no name stands in the pack.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Names {
  /// The name the chat agent goes by in a room; the server does not stand without one.
  #[serde(default)]
  pub chat_agent: String,
}

/// The HTTP server.
#[derive(Clone, Debug, Deserialize)]
pub struct Server {
  /// The address the server listens on.
  pub listen: SocketAddr,
  /// The bearer token every caller presents; the server does not stand without one.
  pub token: Option<String>,
}

impl Server {
  /// The address another unit on the machine reaches the server at: `http://` and the listen address, an
  /// unspecified host answered as the loopback one.
  pub fn address(&self) -> String {
    let host = match self.listen.ip() {
      ip if ip.is_unspecified() && ip.is_ipv6() => "[::1]".to_owned(),
      ip if ip.is_unspecified() => "127.0.0.1".to_owned(),
      std::net::IpAddr::V6(ip) => format!("[{ip}]"),
      std::net::IpAddr::V4(ip) => ip.to_string(),
    };

    format!("http://{host}:{}", self.listen.port())
  }
}

/// The service's own database.
#[derive(Clone, Debug, Deserialize)]
pub struct Database {
  /// The PostgreSQL address.
  pub url: String,
}

/// Where sumida keeps its sessions.
#[derive(Clone, Debug, Deserialize)]
pub struct Sessions {
  /// The Valkey address.
  pub valkey: String,
}

/// Another unit the server calls: its base address and the token it is called with.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Unit {
  pub base: Option<String>,
  pub token: Option<String>,
}

impl Settings {
  /// The settings as the files and the environment set them, or why they cannot be read.
  pub fn load() -> Result<Self, String> {
    Config::builder()
      .add_source(File::new(SETTINGS_FILE, FileFormat::Toml))
      .add_source(File::new(LOCAL_SETTINGS_FILE, FileFormat::Toml).required(false))
      .add_source(Environment::with_prefix(ENVIRONMENT_PREFIX).prefix_separator("_").separator("__"))
      .build()
      .and_then(Config::try_deserialize)
      .map_err(|why| format!("the settings cannot be read: {why}"))
  }
}
