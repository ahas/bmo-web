import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { getMultipartBoundary, MultipartParseError, parseMultipartStream } from "@remix-run/multipart-parser/future";
import { FormDataEncoder } from "form-data-encoder";

import { wording } from "#shared/wording";

import { fail } from "./fail";
import { consoleDataRoot } from "./send-keys";

import type { FileLike, FormDataEntryValue, FormDataLike } from "form-data-encoder";
import type { H3Event } from "h3";

// A form of files carried from the browser to another unit without ever being held whole in this process (docs/web.md,
// the room screen's input box): read as it arrives, each file written as its bytes come to a scratch file in the
// console's data folder, and sent on as a stream read back from those files. The form is read by a streaming
// multipart parser and written by a streaming encoder; neither sets a limit of its own on a file, on how many there
// are or on the whole.

/** One file a form carried, kept on disk until the form is dropped. */
export interface SpooledFile {
  name: string;
  type: string;
  size: number;
  path: string;
}

/** A form read off a request: its text fields, the first of each name, and its files in the order they came. */
export interface SpooledForm {
  fields: ReadonlyMap<string, string>;
  files: readonly SpooledFile[];
  /** Removes the form's scratch files; a form is dropped once its send has answered or failed. */
  drop: () => Promise<void>;
}

/** A form ready to send: its body as a stream, and the headers that frame it, its length among them. */
export interface StreamedForm {
  body: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
}

// A scratch folder older than this belongs to a send whose process was stopped before it could drop its form.
const LEFTOVER_MS = 24 * 60 * 60 * 1000;
// How often the leftovers are looked for, at most, while forms come in.
const SWEEP_EVERY_MS = 60 * 60 * 1000;

let sweptAt = 0;

function uploadsRoot(): string {
  return join(consoleDataRoot(), "console-uploads");
}

/**
 * The body of a request as the stream it arrives as. The console's production entry hands Nitro the request's own
 * stream as the body (docs/web.md, 「Running as a service」), which h3's own reader would gather whole before handing
 * it on; any other server's body, and an event made from a web request with no node request beneath it, is read
 * through h3's stream.
 */
export function requestStream(event: H3Event): ReadableStream<Uint8Array> | undefined {
  const request: unknown = event.node?.req;
  const handed: unknown = typeof request === "object" && request !== null ? Reflect.get(request, "body") : undefined;

  return handed instanceof ReadableStream ? (handed as ReadableStream<Uint8Array>) : getRequestWebStream(event);
}

/**
 * The multipart form a request carries, read as it arrives: the parts named `fileField` that carry a file each
 * written to a scratch file, every other part with no file read as text, at most `fieldMostChars` characters of it,
 * and anything else let go unread. A body that is no multipart form carries nothing; one that breaks off or is no
 * well-formed form is refused 400, and a text field past its bound 400 with the pack's sentence for it.
 */
export async function spoolForm(event: H3Event, fileField: string, fieldMostChars: number): Promise<SpooledForm> {
  const stream = requestStream(event);
  const boundary = getMultipartBoundary(getRequestHeader(event, "content-type") ?? "");
  const fields = new Map<string, string>();
  const files: SpooledFile[] = [];

  if (stream === undefined || boundary === null) return { fields, files, drop: async () => {} };

  await mkdir(uploadsRoot(), { recursive: true });
  void sweepLeftovers();

  const folder = await mkdtemp(join(uploadsRoot(), "form-"));
  const drop = async () => await rm(folder, { recursive: true, force: true });

  try {
    const parts = parseMultipartStream(stream, { boundary, maxFileSize: Infinity, maxParts: Infinity, maxTotalSize: Infinity });

    for await (const part of parts) {
      if (part.isFile) {
        if (part.name !== fileField) continue;

        // The name a file is kept under on disk is this route's own; the browser's name only travels with it.
        const path = join(folder, String(files.length));

        files.push({ name: part.filename ?? "attachment", type: part.mediaType ?? "", size: await written(part, path), path });
      } else if (part.name !== undefined && !fields.has(part.name)) {
        fields.set(part.name, await boundedText(part, fieldMostChars));
      }
    }
  } catch (error) {
    await drop();

    if (error instanceof MultipartParseError) throw fail(400, wording("common.error.form_broken"));

    throw error;
  }

  return { fields, files, drop };
}

// A file's bytes written to disk as they come, each piece flushed before the next is read so none gathers in memory;
// how many bytes it held.
async function written(content: AsyncIterable<Uint8Array>, path: string): Promise<number> {
  const sink = Bun.file(path).writer();
  let size = 0;

  try {
    for await (const chunk of content) {
      sink.write(chunk);
      await sink.flush();
      size += chunk.byteLength;
    }
  } finally {
    await sink.end();
  }

  return size;
}

// A text field's words, refused where they run past the bound: a character is at most four bytes, so a field longer
// than four bytes a character is past it however it is written, and is let go unread from there.
async function boundedText(part: AsyncIterable<Uint8Array>, mostChars: number): Promise<string> {
  const mostBytes = mostChars * 4;
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  for await (const chunk of part) {
    bytes += chunk.byteLength;

    if (bytes > mostBytes) throw fail(400, wording("common.error.too_long", { n: mostChars.toLocaleString("ko-KR") }));

    chunks.push(chunk);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Scratch folders a stopped process left behind, taken away once they are past any send still carrying them.
async function sweepLeftovers(): Promise<void> {
  const now = Date.now();

  if (now - sweptAt < SWEEP_EVERY_MS) return;

  sweptAt = now;

  try {
    for (const name of await readdir(uploadsRoot())) {
      const path = join(uploadsRoot(), name);

      if (now - (await stat(path)).mtimeMs > LEFTOVER_MS) await rm(path, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`the upload scratch folders could not be swept: ${String(error)}`);
  }
}

/**
 * A form sent on as a stream: the text fields, then the files, each file read from its scratch file as the receiving
 * unit takes it. The frame states the whole length, so a unit that reads a form by its length gets one.
 */
export function streamedForm(fields: readonly [string, string][], files: readonly SpooledFile[], fileField: string): StreamedForm {
  const form = new EntryForm();

  for (const [name, value] of fields) form.append(name, value);
  for (const file of files) form.append(fileField, scratchFile(file));

  const encoder = new FormDataEncoder(form);
  const pieces = encoder.encode();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await pieces.next();

      if (next.done === true) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await pieces.return(undefined);
    }
  });

  return { body, headers: { ...encoder.headers } };
}

// A file the encoder reads from disk only as it writes that part.
function scratchFile(file: SpooledFile): FileLike {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: 0,
    stream: () => Bun.file(file.path).stream(),
    [Symbol.toStringTag]: "File"
  };
}

// The form the encoder reads, as the entries it was handed. The runtime's own FormData keeps a file as a plain blob the
// encoder would write as text, and sends a disk-backed file only by reading it whole, so the entries are kept here.
class EntryForm implements FormDataLike {
  readonly #entries: [string, FormDataEntryValue][] = [];

  append(name: string, value: FormDataEntryValue): void {
    this.#entries.push([name, value]);
  }

  getAll(name: string): FormDataEntryValue[] {
    return this.#entries.filter(([held]) => held === name).map(([, value]) => value);
  }

  entries(): IterableIterator<[string, FormDataEntryValue]> {
    return this.#entries[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<[string, FormDataEntryValue]> {
    return this.entries();
  }

  get [Symbol.toStringTag](): string {
    return "FormData";
  }
}
