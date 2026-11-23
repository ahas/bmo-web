//! The supply hook: the one route the agency calls as a person's run starts and as it spends
//! (docs/accounts.md, 「Supply」; the agency's `docs/supply.md`, 「The supply hook」). Amounts are US dollars,
//! times epoch milliseconds, and every ask that moves money carries `<run>:<step>:<op>` as its idempotency
//! key, taken once end to end: the key is kept unique here and carried into sumida's own idempotency, so a
//! repeated ask answers what the first did and moves nothing twice.
//!
//! While the platform enforces nothing, every ask records and answers as though the source were unlimited:
//! `reserve` is accepted at the full size and opens no sumida hold, and nothing is refused, so a run is
//! never stopped by supply. `capture` and `release` still answer taken, still move the reservation's state,
//! and still write `supply_costs`; wallets and quotas stand untouched.

use axum::Json;
use axum::extract::State;
use sea_orm::{ConnectionTrait, DatabaseConnection, TransactionTrait};
use sumida::api::service::membership::credit::{CaptureRequest, Cost, CreditService, HoldRequest};
use sumida::api::service::membership::quota::QuotaService;
use sumida::entity::membership::OwnerKind;
use sumida::error::SumidaError;

use super::{
  Depth, PlatformSettings, Resolution, Source, home_unit, platform_settings, record_cost, resolve_to,
  wallet,
};
use crate::routes::{Answer, Body};
use crate::{Refusal, Service, one, run};

/// The hook route: the agency's ask, answered under `answer`.
pub async fn ask(
  State(service): State<Service>,
  Body(ask): Body<bmo_web_client::SupplyHookAsk>,
) -> Answer<bmo_web_client::SupplyHookAnswer> {
  if ask.point != "supply" {
    return Err(Refusal::bad(format!("`{}` is no hook point this service answers", ask.point)));
  }

  let answer = match ask.ask.op.as_str() {
    "order" => order(&service, &ask.ask).await?,
    "reserve" => reserve(&service, &ask.ask).await?,
    "extend" => extend(&service, &ask.ask).await?,
    "capture" => capture(&service, &ask.ask).await?,
    "release" => release(&service, &ask.ask).await?,
    op => return Err(Refusal::bad(format!("`{op}` is no supply ask"))),
  };

  Ok(Json(bmo_web_client::SupplyHookAnswer { answer }))
}

/// Every field an ask must carry, refused saying which one it lacks.
fn field<T>(value: Option<T>, name: &str) -> Result<T, Refusal> {
  value.ok_or_else(|| Refusal::bad(format!("the ask carries no `{name}`")))
}

/// The account an ask names: the digits of a user's id, as the agency carries it, a text or a number alike.
fn account(ask: &bmo_web_client::SupplyHookOp) -> Result<i64, Refusal> {
  match &field(ask.account.clone(), "account")? {
    serde_json::Value::String(key) => {
      key.trim().parse::<i64>().map_err(|_| Refusal::bad(format!("`{key}` is no account")))
    }
    serde_json::Value::Number(key) => key
      .as_i64()
      .or_else(|| key.as_u64().and_then(|whole| i64::try_from(whole).ok()))
      .ok_or_else(|| Refusal::bad("the account is no whole number")),
    other => Err(Refusal::bad(format!("{other} is no account"))),
  }
}

fn source_of(ask: &bmo_web_client::SupplyHookOp) -> Result<Source, Refusal> {
  Source::parse(&field(ask.source.clone(), "source")?)
    .ok_or_else(|| Refusal::bad("the ask names no source"))
}

/// `order`: the resolved order of the ask's account, each entry `personal` or a platform source's key and
/// `stop` left out. No platform source stands in the answer that this service would refuse to reserve for:
/// with the quota spent this period or a wallet that cannot take the full size, the source drops out here.
async fn order(
  service: &Service,
  ask: &bmo_web_client::SupplyHookOp,
) -> Result<bmo_web_client::SupplyHookReply, Refusal> {
  let user = account(ask)?;
  let resolved = resolve_to(&service.db, user, Depth::Own).await?;
  let settings = platform_settings(&service.db).await?;
  let unit = home_unit(&service.db, user).await?;
  let mut sources = Vec::new();

  for source in resolved.answer() {
    if settings.enforce && !could_reserve(service, user, unit, source, &settings).await? {
      continue;
    }

    sources.push(source.key().to_owned());
  }

  Ok(bmo_web_client::SupplyHookReply {
    sources: Some(sources),
    ..Default::default()
  })
}

// Whether a source could take a full reservation right now.
async fn could_reserve(
  service: &Service,
  user: i64,
  unit: i64,
  source: Source,
  settings: &PlatformSettings,
) -> Result<bool, Refusal> {
  match source {
    Source::Personal => Ok(true),
    Source::Global => Ok(
      super::subscription_of(&service.db, user, unit)
        .await?
        .is_some_and(|plan| plan.remaining.is_none_or(|left| left >= settings.reservation_credits)),
    ),
    Source::OrgCredits => Ok(
      wallet(&service.db, "organization", unit)
        .await?
        .is_some_and(|wallet| wallet.spendable() >= settings.reservation_credits),
    ),
    Source::PersonalCredits => Ok(
      wallet(&service.db, "personal", user)
        .await?
        .is_some_and(|wallet| wallet.spendable() >= settings.reservation_credits),
    ),
    Source::Organisation | Source::Stop => Ok(false),
  }
}

/// One reservation this service opened, read by its id or its key.
struct Held {
  id: String,
  step: i64,
  user: i64,
  source: Source,
  amount: i64,
  expires_at: i64,
  state: String,
  sumida: Option<String>,
}

impl Held {
  fn open_row(&self) -> bool {
    self.state == "open"
  }

  // The reservation paid through sumida, and not out of a person's own pocket.
  fn sumida_id(&self) -> Result<Option<i32>, Refusal> {
    if self.source == Source::Personal {
      return Ok(None);
    }

    self
      .sumida
      .as_deref()
      .map(|reference| {
        reference.parse::<i32>().map_err(|_| {
          Refusal::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, "a kept sumida reference is no id")
        })
      })
      .transpose()
  }
}

async fn standing<C: ConnectionTrait>(db: &C, id_or_key: &str) -> Result<Option<Held>, Refusal> {
  let Some(row) = one(
    db,
    r#"SELECT "id", "step", "user_id", "source", "amount_credits", "expires_at", "state", "sumida_reference"
       FROM "supply_reservations" WHERE "id" = $1 OR "key" = $1"#,
    vec![id_or_key.into()],
  )
  .await?
  else {
    return Ok(None);
  };

  Ok(Some(Held {
    id: row.try_get("", "id")?,
    step: row.try_get::<i32>("", "step")? as i64,
    user: row.try_get("", "user_id")?,
    source: Source::parse(&row.try_get::<String>("", "source")?).expect("a stored source is a key"),
    amount: row.try_get("", "amount_credits")?,
    expires_at: row.try_get("", "expires_at")?,
    state: row.try_get("", "state")?,
    sumida: row.try_get("", "sumida_reference")?,
  }))
}

/// The lifetime of a hold, as sumida's settings name it.
fn ttl_ms() -> i64 {
  sumida::infra::settings::get().membership.reservation_ttl_secs * 1000
}

fn millis(at: chrono::DateTime<chrono::Utc>) -> i64 {
  at.timestamp_millis()
}

/// A sumida error that refuses the ask without failing the call.
fn refuses(why: &SumidaError) -> bool {
  matches!(
    why,
    SumidaError::InsufficientCredits { .. }
      | SumidaError::QuotaExceeded { .. }
      | SumidaError::NoActiveSubscription
      | SumidaError::BadRequest(_)
      | SumidaError::ReservationExpired(_)
  )
}

fn accepted(
  settings: &PlatformSettings,
  id: &str,
  amount: i64,
  expires_at: i64,
) -> bmo_web_client::SupplyHookReply {
  bmo_web_client::SupplyHookReply {
    accepted: Some(true),
    reservation: Some(id.to_owned()),
    amount_usd: Some(settings.dollars(amount)),
    expires_at: Some(expires_at),
    ..Default::default()
  }
}

fn refused(reopens_at: Option<i64>) -> bmo_web_client::SupplyHookReply {
  bmo_web_client::SupplyHookReply {
    accepted: Some(false),
    reopens_at,
    ..Default::default()
  }
}

fn taken() -> bmo_web_client::SupplyHookReply {
  bmo_web_client::SupplyHookReply {
    taken: Some(true),
    ..Default::default()
  }
}

/// The text a credit wallet is read by, for its owner kind.
pub(crate) fn kind_text(kind: &OwnerKind) -> &'static str {
  match kind {
    OwnerKind::Personal => "personal",
    OwnerKind::Organization => "organization",
  }
}

/// The wallet a source pays from: the person's organisation for its credits, the person for their own.
fn wallet_owner(source: Source, user: i64, unit: i64) -> (OwnerKind, i32) {
  match source {
    Source::OrgCredits | Source::Organisation => (OwnerKind::Organization, unit as i32),
    _ => (OwnerKind::Personal, user as i32),
  }
}

/// When the first live hold on a wallet ends, freeing room.
async fn wallet_reopen<C: ConnectionTrait>(db: &C, wallet_id: i32) -> Option<i64> {
  one(
    db,
    r#"SELECT EXTRACT(EPOCH FROM MIN("expires_at")) * 1000 AS "reopens"
       FROM "credit_reservations"
       WHERE "wallet_id" = $1 AND "status" = 'held' AND "expires_at" > now()"#,
    vec![wallet_id.into()],
  )
  .await
  .ok()
  .flatten()
  .and_then(|row| row.try_get::<Option<f64>>("", "reopens").ok().flatten())
  .map(|reopens| reopens as i64)
}

/// `reserve`: a reservation of the standing reservation size, answered with its id, its amount and its
/// expiry, or refused with the moment it may reopen where one is known. The same key answers what the first
/// ask did.
async fn reserve(
  service: &Service,
  ask: &bmo_web_client::SupplyHookOp,
) -> Result<bmo_web_client::SupplyHookReply, Refusal> {
  let user = account(ask)?;
  let run_id = field(ask.run, "run")?;
  let step = field(ask.step, "step")?;
  let source = source_of(ask)?;
  let key = field(ask.key.as_deref(), "key")?;

  if !source.payable() {
    return Err(Refusal::bad("`stop` holds nothing to reserve"));
  }
  if let Some(held) = standing(&service.db, key).await? {
    // The same key answers the reservation the first ask opened, and moves nothing twice.
    let settings = platform_settings(&service.db).await?;

    return Ok(accepted(&settings, &held.id, held.amount, held.expires_at));
  }

  let settings = platform_settings(&service.db).await?;
  let unit = home_unit(&service.db, user).await?;
  let resolved = resolve_to(&service.db, user, Depth::Own).await?;
  let id = format!("res_{}", tail());

  // Nothing is refused while nothing is enforced. Enforced, a source the resolved order does not hold — closed
  // by a layer, switched off, left off by an overridable default or past the person's own cap — is refused. The
  // organisation's own supply stands in no order: the agency opened it on the chain, and it is refused once the
  // person's organisation-credit spend of the month reaches their allowance.
  if settings.enforce && source != Source::Organisation && !resolved.order.contains(&source) {
    return Ok(refused(None));
  }
  if settings.enforce && source == Source::Organisation && allowance_spent(&service.db, user).await? {
    return Ok(refused(None));
  }

  // A person's own credential reserves nothing, and nothing is held while nothing is enforced: the row stands
  // here alone, recorded so the run's cost settles against it, and no sumida hold is opened. Nor is one for the
  // organisation's own supply where the organisation keeps no credit wallet: its cost is recorded alone.
  let unattributed =
    source == Source::Organisation && wallet(&service.db, "organization", unit).await?.is_none();

  if !settings.enforce || source == Source::Personal || unattributed {
    let expires = crate::now_ms() + ttl_ms();

    let opening = Opening {
      id: &id,
      run: run_id,
      step,
      user,
      source,
      amount: settings.reservation_credits,
      expires_at: expires,
      key,
      sumida: None,
    };
    open(&service.db, &opening).await?;

    return Ok(accepted(&settings, &id, settings.reservation_credits, expires));
  }

  let txn = service.db.begin().await?;

  let held = match reserve_source(&txn, &resolved, unit, source, settings.reservation_credits, key).await {
    Ok(held) => held,
    Err(reopens_at) => {
      txn.rollback().await?;

      return Ok(refused(reopens_at));
    }
  };

  let opening = Opening {
    id: &id,
    run: run_id,
    step,
    user,
    source,
    amount: settings.reservation_credits,
    expires_at: held.1,
    key,
    sumida: Some(&held.0),
  };
  open(&service.db, &opening).await?;
  txn.commit().await?;

  Ok(accepted(&settings, &id, settings.reservation_credits, held.1))
}

// A reservation opened here: the new row's fields, given whole.
struct Opening<'a> {
  id: &'a str,
  run: i64,
  step: i64,
  user: i64,
  source: Source,
  amount: i64,
  expires_at: i64,
  key: &'a str,
  sumida: Option<&'a str>,
}

// A reservation opened here.
async fn open<C: ConnectionTrait>(db: &C, row: &Opening<'_>) -> Result<(), Refusal> {
  let now = crate::now_ms();

  crate::run(
    db,
    r#"INSERT INTO "supply_reservations"
         ("id", "run", "step", "user_id", "source", "amount_credits", "spent_credits", "expires_at",
          "state", "sumida_reference", "key", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'open', $8, $9, $10, $10)"#,
    vec![
      row.id.into(),
      row.run.into(),
      (row.step as i32).into(),
      row.user.into(),
      row.source.key().into(),
      row.amount.into(),
      row.expires_at.into(),
      row.sumida.into(),
      row.key.into(),
      now.into(),
    ],
  )
  .await?;

  Ok(())
}

// What a source is reserved against: the amount quota of the subscription the person's supply stands under
// for `global` — their own, or their unit's or the nearest unit's above — and the owner's credit wallet for the
// credit sources. The refusal names when the source may be asked again where a moment is known.
async fn reserve_source<C: ConnectionTrait>(
  txn: &C,
  resolved: &Resolution,
  unit: i64,
  source: Source,
  amount: i64,
  key: &str,
) -> Result<(String, i64), Option<i64>> {
  let user = resolved.user;

  match source {
    Source::Global => {
      let Some((kind, owner)) = &resolved.plan.owner else {
        return Err(None);
      };

      match QuotaService::<crate::Service>::reserve_in_txn(
        kind,
        *owner,
        super::ACTION,
        amount,
        None,
        Some(key),
        None,
        txn,
      )
      .await
      {
        Ok(held) => Ok((held.reservation_id.to_string(), millis(held.expires_at))),
        Err(SumidaError::QuotaExceeded { .. }) => Err(resolved.plan.reopens_at),
        Err(_) => Err(None),
      }
    }
    source @ (Source::OrgCredits | Source::PersonalCredits | Source::Organisation) => {
      let (kind, owner) = wallet_owner(source, user, unit);

      match CreditService::<crate::Service>::reserve_in_txn(
        &kind,
        owner,
        HoldRequest {
          cost: Cost {
            amount: Some(amount),
            ..Default::default()
          },
          reference_code: None,
          idempotency_key: Some(key),
          expires_in_secs: None,
        },
        txn,
      )
      .await
      {
        Ok(held) => Ok((
          held.reservation_id.to_string(),
          millis(held.expires_at.expect("a hold carries its expiry")),
        )),
        Err(SumidaError::InsufficientCredits { .. }) => {
          // The wallet is empty or its holds stand in the way: the first hold to end is when it may reopen.
          let reopens = match super::wallet(txn, kind_text(&kind), owner as i64).await.ok().flatten() {
            Some(wallet) => wallet_reopen(txn, wallet.id).await,
            None => None,
          };

          Err(reopens)
        }
        Err(_) => Err(None),
      }
    }
    _ => Err(None),
  }
}

/// Whether a person's organisation-credit spend of the month has reached their allowance, where one stands.
async fn allowance_spent(db: &DatabaseConnection, user: i64) -> Result<bool, Refusal> {
  let Some((allowance, _)) = super::credit_allowance(db, user).await? else {
    return Ok(false);
  };

  Ok(super::spent(db, user, Source::Organisation).await? >= allowance)
}

/// `extend`: one reservation unit more on a standing reservation, its expiry restarted, and its whole
/// answered. A repeat of an ask already applied answers the whole as it stands and moves nothing twice: the
/// step rises with every ask of a run, so an ask no newer than the row it already moved is the earlier one
/// again.
async fn extend(
  service: &Service,
  ask: &bmo_web_client::SupplyHookOp,
) -> Result<bmo_web_client::SupplyHookReply, Refusal> {
  let step = field(ask.step, "step")?;
  let key = field(ask.key.as_deref(), "key")?;
  let held = standing(&service.db, &field(ask.reservation.clone(), "reservation")?)
    .await?
    .ok_or_else(|| Refusal::absent("no reservation this service opened stands under that id"))?;
  let settings = platform_settings(&service.db).await?;

  if !held.open_row() {
    return Ok(refused(None));
  }
  if held.step >= step {
    return Ok(accepted(&settings, &held.id, held.amount, held.expires_at));
  }

  let grew = match held.sumida_id()? {
    Some(id) => {
      let grew = match held.source {
        Source::Global => QuotaService::<crate::Service>::extend_in_txn(
          id,
          settings.reservation_credits,
          Some(key),
          None,
          &service.db,
        )
        .await
        .map(|held| (held.amount, millis(held.expires_at))),
        _ => CreditService::<crate::Service>::extend_in_txn(
          id,
          settings.reservation_credits,
          Some(key),
          None,
          &service.db,
        )
        .await
        .map(|held| {
          (held.amount, held.expires_at.map(millis).unwrap_or_else(|| crate::now_ms() + ttl_ms()))
        }),
      };

      match grew {
        Ok(grew) => grew,
        Err(why) if refuses(&why) => return Ok(refused(None)),
        Err(why) => return Err(why.into()),
      }
    }
    // Nothing enforced, or a personal reservation: it grows here alone.
    None => (held.amount + settings.reservation_credits, crate::now_ms() + ttl_ms()),
  };

  run(
    &service.db,
    r#"UPDATE "supply_reservations"
              SET "amount_credits" = $2, "step" = $3, "expires_at" = $4, "updated_at" = $5
            WHERE "id" = $1"#,
    vec![
      held.id.clone().into(),
      grew.0.into(),
      (step as i32).into(),
      grew.1.into(),
      crate::now_ms().into(),
    ],
  )
  .await?;

  Ok(accepted(&settings, &held.id, grew.0, grew.1))
}

/// `capture`: the actual cost settled against the source and answered taken. A capture may exceed what the
/// source holds: sumida is asked with a debt or overage ceiling of one reservation unit; what will not be
/// covered within it is captured to the ceiling and the overage stands recorded in `supply_costs` charged
/// nowhere; and a capture of a reservation already let go at its expiry is taken as a direct charge up to
/// the same ceiling.
async fn capture(
  service: &Service,
  ask: &bmo_web_client::SupplyHookOp,
) -> Result<bmo_web_client::SupplyHookReply, Refusal> {
  let run_id = field(ask.run, "run")?;
  let key = field(ask.key.as_deref(), "key")?;
  let cost_usd = field(ask.cost_usd, "costUsd")?;
  let held = standing(&service.db, &field(ask.reservation.clone(), "reservation")?)
    .await?
    .ok_or_else(|| Refusal::absent("no reservation this service opened stands under that id"))?;

  if !held.open_row() {
    // Taken once: the capture of a reservation already settled answers as the first did.
    return Ok(taken());
  }

  let settings = platform_settings(&service.db).await?;
  let credits = settings.credits(cost_usd);
  let micros = (cost_usd * 1_000_000.0).round() as i64;
  let unit = home_unit(&service.db, held.user).await?;

  // What the source pays: the whole for personal supply and for every reservation opened while nothing was
  // enforced — nothing was held against them — and the settled part alone where a sumida hold stands.
  let paid = match held.sumida_id()? {
    Some(id) => settle(&service.db, &held, unit, id, credits, settings.reservation_credits, key).await?,
    None => credits,
  };

  run(
    &service.db,
    r#"UPDATE "supply_reservations" SET "state" = 'captured', "spent_credits" = $2, "updated_at" = $3
       WHERE "id" = $1"#,
    vec![held.id.clone().into(), paid.into(), crate::now_ms().into()],
  )
  .await?;
  record_cost(
    &service.db,
    run_id,
    held.user,
    unit,
    held.source,
    if held.source == Source::Personal { 0 } else { paid },
    micros,
  )
  .await?;

  Ok(taken())
}

// A capture settled against a standing sumida hold, answered with what the source took. Asked once at the
// whole; refused for want of it, asked again at what the source can still pay within the debt ceiling; and
// a hold sumida no longer holds — swept at its expiry between the reads — is taken as a direct charge.
async fn settle(
  db: &DatabaseConnection,
  held: &Held,
  unit: i64,
  id: i32,
  actual: i64,
  ceiling: i64,
  key: &str,
) -> Result<i64, Refusal> {
  match settle_once(db, held, id, actual, ceiling, key).await {
    Ok(()) => Ok(actual),
    Err(why) if refuses(&why) => {
      let room = room_of(db, held.source, held.user, unit, held.amount, ceiling).await?;

      match settle_once(db, held, id, room.min(actual), ceiling, key).await {
        Ok(()) => Ok(room.min(actual)),
        Err(_) => {
          direct(
            db,
            held.source,
            held.user,
            unit,
            actual,
            spendable(db, held.source, held.user, unit).await?,
          )
          .await
        }
      }
    }
    Err(why) => Err(why.into()),
  }
}

// One capture ask of sumida, in a transaction of its own.
async fn settle_once(
  db: &DatabaseConnection,
  held: &Held,
  id: i32,
  amount: i64,
  ceiling: i64,
  key: &str,
) -> Result<(), SumidaError> {
  let txn = db.begin().await.map_err(|why| SumidaError::InternalServerError(why.to_string()))?;
  let took = match held.source {
    Source::Global => {
      QuotaService::<crate::Service>::capture_in_txn(id, Some(amount), ceiling, Some(key), &txn)
        .await
        .map(|_| ())
    }
    _ => CreditService::<crate::Service>::capture_in_txn(
      id,
      CaptureRequest {
        amount: Some(amount),
        debt_limit: ceiling,
        idempotency_key: Some(key),
      },
      &txn,
    )
    .await
    .map(|_| ()),
  };

  match took {
    Ok(()) => txn.commit().await.map_err(|why| SumidaError::InternalServerError(why.to_string())),
    Err(why) => {
      txn.rollback().await.ok();
      Err(why)
    }
  }
}

// What the source can pay within its ceiling now: the quota's room plus the debt room, or the wallet's
// spendable with the standing hold counted as freed, plus the debt room.
async fn room_of(
  db: &DatabaseConnection,
  source: Source,
  user: i64,
  unit: i64,
  held_amount: i64,
  ceiling: i64,
) -> Result<i64, Refusal> {
  match source {
    Source::Global => Ok(
      super::subscription_of(db, user, unit)
        .await?
        .and_then(|plan| plan.remaining)
        .map(|left| left + held_amount + ceiling)
        .unwrap_or(i64::MAX / 4),
    ),
    _ => {
      let (kind, owner) = wallet_owner(source, user, unit);

      Ok(
        wallet(db, kind_text(&kind), owner as i64)
          .await?
          .map(|wallet| (wallet.balance - wallet.debt).max(0) + ceiling)
          .unwrap_or(0),
      )
    }
  }
}

// What the source holds right now, outside every hold.
async fn spendable(db: &DatabaseConnection, source: Source, user: i64, unit: i64) -> Result<i64, Refusal> {
  let (kind, owner) = wallet_owner(source, user, unit);

  Ok(
    wallet(db, kind_text(&kind), owner as i64)
      .await?
      .map(|wallet| wallet.spendable())
      .unwrap_or(0),
  )
}

// A charge of the amount with no hold to capture: up to what the source can pay plus the ceiling, then what
// it can pay, and nothing at all where it can pay nothing — the cost stands recorded either way.
async fn direct(
  db: &DatabaseConnection,
  source: Source,
  user: i64,
  unit: i64,
  actual: i64,
  free: i64,
) -> Result<i64, Refusal> {
  let (kind, owner) = wallet_owner(source, user, unit);

  // The charge is what the source can pay now, and where that read raced, what it can pay at the second
  // reading; a source that can pay nothing is owed the whole as a recorded cost alone.
  for amount in [actual.min(free), actual.min(spendable(db, source, user, unit).await?)] {
    if amount <= 0 {
      break;
    }

    let txn = db.begin().await?;

    match CreditService::<crate::Service>::consume_in_txn(
      &kind,
      owner,
      Cost {
        action: Some(super::ACTION),
        amount: Some(amount),
        plan_code: None,
      },
      None,
      None,
      &txn,
    )
    .await
    {
      Ok(out) => {
        txn.commit().await?;

        return Ok(out.consumed.min(actual));
      }
      Err(why) if refuses(&why) => {
        txn.rollback().await?;

        continue;
      }
      Err(why) => return Err(why.into()),
    }
  }

  Ok(0)
}

/// `release`: a standing reservation given back unspent, answered taken. A release of a reservation already
/// settled answers as the first did, and a hold sumida let go at its expiry is released all the same.
async fn release(
  service: &Service,
  ask: &bmo_web_client::SupplyHookOp,
) -> Result<bmo_web_client::SupplyHookReply, Refusal> {
  let key = field(ask.key.as_deref(), "key")?;
  let held = standing(&service.db, &field(ask.reservation.clone(), "reservation")?)
    .await?
    .ok_or_else(|| Refusal::absent("no reservation this opened stands under that id"))?;

  if !held.open_row() {
    return Ok(taken());
  }

  if let Some(id) = held.sumida_id()? {
    // A hold sumida already moved — captured by a racing settle, or released by its expiry — is let go here
    // all the same; anything else is a failure of the call.
    let let_go = match held.source {
      Source::Global => QuotaService::<crate::Service>::release_in_txn(id, Some(key), &service.db)
        .await
        .map(|_| ()),
      _ => CreditService::<crate::Service>::release_in_txn(id, Some(key), &service.db)
        .await
        .map(|_| ()),
    };

    if let Err(why) = let_go
      && !matches!(why, SumidaError::BadRequest(_))
    {
      return Err(why.into());
    }
  }

  run(
    &service.db,
    r#"UPDATE "supply_reservations" SET "state" = 'released', "updated_at" = $2 WHERE "id" = $1"#,
    vec![held.id.clone().into(), crate::now_ms().into()],
  )
  .await?;

  Ok(taken())
}

/// A reservation id: `res_` and a random tail, held by no other row.
pub(crate) fn tail() -> String {
  use rand::Rng;
  const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
  let mut rng = rand::rng();

  (0..20).map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char).collect()
}
