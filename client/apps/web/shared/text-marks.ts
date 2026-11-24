import data from "../i18n/data/ko.yaml";

// The marks a message's text opens with where it stands for something other than words, read from the data
// file beside the language pack, since the words are the language's and not the code's.

interface TextMarks {
  marks: {
    voice: string[];
    notice: string[];
    file: string[];
    picture: string[];
    sticker: string[];
    video: string[];
    video_note: string[];
    audio: string[];
    labels: { picture: string[]; pictures: string[]; video: string[]; sticker: string[] };
  };
  filed: { branch: string };
}

const MARKS = (data as TextMarks).marks;

/** The words a message's text opens with for what it carried — a file, a picture, a sticker kept as its picture, a video,
 * a round video note, a sound — each kind's every word. */
export const MEDIA_MARKS = {
  file: MARKS.file,
  picture: MARKS.picture,
  sticker: MARKS.sticker,
  video: MARKS.video,
  videoNote: MARKS.video_note,
  audio: MARKS.audio
};

/** The labels a chat client keeps as the whole text of a line that carried a thing and no words, each kind's every
 * label, matched whatever the letters' case: a picture, a count of pictures, a video and an emoticon. */
export const MEDIA_LABELS = {
  picture: labelPattern(MARKS.labels.picture),
  pictures: labelPattern(MARKS.labels.pictures),
  video: labelPattern(MARKS.labels.video),
  sticker: labelPattern(MARKS.labels.sticker)
};

/** A pattern matching a whole text that is one of the labels, `{n}` in one standing for a number. */
function labelPattern(labels: readonly string[]): RegExp {
  const alternatives = labels.map((label) => label.split("{n}").map(escaped).join(String.raw`\d+`));

  return new RegExp(`^(?:${alternatives.join("|")})$`, "iu");
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

/** The words of a row the archive kept, before the service's own lines were kept as fixed lines, as the service's
 * line opening with the notice mark: its words after the mark, or null for a row that is no such line. */
export function noticeWords(text: string): string | null {
  const mark = MARKS.notice.find((word) => text.startsWith(`${word} `));

  return mark === undefined ? null : text.slice(mark.length + 1);
}

/** The words a voice message says, as its line holds them after the mark; null for a line that is not one. */
export function spokenWords(text: string): string | null {
  const found = VOICE_MARK.exec(text);

  return found === null ? null : text.slice(found[0].length).trim();
}
