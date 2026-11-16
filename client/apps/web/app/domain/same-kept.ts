// A value read again is handed to the screen as the one already in hand wherever the two say the same, so a part
// handed it draws nothing again (docs/web.md, 「What the stream costs a tab」). What a read brings is plain data, so its
// written form is what is compared.

// The written form of each value already compared, so a value in hand is written once however many reads it is
// compared with. What is handed here is never changed in place: a change is a new value.
const forms = new WeakMap<object, string>();

function formOf(value: unknown): string {
  if (typeof value !== "object" || value === null) return JSON.stringify(value) ?? "";

  let form = forms.get(value);

  if (form === undefined) {
    form = JSON.stringify(value);
    forms.set(value, form);
  }

  return form;
}

// The value read again, or the one in hand where the two say the same.
export function sameKept<T>(before: T | undefined, next: T): T {
  return before !== undefined && formOf(before) === formOf(next) ? before : next;
}

// The rows read again, each that says the same as the row in hand under the same key kept as that row, and the very
// list in hand where every row and their order are as they were.
export function sameRowsKept<T>(before: readonly T[] | undefined, next: T[], keyOf: (row: T) => string): T[] {
  if (before === undefined) return next;

  const held = new Map(before.map((row) => [keyOf(row), row]));
  const kept = next.map((row) => {
    const had = held.get(keyOf(row));

    return had !== undefined && formOf(had) === formOf(row) ? had : row;
  });

  return kept.length === before.length && kept.every((row, at) => row === before[at]) ? (before as T[]) : kept;
}
