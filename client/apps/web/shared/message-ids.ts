import type { ExactMessageId } from "./types";

// A message's id as the console carries it (ExactMessageId, docs/web.md, 「A message's id」): the decimal digits of
// the signed 64-bit integer the receiver numbers it with, written the one way BigInt writes them. Two ids are told
// apart by their digits, never as JavaScript numbers, which round past 2^53.

// The bounds of the signed 64-bit integer the receiver numbers a message with.
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** The message id a value names, or null where it names none: the digits of a signed 64-bit integer as BigInt
 * writes them, given as text, or a whole number a JavaScript number holds without rounding. */
export function exactMessageIdOf(value: unknown): ExactMessageId | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : null;

  if (typeof value !== "string" || !/^-?\d{1,19}$/.test(value)) return null;

  const id = BigInt(value);

  return id < INT64_MIN || id > INT64_MAX || String(id) !== value ? null : value;
}
