import { describe, expect, test } from "bun:test";

import { ACCOUNTS_ADDRESS } from "../../../apps/web/app/domain/accounts";
import { adminAddress, ADMIN_TABS } from "../../../apps/web/app/domain/administration";

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

// The title bar's usage panel leads here (docs/web.md, 「Usage in the title bar」), so the group answers to an address of
// its own on the tab it stands on.
describe("the Claude accounts group", () => {
  test("is named by an address on the screen's first tab, the tab the accounts stand on", () => {
    const [path, group] = ACCOUNTS_ADDRESS.split("#");

    expect(ADMIN_TABS[0]!.load.toString()).toContain("OrganizationProviders.vue");
    expect({ path, group }).toEqual({ path: adminAddress(ADMIN_TABS[0]!.value).path, group: "accounts" });
    expect(adminAddress(ADMIN_TABS[0]!.value).query).toEqual({});
  });

  test("answers to that address and brings itself into view where the address names it", () => {
    expect(accounts).toContain('<section :id="ACCOUNTS_GROUP"');
    expect(accounts).toContain("if (route.hash === `#${ACCOUNTS_GROUP}`) document.getElementById(ACCOUNTS_GROUP)?.scrollIntoView(");
  });
});
