// The words of the storage tab (docs/web.md, 「System and organisation」, the storage tab): a kind of place bmo-artifact offers is
// shown by its word in the pack, and by its own name where the pack has none, so a kind bmo-artifact adds is offered
// before its word is written; a setting of a place the same way. The pack's words are named here whole, so the
// pack's check finds each one asked for.

import type { Translate } from "#shared/wording";

/** The choice of following the link above in the storage form. */
export const FOLLOWS = "inherit";

// Each kind of place's word, by its name.
const PLACE_WORDS: Readonly<Record<string, string>> = {
  local: "org_storage.label.place_local",
  sharepoint: "org_storage.label.place_sharepoint"
};

// Each setting's label, by its place and its key.
const FIELD_WORDS: Readonly<Record<string, string>> = {
  "sharepoint.site": "org_storage.label.sharepoint_site",
  "sharepoint.drive": "org_storage.label.sharepoint_drive",
  "sharepoint.folder": "org_storage.label.sharepoint_folder",
  "sharepoint.account": "org_storage.label.sharepoint_account"
};

// What an optional setting left unset comes to, by its place and its key.
const UNSET_WORDS: Readonly<Record<string, string>> = {
  "sharepoint.account": "org_storage.label.sharepoint_account_unset"
};

/** A kind of place's word, the local place's where none is named. */
export function placeName(t: Translate, place: string | null): string {
  const name = place ?? "local";
  const key = PLACE_WORDS[name];

  return key === undefined ? name : t(key);
}

/** A setting's label: its word in the pack, its own key where the pack has none. */
export function storageFieldLabel(t: Translate, place: string, field: string): string {
  const key = FIELD_WORDS[`${place}.${field}`];

  return key === undefined ? field : t(key);
}

/** What an optional setting left unset comes to. */
export function unsetLine(t: Translate, place: string, field: string): string {
  return t(UNSET_WORDS[`${place}.${field}`] ?? "org_storage.label.unset");
}
