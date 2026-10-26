import { afterAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import { asked, routeOf } from "../../support/nitro";

import type { RouteEvent } from "../../support/nitro";

// GitHub's webhook deliveries are the one call taken with no sign-in (docs/web.md, 「Access」): one path, `POST`, a
// body of at most 1 MB, handed on unchanged to the agency's `POST /github/deliveries` with GitHub's headers and the
// agency's token, and the agency's status handed back. The stand-in agency judges the signature as the agency does.

const SECRET = "webhook-secret-a";
const TOKEN = "agency-token-a";
const heard: { headers: Record<string, string | null>; body: string }[] = [];

const agency = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.text();
    const header = (name: string) => request.headers.get(name);

    heard.push({
      headers: Object.fromEntries(["authorization", "content-type", "x-github-event", "x-github-delivery", "x-hub-signature-256"].map((name) => [name, header(name)])),
      body
    });

    if (url.pathname !== "/github/deliveries" || request.method !== "POST") return Response.json({ code: "not-found" }, { status: 404 });

    const signed = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

    return header("x-hub-signature-256") === signed
      ? Response.json({ accepted: true }, { status: 202 })
      : Response.json({ code: "bad-signature", error: "the delivery's signature does not match" }, { status: 401 });
  }
});

process.env.AGENCY_ADDRESS = `http://127.0.0.1:${agency.port}`;
process.env.AGENCY_TOKEN = TOKEN;

afterAll(async () => {
  await agency.stop(true);
  delete process.env.AGENCY_ADDRESS;
  delete process.env.AGENCY_TOKEN;
});

const handler = await routeOf<Response>("../../apps/web/server/api/github/deliveries.post");

const BODY = JSON.stringify({ action: "opened", repository: { full_name: "org-a/repo-a" } });

function delivery(body: string, headers: Record<string, string>): RouteEvent {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-github-event": "pull_request", "x-github-delivery": "delivery-a", ...headers },
    rawBody: Buffer.from(body)
  };
}

describe("a GitHub delivery", () => {
  test("signed, is handed on unchanged with GitHub's headers and the agency's token, and answered with the agency's 202", async () => {
    const signature = `sha256=${createHmac("sha256", SECRET).update(BODY).digest("hex")}`;
    const answer = await handler(delivery(BODY, { "x-hub-signature-256": signature }));

    expect(answer.status).toBe(202);
    expect(heard.at(-1)).toEqual({
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-github-delivery": "delivery-a",
        "x-hub-signature-256": signature
      },
      body: BODY
    });
  });

  test("unsigned, is handed on all the same and answered with the agency's refusal", async () => {
    const answer = await handler(delivery(BODY, {}));

    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ code: "bad-signature" });
    expect(heard.at(-1)?.headers["x-hub-signature-256"]).toBeNull();
  });

  test("past 1 MB, is refused 413 and handed on to nobody", async () => {
    const before = heard.length;
    const large = "x".repeat(1024 * 1024 + 1);

    expect((await asked(handler, delivery(large, {}))).status).toBe(413);
    expect((await asked(handler, delivery(BODY, { "content-length": String(2 * 1024 * 1024) }))).status).toBe(413);
    expect(heard.length).toBe(before);
  });

  test("with no agency to hand it to, is 502", async () => {
    const address = process.env.AGENCY_ADDRESS;

    process.env.AGENCY_ADDRESS = "http://127.0.0.1:1";

    try {
      expect((await asked(handler, delivery(BODY, {}))).status).toBe(502);
    } finally {
      process.env.AGENCY_ADDRESS = address;
    }
  });
});
