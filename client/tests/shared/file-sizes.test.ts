import { describe, expect, test } from "bun:test";

import { fileSizeText } from "../../apps/web/shared/file-sizes";

describe("a file's size as a person reads it", () => {
  test("in bytes, kilobytes or megabytes", () => {
    expect(fileSizeText(900)).toBe("900B");
    expect(fileSizeText(2048)).toBe("2KB");
  });

  test("a size of four figures or more carries its thousands separator", () => {
    expect(fileSizeText(1020)).toBe("1,020B");
    expect(fileSizeText(1023 * 1024)).toBe("1,023KB");
    expect(fileSizeText(1500 * 1024 * 1024)).toBe("1,500.0MB");
  });
});
