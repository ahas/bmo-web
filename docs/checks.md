# The repository's checks

## How the suite runs the tests

The suite `testbed.toml` declares has two units: the server's crate, whose test targets Cargo runs, and the
client, a Bun project of its own by its manifest and lockfile in `client/`, whose `check` script runs the
console's typecheck and then every test file under `client/tests` in one `bun test`.

- **The browser tests run inside the client's check,** one file after another in that one process, so no two
  browsers ever come up side by side. The check runs with the real home, so Playwright finds the browser builds
  it pins; a file asks `touchReady()` and skips only on a machine without them.
- **They are not in the testbed's browser lane.** The testbed gathers no test file inside a project of its own,
  and its layout check holds every `package.json` to a project or the root's package workspace, which this
  repository does not have. So `client/` stays a project, and its browser files run in its check rather than as
  declared browser files.
- **Eleven browser files drive a running console** rather than a page of their own: `agent-topbar`,
  `agents-general`, `agents-models`, `bubble-wrap`, `composer-in-view`, `console-ids`, `prompt-wrap`, `room-feed-gap`,
  `topbar-square`, `work-view` (which read the console's address from `BMO_CONSOLE_TEST_URL`) and `skeleton` (from
  `BMO_SKELETON_TEST_URL`). The suite stands up no console, so without those variables they skip; every other
  browser file runs.

### Running the console-driven browser files

`client/tests/support/browser-console.ts` stands up the console they drive:

- **What it starts:**
  - the account service, the binary `BMO_WEB_SERVER_BIN` names, on a scratch database of the test server
    (`BMO_TEST_POSTGRES`, or the machine's own socket where it names none);
  - a stand-in for each unit the console reads, answering the agent list, the owner's room and its figures, an
    empty TODO board and silent event streams, and every other road with the unit's own not-found;
  - the fixture account each file signs in with, made by the console's own `user` script as an administrator;
  - the console's development server, under the base path `/console/`, with a build folder of its own,
    `.nuxt-browser-tests`. Only the development server serves the screen-measuring module `console-ids` reads.
- **What it prints:** the console's address, once it answers.
- **When it stops:** on an interrupt, stopping everything it started and dropping the database.

The tests serve the rest of what they measure through the page's own routes. The files run one at a time,
through the testbed, with the address the script printed:

```
cd client
BMO_WEB_SERVER_BIN=<the bmo-web-server binary> bun tests/support/browser-console.ts
BMO_CONSOLE_TEST_URL=<the address> bmo-testbed run -- bun test tests/browser/console-ids.test.ts
BMO_SKELETON_TEST_URL=<the address> bmo-testbed run -- bun test tests/browser/skeleton.test.ts
```

The first command stands until interrupted, so it runs in a shell of its own beside the others.

## The repository-wide checks

The checks that span the repository stand in the root's `tests/`, in `repository.rs`. The root is a Cargo
workspace and holds no package, so the server's crate runs them as a test target of its own, `repository`, and they
run with the server's tests:

```
bmo-testbed cargo test --manifest-path server/Cargo.toml --test repository
```

They read every file git tracks or would track, the new ones it does not ignore among them.

- **Dependencies.** No package depends on a `bmo-*` package but the base libraries `bmo-chat`, `bmo-chat-client`
  and `bmo-ui`, and the published clients of the units the console calls (`docs/boundary.md`): not the Cargo workspace's
  packages, as Cargo's metadata answers them, and not a `package.json` of the console. The server's own crates —
  `bmo-web-server` and the client crate generated from its contract, `bmo-web-client` — are no unit's package and
  stand beside them. No Rust file names another `bmo_` crate at the head of a path but the server's own crates and
  the base libraries, and no console file imports another `bmo-*` or `@bmo/` package outside a bundle. Another
  unit is reached over HTTP alone.
- **Korean.** No code or test file holds a Hangul character: the Korean a person reads stands in the language
  packs (`server/lang/`, `client/apps/web/i18n/`), and the Korean a test reads in the tests' fixtures
  (`server/tests/fixtures/`, `client/tests/fixtures/`). The testbed's Korean ledger, `korean-ledger.json`, stays
  empty, allowing no file any.
- **Layout.** No directory is named after its parent, the root holds no manifest but Cargo's workspace and its
  lockfile, and no test stands inside a `src/` folder or anywhere but a `tests/` folder: no Rust test module in a
  crate's source, and no `.test.` or `.spec.` file beside the code it tests.
- **Assertions.** No console file, its code or its tests, asserts a value through `unknown` into another type
  (`as unknown as`). A value takes its type from a type guard, a narrowing function, a generic parameter, an
  annotation or `satisfies`; where a library's typing leaves no other way, from a single `as` with a line saying why.
  The third-party packs under `client/vendor/` are passed over.
- **Personal data.** No tracked file holds a mail address outside the reserved example domains, a person's home
  path, a telephone number, a token or a private network address. A neutral form is not a finding: a mailbox at
  `example.com`, `example.net` or `example.org`, a home path naming `user` or an agent such as `agent-a`, and a
  loopback address. The third-party packs under `client/vendor/` stand as their publishers shipped them and are
  passed over. The check carries the patterns; no list of addresses, paths or values is kept in the repository
  (`PERSONAL-DATA.md`).
- **Names.** No tracked file holds an agent's, a person's or a machine's name. No repository keeps the list of those
  names, so the check reads it from the file the variable `BMO_NAMES_LIST` names, outside the checkout: a TOML
  file with `words` (matched as whole words, ignoring case), `exact_words` (whole words, case kept), `anywhere`
  (matched anywhere, as a Korean name takes its particles with no space) and `allowed` (terms of others that hold a
  name, such as a dependency's address, set aside first). Where the variable names no file, the names are not
  checked and the run says so.

What a name is replaced by: an agent by its registration, which the deployment's settings carry (the chat agent's
name and label among them); a person by their role; a test's people and agents by neutral names such as `agent-a`.
The console's own name is the pack's, filled with the chat agent's label.
