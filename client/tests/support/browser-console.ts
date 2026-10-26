// A console of its own for the browser tests that drive one (docs/checks.md, 「How the suite runs the tests」):
// the account service on a scratch database of the test server, a stand-in for every unit the console reads, the
// fixture account each of those tests signs in with, and the console's development server on top of them, the
// one console that serves the screen-measuring module. It prints the console's address once the console answers,
// and stands until it is told to stop, then stops everything it started and drops the database.
//
// Usage, from `client/`: `BMO_WEB_SERVER_BIN=<the bmo-web-server binary> bun tests/support/browser-console.ts`.

import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SQL } from "bun";

import { connectionOf } from "../../apps/web/server/utils/db";
import { HARNESS_SCREEN_UNITS } from "./harness-screens";
import { addressOf } from "./web-database";

const CLIENT = new URL("../..", import.meta.url).pathname;
const CONSOLE_DIR = join(CLIENT, "apps/web");
const SERVER_DIR = join(CLIENT, "../server");
const TOKEN = "browser-console-token-0123456789";

// The accounts the console-driven tests sign in with, each by the name and password its file names.
const ACCOUNTS: readonly [string, string][] = [
  ["agent-topbar", "fixture-password-1558"],
  ["agents-general", "fixture-password-2301"],
  ["bubble-wrap", "fixture-password-1477"],
  ["composer-view", "fixture-password-2170"],
  ["console-ids", "fixture-password-789"],
  ["item-reports", "fixture-password-2251"],
  ["room-unread", "fixture-password-2252"],
  ["room-unread-tabs", "fixture-password-2253"],
  ["room-copy", "fixture-password-2254"],
  ["agents-listed", "fixture-password-2255"],
  ["briefing-chip", "fixture-password-2256"],
  ["room-sending", "fixture-password-2257"],
  ["bundle-bar", "fixture-password-2258"],
  ["draft-close", "fixture-password-2259"],
  ["prompt-wrap", "fixture-password-1575"],
  ["room-feed", "fixture-password-1457"],
  ["skeleton259", "fixture-password-259"],
  ["stepper", "fixture-password-2206"],
  ["title-bar", "fixture-password-2318"],
  ["topbar-square", "fixture-password-1444"],
  ["work-view", "fixture-password-2311"]
];

// The owner's room, which the receiver's stand-in names as theirs and lists, and a room an account meets two behind.
const OWNER_CHAT = 42;
const UNREAD_CHAT = 43;
// When that room's line was said, fixed for the harness's life so a mark on it stays where it was made.
const LINE_AT = Date.now();
// The base path the console is served under; the tests read theirs off the address they are given.
const BASE = "/console/";

const binary = process.env.BMO_WEB_SERVER_BIN?.trim() ?? "";

if (binary === "") {
  throw new Error("BMO_WEB_SERVER_BIN names no bmo-web-server binary");
}

const scratch = mkdtempSync(join(tmpdir(), "bmo-web-browser-console-"));
const children: ChildProcess[] = [];
const servers: { stop: (force?: boolean) => void }[] = [];
const database = `bmo_web_browser_console_${process.pid}`;
const databaseUrl = addressOf(database);

// A port nothing listens on now, taken by listening once and letting go.
function freePort(): number {
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null) });
  const port = probe.port;

  probe.stop(true);

  if (port === undefined) {
    throw new Error("no port was given to listen on");
  }

  return port;
}

// Each process heads a group of its own, so stopping it stops what it started; what it says goes to a log of
// its own in the scratch folder.
function start(command: string, args: string[], env: Record<string, string>, cwd: string, name: string): ChildProcess {
  const log = join(scratch, `${name}.log`);
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });

  child.stdout?.on("data", (chunk) => appendFileSync(log, chunk));
  child.stderr?.on("data", (chunk) => appendFileSync(log, chunk));
  children.push(child);

  return child;
}

async function run(command: string, args: string[], env: Record<string, string>, cwd: string): Promise<void> {
  const ran = Bun.spawn([command, ...args], { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });

  if ((await ran.exited) !== 0) {
    throw new Error(`${command} ${args.join(" ")} ended ${ran.exitCode}: ${await new Response(ran.stderr).text()}`);
  }
}

async function answering(what: string, address: string, seconds: number): Promise<void> {
  const end = Date.now() + seconds * 1000;

  while (Date.now() < end) {
    try {
      if ((await fetch(address)).ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }

    await Bun.sleep(500);
  }

  throw new Error(`${what} did not answer at ${address} within ${seconds}s; its log is in ${scratch}`);
}

// An event stream that stays open and says nothing.
function silentStream(): Response {
  return new Response(new ReadableStream({ start: (controller) => controller.enqueue(new TextEncoder().encode(": open\n\n")) }), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }
  });
}

// One agent as the agency's own agent resource serves it, and one worker as its worker resource does: the
// console reads these into the rows its sidebar lists.
function agent(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, label, role: "role-a", gates: null, reasoning: null, voice: null, resetAt: null, standInAvailable: false, ...extra };
}

function worker(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, label, cwd: "/srv/checkouts/worker", icon: null, builtin: true, nodeName: "node-a", role: "role-a",
    state: "resting", sampling: null, restingSince: null, sessionId: null, runCount: 0, lastRunAt: null, ...extra
  };
}

// One model file as the agency's model resource serves it, and the catalogue as a whole.
function catalogueEntry(name: string, engine: string, registration: string): Record<string, unknown> {
  return {
    name, label: `Entry ${name}`, file: `${name}.gguf`, bytes: 1_000_000_000, sha256: "a".repeat(64),
    source: "https://example.invalid/model.gguf", engine, registration, nodes: ["node-a"], note: null,
    thinking: false, temperature: 0.7, topP: 0.9, presencePenalty: 0, maxTokens: 4_096, serving: false
  };
}

// The registered models and model files the agency's stand-in holds, so the two model sections of the
// agents screen render their lists and their changes as they would against the service.
const models = new Map<string, Record<string, unknown>>([
  ["model-a", { key: "registered::model-a", provider: "registered", model: "model-a-7b", tier: "large", healthy: true }],
  ["model-b", { key: "registered::model-b", provider: "registered", model: "model-b-7b", tier: null, healthy: false }]
]);
const entries = new Map<string, Record<string, unknown>>([
  ["entry-a", catalogueEntry("entry-a", "engine-a", "model-a")],
  ["entry-b", catalogueEntry("entry-b", "engine-b", "model-b")]
]);
const uses: Record<string, unknown>[] = [];

// A unit that brings a screen of its own under the console's title bar (docs/web.md, 「Screens a unit brings」, 「The
// title bar」): its manifest, its words and its module, whose one route asks for the console's bar. The screen notes
// whether the bar's place for its actions stood when it mounted, lays a button there by a deferred teleport and
// redraws it every few frames, so a place missing at mount shows as an error on the page.
function screenUnit(name: string, path: string): Response | null {
  if (path === "/console-manifest") {
    return Response.json({
      name, title: `${name}.title`, icon: "i-material-symbols-widgets", screenPath: `/${name}`, serviceName: name,
      bundle: "/console/bundle.js", words: "/console/words", role: "member"
    });
  }

  if (path === "/console/words") return Response.json({ ko: { [name]: { title: name } }, en: { [name]: { title: name } } });

  if (path === "/console/bundle.js") {
    const source = `import { Teleport, defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

const SLOT = "[data-title-bar-screen-actions]";

const Screen = defineComponent({
  setup() {
    const ticks = ref(0);
    let timer = null;

    onMounted(() => {
      (globalThis.__screenMounts ??= []).push({ screen: ${JSON.stringify(name)}, slot: document.querySelector(SLOT) !== null });
      timer = setInterval(() => (ticks.value += 1), 50);
    });
    onBeforeUnmount(() => clearInterval(timer));

    return () => h("div", { "data-screen": ${JSON.stringify(name)} }, [
      h(Teleport, { to: SLOT, defer: true }, [h("button", { type: "button", "data-screen-action": ${JSON.stringify(name)} }, "act " + ticks.value)]),
      h("p", ${JSON.stringify(name)} + " " + ticks.value)
    ]);
  }
});

export default { routes: [{ path: "/${name}", name: ${JSON.stringify(name)}, component: Screen, meta: { consoleTitleBar: true } }] };
`;

    return new Response(source, { headers: { "content-type": "text/javascript" } });
  }

  return null;
}

const catalogueView = () => ({ entries: [...entries.values()], uses });
const notFound = () => Response.json({ code: "not-found", error: "not served by this stand-in" }, { status: 404 });

// What each unit's stand-in answers, read from that unit's documented routes; anything else is the unit's own
// not-found. The tests serve the rest of what they measure through the page's routes themselves.
const UNITS: Record<string, (path: string, request: Request) => Response | null | Promise<Response | null>> = {
  AGENCY: async (path, request) => {
    // The agents' answer names the worker too, as the agency's does, beside the workers' own answer.
    if (path === "/agents") {
      // Beside them, the rows the agency keeps for the gate unit's sessions and a runner's, which no list of agents stands.
      return Response.json({
        items: [
          agent("agent-a", "Agent A", { kind: "chat", defaultAnswerer: true }),
          agent("worker", "Worker", { kind: "worker" }),
          agent("gate-session", "Gate Session", { kind: "chat", role: null }),
          agent("gate-a", "Gate A", { kind: "gate", role: "gate" }),
          agent("runner-a", "Runner A", { kind: "runner", role: "searcher" })
        ],
        more: false
      });
    }
    if (path === "/workers") return Response.json({ items: [worker("worker", "Worker")], more: false });
    if (path === "/roles") return Response.json({ items: [], more: false });
    if (path === "/sessions") return Response.json({ items: [], more: false });
    if (path === "/runs") return Response.json({ items: [], more: false });
    if (path === "/jobs") return Response.json({ items: [], more: false });
    if (path === "/log-lines") return Response.json({ items: [], more: false });
    if (path === "/prompt-documents") return Response.json({ items: [], more: false });
    if (path === "/companions") return Response.json({ items: [], more: false });
    if (path === "/providers") return Response.json({ items: [], more: false });
    if (path === "/tiers") return Response.json({ items: [], more: false });

    if (path === "/events") return silentStream();
    if (path === "/pool") return Response.json({ readAt: Date.now(), workers: [], buckets: [] });
    if (path === "/fallback") return Response.json({ routes: [], answering: false });

    if (path === "/models" && request.method === "GET") return Response.json({ items: [...models.values()], more: false });

    if (path === "/models" && request.method === "POST") {
      const body = (await request.json()) as { name?: string; model?: string };
      const asked = body.name ?? "";
      const split = asked.indexOf("::");
      const name = split === -1 ? asked : asked.slice(split + 2);
      const key = split === -1 ? `registered::${asked}` : asked;

      if (models.has(name)) return Response.json({ code: "conflict", error: "a model is already registered" }, { status: 409 });

      const made = { key, provider: "registered", model: body.model ?? "", tier: null, healthy: false };

      models.set(name, made);

      return Response.json(made, { status: 201 });
    }

    const one = /^\/models\/([^/]+)$/.exec(path);

    if (one !== null) {
      const name = decodeURIComponent(one[1]!);
      const held = models.get(name);

      if (held === undefined) return notFound();

      if (request.method === "PATCH") {
        const body = (await request.json()) as { model?: string };

        models.set(name, { ...held, model: body.model ?? held.model });

        return Response.json(models.get(name));
      }

      if (request.method === "DELETE") {
        models.delete(name);

        return new Response(null, { status: 204 });
      }
    }

    if (path === "/model-catalogue" && request.method === "GET") return Response.json(catalogueView());

    if (path === "/model-catalogue" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const name = String(body.name ?? "");

      if (body.action === "save") entries.set(name, { ...catalogueEntry(name, String(body.engine ?? "engine-a"), String(body.registration ?? "model-a")), ...body, name });
      if (body.action === "remove") entries.delete(name);
      if (body.action === "use") {
        uses.push({ id: uses.length + 1, entry: name, engine: entries.get(name)?.engine ?? "engine-a", chosenBy: "tester", startedAt: Math.floor(Date.now() / 1000), endedAt: Math.floor(Date.now() / 1000), state: "done", step: null, reason: null, log: null, logTail: [] });
      }

      return Response.json(catalogueView());
    }

    return null;
  },
  JOB: (path) => {
    if (path === "/events") return silentStream();
    if (path === "/items" || path === "/questions" || path === "/queues") return Response.json({ items: [], more: false });
    if (path === "/queue/holds") return Response.json({ paused: false });

    return null;
  },
  RECEIVER: (path, request) => {
    const now = Date.now();
    // One room: the owner's, with nothing said in it. Its moments are the receiver's milliseconds.
    const room = {
      id: OWNER_CHAT, title: null, messageCount: 0, lastMessageAt: null, pinned: false, senders: [],
      companions: [], ownerRoom: true, registered: true, workRoom: OWNER_CHAT
    };

    // A second room, whose line grows while it is first read: asked for its newest message it answers the first,
    // and past that one it answers two more, so a reader meeting it for the first time is two behind.
    const behind = { ...room, id: UNREAD_CHAT, title: "unread-room", ownerRoom: false, workRoom: UNREAD_CHAT, lastMessageAt: LINE_AT - 1_000 };
    const said = (id: number, sentAt: number) => ({
      id, room: UNREAD_CHAT, senderId: 7, senderName: "person-b", sentAt, text: `words ${id}`, imagePath: null, replyToMessageId: null,
      answerSeconds: null, round: null, album: null, via: null, files: []
    });
    const line = [said(1, LINE_AT - 3_000), said(2, LINE_AT - 2_000), said(3, LINE_AT - 1_000)];

    // The receiver's stream stands open and says nothing, so a tab's stream stays open and carries the console's own
    // words between the units' silences.
    if (path === "/events") return silentStream();
    if (path === "/owner") return Response.json({ room: OWNER_CHAT, senderId: 1 });
    if (path === "/live") return Response.json({ at: now, compacting: [], queued: [], turns: [] });
    if (path === "/rooms") return Response.json({ items: [room, behind], more: false });
    if (path === `/rooms/${UNREAD_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? line.slice(0, 1) : line.filter((one) => one.id > Number(after)), more: false });
    }

    const message = new RegExp(`^/rooms/${UNREAD_CHAT}/messages/(\\d+)$`).exec(path);

    if (message !== null) return Response.json(line.find((one) => one.id === Number(message[1])) ?? line[0]);
    if (path === "/people") return Response.json({ items: [], more: false });

    const at = /^\/rooms\/(-?\d+)(\/[^/]+(?:\/[^/]+)?)?$/.exec(path);

    if (at === null) return null;

    switch (at[2] ?? "") {
      case "/title":
        return Response.json({ title: null });
      case "/messages":
        return Response.json({ items: [], more: false });
      case "/day-start":
        return Response.json({ messageId: null });
      case "/answerers":
        return Response.json({ default: "", items: [], more: false, voice: "" });
      case "/own-number":
        return Response.json({ number: null });
      case "/window":
        return Response.json({ closesAt: null, openForMs: 0 });
      case "/pictures":
        return Response.json({ items: [], more: false });
      case "/figures":
        return Response.json({
          room: Number(at[1]), messages: 12, fromPeople: 7, speakers: 1, firstAt: now - 86_400_000, lastAt: now - 60_000, lastAnswerAt: now - 120_000,
          top: [], byHour: Array.from({ length: 24 }, (_, hour) => (hour % 6 === 0 ? 2 : 0)), agents: []
        });
      default:
        return null;
    }
  },
  BRAIN: () => null,
  SCREEN_A: (path) => screenUnit(HARNESS_SCREEN_UNITS[0], path),
  SCREEN_B: (path) => screenUnit(HARNESS_SCREEN_UNITS[1], path),
  ARTIFACT: () => null,
  TELEGRAM: () => null,
  CACHE_SIREN: () => null,
  CACHE_WARMER: (path) => path === "/round" ? Response.json({ stopped: false }) : null
};

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;

  for (const server of servers) server.stop(true);
  for (const child of children) {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      // Already gone.
    }
  }

  await Bun.sleep(1500);

  for (const child of children) {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      // Already gone.
    }
  }

  const admin = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

  await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.close();
  process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  const units: Record<string, string> = {};

  for (const [unit, answer] of Object.entries(UNITS)) {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      idleTimeout: 0,
      fetch: async (request) => (await answer(new URL(request.url).pathname, request)) ?? notFound()
    });

    servers.push(server);
    units[`${unit}_ADDRESS`] = `http://127.0.0.1:${server.port}`;
    units[`${unit}_TOKEN`] = TOKEN;
  }

  const admin = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

  await admin.unsafe(`CREATE DATABASE "${database}"`);
  await admin.close();

  const serverPort = freePort();
  const serverEnv = {
    BMO_WEB_SERVER_DATABASE__URL: databaseUrl,
    BMO_WEB_SERVER_SERVER__TOKEN: TOKEN,
    BMO_WEB_SERVER_SERVER__LISTEN: `127.0.0.1:${serverPort}`,
    BMO_WEB_SERVER_NAMES__CHAT_AGENT: "agent-a"
  };

  await run(binary, ["migrate"], serverEnv, SERVER_DIR);
  start(binary, ["serve"], serverEnv, SERVER_DIR, "server");
  await answering("the account service", `http://127.0.0.1:${serverPort}/health`, 30);

  const consolePort = freePort();
  const consoleEnv = {
    ...units,
    NUXT_SESSION_PASSWORD: "browser-console-session-password-0123456789",
    WEB_DATABASE_URL: databaseUrl,
    WEB_SERVER_ADDRESS: `http://127.0.0.1:${serverPort}`,
    WEB_SERVER_TOKEN: TOKEN,
    WEB_DATA_DIR: join(scratch, "data"),
    NUXT_PUBLIC_CHAT_AGENT_NAME: "agent-a",
    NUXT_PUBLIC_CHAT_AGENT_LABEL: "Agent A",
    // The translator the screens ask, the gate's translating route relayed; the tests that read a translation answer
    // it through the page's own routes.
    NUXT_PUBLIC_BMO_UI_TRANSLATOR_SERVICE: "gate",
    NUXT_PUBLIC_BMO_UI_TRANSLATOR_PATH: "/translations",
    KEEPALIVE_CONSUMER: "console",
    DEPLOY_ROOTS: scratch,
    // A build folder of its own inside the checkout, so a typecheck beside it leaves what it serves alone and its
    // generated modules still resolve the console's packages.
    BMO_WEB_BUILD_DIR: ".nuxt-browser-tests",
    BMO_WEB_BASE_URL: BASE
  };

  for (const [name, password] of ACCOUNTS) {
    await run("bun", ["scripts/user.ts", "set", name, password, "--administrator"], consoleEnv, CONSOLE_DIR);
  }

  start("bun", ["--bun", "nuxi", "dev", "--port", String(consolePort), "--host", "127.0.0.1"], consoleEnv, CONSOLE_DIR, "console");

  const origin = `http://127.0.0.1:${consolePort}${BASE.replace(/\/$/, "")}`;

  await answering("the console", `${origin}/login`, 240);
  console.log(origin);
} catch (error) {
  console.error(error);
  await stop();
}
