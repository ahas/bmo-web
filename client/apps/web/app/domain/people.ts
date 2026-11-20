import { placeOf } from "./invites";
import { rosterAddress } from "./roster";

import type { JumpGroup } from "./jump";
import type { PersonView } from "#shared/people";
import type { RosterPerson } from "#shared/roster";
import type { Translate } from "#shared/wording";

// The people of the reader's organisation in the console search (docs/web.md, 「Sidebar」; docs/accounts.md,
// 「The people directory」): each opens the person's page, the organisation stands beside the name, and the job
// title and the contact details — where the account service let this reader see them — are matched too.

export function peopleGroup(t: Translate, people: readonly PersonView[]): JumpGroup {
  return {
    id: "people",
    label: t("app.label.search_people"),
    entries: people.map((person) => ({
      id: `person-${person.user}`,
      label: person.name,
      prefix: person.organization,
      to: `/people/${encodeURIComponent(person.user)}`,
      icon: "i-material-symbols-person-outline",
      hidden: [
        ...(person.jobTitle === "" ? [] : [{ label: t("people.label.job_title"), text: person.jobTitle }]),
        ...(person.landline === undefined || person.landline === "" ? [] : [{ label: t("people.label.landline"), text: person.landline }]),
        ...(person.mobile === undefined || person.mobile === "" ? [] : [{ label: t("people.label.mobile"), text: person.mobile }]),
        ...(person.email === undefined || person.email === "" ? [] : [{ label: t("people.label.email"), text: person.email }])
      ]
    }))
  };
}

/**
 * The people the organisation screen's people tab reaches, for a reader who opens it (docs/web.md, 「Sidebar」): found by
 * that tab's search, each opening the person on the tab, the company and the unit beside the name, and the login, the
 * job title and the email the reader may see matched too.
 */
export function rosterGroup(t: Translate, people: readonly RosterPerson[]): JumpGroup {
  return {
    id: "people",
    label: t("app.label.search_people"),
    entries: people.map((person) => ({
      id: `person-${person.user}`,
      label: person.name,
      prefix: placeOf(person),
      to: rosterAddress(person.user, person.company.id),
      icon: "i-material-symbols-person-outline",
      hidden: [
        { label: t("account.label.user_id"), text: person.login },
        ...(person.jobTitle === "" ? [] : [{ label: t("people.label.job_title"), text: person.jobTitle }]),
        ...(person.email === undefined || person.email === "" ? [] : [{ label: t("people.label.email"), text: person.email }])
      ]
    }))
  };
}

/** The name a person is shown by: their person's name, their login where none stands (docs/accounts.md, 「Users and
 * senders」). */
export function shownName(user: { name: string; fullName?: string | null }): string {
  return user.fullName ? user.fullName : user.name;
}
