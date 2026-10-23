import data from "../i18n/data/ko.yaml";

// The marks a message's text opens with where it stands for something other than words, read from the data
// file beside the language pack, since the words are the language's and not the code's.

interface TextMarks {
  marks: {
    voice: string[];
    notice: string;
    file: string[];
    picture: string[];
    video: string[];
    video_note: string[];
    audio: string[];
    paste: string;
    characters: string;
  };
  filed: { branch: string };
}

const MARKS = (data as TextMarks).marks;

/** The words a message's text opens with for what it carried — a file, a picture, a video, a round video note, a sound —
 * each kind's every word. */
export const MEDIA_MARKS = {
  file: MARKS.file,
  picture: MARKS.picture,
  video: MARKS.video,
  videoNote: MARKS.video_note,
  audio: MARKS.audio
};

/** The mark a long paste stands as in the typed text: the paste word, its number and how many characters it holds. */
export function pasteMark(number: number, characters: number): string {
  return `[${MARKS.paste} ${number} · ${characters.toLocaleString("ko-KR")}${MARKS.characters}]`;
}

/** The word a Claude Workflow's branch is filed under in the name a run stores, ahead of its number. */
export const BRANCH_WORD = (data as TextMarks).filed.branch;

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A pattern matching any of one mark's words. */
export function markWords(words: readonly string[]): string {
  return `(?:${words.map(escaped).join("|")})`;
}

/** A voice message's mark: a voice word in brackets, with the recording's length where one is known. */
export const VOICE_MARK = new RegExp(`^\\[${markWords(MARKS.voice)}(?: \\d+:\\d{2})?\\]`);

/** Whether a line is sent as the service rather than in an agent's voice: it opens with the notice mark. */
export function isSystemNotice(text: string): boolean {
  return text.startsWith(`${MARKS.notice} `);
}

/** The words a voice message says, as its line holds them after the mark; null for a line that is not one. */
export function spokenWords(text: string): string | null {
  const found = VOICE_MARK.exec(text);

  return found === null ? null : text.slice(found[0].length).trim();
}
