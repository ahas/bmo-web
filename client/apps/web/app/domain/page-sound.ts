// The page's own sounds, which a voice briefing waits behind (docs/web.md, 「Messages」, the briefing's
// player): what a screen plays itself, in the console's audio player or in a video. The briefing's own
// element is marked as its, and is no page's sound.

// Every player of the page's. The briefing's element carries its own mark, so it is left out.
const PAGE_PLAYERS = "[data-player]:not([data-briefing])";

// What a media element says that may change whether one of the page's sounds is heard. Media events do not
// bubble, so they are followed on their way down.
const SOUND_EVENTS = ["play", "playing", "pause", "ended", "emptied", "volumechange"] as const;

/** Every player of the page's own, in the order it stands. */
export function pagePlayers(): NodeListOf<HTMLMediaElement> {
  return document.querySelectorAll<HTMLMediaElement>(PAGE_PLAYERS);
}

// A sound that is going and that the reader can hear. A muted one talks over nothing, and a video that loops
// silently would hold a briefing for as long as it stands.
function audible(player: HTMLMediaElement): boolean {
  return !player.paused && !player.ended && !player.muted && player.volume > 0;
}

/** Whether a sound the page plays itself is being heard now. */
export function pageSoundPlaying(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  return [...pagePlayers()].some(audible);
}

/**
 * Follows the page's own sounds for as long as the caller stands, calling back whenever one may have started
 * or stopped. It says whether one plays now rather than why it changed: a reader leaving a page takes the
 * sound and its element with it.
 */
export function followPageSound(change: (playing: boolean) => void): () => void {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  const changed = (): void => change(pageSoundPlaying());

  for (const event of SOUND_EVENTS) {
    document.addEventListener(event, changed, true);
  }

  return () => {
    for (const event of SOUND_EVENTS) {
      document.removeEventListener(event, changed, true);
    }
  };
}
