import { describe, expect, test } from "bun:test";

// The room's chat services tab, read from the file that ships: the providers read-only, and the avatar mode's switch
// above them only where it can apply, with the room's list of supervisors under the switch.

const source = await Bun.file(new URL("../../../apps/web/app/components/RoomProvidersPanel.vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));

describe("the room's chat services tab", () => {
  test("stands the avatar mode above the providers, and only where it applies", () => {
    expect(template.indexOf("data-room-mode")).toBeGreaterThan(-1);
    expect(template.indexOf("data-room-mode")).toBeLessThan(template.indexOf("data-room-providers"));
    expect(template).toContain(`v-if="avatarShown"`);
    expect(source).toContain(`mode.value === "avatar" || (mode.value === "record-only" && view.value?.avatarOffered === true)`);
  });

  test("is on for avatar, writes the other mode when turned, and says what each does", () => {
    expect(template).toContain(`:model-value="mode === 'avatar'"`);
    expect(template).toContain(`void setMode(on ? 'avatar' : 'record-only')`);
    expect(template).toContain(`mode === 'avatar' ? 'room.message.mode_avatar_on' : 'room.message.mode_avatar_off'`);
  });

  test("stands the supervisor list under the switch, inside the same v-if, and says what an empty one does", () => {
    const switchRow = template.indexOf("data-room-mode");
    const listRow = template.indexOf("data-room-supervisors");

    expect(listRow).toBeGreaterThan(switchRow);
    expect(listRow).toBeLessThan(template.indexOf("data-room-providers"));
    expect(template.slice(0, switchRow)).not.toContain("data-room-supervisors");
    expect(template.slice(listRow, template.indexOf("data-room-providers"))).toContain("$t('room.message.supervisors_rule')");
  });

  test("edits the list as a choice of several, written whole and set to what the receiver answers", () => {
    expect(template).toContain("multiple");
    expect(template).toContain(`value-key="value"`);
    expect(template).toContain(`void setSupervisors(value)`);
    expect(source).toContain('/supervisors`, { method: "PUT", body: { supervisors: next } }');
    expect(source).toContain("supervisors.value = (await $fetch<RoomSupervisorsView>");
  });

  test("narrows candidates to the readers list and keeps a name the room already carries among them", () => {
    expect(source).toContain('$fetch<SupervisorView[]>("/api/supervisors")');
    expect(source).toContain(".filter((name) => !known.has(name))");
  });

  test("asks for the list once the row first stands, not before", () => {
    expect(source).toContain("watch(");
    expect(source).toContain("if (shown && !supervisorsAsked.value)");
    expect(source).toContain("void readSupervisors();");
  });

  test("offers nothing that changes a provider", () => {
    expect(source).not.toContain(`method: "PUT", body: { providers`);
    expect(template.slice(template.indexOf("data-room-providers"))).not.toContain("USwitch");
  });

  test("reads the providers and the mode afresh each time the room information shows the tab", () => {
    expect(source).toContain("void read();");
    expect(source).toContain("void readMode();");
  });
});
