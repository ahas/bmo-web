// A voice note recorded in the console's box, as a browser makes one (docs/web.md, the room screen's section on a
// voice note). The microphone records in the first container the browser supports that a chat service carries as a
// voice message: OGG/Opus first, then MP4, then WebM. The file takes the container's extension, since a name is what
// a provider reads a sound by where its type is lost.

export interface RecordingType {
  type: string;
  extension: string;
}

const RECORDING_TYPES: readonly RecordingType[] = [
  { type: "audio/ogg;codecs=opus", extension: "ogg" },
  { type: "audio/mp4", extension: "m4a" },
  { type: "audio/webm;codecs=opus", extension: "webm" },
  { type: "audio/webm", extension: "webm" }
];

/** The first recording container a browser supports, or null where it names none it can make. */
export function recordingType(supported: (type: string) => boolean): RecordingType | null {
  return RECORDING_TYPES.find((candidate) => supported(candidate.type)) ?? null;
}

/** The extension a recording's container implies: its own where it names one, WebM where it names none. */
export function voiceExtension(type: string): string {
  const container = baseType(type);

  return RECORDING_TYPES.find((candidate) => baseType(candidate.type) === container)?.extension ?? "webm";
}

// A type as its container reads, without the codec a browser may name beside it.
function baseType(type: string): string {
  return (type.split(";")[0] ?? "").trim().toLowerCase();
}

/** The name a recording goes by: a neutral name of its own, the moment it was made and its container's extension. */
export function voiceFileName(at: number, type: string): string {
  return `voice-${at}.${voiceExtension(type)}`;
}
