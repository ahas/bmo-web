import { describe, expect, test } from "bun:test";

import { ACCOUNTS_ADDRESS } from "../../../apps/web/app/domain/accounts";
import { ORGANIZATION_TABS, PLATFORM_NODE, organizationLinkAddress } from "../../../apps/web/app/domain/organization";

// The platform's own keys and Claude accounts on the organisation screen's supply tab with the platform chosen, and the
// key dialog, read from the files that ship (docs/web.md, 「Organisation」, the supply tab).

const credentials = await Bun.file(new URL("../../../apps/web/app/components/OrganizationPlatformAccounts.vue", import.meta.url)).text();
const providers = await Bun.file(new URL("../../../apps/web/app/components/OrganizationProviders.vue", import.meta.url)).text();
const dialog = await Bun.file(new URL("../../../apps/web/app/components/ProviderKeyDialog.vue", import.meta.url)).text();
const accounts = await Bun.file(new URL("../../../apps/web/app/components/AgentsAccounts.vue", import.meta.url)).text();

describe("a provider that reads its own key from a file", () => {
  test("says whether the file stands and opens the key dialog from its row, on the platform's supply alone", () => {
    expect(credentials).toContain("one.keyFile !== null");
    expect(credentials).toContain('$t("agents.label.key_held"');
    expect(credentials).toContain('$t("agents.label.key_missing")');
    expect(credentials).toContain('@click="keyFor = one"');
    expect(providers).not.toContain("keyFor");
  });

  test("writes the key under the file's name in the administrator's space, replacing what stood, and never reads it back", () => {
    expect(dialog).toContain('$fetch("/api/secrets", { method: "POST", body: { name: props.file, value: value.value.trim(), replace: true } })');
    expect(dialog).toContain('type="password"');
    expect(dialog).not.toContain("GET");
  });

  test("reads the files and the providers again once the key is kept", () => {
    expect(credentials).toContain("await Promise.all([refreshSecrets(), refresh()]);");
  });
});

describe("a new Claude login", () => {
  test("is added from the accounts heading, and the tab row holds no add", () => {
    expect(accounts).toContain("data-account-add @click=\"openAdd()\"");
    expect(credentials).not.toContain("defineExpose");
  });
});

// The title bar's usage panel leads here (docs/web.md, 「Usage in the title bar」), so the group answers to an address of
// its own on the tab it stands on.
describe("the Claude accounts group", () => {
  test("is named by an address on the supply tab with the platform chosen, the tab the accounts stand on", () => {
    const [path, group] = ACCOUNTS_ADDRESS.split("#");
    const supply = ORGANIZATION_TABS.find((tab) => tab.value === "supply")!;
    const address = organizationLinkAddress(PLATFORM_NODE, {}, "supply");

    expect(supply.links?.platform?.toString()).toContain("OrganizationPlatformSupply.vue");
    expect({ path, group }).toEqual({ path: `${address.path}?company=${address.query.company}&tab=${address.query.tab}`, group: "accounts" });
  });

  test("answers to that address and brings itself into view where the address names it", () => {
    expect(accounts).toContain('<section :id="ACCOUNTS_GROUP"');
    expect(accounts).toContain("if (route.hash === `#${ACCOUNTS_GROUP}`) document.getElementById(ACCOUNTS_GROUP)?.scrollIntoView(");
  });
});
