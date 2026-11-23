import { describe, expect, test } from "bun:test";

import { AVATAR_TONES, avatarFor, avatarIndex, avatarKey, avatarTone, FACE_TONES, hueOf, identityMark, initialOf } from "../../../apps/web/app/domain/avatars";

import { DrawnImage } from "../../../apps/web/app/domain/drawn-image";
import { registerChatAgent } from "../../../apps/web/shared/agent-names";

import type { AvatarRef } from "../../../apps/web/shared/types";
import KO from "../../fixtures/app/domain/avatars.test.ko.json";

const refs: AvatarRef[] = [
  { kind: "room", id: 10000001, url: "/api/avatars/room/10000001?v=100" },
  { kind: "person", id: 10000001, url: "/api/avatars/person/10000001?v=200" },
  { kind: "person", id: 10000003, url: "/api/avatars/person/10000003?v=300" }
];

const index = avatarIndex(refs, (path) => `/bmo${path}`);

describe("the pictures the console holds", () => {
  test("are found by whose they are, so a room and a person of one number stay apart", () => {
    expect(index.get(avatarKey("room", 10000001))).toBe("/bmo/api/avatars/room/10000001?v=100");
    expect(index.get(avatarKey("person", 10000001))).toBe("/bmo/api/avatars/person/10000001?v=200");
  });

  test("carry the moment they were taken, so a browser keeps one until it changes", () => {
    const later = avatarIndex(
      [{ kind: "room", id: 10000001, url: "/api/avatars/room/10000001?v=999" }],
      (path) => `/bmo${path}`
    );

    expect(later.get(avatarKey("room", 10000001))).not.toBe(index.get(avatarKey("room", 10000001)));
  });
});

describe("what a name stands as when there is no picture", () => {
  test("is its first letter, Korean or Latin", () => {
    expect(initialOf(KO.line_33)).toBe(KO.line_33_2);
    expect(initialOf("grace")).toBe("G");
    expect(initialOf(KO.line_35)).toBe(KO.line_35_2);
  });

  test("is the first letter or digit, never a mark", () => {
    expect(initialOf("-1000000000002")).toBe("1");
    expect(initialOf("…")).toBe("");
    expect(initialOf("")).toBe("");
  });
});

describe("what one room or one person wears", () => {
  test("the picture, where there is one", () => {
    expect(avatarFor(index, "person", 10000003, "agent-a")).toMatchObject({
      src: "/bmo/api/avatars/person/10000003?v=300",
      alt: "agent-a"
    });
  });

  test("the first letter of the name, where there is none, on a colour of its own", () => {
    expect(avatarFor(index, "person", 50000005, "Grace")).toEqual({
      text: "G",
      class: `${FACE_TONES[hueOf(50000005, "Grace")]} text-white`,
      ui: { fallback: "text-inherit" },
      alt: "Grace"
    });
    expect(avatarFor(index, "room", -1000000000002, "Charlie Room").text).toBe("C");
  });

  test("a colour of the identity's own, so two letters alike are still told apart", () => {
    const one = avatarFor(new Map(), "room", -1, "Worker C");
    const other = avatarFor(new Map(), "room", -2, "Worker C");

    expect(one.text).toBe(other.text);
    expect(one.class).not.toBe(other.class);
  });

  test("the chat agent's letter where it has no picture, as every other name's: no chat agent wears a mark of its own", () => {
    registerChatAgent({ name: "agent-a", label: "Agent A" });

    try {
      expect(avatarFor(new Map(), "person", 10000003, "agent-a").icon).toBeUndefined();
      expect(avatarFor(new Map(), "person", 10000003, "agent-a").text).toBe("A");
      expect(avatarFor(new Map(), "person", 10000003, "agent-b").icon).toBeUndefined();
    } finally {
      registerChatAgent({ name: "", label: "" });
    }
  });

  test("the mark of its kind, where the name says nothing", () => {
    expect(avatarFor(new Map(), "room", -1, "")).toEqual({ icon: "i-material-symbols-chat-bubble-outline", alt: "" });
    expect(avatarFor(new Map(), "person", null, "")).toEqual({ icon: "i-material-symbols-person-outline", alt: "" });
  });

  test("never a broken picture: a sender the archive has no number for falls back too", () => {
    expect(avatarFor(index, "person", null, KO.line_81).text).toBe(KO.line_81_2);
  });
});

describe("the mark an item wears in place of its name", () => {
  test("is the picture where there is one", () => {
    const mark = identityMark("mail:bob@example.com", "Bob", { picture: "/p.png?v=1" });

    // The kept picture is what the viewer opens whole; the browser draws the face from a copy of its own size.
    expect(mark.src).toBe("/p.png?v=1");
    expect(mark.alt).toBe("Bob");
    expect(mark.as).toEqual({ img: DrawnImage });
  });

  test("is one letter on one of the palette's tones, the same for one key every time", () => {
    const mark = identityMark("mail:bob@example.com", "Bob");

    expect(mark.text).toBe("B");
    expect(mark.class).toBe(identityMark("mail:BOB@EXAMPLE.COM", "Bob").class);
    expect(AVATAR_TONES.some((tone) => String(mark.class).startsWith(tone))).toBe(true);
  });

  test("falls to the icon it was given only where the name carries no letter at all", () => {
    expect(identityMark("room:-1", "…", { icon: "i-mark" })).toEqual({ icon: "i-mark", alt: "…" });
    expect(identityMark("room:-1", "…").text).toBe("?");
  });
});
