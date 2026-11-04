// One person of the reader's organisation, as the console's directory and a person's page read them
// (docs/accounts.md, 「The people directory」). The contact details stand only for the platform administrator
// and for the person themselves; a member reads the name, the organisation and the job title.

export interface PersonView {
  // The user's id, as the account service names it: a string.
  user: string;
  name: string;
  organization: string;
  jobTitle: string;
  landline?: string;
  mobile?: string;
  email?: string;
}
