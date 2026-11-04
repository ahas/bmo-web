// What a user other than the platform administrator may reach on the console (docs/web.md, 「Access」):
// each route with the console section it serves and whether it reads or writes it. A route with no section
// is every signed-in login's; a route not here is the administrator's alone. Every route not here answers
// another login as if nothing stood there. The list is the boundary itself, so it is read in one place, and
// the absence test holds every route file to it.

/** The scope a route reads under: the signed-in user's own rows, or the rooms they may read. */
export type RouteScope = "user" | "room";

/** Whether a route reads its section or changes it. */
export type RouteAccess = "read" | "write";

export interface OpenedRoute {
  method: string;
  path: RegExp;
  scope: RouteScope;
  // The console sections the route serves; any one of them opens it. Absent where every signed-in login
  // reaches it and no section is asked.
  sections?: readonly string[];
  // Read where a route only reads; a route without one is read.
  access?: RouteAccess;
  // A route only the administrator reaches, though it stands beside the opened ones; listed here so the route
  // files stay held to one place.
  administrator?: true;
}

const ROOM = ["rooms"];
const LIVE = ["live"];
const AGENTS = ["agents"];
const RESEARCH = ["research"];
const MONITOR = ["monitor"];
const DOCUMENTS = ["documents"];
const ACCOUNT = ["account"];
const SIREN = ["siren"];

// A section's GET routes read it, and every other method writes it.
function section(sections: readonly string[], method: string, path: RegExp): OpenedRoute {
  return { method, path, scope: "user", sections, access: method === "GET" ? "read" : "write" };
}

export const openedRoutes: readonly OpenedRoute[] = [
  // The session and the screens a unit brings, which every signed-in login reads.
  { method: "POST", path: /^\/api\/auth\/(login|logout)$/, scope: "user" },
  { method: "GET", path: /^\/api\/auth\/me$/, scope: "user" },
  { method: "GET", path: /^\/api\/_auth\/session$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/_auth\/session$/, scope: "user" },
  { method: "GET", path: /^\/api\/_nuxt_icon\/[^/]+\.json$/, scope: "user" },
  { method: "GET", path: /^\/api\/console-bundles(?:\/unread)?$/, scope: "user" },
  // The reader's own sections, which the navigation and the page guard read.
  { method: "GET", path: /^\/api\/me\/sections$/, scope: "user" },

  // The account's own surface.
  section(ACCOUNT, "POST", /^\/api\/account$/),
  section(ACCOUNT, "GET", /^\/api\/account\/(palette|theme)$/),
  section(ACCOUNT, "PUT", /^\/api\/account\/(palette|theme)$/),
  section(ACCOUNT, "GET", /^\/api\/users\/\d+\/profile$/),
  section(ACCOUNT, "PUT", /^\/api\/users\/\d+\/profile$/),
  section(ACCOUNT, "GET", /^\/api\/tab-states\/[^/]+$/),
  section(ACCOUNT, "PUT", /^\/api\/tab-states\/[^/]+$/),
  // Whose sender is the account's and the room's; the account is what every reader keeps.
  section(ACCOUNT, "GET", /^\/api\/owner$/),
  // The people directory and a person's page are the account section's.
  section(ACCOUNT, "GET", /^\/api\/people\/search$/),
  section(ACCOUNT, "GET", /^\/api\/people\/\d+$/),

  // The rooms a reader may read, their messages, files, pictures and the stream that carries their news.
  { ...section(ROOM, "GET", /^\/api\/rooms$/), scope: "room" },
  { method: "POST", path: /^\/api\/rooms$/, scope: "user", administrator: true },
  // Adding a room and the tools that act on a room's registration are the administrator's alone.
  { method: "GET", path: /^\/api\/room-add(?:\/.*)?$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/remove$/, scope: "user", administrator: true },
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/remove$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/providers$/, scope: "user", administrator: true },
  { method: "PUT", path: /^\/api\/rooms\/-?\d+\/providers$/, scope: "user", administrator: true },
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/pin$/, scope: "user", administrator: true },
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/messages\/-?\d+\/forward$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/brain-piece$/, scope: "user", administrator: true },
  { ...section(ROOM, "GET", /^\/api\/rooms\/-?\d+\/messages$/), scope: "room" },
  { ...section(ROOM, "POST", /^\/api\/rooms\/-?\d+\/read$/), scope: "room" },
  { ...section(ROOM, "POST", /^\/api\/rooms\/-?\d+\/messages\/-?\d+\/reading$/), scope: "room" },
  { ...section(ROOM, "GET", /^\/api\/rooms\/-?\d+\/.+$/), scope: "room" },
  { ...section(ROOM, "POST", /^\/api\/rooms\/-?\d+\/.+$/), scope: "room" },
  { ...section(ROOM, "PUT", /^\/api\/rooms\/-?\d+\/.+$/), scope: "room" },
  { ...section(ROOM, "PATCH", /^\/api\/rooms\/-?\d+\/.+$/), scope: "room" },
  { ...section(ROOM, "DELETE", /^\/api\/rooms\/-?\d+\/.+$/), scope: "room" },
  { ...section(ROOM, "GET", /^\/api\/images\/-?\d+\/-?\d+$/), scope: "room" },
  { ...section(ROOM, "GET", /^\/api\/media\/[^/]+\/-?\d+\/-?\d+$/), scope: "room" },
  section(ROOM, "GET", /^\/api\/avatars(?:\/[^/]+\/[^/]+)?$/),
  { ...section(ROOM, "POST", /^\/api\/push\/watching$/), access: "read" },
  // The receiver's stream carries the live status screen's news as well.
  { method: "GET", path: /^\/api\/events$/, scope: "room", sections: ["rooms", "live"], access: "read" },

  // What is running now, its queue, its deployment and the items it works on.
  section(LIVE, "GET", /^\/api\/(status|control|usage|deploy|deploy\/log|questions|question-pause|queue-pause)$/),
  section(LIVE, "POST", /^\/api\/(deploy-hold-release|question-pause|queue-pause)$/),
  section(LIVE, "GET", /^\/api\/todos(?:\/.*)?$/),
  section(LIVE, "POST", /^\/api\/todos(?:\/.*)?$/),

  // The supervisors, roles, repositories, models and the jobs and runs that go with them. The agent list and
  // the role slots stand on the live status screen too.
  section(["agents", "live"], "GET", /^\/api\/(agents|slots)(?:\/.*)?$/),
  section(AGENTS, "GET", /^\/api\/(supervisors|roles|repositories|models|model-catalogue|provider-models|providers|fallback|chat-documents|default-answerer|research-supervisor|work-nodes|agent-faces|tool-icons)(?:\/.*)?$/),
  section(AGENTS, "POST", /^\/api\/(agents|supervisors|roles|repositories|models|model-catalogue|fallback|launch|run-stop|worker-word)(?:\/.*)?$/),
  section(AGENTS, "PATCH", /^\/api\/(agents|supervisors|roles|repositories|models|providers|fallback|chat-documents|default-answerer|research-supervisor)(?:\/.*)?$/),
  section(AGENTS, "PUT", /^\/api\/(chat-documents|default-answerer|research-supervisor)(?:\/.*)?$/),
  section(AGENTS, "DELETE", /^\/api\/(supervisors|roles|repositories|models)(?:\/.*)?$/),

  // The research unit's queue, runs and sources, and the settings every run is held to.
  section(RESEARCH, "GET", /^\/api\/research(?:\/.*)?$/),
  section(RESEARCH, "PUT", /^\/api\/research-settings$/),
  section(RESEARCH, "GET", /^\/api\/research-settings$/),
  section(RESEARCH, "POST", /^\/api\/research\/(queue|sources)$/),
  section(RESEARCH, "PATCH", /^\/api\/research\/(queue\/[^/]+|sources\/[^/]+|state)$/),
  section(RESEARCH, "DELETE", /^\/api\/research\/sources\/[^/]+$/),

  // Every machine's hardware and the card master's board.
  section(MONITOR, "GET", /^\/api\/(hardware\/machines\/[^/]+|hardware\/machines\/[^/]+\/(history|live)|cards\/(state|events))$/),
  // The nodes a repository's jobs run on are named on agent management as well as on the monitor.
  section(["monitor", "agents"], "GET", /^\/api\/nodes$/),
  section(MONITOR, "POST", /^\/api\/hardware\/(tracking|cpu-limit)$/),

  // The console's own database, read as tables and rows.
  section(["db"], "GET", /^\/api\/db\/.*$/),
  section(["db"], "POST", /^\/api\/db\/(query|stop)$/),

  // The documents the viewer reads and the text the gate translates.
  section(DOCUMENTS, "GET", /^\/api\/documents(?:\/.*)?$/),
  section(DOCUMENTS, "POST", /^\/api\/(documents\/.*|translations)$/),

  // What the provider's prompt cache did, as the siren on this machine saw it.
  section(SIREN, "GET", /^\/api\/siren$/)
];

/** The opened route a request asks, or null where it asks one the administrator alone reaches. */
export function openedRoute(method: string, path: string): OpenedRoute | null {
  const bare = path.split("?")[0] ?? path;

  return openedRoutes.find((route) => route.method === method.toUpperCase() && route.path.test(bare)) ?? null;
}
