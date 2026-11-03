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
  ["room-record", "fixture-password-2260"],
  ["room-find", "fixture-password-2261"],
  ["pictures", "fixture-password-2262"],
  ["skeleton259", "fixture-password-259"],
  ["stepper", "fixture-password-2206"],
  ["title-bar", "fixture-password-2318"],
  ["topbar-square", "fixture-password-1444"],
  ["briefing-autoplay", "fixture-password-2331"],
  ["mention-agents", "fixture-password-2346"],
  ["brain-translation", "fixture-password-2355"],
  ["voice-transcript", "fixture-password-2361"],
  ["room-attach", "fixture-password-2364"],
  ["agent-names", "fixture-password-2371"],
  ["todo-models", "fixture-password-2298"],
  ["work-view", "fixture-password-2311"]
];

// The owner's room, which the receiver's stand-in names as theirs and lists, and a room an account meets two behind.
const OWNER_CHAT = 42;
const UNREAD_CHAT = 43;
// A room the console made on the record road, its words standing under no chat service: the owner's under their own
// sender, the chat agent's under no number at all.
const RECORD_CHAT = -9_000_000_000_099;
// The person number the chat agent's own words stand under in the owner's room, whose picture is its face.
const AGENT_FACE = 501;
// A picture's bytes: one grey pixel.
const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
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

// One provider order's entry, as a supervisor's and a role's answer carry it.
function entry(provider: string, model: string, effort: string | null = null): Record<string, unknown> {
  return { provider, model, effort, thinking: null, answerTokens: null };
}

// One supervisor as the agency's supervisor resource serves it: the default answerer, whose turns its window makes, and
// a companion, whose turns its settings' pieces make.
function supervisor(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, label, ownerAccount: null, aliases: null, icon: null, sessionScope: "room", turnShape: "pieces", defaultAnswerer: false,
    brainFolder: `agents/${name}`, repository: "repo-a", order: [entry("claude-code", "claude-opus-5-5", "high"), entry("deepseek", "deepseek-v4-pro")],
    quotaShare: 0.01, warming: { "claude-code": true, deepseek: false }, foldRatio: 0.8, gates: null, voice: null, sampling: null,
    provider: "claude-code", model: "claude-opus-5-5", effort: "high", waitingFor: null, ...extra
  };
}

// One role as the agency's role resource serves it, with how many of its runs go and wait.
function role(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, code: name, label, prompt: null, description: null, bundles: [{ name: "web.read", code: "web-read", label: "Web reading" }],
    line: "worker", order: [entry("claude-code", "claude-sonnet-5", "medium")], quotaShare: 0.01, maxConcurrent: 2, sessions: "keep",
    foldRatio: 0.8, callable: false, running: 0, waiting: 0, provider: "claude-code", waitingFor: null, ...extra
  };
}

// One repository as the agency's repository resource serves it, with its checkouts and the job holding one.
function repository(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, label, icon: null, ownerAccount: null, path: `/srv/checkouts/${name}`, nodeName: null, supportCount: 0,
    prefixDocuments: [], preamble: null, rules: null, devCommand: null, pin: null, downgradeHeal: true, sampling: null,
    samplingSettings: [
      { name: "temperature", min: 0, max: 2 }, { name: "top_p", min: 0, max: 1, aboveMin: true }, { name: "top_k", min: 0, max: null, whole: true },
      { name: "preserve_thinking", switch: true }
    ],
    checkouts: [{ name, path: `/srv/checkouts/${name}`, nodeName: null, kind: "base", job: null }], ...extra
  };
}

// One provider as the agency's provider resource serves it, with its switch, its lines and its quota.
function provider(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, code: name, label, enabled: true, registered: false, coworker: true, gateway: false, lines: ["chat", "worker", "search", "browse"],
    quota: { left: 0.6, window: "week", balance: null, resetsAt: null }, reason: null, reasonCode: null, foldRatioDefault: 0.85, ...extra
  };
}

const ROLES = [
  role("worker", "Worker", { maxConcurrent: 3, running: 2, waiting: 1, order: [entry("claude-code", "claude-opus-5-5", "high")] }),
  role("doppelganger", "Doppelganger", { running: 1 }),
  role("producer", "Producer", { maxConcurrent: 0 }),
  role("builder", "Builder", { maxConcurrent: 8 }),
  role("scout", "Scout", { maxConcurrent: 12, callable: true, sessions: "fresh" }),
  role("voyager", "Voyager", { line: "search", bundles: [{ name: "web.sites", code: "web-sites", label: "Site tools" }], maxConcurrent: 4 })
];

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
  ["model-a", { key: "registered::model-a", name: "model-a", provider: "registered", model: "model-a-7b", cardService: null, roleFiles: false, tier: null, healthy: true, lastAnsweredAt: null, usedBy: ["repository repo-b"] }],
  ["model-b", { key: "registered::model-b", name: "model-b", provider: "registered", model: "model-b-7b", cardService: "service-b", roleFiles: true, tier: null, healthy: false, lastAnsweredAt: null, usedBy: [] }]
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
    // The two axes and the places: two supervisors — the default answerer, whose turns its window makes, and a
    // companion, whose turns its settings' pieces make — a handful of roles with runs going and waiting, and three
    // repositories, one with a job holding a checkout.
    if (path === "/supervisors") {
      return Response.json({
        items: [
          supervisor("agent-a", "Agent A", { sessionScope: "agent", turnShape: "window", defaultAnswerer: true }),
          supervisor("companion-a", "Companion A", { waitingFor: "every provider of its order is at its quota share", foldRatio: 0.85, provider: "deepseek", model: "deepseek-v4-pro", effort: null })
        ],
        more: false
      });
    }
    if (path === "/roles") return Response.json({ roles: ROLES, bundles: [{ name: "web.read", code: "web-read", label: "Web reading" }, { name: "web.sites", code: "web-sites", label: "Site tools" }], lines: ["worker", "search", "browse", "translate"] });
    if (/^\/roles\/[^/]+\/sessions$/.test(path)) {
      return Response.json({
        items: [{ id: 2, sessionId: "session-b", path: "/srv/checkouts/repo-a", provider: "claude-code", model: "claude-opus-5-5", effort: "high", account: null, openedAt: Date.now() - 60_000, lastAnsweredAt: Date.now() - 5_000, runs: 3, context: { tokens: 42_000, share: 0.21 }, valid: true }],
        more: false
      });
    }
    if (path === "/repositories") {
      return Response.json({
        items: [
          repository("repo-a", "Repository A", {
            supportCount: 2,
            prefixDocuments: ["docs/a.md"],
            checkouts: [
              { name: "repo-a", path: "/srv/checkouts/repo-a", nodeName: null, kind: "base", job: { jobId: 7, itemId: 12, role: "worker" } },
              { name: "repo-a-w2", path: "/srv/checkouts/repo-a-w2", nodeName: null, kind: "support", job: null },
              { name: "repo-a@node-a", path: "/srv/node-a/checkouts/repo-a-node-a", nodeName: "node-a", kind: "node", job: null }
            ]
          }),
          repository("repo-b", "Repository B", { pin: { provider: "registered", model: "model-a" }, downgradeHeal: false, sampling: { temperature: 0.6, preserve_thinking: true } }),
          repository("repo-c", "Repository C", { nodeName: "node-a" })
        ],
        more: false
      });
    }
    if (path === "/slots") {
      // The worker's runs: a job's, which opens by the job's run, and one its binding names.
      const runs = (name: string): Record<string, unknown>[] =>
        name === "worker"
          ? [
              { token: "slot-a", role: "worker", path: "/srv/checkouts/repo-a", provider: "claude-code", model: "claude-opus-5-5", source: "job", since: Date.now() - 90_000, runName: "job-7", session: null, jobId: 7, title: "Item 12" },
              { token: "slot-b", role: "worker", path: "/srv/checkouts/repo-a-w2", provider: "claude-code", model: "claude-opus-5-5", source: "delegate", since: Date.now() - 30_000, runName: "delegate-b", session: null, jobId: null, title: "Look into a thing" }
            ]
          : [];

      return Response.json({ items: ROLES.map((one) => ({ role: one.name, maxConcurrent: one.maxConcurrent, active: one.running, reserved: 0, waiting: one.waiting, runs: runs(String(one.name)) })) });
    }
    // The rooms the companion spoke in, and the stand-in answering for it on its second provider.
    if (/^\/supervisors\/[^/]+\/rooms$/.test(path)) {
      return Response.json({
        items: [
          { roomId: OWNER_CHAT, runs: 12, lastRunId: 41, lastRunUnit: "chat-41", lastStartedAt: Date.now() - 120_000, lastFinishedAt: Date.now() - 100_000 },
          { roomId: UNREAD_CHAT, runs: 3, lastRunId: 38, lastRunUnit: "chat-38", lastStartedAt: Date.now() - 3_600_000, lastFinishedAt: Date.now() - 3_590_000 }
        ],
        more: false
      });
    }
    if (/^\/supervisors\/[^/]+$/.test(path)) {
      const name = decodeURIComponent(path.slice("/supervisors/".length));

      return name === "companion-a"
        ? Response.json(supervisor("companion-a", "Companion A", { foldRatio: 0.85, provider: "deepseek", model: "deepseek-v4-pro", effort: null }))
        : Response.json(supervisor(name, name, { sessionScope: "agent", turnShape: "window", defaultAnswerer: true }));
    }
    if (path === "/stand-in") return Response.json({ answers: true, provider: "deepseek", model: "deepseek-v4-pro" });
    if (path === "/nodes") {
      return Response.json({
        items: [
          { name: "node-a", label: "Node A", kind: "ssh", role: null, state: "connected", checkedAt: null, takesJobs: true, jobsRefusal: null },
          { name: "node-b", label: "Node B", kind: "ssh", role: null, state: "connected", checkedAt: null, takesJobs: true, jobsRefusal: null },
          { name: "node-c", label: "Node C", kind: "jake", role: null, state: "connected", checkedAt: null, takesJobs: false, jobsRefusal: "A node reached through a hub has no SSH route." }
        ],
        more: false
      });
    }
    if (path === "/providers") {
      return Response.json({
        items: [
          provider("claude-code", "Claude Code"),
          provider("deepseek", "DeepSeek", { quota: { left: null, window: null, balance: 12.5, resetsAt: null } }),
          provider("registered", "Registered models", { registered: true, lines: ["chat", "worker"], quota: null })
        ],
        more: false
      });
    }
    const offered = /^\/provider-models\/([^/]+)$/.exec(path);

    if (offered !== null) {
      const named = decodeURIComponent(offered[1]!);
      const ids = named === "registered" ? ["model-a"] : named === "deepseek" ? ["deepseek-v4-pro", "deepseek-flash"] : ["claude-opus-5-5", "claude-sonnet-5"];

      // What each model declares: the registration and the road's members their thinking and ceiling, the Claude CLI's
      // catalogue none.
      const declared = (at: number) => (named === "claude-code" ? { thinking: null, answerTokens: null } : { thinking: at === 0, answerTokens: 32_768 });

      return Response.json({ provider: named, models: ids.map((id, at) => ({ id, efforts: [], free: false, inService: at === 0, ...declared(at) })), staleReadAt: null });
    }
    if (path === "/sessions") return Response.json({ items: [], more: false });
    if (path === "/runs") return Response.json({ items: [], more: false });
    if (path === "/jobs") return Response.json({ items: [], more: false });
    if (path === "/log-lines") return Response.json({ items: [], more: false });
    if (path === "/prompt-documents") return Response.json({ items: [], more: false });
    if (path === "/companions") return Response.json({ items: [], more: false });

    if (path === "/events") return silentStream();
    if (path === "/fallback") return Response.json({ routes: [], answering: false });

    if (path === "/models" && request.method === "GET") return Response.json({ items: [...models.values()], more: false });

    if (path === "/models" && request.method === "POST") {
      const body = (await request.json()) as { name?: string; model?: string };
      const asked = body.name ?? "";
      const split = asked.indexOf("::");
      const name = split === -1 ? asked : asked.slice(split + 2);
      const key = split === -1 ? `registered::${asked}` : asked;

      if (models.has(name)) return Response.json({ code: "conflict", error: "a model is already registered" }, { status: 409 });

      const made = { key, name, provider: "registered", model: body.model ?? "", cardService: null, roleFiles: false, tier: null, healthy: false, lastAnsweredAt: null, usedBy: [] };

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
    const recorded = { ...room, id: RECORD_CHAT, title: "record-room", ownerRoom: false, workRoom: RECORD_CHAT, lastMessageAt: LINE_AT - 4_000 };
    const kept = (id: number, sentAt: number, over: Record<string, unknown>) => ({
      id, room: RECORD_CHAT, senderId: 1, senderName: "owner", sentAt, text: `record ${id}`, imagePath: null, replyToMessageId: null,
      answerSeconds: null, round: null, album: null, via: "record", files: [], ...over
    });
    // What the record keeps done to its messages: a pin and two reactions, the owner's own among them, an edit, and a
    // delete that cleared the words and kept the row.
    const record = [
      kept(-1, LINE_AT - 6_000, { pinnedAt: LINE_AT - 500, reactions: [{ emoji: "\u{1F44D}", by: "1" }, { emoji: "\u{1F44D}", by: "agent-a" }] }),
      kept(-2, LINE_AT - 5_000, { senderId: null, senderName: "Agent A", agentName: "agent-a", answerSeconds: 3, editedAt: LINE_AT - 4_500 }),
      kept(-3, LINE_AT - 4_000, { text: "", deletedAt: LINE_AT - 3_000 })
    ];

    // The receiver's stream stands open and says nothing, so a tab's stream stays open and carries the console's own
    // words between the units' silences.
    if (path === "/events") return silentStream();
    if (path === "/owner") return Response.json({ room: OWNER_CHAT, senderId: 1 });
    if (path === "/live") return Response.json({ at: now, compacting: [], queued: [], turns: [] });
    if (path === "/rooms") return Response.json({ items: [room, behind, recorded], more: false });
    if (path === `/rooms/${RECORD_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? record : record.filter((one) => one.id > Number(after)), more: false });
    }
    if (path === `/rooms/${RECORD_CHAT}/answerers`) return Response.json({ default: "agent-a", items: [{ agentName: "agent-a", companion: false }], more: false, voice: "agent-a" });
    if (path === `/rooms/${OWNER_CHAT}/own-number`) return Response.json({ number: new URL(request.url).searchParams.get("agentName") === "agent-a" ? AGENT_FACE : null });
    if (path === "/avatars") return Response.json({ items: [{ kind: "person", id: AGENT_FACE, takenAt: LINE_AT }], more: false });
    if (path === `/people/${AGENT_FACE}/avatar`) return new Response(PIXEL, { headers: { "content-type": "image/png" } });
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
