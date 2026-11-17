import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { scratchDir } from "../../support/scratch";

import { callHostedTool, HostedToolFailed, settingsToolSession } from "../../../apps/web/server/utils/tool-host";

// A hosted tool called on the tool host's control socket under the console's tool session (docs/boundary.md, 「The web
// beyond the units」). The host is stood in by a server on a Unix socket in a scratch directory, which answers by the
// entry the call names.

const scratch = scratchDir("bmo-web-tool-host-");
const tokenFile = join(scratch, "web-console.token");
const socket = join(scratch, "mcp-host.sock");
const asked: { token: string | null; body: unknown }[] = [];
const host = Bun.serve({
  unix: socket,
  async fetch(request) {
    const body = (await request.json()) as { name: string };

    asked.push({ token: request.headers.get("authorization"), body });

    if (new URL(request.url).pathname !== "/tool-calls") return Response.json({ code: "not-found", error: "no such route" }, { status: 404 });
    if (body.name === "refused") return Response.json({ code: "forbidden", error: "not held" }, { status: 403 });
    if (body.name === "failing") return Response.json({ namespace: "kit", name: "failing", result: { content: [{ type: "text", text: "gone" }], isError: true }, spentMs: 1 });
    // A call never answered, held until the caller lets go of it.
    if (body.name === "silent") return new Promise<Response>(() => {});

    return Response.json({ namespace: "kit", name: body.name, result: { content: [], structuredContent: { echoed: true } }, spentMs: 1 });
  }
});
const session = { socket, tokenFile };

afterAll(() => void host.stop(true));

describe("callHostedTool", () => {
  test("posts the call under the token its file holds at that moment, and answers the tool's result", async () => {
    writeFileSync(tokenFile, "first-token\n");
    expect(await callHostedTool(session, { namespace: "kit", name: "echo" }, { address: "a" }, 1_000)).toEqual({ content: [], structuredContent: { echoed: true } });

    // The host issued the token again: the next call reads the new one.
    writeFileSync(tokenFile, "second-token\n");
    await callHostedTool(session, { namespace: "kit", name: "echo" }, {}, 1_000);

    expect(asked.slice(-2)).toEqual([
      { token: "Bearer first-token", body: { namespace: "kit", name: "echo", input: { address: "a" } } },
      { token: "Bearer second-token", body: { namespace: "kit", name: "echo", input: {} } }
    ]);
  });

  test("throws for a call the host refuses or the tool answers as failed", async () => {
    writeFileSync(tokenFile, "token");

    await expect(callHostedTool(session, { namespace: "kit", name: "refused" }, {}, 1_000)).rejects.toBeInstanceOf(HostedToolFailed);
    await expect(callHostedTool(session, { namespace: "kit", name: "failing" }, {}, 1_000)).rejects.toBeInstanceOf(HostedToolFailed);
  });

  test("lets go of a call no answer comes to within its wait", async () => {
    writeFileSync(tokenFile, "token");

    await expect(callHostedTool(session, { namespace: "kit", name: "silent" }, {}, 20)).rejects.toThrow();
  });
});

describe("settingsToolSession", () => {
  test("stands only where the settings name both the socket and the token file", () => {
    expect(settingsToolSession({ BMO_MCP_HOST_SOCKET: "/run/host.sock", POCKET_SESSION_TOKEN_FILE: "/data/token" })).toEqual({ socket: "/run/host.sock", tokenFile: "/data/token" });
    expect(settingsToolSession({ BMO_MCP_HOST_SOCKET: "/run/host.sock" })).toBeNull();
    expect(settingsToolSession({ POCKET_SESSION_TOKEN_FILE: "/data/token", BMO_MCP_HOST_SOCKET: " " })).toBeNull();
  });
});
