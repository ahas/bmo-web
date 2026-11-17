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
    // An agent that has a picture wears it, and the name beside it is its own.
    expect(template).toContain('v-if="candidate.avatar !== undefined" v-bind="candidate.avatar" size="2xs"');
    expect(template).toContain("<span data-mention-name class=\"truncate\">{{ candidate.text }}</span>");
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
    // What is typed moves the mention and, beside it, says whether the box holds words (docs/web.md, 「Presence and typing」).
    expect(template).toContain('@input="onInput"');
    expect(composer).toMatch(/function onInput\(\): void \{\n  mentionTrack\(\);\n  emit\("typing", /);
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
    // The agents come from the room's answerers, by their own labels and pictures, never by a room's title.
    expect(screen).toContain("`/api/rooms/${chatId}/answerers`");
    expect(screen).toContain("const names = [...new Set([named.default, ...named.agents.map((answerer) => answerer.name)])]");
    expect(screen).toContain("label: agentNameLabel(t, { name, label: catalogue.value.agents.find((agent) => agent.name === name)?.label })");
    expect(screen).toContain("avatar: agentAvatar(avatars.value, name)");
  });
});
