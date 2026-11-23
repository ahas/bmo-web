//! Every body the supply routes carry (`docs/boundary.md`, 「Supply」; `docs/accounts.md`, 「Supply」): the
//! hook ask and its answer, the console's view of a person's supply, the policies of each layer, the
//! platform's settings and plans, and the two ledgers. A source key is one of `personal`, `global`,
//! `org_credits`, `personal_credits` and `stop`; a policy's `order` holds `stop` last.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// One platform amount in US dollars, as the hook carries it.
pub type SupplyUsd = f64;

/// The ask posted to the supply hook: the point and the operation with its fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyHookAsk {
  pub point: String,
  pub ask: SupplyHookOp,
}

/// The ask of one hook operation. Each operation reads the fields it names; the rest stand absent.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyHookOp {
  pub op: String,
  /// The agency's supply key for the run: its kind, its number and the moment it chose its source.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub run: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub step: Option<i64>,
  /// The account the run stands under, as the digits of a user's id: handed as text or as a number.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub account: Option<serde_json::Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub provider: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub model: Option<String>,
  /// `job` or `turn`, for an order ask.
  #[serde(default, rename = "kind", skip_serializing_if = "Option::is_none")]
  pub run_kind: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub job: Option<serde_json::Value>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub supervisor: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub room: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub source: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub reservation: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub spent_usd: Option<SupplyUsd>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub cost_usd: Option<SupplyUsd>,
  /// The idempotency key `<run>:<step>:<op>`, taken once end to end.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub key: Option<String>,
}

/// The answer to a hook operation, under `answer`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyHookAnswer {
  pub answer: SupplyHookReply,
}

/// What one hook operation answered.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyHookReply {
  /// The resolved order for an `order` ask, `stop` left out.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub sources: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub accepted: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub reservation: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub amount_usd: Option<SupplyUsd>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub expires_at: Option<i64>,
  /// When a refused reservation may be asked again, where a moment is known.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub reopens_at: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub taken: Option<bool>,
}

/// One source as the reader's view stands it: whether the layers above allow it, whether the reader has it
/// switched off, whether the platform locks it, and where it is not allowed, which layer closed it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplySourceState {
  pub source: String,
  pub allowed: bool,
  pub off: bool,
  /// Whether the platform holds the source as it says for everyone, so the reader's own setting cannot change
  /// it; `stop` is always locked.
  pub locked: bool,
  /// The reader's own choice of the source, `on` or `off`; absent where they made none and the platform's
  /// default stands.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub own: Option<String>,
  /// `not-in-plan`, `blocked-by-organisation` or `blocked-by-administrator`.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
}

/// What one source cost this month, per source.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyUsageRow {
  pub source: String,
  pub credits: i64,
  pub cost_micros: i64,
}

/// The reader's own supply view.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyView {
  pub order: Vec<String>,
  /// Whether the platform locks the order, so the reader's own order is not read.
  pub order_locked: bool,
  pub sources: Vec<SupplySourceState>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub personal_credit_credits: Option<i64>,
  pub usage: Vec<SupplyUsageRow>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub global_remaining: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub personal_credits: Option<i64>,
}

/// The reader's own setting written whole: their order, not read while the platform locks it, and the
/// overridable sources they switch off and on against the platform's default.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplySettingAsk {
  pub order: Vec<String>,
  pub off: Vec<String>,
  pub on: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub personal_credit_credits: Option<i64>,
}

/// One policy as it stands for a unit or a person: whose row it is where it stands above.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPolicyView {
  pub allowed: Vec<String>,
  pub order: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub member_credit_credits: Option<i64>,
  /// The unit whose row stands, where the unit inherits one from above.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub from: Option<i64>,
}

/// The plan standing for a unit, as its `subscription_manager` reads it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPlanCard {
  pub name: String,
  pub price: i64,
  pub scope: String,
  pub period: String,
  pub included_credits: Option<i64>,
  pub credits_usable: bool,
}

/// What a credit wallet holds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyWallet {
  pub balance: i64,
  pub reserved: i64,
  pub debt: i64,
}

/// What one member of a unit cost this month, by source.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyMemberUsageRow {
  pub user: String,
  pub source: String,
  pub credits: i64,
}

/// A unit's supply view.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyOrgView {
  pub unit: i64,
  pub inherits: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub policy: Option<SupplyPolicyView>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub plan: Option<SupplyPlanCard>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub wallet: Option<SupplyWallet>,
  /// For a policy holder, the sources the platform makes available to an organisation's policy: those it turns
  /// on or leaves to a person's own setting. Empty for anyone else.
  #[serde(default)]
  pub available: Vec<String>,
  pub usage: Vec<SupplyMemberUsageRow>,
}

/// One company whose supply the reader holds a part of: its policy and credits, its plan, or both.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyUnitReach {
  pub id: i64,
  pub name: String,
  /// Whether the reader holds the company's supply policy and credits: its credit manager or its head.
  pub policy: bool,
  /// Whether the reader holds the company's plan: its subscription manager or its head.
  pub plan: bool,
}

/// The companies whose supply the reader holds a part of, every one for a platform administrator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyUnits {
  pub units: Vec<SupplyUnitReach>,
}

/// An organisation's or a person's policy written whole.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPolicyAsk {
  pub allowed: Vec<String>,
  pub order: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub member_credit_credits: Option<i64>,
}

/// A person's supply as an administrator reads it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyUserView {
  pub user: String,
  pub inherits: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub policy: Option<SupplyPolicyView>,
  pub order: Vec<String>,
  /// The roads the person's personal supply serves; never a credential, never a secret's value.
  pub providers: Vec<String>,
}

/// The platform's policy and money settings. `allowed` holds the sources the platform turns on, `overridable`
/// the ones a person's own setting may switch against that default; a source in neither is closed everywhere.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPlatform {
  pub allowed: Vec<String>,
  pub order: Vec<String>,
  pub overridable: Vec<String>,
  pub order_overridable: bool,
  pub credits_per_dollar: i64,
  pub reservation_credits: i64,
  pub enforce: bool,
}

/// Any part of the platform row changed.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPlatformAsk {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub allowed: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub order: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub overridable: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub order_overridable: Option<bool>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub credits_per_dollar: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub reservation_credits: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub enforce: Option<bool>,
}

/// One membership plan whole, as the platform's plan screen reads and writes it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPlan {
  pub id: i64,
  pub name: String,
  /// Whole won.
  pub price: i64,
  /// `personal` or `organisation`.
  pub scope: String,
  /// `day`, `week`, `month` or `year`.
  pub period: String,
  /// The amount quota the plan carries for its supply action; null where it includes none.
  pub included_credits: Option<i64>,
  pub credits_usable: bool,
}

/// A plan made whole.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPlanAsk {
  pub name: String,
  pub price: i64,
  pub scope: String,
  pub period: String,
  pub included_credits: Option<i64>,
  pub credits_usable: bool,
}

/// A plan changed in part.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyPlanPatch {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub price: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub period: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub included_credits: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub credits_usable: Option<bool>,
}

/// The plans, newest first.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct SupplyPlans {
  pub plans: Vec<SupplyPlan>,
}

/// One plan of the platform's catalogue as an administrator reads it for a unit: the plan, and whether the
/// unit is shown it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyCataloguePlan {
  #[serde(flatten)]
  pub plan: SupplyPlan,
  pub exposed: bool,
}

/// The plan a unit runs on: the plan's id, its subscription's period, in epoch milliseconds, and the plan whole as
/// the subscription stands on it, whether or not it is still exposed to the unit or still stands.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyAppliedPlan {
  pub plan: i64,
  pub since: i64,
  pub period_end: i64,
  #[serde(flatten)]
  pub card: SupplyPlanCard,
}

/// An organisation unit's plans: the ones it is shown, the one it runs on, and for an administrator every
/// organisation-scope plan with whether the unit is shown it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyOrgPlans {
  pub exposed: Vec<SupplyPlan>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub applied: Option<SupplyAppliedPlan>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub catalogue: Option<Vec<SupplyCataloguePlan>>,
}

/// Every plan a unit is shown, written whole.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyExposedAsk {
  pub plans: Vec<i64>,
}

/// The plan a unit runs on, one of its exposed plans, or none. The key is named even for none: a body naming
/// no `plan` at all does not read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyAppliedAsk {
  #[serde(deserialize_with = "named_even_as_null")]
  #[schemars(required, with = "Option<i64>")]
  pub plan: Option<i64>,
}

// A value read where the key must stand, null among what it may hold: serde reads a missing `Option` as
// none unless the field is read through a function of its own.
fn named_even_as_null<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
  deserializer: D,
) -> Result<Option<T>, D::Error> {
  Option::<T>::deserialize(deserializer)
}

/// Credits granted to a unit's wallet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyGrantAsk {
  pub amount: i64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub words: Option<String>,
}

/// Credits granted to anyone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyCreditAsk {
  /// `user` or `organisation`.
  pub owner_kind: String,
  pub owner_id: i64,
  pub amount: i64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub words: Option<String>,
}

/// The wallet as it stands after a grant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyGranted {
  pub balance: i64,
  pub debt: i64,
}

/// One entry of the credits ledger.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyLedgerEntry {
  pub id: i64,
  pub at: i64,
  pub owner_kind: String,
  pub owner_id: i64,
  /// The membership ledger kind: `grant`, `consume`, `reserve`, `capture` and the rest.
  pub kind: String,
  pub amount: i64,
  pub debt_change: i64,
  pub balance_after: i64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub words: Option<String>,
}

/// A page of the credits ledger, newest first.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct SupplyLedgerPage {
  pub entries: Vec<SupplyLedgerEntry>,
  pub next: Option<String>,
}

/// One audited supply act.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SupplyAuditEntry {
  pub id: i64,
  pub at: i64,
  pub by: String,
  pub by_name: String,
  /// `grant`, `policy`, `settings` or `plan`.
  pub kind: String,
  pub subject: String,
  pub detail: String,
}

/// A page of the audit, newest first.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct SupplyAuditPage {
  pub entries: Vec<SupplyAuditEntry>,
  pub next: Option<String>,
}
