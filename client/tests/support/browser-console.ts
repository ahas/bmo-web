// A console of its own for the browser tests that drive one (docs/checks.md, 「How the suite runs the tests」):
// the account service on a scratch database of the test server, a stand-in for every unit the console reads, the
// fixture account each of those tests signs in with, and the console's development server on top of them, the
// one console that serves the screen-measuring module. It prints the console's address once the console answers,
// and stands until it is told to stop, then stops everything it started and drops the database.
//
// Usage, from `client/`: `BMO_WEB_SERVER_BIN=<the bmo-web-server binary> bun tests/support/browser-console.ts`.

import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SQL } from "bun";

import { connectionOf } from "../../apps/web/server/utils/db";
import { manifestFields } from "./console-manifest";
import { HARNESS_SCREEN_UNITS } from "./harness-screens";
import { jobLogAnswer } from "./job-log";
import { addressOf } from "./web-database";

const CLIENT = new URL("../..", import.meta.url).pathname;
const CONSOLE_DIR = join(CLIENT, "apps/web");
const SERVER_DIR = join(CLIENT, "../server");
const TOKEN = "browser-console-token-0123456789";

// The accounts the console-driven tests sign in with, each by the name and password its file names. Each is the
// platform administrator, so its screen reaches every section.
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
  ["monitor-polling", "fixture-password-2372"],
  ["todo-models", "fixture-password-2298"],
  ["todo-assign", "fixture-password-2765"],
  ["todo-testbed", "fixture-password-2771"],
  ["todo-row-unfold", "fixture-password-2784"],
  ["org-settings", "fixture-password-2666"],
  ["todo-run-figures", "fixture-password-2826"],
  ["work-view", "fixture-password-2311"],
  ["delegation-marker", "fixture-password-2373"],
  ["screen-stands", "fixture-password-2411"],
  ["hidden-inputs", "fixture-password-2412"],
  ["secret-request", "fixture-password-2649"],
  ["agent-log-open", "fixture-password-2809"],
  ["row-add", "fixture-password-2885"],
  ["todo-raise", "fixture-password-2871"],
  ["supervisor-road", "fixture-password-2921"]
];

// The member accounts a test signs in with to read a section by its permission rather than as the administrator,
// each with the console sections it is given once the console answers (docs/accounts.md, 「Console sections」).
// A member is made by the user script without the administrator flag, and its sections are written whole as the
// administrator's screen writes them.
const MEMBERS: readonly { name: string; password: string; sections: readonly { section: string; read: boolean; write: boolean }[] }[] = [
  {
    name: "room-writer",
    password: "fixture-password-2401",
    sections: [
      { section: "rooms", read: true, write: true },
      { section: "account", read: true, write: true }
    ]
  },
  {
    name: "org-member",
    password: "fixture-password-2667",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  {
    name: "room-reader",
    password: "fixture-password-2402",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The people the organisation chart moves into another unit together, who never sign in.
  ...["org-move-a", "org-move-b", "org-move-c"].map((name, at) => ({
    name,
    password: `fixture-password-286${at}`,
    sections: [{ section: "account", read: true, write: true }]
  })),
  // The members of the company, read by a member who reads their account section.
  {
    name: "people-reader",
    password: "fixture-password-2801",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: false }
    ]
  },
  // The research screen opened to a member, research the first section they read.
  {
    name: "research-reader",
    password: "fixture-password-2880",
    sections: [
      { section: "research", read: true, write: false },
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: false }
    ]
  },
  // Each of the console's own screens opened to a member who reads its section.
  {
    name: "section-reader",
    password: "fixture-password-2881",
    sections: [
      { section: "siren", read: true, write: false },
      { section: "db", read: true, write: false },
      { section: "documents", read: true, write: false },
      { section: "supervisors", read: true, write: false },
      { section: "research", read: true, write: false },
      { section: "monitor", read: true, write: false },
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: false }
    ]
  }
];

// The owner's room, which the receiver's stand-in names as theirs and lists, and a room an account meets two behind.
const OWNER_CHAT = 42;
const UNREAD_CHAT = 43;
// A room the console made on the record road, its words standing under no chat service: the owner's under their own
// sender, the chat agent's under no number at all.
const RECORD_CHAT = -9_000_000_000_099;
// A room whose messages carry what a messenger sends besides words: an album of three tall pictures, an animated
// sticker, an animation, and reactions of several people with their pictures.
const MEDIA_CHAT = 44;
// A tall picture, as a phone's screenshot stands: drawn as an SVG of that size.
const TALL = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="591" height="1280"><rect width="591" height="1280" fill="#3a6"/></svg>');
// An animated sticker: a one-second Lottie scene of one square, gzipped as Telegram keeps it.
const STICKER = Bun.gzipSync(new TextEncoder().encode(JSON.stringify({
  v: "5.5.2", fr: 30, ip: 0, op: 30, w: 512, h: 512, layers: [{
    ty: 4, ind: 1, ip: 0, op: 30, st: 0, ks: { o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0] }, { t: 30, s: [360] }] }, p: { a: 0, k: [256, 256] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } },
    shapes: [{ ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [200, 200] }, r: { a: 0, k: 0 } }, { ty: "fl", c: { a: 0, k: [0.2, 0.6, 0.9, 1] }, o: { a: 0, k: 100 } }]
  }]
})));
// The person number the chat agent's own words stand under in the owner's room, whose picture is its face.
const AGENT_FACE = 501;
// A picture's bytes: one grey pixel.
const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
// When that room's line was said, fixed for the harness's life so a mark on it stays where it was made.
const LINE_AT = Date.now();
// The base path the console is served under; the tests read theirs off the address they are given.
const BASE = "/console/";

// A message's formatting entities as the chat service hands them: each phrase located by its offset into the
// words in UTF-16 code units, in the order given, with whatever else the entity type carries.
function formatEntities(words: string, placed: readonly [phrase: string, type: string, extra?: Record<string, unknown>][]): Record<string, unknown>[] {
  let from = 0;

  return placed.map(([phrase, type, extra]) => {
    const offset = words.indexOf(phrase, from);

    if (offset < 0) throw new Error(`browser-console: ${JSON.stringify(phrase)} not found in ${JSON.stringify(words)} from ${from}`);

    from = offset + phrase.length;

    return { type, offset, length: phrase.length, ...extra };
  });
}

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

// A login's cookie as a browser would hold it, taken from the console's own sign-in.
async function signIn(name: string, password: string, at: string): Promise<string> {
  const reply = await fetch(`${at}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, password })
  });

  if (!reply.ok) throw new Error(`${name} could not sign in: ${reply.status}`);

  return reply.headers.get("set-cookie")!.split(";")[0]!;
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

// One supervisor as the agency's supervisor resource serves it: the default answerer, whose turns its window makes, and
// a supervisor of the room scope, whose turns its settings' pieces make.
function supervisor(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, label, ownerAccount: null, aliases: null, icon: null, sessionScope: "room", turnShape: "pieces",
    brainFolder: `agents/${name}`, repository: "repo-a", provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null,
    answerTokens: null, warming: { "claude-code": true, deepseek: false }, foldRatio: 0.8, gates: null, voice: null, sampling: null, seeded: false,
    resetPoint: null, ...extra
  };
}

// What the tests changed of a supervisor through the agency's `PATCH /supervisors/{name}`, laid over the row the
// stand-in serves, so a road changed on the screen is read back as changed.
const supervisorChanges = new Map<string, Record<string, unknown>>();

// The supervisors the stand-in holds: the default answerer, whose turns its window makes, and a supervisor of the room
// scope, whose turns its settings' pieces make, each with what the tests changed of it.
function heldSupervisor(name: string): Record<string, unknown> {
  const base = name === "agent-c"
    ? supervisor("agent-c", "Agent C", { foldRatio: 0.85, provider: "deepseek", model: "deepseek-v4-pro", effort: null })
    : supervisor(name, name === "agent-a" ? "Agent A" : name, { sessionScope: "agent", turnShape: "window" });

  return { ...base, ...supervisorChanges.get(name) };
}

// A supervisor's change as the agency takes it (its docs/api.md, 「supervisors」): a body naming an order, a quota share
// or a forced provider is refused, and a changed provider or model drops the effort, thinking and answer ceiling the
// body does not name.
async function changeSupervisor(name: string, request: Request): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const gone = ["order", "quotaShare", "active"].find((field) => field in body);

  if (gone !== undefined) return Response.json({ code: "unknown-field", field: gone, error: `The field ${gone} is not taken.` }, { status: 400 });

  const held = heldSupervisor(name);
  const roadMoved = ("provider" in body && body.provider !== held.provider) || ("model" in body && body.model !== held.model);
  const dropped = roadMoved ? { effort: null, thinking: null, answerTokens: null } : {};

  supervisorChanges.set(name, { ...supervisorChanges.get(name), ...dropped, ...body });

  return Response.json(heldSupervisor(name));
}

// A role's agents as the agency's role resource serves them: `count` seats of the role on one road, or on none where
// the road is null, the first `carrying` of them with a run let in.
function seats(role: string, count: number, road: [string, string, string | null] | null, carrying = 0): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${role}-${String(index + 1).padStart(2, "0")}`, role, provider: road?.[0] ?? null, model: road?.[1] ?? null, effort: road?.[2] ?? null, thinking: null,
    answerTokens: null, enabled: true, position: index + 1, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null,
    followsSupervisor: road === null, carries: index < carrying
  }));
}

// One role as the agency's role resource serves it, with its agents and how many of its runs go and wait: two seats on
// one road where it names no agents of its own.
function role(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const agents = (extra.agents as Record<string, unknown>[] | undefined) ?? seats(name, 2, ["claude-code", "claude-sonnet-5", "medium"]);

  return {
    name, code: name, label, prompt: null, description: null, providerPrompts: {}, bundles: [{ name: "web.read", code: "web-read", label: "Web reading" }],
    line: "worker", maxConcurrent: agents.filter((one) => one.enabled === true).length, followsSupervisor: agents.length > 0 && agents.every((one) => one.provider === null),
    running: 0, waiting: 0, provider: agents.length === 0 ? null : "claude-code", waitingFor: null, ...extra, agents
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
  role("worker", "Worker", { running: 2, waiting: 1, agents: seats("worker", 3, ["claude-code", "claude-opus-5-5", "high"], 2) }),
  role("doppelganger", "Doppelganger", { running: 1, agents: seats("doppelganger", 2, null, 1) }),
  role("producer", "Producer", { agents: [] }),
  role("builder", "Builder", { agents: seats("builder", 8, ["claude-code", "claude-sonnet-5", "medium"]) }),
  role("scout", "Scout", { agents: seats("scout", 12, ["claude-code", "claude-sonnet-5", "medium"]).map((one) => ({ ...one, sessions: "fresh" })) }),
  role("voyager", "Voyager", { line: "search", bundles: [{ name: "web.sites", code: "web-sites", label: "Site tools" }], agents: seats("voyager", 4, ["claude-code", "claude-sonnet-5", "medium"]) })
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
// whether it found the console's offer and the bar standing under its own name when it mounted, and stands its action
// in its own row under the bar, as bmo-ui's contract asks, redrawing it every few frames. Its module reads
// `process.env` where it stands, as a library inside a unit's build does, so the module ends before its routes
// stand unless the console owes a `process` to it. Opened with `?styles=on` it also lays a plain rule for the
// `input` element on the page as it runs, unlayered, as an editor library inside a unit's bundle does: what a
// console control hidden by an attribute is measured against (docs/web.md, 「Screens a unit brings」). The services its
// manifest names under `calls` are the ones its pages reach besides its own.
function screenUnit(name: string, path: string, calls: readonly string[] = []): Response | null {
  if (path === "/console-manifest") {
    return Response.json(manifestFields(name, { icon: "i-material-symbols-widgets", calls }));
  }

  if (path === "/console/words") return Response.json({ ko: { [name]: { title: name } }, en: { [name]: { title: name } } });

  if (path === "/console/bundle.js") {
    const source = `import { defineComponent, h, inject, onBeforeUnmount, onMounted, ref } from "vue";

// What a library inside a unit's build reads at the top of its module, before any of its own code runs.
const built = process.env.NODE_ENV;

const Screen = defineComponent({
  setup() {
    const ticks = ref(0);
    const offered = inject("bmo-console-title-bar", null) !== null;
    let timer = null;

    onMounted(() => {
      // A rule for the element itself, laid on the page unlayered as the screen mounts: the position an
      // editor library inside a unit's bundle takes, above every rule the console lays in a layer.
      if (new URLSearchParams(window.location.search).get("styles") === "on" && document.querySelector("[data-bundle-styles]") === null) {
        const laid = document.createElement("style");

        laid.setAttribute("data-bundle-styles", "on");
        laid.textContent = "input { display: flex }";
        document.head.append(laid);
      }

      const named = [...document.querySelectorAll("[data-title-bar] [data-slot=title]")].some((title) => title.textContent.trim() === ${JSON.stringify(name)});

      (globalThis.__screenMounts ??= []).push({ screen: ${JSON.stringify(name)}, offered, bar: named });
      timer = setInterval(() => (ticks.value += 1), 50);
    });
    onBeforeUnmount(() => clearInterval(timer));

    return () => h("div", { "data-screen": ${JSON.stringify(name)}, "data-build": String(built) }, [
      h("div", { "data-screen-row": ${JSON.stringify(name)} }, [h("button", { type: "button", "data-screen-action": ${JSON.stringify(name)} }, "act " + ticks.value)]),
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
    // A long job's log, read by its run from the TODO panel (tests/support/job-log.ts).
    const jobLog = jobLogAnswer(new URL(request.url));

    if (jobLog !== null) return jobLog;

    // The two axes and the places: two supervisors, a handful of roles with runs going and waiting, and three
    // repositories, one with a job holding a checkout.
    if (path === "/supervisors") return Response.json({ items: [heldSupervisor("agent-a"), heldSupervisor("agent-c")], more: false });
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
      // The worker's runs: a job's, which opens by the job's run, and one its binding names. The
      // doppelganger's run works in no repository, so its row is named by the folder's last part.
      const runs = (name: string): Record<string, unknown>[] =>
        name === "worker"
          ? [
              { token: "slot-a", role: "worker", path: "/srv/checkouts/repo-a", provider: "claude-code", model: "claude-opus-5-5", source: "job", since: Date.now() - 90_000, runName: "job-7", session: null, jobId: 7, title: "Item 12" },
              { token: "slot-b", role: "worker", path: "/srv/checkouts/repo-a-w2", provider: "claude-code", model: "claude-opus-5-5", source: "delegate", since: Date.now() - 30_000, runName: "delegate-b", session: null, jobId: null, title: "Look into a thing" }
            ]
          : name === "doppelganger"
            ? [
                { token: "slot-c", role: "doppelganger", path: "/srv/scratch", provider: "claude-code", model: "claude-opus-5-5", source: "delegate", since: Date.now() - 20_000, runName: "delegate-c", session: null, jobId: null, title: "Scratch the surface" }
              ]
            : [];

      return Response.json({ items: ROLES.map((one) => ({ role: one.name, maxConcurrent: one.maxConcurrent, active: one.running, reserved: 0, waiting: one.waiting, runs: runs(String(one.name)) })) });
    }
    // The tasks a supervisor delegated to its double, as the agency lists them for the room's marker: one still
    // running under the owner's own chat agent, and one that has ended with what it came to.
    if (path === "/delegations") {
      return Response.json({
        items: [
          {
            token: "delegation-running", title: "Check the room marker", askedBy: "agent-a", stage: "running", agentName: "doppelganger-a",
            role: "doppelganger", askedAt: Date.now() - 60_000, runningSince: Date.now() - 30_000, endedAt: null, outcome: null
          },
          {
            token: "delegation-ended", title: "Retire the old marker", askedBy: "agent-a", stage: "ended", agentName: "doppelganger-a",
            role: "doppelganger", askedAt: Date.now() - 600_000, runningSince: Date.now() - 600_000, endedAt: Date.now() - 300_000, outcome: "all checks passed"
          }
        ]
      });
    }
    // The rooms a supervisor spoke in.
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

      return request.method === "PATCH" ? await changeSupervisor(name, request) : Response.json(heldSupervisor(name));
    }
    if (/^\/supervisors\/[^/]+\/road$/.test(path)) {
      const name = decodeURIComponent(path.slice("/supervisors/".length, -"/road".length));

      const { provider, model, effort, thinking } = heldSupervisor(name);
      // The room-scope supervisor's road cannot take a turn now; the default answerer's can.
      const closed = name === "agent-c";

      return Response.json({ supervisor: name, provider, model, effort, thinking, answers: !closed, reason: closed ? "The provider's quota is spent." : null });
    }
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
      supervisors: [], ownerRoom: true, registered: true, workRoom: OWNER_CHAT
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
    const media = { ...room, id: MEDIA_CHAT, title: "media-room", ownerRoom: false, workRoom: MEDIA_CHAT, lastMessageAt: LINE_AT - 500 };
    const shown = (id: number, over: Record<string, unknown>) => ({
      id, room: MEDIA_CHAT, senderId: 7, senderName: "person-b", sentAt: LINE_AT - 4_000 + id, text: "", imagePath: null,
      replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null, files: [], ...over
    });
    // A person's words carrying every formatting entity the room screen draws, as the chat service handed them in
    // the metadata: the inline styles, a spoiler, a text link and a bare auto link on one line (8), a pre with its
    // language on another (9), and a plain and an expandable quote on a third (10). Offsets are UTF-16 code units
    // into the metadata's own words, which stand at the head of the stored text here (base 0).
    const inlineWords = "bold italic under strike code docs secret https://plain.example end";
    const inlineEntities = formatEntities(inlineWords, [
      ["bold", "bold"], ["italic", "italic"], ["under", "underline"], ["strike", "strikethrough"], ["code", "code"],
      ["docs", "text_link", { url: "https://example.org/format" }], ["secret", "spoiler"]
    ]);
    const preWords = "before\nlet x = 1\ny = 2\nafter";
    const preEntities = formatEntities(preWords, [["let x = 1\ny = 2", "pre", { language: "python" }]]);
    const quoteWords = "lead\nquoted one\nquoted two\nfold head\nfold second\nfold third\nfold fourth\ntrail";
    const quoteEntities = formatEntities(quoteWords, [
      ["quoted one\nquoted two", "blockquote"], ["fold head\nfold second\nfold third\nfold fourth", "expandable_blockquote"]
    ]);
    const mediaLine = [
      ...[1, 2, 3].map((id) => shown(id, { album: 1, imagePath: `images/${MEDIA_CHAT}/${id}.jpg` })),
      shown(4, { kind: "sticker", files: [{ kind: "sticker", source: "sticker-1.tgs", storedPath: "kept", collectedAt: LINE_AT }] }),
      shown(5, { files: [{ kind: "animation", source: "video.mp4", storedPath: "kept", collectedAt: LINE_AT }] }),
      shown(7, { text: "words deleted on the messenger", deletedAt: LINE_AT - 100 }),
      shown(6, { text: "reacted to", reactions: [{ emoji: "\u{1F44D}", by: "1" }, { emoji: "\u{1F44D}", by: "7" }, { emoji: "\u{2764}\u{FE0F}", by: "8" }] }),
      shown(8, { text: inlineWords }),
      shown(9, { text: preWords }),
      shown(10, { text: quoteWords })
    ];
    const formats: Record<number, { text: string; entities: Record<string, unknown>[] }> = {
      8: { text: inlineWords, entities: inlineEntities },
      9: { text: preWords, entities: preEntities },
      10: { text: quoteWords, entities: quoteEntities }
    };

    if (path === `/rooms/${MEDIA_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? mediaLine : mediaLine.filter((one) => one.id > Number(after)), more: false });
    }

    const mediaAsked = new RegExp(`^/rooms/${MEDIA_CHAT}/messages/(\\d+)(/[a-z]+)?(/\\d+)?$`).exec(path);

    if (mediaAsked !== null) {
      const id = Number(mediaAsked[1]);

      if (mediaAsked[2] === "/picture") return new Response(TALL, { headers: { "content-type": "image/svg+xml" } });
      if (mediaAsked[2] === "/metadata") return Response.json({ metadata: id === 4 ? { sticker: { emoji: "\u{1F600}" } } : (formats[id] ?? null) });
      if (mediaAsked[2] === "/files" && mediaAsked[3] === undefined) {
        const files = id === 4
          ? [{ place: 0, kind: "sticker", name: "sticker-1.tgs", size: STICKER.byteLength, type: "application/x-tgsticker", kept: true }]
          : id === 5 ? [{ place: 0, kind: "animation", name: "video.mp4", size: 4, type: "video/mp4", kept: true }] : [];

        return Response.json({ items: files, more: false });
      }
      if (mediaAsked[2] === "/files") return new Response(id === 4 ? STICKER : new Uint8Array(4), { headers: { "content-type": id === 4 ? "application/x-tgsticker" : "video/mp4" } });

      return Response.json(mediaLine.find((one) => one.id === id) ?? mediaLine[0]);
    }

    if (path === "/rooms") return Response.json({ items: [room, behind, recorded, media], more: false });
    if (path === `/rooms/${RECORD_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? record : record.filter((one) => one.id > Number(after)), more: false });
    }
    // The record room's pinned message, for the top bar's pinned button.
    if (path === `/rooms/${RECORD_CHAT}/pins`) {
      return Response.json({ items: [{ id: -1, senderName: "owner", text: "record -1", pinnedAt: LINE_AT - 500 }], more: false });
    }
    // The default answerer, answering the two rooms that name no supervisor; the other supervisor answers none.
    if (path === "/default-answerer") return Response.json({ supervisor: "agent-a" });
    if (/^\/supervisors\/[^/]+\/rooms$/.test(path)) {
      return Response.json({
        items: path === "/supervisors/agent-a/rooms"
          ? [{ id: OWNER_CHAT, title: null, named: false, alone: true }, { id: UNREAD_CHAT, title: "unread-room", named: false, alone: true }]
          : [],
        more: false
      });
    }
    if (path === `/rooms/${RECORD_CHAT}/answerers`) return Response.json({ default: "agent-a", items: [{ agentName: "agent-a", defaultAnswerer: true }], more: false, voice: "agent-a" });
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
  // The first screen names the console's own members service under `calls`, and the second names nothing.
  SCREEN_A: (path) => screenUnit(HARNESS_SCREEN_UNITS[0], path, ["people"]),
  SCREEN_B: (path) => screenUnit(HARNESS_SCREEN_UNITS[1], path),
  ARTIFACT: () => null,
  TELEGRAM: () => null,
  CACHE_SIREN: () => null,
  CACHE_WARMER: (path) => path === "/round" ? Response.json({ stopped: false }) : null
};

let stopping = false;

// Stops everything it started; the scratch folder goes with it unless a failed start named the logs kept there.
async function stop(keepScratch = false): Promise<void> {
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
  if (!keepScratch) rmSync(scratch, { recursive: true, force: true });
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
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const answered = await answer(path, request);

        // A route the agency does not serve is named on the harness's own output, so a run shows every call the
        // console made past the agency's documented routes.
        if (answered === null && unit === "AGENCY") console.error(`agency stand-in: not served: ${request.method} ${path}`);

        return answered ?? notFound();
      }
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
    BMO_WEB_SERVER_NAMES__CHAT_AGENT: "agent-a",
    // The secret store writes into the scratch folder, standing in for the data root's env/.
    BMO_WEB_SERVER_SECRETS__DIR: join(scratch, "env")
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
    // No testbed program stands there, so the console reads the testbed's queue as empty and never the machine's own;
    // the test that reads a row's testbed line answers it through the page's own route.
    TESTBED_BIN: join(scratch, "no-testbed"),
    // A build folder of its own inside the checkout, so a typecheck beside it leaves what it serves alone and its
    // generated modules still resolve the console's packages.
    BMO_WEB_BUILD_DIR: ".nuxt-browser-tests",
    BMO_WEB_BASE_URL: BASE,
    // The user script runs the account command once the model is in force, so it is told the service to run.
    BMO_WEB_SERVER_BIN: binary,
    BMO_WEB_SERVER_DIR: SERVER_DIR
  };

  // The user script's account command runs the service binary, which reads the settings the service was started
  // on, so it is given them too.
  const userEnv = { ...consoleEnv, ...serverEnv };

  // The account model is brought into force before the fixture's accounts are made, so each login is the
  // service's and a member's sections are read through sumida. The move takes the console's one account as the
  // platform administrator's, which is why it runs before any other account stands.
  await run("bun", ["scripts/user.ts", "set", ACCOUNTS[0]![0], ACCOUNTS[0]![1], "--administrator"], userEnv, CONSOLE_DIR);

  const move = await fetch(`http://127.0.0.1:${serverPort}/accounts/move`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ ownerSenders: [1], rooms: [OWNER_CHAT, UNREAD_CHAT, RECORD_CHAT, MEDIA_CHAT] })
  });

  if (!move.ok) throw new Error(`the data move was refused: ${move.status} ${await move.text()}`);

  for (const [name, password] of ACCOUNTS) {
    await run("bun", ["scripts/user.ts", "set", name, password, "--administrator"], userEnv, CONSOLE_DIR);
  }

  for (const { name, password } of MEMBERS) {
    await run("bun", ["scripts/user.ts", "set", name, password], userEnv, CONSOLE_DIR);
  }

  // The console reads whether a login is the administrator from the account model each time (docs/web.md,
  // 「Access」): the model names the one account the data move made the platform administrator's, while every
  // fixture account made with --administrator carries that in its seal. Removing the model's name leaves each
  // login standing as its seal recorded it, so every account a file signs in with is the administrator its file
  // waits for, and the members, made without the flag, stay members.
  const fixture = new SQL(connectionOf(databaseUrl) as SQL.Options);

  await fixture.unsafe('DELETE FROM "settings" WHERE "key" = $1', ["users_administrator"]);
  await fixture.close();

  start("bun", ["--bun", "nuxi", "dev", "--port", String(consolePort), "--host", "127.0.0.1"], consoleEnv, CONSOLE_DIR, "console");

  const origin = `http://127.0.0.1:${consolePort}${BASE.replace(/\/$/, "")}`;

  await answering("the console", `${origin}/login`, 240);

  // Each member's sections written whole as the administrator's screen writes them, so a test's login reads a
  // rooms section that writes or one that only reads.
  const administrator = await signIn(ACCOUNTS[0]![0], ACCOUNTS[0]![1], origin);
  const listed = await fetch(`${origin}/api/users`, { headers: { cookie: administrator } });

  if (!listed.ok) throw new Error(`the users list was refused: ${listed.status}`);

  const users = (await listed.json()) as { user: string; name: string }[];

  for (const member of MEMBERS) {
    const one = users.find((user) => user.name === member.name);

    if (one === undefined) throw new Error(`${member.name} stands in no users list`);

    const written = await fetch(`${origin}/api/users/${one.user}/sections`, {
      method: "PUT",
      headers: { cookie: administrator, "content-type": "application/json" },
      body: JSON.stringify({ sections: member.sections })
    });

    if (!written.ok) throw new Error(`${member.name}'s sections were refused: ${written.status}`);
  }

  console.log(origin);
} catch (error) {
  console.error(error);
  await stop(true);
}
