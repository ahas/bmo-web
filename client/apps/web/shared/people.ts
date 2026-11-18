// One person of the reader's organisation, as the console's directory and a person's page read them
// (docs/accounts.md, 「The people directory」). The contact details stand only for the platform administrator
// and for the person themselves; a member reads the name, the organisation, the title, the rank, the role, the duty
// and the posts.

export interface PersonView {
  // The user's id, as the account service names it: a string.
  user: string;
  name: string;
  organization: string;
  // The title as one line: the rank and the role where either is set, the job title kept otherwise.
  jobTitle: string;
  rank?: string;
  role?: { key: string; name: string; place: number } | null;
  duty?: string;
  // The units the person holds a post in, each with the post's role; read on a person's page.
  posts?: { unit: { id: number; name: string }; role?: { key: string; name: string; place: number } | null }[];
  landline?: string;
  mobile?: string;
  email?: string;
}

/** An organisation offered to let into a room: its number, its name and short name, the names of the units above it
 * from its company down, and how many people it lets in. */
export interface UnitChoice {
  id: number;
  name: string;
  shortName: string | null;
  path: string[];
  people: number;
}
