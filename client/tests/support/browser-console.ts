// A console of its own for the browser tests that drive one (docs/checks.md, 「How the suite runs the tests」):
// the account service on a scratch database of the test server, a stand-in for every unit the console reads, the
// fixture account each of those tests signs in with, and the console's development server on top of them, the
// one console that serves the screen-measuring module. It prints the console's address once the console answers,
// and stands until it is told to stop, then stops everything it started and drops the database.
//
// Usage, from `client/`: `BMO_WEB_SERVER_BIN=<the bmo-web-server binary> bun tests/support/browser-console.ts`.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SQL } from "bun";
import { LAYER_VERSION } from "bmo-ui/shared/console-manifest";
import sharp from "sharp";

import { connectionOf } from "../../apps/web/server/utils/db";
import { WatchedChildren } from "./children";
import { manifestFields } from "./console-manifest";
import { HARNESS_SCREEN_UNITS } from "./harness-screens";
import { jobLogAnswer } from "./job-log";
import { mailServersAnswer } from "./mail-servers";
import { orgBrainAnswer } from "./org-brain";
import { capturedMachines, capturedReadings } from "./node-machines";
import { rawNumber } from "./raw-number";
import { roleLogAnswer } from "./role-log";
import { HIGH_ALBUM, HIGH_ANSWERED, HIGH_FILE, HIGH_FILE_NAME, HIGH_FILE_WORDS, HIGH_LINE, HIGH_PICTURE, HIGH_ROOM, highSent, highWords } from "./high-room";
import { UNREAD_LINE, UNREAD_ROOM } from "./unread-room";
import { INVITE_ACCOUNTS, INVITE_ROOM, inviteRoom, inviteRoomListed, inviteRoomMade, inviteRoomsOf } from "./invite-room";
import { SYSTEM_ROOM, systemRoom } from "./system-room";
import { ASKED_RUN, askedRunLogAnswer } from "./asked-run";
import { addressOf, BROWSER_CONSOLE_PREFIX, dropScratchDatabase, sweepScratchDatabases } from "./web-database";
import { LABELS } from "./media-labels";
import { removalAnswer } from "./removal-units";

const CLIENT = new URL("../..", import.meta.url).pathname;
const CONSOLE_DIR = join(CLIENT, "apps/web");
const SERVER_DIR = join(CLIENT, "../server");
const TOKEN = "browser-console-token-0123456789";

// The accounts the console-driven tests sign in with, each by the name and password its file names. Each is a
// platform administrator, so its screen reaches every section. The first is the owner's account too: the data move
// takes it as the move's administrator and links the owner's sender to it, so a file that reads the owner's words as
// the reader's own signs in with it (docs/accounts.md, 「The owner's account」).
const ACCOUNTS: readonly [string, string][] = [
  ["agent-topbar", "fixture-password-1558"],
  ["home-repository", "fixture-password-3052"],
  ["agents-general", "fixture-password-2301"],
  ["agents-state", "fixture-password-3049"],
  ["agents-rest", "fixture-password-4417"],
  ["bubble-wrap", "fixture-password-1477"],
  ["composer-view", "fixture-password-2170"],
  ["console-ids", "fixture-password-789"],
  ["item-reports", "fixture-password-2251"],
  ["room-unread", "fixture-password-2252"],
  ["room-unread-tabs", "fixture-password-2253"],
  ["room-read-desk", "fixture-password-2953"],
  ["room-read-phone", "fixture-password-2954"],
  ["room-copy", "fixture-password-2254"],
  ["room-members", "fixture-password-2995"],
  ["room-info", "fixture-password-3755"],
  ["agent-room", "fixture-password-3961"],
  ["agents-listed", "fixture-password-2255"],
  ["briefing-chip", "fixture-password-2256"],
  ["bundle-bar", "fixture-password-2258"],
  ["draft-close", "fixture-password-2259"],
  ["prompt-wrap", "fixture-password-1575"],
  ["room-feed", "fixture-password-1457"],
  ["skip-reason", "fixture-password-3444"],
  ["room-find", "fixture-password-2261"],
  ["room-past", "fixture-password-2943"],
  ["system-lines", "fixture-password-4127"],
  ["pictures", "fixture-password-2262"],
  ["stickers", "fixture-password-3303"],
  ["skeleton259", "fixture-password-259"],
  ["stepper", "fixture-password-2206"],
  ["title-bar", "fixture-password-2318"],
  ["todo-hold", "fixture-password-3236"],
  ["todo-form-box", "fixture-password-3767"],
  ["todo-tabs-line", "fixture-password-3849"],
  ["topbar-square", "fixture-password-1444"],
  ["desktop-window", "fixture-password-3811"],
  ["briefing-autoplay", "fixture-password-2331"],
  ["mention-agents", "fixture-password-2346"],
  ["brain-translation", "fixture-password-2355"],
  ["voice-transcript", "fixture-password-2361"],
  ["high-room", "fixture-password-2963"],
  ["room-attach", "fixture-password-2364"],
  ["agent-names", "fixture-password-2371"],
  ["sidebar-sections", "fixture-password-3051"],
  ["personal-apps", "fixture-password-4101"],
  ["personal-screens", "fixture-password-4102"],
  ["app-catalogue", "fixture-password-4103"],
  ["personal-names", "fixture-password-4104"],
  ["monitor-polling", "fixture-password-2372"],
  ["monitor-nodes", "fixture-password-3688"],
  ["todo-models", "fixture-password-2298"],
  ["todo-assign", "fixture-password-2765"],
  ["todo-testbed", "fixture-password-2771"],
  ["todo-row-unfold", "fixture-password-2784"],
  ["org-settings", "fixture-password-2666"],
  ["org-agents", "fixture-password-3901"],
  // The administrator of a platform with no working source, whom the start guide leads through its flow
  // (tests/browser/start-guide.test.ts).
  ["guide-admin", "fixture-password-4201"],
  ["org-group", "fixture-password-3903"],
  ["org-storage", "fixture-password-3921"],
  ["org-mail", "fixture-password-3931"],
  ["copy-marks", "fixture-password-3291"],
  ["machine-unbind", "fixture-password-3583"],
  ["permanent-delete", "fixture-password-3611"],
  ["todo-run-figures", "fixture-password-2826"],
  ["todo-state-spin", "fixture-password-3877"],
  ["work-view", "fixture-password-2311"],
  ["tool-clock", "fixture-password-3071"],
  ["record-verdicts", "fixture-password-3145"],
  ["judging-beat", "fixture-password-3146"],
  ["screen-stands", "fixture-password-2411"],
  ["hidden-inputs", "fixture-password-2412"],
  ["secret-request", "fixture-password-2649"],
  ["agent-log-open", "fixture-password-2809"],
  ["agent-log-run-start", "fixture-password-3055"],
  ["row-add", "fixture-password-2885"],
  ["provider-secrets", "fixture-password-3037"],
  ["deploy-flush", "fixture-password-3842"],
  ["provider-usage", "fixture-password-3768"],
  ["todo-raise", "fixture-password-2871"],
  ["todo-unfinished", "fixture-password-3832"],
  ["supervisor-road", "fixture-password-2921"],
  ["builder-model", "fixture-password-2926"],
  ["sidebar-rooms", "fixture-password-2941"],
  ["room-head", "fixture-password-3051"],
  ["person-name", "fixture-password-3096"],
  ["supply-signin", "fixture-password-4411"],
  ["console-load", "fixture-password-3127"],
  ["deploy-truth", "fixture-password-3187"],
  ["room-presence", "fixture-password-3124"],
  ["room-bottom", "fixture-password-3188"],
  ["people-presence", "fixture-password-3293"],
  ["sidebar-agent-rows", "fixture-password-3165"],
  ["person-tabs", "fixture-password-3363"],
  ["date-escape", "fixture-password-3374"],
  ["opened-with", "fixture-password-3376"],
  ["choice-select", "fixture-password-3413"],
  ["input-menu-name", "fixture-password-3562"],
  ["qa-admin", "fixture-password-3765"],
  ["app-screens", "fixture-password-3901"],
  ["apps-admin", "fixture-password-3911"],
  ["todo-awaiting", "fixture-password-3826"],
  ["four-languages", "fixture-password-4401"],
  ["browser-language", "fixture-password-4402"],
  ["shared-info", "fixture-password-4113"],
  ["own-agents", "fixture-password-4114"],
  ["session-acts", "fixture-password-4115"],
  ["axis-admin", "fixture-password-4121"],
  ["tree-admin", "fixture-password-4611"],
  ["join-signed-in", "fixture-password-4131"],
  // The administrator whose tab signs out and hands over to a member's login (tests/browser/sign-in-sidebar.test.ts).
  ["sign-in-admin", "fixture-password-5201"],
  // The administrator who resets a person's password on the people tab (tests/browser/account-security.test.ts).
  ["security-admin", "fixture-password-5100"],
  // The administrator who opens an address no page answers (tests/browser/error-page.test.ts).
  ["error-page", "fixture-password-4404"]
];

// The account security files' members, by the name and password each signs in with; each keeps the email
// `<name>@example.test`, verified through the mail the stand-in bmo-mail keeps.
const SECURITY_MEMBERS: readonly [string, string][] = [
  ["security-forgot-1280", "fixture-password-5101"],
  ["security-forgot-360", "fixture-password-5102"],
  ["security-factor-1280", "fixture-password-5103"],
  ["security-factor-360", "fixture-password-5104"],
  ["security-target-1280", "fixture-password-5105"],
  ["security-target-360", "fixture-password-5106"]
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
    name: "tester",
    password: "fixture-password-3766",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // A person with a BMO of their own and its private room, whose profile names the BMO (tests/browser/agent-room.test.ts).
  {
    name: "agent-room-person",
    password: "fixture-password-3962",
    sections: [
      { section: "rooms", read: true, write: true },
      { section: "account", read: true, write: true }
    ]
  },
  // A member whose login is an email address, as an invitation takes one (docs/accounts.md, 「Users and senders」).
  {
    name: "email-member@example.com",
    password: "fixture-password-4501",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The people the permanent delete's file deletes for good, one at each width (tests/browser/permanent-delete.test.ts).
  ...["removal-target-1280", "removal-target-360"].map((name, index) => ({
    name,
    password: `fixture-password-36${20 + index}`,
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  })),
  {
    name: "org-member",
    password: "fixture-password-2667",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // A head of a unit under a company that locks its mail servers, who reads the lock and may change nothing
  // (tests/browser/organization-mail-servers.test.ts).
  {
    name: "mail-head",
    password: "fixture-password-3932",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // A person under a company whose heads decide their agents' settings, who owns a BMO of their own (docs/web.md,
  // 「Settings」, the supply and own-BMO sections).
  {
    name: "org-group-person",
    password: "fixture-password-3904",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The person whose runs only their own supply can carry, who sets up a login of their own before they start
  // (docs/web.md, 「The join page」).
  {
    name: "agent-login",
    password: "fixture-password-3902",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The member a tab signs in as once another login has signed out of it, and the new members whose first sign-in
  // the start guide holds, one for each width, whose runs only their own supply can carry
  // (tests/browser/sign-in-sidebar.test.ts).
  ...["sign-in-member", "first-sign-in-1280", "first-sign-in-360"].map((name, at) => ({
    name,
    password: `fixture-password-${5202 + at}`,
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  })),
  // The person who brings a local AI of their own, whose own supply is all that carries their runs and whose PC the
  // agency reaches (docs/web.md, 「The start guide」 and 「Settings」, the supply section's local AIs).
  {
    name: "local-ai-member",
    password: "fixture-password-4203",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The person whose organisation supplies their runs, who may add their own beside it or put it off in the start
  // guide (docs/web.md, 「The start guide」).
  {
    name: "guide-member",
    password: "fixture-password-4202",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The invite room's people (tests/support/invite-room.ts): its opener and a member who write there, a member whose
  // rooms section only reads, and the guests let in.
  ...[INVITE_ACCOUNTS.opener, INVITE_ACCOUNTS.writer, ...INVITE_ACCOUNTS.guests].map(({ name, password }) => ({
    name,
    password,
    sections: [
      { section: "rooms", read: true, write: true },
      { section: "account", read: true, write: true }
    ]
  })),
  {
    ...INVITE_ACCOUNTS.reader,
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
  // The person who gives their own name on their account's profile.
  {
    name: "name-member",
    password: "fixture-password-3097",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The person who approves the desktop app's pairing on its page, which opens whatever sections they hold.
  {
    name: "pair-member",
    password: "fixture-password-3080",
    sections: [{ section: "account", read: true, write: true }]
  },
  // The people the organisation chart moves into another unit together, who never sign in.
  ...["org-move-a", "org-move-b", "org-move-c"].map((name, at) => ({
    name,
    password: `fixture-password-286${at}`,
    sections: [{ section: "account", read: true, write: true }]
  })),
  // The head of a company who reads one of its people's tabs, and that person, who never signs in.
  ...["person-tabs-head", "person-tabs-subject"].map((name, at) => ({
    name,
    password: `fixture-password-336${at + 4}`,
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
  // The people whose presence the receiver's stand-in tells in a room nobody else stands in: one of the fixture's
  // company, one of it who turned their presence off, and one moved into a company of their own.
  ...["presence-here", "presence-hidden", "presence-other"].map((name, at) => ({
    name,
    password: `fixture-password-329${at}`,
    sections: [{ section: "account", read: true, write: true }]
  })),
  // The person an app is turned off for by their organisation, and the head of their company who turns it off.
  ...["app-member", "app-head"].map((name, at) => ({
    name,
    password: `fixture-password-390${at + 2}`,
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  })),
  // A head of a unit, who gives its people only the sections they hold, and a person of that unit, on the organisation
  // screen's secrets and permissions tabs.
  {
    name: "tree-head",
    password: "fixture-password-4612",
    sections: [
      { section: "rooms", read: true, write: true },
      { section: "account", read: true, write: true },
      { section: "research", read: true, write: false }
    ]
  },
  {
    name: "tree-member",
    password: "fixture-password-4613",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The person an app is offered to, recalled from and switched for themselves on the organisation screen's apps tab.
  {
    name: "apps-reader",
    password: "fixture-password-3912",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
    ]
  },
  // The person whose own agents and supply stand at their own node on the organisation screen, reached through the settings' doors.
  {
    name: "axis-reader",
    password: "fixture-password-4122",
    sections: [
      { section: "rooms", read: true, write: false },
      { section: "account", read: true, write: true }
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
  },
  // The account security files' members, each with a verified email: one who forgets their password, one who sets up a
  // second factor and one whose password the administrator resets, at each width (tests/browser/account-security.test.ts).
  ...SECURITY_MEMBERS.map(([name, password]) => ({
    name,
    password,
    sections: [
      { section: "rooms", read: true, write: true },
      { section: "account", read: true, write: true }
    ]
  }))
];

// The owner's room, which the receiver's stand-in names as theirs and lists, and a room an account meets two behind.
const OWNER_CHAT = 42;
const UNREAD_CHAT = UNREAD_ROOM;
// A room the console made on the record road, its words standing under no chat service: the owner's under their own
// sender, the chat agent's under no number at all.
const RECORD_CHAT = -9_000_000_000_099;
// A room whose messages carry what a messenger sends besides words: an album of three tall pictures, an animated
// sticker, an animation, reactions of several people with their pictures, two videos, and three kept files that stand
// as file lines: a document under a caption, a sound in a form no browser plays, and a document that could not be
// received; then a lone square picture under a caption of several lines from person-b, and one from the account that reads
// the room.
const MEDIA_CHAT = 44;
// A room of stickers and emoticons from two chat services, each standing as the picture alone (docs/web.md, the room screen's
// wordless messages): a still sticker and a video sticker kept as files, a moving emoticon kept as the message's picture whose
// file plays it once, a GIF sticker kept as a file that plays once, the same emoticon sent with words, an animated
// sticker's scene, the emoticon sent with a word by the account that reads the room, so it stands on the right, and an
// APNG sticker kept as a file that plays once.
const STICKER_CHAT = 45;
// A room of messages that are one picture and nothing else, each standing alone, and pictures that keep their bubbles
// beside them (docs/web.md, the room screen's wordless messages; LONE_PICTURES).
const LONE_CHAT = 46;
// A room a chat service numbered and listed, which the owner speaks in but never added, allowed or gave an agent: the
// console leaves it out of the room list until it is added from the room add dialog, and once its registration is removed
// it is a room never added again, so a file adding and removing it runs again on the same console. Its mode is what
// the receiver's stand-in last added it in.
const NUMBERED_CHAT = -9_002_000_000_001;
const numbered: { mode: string | null } = { mode: null };
// Two rooms of more than two pages, read back to their oldest line: one a chat service numbers past 2^53, a thousand
// apart as such a service spaces its numbers, on that service, which reads a room's past back, and on a second, which
// reads nothing back; and one numbered from 1 on the second alone. Each answers a page by the place its cursor stands in the line, as the receiver does,
// so a cursor naming no line it holds reads nothing.
const PAST_CHAT = -9_002_000_000_002;
const PAST_LINE = Array.from({ length: 75 }, (_, at) => String(3_973_000_000_000_000_177n + BigInt(at) * 1_000n));
const PAGED_CHAT = -9_002_000_000_003;
// The largest file the second chat service declares it takes, a million bytes.
const CHAT_B_FILE_BYTES = 1_000_000;
const PAGED_LINE = Array.from({ length: 70 }, (_, at) => String(at + 1));
// Whose private room each room is, as the receiver keeps it (its `docs/api.md`, 「Rooms」): another account's private room
// with its own BMO, which the fixture administrator reads and changes nothing of, and the owner's private chat, sealed
// where the console is stood up with `BROWSER_CONSOLE_SEALED_OWNER=1`, as it stands while his sender is linked to no
// account. Every other room is no one's. A write naming an account it is not that account's, or any account in a sealed
// room, is refused 403 `private-room`, as the receiver refuses it.
const PRIVATE_CHAT = -9_003_000_000_001;
const PRIVATE_ACCOUNT = 9_003_001;
// A room only the presence fixture's people stand in, whose presence the receiver's stand-in tells as its stream opens:
// each of the three online, written once their accounts stand. No fixture account shares the room with them.
const PRESENCE_CHAT = -9_004_000_000_001;
// A person's own BMO's private room, titled on the receiver by the person, its BMO labelled with the person's name and
// its profile naming it `Dear`; the person's account is known once the accounts stand.
const OWN_BMO_CHAT = -9_006_000_000_001;
const OWN_BMO = "agent-room-bmo";
const OWN_BMO_PERSON = "agent-room-person";
let ownBmoAccount: number | null = null;
const PRESENCE_PEOPLE = ["presence-here", "presence-hidden", "presence-other"] as const;
const presence = { frames: "" };
// Every fixture room stands under a number of its own: the receiver's stand-in answers a room's reads by its number, so
// two rooms on one number would hand one of them the other's line. The harness refuses to stand where two share one.
const FIXTURE_ROOMS: Record<string, number> = { OWNER_CHAT, UNREAD_CHAT, RECORD_CHAT, MEDIA_CHAT, STICKER_CHAT, LONE_CHAT, NUMBERED_CHAT, PAST_CHAT, PAGED_CHAT, PRIVATE_CHAT, PRESENCE_CHAT, HIGH_ROOM, SYSTEM_ROOM, INVITE_ROOM, OWN_BMO_CHAT };
const sharedRooms = Object.entries(FIXTURE_ROOMS).filter(([, id], at, all) => all.findIndex(([, other]) => other === id) !== at);

if (sharedRooms.length > 0) {
  throw new Error(`fixture rooms share a number: ${sharedRooms.map(([name, id]) => `${name} on ${id}`).join(", ")}`);
}
// The person whose activity a person's tabs show (docs/web.md, 「Organisation」, the people tab): one room they read, the
// last scout seat filed under their account, and one run and one session of that seat, written once their account
// stands. No other account reads the room by membership, and the seat's other agents keep their rows as they were.
const ACTIVITY_PERSON = "person-tabs-subject";
const ACTIVITY_AGENT = "scout-12";
const activity = { account: 0 };

// The Claude accounts the agency holds, with what each has left (docs/web.md, 「Administration」, the providers tab):
// two accounts on, one with a weekly window nearly spent and one with both windows, a third off, and a fourth whose CLI
// was never signed in on the agency's machine; the provider list
// beside them keeps a road with a balance and a request allowance. The second account belongs to the activity person,
// the rest to the platform.
function usageFallback(): Record<string, unknown> {
  const now = Math.floor(LINE_AT / 1000);
  const account = (id: string, name: string, place: number, over: Record<string, unknown> = {}) => ({
    id, name, place, enabled: true, credentialKind: "directory", credentialPath: `/srv/claude/${id}`, login: "standing", loginEndsAt: null,
    chosen: false, serving: false, restUntil: null, ...over
  });

  return {
    active: { provider: "claude-code", account: "acct-b", accountName: "claude-02", accounts: 2, session: null, week: null, balance: null },
    routes: [{ name: "claude-code", label: "Claude Code" }],
    accounts: [
      account("acct-a", "claude-01", 1, { restUntil: now + 2 * 86_400 }),
      account("acct-b", "claude-02", 2, { chosen: true, serving: true, userId: activity.account }),
      account("acct-c", "claude-03", 3, { enabled: false }),
      account("acct-d", "claude-04", 4, { login: "none" })
    ]
  };
}

// The model gateway's members (the agency's `docs/api.md`, 「providers, models and model files」): the DeepSeek road's
// two, both the activity person's, so the road is theirs alone, and the registered road's one, the platform's.
function gatewayMembers(): Record<string, unknown> {
  const member = (name: string, road: string, provider: string, account: number | null) => ({ name, road, label: name, provider, account });

  return {
    items: [
      member("deepseek-pro", "deepseek", "deepseek", activity.account),
      member("deepseek-flash", "deepseek", "deepseek", activity.account),
      member("model-a", "registered", "openai", null)
    ]
  };
}

function usageAccounts(): Record<string, unknown> {
  const now = Math.floor(LINE_AT / 1000);
  const window = (name: string, utilization: number, resetsIn: number) => ({ name, utilization, resetsAt: now + resetsIn, seenAt: now, durationMinutes: null, limitName: null });

  return {
    items: [
      { id: "acct-a", provider: "claude-code", session: null, week: window("seven_day", 0.97, 2 * 86_400 + 3_600) },
      { id: "acct-b", provider: "claude-code", session: window("five_hour", 0.25, 2 * 3_600), week: window("seven_day", 0.16, 6 * 86_400) },
      { id: "acct-c", provider: "claude-code", session: null, week: window("seven_day", 0.5, 86_400) }
    ],
    more: false
  };
}
const SEALED_OWNER = process.env.BROWSER_CONSOLE_SEALED_OWNER === "1";

// The activity person's run, ended an hour after it began, and its seat's session in the room they read.
function activityRun(): Record<string, unknown> {
  return { id: 9_005_001, name: "scheduled-check", agentName: ACTIVITY_AGENT, startedAt: LINE_AT - 3_600_000, endedAt: LINE_AT - 3_540_000, roomId: UNREAD_CHAT, state: "closed", outcome: "ok" };
}

function activitySession(): Record<string, unknown> {
  return { id: "session-activity", agentName: ACTIVITY_AGENT, scope: "room", roomId: UNREAD_CHAT, provider: "claude-code", model: "claude-sonnet-5", context: { carried: 12_000, window: 200_000 } };
}

function privacyOf(chat: number): { privateOf: number | null; sealed: boolean } {
  return { privateOf: chat === PRIVATE_CHAT ? PRIVATE_ACCOUNT : chat === OWN_BMO_CHAT ? ownBmoAccount : null, sealed: chat === OWNER_CHAT && SEALED_OWNER };
}

// The rooms a write to the receiver changes, and the account it names in its query, its body or the relay's
// `Owner-Key`; null where it changes no room.
async function writeOf(path: string, request: Request): Promise<{ rooms: number[]; account: number | null; ownersRoad: boolean } | null> {
  if (request.method === "GET" || request.method === "HEAD") return null;

  const url = new URL(request.url);
  const body = (request.headers.get("content-type") ?? "").includes("application/json") ? ((await request.clone().json().catch(() => null)) as Record<string, unknown> | null) : null;
  const named = [url.searchParams.get("account"), body?.account, request.headers.get("owner-key")].map((one) => Number(one ?? NaN)).find(Number.isSafeInteger) ?? null;
  const room = /^\/(?:rooms|pinned-rooms|avatars\/room)\/(-?\d+)/.exec(path)?.[1] ?? (path === "/pinned-rooms" ? body?.room : null);
  const ownersRoad = path.startsWith("/owner/");
  const rooms = [room, path.endsWith("/forwards") ? body?.to : null, ownersRoad ? body?.chatId : null].map(Number).filter(Number.isSafeInteger);

  return rooms.length === 0 ? null : { rooms, account: named, ownersRoad };
}

// The receiver's refusal of a write in another account's private room or a sealed one, or null where it stands.
async function privateRefusal(path: string, request: Request): Promise<Response | null> {
  const write = await writeOf(path, request);

  if (write === null || (write.account === null && !write.ownersRoad)) return null;

  for (const room of write.rooms) {
    const { privateOf, sealed } = privacyOf(room);
    const own = write.ownersRoad && room === OWNER_CHAT;

    if (!own && (sealed || (privateOf !== null && privateOf !== write.account))) {
      return Response.json({ code: "private-room", error: "another account's private room", room, account: write.account ?? 0 }, { status: 403 });
    }
  }

  return null;
}
// What an account said into the KakaoTalk-sized room (tests/support/high-room.ts), each with the name it is shown by
// and the message it answers, and the reaction each of the room's messages carries, kept for as long as the console
// stands. A reaction stands as the room's other person's, so a press always sets it and a run of a file again finds
// the same.
const high: { said: { id: string; name: string; text: string; replyTo: string | null }[]; reactions: Map<string, string> } = { said: [], reactions: new Map() };
// The sender the receiver's stand-in files an account's words in that room under, a number no other fixture sender
// stands under.
const HIGH_SPEAKER = 9;
// A tall picture, as a phone's screenshot stands: drawn as an SVG of that size.
const TALL = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="591" height="1280"><rect width="591" height="1280" fill="#3a6"/></svg>');
// A square picture, as a profile picture or a drawing stands, larger than a bubble may be.
const SQUARE = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#36a"/></svg>');
// The lone pictures of the media room, each square.
const SQUARE_PICTURES = [16, 17];
// The sender linked to the account the media room's file signs in with, so the picture it sent stands on the right.
const PICTURES_SENDER = 9;
// What bmo-explorer's link preview answers for the pages the media room's link messages lead to, by the path of the
// address on the receiver's stand-in (docs/web.md, the link previews rule): one page declaring its title, description,
// site and picture for sharing, and one declaring its title and description alone.
const LINK_PREVIEWS: Record<string, (origin: string) => Record<string, string | null>> = {
  "/link-page": (origin) => ({
    title: "A page worth reading", description: "What the page says of itself, in a sentence or two.", siteName: "Example Site", image: `${origin}/link-page/picture.png`
  }),
  "/link-page/plain": () => ({ title: "Plain page title", description: "The page's meta description.", siteName: null, image: null })
};
// The picture the first page names, as bmo-explorer's picture entry answers it cut to a card's square: a JPEG of that
// square.
const LINK_PICTURE = await sharp({ create: { width: 240, height: 240, channels: 3, background: "#3366aa" } }).jpeg().toBuffer();
// An animated sticker: a one-second Lottie scene of one square turning at an even pace, gzipped as Telegram keeps it.
const STICKER = Bun.gzipSync(new TextEncoder().encode(JSON.stringify({
  v: "5.5.2", fr: 30, ip: 0, op: 30, w: 512, h: 512, layers: [{
    ty: 4, ind: 1, ip: 0, op: 30, st: 0, ks: { o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0], i: { x: [1], y: [1] }, o: { x: [0], y: [0] } }, { t: 30, s: [360] }] }, p: { a: 0, k: [256, 256] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } },
    shapes: [{ ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [200, 200] }, r: { a: 0, k: 0 } }, { ty: "fl", c: { a: 0, k: [0.2, 0.6, 0.9, 1] }, o: { a: 0, k: 100 } }]
  }]
})));
// Two videos a person sent: a wide one and a tall one, each three seconds of a moving test picture as WebM, which the
// test browser plays, and the shape the chat service described each in, as a phone's recording states it.
const VIDEOS: Record<number, { name: string; bytes: Uint8Array<ArrayBuffer>; shape: { width: number; height: number } }> = {
  11: { name: "clip-wide.webm", bytes: new Uint8Array(await Bun.file(new URL("./room-video-wide.webm", import.meta.url)).arrayBuffer()), shape: { width: 1280, height: 720 } },
  12: { name: "clip-tall.webm", bytes: new Uint8Array(await Bun.file(new URL("./room-video-tall.webm", import.meta.url)).arrayBuffer()), shape: { width: 720, height: 1280 } }
};
// The sticker room's sticker files, by message, and the emoticon two of its messages keep as their picture.
const fixture = async (name: string): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await Bun.file(new URL(`./${name}`, import.meta.url)).arrayBuffer());
const STICKER_FILES: Record<number, { name: string; type: string; bytes: Uint8Array<ArrayBuffer> }> = {
  1: { name: "sticker-still.webp", type: "image/webp", bytes: await fixture("room-sticker-still.webp") },
  2: { name: "sticker-video.webm", type: "video/webm", bytes: await fixture("room-sticker.webm") },
  4: { name: "sticker-once.gif", type: "image/gif", bytes: await fixture("room-sticker-once.gif") },
  6: { name: "sticker-scene.tgs", type: "application/x-tgsticker", bytes: STICKER },
  8: { name: "sticker-once.png", type: "image/png", bytes: await fixture("room-sticker-once.png") }
};
const EMOTICON = await fixture("room-emoticon-once.webp");
// The sticker room's message whose sticker the chat service is still gathering: it stands under its mark, with no
// file yet, and its metadata names the emoji it was sent for.
const GATHERING_STICKER = 9;
const GATHERING_EMOJI = "\u{1F4AD}";
// The sender linked to the account the sticker room's file signs in with.
const STICKERS_SENDER = 10;
// The lone picture room's messages, by message: an emoticon a chat service handed over as a plain square picture with
// no words, a photo under its mark alone, a GIF under its mark with the shape the chat service said, a photo with no
// words from the account that reads the room, so it stands on the right, a photo with a caption, a photo with no words
// answering another message, and words from the reader; then lines a chat client handed over with its own label for what
// they carried as their whole words, as the record keeps them: a photo under the picture label, one under the count of
// pictures, one under the lower-case English label, a video under the video label and a file under its own name, and a
// photo whose words hold the picture label among more. Each picture is an SVG of its size, and the GIF and the video are
// a short WebM clip.
const svgPicture = (width: number, height: number, fill: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`);
const LONE_PICTURES: Record<number, { text: string; picture?: Uint8Array<ArrayBuffer>; animation?: { width: number; height: number }; filed?: { kind: "video" | "document"; name: string }; senderId?: number; replyTo?: number }> = {
  9: { text: "", picture: svgPicture(360, 360, "#e94") },
  10: { text: "[Photo]", picture: svgPicture(1280, 960, "#49e") },
  11: { text: "[GIF 0:01]", animation: { width: 800, height: 600 } },
  12: { text: "", picture: svgPicture(600, 1280, "#4a6"), senderId: STICKERS_SENDER },
  13: { text: "[Photo] a caption under the photo", picture: svgPicture(1280, 960, "#a4e") },
  14: { text: "[Photo]", picture: svgPicture(1280, 960, "#e4a"), replyTo: 10 },
  15: { text: "ok", senderId: STICKERS_SENDER },
  16: { text: LABELS.picture, picture: svgPicture(960, 1280, "#6ae") },
  17: { text: LABELS.pictures, picture: svgPicture(1280, 960, "#ea6") },
  18: { text: "photo", picture: svgPicture(1280, 960, "#a6e") },
  19: { text: LABELS.video, filed: { kind: "video", name: "1-0.webm" } },
  20: { text: "20261118_071900.mp4", filed: { kind: "document", name: "20261118_071900.mp4" } },
  21: { text: `${LABELS.picture} from the trip`, picture: svgPicture(1280, 960, "#6ea") }
};
const EMOTICON_MESSAGES = [3, 5, 7];
// The kept files that stand as file lines, by message, as the receiver lists each.
const FILE_LINES: Record<number, { kind: string; name: string; size: number; type: string; kept: boolean }> = {
  13: { kind: "document", name: "meeting-notes-and-follow-up-actions.pdf", size: 1_258_291, type: "application/pdf", kept: true },
  14: { kind: "audio", name: "memo.amr", size: 20_480, type: "audio/amr", kept: true },
  15: { kind: "document", name: "report.zip", size: 0, type: "application/zip", kept: false }
};
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
const servers: { stop: (force?: boolean) => void }[] = [];
// The stand-in bmo-mail's address, once it stands.
let mailAddress = "";
const database = `${BROWSER_CONSOLE_PREFIX}${process.pid}`;
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

// A process that ends before the harness stops leaves the console unable to answer, so the harness stops
// everything with a failure naming it, keeping the scratch folder whose logs say why.
const children = new WatchedChildren(({ name, code, signal }) => {
  console.error(`the ${name} process ended (${signal ?? `exit ${code}`}); its log is in ${join(scratch, `${name}.log`)}`);
  void stop(true, 1);
});

function start(command: string, args: string[], env: Record<string, string>, cwd: string, name: string): void {
  children.start({ command, args, env, cwd, name, log: join(scratch, `${name}.log`) });
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

// An event stream that stays open, says what stands of the present where it is given, and nothing more.
function silentStream(present = ""): Response {
  return new Response(new ReadableStream({ start: (controller) => controller.enqueue(new TextEncoder().encode(`: open\n\n${present}`)) }), {
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
// or a forced provider is refused, and a changed provider or model drops the effort, thinking, answer ceiling and
// advisor the body does not name.
async function changeSupervisor(name: string, request: Request): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const gone = ["order", "quotaShare", "active"].find((field) => field in body);

  if (gone !== undefined) return Response.json({ code: "unknown-field", field: gone, error: `The field ${gone} is not taken.` }, { status: 400 });

  const held = heldSupervisor(name);
  const roadMoved = ("provider" in body && body.provider !== held.provider) || ("model" in body && body.model !== held.model);
  const dropped = roadMoved ? { effort: null, thinking: null, answerTokens: null, advisor: null } : {};

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
    name, label, icon: null, ownerAccount: null, path: `/srv/checkouts/${name}`, nodeName: null, supportCount: "auto", umbrella: false,
    prefixDocuments: [], preamble: null, rules: null, devCommand: null, pin: null, downgradeHeal: true, sampling: null,
    samplingSettings: [
      { name: "temperature", min: 0, max: 2 }, { name: "top_p", min: 0, max: 1, aboveMin: true }, { name: "top_k", min: 0, max: null, whole: true },
      { name: "preserve_thinking", switch: true }
    ],
    checkouts: [{ name, path: `/srv/checkouts/${name}`, nodeName: null, kind: "base", job: null }], ...extra
  };
}

// The repositories the agency keeps: one a job holds a checkout of, with a support checkout and a node checkout; one
// pinned; one standing on a node; and an umbrella, which takes no support checkouts.
function heldRepositories(): Record<string, unknown>[] {
  return [
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
    repository("repo-c", "Repository C", { nodeName: "node-a" }),
    repository("repo-u", "Repository U", { supportCount: 0, umbrella: true })
  ];
}

// One provider as the agency's provider resource serves it, with its switch, its lines and its quota.
function provider(name: string, label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name, code: name, label, enabled: true, registered: false, coworker: true, gateway: false, ownersEngine: true, lines: ["chat", "worker", "search", "browse"],
    quota: { left: 0.6, window: "week", balance: null, resetsAt: null }, reason: null, reasonCode: null, foldRatioDefault: 0.85,
    takesAdvisor: false, advisorWords: [], ...extra
  };
}

const ROLES = [
  role("worker", "Worker", { running: 2, waiting: 1, agents: seats("worker", 3, ["claude-code", "claude-opus-5-5", "high"], 2) }),
  role(ASKED_RUN.role, "Seeker", { running: 1, agents: seats(ASKED_RUN.role, 2, null, 1) }),
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
// The agency's own settings, so the providers tab reads and changes the secrets its tools read and the deploy queue's
// flush minutes; a secret whose name starts with `refused-` is refused as the agency refuses a name, and minutes that
// are no positive whole number as it refuses them, each naming the field it was asked for. The flush minutes set to
// null read as the policy's own.
const POLICY_FLUSH_MINUTES = 60;
const agencySettings: Record<string, unknown> = { researchSupervisor: null, downgradeReturn: null, deepseekCardSecret: null, deepseekLoginSecret: null, deployFlushMinutes: POLICY_FLUSH_MINUTES };
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
// console control hidden by an attribute is measured against (docs/web.md, 「Screens a unit brings」). Opened with
// `?menu=on` it also draws an input menu from the console's own copy of Nuxt UI, imported by the path a unit's bundle
// imports it by (docs/web.md, 「Wording and the language pack」). The services its manifest names under `calls` are the
// ones its pages reach besides its own.
function screenUnit(name: string, path: string, calls: readonly string[] = []): Response | null {
  if (path === "/console-manifest") {
    return Response.json(manifestFields(name, { icon: "i-material-symbols-widgets", calls }));
  }

  if (path === "/console/words") return Response.json({ ko: { [name]: { title: name } }, en: { [name]: { title: name } } });

  if (path === "/console/bundle.js") {
    const source = `import { defineComponent, h, inject, onBeforeUnmount, onMounted, ref } from "vue";
import InputMenu from "@nuxt/ui/components/InputMenu.vue";

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

    const menu = new URLSearchParams(window.location.search).get("menu") === "on";

    return () => h("div", { "data-screen": ${JSON.stringify(name)}, "data-build": String(built) }, [
      h("div", { "data-screen-row": ${JSON.stringify(name)} }, [h("button", { type: "button", "data-screen-action": ${JSON.stringify(name)} }, "act " + ticks.value)]),
      h("p", ${JSON.stringify(name)} + " " + ticks.value),
      menu ? h("div", { "data-screen-menu": ${JSON.stringify(name)} }, [h(InputMenu, { items: ["choice-a", "choice-b"], "aria-label": "choice" })]) : null
    ]);
  }
});

export default { routes: [{ path: "/${name}", name: ${JSON.stringify(name)}, component: Screen, meta: { consoleTitleBar: true } }] };
`;

    return new Response(source, { headers: { "content-type": "text/javascript" } });
  }

  return null;
}

// A unit that brings a screen and is released while the console runs (docs/web.md, 「Screens a unit brings」): its
// module carries its release in its name, as a content-hashed file does, and a release serves its own module alone.
// A `POST /release` releases it once more, as a deployment would between two of the console's readings of its
// manifest.
let release = 1;

function releasedUnit(name: string, path: string, request: Request): Response | null {
  const module = `/console/bundle-${release}.js`;

  if (path === "/release" && request.method === "POST") {
    release += 1;

    return Response.json({ release });
  }

  if (path === "/console-manifest") return Response.json(manifestFields(name, { icon: "i-material-symbols-widgets", bundle: module }));
  if (path === module) return screenUnit(name, "/console/bundle.js");
  if (path === "/console/bundle.js") return null;

  return screenUnit(name, path);
}

const catalogueView = () => ({ entries: [...entries.values()], uses });
const notFound = () => Response.json({ code: "not-found", error: "not served by this stand-in" }, { status: 404 });

// A unit's own supply as the agency's stand-in keeps it, by unit (the agency's `docs/api.md`, 「accounts, rest and
// usage」): open for every unit, its items added, switched and removed as the agency keeps them.
const unitSupply = new Map<number, { id: string; road: string; secret: string; enabled: boolean; refusedAt: number | null }[]>();
let unitSupplyNext = 1;
// The user who owns the BMO the deployment's own read of the supervisors holds, once the users are made.
let ownedBmo: number | null = null;
// The repositories units own, by name, as the agency's stand-in keeps them.
const unitRepositories = new Map<string, Record<string, unknown>>();
// The people the agency's stand-in answers as able to run on their own supply alone, holding none of their own.
const ownSupplyOnly = new Set<string>();
// The people who may add a local AI of their own, their chain allowing it and a PC of theirs reached, and the local AIs
// each keeps, by the name they gave it (the agency's `docs/supply.md`, 「A person's local AI」).
const localAiOwners = new Set<string>();
const localAis = new Map<string, Record<string, unknown>[]>();
// The address a local AI standing in answers at, as a person's PC reaches it; any other the PC does not reach.
const LOCAL_AI_HOST = "localhost:11434";

// Whether an address is the local AI standing in.
function localAiAnswers(url: unknown): boolean {
  if (typeof url !== "string") return false;

  try {
    return new URL(url).host === LOCAL_AI_HOST;
  } catch {
    return false;
  }
}
// Each person's own gateway keys as the agency's stand-in keeps them, by their owner key: a person holding one holds
// supply of their own that is on.
const personalKeys = new Map<string, Record<string, unknown>[]>();
// The administrator the stand-in answers a platform with no working source: every provider but Claude Code unable to
// answer, and no Claude account (docs/web.md, 「The start guide」).
let guideAdministrator: string | null = null;
// The account service's port, which the agency's stand-in asks the chain at as the agency does.
let accountServicePort = 0;

async function organisationSupplyAnswer(path: string, request: Request): Promise<Response | null> {
  const named = /^\/organisation-supply\/(\d+)(?:\/([^/]+))?$/.exec(path);

  if (named === null) return null;

  const unit = Number(named[1]);
  const items = unitSupply.get(unit) ?? [];
  const page = () => Response.json({ unit, open: true, items });

  unitSupply.set(unit, items);

  if (named[2] === undefined && request.method === "GET") return page();
  if (named[2] === undefined && request.method === "POST") {
    const body = (await request.json()) as { road: string; secret: string };
    const item = { id: `key-${unitSupplyNext++}`, road: body.road, secret: body.secret, enabled: true, refusedAt: null };

    items.push(item);

    return Response.json(item, { status: 201 });
  }

  const at = items.findIndex((one) => one.id === decodeURIComponent(named[2] ?? ""));

  if (at < 0) return Response.json({ code: "unknown-supply", error: "no such supply" }, { status: 404 });
  if (request.method === "PATCH") {
    items[at]!.enabled = ((await request.json()) as { enabled: boolean }).enabled;

    return page();
  }
  if (request.method === "DELETE") {
    items.splice(at, 1);

    return new Response(null, { status: 204 });
  }

  return null;
}

// The sign-up composition as the agency's stand-in answers it: what stands read off the account service's chain as
// the agency reads it, and a write judged as any composition of known roles and put on the chain in the caller's name,
// naming the agency as the kind's declarer (the agency's `docs/role-agents.md`, 「The agents an account is given」).
async function compositionAnswer(path: string, request: Request): Promise<Response | null> {
  const service = `http://127.0.0.1:${accountServicePort}`;

  if (path === "/signup-composition" && request.method === "GET") {
    const unit = new URL(request.url).searchParams.get("unit");
    const resolved = (await (await fetch(`${service}/chain/kinds/signup.composition/resolve?unit=${unit}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as {
      layers: { link: string; value: { roles?: Record<string, { off?: boolean; agents?: unknown[] }> } }[];
    };
    const roles = ROLES.map((role) => {
      const said = resolved.layers.map((layer) => ({ link: layer.link, word: layer.value.roles?.[role.name as string] })).filter((one) => one.word !== undefined);
      const agents = said.filter((one) => Array.isArray(one.word!.agents)).at(-1);

      return { role: role.name, off: said.some((one) => one.word!.off === true), agents: agents?.word!.agents ?? null, from: agents?.link ?? null };
    });

    return Response.json({ subject: `unit:${unit}`, roles, own: null });
  }

  const link = /^\/signup-composition\/([^/]+)$/.exec(path)?.[1];

  if (link === undefined || request.method !== "PUT") return null;

  const body = (await request.json()) as { value: unknown };

  return await fetch(`${service}/chain/kinds/signup.composition/links/${link}/value`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TOKEN}`, "owner-key": request.headers.get("owner-key") ?? "", "declared-by": "agency", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// A person's own agents as the agency's stand-in answers them (the agency's `docs/api.md`, 「own-agents」): a worker
// seat their company supplies, on a road its composition names, and a seeker seat of the platform's own rule; the
// producer role turned off by the company; adding agents and choosing roads allowed, their own instructions withheld
// by the company, a unit the account service does not hold. Every change is kept in the stand-in for the next read.
const OWN = {
  agents: new Map<string, { role: string; road: { provider: string; model: string; effort: string | null } | null; enabled: boolean; supplied: boolean }>(),
  all: "Answer in short lines." as string | null,
  made: 0
};
const OWN_SUPPLIED: Record<string, { role: string; road: { provider: string; model: string; effort: string | null } | null; from: string | null }> = {};

function ownSeat(account: string, role: string): string {
  return `${role}-u${account}`;
}

async function ownAgentsAnswer(path: string, request: Request): Promise<Response | null> {
  const asked = /^\/own-(agents|instructions)\/(\d+)(?:\/(.*))?$/.exec(path);

  if (asked === null) return null;

  const [, kind, account, rest = ""] = asked;
  const worker = ownSeat(account!, "worker");
  const seeker = ownSeat(account!, ASKED_RUN.role);
  // A unit no account service holds, so the screen says it as an organisation it cannot name.
  const company: number | null = 999_999;

  if (OWN.agents.size === 0) {
    OWN_SUPPLIED[worker] = { role: "worker", road: { provider: "claude-code", model: "claude-opus-5-5", effort: "high" }, from: company === null ? null : `unit:${company}` };
    OWN_SUPPLIED[seeker] = { role: ASKED_RUN.role, road: null, from: null };
    for (const [name, seat] of Object.entries(OWN_SUPPLIED)) OWN.agents.set(name, { role: seat.role, road: seat.road, enabled: true, supplied: true });
  }

  const view = (name: string) => {
    const held = OWN.agents.get(name);
    const supplied = OWN_SUPPLIED[name];
    const changed = held !== undefined && supplied !== undefined && (!held.enabled || JSON.stringify(held.road) !== JSON.stringify(supplied.road));

    return {
      name,
      agent: held === undefined ? null : { name, role: held.role, ...(held.road ?? { provider: null, model: null, effort: null }), enabled: held.enabled, carries: false },
      supplied: supplied === undefined ? null : { road: supplied.road, from: supplied.from },
      changed
    };
  };

  if (kind === "agents" && request.method === "GET" && rest === "") {
    const roles = ROLES.map((role) => ({
      role: role.name,
      label: role.label,
      description: null,
      line: role.line,
      off: role.name === "producer",
      offFrom: role.name === "producer" && company !== null ? `unit:${company}` : null,
      most: 8,
      agents: [...OWN.agents.entries()].filter(([, held]) => held.role === role.name).map(([name]) => view(name))
    }));

    return Response.json({
      account: Number(account),
      add: { allowed: true, from: null },
      road: { allowed: true, from: null },
      roles,
      providers: [{ name: "claude-code", label: "Claude Code", lines: ["chat", "worker", "search"] }, { name: "deepseek", label: "DeepSeek", lines: ["chat", "worker"] }]
    });
  }

  const models = /^models\/([^/]+)$/.exec(rest);

  if (kind === "agents" && models !== null) {
    const ids = models[1] === "deepseek" ? [["deepseek-v4-pro", true], ["deepseek-flash", false]] : [["claude-opus-5-5", true], ["claude-sonnet-5", true]];

    return Response.json({ provider: models[1], models: ids.map(([id, supplied]) => ({ id, efforts: ["low", "medium", "high"], inService: true, supplied })) });
  }

  if (kind === "agents" && request.method === "POST" && rest === "") {
    const body = (await request.json()) as { role: string };

    OWN.made += 1;
    OWN.agents.set(`${body.role}-u${account}-${OWN.made + 1}`, { role: body.role, road: null, enabled: true, supplied: false });

    return Response.json({}, { status: 201 });
  }

  const one = /^([^/]+)(\/back)?$/.exec(rest);
  const name = one?.[1] === undefined ? "" : decodeURIComponent(one[1]);

  if (kind === "agents" && one !== null && one[2] !== undefined && request.method === "POST") {
    const supplied = OWN_SUPPLIED[name];

    if (supplied === undefined) return Response.json({ code: "not-supplied", error: "no seat" }, { status: 404 });
    OWN.agents.set(name, { role: supplied.role, road: supplied.road, enabled: true, supplied: true });

    return Response.json(view(name));
  }

  if (kind === "agents" && one !== null && request.method === "PATCH") {
    const held = OWN.agents.get(name);

    if (held === undefined) return Response.json({ code: "not-found", error: "no agent" }, { status: 404 });

    const body = (await request.json()) as { provider?: string | null; model?: string | null; effort?: string | null; enabled?: boolean };

    if (body.model === "deepseek-flash") return Response.json({ code: "road-not-supplied", error: "not carried", field: "model" }, { status: 409 });
    if ("provider" in body) held.road = body.provider === null || body.provider === undefined ? null : { provider: body.provider, model: body.model!, effort: body.effort ?? null };
    if (typeof body.enabled === "boolean") held.enabled = body.enabled;

    return Response.json(view(name));
  }

  if (kind === "agents" && one !== null && request.method === "DELETE") {
    if (OWN_SUPPLIED[name] !== undefined) return Response.json({ code: "supplied-agent", error: "supplied" }, { status: 409 });
    OWN.agents.delete(name);

    return new Response(null, { status: 204 });
  }

  if (kind === "instructions") {
    if (request.method === "PUT") return Response.json({ code: "instructions-withheld", error: "withheld" }, { status: 403 });

    return Response.json({
      allowed: { allowed: false, from: company === null ? null : `unit:${company}` },
      all: OWN.all,
      agents: {},
      named: [{ name: `u${account}`, label: "My BMO", kind: "supervisor", role: null }, ...[...OWN.agents.entries()].map(([agent, held]) => ({ name: agent, label: null, kind: "agent", role: held.role }))],
      organisation: company === null ? [] : [{ from: `unit:${company}`, text: "Never share a customer's files outside the company." }],
      mostCharacters: 20000
    });
  }

  return null;
}

// The storage places as bmo-artifact's stand-in answers them (its `docs/api.md`, 「Storage places」): the local place and
// a SharePoint library with the settings it takes, and a link's value judged — a SharePoint value naming its site, drive
// and a folder naming the document's number — and put on the account service's chain in the caller's name, naming
// bmo-artifact as the kind's declarer; any other value refused 400 `bad-request`.
async function storageAnswer(path: string, request: Request): Promise<Response | null> {
  if (path === "/storage-places" && request.method === "GET") {
    return Response.json({
      places: [
        { name: "local", description: "local", fields: [] },
        {
          name: "sharepoint",
          description: "sharepoint",
          fields: [
            { key: "site", shape: "text", required: true },
            { key: "drive", shape: "text", required: true },
            { key: "folder", shape: "text", required: true },
            { key: "account", shape: "number", required: false }
          ]
        }
      ]
    });
  }

  const link = /^\/storage\/([^/]+)$/.exec(path)?.[1];

  if (link === undefined || request.method !== "PUT") return null;

  const { value } = (await request.json()) as { value: Record<string, unknown> | null };
  const judged = value === null || value.place === "local" || (value.place === "sharepoint" && typeof value.site === "string" && typeof value.drive === "string" && String(value.folder ?? "").includes("{document}"));

  if (!judged) return Response.json({ code: "bad-request", error: "the storage value does not read" }, { status: 400 });

  return await fetch(`http://127.0.0.1:${accountServicePort}/chain/kinds/artifact.storage/links/${link}/value`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TOKEN}`, "owner-key": request.headers.get("owner-key") ?? "", "declared-by": "artifact", "content-type": "application/json" },
    body: JSON.stringify({ value })
  });
}

// A reader's own screen (docs/web.md, 「A reader's own screens」): the personal-screens account's one, `weekly_notes`,
// whose screen session the agency's stand-in issues for that account alone and whose list, files and calls the tool
// host's stand-in answers on its app face under that session's token (bmo-pocket's `docs/api.md`, 「Personal
// screens」). The module is addressed by the digest of its index, as a placed version's is. Its tool answers the week's
// notes, and its `pc_switch` entry turns the PC the account's screens run on off and on, so a test meets the screen
// with the PC off once it has turned it off through the screen itself.
let personalAccount: string | null = null;
let personalPc = true;
// Another account's own screen, its words in English alone, which a reader of another language reads by its reading.
let namesAccount: string | null = null;

const PERSONAL_WORDS = Object.fromEntries(
  ["ko", "en", "ja", "zh-CN"].map((locale) => [locale, { "my-weekly-notes": { title: "Weekly notes", action: { load: "Load", off: "Turn the PC off" } } }])
);

const PERSONAL_MODULE = `import { defineComponent, h, ref } from "vue";
import { useI18n } from "vue-i18n";
import UButton from "@nuxt/ui/components/Button.vue";
import { relayCall } from "bmo-ui/app/domain/relay";

const Notes = defineComponent({
  setup() {
    const { t } = useI18n();
    const said = ref("");
    const call = (entry, body) => relayCall("my-weekly-notes", "/tools/" + entry, { method: "POST", body });
    const load = async () => {
      const answered = await call("weekly_notes", { week: "47" });
      said.value = answered.result.content[0].text;
    };
    const off = async () => {
      await call("pc_switch", { on: false });
      said.value = "off";
    };

    return () => h("div", { "data-personal-screen": "my-weekly-notes", class: "flex flex-col items-start gap-3 p-4" }, [
      h(UButton, { label: t("my-weekly-notes.action.load"), "data-personal-load": "", onClick: load }),
      h(UButton, { label: t("my-weekly-notes.action.off"), "data-personal-off": "", color: "neutral", variant: "subtle", onClick: off }),
      h("p", { "data-personal-said": "" }, said.value)
    ]);
  }
});

export default { routes: [{ path: "/my/weekly-notes", name: "my-weekly-notes", component: Notes, meta: { consoleTitleBar: true } }] };
`;

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const PERSONAL_INDEX = JSON.stringify({ "module.js": sha256(PERSONAL_MODULE) });
const PERSONAL_DIGEST = sha256(PERSONAL_INDEX);

// The tool host's app face as its stand-in answers it, or null for a path it does not serve.
async function personalFace(path: string, request: Request): Promise<Response | null> {
  if (!path.startsWith("/screens")) return null;

  if (namesAccount !== null && request.headers.get("authorization") === `Bearer screen-${namesAccount}`) {
    if (path !== "/screens") return Response.json({ code: "not-found", error: "no such screen" }, { status: 404 });

    const item = {
      tool: "ticket_board",
      version: "1763900000000-c3d4e5",
      name: "my-ticket-board",
      screenPath: "/my/ticket-board",
      title: "my-ticket-board.title",
      icon: "i-material-symbols-apps",
      layer: LAYER_VERSION,
      words: { en: { "my-ticket-board": { title: "Ticket board" } } },
      digest: PERSONAL_DIGEST,
      module: `/screens/ticket_board/${PERSONAL_DIGEST}/module.js`,
      stylesheet: null
    };

    return Response.json({ items: [item], reached: true });
  }

  if (personalAccount === null || request.headers.get("authorization") !== `Bearer screen-${personalAccount}`) {
    return Response.json({ code: "unauthorized", error: "no session" }, { status: 401 });
  }

  if (path === "/screens") {
    const item = {
      tool: "weekly_notes",
      version: "1763900000000-b2c3d4",
      name: "my-weekly-notes",
      screenPath: "/my/weekly-notes",
      title: "my-weekly-notes.title",
      icon: "i-material-symbols-sticky-note-2-outline",
      layer: LAYER_VERSION,
      words: PERSONAL_WORDS,
      digest: PERSONAL_DIGEST,
      module: `/screens/weekly_notes/${PERSONAL_DIGEST}/module.js`,
      stylesheet: null
    };

    return Response.json({ items: [item], reached: personalPc });
  }

  if (path === `/screens/weekly_notes/${PERSONAL_DIGEST}/module.js`) {
    if (!personalPc) return Response.json({ code: "runner-unreached", error: "the PC does not answer" }, { status: 502 });

    return new Response(PERSONAL_MODULE, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "private, max-age=31536000, immutable" } });
  }

  if (path === "/screens/weekly_notes/calls" && request.method === "POST") {
    const asked = (await request.json()) as { name: string; input: { week?: string; on?: boolean } };
    const answer = (text: string) => Response.json({ namespace: "my", name: asked.name, result: { content: [{ type: "text", text }], isError: false }, spentMs: 1 });

    if (asked.name === "weekly_notes") return answer(`notes of week ${asked.input.week ?? "now"}`);

    if (asked.name === "pc_switch") {
      personalPc = asked.input.on === true;

      return answer(personalPc ? "on" : "off");
    }
  }

  return Response.json({ code: "not-found", error: "no such screen" }, { status: 404 });
}

// What each unit's stand-in answers, read from that unit's documented routes; anything else is the unit's own
// not-found. The tests serve the rest of what they measure through the page's routes themselves.
const UNITS: Record<string, (path: string, request: Request) => Response | null | Promise<Response | null>> = {
  AGENCY: async (path, request) => {
    // A reader's own screens' session, issued for the personal-screens and personal-names accounts alone.
    const screened = /^\/personal-apps\/([^/]+)\/screen-session$/.exec(path)?.[1];

    if (screened !== undefined && request.method === "POST") {
      return screened === personalAccount || screened === namesAccount
        ? Response.json({ token: `screen-${screened}`, expiresAt: Date.now() + 600_000 }, { status: 201 })
        : Response.json({ code: "no-runner", error: "the account has no PC its personal apps run on" }, { status: 409 });
    }

    // A long job's log, read by its run from the TODO panel (tests/support/job-log.ts).
    const jobLog = jobLogAnswer(new URL(request.url));

    if (jobLog !== null) return jobLog;

    // A role's log of several agents, one of them running a job, read from its agent's state cell (tests/support/role-log.ts).
    const roleLog = roleLogAnswer(new URL(request.url));

    if (roleLog !== null) return roleLog;

    // The seeker role's log, which its asked run in the sidebar opens at that run (tests/support/asked-run.ts).
    const askedLog = askedRunLogAnswer(new URL(request.url));

    if (askedLog !== null) return askedLog;

    const organisationSupply = await organisationSupplyAnswer(path, request);

    if (organisationSupply !== null) return organisationSupply;

    const composition = await compositionAnswer(path, request);

    if (composition !== null) return composition;

    const own = await ownAgentsAnswer(path, request);

    if (own !== null) return own;

    // A person's own keys, added, listed and taken away as the agency keeps them.
    const owner = request.headers.get("owner-key") ?? "";

    if (path === "/personal-supply" && request.method === "GET") return Response.json({ items: personalKeys.get(owner) ?? [] });
    if (path === "/personal-supply" && request.method === "POST") {
      const body = (await request.json()) as { road?: string; secret?: string };
      const held = personalKeys.get(owner) ?? [];
      const added = { id: `key-${owner}-${held.length + 1}-${Date.now()}`, road: body.road ?? "", secret: body.secret ?? "", place: held.length + 1, enabled: true, refusedAt: null, addedAt: Date.now() };

      personalKeys.set(owner, [...held, added]);

      return Response.json(added, { status: 201 });
    }
    const personalKey = /^\/personal-supply\/([^/]+)$/.exec(path)?.[1];

    if (personalKey !== undefined && request.method === "DELETE") {
      personalKeys.set(owner, (personalKeys.get(owner) ?? []).filter((one) => one.id !== decodeURIComponent(personalKey)));

      return new Response(null, { status: 204 });
    }

    if (path === "/supply-sources") {
      const only = ownSupplyOnly.has(owner);
      const own = (personalKeys.get(owner) ?? []).length + (localAis.get(owner) ?? []).length > 0;

      return Response.json({ personal: true, platform: !only, organisation: false, organisationSupply: false, personalOnly: only, ownSupply: own, localAi: localAiOwners.has(owner) });
    }

    // A source tried for the start guide: the stand-in's providers always answer; a person's local AI answers where it
    // is the one standing in, tried before it is kept or named as one they keep.
    if (path === "/supply-test" && request.method === "POST") {
      const body = (await request.json()) as { road?: string; model?: string; local?: { url?: string } };

      if (body.road === "registered" && localAiOwners.has(owner)) {
        // A registration is named by its key or by its name alone, as the agency reads either.
        const kept = (localAis.get(owner) ?? []).find((one) => one.model === body.model || one.model === `registered::${body.model ?? ""}`);
        const ok = body.local !== undefined ? localAiAnswers(body.local.url) : kept !== undefined;
        const reasonCode = ok ? null : body.local !== undefined ? "unreachable" : "no-source";

        return Response.json({ road: body.road, ok, reasonCode, reason: ok ? null : reasonCode });
      }

      return Response.json({ road: body.road ?? "", ok: true, reasonCode: null, reason: null });
    }

    // A person's own local AIs, kept, switched and taken away as the agency keeps them.
    if (path === "/personal-models" && request.method === "GET") {
      return Response.json({ allowed: localAiOwners.has(owner), items: localAis.get(owner) ?? [] });
    }

    const localAi = /^\/personal-models\/([^/]+)$/.exec(path)?.[1];

    if (localAi !== undefined) {
      const name = decodeURIComponent(localAi);
      const held = localAis.get(owner) ?? [];

      if (request.method === "PUT") {
        if (!localAiOwners.has(owner)) return Response.json({ error: "withheld", code: "personal-local-ai-withheld" }, { status: 403 });

        const body = (await request.json()) as { url?: string; modelName?: string; keyName?: string | null };
        const kept = { name, model: `registered::u${owner}-${name}`, url: body.url ?? "", modelName: body.modelName ?? "", keyName: body.keyName ?? null, contextTokens: 32768, enabled: true, addedAt: Math.floor(Date.now() / 1000) };

        localAis.set(owner, [...held.filter((one) => one.name !== name), kept]);

        return Response.json(kept, { status: held.some((one) => one.name === name) ? 200 : 201 });
      }

      if (request.method === "PATCH") {
        const body = (await request.json()) as { enabled?: boolean };
        const changed = held.map((one) => (one.name === name ? { ...one, enabled: body.enabled === true } : one));

        localAis.set(owner, changed);

        return Response.json(changed.find((one) => one.name === name) ?? {});
      }

      if (request.method === "DELETE") {
        localAis.set(owner, held.filter((one) => one.name !== name));

        return new Response(null, { status: 204 });
      }
    }

    // The account service registers its supply hook as it starts, and takes it away as it stops.
    if (path === "/hooks/supply" && (request.method === "PUT" || request.method === "DELETE")) return new Response(null, { status: 204 });

    // The two axes and the places: two supervisors, a handful of roles with runs going and waiting, and the
    // repositories.
    // The deployment's own read, carrying no owner, holds as well the BMO a fixture person owns, so their own-BMO
    // section stands; what a signed-in reader is answered holds the two supervisors alone.
    if (path === "/supervisors") {
      const owned = request.headers.get("owner-key") === null && ownedBmo !== null ? [supervisor("agent-own", "Agent Own", { ownerAccount: ownedBmo })] : [];
      const ownRoom = request.headers.get("owner-key") === null && ownBmoAccount !== null ? [supervisor(OWN_BMO, `${OWN_BMO_PERSON} Dear`, { ownerAccount: ownBmoAccount })] : [];

      return Response.json({ items: [heldSupervisor("agent-a"), heldSupervisor("agent-c"), ...owned, ...ownRoom], more: false });
    }
    if (path === "/roles") return Response.json({ roles: ROLES, bundles: [{ name: "web.read", code: "web-read", label: "Web reading" }, { name: "web.sites", code: "web-sites", label: "Site tools" }], lines: ["worker", "search", "browse", "translate"] });
    if (/^\/roles\/[^/]+\/sessions$/.test(path)) {
      return Response.json({
        items: [{ id: 2, sessionId: "session-b", path: "/srv/checkouts/repo-a", provider: "claude-code", model: "claude-opus-5-5", effort: "high", account: null, openedAt: Date.now() - 60_000, lastAnsweredAt: Date.now() - 5_000, runs: 3, context: { tokens: 42_000, share: 0.21 }, valid: true }],
        more: false
      });
    }
    // A unit's own repositories, added under it and removed as the agency keeps them (the agency's
    // `docs/repositories.md`, 「An organisation's repository」).
    if (path === "/repositories" && request.method === "POST") {
      const body = (await request.json()) as { name: string; label: string | null; path: string; ownerUnit?: number | null };

      if (body.ownerUnit === undefined || body.ownerUnit === null) return null;

      const added = repository(body.name, body.label ?? body.name, { path: body.path, ownerUnit: body.ownerUnit, label: body.label });

      unitRepositories.set(body.name, added);

      return Response.json(added, { status: 201 });
    }
    if (/^\/repositories\/[^/]+$/.test(path) && request.method === "DELETE" && unitRepositories.delete(decodeURIComponent(path.slice("/repositories/".length)))) return new Response(null, { status: 204 });
    // A repository's change is answered as the agency keeps it, nothing kept past the answer but a unit's own
    // repository's, which stands changed; an umbrella left with a support checkout or a node checkout is refused as
    // the agency refuses it.
    if (/^\/repositories\/[^/]+$/.test(path) && request.method === "PATCH") {
      const name = decodeURIComponent(path.slice("/repositories/".length));
      const held = heldRepositories().find((one) => one.name === name) ?? unitRepositories.get(name);

      if (held === undefined) return Response.json({ code: "not-found", error: `There is no repository ${name}.` }, { status: 404 });

      const changed = { ...held, ...((await request.json()) as Record<string, unknown>) };
      const nodeCheckouts = (held.checkouts as { kind: string }[]).some((one) => one.kind === "node");

      if (changed.umbrella === true && (changed.supportCount !== 0 || nodeCheckouts)) {
        return Response.json({ code: "bad-request", error: "An umbrella takes no support checkouts and no node checkouts.", field: "umbrella" }, { status: 400 });
      }

      if (unitRepositories.has(name)) unitRepositories.set(name, changed);

      return Response.json(changed);
    }
    if (path === "/repositories") return Response.json({ items: [...heldRepositories(), ...unitRepositories.values()], more: false });
    if (path === "/slots") {
      // The worker's runs, each on the agent of the role it was let in on: a job's, which opens by the job's run, and
      // one its asker named the work of. The seeker's run is one no job carries, named by what it was asked to do. The
      // worker keeps one slot more by a reservation.
      const runs = (name: string): Record<string, unknown>[] =>
        name === "worker"
          ? [
              { token: "slot-a", role: "worker", path: "/srv/checkouts/repo-a", provider: "claude-code", model: "claude-opus-5-5", source: "job", since: Date.now() - 90_000, runName: "job-7", session: null, jobId: 7, title: "Item 12", agent: "worker-01" },
              { token: "slot-b", role: "worker", path: "/srv/checkouts/repo-a-w2", provider: "claude-code", model: "claude-opus-5-5", source: "ask", since: Date.now() - 30_000, runName: "ask-b", session: null, jobId: null, title: "Look into a thing", agent: "worker-02" }
            ]
          : name === ASKED_RUN.role
            ? [
                { token: "slot-c", role: ASKED_RUN.role, path: "/srv/scratch", provider: "claude-code", model: "claude-opus-5-5", source: "ask", since: ASKED_RUN.since, runName: ASKED_RUN.run, session: null, jobId: null, title: ASKED_RUN.title, agent: ASKED_RUN.agent }
              ]
            : [];

      return Response.json({ items: ROLES.map((one) => ({ role: one.name, maxConcurrent: one.maxConcurrent, active: one.running, reserved: one.name === "worker" ? 1 : 0, waiting: one.waiting, runs: runs(String(one.name)) })) });
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
    if (path === "/providers" && guideAdministrator !== null && request.headers.get("owner-key") === guideAdministrator) {
      return Response.json({
        items: [
          provider("claude-code", "Claude Code"),
          provider("deepseek", "DeepSeek", { gateway: true, ownersEngine: false, reason: "The key is not set.", reasonCode: "deepseek-key-unset", keyFile: "deepseek.key" }),
          provider("registered", "Registered models", { registered: true, gateway: true, reason: "No registration is offered.", reasonCode: "registered-none" })
        ],
        more: false
      });
    }
    if (path === "/providers") {
      return Response.json({
        items: [
          provider("claude-code", "Claude Code", { takesAdvisor: true, advisorWords: ["fable", "opus", "sonnet"] }),
          provider("deepseek", "DeepSeek", {
            gateway: true,
            ownersEngine: false,
            quota: { left: null, window: null, balance: 12.5, currency: "USD", balanceSeenAt: Math.floor(LINE_AT / 1000) - 120, requests: { used: 12, limit: 1_000, left: 988, scope: "free-models" }, resetsAt: null }
          }),
          provider("registered", "Registered models", { registered: true, gateway: true, lines: ["chat", "worker"], quota: null })
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
    // A session's reset asked (the agency's docs/api.md, 「Sessions」): agent-a holds its one session, any other agent
    // none, refused about the field `session`; an ask naming no asker is refused (tests/browser/session-acts.test.ts).
    if (path === "/session-reset" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

      if (typeof body.by !== "string") return Response.json({ code: "bad-request", error: "a reset names who asked" }, { status: 400 });
      if (body.agent !== "agent-a") return Response.json({ error: "no session of that agent", field: "session" }, { status: 400 });

      return Response.json({ id: "agent-a", agentName: "agent-a", scope: "agent", roomId: null, provider: "claude-code", model: "claude-opus-5-5", place: null, generation: 2, holder: null, prefixChangeReason: null, options: {}, context: null, foldsItself: false, supervisor: "agent-a", role: null });
    }
    if (path === "/sessions" || path === "/runs") {
      const mine = activity.account !== 0 && new URL(request.url).searchParams.get("agentName") === ACTIVITY_AGENT;

      return Response.json({ items: mine ? [path === "/runs" ? activityRun() : activitySession()] : [], more: false });
    }
    if (path === "/jobs") return Response.json({ items: [], more: false });
    if (path === "/log-lines") return Response.json({ items: [], more: false });
    if (path === "/prompt-documents") return Response.json({ items: [], more: false });

    if (path === "/events") return silentStream();
    if (path === "/fallback" && guideAdministrator !== null && request.headers.get("owner-key") === guideAdministrator) return Response.json({ ...usageFallback(), accounts: [] });
    if (path === "/fallback") return Response.json(usageFallback());
    if (path === "/gateway-members") return Response.json(gatewayMembers());
    if (path === "/accounts") return Response.json(usageAccounts());
    if (path === "/usage") return Response.json({ groups: [] });
    if (path === "/settings" && request.method === "PATCH") {
      const body = (await request.json()) as Record<string, unknown>;

      const refused = Object.entries(body).find(([field, value]) =>
        field === "deployFlushMinutes" ? value !== null && !(Number.isSafeInteger(value) && (value as number) > 0) : typeof value === "string" && value.startsWith("refused-")
      );

      if (refused) return Response.json({ code: "bad-request", error: `${refused[0]} is refused`, field: refused[0] }, { status: 400 });

      Object.assign(agencySettings, body, body.deployFlushMinutes === null ? { deployFlushMinutes: POLICY_FLUSH_MINUTES } : {});
    }
    if (path === "/settings") return Response.json(agencySettings);

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

    // A registration's one address set, as the start guide sets a local AI's.
    const addressed = /^\/models\/([^/]+)\/addresses\/([^/]+)$/.exec(path);

    if (addressed !== null && request.method === "PUT") {
      const asked = decodeURIComponent(addressed[1]!);
      const held = models.get(asked.includes("::") ? asked.slice(asked.indexOf("::") + 2) : asked);

      return held === undefined ? notFound() : Response.json(held);
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
  RECEIVER: async (path, request) => {
    const now = Date.now();
    const refused = await privateRefusal(path, request);

    if (refused !== null) return refused;
    // One room: the owner's, with nothing said in it. Its moments are the receiver's milliseconds. Every room built
    // from it stands on the listen list, so each stands in the room list as an added room.
    const room = {
      id: OWNER_CHAT, title: null, messageCount: 0, lastMessageAt: null, pinned: false, senders: [],
      supervisors: [], ownerRoom: true, registered: true, workRoom: OWNER_CHAT, mode: null, listened: true
    };
    // Another account's private room with its own BMO, two lines said in it, which the administrator reads alone.
    const privateRoom = {
      ...room, id: PRIVATE_CHAT, title: "private-room", ownerRoom: false, workRoom: PRIVATE_CHAT, supervisors: ["agent-c"], messageCount: 2,
      lastMessageAt: LINE_AT - 300
    };
    const privateLine = [
      { id: 1, room: PRIVATE_CHAT, senderId: 8, senderName: "person-c", sentAt: LINE_AT - 600, text: "a word of my own", imagePath: null, replyToMessageId: null, answerSeconds: null, round: null, album: null, via: "record", files: [] },
      { id: 2, room: PRIVATE_CHAT, senderId: null, senderName: "Agent C", agentName: "agent-c", sentAt: LINE_AT - 300, text: "an answer to it", imagePath: null, replyToMessageId: null, answerSeconds: 2, round: null, album: null, via: "record", files: [] }
    ];

    // A second room, whose line grows while it is first read: asked for its newest message it answers the first,
    // and past that one it answers two more, so a reader meeting it for the first time is two behind. Its ids run
    // past 2^53 (UNREAD_LINE) and are written as the exact digits a receiver writes.
    const behind = { ...room, id: UNREAD_CHAT, title: "unread-room", ownerRoom: false, workRoom: UNREAD_CHAT, lastMessageAt: LINE_AT - 1_000 };
    const said = (id: string, at: number) => ({
      id: rawNumber(id), room: UNREAD_CHAT, senderId: 7, senderName: "person-b", sentAt: LINE_AT - 3_000 + at * 1_000, text: `words ${at + 1}`,
      imagePath: null, replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null, files: []
    });
    const line = UNREAD_LINE.map((id, at) => ({ id, message: said(id, at) }));
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

    // The receiver's stream stands open and says nothing but the presence it tells as it opens (the presence fixture), so
    // a tab's stream stays open and carries the console's own words between the units' silences.
    if (path === "/events") return silentStream(presence.frames);
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
      shown(40, { text: "[Photo]", imagePath: `images/${MEDIA_CHAT}/40.jpg`, deletedAt: LINE_AT - 90 }),
      shown(6, { text: "reacted to", reactions: [{ emoji: "\u{1F44D}", by: "1" }, { emoji: "\u{1F44D}", by: "7" }, { emoji: "\u{2764}\u{FE0F}", by: "8" }] }),
      shown(8, { text: inlineWords }),
      shown(9, { text: preWords }),
      shown(10, { text: quoteWords }),
      ...[11, 12].map((id) => shown(id, { text: id === 11 ? "a caption under the video" : "", files: [{ kind: "video", source: VIDEOS[id]!.name, storedPath: "kept", collectedAt: LINE_AT }] })),
      ...[13, 14, 15].map((id) => {
        const file = FILE_LINES[id]!;

        return shown(id, {
          text: id === 13 ? "the notes from the review" : "",
          files: [{ kind: file.kind, source: file.name, storedPath: file.kept ? "kept" : null, collectedAt: LINE_AT }]
        });
      }),
      // A person's link and the reader's own, each to a page the stand-in serves at its own address.
      shown(30, { text: `the page ${new URL(request.url).origin}/link-page is worth a look` }),
      shown(31, { text: `${new URL(request.url).origin}/link-page/plain`, senderId: PICTURES_SENDER, senderName: "pictures" }),
      // A link inside words long enough to widen the bubble past the card's least width.
      shown(32, {
        text: `a longer note about the page, running on well past the width a card asks for on its own, ${new URL(request.url).origin}/link-page/plain and then some words after it`
      }),
      ...SQUARE_PICTURES.map((id) => shown(id, {
        text: "a caption under the picture, long enough to wrap onto several lines in a bubble as wide as its picture", imagePath: `images/${MEDIA_CHAT}/${id}.jpg`,
        ...(id === 17 ? { senderId: PICTURES_SENDER, senderName: "pictures" } : {})
      }))
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

      if (mediaAsked[2] === "/picture") return new Response(SQUARE_PICTURES.includes(id) ? SQUARE : TALL, { headers: { "content-type": "image/svg+xml" } });
      if (mediaAsked[2] === "/metadata") return Response.json({ metadata: id === 4 ? { sticker: { emoji: "\u{1F600}" } } : VIDEOS[id] ? { attachment: VIDEOS[id].shape } : (formats[id] ?? null) });
      if (mediaAsked[2] === "/files" && mediaAsked[3] === undefined) {
        const files = id === 4
          ? [{ place: 0, kind: "sticker", name: "sticker-1.tgs", size: STICKER.byteLength, type: "application/x-tgsticker", kept: true }]
          : id === 5 ? [{ place: 0, kind: "animation", name: "video.mp4", size: 4, type: "video/mp4", kept: true }]
          : VIDEOS[id] ? [{ place: 0, kind: "video", name: VIDEOS[id].name, size: VIDEOS[id].bytes.byteLength, type: "video/webm", kept: true }]
          : FILE_LINES[id] ? [{ place: 0, ...FILE_LINES[id] }] : [];

        return Response.json({ items: files, more: false });
      }
      if (mediaAsked[2] === "/files" && VIDEOS[id]) return new Response(VIDEOS[id].bytes, { headers: { "content-type": "video/webm" } });
      if (mediaAsked[2] === "/files") return new Response(id === 4 ? STICKER : new Uint8Array(4), { headers: { "content-type": id === 4 ? "application/x-tgsticker" : "video/mp4" } });

      return Response.json(mediaLine.find((one) => one.id === id) ?? mediaLine[0]);
    }

    const stickerRoom = { ...room, id: STICKER_CHAT, title: "sticker-room", ownerRoom: false, workRoom: STICKER_CHAT, lastMessageAt: LINE_AT - 400 };
    const stickerLine = [1, 2, 3, 4, 5, 6, 7, 8, GATHERING_STICKER].map((id) => ({
      id, room: STICKER_CHAT, sentAt: LINE_AT - 3_000 + id, kind: id === GATHERING_STICKER ? null : "sticker",
      ...(id === 7 ? { senderId: STICKERS_SENDER, senderName: "stickers" } : { senderId: 7, senderName: "person-b" }),
      text: id === 5 ? "words sent with the emoticon" : id === 7 ? "ok" : id === GATHERING_STICKER ? `[Sticker ${GATHERING_EMOJI}]` : "", imagePath: EMOTICON_MESSAGES.includes(id) ? `images/${STICKER_CHAT}/${id}.webp` : null,
      replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null,
      files: STICKER_FILES[id] ? [{ kind: "sticker", source: STICKER_FILES[id].name, storedPath: "kept", collectedAt: LINE_AT }] : []
    }));

    if (path === `/rooms/${STICKER_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? stickerLine : stickerLine.filter((one) => one.id > Number(after)), more: false });
    }

    const stickerAsked = new RegExp(`^/rooms/${STICKER_CHAT}/messages/(\\d+)(/[a-z]+)?(/\\d+)?$`).exec(path);

    if (stickerAsked !== null) {
      const id = Number(stickerAsked[1]);
      const file = STICKER_FILES[id];

      if (stickerAsked[2] === "/picture") return new Response(EMOTICON, { headers: { "content-type": "image/webp" } });
      if (stickerAsked[2] === "/metadata") {
        return Response.json({ metadata: id === GATHERING_STICKER ? { text: "", entities: [], sticker: { emoji: GATHERING_EMOJI, is_animated: true, is_video: false } } : null });
      }
      if (stickerAsked[2] === "/files" && stickerAsked[3] === undefined) {
        return Response.json({ items: file ? [{ place: 0, kind: "sticker", name: file.name, size: file.bytes.byteLength, type: file.type, kept: true }] : [], more: false });
      }
      if (stickerAsked[2] === "/files" && file) return new Response(file.bytes, { headers: { "content-type": file.type } });

      return Response.json(stickerLine.find((one) => one.id === id) ?? stickerLine[0]);
    }

    const loneRoom = { ...room, id: LONE_CHAT, title: "pictures-room", ownerRoom: false, workRoom: LONE_CHAT, lastMessageAt: LINE_AT - 300 };
    const loneLine = Object.entries(LONE_PICTURES).map(([key, lone]) => {
      const id = Number(key);

      return {
        id, room: LONE_CHAT, sentAt: LINE_AT - 2_000 + id, kind: null,
        ...(lone.senderId === undefined ? { senderId: 7, senderName: "person-b" } : { senderId: lone.senderId, senderName: "stickers" }),
        text: lone.text, imagePath: lone.picture === undefined ? null : `images/${LONE_CHAT}/${id}.svg`,
        replyToMessageId: lone.replyTo ?? null, answerSeconds: null, round: null, album: null, via: null,
        files: lone.filed !== undefined
          ? [{ kind: lone.filed.kind, source: lone.filed.name, storedPath: "kept", collectedAt: LINE_AT }]
          : lone.animation === undefined ? [] : [{ kind: "animation", source: "gif.mp4", storedPath: "kept", collectedAt: LINE_AT }]
      };
    });

    if (path === `/rooms/${LONE_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? loneLine : loneLine.filter((one) => one.id > Number(after)), more: false });
    }

    const loneAsked = new RegExp(`^/rooms/${LONE_CHAT}/messages/(\\d+)(/[a-z]+)?(/\\d+)?$`).exec(path);

    if (loneAsked !== null) {
      const id = Number(loneAsked[1]);
      const lone = LONE_PICTURES[id];

      if (loneAsked[2] === "/picture" && lone?.picture !== undefined) return new Response(lone.picture, { headers: { "content-type": "image/svg+xml" } });
      if (loneAsked[2] === "/picture") return Response.json({ code: "not-found", error: "no picture is kept" }, { status: 404 });
      if (loneAsked[2] === "/metadata") {
        const shape = lone?.filed?.kind === "video" ? VIDEOS[11]!.shape : lone?.animation;

        return Response.json({ metadata: shape === undefined ? null : { attachment: shape } });
      }
      if (loneAsked[2] === "/files" && loneAsked[3] === undefined) {
        if (lone?.filed !== undefined) {
          const type = lone.filed.kind === "video" ? "video/webm" : "video/mp4";

          return Response.json({ items: [{ place: 0, kind: lone.filed.kind, name: lone.filed.name, size: VIDEOS[11]!.bytes.byteLength, type, kept: true }], more: false });
        }

        return Response.json({ items: lone?.animation === undefined ? [] : [{ place: 0, kind: "animation", name: "gif.mp4", size: VIDEOS[11]!.bytes.byteLength, type: "video/webm", kept: true }], more: false });
      }
      if (loneAsked[2] === "/files") return new Response(VIDEOS[11]!.bytes, { headers: { "content-type": "video/webm" } });

      return Response.json(loneLine.find((one) => one.id === id) ?? loneLine[0]);
    }

    const listed = { ...room, id: NUMBERED_CHAT, title: "numbered-room", ownerRoom: false, listened: false, workRoom: NUMBERED_CHAT, lastMessageAt: LINE_AT - 100, messageCount: 1, senders: [1], mode: numbered.mode };

    // The one chat service rooms are added from, listing its account's rooms and the contacts of the account a listing
    // names, taking the record-only mode and reading a room's past back; and a second that does none of it, which the
    // rooms read back to their oldest line are on. The room's record stands first, as the receiver lists it, under its
    // own English label, which the console never shows.
    if (path === "/providers") {
      return Response.json({
        items: [
          { key: "record", label: "the room's record", can: ["text", "photo", "document"], listsRooms: false, listsContacts: false, startsChats: false, startsGroups: false, roomModes: [] },
          { key: "chat-a", label: "Chat A", can: ["text", "history"], listsRooms: true, listsContacts: true, startsChats: false, startsGroups: false, roomModes: ["record-only"] },
          { key: "chat-b", label: "Chat B", can: ["text"], listsRooms: false, listsContacts: false, startsChats: false, startsGroups: false, roomModes: [], fileBytes: CHAT_B_FILE_BYTES }
        ],
        more: false
      });
    }
    if (path === "/providers/chat-a/rooms") {
      return Response.json({ items: [{ id: NUMBERED_CHAT, title: "numbered-room", kind: "group", privateTo: null, held: true, mode: numbered.mode }], more: false });
    }
    // Its one contact is named by the account the listing was asked for, so a screen shows whose contacts it read.
    if (path === "/providers/chat-a/contacts") {
      const account = new URL(request.url).searchParams.get("accountId");

      return Response.json({ items: [{ id: 61, name: account === null ? "contact-of-service" : `contact-of-account-${account}`, kind: "person", roomId: null, held: false, mode: null }], more: false });
    }
    if (path === "/rooms" && request.method === "POST") {
      const body = (await request.json()) as { roomId?: number; mode?: string };

      if (body.roomId !== NUMBERED_CHAT) return Response.json({ code: "room-unknown", error: "the service does not hold the room" }, { status: 409 });
      if (numbered.mode !== null) return Response.json({ code: "room-added", error: "the room is added" }, { status: 409 });
      numbered.mode = body.mode ?? "record-only";

      return Response.json({ ...listed, mode: numbered.mode }, { status: 201 });
    }
    if (path === `/rooms/${NUMBERED_CHAT}` && request.method === "DELETE") {
      numbered.mode = null;

      return Response.json({ goes: [], stays: [], pictures: [], settings: [], folders: [], warned: [], units: [], taken: [], cleared: [], holders: [], couldNot: [] });
    }
    // Every room the receiver reads carries whose private room it is.
    const ownBmoRoom = { ...room, id: OWN_BMO_CHAT, title: OWN_BMO_PERSON, ownerRoom: false, workRoom: OWN_BMO_CHAT, supervisors: [OWN_BMO], lastMessageAt: LINE_AT - 400 };
    const every = [room, listed, behind, recorded, media, stickerRoom, loneRoom, { ...room, id: HIGH_ROOM, title: "high-room", ownerRoom: false, workRoom: HIGH_ROOM, lastMessageAt: LINE_AT - 200 }, privateRoom, inviteRoomListed(room), ownBmoRoom]
      .map((one) => ({ ...one, ...privacyOf(one.id) }));

    if (path === "/rooms") return Response.json({ items: every, more: false });
    // The rooms each account reads by its console memberships: the private room for its account alone, none for any
    // other, so the fixture administrators read the rooms on the listen list as the deployment's (docs/web.md,
    // 「Access」).
    const member = /^\/accounts\/(\d+)\/rooms$/.exec(path);

    if (member !== null) {
      const account = Number(member[1]);

      return Response.json({ rooms: [...(account === PRIVATE_ACCOUNT ? [PRIVATE_CHAT] : account === ownBmoAccount ? [OWN_BMO_CHAT] : account === activity.account ? [UNREAD_CHAT] : []), ...inviteRoomsOf(account)] });
    }
    if (path === `/rooms/${PRIVATE_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? privateLine : privateLine.filter((one) => one.id > Number(after)), more: false });
    }
    if (path === `/rooms/${RECORD_CHAT}/messages`) {
      const after = new URL(request.url).searchParams.get("after");

      return Response.json({ items: after === null ? record : record.filter((one) => one.id > Number(after)), more: false });
    }
    // The record room is on the record alone, which declares no limit on a file, so it takes a file of any size.
    if (path === `/rooms/${RECORD_CHAT}/providers`) return Response.json({ providers: ["record"], chosen: true, fileLimit: null });
    // Files said there, kept as the receiver keeps them: each named for the bytes it should carry (`<n>.bin`), and
    // answered sent where that many came, or not sent with how many did, so the screen says a file cut on its way.
    if ((path === `/rooms/${RECORD_CHAT}/word-files` || path === "/owner/message-files") && request.method === "POST") {
      const form = await request.formData();
      const files = form.getAll("file").filter((one): one is File => one instanceof File);
      const sent = files.filter((one) => one.size === Number(one.name.split(".")[0]));
      const cut = files.filter((one) => !sent.includes(one));

      return Response.json({
        sent: sent.map((one, index) => ({ name: one.name, id: 70_000 + index })),
        checking: [],
        failed: cut.map((one) => ({ name: one.name, reason: { kind: "refused", reason: `${one.size} bytes came` } }))
      });
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
    // A supervisor's one session handed over (the receiver's docs/api.md, 「Handovers」): answered only where the ask
    // carries a reason, the asking account and the room it was asked from as the console hands them on, so a notice
    // saying it was asked shows the ask arrived whole (tests/browser/session-acts.test.ts).
    const handover = /^\/handovers\/([^/]+)$/.exec(path)?.[1];

    if (handover !== undefined && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

      if (handover !== "agent-a") return Response.json({ code: "not-found", error: "no such agent" }, { status: 404 });
      if (typeof body.reason !== "string" || body.reason.trim() === "" || typeof body.by !== "number" || (body.room !== undefined && typeof body.room !== "number")) {
        return Response.json({ code: "bad-request", error: "a handover carries a reason, by and a room" }, { status: 400 });
      }

      return Response.json({ agentName: handover, sessionReason: "asked" }, { status: 202 });
    }
    if (path === `/rooms/${RECORD_CHAT}/answerers`) return Response.json({ default: "agent-a", items: [{ agentName: "agent-a", defaultAnswerer: true }], more: false, voice: "agent-a" });
    if (path === `/rooms/${OWNER_CHAT}/own-number`) return Response.json({ number: new URL(request.url).searchParams.get("agentName") === "agent-a" ? AGENT_FACE : null });
    if (path === "/avatars") return Response.json({ items: [{ kind: "person", id: AGENT_FACE, takenAt: LINE_AT }], more: false });
    if (path === `/people/${AGENT_FACE}/avatar`) return new Response(PIXEL, { headers: { "content-type": "image/png" } });
    if (path === `/rooms/${UNREAD_CHAT}/messages`) {
      const query = new URL(request.url).searchParams;
      const after = query.get("after");
      const before = query.get("before");
      // The newest message, asked for alone, is the first while the line is still growing; the room's own reads
      // walk the whole line by the exact ids.
      const items = after !== null
        ? line.filter((one) => BigInt(one.id) > BigInt(after))
        : before !== null
          ? line.filter((one) => BigInt(one.id) < BigInt(before))
          : query.get("limit") === "1" ? line.slice(0, 1) : line;

      return Response.json({ items: items.map((one) => one.message), more: false });
    }

    const message = new RegExp(`^/rooms/${UNREAD_CHAT}/messages/(-?\\d+)$`).exec(path);

    if (message !== null) {
      const found = line.find((one) => one.id === message[1]);

      return found === undefined ? Response.json({ code: "not-found", error: "no such message" }, { status: 404 }) : Response.json(found.message);
    }

    // The KakaoTalk-sized room: a line longer than a page, numbered past 2^53, every id written as its exact digits,
    // read page by page past and before a message, a message at a time, its pictures walked by the picture viewer, a
    // reaction kept on the message it names and the owner's words kept with the message they answer. A cursor or an
    // id that names no message of the line is refused, as the receiver refuses one.
    const highLine = () => {
      const kept = (id: string, at: number, over: Record<string, unknown>) => ({
        id: rawNumber(id), room: HIGH_ROOM, senderId: 7, senderName: "person-b", sentAt: LINE_AT - 60_000 + at * 1_000, text: highWords(at),
        imagePath: null, replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null, files: [],
        reactions: high.reactions.has(id) ? [{ emoji: high.reactions.get(id), by: "7" }] : [], ...over
      });
      const pictured = (at: number) => ({ imagePath: `images/${HIGH_ROOM}/${at}.jpg`, text: "" });

      return [
        ...HIGH_LINE.map((id, at) => ({
          id,
          message: kept(id, at, {
            ...(HIGH_ALBUM.includes(at) ? { ...pictured(at), album: rawNumber(HIGH_LINE[HIGH_ALBUM[0]!]!) } : {}),
            ...(at === HIGH_PICTURE ? pictured(at) : {}),
            ...(at === HIGH_FILE ? { files: [{ kind: "document", source: HIGH_FILE_NAME, storedPath: "kept", collectedAt: LINE_AT }] } : {}),
            ...(at === HIGH_LINE.length - 1 ? { replyToMessageId: rawNumber(HIGH_LINE[HIGH_ANSWERED]!) } : {})
          })
        })),
        ...high.said.map((one, nth) => ({
          id: one.id,
          message: kept(one.id, HIGH_LINE.length + nth, { senderId: HIGH_SPEAKER, senderName: one.name, text: one.text, replyToMessageId: one.replyTo === null ? null : rawNumber(one.replyTo) })
        }))
      ];
    };
    const unknownMessage = () => Response.json({ code: "not-found", error: "no such message" }, { status: 404 });

    if (path === `/rooms/${HIGH_ROOM}/messages` || path === `/rooms/${HIGH_ROOM}/pictures`) {
      const query = new URL(request.url).searchParams;
      const limit = Number(query.get("limit") ?? 30);
      const pictures = path.endsWith("/pictures");
      const rows = pictures ? highLine().filter((one) => one.message.imagePath !== null) : highLine();
      const place = (id: string) => rows.findIndex((one) => one.id === id);
      const [at, after, before] = [query.get("at"), query.get("after"), query.get("before")];
      const named = at ?? after ?? before;

      if (named !== null && place(named) === -1) return unknownMessage();

      const [from, to] = at !== null
        ? [place(at), place(at) + 1]
        : after !== null
          ? [place(after) + 1, Math.min(rows.length, place(after) + 1 + limit)]
          : before !== null
            ? [Math.max(0, place(before) - limit), place(before)]
            : [Math.max(0, rows.length - limit), rows.length];
      const more = after !== null ? to < rows.length : at === null && from > 0;
      const items = rows.slice(from, to).map((one) => one.message);

      if (!pictures) return Response.json({ items, more });

      return Response.json({
        items: items.map((one) => ({
          id: one.id, album: one.album, senderName: one.senderName, sentAt: one.sentAt, text: one.text,
          file: { bytes: TALL.byteLength, name: `${one.imagePath}`, type: "image/svg+xml" }
        })),
        more,
        before: from,
        total: rows.length
      });
    }

    const highAsked = new RegExp(`^/rooms/${HIGH_ROOM}/messages/(-?\\d+)(/[a-z0-9/]+)?$`).exec(path);

    if (highAsked !== null) {
      const id = highAsked[1]!;
      const found = highLine().find((one) => one.id === id);

      if (found === undefined) return unknownMessage();

      switch (highAsked[2] ?? "") {
        case "/picture":
          return new Response(TALL, { headers: { "content-type": "image/svg+xml" } });
        case "/files":
          return Response.json({ items: id === HIGH_LINE[HIGH_FILE] ? [{ place: 0, kind: "document", name: HIGH_FILE_NAME, size: HIGH_FILE_WORDS.length, type: "text/plain", kept: true }] : [], more: false });
        case "/files/0":
          return id === HIGH_LINE[HIGH_FILE] ? new Response(HIGH_FILE_WORDS, { headers: { "content-type": "text/plain" } }) : unknownMessage();
        case "/metadata":
          return Response.json({ metadata: null });
        case "/sender-is-owner":
          return Response.json({ owner: false });
        case "/reactions/mine":
          if (request.method === "PUT") high.reactions.set(id, ((await request.json()) as { emoji: string }).emoji);
          else high.reactions.delete(id);

          return Response.json(highLine().find((one) => one.id === id)!.message);
        default:
          return Response.json(found.message);
      }
    }
    // Words an account says in that room, the owner's account among them, which the receiver files under the
    // account's own sender with the name it is shown by.
    if (path === `/rooms/${HIGH_ROOM}/words` && request.method === "POST") {
      // The message a reply answers is read from the digits the console wrote, as the receiver reads a 64-bit id.
      const body = JSON.parse(await request.clone().text(), (key: string, value: unknown, context?: { source?: string }) =>
        key === "replyTo" && typeof value === "number" ? context?.source : value
      ) as { name?: string; text?: string; replyTo?: string | null };

      if (body.replyTo != null && !highLine().some((one) => one.id === body.replyTo)) {
        return Response.json({ code: "reply-missing", error: "the archive holds no such message" }, { status: 409 });
      }

      const id = highSent(high.said.length);

      high.said.push({ id, name: body.name ?? "", text: body.text ?? "", replyTo: body.replyTo ?? null });

      return Response.json({ id: rawNumber(id) });
    }
    // The names people last went by: the media room's reactor with no words in its line goes by one.
    if (path === "/people") {
      const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",");

      return Response.json({ items: ids.filter((id) => id === "8").map((id) => ({ id: Number(id), name: "person-c" })), more: false });
    }

    const invited = await inviteRoom(path, request);

    if (invited !== null) return invited;

    const paged = pagedRoom(path, new URL(request.url).searchParams) ?? systemRoom(path, LINE_AT);

    if (paged !== null) return paged;

    const at = /^\/rooms\/(-?\d+)(\/[^/]+(?:\/[^/]+)?)?$/.exec(path);

    if (at === null) return null;

    switch (at[2] ?? "") {
      case "": {
        const chat = Number(at[1]);

        return request.method === "GET" ? Response.json(every.find((one) => one.id === chat) ?? { ...room, id: chat, ownerRoom: false, ...privacyOf(chat) }) : null;
      }
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
  // The brain again, for organisations' memories (tests/support/org-brain.ts).
  ORG_BRAIN: (path, request) => orgBrainAnswer(path, request),
  // The node service, its machines as a running one answers them (tests/support/node-machines.ts), stamped now: the
  // monitor's own reads are served from them, so a file driving the monitor through the console's server reads what
  // the service sends. It lists no node, so the monitor's tiles are the machines its answer names.
  NODE: (path, request) => {
    if (path === "/nodes") return Response.json({ items: [], more: false });
    if (path === "/machines") return Response.json(capturedMachines());

    const readings = /^\/machines\/([^/]+)\/readings$/.exec(path);

    if (readings !== null) {
      return Response.json(capturedReadings(decodeURIComponent(readings[1]!), Number(new URL(request.url).searchParams.get("after"))));
    }

    const one = /^\/machines\/([^/]+)$/.exec(path);
    const machine = one === null ? undefined : capturedMachines().items.find((item) => item.name === decodeURIComponent(one[1]!));

    return machine === undefined ? null : Response.json(machine);
  },
  // The first screen names the console's own members service under `calls`, and the second names nothing; the third
  // is released while the console runs.
  SCREEN_A: (path) => screenUnit(HARNESS_SCREEN_UNITS[0], path, ["people"]),
  SCREEN_B: (path) => screenUnit(HARNESS_SCREEN_UNITS[1], path),
  SCREEN_RELEASED: (path, request) => releasedUnit(HARNESS_SCREEN_UNITS[2], path, request),
  ARTIFACT: (path, request) => storageAnswer(decodeURIComponent(path), request),
  // bmo-mail, for the organisation screen's mail servers (tests/support/mail-servers.ts).
  MAIL: (path, request) => mailServersAnswer(path, request, `http://127.0.0.1:${accountServicePort}`, TOKEN),
  TELEGRAM: () => null,
  CACHE_SIREN: () => null,
  CACHE_WARMER: (path) => path === "/round" ? Response.json({ stopped: false }) : null
};

// The two rooms read back to their oldest line, as the receiver answers them: a page of `limit` lines ending just
// before `before`, or past `after`, by the place the cursor stands in the line; the room's chat service; and the verbs
// its road there performs. Null for any other road.
function pagedRoom(path: string, query: URLSearchParams): Response | null {
  const room = new RegExp(`^/rooms/(${PAST_CHAT}|${PAGED_CHAT})(/.*)?$`).exec(path);

  if (room === null) return null;

  const chat = Number(room[1]);
  const line = chat === PAST_CHAT ? PAST_LINE : PAGED_LINE;
  const message = (id: string) => ({
    id: rawNumber(id), room: chat, senderId: 7, senderName: "person-b", sentAt: LINE_AT - 600_000 + line.indexOf(id) * 1_000,
    text: `line ${line.indexOf(id) + 1}`, imagePath: null, replyToMessageId: null, answerSeconds: null, round: null, album: null, via: null, files: []
  });

  switch (room[2] ?? "") {
    case "/messages": {
      const limit = Number(query.get("limit") ?? "30");
      const after = query.get("after");

      if (after !== null) {
        const from = line.indexOf(after);
        const items = from === -1 ? [] : line.slice(from + 1, from + 1 + limit);

        return Response.json({ items: items.map(message), more: from !== -1 && from + 1 + limit < line.length });
      }

      const before = query.get("before");
      const end = before === null ? line.length : line.indexOf(before);
      const start = Math.max(0, end - limit);

      return Response.json(end === -1 ? { items: [], more: false } : { items: line.slice(start, end).map(message), more: start > 0 });
    }
    case "/providers":
      // The second chat service declares the largest file it takes, so both rooms take a file up to its limit.
      return Response.json({ providers: chat === PAST_CHAT ? ["chat-b", "chat-a"] : ["chat-b"], chosen: false, fileLimit: { provider: "chat-b", bytes: CHAT_B_FILE_BYTES } });
    case "/title":
      return Response.json({ title: chat === PAST_CHAT ? "past-room" : "paged-room" });
    default: {
      const one = /^\/messages\/(-?\d+)$/.exec(room[2] ?? "");

      if (one !== null && line.includes(one[1]!)) return Response.json(message(one[1]!));

      return null;
    }
  }
}

let stopping = false;

// Stops everything it started; the scratch folder goes with it unless a failure named the logs kept there. It ends
// with `code`, or with a failure where the database cannot be dropped.
async function stop(keepScratch = false, code = 0): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;

  for (const server of servers) server.stop(true);
  await children.stop();

  try {
    await dropScratchDatabase(database);
  } catch (error) {
    console.error(`the scratch database ${database} is left: ${error}`);
    process.exit(1);
  }

  if (!keepScratch) rmSync(scratch, { recursive: true, force: true });
  process.exit(code);
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
        const answered = removalAnswer(unit, path, request) ?? (await answer(path, request));

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

  // The tool host's control socket, answering bmo-explorer's link preview and card picture for the console's tool
  // session, whose token stands in a file beside it (docs/boundary.md, 「The web beyond the units」).
  const toolSocket = join(scratch, "mcp-host.sock");
  const toolToken = join(scratch, "web-console.token");

  writeFileSync(toolToken, `${TOKEN}\n`);
  servers.push(Bun.serve({
    unix: toolSocket,
    fetch: async (request) => {
      const faced = await personalFace(new URL(request.url).pathname, request);

      if (faced !== null) return faced;

      if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) return Response.json({ code: "unauthorized", error: "no session" }, { status: 401 });

      const call = (await request.json()) as { namespace: string; name: string; input: { address: string } };
      const address = new URL(call.input.address);
      const answer = (result: Record<string, unknown>) => Response.json({ namespace: call.namespace, name: call.name, result, spentMs: 1 });
      const failed = answer({ content: [{ type: "text", text: "upstream-failed" }], isError: true });

      if (call.name === "link_preview") {
        const preview = LINK_PREVIEWS[address.pathname];

        return preview === undefined ? failed : answer({ content: [], structuredContent: { url: address.href, ...preview(address.origin) } });
      }

      if (call.name === "fetch_raster" && address.pathname === "/link-page/picture.png") {
        return answer({ content: [{ type: "image", data: LINK_PICTURE.toString("base64"), mimeType: "image/jpeg" }] });
      }

      return failed;
    }
  }));

  // A stand-in for bmo-mail, the road the platform's own mail goes through (docs/accounts.md, 「The platform's own
  // mail」): one outgoing server kept for the platform, and every system mail handed to it kept, read back at
  // `GET /sent` by the files that follow a mail's link.
  const sentMails: Record<string, unknown>[] = [];
  const mail = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;

      if (path === "/sent") return Response.json({ mails: sentMails });
      if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) return Response.json({ code: "unauthorized", error: "no token" }, { status: 401 });
      if (path === "/outgoing-servers") return Response.json({ items: [{ id: "relay-a", name: "Relay A", host: "relay.example.test" }], more: false });

      if (path === "/system-mails" && request.method === "POST") {
        sentMails.push((await request.json()) as Record<string, unknown>);

        return Response.json({ sent: true });
      }

      return Response.json({ code: "not-found", error: "no such route" }, { status: 404 });
    }
  });

  servers.push(mail);
  mailAddress = `http://127.0.0.1:${mail.port}`;

  await sweepScratchDatabases(BROWSER_CONSOLE_PREFIX);

  const admin = new SQL(connectionOf(addressOf("postgres")) as SQL.Options);

  await admin.unsafe(`CREATE DATABASE "${database}"`);
  await admin.close();

  const serverPort = freePort();

  accountServicePort = serverPort;
  const serverEnv = {
    BMO_WEB_SERVER_DATABASE__URL: databaseUrl,
    BMO_WEB_SERVER_SERVER__TOKEN: TOKEN,
    BMO_WEB_SERVER_SERVER__LISTEN: `127.0.0.1:${serverPort}`,
    BMO_WEB_SERVER_NAMES__CHAT_AGENT: "agent-a",
    // The agency stand-in, so a fixed line naming a supervisor names it by the label the agency gives it.
    BMO_WEB_SERVER_AGENCY__BASE: units.AGENCY_ADDRESS!,
    BMO_WEB_SERVER_AGENCY__TOKEN: TOKEN,
    // The receiver stand-in, whose rooms' leaders and members the entry check reads.
    BMO_WEB_SERVER_RECEIVER__BASE: units.RECEIVER_ADDRESS!,
    BMO_WEB_SERVER_RECEIVER__TOKEN: TOKEN,
    // The secret store writes into the scratch folder, standing in for the data root's env/.
    BMO_WEB_SERVER_SECRETS__DIR: join(scratch, "env"),
    BMO_WEB_SERVER_MAIL__BASE: mailAddress,
    BMO_WEB_SERVER_MAIL__TOKEN: TOKEN
  };

  await run(binary, ["migrate"], serverEnv, SERVER_DIR);
  start(binary, ["serve"], serverEnv, SERVER_DIR, "server");
  await answering("the account service", `http://127.0.0.1:${serverPort}/health`, 30);

  const consolePort = freePort();
  const consoleEnv = {
    ...units,
    // The public address a mailed link is written under, the console's own.
    NUXT_PUBLIC_CONSOLE_ADDRESS: `http://127.0.0.1:${consolePort}${BASE.replace(/\/$/, "")}`,
    NUXT_SESSION_PASSWORD: "browser-console-session-password-0123456789",
    WEB_DATABASE_URL: databaseUrl,
    WEB_SERVER_ADDRESS: `http://127.0.0.1:${serverPort}`,
    WEB_SERVER_TOKEN: TOKEN,
    WEB_DATA_DIR: join(scratch, "data"),
    // The features file stands nowhere until a test writes it, so every feature stands for the other tests
    // (docs/web.md, 「The console's features」).
    WEB_FEATURES_FILE: join(scratch, "console-features.toml"),
    NUXT_PUBLIC_CHAT_AGENT_NAME: "agent-a",
    NUXT_PUBLIC_CHAT_AGENT_LABEL: "Agent A",
    BMO_MCP_HOST_SOCKET: toolSocket,
    POCKET_SESSION_TOKEN_FILE: toolToken,
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
    body: JSON.stringify({ ownerSenders: [1] })
  });

  if (!move.ok) throw new Error(`the data move was refused: ${move.status} ${await move.text()}`);

  for (const [name, password] of ACCOUNTS) {
    await run("bun", ["scripts/user.ts", "set", name, password, "--administrator"], userEnv, CONSOLE_DIR);
  }

  for (const { name, password } of MEMBERS) {
    await run("bun", ["scripts/user.ts", "set", name, password], userEnv, CONSOLE_DIR);
  }

  start("bun", ["--bun", "nuxi", "dev", "--port", String(consolePort), "--host", "127.0.0.1"], consoleEnv, CONSOLE_DIR, "console");

  const origin = `http://127.0.0.1:${consolePort}${BASE.replace(/\/$/, "")}`;

  await answering("the console", `${origin}/login`, 240);

  // Each member's sections written whole as the administrator's screen writes them, so a test's login reads a
  // rooms section that writes or one that only reads.
  const administrator = await signIn(ACCOUNTS[0]![0], ACCOUNTS[0]![1], origin);
  const listed = await fetch(`${origin}/api/users`, { headers: { cookie: administrator } });

  if (!listed.ok) throw new Error(`the users list was refused: ${listed.status}`);

  const users = (await listed.json()) as { user: string; name: string }[];

  personalAccount = users.find((user) => user.name === "personal-screens")?.user ?? null;
  namesAccount = users.find((user) => user.name === "personal-names")?.user ?? null;

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

  // The invite room made once its people's accounts stand.
  inviteRoomMade(users, LINE_AT);

  // The activity person's seat filed under their account.
  const activityPerson = users.find((user) => user.name === ACTIVITY_PERSON);

  if (activityPerson === undefined) throw new Error(`${ACTIVITY_PERSON} stands in no users list`);

  activity.account = Number(activityPerson.user);

  const seat = ROLES.flatMap((one) => (one.agents as Record<string, unknown>[] | undefined) ?? []).find((agent) => agent.name === ACTIVITY_AGENT);

  if (seat === undefined) throw new Error(`${ACTIVITY_AGENT} stands in no role`);

  seat.ownerAccount = activity.account;

  // The presence fixture: one of its people moved into a company of their own, one who turned their presence off, and
  // the receiver's stand-in telling all three online in a room no fixture account shares.
  const service = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`http://127.0.0.1:${serverPort}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "owner-key": users.find((user) => user.name === ACCOUNTS[0]![0])!.user,
        "owner-role": "administrator",
        "content-type": "application/json"
      }
    });
  const presenceIds = PRESENCE_PEOPLE.map((name) => {
    const one = users.find((user) => user.name === name);

    if (one === undefined) throw new Error(`${name} stands in no users list`);

    return Number(one.user);
  });
  // The person with a BMO of their own: allowed to personalise it, and naming it themselves, as their own-BMO section
  // saves it.
  const ownBmoPerson = users.find((user) => user.name === OWN_BMO_PERSON);

  if (ownBmoPerson === undefined) throw new Error(`${OWN_BMO_PERSON} stands in no users list`);

  const allowed = await service(`/users/${ownBmoPerson.user}/agent-permission`, { method: "PUT", body: JSON.stringify({ setting: "allow" }) });

  if (!allowed.ok) throw new Error(`the BMO setting permission was refused: ${allowed.status} ${await allowed.text()}`);

  const named = await fetch(`http://127.0.0.1:${serverPort}/users/${ownBmoPerson.user}/agent`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TOKEN}`, "owner-key": ownBmoPerson.user, "owner-role": "member", "content-type": "application/json" },
    body: JSON.stringify({ name: "Dear", callNames: [], persona: null })
  });

  if (!named.ok) throw new Error(`the BMO's own name was refused: ${named.status} ${await named.text()}`);
  ownBmoAccount = Number(ownBmoPerson.user);

  const company = await service("/units", { method: "POST", body: JSON.stringify({ name: "presence-company" }) });

  if (!company.ok) throw new Error(`the other company was refused: ${company.status} ${await company.text()}`);

  const moved = await service(`/users/${presenceIds[2]}/unit`, { method: "PUT", body: JSON.stringify({ unit: ((await company.json()) as { id: number }).id }) });

  if (!moved.ok) throw new Error(`the move into the other company was refused: ${moved.status} ${await moved.text()}`);

  const hidden = await fetch(`${origin}/api/account/presence`, {
    method: "PUT",
    headers: { cookie: await signIn("presence-hidden", "fixture-password-3291", origin), "content-type": "application/json" },
    body: JSON.stringify({ shown: false })
  });

  if (!hidden.ok) throw new Error(`the presence switch was refused: ${hidden.status}`);

  // Told last, the fixture's own person comes after the other two, so a reader who sees them has been handed whatever
  // the stream was to hand of the others.
  presence.frames = [...presenceIds]
    .reverse()
    .map((account) => {
      const told = { id: null, at: LINE_AT, type: "presence", chatId: PRESENCE_CHAT, messageId: null, who: { kind: "account", account }, state: "online", lastSeenAt: LINE_AT };

      return `event: bot\ndata: ${JSON.stringify(told)}\n\n`;
    })
    .join("");

  // The second stand-in screen is an app (docs/accounts.md, 「An app's two settings」): its two kinds declared as the
  // unit publishing it would declare them, offered and on wherever nobody says otherwise, so every reader holds it as
  // they always have until a test turns it off for a company of its own.
  for (const [setting, mode, levels] of [["offered", "narrowing", ["platform", "unit"]], ["on", "nearest", ["platform", "unit", "person"]]] as const) {
    const key = `app.${HARNESS_SCREEN_UNITS[1]}.${setting}`;
    const declared = await service(`/chain/kinds/${key}`, {
      method: "PUT",
      body: JSON.stringify({
        key,
        declaredBy: HARNESS_SCREEN_UNITS[1],
        description: `Whether the ${HARNESS_SCREEN_UNITS[1]} app is ${setting}`,
        shape: "flag",
        choices: [],
        mode,
        default: true,
        rules: setting === "offered",
        levels,
        unitPermission: "manage",
        personWriter: "both"
      })
    });

    if (!declared.ok) throw new Error(`the app kind ${key} was refused: ${declared.status} ${await declared.text()}`);
  }

  // The agency's own kinds on the delegation chain, declared as the agency declares them as it stands: the sign-up
  // composition, repository management, personal apps and a person's own local AI (the agency's
  // `policy/organisation.toml`), and the
  // organisation's instructions, the persona's choice and the person's own instructions (its `policy/prompt-layers.toml`),
  // and what a person may change of the agents supplied to them. Whether organisation supply stands open is the account
  // service's own kind, declared as it stands.
  const agencyKinds: readonly { key: string; shape: string; mode: string; levels: readonly string[]; fallback?: unknown; choices?: readonly string[]; rules: boolean; personWriter: string }[] = [
    { key: "personal-apps.make", shape: "flag", mode: "narrowing", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" },
    { key: "personal-apps.network", shape: "flag", mode: "narrowing", levels: ["platform", "unit"], fallback: false, rules: true, personWriter: "heads" },
    { key: "personal-apps.secrets", shape: "flag", mode: "narrowing", levels: ["platform", "unit"], fallback: false, rules: true, personWriter: "heads" },
    { key: "personal-apps.share-scope", shape: "keys", mode: "narrowing", levels: ["platform", "unit"], fallback: ["team", "heads"], choices: ["team", "heads", "company"], rules: true, personWriter: "heads" },
    { key: "personal-apps.share-review", shape: "flag", mode: "nearest", levels: ["platform", "unit"], fallback: false, rules: true, personWriter: "heads" },
    { key: "personal-apps.install", shape: "flag", mode: "narrowing", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" },
    { key: "supply.personal-local-ai", shape: "flag", mode: "narrowing", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" },
    { key: "signup.composition", shape: "json", mode: "nearest", levels: ["platform", "unit", "person"], rules: false, personWriter: "heads" },
    { key: "repositories.manage", shape: "flag", mode: "nearest", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" },
    { key: "agency.org-instructions", shape: "text", mode: "layered", levels: ["platform", "unit"], rules: false, personWriter: "heads" },
    { key: "agency.persona", shape: "keys", mode: "nearest", levels: ["platform", "unit", "person"], fallback: ["own"], choices: ["own", "none"], rules: true, personWriter: "both" },
    { key: "agency.own-agents", shape: "flag", mode: "nearest", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" },
    { key: "agency.road-choice", shape: "flag", mode: "nearest", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" },
    { key: "agency.personal-instructions", shape: "flag", mode: "nearest", levels: ["platform", "unit", "person"], fallback: true, rules: true, personWriter: "heads" }
  ];

  for (const { key, shape, mode, levels, fallback, choices = [], rules, personWriter } of agencyKinds) {
    const declared = await service(`/chain/kinds/${key}`, {
      method: "PUT",
      body: JSON.stringify({
        key,
        declaredBy: "agency",
        description: key,
        shape,
        choices,
        mode,
        ...(fallback === undefined ? {} : { default: fallback }),
        rules,
        levels,
        unitPermission: "manage",
        personWriter
      })
    });

    if (!declared.ok) throw new Error(`the agency's kind ${key} was refused: ${declared.status} ${await declared.text()}`);
  }

  // The brain's two layers a reading may leave out, declared as the brain declares them as it stands (its
  // `docs/design.md`, 「The layers a reading takes」): flags narrowing down the chain, read by default.
  for (const key of ["brain.global", "brain.organisation"]) {
    const declared = await service(`/chain/kinds/${key}`, {
      method: "PUT",
      body: JSON.stringify({ key, declaredBy: "brain", description: key, shape: "flag", choices: [], mode: "narrowing", default: true, rules: true, levels: ["platform", "unit"], unitPermission: "manage", personWriter: "heads" })
    });

    if (!declared.ok) throw new Error(`the brain's kind ${key} was refused: ${declared.status} ${await declared.text()}`);
  }

  // bmo-artifact's storage setting, declared as bmo-artifact declares it as it stands (its `docs/artifact.md`, 「The
  // setting」).
  const storage = await service("/chain/kinds/artifact.storage", {
    method: "PUT",
    body: JSON.stringify({
      key: "artifact.storage",
      declaredBy: "artifact",
      description: "artifact.storage",
      shape: "json",
      choices: [],
      mode: "nearest",
      rules: false,
      levels: ["platform", "unit"],
      unitPermission: "manage",
      personWriter: "heads"
    })
  });

  if (!storage.ok) throw new Error(`the artifact's storage kind was refused: ${storage.status} ${await storage.text()}`);

  // bmo-mail's servers a link offers, declared as bmo-mail declares it as it stands (its `docs/api.md`, 「Servers」).
  const mailServers = await service("/chain/kinds/mail.servers", {
    method: "PUT",
    body: JSON.stringify({
      key: "mail.servers",
      declaredBy: "mail",
      description: "mail.servers",
      shape: "json",
      choices: [],
      mode: "layered",
      rules: false,
      levels: ["platform", "unit"],
      unitPermission: "manage",
      personWriter: "heads"
    })
  });

  if (!mailServers.ok) throw new Error(`the mail servers kind was refused: ${mailServers.status} ${await mailServers.text()}`);

  const bmoOwner = users.find((user) => user.name === "org-group-person");

  if (bmoOwner === undefined) throw new Error("org-group-person stands in no users list");
  ownedBmo = Number(bmoOwner.user);
  const ownOnly = users.find((user) => user.name === "agent-login");

  if (ownOnly === undefined) throw new Error("agent-login stands in no users list");

  ownSupplyOnly.add(ownOnly.user);

  const localMember = users.find((user) => user.name === "local-ai-member");

  if (localMember === undefined) throw new Error("local-ai-member stands in no users list");

  ownSupplyOnly.add(localMember.user);
  localAiOwners.add(localMember.user);

  for (const name of ["first-sign-in-1280", "first-sign-in-360"]) {
    const first = users.find((user) => user.name === name);

    if (first === undefined) throw new Error(`${name} stands in no users list`);
    ownSupplyOnly.add(first.user);
  }
  guideAdministrator = users.find((user) => user.name === "guide-admin")?.user ?? null;

  // The media room's reader and the sticker room's each have a sender of their own, linked as the administrator links
  // one.
  for (const [name, sender] of [["pictures", PICTURES_SENDER], ["stickers", STICKERS_SENDER]] as const) {
    const reader = users.find((user) => user.name === name);

    if (reader === undefined) throw new Error(`${name} stands in no users list`);

    const linked = await fetch(`http://127.0.0.1:${serverPort}/users/${reader.user}/senders/${sender}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${TOKEN}`, "owner-role": "administrator" }
    });

    if (!linked.ok) throw new Error(`the ${name} sender link was refused: ${linked.status} ${await linked.text()}`);
  }

  // The system mail set to the stand-in's server, and each account security member's email kept and verified through
  // the link it was mailed.
  const mailSet = await service("/mail", { method: "PUT", body: JSON.stringify({ server: "relay-a", from: "system@example.test", fromName: "BMO", secret: null }) });

  if (!mailSet.ok) throw new Error(`the system mail was refused: ${mailSet.status} ${await mailSet.text()}`);

  for (const [name] of SECURITY_MEMBERS) {
    const one = users.find((user) => user.name === name);

    if (one === undefined) throw new Error(`${name} stands in no users list`);

    const own = { authorization: `Bearer ${TOKEN}`, "owner-key": one.user, "owner-role": "member", "content-type": "application/json" };
    const at = `http://127.0.0.1:${serverPort}/users/${one.user}`;
    const profiled = await fetch(`${at}/profile`, { method: "POST", headers: own, body: JSON.stringify({ fullName: name, jobTitle: "", landline: "", mobile: "", email: `${name}@example.test` }) });
    const asked = await fetch(`${at}/email/verification`, { method: "POST", headers: own, body: JSON.stringify({ linkBase: origin }) });
    const link = String((sentMails.at(-1) as { text?: string } | undefined)?.text ?? "");
    const token = /token=([^\s]+)/.exec(link)?.[1] ?? "";
    const verified = await fetch(`http://127.0.0.1:${serverPort}/email-verifications/${token}`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } });

    if (!profiled.ok || !asked.ok || !verified.ok) throw new Error(`${name}'s email was not verified: ${profiled.status} ${asked.status} ${verified.status}`);
  }

  console.log(origin);
  // The stand-in bmo-mail, whose `GET /sent` the account security files read the mails from.
  console.log(`BMO_CONSOLE_TEST_MAIL=${mailAddress}`);
  // The features file a test writes and takes back, which the console reads at each page (tests/browser/sidebar-features.test.ts).
  console.log(`BMO_CONSOLE_TEST_FEATURES=${join(scratch, "console-features.toml")}`);
} catch (error) {
  console.error(error);
  await stop(true, 1);
}
