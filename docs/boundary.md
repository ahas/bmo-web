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
states them. The four units the console calls directly publish a TypeScript client: `@agency/client`,
`bmo-job-client`, `@bmo/receiver-client` and `bmo-brain-client`, each a vendored tarball under `client/vendor/`
and each generated from that unit's OpenAPI document. The console's server calls them through those packages and
their `./schema` types, and reads a response into the screen's own shape where the screen needs more than the
unit carries. A browser call to one of them reaches its fixed path through the relay (below).

| Unit | What the console reaches it for | Routes |
|---|---|---|
| the server (this repository) | sign-in, the session, users, phone keys, grants, checks, the model | every route above |
| the agency (`docs/api.md`) | the agents and workers with their gates, reasoning, roles and sampling; base prompts; companions and a companion's reset; sessions and a session's end; the co-worker pool; the log lines of a run; the registered models, the model files, the tiers, the fold ratios and the roads; a worker's node; the jobs a worker runs and their prompts; its turns going out and ending, relayed to each tab | `GET /agents`, `GET /workers`, `GET /roles`, `PATCH /agents/{agentName}`, `GET`/`PATCH /workers/{workerName}`, `GET`/`POST /models`, `GET`/`PATCH`/`DELETE /models/{modelKey}`, `GET`/`POST /model-catalogue`, `GET /tiers`, `GET /providers`, `PATCH /tiers/{tierName}`, `GET /fold-ratios`, `PUT /fold-ratios/{provider}/{tier}`, `GET`/`PATCH /fallback`, `GET /prompt-documents`, `PATCH /prompt-documents/{documentName}`, `GET /companions`, `PATCH /companions/{companionName}`, `POST /companion-resets`, `GET`/`DELETE /sessions`, `GET /pool`, `GET /jobs`, `GET /jobs/{jobId}/prompt`, `PATCH /jobs/{jobId}`, `GET /runs`, `GET /log-lines`, `GET /events?kinds=turn-started,turn-ended` |
| bmo-job (`docs/api.md`) | the TODO panel: every item, each item opened, the verbs on an item, its notes and reports, its work order and tasks; answering a question and stopping its clock; the queues' pause and holds, and the deployment's hold let go | `GET`/`POST /items`, `GET`/`PATCH /items/{itemId}`, `GET`/`POST /items/{itemId}/notes`, `DELETE /items/{itemId}/notes/{noteId}`, `GET /items/{itemId}/reports`, `GET`/`PUT`/`PATCH /items/{itemId}/work-order`, `GET`/`PATCH /items/{itemId}/work-order/tasks/{taskId}`, `GET /questions`, `GET`/`PATCH /questions/{questionId}`, `POST /questions/{questionId}/replies`, `GET`/`PATCH /queues`, `GET /events?after=&run=` (relayed to each tab from that tab's cursor) |
| the receiver (`docs/api.md`) | the room list, a room's title and its line, page by page, past a message, one message and where a day begins; a message's files, their bytes, its picture and the metadata it arrived with, for a message that carries files; a room's pictures, its figures and the chat agent's window there; the numbers an agent's words stand under, to know whether a message is an agent's; the senders each room has, for which rooms a user reads; the owner's private chat; the owner's words and files; the event stream and the live board; removing a room; the rooms' pinned order, a room pinned and let go; what opened a turn; companions with a room; the names people last spoke under, for the memories screen; a turn of the talk about a document | `GET /rooms`, `GET /rooms/{roomId}/title`, `GET /rooms/{roomId}/answerers`, `GET /rooms/{roomId}/own-number`, `GET /rooms/{roomId}/messages`, `GET /rooms/{roomId}/day-start`, `GET /rooms/{roomId}/messages/{messageId}`, `GET /rooms/{roomId}/messages/{messageId}/files`, `GET /rooms/{roomId}/messages/{messageId}/files/{place}` (with `download=true` for a file to keep, and the `Range` the browser asked with), `GET /rooms/{roomId}/messages/{messageId}/picture`, `GET /rooms/{roomId}/messages/{messageId}/metadata`, `GET /rooms/{roomId}/pictures`, `GET /rooms/{roomId}/figures?zone=` (the zone the console shows every time in), `GET /rooms/{roomId}/window`, `GET /owner`, `POST /owner/messages`, `POST /owner/message-files`, `GET /events`, `GET /live`, `DELETE /rooms/{roomId}` (with `dryRun` for the preview), `POST`/`DELETE /pinned-rooms`, `GET /rounds/openings`, `GET /rounds/openings/{instructionId}`, `POST /companions`, `DELETE /companions/{companionName}`, `GET /people`, `POST /talks` (with a `document` topic, the earlier turns and the words just said), `GET /health` |
| the brain (`docs/api.md`) | the memories screen; the fragments behind the document viewer's documents, the name each kind is called by, and a fragment's standing | `GET`/`PATCH /memories`, `GET /fragments`, `GET /fragment-kinds`, `PATCH /fragments/{fragmentKey}`, `GET /health` |
| the console bundles (`bmo-ui`'s `docs/console-bundles.md`; each unit's `docs/api.md`) | each bundle's own screen: its calls to the one service its declaration names | every path under `/api/<service>/`, handed on as it came to `<SERVICE>_ADDRESS` with `<SERVICE>_TOKEN`, behind the console's sign-in, its status, bytes and headers as the service gave them; a `GET` or `HEAD` of `shares/<token>` is relayed with no session, since the token is the whole of the permission. The services and their bundles are bmo-artifact (`artifact`), bmo-mail (`mail`), bmo-review (`review`), bmo-drive (`drive`) and bmo-remote (`remote`); a bundle's screen, its words, its event stream, its sockets and its notice kinds come from the bundle's declaration, and no code here names one. The relay also hands on a unit the console calls directly — the agency, bmo-job, the receiver and the brain — at the address its setting names, so a browser call to `<unit>`'s own fixed path stands under `/api/<unit>/`. The artifact bundle's share page reads the document its link names, which the relay does not open without a session: that is a gap in bmo-ui's contract, written in `docs/inventory.md`. |
| the cache siren (`docs/api.md`) | the cache siren screen: the sums it keeps by session, its siren count, its settings, and the newest events it holds | `GET /stats`, `GET /settings`, `GET /events?limit=` (read as a page, with `Accept: application/json`) |
| the cache warmer (`docs/api.md`) | the keepalive view: the round, each agent's switch, pause and last warming, an agent being the subject of its name under the consumer `KEEPALIVE_CONSUMER` names | `GET /round`, `PATCH /round`, `GET /targets?consumerName=`, `GET /consumers/{consumer}/subjects`, `PATCH /consumers/{consumer}/subjects/{subject}` |
| the Telegram service (`docs/api.md`) | the pictures kept for rooms and people, listed page by page, and one such picture | `GET /avatars`, `GET /rooms/{roomId}/avatar`, `GET /people/{personId}/avatar` |
| the testbed (`docs/deploy.md`) | the deployment in the title bar | the progress record, `deploy-progress.json`, read at the path `DEPLOY_PROGRESS_FILE` names, in the shape the testbed writes it; the testbed writes it and a reader needs only the file and the run's process; the last lines of the deploy unit the record names, read from the machine's user journal with `journalctl` |

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
| console | `BRAIN_ADDRESS`, `BRAIN_TOKEN` | the brain |
| console | `ARTIFACT_ADDRESS`, `ARTIFACT_TOKEN` | bmo-artifact |
| console | `MAIL_ADDRESS`, `MAIL_TOKEN` | bmo-mail |
| console | `REVIEW_ADDRESS`, `REVIEW_TOKEN` | bmo-review |
| console | `DRIVE_ADDRESS`, `DRIVE_TOKEN` | bmo-drive |
| console | `REMOTE_ADDRESS`, `REMOTE_TOKEN` | bmo-remote |
| console | `CACHE_SIREN_ADDRESS`, `CACHE_SIREN_TOKEN` | the cache siren |
| console | `CACHE_WARMER_ADDRESS`, `CACHE_WARMER_TOKEN` | the cache warmer, which takes its bearer on every route, health included |
| console | `KEEPALIVE_CONSUMER` | the consumer the agency registers its targets under at the cache warmer; with none, an agent's own keepalive switch is not offered and the round's still is |
| console | `TELEGRAM_ADDRESS`, `TELEGRAM_TOKEN` | the Telegram service |
| console | `DEPLOY_PROGRESS_FILE` | the testbed's progress record |
| console | `DOCUMENT_ROOTS` | the document viewer's roots: a JSON list, each root's `key`, its `label` and the absolute top of its `checkout` (`docs/documents-viewer.md`, 「The roots a deployment names」); with none, the viewer lists only the roots other units keep, unread |
| console | `WEB_DATA_DIR` | the console's own data folder, inside no checkout |
| console | `NUXT_SESSION_PASSWORD` | the key the console seals its session cookie with |

- **A unit whose address is not set** is a unit the console does not reach: its screens stand as they do for a
  unit not yet split (below), and no call is made.

## Gaps the console meets

What the console needs and no unit serves stands empty in the console until a unit's document states a route
for it, and no file or table of that unit is read meanwhile.

- **What a room's page does not carry.** The receiver's pages carry a message's words, its sender, its round and
  its files' names, and nothing else a bubble's chip line wears. The console reads those from the units that hold
  them: a page's verdicts from the gate's `GET /judgements`, and what the round behind a message cost and called
  from the agency's `GET /runs` and its log lines — the answer line's usage and every line naming a tool. The
  openings that ride on a verdict, a line's voice briefing and its reading are served by no unit yet, so they stand
  unread and no line carries the briefing chip. The metadata a message arrived with is read only for a message
  that carries files, since a custom emoji, a sticker and a video's shape each stand on one of its files.
- **What a room's agents ran and spent there.** The receiver's figures hand each agent's runs, last run and tokens
  as null, since the agency answers none of them by room, so the session sheet stands each as "—".
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
- **Usage.** The usage windows, the tallies by model, agent and user, and each session's context are served by no
  unit, so every meter reads as having nothing to say.
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
- **A work order's text in the other language.** The translator and the translations it keeps are bmo-gate's,
  which serves the console no route for them yet, so a work order's text reads as it was written and asking for
  its translation is answered as unavailable.
- **A worker's downgrade heal.** Whether a worker's session is put back on its model when it answered on a lesser
  one is set by the agency's command line and taken by no route, so the console's switch for it changes nothing.
- **A tool's icon.** Which icon each of the deployment's own tools declares is the tool host's to say, and no unit
  hands it to the console, so every tool in a log takes the one generic icon.
- **The brain's library and the agency's documents, whole.** The brain reads its documents to a turn of one room
  alone (`POST /knowledge/read`, `POST /people/read`), and the agency serves the prompt documents it deploys by no
  route, so the document viewer stands their roots unread and reads neither unit's folders
  (`docs/documents-viewer.md`, 「The roots kept by other units」).
- **A memory's watch.** The brain's memory rows carry no watch, and no route lists the watches serving a row, so the
  memories screen stands every row without one.
- **The names people last spoke under.** The memories screen reads them from the receiver's `POST /people/names`,
  which the receiver's document states for the brain; the console reads it as that document states it.
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
- **The voice briefing's switches.** The receiver's fixed API serves no route for the briefing's switch or a
  line's reading, so the switch and the reading stand unavailable.
- **A provider's own catalogue.** No fixed route reads the models a provider publishes, so the Codex and OpenRouter
  choosers and a tier's model chooser stand with none.
- **A tier's mapping and a work key's assignment.** The agency lists the tiers and the providers, and takes a
  tier's change; the mapping it resolves and each work key's assignment are no part of an answer, so the tier
  screen stands with the tier and provider names alone.
- **The fallback's providers and accounts.** The agency answers the fallback's roads and whether it is answering;
  the provider order, the account list and the stand-in's own picture are no part of that answer, so they stand
  empty.
- **A memory's own fields.** The brain's fixed API keeps one generic row — its scope, kind, text, state, labels and
  conditions — and the console's agent, room, event, action and message are the labels a caller wrote. A row whose
  caller wrote none of them stands by its defaults, and no watch is served for one.
- **A work order's own figures.** The fixed order carries its purpose, directive, steps and tasks; the road each
  task ran, what it spent, the round it belongs to and the end it came to are no part of it, so those stand empty.
- **A room removal's counts.** The receiver answers a removal's preview and what it took in its own shape; the
  console's rows, settings and archive copies are no part of that answer, so they stand empty.

## Screens of units not yet split

The screens of the code graph, the nodes and the monitor, the card arbiter, the gates and the voice briefing
belong to units whose own repositories carry no console bundle yet. Until each unit publishes one, the console
shows a placeholder in that screen's place: its navigation entry and its route stand, and the page says,
through the language pack, that the feature is not available in this console. The placeholder makes no call,
and no file of the unit's screen is carried. `docs/inventory.md` lists every file of those screens.

| Unit | Address | Below it |
|---|---|---|
| bmo-graph | `/graph` | none |
| bmo-node | `/monitor` | every address, as this machine's own monitor stood |
| bmo-arbiter | `/cards` | none |
| bmo-gate | `/gates` | every address, as each gate's own page stood |
| bmo-voice | `/briefing` | none |

- **The voice briefing's player** stood in the layout, over every screen; it is not carried, and the layout
  holds no player, nor the settings section that placed it. The voice briefing's switch and a line's reading
  stand unavailable, since no fixed route serves them (「Gaps the console meets」).
- **What the document viewer shows of the gate unit** stands without it and makes no call: the seek gate, so the
  question box answers from the documents' own text; and the translator, so the translation toggle stands
  unavailable and both translation routes answer so.
- **What the agency screens show of a unit not yet split** stands unavailable and makes no call: Laya and the
  gate order, the gate unit's; the nodes a worker may stand on, the node unit's. The gates stand in the agent list
  as one run, a worker stands on this machine alone, and a gate's own screen is the gates placeholder.

## The codes the packs render

Every other unit answers in English messages and codes; the language packs here hold the sentence each code is
shown as.

| Unit | Codes | Where they are listed |
|---|---|---|
| the receiver | its refusals, each by the table beside its calls — every route's, the owner's sends, the voice briefing, removing a room and the companions'; a file a send did not take, by its kind; the fixed lines through `POST /words/render`. Its facts are an agent's to say, and no screen shows them | the receiver's `docs/codes.md` |
| bmo-job | its refusals, each by the table beside its calls; the answers a screen says, a queue told and an unanswered turn; the kinds a row is laid out by, the held words, the line and model marks, and the phases a job's time is divided into | bmo-job's `docs/api.md`, 「Codes」 and 「Routes」; its `docs/jobs.md`, 「Where a job's time went」 |
| the brain | its refusals, by the table beside its calls: its error shape's codes, the refusals a row's state answers with, and every code of its memory, fragment, document, digest and agent refusals, a code it carries in `refusal` said before the answer's own | the brain's `docs/boundary-api.md`, 「The error shape」, 「Memory rows」 and 「Codes the brain answers with」 |
| bmo-ui | the 90 keys the layer reads | bmo-ui's `docs/boundary.md`, 「Wording keys」 |

## The public address

The console answers under one base path, the one its settings name, behind the deployment's proxy. The proxy
hands on the base path as it is, and flows the event streams unbuffered. The port the console listens on and the
public name stand in the console's settings (「Settings」) and are not written into this repository.

| Road under the base path | Where it goes |
|---|---|
| every road | the console, at the port its settings name, the base path handed on as it is |
| `/api/events` and every other event stream | the console, unbuffered, the connection kept open while it idles |
| `/api/<service>` and every road under it | the console, which hands each on whole to the service the bundle declares (「Calls the console makes」), behind its sign-in but for a share token's own read |

The server answers on its own listen address to the console and the other units on the machine, and no road of
the proxy reaches it.
