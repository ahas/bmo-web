//! The console's supply routes (docs/boundary.md, 「Supply」): the reader's own view and setting, a unit's
//! policy and credits, a person's per-user policy, the platform row, the plans, grants and the two ledgers.
//! Every route carries the server's bearer token like the rest of the service's own, names its caller in
//! `Owner-Key` and `Owner-Role`, and is refused by the permission of docs/accounts.md 「Supply」: only
//! sumida's existing organisation relations stand behind it.

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use bmo_web_client::{
  SupplyAppliedAsk, SupplyAppliedPlan, SupplyAuditPage, SupplyCataloguePlan, SupplyCreditAsk,
  SupplyExposedAsk, SupplyGrantAsk, SupplyGranted, SupplyLedgerEntry, SupplyLedgerPage,
  SupplyMemberUsageRow, SupplyOrgPlans, SupplyOrgView, SupplyPlan, SupplyPlans, SupplyPlatform,
  SupplyPolicyView, SupplySettingAsk, SupplyUnitReach, SupplyUnits, SupplyUsageRow, SupplyUserView,
  SupplyView, SupplyWallet,
};
use sea_orm::{ConnectionTrait, TransactionTrait};
use sumida::api::service::membership::credit::{CreditService, dto::GrantCredit};

use super::{
  Depth, OwnSetting, Resolution, Source, audit, clear_org_policy, clear_user_policy, holds_credit,
  holds_subscription, home_unit, org_policy, plans, platform_policy, platform_settings, resolve_to,
  session, set_org_policy, set_own_setting, set_platform, set_user_policy, user_policy, wallet,
};
use crate::readers::{Reader, reader};
use crate::routes::{Answer, Body, user_in};
use crate::{Refusal, Service, ids, one};

/// The supply routes, mounted with the service's own.
pub fn routes() -> Router<Service> {
  Router::new()
    .route("/supply/hook", post(super::hook::ask))
    .route("/supply/me", get(me_read).put(me_write))
    .route("/supply/org/{unit}", get(org_read).put(org_write).delete(org_delete))
    .route("/supply/org/{unit}/credits", post(org_credits))
    .route("/supply/units", get(units_read))
    .route("/supply/org/{unit}/plans", get(org_plans_read))
    .route("/supply/org/{unit}/plans/exposed", axum::routing::put(org_exposed_write))
    .route("/supply/org/{unit}/plans/applied", axum::routing::put(org_applied_write))
    .route("/supply/user/{user}", get(user_read).put(user_write).delete(user_delete))
    .route("/supply/platform", get(platform_read).put(platform_write))
    .route("/supply/plans", get(plans_read).post(plans_create))
    .route("/supply/plans/{plan}", axum::routing::patch(plans_patch).delete(plans_delete))
    .route("/supply/credits", post(credits_grant))
    .route("/supply/credits/ledger", get(ledger_read))
    .route("/supply/credits/audit", get(audit_read))
}

// ---- the caller ----

/// The signed-in user a supply call is made for.
async fn caller(service: &Service, headers: &HeaderMap) -> Result<Reader, Refusal> {
  reader(&service.db, headers).await
}

/// The caller the route refuses unless they are a platform administrator: everything platform-wide is
/// theirs (docs/accounts.md, 「Supply」).
async fn administrator(service: &Service, headers: &HeaderMap) -> Result<Reader, Refusal> {
  let who = caller(service, headers).await?;

  if !who.administrator {
    return Err(Refusal::forbidden("the platform's supply is an administrator's"));
  }

  Ok(who)
}

// ---- the reader's own supply ----

/// `GET /supply/me`: the reader's own view (docs/boundary.md, 「Supply」).
async fn me_read(State(service): State<Service>, headers: HeaderMap) -> Answer<SupplyView> {
  let who = caller(&service, &headers).await?;
  let resolved = resolve_to(&service.db, i64::from(who.user), Depth::Own).await?;

  Ok(Json(view(&service, &resolved).await?))
}

/// `PUT /supply/me`: the reader's own setting written whole.
async fn me_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<SupplySettingAsk>,
) -> Answer<SupplyView> {
  let who = caller(&service, &headers).await?;

  set_own_setting(&service.db, i64::from(who.user), &ask).await?;
  let resolved = resolve_to(&service.db, i64::from(who.user), Depth::Own).await?;

  Ok(Json(view(&service, &resolved).await?))
}

// The answer both of the reader's routes give.
async fn view(service: &Service, resolved: &Resolution) -> Result<SupplyView, Refusal> {
  let user = user_of(resolved);
  let setting = super::own_setting(&service.db, user).await?;
  let usage = super::usage(&service.db, user).await?;
  let personal = wallet(&service.db, "personal", user).await?;

  Ok(SupplyView {
    order: keys(&resolved.order),
    order_locked: resolved.order_locked,
    sources: sources(resolved, &setting),
    personal_credit_credits: setting.personal_credit_credits,
    usage: usage
      .iter()
      .map(|(source, credits, micros)| SupplyUsageRow {
        source: source.key().to_owned(),
        credits: *credits,
        cost_micros: *micros,
      })
      .collect(),
    global_remaining: resolved.plan.remaining,
    personal_credits: personal.map(|wallet| wallet.balance),
  })
}

// The user a resolution names.
fn user_of(resolved: &Resolution) -> i64 {
  resolved.user
}

fn keys(order: &[Source]) -> Vec<String> {
  order.iter().map(|source| source.key().to_owned()).collect()
}

// Every source's standing, `stop` last, with the person's own choice of it beside, so a write sends back what
// they chose.
fn sources(resolved: &Resolution, setting: &OwnSetting) -> Vec<bmo_web_client::SupplySourceState> {
  super::ALL
    .into_iter()
    .map(|source| {
      let state = resolved.of(source);
      let own = if setting.on.contains(&source) {
        Some("on")
      } else if setting.off.contains(&source) {
        Some("off")
      } else {
        None
      };

      bmo_web_client::SupplySourceState {
        source: source.key().to_owned(),
        allowed: state.allowed,
        off: state.off,
        locked: state.locked,
        own: own.map(str::to_owned),
        reason: state.closed_by.map(|closed| closed.code().to_owned()),
      }
    })
    .collect()
}

// ---- an organisation's supply ----

/// `GET /supply/units`: the companies whose supply the reader holds a part of — its policy and credits, its plan,
/// or both — by sumida's own relations on the company; every company for a platform administrator.
async fn units_read(State(service): State<Service>, headers: HeaderMap) -> Answer<SupplyUnits> {
  let who = caller(&service, &headers).await?;
  let user = i64::from(who.user);
  let rows = crate::all(
    &service.db,
    r#"SELECT "id", "name" FROM "organizations" WHERE "parent_id" IS NULL ORDER BY "id""#,
    vec![],
  )
  .await?;
  let mut units = Vec::new();

  for row in &rows {
    let id = i64::from(row.try_get::<i32>("", "id")?);
    let (policy, plan) = if who.administrator {
      (true, true)
    } else {
      (
        holds_credit(&service.db, user, id).await?,
        holds_subscription(&service.db, user, id).await?,
      )
    };

    if policy || plan {
      units.push(SupplyUnitReach {
        id,
        name: row.try_get("", "name")?,
        policy,
        plan,
      });
    }
  }

  Ok(Json(SupplyUnits { units }))
}

/// `GET /supply/org/{unit}`: the unit's policy as it stands, its plan, its wallet and this month's usage per
/// member, each read by the hand that may read it.
async fn org_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
) -> Answer<SupplyOrgView> {
  let unit = unit_of(&unit)?;
  let who = caller(&service, &headers).await?;
  let credits = who.administrator || holds_credit(&service.db, i64::from(who.user), unit).await?;
  let plan = who.administrator || holds_subscription(&service.db, i64::from(who.user), unit).await?;

  if !credits && !plan {
    return Err(Refusal::forbidden(
      "the unit's supply is its credit manager's or its subscription manager's",
    ));
  }

  let mut view = SupplyOrgView {
    unit,
    inherits: true,
    policy: None,
    plan: None,
    wallet: None,
    available: Vec::new(),
    usage: Vec::new(),
  };

  if credits {
    let platform = super::platform_policy(&service.db).await?;

    view.available = super::PAYABLE
      .iter()
      .filter(|source| platform.available(**source))
      .map(|source| source.key().to_owned())
      .collect();
    let resolved = org_policy(&service.db, unit).await?;
    view.inherits = resolved.as_ref().is_none_or(|policy| policy.from != Some(unit));
    view.policy = org_policy_of(&service.db, unit).await?;
    view.wallet = Some(match wallet(&service.db, "organization", unit).await? {
      Some(wallet) => SupplyWallet {
        balance: wallet.balance,
        reserved: wallet.reserved,
        debt: wallet.debt,
      },
      None => SupplyWallet {
        balance: 0,
        reserved: 0,
        debt: 0,
      },
    });
    view.usage = member_usage(&service.db, unit).await?;
  }
  if plan {
    view.plan = unit_plan(&service.db, unit).await?;
  }

  Ok(Json(view))
}

/// `PUT /supply/org/{unit}`: the unit's policy, by its credit manager or its head.
async fn org_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
  Body(ask): Body<bmo_web_client::SupplyPolicyAsk>,
) -> Answer<SupplyOrgView> {
  let unit = unit_of(&unit)?;
  may_manage(&service, &headers, unit).await?;
  set_org_policy(&service.db, caller(&service, &headers).await?.user as i64, unit, &ask).await?;

  org_read(State(service), headers, Path(unit.to_string())).await
}

/// `DELETE /supply/org/{unit}`: the policy taken away, the unit inheriting again.
async fn org_delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
) -> Answer<SupplyOrgView> {
  let unit = unit_of(&unit)?;
  let who = may_manage(&service, &headers, unit).await?;

  clear_org_policy(&service.db, i64::from(who.user), unit).await?;
  org_read(State(service), headers, Path(unit.to_string())).await
}

/// `POST /supply/org/{unit}/credits`: credits into the unit's wallet.
async fn org_credits(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
  Body(ask): Body<SupplyGrantAsk>,
) -> Answer<SupplyGranted> {
  let unit = unit_of(&unit)?;
  let who = may_manage(&service, &headers, unit).await?;

  grant(
    &service,
    &who,
    sumida::entity::membership::OwnerKind::Organization,
    unit,
    &ask.amount,
    ask.words.as_deref(),
  )
  .await
}

// The caller, refused where neither the unit's credit manager nor its head (nor a platform administrator)
// stands behind the call.
async fn may_manage(service: &Service, headers: &HeaderMap, unit: i64) -> Result<Reader, Refusal> {
  let who = caller(service, headers).await?;

  if !who.administrator && !holds_credit(&service.db, i64::from(who.user), unit).await? {
    return Err(Refusal::forbidden(
      "the unit's supply policy and credits are its credit manager's or its head's",
    ));
  }

  Ok(who)
}

/// The unit's policy as it stands, its own row or the nearest above, named by the unit whose it is.
async fn org_policy_of<C: ConnectionTrait>(db: &C, unit: i64) -> Result<Option<SupplyPolicyView>, Refusal> {
  let standing = super::org_policy(db, unit).await?;

  let Some(standing) = standing else {
    // With no row anywhere above, the platform's policy stands: the answer names what it opens — on or
    // overridable — as the inherited policy of a unit that sets nothing of its own.
    let platform = super::platform_policy(db).await?;
    let open = |source: &&Source| !source.payable() || platform.available(**source);

    return Ok(Some(SupplyPolicyView {
      allowed: super::PAYABLE.iter().filter(open).map(|source| source.key().to_owned()).collect(),
      order: platform.order.iter().filter(open).map(|source| source.key().to_owned()).collect(),
      member_credit_credits: None,
      from: None,
    }));
  };

  Ok(Some(SupplyPolicyView {
    allowed: standing.allowed.iter().map(|source| source.key().to_owned()).collect(),
    order: standing.order.iter().map(|source| source.key().to_owned()).collect(),
    member_credit_credits: standing.member_credit_credits,
    from: standing.from.filter(|from| *from != unit),
  }))
}

// The plan standing for the unit: its own live subscription's, newest period end first.
async fn unit_plan<C: ConnectionTrait>(
  db: &C,
  unit: i64,
) -> Result<Option<bmo_web_client::SupplyPlanCard>, Refusal> {
  Ok(plans::live(db, unit).await?.map(plans::LiveSubscription::card))
}

// This month's cost of every member of the unit, by source: what stands settled under the unit's wallet.
async fn member_usage<C: ConnectionTrait>(db: &C, unit: i64) -> Result<Vec<SupplyMemberUsageRow>, Refusal> {
  let rows = crate::all(
    db,
    r#"SELECT "user_id", "source", SUM("credits")::bigint AS "credits"
       FROM "supply_costs"
       WHERE "org_id" = $1 AND "period" = $2
       GROUP BY "user_id", "source"
       ORDER BY "user_id", "source""#,
    vec![unit.into(), super::period(crate::now_ms()).into()],
  )
  .await?;
  let mut out = Vec::new();

  for row in &rows {
    out.push(SupplyMemberUsageRow {
      user: ids::shown(row.try_get("", "user_id")?),
      source: row.try_get("", "source")?,
      credits: row.try_get("", "credits")?,
    });
  }

  Ok(out)
}

// ---- an organisation's plans ----

/// `GET /supply/org/{unit}/plans`: the plans the unit is shown and the one it runs on, read by its
/// subscription manager, its credit manager or head, or an administrator, who reads the catalogue too.
async fn org_plans_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
) -> Answer<SupplyOrgPlans> {
  let unit = unit_of(&unit)?;
  let who = caller(&service, &headers).await?;
  let user = i64::from(who.user);

  if !who.administrator
    && !holds_subscription(&service.db, user, unit).await?
    && !holds_credit(&service.db, user, unit).await?
  {
    return Err(Refusal::forbidden(
      "the unit's plans are its subscription manager's, its credit manager's or its head's",
    ));
  }

  Ok(Json(org_plans(&service.db, unit, who.administrator).await?))
}

/// `PUT /supply/org/{unit}/plans/exposed`: every plan the unit is shown, a platform administrator's.
async fn org_exposed_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
  Body(ask): Body<SupplyExposedAsk>,
) -> Answer<SupplyOrgPlans> {
  let unit = unit_of(&unit)?;
  let who = administrator(&service, &headers).await?;

  plans::set_exposed(&service.db, i64::from(who.user), unit, &ask.plans).await?;
  Ok(Json(org_plans(&service.db, unit, true).await?))
}

/// `PUT /supply/org/{unit}/plans/applied`: the plan the unit runs on, its subscription manager's or an
/// administrator's.
async fn org_applied_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(unit): Path<String>,
  Body(ask): Body<SupplyAppliedAsk>,
) -> Answer<SupplyOrgPlans> {
  let unit = unit_of(&unit)?;
  let who = caller(&service, &headers).await?;

  if !who.administrator && !holds_subscription(&service.db, i64::from(who.user), unit).await? {
    return Err(Refusal::forbidden("the plan a unit runs on is its subscription manager's"));
  }

  plans::apply(&service, who.user, unit, ask.plan).await?;
  Ok(Json(org_plans(&service.db, unit, who.administrator).await?))
}

// A unit's plans as every plans route answers them, the catalogue for an administrator alone.
async fn org_plans<C: ConnectionTrait>(
  db: &C,
  unit: i64,
  catalogue: bool,
) -> Result<SupplyOrgPlans, Refusal> {
  let exposed = plans::exposed(db, unit).await?;
  let mut shown = Vec::with_capacity(exposed.len());

  for plan in &exposed {
    shown.push(plan_row(db, *plan as i32).await?);
  }

  let catalogue = if catalogue {
    let rows = crate::all(
      db,
      r#"SELECT "id" FROM "membership_plans"
          WHERE "deleted_at" IS NULL AND "scope" = 'organization' ORDER BY "id" DESC"#,
      vec![],
    )
    .await?;
    let mut every = Vec::with_capacity(rows.len());

    for row in &rows {
      let plan = plan_row(db, row.try_get("", "id")?).await?;

      every.push(SupplyCataloguePlan {
        exposed: exposed.contains(&plan.id),
        plan,
      });
    }

    Some(every)
  } else {
    None
  };

  Ok(SupplyOrgPlans {
    exposed: shown,
    applied: plans::live(db, unit).await?.map(|live| SupplyAppliedPlan {
      plan: live.plan,
      since: live.since,
      period_end: live.period_end,
      card: live.card(),
    }),
    catalogue,
  })
}

// ---- a person's policy, an administrator's read ----

/// `GET /supply/user/{user}`: the person's per-user policy, the roads their personal supply serves, and
/// their resolved order.
async fn user_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Answer<SupplyUserView> {
  let user = i64::from(user_in(&user)?);
  let who = caller(&service, &headers).await?;
  let unit = home_unit(&service.db, user).await?;

  if !who.administrator && !holds_credit(&service.db, i64::from(who.user), unit).await? {
    return Err(Refusal::forbidden(
      "a person's supply policy is the credit manager's of the unit they stand in",
    ));
  }

  let mut view = person_view(&service, user).await?;
  // Only a read of another person's personal supply reaches the agency for the roads it serves; a policy
  // write answers the view without them, so it stands whether or not an agency is named.
  view.providers = service.agency.supply_roads(&user.to_string()).await?;

  Ok(Json(view))
}

// A person's supply view, the agency's roads aside: what a write and a read both answer.
async fn person_view(service: &Service, user: i64) -> Result<bmo_web_client::SupplyUserView, Refusal> {
  let resolved = resolve_to(&service.db, user, Depth::Own).await?;

  Ok(bmo_web_client::SupplyUserView {
    user: ids::shown(user as i32),
    inherits: user_policy(&service.db, user).await?.is_none(),
    policy: policy_view(&service.db, user).await?,
    order: keys(&resolved.order),
    providers: Vec::new(),
  })
}

async fn policy_view<C: ConnectionTrait>(db: &C, user: i64) -> Result<Option<SupplyPolicyView>, Refusal> {
  Ok(user_policy(db, user).await?.map(|policy| SupplyPolicyView {
    allowed: policy.allowed.iter().map(|source| source.key().to_owned()).collect(),
    order: policy.order.iter().map(|source| source.key().to_owned()).collect(),
    member_credit_credits: policy.member_credit_credits,
    from: None,
  }))
}

/// `PUT /supply/user/{user}`: the person's per-user policy written whole.
async fn user_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
  Body(ask): Body<bmo_web_client::SupplyPolicyAsk>,
) -> Answer<SupplyUserView> {
  let user = i64::from(user_in(&user)?);
  let who = may_over(&service, &headers, user).await?;

  set_user_policy(&service.db, i64::from(who.user), user, &ask).await?;
  Ok(Json(person_view(&service, user).await?))
}

/// `DELETE /supply/user/{user}`: the policy taken away, the person following their organisation's again.
async fn user_delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(user): Path<String>,
) -> Answer<SupplyUserView> {
  let user = i64::from(user_in(&user)?);
  let who = may_over(&service, &headers, user).await?;

  clear_user_policy(&service.db, i64::from(who.user), user).await?;
  Ok(Json(person_view(&service, user).await?))
}

// The caller, refused where they are no platform administrator and no credit manager of the unit the person
// stands in.
async fn may_over(service: &Service, headers: &HeaderMap, user: i64) -> Result<Reader, Refusal> {
  let who = caller(service, headers).await?;
  let unit = home_unit(&service.db, user).await?;

  if !who.administrator && !holds_credit(&service.db, i64::from(who.user), unit).await? {
    return Err(Refusal::forbidden(
      "a person's supply policy is the credit manager's of the unit they stand in",
    ));
  }

  Ok(who)
}

// ---- the platform ----

/// `GET /supply/platform`.
async fn platform_read(State(service): State<Service>, headers: HeaderMap) -> Answer<SupplyPlatform> {
  administrator(&service, &headers).await?;

  Ok(Json(platform_view(&service.db).await?))
}

async fn platform_view<C: ConnectionTrait>(db: &C) -> Result<SupplyPlatform, Refusal> {
  let policy = platform_policy(db).await?;
  let settings = platform_settings(db).await?;

  Ok(SupplyPlatform {
    allowed: keys(&policy.allowed),
    order: keys(&policy.order),
    overridable: keys(&policy.overridable),
    order_overridable: policy.order_overridable,
    credits_per_dollar: settings.credits_per_dollar,
    reservation_credits: settings.reservation_credits,
    enforce: settings.enforce,
  })
}

/// `PUT /supply/platform`: any part of the platform row changed.
async fn platform_write(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<bmo_web_client::SupplyPlatformAsk>,
) -> Answer<SupplyPlatform> {
  let who = administrator(&service, &headers).await?;

  set_platform(&service.db, i64::from(who.user), &ask).await?;
  Ok(Json(platform_view(&service.db).await?))
}

// ---- the plans ----

/// `GET /supply/plans`: every plan that stands, retired ones aside.
async fn plans_read(State(service): State<Service>, headers: HeaderMap) -> Answer<SupplyPlans> {
  administrator(&service, &headers).await?;

  let rows = crate::all(
    &service.db,
    r#"SELECT p."id", p."name", p."price", p."scope", p."billing_interval",
              (a."credit_cost" IS NOT NULL) AS "priced",
              (s."amount_quotas" ->> 'supply')::bigint AS "quota"
         FROM "membership_plans" p
         LEFT JOIN "plan_actions" a ON a."plan_id" = p."id" AND a."action" = 'supply'
         LEFT JOIN LATERAL (
           SELECT ss."amount_quotas" FROM "subscriptions" ss
            WHERE ss."plan_id" = p."id" AND ss."status" = 'active'
            ORDER BY ss."current_period_end" DESC LIMIT 1
         ) s ON true
        WHERE p."deleted_at" IS NULL
        ORDER BY p."id" DESC"#,
    vec![],
  )
  .await?;
  let mut plans = Vec::new();

  for row in &rows {
    plans.push(SupplyPlan {
      id: row.try_get::<i32>("", "id")? as i64,
      name: row.try_get("", "name")?,
      price: row.try_get("", "price")?,
      scope: match row.try_get::<String>("", "scope")?.as_str() {
        "personal" => "personal".to_owned(),
        _ => "organisation".to_owned(),
      },
      period: row
        .try_get::<Option<String>>("", "billing_interval")
        .ok()
        .flatten()
        .unwrap_or_else(|| "month".to_owned()),
      included_credits: row.try_get::<Option<i64>>("", "quota").ok().flatten(),
      credits_usable: row.try_get::<Option<bool>>("", "priced").ok().flatten().unwrap_or(false),
    });
  }

  Ok(Json(SupplyPlans { plans }))
}

/// `POST /supply/plans`: a plan made.
async fn plans_create(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<bmo_web_client::SupplyPlanAsk>,
) -> Result<(StatusCode, Json<SupplyPlan>), Refusal> {
  let who = administrator(&service, &headers).await?;

  if ask.price < 0 || ask.included_credits.is_some_and(|quota| quota < 0) {
    return Err(Refusal::bad("a plan's price and its included amount are numbers of zero or more"));
  }

  let period = period_of(&ask.period)?;
  let plan = sumida::api::service::membership::plan::PlanService::new(
    service.clone(),
    session(&service, who.user).await?,
  )
  .create(sumida::api::service::membership::plan::dto::CreatePlan {
    code: format!("supply-{}", crate::supply::hook::tail()),
    name: ask.name,
    description: None,
    kind: sumida::entity::membership::PlanKind::Subscription,
    scope: scope_of(&ask.scope)?,
    price: ask.price,
    currency: Some("KRW".to_owned()),
    billing_interval: Some(period.clone()),
    duration_days: Some(days_of(period.clone())),
    trial_days: None,
    credit_amount: None,
    is_enabled: true,
    actions: vec![supply_action(ask.included_credits, ask.credits_usable)],
  })
  .await?;

  audit(
    &service.db,
    i64::from(who.user),
    "plan",
    &format!("plan {}", plan.code),
    &format!("made: {} at {} {}", plan.name, plan.price, plan.currency),
  )
  .await?;

  Ok((StatusCode::CREATED, Json(plan_row(&service.db, plan.id).await?)))
}

/// `PATCH /supply/plans/{plan}`: the plan changed.
async fn plans_patch(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(plan): Path<String>,
  Body(ask): Body<bmo_web_client::SupplyPlanPatch>,
) -> Answer<SupplyPlan> {
  let who = administrator(&service, &headers).await?;
  let id = plan_of_path(&plan)?;
  let standing = plan_row_or_absent(&service.db, id).await?;
  let period = ask.period.as_deref().map(period_of).transpose()?;

  service
    .plans(session(&service, who.user).await?)
    .await?
    .update(
      id,
      sumida::api::service::membership::plan::dto::UpdatePlan {
        name: ask.name,
        description: None,
        price: ask.price,
        currency: None,
        billing_interval: period.clone(),
        duration_days: period.map(days_of),
        trial_days: None,
        credit_amount: None,
        is_enabled: None,
        actions: (ask.included_credits.is_some() || ask.credits_usable.is_some()).then(|| {
          vec![supply_action(
            ask.included_credits.or(standing.included_credits),
            ask.credits_usable.unwrap_or(standing.credits_usable),
          )]
        }),
      },
    )
    .await?;

  audit(&service.db, i64::from(who.user), "plan", &format!("plan {id}"), "changed").await?;
  Ok(Json(plan_row(&service.db, id).await?))
}

/// `DELETE /supply/plans/{plan}`: the plan retired and its exposures taken away, its subscriptions standing on
/// their snapshot until their period ends.
async fn plans_delete(
  State(service): State<Service>,
  headers: HeaderMap,
  Path(plan): Path<String>,
) -> Answer<SupplyPlans> {
  let who = administrator(&service, &headers).await?;
  let id = plan_of_path(&plan)?;

  // sumida's retirement runs in a transaction of its own; the exposures go after it, with the audit, so a
  // retirement refused leaves them standing, and a unit's read never names a retired plan meanwhile, since
  // the exposed plans are read among the standing ones alone.
  service.plans(session(&service, who.user).await?).await?.delete(id).await?;

  let txn = service.db.begin().await?;

  plans::forget(&txn, i64::from(id)).await?;
  audit(&txn, i64::from(who.user), "plan", &format!("plan {id}"), "retired").await?;
  txn.commit().await?;
  plans_read(State(service), headers).await
}

// One action row for a supply plan: the amount quota, and the credit cost where credits stand usable.
fn supply_action(
  quota: Option<i64>,
  credits_usable: bool,
) -> sumida::api::service::membership::plan::dto::PlanActionInput {
  sumida::api::service::membership::plan::dto::PlanActionInput {
    action: super::ACTION.to_owned(),
    credit_cost: credits_usable.then_some(1),
    quota_per_period: None,
    amount_quota_per_period: Some(quota.unwrap_or(0)),
  }
}

fn period_of(period: &str) -> Result<sumida::entity::membership::BillingInterval, Refusal> {
  use sumida::entity::membership::BillingInterval as Interval;

  match period {
    "day" => Ok(Interval::Day),
    "week" => Ok(Interval::Week),
    "month" => Ok(Interval::Month),
    "year" => Ok(Interval::Year),
    other => Err(Refusal::bad(format!("`{other}` is no billing period"))),
  }
}

fn days_of(period: sumida::entity::membership::BillingInterval) -> i32 {
  use sumida::entity::membership::BillingInterval as Interval;

  match period {
    Interval::Day => 1,
    Interval::Week => 7,
    Interval::Month => 30,
    Interval::Year => 365,
  }
}

fn scope_of(scope: &str) -> Result<sumida::entity::membership::OwnerKind, Refusal> {
  match scope {
    "personal" => Ok(sumida::entity::membership::OwnerKind::Personal),
    "organisation" | "organization" => Ok(sumida::entity::membership::OwnerKind::Organization),
    other => Err(Refusal::bad(format!("`{other}` is no plan scope"))),
  }
}

fn plan_of_path(plan: &str) -> Result<i32, Refusal> {
  plan.parse::<i32>().map_err(|_| Refusal::bad(format!("`{plan}` is no plan's id")))
}

fn unit_of(unit: &str) -> Result<i64, Refusal> {
  unit.parse::<i64>().map_err(|_| Refusal::bad(format!("`{unit}` is no unit's id")))
}

async fn plan_row_or_absent<C: ConnectionTrait>(db: &C, id: i32) -> Result<SupplyPlan, Refusal> {
  plan_row(db, id).await.map_err(|_| Refusal::absent(format!("no plan {id}")))
}

async fn plan_row<C: ConnectionTrait>(db: &C, id: i32) -> Result<SupplyPlan, Refusal> {
  let row = one(
    db,
    r#"SELECT p."name", p."price", p."scope", p."billing_interval",
              (a."credit_cost" IS NOT NULL) AS "priced",
              (a."amount_quota_per_period") AS "quota"
         FROM "membership_plans" p
         LEFT JOIN "plan_actions" a ON a."plan_id" = p."id" AND a."action" = 'supply'
        WHERE p."id" = $1 AND p."deleted_at" IS NULL"#,
    vec![id.into()],
  )
  .await?
  .ok_or_else(|| Refusal::absent(format!("no plan {id} stands")))?;

  Ok(SupplyPlan {
    id: id as i64,
    name: row.try_get("", "name")?,
    price: row.try_get("", "price")?,
    scope: match row.try_get::<String>("", "scope")?.as_str() {
      "personal" => "personal".to_owned(),
      _ => "organisation".to_owned(),
    },
    period: row
      .try_get::<Option<String>>("", "billing_interval")
      .ok()
      .flatten()
      .unwrap_or_else(|| "month".to_owned()),
    included_credits: row.try_get::<Option<i64>>("", "quota").ok().flatten(),
    credits_usable: row.try_get::<Option<bool>>("", "priced").ok().flatten().unwrap_or(false),
  })
}

// ---- grants, the ledger and the audit ----

/// `POST /supply/credits`: credits into anyone's wallet, the platform administrator's act.
async fn credits_grant(
  State(service): State<Service>,
  headers: HeaderMap,
  Body(ask): Body<SupplyCreditAsk>,
) -> Answer<SupplyGranted> {
  let who = administrator(&service, &headers).await?;
  let kind = match ask.owner_kind.as_str() {
    "user" => sumida::entity::membership::OwnerKind::Personal,
    "organisation" | "organization" => sumida::entity::membership::OwnerKind::Organization,
    other => return Err(Refusal::bad(format!("`{other}` is no owner kind"))),
  };

  grant(&service, &who, kind, ask.owner_id, &ask.amount, ask.words.as_deref()).await
}

// A grant, judged twice over: by the standing the route names, and by sumida's own gate — a personal wallet
// is an administrator's alone, and an organisation's its credit manager's or its head's.
async fn grant(
  service: &Service,
  who: &Reader,
  kind: sumida::entity::membership::OwnerKind,
  owner: i64,
  amount: &i64,
  words: Option<&str>,
) -> Answer<SupplyGranted> {
  if *amount <= 0 {
    return Err(Refusal::bad("a grant is a number of one or more"));
  }

  let session = session(service, who.user).await?;
  let result = CreditService::new(service.clone(), session)
    .grant(GrantCredit {
      owner_kind: kind.clone(),
      owner_id: Some(owner as i32),
      amount: *amount,
      plan_code: None,
      expiry_at: None,
      reference_code: words.map(str::to_owned),
      idempotency_key: None,
    })
    .await?;

  audit(
    &service.db,
    i64::from(who.user),
    "grant",
    &format!("{} {owner}", super::hook::kind_text(&kind)),
    &format!("{amount} granted, balance {}", result.balance),
  )
  .await?;

  Ok(Json(SupplyGranted {
    balance: result.balance,
    debt: result.debt,
  }))
}

/// `GET /supply/credits/ledger`: the wallet ledger of this service's database, newest first, paged.
async fn ledger_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Query(page): Query<Page>,
) -> Answer<SupplyLedgerPage> {
  administrator(&service, &headers).await?;
  let after = page.after.unwrap_or(i64::MAX);
  let limit = bound(page.limit);

  let rows = crate::all(
    &service.db,
    r#"SELECT t."id", t."created_at", w."owner_kind", w."owner_id", t."kind", t."amount", t."debt_change",
              t."balance_after", t."reference_code"
         FROM "credit_transactions" t
         JOIN "credit_wallets" w ON w."id" = t."wallet_id"
        WHERE t."id" < $1
        ORDER BY t."id" DESC
        LIMIT $2"#,
    vec![after.into(), limit.into()],
  )
  .await?;
  let mut entries = Vec::new();
  let mut next = None;

  for row in &rows {
    entries.push(SupplyLedgerEntry {
      id: row.try_get("", "id")?,
      at: epoch_ms(row, "created_at")?,
      owner_kind: row.try_get::<String>("", "owner_kind")?,
      owner_id: row.try_get::<i32>("", "owner_id")? as i64,
      kind: row.try_get("", "kind")?,
      amount: row.try_get("", "amount")?,
      debt_change: row.try_get("", "debt_change")?,
      balance_after: row.try_get("", "balance_after")?,
      words: row.try_get::<Option<String>>("", "reference_code")?,
    });
    next = Some(entries.last().expect("one entry just went in").id.to_string());
  }

  let next = (entries.len() as i64 == limit).then_some(next).flatten();

  Ok(Json(SupplyLedgerPage { entries, next }))
}

/// `GET /supply/credits/audit`: the supply audit, newest first, paged.
async fn audit_read(
  State(service): State<Service>,
  headers: HeaderMap,
  Query(page): Query<Page>,
) -> Answer<SupplyAuditPage> {
  administrator(&service, &headers).await?;
  let after = page.after.unwrap_or(i64::MAX);
  let limit = bound(page.limit);

  let rows = crate::all(
    &service.db,
    r#"SELECT a."id", a."at", a."by", a."kind", a."subject", a."detail",
              COALESCE(NULLIF(u."full_name", ''), u."username") AS "by_name"
         FROM "supply_audit" a
         LEFT JOIN "users" u ON u."id" = a."by"
        WHERE a."id" < $1
        ORDER BY a."id" DESC
        LIMIT $2"#,
    vec![after.into(), limit.into()],
  )
  .await?;
  let mut entries = Vec::new();
  let mut next = None;

  for row in &rows {
    entries.push(bmo_web_client::SupplyAuditEntry {
      id: row.try_get("", "id")?,
      at: row.try_get("", "at")?,
      by: ids::shown(row.try_get::<i64>("", "by")? as i32),
      by_name: row.try_get::<Option<String>>("", "by_name").ok().flatten().unwrap_or_default(),
      kind: row.try_get("", "kind")?,
      subject: row.try_get("", "subject")?,
      detail: row.try_get("", "detail")?,
    });
    next = Some(entries.last().expect("one entry just went in").id.to_string());
  }

  let next = (entries.len() as i64 == limit).then_some(next).flatten();

  Ok(Json(SupplyAuditPage { entries, next }))
}

#[derive(serde::Deserialize)]
struct Page {
  after: Option<i64>,
  limit: Option<i64>,
}

fn bound(limit: Option<i64>) -> i64 {
  limit.unwrap_or(50).clamp(1, 200)
}

// A timestamp column of sumida's ledger, read as epoch milliseconds.
fn epoch_ms(row: &sea_orm::QueryResult, column: &str) -> Result<i64, Refusal> {
  let at: chrono::DateTime<chrono::Utc> = row.try_get("", column)?;

  Ok(at.timestamp_millis())
}

// The plans service under a session of the caller's.
impl Service {
  async fn plans(
    &self,
    session: sumida::infra::session::UserSession,
  ) -> Result<sumida::api::service::membership::plan::PlanService<Service>, Refusal> {
    Ok(sumida::api::service::membership::plan::PlanService::new(self.clone(), session))
  }
}
