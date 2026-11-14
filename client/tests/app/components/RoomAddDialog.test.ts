import { describe, expect, test } from "bun:test";

// The rooms a chat service lists in the room-adding dialog (docs/web.md, 「Sidebar」, the dialog the group's add button opens), read
// page by page as the reader reaches the end of the list's own scroll, and the account its contacts are listed in,
// said under them. Read from the file that ships.

const source = await Bun.file(new URL("../../../apps/web/app/components/RoomAddDialog.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));
const script = source.slice(source.indexOf("<script"));

describe("the rooms' next pages", () => {
  test("are read as the list's foot comes into view, with no button asking for more", () => {
    expect(template).not.toContain("room_add_more\"");
    expect(template).toContain('<li ref="roomsFoot" role="presentation">');
    expect(script).toContain('const atRoomsFoot = useFootInView(roomsFoot, roomsReading, { rootMargin: "100px" });');
    expect(script).toContain('more: () => more.value && roomsFailed.value === "",');
    expect(script).toContain("busy: () => roomsReading.value,");
  });

  test("stand as skeleton rows while a page comes, and the end is said only of a list that took more than one page", () => {
    expect(template).toContain('<ContentSkeleton v-if="adding" :rows="2"');
    expect(template).toContain('<p v-else-if="!more && roomPages > 1"');
    expect(script).toContain("roomPages.value += 1;");
    expect(script).toContain("roomPages.value = 0;");
  });
});

describe("the contacts' account", () => {
  test("is said under the contacts' label, the reader's own where the session names their user and the service's own where not", () => {
    expect(template).toContain(':description="contactsAccount"');
    expect(script).toContain('user.value?.id === undefined ? t("room.message.room_add_contacts_service") : t("room.message.room_add_contacts_mine")');
  });
});
