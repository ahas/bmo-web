import { MAX_RUN_PROMPT_LENGTH, WORKER_WORD_FILE_BYTES, WORKER_WORD_FILES } from "#shared/config";
import { fileSizeText } from "#shared/file-sizes";
import { wording } from "#shared/wording";

import type { H3Event } from "h3";
import type { WorkerWordSent } from "#shared/types";

interface WordBody {
  text?: unknown;
  worker?: unknown;
}

interface WordFile {
  name: string;
  type: string;
  data: Uint8Array<ArrayBuffer>;
}

// The agency's answer: the words were delivered, are waiting for the worker's session, or were refused. A refusal's
// reason is written for an agent; a person is told the pack's sentence.
interface WordAnswer {
  said: "delivered" | "waiting" | "refused";
  reason?: string | null;
}

// What a body may weigh before it is even read: as many files as the agency takes in one word, each at the most it
// takes, and a little for the words and the multipart's own frame. The word goes on to the agency whole, so it is
// read whole here, within that bound.
const MAX_BODY_BYTES = WORKER_WORD_FILE_BYTES * WORKER_WORD_FILES + 1024 * 1024;

// The sentence a word past the agency's bound is refused with.
function boundWords(): string {
  return wording("common.error.attachments_too_large", { n: WORKER_WORD_FILES, size: fileSizeText(WORKER_WORD_FILE_BYTES) });
}

// A word comes as JSON, or as a form when the box carries files with it.
async function readWord(event: H3Event): Promise<{ body: WordBody; files: WordFile[] }> {
  if (!(getRequestHeader(event, "content-type") ?? "").startsWith("multipart/form-data")) {
    return { body: (await readBody<WordBody>(event)) ?? {}, files: [] };
  }

  const declared = Number.parseInt(getRequestHeader(event, "content-length") ?? "", 10);

  if (Number.isSafeInteger(declared) && declared > MAX_BODY_BYTES) {
    throw fail(413, boundWords());
  }

  const parts = (await readMultipartFormData(event)) ?? [];
  const field = (name: string): string | undefined => {
    const part = parts.find((held) => held.name === name && held.filename === undefined);

    return part === undefined ? undefined : new TextDecoder().decode(part.data);
  };
  const files = parts
    .filter((part) => part.name === "file" && part.filename !== undefined)
    .map((part) => ({ name: part.filename ?? "attachment", type: part.type ?? "", data: new Uint8Array(part.data) }));

  return { body: { text: field("text") ?? "", worker: field("worker") }, files };
}

// Saying something to one worker rather than telling the agent to launch a job. Nothing is launched
// and nothing is queued: the words go to that worker's own session — into the turn it is in the
// middle of, or into a turn of its own where nothing is running — and the words and what it
// answers stand in that worker's own log, on the screen they were typed on. The agency takes them as the owner's
// alone, its `by` `owner` (its `docs/api.md`, words said to a repository's worker), and a worker's turn reads them so;
// any other account is refused here before anything reaches it (docs/web.md, 「Access」).
export default defineEventHandler(async (event): Promise<WorkerWordSent> => {
  if (!(await isOwnerLogin(await signedInUser(event)))) throw fail(403, wording("agents.error.word_owner_only"));

  const { body, files } = await readWord(event);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const worker = typeof body.worker === "string" ? body.worker.trim() : "";

  if (worker === "") {
    throw fail(400, wording("agents.error.bad_word_worker"));
  }

  if (files.length > WORKER_WORD_FILES) {
    throw fail(400, wording("common.error.attachments_too_many", { n: WORKER_WORD_FILES }));
  }

  if (files.some((file) => file.data.length > WORKER_WORD_FILE_BYTES)) {
    throw fail(413, boundWords());
  }

  if (text === "" && files.length === 0) {
    throw fail(400, wording("agents.error.word_empty"));
  }

  if (text.length > MAX_RUN_PROMPT_LENGTH) {
    throw fail(400, wording("common.error.too_long", { n: MAX_RUN_PROMPT_LENGTH }));
  }

  // The screen's worker is the repository whose worker the words are for, and the words go to that worker's own
  // session: the agency hands them over, holds them while a turn runs, or refuses them (the agency's `docs/api.md`,
  // `POST /repositories/{repositoryName}/words`).
  const answer = await agencyRoute<WordAnswer>("POST", `/repositories/${encodeURIComponent(worker)}/words`, {
    words: text,
    text,
    by: "owner",
    files: files.map((file) => ({ name: file.name, type: file.type, data: Buffer.from(file.data).toString("base64") }))
  });

  if (answer.said === "refused") {
    throw fail(502, wording("common.error.not_sent"));
  }

  return { ok: true };
});
