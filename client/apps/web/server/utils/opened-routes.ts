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
// Agent management's five parts, each its own permission, and the three whose rows open an agent's own page.
const SUPERVISORS = ["supervisors"];
const ROLES = ["roles"];
const REPOSITORIES = ["repositories"];
const MODELS = ["models"];
const MODEL_FILES = ["model-files"];
const AGENT_PARTS = ["supervisors", "roles", "repositories", "models", "model-files"];
const AGENT_DETAIL = ["supervisors", "roles", "repositories"];
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
  // Invitations: every signed-in login asks, and the account service decides what each may invite into; the join
  // page's reads, which stand with or without a session.
  { method: "GET", path: /^\/api\/invites(?:\/units)?$/, scope: "user" },
  { method: "POST", path: /^\/api\/invites$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/invites\/[0-9a-f]+$/, scope: "user" },
  // A company's default for its people's BMOs and who under a unit may personalise theirs: every signed-in login asks,
  // and the account service decides who heads what (docs/accounts.md, 「A person's BMO profile」).
  { method: "GET", path: /^\/api\/organization\/companies\/\d+\/agent(?:\/picture)?$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/companies\/\d+\/agent(?:\/picture)?$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/organization\/companies\/\d+\/agent\/picture$/, scope: "user" },
  { method: "GET", path: /^\/api\/organization\/units\/\d+\/agent-permissions$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/(?:units|users)\/\d+\/agent-permission$/, scope: "user" },
  // The apps standing on under a unit and for the reader alone: every signed-in login asks, and the account service
  // decides who writes which link of the delegation chain (docs/accounts.md, 「Who changes a link」).
  { method: "GET", path: /^\/api\/organization\/units\/\d+\/apps$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/units\/\d+\/apps\/[^/]+$/, scope: "user" },
  // An organisation's agents — its supply sources, its own keys and its sign-up composition: every signed-in login
  // asks, and the account service and the agency decide who heads what (docs/web.md, 「Organisation」).
  { method: "GET", path: /^\/api\/organization\/units\/\d+\/(?:supply|composition)$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/units\/\d+\/(?:composition|supply\/company|supply\/sources\/[a-z]+)$/, scope: "user" },
  { method: "POST", path: /^\/api\/organization\/units\/\d+\/supply\/keys$/, scope: "user" },
  { method: "PATCH", path: /^\/api\/organization\/units\/\d+\/supply\/keys\/[^/]+$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/organization\/units\/\d+\/supply\/keys\/[^/]+$/, scope: "user" },
  // Where a unit's documents are kept: every signed-in login asks, and the account service decides who writes the
  // unit's link of the delegation chain, bmo-artifact judging the value (docs/web.md, 「Organisation」, the storage tab).
  { method: "GET", path: /^\/api\/organization\/storage$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/storage$/, scope: "user" },
  // An organisation's agent settings — its instructions, its persona's choice, repository management — and its own
  // repositories: every signed-in login asks, and the account service and the agency decide who heads what
  // (docs/web.md, 「Organisation」, the agents tab).
  { method: "GET", path: /^\/api\/organization\/units\/\d+\/(?:agent-settings|repositories)$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/units\/\d+\/agent-settings$/, scope: "user" },
  { method: "POST", path: /^\/api\/organization\/units\/\d+\/repositories$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/organization\/units\/\d+\/repositories\/[^/]+$/, scope: "user" },
  // The supply sources and the persona's choice as they stand for the reader alone, a unit above deciding some of
  // them (docs/web.md, 「Settings」).
  { method: "GET", path: /^\/api\/account\/(?:supply-sources|agent-persona)$/, scope: "user" },
  { method: "PUT", path: /^\/api\/account\/agent-persona$/, scope: "user" },
  { method: "GET", path: /^\/api\/account\/apps$/, scope: "user" },
  { method: "PUT", path: /^\/api\/account\/apps\/[^/]+$/, scope: "user" },
  // The reader's personal apps: every signed-in login asks for their own, the agency holding each account's apart
  // (docs/web.md, 「Settings」, the personal apps section).
  { method: "GET", path: /^\/api\/account\/personal-apps$/, scope: "user" },
  { method: "POST", path: /^\/api\/account\/personal-apps\/[^/]+\/back$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/account\/personal-apps\/[^/]+$/, scope: "user" },
  // A person marked left: every signed-in login asks, and the account service lets the administrator and the person's
  // heads alone (docs/accounts.md, 「A person who leaves」).
  { method: "POST", path: /^\/api\/organization\/users\/\d+\/leave$/, scope: "user" },
  // A post given or taken and an acting head named or ended: every signed-in login asks, and the account service lets
  // the administrator and the unit's heads alone (docs/accounts.md, 「Concurrent posts」 and 「Acting」).
  { method: "PUT", path: /^\/api\/organization\/units\/\d+\/(?:posts\/\d+|acting)$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/organization\/units\/\d+\/(?:posts\/\d+|acting)$/, scope: "user" },
  // A company's roles and unit kinds: every signed-in login asks, and the account service lets anyone of the company
  // read them and the administrator and the company's heads write them (docs/accounts.md, 「Roles and unit kinds」).
  { method: "GET", path: /^\/api\/organization\/companies\/\d+\/(?:roles|unit-kinds)$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/companies\/\d+\/(?:roles|unit-kinds)$/, scope: "user" },
  // A unit's org memory, its proposals and who may write it: every signed-in login asks, and the account service says
  // whom each unit's memory is written by and who grants it (docs/accounts.md, 「A unit's org memory」).
  { method: "GET", path: /^\/api\/organization\/memory\/(?:units|\d+(?:\/writers)?)$/, scope: "user" },
  { method: "POST", path: /^\/api\/organization\/memory\/\d+(?:\/\d+\/accept)?$/, scope: "user" },
  { method: "PATCH", path: /^\/api\/organization\/memory\/\d+\/\d+$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/organization\/memory\/\d+\/\d+$/, scope: "user" },
  { method: "PUT", path: /^\/api\/organization\/memory\/\d+\/writers\/\d+$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/organization\/memory\/\d+\/writers\/\d+$/, scope: "user" },
  // The people roster, its companies, a page of it, a person and their BMO: every signed-in login asks, and the account
  // service decides whom each looks through (docs/accounts.md, 「The people roster」). A person's rooms, agents, sessions
  // and runs are the administrator's alone.
  { method: "GET", path: /^\/api\/organization\/people(?:\/companies)?$/, scope: "user" },
  { method: "GET", path: /^\/api\/organization\/people\/\d+(?:\/bmo(?:\/picture)?)?$/, scope: "user" },
  { method: "GET", path: /^\/api\/join\/[0-9a-f]+$/, scope: "user" },
  { method: "POST", path: /^\/api\/join\/[0-9a-f]+\/(accept|proof)$/, scope: "user" },
  // The desktop app's pairing, asked and read with or without a session; its code read and answered by every
  // signed-in login for their own machine, and that machine's proof.
  { method: "POST", path: /^\/api\/desktop\/pairings$/, scope: "user" },
  { method: "GET", path: /^\/api\/desktop\/pairings\/[0-9a-f]+$/, scope: "user" },
  { method: "GET", path: /^\/api\/desktop\/pair\/[0-9A-Za-z-]+$/, scope: "user" },
  { method: "POST", path: /^\/api\/desktop\/pair\/[0-9A-Za-z-]+\/(approve|refuse)$/, scope: "user" },
  // The desktop app's current release, which its download page reads for every signed-in login, and the app itself
  // with no session.
  { method: "GET", path: /^\/api\/desktop\/release$/, scope: "user" },
  { method: "POST", path: /^\/api\/me\/machine\/proof$/, scope: "user" },
  // The reader's own machine, which the settings' machine section reads and takes away.
  { method: "GET", path: /^\/api\/me\/machine$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/me\/machine$/, scope: "user" },
  // The reader's own sections, which the navigation and the page guard read.
  { method: "GET", path: /^\/api\/me\/sections$/, scope: "user" },
  // The reader's own supervisors, whose log and turns open to them.
  { method: "GET", path: /^\/api\/me\/agents$/, scope: "user" },
  // Whether the reader must set up a login of their own before they start (docs/web.md, 「The join page」).
  { method: "GET", path: /^\/api\/me\/agent-login$/, scope: "user" },

  // The account's own surface.
  section(ACCOUNT, "POST", /^\/api\/account$/),
  section(ACCOUNT, "GET", /^\/api\/account\/(palette|theme|presence)$/),
  section(ACCOUNT, "PUT", /^\/api\/account\/(palette|theme|presence)$/),
  // One's own BMO's profile, which the account service opens only to a person who may personalise it.
  section(ACCOUNT, "GET", /^\/api\/account\/agent(?:\/picture)?$/),
  section(ACCOUNT, "PUT", /^\/api\/account\/agent(?:\/picture)?$/),
  section(ACCOUNT, "DELETE", /^\/api\/account\/agent(?:\/picture)?$/),
  section(ACCOUNT, "GET", /^\/api\/users\/\d+\/profile$/),
  section(ACCOUNT, "PUT", /^\/api\/users\/\d+\/profile$/),
  // The reader's own secrets, in their own space, and the kinds every person's form asks in; changing a kind is the
  // administrator's alone.
  section(ACCOUNT, "GET", /^\/api\/secrets$/),
  section(ACCOUNT, "POST", /^\/api\/secrets$/),
  section(ACCOUNT, "DELETE", /^\/api\/secrets\/[^/]+$/),
  section(ACCOUNT, "GET", /^\/api\/secret-kinds$/),
  section(ACCOUNT, "GET", /^\/api\/tab-states\/[^/]+$/),
  section(ACCOUNT, "PUT", /^\/api\/tab-states\/[^/]+$/),
  // Whose sender is the account's and the room's; the account is what every reader keeps.
  section(ACCOUNT, "GET", /^\/api\/owner$/),
  // The people directory, its members list, a person's page and the organisations the room's
  // let-in search finds beside people are the account section's.
  section(ACCOUNT, "GET", /^\/api\/people\/search$/),
  section(ACCOUNT, "GET", /^\/api\/people\/units$/),
  section(ACCOUNT, "GET", /^\/api\/people\/members$/),
  section(ACCOUNT, "GET", /^\/api\/people\/\d+$/),

  // The rooms a reader may read, their messages, files, pictures and the stream that carries their news.
  { ...section(ROOM, "GET", /^\/api\/rooms$/), scope: "room" },
  // Adding a room and the tools that act on a room's registration are the administrator's alone.
  { method: "GET", path: /^\/api\/room-add(?:\/.*)?$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/remove$/, scope: "user", administrator: true },
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/remove$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/providers$/, scope: "user", administrator: true },
  { method: "PUT", path: /^\/api\/rooms\/-?\d+\/providers$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/mode$/, scope: "user", administrator: true },
  { method: "PUT", path: /^\/api\/rooms\/-?\d+\/mode$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/tone$/, scope: "user", administrator: true },
  { method: "PUT", path: /^\/api\/rooms\/-?\d+\/tone$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/background$/, scope: "user", administrator: true },
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/pin$/, scope: "user", administrator: true },
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/messages\/-?\d+\/forward$/, scope: "user", administrator: true },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/brain-piece$/, scope: "user", administrator: true },
  // A group room opened in the console; adding one from a chat service stays the administrator's, refused in the route.
  section(ROOM, "POST", /^\/api\/rooms$/),
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
  // A tab saying what it shows, which is every signed-in account's presence whatever it may read; the route refuses a
  // room the account does not read.
  { method: "POST", path: /^\/api\/push\/watching$/, scope: "room", access: "read" },
  // The receiver's stream carries the news of what runs now as well.
  { method: "GET", path: /^\/api\/events$/, scope: "room", sections: ["rooms", "live"], access: "read" },

  // What is running now, its queue, its deployment and the items it works on.
  // A job's questions are put to the owner in his private chat, so they are the administrator's to read and the
  // owner's to answer, never a member's whatever sections they hold.
  section(LIVE, "GET", /^\/api\/(status|control|usage|deploy|deploy\/log|queue-pause)$/),
  section(LIVE, "POST", /^\/api\/(deploy-hold-release|queue-pause)$/),
  section(LIVE, "GET", /^\/api\/todos(?:\/.*)?$/),
  section(LIVE, "POST", /^\/api\/todos(?:\/.*)?$/),

  // Agent management, a permission to each of its five parts (docs/web.md, 「Access」). An agent's own page and
  // the shared reads a chooser or a mark makes open under any part; what the roles' agents are doing now stands
  // on the agents' and the roles' tabs, and the provider switches and the fallback are read beside every part and written as a
  // supervisor's.
  section(AGENT_DETAIL, "GET", /^\/api\/agents\/[^/]+(?:\/.*)?$/),
  section(AGENT_PARTS, "GET", /^\/api\/agents$/),
  { ...section(["supervisors", "roles"], "GET", /^\/api\/agent-runs$/), access: "read" },
  section(SUPERVISORS, "GET", /^\/api\/supervisors(?:\/.*)?$/),
  section(SUPERVISORS, "POST", /^\/api\/supervisors(?:\/.*)?$/),
  section(SUPERVISORS, "PATCH", /^\/api\/supervisors(?:\/.*)?$/),
  section(SUPERVISORS, "DELETE", /^\/api\/supervisors(?:\/.*)?$/),
  section(ROLES, "GET", /^\/api\/roles(?:\/.*)?$/),
  section(ROLES, "POST", /^\/api\/roles(?:\/.*)?$/),
  section(ROLES, "PATCH", /^\/api\/roles(?:\/.*)?$/),
  section(ROLES, "DELETE", /^\/api\/roles(?:\/.*)?$/),
  section(REPOSITORIES, "GET", /^\/api\/(repositories|work-nodes)(?:\/.*)?$/),
  section(REPOSITORIES, "POST", /^\/api\/repositories(?:\/.*)?$/),
  section(REPOSITORIES, "PATCH", /^\/api\/repositories(?:\/.*)?$/),
  section(REPOSITORIES, "DELETE", /^\/api\/repositories(?:\/.*)?$/),
  section(MODELS, "GET", /^\/api\/models(?:\/.*)?$/),
  section(MODELS, "POST", /^\/api\/models(?:\/.*)?$/),
  section(MODELS, "PATCH", /^\/api\/models(?:\/.*)?$/),
  section(MODELS, "DELETE", /^\/api\/models(?:\/.*)?$/),
  section(MODEL_FILES, "GET", /^\/api\/model-catalogue(?:\/.*)?$/),
  section(MODEL_FILES, "POST", /^\/api\/model-catalogue(?:\/.*)?$/),
  section(SUPERVISORS, "GET", /^\/api\/(chat-documents|default-answerer)(?:\/.*)?$/),
  section(SUPERVISORS, "PUT", /^\/api\/default-answerer(?:\/.*)?$/),
  section(SUPERVISORS, "PATCH", /^\/api\/chat-documents(?:\/.*)?$/),
  // What every part's chooser reads. The provider switches and the fallback are the settings dialog's, which only
  // the administrator opens, so their writes stand with the routes not opened to a member.
  section(AGENT_PARTS, "GET", /^\/api\/(provider-models|providers|fallback|agent-faces|tool-icons)(?:\/.*)?$/),
  // What an agent's own page sends, and the stop a run's row offers.
  section(AGENT_DETAIL, "POST", /^\/api\/(launch|worker-word)(?:\/.*)?$/),
  section(["live", "supervisors", "roles"], "POST", /^\/api\/run-stop(?:\/.*)?$/),

  // The research unit's queue, runs and sources, and the settings every run is held to.
  section(RESEARCH, "GET", /^\/api\/research(?:\/.*)?$/),
  section(RESEARCH, "PUT", /^\/api\/research-settings$/),
  section(RESEARCH, "GET", /^\/api\/research-settings$/),
  section(RESEARCH, "POST", /^\/api\/research\/(queue|sources|topics)$/),
  section(RESEARCH, "PATCH", /^\/api\/research\/(queue\/[^/]+|sources\/[^/]+|topics\/[^/]+|state)$/),
  section(RESEARCH, "DELETE", /^\/api\/research\/(sources|topics)\/[^/]+$/),

  // Every machine's hardware and the card master's board.
  section(MONITOR, "GET", /^\/api\/(hardware\/machines\/[^/]+|hardware\/machines\/[^/]+\/(history|live)|cards\/(state|events))$/),
  // The nodes a repository's jobs run on are named on its tab as well as on the monitor.
  section(["monitor", "repositories"], "GET", /^\/api\/nodes$/),
  section(MONITOR, "POST", /^\/api\/hardware\/(tracking|cpu-limit)$/),

  // The console's own database, read as tables and rows.
  section(["db"], "GET", /^\/api\/db\/.*$/),
  section(["db"], "POST", /^\/api\/db\/(query|stop)$/),

  // The documents the viewer reads and the text the gate translates.
  section(DOCUMENTS, "GET", /^\/api\/documents(?:\/.*)?$/),
  section(DOCUMENTS, "POST", /^\/api\/(documents\/.*|translations)$/),

  // What the provider's prompt cache did, as the siren on this machine saw it.
  section(SIREN, "GET", /^\/api\/siren$/),

  // Supply (docs/web.md, the supply sections): the relay stands as one spread of route files under `/api/supply`,
  // one method each, so no path of it stands apart to be opened apart. Every method of it is opened whole under
  // the plain user scope, and the relay itself answers each head as absent to the login it does not belong to —
  // the platform row, the plans and the credits to the administrator alone, the reader's own view, setting,
  // logins and keys to the account section, and every unit and person read to the account service's own
  // judgement of the reader.
  { method: "GET", path: /^\/api\/supply\/.+$/, scope: "user" },
  { method: "POST", path: /^\/api\/supply\/.+$/, scope: "user" },
  { method: "PUT", path: /^\/api\/supply\/.+$/, scope: "user" },
  { method: "PATCH", path: /^\/api\/supply\/.+$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/supply\/.+$/, scope: "user" }
];

/** The opened route a request asks, or null where it asks one the administrator alone reaches. */
export function openedRoute(method: string, path: string): OpenedRoute | null {
  const bare = path.split("?")[0] ?? path;

  return openedRoutes.find((route) => route.method === method.toUpperCase() && route.path.test(bare)) ?? null;
}
