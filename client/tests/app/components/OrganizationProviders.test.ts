import { describe, expect, test } from "bun:test";

// The providers tab of the administrator's screen and its key dialog, read from the files that ship (docs/web.md,
// 「Administration」, the providers tab).

const tab = await Bun.file(new URL("../../../apps/web/app/components/OrganizationProviders.vue", import.meta.url)).text();
const dialog = await Bun.file(new URL("../../../apps/web/app/components/ProviderKeyDialog.vue", import.meta.url)).text();
const accounts = await Bun.file(new URL("../../../apps/web/app/components/AgentsAccounts.vue", import.meta.url)).text();

describe("a provider that reads its own key from a file", () => {
  test("says whether the file stands and opens the key dialog from its row", () => {
    expect(tab).toContain('v-if="one.keyFile !== null"');
    expect(tab).toContain('$t("agents.label.key_held"');
    expect(tab).toContain('$t("agents.label.key_missing")');
    expect(tab).toContain('@click="keyFor = one"');
  });

  test("writes the key under the file's name in the administrator's space, replacing what stood, and never reads it back", () => {
    expect(dialog).toContain('$fetch("/api/secrets", { method: "POST", body: { name: props.file, value: value.value.trim(), replace: true } })');
    expect(dialog).toContain('type="password"');
    expect(dialog).not.toContain("GET");
  });

  test("reads the files and the providers again once the key is kept", () => {
    expect(tab).toContain("await Promise.all([refreshSecrets(), refresh()]);");
  });
});

describe("a new Claude login", () => {
  test("is added from the accounts heading, and the tab row holds no add", () => {
    expect(accounts).toContain("data-account-add @click=\"openAdd()\"");
    expect(tab).not.toContain("defineExpose");
  });
});
