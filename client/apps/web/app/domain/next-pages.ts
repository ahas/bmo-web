import { ref, watch } from "vue";

import type { Ref } from "vue";

// A list's next pages, read while its foot stands in view (docs/skeleton-loading.md, 「What a skeleton is for」).
// A page that lands without pushing the foot out of view — a filter leaving few of its rows on the screen — is
// followed by the next at once, and the reads that follow one another so are one wait: the foot's placeholder
// stands from the first of them until the foot has left the view or nothing more is held, never going and coming
// back between them.

export interface NextPagesOptions {
  // Whether the foot stands in view, as measured against the rows that have landed.
  atFoot: Ref<boolean>;
  // Whether the source holds more than has been read.
  more: () => boolean;
  // Whether another read of the list is going now, which a next page waits behind.
  busy: () => boolean;
  // Reads one more page, answering whether it landed; a page that did not ends the run, and the failure says why.
  next: () => Promise<boolean>;
  // Resolves once the rows a page brought are drawn and the foot measured against them. Two frames of the
  // browser's by default, the second being the one the foot's measure is handed over in; a test hands its own.
  settled?: () => Promise<void>;
}

export interface NextPages {
  // Whether next pages are being read, which the foot's placeholder stands on.
  adding: Ref<boolean>;
}

function frames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function useNextPages(options: NextPagesOptions): NextPages {
  const adding = ref(false);
  const settled = options.settled ?? frames;

  async function read(): Promise<void> {
    if (adding.value || options.busy() || !options.more()) return;

    adding.value = true;

    try {
      let landed: boolean;

      do {
        // A read already going — the clock's — is waited out rather than asked over.
        while (options.busy()) await settled();

        landed = await options.next();
        await settled();
      } while (landed && options.atFoot.value && options.more());
    } finally {
      adding.value = false;
    }
  }

  watch([options.atFoot, options.busy, options.more], () => {
    if (options.atFoot.value && !options.busy() && options.more()) void read();
  });

  return { adding };
}
