// Whether a field of a form differs from what is saved, read the way bmo-ui's opened-with snapshot reads a form's
// values (its docs/components.md, its forms; docs/web.md, 「Forms」), so what a save sends and whether the form holds a
// change never disagree: text trimmed, a number as the text an input writes for it, every kind of nothing alike, a
// record without its empty keys and in any order, and a list item by item in its order.

function meaning(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case "string":
      return value.trim() === "" ? null : value.trim();
    case "number":
      return Number.isNaN(value) ? null : String(value);
    case "object":
      break;
    default:
      return value;
  }

  if (Array.isArray(value)) return value.length === 0 ? null : value.map(meaning);

  const kept = Object.entries(value as Record<string, unknown>)
    .map(([key, one]): [string, unknown] => [key, meaning(one)])
    .filter(([, one]) => one !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return kept.length === 0 ? null : kept;
}

/** Whether two values of a form's field mean the same. */
export function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(meaning(first)) === JSON.stringify(meaning(second));
}
