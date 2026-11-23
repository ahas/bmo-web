import { describe, expect, test } from "bun:test";

import { DrawnImage } from "../../../apps/web/app/domain/drawn-image";

import type { VNode } from "vue";

function drawn(attrs: Record<string, unknown>): Record<string, unknown> {
  return (DrawnImage({}, { attrs, slots: {}, emit: () => undefined }) as VNode).props ?? {};
}

describe("the image element a face is drawn in", () => {
  test("keeps the kept picture's address and names every copy, chosen by the width the avatar draws it at", () => {
    const props = drawn({ src: "/face?v=1", alt: "Bob", width: 32, height: 32 });

    expect(props.src).toBe("/face?v=1");
    expect(props.alt).toBe("Bob");
    expect(String(props.srcset).split(", ")[0]).toBe("/face?v=1&w=16 16w");
    expect(props.sizes).toBe("32px");
  });

  test("is chosen by the width it is laid out at, read as it comes into view, where the avatar names none", () => {
    const props = drawn({ src: "/face" });

    expect(props.sizes).toBe("auto");
    expect(props.loading).toBe("lazy");
  });
});
