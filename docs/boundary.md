# The boundary

**Fixed at 0.1.0-rev.1.**

This document is bmo-web's boundary: every route its server serves, every call its server and its console
make on another unit, the settings that name those units, and the codes its language packs render. A unit
reaches bmo-web only across it, and bmo-web reaches another unit only by the calls below: never by its code,
its tables, its files or its process.

bmo-web stands in two processes. The **server**, under `server/`, is the account service on sumida with the
language packs: the users, the senders linked to them, the grants they hold, the account model they stand in,
and the sentences a person reads. The **console**, under `client/`, is the Nuxt app a person signs in to; its
own server is the only caller that faces a browser, and it reaches the server and every other unit over HTTP.

## Versioning

- **The boundary carries the repository's one version, in semver,** the version `VERSION` holds.
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
  number, a string a caller hands on as it stands; all other ids are signed 64-bit integers.
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
  another unit that failed; and 503 `not-in-force` while the account model is not in force, `no-receiver`
  where a message is asked after and no receiver is named. sumida's session routes answer sumida's own refusal
  shape, documented in the same OpenAPI document.

## What the server serves

### Health

| Route | Answer |
|---|---|
| `GET /health` | `ok`, `version`, `inForce` |

### The account model

| Route | Request | Answer |
|---|---|---|
| `GET /accounts/model` | | `inForce`; `why?`, where it is not in force |
| `POST /accounts/move` | `ownerSenders` (each a sender), `rooms` (each a room the deployment answers), `roomRules?` (each `room`, `id`, `subject`, the sender the rule is for, and `words`) | `done`, `written`: true where this call wrote the move, false where it stood already, and `administrator?`, the user the move made the platform administrator |

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
| `GET /users` | the login's user in `Owner-Key` and role in `Owner-Role` | `users`: each `user`, `name`, `administrator` (boolean); 403 for any login but the administrator |
| `GET /users/search?q=&limit=` | the login's user in `Owner-Key` | `people`: each `user`, `name`, `organization` (the person's unit), `jobTitle`, and `landline?`, `mobile?`, `email?` for the administrator or the person; at most 20 without `limit`, never more than 50; 403 where the call names no user of the deployment |
| `GET /users/members` | the same | `members`: each `user` and `name` of every user of the reader's company but those marked left, in the directory's order and with no limit; 403 where the call names no user of the deployment or the reader's unit stands in no company |
| `GET /users/{user}/person` | the same | 200, one person in the same shape as a search row; 404 where the user does not stand or stands in another company |
| `GET /users/{user}` | | `user`, `name`, `administrator` (boolean), `senders` |
| `GET /users/{user}/senders` | | `senders`: the sender numbers linked to the user; 404 where there is no such user |
| `POST /users/{user}/password` | `current`, `next` | 204; 401 `wrong-password` where `current` does not match |
| `POST /users/{user}/name` | `name` | 204; 409 `name-taken` where another user holds it |
| `GET /users/{user}/profile` | the login's user in `Owner-Key` and role in `Owner-Role` | `jobTitle`, `landline`, `mobile`, `email`, each empty where none is kept; 403 `forbidden` for another login |
| `POST /users/{user}/profile` | the same headers, and `jobTitle`, `landline`, `mobile`, `email` whole | 200, the profile as it now stands; 403 `forbidden` for another login |
| `GET /users/{user}/sections` | the same headers | `sections`: each `section`, `read` and `write` (booleans), the console's sections in its navigation order; 403 `forbidden` for another login |
| `PUT /users/{user}/sections` | the same headers, and `sections` whole | 200, the sections as they now stand, every write also a read; 403 `forbidden` for any login but the administrator |

- **A user** is named by its id as the server gives it, a string a caller hands on as it stands; a body naming
  a user may give it as that string or as the number it holds, and a path whose user is no id is refused 400.
- **A profile is its account's holder's or an administrator's.** The call names the login it is made for in
  `Owner-Key`, its user id written as a decimal number, and `Owner-Role`, and any other login is refused 403
  before a row is read or written. The fields are the account's own, kept by the service; a field left empty
  clears what it held.
- **A sender** is a whole number, as the receiver names a message's sender.
- **The people of a company are read by its own users,** whatever unit of it they stand in. A search is matched
  only against the fields its reader may see: the name, the unit and the job title for every user, and the
  landline, mobile and email for the platform administrator or the person themselves. A contact field the reader may not see is
  absent from the answer and is no answer to a search (`docs/accounts.md`, 「The people directory」).
- **A console section** is named by the first part of its screen's path — `monitor`, `rooms`, `brain` — or, for
  agent management's five parts, by its tab — `supervisors`, `roles`, `repositories`, `models`, `model-files` —
  or is `live`, what runs now, which no one screen holds —
  and its `read` and `write` are relations of the deployment's `bmo_section` kind, checked through sumida's
  point check. A write is also a read, and the platform administrator passes every section. The set is written
  whole, so a section left out is taken away (`docs/accounts.md`, 「Console sections」).

### Organisation units

| Route | Request | Answer |
|---|---|---|
| `GET /users/{user}/unit` | | `user`, `unit`, `company`, each a unit reference (`id`, `name`), and `path`: the unit references from the company down to the user's unit; 404 where there is no such user |
| `GET /units/{unit}` | | `id`, `name`, `parent?`, `company` and `path` as above, `children` (unit references, by name), `heads` (the users granted head of this unit directly) and `members` (the users standing in it); 404 where there is no such unit |
| `GET /units` | the login's user in `Owner-Key` and role in `Owner-Role` | `units`: every unit, each `id`, `name`, `parent?`, `heads` and `members`, companies first and each unit after its parent; 403 for any login but the administrator |
| `POST /units` | the same headers, and `name`, `parent?` | 201, the unit as `GET /units/{unit}` answers it; a unit with no parent is a new company; 404 where the parent does not stand |
| `PATCH /units/{unit}` | the same headers, and `name?`, `parent?` | 200, the unit; 409 `other-company` where the new parent stands in another company, 409 `cycle` where it stands under the unit itself |
| `PUT /units/{unit}/heads/{user}` | the same headers | 204: the user is granted head of the unit |
| `DELETE /units/{unit}/heads/{user}` | the same headers | 204: the grant is taken away |
| `PUT /users/{user}/unit` | the same headers, and `unit` | 200, the user's unit as `GET /users/{user}/unit` answers it |
| `POST /units/{unit}/members` | the same headers, and `people`: each `user`, `from` (the unit the person stood in when the move was shown) and `head` | 200, the unit as `GET /units/{unit}` answers it, with every person standing in it and holding or not holding its head as `head` says; 400 for no people or a person named twice, 404 where the unit or a user does not stand, 409 `left` for an account that has left, 409 `moved` where a person no longer stands in `from` |

- **A unit** is one of sumida's organisations, named by its whole number. A unit with no parent is a company,
  and its `company` and `path` are itself (`docs/accounts.md`, 「Companies and organisation units」).
- **`heads`** lists only the grants on the unit itself; whether a user heads a unit, through a grant on a unit
  above it as well, is the unit check below.
- **A move of several people** is written whole or not at all: one refusal leaves every person where they stood.
  A person coming from another unit is no longer granted head of the unit they leave; a grant above it stays
  (`docs/accounts.md`, 「Companies and organisation units」).

### Invitations

| Route | Request | Answer |
|---|---|---|
| `POST /invites` | the login's user in `Owner-Key` and role in `Owner-Role`; `unit`, `head`, `hours` | 201, the invitation: `token`, `unit` (a unit reference), `company`, `head`, `expiresAt`; 403 for a login that heads no unit at or above it, and for `head` from any login but the administrator; 503 `no-hub` where the settings name no hub |
| `GET /invites` | the same headers | `invites`: the open ones the login made, or every open one for the administrator, newest first |
| `GET /invites/units` | the same headers | `units`: the units the login may invite into, each `id`, `name`, `parent?` (the unit it stands under, absent for a company) and `company` (a unit reference, itself for a company), companies first and each unit after its parent |
| `DELETE /invites/{token}` | the same headers | 204; by the one who made it or the administrator |
| `GET /invites/{token}` | | `unit`, `company`, `head`, `expiresAt`, `state` (`open`, `expired`, `used`); 404 where no invitation has the token |
| `POST /invites/{token}/accept` | `name`, `password` | 201, `user`, `agent` (the machine name), `credential`, `hubUrl`, and `install`: `linux` and `windows`, the one-line installs; 409 `invite-closed` where it is expired or used, 409 `name-taken` where the name stands, 409 `not-ready` where the deployment's default role does not stand |
| `POST /invites/{token}/proof` | | `active`: whether the account's machine is attached and the account now enabled; `user?`, the account, where it is |
| `GET /users/{user}/node` | | `agent?` (the machine bound, none for an account bound to none), `attached`, `provenAt?`, `left`, whether the account has left |
| `PUT /users/{user}/node` | `Owner-Key`, `Owner-Role`; `agent?`, the machine's name, letters, digits, `-` and `_`, at most 63 | the administrator's alone, 403 for anyone else: the account bound to the machine named, or to a fresh name where none is; `agent`, `credential`, `hubUrl`, `install` (`linux`, `windows`) and `attached`, whether the hub holds it, the binding proven where it does; 400 for a name that does not read as one, 404 for no such user, 409 `node-taken` where another account is bound to it, 409 `left` for an account that has left, 503 `no-hub` where the settings name no hub |
| `DELETE /users/{user}/node` | `Owner-Key`, `Owner-Role` | 204: the account bound to no machine, by the administrator alone; 404 where it is bound to none |
| `POST /users/{user}/node/proof` | | the account's machine as `GET /users/{user}/node` answers it, the binding recorded as proven where the hub holds it; 503 `no-hub` where the settings name no hub |
| `POST /users/{user}/leave` | `Owner-Key`, `Owner-Role` | 204: the account is marked left and its sign-in disabled, by the administrator or a head of the user's unit; 403 for anyone else |

- **The accept, the proof and the read of an invitation take the server's token alone,** with no owner key: the
  console calls them for a person who has no account yet, by the token in the link (`docs/accounts.md`,
  「Invitations and a person's machine」).

### Checks
### Checks

| Route | Request | Answer |
|---|---|---|
| `POST /checks/room` | `room`, `sender?`, `relation` | `allowed`, `grant`, `user?` |
| `POST /checks/message` | `room`, `message`, `relation` | `allowed`, `grant`, `user?`, `sender?` |
| `POST /checks/object` | `kind`, `object`, `relation`, `user` | `allowed`, `grant` |
| `POST /checks/unit` | `unit`, `user` | `allowed`: whether the user heads the unit or a unit above it, `grant` (`organization:<unit>#manage`); 404 where there is no such unit |

- **`grant`** is what was asked for, `kind:object#relation` (`bmo_room:<room>#<relation>` for a room), as a
  caller names it when it says what a user lacks.
- **A room check** builds the sender's user where their identity is linked, and the room's members, always.
- **A message check** asks the receiver for the message's sender (「Calls the server makes」) and checks that
  sender in the room; a message the receiver does not hold in that room is refused 404 `no-such-message`.
- **An object's `kind`** is one the server's rules declare: `bmo_worker` (relation `run`), `bmo_repository`
  (relation `change`) or `bmo_tools`. A kind or a relation the rules do not declare is refused 400.
- **The platform administrator passes every check.**

### Grants

| Route | Request | Answer |
|---|---|---|
| `GET /grants?room=` | | `grants`: each `relation`, `subjectKey` (`user:{user}`, `bmo_member:{room}` or another key), `expiresAt?`, `words?`, the grants made on the room in the order they were written, none past its expiry |
| `POST /grants` | `room?`, or `kind` and `object`; `relation`; `to` (`sender?`, `user?`, `members`: true for every member of the room); `words?`; `expiresAt?`; `message` (`room`, `id`) | `grant`, `subject` (the holder's subject key), `user?` (the holder's user) |
| `DELETE /grants` | as `POST /grants`, without `words` and `expiresAt` | `grant`, `revoked` (how many went) |

- **The granter is the sender of the message a grant is made on,** and sumida checks that their user may grant
  what they give, so nobody gives what they do not hold.
- **A sender with no user yet is given one,** with no way to sign in, and linked.
- **Granting again** moves the expiry and the words.

### A room's callers

| Route | Request | Answer |
|---|---|---|
| `GET /rooms/{chat}/callers` | `Owner-Key` | `room`, `callers` (each `user` and `name`, the users granted `ask` on the room directly, in the order they were granted) and `mayChange`, whether the signed-in user is the administrator, leads the room or heads its leader's unit |
| `PUT /rooms/{chat}/callers/{user}` | `Owner-Key` | 204: the user is granted `ask` on the room |
| `DELETE /rooms/{chat}/callers/{user}` | `Owner-Key` | 204: the grant is taken away |

- **A room's callers are the users who may call their own supervisor into it by name,** the grant of `ask` on
  the room to the user (docs/accounts.md, 「A room's callers」).
- **The signed-in user changes them where they are the administrator, lead the room, head the room's unit or head
  the user's unit:** a room's leader is a user who owns a supervisor the room names, as the receiver answers
  (「Calls the server makes」); the room belongs to its leader's unit; and a head is one whose unit stands at or
  above the unit named. Anyone else is refused 403, and a user of
  another company than the signed-in user's is refused 403 but for the administrator.

### Phone keys

| Route | Request | Answer |
|---|---|---|
| `POST /phones` | `user` | `key`, once, and `hash`, the hash the key is kept by |
| `POST /phones/adopt` | `token`, `user` | `hash`: the earlier token kept as a key of that user |
| `POST /phones/who` | `key` | `user`, `name`, `hash`; 401 where it is no live key of a user who may sign in |
| `DELETE /phones/{hash}` | | 204 |

### A room's holdings

| Route | Answer |
|---|---|
| `GET /rooms/{chat}/holdings` | `holdings`: each holding the room has at least one of, as `code` and `count` — `room_grants`, the grants made on the room or to its members, and `room_senders`, the senders whose user holds a grant on the room; none for a room holding nothing of the server's |
### The rooms a console has open

| Route | Request | Answer |
|---|---|---|
| `GET /watching` | | `rooms`, the rooms a visible console tab shows now, and `at`, when the console last reported; empty rooms where the report is older than two minutes |
| `PUT /watching` | `rooms`, the rooms a visible console tab shows now | the same `rooms` and `at` |

The console server reports the set as its tabs open, close, hide or show a room, and the receiver reads it as its
restart hands each open room's unread lines to the chat agent, one room at a time. The report is kept in memory and
falls away after two minutes without one.



- **The server declares itself a holder** to the receiver as it starts (「Calls the server makes」), with the
  holdings `room_grants` (`effect` `warns`) and `room_senders` (`effect` `kept`), so the receiver shows what a
  room's removal would take before it removes the room.

### The secret store

| Route | Request | Answer |
|---|---|---|
| `GET /users/{user}/secrets` | | `secrets`: each `name`, `bytes` and `changedAt`, every secret the person's space holds, in the order of their names |
| `PUT /users/{user}/secrets/{name}` | `value`, `replace?`, `encoding?` | `name`, `bytes`, `changedAt`; 201 where the name was new, 200 where it replaced a value; 409 `secret-exists` where the name stands and `replace` is not true |
| `DELETE /users/{user}/secrets/{name}` | | 204; 404 where no secret stands under the name |

- **Every route of the store is the space's own person's:** it takes the login's user in `Owner-Key`, the user the
  console hands on for the login it acts for (「Calls the console makes」), and refuses 403 `forbidden` a call whose
  key is not the path's `{user}`, or that names none, whatever its `Owner-Role`.
- **The store is the folder the server's `secrets.dir` setting names,** the data root's `env/`, where every unit
  reads a secret by its file name (`docs/accounts.md`, 「The secret store」). A server whose setting names no folder
  answers 503 `no-secret-store`.
- **A person's space** is `env/` itself for the platform administrator, as the service's `settings` names them at
  the call, and `env/users/<user>/` for any other user, `<user>` the path's decimal id; a user the service holds
  none of is refused 404. A secret's address is its name in the administrator's space and `users/<user>/<name>` in
  anyone else's, relative to `env/`.
- **A name is a plain file name:** one or more of `A`–`Z`, `a`–`z`, `0`–`9`, `.`, `_` and `-`, at most 200 bytes,
  beginning with no dot and not ending in `.previous`; any other is refused 400 `bad-name`. A name that stands in the
  folder as anything but a regular file, a folder or a link among them, is refused 409 `not-a-file`, and so is one
  whose `.previous` stands so.
- **A value is never answered.** No route reads a value back: the list carries names, sizes and times, and a write
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
  file and anything not a regular file are not, so another person's space never stands in the administrator's
  list. A space whose folder does not stand yet lists none.
- **The store's routes answer 503 `not-in-force`** while the account model is not in force, as every route of the
  server's own does.

### Secret kinds

| Route | Request | Answer |
|---|---|---|
| `GET /secret-kinds` | | `kinds`: every kind, in the order they were added |
| `POST /secret-kinds` | a kind | the kind as kept, 201; 409 `kind-exists` where a kind stands under its `key` |
| `PUT /secret-kinds/{key}` | a kind, its `key` the path's | the kind as kept; 404 where no kind stands under the key |
| `DELETE /secret-kinds/{key}` | | 204; 404 where no kind stands under the key |

- **A kind is a shape the console's secret form asks a value in,** and never a value (`docs/accounts.md`,
  「Secret kinds」): `key`, `name`, `description` and `fields`, each field its `key`, `label`, `masked`, `input` and
  `required`.
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

### Fixed lines

| Route | Request | Answer |
|---|---|---|
| `POST /words/render` | `code`, the fields the code carries beside it, `language` | `text` |

- **A fixed line** is one of the few lines no agent's session says: a code a unit answers with, rendered in
  the room's language from the server's pack. The codes it renders are the receiver's `FixedLine` codes
  (the receiver's `docs/codes.md`, 「Fixed lines」), each to the sentence it renders as:

  | Code | Fields read | The sentence |
  |---|---|---|
  | `rest-begins` | none (`until` is carried and not read) | `fixed-lines.rest_begins`, said as the chat agent |
  | `provider-down` | none | `chat-health.rest.outage`, said as the chat agent |
  | `compacting` | none | `chat-health.fold.going` |
  | `compact-failed` | none | `chat-health.fold.failed` |
  | `run-broken` | `agent`, `cause`, `record` | `chat-health.account.line` opened by `account.broke`, its cause `causes.unknown` where none was read and its record line where one is kept; then `last_resort.speaking` with the agent and its subject particle |
  | `chat-denied` | none | `fixed-lines.chat_denied` |
  | `going-down-for-update` | `items` | `roads.service.mark`, then `service.stopping.deploying` with the items as `#n` where any |
  | `going-down` | none | `roads.service.mark`, then `service.stopping.restarting` |
  | `supervisor-engine-error` | `kind` | `supervisors.engine_error` of the kind |
  | `supervisor-cut` | `agent`, `reason` | `fixed-lines.supervisor_cut` |
  | `still-working` | none | `fixed-lines.still_working`, said as the chat agent once in a round whose draft turn ran past its bound |
  | `memory-tidying` | none | `fixed-lines.memory_tidying`, said as the chat agent once to a room whose words arrive while the agent's session is replaced and its memory tidied |
  | `draw` | `label`, `asked`, `result`, `number`, `seed`, `method`, `answered`, `next` | `draws.line`, what was asked by `draws.spec` and what came out by `draws.dice_total` where dice are summed |

- **The chat agent's name** in a line is the server's `names.chat_agent` setting; no name stands in the pack.
- **`language` names the pack's language,** `ko`; another language is refused 404 `unknown-language`. A code
  the pack does not hold is refused 404 `unknown-code`, and a line whose fields do not read as its code's
  shape 400 `bad-request`. The caller then sends the line as its code and fields, so a room is never silent.
- **The receiver must send `language` = `ko`.** The language it sends is its own setting, and its example
  settings name `en`; a receiver deployed so has every fixed line refused 404 `unknown-language` and posts each
  unrendered, as its code and fields. Its deployment sets `ko`, the one language the pack holds.
- **The route answers whether or not the account model is in force,** since it reads no account.

### The document wording file

The server's release carries the document wording file bmo-artifact's `[wording] file` setting names: every
key of the artifact's 「Wording」 table, rendered from the server's pack, and no other key (`docs/language-pack.md`,
「What other units read」). The server's binary writes it, `bmo-web-server wording <file>`, from the pack alone
and with no settings, and the release ships the file it writes: each deployment writes it before the flip as
`documents.ko.yaml` at the top of the release, so it stands at `~/.local/share/bmo-web/deploy/documents.ko.yaml`
through the deploy tree, the path bmo-artifact's deployment sets as its `[wording] file`. bmo-artifact reads the
file as it starts, so a release that changes the pack reaches it at bmo-artifact's next start.

### sumida's own routes

The server mounts sumida's router as sumida builds it, under `/sumida`, apart from the routes above, since
sumida's own (its `/users` among them) would take paths other units name. The console's server is their one
caller, and hands on in `X-Real-IP` the browser's address as the console's reverse proxy named it, which sumida's
bans read (`docs/accounts.md`, 「sumida's own routes」).

| Route | What it is |
|---|---|
| `POST /sumida/auth/session` | sign-in, with the name and the password; answers the session cookie, `bmo.sid`, or 401 |
| `DELETE /sumida/auth/session` | sign-out, with the cookie |
| `GET /sumida/me` | who a session is, with the cookie; 401 where it is no live session |

## Calls the server makes

Each goes to the unit's base address with that unit's token as a bearer, as the unit's document states.

| Unit | Call | Route | Why |
|---|---|---|---|
| the receiver | declare a holder | `PUT /room-holders/{unit}` (`address`, `holdings`) | once as the server starts, so a room's removal asks the server's holdings |
| the receiver | read a message | `GET /rooms/{chat}/messages/{message}` | a message check's sender |
| the receiver | read a room's leaders | `GET /rooms/{chat}/leaders` | whether the signed-in user leads a room whose callers they change |

- **A call that does not reach the receiver** is a failure of the call: the start goes on and declares again
  on its next start; a message check and a change of a room's callers answer 502 `upstream-failed`.

## Calls the console makes

The console's own server makes every call; no browser reaches another unit. Each sibling's document is the
contract, and the console holds its conventions — its casing, its auth and its refusal body — as that document
states them. The three units the console calls directly publish a TypeScript client: `@agency/client`,
`bmo-job-client` and `@bmo/receiver-client`, each a vendored tarball under `client/vendor/`
and each generated from that unit's OpenAPI document. The console's server calls them through those packages and
their `./schema` types, and reads a response into the screen's own shape where the screen needs more than the
unit carries. A browser call to one of them reaches its fixed path through the relay (below). Every call the
console makes on the agency carries, beside the console's token, the signed-in login's user in `Owner-Key` and
role in `Owner-Role`, so the agency refuses what that person may not do; a call made for nobody signed in
carries neither.

| Unit | What the console reaches it for | Routes |
|---|---|---|
| the server (this repository) | sign-in, the session, users, the people directory and its members list, phone keys, grants, checks, the model; the users list and each user's console sections; a user's profile and sections, each call with the signed-in login's user in `Owner-Key` and role in `Owner-Role`; the signed-in login's own secret space, each call with the login's user in `Owner-Key`; the secret kinds, each call with the login's role in `Owner-Role` | every route above |
| the agency (`docs/api.md`) | the supervisors, each with its one road — its provider, model, effort, thinking and answer ceiling — its warming per provider, its compaction threshold, its repository, gates and sampling, read and changed, the rooms each has spoken in with its latest run there, and whether its road can take a turn now; the roles, each with its bundles, line, its agents, each on a road of its own or following the supervisor that asks it, the text each provider's runs carry beside its prompt, cap, sessions setting and compaction threshold, read, added, changed and removed, and each role's session history; the repositories, each with its path, node, checkouts (each with its path and the job holding it), checkouts on the work nodes, prefix documents, preamble, rules, dev command, pinned model, the sampling it sends a pinned registration with the settings that sampling may hold, and downgrade heal, read, added, changed and removed; the nodes the node service keeps, each with whether it takes jobs; the models a provider holds, each with its declared thinking and answer ceiling, for a road's chooser; every role's slots, read for the sidebar and the slot tiles; the tasks a supervisor delegated to its double, read for the owner's own chat's marker; the providers, each with its switch, quota and declared compaction threshold, and a provider's switch thrown; the registered models and the model files; the chat agent's composed documents; a supervisor's own settings — its generation settings, its reference switch and its persona — read and changed; the sessions each supervisor holds; the research supervisor its own settings hold, read and changed; the log lines of a run, and one supervisor's or role's log across its runs — its newest page, the page before or after an id, the page at a moment; a word said to a worker, with the files it carries; the Claude accounts with each one's usage window, and what was spent over the week; the jobs and their prompts, by item, repository or running, each running job with the road it took, what chose it and the agent it runs on, and the jobs running now; its turns going out and ending, its runs and sessions made, changed and stopped, and its jobs starting, changing and ending, relayed to each tab; GitHub's webhook deliveries, handed on; an account made ready by its invitation given its agents and its machine as the node its runs stand on, and that node set again or taken away as the administrator binds the account to another machine or to none | `GET /supervisors`, `GET`/`PATCH /supervisors/{supervisorName}`, `GET /supervisors/{supervisorName}/rooms`, `GET /supervisors/{supervisorName}/road`, `GET`/`POST /roles`, `GET`/`PATCH`/`DELETE /roles/{roleName}`, `GET /roles/{roleName}/sessions`, `GET`/`POST /repositories`, `GET`/`PATCH`/`DELETE /repositories/{repositoryName}` (`nodeCheckouts` and `sampling` among a change's fields), `POST /repositories/{repositoryName}/words`, `GET /nodes`, `GET /provider-models/{providerName}`, `GET /slots`, `GET /delegations` (with `ended=1`, for the latest ended one), `GET /providers`, `PATCH /providers/{providerName}`, `GET`/`POST /models`, `GET`/`PATCH`/`DELETE /models/{modelKey}`, `GET`/`POST /model-catalogue`, `GET /chat-documents`, `PATCH /chat-documents/{documentName}`, `POST /github/deliveries` (GitHub's webhook deliveries, handed on unchanged with their GitHub headers and no sign-in, `docs/web.md`, 「Access」), `GET`/`PATCH /fallback`, `GET /accounts`, `GET /usage` (over the last seven days), `GET /prompt-documents`, `PATCH /prompt-documents/{documentName}`, `GET`/`PATCH /supervisors/{supervisorName}/settings`, `GET`/`PATCH /settings` (`researchSupervisor`), `GET /sessions`, `GET /jobs`, `GET /jobs/{jobId}/prompt`, `PATCH /jobs/{jobId}`, `GET /runs`, `GET /log-lines`, `GET /log/agents/{agentName}/lines` (a supervisor's or a role's name), `POST /role-agents`, `PUT`/`DELETE /person-nodes/{ownerAccount}` (the account's user id and, to set it, its machine's name, `docs/accounts.md`, 「Invitations and a person's machine」), `GET /events?kinds=turn.created,turn.ended,job.created,job.changed,job.ended,run.created,run.changed,run.stopped,session.created,session.changed,supervisor.changed,role.changed,repository.changed,repository.deleted,slot-request.changed` |
| bmo-job (`docs/api.md`) | the TODO panel: every item, each item opened with its approvals' callers and kinds, the verbs on an item — an approval given under the caller the console's token names, the agent or the model and the role its labels name, its notes, reports and review, its work order and tasks; answering a question and stopping its clock; the queues' pause and holds, and the deployment's hold let go | `GET`/`POST /items`, `GET`/`PATCH /items/{itemId}`, `GET`/`POST /items/{itemId}/notes`, `DELETE /items/{itemId}/notes/{noteId}`, `GET /items/{itemId}/reports`, `GET /items/{itemId}/reviews`, `GET`/`PUT`/`PATCH /items/{itemId}/work-order`, `GET`/`PATCH /items/{itemId}/work-order/tasks/{taskId}`, `GET /questions`, `GET`/`PATCH /questions/{questionId}`, `POST /questions/{questionId}/replies`, `GET`/`PATCH /queues`, `GET /events?after=&run=` (relayed to each tab from that tab's cursor; opened with no cursor where the tab holds none, and again where bmo-job answers that the cursor stands before the events it still keeps, so the relay goes on from the events still to come) |
| the receiver (`docs/api.md`) | the room list, a room's title and its line, page by page, past a message, one message and where a day begins; a message's files, their bytes, its picture and the metadata it arrived with, for a message that carries files; a room's pictures, its figures and the chat agent's window there; the profile pictures it keeps for rooms and people, every chat service's and the ones set in the console, listed page by page, and one such picture, the console asking no chat service for a picture (`docs/web.md`, 「Profile photos」); the numbers an agent's words stand under, to know whether a message is an agent's and which face a chat agent wears; the agent whose words a send of its own carries and the voice it went out in, and whether a number is the owner's own account, for a send that names no agent; the default answerer setting, the supervisor that answers every room naming none, read and set; the supervisors added with a console room of their own and removed, and the rooms each answers; a message reacted to, pinned, edited or deleted, and a sticker sent, as the signed-in person's own, under the sender the room knows them by, and a room's pinned messages; a message the owner forwards into another room, kept there as his and marked with where it came from; the senders each room has, for which rooms a user reads; a room's members as the chat service carrying it read them, each by the person number the room's lines carry where one was given, with their name and status line; the owner's private chat; the owner's words, files and voice notes; the event stream and the live board; removing a room; the rooms' pinned order, a room pinned and let go; the chat providers a room may be on, and the ones it is on, read and set whole; which of a room's chat services reads a room's past back, by the verbs each declares; a room added from a chat service's account, its rooms and its contacts listed page by page, or a conversation it starts with them, the contacts and a start in the signed-in person's own account, and a group's own supervisor named on it as it stands; what opened a turn; a turn of the talk about a document; a supervisor's draft process and its questions, its row set and taken away, a question's text set and taken away for it, and what each round's draft process wrote | `GET /rooms`, `GET /rooms/{roomId}/title`, `GET /rooms/{roomId}/answerers`, `GET`/`PUT /default-answerer`, `POST /supervisors` (with the signed-in login's user id as `ownerAccount`, and `sessionScope` `agent` where it is a person's), `DELETE /supervisors/{supervisorName}`, `GET /supervisors/{supervisorName}/rooms`, `GET /rooms/{roomId}/own-number`, `GET /rooms/{roomId}/messages`, `GET /rooms/{roomId}/day-start`, `GET /rooms/{roomId}/messages/{messageId}`, `GET /rooms/{roomId}/messages/{messageId}/files`, `GET /rooms/{roomId}/messages/{messageId}/files/{place}` (with `download=true` for a file to keep, and the `Range` the browser asked with), `GET /rooms/{roomId}/messages/{messageId}/picture`, `GET /rooms/{roomId}/messages/{messageId}/metadata`, `GET /rooms/{roomId}/messages/{messageId}/sender-is-owner`, `GET /rooms/{roomId}/pins`, `POST /rooms/{roomId}/messages/{messageId}/forwards`, `PUT`/`DELETE /rooms/{roomId}/messages/{messageId}/reactions/mine`, `PUT /rooms/{roomId}/messages/{messageId}/pin`, `PATCH`/`DELETE /rooms/{roomId}/messages/{messageId}`, `GET /stickers`, `POST /rooms/{roomId}/stickers`, `GET /rooms/{roomId}/pictures`, `GET /avatars`, `GET /rooms/{roomId}/avatar`, `GET /people/{personId}/avatar`, `GET /rooms/{roomId}/figures?zone=` (the zone the console shows every time in), `GET /rooms/{roomId}/members` (outside the published client, 「Gaps the console meets」), `GET /rooms/{roomId}/window`, `GET /rooms/{roomId}/situation`, `GET /owner`, `POST /owner/messages`, `POST /owner/message-files` (with `voice` for a recording), `GET /events`, `GET /live`, `DELETE /rooms/{roomId}` (with `dryRun` for the preview), `POST`/`DELETE /pinned-rooms`, `GET /providers`, `GET /providers/{key}/rooms`, `GET /providers/{key}/contacts` (with the signed-in login's user id as `accountId`, where it has one), `POST /rooms` (the same `accountId` on a start from the contacts), `PUT /rooms/{roomId}/supervisors` (a group's own supervisor), `GET`/`PUT /rooms/{roomId}/providers`, `GET /rounds/openings`, `GET /rounds/openings/{instructionId}`, `POST /talks` (with a `document` topic, the earlier turns and the words just said), `GET /draft-processes` (with `agentName` for the row a supervisor reads), `PUT`/`DELETE /draft-processes/{provider}/{tier}/{agentName}` (a supervisor's row, its provider and tier `*`), `GET /draft-questions` (with `agentName` for a supervisor's catalogue), `PUT`/`DELETE /draft-questions/{agentName}/{name}`, `GET /rounds/drafts`, `GET /health` |
| the gate (`docs/api.md`) | the gate order, read with the agent list so the home screen stands its gates in the order the unit serves; the verdicts a room's messages were judged by, newest first, for the stretch of time a page of the room covers, each with what its round's gates held, were asked about and kept by each rule and, for a picker's or the matcher's verdict, every line its model read with its answer; the document viewer's translation: the parts of a document's version handed to the translator, where it stands on them, the parts it has kept with each failed part's sentence, and the word that a document's translation moved; a worker's or a job's text read in the reader's language, for the console's own screens | `GET /gates` (the gate order, read with the agent list), `GET /judgements?roomId=&from=&to=&before=&limit=`, `POST /translations` (with the reader's role in `Owner-Role`), `POST /documents/translations`, `GET /documents/translations/state?document=&target=`, `GET /documents/translations/parts?document=&version=&target=`, `GET /events` (its `document-translation.changed`) |
| the voice engine (`docs/boundary-api.md`) | a line's voice briefings — its summary and its full reading, with their state, title, length and the voice message an old one went out as — one briefing waited on, its sound, and the stream that says one was taken in, ended or named its line, or that a room's briefings or every room's were stopped, relayed to each tab | `GET /briefings?chatId=&messageId=&limit=`, `GET /briefings/{briefingId}`, `GET /briefings/{briefingId}/sound` (with the `Range` the browser asked with), `GET /events?kinds=briefing.created,briefing.ended,briefing.changed,briefings.stopped` |
| every unit the settings name (`bmo-ui`'s `docs/console-bundles.md`) | whether it brings a console bundle, and the bundle's words | `GET /console-manifest`, with the unit's token and no owner key or role, at start and once a minute; the words at the path the manifest names |
| the units whose manifest reads (`bmo-ui`'s `docs/console-bundles.md`; each unit's `docs/api.md`) | each bundle's own screen: its module, its stylesheet, its sidebar unread count where its manifest names one, its calls to the service its manifest names and its calls to the other services it names under `calls` | what the contract has a console relay of the service, under `/api/<service>/`, handed on as it came to the unit that answered the manifest with that unit's token, with the owner key and the role the contract's 「Roles and the owner key」 has the console set, in place of any the browser sent: the owner key is the signed-in login's user on the account service, its id written as a decimal number, and the role is `administrator` for the platform administrator and `member` for anyone else. Its status and bytes go back as the service gave them, and of its headers the ones a browser reads, as the service gave them: `content-type`, `content-length`, `content-disposition`, `cache-control`, `x-content-type-options`, `etag`, `last-modified`, `accept-ranges`, `content-range` and `retry-after`, and the lines a service sets ahead of a page it hosts and of a read another origin makes, `content-security-policy`, `referrer-policy` and `access-control-allow-origin`, so a page the service hosts reaches the browser under its own policy and a sandboxed page's own fetch of the service's bytes is let through; no other header of the answer is handed on, and an answer whose service set no `content-security-policy` carries `frame-ancestors 'self'`, so the console's screens alone frame it (`docs/web.md`, 「Access」). A path one of whose segments reads, once its escapes are undone, as `.` or `..` is refused 400 and reaches no unit, and a socket at one is closed as no relay. A socket is taken under `/api/<service>/` behind the console's sign-in, which asks the account service whether the seal's session still stands as it opens (`docs/web.md`, 「Access」), and each frame is handed on as it came and the close code and reason back either way. The event stream the console reads itself for a bundle's notices carries the platform administrator's key and `Owner-Role: administrator`. A bundle's screen, its words, its event stream, its sockets and its notice kinds come from its manifest, and no code here names a unit or a bundle. The relay also hands on a unit the console calls directly — the agency, bmo-job and the receiver — at the address its setting names, so a browser call to `<unit>`'s own fixed path stands under `/api/<unit>/`. |
| the node service (`docs/api.md`) | the monitor screen's machine tab: the node list, a node taken off it — a hub node's agent sent a leave first where asked —, every machine's latest recorded reading in one answer and one machine's own latest reading, its live tracking and CPU limit set, and its recorded readings, live and over a span | `GET /nodes` (page after page), `DELETE /nodes/{nodeName}` (`leave=true` where asked; its `conflict`, a leave the hub did not take, said in the pack's words), `GET /machines` (every machine at once, the recorder's own and reading none), `GET /machines/{machineName}`, `PATCH /machines/{machineName}` (`tracking`, `cpuLimit`), `GET /machines/{machineName}/readings?after=&spanMs=&limit=` |
| the card master (bmo-arbiter's `docs/api.md`, 「What the master serves」) | the monitor screen's services tab: the whole picture of every node's cards, and the picture again whenever it changes | `GET /cluster`, `GET /events?kinds=cluster.changed` |
| the cache siren (`docs/api.md`) | the cache siren screen: the sums it keeps by session, its siren count, its settings, and the newest events it holds | `GET /stats`, `GET /settings`, `GET /events?limit=` (read as a page, with `Accept: application/json`) |
| the cache warmer (`docs/api.md`) | the keepalive view: the round, each agent's switch, pause and last warming, an agent being the subject of its name under every consumer that registers a target for it — on where one of those targets warms now — and under the consumer `KEEPALIVE_CONSUMER` names where none does | `GET /round`, `PATCH /round`, `GET /targets`, `GET /targets?subjectName=`, `GET /consumers/{consumer}/subjects`, `PATCH /consumers/{consumer}/subjects/{subject}` |
| bmo-research (`docs/api.md`) | the agent screen's searcher tab: the settings every research run is held to and the search engines' state, each setting changed on its own, a change naming only the setting it changes and a key sent without its page budgets keeping them; the research screen: whether the loop runs, each category with its state, its part of the queue and the holds that name it, a category or every one stopped and started again, the queue narrowed by category and state, page by page, with where each item came from, a thing asked for with the owner's words for why and, for a follow-up, the item or the document it follows from, an item dismissed, a stuck item asked again or moved to the front, an item's research run with its log, and the sources, page by page, a source registered, changed and taken away | `GET`/`PUT /research-settings`, `GET`/`PATCH /state`, `GET /categories?limit=`, `GET /queue?categoryName=&state=&after=&limit=`, `POST /queue`, `PATCH /queue/{itemId}` (`state` `dismissed`, `state` `waiting` or `front` true, one alone), `GET /research-runs/{runId}`, `GET /research-runs/{runId}/log-lines`, `GET /sources?after=&limit=`, `POST /sources`, `PATCH`/`DELETE /sources/{sourceId}`, each called by its documented path with the console's HTTP helper, since the unit publishes no TypeScript client |
| the testbed (`docs/deploy.md`) | the deployment in the title bar | the progress record, `deploy-progress.json`, read under each deploy root `DEPLOY_ROOTS` lists, in the shape the testbed writes it; the record a finished deployment leaves, `deployed.json`, and its one line a deploy, `deployed.log`, under that root; the commits between two deploys, read from the git log of the build tree the root keeps in `deploy-expand`; the testbed writes them and a reader needs only the files and the run's process; the last lines of the deploy unit the record names, read from the machine's user journal with `journalctl` |
| the testbed (`docs/boundary.md`) | the testbed line on a running TODO row: which job's checkout holds a seat of a lane or waits in its line, the command and its place (`docs/web.md`, the TODO panel's section) | `bmo-testbed status --json`, run through the program `TESTBED_BIN` names: of its `queues`, each lane's `name`, `holders` and `waiting`, each entry's `checkout`, `command` and `pid`; it is read every two seconds and a reading that fails stands as an empty queue |
| the user manager and journal of the console's machine (systemd) | the monitor's 로그 tab: the lines the units named by `LOG_UNIT_PREFIX` wrote and the lines the manager wrote about them, each with its slice, which is the unit's category (docs/web.md, 「Monitor's logs tab」); the category slices the units' repositories install; the slice a unit that wrote no line stands in | `journalctl --user -o json`, newest first or after a cursor, matched by slice, by unit or by the manager's own unit, and bounded by priority; `systemctl --user list-unit-files --type=slice -o json`; `systemctl --user list-units --all -o json`; `systemctl --user show -p Slice` |

- **A chat service is reached through the receiver alone.** What the chat services have in common — a room's and a
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

## Settings

The server reads `settings.toml` in the directory it starts in, overridden by `settings.local.toml` beside it
and then by the environment, where a variable named `BMO_WEB_SERVER_`, the table, two underscores and the key
sets that key (`BMO_WEB_SERVER_DATABASE__URL`); the console reads its runtime configuration from the
environment. No address, token or name is written into the code.

- **What a deployment must set:** the server's `server.token` and `names.chat_agent`, without either of which
  `serve` does not stand. `bmo-web-server settings` reads the settings and refuses, saying which is missing, where
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
| server | `names.chat_agent` | the name the chat agent goes by in a room, which a fixed line says it as; the server does not stand without one, and a deployment must set it |
| server | `jake.hub_url`, `jake.install_base`, `jake.agent_key`, `jake.control`, `jake.control_token` | the jake hub an invited machine attaches to, the folder its install scripts are served under, the key its credentials are made with, and the hub's loopback control address and token the service asks which machines are attached; with none, no invitation is made and every machine reads as gone |
| server | `secrets.dir` | the folder the secret store writes, the data root's `env/`, the platform administrator's space and the folder every other person's stands under; a leading `~/` stands for the home of the user the server runs as, and `settings.toml` names the data root's `env/` under it |
| console | `PORT` | the port the console listens on |
| console | `BMO_WEB_BASE_URL` | the base path every road of the console stands under, fixed as the console is built |
| console | `WEB_SERVER_ADDRESS`, `WEB_SERVER_TOKEN` | the server |
| console | `WEB_DATABASE_URL` | the server's PostgreSQL database, where the console's own tables stand |
| console | `NUXT_PUBLIC_CHAT_AGENT_NAME`, `NUXT_PUBLIC_CHAT_AGENT_LABEL` | the name the chat agent's messages stand under, and the label a room calls it by |
| console | `NUXT_PUBLIC_CONSOLE_ADDRESS` | the console's public address, its scheme, public name and base path, which a link to one of its screens is written under; the console reads a link under it as its own (`docs/web.md`, 「비밀 보관함」), and a unit that writes such a link, the chat agent asking for a secret among them, is given the same address in its own settings |
| console | `AGENCY_ADDRESS`, `AGENCY_TOKEN` | the agency |
| console | `JOB_ADDRESS`, `JOB_TOKEN` | bmo-job |
| console | `RECEIVER_ADDRESS`, `RECEIVER_TOKEN` | the receiver |
| console | `GATE_ADDRESS`, `GATE_TOKEN` | the gate, for the verdicts a room's messages were judged by |
| console | `VOICE_ADDRESS`, `VOICE_TOKEN` | the voice engine, for a line's briefings, their sound and the stream that says one ended; a console that names none stands every chip as never made and plays nothing |
| console | `BRAIN_ADDRESS`, `BRAIN_TOKEN` | the brain, which the console asks for its manifest and relays as any unit that brings a screen; the token is the console's own credential the brain's settings name for it (`[console] token`), not the brain's service token |
| console | `ARTIFACT_ADDRESS`, `ARTIFACT_TOKEN` | bmo-artifact, which the console asks for its manifest and relays as any unit that brings a screen; the token is the console's own credential the artifact's settings name for it (`[console] token`), not the artifact's service token, so the artifact holds every relayed call to its screens' role |
| console | `MAIL_ADDRESS`, `MAIL_TOKEN` | bmo-mail |
| console | `REVIEW_ADDRESS`, `REVIEW_TOKEN` | bmo-review |
| console | `DRIVE_ADDRESS`, `DRIVE_TOKEN` | bmo-drive |
| console | `REMOTE_ADDRESS`, `REMOTE_TOKEN` | bmo-remote |
| console | `CACHE_SIREN_ADDRESS`, `CACHE_SIREN_TOKEN` | the cache siren |
| console | `NODE_ADDRESS`, `NODE_TOKEN` | the node service |
| console | `ARBITER_ADDRESS`, `ARBITER_TOKEN` | the card master; it takes a token only where its own settings name one |
| console | `CACHE_WARMER_ADDRESS`, `CACHE_WARMER_TOKEN` | the cache warmer, which takes its bearer on every route, health included |
| console | `RESEARCH_ADDRESS`, `RESEARCH_TOKEN` | bmo-research, for the research settings on the agent screen's searcher tab and the research screen; it takes its bearer on every route, health included |
| console | `NUXT_PUBLIC_BMO_UI_TRANSLATOR_SERVICE`, `NUXT_PUBLIC_BMO_UI_TRANSLATOR_PATH` | the translator a bundle's screen translates through (bmo-ui's `docs/console-bundles.md`, 「Translation」): the service's name as its manifest gives it, and its translating route on that service's API, under that manifest's API prefix or among its `relays`; a bundle that translates names the service under `calls`. With either unset, no bundle's screen translates |
| console | `NUXT_PUBLIC_BMO_UI_TRANSLATOR_BATCH`, `NUXT_PUBLIC_BMO_UI_TRANSLATOR_ASKS_AT_ONCE` | the most originals one ask of the translator carries, and how many asks a tab holds out at once; each a whole number of one or more, bmo-ui's defaults, 4 and 1, standing where it is unset |
| console | `KEEPALIVE_CONSUMER` | the consumer an agent's switch is thrown under at the cache warmer where no consumer registers a target for it; with none, an agent's own keepalive switch is not offered and the round's still is |
| console | `DEPLOY_ROOTS` | the deploy roots whose progress records the title bar reads, separated by `:`, each a unit's deploy root holding its `deploy-progress.json`, the `deployed.json` and `deployed.log` of its deploys and the build tree `deploy-expand`; with none, no run stands |
| console | `TESTBED_BIN` | the testbed's program, whose `status --json` the TODO rows' testbed line reads; `bmo-testbed` under `~/.local/bin` where it is not set |
| console | `LOG_UNIT_PREFIX` | the prefix of the names of the units whose lines the monitor's 로그 tab reads, and of the slices that name their categories; `bmo-` where it is not set |
| console | `DOCUMENT_ROOTS` | the document viewer's roots: a JSON list, each root's `key`, its `label` and the absolute top of its `checkout`, in the order the list stands them (`docs/documents-viewer.md`, 「The roots a deployment names」); a key one of the roots other units keep already holds names no root. With none, the viewer lists only those roots, unread, and opens no document |
| console | `WEB_DATA_DIR` | the console's own data folder, inside no checkout |
| console | `NUXT_SESSION_PASSWORD` | the key the console seals its session cookie with |

- **A unit whose address is not set** is a unit the console does not reach: its screens stand as they do for a
  unit not yet split (below), and no call is made.

## Gaps the console meets

What the console needs and no unit serves stands empty in the console until a unit's document states a route
for it, and no file or table of that unit is read meanwhile.

- **A room's members.** The receiver's published client carries no route for a room's members, so the console asks
  `GET /rooms/{roomId}/members` on the receiver's address as every unit call is made, and reads its answer field by
  field: `members`, each `person` (the person number the room's lines carry, or null where none was given), `name`
  and `statusMessage` (or null). A row with no name is left out, and a field it does not find stands as none. While
  the receiver serves no such route, its `no-route` refusal is said in the 대화상대 sheet as the pack's sentence that
  the receiver hands no members over (`docs/web.md`, the room screen's 대화상대).
- **A field a route answers that the published types leave untyped.** The agency's client types every route the
  console reads; where a field is typed as an open value — a supervisor's `sampling`, a repository's `sampling` — the
  console reads it as the agency's `docs/api.md` states it, a field it does not find standing as none. The client names
  no `roleName` filter on `GET /jobs`, which that document states, so the console asks it as written there; nor does
  it name a job's `reviewing` state, which the console reads as that document states it.
- **An engine's own sampling values.** The agency answers which sampling settings a repository may hold and their
  bounds, and says a setting left out is the engine's own default, whose value no route answers; so such a box stands
  empty with `(기본값)` as its placeholder (「The default among choices」 in `docs/web.md`).
- **The newest lines of one run.** The agency's `GET /log-lines` narrowed to a run answers from the run's start,
  oldest first, and pages forward by `after` alone, so no route answers a run's newest lines or the page before a
  line of it; the console server reads them out of the agent's log from `GET /log/agents/{agentName}/lines`, keeping
  the run's lines, as `docs/web.md` (「Where the log comes from」) states. The agent read is the one the run's first
  line names: a job's run stands in the ledger under the worker it was ordered for, while its lines stand under the
  seat that ran it, carrying the job's run by name and a `runId` of nought, and the worker's own name answers no
  line of it, only slowly.
- **A repository's own log.** The agency writes a run's log under the supervisor or the role it is for, never under
  a repository, so a repository's screen reads its jobs from `GET /jobs?repositoryName=` and the log of a job by its
  run, and holds no log of the repository across its jobs.
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
  the room's record, and serves none in a reader's language, so a room's chat providers dialog shows the label as
  the receiver gives it.
- **What a room's page does not carry.** The receiver's pages carry a message's words, its sender, its round and
  its files' names, and nothing else a bubble's chip line wears. The console reads those from the units that hold
  them: a page's verdicts from the gate's `GET /judgements`, read for the time the page covers, each with the offers
  record of its round, the gate's `draft`
  verdicts among them, which stand in the answer's 드래프트 when the round log holds no row of it; what the round behind
  a message cost and called from the agency's `GET /runs` and its log lines — the answer line's usage and every
  line naming a tool — read after the page, for the rounds the room asks about, each round's runs side by side;
  and how the round's answer was drafted from the receiver's `GET /rounds/drafts`, read once
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
- **A link's preview.** Reading a page for its title, description and picture is no unit's to serve the console, so
  a link in a message stands as a plain card naming where it goes.
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
  borrowed from another. `GET /usage` counts each agent's jobs and the tokens they spent, which the agency records as
  none yet: a worker whose jobs carry no tokens holds no figure rather than a nought, and no row divides into the four
  kinds, so every row it does carry reads as not split. No unit serves a tally by user or the context of a session a
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
| the receiver | its refusals, each by the table beside its calls — every route's, the owner's sends, the voice briefing, removing a room and the draft process's; a file a send did not take, by its kind; the fixed lines through `POST /words/render`. Its facts are an agent's to say, and no screen shows them | the receiver's `docs/codes.md` |
| bmo-job | its refusals, each by the table beside its calls; the answers a screen says, a queue told and an unanswered turn; the kinds a row is laid out by, the held words, the line and model marks, and the phases a job's time is divided into | bmo-job's `docs/api.md`, 「Codes」 and 「Routes」; its `docs/jobs.md`, 「Where a job's time went」 |
| bmo-ui | the 126 keys the layer reads | bmo-ui's `docs/boundary.md`, 「Wording keys」 |

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
| `/api/console-bundles/unread` | the console: the sidebar counts of the bundles the signed-in reader may open whose manifest names a `sidebarUnread`, each read by the console from the unit with its own credential and the reader's owner key and role, answered by screen path for each count that answered |
| `/api/people/members` | the console: the members of the signed-in reader's company, each `user` and `name`, read from the server's `GET /users/members` with the reader's owner key and role and handed to a bundle's page only where its manifest names `people` under `calls` (`docs/web.md`, 「Screens a unit brings」) |
| `/api/github/deliveries` | the console, with no sign-in, for `POST` alone and a body of at most 1 MB: handed on unchanged to the agency's `POST /github/deliveries` with GitHub's headers and the agency's token (`docs/web.md`, 「Access」) |

The server answers on its own listen address to the console and the other units on the machine, and no road of
the proxy reaches it.
