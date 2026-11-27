import { describe, expect, test } from "bun:test";
import { computed, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { wording } from "../../../apps/web/shared/wording";
import { appFile } from "../../support/render-page";

import type { Component } from "vue";
import type { AvatarIndex } from "../../../apps/web/app/domain/avatars";
import type { MemberPresence } from "../../../apps/web/app/domain/presence";
import type { RoomMember } from "../../../apps/web/shared/types";

// A room's members as a person reads them (docs/web.md, the room screen's members entry): each row their face, name
// and the status line where one was read, the console user's mark on a member known as an account and nothing on one
// who is not. The row is rendered as the server renders it, with the library's avatar and badge stood in for; where
// the tab reads and what a marked row leads to is read off the files that ship.

Object.assign(globalThis, { computed });

const Line = ((await import(appFile("components", "RoomMemberLine.vue"))) as { default: Component }).default;
const sheet = await Bun.file(appFile("components", "RoomMembersPanel.vue")).text();

const UAvatar = defineComponent({
  props: { alt: { type: String, default: "" }, text: { type: String, default: "" }, src: { type: String, default: "" } },
  setup(props) {
    return () => h("span", { "data-avatar": props.src !== "" ? props.src : props.text });
  }
});
const UBadge = defineComponent({
  props: { label: { type: String, required: true } },
  setup(props) {
    return () => h("span", { "data-badge": "" }, props.label);
  }
});

async function rendered(member: RoomMember, avatars: AvatarIndex = new Map(), presence?: MemberPresence): Promise<string> {
  const app = createSSRApp({ render: () => h(Line, { member, avatars, presence }) });

  app.component("UAvatar", UAvatar);
  app.component("UBadge", UBadge);
  app.config.globalProperties.$t = (key: string) => wording(key);

  return await renderToString(app);
}

describe("a member of a room", () => {
  test("says their presence under their name where it is shown, and nothing where it is not", async () => {
    const member: RoomMember = { person: 9_000_000_000_103, name: "member-c", status: "status-c", account: null, inConsole: false, grants: null };
    const shown = await rendered(member, new Map(), { chip: { show: true, color: "success", position: "bottom-right", size: "md" }, line: "presence-line" });

    expect(shown).toMatch(/<span[^>]*data-member-presence[^>]*>presence-line<\/span>/);
    expect(shown.indexOf("presence-line")).toBeLessThan(shown.indexOf("status-c"));
    expect(await rendered(member, new Map(), { chip: { show: false, color: "success", position: "bottom-right", size: "md" }, line: null })).not.toContain("data-member-presence");
  });

  test("known as an account carries the console user's mark under their name and status line", async () => {
    const html = await rendered({ person: 9_000_000_000_101, name: "member-a", status: "status-a", account: "7", inConsole: false, grants: null });

    expect(html).toContain("member-a");
    expect(html).toContain("status-a");
    expect(html).toMatch(new RegExp(`<span data-badge[^>]*>${wording("members.label.console_user")}</span>`));
  });

  test("the platform does not know stands as a member alone, with no mark and no status line it was not given", async () => {
    const html = await rendered({ person: 9_000_000_000_102, name: "member-b", status: null, account: null, inConsole: false, grants: null });

    expect(html).toContain("member-b");
    expect(html).not.toContain("data-badge");
    expect(html).not.toContain("data-member-status");
  });

  test("wears the picture the receiver keeps for their number, and their letter where it keeps none", async () => {
    const avatars: AvatarIndex = new Map([["person:9000000000103", "/api/avatars/person/9000000000103?v=1"]]);

    expect(await rendered({ person: 9_000_000_000_103, name: "member-c", status: null, account: null, inConsole: false, grants: null }, avatars)).toContain('data-avatar="/api/avatars/person/9000000000103?v=1"');
    expect(await rendered({ person: 9_000_000_000_104, name: "member-d", status: null, account: null, inConsole: false, grants: null }, avatars)).toContain('data-avatar="M"');
  });
});

describe("the members tab", () => {
  test("reads the room's members each time the room information shows it", () => {
    expect(sheet).toContain("await $fetch<RoomMembersView>(`/api/rooms/${props.chatId}/members`)");
    expect(sheet).toContain("onMounted(() => void read());");
    // While the first read runs, one row's place stands, never more than the shortest list a read can land.
    expect(sheet).toContain(':rows="1"');
    expect(sheet).not.toMatch(/:rows="(?!1")/);
  });

  test("leads a marked row to that person's page only for a reader who may read the account section", () => {
    expect(sheet).toContain('v-if="member.account !== null && mayOpenPeople"');
    expect(sheet).toContain(':to="`/people/${member.account}`"');
    expect(sheet).toContain('props.administrator || mayRead(access.value, "account")');
  });

  test("offers letting a person in to a reader who may in a room the console made, leaving on their own row of a room one leaves, and taking out to a reader who may", () => {
    expect(sheet).toContain('v-if="loaded && entry.messenger"');
    expect(sheet).toContain('v-else-if="loaded && entry.letIn"');
    expect(sheet).toContain('<RoomLetInDialog v-model:open="letInOpen"');
    expect(sheet).toContain('v-if="member.inConsole && member.account !== null && member.account === mine && entry.leaves"');
    expect(sheet).toContain('v-else-if="member.inConsole && member.account !== null && member.account !== mine && entry.takeOut"');
    expect(sheet).toContain("await $fetch(`/api/rooms/${props.chatId}/accounts/${account}`, { method: \"DELETE\" });");
  });

  test("stands a member's rights in the room under their row for a reader the receiver would take a writing from, never on the reader's own row nor in a messenger's room, and nowhere else", () => {
    expect(sheet).toContain('v-if="mayGrant && member.grants !== null && member.account !== mine && !entry.messenger"');
    expect(sheet).toContain(':model-value="member.grants?.[offered.key] === true"');
    expect(sheet).toContain('await $fetch<RoomGrants>(at, { method: "PUT", body: { right: offered.right } });');
    expect(sheet).toContain('await $fetch(at, { method: "DELETE", query: { right: offered.right } });');
    // Each switch is named for the member whose right it stands.
    expect(sheet).toContain(':aria-label="$t(offered.aria, { name: member.name })"');
  });

  test("says a refused read in its error band, with the refresh that reads again", () => {
    expect(sheet).toContain('<ReadFailure :failure="failure" :message="failed" :reading="pending" @retry="read()" />');
    expect(sheet).toContain('failureText(error, t("members.error.load_failed"))');
  });
});
