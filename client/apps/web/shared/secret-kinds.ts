// Secret kinds and the files they shape (docs/web.md, the secret store section; docs/accounts.md, 「Secret kinds」;
// docs/boundary.md, 「Secret kinds」): the shape a secret is asked in, the rules the server holds a kind to, which
// the console says before asking, and the file a kind's fields make of the values typed into them. A kind holds
// the fields' shapes and never a value.

/** How a field's value is typed: one line, several lines, or a file chosen. */
export type SecretInput = "line" | "lines" | "file";

export const SECRET_INPUTS: readonly SecretInput[] = ["line", "lines", "file"];

/** One field of a kind: the key its line is written under, its label, and how its value is typed. */
export interface SecretField {
  key: string;
  label: string;
  masked: boolean;
  input: SecretInput;
  required: boolean;
}

export interface SecretKind {
  key: string;
  name: string;
  description: string;
  fields: SecretField[];
}

export interface SecretKindList {
  kinds: SecretKind[];
}

export const KIND_KEY_MAX = 64;
export const KIND_NAME_MAX = 100;
export const KIND_DESCRIPTION_MAX = 500;
export const KIND_FIELDS_MAX = 20;
export const FIELD_KEY_MAX = 128;
export const FIELD_LABEL_MAX = 100;

const KIND_KEY = /^[a-z][a-z0-9-]*$/;
const FIELD_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A rule a kind breaks, by the name the pack says it under, and the field it is broken on where it is one. */
export type KindProblem =
  | "key"
  | "name"
  | "description"
  | "no_fields"
  | "too_many_fields"
  | "field_key"
  | "field_label"
  | "field_repeated"
  | "field_alone";

export interface KindFault {
  problem: KindProblem;
  field?: number;
}

export function kindKeyIsPlain(key: string): boolean {
  return key.length > 0 && key.length <= KIND_KEY_MAX && KIND_KEY.test(key);
}

export function fieldKeyIsPlain(key: string): boolean {
  return key.length > 0 && key.length <= FIELD_KEY_MAX && FIELD_KEY.test(key);
}

/** Every rule the fields break: their keys, their labels, and that a several-line or file field stands alone. */
export function fieldFaults(fields: readonly SecretField[]): KindFault[] {
  const faults: KindFault[] = [];
  const seen = new Set<string>();

  if (fields.length === 0) faults.push({ problem: "no_fields" });
  if (fields.length > KIND_FIELDS_MAX) faults.push({ problem: "too_many_fields" });

  fields.forEach((field, at) => {
    if (!fieldKeyIsPlain(field.key)) faults.push({ problem: "field_key", field: at });
    else if (seen.has(field.key)) faults.push({ problem: "field_repeated", field: at });

    seen.add(field.key);

    const label = field.label.trim();

    if (label === "" || [...label].length > FIELD_LABEL_MAX) faults.push({ problem: "field_label", field: at });

    // A kind of several fields is one `KEY=VALUE` line to a field, so each of its fields is one line.
    if (fields.length > 1 && field.input !== "line") faults.push({ problem: "field_alone", field: at });
  });

  return faults;
}

/** Every rule a kind breaks, the server's own (docs/boundary.md, 「Secret kinds」). */
export function kindFaults(kind: SecretKind): KindFault[] {
  const faults: KindFault[] = [];
  const name = kind.name.trim();

  if (!kindKeyIsPlain(kind.key)) faults.push({ problem: "key" });
  if (name === "" || [...name].length > KIND_NAME_MAX) faults.push({ problem: "name" });
  if ([...kind.description].length > KIND_DESCRIPTION_MAX) faults.push({ problem: "description" });

  return [...faults, ...fieldFaults(kind.fields)];
}

/** What the store is handed: the file's text, or its bytes as base64 where they are a file's. */
export interface SecretFile {
  value: string;
  encoding: "text" | "base64";
}

/** The values typed into a kind's fields: a text by field key, and the bytes of a file field. */
export interface FieldValues {
  texts: Readonly<Record<string, string>>;
  files: Readonly<Record<string, Uint8Array>>;
}

/** Whether a field holds a value: a file chosen for a file field, any text for another. */
export function fieldFilled(field: SecretField, values: FieldValues): boolean {
  return field.input === "file" ? (values.files[field.key]?.length ?? 0) > 0 : (values.texts[field.key] ?? "") !== "";
}

/** Whether every required field holds a value and at least one field does. */
export function fieldsReady(fields: readonly SecretField[], values: FieldValues): boolean {
  return fields.length > 0
    && fields.every((field) => !field.required || fieldFilled(field, values))
    && fields.some((field) => fieldFilled(field, values));
}

const BASE64_CHUNK = 0x8000;

export function base64Of(bytes: Uint8Array): string {
  let binary = "";

  for (let at = 0; at < bytes.length; at += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK));
  }

  return btoa(binary);
}

/**
 * The file the fields make of their values (docs/accounts.md, 「Secret kinds」): one field gives its value alone, a
 * file's bytes unchanged; several give a `KEY=VALUE` line for each field holding a value, in their order, each
 * value as typed. Null where the fields break a rule or a required one is empty.
 */
export function secretFileOf(fields: readonly SecretField[], values: FieldValues): SecretFile | null {
  if (fieldFaults(fields).length > 0 || !fieldsReady(fields, values)) return null;

  if (fields.length === 1) {
    const field = fields[0]!;

    return field.input === "file"
      ? { value: base64Of(values.files[field.key]!), encoding: "base64" }
      : { value: values.texts[field.key] ?? "", encoding: "text" };
  }

  const lines = fields
    .filter((field) => fieldFilled(field, values))
    .map((field) => `${field.key}=${values.texts[field.key] ?? ""}`);

  return { value: `${lines.join("\n")}\n`, encoding: "text" };
}

// An agent's request for a secret, carried by an address of the console (docs/web.md, the secret store section): the name, the
// kind or the fields to ask it in, what it is for, and whose space it fills.

export const SECRET_QUERY = "secret";
export const KIND_QUERY = "kind";
export const FIELDS_QUERY = "fields";
export const PURPOSE_QUERY = "for";
export const USER_QUERY = "user";

const REQUEST_KEYS = [SECRET_QUERY, KIND_QUERY, FIELDS_QUERY, PURPOSE_QUERY, USER_QUERY];

/** The mark after a field's key in `fields=` that hides its value. */
const HIDDEN_MARK = "*";

export interface SecretRequest {
  name: string;
  // The kind a request names by its key, or null.
  kind: string | null;
  // The fields a request names where it names no kind: each one line, labelled by its key.
  fields: SecretField[] | null;
  purpose: string;
  // The user whose space the request fills, its id; null for the platform administrator's, as every request an agent
  // of no account writes is.
  user: number | null;
}

/** The user `user=` names: a whole number written in digits, or none. */
function requestUserOf(text: string | null): number | null {
  const digits = (text ?? "").trim();

  return /^\d{1,15}$/.test(digits) ? Number(digits) : null;
}

/**
 * Whether a request is the reader's to answer: one naming a user is that user's, one naming none the platform
 * administrator's, and a reader with no user of their own answers none.
 */
export function requestIsFor(request: SecretRequest, reader: number | null, administrator: boolean): boolean {
  if (reader === null) return false;

  return request.user === null ? administrator : request.user === reader;
}

/** The pack's key a reader is refused a request with: one who holds no space, or one it is not for; null where it is theirs. */
export function requestRefusalOf(request: SecretRequest, reader: number | null, administrator: boolean): string | null {
  if (reader === null) return "secrets.error.no_space";

  return requestIsFor(request, reader, administrator) ? null : "secrets.error.not_for_you";
}

/** The fields `fields=KEY,KEY*` names: each one line under its key, one ending in `*` hidden. */
export function requestFieldsOf(text: string): SecretField[] {
  return text
    .split(",")
    .map((piece) => piece.trim())
    .filter((piece) => piece !== "" && piece !== HIDDEN_MARK)
    .map((piece) => {
      const masked = piece.endsWith(HIDDEN_MARK);
      const key = masked ? piece.slice(0, -HIDDEN_MARK.length) : piece;

      return { key, label: key, masked, input: "line", required: true };
    });
}

function firstOf(value: unknown): string | null {
  const one = Array.isArray(value) ? value[0] : value;

  return typeof one === "string" ? one : null;
}

/** The request an address's query carries, null where it names no secret. */
export function secretRequestOf(query: Readonly<Record<string, unknown>>): SecretRequest | null {
  const name = firstOf(query[SECRET_QUERY]);

  if (name === null) return null;

  const kind = firstOf(query[KIND_QUERY]);
  const fields = firstOf(query[FIELDS_QUERY]);

  return {
    name: name.trim(),
    kind: kind === null || kind.trim() === "" ? null : kind.trim(),
    fields: kind === null && fields !== null ? requestFieldsOf(fields) : null,
    purpose: (firstOf(query[PURPOSE_QUERY]) ?? "").trim(),
    user: requestUserOf(firstOf(query[USER_QUERY]))
  };
}

/** The query without the keys a request is carried by. */
export function withoutRequest<T extends Readonly<Record<string, unknown>>>(query: T): Partial<T> {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !REQUEST_KEYS.includes(key))) as Partial<T>;
}

/** A request a link carries, where the link is an address under one of the console's own addresses. */
export function secretRequestOfLink(href: string, bases: readonly string[]): SecretRequest | null {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const under = bases.some((base) => {
    try {
      const own = new URL(base);
      const path = own.pathname.endsWith("/") ? own.pathname : `${own.pathname}/`;

      return url.origin === own.origin && (`${url.pathname}/`.startsWith(path) || url.pathname.startsWith(path));
    } catch {
      return false;
    }
  });

  return under ? secretRequestOf(Object.fromEntries(url.searchParams.entries())) : null;
}

/** The fields a request is asked in: its kind's where the kind stands among those kept, else its own. */
export function requestedFields(request: SecretRequest, kinds: readonly SecretKind[]): { kind: SecretKind | null; fields: SecretField[] | null } {
  const kind = request.kind === null ? null : (kinds.find((one) => one.key === request.kind) ?? null);

  return { kind, fields: kind === null ? request.fields : null };
}
