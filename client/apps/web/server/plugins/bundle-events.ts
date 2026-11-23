import { createParser } from "eventsource-parser";

import { noticeReaders } from "bmo-ui/shared/console-manifest";

import { memberOf, noticeOf } from "../utils/bundle-notices";
import { SIDEBAR_COUNTS_WORD, dutyOf } from "../utils/bundle-streams";
import { publishConsoleEvent } from "../utils/console-events";
import { onBundlesRead } from "../utils/console-manifests";
import { noticeHearers } from "../utils/notice-hearers";
import { OWNER_KEY_HEADER, OWNER_ROLE_HEADER, moveAdministratorKey } from "../utils/owner-key";
import { ring } from "../utils/push";
import { ringsFromThisServer } from "../utils/pushnews";
import { unitHeaders } from "../utils/units";

import type { NoticeWords } from "../utils/bundle-notices";
import type { StreamDuty } from "../utils/bundle-streams";
import type { AttachedBundle } from "../utils/console-manifests";
import type { NoticeHearers } from "../utils/notice-hearers";

// A console bundle's event stream, followed by the console's server (docs/web.md, 「Notifications」 and 「Sidebar」;
// bmo-ui's `docs/console-bundles.md`, 「Notices」 and the sidebar count): every event whose kind the manifest names
// under `pushKinds` rings, in the bundle's own words and under the notice kind that carries the bundle's name, the
// devices of the readers the manifest names for its kind (bmo-ui's `noticeReaders`), and every event of a bundle whose
// manifest names a sidebar count tells every open tab to read its counts again. No unit's address, path or word is written here: the manifest names the service, the kinds and the
// count, and the bundle's words name the words. A stream is followed while its manifest stands as it was read, and
// let go when the manifest goes or changes.

// How long to wait before opening a stream again after it dropped, and the ceiling that wait grows to.
const RETRY_MS = 5_000;
const RETRY_CAP_MS = 30_000;

// The receiver and the mail service may still be starting when this server does, so the first open
// waits a moment rather than counting as a failure.
const FIRST_OPEN_DELAY_MS = 2_000;

async function follow(attached: AttachedBundle, duty: StreamDuty, words: NoticeWords, hearers: NoticeHearers, letGo: AbortSignal, closing: () => boolean): Promise<void> {
  const stopping = () => closing() || letGo.aborted;
  const { manifest: bundle, unit } = attached;

  let attempts = 0;

  await new Promise((resolve) => setTimeout(resolve, FIRST_OPEN_DELAY_MS));

  while (!stopping()) {
    try {
      // Nobody is signed in to this read, so it is the platform's: the move's administrator's owner key, in the
      // administrator's role.
      const owner = await moveAdministratorKey();
      const response = await fetch(`${unit.address}/events`, {
        headers: { ...unitHeaders(unit), ...(owner === null ? {} : { [OWNER_KEY_HEADER]: owner }), [OWNER_ROLE_HEADER]: "administrator", accept: "text/event-stream" },
        signal: letGo
      });

      if (!response.ok || response.body === null) throw new Error(String(response.status));

      attempts = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const arrived: { name: string; data: string }[] = [];
      const parser = createParser({
        onEvent(event) {
          arrived.push({ name: event.event ?? "", data: event.data });
        }
      });

      for (;;) {
        const chunk = await reader.read();

        if (chunk.done || stopping()) break;

        parser.feed(decoder.decode(chunk.value, { stream: true }));

        const heard = arrived.splice(0);

        // Which change moves a count is the unit's own, so any event of it has the tabs read their counts again.
        if (duty.counts && heard.length > 0) publishConsoleEvent(SIDEBAR_COUNTS_WORD, {});

        for (const event of heard) {
          if (!duty.rings.has(event.name)) continue;

          const readers = noticeReaders(bundle, event.name, memberOf(event.data));

          await ring(noticeOf(bundle, event.name, event.data, words, useRuntimeConfig().app.baseURL), new Set(), async (login) => await hearers.hears(login, readers));
        }
      }
    } catch (error) {
      if (stopping()) break;

      console.error(`bundle events: could not read ${bundle.name}'s events:`, error);
    }

    attempts += 1;

    await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_MS * attempts, RETRY_CAP_MS)));
  }
}

export default defineNitroPlugin((nitro) => {
  const ringsHere = ringsFromThisServer(import.meta.dev, process.env.BMO_PUSH_IN_DEV);

  if (!ringsHere) console.log("push: a development console does not ring. Start it with BMO_PUSH_IN_DEV=1 to ring from here");

  // Whose devices each notice rings, read login by login as the account service names them.
  const hearers = noticeHearers();
  // Each stream followed, by the manifest it was read under, with the switch that lets it go.
  const followed = new Map<string, AbortController>();
  let closing = false;

  const follows = (bundles: readonly AttachedBundle[]) => {
    const standing = new Set<string>();

    for (const bundle of bundles) {
      const words = bundle.words.ko as NoticeWords | undefined;
      const duty = dutyOf(bundle.manifest, words, ringsHere);

      if (duty === null) continue;

      const key = `${bundle.unit.address} ${JSON.stringify(bundle.manifest)}`;

      standing.add(key);

      if (followed.has(key)) continue;

      const held = new AbortController();

      followed.set(key, held);
      void follow(bundle, duty, words ?? {}, hearers, held.signal, () => closing);
    }

    for (const [key, held] of followed) {
      if (standing.has(key)) continue;

      held.abort();
      followed.delete(key);
    }
  };

  const stopHearing = onBundlesRead(follows);

  nitro.hooks.hook("close", () => {
    closing = true;
    stopHearing();
  });
});
