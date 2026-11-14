// The browser harness's KakaoTalk-sized room, as its stand-in receiver numbers it and the tests that read it name it:
// a room whose chat service numbers its messages past 2^53, forty-five neighbours a JavaScript number reads as one or
// two, so a row key, a paging cursor, a reply, a reaction or a picture that rounded an id would name the wrong
// message or none (docs/web.md, 「A message's id」). The line is longer than a page, its newest message answers one
// on the page before, two of its pictures went out as one album and a third alone, and one carries a kept file.

export const HIGH_ROOM = 45;

const FIRST = 3_973_025_898_369_061_000n;

/** The room's line, oldest first, by each message's exact id. */
export const HIGH_LINE: readonly string[] = Array.from({ length: 45 }, (_, at) => String(FIRST + BigInt(at)));

/** The words each message of the line says, by its place. */
export function highWords(at: number): string {
  return `high line ${at}`;
}

/** The places of the line's pictures: an album of two, named by its first picture, and one sent alone. */
export const HIGH_ALBUM: readonly number[] = [40, 41];
export const HIGH_PICTURE = 42;

/** The place of the message carrying a kept file, its name and its words. */
export const HIGH_FILE = 43;
export const HIGH_FILE_NAME = "high-notes.txt";
export const HIGH_FILE_WORDS = "notes kept under a high number";

/** The place of the message the newest one answers, on the page before the room's end. */
export const HIGH_ANSWERED = 3;

/** The id the stand-in gives the nth message the owner sends into the room, from 0. */
export function highSent(nth: number): string {
  return String(FIRST + 1_000n + BigInt(nth));
}
