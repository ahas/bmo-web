import { wording } from "#shared/wording";

import { bmoPictureOf, standingBmoOf, userOf } from "./account-service";
import { agency, agencyCall } from "./agency";
import { supervisorOwner } from "./axes";
import { OWNER_ROLE_HEADER } from "./owner-key";
import { receiver, receiverCall, receiverRoute } from "./receiver";
import { supervisorSettingsOf } from "./supervisor-settings";

import type { OwnBmoView, ProfileSource } from "#shared/bmo-profile";
import type { components } from "@agency/client/schema";

type Schemas = components["schemas"];

// A person's BMO profile applied to that person's own BMO (docs/web.md, 「A person's BMO profile on the agency and the
// receiver」): the account service decides what stands (docs/accounts.md, 「A person's BMO profile」), and this writes
// it where the rooms read it, the label, the call names and the persona on the agency and the picture on the receiver.
// The owner's own BMO and every supervisor of no account are never touched: only the supervisor the account owns is.

/** A stand-in for the profile's name inside the label's words, which no person's name or profile's name holds. */
const AGENT_MARK = "\u0000";

/** The titles a person's own BMO and its private room stand under. */
export interface OwnTitles {
  label: string;
  room: string;
}

/** The titles a person's own BMO and its private room are made with: the person's name with the name the BMO's
 * profile stands with, the pack's word for a BMO where none stands, and the person's name alone for the room. */
export function ownTitles(name: string, agent: string = wording("account.label.bmo_name")): OwnTitles {
  return { label: wording("account.label.own_bmo", { name, agent }), room: wording("account.label.own_bmo_room", { name }) };
}

/**
 * Whether a label is one the console made itself, which it may write again: the account's key or the login, or the
 * label's words made from any of `names` with any profile's name. A label someone chose by hand is none of these.
 */
export function consoleMadeLabel(label: string, user: number, login: string, names: readonly string[]): boolean {
  if (label === `u${user}` || label === login) return true;

  return names
    .filter((name) => name !== "")
    .some((name) => {
      const [head = "", tail = ""] = wording("account.label.own_bmo", { name, agent: AGENT_MARK }).split(AGENT_MARK);

      return label.length > head.length + tail.length && label.startsWith(head) && label.endsWith(tail);
    });
}

/** What the profile asks of the persona on the agency: the person's own where it stands, emptied where the persona
 * standing on the agency is the one this console put there from the person's own and it no longer stands, and
 * nothing to write otherwise, so a persona someone set on the agency by hand stays. */
export function personaToWrite(standing: Pick<OwnBmoView, "persona" | "own">, onAgency: string | null): string | null | undefined {
  const now = onAgency ?? "";

  if (standing.persona.from === "own") return (standing.persona.value ?? "") === now ? undefined : standing.persona.value;

  const kept = standing.own.persona ?? "";

  return kept !== "" && kept === now ? null : undefined;
}

/** The call names the agency keeps for a supervisor, as its row carries them, one comma-separated text. */
export function callNamesOn(aliases: string | null | undefined): string[] {
  return (aliases ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** What the picture asks of the receiver: set from the profile's own or company picture, or dropped where the
 * deployment's stands. */
export function pictureAct(from: ProfileSource): "set" | "drop" {
  return from === "deployment" ? "drop" : "set";
}

// The calls on the receiver's kept pictures name the administrator's role: a person's BMO wears the picture its
// profile stands with, whoever changed the profile.
const AS_ADMINISTRATOR = { [OWNER_ROLE_HEADER]: "administrator" };

function personName(user: number, person: { name: string; fullName: string } | null): string {
  if (person === null) return `u${user}`;

  return person.fullName === "" ? person.name : person.fullName;
}

async function logged(user: number, what: string, act: () => Promise<unknown>): Promise<void> {
  try {
    await act();
  } catch (error) {
    console.error(`account ${user}: its BMO's ${what} could not be set: ${String(error)}`);
  }
}

/**
 * The profile standing for a person applied to their own BMO. Always the label, the call names and the private room's
 * title, each only where it differs and the label and the title only where the console made them; with `profile`,
 * also the persona and the picture, which move only when the profile does. `before` is the person's name until now,
 * whose titles the console made. A part that cannot be set is written to the log and the rest goes on.
 */
export async function standOwnBmo(user: number, options: { before?: string; profile?: boolean } = {}): Promise<void> {
  const page = await agencyCall(agency().GET("/supervisors"));
  const own = page.items.find((supervisor) => supervisorOwner(supervisor) === user);

  if (own === undefined) return;

  const person = await userOf(user);

  if (person === null) return;

  const standing = await standingBmoOf(user).catch((error: unknown) => {
    console.error(`account ${user}: its BMO's profile could not be read: ${String(error)}`);

    return null;
  });
  const name = personName(user, person);
  const now = ownTitles(name, standing?.name.value ?? undefined);
  const label = own.label ?? own.name;

  if (label !== now.label && consoleMadeLabel(label, user, person.name, [name, person.name, options.before ?? "", `u${user}`])) {
    await logged(user, "label", () => agencyCall(agency().PATCH("/supervisors/{supervisorName}", { params: { path: { supervisorName: own.name } }, body: { label: now.label } })));
  }

  const callNames = standing?.callNames.value ?? [];

  if (standing !== null && callNamesOn(own.aliases).join(",") !== callNames.join(",")) {
    // The agency's change takes the call names as it keeps them (its `docs/supervisors.md`, 「What a supervisor row
    // holds」), beside the label rather than with it, so a refusal of one leaves the other standing.
    const change: Schemas["SupervisorChange"] & { aliases: string } = { aliases: callNames.join(",") };

    await logged(user, "call names", () => agencyCall(agency().PATCH("/supervisors/{supervisorName}", { params: { path: { supervisorName: own.name } }, body: change })));
  }

  await logged(user, "room title", () => followRoomTitle(own.name, now.room, [name, person.name, options.before ?? "", `u${user}`]));

  if (options.profile !== true || standing === null) return;

  await logged(user, "persona", async () => {
    const settings = supervisorSettingsOf(await agencyCall(agency().GET("/supervisors/{supervisorName}/settings", { params: { path: { supervisorName: own.name } } })));
    const persona = personaToWrite(standing, settings.persona);

    if (persona === undefined) return;

    await agencyCall(agency().PATCH("/supervisors/{supervisorName}/settings", { params: { path: { supervisorName: own.name } }, body: { by: "console", persona } }));
  });

  await logged(user, "picture", async () => {
    const path = `/avatars/agent/${encodeURIComponent(own.name)}`;

    if (pictureAct(standing.picture.from) === "drop") {
      await receiverRoute(path, { method: "DELETE", headers: AS_ADMINISTRATOR }).catch((error: unknown) => {
        if ((error as { statusCode?: number }).statusCode !== 404) throw error;
      });

      return;
    }

    const picture = await bmoPictureOf(user);
    const form = new FormData();

    form.set("picture", new Blob([new Uint8Array(picture.bytes)], { type: picture.type }), "bmo");
    await receiverRoute(path, { method: "PUT", body: form, headers: AS_ADMINISTRATOR });
  });
}

// The private room of a person's own BMO titled by their name, where its title is one the console made.
async function followRoomTitle(supervisor: string, title: string, names: readonly string[]): Promise<void> {
  const rooms = await receiverCall(receiver().GET("/supervisors/{supervisorName}/rooms", { params: { path: { supervisorName: supervisor } } }));
  const room = rooms.items.find((held) => held.alone);
  const standing = room?.title ?? null;
  const made = new Set(names.filter((name) => name !== "").map((name) => ownTitles(name).room));

  if (room === undefined || standing === title || (standing !== null && !made.has(standing))) return;

  await receiverCall(receiver().PUT("/rooms/{roomId}/title", { params: { path: { roomId: room.id } }, body: { title } }));
}

/** The profile applied to every person named, one after another, after the act that moved it has answered. */
export function standOwnBmos(users: readonly number[]): void {
  void (async () => {
    for (const user of users) {
      await standOwnBmo(user, { profile: true }).catch((error: unknown) => console.error(`account ${user}: its BMO could not take its profile: ${String(error)}`));
    }
  })();
}
