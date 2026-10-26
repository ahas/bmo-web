// A value a tool was handed or a builder answered, written for a reader rather than as JSON (docs/web.md, 「A value
// shown as what it is」): a string as it stands, a number or a yes-or-no as its literal, an object as its named
// fields one to a line, each nested object or list one step in under its name, and a list as its members, one to a
// line under a dash.

const INDENT = "  ";

/** A value as named fields and rows, never as JSON text. */
export function valueText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);

  const pad = INDENT.repeat(depth);
  const nested = (one: unknown): boolean => one !== null && typeof one === "object" && (Array.isArray(one) ? one.length > 0 : Object.keys(one).length > 0);

  if (Array.isArray(value)) {
    return value
      .map((one) => (nested(one) ? `${pad}-\n${valueText(one, depth + 1)}` : `${pad}- ${valueText(one, depth + 1)}`))
      .join("\n");
  }

  return Object.entries(value)
    .map(([key, one]) => (nested(one) ? `${pad}${key}:\n${valueText(one, depth + 1)}` : `${pad}${key}: ${valueText(one, depth + 1)}`))
    .join("\n");
}
