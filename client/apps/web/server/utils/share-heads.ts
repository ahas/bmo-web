import { SHARE_HEAD_LANGUAGE_QUERY, shareHead, shareHeadPath, shareRead } from "bmo-ui/shared/console-manifest";

import { attachedBundles, relayPath } from "./console-manifests";
import { unitHeaders } from "./units";

import type { AttachedBundle } from "./console-manifests";
import type { ShareHead } from "bmo-ui/shared/console-manifest";

// A share page's head (docs/web.md, 「Screens a unit brings」; bmo-ui's `docs/console-bundles.md`, 「Share pages」): the
// server asks the bundle's unit for what a share address reads as before it is opened, and writes it into the shell it
// serves there, so a chat app drawing the link's card reads it with no script run.

/** A share address as the server serves it: the bundle whose share page it is, and the token as the address writes it. */
export interface ShareAddress {
  bundle: AttachedBundle;
  token: string;
}

/** The share address a path names, read from the console's base path with no query: a screen path, `/share/` and one
 * segment, of the bundle whose screen path is the longest it stands under; null for any other path. */
export function shareAddressOf(path: string): ShareAddress | null {
  const standing = attachedBundles()
    .filter(({ manifest }) => path.startsWith(`${manifest.screenPath}/`))
    .toSorted((one, other) => other.manifest.screenPath.length - one.manifest.screenPath.length)[0];

  if (standing === undefined) return null;

  const rest = path.slice(standing.manifest.screenPath.length);
  const token = /^\/share\/([^/]+)$/.exec(rest)?.[1];

  return token === undefined ? null : { bundle: standing, token };
}

/** The head a share address reads as, asked of its bundle's unit with the unit's token and no owner key or role, in the
 * language named; null where the manifest names no share head, the unit answers anything but a 200, the call fails or
 * the answer does not read. */
export async function askedShareHead({ bundle, token }: ShareAddress, language: string): Promise<ShareHead | null> {
  const path = shareHeadPath(bundle.manifest, token);

  if (path === null) return null;

  let response: Response;

  try {
    response = await fetch(`${bundle.unit.address}${path}?${new URLSearchParams({ [SHARE_HEAD_LANGUAGE_QUERY]: language })}`, {
      headers: { ...unitHeaders(bundle.unit), accept: "application/json" }
    });
  } catch {
    return null;
  }

  if (response.status !== 200) return null;

  try {
    return shareHead(await response.json());
  } catch (error) {
    console.error(`share heads: ${bundle.manifest.name}'s head is left out: ${(error as Error).message}`);

    return null;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// A value written as an element's or an attribute's text, so none closes its tag.
function escaped(text: string): string {
  return text.replace(/[&<>"']/g, (one) => ESCAPES[one]!);
}

function meta(attribute: "name" | "property", key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escaped(content)}">`;
}

/** The picture's whole public address: where the console relays the share read the head names, on the origin of the
 * head's own address; null where the head names none, or a path that is no share read the manifest names. */
export function shareImageAddress(head: ShareHead, bundle: AttachedBundle, baseURL: string): string | null {
  if (head.image === undefined || !shareRead(bundle.manifest, "GET", head.image)) return null;

  return new URL(relayPath(baseURL, bundle.manifest, head.image), head.url).toString();
}

/** The tags a share page's head is written with, each value escaped. */
export function shareHeadTags(head: ShareHead, bundle: AttachedBundle, baseURL: string): string[] {
  const image = shareImageAddress(head, bundle, baseURL);
  const { description } = head;

  return [
    `<title>${escaped(head.title)}</title>`,
    meta("name", "robots", "noindex, nofollow"),
    ...(description === undefined ? [] : [meta("name", "description", description)]),
    meta("property", "og:type", head.type),
    meta("property", "og:site_name", head.siteName),
    meta("property", "og:locale", head.locale),
    meta("property", "og:title", head.title),
    ...(description === undefined ? [] : [meta("property", "og:description", description)]),
    meta("property", "og:url", head.url),
    ...(image === null ? [] : [meta("property", "og:image", image)]),
    meta("name", "twitter:card", image === null ? "summary" : "summary_large_image"),
    meta("name", "twitter:title", head.title),
    ...(description === undefined ? [] : [meta("name", "twitter:description", description)]),
    ...(image === null ? [] : [meta("name", "twitter:image", image)]),
    `<link rel="canonical" href="${escaped(head.url)}">`
  ];
}
