import { describe, expect, it } from "vitest";

import { isWeekendUtc } from "@/lib/market-calendar";

describe("UTC market calendar", () => {
  it("identifies Saturday and Sunday as the weekend", () => {
    expect(isWeekendUtc(new Date("2026-10-10T12:00:00Z"))).toBe(true);
    expect(isWeekendUtc(new Date("2026-10-11T12:00:00Z"))).toBe(true);
  });

  it("keeps Monday through Friday on the selected market", () => {
    expect(isWeekendUtc(new Date("2026-10-09T12:00:00Z"))).toBe(false);
    expect(isWeekendUtc(new Date("2026-10-12T12:00:00Z"))).toBe(false);
  });
});