import { describe, expect, test } from "bun:test";

// What keeps a reader at the end of an agent's log. Lines arrive while it is being read, and the
// window the log is read through changes size under it too: the box the owner types work into
// stands at the foot of an agent's screen and appears once the catalogue has answered whether
// this agent is one that can be launched into. Either way the end of the log moves, and a reader
// who was standing on it and is then left a box's height above it has had the screen taken out
// from under them for no reason they can see.
//
// The rule is the one the room's own feed is held to: watch the two heights rather than a list of
// the things that change them, because a list is the shape that leaves out whatever is put at the
// foot of the screen next. It is read off the file that ships — a rule about when a line runs is
// something a rendered screen would name as neither.

const source = await Bun.file(new URL("../../../apps/web/app/components/AgentLogView.vue", import.meta.url)).text();

describe("what keeps a reader at the end of a log", () => {
  test("there is source to read, so nothing below passes on an empty string", () => {
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain("function onContentGrew()");
  });

  test("watches the two heights themselves rather than a list of what changes them", () => {
    expect(source).toContain("new ResizeObserver(() => onContentGrew())");
    // The lines and the window the lines are read through.
    expect(source).toContain("for (const box of [feedRef.value?.$el, element])");
    expect(source).toContain("grewWatch.observe(box)");
  });

  // A work view's head — its prompt and its stages — is read after the lines and stands above them in the same box,
  // so a log opened at its end would be pushed off it as the head arrives.
  test("watches every block of the box it scrolls in, so a head standing late above the log keeps the end in view", () => {
    expect(source).toContain("for (const block of element?.children ?? [])");
    expect(source).toContain("grewWatch.observe(block)");
  });

  test("carries only a reader who was standing at the end", () => {
    const at = source.indexOf("function onContentGrew()");
    const body = source.slice(at, source.indexOf("}", source.indexOf("{", at) + 1));

    expect(body).toContain("if (stick.value)");
    expect(body).toContain("scrollToBottom()");
  });

  // A worker's box arrives after the log has been read to its end, and on a phone it is taller than
  // the distance still counted as the end: the scroll the browser makes as the window shrinks under
  // it would otherwise be read as the reader leaving, and the next line would arrive out of sight.
  test("a scroll that comes with the window or the lines changing size keeps a reader at the end", () => {
    const at = source.indexOf("function onScroll()");
    const body = source.slice(at, source.indexOf("\n}\n", at));

    expect(body).toContain("element.clientHeight !== measured.window || element.scrollHeight !== measured.content");
    expect(body).toContain("if (resized && stick.value)");
    expect(body).toContain("scrollToBottom()");
  });

  test("and stops watching with the view that asked", () => {
    expect(source).toContain("grewWatch?.disconnect()");
  });
});

describe("reading on past either end of a log", () => {
  test("reads the lines above as its head comes into view and those past what is held as its tail does, with no button", () => {
    expect(source).not.toContain("agents.action.older_lines");
    expect(source).not.toContain("agents.action.newer_lines");
    expect(source).toContain('<div ref="head" class="min-h-1 self-center">');
    expect(source).toContain('<div ref="tail" class="min-h-1" />');
    expect(source).toContain('const atHead = useFootInView(head, headBusy, { rootMargin: "200px" });');
    expect(source).toContain('const atTail = useFootInView(tail, tailBusy, { rootMargin: "200px" });');
    expect(source).toContain("more: () => log.older.value && !log.failure.value,");
    expect(source).toContain("more: () => log.newer.value && !log.failure.value,");
  });

  test("keeps the reader's place as lines land above, and says where the log starts", () => {
    expect(source).toContain("next: async () => (await loadOlder()) > 0");
    expect(source).toContain("element.scrollTop += element.scrollHeight - height;");
    expect(source).toContain('<p v-if="!log.older.value && shownRows.length > 0" class="text-sm text-dimmed">');
  });
});

// Opened at its end, the log was drawn and then scrolled down where the reader could watch it travel, and the head
// in view on the way read older pages that pushed the end further off. It is laid out unseen and stood at its end
// first, nothing above it read until then, and only then shown.
describe("opening a log at its end", () => {
  test("lays its lines out unseen and shows them once they stand at the end", () => {
    expect(source).toContain(':class="{ invisible: !opened }"');
    expect(source).toContain("await settleAtEnd();");
    expect(source).toContain("opened.value = true;");
  });

  test("reads nothing above or past its lines before it stands at its opening place", () => {
    expect(source).toContain("const headBusy = computed(() => !opened.value ||");
    expect(source).toContain("const tailBusy = computed(() => !opened.value ||");
  });

  // The rest of the page starting holds the frames back, so a wait for a row's height to hold would keep the newest
  // lines unseen for as long as that takes (docs/web.md, 「The work view」).
  test("stands at the end and shows its lines at the first frame they stand there in, waiting for nothing else", () => {
    const at = source.indexOf("async function settleAtEnd()");
    const body = source.slice(at, source.indexOf("\n}\n", at));

    expect(body.match(/element\.scrollTop = element\.scrollHeight;/g)?.length).toBe(2);
    expect(body.match(/requestAnimationFrame/g)?.length).toBe(1);
    expect(body).not.toContain("for (");
    expect(body).toContain("stick.value = true;");
  });
});
