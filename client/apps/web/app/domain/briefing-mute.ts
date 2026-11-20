import type { Ref } from "vue";

// This device's mute of the voice briefings (docs/web.md, 「Messages」, the briefing's player, 「Muted on this device」):
// kept in this browser alone, never on the account, so another device or another browser profile plays on, and every
// tab of this browser follows it.

const MUTE_KEY = "bmo-web.briefing-muted";
const MUTE_STATE = "bmo-briefing-muted";
const MUTED = "1";

/** Whether the value kept in this browser says its briefings are muted; anything else plays them aloud. */
export function mutedOf(raw: string | null): boolean {
  return raw === MUTED;
}

function keptMute(): boolean {
  try {
    return mutedOf(window.localStorage.getItem(MUTE_KEY));
  } catch {
    // A browser that keeps nothing plays its briefings aloud until muted for this visit.
    return false;
  }
}

/** The mute as the page holds it, and the press that changes it and keeps it in this browser. */
export function useBriefingMute(): { muted: Ref<boolean>; keep: (next: boolean) => void } {
  const muted = useState<boolean>(MUTE_STATE, () => false);

  function keep(next: boolean): void {
    muted.value = next;

    try {
      if (next) window.localStorage.setItem(MUTE_KEY, MUTED);
      else window.localStorage.removeItem(MUTE_KEY);
    } catch {
      // A browser that refuses storage still keeps the mute for this visit.
    }
  }

  return { muted, keep };
}

/**
 * Reads the mute kept in this browser into the page, and again whenever another tab of the browser changes it.
 * Returns what stops following it.
 */
export function followBriefingMute(muted: Ref<boolean>): () => void {
  muted.value = keptMute();

  const heard = (event: StorageEvent): void => {
    if (event.key === MUTE_KEY || event.key === null) muted.value = keptMute();
  };

  window.addEventListener("storage", heard);

  return () => window.removeEventListener("storage", heard);
}
