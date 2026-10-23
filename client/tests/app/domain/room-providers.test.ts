import { describe, expect, test } from "bun:test";

import { providersTurned } from "../../../apps/web/app/domain/room-providers";

// The whole list a room's chat providers dialog writes as one switch is turned: a provider turned on goes last, one
// turned off goes, and the rest keep their order.

describe("a room's chat providers turned", () => {
  test("adds a provider turned on at the list's end", () => {
    expect(providersTurned(["provider-a", "provider-b"], "provider-c", true)).toEqual(["provider-a", "provider-b", "provider-c"]);
  });

  test("takes a provider turned off out, the rest in their order", () => {
    expect(providersTurned(["provider-a", "provider-b", "provider-c"], "provider-b", false)).toEqual(["provider-a", "provider-c"]);
  });

  test("never names a provider twice", () => {
    expect(providersTurned(["provider-a", "provider-b"], "provider-a", true)).toEqual(["provider-b", "provider-a"]);
  });
});
