import { describe, expect, test } from "bun:test";

// The deployment popover's open state is shared by every mark, and a screen the router keeps set
// aside keeps its mark: only the mark of the screen standing opens, so a kept screen's popover never
// stands at the window's corner beside the real one (docs/web.md, 「Deployment in the title bar」).

const mark = await Bun.file(new URL("../../../apps/web/app/components/DeployMark.vue", import.meta.url)).text();

describe("the deployment popover", () => {
  test("opens on the standing screen's mark alone", () => {
    expect(mark).toContain('v-model:open="shown"');
    expect(mark).toContain("get: () => open.value && standing.value");
    expect(mark).toContain("onDeactivated(() => (standing.value = false));");
    expect(mark).toContain("onActivated(() => (standing.value = true));");
  });

  test("reads the run's log only while it is shown", () => {
    expect(mark).toContain("() => [shown.value, run.value?.phase ?? null");
  });
});

// The mark is the library's own button in the mark's tone, so its hover fills its own rounded shape,
// and once its words fold away it is the library's square (docs/web.md, 「The title bar」).
describe("the running mark", () => {
  const template = mark.slice(0, mark.indexOf("<script"));

  test("is the library's own button, square once its words fold away", () => {
    const press = template.slice(template.lastIndexOf("<", template.indexOf(":aria-label=\"markWords\"", template.indexOf("<UPopover"))));

    expect(press.startsWith("<UButton")).toBe(true);
    expect(press.slice(0, press.indexOf(">"))).toContain(":square=\"narrow\"");
    expect(template).not.toContain("<button");
    expect(template).not.toContain("hover:");
  });
});
