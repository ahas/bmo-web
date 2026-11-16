// A name and value list as a group of a record's details stands (docs/web.md, 「Name and value lists」): one pair a
// row, the value in words, or in what the screen draws for it under the row's key, with an optional muted line under
// the value saying where it came from.

/** One name and its value. */
export interface PairRow {
  // What the screen's own drawing of the value is named by, and what tells the row from the others.
  key: string;
  label: string;
  // The value in words; none where the screen draws it itself.
  value?: string;
  // A muted line under the value.
  under?: string;
}
