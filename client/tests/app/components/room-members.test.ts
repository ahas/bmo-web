import { describe, expect, test } from "bun:test";
import { computed, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

import { wording } from "../../../apps/web/shared/wording";
import { appFile } from "../../support/render-page";

import type { Component } from "vue";
import type { RoomMember } from "../../../apps/web/shared/types";

// A room's members as a person reads them (docs/web.md, the room screen's members entry): each row their face, name
// and the status line where one was read, the console user's mark on a member known as an account and nothing on one
// who is not. The row is rendered as the server renders it, with the library's avatar and badge stood in for; where
// the sheet opens and what a marked row leads to is read off the files that ship.

Object.assign(globalThis, { computed });

const Line = ((await import(appFile("components", "RoomMemberLine.vue"))) as { default: Component }).default;
const sheet = await Bun.file(appFile("components", "RoomMembersSheet.vue")).text();
const screen = await Bun.file(appFile("pages", "rooms", "[chatId].vue")).text();

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

async function rendered(member: RoomMember): Promise<string> {
  const app = createSSRApp({ render: () => h(Line, { member, avatars: new Map() }) });

  app.component("UAvatar", UAvatar);
  app.component("UBadge", UBadge);
  app.config.globalProperties.$t = (key: string) => wording(key);

  return await renderToString(app);
}

describe("a member of a room", () => {
  test("known as an account carries the console user's mark beside their name and status line", async () => {
    const html = await rendered({ person: 9_000_000_000_101, name: "member-a", status: "status-a", account: "7" });

    expect(html).toContain("member-a");
    expect(html).toContain("status-a");
    expect(html).toMatch(new RegExp(`<span data-badge[^>]*>${wording("members.label.console_user")}</span>`));
  });

  test("the platform does not know stands as a member alone, with no mark and no status line it was not given", async () => {
    const html = await rendered({ person: 9_000_000_000_102, name: "member-b", status: null, account: null });

    expect(html).toContain("member-b");
    expect(html).not.toContain("data-badge");
    expect(html).not.toContain("data-member-status");
  });
});

describe("the members sheet", () => {
  test("opens from every room's menu and reads the room's members each time it opens", () => {
    expect(screen).toContain('{ label: t("room.action.members"), icon: "i-material-symbols-group-outline", onSelect: () => { membersOpen.value = true; } }');
    expect(screen).toContain('<RoomMembersSheet v-model:open="membersOpen"');
    expect(sheet).toContain("await $fetch<RoomMember[]>(`/api/rooms/${props.chatId}/members`)");
    expect(sheet).toContain("if (standing) void read();");
  });

  test("leads a marked row to that person's page only for a reader who may read the account section", () => {
    expect(sheet).toContain('v-if="member.account !== null && mayOpenPeople"');
    expect(sheet).toContain(':to="`/people/${member.account}`"');
    expect(sheet).toContain('props.administrator || mayRead(access.value, "account")');
  });

  test("says a refused read in its error band, with the refresh that reads again", () => {
    expect(sheet).toContain('<ReadFailure :failure="failure" :message="failed" :reading="pending" @retry="read()" />');
    expect(sheet).toContain('failureText(error, t("members.error.load_failed"))');
  });
});
