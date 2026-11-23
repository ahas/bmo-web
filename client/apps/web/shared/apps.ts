// The apps a reader turns on and off (docs/web.md, 「Organisation」, the apps tab, and 「Settings」, the own apps
// section; docs/accounts.md, 「An app's two settings」): each app by its key, with the name and icon its screen's bundle
// gives it where one does, and what the delegation chain says of it for the link the screen stands for.

/** An app as a screen names it: its key, and its screen's title and icon, or none where no screen of it stands. */
export interface AppName {
  app: string;
  title: string | null;
  icon: string | null;
}

/** An app offered to the reader, as their own settings section shows it. */
export interface OwnApp extends AppName {
  // Whether it stands on for the reader.
  on: boolean;
  // The reader's own word, or null where they follow their organisation.
  own: boolean | null;
  // Whether a unit above locks it, so the reader's word changes nothing.
  locked: boolean;
}

/** An app as a unit's row on the organisation screen shows it. */
export interface UnitApp extends AppName {
  // Whether the app is offered to the unit.
  offered: boolean;
  // Whether it stands on for the unit.
  on: boolean;
  // The unit's own word, or null where it follows the link above.
  own: boolean | null;
  // Whether the unit locks it for everything under it.
  locks: boolean;
  // Whether a link above locks it.
  lockedAbove: boolean;
  // Whether the reader may change the unit's word and lock now.
  writable: boolean;
  // The platform's rule offering the app to the unit or withholding it, null where none stands: read for the
  // administrator alone, and absent for anyone else.
  offer?: boolean | null;
}

/** A change of a unit's word on an app: its own value (null to follow above), its lock, and the administrator's
 * offer (null to take the platform's rule for the unit away). */
export interface UnitAppChange {
  on?: boolean | null;
  locks?: boolean;
  offer?: boolean | null;
}
