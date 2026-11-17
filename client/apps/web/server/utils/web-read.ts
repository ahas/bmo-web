import { lookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import ipaddr from "ipaddr.js";

import type { LookupAddress } from "node:dns";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import type { Readable } from "node:stream";

// One page or picture of the open web read by the console's server for a link card (docs/web.md, the link previews
// rule): every request goes only to an address checked as public, the connection is made to the address
// checked rather than to whatever the name resolves to a second time, redirects are followed one checked step at a
// time, and the read is bounded in time and size.

/** What a read answered: the address it ended at, the type its server named, and the bytes kept. */
export interface WebRead {
  url: string;
  contentType: string;
  bytes: Uint8Array;
}

/** The bounds of one read. */
export interface WebReadLimits {
  /** How long the whole read, redirects included, may take. */
  timeoutMs: number;
  /** How many bytes of the answer are read. */
  maxBytes: number;
  /** Whether an answer longer than `maxBytes` is refused rather than cut there. */
  whole: boolean;
  /** The `accept` the request is sent with. */
  accept: string;
  /** Ranges the address check lets through although it refuses them otherwise; none in a deployment. */
  open: OpenRanges | null;
}

const MAX_REDIRECTS = 5;
// The agent sites recognise as a link previewer, followed by what this reader is: a large site serves such an agent
// a page whose sharing tags stand in its first bytes, and any other agent a page whose head runs past the bytes read.
const USER_AGENT = "facebookexternalhit/1.1 (compatible; link-preview)";

/** A read that ended without an answer to keep; its message says why, for the server's own log. */
export class WebReadRefused extends Error {}

/** The address ranges a card's read is let through to although the check refuses them. */
export type OpenRanges = [ipaddr.IPv4 | ipaddr.IPv6, number][];

/** The ranges a setting names, comma separated, each an address and its prefix length; null where it names none. */
export function addressRanges(text: string | undefined): OpenRanges | null {
  const named = (text ?? "").split(",").map((one) => one.trim()).filter((one) => one !== "");

  return named.length === 0 ? null : named.map((one) => ipaddr.parseCIDR(one));
}

// An address as it is checked: one carried inside IPv6 as IPv4 is the IPv4 address it is.
function plainAddress(address: string): ipaddr.IPv4 | ipaddr.IPv6 {
  const parsed = ipaddr.parse(address);

  return parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress() ? parsed.toIPv4Address() : parsed;
}

/** Whether a card's read refuses an address, given the ranges let through: every address but a public one, as the
 * registered special ranges name them (loopback, private, link-local, shared, documentation, multicast, reserved and
 * the rest), and anything that does not read as an address. */
export function refusedAddress(address: string, open: OpenRanges | null): boolean {
  if (!ipaddr.isValid(address)) return true;

  const plain = plainAddress(address);

  if (open?.some(([range, bits]) => range.kind() === plain.kind() && plain.match(range, bits))) return false;

  return plain.range() !== "unicast";
}

// The resolver a request connects by: a name whose addresses include one refused is refused whole, and the
// connection goes to the addresses checked here.
function checkedLookup(open: OpenRanges | null) {
  return (
    hostname: string,
    options: { all?: boolean },
    callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void
  ): void => {
    lookup(hostname, { all: true }, (error, addresses) => {
      if (error !== null) return callback(error, []);
      if (addresses.length === 0 || addresses.some((one) => refusedAddress(one.address, open))) {
        return callback(new WebReadRefused(`refused address for ${hostname}`), []);
      }
      if (options.all) return callback(null, addresses);

      return callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

// The address a request may go to, or why not: a web address whose host, where it is an address itself, passes
// the check.
function checkedAddress(url: URL, open: OpenRanges | null): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new WebReadRefused(`not a web address: ${url.protocol}`);

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(host) !== 0 && refusedAddress(host, open)) throw new WebReadRefused(`refused address ${host}`);
}

// The body as its server encoded it, decoded.
function decoded(response: IncomingMessage): Readable {
  const encoding = (response.headers["content-encoding"] ?? "").toLowerCase();

  if (encoding === "gzip" || encoding === "x-gzip") return response.pipe(createGunzip());
  if (encoding === "deflate") return response.pipe(createInflate());
  if (encoding === "br") return response.pipe(createBrotliDecompress());

  return response;
}

interface Answer {
  status: number;
  location: string | null;
  contentType: string;
  bytes: Uint8Array;
}

// One request, with no redirect followed: its status, where a redirect points and the body read to the limits.
function askOnce(url: URL, limits: WebReadLimits, started: (request: ClientRequest) => void): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      method: "GET",
      headers: { "user-agent": USER_AGENT, accept: limits.accept, "accept-language": "ko,en;q=0.8", "accept-encoding": "gzip, deflate, br" },
      lookup: checkedLookup(limits.open) as RequestOptions["lookup"]
    };
    const ask = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = ask(url, options, (response) => {
      const status = response.statusCode ?? 0;
      const contentType = String(response.headers["content-type"] ?? "");

      if (status >= 300 && status < 400) {
        response.resume();
        resolve({ status, location: response.headers.location ?? null, contentType, bytes: new Uint8Array() });

        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new WebReadRefused(`answered ${status}`));

        return;
      }

      const declared = Number(response.headers["content-length"] ?? NaN);

      if (limits.whole && declared > limits.maxBytes) {
        request.destroy();
        reject(new WebReadRefused(`answer of ${declared} bytes`));

        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      let ended = false;
      const body = decoded(response);
      const finish = () => {
        ended = true;
        resolve({ status, location: null, contentType, bytes: new Uint8Array(Buffer.concat(chunks)) });
      };

      body.on("data", (chunk: Buffer) => {
        if (ended) return;
        if (size + chunk.length <= limits.maxBytes) {
          chunks.push(chunk);
          size += chunk.length;

          return;
        }

        request.destroy();

        if (limits.whole) {
          ended = true;
          reject(new WebReadRefused(`answer past ${limits.maxBytes} bytes`));

          return;
        }

        chunks.push(chunk.subarray(0, limits.maxBytes - size));
        size = limits.maxBytes;
        finish();
      });
      body.on("end", finish);
      body.on("error", reject);
    });

    request.on("error", reject);
    started(request);
    request.end();
  });
}

/** Reads one address of the open web within the limits, following its redirects, each step checked; refused with
 * why where an address is refused, the server answers anything but a page, the answer is too long or the time runs
 * out. */
export async function readWeb(address: string, limits: WebReadLimits): Promise<WebRead> {
  let current: ClientRequest | null = null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    current?.destroy(new WebReadRefused(`no answer within ${limits.timeoutMs} ms`));
  }, limits.timeoutMs);

  try {
    let url = new URL(address);

    for (let step = 0; step <= MAX_REDIRECTS; step += 1) {
      checkedAddress(url, limits.open);
      if (timedOut) throw new WebReadRefused(`no answer within ${limits.timeoutMs} ms`);

      const answer = await askOnce(url, limits, (request) => {
        current = request;
      });

      if (answer.location === null) {
        if (answer.status >= 300) throw new WebReadRefused(`answered ${answer.status} with nowhere to go`);

        return { url: url.toString(), contentType: answer.contentType, bytes: answer.bytes };
      }

      url = new URL(answer.location, url);
    }

    throw new WebReadRefused(`more than ${MAX_REDIRECTS} redirects`);
  } finally {
    clearTimeout(timer);
  }
}
