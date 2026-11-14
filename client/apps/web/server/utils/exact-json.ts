import { exactMessageIdOf } from "#shared/message-ids";

import type { ExactMessageId } from "#shared/types";

// Another unit's answer read with every message id in it exact (docs/web.md, 「A message's id」). A unit writes a
// message id as a JSON integer, which JSON.parse rounds past 2^53; its reviver is handed each value's own source text,
// so an integer standing under a key that names a message is handed back as the digits the unit wrote instead. The
// keys are the calling unit's contract and are named where its answers are read.

/** The JSON text read whole, each integer under one of `keys`, at any depth, kept as its digits (ExactMessageId). */
export function exactJson(text: string, keys: ReadonlySet<string>): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) =>
    keys.has(key) && typeof value === "number" ? exactMessageIdOf(context?.source) ?? String(value) : value
  );
}

/** The JSON text of a body a unit reads, each message id under one of `keys`, at any depth, written as the integer
 * its digits spell (ExactMessageId) rather than as a string. */
export function exactJsonText(value: unknown, keys: ReadonlySet<string>): string {
  return JSON.stringify(value, (key: string, field: unknown) =>
    keys.has(key) && typeof field === "string" && exactMessageIdOf(field) === field ? JSON.rawJSON(field) : field
  );
}

/**
 * A type read through `exactJson`: every number standing under one of `Keys`, at any depth, is a message's exact id,
 * null kept where the unit may write null.
 */
export type WithExactIds<T, Keys extends PropertyKey> = T extends readonly (infer Item)[]
  ? WithExactIds<Item, Keys>[]
  : T extends object
    ? { [Field in keyof T]: Field extends Keys ? ExactIdOf<T[Field]> : WithExactIds<T[Field], Keys> }
    : T;

type ExactIdOf<T> = T extends number ? ExactMessageId : T extends null | undefined ? T : WithExactIds<T, never>;
