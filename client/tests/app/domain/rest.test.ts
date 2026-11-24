import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { restMarkOf, restMarkText } from "../../../apps/web/app/domain/rest";

import type { RestView } from "../../../apps/web/shared/rest";

// The rest's mark in an agent's state cell (docs/web.md, 「What each agent is doing now」): until when, the clock alone
// on the day the rest ends and the date with it on another, in the zone the console shows every time in.

// The app configuration bmo-ui reads its zone and locales from, as the console sets it.
Object.assign(globalThis, { useAppConfig: () => ({ bmoUi: { zone: "Asia/Seoul", locale: "ko-KR", dateLocale: "ko" } }) });

// 2027-01-15 08:00 UTC, 17:00 in Seoul.
const NOW = 1_800_000_000 - (1_800_000_000 % 86_400) + 8 * 3_600;

function at(hoursFromNow: number): number {
  return NOW + hoursFromNow * 3_600;
}

const REST: RestView = { resting: true, until: at(4), kind: "limit", supervisors: ["agent-a"], agents: ["worker-01"], mayEnd: false };

describe("the rest's mark", () => {
  test("names the clock alone on the day it ends in the console's zone", () => {
    // Four hours on is 21:00 in Seoul, the same day.
    expect(restMarkText(wording, at(4), NOW)).toBe(wording("live.label.agent_resting_until", { until: "21:00" }));
  });

  test("names the date with the clock on another day there, though the same day in UTC", () => {
    // Eight hours on is 16:00 UTC the same day, but 01:00 the next day in Seoul.
    const until = at(8);
    const day = new Date((until + 9 * 3_600) * 1_000);
    const date = `${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;

    expect(restMarkText(wording, until, NOW)).toBe(wording("live.label.agent_resting_until", { until: `${date} 01:00` }));
  });

  test("is the rest alone where it ends at no known moment", () => {
    expect(restMarkText(wording, null, NOW)).toBe(wording("live.label.agent_resting"));
  });

  test("stands only on an agent the rest closes, and only while it rests", () => {
    expect(restMarkOf(wording, REST, "agent-a", NOW)).toBe(restMarkText(wording, REST.until, NOW));
    expect(restMarkOf(wording, REST, "worker-01", NOW)).toBe(restMarkText(wording, REST.until, NOW));
    expect(restMarkOf(wording, REST, "agent-b", NOW)).toBeNull();
    expect(restMarkOf(wording, { ...REST, resting: false }, "agent-a", NOW)).toBeNull();
    expect(restMarkOf(wording, null, "agent-a", NOW)).toBeNull();
  });
});
