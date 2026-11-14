// A whole number a stand-in writes into its JSON as the digits it is given, past what a JavaScript number holds, as a
// unit numbering its rows with 64-bit integers writes them. The runtime's JSON.rawJSON does it; the TypeScript library
// in use does not declare it yet.

export function rawNumber(digits: string): unknown {
  return (JSON as JSON & { rawJSON(text: string): unknown }).rawJSON(digits);
}
