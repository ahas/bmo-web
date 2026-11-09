import { describe, expect, test } from "bun:test";

// A window that stands open is told when a newer build is live (docs/web.md, 「Running as a service」). The
// plugin and the configuration are read rather than run: the newest build's name is published by a built
// console alone, so what ships is what the files say.

const plugin = await Bun.file(new URL("../../../apps/web/app/plugins/new-build.client.ts", import.meta.url)).text();
const config = await Bun.file(new URL("../../../apps/web/nuxt.config.ts", import.meta.url)).text();

describe("a newer build", () => {
  test("is read every minute by an open window", () => {
    expect(config).toContain("experimental: { checkOutdatedBuildInterval: 60_000 }");
  });

  test("is said in the notice island, once however many went live, with the button that loads the window again", () => {
    expect(plugin).toContain('nuxtApp.hook("app:manifest:update"');
    expect(plugin).toContain('key: "new-build"');
    expect(plugin).toContain('title: t("app.message.new_build")');
    expect(plugin).toContain('label: t("app.action.reload")');
    expect(plugin).toContain("window.location.reload()");
    // It stands until it is pressed or put away.
    expect(plugin).toContain("duration: null");
  });
});
