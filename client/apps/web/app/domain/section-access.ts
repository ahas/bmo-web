import { accessMap } from "#shared/sections";

import type { Ref } from "vue";
import type { SectionAccessMap, SectionRow } from "#shared/sections";

// What the signed-in person may use, by console section (docs/web.md, 「Access」): read once from the console's
// own route after a login, and kept for the tab so the navigation and the page guard read it without asking
// again. The account service decides it; this asks once and reads the answer.

const ACCESS = "section-access";
const READY = "section-access-ready";

export function useSectionAccess(): Ref<SectionAccessMap> {
  return useState<SectionAccessMap>(ACCESS, () => ({}));
}

export function useSectionAccessReady(): Ref<boolean> {
  return useState<boolean>(READY, () => false);
}

/** The signed-in person's sections, asked for once for the tab and asked again where `again` says so. */
export async function ensureSectionAccess(again = false): Promise<SectionAccessMap> {
  const access = useSectionAccess();
  const ready = useSectionAccessReady();

  if (ready.value && !again) return access.value;

  const rows = await useRequestFetch()<SectionRow[]>("/api/me/sections");

  access.value = accessMap(rows);
  ready.value = true;

  return access.value;
}

/** The permissions forgotten, so the next screen reads them again after a login or a change. */
export function forgetSectionAccess(): void {
  useSectionAccess().value = {};
  useSectionAccessReady().value = false;
}
