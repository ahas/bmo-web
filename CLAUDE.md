# Working in this repository

This repository is the web console, `bmo-web`. Its server, `server/`, is the account service on sumida: the
users, the senders linked to them, the grants they hold and the account model they stand in, served over HTTP
to the console and to every unit that asks who may do what; and the language packs, the one place a sentence a
person reads is kept, with the route that renders a unit's fixed line. Its client, `client/`, is the Nuxt
console, a Bun workspace: the shell a person signs in to and the screens of the units that ship no console
bundle of their own, each calling that unit's HTTP API. A unit that ships a console bundle answers a manifest the
console reads while it runs, and its screens are loaded from the unit itself; a screen of a unit that ships none
is a placeholder.

## Rules

- **`.graph/` is the code dependency graph, and only `bmo graph` writes it.** Its nodes name the features of
  this repository and the APIs it exposes and calls; a change to a feature's files, symbols or edges brings
  its nodes up to date in the checkout, never by hand and never by a script. Its area files are generated and
  untracked, so a fresh checkout builds them again, while `settings.toml` is the repository's configuration
  and stays tracked.
- **`docs/` is canonical.** Read the document covering a change before changing code. A change that would
  make it wrong or incomplete repairs it first, stating what is true now, and the code is then written to
  match. `docs/boundary.md` states every route this repository serves, every call it makes on another unit
  and every code it answers with; `docs/inventory.md` states where each member of the old repository stands.
- **No `bmo-*` dependency but the base libraries** `bmo-chat`, `bmo-chat-client`, `bmo-ui` and `bmo-text`, the published clients of the units the console calls (`@agency/client`,
  `bmo-job-client` and `@bmo/receiver-client`), and the repository's own crates
  `bmo-web-server` and `bmo-web-client`. Each of those clients is installed as the vendored tarball under
  `client/vendor/`. Another unit is reached over HTTP at the address a setting names; its code, its tables and
  its files are never read. A helper an old shared package held is copied in. The testbed's dependency sweep and
  the repository's own tests fail on any other.
- **A base never knows its consumers.** The account service, the language packs and the console's shell supply
  the mechanism and a safe default; no code here names the unit or agent that calls it, and nothing branches
  on a unit's or a chat service's name.
- **The language packs are this repository's alone,** and every sentence a person reads stands in one. Code,
  comments, strings, tests and documents are English, and so are commit messages. A test reads a sentence by
  its key or uses neutral English input; Korean words the code matches on are data in a pack, never in a code
  file.
- **The UI's Korean is guided by `WORDING.md` at the root.** A worker writing or changing a sentence a person
  reads follows it and adds a word there when a concept first needs one; the words themselves stand in the pack.
  No test reads the guide.
- **No agent names, owner names, host names, home paths, private network addresses or personal domains** in
  code, documents or commits. An agent is named by its registration; tests use neutral names such as `agent-a`
  and `agent-b`. No list of forbidden names is kept in the repository; the names check reads one from outside
  it, the file `BMO_NAMES_LIST` names (`docs/checks.md`).
- **Tests live in `tests/`:** the server's in `server/tests/`, the client's in `client/tests/`, and the checks
  that span the repository in the root `tests/`. No test sits beside the code it tests.
- **No directory named after its parent** (no `x/x`), and **one manifest at the root**: the Cargo workspace's,
  whose members are `server/` and `server/client/`. The client is a Bun project of its own, its `package.json`
  and lockfile in `client/`.
- **Documents state what is true now**: no change history, no quoted source and no file-and-line pins.

## Checks

A change moves through three stages in order:

1. Writing: the static check of the half the change touches. The server:
   `bmo-testbed cargo check --workspace --all-targets`. The client: `bun run typecheck` in `client/`, which
   checks the app in `apps/web` (its own `bun run typecheck`), the account service's client and the tests.
2. Review: read the whole diff against what the change is for and the document governing it, then the linter
   and the formatter: `bmo-testbed cargo clippy --workspace --all-targets -- -D warnings` and
   `cargo fmt --all --check` (108 columns, 2-space indentation, as `rustfmt.toml` sets) for the server;
   `bmo-testbed check quick` for the whole tree.
3. Verification: the test targets the change touched, then the suite `testbed.toml` declares, once.

Cargo runs through the testbed's Cargo verb, `bmo-testbed cargo <cargo arguments…>`, which builds in the one
shared build directory; no checkout keeps a `target/` of its own.

The version is the repository's, and `VERSION` holds it. It moves only at a release the owner declares, as
bmo-chat's `docs/conventions.md` 「Versions」 states; a commit, a deploy, a fix or a contract change moves none, and
a deployment is told apart by its commit. The testbed's declaration, `testbed.toml`, carries none; it states how the testbed tests, checks, builds and
deploys the repository.
