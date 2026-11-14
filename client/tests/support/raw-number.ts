// A whole number a stand-in writes into its JSON as the digits it is given, past what a JavaScript number holds, as a
// unit numbering its rows with 64-bit integers writes them. The runtime's JSON.rawJSON does it.

export function rawNumber(digits: string): unknown {
  return JSON.rawJSON(digits);
}
