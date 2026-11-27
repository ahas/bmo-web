# The boundary

This document is bmo-web's boundary: every route its server serves, every call its server and its console
make on another unit, the settings that name those units, and the codes its language packs render. A unit
reaches bmo-web only across it, and bmo-web reaches another unit only by the calls below: never by its code,
its tables, its files or its process.

bmo-web stands in two processes. The **server**, under `server/`, is the account service on sumida with the
language packs: the users, the senders linked to them, the grants they hold, the account model they stand in,
the supply decisions the agency asks of it, and the sentences a person reads. The **console**, under `client/`,
is the Nuxt app a person signs in to; its own server is the only caller that faces a browser, and it reaches
the server and every other unit over HTTP.

## Versioning

- **The boundary is the one of the release its commit is tagged with.** The version is the set's, in semver,
  read off the git tags when a build is made (bmo-chat's `docs/conventions.md`, 「Versions」); the server's
  health answers it.
- **A change to this document and a change to the boundary go in one commit.** A change that makes a route,
  a call or a setting different repairs this document in the same commit, stating what is true now.
- **The version moves by what changed:** the major on a change to a route or a code an existing caller reads;
  the minor on an addition of one; the patch on anything else.

## Wire conventions

These hold for every route the server serves, and the console's clients hold every unit's own conventions as
that unit's document states them. `docs/openapi.json` is the contract, generated from the client crate's own
types; `server/client/` is the Rust crate the server answers with and that document generates, and
`client/packages/server-client` is the TypeScript package generated from the same document.

- **A body is JSON, both ways,** with camelCase keys. A time is epoch milliseconds, a count a whole number,
  and a field written with a question mark may be null. A user's id is answered as the digits of sumida's whole
  number, a string a caller hands on as it stands; the supply hook's `run` is the agency's supply key for a run,
  a string as well (「Supply」); all other ids are signed 64-bit integers.
- **Every route but `GET /health` takes `Authorization: Bearer <token>`** with the server's token, and answers
  401 `unauthorized` without it. sumida's own session routes (below) take the session cookie instead and are
  reached only through the console's server.
- **A path segment is an id as it stands,** percent-encoded where it needs to be.
- **An answer with no body is 204;** one with a body is 200, or 201 where the call creates something. A read
  of one thing by its id answers 404 where it does not exist.
- **A refusal carries a body of exactly two keys:** `code`, a stable kebab-case code a caller decides on, and
  `error`, one English sentence for a person. Where a route names no closer code, the code is its status's:
  400 `bad-request` for a request wrong as asked, a body that does not read as the route's shape among them;
  401 `unauthorized` for a missing or wrong token; 403 `forbidden` for one the asker may not make; 404
  `not-found` for what does not exist; 409 `conflict` for a conflict with the present state; 500 `database`
  for the server's database, `failed` for any other failure on its side; 502 `upstream-failed` for a call on
  another unit that failed; and 503 `not-in-force` while the account model is not in force, `no-agency` where a
  person's personal supply roads are asked after and no agency is named. sumida's session routes answer sumida's own refusal shape,
  documented in the same OpenAPI document. The supply refusals `source-not-allowed`, `not-in-plan`,
  `blocked-by-organisation` and `blocked-by-administrator` are 403s of their own codes (「Supply」).

## What the server serves

### Health

| Route | Answer |
|---|---|
| `GET /health` | `ok`, `version`, `inForce` |

### The account model

| Route | Request | Answer |
|---|---|---|
| `GET /accounts/model` | | `inForce`; `why?`, where it is not in force |
| `POST /accounts/move` | `ownerSenders` (each a sender); any other field is passed over | `done`, `written`: true where this call wrote the move, false where it stood already, and `administrator?`, the user the move made the platform administrator |

- **The model is in force** once the move has been written; the server stands only on its database with
  sumida's tables and its rules registered. Until then every route but `GET /health`, `GET /accounts/model` and
  `POST /accounts/move` answers 503 `not-in-force` naming why, so no caller mistakes an absent model for a
  refusal; a caller reads that no sender is linked to a user and no grant stands.
- **The move** is written once, in one transaction, and a second call writes nothing (`docs/accounts.md`, 「The
  data move」).

### Users and senders

| Route | Request | Answer |
|---|---|---|
| `GET /senders/{sender}/user` | | `user`: the user the sender is linked to; 404 where none is |
| `POST /senders/users` | `senders`: sender numbers | `links`: each `sender`, `user` (the user it is linked to) and `signsIn` (whether that user may sign in), for the senders asked that are linked to a user, in the order asked and each once; a sender linked to none is absent |
| `GET /users` | the login's user in `Owner-Key` and role in `Owner-Role` | `users`: each `user`, `name` (the login), `fullName` (the person's name, empty where none stands), `administrator` (boolean); 403 for any login but the administrator |
| `GET /users/search?q=&limit=&room=` | the login's user in `Owner-Key` | `people`: each `user`, `name`, `organization` (the person's unit), `jobTitle` (the title as one line: composed from the rank and the role where either is set, the job title kept otherwise), `rank`, `role?` (a role reference: `key`, `name`, `place`), `duty`, and `landline?`, `mobile?`, `email?` for the administrator or the person, the people of the reader's company, of every company for the platform administrator; at most 20 without `limit`, never more than 50; 403 where the call names no user of the deployment; with `room`, the people that reader may let into that room on the entry check's own rule instead (`docs/accounts.md`, 「A room's callers」): the room's company's people, or the reader's own company's where the room stands with no leader, and none where the reader may let in none, none of them marked left; empty words then answer that set whole within the limit |
| `GET /users/members?room=` | the same | `members`: each `user` and `name` of every user of the reader's company but those marked left, in the directory's order and with no limit; 403 where the call names no user of the deployment or the reader's unit stands in no company; with `room`, the people that reader may let into it, the same set the search named for the room answers and the same leaving mark kept, in the directory's order and with no limit, and no company of the reader's own asked of |
| `GET /users/{user}/person` | the same | 200, one person in the same shape as a search row, with `posts`: each `unit` (a unit reference) and `role?`; 404 where the user does not stand or, for a reader other than the platform administrator, stands in another company |
| `GET /users/{user}` | | `user`, `name` (the login), `fullName` (the person's name, empty where none stands), `administrator` (boolean), `senders` |
| `GET /users/{user}/senders` | | `senders`: the sender numbers linked to the user; 404 where there is no such user |
| `PUT /users/{user}/senders/{sender}` | `Owner-Role: administrator` | 204: the sender is linked to the user, or already was; 404 where there is no such user, 409 `sender-linked` where another user holds it, 403 for any other role |
| `POST /users/{user}/password` | `current`, `next` | 204; 401 `wrong-password` where `current` does not match |
| `POST /users/{user}/name` | `name` | 204; 409 `name-taken` where another user holds it |
| `GET /users/{user}/profile` | the login's user in `Owner-Key` and role in `Owner-Role` | `fullName`, `jobTitle` (the job title kept), `rank`, `duty`, `landline`, `mobile`, `email`, each empty where none is kept; 403 `forbidden` for another login |
| `POST /users/{user}/profile` | the same headers, and `fullName`, `jobTitle`, `landline`, `mobile`, `email` whole, and `rank?`, `duty?`, each left as it stands where absent | 200, the profile as it now stands; 403 `forbidden` for another login |
| `GET /users/{user}/sections` | the same headers | `sections`: each `section`, `read` and `write` (booleans), the console's sections in its navigation order; 403 `forbidden` for a login that is neither the person, the administrator nor a head of a unit the person stands in |
| `PUT /users/{user}/sections` | the same headers, and `sections` whole | 200, the sections as they now stand, every write also a read; 403 `forbidden` for any login but the administrator and a head of a unit the person stands in, and for a head whose write changes a section's read or write they do not hold themselves |

- **A user** is named by its id as the server gives it, a string a caller hands on as it stands; a body naming
  a user may give it as that string or as the number it holds, and a path whose user is no id is refused 400.
- **A profile is its account's holder's or an administrator's.** The call names the login it is made for in
  `Owner-Key`, its user id written as a decimal number, and `Owner-Role`, and any other login is refused 403
  before a row is read or written. The fields are the account's own, kept by the service; a field left empty
  clears what it held.
- **A sender** is a whole number, as the receiver names a message's sender.
- **The people of a company are read by its own users,** whatever unit of it they stand in. A search is matched
  only against the fields its reader may see: the name, the unit, the job title kept, the rank, the role's name
  and the duty for every user, and the landline, mobile and email for the platform administrator or the person
  themselves. A contact field the reader may not see is
  absent from the answer and is no answer to a search (`docs/accounts.md`, 「The people directory」).
- **A title** is answered in two ways. The profile's `jobTitle` is the free text the account keeps, so a form
  writes back what it read; the directory's and the roster's `jobTitle` is the one line a reader is shown, the
  rank and then the role joined as the server's pack writes them where either is set, and the job title kept where
  neither is (`docs/accounts.md`, 「Users and senders」). `role` is the role the person carries in their home unit.
- **A console section** is named by the first part of its screen's path — `monitor`, `rooms`, `brain` — or, for
  agent management's five parts, by its tab — `supervisors`, `roles`, `repositories`, `models`, `model-files` —
  or is `live`, what runs now, which no one screen holds —
  and its `read` and `write` are relations of the deployment's `bmo_section` kind, checked through sumida's
  point check. A write is also a read, and the platform administrator passes every section. The set is written
  whole, so a section left out is taken away; a head writes it within the sections they hold themselves
  (`docs/accounts.md`, 「Console sections」).

### Organisation units

| Route | Request | Answer |
|---|---|---|
| `GET /users/{user}/unit` | | `user`, `unit`, `company`, each a unit reference (`id`, `name`), and `path`: the unit references from the company down to the user's unit; 404 where there is no such user |
| `GET /units/{unit}` | | `id`, `name`, `parent?`, `company` and `path` as above, `children` (unit references, by name), `heads` (the users granted head of this unit directly, an acting one among them) and `members` (the users whose home unit it is), each a list of user ids; `kind?` (a kind reference, `key` and `name`), `shortName?`, `reportsTo?` (a unit reference); `left`: the users of `members` whose accounts have left (`docs/accounts.md`, 「A person who leaves」); `roles`: each `user` of `members` carrying a role and its `role` (a role reference, `key`, `name` and `place`); `concurrent`: each `user` holding a post in it, `role?` and `head`; `acting?`: the appointment running, `user`, `until`, `by` and `at`, or null; 404 where there is no such unit |
| `GET /units?kind=` | the login's user in `Owner-Key` and role in `Owner-Role` | `units`: every unit, or with `kind` the units of that kind alone, each `id`, `name`, `parent?`, `heads` and `members`, `left` (the users of `members` whose accounts have left), and `kind?`, `shortName?`, `reportsTo?` (a unit id), `concurrent` (the users holding a post in it) and `acting` (the users among `heads` whose grant is an acting appointment's), companies first and each unit after its parent; 403 for any login but the administrator |
| `POST /units` | the same headers, and `name`, `parent?`, `kind?`, `shortName?`, `reportsTo?` | 201, the unit as `GET /units/{unit}` answers it; a unit with no parent is a new company; 404 where the parent does not stand; the refusals of `PATCH` for the three others |
| `PATCH /units/{unit}` | the same headers, and `name?`, `parent?`, `kind?`, `shortName?`, `reportsTo?`; each of the last three left as it stands where absent and taken away where null | 200, the unit; 409 `other-company` where the new parent or `reportsTo` stands in another company, 409 `cycle` where the parent stands under the unit itself or either would make a line pass one unit twice, 409 `short-name-taken` where another unit of the company holds the short name, case set aside, 400 `no-such-kind` for a kind the company does not keep, 400 for a short name that is not one line of 1 to 20 characters or a `reportsTo` naming the unit itself |
| `PUT /units/{unit}/heads/{user}` | the same headers | 204: the user is granted head of the unit |
| `DELETE /units/{unit}/heads/{user}` | the same headers | 204: the grant is taken away |
| `PUT /users/{user}/unit` | the same headers, and `unit` | 200, the user's unit as `GET /users/{user}/unit` answers it |
| `POST /units/{unit}/members` | the same headers, and `people`: each `user`, `from` (the unit the person stood in when the move was shown), `head` and `role?` (a role key; null for none; where absent, kept by a person who stays and none for one who comes) | 200, the unit as `GET /units/{unit}` answers it, with every person standing in it and holding or not holding its head as `head` says; 400 for no people or a person named twice, 404 where the unit or a user does not stand, 409 `left` for an account that has left, 409 `moved` where a person no longer stands in `from`, 400 `no-such-role` for a role the unit's company does not keep |
| `GET /units/{unit}/line` | the login's user in `Owner-Key` | `steps`, the unit first and its company last: each `unit` (a unit reference), `kind?`, `shortName?`, `via` (`start` for the unit itself, `reports-to` or `parent`, how the step was reached from the one before), `heads` (each `user`, `name`, `acting` and `concurrent`) and `roles` (each `role`, a role reference, and its `holders`, each `user`, `name` and `concurrent`, in the catalogue's order, a role nobody holds there absent); 403 where the call names no user of the deployment; 404 where the unit does not stand or, for a reader other than the platform administrator, stands in another company |
| `GET /units/{unit}/line/{role}` | the same | `role` (the role asked, a role reference); `holders`, each `user`, `name`, `unit` (where they hold it) and `concurrent`; `standing?`, the role the holders hold, null where nobody stands; `acting`, whether they hold a lower role than the one asked; `reason?`, `no-holder` where they do and null otherwise; 403 and 404 as the line's, and 404 for a role key the unit's company does not keep |
| `GET /units/{unit}/subtree` | the login's user in `Owner-Key` | `units`: the unit and every unit below it in tree order, the unit first and each unit followed by the units under it before its next sibling, siblings by name then id; each `id`, `name`, `parent?` (absent for a company), `kind?` (a kind reference), `shortName?`, `heads` (each `user`, `name`, `acting` and `concurrent`), `members` (each `user`, `name`, `role?`, a role reference, and `left`) and `concurrent` (each `user`, `name`, `role?` and `head`), the people of each list by name then id (`docs/accounts.md`, 「Everyone under a unit」); for the administrator and a head of the unit or of a unit above; 403 where the call names no user of the deployment or the reader heads neither; 404 where the unit does not stand or, for a reader other than the platform administrator, stands in another company |
| `PUT /units/{unit}/acting` | the login's user in `Owner-Key`, and `user`, `until` | 200, the appointment running, `user`, `until`, `by` and `at`; for the administrator and a head of a unit above; 400 `bad-period` where `until` is not still to come, 404 where the unit or the user does not stand, 409 `other-company` for a user of another company, 409 `left` for an account that has left, 409 `already-head` for a user granted the unit's head lastingly |
| `DELETE /units/{unit}/acting` | the same | 204: the appointment running ended, or none ran; for the same callers |
| `PUT /units/{unit}/posts/{user}` | the login's user in `Owner-Key`, and `role?` (a role key, or null for none) and `head` | 200, the post as `GET /users/{user}/posts` answers one; for the administrator and a head of the unit or of a unit above; 404 where the unit or the user does not stand, 409 `home-unit` where the unit is the person's home unit, 409 `other-company` where it stands in another company than their home unit, 409 `left` for an account that has left, 400 `no-such-role` |
| `DELETE /units/{unit}/posts/{user}` | the same | 204: the post and the head grant it carried taken away; 404 where the person holds no post there; for the same callers |
| `GET /users/{user}/posts` | the login's user in `Owner-Key` | `posts`, in the order of their units' paths: each `unit` (a unit reference), `path`, `role?`, `head`, `since` and `by`; 403 where the call names no user of the deployment; 404 where the user does not stand or, for a reader other than the platform administrator, stands in another company |
| `GET /units/{unit}/memory-writers` | the login's user in `Owner-Key` | `writers`, by name then id: each `user`, `name` (the person's name, the login where none stands) and `by?`, the user who gave it where a person did (`docs/accounts.md`, 「A unit's org memory」); for the administrator and a head of the unit or of a unit above; 403 where the call names no user of the deployment or one of the unit's company who heads it not; 404 where the unit does not stand or stands in another company than the reader's |
| `PUT /units/{unit}/memory-writers/{user}` | the login's user in `Owner-Key` | 204: the person holds the unit's org memory write, as they did where they held it; for the same callers; 404 where the unit or the user does not stand, 409 `other-company` for a user of another company, 409 `left` for an account that has left |
| `DELETE /units/{unit}/memory-writers/{user}` | the same | 204: the grant taken away, or none stood; for the same callers; 404 where the unit or the user does not stand |
| `GET /org-memory/units` | the login's user in `Owner-Key` and role in `Owner-Role` | `units`, companies first and each unit after its parent: each `id`, `name`, `parent?` (absent for a company), `company` (a unit reference, itself for a company) and `head`, whether the reader heads it; every unit for the administrator, else the units the reader heads and those whose org memory write they hold; 403 where the call names no user of the deployment |

- **A unit** is one of sumida's organisations, named by its whole number. A unit with no parent is a company,
  and its `company` and `path` are itself (`docs/accounts.md`, 「Companies and organisation units」).
- **`heads`** lists only the grants on the unit itself; whether a user heads a unit, through a grant on a unit
  above it as well, is the unit check below.
- **A move of several people** is written whole or not at all: one refusal leaves every person where they stood.
  A person coming from another unit is no longer granted head of the unit they leave; a grant above it stays, and
  so does a post's (`docs/accounts.md`, 「Companies and organisation units」).
- **The fields `GET /units/{unit}` answered first keep their shape,** `heads` and `members` lists of user ids among
  them; what the unit's roles, posts and appointment add stands in fields of their own beside them.
- **A unit's kind** is read by no permission, check or behaviour: two answers change with it, `GET /units?kind=` and
  the roster's `kind=`, and every other answer stays the same, its `kind` field aside (`docs/accounts.md`, 「Roles and
  unit kinds」).
- **A line** follows `reportsTo` where it is set and the parent otherwise, up to the company, and never passes one
  unit twice. `heads` on a step is its direct grants, an acting one and one a post carries among them, marked; a
  role's holders are the people of the unit carrying it and those whose post there carries it, marked
  `concurrent`. Who stands for a role is the nearest step's holders, else the next lower role's, read the same way,
  marked acting with the reason (`docs/accounts.md`, 「The line of a unit」).
- **An acting appointment** is sumida's `manager` tuple on the unit with its `expires_at` at `until`, so the unit check
  passes while it runs and fails after with no act between; naming another person ends the one running, naming
  the same person moves its end (`docs/accounts.md`, 「Acting」).
- **A unit's org memory writers** are `write` tuples on the `bmo_org_memory` object of the unit's id, the tuple's granter the giver's user id; the grant reaches that unit alone, and a head writes the unit's org memory by heading it, with no grant (`docs/accounts.md`, 「A unit's org memory」). They are given and read by the callers of a post.
- **A post's caller,** and an appointment's, is read of sumida for the user `Owner-Key` names: the platform
  administrator, or `manage` on the unit for a post and on the unit's parent for an appointment; anyone else is
  refused 403 `forbidden`.

### Permanent delete

| Route | Request | Answer |
|---|---|---|
| `GET /users/{user}/removal` | the login's user in `Owner-Key` and role in `Owner-Role` | `user`, `name` (the login), `fullName`, `left` (boolean), `administrator` (boolean), `refusal?` (the code the delete would be refused with now, or null) and `counts`: each kind of row the delete would remove and how many (`docs/accounts.md`, 「Deleting an account for good」); 404 where there is no such user; 403 for any login but a platform administrator |
| `DELETE /users/{user}` | the same headers, and `units`: each content unit's name and the counts it answered its own removal with | 200, `removed` (the counts removed here) and `record` (the removal record's id); 409 `own-account`, `owner-account`, `last-administrator` or `not-left`, in that order; 404 where there is no such user, which a caller resuming a removal takes as already done; 403 for any login but a platform administrator |
| `GET /units/{unit}/removal` | the same headers | `unit`, `name`, `company`, `units` (the subtree, the deepest first, each `id` and `name`), `people` (each `user`, `name`, `left` and `administrator`, every person whose home unit stands in the subtree), `refusal?` and `counts` (`docs/accounts.md`, 「Deleting a unit or a company」); 404 where there is no such unit; 403 as above |
| `DELETE /units/{unit}` | the same headers, and `units` as above | 200, `removed` and `record`; 409 `unit-holds-administrator` or `unit-holds-people`, in that order; 404 where there is no such unit; 403 as above |
| `GET /removals` | the same headers | `removals`, the newest first, at most 200: each `id`, `what` (`account` or `unit`), `subject` (the id), `login`, `name`, `by`, `at` and `result` (each unit's name and its counts, this service's own under `web`); 403 as above |

- **A kind** is a kebab-case English plural, and every kind the read names is named by the delete, 0 where nothing
  stood. `secrets` counts the files of the person's or the units' secret spaces.
- **The caller is a platform administrator twice over:** `Owner-Role: administrator` and an `Owner-Key` whose user
  sumida holds the platform administrator now. A refusal of the read names its code in `refusal` rather than
  refusing, so a caller tells what would stop the removal before it asks any other unit.

### Roles and unit kinds

| Route | Request | Answer |
|---|---|---|
| `GET /companies/{company}/roles` | the login's user in `Owner-Key` | `roles`: each `key`, `name` and `place`, lowest first; for anyone of the company and the administrator; 403 where the call names no user of the deployment; 404 where the company does not stand, is no company, or is not the reader's |
| `PUT /companies/{company}/roles` | the same, and `roles`: each `key` and `name`, lowest first | 200, the roles as they now stand; for the administrator and a head of the company's own unit, 403 `forbidden` for anyone else of the company; 400 `bad-catalogue` for a list out of shape, 409 `role-held` for a role removed that a person carries |
| `GET /companies/{company}/unit-kinds` | the login's user in `Owner-Key` | `kinds`: each `key` and `name`, in the company's order; for the readers of the roles |
| `PUT /companies/{company}/unit-kinds` | the same, and `kinds`: each `key` and `name` | 200, the kinds as they now stand; for the writers of the roles; 400 `bad-catalogue`, 409 `kind-held` for a kind removed that a unit carries |

- **A key** is 1 to 40 lowercase letters, digits and hyphens beginning with a letter, kept as long as its entry is;
  **a name** one line of 1 to 40 characters; at most 100 entries, no two of one key or one name, case set aside. A
  role's `place` counts from 1 for the lowest, and is the list's order as written.
- **A role reference** is `key`, `name` and `place`, and **a kind reference** `key` and `name`, as the company keeps them
  when the answer is read.

### The people roster

| Route | Request | Answer |
|---|---|---|
| `GET /people/companies` | the login's user in `Owner-Key` | `companies`: the companies the reader looks through, each a unit reference (`id`, `name`), in name order; empty for a reader who looks through none; 403 where the call names no user of the deployment |
| `GET /people?q=&company=&unit=&kind=&role=&state=&after=&limit=` | the same | `people`: each `user`, `login`, `name` (the person's name, the login where none stands), `company` and `unit` (unit references), `head` (granted head of the unit they stand in), `acting` (that grant is an acting appointment's), `administrator`, `state` (`active`, `pending` or `left`), `machine` (the machine's name, or null), `madeAt` and `lastSignInAt` (or null), `jobTitle` (the title as one line, empty where nothing is kept), `rank`, `role?` (a role reference), `duty`, `post?` (the unit reference of the post through which they count, where the page is narrowed by `unit` or `kind` and their home unit does not match it) and `email?` for the administrator alone; `total`, how many people match the whole ask; `next`, the place to ask the next page from in `after`, or null past the last; 400 for a `role` but `head` or `member`, a `state` but the three, a number that is none or an `after` that names no place; a `kind` no company the reader looks through keeps answers nobody; 403 `forbidden` for a reader who looks through no company; 404 `not-found` for a `company` or a `unit` the reader does not look through |
| `GET /people/{user}` | the same | one person in the same shape as a page row, with `landline?` and `mobile?` for the administrator alone, `path` (unit references from the company down to their unit), `headOf` (the units they are granted head of directly), `actingFor` (each `unit` and `until`, the appointments of theirs running), `posts` (as `GET /users/{user}/posts` answers them), `history` (each `at`, `by?`, `byName?`, `change` — `placed`, `role`, `head-granted`, `head-taken`, `acting`, `acting-ended`, `post-given`, `post-changed`, `post-taken` or `left` — `unit?`, `from?` (unit references), `before?`, `after?` (each `key` and `name` of a role as kept then) and `until?`, the newest first), `left` (`at`, `by`, the user who marked it, and `byName`, or null) and `machineStanding` (`name`, `shared`, `provenAt` or null; or null where no machine is bound); 400 where the user is no id; 403 `forbidden` for a reader who looks through no company; 404 `not-found` where the person stands in no company the reader looks through |

- **Who looks through what.** The platform administrator looks through every company; a user granted head of a
  company's own unit directly looks through that company and every unit under it; anyone else looks through none
  (`docs/accounts.md`, 「The people roster」).
- **A page** is in the order of the people's names, case set aside, then their user ids, 50 people where no `limit`
  is named and never more than 100. `after` is the opaque place a page's `next` names, the last person's name as
  the roster orders it and their user id, written in URL-safe base64; a caller hands it on as it stands. `q` is
  matched as the people directory's search is, the contact details for the administrator alone; `unit` takes in
  every unit under it and `kind` every unit of that kind, each counting the people whose home unit matches and,
  with `post` naming it, the people holding a post in one that does; `role` and `state` read the home unit.

### BMO profiles

| Route | Request | Answer |
|---|---|---|
| `GET /companies/{company}/agent` | the login's user in `Owner-Key` and role in `Owner-Role` | `name?`, `callNames`, `picture` (whether one is kept): the company's default for its people's BMOs; for the administrator and anyone of the company |
| `PUT /companies/{company}/agent` | the same headers, and `name?`, `callNames` | 200, the default as it now stands; for the administrator and the company's heads; 400 `bad-agent-profile` for a value out of shape |
| `GET /platform/agent` | the same headers | `name?`, `callNames`, `picture` (always false): the platform's own default, which every company setting none follows; for any caller |
| `PUT /platform/agent` | the same headers, and `name?`, `callNames` | 200, the platform's default as it now stands; for the platform administrator alone; 400 `bad-agent-profile` for a value out of shape |
| `GET /companies/{company}/agent/picture` | the same headers | the default picture's bytes, `Content-Type` its type; 404 where none is kept; for the callers of the default's `GET` |
| `PUT /companies/{company}/agent/picture` | the same headers, and the picture's bytes as the body | 204; for the callers of the default's `PUT`; 400 `not-a-picture` for bytes that are no PNG, JPEG, WebP or GIF, 413 `picture-too-large` for more than 10 MB |
| `DELETE /companies/{company}/agent/picture` | the same headers | 204: the default picture taken away; for the callers of the default's `PUT` |
| `GET /users/{user}/agent` | the same headers | `personalize`, whether the user may personalise their BMO; `company?`, their company as a unit reference; `name` (`from`, `name?`), `callNames` (`from`, `callNames`), `persona` (`from`, `persona?`) and `picture` (`from`), each `from` being `own`, `company` or `deployment`; and `own`, the person's own parts as kept, `name?`, `callNames`, `persona?` and `picture` (whether one is kept); for the user themselves, the administrator and a head of the user's unit |
| `GET /users/{user}/agent/picture` | the same headers | the bytes of the picture standing for the user, their own or their company's, `Content-Type` its type; 404 where the deployment's stands; for the same callers |
| `PUT /users/{user}/agent` | the same headers, and `name?`, `callNames`, `persona?` | 200, the profile as `GET /users/{user}/agent` answers it; for the user themselves alone; 403 `personalize-withheld` where they may not personalise their BMO, 400 `bad-agent-profile` for a value out of shape |
| `PUT /users/{user}/agent/picture` | the same headers, and the picture's bytes as the body | 204; for the user themselves alone; 403 `personalize-withheld`, 400 `not-a-picture` and 413 `picture-too-large` as above |
| `DELETE /users/{user}/agent/picture` | the same headers | 204: their own picture taken away; for the user themselves alone; 403 `personalize-withheld` as above |
| `GET /units/{unit}/agent-permissions` | the same headers | `units`: the unit and every unit below it, each after its parent, each `id`, `name`, `parent?` (absent for a company), `setting` (`allow`, `deny` or `inherit`) and `allowed` (what a person standing in it with no setting of their own resolves to); `people`: every person standing in one of them, each `user`, `name` (the person's name, the login where none stands), `unit`, `setting` and `allowed`; for the administrator and a head of the unit |
| `PUT /units/{unit}/agent-permission` | the same headers, and `setting` | 204: the setting on the unit, `inherit` removing it; for the administrator and a head of the unit |
| `PUT /users/{user}/agent-permission` | the same headers, and `setting` | 204: the setting on the person, `inherit` removing it; for the administrator and a head of the person's unit |

- **A caller a route does not name is refused 403 `forbidden`;** a company or unit that does not stand, and a unit
  that is no company where a company is named, 404 `not-found` (`docs/accounts.md`, 「A person's BMO profile」). A
  permission change below a unit that locks it on the delegation chain is refused 409 `locked`, but for the platform
  administrator's.
- **A name** is one line of 1 to 40 characters, a call name 1 to 40 with no comma, at most 10 of them and no two the
  same but for case, and a persona at most 100,000 characters; an empty name or persona is none. A picture is sent
  as the request's body, the bytes as they are, and read by its first bytes, whatever type the request names.

### Invitations

| Route | Request | Answer |
|---|---|---|
| `POST /invites` | the login's user in `Owner-Key` and role in `Owner-Role`; `unit`, `head`, `hours`, `fullName?` (the person's name) | 201, the invitation: `token`, `unit` (a unit reference), `company`, `head`, `fullName` (empty where none was given), `expiresAt`; 403 for a login that heads no unit at or above it, and for `head` from any login but the administrator; 503 `no-hub` where the settings name no hub |
| `GET /invites` | the same headers | `invites`: the open ones the login made, or every open one for the administrator, newest first |
| `GET /invites/units` | the same headers | `units`: the units the login may invite into, each `id`, `name`, `parent?` (the unit it stands under, absent for a company) and `company` (a unit reference, itself for a company), companies first and each unit after its parent |
| `DELETE /invites/{token}` | the same headers | 204; by the one who made it or the administrator |
| `GET /invites/{token}` | | `unit`, `company`, `head`, `fullName`, `expiresAt`, `state` (`open`, `expired`, `used`); 404 where no invitation has the token |
| `POST /invites/{token}/accept` | `name` (the login), `password`, `fullName?` (the person's name, the invitation's where absent or empty) | 201, `user`, `agent` (the machine name), `credential`, `hubUrl`, and `install`: `linux` and `windows`, the one-line installs; 409 `invite-closed` where it is expired or used, 409 `name-taken` where the name stands, 409 `not-ready` where the deployment's default role does not stand |
| `POST /invites/{token}/proof` | | `active`: whether the account's machine is attached and the account now enabled; `user?`, the account, where it is |
| `POST /invites/{token}/pairings/{code}/approve` | | `machine`: the desktop pairing of that code approved for the machine the invitation's account is bound to, as the account's own approval binds it (「Desktop pairing」); 409 `invite-open` where the invitation is not accepted yet, 409 `account-active` where its account is enabled already, 410 `pairing-closed` where the pairing no longer waits, 404 where no invitation has the token or no pairing the code, 503 `no-hub` where the settings name no hub |
| `POST /invites/{token}/share` | `machine`, the name of the machine to share; `owner?`, the account the asking browser is signed in to | `machine`, `state` (`bound` where `owner` is bound to the machine and the share was bound at once, `asked` where it waits for a decision), `holders` (the accounts whose binding was declared shared, empty while it waits): the invitation's account asks to share the machine another agent holds (`docs/accounts.md`, 「A machine shared at an invitation's ask」); 404 `no-machine` where the hub holds no agent of that name, 400 `bad-request` for a name the bindings never take, 409 `invite-open` and `account-active` as for a pairing, 503 `no-hub` |
| `GET /invites/{token}/share` | | `machine`, `askedAt`, `state` (`asked`, `approved`, `refused`): the invitation's account's ask; 404 where it asked for none |
| `GET /machine-shares` | `Owner-Key`, `Owner-Role` | `asks`: the open asks the reader may decide, oldest first, each `user`, `login`, `fullName`, `unit` and `company` (unit references), `machine`, `holders` (each `user`, `login`, `fullName`) and `askedAt` |
| `POST /machine-shares/{user}/approve` | `Owner-Key`, `Owner-Role` | `machine`, `state` `bound`, `holders`: the share bound; 403 for a reader who may not decide it, 404 where the account's ask no longer waits, 503 `no-hub` |
| `POST /machine-shares/{user}/refuse` | `Owner-Key`, `Owner-Role` | 204: the ask refused; 403 and 404 as above |
| `GET /users/{user}/node` | | `agent?` (the machine bound, none for an account bound to none), `shared`, whether the administrator bound it as a shared machine, `attached`, `kind?` (`desktop` or `installed`, how the agent the hub holds is connected, while it holds one), `provenAt?`, `boundAt?` (when the account was connected to the machine, none where it was not recorded), `left`, whether the account has left |
| `PUT /users/{user}/node` | `Owner-Key`, `Owner-Role`; `agent?`, the machine's name, letters, digits, `-` and `_`, at most 63; `shared?`, true to bind a machine several accounts share, false where absent | the administrator's alone, 403 for anyone else: the account bound to the machine named, or to a fresh name where none is; `agent`, `shared`, `credential`, `hubUrl`, `install` (`linux`, `windows`) and `attached`, whether the hub holds it, the binding proven where it does; 400 for a name that does not read as one, 404 for no such user, 409 `node-taken` where another account is bound to it and this binding or that one is not shared, 409 `left` for an account that has left, 503 `no-hub` where the settings name no hub |
| `PUT /users/{user}/node/shared` | `Owner-Key`, `Owner-Role`; `shared` | the administrator's alone, 403 for anyone else: the account's machine declared shared with other accounts, or no longer shared, the machine and its proof kept, answered as `GET /users/{user}/node` answers it; 404 where the account is bound to none, 409 `node-taken` for a declaration taken back while another account is bound to the machine, 503 `no-hub` where the settings name no hub |
| `DELETE /users/{user}/node` | `Owner-Key`, `Owner-Role` | 204: the account bound to no machine, by the administrator or by the account itself, named in `Owner-Key`; 403 for anyone else, 404 where it is bound to none |
| `POST /machines/{agent}/revoke` | | 200, `agent` and `left`, whether the hub sent a leave to the machine attached under that name: the name revoked at the hub, so the machine is told to leave now or at its next hello (`docs/accounts.md`, 「Invitations and a person's machine」); 409 `node-taken` where an account is still bound to the name, 400 `bad-request` for a name the bindings never take, 503 `no-hub` where the settings name no hub, 502 `upstream-failed` where the hub refuses or does not answer |
| `POST /users/{user}/node/proof` | | the account's machine as `GET /users/{user}/node` answers it, the binding recorded as proven where the hub holds it; 503 `no-hub` where the settings name no hub |
| `POST /users/{user}/leave` | `Owner-Key`, `Owner-Role` | 204: the account is marked left and its sign-in disabled, by the administrator or a head of the user's unit; 403 for anyone else |

- **The accept, the proof, the pairing's approval, the share's ask and its read and the read of an invitation take the
  server's token alone,**
  with no owner key: the console calls them for a person who has no account they can sign in with yet, by the token
  in the link (`docs/accounts.md`,
  「Invitations and a person's machine」).

### Desktop pairing

| Route | Request | Answer |
|---|---|---|
| `POST /desktop/pairings` | the asker's address in `X-Real-IP` | 201, `pairing` (the id the app keeps), `code` (`XXXX-XXXX`), `expiresAt`, `pollAfterSeconds`; 429 `too-many-pairings` past the address's tenth pairing in ten minutes or a thousand waiting in all; 503 `no-hub` where the settings name no hub |
| `GET /desktop/pairings/{pairing}` | | 202 with no body while it waits; 200 `node`, `credential`, `hubUrl` once approved, answered once and the pairing then gone, a second read 404; 410 `pairing-closed` where it is refused or expired, or the approver's account is no longer bound to the machine approved; 404 where no pairing has the id |
| `GET /desktop/pairings/code/{code}` | `Owner-Key` | `code`, `expiresAt`, `state` (`waiting`, `approved`, `refused`, `expired`), `machine?` (while waiting, the machine the reader's account is bound to; approved by the reader, the machine approved); 404 where no pairing has the code |
| `POST /desktop/pairings/code/{code}/approve` | `Owner-Key` | `machine`: the pairing bound to the reader's machine, or to a fresh binding where the account is bound to none; 410 `pairing-closed` where it no longer waits, 409 `left` for an account that has left, 404 where no pairing has the code, 503 `no-hub` |
| `POST /desktop/pairings/code/{code}/refuse` | `Owner-Key` | 204; 410 `pairing-closed` where it no longer waits, 404 where no pairing has the code |

- **A code is read with or without its dash and in either case.** `Owner-Key` naming no user is refused 403
  (`docs/accounts.md`, 「Desktop pairing」).

### Checks

| Route | Request | Answer |
|---|---|---|
| `POST /checks/unit` | `unit`, `user` | `allowed`: whether the user heads the unit or a unit above it, `grant` (`organization:<unit>#manage`); 404 where there is no such unit |
| `POST /checks/org-memory` | `unit`, `user` | `allowed`: whether the user writes the unit's org memory, heading the unit or a unit above it or holding the unit's org memory write, `grant` (`bmo_org_memory:<unit>#may_write`), `user`; 404 where there is no such unit or user |
| `POST /checks/entry` | `room`, `actor` (the user acting), `user` (the user let in or taken out), `act?` (`let-in` or `take-out`; `take-out` where absent) | `allowed`: whether the actor may do the act to the user in the room, `grant` (`bmo_room:<room>#entry`), `user`; 404 where there is no such user |

- **`grant`** is what was asked for, `kind:object#relation`, as a caller names it when it says what a user lacks;
  the entry check's names the decision alone, since the rules declare no kind for a room.
- **No check answers for a room's relation or for what an agent may do:** neither is a grant of the server's
  (`docs/accounts.md`, 「What it is」).
- **An entry check** reads the room's leaders from the receiver, its console members for letting in, and the
  actor's rights over the room's people, a manager's grant stood beside that baseline and read as silence where
  the receiver cannot answer them (「Calls the server makes」): the actor may where they are the administrator, a
  leader of the room or a head of a leader's unit, or, letting in alone, a member of the room, or hold the right
  for the act granted to them; and the user stands in the room's company, its leaders' — or, for a room with
  no leader, the actor's, but for the administrator. A receiver that does not answer the leaders or the members is
  502 `upstream-failed`; one that cannot answer the rights leaves the baseline standing.
- **The platform administrator passes every check** but the entry check's company bound.

### Phone keys

| Route | Request | Answer |
|---|---|---|
| `POST /phones` | `user` | `key`, once, and `hash`, the hash the key is kept by |
| `POST /phones/adopt` | `token`, `user` | `hash`: the earlier token kept as a key of that user |
| `POST /phones/who` | `key` | `user`, `name`, `hash`; 401 where it is no live key of a user who may sign in |
| `DELETE /phones/{hash}` | | 204 |

### The rooms a console has open

| Route | Request | Answer |
|---|---|---|
| `GET /watching` | | `rooms`, the rooms a visible console tab shows now, and `at`, when the console last reported; empty rooms where the report is older than two minutes |
| `PUT /watching` | `rooms`, the rooms a visible console tab shows now | the same `rooms` and `at` |

The console server reports the set as the tabs of every signed-in account open, close, hide or show a room, and the receiver reads it as its
restart hands each open room's unread lines to the chat agent, one room at a time. The report is kept in memory and
falls away after two minutes without one.

### Account security

The service's own (`docs/accounts.md`, 「Account security」). `holder` is the user `Owner-Key` names being the path's
`{user}`; `heads` the administrator or a head of the unit the person stands in or one above it.

| Route | Request | Answer |
|---|---|---|
| `GET /mail` | `Owner-Key` | the platform link's `mail.system` value as `server` (bmo-mail's outgoing server id, or null), `from`, `fromName`, `secret` (a secret's name or null), `configured`, `secretStands`, `mailService` (bmo-mail answered), `servers`: each `id`, `name`, `host`; 403 to anyone but the platform administrator, a unit's head among them |
| `PUT /mail` | `server`, `from`, `fromName`, `secret` | the system mail as now set, written to the platform link of the `mail.system` chain kind; 400 `bad-mail` for a field out of shape or a server bmo-mail does not offer the platform |
| `POST /mail/test` | `to` | 204; 409 `mail-unset`; 502 `mail-failed` with bmo-mail's sentence |
| `POST /sign-ins` | `login`, `password`, `deviceToken?`; `X-Real-IP`, `User-Agent` | `outcome` `signed-in` with `user` and `enrol`, the session cookie set on the answer; or `second-factor` with `ticket`. 401 `wrong-credentials`, 403 `account-disabled`, 429 `throttled` and 423 `locked` with `Retry-After` |
| `POST /sign-ins/second-factor` | `ticket`, `code`, `remember`; the same headers | `signed-in` as above, with `deviceToken` where `remember` was asked; 401 `wrong-code`, 410 `ticket-gone`, 429, 423 |
| `POST /password-resets` | `who` (a login or an email), `linkBase`; `X-Real-IP` | 202, whatever was asked |
| `GET /password-resets/{token}` | | `login`; 404 `link-gone` |
| `POST /password-resets/{token}` | `password` | 204; 400 `weak-password`; 404 `link-gone` |
| `POST /users/{user}/password-reset` | `linkBase`; `Owner-Key`, `Owner-Role` | `mailed`, and `address` (partly hidden) where mailed or `link` where not; 403 to anyone but `heads` |
| `POST /users/{user}/email/verification` | `linkBase`; `Owner-Key`, `Owner-Role` | 204; 400 `no-email`; 409 `mail-unset`; 502 `mail-failed`; the holder or the administrator |
| `POST /email-verifications/{token}` | | `address`; 404 `link-gone` |
| `GET /users/{user}/security` | `Owner-Key`, `Owner-Role` | `email`, `emailVerified`, `secondFactor`, `recoveryCodesLeft`, `secondFactorRequired`, `enabled`, `left`, `lastSignIn?`, `mail`; the holder or `heads` |
| `POST /users/{user}/second-factor` | `Owner-Key` | `secret`, `uri`, `qr` (an SVG); the holder's |
| `POST /users/{user}/second-factor/confirm` | `code`; `Owner-Key` | `recoveryCodes`; 401 `wrong-code`, 409 `nothing-waiting` |
| `POST /users/{user}/recovery-codes` | `Owner-Key` | `recoveryCodes`; 409 `no-second-factor` |
| `POST /users/{user}/second-factor/off` | `password`; `Owner-Key` | 204; 401 `wrong-password`, 409 `second-factor-required` |
| `DELETE /users/{user}/second-factor` | `Owner-Key`, `Owner-Role` | 204; `heads` alone |
| `GET /users/{user}/devices` | `Owner-Key`, `Session-Id?` | `devices`: each `id`, `address`, `userAgent`, `madeAt`, `seenAt`, `current`; the holder's |
| `DELETE /users/{user}/devices/{device}` | `Owner-Key` | 204; 404 where the account holds no such device standing |
| `POST /users/{user}/devices/others` | `Owner-Key`, `Session-Id`; `X-Real-IP`, `User-Agent` | `{}` with a fresh session cookie set on the answer; 409 `no-session` where `Session-Id` names none of the account's |
| `GET /users/{user}/sign-ins` | `Owner-Key`, `Owner-Role` | `tries`: each `at`, `outcome`, `address`, `userAgent`, the newest 50; the holder or the administrator |
| `PUT /users/{user}/enabled` | `enabled`; `Owner-Key`, `Owner-Role` | 204; 409 `own-account`, 409 `left`; the administrator's |

- **`POST /users/{user}/password`** takes `Session-Id` as well: where it names the holder's session, the answer sets a
  fresh session cookie for it, every other session of the account having ended.
- **`Session-Id`** is the value of the session cookie the console holds, `bmo.sid`'s, which the service reads only to
  find the device it names.
- **`linkBase`** is the console's public address, which a link mailed or handed opens under: `<linkBase>/reset-password?token=`
  and `<linkBase>/verify-email?token=`.

### The secret store

| Route | Request | Answer |
|---|---|---|
| `GET /users/{user}/secrets` | | `secrets`: each `name`, `bytes`, `changedAt` and `kind?`, the key of the kind its file reads as (`docs/accounts.md`, 「The secret store」), every secret the person's space holds, in the order of their names |
| `PUT /users/{user}/secrets/{name}` | `value`, `replace?`, `encoding?` | `name`, `bytes`, `changedAt`; 201 where the name was new, 200 where it replaced a value; 409 `secret-exists` where the name stands and `replace` is not true; 403 `kind-not-offered` where the file reads as a secret kind the `secret.kinds` chain does not offer this person |
| `DELETE /users/{user}/secrets/{name}` | | 204; 404 where no secret stands under the name |
| `GET /units/{unit}/secrets` | | as a person's list, every secret the unit's space holds, for a head of the unit and the platform administrator (docs/accounts.md, 「The secret store」); 403 to anyone else, 404 for a unit of no company the caller reaches |
| `PUT /units/{unit}/secrets/{name}` | `value`, `replace?`, `encoding?` | as a person's write, into the unit's space, for the same callers, `kind-not-offered` read against the unit's chain |
| `DELETE /units/{unit}/secrets/{name}` | | as a person's, in the unit's space, for the same callers |

- **Every route of the store is the space's own person's:** it takes the login's user in `Owner-Key`, the user the
  console hands on for the login it acts for (「Calls the console makes」), and refuses 403 `forbidden` a call whose
  key is not the path's `{user}`, or that names none, whatever its `Owner-Role`.
- **The store is the folder the server's `secrets.dir` setting names,** the data root's `env/`, where every unit
  reads a secret by its file name (`docs/accounts.md`, 「The secret store」). A server whose setting names no folder
  answers 503 `no-secret-store`.
- **A person's space** is `env/` itself, the platform's, for every platform administrator, as sumida names them
  at the call, and `env/users/<user>/` for any other user, `<user>` the path's decimal id; a user the service holds
  none of is refused 404. A secret's address is its name in the platform's space and `users/<user>/<name>` in
  anyone else's, relative to `env/`.
- **A name is a plain file name:** one or more of `A`–`Z`, `a`–`z`, `0`–`9`, `.`, `_` and `-`, at most 200 bytes,
  beginning with no dot and not ending in `.previous`; any other is refused 400 `bad-name`. A name that stands in the
  folder as anything but a regular file, a folder or a link among them, is refused 409 `not-a-file`, and so is one
  whose `.previous` stands so.
- **A value is never answered.** No route reads a value back: the list carries names, sizes, times and kinds, and a write
  answers the name, its size and its time. A refusal never carries the value either; a body that does not read as
  `value`, `replace?` and `encoding?` is refused 400 `bad-request` naming the shape asked for, never what was sent,
  and an empty value 400 `empty-value`.
- **`encoding` says how `value` carries its bytes:** `text`, where it is absent, writes the value's own UTF-8 bytes;
  `base64` writes the bytes the value decodes to under the standard alphabet, so a file that is not text reaches
  the store unchanged. A value that does not decode is refused 400 `bad-value`, naming nothing of it.
- **A write is atomic.** The value is written as it was sent, whole, to a hidden file beside the name with mode
  600, and moved onto the name; the value it replaces stays as `<name>.previous`, mode 600, in place of any earlier
  one. A delete moves the file to `<name>.previous` the same way. A folder that does not stand yet is made, mode
  700.
- **What is listed** is the space's regular files whose names are names as above; a `.previous` file, a hidden
  file and anything not a regular file are not, so another person's space never stands in the platform's
  list. A space whose folder does not stand yet lists none.
- **The store's routes answer 503 `not-in-force`** while the account model is not in force, as every route of the
  server's own does.

### Secret kinds

| Route | Request | Answer |
|---|---|---|
| `GET /secret-kinds` | | `kinds`: every kind, in the order they were added |
| `POST /secret-kinds` | a kind | the kind as kept, 201; 409 `kind-exists` where a kind stands under its `key`; the `secret.kinds` chain kind is re-declared to the registry as it then stands |
| `PUT /secret-kinds/{key}` | a kind, its `key` the path's | the kind as kept; 404 where no kind stands under the key (its key does not change, so the chain kind's choices stand) |
| `DELETE /secret-kinds/{key}` | | 204; 404 where no kind stands under the key; the `secret.kinds` chain kind is re-declared without it, its key taken out of every stored value and rule that named it |

- **The `secret.kinds` and `mail.system` chain kinds are this service's own** (docs/accounts.md, 「The kinds the
  service's own consumers declare」); they are declared as it stands. A unit's system mail and the kinds each link
  keeps are read and written through the chain's link routes (`/chain/kinds/{key}/links/{link}/value`), a `json`
  value such as a unit's mail named in `Declared-By: web` as this service writes it.

- **A kind is a shape the console's secret form asks a value in,** and never a value (`docs/accounts.md`,
  「Secret kinds」): `key`, `name`, `description` and `fields`, each field its `key`, `label`, `masked`, `input` and
  `required`.
- **A deployment holds the default kinds until the administrator changes them,** in this order: `api-key`,
  `account-login`, `aws-access-key`, `oauth-client`, `database`, `ssh-private-key`, `file`, `card` and
  `delivery-address`, their fields as `docs/accounts.md`, 「Secret kinds」 states them.
- **`GET /secret-kinds` answers any call,** since every person's secret form asks in the deployment's kinds; adding,
  changing and removing one takes `Owner-Role: administrator`, and any other role, or none, is refused 403
  `forbidden`. Every route answers 503 `not-in-force` while the account model is not in force.
- **A kind that breaks a rule is refused 400 `bad-kind`,** its sentence naming the rule:
  - `key` is one to 64 of `a`–`z`, `0`–`9` and `-`, beginning with a letter; `name` is one to 100 characters and
    `description` at most 500.
  - `fields` holds one to 20 fields with keys unlike each other. A field's `key` is one to 128 of `A`–`Z`, `a`–`z`,
    `0`–`9` and `_`, beginning with no digit; its `label` is one to 100 characters; its `input` is `line`, `lines` or
    `file`.
  - A kind of several fields takes `line` fields alone, since its file is one `KEY=VALUE` line to a field; a `lines`
    or `file` field stands alone in its kind.
  - A body whose `key` is not the path's is refused 400 `bad-kind` as well: a kind's key does not change.

### The delegation chain

How a setting reaches a person from the platform down through their company and units (docs/accounts.md, 「The
delegation chain」). A link is named `platform`, `unit:<id>` or `person:<user>`; a rule names whom it is for as
`person:<user>`, `group:<id>` or `unit:<id>`. A value is JSON of the kind's shape: `true` or `false` for a flag, a
string for text, `"unlimited"` or a whole number for an amount, a list of keys, or an object or a list for `json`.
The reads and writes of a link and of a group name the login they are made for in `Owner-Key`; the kinds and the
resolution answer any caller.

| Route | Request | Answer |
|---|---|---|
| `GET /chain/kinds` | | `kinds`: every kind declared, by key |
| `GET /chain/kinds/{key}` | | the kind; 404 `no-such-kind` |
| `PUT /chain/kinds/{key}` | a kind: `key` (the path's), `declaredBy`, `description`, `shape` (`flag`, `text`, `amount`, `keys`, `json`), `choices`, `mode` (`nearest`, `narrowing`, `layered`), `default?`, `rules`, `levels` (of `platform`, `unit`, `person`), `unitPermission` (`manage` where absent), `personWriter` (`heads`, `self`, `both`; `heads` where absent), `personRaises` (whether a person's own link may only raise the value, a `flag` under `nearest` alone; `false` where absent) | 200, the kind as kept; 400 `bad-kind`, 409 `kind-declared-elsewhere` for another unit's key, 409 `kind-in-use` for a shape or mode changed, or a choice taken away, while an entry stands |
| `GET /chain/kinds/{key}/resolve?person=&unit=&link=` | `person` or `unit`, the subject; `link`, a link to ask after | `kind`, `subject`, `value?` (none for a `layered` kind, and where nothing is said and no default stands), `from?` (the link it came from, none where the default stands or the kind narrows; for a person under a kind that `personRaises`, the link above them holding the `true` that stands, never their own), `rule?` (whom the rule it came from names), `layers` (every link's word for the subject, top first, each `link`, `value` and `rule?`), `lockedBy?` (the link whose lock cut the chain), `path` (every link of the subject's chain, top first), `link?` (for the link asked: `link`, `mayChange`, whether no lock above it withholds it from its writers, the platform administrator writing it all the same, and `lockedBy?`); 404 `no-such-kind`, 404 for a subject that does not stand, 400 for none or both |
| `GET /chain/kinds/{key}/links/{link}` | `Owner-Key` | the entry: `kind`, `link`, `value?`, `delegation` (`allow`, `lock`, `inherit`), `rules` (each `who` and `value`), `setBy?`, `setAt?`, `lockedBy?` (the farthest link above holding a lock), `writable` (whether the caller may change it now, true for the platform administrator under a lock); for whoever writes the link and the person at their own |
| `PUT /chain/kinds/{key}/links/{link}/value` | `Owner-Key`, `Declared-By?`, `value?` (null to follow above) | 200, the entry; 409 `consumer-written` for a `json` kind but where `Declared-By` names the unit that declared it, which judged the value |
| `PUT /chain/kinds/{key}/links/{link}/delegation` | `Owner-Key`, `delegation` | 200, the entry |
| `PUT /chain/kinds/{key}/links/{link}/rules` | `Owner-Key`, `rules` whole, each `who` and `value` | 200, the entry; 400 `bad-rule` |
| `DELETE /chain/kinds/{key}/links/{link}` | `Owner-Key` | 204: the entry taken away, the link following above |
| `GET /chain/groups?unit=` | `Owner-Key` | `groups`: the groups the unit keeps, by name, each `id`, `unit`, `name`, `members` (user ids); for the administrator and anyone of the unit's company |
| `POST /chain/groups` | `Owner-Key`, `unit`, `name`, `members` | 201, the group; 409 `group-exists`, 409 `other-company` |
| `GET /chain/groups/{group}` | `Owner-Key` | the group, for its readers |
| `PUT /chain/groups/{group}` | `Owner-Key`, `name`, `members` | 200, the group; as its `POST` |
| `DELETE /chain/groups/{group}` | `Owner-Key` | 204; 409 `group-in-use` while a rule names it |

- **A link's write** is refused 403 `forbidden` to anyone but its writers (docs/accounts.md, 「Who changes a link」),
  409 `locked` below a link holding a lock but where the platform administrator writes it, 400 `bad-link` for a link that is not of the kind's levels or a
  delegation other than `inherit` on a person's link, and 400 `bad-value` for a value not of the kind's shape. A
  link naming a unit or a person that does not stand is 404.
- **A group's write** is the administrator's and a head's of the unit keeping it; anyone else is refused 403.

### Supply

The service answers who pays for a run (docs/accounts.md, 「Supply」). The hook route is the agency's ask; the
rest are the console's, every one under the server's token with the signed-in login in `Owner-Key` and role in
`Owner-Role`, and refused 403 by the permission docs/accounts.md names. A source key is one of `personal`,
`global`, `org_credits`, `personal_credits` and `stop`; a policy's `order` holds `stop` last. The hook's money asks
take `organisation` as well, the organisation's own supply the agency takes on its own reading of the chain, which no
policy or order names (docs/accounts.md, 「Supply」). A write naming a
source an earlier layer closed is refused 403 `source-not-allowed`, or — for a person's own write naming a
source closed below the platform — by the code of the layer that closed it: `not-in-plan`,
`blocked-by-organisation` or `blocked-by-administrator`. A person's own write switching a source the platform
locks against its value is refused 403 `locked-by-platform`.

| Route | Request | Answer |
|---|---|---|
| `POST /supply/hook` | `point` (`supply`) and `ask`: `op` with `order` asking `run` (the agency's supply key for the run, a string), `account` (a number or its digits), `provider`, `model`, `kind`, `job?`, `supervisor?`, `room?`; `reserve` asking `run`, `step`, `account`, `source`, `key`; `extend` asking `run`, `step`, `account`, `source`, `reservation`, `spentUsd`, `key`; `capture` asking `run`, `step`, `account`, `source`, `reservation`, `costUsd`, `key`; `release` asking `run`, `step`, `account`, `source`, `reservation`, `key` | `answer`: `sources` for `order` (each `personal` or a platform key, `stop` left out); `accepted`, `reservation`, `amountUsd`, `expiresAt` and `reopensAt?` for `reserve`; `accepted`, `amountUsd` (the whole now) and `expiresAt` for `extend`; `taken` for `capture` and `release` |
| `GET /supply/me` | `Owner-Key` | `order` (the resolved order, `stop` last), `orderLocked`, `sources` (each source, `organisation` after `personal` and `stop` last: `source`, `allowed`, `off`, `locked`, `own?` — the person's own choice, `on` or `off`, absent where they made none — and `reason?` — `not-in-plan`, `blocked-by-organisation`, `blocked-by-administrator`), `personalCreditCredits?`, `usage` (this month per source: `source`, `credits`, `costMicros`), `globalRemaining?` (the plan's remaining included credits), `personalCredits?` (the person's wallet balance) |
| `PUT /supply/me` | `order` (not read while the order is locked), `off`, `on`, `personalCreditCredits?` | 200, the view as it now stands; refused 403 by the closing layer's code or `locked-by-platform`, 400 for a source named both on and off |
| `GET /supply/units` | `Owner-Key`, `Owner-Role` | `units`: each company whose supply the reader holds a part of, as `id`, `name`, `policy` (they hold its policy and credits, or those of a unit under it: its `credit_manager` or its head) and `plan` (they hold its plan: its `subscription_manager` or its head); every company, both true, for an administrator |
| `GET /supply/org/{unit}` | `Owner-Key`, `Owner-Role` | `unit`, `inherits` (true where the unit sets no policy), `policy?` (the row standing for the unit, own or nearest above, with `allowed`, `order`, `memberCreditCredits?` — the credit allowance standing for the unit, `docs/accounts.md`, 「Who may change and read what」 — and `from` — the unit whose row it is), `plan?` (for a `subscription_manager`: `name`, `price` in whole won, `scope`, `period`, `includedCredits`, `creditsUsable`), `wallet?` (for a policy holder: `balance`, `reserved`, `debt`), `available` (for a policy holder: the sources the platform makes available, those it turns on or leaves to a person's own setting, in the contract's order; empty for anyone else), `usage` (this month per member: `user`, `source`, `credits`) |
| `PUT /supply/org/{unit}` | `allowed`, `order`, `memberCreditCredits?` | 200, the policy as it now stands |
| `DELETE /supply/org/{unit}` | the same | 200, the unit as it now stands, the row taken away and the unit inheriting again |
| `POST /supply/org/{unit}/credits` | `amount`, `words?` | 200, `balance` and `debt` after the grant |
| `GET /supply/user/{user}` | the same | `user`, `inherits`, `policy?` (as the organisation's `policy`, without `from`), `order` (the person's resolved order), `providers` (the roads their personal supply serves, from the agency; empty where the agency answers none) |
| `PUT /supply/user/{user}` | `allowed`, `order`, `memberCreditCredits?` | 200, the person as `GET /supply/user/{user}` answers it |
| `DELETE /supply/user/{user}` | the same | 200, the person as `GET /supply/user/{user}` answers it, the policy taken away and the person following their organisation's again |
| `GET /supply/platform` | the same | `allowed`, `order`, `overridable`, `orderOverridable`, `creditsPerDollar`, `reservationCredits`, `enforce` |
| `PUT /supply/platform` | any of `allowed`, `order`, `overridable`, `orderOverridable`, `creditsPerDollar`, `reservationCredits`, `enforce` | 200, the platform row as it now stands |
| `GET /supply/org/{unit}/plans` | `Owner-Key`, `Owner-Role` | `exposed` (the plans the unit is shown, as `/supply/plans` answers each), `applied?` (`plan`, the applied plan's id, `since` and `periodEnd`, and the plan whole as the live subscription stands on it — `name`, `price`, `scope`, `period`, `includedCredits`, `creditsUsable` — whether or not it is still exposed or still stands), `catalogue?` (for an administrator: every organisation-scope plan, each as `/supply/plans` answers it with `exposed`) |
| `PUT /supply/org/{unit}/plans/exposed` | `plans`, the ids of every plan the unit is shown | 200, the unit's plans as `GET` answers them; a plan that is not organisation-scope 422 `plan-scope`, one retired or unknown 404 `unknown-plan`, the applied plan left out 409 `plan-applied` |
| `PUT /supply/org/{unit}/plans/applied` | `plan`, the id of an exposed plan or null for none; a body naming no `plan` 400 | 200, the unit's plans as `GET` answers them; a plan not exposed to the unit 409 `plan-not-exposed` |
| `GET`/`POST /supply/plans` | a read takes nothing; a write takes `name`, `price`, `scope` (`personal` or `organisation`), `period` (`day`, `week`, `month` or `year`), `includedCredits`, `creditsUsable` | `plans`, each `id`, `name`, `price` in whole won, `scope`, `period`, `includedCredits` and `creditsUsable`, newest first; 201 with the plan for a write |
| `PATCH`/`DELETE /supply/plans/{plan}` | the writable fields to change; a delete retires | 200 with the whole `plans` list as it now stands, for a change and for a retirement alike |
| `POST /supply/credits` | `ownerKind` (`user` or `organisation`), `ownerId`, `amount`, `words?` | 200, `balance` and `debt` after the grant |
| `GET /supply/credits/ledger?after=&limit=` | | `entries`, newest first, each `id`, `at`, `ownerKind`, `ownerId`, `kind` (sumida's ledger kind), `amount`, `debtChange`, `balanceAfter`, `words?`, and `next`, the place to ask the page after from or null |
| `GET /supply/credits/audit?after=&limit=` | | `entries`, newest first, each `id`, `at`, `by`, `byName`, `kind` (`grant`, `policy`, `settings` or `plan`), `subject` and `detail`, and `next` as the ledger's |

- **The hook is asked by the agency alone,** under the server's own token, and its refusals are in its answer,
  never in its status: a reservation refused for want of room answers 200 with `accepted` false. The service
  registers and unregisters it at the agency (「Calls the server makes」); with no registration the agency runs
  personal supply for a person's runs, and while `enforce` is off no `reserve` is refused.
- **Plans read and write sumida's membership plans whole:** every plan is a subscription plan carrying the
  membership action `supply` — `includedCredits` as its amount quota for the `period`, and a credit cost on
  the action where `creditsUsable` — priced by `price` in whole won at the named `scope`; a delete retires
  the plan as sumida retires it, the subscriptions standing on it keeping their snapshot.
- **A grant answers the wallet as it stands after it.** Granting to a person is a platform administrator's;
  to an organisation, its `credit_manager` or `manager`'s or an administrator's, checked by sumida's own
  grant gate as well. The ledger is the membership wallet ledger of this service's database, its grant entries
  among them; the audit is the service's own (docs/accounts.md, 「Supply」).

### Fixed lines

| Route | Request | Answer |
|---|---|---|
| `POST /words/render` | `code`, the fields the code carries beside it, `language` | `text` |

- **A fixed line** is one of the few lines no agent's session says: a code a unit answers with, rendered in
  the room's language from the server's pack. The codes it renders are the receiver's `FixedLine` codes
  (the receiver's `docs/codes.md`, 「Fixed lines」), each to the sentence it renders as:

  | Code | Fields read | The sentence |
  |---|---|---|
  | `rest-begins` | `until`, epoch seconds or null | `fixed-lines.rest_begins.until`, a system notice that names no agent, the moment told in the owner's time zone (「Settings」, `time.zone`): `rest_begins.today`, its hour and minute, where it falls on the day the line is said, else `rest_begins.another_day`, the month's word from `rest_begins.months`, the day, the hour and the minute; `fixed-lines.rest_begins.soon` where `until` is null or absent |
  | `provider-down` | none | `chat-health.rest.outage`, said as the chat agent |
  | `compacting` | none | `chat-health.fold.going` |
  | `compact-failed` | none | `chat-health.fold.failed` |
  | `run-broken` | `agent`, `cause`, `record` | `chat-health.account.line` opened by `account.broke`, its cause `causes.unknown` where none was read and its record line where one is kept; then `last_resort.speaking` with the agent and its subject particle |
  | `chat-denied` | none | `fixed-lines.chat_denied` |
  | `going-down-for-update` | `items` | `roads.service.stopping.deploying` with the items as `#n` where any, opening with no mark: the receiver keeps it as a fixed line, which the console draws as a system line |
  | `going-down` | none | `roads.service.stopping.restarting`, opening with no mark as the deployment's |
  | `supervisor-engine-error` | `kind` | `supervisors.engine_error` of the kind |
  | `supervisor-cut` | `agent`, `reason` | `fixed-lines.supervisor_cut` |
  | `still-working` | none | `fixed-lines.still_working`, rendered for a unit that names it; the receiver, whose rounds have no time bound, names it no more |
  | `memory-tidying` | none | `fixed-lines.memory_tidying`, said as the chat agent once to a room whose words arrive while the agent's session is replaced and its memory tidied |
  | `draw` | `label`, `asked`, `result`, `number`, `seed`, `method`, `answered`, `next` | `draws.line`, what was asked by `draws.spec` and what came out by `draws.dice_total` where dice are summed |
  | `account-let-in` | `account`, `by` | `fixed-lines.account_let_in` |
  | `account-left` | `account` | `fixed-lines.account_left` |
  | `account-taken-out` | `account`, `by` | `fixed-lines.account_taken_out` |
  | `accounts-let-in` | `accounts`, `by` | `fixed-lines.accounts_let_in` with the first account and how many others; `fixed-lines.account_let_in` where it names one; `fixed-lines.people_joined_by` with both named, each through `fixed-lines.person` and joined by `fixed-lines.people_joiner`, where it names two |
  | `unit-let-in` | `unitName`, `by` (`unit` and `accounts` are carried and not read) | `fixed-lines.unit_let_in`, the organisation's name with the object particle its last sound takes |
  | `people-joined` | `people`, `by` where given | `fixed-lines.people_joined_by` where `by` is given, else `fixed-lines.people_joined`, the people named as a list |
  | `person-left` | `person`, `by` where given | `fixed-lines.person_taken_out` where `by` is given, else `fixed-lines.person_left` |
  | `supply-closed` | `why` (`until` is carried and not read) | `fixed-lines.supply_closed` of the reason: `no-order`, `withheld`, `no-personal`, `own-refused`, `no-organisation`, `organisation-refused`, `no-lendable`, `shared-node`, `owned`, `refused` or `ran-out` (the agency's `docs/supply.md`, 「Why none is left」), each saying what the person can do; a reason the pack holds no sentence for, `other`. A line naming no reason is refused 400 `bad-request` |
  | `session-handed-over` | `agent`, `cause` (`asked`, `reset`, `full`, `road`, `documents` or another), `reason` where an asker gave words, `by` where a person asked | `fixed-lines.session_handed_over.reset` for `reset`, else `.handed_over`, the agent by its name with the subject particle its last sound takes; then `.why` holding the asker's words, else the words `.causes` holds for `full`, `road` or `documents`; then `.by` with who asked. A cause the pack holds no words for reads as the line alone |
  | `slept` | `agent`, `date`, `learned`, `merged`, `closed` | `fixed-lines.slept`, the agent by its name with the subject particle its last sound takes, the day it slept for and the three counts (the agency's `docs/sleep.md`) |

- **The chat agent's name** in a line is the server's `names.chat_agent` setting; no name stands in the pack.
- **An agent a line names** — `agent` on `run-broken`, `supervisor-cut`, `session-handed-over` and `slept`, the
  agent's key — stands as the name the console shows it by: the label its row at the agency carries
  (`GET /supervisors/{supervisorName}`, 「Calls the server makes」), and its key where the agency gives no label,
  names no such supervisor, is not named in the settings or does not answer within three seconds. Its particle
  is chosen by that name.
- **An account a line names** — `account`, each of `accounts` and `by` (on `session-handed-over` too), each an account's key as a number or its decimal text — stands
  as its shown name, its full name where it keeps one and else its username, read from the service's own users; a
  key no user holds stands as the key.
- **A person a chat service's line names** — each of `people`, `person` and `by` on `people-joined` and
  `person-left`, bmo-chat's `docs/contract.md`, 「Lines」 — is a `senderId` and a `name`, and stands as its `name`
  through `fixed-lines.person`; the `senderId` is carried and not read. A list of people names every one of them,
  joined by `fixed-lines.people_joiner`, as the console names the people writing in a room. A `people` list naming
  nobody is refused 400 `bad-request`.
- **`language` names one of the pack's languages** — `ko`, `en`, `ja` or `zh-CN` — as a language tag read by its
  primary subtag, so `ko-KR` is `ko` and Chinese of any region or script `zh-CN`; another language is refused 404
  `unknown-language`. A code the pack does not hold is refused 404 `unknown-code`, and a line whose fields do not
  read as its code's shape 400 `bad-request`. The caller then sends the line as its code and fields, so a room is
  never silent.
- **The receiver sends its room's language,** its own setting; a line is rendered in it, and a key that language
  lacks in the Korean.
- **The route answers whether or not the account model is in force,** since it reads no account.
- **The console's server asks it too,** for each message of the kind `fixed-line` a room's page carries with its
  line: the line's code and fields, and the reader's language. The sentence it answers stands as the message's words, and where it
  refuses or does not answer, the words the message was kept with stand (`docs/web.md`, 「A fixed line stands as a
  system line too」).

### The document wording file

The server's release carries the document wording files, one to each language of the pack, and bmo-artifact's
`[wording] file` setting names one of them: every key of the artifact's 「Wording」 table, rendered from the server's
pack in that language, a key the language lacks in the Korean, and no other key (`docs/language-pack.md`, 「What
other units read」). The server's binary writes them, `bmo-web-server wording <folder>`, from the pack alone and
with no settings, each as `documents.<language>.yaml`, and the release ships the files it writes: each deployment
writes them before the flip at the top of the release, so `documents.ko.yaml`, `documents.en.yaml`,
`documents.ja.yaml` and `documents.zh-CN.yaml` stand under `~/.local/share/bmo-web/deploy/` through the deploy
tree, the Korean one at the path bmo-artifact's deployment sets as its `[wording] file`. bmo-artifact reads the
file as it starts, so a release that changes the pack reaches it at bmo-artifact's next start.

### sumida's own routes

The server mounts sumida's router as sumida builds it, under `/sumida`, apart from the routes above, since
sumida's own (its `/users` among them) would take paths other units name. The console's server is their one
caller, and hands on in `X-Real-IP` the browser's address as the console's reverse proxy named it, which sumida's
bans read (`docs/accounts.md`, 「sumida's own routes」).

| Route | What it is |
|---|---|
| `POST /sumida/auth/session` | 404: the sign-in is the service's own `POST /sign-ins` (「Account security」), which makes the same session |
| `DELETE /sumida/auth/session` | sign-out, with the cookie |
| `GET /sumida/me` | who a session is, with the cookie; 401 where it is no live session or its device was ended |

## Calls the server makes

Each goes to the unit's base address with that unit's token as a bearer, as the unit's document states.

| Unit | Call | Route | Why |
|---|---|---|---|
| the receiver | read a room's leaders | `GET /rooms/{chat}/leaders` | whether the one acting may let a person into a room (「Checks」, the entry check) |
| the receiver | read a room's console members | `GET /rooms/{chat}/accounts`, answered `accounts`, each its `account` | whether the one letting a person in is a member of the room (「Checks」, the entry check) |
| the receiver | read a member's rights over a room's people | `GET /rooms/{chat}/accounts/{account}/grants`, answered `letIn` and `takeOut` | the grant that stands beside the entry check's baseline for the one acting, read as silence where the receiver answers none (「Checks」, the entry check) |
| the agency | register the supply hook | `PUT /hooks/supply` (`url`, `token`) | once as the server starts, where the settings name the agency, so the agency asks who pays for a person's run; `DELETE /hooks/supply` takes it away |
| the agency | read an agent's label | `GET /supervisors/{supervisorName}`, answered its row's `label` | the name an agent a fixed line names stands as (「Fixed lines」); a refusal, no answer within three seconds or no label names it by its key |
| the agency | read a person's personal supply roads | `GET /personal-supply`, answered `people` | whose personal supply an administrator's read of `GET /supply/user/{user}` names, with that person in `Owner-Key` and `Owner-Role: administrator` |
| bmo-mail, at `mail.base` with `mail.token` | list the outgoing servers it keeps for the platform | `GET /outgoing-servers`, answered `items`: each `id`, `name`, `host` | the choice of the system mail's server on the 시스템 및 조직 screen's 메일 tab with the platform chosen (`docs/accounts.md`, 「The platform's own mail」) |
| bmo-mail, the same way | send one system mail | `POST /system-mails` (`server`, the server's number as bmo-mail names it, which the service keeps and answers as a string; `from`, `fromName`, `secret` or null, `to`, `subject`, `text`, `html`, `kind`), answered `sent` true; a refusal in its common shape, `code` and `error` | a reset link, an email's verification, a test and a security notice; the secret named is read by bmo-mail off the data root's `env/`, and its value never travels |
| the jake hub, at its loopback control address with its control token | read the attached agents | `GET /status` | whether a bound machine is attached, as a node read, a proof and a pairing answer it |
| the jake hub, the same way | revoke a machine name | `POST /revoke?agent=<name>`, answered `ok`, `agent`, `left` | a machine taken away from the account bound to it, once no account holds its name |

- **A call that does not reach the receiver** is a failure of the call: an entry check answers 502
  `upstream-failed`.
- **A call on the agency** carries the agency's token as its bearer. A registration that does not land is
  said on the service's error stream, and the service stands: the agency's rule for no registration is that
  a person's run takes personal supply alone, and the service registers again at its next start. A read of a
  person's personal supply roads that does not answer is 502 `upstream-failed`; where the settings name no
  agency at all, no registration is made and `GET /supply/user/{user}` answers 503 `no-agency`.

## Calls the console makes

The console's own server makes every call; no browser reaches another unit. Each sibling's document is the
contract, and the console holds its conventions — its casing, its auth and its refusal body — as that document
states them. The three units the console calls directly publish a TypeScript client: `@agency/client`,
`bmo-job-client` and `@bmo/receiver-client`, each a vendored tarball under `client/vendor/`
and each generated from that unit's OpenAPI document. The console's server calls them through those packages and
their `./schema` types, and reads a response into the screen's own shape where the screen needs more than the
unit carries. A browser call to one of them reaches its fixed path through the relay (below).

The console calls the agency for a person or as the deployment's own (the agency's `docs/api.md`, 「Who a caller
acts for」). A call made for a person carries, beside the console's token, the signed-in login's user in
`Owner-Key` and role in `Owner-Role`, and a call made for nobody signed in carries neither. These are made for a
person:

- **A person's own view of the Claude accounts:** the fallback read and changed, and the fallback and the accounts
  the usage view reads, so the agency keeps a member to their own accounts.
- **Agent management:** every agency call the routes of its five tabs make (에이전트, 역할, 저장소, 등록 모델 and
  모델 파일, each read and each change), the agent list those tabs share with the runs its roles hold now, and what
  an agent's own page reads of the supervisors and the roles, the check of whose agent it is among them. The
  agency holds each to the person's console section of that part (`docs/accounts.md`, 「Console sections」): a
  read of the supervisors, the roles or the repositories under any of the five parts' read, a read of the models
  or the model files under that part's own, and every change under its own part's write. The console's own gate
  stands before it (`docs/web.md`, 「Access」), so the agency's is a second line; where it refuses all the same, the
  person is answered 403 in the pack's words, and a permission the agency could not read 503.

Every other call is the deployment's own and carries neither: the console's own bookkeeping and the BMO set-up at
sign-in, the agents' labels and faces, the people roster, the testbed's and the TODO panel's reads, the model
names the layout reads from `/models`, the provider switches and the owner's word to a worker, which only the
administrator sends. A call through the relay carries the signed-in person as the relay says (below).

| Unit | What the console reaches it for | Routes |
|---|---|---|
| the server (this repository) | sign-in, the session, users, the people directory and its members list, phone keys, grants, checks, the model; the users list and each user's console sections; a user's profile and sections, the organisation's units with their roles, posts and acting appointments, a company's roles and unit kinds, a person's posts, a company's default for its people's BMOs, a person's own BMO profile and who may personalise theirs, each call with the signed-in login's user in `Owner-Key` and role in `Owner-Role`, and the profile standing for a person read as the administrator's role where the console applies it to their BMO; the units of the reader's company with the people standing in each, read under the administrator's role for 대화상대 추가's search (`docs/web.md`, 「방 만들기와 대화상대 추가」); the signed-in login's own secret space, each call with the login's user in `Owner-Key`; an organisation unit's secret space, listed, written and emptied by its heads and the administrator, each call with the login's user in `Owner-Key` (`GET /units/{unit}/secrets`, `PUT` and `DELETE /units/{unit}/secrets/{name}`); a person's console sections read and written whole by a head of their unit, within the head's own; the secret kinds, each call with the login's role in `Owner-Role`, with the `secret.kinds` chain resolution read for the unit whose secret form the console opens, so it offers the kinds that unit is left; the signed-in person's own supply — the resolved order, each source's standing and reason, this month's usage, the plan's remaining included usage and the personal credit balance, read and set (`docs/accounts.md`, 「Supply」); and the administrator's permanent delete of an account or a unit, read and run with the administrator's user in `Owner-Key` and role in `Owner-Role`, the console's script naming the move's administrator (`docs/web.md`, 「Deleting an account or a unit from the machine」) | every route above |
| the agency (`docs/api.md`) | the supervisors, each with the account it is filed under and its one road — its provider, model, effort, thinking, answer ceiling and advisor — its warming per provider, its compaction threshold, its repository, gates and sampling, read and changed, the rooms each has spoken in with its latest run there, and whether its road can take a turn now; whether the deployment rests, until when and of what kind, and the rest ended by hand, the administrator's alone; the roles, each with its bundles, line, its agents, each on a road of its own, its advisor among it, or following the supervisor that asks it, the text each provider's runs carry beside its prompt, cap, sessions setting and compaction threshold, read, added, changed and removed, and each role's session history; the repositories, each with its path, node, whether it is an umbrella, its support count, checkouts (each with its path and the job holding it), checkouts on the work nodes, prefix documents, preamble, rules, dev command, pinned model, the sampling it sends a pinned registration with the settings that sampling may hold, and downgrade heal, read, added, changed and removed; the nodes the node service keeps, each with whether it takes jobs; the models a provider holds, each with its declared thinking and answer ceiling, for a road's chooser; every role's slots, read for the sidebar, the 에이전트 tab's state cells and the 역할 tab's reservations; the open runs the sidebar's role runs name, read by their names for the room each runs for; whether a supply source answers now, tried for the start guide; the providers, each with its switch, quota, declared compaction threshold, whether its engine is the owner's own, and whether a road on it takes an advisor with the family words it names one by, and a provider's switch thrown; the gateway's members, each with its road and the account it belongs to; the registered models and the model files; the chat agent's composed documents; a supervisor's own settings — its generation settings, its reference switch and its persona — read and changed; the sessions each supervisor holds; the research supervisor its own settings hold, read and changed; the secrets the DeepSeek top-up reads its card from and signs in with, read and changed; the minutes between two flushes of the deploy queue, read and changed; the log lines of a run, and one supervisor's or role's log across its runs — its newest page, the page before or after an id, the page at a moment; a word said to a worker, with the files it carries; the Claude accounts with each one's usage window, and what was spent over the week; the jobs and their prompts, by item, repository or running, each running job with the road it took, what chose it and the agent it runs on, and the jobs running now; the background work a supervisor's program still runs for a room, for the room screen's 진행 중; its turns going out and ending, its runs and sessions made, changed and stopped, and its jobs starting, changing and ending, and its background work beginning and ending, relayed to each tab; GitHub's webhook deliveries, handed on; an account made ready by its invitation given its agents and its machine as the node its runs stand on, a person's own supervisor's label set as it follows the person's name and the name their BMO's profile stands with, its call names written as the whole list the agency takes and read back as the comma-separated line it serves, and its persona setting written where the profile's own persona stands or the one the console put there no longer does, and that node set again or taken away as the administrator binds the account to another machine or to none; the signed-in reader's own agents — the set their organisation supplies, each seat with where it came from, an agent of their own added, a road chosen among the models their supply carries, a supplied agent switched off or put back as supplied, an agent of their own removed — and their own instructions, with the organisation's read beside them; the models a road of a unit's sign-up composition may name; and the signed-in reader's personal apps, listed with the versions their PC keeps, sent back to the version before and deleted, and the session the reader's own screens are read and called under; and their company's catalogue of shared apps, skills and MCP servers as the reader sees it, each with its kind and its text by locale, a version's source, a personal app, an MCP item or a skill shared in the reader's language, a copy installed, moved onto the newest version, deleted and cloned, an item turned on or off and recalled for a unit the reader heads, withdrawn, approved, its other languages filled by the agency's translator and put forward as a platform app, the reader's notices kept seen, and, for the administrator, every company's requests to make one a platform app; the signed-in reader's skills kept at home, listed, read, written whole from the skill form and deleted; and what each of the reader's agents is given of their skills and MCP items, read and written whole | `GET /supervisors`, `GET`/`PATCH /supervisors/{supervisorName}`, `GET /supervisors/{supervisorName}/rooms`, `GET /supervisors/{supervisorName}/road`, `GET /rest`, `DELETE /rest` (outside the published client, 「Gaps the console meets」), `GET`/`POST /roles`, `GET`/`PATCH`/`DELETE /roles/{roleName}`, `GET /roles/{roleName}/sessions`, `GET`/`POST /repositories`, `GET`/`PATCH`/`DELETE /repositories/{repositoryName}` (`umbrella`, `supportCount`, `nodeCheckouts` and `sampling` among a change's fields, and `ownerUnit` on an add filing it under a unit, asked in the name of that unit's head), `POST /repositories/{repositoryName}/words` (`by` `owner`, for the owner's login alone), `GET /nodes`, `GET /provider-models/{providerName}`, `GET /slots`, `GET /providers`, `PATCH /providers/{providerName}`, `GET /gateway-members`, `GET`/`POST /models`, `GET`/`PATCH`/`DELETE /models/{modelKey}`, `GET`/`POST /model-catalogue`, `GET /chat-documents`, `PATCH /chat-documents/{documentName}`, `POST /github/deliveries` (GitHub's webhook deliveries, handed on unchanged with their GitHub headers and no sign-in, `docs/web.md`, 「Access」), `GET`/`PATCH /fallback`, `GET /accounts`, `GET /usage` (over the last seven days), `GET /prompt-documents`, `PATCH /prompt-documents/{documentName}`, `GET`/`PATCH /supervisors/{supervisorName}/settings`, `GET`/`PATCH /settings` (`researchSupervisor`, `deepseekCardSecret`, `deepseekLoginSecret`, `deployFlushMinutes`), `GET /sessions`, `GET /jobs`, `GET /jobs/{jobId}`, `GET /jobs/{jobId}/prompt`, `PATCH /jobs/{jobId}`, `GET /background-work` (`roomId`), `GET /runs`, `GET /log-lines`, `GET /log/agents/{agentName}/lines` (a supervisor's or a role's name), `POST /role-agents`, `PATCH`/`DELETE /role-agents/{agentName}` (an advisor refused answers 422 with an `error` beginning `advisor: `, said under the agent's advisor), `GET /person-nodes` (whether agency's record names the reader's machine, for the settings' machine section), `PUT`/`DELETE /person-nodes/{ownerAccount}` (a set refused 422 `not-a-hub-node` asked again until the node service lists the machine; the account service's binding put back where agency refuses; the account's user id and, to set it, its machine's name and whether its binding is shared, `docs/accounts.md`, 「Invitations and a person's machine」), `GET /personal-apps/{ownerAccount}`, `POST /personal-apps/{ownerAccount}/{name}/back` and `DELETE /personal-apps/{ownerAccount}/{name}` and `POST /personal-apps/{ownerAccount}/screen-session` (the signed-in reader's own, their user id the account, as the deployment's own), `GET`/`POST /own-agents/{ownerAccount}`, `GET /own-agents/{ownerAccount}/models/{providerName}`, `PATCH`/`DELETE /own-agents/{ownerAccount}/{agentName}`, `POST /own-agents/{ownerAccount}/{agentName}/back` and `GET`/`PUT /own-instructions/{ownerAccount}` (the signed-in reader's own, their user id the account, as the deployment's own), `GET /catalogue/{ownerAccount}`, `GET /catalogue/{ownerAccount}/apps/{appId}/source`, `POST /catalogue/{ownerAccount}/apps`, `POST`/`DELETE /catalogue/{ownerAccount}/apps/{appId}/install`, `POST /catalogue/{ownerAccount}/apps/{appId}/update`, `.../clone`, `.../withdraw`, `.../approve`, `.../promote`, `.../translate`, `.../recall` and `.../units/{unit}`, and `POST /catalogue/{ownerAccount}/seen` (the signed-in reader's own, as the personal apps' are; a share naming `kind` `skill` and `language`), `GET /personal-skills/{ownerAccount}`, `GET`/`PUT`/`DELETE /personal-skills/{ownerAccount}/{name}`, `GET /attachments/{ownerAccount}` and `PUT /attachments/{ownerAccount}/{holderKind}/{holder}` (the signed-in reader's own, their user id the account, as the deployment's own; outside the published client, 「Gaps the console meets」), `GET /catalogue-promotions` (the administrator's alone, as the deployment's own), `GET /supply-sources` (whether a person's own login is all that can carry their runs, asked in the name of the person a join page made ready, and of the reader the start guide is read for), `POST /supply-test` (a supply source tried now, the reader's own or, for the administrator, the platform's, from the start guide), `PUT /models/{modelKey}/addresses/{node}` (a local AI's one address, naming a key file of the platform's secret space, from the administrator's start guide), `POST /composed-agents/{ownerAccount}` (the agents an account made ready is given), `GET /signup-composition` and `PUT /signup-composition/{link}` (a unit's sign-up composition, read and written as the signed-in login), `GET`/`POST /organisation-supply/{unit}` and `PATCH`/`DELETE /organisation-supply/{unit}/{supplyId}` (a unit's own supply, as the signed-in login), `GET /events?kinds=turn.created,turn.ended,job.created,job.changed,job.ended,run.created,run.changed,run.stopped,session.created,session.changed,supervisor.changed,role.changed,repository.changed,repository.deleted,slot-request.changed,background-work.created,background-work.ended`, `POST /session-reset` (`agent`, `chatId` where the session is one room's, `by` the asking account's key, `clean` for a reset that starts the session with no handoff note; a supervisor's session reset or a room's session handed over, as the deployment's own once the console has judged the reader may, `docs/web.md`, 「A supervisor's session handed over or reset」), `GET /sessions?agentName=` (the room sessions such an ask goes to) |
| bmo-job (`docs/api.md`) | the TODO panel: every item, each item opened with its approvals' callers and kinds, the verbs on an item — an approval given under the caller the console's token names, the agent or the model and the role its labels name, its notes, reports and review, a hold's or a stop's reason given with the move to `held`, an unfinished note's resolution written into the item's labels, by hand or by the console's server once the lines raised from the note are done, a line raised from a note with that note's item as its `raisedBy` and the strands it takes up as its `from-todo` label, and the lines raised from notes read by that label, its job notices switched off with a reason and back on, its work order and tasks; the questions put to a person, and answering one, stopping its clock and talking it over with the job that asked, its earlier turns read back; the queues' pause and holds, and the deployment's hold let go | `GET`/`POST /items`, `GET`/`PATCH /items/{itemId}`, `GET`/`POST /items/{itemId}/notes`, `DELETE /items/{itemId}/notes/{noteId}`, `GET /items/{itemId}/reports`, `GET /items/{itemId}/reviews`, `GET`/`PUT`/`PATCH /items/{itemId}/work-order`, `GET`/`PATCH /items/{itemId}/work-order/tasks/{taskId}`, `GET /questions` (`addressee` `person`), `GET`/`PATCH /questions/{questionId}`, `GET`/`POST /questions/{questionId}/replies`, `GET`/`PATCH /queues`, `GET /events?after=&run=` (relayed to each tab from that tab's cursor; opened with no cursor where the tab holds none, and again where bmo-job answers that the cursor stands before the events it still keeps, so the relay goes on from the events still to come), `GET /events?kinds=item.changed&after=` (held open by the console's server for itself, to learn that a line moved to a finished state) |
| the receiver (`docs/api.md`) | the room list, a room's title, read and, for a person's own BMO's private room, set, and its line, page by page, past a message, one message and where a day begins; a message's files, their bytes, its picture and the metadata it arrived with, for a message that carries files; the head of a message's picture, a ranged read, for the picture's width and height as the page is read; a room's pictures, its messages by what they hold — pictures and videos, files, links, music and voice notes — for its 방 정보, its figures and the chat agent's window there; the profile pictures it keeps for rooms and people, every chat service's and the ones set in the console, listed page by page, and one such picture, the console asking no chat service for a picture (`docs/web.md`, 「Profile photos」); the numbers an agent's words stand under, to know whether a message is an agent's and which face a chat agent wears; the names people last went by, for a one-to-one with no title of its own and for the reactors of a page's messages; the agent whose words a send of its own carries and the voice it went out in, and whether a number is the owner's own account, for a send that names no agent; the default answerer setting, the supervisor that answers every room naming none, read and set; the supervisors added with a console room of their own and removed, and the rooms each answers; a room's whole list of supervisors, read off the room and written whole, for its chat services tab; a message reacted to, pinned, edited or deleted, and a sticker sent, as the signed-in person's own, under the sender the room knows them by, and a room's pinned messages; a message the administrator forwards into another room, kept there under his account's sender and marked with where it came from; a line read aloud; whose private room each room is and whether it is sealed, for which rooms a person reads and changes; the senders each room has, for which rooms a user reads; a room's members as the chat service carrying it read them, each by the person number the room's lines carry where one was given, with their name and status line; the owner's private chat; an account's presence in the console and its typing in a room; the words, files and voice notes of the account signed in, the owner's among them, each filed under that account's own sender; an account's identity on the record road and the name it goes by; the rooms an account is a member of in the console, a room's members by account, an account let in and taken out, a member's rights in the room read and written, and a group room opened by an account; the event stream and the live board; removing a room; the rooms' pinned order, a room pinned and let go, as the administrator's account; the chat providers a room may be on, and the ones it is on, read, with the largest file the room takes, which the room's input box holds a file to; which of a room's chat services reads a room's past back, by the verbs each declares; a room added from a chat service's account, its rooms and its contacts listed page by page, or a conversation it starts with them, the contacts and a start in the signed-in person's own account, and a group's own supervisor named on it as it stands; what opened a turn; a turn of the talk about a document, the owner's alone; the owner's private chat's two notice switches, read and set, the administrator's alone; a supervisor's instruction stages, its chain set and taken away and a stage's text set and taken away for it, and what each round's instruction pipeline wrote | `GET /rooms` (each room's `privateOf` and `sealed`, outside the published client, 「Gaps the console meets」), `GET /rooms/{roomId}` (its `privateOf` and `sealed`, the same), `GET`/`PUT /rooms/{roomId}/title` (set where a person's own BMO's private room follows the person's name, `docs/web.md`, 「The join page」), `GET /rooms/{roomId}/answerers`, `GET`/`PUT /default-answerer`, `POST /supervisors` (with the signed-in login's user id as `ownerAccount`, `sessionScope` `agent` where it is a person's, and the login's `Owner-Key` and `Owner-Role`; a member's own BMO, `u<user>`, alone), `DELETE /supervisors/{supervisorName}`, `GET /supervisors/{supervisorName}/rooms`, `GET /rooms/{roomId}/own-number`, `GET /rooms/{roomId}/messages` (with `holding` for a kind a message holds, outside the published client, 「Gaps the console meets」), `GET /rooms/{roomId}/day-start`, `GET /rooms/{roomId}/messages/{messageId}`, `GET /rooms/{roomId}/messages/{messageId}/files`, `GET /rooms/{roomId}/messages/{messageId}/files/{place}` (with `download=true` for a file to keep, and the `Range` the browser asked with), `GET /rooms/{roomId}/messages/{messageId}/picture`, `GET /rooms/{roomId}/messages/{messageId}/metadata`, `GET /rooms/{roomId}/messages/{messageId}/sender-is-owner`, `GET /people` (`ids`, the numbers a page's reactions and the untitled one-to-ones name), `GET /rooms/{roomId}/pins`, `POST /rooms/{roomId}/messages/{messageId}/forwards` (`to`, and the forwarding account as `account` with the name it is shown by as `name`), `PUT`/`DELETE /rooms/{roomId}/messages/{messageId}/reactions/mine`, `PUT /rooms/{roomId}/messages/{messageId}/pin`, `PATCH`/`DELETE /rooms/{roomId}/messages/{messageId}`, `GET /stickers`, `POST /rooms/{roomId}/stickers`, `POST /rooms/{roomId}/messages/{messageId}/reading` (each act on a message, a sticker and a reading naming the signed-in account as `account`, in the body or, for a `DELETE`, the query; the receiver's `private-room` refusal said by the pack's sentence), `GET /rooms/{roomId}/pictures`, `GET /avatars`, `GET /rooms/{roomId}/avatar`, `GET /people/{personId}/avatar`, `GET /rooms/{roomId}/figures?zone=` (the zone the console shows every time in), `GET /rooms/{roomId}/members` (outside the published client, 「Gaps the console meets」), `GET /rooms/{roomId}/window`, `GET /rooms/{roomId}/situation`, `GET /owner`, `POST /owner/messages` and `POST /owner/message-files` (with `voice` for a recording) for a console login standing before the account model alone, which is the owner's, `POST /rooms/{roomId}/words` (`account`, `name`, the account's shown name, `text`, `replyTo`) and `POST /rooms/{roomId}/word-files` (the owner's files form but for the room, which the path names, with `account` and `name`, and `voice` for a recording) for every account, the owner's among them, `PUT /accounts/{account}/identity` (with the name the account is shown by as `name`, as an account is made ready, for every user as the console starts and as a person's name is changed), `PUT /accounts/{account}/presence` (the account's presence in the console as it changes, `state` null where it is taken back, `docs/web.md`, 「Presence and typing」), `POST /rooms/{roomId}/typing` (`account` and `on`, as the account writes in the room's input box), `GET /accounts/{account}/rooms`, `GET /rooms/{roomId}/accounts`, `PUT /rooms/{roomId}/accounts/{account}` (`by`), `POST /rooms/{roomId}/accounts` (`accounts`, each a key as a number, and `by`), `POST /rooms/{roomId}/unit-accounts` (`unit`, the organisation's number, and `by`), `DELETE /rooms/{roomId}/accounts/{account}?by=` (an account a key, decimal text in a path and a number in a body; the receiver's `private-room` refusal said by the pack's sentence), `GET`/`PUT`/`DELETE /rooms/{roomId}/accounts/{account}/grants` (`by` the asking account on every one and one `right` on each write; the read answering `letIn`, `takeOut` and `mayWrite`, whether the asking account writes a member's rights here, and the write answering the rights as they now stand; outside the published client, 「Gaps the console meets」), `GET /events`, `GET /live`, `DELETE /rooms/{roomId}` (with `dryRun` for the preview, `by` and the administrator's account as `account`), `POST`/`DELETE /pinned-rooms` (the pinning account as `account`, in the body or the query), `GET /providers`, `GET /providers/{key}/rooms`, `GET /providers/{key}/contacts` (with the signed-in login's user id as `accountId`, where it has one), `POST /rooms` (the same `accountId` on a start from the contacts; with no provider, a `title`, the opener's own supervisor as `supervisors` and the opener's account as the number `openedBy` for a room opened in the console), `PUT /rooms/{roomId}/supervisors` (a group's own supervisor added with it, and a room's whole list written whole for its chat services tab; each with the acting account as `account` and nothing else), `GET /rooms/{roomId}/providers` (its `fileLimit` with each provider's label for the room's input box, with `GET /providers`' `roomModes` whether a provider the room is on offers the avatar mode, and with the keys of the roads the room stands on, which is what the console's server judges whether a room's menu carries the reader's own BMO beside it: the console's own record alone, and no chat service's key among them), `GET`/`PUT /rooms/{roomId}/registration` (`by`; a change of the mode naming the administrator's account as `account`, and its `standingAgents`, which the installed client does not name yet, asked on the address, 「Gaps the console meets」) — each `by`, and the removal's, the administrator as the web unit knows him, his user's id, which the receiver asks `GET /users/{user}` whether he is one, `PUT`/`DELETE /avatars/{kind}/{subject}` (a room's picture naming the account it is set as as `account`; a person's own BMO's picture set from the picture their profile stands with, under the administrator's role), `GET /rounds/openings`, `GET /rounds/openings/{instructionId}`, `POST /talks` (with a `document` topic, the earlier turns and the words just said), `GET /notice-switches`, `PUT /notice-switches/{kind}` (`on`; outside the published client, 「Gaps the console meets」), `GET /instruction-stages` (with `agentName` for the chain a supervisor follows, and without for the policy's), `PUT`/`DELETE /instruction-stages/{agentName}`, `GET /instruction-texts` (with `agentName` for a supervisor's catalogue), `PUT`/`DELETE /instruction-texts/{agentName}/{name}` (the texts set before the chain that names them, and the chain before a text taken away), `GET /rounds/pipeline`, `GET /health`, `POST /handovers/{agentName}` (`reason`, `room` where it was asked from a room, `by` the asking account's key; a supervisor's one session handed over once the console has judged the reader may, `docs/web.md`, 「A supervisor's session handed over or reset」) |
| the tool host (bmo-pocket's `docs/api.md`) | the asynchronous calls it keeps that stand running — the watches, the reminders and the calls an agent set — read on its console face for the room screen's 진행 중, beside the manifest and screens it relays as any unit that brings a screen; a link card's page and picture, read through bmo-explorer's entries (「The web beyond the units」); the reader's own screens, their files and their calls, on its control socket's app face (`docs/web.md`, 「A reader's own screens」) | `GET /uses?state=running` (on its console face, under its console token, with `Owner-Role` `administrator`); `POST /tool-calls` (on its control socket, under the console's tool session token, naming `explorer/link_preview` or `explorer/fetch_raster`); `GET /screens`, `GET /screens/{tool}/{digest}/{path}` and `POST /screens/{tool}/calls` (on its control socket, under the reader's screen session token) |
| the gate (`docs/api.md`) | the gate order, read with the agent list so the home screen stands its gates in the order the unit serves; the verdicts a room's messages were judged by, newest first, for the stretch of time a page of the room covers or the seconds an opened record's verdicts were written in, each with what its round's gates held, were asked about and kept by each rule and, for a picker's or the matcher's verdict, every line its model read with its answer; the document viewer's translation: the parts of a document's version handed to the translator, where it stands on them, the parts it has kept with each failed part's sentence, and the word that a document's translation moved; a worker's or a job's text, a store item's text and a reader's own screen's name read in the reader's language — Korean, English, Japanese or Simplified Chinese — for the console's own screens and every signed-in reader; the reason a silent turn of a room named, read from its `skipped` verdict and translated into the reader's language | `GET /gates` (the gate order, read with the agent list), `GET /judgements?roomId=&gateName=&from=&to=&before=&limit=` (`gateName=skipped` for a silent turn's reason), `POST /translations` (with the reader's role in `Owner-Role`), `POST /documents/translations`, `GET /documents/translations/state?document=&target=`, `GET /documents/translations/parts?document=&version=&target=`, `GET /events` (its `document-translation.changed`) |
| bmo-artifact (its `docs/api.md`) | the organisation screen's 아티팩트 저장 tab (`docs/web.md`, 「아티팩트 저장」): the kinds of place a unit's documents may be kept at, each with the settings it takes, and a unit's storage value, judged by bmo-artifact and written on the delegation chain in the signed-in login's name | `GET /storage-places`, `PUT /storage/{link}` (`value`), with the console's credential for the artifact's screens (`ARTIFACT_TOKEN`) and the signed-in login's `Owner-Key` and `Owner-Role`; the setting's entry, what stands for a unit and its delegation are the chain's own routes (「The delegation chain」) |
| bmo-mail (its `docs/api.md`, 「Servers」) | the organisation screen's 메일 서버 tab (`docs/web.md`, 「메일 서버」): the mail servers the platform, a company or a unit holds, each added, changed, removed and tested, bmo-mail writing the link's list of servers on the delegation chain in the signed-in login's name | `GET /servers?link=`, `POST /servers`, `PATCH` and `DELETE /servers/{serverId}`, `POST /server-tests`, with the console's credential for the mail screen (`MAIL_TOKEN`) and the signed-in login's `Owner-Key` and `Owner-Role`; the kind's entry and its delegation are the chain's own routes (「The delegation chain」) |
| the brain (`docs/boundary-api.md`) | the organisation screen's 조직 기억 tab (`docs/web.md`, 「조직 기억」): a unit's org brain, found by its keys, the company's id as `accountKey` and the unit's as `agentKey`, each the digits the account service answers, and made the first time a memory is written into it; the memories of the unit and of every unit above it on its path, with the proposals of the unit, read as no use; which unit's memory stands for each topic along the path; a memory written, a version written over one, a proposal accepted as a version of type `fact`, and a memory or a proposal moved to `invalidated`, each write naming the standing the account service's org memory check answered (`docs/accounts.md`, 「A unit's org memory」); a memory about one person of the unit, its subject of type `person` keyed by the user's id and marked `shared`; and 계정's 조직에 공유한 내 정보: the signed-in person's own shared memories in their home unit's org brain, read, written and moved to `invalidated` under the standing `person` (`docs/web.md`, 「계정」); the base, the org brain keyed `platform` for both keys, read and written by the administrator alone under the standing `head`, its pending candidates read, raised to `active` or moved to `invalidated` with the reason `kept-in-source` or `dropped`, a dropped one's source in its own brain moved to `invalidated` with it, and the source brain's name read for the review (`docs/web.md`, 「조직 기억」) | `GET /brains?kind=org&accountKey=&agentKey=`, `POST /brains`, `GET /brains/{brainId}`, `GET /brains/{brainId}/memories?status=active&record=false&limit=500` and `?status=pending`, `GET /brains/{brainId}/memories/{memoryId}`, `GET /org-topics?brainIds=`, `POST /brains/{brainId}/memories`, `POST /brains/{brainId}/memories/{memoryId}/versions`, `PATCH /brains/{brainId}/memories/{memoryId}`, under the brain's service token `ORG_BRAIN_TOKEN` names, with no owner key or role |
| the voice engine (`docs/boundary-api.md`) | a line's voice briefings — its summary and its full reading, with their state, title, length and the voice message an old one went out as — one briefing waited on, its sound, and the stream that says one was taken in, ended or named its line, or that a room's briefings or every room's were stopped, relayed to each tab | `GET /briefings?chatId=&messageId=&limit=`, `GET /briefings/{briefingId}`, `GET /briefings/{briefingId}/sound` (with the `Range` the browser asked with), `GET /events?kinds=briefing.created,briefing.ended,briefing.changed,briefings.stopped` |
| every content unit — the agency, the receiver, the brain, bmo-artifact, bmo-note, bmo-mail, the tool host and bmo-calendar, each its own `docs/api.md` | the platform administrator's permanent delete (`docs/web.md`, 「영구 삭제」; `docs/accounts.md`, 「Deleting an account for good」, 「Deleting a unit or a company」): what each keeps of an account or an organisation unit counted, and removed, in that order, before this repository's server removes its own | `GET /accounts/{account}/removal` and `DELETE /accounts/{account}`, which the agency and bmo-mail serve as `GET /owners/{account}/removal` and `DELETE /owners/{account}` since their `/accounts` name accounts of their own, and `GET /org-units/{unit}/removal?company=`, `DELETE /org-units/{unit}?company=`, each answering `counts` or `removed`, each kind and how many; with each unit's token the settings name, `AGENCY`, `RECEIVER`, `ORG_BRAIN` (the brain's service token, no owner key or role), `ARTIFACT`, `NOTE`, `MAIL`, `POCKET` and `CALENDAR`, and for every unit but the brain the administrator's user in `Owner-Key` and `Owner-Role: administrator`; a unit whose address is not set is passed over and named |
| every unit the settings name, each `<NAME>_ADDRESS` but a `NUXT_` one, which is the console's own (`bmo-ui`'s `docs/console-bundles.md`) | whether it brings a console bundle, and the bundle's words | `GET /console-manifest`, with the unit's token and no owner key or role, at start, once a minute, and at once where the unit answers a read of one of its bundle's files 404; the words at the path the manifest names |
| the units whose manifest reads (`bmo-ui`'s `docs/console-bundles.md`; each unit's `docs/api.md`) | each bundle's own screen: its module, its stylesheet, its sidebar unread count where its manifest names one, its calls to the service its manifest names and its calls to the other services it names under `calls` | what the contract has a console relay of the service, under `/api/<service>/`, handed on as it came to the unit that answered the manifest with that unit's token, with the owner key and the role the contract's 「Roles and the owner key」 has the console set, in place of any the browser sent: the owner key is the signed-in login's user on the account service, its id written as a decimal number, and the role is `administrator` for the platform administrator and `member` for anyone else. Its status and bytes go back as the service gave them, and of its headers the ones a browser reads, as the service gave them: `content-type`, `content-length`, `content-disposition`, `cache-control`, `x-content-type-options`, `etag`, `last-modified`, `accept-ranges`, `content-range` and `retry-after`, and the lines a service sets ahead of a page it hosts and of a read another origin makes, `content-security-policy`, `referrer-policy` and `access-control-allow-origin`, so a page the service hosts reaches the browser under its own policy and a sandboxed page's own fetch of the service's bytes is let through; no other header of the answer is handed on, and an answer whose service set no `content-security-policy` carries `frame-ancestors 'self'`, so the console's screens alone frame it (`docs/web.md`, 「Access」). A path one of whose segments reads, once its escapes are undone, as `.` or `..` is refused 400 and reaches no unit, and a socket at one is closed as no relay. A socket is taken under `/api/<service>/` behind the console's sign-in, which asks the account service whether the seal's session still stands as it opens (`docs/web.md`, 「Access」), and each frame is handed on as it came and the close code and reason back either way. The event stream the console reads itself, for a bundle's notices and for the word that its sidebar count may have moved, carries the platform administrator's key and `Owner-Role: administrator`. A bundle's screen, its words, its event stream, its sockets, its notice kinds and the places its notices of those kinds open come from its manifest, and no code here names a unit or a bundle. The relay also hands on a read of a unit the console calls directly — the agency, bmo-job and the receiver — at the address its setting names, so a browser's read of `<unit>`'s own fixed path stands under `/api/<unit>/`; a change of such a unit asked there is absent, every change being one of the console's own routes, and a bundle's page reaching such a unit is refused 403, but for the translator's ask: where the console's translator setting names such a unit, a `POST` of the route it names is handed on to that unit from a bundle's page whose manifest names it under `calls` and that the reader may open, as any relayed call is. |
| the node service (`docs/api.md`) | the monitor screen's machine and node tabs: the node list with each node's state, tone, ownership, account and whether it is monitored, a node's ownership and account set, a node taken off it — a hub node's agent sent a leave first where asked —, every machine's latest recorded reading in one answer and one machine's own latest reading, its live tracking and CPU limit set, and its recorded readings, live and over a span | `GET /nodes` (page after page), `PATCH /nodes/{nodeName}` (`ownership`, `account`; its `bad-field` and `not-found` said in the pack's words), `DELETE /nodes/{nodeName}` (`leave=true` where asked; its `conflict`, a leave the hub did not take, said in the pack's words), `GET /machines` (every machine at once, the recorder's own and reading none), `GET /machines/{machineName}`, `PATCH /machines/{machineName}` (`tracking`, `cpuLimit`), `GET /machines/{machineName}/readings?after=&spanMs=&limit=` |
| the card master (bmo-arbiter's `docs/api.md`, 「What the master serves」) | the monitor screen's services tab: the whole picture of every node's cards, and the picture again whenever it changes | `GET /cluster`, `GET /events?kinds=cluster.changed` |
| the cache siren (`docs/api.md`) | the cache siren screen: the sums it keeps by session, its siren count, its settings, and the newest events it holds | `GET /stats`, `GET /settings`, `GET /events?limit=` (read as a page, with `Accept: application/json`) |
| the cache warmer (`docs/api.md`) | the keepalive view: the round, each agent's switch, pause and last warming, an agent being the subject of its name under every consumer that registers a target for it — on where one of those targets warms now — and under the consumer `KEEPALIVE_CONSUMER` names where none does | `GET /round`, `PATCH /round`, `GET /targets`, `GET /targets?subjectName=`, `GET /consumers/{consumer}/subjects`, `PATCH /consumers/{consumer}/subjects/{subject}` |
| bmo-research (`docs/api.md`) | the agent screen's searcher tab: the settings every research run is held to and the search engines' state, each setting changed on its own, a change naming only the setting it changes and a key sent without its page budgets keeping them; the research screen: whether the loop runs, each category with its state, its part of the queue and the holds that name it, a category or every one stopped and started again, the queue narrowed by category and state, page by page, with where each item came from, a thing asked for with the owner's words for why and, for a follow-up, the item or the document it follows from, an item dismissed, a stuck item asked again or moved to the front, an item's research run with its log, and the sources, page by page, a source registered, changed and taken away | `GET`/`PUT /research-settings`, `GET`/`PATCH /state`, `GET /categories?limit=`, `GET /queue?categoryName=&state=&after=&limit=`, `POST /queue`, `PATCH /queue/{itemId}` (`state` `dismissed`, `state` `waiting` or `front` true, one alone), `GET /research-runs/{runId}`, `GET /research-runs/{runId}/log-lines`, `GET /sources?after=&limit=`, `POST /sources`, `PATCH`/`DELETE /sources/{sourceId}`, each called by its documented path with the console's HTTP helper, since the unit publishes no TypeScript client |
| the testbed (`docs/deploy.md`) | the deployment in the title bar | the progress record, `deploy-progress.json`, read under each deploy root `DEPLOY_ROOTS` lists, in the shape the testbed writes it; the record a finished deployment leaves, `deployed.json`, and its one line a deploy, `deployed.log`, under that root; the commits between two deploys, read from the git log of the build tree the root keeps in `deploy-expand`; the testbed writes them and a reader needs only the files and the run's process; the last lines of the deploy unit the record names, read from the machine's user journal with `journalctl`; the deploy units standing, `systemctl --user list-units --type=service --state=active -o json 'bmo-deploy-*'`, looked at every second, whose coming and going is the line moving |
| the testbed (`docs/boundary.md`) | the testbed line on a running TODO row: which job's checkout holds a seat of a lane or waits in its line, the command and its place (`docs/web.md`, the TODO panel's section); the deployments waiting in the deployment line, in the order it will serve them (`docs/web.md`, 「Deployment in the title bar」) | `bmo-testbed status --json`, run through the program `TESTBED_BIN` names: of its `queues`, each lane's `name`, `holders` and `waiting`, each entry's `checkout`, `command` and `pid`, read every two seconds; of its `deployLine`, each `waiting` ticket's `unit`, `root`, `commit` and `askedAt`, read as the title bar's deployment is read; a reading that fails stands as an empty queue and an empty line |
| the desktop app's release read (jake's `docs/desktop.md`, 「The read the console uses」) | the desktop app's download page: the current release's version, its date and each installer's platform, format, file name, size, SHA-256 and address; an address answering 404, or no address set, reads as no stable release published | `GET` at the address `DESKTOP_RELEASE_URL` names, with no token, read by the console's server and handed to the page as `GET /api/desktop/release` |
| GitHub's REST API, `api.github.com` (jake's `docs/desktop.md`, 「The read the console uses」) | the newest preview where no stable release is published: the releases of the repository a GitHub latest-release address names, and the `release.json` asset of the newest pre-release that is no draft | `GET /repos/<owner>/<repo>/releases` with no token, only where `DESKTOP_RELEASE_URL` is such an address and answered 404; the answer kept ten minutes |
| the user manager and journal of the console's machine (systemd) | the monitor's 로그 tab: the lines the units named by `LOG_UNIT_PREFIX` wrote and the lines the manager wrote about them, each with its slice, which is the unit's category (docs/web.md, 「Monitor's logs tab」); the category slices the units' repositories install; the slice a unit that wrote no line stands in | `journalctl --user -o json`, newest first or after a cursor, matched by slice, by unit or by the manager's own unit, and bounded by priority; `systemctl --user list-unit-files --type=slice -o json`; `systemctl --user list-units --all -o json`; `systemctl --user show -p Slice` |

- **A chat service is reached through the receiver alone.** Whatever any chat service carries — a room's and a
  person's picture among it — the console reads from the receiver, which each chat service fills with what it has;
  the console calls no chat service and holds no setting naming one, so a chat service added to the system adds
  nothing here.
- **The console's own tables** are read and written in the server's database directly, through the database
  `WEB_DATABASE_URL` names (`docs/accounts.md`, 「The tables」); no other unit's table is. The DB screen reads the
  whole of that database, sumida's tables among them, in read-only transactions of their own, and no other database.
- **The cache siren screen reads what the siren keeps and nothing else.** Its figures are the sums by session, the
  siren count and the three settings the daemon answers, and its last minute and last ten minutes are counted from
  the newest events it holds, read as a JSON page rather than as the stream that route holds open by default. The
  daemon keeps no quota source and no count of the transcript files it reads, so the screen shows neither, and it
  takes no stream: it asks again on its own clock.
- **A refusal is said by the pack's sentence for its code.** The units answer English sentences for an agent to
  read; the console holds, beside each call, the table from that unit's codes to the pack's keys, and a refusal
  whose code stands there is said in the pack's words. The agency's codes are its statuses' own names, so a
  person is told which kind of refusal it was; a refusal about one field is said under that field as a value
  refused. bmo-research's are said by what was asked: a settings value it did not take; a thing asked for whose name or address
  it did not take, or that is already waiting, running or stuck; a follow-up whose parent it does not hold, did not take, or has filed no document yet; a source it did not take as written; a category, an item, a run or a source it does not hold; an item it no longer
  dismisses, or no longer asks again or moves to the front since it is not stuck; or, for any other code, a
  failure on its side.
- **A call that does not reach its unit,** or an answer that does not read as its shape, is that screen's
  failure: the region shows the failure and a way to ask again (`docs/skeleton-loading.md`), and every other
  region stands.

### The web beyond the units

Outside the units, the console's server needs one thing: the page an address in a room's message leads to, and
the picture that page names, for the message's link cards (`docs/web.md`, 「링크 미리보기」). It reads neither
itself. It calls bmo-explorer's entries `explorer/link_preview` and `explorer/fetch_raster` (with `square` 240)
through the tool host's control socket, `POST /tool-calls`, under the console's own tool session: a held session
the tool host's deployment declares for the console, whose record names the namespace `explorer` and those two
entries, and whose token the host writes to a file it issues again where the token is revoked, so the console reads
the file on every call. Each call names the console's link cards as its `pacing`. bmo-explorer checks every address
and redirect as public and bounds the size of what it reads, and bounds no call by a clock, so the console bounds
each call by its own wait; the address is always one the archived message carries, and the answer is kept per
address, as that section states. Where the settings name no socket or token file, or the call is refused or fails,
the card stands plain.

## Settings

The server reads `settings.toml` in the directory it starts in, overridden by `settings.local.toml` beside it
and then by the environment, where a variable named `BMO_WEB_SERVER_`, the table, two underscores and the key
sets that key (`BMO_WEB_SERVER_DATABASE__URL`); the console reads its runtime configuration from the
environment. No address, token or name is written into the code.

- **What a deployment must set:** the server's `server.token` and `names.chat_agent`, without either of which
  `serve` does not stand; nor does it stand on a `time.zone` that names no time zone. `bmo-web-server settings` reads the settings and refuses, saying which is missing, where
  `serve` would; the deployment asks it before the flip, so no release is put live on settings it cannot stand on.

Deployed, the server's `settings.local.toml` is the data root's `env/web.toml`, and the console's environment is the
data root's `env/web-console.env`, which its unit reads and its build reads for the base path (docs/web.md,
「Running as a service」).

| Process | Setting | What it names |
|---|---|---|
| server | `server.listen` | the socket address the server binds |
| server | `server.token` | the bearer token every caller presents; the server does not stand without one |
| server | `database.url` | the server's PostgreSQL database |
| server | `sessions.valkey` | the Valkey sumida keeps its sessions in |
| server | `receiver.base`, `receiver.token` | the receiver, set together or not at all; with neither, a check or a grant on a message is refused 503 |
| server | `agency.base`, `agency.token` | the agency the supply hook is registered at and the token it is registered with, set together or not at all; with neither, no hook is registered and an administrator's read of a person's personal supply roads is refused 503 `no-agency` |
| server | `names.chat_agent` | the name the chat agent goes by in a room, which a fixed line says it as; the server does not stand without one, and a deployment must set it |
| server | `time.zone` | the owner's time zone, an IANA name, the zone the console shows every time in, which a fixed line naming a moment tells it in (「Fixed lines」); `settings.toml` names `Asia/Seoul`, UTC stands where none is set, and the server does not stand on a name that reads as no zone |
| server | `jake.hub_url`, `jake.install_base`, `jake.agent_key`, `jake.control`, `jake.control_token`, `jake.stream_ports` | the jake hub an invited machine attaches to, the folder its install scripts are served under, the key its credentials are made with, the hub's loopback control address and token the service asks which machines are attached, and the ports an invited machine's agent lets the hub stream to, which its one-line installs name: SSH's and the two of agency's link to a person's PC (agency's `policy/person-nodes.toml`), none leaving the agent's own default; with none of the first five, no invitation is made and every machine reads as gone |
| server | `secrets.dir` | the folder the secret store writes, the data root's `env/`, the platform's space every platform administrator holds and the folder every other person's stands under; a leading `~/` stands for the home of the user the server runs as, and `settings.toml` names the data root's `env/` under it |
| server | `mail.base`, `mail.token` or `mail.token_file` | bmo-mail, which the platform's own mail goes through (`docs/accounts.md`, 「The platform's own mail」), and the credential bmo-mail's settings name for the account service's system sends (its `system_mail.token`), given as itself or as the file holding it, the data root's `env/mail-system.token` on a deployment, read as the service starts and never said; a file that cannot be read stops the settings check; the address and a credential set together or not at all; with neither, system mail is not set up and every act that would send one offers the handed link in its place |
| console | `PORT` | the port the console listens on |
| console | `BMO_WEB_BASE_URL` | the base path every road of the console stands under, fixed as the console is built |
| console | `WEB_SERVER_ADDRESS`, `WEB_SERVER_TOKEN` | the server |
| console | `WEB_DATABASE_URL` | the server's PostgreSQL database, where the console's own tables stand |
| console | `NUXT_PUBLIC_CHAT_AGENT_NAME`, `NUXT_PUBLIC_CHAT_AGENT_LABEL` | the name the chat agent's messages stand under, and the label a room calls it by |
| console | `BMO_MCP_HOST_SOCKET` | the tool host's control socket, a Unix socket path, which a link card's page and picture are read through; with none, every card stands plain |
| console | `POCKET_SESSION_TOKEN_FILE` | the file the tool host writes the console's tool session token to, read afresh on every call; with none, every card stands plain |
| console | `NUXT_PUBLIC_CONSOLE_ADDRESS` | the console's public address, its scheme, public name and base path, which a link to one of its screens is written under; the console reads a link under it as its own (`docs/web.md`, 「비밀 보관함」), and a unit that writes such a link, the chat agent asking for a secret among them, is given the same address in its own settings; the links the platform mails — a reset, an email's verification — are written under it too, and a reset asked from the login screen sends none where it is not set, since the address a request reached is the asker's to choose |
| console | `AGENCY_ADDRESS`, `AGENCY_TOKEN` | the agency |
| console | `JOB_ADDRESS`, `JOB_TOKEN` | bmo-job |
| console | `RECEIVER_ADDRESS`, `RECEIVER_TOKEN` | the receiver; the token is the console's own credential the receiver's settings name for it (`[console] token`), not the receiver's service token, so the receiver takes from it the routes that file a person's words, which it refuses under its service token |
| console | `GATE_ADDRESS`, `GATE_TOKEN` | the gate, for the verdicts a room's messages were judged by |
| console | `VOICE_ADDRESS`, `VOICE_TOKEN` | the voice engine, for a line's briefings, their sound and the stream that says one ended; a console that names none stands every chip as never made and plays nothing |
| console | `BRAIN_ADDRESS`, `BRAIN_TOKEN` | the brain, which the console asks for its manifest and relays as any unit that brings a screen; the token is the console's own credential the brain's settings name for it (`[console] token`), not the brain's service token |
| console | `ORG_BRAIN_ADDRESS`, `ORG_BRAIN_TOKEN` | the brain again, for organisations' memories on the 조직 기억 tab: its address, the same as `BRAIN_ADDRESS`, and the brain's service token, since the console's own credential reaches the brain's screen routes for the administrator alone and the org memory tab is read and written by a unit's heads as well; with no address set, the tab's memories make no call and say the brain is not reached |
| console | `ARTIFACT_ADDRESS`, `ARTIFACT_TOKEN` | bmo-artifact, which the console asks for its manifest and relays as any unit that brings a screen; the token is the console's own credential the artifact's settings name for it (`[console] token`), not the artifact's service token, so the artifact holds every relayed call to its screens' role |
| console | `POCKET_ADDRESS`, `POCKET_TOKEN` | the tool host's console face and its console token, for its screens and the asynchronous calls a room's 진행 중 lists |
| console | `MAIL_ADDRESS`, `MAIL_TOKEN` | bmo-mail |
| console | `NOTE_ADDRESS`, `NOTE_TOKEN` | bmo-note, which the console relays as any unit that brings a screen, and asks for the permanent delete |
| console | `CALENDAR_ADDRESS`, `CALENDAR_TOKEN` | bmo-calendar, the same |
| console | `REVIEW_ADDRESS`, `REVIEW_TOKEN` | bmo-review |
| console | `DRIVE_ADDRESS`, `DRIVE_TOKEN` | bmo-drive |
| console | `REMOTE_ADDRESS`, `REMOTE_TOKEN` | bmo-remote |
| console | `CACHE_SIREN_ADDRESS`, `CACHE_SIREN_TOKEN` | the cache siren |
| console | `NODE_ADDRESS`, `NODE_TOKEN` | the node service |
| console | `ARBITER_ADDRESS`, `ARBITER_TOKEN` | the card master; it takes a token only where its own settings name one |
| console | `CACHE_WARMER_ADDRESS`, `CACHE_WARMER_TOKEN` | the cache warmer, which takes its bearer on every route, health included |
| console | `RESEARCH_ADDRESS`, `RESEARCH_TOKEN` | bmo-research, for the research settings on the agent screen's searcher tab and the research screen; it takes its bearer on every route, health included |
| console | `NUXT_PUBLIC_BMO_UI_TRANSLATOR_SERVICE`, `NUXT_PUBLIC_BMO_UI_TRANSLATOR_PATH` | the translator a bundle's screen translates through (bmo-ui's `docs/console-bundles.md`, 「Translation」): the service's name, as its manifest gives it or as the console's `<NAME>_ADDRESS` setting names a unit it calls directly, and its translating route on that service's API, under that manifest's API prefix or among its `relays` for a service that answers one; a bundle that translates names the service under `calls`. With either unset, no bundle's screen translates |
| console | `NUXT_PUBLIC_BMO_UI_TRANSLATOR_BATCH`, `NUXT_PUBLIC_BMO_UI_TRANSLATOR_ASKS_AT_ONCE` | the most originals one ask of the translator carries, and how many asks a tab holds out at once; each a whole number of one or more, bmo-ui's defaults, 4 and 1, standing where it is unset |
| console | `KEEPALIVE_CONSUMER` | the consumer an agent's switch is thrown under at the cache warmer where no consumer registers a target for it; with none, an agent's own keepalive switch is not offered and the round's still is |
| console | `DEPLOY_ROOTS` | the deploy roots whose progress records the title bar reads, separated by `:`, each a unit's deploy root holding its `deploy-progress.json`, the `deployed.json` and `deployed.log` of its deploys and the build tree `deploy-expand`; with none, no run stands |
| console | `TESTBED_BIN` | the testbed's program, whose `status --json` the TODO rows' testbed line reads; `bmo-testbed` under `~/.local/bin` where it is not set |
| console | `LOG_UNIT_PREFIX` | the prefix of the names of the units whose lines the monitor's 로그 tab reads, and of the slices that name their categories; `bmo-` where it is not set |
| console | `DOCUMENT_ROOTS` | the document viewer's roots: a JSON list, each root's `key`, its `label` and the absolute top of its `checkout`, in the order the list stands them (`docs/documents-viewer.md`, 「The roots a deployment names」); a key one of the roots other units keep already holds names no root. With none, the viewer lists only those roots, unread, and opens no document |
| console | `DESKTOP_RELEASE_URL` | the desktop app's release read, the JSON file naming its current release (jake's `docs/desktop.md`, 「The read the console uses」); where it is a GitHub latest-release address that answers 404, the newest pre-release of that repository stands in; with none set, the download page says no release is published |
| console | `WEB_DATA_DIR` | the console's own data folder, inside no checkout |
| console | `WEB_FEATURES_FILE` | the console features file, which parts of the console's own a deployment shows (`docs/web.md`, 「The console's features」); every part stands where it is not set |
| console | `NUXT_SESSION_PASSWORD` | the key the console seals its session cookie with |

- **A unit whose address is not set** is a unit the console does not reach: its screens stand as they do for a
  unit not yet split (below), and no call is made.

## Gaps the console meets

What the console needs and no unit serves stands empty in the console until a unit's document states a route
for it, and no file or table of that unit is read meanwhile.

- **A room's members.** The receiver's published client carries no route for a room's members, so the console asks
  `GET /rooms/{roomId}/members` on the receiver's address as every unit call is made, and reads its answer field by
  field: `members`, each `person` (the person number the room's lines carry, or null where none was given), `name`
  and `statusMessage` (or null). A row with no name is left out, and a field it does not find stands as none. Its
  `record-only-room` and `members-unlisted` refusals are no failure: the room has no chat-service members, which the
  sheet says where it has no members at all; its `members-unheld` is said by the pack's own sentence (`docs/web.md`,
  the room screen's 대화상대).
- **A room's messages by what they hold.** The receiver's published client names no `holding` on its messages
  route, so the console asks `GET /rooms/{roomId}/messages` with `holding` beside the query the client names, and
  reads the page as every page of the room's messages is read (`docs/web.md`, 「방 정보」).
- **A room's accounts and an account's words.** The receiver's published client carries none of its routes for the
  console's rooms — an account's record identity, the rooms an account is a member of, a room's members by account,
  letting an account in and taking one out, and words and files said by an account — nor `openedBy` on a room on the
  record alone, nor `privateOf` and `sealed` on a room it reads, nor the `account` a change in a room is made as (an act on a
  message, a sticker, a forward, a line read aloud, a room's pin, its picture, its mode, its removal), so the console asks each on the receiver's address as every unit call is made, reads its answer
  field by field, and reads every message id in it as exact. The receiver's refusals of a room's chat-service members
  are read as 「A room's members」 above says. While the
  receiver serves no route for an account's memberships or a room's accounts, its `no-route` refusal of either reads
  as none, so a room stands as its other roads give it.
- **A member's rights in a room.** The receiver's published client carries no route for what a member may do to the
  room's people besides being one, so the console asks `GET`, `PUT` and `DELETE /rooms/{roomId}/accounts/{account}/grants`
  on the receiver's address as every unit call is made and reads its answer field by field: `letIn` and `takeOut`, each
  false where the answer does not name it, and `mayWrite`, whose standing in the room the receiver's own rule says may
  write them. While the receiver serves no route for rights, its `no-route` refusal of the read reads as no rights and
  no writing, so the room's members stand with no controls. Any answer that says the read could not be made at all —
  a route unwritten, a row unknown, the receiver not answering — reads the same way, and the members read never fails
  for a rights read that failed (`docs/web.md`, the room screen's 대화상대).
- **The rest's end and the owner's notice switches.** The agency's published client carries `GET /rest` and no
  `DELETE /rest`, and the receiver's carries neither `GET /notice-switches` nor `PUT /notice-switches/{kind}`; the
  console asks each on its unit's address as every unit call is made and reads its answer field by field as that
  unit's `docs/api.md` states it: the rest's `resting`, `until` in epoch seconds, `kind` and `ended`, a field it does
  not find standing as none; and the switches' `restart` and `rest`, each on unless it reads false. No stream the
  console holds tells the rest's beginning or its end, so the console reads the rest on a clock (`docs/web.md`, 「What
  each agent is doing now」).
- **A field a route answers that the published types leave untyped.** The agency's client types every route the
  console reads; where a field is typed as an open value — a supervisor's `sampling`, a repository's `sampling` — the
  console reads it as the agency's `docs/api.md` states it, a field it does not find standing as none. The client names
  no `roleName` filter on `GET /jobs`, which that document states, so the console asks it as written there; nor does
  it name a job's `reviewing` state, which the console reads as that document states it.
- **Who stands in a room.** The receiver's registration answers `standingAgents`, the agents whose own words the
  room's record holds, which is its own test of who stands there and what leaves the room's choice of supervisors the
  agents already answering in it; the client pack this console installs from the receiver's repository does not name
  it yet, so
  the console asks that one read on the receiver's address as every unit call is made and reads the field by field as
  that unit's `docs/api.md` states it, a field it does not find standing as none (the room screen's 부를 수 있는
  감독관, `docs/web.md`). The pack gains the field when the console next takes a new one, and until then no typed call
  reads it.
- **An engine's own sampling values.** The agency answers which sampling settings a repository may hold and their
  bounds, and says a setting left out is the engine's own default, whose value no route answers; so such a box stands
  empty with `(기본값)` as its placeholder (「The default among choices」 in `docs/web.md`).
- **Whose flush minutes are in force.** The agency's `GET /settings` answers `deployFlushMinutes` as the minutes in
  force, the owner's where they are set and its policy's otherwise, and no route says which, nor what the policy's
  are. So the 시스템 및 조직 screen's 공급자 tab shows the 일괄 배포 주기 figure with no `(기본값)` mark, and an emptied box
  hands the agency null to return to its own (`docs/web.md`, 「System and organisation」).
- **The newest lines of one run.** The agency's `GET /log-lines` answers from the start of what it is narrowed to,
  oldest first, and pages forward by `after`; a page *before* a line id is answered too, so the console server asks
  a job's newest lines as the page before a line id above every line the agency holds — its line ids rise in one
  shared sequence that only ever gains. A run that is no job's has no such narrowing: the agency answers a ledger
  run by the lines written under its unit, from its start, so the console server reads one of those newest lines
  out of the agent's log from `GET /log/agents/{agentName}/lines`, keeping the run's lines, as `docs/web.md`
  (「Where the log comes from」) states. The agent read there is the one the run's first line names: a job's run
  stands in the ledger under the worker it was ordered for, while its lines stand under the seat that ran it,
  carrying the job by number and a `runId` of nought.
- **A job's lines, and the name that reaches them.** A job's lines carry their job, stand under the seat that did
  the work, and may hold no ledger row at all while its turn has published none, so a job's log is read by
  `GET /log-lines?jobId=` and its line, prompt and figures by `GET /jobs/{jobId}`: neither the checkout the ledger
  names the run for nor the seat's own name is a key a screen can hold on to across a job's turns.
- **A repository's own log.** The agency writes a run's log under the supervisor or the role it is for, never under
  a repository, so a repository's screen reads its jobs from `GET /jobs?repositoryName=` — a checkout's own name is
  no filter there, so its repository is asked for and that checkout's jobs kept — and the log of a job by its job,
  and holds no log of the repository across its jobs.
- **What a job has called and spent so far.** The agency's `GET /jobs` answers a job's usage only once its turn
  has ended, and no count of its calls. Each line of a job's run keeps the metadata its writer filed, and a line a
  model's request produced carries that request's id and its usage there, the same usage on every line of one
  request; so the console server reads the run's lines from `GET /log-lines`, newer ones only on each later read,
  counts the call results among them and sums the usage of every request once.
- **What a chat turn was handed, once it has ended.** The receiver composes the reference documents a turn goes out
  with, each in full or as an already-loaded mark, and tells them in its live picture of the running turn only: the
  turn it sends the agency (`POST /sessions/{sessionId}/turns`) carries no list of them, so the agency's log of the
  run holds no `context` line, and no receiver route serves the list for a finished round. A finished answer's
  브레인 chip therefore holds its brain calls alone on such a road, until one of the two serves the list.
- **The id that ties a call to its result.** The agency's document names it `ref` on a log line's fields, and the
  lines it serves carry it as `reference`; the console reads either, `ref` first.
- **A checkout's branch and whether it is dirty.** No unit serves them, so a tool call's prompt line names the
  worker, the checkout, the time and the path, and stands no branch and no dirty mark.
- **A chat provider's name for a reader.** The receiver calls each provider by a label of its own, in English for
  the room's record, and serves none in a reader's language, so the console never shows that label and names each
  provider by its key in the pack (`docs/web.md`, 「A chat road's name」).
- **Why a silent turn sent nothing.** The receiver's `docs/wake.md` says a silent turn's `skipped` verdict and its
  `skipped` event carry the reason its skip named. A round that ends in a skip through its instruction pipeline writes both
  with no reason, though its round log keeps the reason on its skip row, so the line under such a turn stands with no
  reason until the receiver carries it there. The console reads the reason from the verdict alone, never from the
  round log.
- **What a room's page does not carry.** The receiver's pages carry a message's words, its sender, its round and
  its files' names, and nothing else a bubble's chip line wears. The console reads those from the units that hold
  them: a page's verdicts from the gate's `GET /judgements`, read for the time the page covers and handed on as each
  verdict's stage, words, time and round alone, then read again whole, with what the gate wrote under each, its
  roads, the offers record of its round and a picker's lines, for the verdicts an answer's record stands when that
  record is opened, within the seconds they were written in; a silent turn's reason from its `skipped` verdict's
  words, read after the page for the marks it shows and translated through the gate's `POST /translations`; the gate's `draft`
  verdicts among them, which stand in the answer's 드래프트 when the round log holds no row of it; what the round behind
  a message cost and called from the agency's `GET /runs` and its log lines — the answer line's usage and every
  line naming a tool — read after the page, for the rounds the room asks about, each round's runs side by side;
  and how the round's answer was drafted from the receiver's `GET /rounds/pipeline`, read once
  for the page's rounds for the draft chip's count, and again for one round, its answers whole, when the chip is
  opened; and each line's voice briefings from the voice engine's `GET /briefings?chatId=`, read once for the page's
  room, the newest first, for the chip each line carries. The metadata a message arrived with is read for every
  message whose row may draw words from it — a message whose page names a file, since a custom emoji, a sticker and
  a video's shape each stand on one of its files, and a message that is not an agent's answer and has words, since
  its formatting entities stand in the metadata whatever the message carried. An agent's answer naming no file is
  drawn as its markdown and is asked nothing. The files a message carried are listed only for a message whose page
  names one.
- **Which memory a piece the round read is.** The receiver's round end names each piece it read by its path,
  the index's words for it where the gate's index lists it, and how it was read, and names no memory of the
  brain: the 브레인 list's modal reads a memory only for a piece whose read carries its `memoryId`, and stands the
  gate's piece text for one the index lists otherwise. A piece of the turn's core — a person's thread, the room's
  due list — carries no words of the index's, so it stands by its path, the room's due list aside.
- **What a room's agents ran and spent there.** The receiver's figures hand each agent's runs, last run and tokens
  as null, since the agency answers none of them by room, so the session sheet stands each as "—".
- **Which agent a message is, and the voice it went out in.** A message the receiver wrote before it named the
  agent and the voice on its own sends carries neither, so such an answer sent in the owner's own account is told
  by its number being both an agent's and the owner's and by its carrying a round, and its agent is taken to be the
  room's voice. A line an agent sent there in no round reads as the owner's own, and another supervisor speaking in that
  voice reads as the voice agent.
- **An order within one second.** The receiver walks a room's line by when each message was sent and the order it
  took them in, and hands no such order with a message, so a read mark's place is when its message was sent and
  the marked message itself.
- **The rooms each sender has stood in.** The console reads them from the receiver's `POST /rooms/titles`,
  which the receiver's document states for another caller; the console reads it as that document states it.
- **What is running beside the chat, and what has just run.** The receiver's live picture holds the chat's turns
  and the rooms folding. The jobs running beside the chat are the agency's `GET /jobs`, read under its `running`
  filter, so a job `reviewing` while its orderer weighs its report stands among them: each names the item it is a run of, and the item is what a stop names. A job whose launch named no
  room is placed in the room its item's scope names, read from the job service's item; one whose item names no room
  stands in no room. The
  runs of runners, gates and editors going now, the executions, gate runs, runner records and standing watches that
  have just run, the machine's standing and the nodes are lists no unit serves, so the console stands without
  them. The jobs that have just run are the agency's `GET /jobs` at `ended` and `stopped`.
- **Usage.** The agency's `GET /accounts` carries each Claude account's usage window, as the session and weekly
  share and reset its `PATCH /accounts/{accountId}` records, and answers none today; the provider the chat agent runs
  on is the `provider` of the supervisor the receiver's default answerer setting names, and each account's name stands in its `GET /fallback` answer (below). So the
  account the chat runs on reads its figures and every other account reads as having no reading, never a figure
  borrowed from another. No unit counts a login within the account that owns it — the number a screen calls it by is
  the console's own, counted over that same `GET /fallback` answer of every login the reader is told of, so an account
  the panel leaves out of its groups is counted all the same (docs/web.md, 「System and organisation」, 「공급」). `GET /usage` grouped by `agent` counts the jobs of each checkout and the tokens they spent, with
  the four kinds summed over the jobs that reported them apart and how many jobs, and how many tokens, reported none;
  a checkout whose jobs carry no tokens holds no figure rather than a nought, and a group that names no kinds reads
  as wholly not split. No unit serves a tally by user or the context of a session a
  room holds.
- **A turn's figures and what a running job has spent.** The roads a turn walked with what each spent are recorded
  by the agency and served by no route, so a turn stands without its figures; and what a running job's models have
  spent so far is the agency's to say while the turn goes and no route of its answers it, so a running job's line
  names no model until the job has ended (bmo-job's `docs/reading.md`, "A worker's job line").
- **What bmo-job's readings of an item do not carry.** An item's line and its opened reading carry no room it came
  from, no brief, no moment it was filed or finished, no progress, stop or held checkout of its work order, no
  wait its job marked, nothing of whether a deployment waits on it or whether its order is under way, and no
  approval taken back; and no route serves the turns of an item's talk, every open question with its words and
  options (a room's open questions come without them), or when each task of a work order ended. The panel's rows
  stand without those, a finished item whose run still ends reads as finished rather than as reporting, an item's
  talk stands empty, the question bar and a question's ringing stand with nothing
  to say, and a task stands without its end. A search reaches every open item whole and a finished one by its
  line, its number, title and status, since opening every finished item is a read per item.
- **An item's reports, counted.** bmo-job's item rows carry no count of the item's reports, so the board reads the
  reports of every finished and held item it hands over, one read per item, and keeps each for a minute while the
  item's `changedAt` stands. A report appended moves no state, so one written in that minute reaches the row's mark
  only when the minute is up; the item's dialog reads its reports itself.
- **An item's 미결.** bmo-job labels a job's unfinished note's `held` report as the note and keeps no resolution of
  one; a note written before it labelled the note carries no mark of its own, and the console tells that one by the
  `final` report its writer wrote with it. The console keeps the resolution in two labels of the item (`docs/web.md`,
  the TODO panel's section, 「Where a 미결 is read from」). Its item row carries none of that, so under the 미결
  condition the board reads the reports of every finished item, kept a minute as above, and so does the raising
  form's chooser of the other notes still standing as it opens, and a line raised from notes reads each source's
  reports for the words it attaches. Nothing in bmo-job reads
  the `from-todo` label its `todo --add` writes or resolves a note when the lines raised from it finish, so the
  console's server does both: it holds bmo-job's stream of item changes open itself, reads the lines raised from
  notes by that label each time a line moves to a finished state and once each time the stream opens, and writes the
  resolution the owner would have written (`docs/web.md`, the TODO panel's section, 「미결 해소」). Only a line
  raised with the label counts, so a line raised before the console wrote it resolves nothing.
- **A worker's downgrade heal.** Whether a worker's session is put back on its model when it answered on a lesser
  one is set by the agency's command line and taken by no route, so the console's switch for it changes nothing.
- **A tool's icon.** Which icon each of the deployment's own tools declares is the tool host's to say, and no unit
  hands it to the console, so every tool in a log takes the one generic icon.
- **The agency's documents, whole.** The agency serves the prompt documents it deploys by no route, so the
  document viewer stands their roots unread and reads none of its folders (`docs/documents-viewer.md`, 「The roots
  kept by other units」).
- **Which agent holds a session, and what moved a cache prefix.** Both are the agency's records and no route serves
  them, so the cache siren screen names a request only where a runner's own directory names one, and no request that
  lost its prefix carries a cause. The siren's caller fields (`scope`, `actorName`) are the caller's own and the
  daemon reads none of them, so a posted request names no agent there either.
- **What a deployment carries and why it put nothing live.** The testbed's progress record names no items and says
  why a run stopped in an English sentence with no code, so the deployment mark's popover lists no items for a run
  and a stopped run is said by its outcome alone.
- **An item's talk.** The unit that kept an item's talk was bmo-job, whose fixed API keeps none; the receiver's
  talks answer one turn and keep no turns. A talk about an item stands with no turns and takes none.
- **A runner's launch and a run's stop by its kind.** The fixed APIs launch an item on its worker, not a free runner;
  and they stop a job by its own state or a run by its own close, so the board names an item's job and a run's
  number. A launch stands unavailable.
- **A work key's tier.** The agency answers each tier's mapping on every provider and each work key's road, and
  takes a tier's change; which tier a work key stands at is no part of an answer, so the tier screen's
  assignments stand empty.
- **A work order's own figures.** The fixed order carries its purpose, directive, steps and tasks; the road each
  task ran, what it spent, the round it belongs to and the end it came to are no part of it, so those stand empty.
  Nor does it carry a design stage: each step is one task, counted from one and run in turn, so its tasks stand
  as the order's steps alone, each named by its place among them and titled by its own step, and no stage of
  the console's order holds them.
  Nor does it name the worker it runs on: the console's order names none, and a task's work view stands on the
  item's own worker, the built-in worker where the item names none.
- **A room removal's counts.** The receiver answers a removal's preview and what it took in its own shape; the
  console's rows, settings and archive copies are no part of that answer, so they stand empty.
- **The store's kinds, skills and attachments.** The agency's catalogue, personal-apps, personal-skills and attachments
  routes are asked on the agency's address as every unit call is made, outside its published client, and their answers
  are read field by field (`docs/web.md`, 「App catalogue」, 「내 개인 앱」, 「내 스킬」 and 「내 에이전트」): a shared item's
  `kind` (`app`, `skill` or `mcp`, an app where it names none), `language`, `titles`, `descriptions` and `machine` (none
  where absent), `server` for an MCP item (`transport`, and `url`, `auth`, `header` and `secret` for a remote one or
  `command` for a local one; none where it is absent, names neither transport, or names a remote one with no `url`),
  and `may.translate` and `may.text` (off where absent); a personal app's `kind` (`mcp` or else an app);
  a skill's `name`, `description`, `title`, `summary`, `titles`, `summaries`, `language`, `version`, `origin`, `app` and
  `attachedTo`, and its `files` by path; a holder's `kind`, `name`, `label`, `role`, `line`, `takes` (each kind off where
  absent), `skills` and `mcp`, and each attachable item's `name`, `title`, `titles` and `origin`. The agency's 409
  `line-takes-none` is said by the sentence of the kind it names, by `kind` or `field`, MCP for `mcp` and skills
  otherwise.

## Screens of units not yet split

A unit that answers no console manifest has no screen in the console: no navigation entry, no route and no page.
No file of a unit's screen is carried here. `docs/inventory.md` lists every file of the old screens.

- **What the document viewer shows of the gate unit's seek gate** stands without it and makes no call: the question
  box answers from the documents' own text. The translator is reached at `GATE_ADDRESS` (「Calls the console
  makes」); a console that names no gate stands the translation toggle unavailable.
- **What the agency screens show of a unit not yet split** stands unavailable and makes no call: the nodes a worker
  may stand on, the node unit's. A worker stands on this machine alone.

## The codes the packs render

Every other unit answers in English messages and codes; the language packs here hold the sentence each code is
shown as.

| Unit | Codes | Where they are listed |
|---|---|---|
| the receiver | its refusals, each by the table beside its calls — every route's, the owner's sends, the voice briefing, removing a room and the instruction stages'; a file a send did not take, by its kind; the fixed lines through `POST /words/render`. Its facts are an agent's to say, and no screen shows them | the receiver's `docs/codes.md` |
| bmo-job | its refusals, each by the table beside its calls; the answers a screen says, a queue told and an unanswered turn; the kinds a row is laid out by, the held words, the line and model marks, and the phases a job's time is divided into | bmo-job's `docs/api.md`, 「Codes」 and 「Routes」; its `docs/jobs.md`, 「Where a job's time went」 |
| bmo-chat | the lines a chat service hands over, `people-joined` and `person-left`, which the receiver keeps as `fixed-line` messages and the console renders through `POST /words/render` | bmo-chat's `docs/contract.md`, 「Lines」 |
| the attendance service | the key of the org memory it writes into a unit's org brain, `attendance-working-hours`, the unit's working hours from its work pattern, which the 조직 기억 tab names as its source (`docs/web.md`, 「조직 기억」) | that service's own documents |
| every content unit the permanent delete asks | the kinds each counts and removes, each said by the pack's word for it where one stands and the rest summed as other records, so a unit's new kind needs a word added and nothing else (`docs/web.md`, 「영구 삭제」) | each unit's own `docs/api.md` |
| bmo-ui | the 146 keys the layer reads | bmo-ui's `docs/boundary.md`, 「Wording keys」 |

## The public address

The console answers under one base path, the one its settings name, behind the deployment's proxy. The proxy
hands on the base path as it is, and flows the event streams unbuffered. The port the console listens on and the
public name stand in the console's settings (「Settings」), the public name in `NUXT_PUBLIC_CONSOLE_ADDRESS`, and are
not written into this repository.

| Road under the base path | Where it goes |
|---|---|
| every road | the console, at the port its settings name, the base path handed on as it is |
| `/api/events` and every other event stream | the console, unbuffered, the connection kept open while it idles |
| `/api/<service>` and every road under it | the console, which hands each on whole to the service a manifest names (「Calls the console makes」), behind its sign-in but for the share reads a manifest names and a bundle's module and stylesheet |
| `/api/console-bundles` | the console: the bundles the signed-in reader may open, with their words; with no session, the one bundle whose share page the `path` asked for stands under, the one with the longest screen path where one stands under another |
| `/api/console-features` | the console: the deployment's features, each `organizations`, `research`, `siren` and `monitor` true or false, read from the file `WEB_FEATURES_FILE` names (`docs/web.md`, 「The console's features」) |
| `/api/console-bundles/unread` | the console: the sidebar counts of the bundles the signed-in reader may open whose manifest names a `sidebarUnread`, each read by the console from the unit with its own credential and the reader's owner key and role, answered by screen path for each count that answered |
| `/api/people/members` | the console: the members of the signed-in reader's company, each `user` and `name`, read from the server's `GET /users/members` with the reader's owner key and role and handed to a bundle's page only where its manifest names `people` under `calls` (`docs/web.md`, 「Screens a unit brings」) |
| `/api/rooms/<chatId>/let-in` | the console: the people the signed-in reader may let into that room, as the server's room-named search and members list answer them with the reader's owner key and role (`docs/web.md`, 「방 만들기와 대화상대 추가」); no words answer the set whole, words search it |
| `/api/desktop/pairings` | the console, with no sign-in, for `POST` alone: a pairing asked of the server for the address the proxy names, answered as `pairing`, `code`, `approveUrl` (the console's `/desktop/pair?code=<code>&in=app` under its public address) and `pollAfterSeconds`; the server's 429 handed on (`docs/web.md`, 「Access」) |
| `/api/desktop/pairings/<pairing>` | the console, with no sign-in, for `GET` alone: the server's read of the pairing handed on, its status as it stands, the 200 answering `node`, `credential` and `hubUrl` under `Cache-Control: no-store` |
| `/api/desktop/release` | the console, with no sign-in, for `GET` alone: the desktop app's release read, `release`, the public release or null, with its `channel`, `stable` or `preview`, which the download page reads and the desktop app checks a server by (`docs/web.md`, 「Access」) |
| `/api/github/deliveries` | the console, with no sign-in, for `POST` alone and a body of at most 1 MB: handed on unchanged to the agency's `POST /github/deliveries` with GitHub's headers and the agency's token (`docs/web.md`, 「Access」) |

The server answers on its own listen address to the console and the other units on the machine, and no road of
the proxy reaches it.
