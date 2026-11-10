import type { PersonView } from "#shared/people";

// The people directory the console offers a screen a unit brings (docs/web.md, 「The title bar」; bmo-ui's
// `docs/console-bundles.md`, the people directory): the directory's own reads for the signed-in login, with the
// contact fields left out, so a bundle names an assignee or an author by name rather than by key.

/** The key a screen a unit brings reads the console's people directory by. */
export const CONSOLE_PEOPLE = "bmo-console-people";

/** One person as the offer hands them on: the account key, the name, the organisation and the job title. */
export interface OfferedPerson {
  user: string;
  name: string;
  organization: string;
  jobTitle: string;
}

/** What the console offers: a search of the reader's organisation, one account read by its key, and the
 * signed-in reader's own account. */
export interface ConsolePeopleOffer {
  search: (words: string) => Promise<OfferedPerson[]>;
  person: (user: string) => Promise<OfferedPerson | null>;
  me: () => Promise<OfferedPerson | null>;
}

function offered(person: PersonView): OfferedPerson {
  return { user: person.user, name: person.name, organization: person.organization, jobTitle: person.jobTitle };
}

/** Offers the directory to every screen under the layout. */
export function provideConsolePeople(): void {
  const { user } = useUserSession();

  async function person(key: string): Promise<OfferedPerson | null> {
    try {
      return offered(await $fetch<PersonView>(`/api/people/${encodeURIComponent(key)}`));
    } catch {
      return null;
    }
  }

  provide<ConsolePeopleOffer>(CONSOLE_PEOPLE, {
    search: async (words) => {
      if (words.trim() === "") return [];

      const found = await $fetch<PersonView[]>("/api/people/search", { query: { q: words } });

      return found.slice(0, 20).map(offered);
    },
    person,
    // The login's account is the one its seal names, the owner key the console sets on every relayed call.
    me: async () => {
      const id = user.value?.id;

      if (id === undefined || id === null) return null;

      return (await person(String(id))) ?? { user: String(id), name: user.value?.name ?? String(id), organization: "", jobTitle: "" };
    }
  });
}
