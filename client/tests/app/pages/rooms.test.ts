import { describe, expect, test } from "bun:test";

// The room screen's write controls (docs/web.md, 「Access」): the box to write in and the acts on a message
// stand for a reader whose rooms section writes, the administrator's own view keeps everything it had, and a
// member who only reads keeps the read-only screen, as the administrator does in another account's private room, which
// the room list says the reader may not change. The permission itself and the menu the acts are drawn from are checked
// where they live, so this holds the screen to wiring them.

const read = async (path: string): Promise<string> => Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

const page = await read("app/pages/rooms/[chatId].vue");
const message = await read("app/components/RoomMessage.vue");
const info = await read("app/components/RoomInfoSheet.vue");
const template = page.slice(0, page.indexOf("<script"));
const script = page.slice(page.indexOf("<script"));

describe("the room screen's write controls", () => {
  test("stand for a reader whose rooms section writes", () => {
    expect(script).toContain('import { roomMayWrite, useAdministrator, useSignedUser } from "~/domain/access";');
    expect(script).toContain('import { useSectionAccess, useSectionAccessReady } from "~/domain/section-access";');
    expect(script).toContain("const roomWritable = computed<boolean>(() => !roomsInitial.value && listedRooms.value?.find((room) => room.chatId === chatId)?.writable !== false);");
    expect(script).toContain("const writable = computed<boolean>(() => roomWritable.value && roomMayWrite(access.value, administrator.value, accessReady.value));");
  });

  test("leave the administrator nothing to change in a room he may not change", () => {
    expect(script).toContain("const manages = computed<boolean>(() => administrator.value && roomWritable.value);");
    expect(template).toContain(':administrator="manages"');
    expect(template).toContain(':read-only="!roomWritable"');

    expect(template).toContain('<RoomRemovalDialog v-if="manages"');
    expect(template).toContain(':manages="manages"');
    expect(info).toContain('<PictureDialog\n    v-if="props.manages"');
    expect(info).toContain('<RoomProvidersPanel v-if="props.manages');

    expect(script).toContain("room.chatId !== chatId && room.writable !== false");
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

  test("keep the session information the administrator's, and the room's own settings his where he may change it", () => {
    expect(info).toContain('...(props.administrator ? ["session" as const] : [])');
    expect(info).toContain('...(props.manages ? ["providers" as const] : [])');
    expect(script).toContain('...(manages.value ? [[{ label: t("room.action.remove_registration")');
  });
});
