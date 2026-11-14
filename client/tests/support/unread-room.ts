// The browser harness's unread room, as its stand-in receiver numbers it and the tests that read it name it: a room
// whose chat service numbers its messages past 2^53, three neighbours a JavaScript number reads as one, so a mark or a
// count that rounded an id would leave the room counting once it is read (docs/web.md, 「Unread messages」).

export const UNREAD_ROOM = 43;

/** The room's line, oldest first, by each message's exact id. */
export const UNREAD_LINE: readonly string[] = ["3973025898369060353", "3973025898369060354", "3973025898369060355"];
