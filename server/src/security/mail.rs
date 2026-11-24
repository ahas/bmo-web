//! The platform's own mail (docs/accounts.md, 「The platform's own mail」): the system mail the administrator sets —
//! one of bmo-mail's outgoing servers, the sender, and the name of the secret the server is signed in with — kept in
//! `settings` under `mail.system`, and each mail sent through bmo-mail's system send in its reader's language. The
//! service never reads the secret's value: bmo-mail reads it by its name.

use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use bmo_web_client::{MailServer, MailTestAsk, SystemMail, SystemMailAsk};
use sea_orm::ConnectionTrait;
use serde::{Deserialize, Serialize};

use crate::lang::Language;
use crate::lang::account_mail::{ACCOUNT_MAIL, Letter};
use crate::marks::fill_marks;
use crate::routes::{Answer, Body};
use crate::secrets::Space;
use crate::{Refusal, Service, one, run};

/// The `settings` key the system mail is kept under.
const SETTING: &str = "mail.system";

/// What a mail is kept by in bmo-mail's log.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MailKind {
  Test,
  EmailVerification,
  PasswordReset,
  PasswordChanged,
  AccountLocked,
  NewDevice,
}

impl MailKind {
  pub const fn word(self) -> &'static str {
    match self {
      Self::Test => "test",
      Self::EmailVerification => "email-verification",
      Self::PasswordReset => "password-reset",
      Self::PasswordChanged => "password-changed",
      Self::AccountLocked => "account-locked",
      Self::NewDevice => "new-device",
    }
  }
}

/// One mail as bmo-mail's system send takes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outgoing {
  pub server: String,
  pub from: String,
  pub from_name: String,
  pub secret: Option<String>,
  pub to: String,
  pub subject: String,
  pub text: String,
  pub html: String,
  pub kind: String,
}

/// bmo-mail, as the service asks it.
#[async_trait::async_trait]
pub trait MailService: Send + Sync {
  /// The outgoing server records bmo-mail keeps.
  async fn servers(&self) -> Result<Vec<MailServer>, Refusal>;

  /// One mail sent; a refusal carries bmo-mail's sentence.
  async fn send(&self, mail: &Outgoing) -> Result<(), Refusal>;

  /// Whether bmo-mail is named at all.
  fn named(&self) -> bool {
    true
  }
}

/// No bmo-mail named: no server is offered and nothing is sent.
pub struct NoMail;

#[async_trait::async_trait]
impl MailService for NoMail {
  async fn servers(&self) -> Result<Vec<MailServer>, Refusal> {
    Err(unset())
  }

  async fn send(&self, _mail: &Outgoing) -> Result<(), Refusal> {
    Err(unset())
  }

  fn named(&self) -> bool {
    false
  }
}

/// bmo-mail over HTTP, at its base address with the credential its settings name for the account service.
pub struct MailClient {
  base: String,
  token: String,
  http: reqwest::Client,
}

impl MailClient {
  pub fn new(base: &str, token: &str) -> Result<Self, String> {
    if !base.starts_with("http://") {
      return Err(format!("bmo-mail's address {base} is not an http: address"));
    }

    Ok(Self {
      base: base.trim_end_matches('/').to_owned(),
      token: token.to_owned(),
      http: reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|why| why.to_string())?,
    })
  }
}

/// bmo-mail's outgoing servers as it answers them: each id a number, kept here as the opaque string the console
/// names a server by.
#[derive(Deserialize)]
struct Servers {
  #[serde(default)]
  items: Vec<WireServer>,
}

#[derive(Deserialize)]
struct WireServer {
  id: serde_json::Value,
  name: String,
  host: String,
}

impl WireServer {
  fn into_server(self) -> MailServer {
    let id = match self.id {
      serde_json::Value::String(id) => id,
      other => other.to_string(),
    };

    MailServer { id, name: self.name, host: self.host }
  }
}

/// One mail as bmo-mail's system send reads it: the server by its number where the kept id is one.
fn wire(mail: &Outgoing) -> serde_json::Value {
  let mut body = serde_json::to_value(mail).unwrap_or_default();

  if let (Some(object), Ok(number)) = (body.as_object_mut(), mail.server.parse::<i64>()) {
    object.insert("server".to_owned(), serde_json::Value::from(number));
  }

  body
}

#[derive(Deserialize)]
struct MailRefusal {
  #[serde(default)]
  error: String,
}

fn unreached(why: impl std::fmt::Display) -> Refusal {
  Refusal::new(StatusCode::BAD_GATEWAY, format!("bmo-mail did not answer: {why}")).coded("mail-failed")
}

#[async_trait::async_trait]
impl MailService for MailClient {
  async fn servers(&self) -> Result<Vec<MailServer>, Refusal> {
    let answer = self
      .http
      .get(format!("{}/outgoing-servers", self.base))
      .bearer_auth(&self.token)
      .send()
      .await
      .map_err(unreached)?;

    if !answer.status().is_success() {
      return Err(unreached(format!("it answered {}", answer.status())));
    }

    Ok(answer.json::<Servers>().await.map_err(unreached)?.items.into_iter().map(WireServer::into_server).collect())
  }

  async fn send(&self, mail: &Outgoing) -> Result<(), Refusal> {
    let answer = self
      .http
      .post(format!("{}/system-mails", self.base))
      .bearer_auth(&self.token)
      .json(&wire(mail))
      .send()
      .await
      .map_err(unreached)?;

    if answer.status().is_success() {
      return Ok(());
    }

    let status = answer.status();
    let why = answer.json::<MailRefusal>().await.map(|refusal| refusal.error).unwrap_or_default();

    Err(
      Refusal::new(
        StatusCode::BAD_GATEWAY,
        if why.is_empty() { format!("bmo-mail refused the mail: {status}") } else { why },
      )
      .coded("mail-failed"),
    )
  }
}

/// The refusal of an act that would send mail while system mail is not set up.
pub fn unset() -> Refusal {
  Refusal::new(StatusCode::CONFLICT, "system mail is not set up").coded("mail-unset")
}

/// The system mail as it is kept.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kept {
  #[serde(default)]
  pub server: Option<String>,
  #[serde(default)]
  pub from: String,
  #[serde(default)]
  pub from_name: String,
  #[serde(default)]
  pub secret: Option<String>,
}

/// The system mail as kept, its defaults where none is.
pub async fn kept<C: ConnectionTrait>(db: &C) -> Result<Kept, Refusal> {
  match one(db, r#"SELECT "value" FROM "settings" WHERE "key" = $1"#, vec![SETTING.into()]).await? {
    Some(row) => Ok(serde_json::from_str(&row.try_get::<String>("", "value")?).unwrap_or_default()),
    None => Ok(Kept::default()),
  }
}

/// Whether system mail is set up: bmo-mail named, a server chosen and a sender's address standing.
pub async fn configured(service: &Service) -> Result<Option<Kept>, Refusal> {
  let kept = kept(&service.db).await?;

  Ok((service.mail.named() && kept.server.is_some() && !kept.from.trim().is_empty()).then_some(kept))
}

/// A mail of one kind sent to `to` in `language`, its marks filled.
pub async fn send(
  service: &Service,
  kind: MailKind,
  to: &str,
  language: Language,
  marks: &[(&str, &str)],
) -> Result<(), Refusal> {
  let kept = configured(service).await?.ok_or_else(unset)?;
  let words = ACCOUNT_MAIL.in_language(language);
  let letter: &Letter = match kind {
    MailKind::Test => &words.test,
    MailKind::EmailVerification => &words.verify,
    MailKind::PasswordReset => &words.reset,
    MailKind::PasswordChanged => &words.changed,
    MailKind::AccountLocked => &words.locked,
    MailKind::NewDevice => &words.new_device,
  };
  let text = fill_marks(&letter.body, marks);
  let link = marks.iter().find(|(mark, _)| *mark == "link").map(|(_, link)| *link);

  service
    .mail
    .send(&Outgoing {
      server: kept.server.clone().unwrap_or_default(),
      from: kept.from.clone(),
      from_name: kept.from_name.clone(),
      secret: kept.secret.clone(),
      to: to.to_owned(),
      subject: fill_marks(&letter.subject, marks),
      html: html_of(&text, link),
      text,
      kind: kind.word().to_owned(),
    })
    .await
}

/// A notice sent beside another act: one that does not go is said on the error stream and the act stands.
pub async fn notify(
  service: &Service,
  kind: MailKind,
  to: &str,
  language: Language,
  marks: &[(&str, &str)],
) {
  if let Err(why) = send(service, kind, to, language, marks).await
    && why.code != "mail-unset"
  {
    eprintln!("bmo-web-server: a {} notice was not sent: {}", kind.word(), why.detail);
  }
}

/// The words of how long a link stands, in minutes under two hours and in hours past them.
pub fn span_words(language: Language, minutes: i64) -> String {
  let spans = &ACCOUNT_MAIL.in_language(language).spans;

  if minutes < 120 {
    fill_marks(&spans.minutes, &[("count", &minutes.to_string())])
  } else {
    fill_marks(&spans.hours, &[("count", &(minutes / 60).to_string())])
  }
}

/// A moment told in the owner's zone, to the minute.
pub fn moment(service: &Service, at_ms: i64) -> String {
  chrono::DateTime::from_timestamp_millis(at_ms)
    .map(|at| at.with_timezone(&service.zone).format("%Y-%m-%d %H:%M").to_string())
    .unwrap_or_default()
}

// The plain text written as HTML: each character that means something in HTML written as its entity, each line
// break a `<br>`, and the link, where the text holds one, made a link.
fn html_of(text: &str, link: Option<&str>) -> String {
  let escaped = escaped_text(text).replace('\n', "<br>\n");
  let body = match link {
    Some(link) => {
      let shown = escaped_text(link);

      escaped.replace(&shown, &format!(r#"<a href="{shown}">{shown}</a>"#))
    }
    None => escaped,
  };

  format!(
    "<!doctype html><html><body style=\"font-family: sans-serif; line-height: 1.6\"><p>{body}</p></body></html>"
  )
}

fn escaped_text(text: &str) -> String {
  let mut out = String::with_capacity(text.len());

  for character in text.chars() {
    match character {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&#39;"),
      other => out.push(other),
    }
  }

  out
}

pub fn routes() -> Router<Service> {
  Router::new()
    .route("/mail", get(read_route).put(write_route))
    .route("/mail/test", post(test_route))
}

/// The call is the administrator's: sumida's word for the user `Owner-Key` names.
async fn administrator(service: &Service, headers: &HeaderMap) -> Result<i32, Refusal> {
  let by = super::caller(headers)?;

  if super::administers(&service.db, by).await? {
    Ok(by)
  } else {
    Err(Refusal::forbidden("the system mail is the administrator's"))
  }
}

/// The system mail as the routes answer it.
async fn view(service: &Service) -> Result<SystemMail, Refusal> {
  let kept = kept(&service.db).await?;
  let (servers, mail_service) = match service.mail.servers().await {
    Ok(servers) => (servers, true),
    Err(_) => (vec![], false),
  };
  let secret_stands = match (&kept.secret, &service.secrets) {
    (None, _) => true,
    (Some(name), Some(store)) => {
      store.list(Space::Administrator)?.iter().any(|secret| &secret.name == name)
    }
    (Some(_), None) => false,
  };

  Ok(SystemMail {
    configured: service.mail.named() && kept.server.is_some() && !kept.from.trim().is_empty(),
    server: kept.server,
    from: kept.from,
    from_name: kept.from_name,
    secret: kept.secret,
    secret_stands,
    mail_service,
    servers,
  })
}

async fn read_route(State(service): State<Service>, headers: HeaderMap) -> Answer<SystemMail> {
  administrator(&service, &headers).await?;

  Ok(Json(view(&service).await?))
}

async fn write_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<SystemMailAsk>,
) -> Answer<SystemMail> {
  administrator(&service, &headers).await?;

  let from = ask.from.trim().to_owned();
  let server = ask.server.map(|server| server.trim().to_owned()).filter(|server| !server.is_empty());
  let secret = ask.secret.map(|secret| secret.trim().to_owned()).filter(|secret| !secret.is_empty());

  if !from.is_empty() && !plausible_address(&from) {
    return Err(Refusal::bad("`from` is no mail address").coded("bad-mail"));
  }

  // The server is one bmo-mail offers the platform, where bmo-mail answers its list.
  if let Some(server) = &server
    && let Ok(servers) = service.mail.servers().await
    && !servers.iter().any(|offered| &offered.id == server)
  {
    return Err(
      Refusal::bad("`server` is none of the outgoing servers bmo-mail offers the platform")
        .coded("bad-mail"),
    );
  }

  if let Some(secret) = &secret {
    crate::secrets::named(secret)
      .map_err(|_| Refusal::bad("`secret` is no secret's name").coded("bad-mail"))?;
  }

  let kept = Kept {
    server,
    from,
    from_name: ask.from_name.trim().to_owned(),
    secret,
  };
  let value = serde_json::to_string(&kept).map_err(|why| Refusal::bad(why.to_string()))?;

  run(
    &service.db,
    r#"INSERT INTO "settings" ("key", "value") VALUES ($1, $2)
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value""#,
    vec![SETTING.into(), value.into()],
  )
  .await?;

  Ok(Json(view(&service).await?))
}

async fn test_route(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<MailTestAsk>,
) -> Result<StatusCode, Refusal> {
  let by = administrator(&service, &headers).await?;
  let to = ask.to.trim();

  if !plausible_address(to) {
    return Err(Refusal::bad("`to` is no mail address").coded("bad-mail"));
  }

  let language = super::language_of(&service.db, by).await?;

  send(&service, MailKind::Test, to, language, &[("address", to)]).await?;

  Ok(StatusCode::NO_CONTENT)
}

/// Whether text reads as one mail address: one `@` with something on both sides and no space. The mail server is
/// the judge of the rest.
pub fn plausible_address(text: &str) -> bool {
  match text.split_once('@') {
    Some((local, domain)) => {
      !local.is_empty()
        && !domain.is_empty()
        && !domain.contains('@')
        && !text.contains(char::is_whitespace)
    }
    None => false,
  }
}

/// The service's bmo-mail, as the settings name it.
pub fn named(base: Option<&String>, token: Option<&String>) -> Result<Arc<dyn MailService>, String> {
  match (base, token) {
    (Some(base), Some(token)) => Ok(Arc::new(MailClient::new(base, token)?)),
    (None, None) => Ok(Arc::new(NoMail)),
    _ => Err("bmo-mail's settings name its address and its token together, or neither".to_owned()),
  }
}
