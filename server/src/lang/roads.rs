//! What a road says of itself where a person reads it (`lang/<language>/roads.yaml`), each line with the `{name}`
//! marks its file names.

use serde::Deserialize;

/// What a road says of itself where a person reads it.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoadWords {
  pub telegram: Telegram,
  pub service: Service,
  /// Why a road refuses a send while the machine has not stood it up yet.
  pub not_standing: String,
  pub kakao: Kakao,
  pub discord: Discord,
  pub teams: Teams,
}

/// The `kakao` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Kakao {
  pub refusals: KakaoRefusals,
}

/// What the KakaoTalk road refuses a send with.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KakaoRefusals {
  pub unconfigured: String,
  pub unknown_room: String,
  pub voice_unconfigured: String,
  pub pc_unreachable: String,
  pub pc_failed: String,
}

/// The `discord` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Discord {
  pub refusals: DiscordRefusals,
}

/// What the Discord road refuses a send with.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiscordRefusals {
  pub unconfigured: String,
  pub unknown_room: String,
  pub voice_unconfigured: String,
  pub message_missing: String,
  pub sticker_missing: String,
}

/// The `teams` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Teams {
  pub refusals: TeamsRefusals,
}

/// What the Teams road refuses a send in the owner's own account with.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeamsRefusals {
  pub owner_text_only: String,
  pub owner_unconfigured: String,
  pub owner_unknown_room: String,
}

/// The lines the service says as itself rather than in the chat agent's voice, kept as fixed lines and drawn as system
/// lines, so none opens with a mark.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Service {
  pub stopping: Stopping,
}

/// What the service says as it stops.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Stopping {
  pub deploying: String,
  pub items: String,
  pub restarting: String,
}

/// The `telegram` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Telegram {
  pub kinds: TelegramKinds,
  pub refusals: TelegramRefusals,
}

/// What the Telegram road refuses a send with.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TelegramRefusals {
  pub unconfigured: String,
  pub mode_down: String,
  pub mode_missing: String,
}

/// The `kinds` lines.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TelegramKinds {
  pub forwarded: String,
  pub forwarded_bare: String,
  pub forwarded_chat: String,
  pub photo: String,
  pub location: String,
  pub location_live: String,
  pub venue: String,
  pub contact: String,
  pub poll: String,
  pub sticker: String,
  pub sticker_set: String,
  pub video: String,
  pub video_note: String,
  pub voice: String,
  pub audio: String,
  pub document: String,
  pub story: String,
  pub paid_media: String,
  pub giveaway: String,
  pub joined: String,
  pub left: String,
  pub pinned: String,
  pub pinned_message: String,
  pub renamed: String,
  pub photo_changed: String,
  pub photo_deleted: String,
  pub call_started: String,
  pub call_ended: String,
}

crate::part!(pub ROAD_WORDS: RoadWords = "roads");
