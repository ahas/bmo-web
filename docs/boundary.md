# The boundary

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
| `GET /users/{user}` | | `user`, `name`, `administrator` (boolean), `senders` |
| `GET /users/{user}/senders` | | `senders`: the sender numbers linked to the user; 404 where there is no such user |
| `POST /users/{user}/password` | `current`, `next` | 204; 401 `wrong-password` where `current` does not match |
| `POST /users/{user}/name` | `name` | 204; 409 `name-taken` where another user holds it |

- **A user** is named by its id as the server gives it, a string a caller hands on as it stands; a body naming
  a user may give it as that string or as the number it holds, and a path whose user is no id is refused 400.
- **A sender** is a whole number, as the receiver names a message's sender.

### Checks

| Route | Request | Answer |
|---|---|---|
| `POST /checks/room` | `room`, `sender?`, `relation` | `allowed`, `grant`, `user?` |
| `POST /checks/message` | `room`, `message`, `relation` | `allowed`, `grant`, `user?`, `sender?` |
| `POST /checks/object` | `kind`, `object`, `relation`, `user` | `allowed`, `grant` |

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

- **The server declares itself a holder** to the receiver as it starts (「Calls the server makes」), with the
  holdings `room_grants` (`effect` `warns`) and `room_senders` (`effect` `kept`), so the receiver shows what a
  room's removal would take before it removes the room.

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
  | `companion-engine-error` | `kind` | `companions.engine_error` of the kind |
  | `companion-cut` | `agent`, `reason` | `fixed-lines.companion_cut` |
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
caller, and hands on its own caller's address in `X-Real-IP`, which sumida's bans read.

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

- **A call that does not reach the receiver** is a failure of the call: the start goes on and declares again
  on its next start; a message check answers 502 `upstream-failed`.

## Calls the console makes

The console's own server makes every call; no browser reaches another unit. Each sibling's document is the
contract, and the console holds its conventions — its casing, its auth and its refusal body — as that document
states them. The three units the console calls directly publish a TypeScript client: `@agency/client`,
`bmo-job-client` and `@bmo/receiver-client`, each a vendored tarball under `client/vendor/`
and each generated from that unit's OpenAPI document. The console's server calls them through those packages and
their `./schema` types, and reads a response into the screen's own shape where the screen needs more than the
unit carries. A browser call to one of them reaches its fixed path through the relay (below).

| Unit | What the console reaches it for | Routes |
|---|---|---|
| the server (this repository) | sign-in, the session, users, phone keys, grants, checks, the model | every route above |
| the agency (`docs/api.md`) | the agents and workers with their gates, reasoning, roles and sampling, and an agent registered; base prompts; companions and a companion's reset; sessions and a session's end; the co-worker pool with each place's limit, read through the relay; the log lines of a run; the registered models, the model files, the tiers, the fold ratios and the roads, the searchers' work keys among them; the Claude accounts with each one's usage window, the slot the chat runs on with its own windows, and what each worker spent over the week with the context its sessions carry; a worker's node; the jobs a worker runs and their prompts; its turns going out and ending, relayed to each tab | `GET`/`POST /agents` (the roles an agent may hold read from the agents' answer), `GET /workers`, `PATCH /agents/{agentName}`, `GET`/`PATCH /workers/{workerName}`, `GET`/`POST /models`, `GET`/`PATCH`/`DELETE /models/{modelKey}`, `GET`/`POST /model-catalogue`, `GET /tiers`, `GET /providers`, `PATCH /tiers/{tierName}`, `GET /fold-ratios`, `PUT /fold-ratios/{provider}/{tier}`, `GET`/`PATCH /fallback`, `GET /accounts`, `GET /usage` (grouped by worker, over the last seven days), `GET /prompt-documents`, `PATCH /prompt-documents/{documentName}`, `GET /companions`, `PATCH /companions/{companionName}`, `POST /companion-resets`, `GET`/`DELETE /sessions`, `GET /pool`, `GET /jobs`, `GET /jobs/{jobId}/prompt`, `PATCH /jobs/{jobId}`, `GET /runs`, `GET /log-lines`, `GET /events?kinds=turn-started,turn-ended` |
| bmo-job (`docs/api.md`) | the TODO panel: every item, each item opened, the verbs on an item, its notes and reports, its work order and tasks; answering a question and stopping its clock; the queues' pause and holds, and the deployment's hold let go | `GET`/`POST /items`, `GET`/`PATCH /items/{itemId}`, `GET`/`POST /items/{itemId}/notes`, `DELETE /items/{itemId}/notes/{noteId}`, `GET /items/{itemId}/reports`, `GET`/`PUT`/`PATCH /items/{itemId}/work-order`, `GET`/`PATCH /items/{itemId}/work-order/tasks/{taskId}`, `GET /questions`, `GET`/`PATCH /questions/{questionId}`, `POST /questions/{questionId}/replies`, `GET`/`PATCH /queues`, `GET /events?after=&run=` (relayed to each tab from that tab's cursor) |
| the receiver (`docs/api.md`) | the room list, a room's title and its line, page by page, past a message, one message and where a day begins; a message's files, their bytes, its picture and the metadata it arrived with, for a message that carries files; a room's pictures, its figures and the chat agent's window there; the numbers an agent's words stand under, to know whether a message is an agent's; the senders each room has, for which rooms a user reads; the owner's private chat; the owner's words and files; the event stream and the live board; removing a room; the rooms' pinned order, a room pinned and let go; the chat providers a room may be on, and the ones it is on, read and set whole; a room added from a chat service's account, its rooms and its contacts listed page by page, or a conversation it starts with them; what opened a turn; companions with a room; a turn of the talk about a document; the draft process table, its questions, a row of it set and taken away, a question's text set, and what each round's draft process wrote | `GET /rooms`, `GET /rooms/{roomId}/title`, `GET /rooms/{roomId}/answerers`, `GET /rooms/{roomId}/own-number`, `GET /rooms/{roomId}/messages`, `GET /rooms/{roomId}/day-start`, `GET /rooms/{roomId}/messages/{messageId}`, `GET /rooms/{roomId}/messages/{messageId}/files`, `GET /rooms/{roomId}/messages/{messageId}/files/{place}` (with `download=true` for a file to keep, and the `Range` the browser asked with), `GET /rooms/{roomId}/messages/{messageId}/picture`, `GET /rooms/{roomId}/messages/{messageId}/metadata`, `GET /rooms/{roomId}/pictures`, `GET /rooms/{roomId}/figures?zone=` (the zone the console shows every time in), `GET /rooms/{roomId}/window`, `GET /owner`, `POST /owner/messages`, `POST /owner/message-files`, `GET /events`, `GET /live`, `DELETE /rooms/{roomId}` (with `dryRun` for the preview), `POST`/`DELETE /pinned-rooms`, `GET /providers`, `GET /providers/{key}/rooms`, `GET /providers/{key}/contacts`, `POST /rooms`, `GET`/`PUT /rooms/{roomId}/providers`, `GET /rounds/openings`, `GET /rounds/openings/{instructionId}`, `POST /companions`, `DELETE /companions/{companionName}`, `POST /talks` (with a `document` topic, the earlier turns and the words just said), `GET /draft-processes`, `PUT`/`DELETE /draft-processes/{provider}/{tier}/{agentName}` (`*` standing for any), `GET /draft-questions`, `PUT /draft-questions/{name}`, `GET /rounds/drafts`, `GET /health` |
| the gate (`docs/api.md`) | the verdicts a room's messages were judged by, newest first, for the stretch of time a page of the room covers; the document viewer's translation: the parts of a document's version handed to the translator, where it stands on them, the parts it has kept with each failed part's sentence, and the word that a document's translation moved | `GET /judgements?roomId=&from=&to=&before=&limit=`, `POST /documents/translations`, `GET /documents/translations/state?document=&target=`, `GET /documents/translations/parts?document=&version=&target=`, `GET /events` (its `document-translation.changed`) |
| every unit the settings name (`bmo-ui`'s `docs/console-bundles.md`) | whether it brings a console bundle, and the bundle's words | `GET /console-manifest`, with the unit's token and no owner key or role, at start and once a minute; the words at the path the manifest names |
| the units whose manifest reads (`bmo-ui`'s `docs/console-bundles.md`; each unit's `docs/api.md`) | each bundle's own screen: its module, its stylesheet, its calls to the service its manifest names and its calls to the other services it names under `calls` | every path under `/api/<service>/` that stands under the manifest's `apiPrefix`, every call whose method and path are a route the manifest names under `relays`, and the module's and the stylesheet's paths, handed on as they came to the unit that answered the manifest with that unit's token, behind the console's sign-in for a reader whose role the manifest's allows (and who has an owner key where the manifest asks for one), the module's and the stylesheet's reads also without one; its status, bytes and headers as the service gave them; each call and each socket also carries `Owner-Key`, the owner the service acts for: the signed-in login's user on the account service, its id written as a decimal number, and none where the login has no user (a share read, a console login before the account model is in force); and `Owner-Role`, the role that login acts in, `administrator` for the platform administrator and `member` for anyone else, on every call and socket a signed-in login makes. The console sets both in place of any the browser sent. The event stream the console reads itself for a bundle's notices carries the platform administrator's key and `Owner-Role: administrator`; a `GET` or `HEAD` of `shares/<token>` is relayed with no session, since the token is the whole of the permission, and so are the module and the stylesheet, with no owner key and no role. A bundle whose manifest asks for a socket opens it at the same path: the console takes the upgrade under `/api/<service>/` behind its sign-in, opens the service's own socket at that path with the token, and hands each frame on as it came and the close code and reason back either way; a socket on a service whose manifest asks for none is closed as no relay. A call from a bundle's page — the page address the browser sends as the call's referrer, standing under that bundle's screen path — to a service another manifest names is relayed only where the page's manifest names that service under `calls`, and then on that service's own terms above: its own API prefix and relayed routes, its own role and owner key; any other such call is refused 403, but for a `GET` or `HEAD` of that service's module, its stylesheet or a file beside its module, so a screen opened from another's page still loads. A bundle's screen, its words, its event stream, its sockets and its notice kinds come from its manifest, and no code here names a unit or a bundle. The relay also hands on a unit the console calls directly — the agency, bmo-job and the receiver — at the address its setting names, so a browser call to `<unit>`'s own fixed path stands under `/api/<unit>/`. The artifact bundle's share page reads the document its link names, which the relay does not open without a session: that is a gap in bmo-ui's contract, written in `docs/inventory.md`. |
| the node service (`docs/api.md`) | the monitor screen's 기기 tab: the node list, each machine with its latest reading, its live tracking and CPU limit set, and its recorded readings, live and over a span | `GET /nodes` (page after page), `GET /machines/{machineName}`, `PATCH /machines/{machineName}` (`tracking`, `cpuLimit`), `GET /machines/{machineName}/readings?after=&spanMs=&limit=` |
| the card master (bmo-arbiter's `docs/api.md`, 「What the master serves」) | the monitor screen's 서비스 tab: the whole picture of every node's cards, and the picture again whenever it changes | `GET /cluster`, `GET /events?kinds=cluster.changed` |
| the cache siren (`docs/api.md`) | the cache siren screen: the sums it keeps by session, its siren count, its settings, and the newest events it holds | `GET /stats`, `GET /settings`, `GET /events?limit=` (read as a page, with `Accept: application/json`) |
| the cache warmer (`docs/api.md`) | the keepalive view: the round, each agent's switch, pause and last warming, an agent being the subject of its name under every consumer that registers a target for it — on where one of those targets warms now — and under the consumer `KEEPALIVE_CONSUMER` names where none does | `GET /round`, `PATCH /round`, `GET /targets`, `GET /targets?subjectName=`, `GET /consumers/{consumer}/subjects`, `PATCH /consumers/{consumer}/subjects/{subject}` |
| the Telegram service (`docs/api.md`) | the pictures kept for rooms and people, listed page by page, and one such picture | `GET /avatars`, `GET /rooms/{roomId}/avatar`, `GET /people/{personId}/avatar` |
| the testbed (`docs/deploy.md`) | the deployment in the title bar | the progress record, `deploy-progress.json`, read under each deploy root `DEPLOY_ROOTS` lists, in the shape the testbed writes it; the testbed writes it and a reader needs only the file and the run's process; the last lines of the deploy unit the record names, read from the machine's user journal with `journalctl` |

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
  refused.
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
| console | `PORT` | the port the console listens on |
| console | `BMO_WEB_BASE_URL` | the base path every road of the console stands under, fixed as the console is built |
| console | `WEB_SERVER_ADDRESS`, `WEB_SERVER_TOKEN` | the server |
| console | `WEB_DATABASE_URL` | the server's PostgreSQL database, where the console's own tables stand |
| console | `NUXT_PUBLIC_CHAT_AGENT_NAME`, `NUXT_PUBLIC_CHAT_AGENT_LABEL` | the name the chat agent's messages stand under, and the label a room calls it by |
| console | `AGENCY_ADDRESS`, `AGENCY_TOKEN` | the agency |
| console | `JOB_ADDRESS`, `JOB_TOKEN` | bmo-job |
| console | `RECEIVER_ADDRESS`, `RECEIVER_TOKEN` | the receiver |
| console | `GATE_ADDRESS`, `GATE_TOKEN` | the gate, for the verdicts a room's messages were judged by |
| console | `BRAIN_ADDRESS`, `BRAIN_TOKEN` | the brain, which the console asks for its manifest and relays as any unit that brings a screen; the token is the console's own credential the brain's settings name for it (`[console] token`), not the brain's service token |
| console | `ARTIFACT_ADDRESS`, `ARTIFACT_TOKEN` | bmo-artifact |
| console | `MAIL_ADDRESS`, `MAIL_TOKEN` | bmo-mail |
| console | `REVIEW_ADDRESS`, `REVIEW_TOKEN` | bmo-review |
| console | `DRIVE_ADDRESS`, `DRIVE_TOKEN` | bmo-drive |
| console | `REMOTE_ADDRESS`, `REMOTE_TOKEN` | bmo-remote |
| console | `CACHE_SIREN_ADDRESS`, `CACHE_SIREN_TOKEN` | the cache siren |
| console | `NODE_ADDRESS`, `NODE_TOKEN` | the node service |
| console | `ARBITER_ADDRESS`, `ARBITER_TOKEN` | the card master; it takes a token only where its own settings name one |
| console | `CACHE_WARMER_ADDRESS`, `CACHE_WARMER_TOKEN` | the cache warmer, which takes its bearer on every route, health included |
| console | `NUXT_PUBLIC_BMO_UI_TRANSLATOR_SERVICE`, `NUXT_PUBLIC_BMO_UI_TRANSLATOR_PATH` | the translator a bundle's screen translates through (bmo-ui's `docs/console-bundles.md`, 「Translation」): the service's name as its manifest gives it, and its translating route on that service's API, under that manifest's API prefix or among its `relays`; a bundle that translates names the service under `calls`. With either unset, no bundle's screen translates |
| console | `NUXT_PUBLIC_BMO_UI_TRANSLATOR_BATCH`, `NUXT_PUBLIC_BMO_UI_TRANSLATOR_ASKS_AT_ONCE` | the most originals one ask of the translator carries, and how many asks a tab holds out at once; each a whole number of one or more, bmo-ui's defaults, 4 and 1, standing where it is unset |
| console | `NUXT_TRANSLATOR_BEGIN_MS` | how long the relay waits, in milliseconds, for the translator's route to begin its answer before it answers 504; 90000 where it is unset. Every other relayed call waits thirty seconds |
| console | `KEEPALIVE_CONSUMER` | the consumer an agent's switch is thrown under at the cache warmer where no consumer registers a target for it; with none, an agent's own keepalive switch is not offered and the round's still is |
| console | `TELEGRAM_ADDRESS`, `TELEGRAM_TOKEN` | the Telegram service |
| console | `DEPLOY_ROOTS` | the deploy roots whose progress records the title bar reads, separated by `:`, each a unit's deploy root holding its `deploy-progress.json`; with none, no run stands |
| console | `DOCUMENT_ROOTS` | the document viewer's roots: a JSON list, each root's `key`, its `label` and the absolute top of its `checkout`, in the order the list stands them (`docs/documents-viewer.md`, 「The roots a deployment names」); a key one of the roots other units keep already holds names no root. With none, the viewer lists only those roots, unread, and opens no document |
| console | `WEB_DATA_DIR` | the console's own data folder, inside no checkout |
| console | `NUXT_SESSION_PASSWORD` | the key the console seals its session cookie with |

- **A unit whose address is not set** is a unit the console does not reach: its screens stand as they do for a
  unit not yet split (below), and no call is made.

## Gaps the console meets

What the console needs and no unit serves stands empty in the console until a unit's document states a route
for it, and no file or table of that unit is read meanwhile.

- **A chat provider's name for a reader.** The receiver calls each provider by a label of its own, in English for
  the room's record, and serves none in a reader's language, so a room's chat providers dialog shows the label as
  the receiver gives it.
- **A share page whose module is guarded by role.** bmo-ui's contract has a service guard its module and its
  stylesheet by the role, and has no field for a share page, which is opened by someone not signed in. The
  console relays those reads with no session, no owner key and no role; a service that refuses them leaves its
  share page unopened to such a reader.
- **What a room's page does not carry.** The receiver's pages carry a message's words, its sender, its round and
  its files' names, and nothing else a bubble's chip line wears. The console reads those from the units that hold
  them: a page's verdicts from the gate's `GET /judgements`, read for the time the page covers, the gate's `draft`
  verdicts among them, which stand on the draft chip as its summary and on no verdict card; what the round behind
  a message cost and called from the agency's `GET /runs` and its log lines — the answer line's usage and every
  line naming a tool; and how the round's answer was drafted from the receiver's `GET /rounds/drafts`, read once
  for the page's rounds for the draft chip's count, and again for one round, its answers whole, when the chip is
  opened. The
  openings that ride on a verdict, a line's voice briefing and its reading are served by no unit yet, so they stand
  unread and no line carries the briefing chip. The metadata a message arrived with is read only for a message
  that carries files, since a custom emoji, a sticker and a video's shape each stand on one of its files.
- **What a room's agents ran and spent there.** The receiver's figures hand each agent's runs, last run and tokens
  as null, since the agency answers none of them by room, so the session sheet stands each as "—".
- **Whose turn a running turn is.** The receiver hands a turn's speaker, on the picture's turns and on the turn's
  events, as the number the answering agent's words stand under in the room and nothing more, for the chat agent
  in a room where it holds a number as much as for a companion, and names no speaker on the chat agent's `sent`
  and `draft` events. The console therefore reads a speaker carrying no name as the chat agent's, so the chat
  agent's turn is one row with its listening row and its sending and draft rows reach it; a companion's turn
  stands as the chat agent's until the receiver hands the companion's name with it, and a room both answer at
  once stands one row for the two.
- **A link's preview.** Reading a page for its title, description and picture is no unit's to serve the console, so
  a link in a message stands as a plain card naming where it goes.
- **An order within one second.** The receiver walks a room's line by when each message was sent and the order it
  took them in, and hands no such order with a message, so a read mark's place is when its message was sent and
  the marked message itself.
- **The rooms each sender has stood in.** The console reads them from the receiver's `POST /rooms/titles`,
  which the receiver's document states for another caller; the console reads it as that document states it.
- **An agent's log across its runs.** The agency reads its run log by the run (`GET /run-log`), so a log opened at
  one run reads and follows that run; the newest page of an agent's log, the pages before it and the page at a
  moment stand unavailable.
- **What is running beside the chat, and what has just run.** The receiver's live picture holds the chat's turns
  and the rooms folding; the runs of runners, job workers, gates and editors going now, the executions, gate runs,
  runner records and standing watches that have just run, the machine's standing and the nodes are lists no unit
  serves, so the live board stands without them and a stop names its target from what the board holds. The jobs
  that have just run are bmo-job's `GET /jobs/recent`; with no runs going to tell a job at work from one that has
  run, the board stands the finished ones alone.
- **Usage.** The agency's `GET /accounts` carries each Claude account's usage window, as the session and weekly
  share and reset its `PATCH /accounts/{accountId}` records, and answers none today; the slot the chat runs on, with
  its own session and weekly windows, and each account's name stand in its `GET /fallback` answer (below). So the
  account the chat runs on reads its figures and every other account reads as having no reading, never a figure
  borrowed from another. `GET /usage` counts each worker's jobs and the tokens they spent, which the agency records as
  none yet: a worker whose jobs carry no tokens holds no figure rather than a nought, and no row divides into the four
  kinds, so every row it does carry reads as not split. No unit serves a tally by user or the context of a session a
  room holds.
- **A turn's figures and what a running job has spent.** The roads a turn walked with what each spent are recorded
  by the agency and served by no route, so a turn stands without its figures; and what a running job's models have
  spent so far is the agency's to say while the turn goes and no route of its answers it, so a running job's line
  names no model until the job has ended (bmo-job's `docs/reading.md`, "A worker's job line").
- **What bmo-job's readings of an item do not carry.** An item's line and its opened reading carry no room it came
  from, no brief, no moment it was filed or finished, no progress, stop or held checkout of its work order, no
  wait its job marked, nothing of whether a deployment waits on it or whether its order is under way; and no route
  serves an item's approvals, the turns of its talk, every open question with its words and options (a room's
  open questions come without them), or when each task of a work order ended. The panel's rows stand without
  those, a finished item whose run still ends reads as finished rather than as reporting, an item's approvals and talk stand empty, the question bar and a question's ringing stand with nothing
  to say, and a task stands without its end. A search reaches every open item whole and a finished one by its
  line, its number, title and status, since opening every finished item is a read per item.
- **A brief in its reader's language.** No unit serves an item's brief rendered in the language its reader reads, so
  every brief stands in the original it was written in.
- **A work order's text in the other language.** The translator and the translations it keeps are bmo-gate's,
  which serves the console no route for them yet, so a work order's text reads as it was written and asking for
  its translation is answered as unavailable.
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
- **A companion's room taken back.** The receiver answers whether an added companion took a room back; the console
  says so in the pack's words and reads nothing else of the receiver's answer about it.
- **A companion's settings.** The agency's fixed API lists a companion by its name, its label and what answers for
  it, and takes a change to its settings; it serves no route that reads those settings back. The companions screen
  lists what it reads and offers a change, and the settings beside a companion stand empty.
- **An item's talk.** The unit that kept an item's talk was bmo-job, whose fixed API keeps none; the receiver's
  talks answer one turn and keep no turns. A talk about an item stands with no turns and takes none.
- **A runner's launch, a word to a worker, and a run's stop by its kind.** The fixed APIs launch an item on its
  worker, not a free runner; they send a turn into a session but start none from a screen's words; and they stop a
  job by its own state or a run by its own close, so the board names an item's job and a run's number. A launch and
  a word to a worker stand unavailable.
- **The voice briefing's switches.** No unit serves a route for the briefing's switch or a line's reading — the
  voice unit serves its engine alone — so the settings' 보이스브리핑 section and a line's reading stand
  unavailable.
- **A provider's own catalogue.** No fixed route reads the models a provider publishes, so the Codex and OpenRouter
  choosers and a tier's model chooser stand with none.
- **A work key's tier.** The agency answers each tier's mapping on every provider and each work key's road, and
  takes a tier's change; which tier a work key stands at is no part of an answer, so the tier screen's
  assignments stand empty.
- **A work order's own figures.** The fixed order carries its purpose, directive, steps and tasks; the road each
  task ran, what it spent, the round it belongs to and the end it came to are no part of it, so those stand empty.
- **A room removal's counts.** The receiver answers a removal's preview and what it took in its own shape; the
  console's rows, settings and archive copies are no part of that answer, so they stand empty.
- **A research run's own settings and a co-worker limit's change.** A research is a session the agency starts on a
  research work key, and the web settings it is held to — its branches, fetch strategy, gaps and clock — travel on
  the tool session record the agency issues (bmo-explorer's `docs/api.md`, 「What a placed tool reads of its
  record」), which no route hands to the console; the search engines' state is no route of any unit the console
  calls either. The agency's pool answers each place's limit and no route changes one. The searcher tab and the
  co-worker table say so in a sentence, and neither offers to change what it cannot.

## Screens of units not yet split

A unit that answers no console manifest has no screen in the console: no navigation entry, no route and no page.
The code graph and the voice briefing are such units today; the gates' screen is the gate unit's own, loaded from
its manifest. No file of a unit's screen is carried here. `docs/inventory.md` lists every file of the old screens.

- **The voice briefing's player** stood in the layout, over every screen; it is not carried, and the layout
  holds no player. The voice briefing's switch and a line's reading
  stand unavailable, since no fixed route serves them (「Gaps the console meets」).
- **What the document viewer shows of the gate unit's seek gate** stands without it and makes no call: the question
  box answers from the documents' own text. The translator is reached at `GATE_ADDRESS` (「Calls the console
  makes」); a console that names no gate stands the translation toggle unavailable.
- **What the agency screens show of a unit not yet split** stands unavailable and makes no call: Laya and the
  gate order, the gate unit's; the nodes a worker may stand on, the node unit's. The gates stand in the agent list
  as one run, a worker stands on this machine alone, and a gate's own screen is the gate unit's.

## The codes the packs render

Every other unit answers in English messages and codes; the language packs here hold the sentence each code is
shown as.

| Unit | Codes | Where they are listed |
|---|---|---|
| the receiver | its refusals, each by the table beside its calls — every route's, the owner's sends, the voice briefing, removing a room, the companions' and the draft process's; a file a send did not take, by its kind; the fixed lines through `POST /words/render`. Its facts are an agent's to say, and no screen shows them | the receiver's `docs/codes.md` |
| bmo-job | its refusals, each by the table beside its calls; the answers a screen says, a queue told and an unanswered turn; the kinds a row is laid out by, the held words, the line and model marks, and the phases a job's time is divided into | bmo-job's `docs/api.md`, 「Codes」 and 「Routes」; its `docs/jobs.md`, 「Where a job's time went」 |
| bmo-ui | the 90 keys the layer reads | bmo-ui's `docs/boundary.md`, 「Wording keys」 |

## The public address

The console answers under one base path, the one its settings name, behind the deployment's proxy. The proxy
hands on the base path as it is, and flows the event streams unbuffered. The port the console listens on and the
public name stand in the console's settings (「Settings」) and are not written into this repository.

| Road under the base path | Where it goes |
|---|---|
| every road | the console, at the port its settings name, the base path handed on as it is |
| `/api/events` and every other event stream | the console, unbuffered, the connection kept open while it idles |
| `/api/<service>` and every road under it | the console, which hands each on whole to the service a manifest names (「Calls the console makes」), behind its sign-in but for a share token's own read and a bundle's module and stylesheet |
| `/api/console-bundles` | the console: the bundles the signed-in reader may open, with their words; with no session, the one bundle whose share page the `path` asked for stands under |

The server answers on its own listen address to the console and the other units on the machine, and no road of
the proxy reaches it.
