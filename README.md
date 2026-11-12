# web

The web console, `bmo-web`: the server, which is the account service on sumida with the language packs,
and the client, the Nuxt console a person signs in to. The console's screens call each unit's HTTP API;
the account model, the grants and the words a room is told in a fixed line are this repository's own,
served to the other units over HTTP. It is the one repository that holds language packs: every other unit
answers in English messages and codes, which these packs render.

## Layout

| Folder | Holds |
|---|---|
| `server/` | the server: the account service on sumida (`src/`, with the deployment's rule file, the routes, the checks, the grants, the data move, the phone keys, the receiver port, the settings, the fixed lines' renderer, the document wording file, the migrations under `src/migration/` and the language pack's parts under `src/lang/`), its binary under `src/bin/`, the service's own contract and client crate under `client/`, the language pack's files under `lang/`, one folder to a language, its settings and sumida's, and its tests under `tests/` with their fixtures under `tests/fixtures/` |
| `client/` | the console, a Bun workspace of its own with its lockfile: the Nuxt app under `apps/web/`, the TypeScript package generated from the server's OpenAPI document under `packages/server-client/`, the console's tests under `tests/` with their support under `tests/support/`, bmo-ui's release file, the packed bmo-text and the packed clients of the units the console calls under `vendor/`, and the patches the install applies under `patches/` |
| `.graph/` | the code dependency graph: one node per feature a person names, its files, its exported names, the owner's words for it and what it needs or calls, an area to a file (`api.json`, `calls.json`, `console.json`, `server.json`) with its `settings.toml` beside them, written only by `bmo graph` |
| `tests/` | the checks that span the repository: its dependencies, Korean, layout, names and personal-data patterns (`docs/checks.md`), run by the server's crate as the module `repository` of its test harness |
| `deploy/` | the user units a deployment links: the server's, `bmo-web-server.service`, and the console's, `bmo-web.service` |
| `.cargo/` | Cargo's configuration for this checkout: sumida, a git dependency, fetched through the git program |
| `docs/` | the canonical statements of what the console and its server do, and the inventory of what this repository took from the single repository it was separated from |

At the root stand the Cargo workspace manifest, whose members are `server/` and `server/client/`, and its lockfile; the version in
`VERSION`; `testbed.toml` (the testbed's declaration of how this repository is tested, checked, built and
deployed); `rustfmt.toml`; `LICENSE` (MIT); `PERSONAL-DATA.md` (the personal data no file may hold); `WORDING.md` (the
guide to the Korean the console shows); `CLAUDE.md`; and `korean-ledger.json` (the Korean left in a code file, which
the testbed's Korean sweep holds every file to; no code file of this repository holds any).

## Documents

| Document | States |
|---|---|
| `PERSONAL-DATA.md` | The personal data no file may hold: whose it is, what counts, where a value belongs instead, and the checks that hold it |
| `WORDING.md` | The guide to the Korean the console shows: the principle a sentence follows and the one Korean word each console concept is written as |
| `docs/boundary.md` | The boundary: every route the server serves, its OpenAPI contract and its generated clients, every call the server and the console make on another unit, the settings that name those units, and the codes the packs render |
| `docs/accounts.md` | The account service: what it holds, where it answers, when the model is in force, its routes, its command and its tables |
| `docs/language-pack.md` | The language packs: the server's and the console's, how each is read, and what other units read of them |
| `docs/web.md` | The console: its layout, motion, access, wording, every screen, notifications, how it talks to the units, its settings and how it runs |
| `docs/documents-viewer.md` | The document viewer: its roots, names and versions, path boundaries, fragments, the contents, and asking about a passage |
| `docs/skeleton-loading.md` | How the console keeps the place of content it is still fetching |
| `docs/checks.md` | How the suite runs the tests, the browser tests among them; the checks that span the repository: what its packages and code may depend on, no Korean in code or tests, its layout, the personal-data patterns no tracked file may match, and the names no tracked file may hold |
| `docs/inventory.md` | Every member of the single repository this one was separated from: where it stands here, the task that carried it, and the unit that owns the ones that did not come |

## Version

- **One version for the whole repository.** `VERSION` holds it, and the server's and the client's manifests
  equal it.
- **It moves only at a release the owner declares,** as bmo-chat's `docs/conventions.md` 「Versions」 states; a
  commit, a deploy, a fix or a contract change moves none, and a deployment is told apart by its commit.

## Checks

`bmo-testbed check quick` runs the sweeps that read the tree before anything runs: Korean in the code, the
README's folder table, the dependencies the manifests name, the Cargo profile and the shared versions. The only dependencies from another
repository are the base libraries `bmo-chat`, `bmo-chat-client`, `bmo-ui` and `bmo-text`, and the published
clients of the units the console calls, `@agency/client`, `bmo-job-client` and `@bmo/receiver-client`, as
`testbed.toml` declares; the console takes those it installs from their files under `client/vendor/`, bmo-ui as
its release verb wrote it. The `shared-versions` sweep holds that file to the release bmo-chat's shared versions
pin. The service's own
client crate, `bmo-web-client`, and the package generated from it, `@web/server-client`, are this repository's
own and are no unit's package. `bun run typecheck` in `client/` checks the console app, the generated TypeScript
package and the console's tests.
