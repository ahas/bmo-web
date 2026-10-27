import { describe, expect, test } from "bun:test";

import { recordingType, voiceExtension, voiceFileName } from "../../../apps/web/app/domain/voice";

describe("a voice note's recording type", () => {
  test("takes the first container the browser supports, in the order a chat service carries one", () => {
    expect(recordingType(() => true)?.extension).toBe("ogg");
    expect(recordingType((type) => type === "audio/mp4")?.extension).toBe("m4a");
    expect(recordingType((type) => type === "audio/webm;codecs=opus")?.extension).toBe("webm");
  });

  test("names no type where the browser supports none of them", () => {
    expect(recordingType(() => false)).toBeNull();
  });

  test("names a recording by the moment it was made and its container", () => {
    expect(voiceFileName(1_700_000_000_000, "audio/ogg;codecs=opus")).toBe("voice-1700000000000.ogg");
    expect(voiceFileName(1_700_000_000_000, "audio/mp4")).toBe("voice-1700000000000.m4a");
    expect(voiceFileName(1_700_000_000_000, "audio/mp4;codecs=opus")).toBe("voice-1700000000000.m4a");
    expect(voiceExtension("audio/unknown")).toBe("webm");
  });
});
