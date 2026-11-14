// The runtime's JSON.rawJSON, which the TypeScript library in use does not declare yet: a value JSON.stringify
// writes as the given text itself, so a whole number past 2^53 is written as the digits it is (docs/web.md,
// 「A message's id」). Node and Bun both carry it.
interface JSON {
  rawJSON(text: string): object;
}
