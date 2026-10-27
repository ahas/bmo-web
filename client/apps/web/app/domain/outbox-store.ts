import { isPreviewable } from "./attachments";

import type { OutboxItem } from "./outbox";

// The lines on their way, kept in this browser until the archive carries them or they are deleted, so
// a reload, a closed tab or a restarted browser puts each back where it stood and sends on what was
// not yet answered (docs/web.md, the room screen's section on what the browser keeps). A line's state and its file are kept apart: the
// state is written again whenever it changes, the file once.

const DATABASE = "bmo-outbox";
const VERSION = 1;
const LINES = "lines";
const FILES = "files";

// One line as it is kept: everything the row holds but its file, with the room it stands in and its
// place in that room's order.
interface KeptLine extends Omit<OutboxItem, "file"> {
  chatId: number;
  place: number;
  hasFile: boolean;
}

interface KeptFile {
  key: string;
  pickedKey: string;
  file: File;
  // What makes the file a recording made in the box rather than one picked: the length it runs, which is kept
  // with it so a line restored after a reload still goes as a voice note.
  voice?: { seconds: number };
}

export interface OutboxStore {
  // The lines a room had on their way, in their order.
  load: (chatId: number) => Promise<OutboxItem[]>;
  // The room's lines as they stand now: what changed is written, what is gone is deleted.
  save: (chatId: number, items: readonly OutboxItem[]) => Promise<void>;
}

function asked<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function open(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE, VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;

    database.createObjectStore(LINES, { keyPath: "key" }).createIndex("chatId", "chatId");
    database.createObjectStore(FILES, { keyPath: "key" });
  };

  return asked(request);
}

function kept(chatId: number, held: OutboxItem, place: number): KeptLine {
  const { file, ...line } = held;

  return { ...line, chatId, place, hasFile: file !== null };
}

// The written form of a line's state, compared to tell whether it has to be written again.
function stateOf(line: KeptLine): string {
  return JSON.stringify(line);
}

// A browser that keeps nothing — storage refused, a private window that will not open the database —
// still sends: the lines live as long as the screen, as they did before anything was kept.
const forgetful: OutboxStore = {
  load: async () => [],
  save: async () => undefined
};

export function outboxStore(preview: (file: File) => string | null = defaultPreview): OutboxStore {
  if (typeof indexedDB === "undefined") {
    return forgetful;
  }

  let database: Promise<IDBDatabase> | null = null;
  // What this screen last wrote for each line, so only a change is written and only a line this
  // screen knew of is deleted: another tab's lines of the same room are left alone.
  const written = new Map<string, { chatId: number; state: string }>();
  // Writes go one after another, so a later state never lands under an earlier one.
  let queue: Promise<void> = Promise.resolve();

  const db = (): Promise<IDBDatabase> => (database ??= open());

  async function load(chatId: number): Promise<OutboxItem[]> {
    const handle = await db();
    const reading = handle.transaction([LINES, FILES], "readonly");
    const lines = (await asked(reading.objectStore(LINES).index("chatId").getAll(chatId))) as KeptLine[];
    const files = await Promise.all(
      lines.map((line) => (line.hasFile ? (asked(reading.objectStore(FILES).get(line.key)) as Promise<KeptFile | undefined>) : undefined))
    );
    const items: OutboxItem[] = [];

    lines
      .map((line, at) => ({ line, file: files[at] }))
      .sort((one, other) => one.line.startedAt - other.line.startedAt || one.line.place - other.line.place)
      .forEach(({ line, file }) => {
        // A line whose file the browser let go of has nothing left to send.
        if (line.hasFile && file === undefined) {
          return;
        }

        const { chatId: _room, place: _place, hasFile: _hasFile, ...rest } = line;

        written.set(line.key, { chatId, state: stateOf(line) });
        items.push({
          ...rest,
          file:
            file === undefined
              ? null
              : { key: file.pickedKey, file: file.file, previewUrl: preview(file.file), ...(file.voice === undefined ? {} : { voice: file.voice }) }
        });
      });

    return items;
  }

  async function write(chatId: number, items: readonly OutboxItem[]): Promise<void> {
    const lines = items.map((held, place) => ({ held, line: kept(chatId, held, place) }));
    const changed = lines.filter(({ line }) => written.get(line.key)?.state !== stateOf(line));
    const standing = new Set(lines.map(({ line }) => line.key));
    const gone = [...written].filter(([key, was]) => was.chatId === chatId && !standing.has(key)).map(([key]) => key);

    if (changed.length === 0 && gone.length === 0) {
      return;
    }

    const handle = await db();
    const writing = handle.transaction([LINES, FILES], "readwrite");

    for (const { held, line } of changed) {
      if (!written.has(line.key) && held.file !== null) {
        writing
          .objectStore(FILES)
          .put({ key: line.key, pickedKey: held.file.key, file: held.file.file, ...(held.file.voice === undefined ? {} : { voice: held.file.voice }) } satisfies KeptFile);
      }

      writing.objectStore(LINES).put(line);
    }

    for (const key of gone) {
      writing.objectStore(LINES).delete(key);
      writing.objectStore(FILES).delete(key);
    }

    await done(writing);

    for (const { line } of changed) {
      written.set(line.key, { chatId, state: stateOf(line) });
    }

    for (const key of gone) {
      written.delete(key);
    }
  }

  return {
    load: (chatId) => load(chatId).catch(() => []),
    save: (chatId, items) => {
      queue = queue.then(() => write(chatId, items)).catch(() => undefined);

      return queue;
    }
  };
}

function defaultPreview(file: File): string | null {
  return isPreviewable(file.type) ? URL.createObjectURL(file) : null;
}
