import { createParser } from "eventsource-parser";

import { unitAt, unitHeaders } from "../utils/units";

// The translator's word that a document's translation moved, handed to every open tab as the console's own
// `document-translation` (`docs/documents-viewer.md`, 「Asking to be taken somewhere, and reading a translation」):
// the gate's stream is followed for its `document-translation.changed` events, each naming the document, and a tab
// reading that document reads its translation again. A gate that is not there is asked again a while later.

const UNIT = "GATE";
const KIND = "document-translation.changed";
const RETRY_MS = 5_000;
const RETRY_CAP_MS = 60_000;

async function follow(stopping: () => boolean, aborted: AbortSignal): Promise<void> {
  let attempts = 0;

  while (!stopping()) {
    const unit = unitAt(UNIT);

    if (unit === null) return;

    try {
      const response = await fetch(`${unit.address}/events`, { headers: { ...unitHeaders(unit), accept: "text/event-stream" }, signal: aborted });

      if (!response.ok || response.body === null) throw new Error(String(response.status));

      attempts = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createParser({
        onEvent(one) {
          if (one.event !== KIND) return;

          try {
            const frame = JSON.parse(one.data) as { data?: { document?: unknown } };

            if (typeof frame.data?.document === "string") publishConsoleEvent("document-translation", { document: frame.data.document });
          } catch {
            // A frame that does not read names no document.
          }
        }
      });

      for (;;) {
        const chunk = await reader.read();

        if (chunk.done || stopping()) break;

        parser.feed(decoder.decode(chunk.value, { stream: true }));
      }
    } catch (error) {
      if (stopping()) return;

      console.error("translation: could not read the gate's events:", error);
    }

    attempts += 1;

    await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_MS * attempts, RETRY_CAP_MS)));
  }
}

export default defineNitroPlugin((nitro) => {
  let stopped = false;
  const aborted = new AbortController();

  nitro.hooks.hook("close", () => {
    stopped = true;
    aborted.abort();
  });

  void follow(() => stopped, aborted.signal);
});
