declare module "#auth-utils" {
  interface User {
    name: string;
    // The user sumida knows them by, once the multi-user model is in force (docs/web.md, 「Access」).
    id?: number;
    // The person's name people read them by, where one stands; `name` is the login (docs/accounts.md, 「Users and
    // senders」).
    fullName?: string;
  }

  interface UserSession {
    loggedInAt: number;
    // Whether the login was one the reader asked to keep. It is carried in the session itself
    // because every write reseals the cookie: a write that did not know would silently turn a
    // kept login back into one that dies with the browser.
    remember: boolean;
    // When a kept login was last resealed by a visit, so the slide knows whether it is due again.
    // A session not yet slid has none, and the login time stands in for it.
    touchedAt?: number;
    // The sumida session this seal holds, as the cookie the account service hands back, where the
    // sign-in was the service's; a console login carries none.
    sid?: string;
    // Whether that user is the platform administrator, read at the sign-in.
    administrator?: boolean;
  }
}

export {};
