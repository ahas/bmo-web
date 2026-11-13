import { describe, expect, test } from "bun:test";

import { kindFaults, requestFieldsOf, requestRefusalOf, secretFileOf, secretRequestOf, secretRequestOfLink, withoutRequest } from "../../apps/web/shared/secret-kinds";

import type { SecretField, SecretKind } from "../../apps/web/shared/secret-kinds";

// Secret kinds, the files they shape and the requests an address carries (docs/web.md, 「Settings」, the secret
// store section; docs/accounts.md, 「Secret kinds」).

const line = (key: string, required = true): SecretField => ({ key, label: key.toLowerCase(), masked: false, input: "line", required });
const none = { texts: {}, files: {} };

describe("a kind's rules", () => {
  const kind: SecretKind = { key: "unit-login", name: "unit login", description: "", fields: [line("USER"), line("PASS")] };

  test("a kind that keeps them breaks none", () => {
    expect(kindFaults(kind)).toEqual([]);
  });

  test("each rule broken is named, on the field it is broken on", () => {
    expect(kindFaults({ ...kind, key: "Unit" }).map((fault) => fault.problem)).toEqual(["key"]);
    expect(kindFaults({ ...kind, name: " " }).map((fault) => fault.problem)).toEqual(["name"]);
    expect(kindFaults({ ...kind, fields: [] }).map((fault) => fault.problem)).toEqual(["no_fields"]);
    expect(kindFaults({ ...kind, fields: [line("USER"), line("1PASS")] })).toEqual([{ problem: "field_key", field: 1 }]);
    expect(kindFaults({ ...kind, fields: [line("USER"), line("USER")] })).toEqual([{ problem: "field_repeated", field: 1 }]);
    expect(kindFaults({ ...kind, fields: [line("USER"), { ...line("KEY"), input: "lines" }] })).toEqual([{ problem: "field_alone", field: 1 }]);
    expect(kindFaults({ ...kind, fields: [{ ...line("KEY"), input: "file" }] })).toEqual([]);
  });
});

describe("the file the fields make", () => {
  test("one field writes its value alone, as it was typed", () => {
    expect(secretFileOf([line("API_KEY")], { texts: { API_KEY: "value one" }, files: {} })).toEqual({ value: "value one", encoding: "text" });
  });

  test("several write a line to each field holding a value, in their order, an optional one left out", () => {
    const fields = [line("ID"), line("SECRET"), line("REGION", false)];

    expect(secretFileOf(fields, { texts: { SECRET: "s=1", ID: "i" }, files: {} })).toEqual({ value: "ID=i\nSECRET=s=1\n", encoding: "text" });
    expect(secretFileOf(fields, { texts: { ID: "i" }, files: {} })).toBeNull();
  });

  test("a file field writes the file's bytes as base64", () => {
    const bytes = new Uint8Array([0, 255, 128, 10]);

    expect(secretFileOf([{ ...line("FILE"), input: "file" }], { texts: {}, files: { FILE: bytes } })).toEqual({ value: Buffer.from(bytes).toString("base64"), encoding: "base64" });
  });

  test("fields that break a rule, or hold nothing, make no file", () => {
    expect(secretFileOf([line("A"), { ...line("B"), input: "lines" }], { texts: { A: "a", B: "b" }, files: {} })).toBeNull();
    expect(secretFileOf([line("A", false)], none)).toBeNull();
  });
});

describe("a request an address carries", () => {
  test("names the secret, its kind or its fields, and what it is for", () => {
    expect(secretRequestOf({ secret: "unit.token", kind: "api-key", for: "the deploy" })).toEqual({ name: "unit.token", kind: "api-key", fields: null, purpose: "the deploy", user: null });
    expect(secretRequestOf({ secret: "unit.env", fields: "USER,PASS*" })?.fields).toEqual([
      { key: "USER", label: "USER", masked: false, input: "line", required: true },
      { key: "PASS", label: "PASS", masked: true, input: "line", required: true }
    ]);
    expect(secretRequestOf({ settings: "account" })).toBeNull();
  });

  test("a stray mark or comma in the fields names no field", () => {
    expect(requestFieldsOf("A,,*, B*").map((field) => field.key)).toEqual(["A", "B"]);
  });

  test("is taken off the address, and the rest of the query stays", () => {
    expect(withoutRequest({ secret: "a", kind: "b", fields: "C", for: "d", user: "7", tab: "x" })).toEqual({ tab: "x" });
  });

  test("names whose space it fills: a user by their id, and none for the platform administrator's", () => {
    expect(secretRequestOf({ secret: "a.token", user: "7" })?.user).toBe(7);

    for (const user of [undefined, "", "seven", "-7", "7.5"]) {
      expect({ user, read: secretRequestOf({ secret: "a.token", user })?.user }).toEqual({ user, read: null });
    }
  });

  test("is answered by the reader it is for alone", () => {
    const deployment = secretRequestOf({ secret: "a.token" })!;
    const personal = secretRequestOf({ secret: "a.token", user: "7" })!;

    expect(requestRefusalOf(deployment, 1, true)).toBeNull();
    expect(requestRefusalOf(deployment, 7, false)).toBe("secrets.error.not_for_you");
    expect(requestRefusalOf(personal, 7, false)).toBeNull();
    expect(requestRefusalOf(personal, 1, true)).toBe("secrets.error.not_for_you");
    expect(requestRefusalOf(deployment, null, true)).toBe("secrets.error.no_space");
  });

  test("is read from a link only under one of the console's own addresses", () => {
    const bases = ["https://console.example/bmo/"];

    expect(secretRequestOfLink("https://console.example/bmo/rooms/7?secret=a.token&kind=api-key", bases)?.name).toBe("a.token");
    expect(secretRequestOfLink("https://console.example/other/rooms/7?secret=a.token", bases)).toBeNull();
    expect(secretRequestOfLink("https://elsewhere.example/bmo/rooms/7?secret=a.token", bases)).toBeNull();
    expect(secretRequestOfLink("not an address", bases)).toBeNull();
  });
});
