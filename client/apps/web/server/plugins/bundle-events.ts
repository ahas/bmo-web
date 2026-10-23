import { createParser } from "eventsource-parser";

import { ring } from "../utils/push";
import { ringsFromThisServer } from "../utils/pushnews";
import { onBundlesRead } from "../utils/console-manifests";
import { OWNER_KEY_HEADER, OWNER_ROLE_HEADER, administratorKey } from "../utils/owner-key";
import { unitHeaders } from "../utils/units";

import type { AttachedBundle } from "../utils/console-manifests";
import type { PushPayload } from "#shared/types";
import type { ConsoleManifest } from "bmo-ui/shared/console-manifest";

// A console bundle's notices (bmo-ui's `docs/console-bundles.md`, 「Notices」): the console reads the
// stream of a unit whose manifest asks for it, and every event whose kind the manifest names under
// `pushKinds` rings the owner's devices in the bundle's own words, under the notice kind that carries the
// bundle's name. No unit's address, path or word is written here: the manifest names the service and the
// kinds, and the bundle's words name the words. A stream is followed while its manifest stands as it was
// read, and let go when the manifest goes or changes.

// How long to wait before opening a stream again after it dropped, and the ceiling that wait grows to.
const RETRY_MS = 5_000;
const RETRY_CAP_MS = 30_000;

// The receiver and the mail service may still be starting when this server does, so the first open
// waits a moment rather than counting as a failure.
const FIRST_OPEN_DELAY_MS = 2_000;

interface Words {
  [key: string]: unknown;
}

type Fields = Record<string, unknown>;

function fieldOf(data: Fields, name: string): string {
  const value = data[name];

  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null) {
    const held = value as Fields;

    return String(held.name ?? held.address ?? "");
  }

  return "";
}

function filled(text: unknown, data: Fields): string {
  if (typeof text !== "string") return "";

  return text.replaceAll(/\{(\w+)\}/g, (_match, name: string) => fieldOf(data, name));
}

// One word of a bundle's pack under the notice kind its event names, wherever the kind's own dots
// divide the pack's tree.
function noticeWord(words: Words, name: string, kind: string, role: "title" | "body"): unknown {
  let held: unknown = words[name];

  for (const part of ["notice", ...kind.split("."), role]) {
    if (typeof held !== "object" || held === null) return undefined;

    held = (held as Words)[part];
  }

  return held;
}

function noticeOf(bundle: ConsoleManifest, kind: string, data: Fields, words: Words): PushPayload {
  return {
    kind: bundle.name as PushPayload["kind"],
    title: filled(noticeWord(words, bundle.name, kind, "title"), data) || bundle.title,
    body: filled(noticeWord(words, bundle.name, kind, "body"), data),
    url: bundle.screenPath,
    tag: `${bundle.name}:${fieldOf(data, "threadId") || fieldOf(data, "id") || kind}`
  };
}

async function follow(attached: AttachedBundle, words: Words, letGo: AbortSignal, closing: () => boolean): Promise<void> {
  const stopping = () => closing() || letGo.aborted;
  const { manifest: bundle, unit } = attached;
  const kinds = new Set(bundle.pushKinds);

  if (kinds.size === 0) return;

  let attempts = 0;

  await new Promise((resolve) => setTimeout(resolve, FIRST_OPEN_DELAY_MS));

  while (!stopping()) {
    try {
      // Nobody is signed in to this read, so it is the platform's: the administrator's owner key, in the
      // administrator's role.
      const owner = await administratorKey();
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

        for (const event of arrived.splice(0)) {
          if (!kinds.has(event.name)) continue;

          let data: Fields = {};

          try {
            const read: unknown = JSON.parse(event.data);

            if (typeof read === "object" && read !== null) data = read as Fields;
          } catch {
            // An event that does not read as JSON says nothing a notice can carry.
          }

          await ring(noticeOf(bundle, event.name, data, words));
        }
      }
    } catch (error) {
      if (stopping()) break;

      console.error(`push: could not read ${bundle.name}'s events:`, error);
    }

    attempts += 1;

    await new Promise((resolve) => setTimeout(resolve, Math.min(RETRY_MS * attempts, RETRY_CAP_MS)));
  }
}

export default defineNitroPlugin((nitro) => {
  if (!ringsFromThisServer(import.meta.dev, process.env.BMO_PUSH_IN_DEV)) {
    console.log("push: a development console does not ring. Start it with BMO_PUSH_IN_DEV=1 to ring from here");

    return;
  }

  // Each stream followed, by the manifest it was read under, with the switch that lets it go.
  const followed = new Map<string, AbortController>();
  let closing = false;

  const follows = (bundles: readonly AttachedBundle[]) => {
    const standing = new Set<string>();

    for (const bundle of bundles) {
      const words = bundle.words.ko as Words | undefined;

      if (!bundle.manifest.events || bundle.manifest.pushKinds.length === 0 || words === undefined) continue;

      const key = `${bundle.unit.address} ${JSON.stringify(bundle.manifest)}`;

      standing.add(key);

      if (followed.has(key)) continue;

      const held = new AbortController();

      followed.set(key, held);
      void follow(bundle, words, held.signal, () => closing);
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
