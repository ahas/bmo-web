import { describe, expect, test } from "bun:test";

// The room screen's write controls (docs/web.md, 「Access」): the box to write in and the acts on a message
// stand for a reader whose rooms section writes, the administrator's own view keeps everything it had, and a
// member who only reads keeps the read-only screen. The permission itself and the menu the acts are drawn from
// are checked where they live, so this holds the screen to wiring them.

const read = async (path: string): Promise<string> => Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const page = await read("app/pages/rooms/[chatId].vue");
const message = await read("app/components/RoomMessage.vue");
const template = page.slice(0, page.indexOf("<script"));
const script = page.slice(page.indexOf("<script"));

describe("the room screen's write controls", () => {
  test("stand for a reader whose rooms section writes", () => {
    expect(script).toContain('import { roomMayWrite, useAdministrator, useSignedUser } from "~/domain/access";');
    expect(script).toContain('import { useSectionAccess, useSectionAccessReady } from "~/domain/section-access";');
    expect(script).toContain("const writable = computed<boolean>(() => roomMayWrite(access.value, administrator.value, accessReady.value));");
  });

  test("put the box to write in behind that permission rather than the administrator alone", () => {
    expect(template).toContain('v-if="writable"');
    expect(template).toContain('ref="composerFoot"');
  });

  test("hand the same permission to every message's acts", () => {
    expect(template).toContain(':writable="writable"');
    expect(message).toContain("writable?: boolean;");
    expect(message).toContain("writable: props.writable");
  });

  test("keep the session information and the room's own settings the administrator's", () => {
    expect(script).toContain('...(administrator.value ? [{ label: t("room.title.session_info")');
    expect(script).toContain('...(administrator.value ? [{ label: t("room.action.providers")');
    expect(script).toContain('...(administrator.value ? [[{ label: t("room.action.remove_registration")');
  });
});
