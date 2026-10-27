import { describe, expect, test } from "bun:test";

// The mention an @ starts in the room's input box (docs/web.md, the room screen's section on mentions), read off the files that ship
// where a rendered screen would name none of it: the composer's list, the keys it takes before the box sees them, the
// textarea it reads the caret from, and the room that feeds it its people and agents.

const read = async (name: string) => await Bun.file(new URL(name, new URL("../../../apps/web/app/", import.meta.url))).text();

const composer = await read("components/ChatComposer.vue");
const input = await read("components/ChatInput.vue");
const screen = await read("pages/rooms/[chatId].vue");
const template = composer.slice(0, composer.indexOf("<script"));

describe("the composer's mention list", () => {
  test("stands over the box, and offers each name with the mark of its kind", () => {
    expect(template).toContain('data-mentions');
    expect(template.indexOf("data-mentions")).toBeLessThan(template.indexOf("<ChatInput"));
    expect(template).toContain('role="listbox"');
    expect(template).toContain(':aria-label="$t(\'room.aria.mention_list\')"');
    expect(template).toContain("candidate.kind === 'agent' ? 'i-material-symbols-smart-toy-outline' : 'i-material-symbols-person-outline'");
  });

  test("takes its keys before the box, so Enter picks rather than sends", () => {
    expect(template).toContain('@keydown.capture="mentionKeydown"');
    expect(composer).toContain("event.preventDefault();");
    expect(composer).toContain("event.stopPropagation();");
    expect(composer).toContain("key: mentionKey");
  });

  test("reads the caret from the box and follows what is typed, clicked and moved", () => {
    expect(composer).toContain("() => box.value?.textarea() ?? null");
    expect(input).toContain("textarea: () => prompt.value?.textareaRef ?? null");
    expect(template).toContain('@input="mentionTrack"');
    expect(template).toContain('@keyup="mentionTrack"');
    expect(template).toContain('@click="mentionTrack"');
  });

  test("puts the list away when the keyboard or the press leaves the box", () => {
    expect(template).toContain('@focusout="onFocusOut"');
    expect(composer).toContain("closeMention();");
  });

  test("takes the choice on a press, keeping the keyboard in the box", () => {
    expect(template).toContain('@mousedown.prevent="chooseMention(index)"');
    expect(template).toContain('@mouseenter="aimMention(index)"');
  });
});

describe("the room that feeds it", () => {
  test("offers the room's people, the reader's own left out, and its agents", () => {
    expect(screen).toContain(':mention="mentionSources"');
    expect(screen).toContain("const mentionPeople = computed<string[]>(() =>");
    expect(screen).toContain("!owner.value.senders.includes(message.senderId)");
    expect(screen).toContain("message.agent !== true && message.notice !== true");
    expect(screen).toContain("catalogue.value.agents.filter((agent) => agent.defaultAnswerer || agent.chatId === chatId)");
    expect(screen).toContain(".map((agent) => agentLabel(t, agent.name))");
  });
});
