# The repository's checks

## How the suite runs the tests

The suite `testbed.toml` declares has two units: the server's crate, whose test targets Cargo runs, and the
client, a Bun project of its own by its manifest and lockfile in `client/`, whose `check` script runs the
console's typecheck and then every test file under `client/tests` in one `bun test`.

- **The browser tests run inside the client's check,** one file after another in that one process, so no two
  browsers ever come up side by side. The check runs with the real home, so Playwright finds the browser builds
  it pins; a file asks `touchReady()` and skips only on a machine without them. A test that drives Firefox or
  WebKit as it ships, with no clipboard permission granted, reads what landed by pasting it, and skips only where
  that engine's build is missing.
- **They are not in the testbed's browser lane.** The testbed gathers no test file inside a project of its own,
  and its layout check holds every `package.json` to a project or the root's package workspace, which this
  repository does not have. So `client/` stays a project, and its browser files run in its check rather than as
  declared browser files.
- **Most browser files drive a running console** rather than a page of their own: each reads the console's
  address from `BMO_CONSOLE_TEST_URL`, except `skeleton`, which reads it from `BMO_SKELETON_TEST_URL`. The suite
  stands up no console, so without those variables they skip; every other browser file runs.
- **Every client file shares that one process,** its globals and the console's server state among them, such as
  the bundles attached. Bun reports a test that runs out of its time as failed and goes on, while the test's body
  runs on to its end in the tests after it. So state another describe sets up in its own hooks, the bundles
  attached among it, is taken back in a hook of the describe that changed it, never at the end of a test's body,
  where a late body would take it from the describe running then.
- **A server a test stands up listens on the loopback address, `127.0.0.1`, alone,** as the tests reach it. A
  server left to Bun's default listens on every address, and a machine whose loopback reaches such a listener only
  after its first connection attempts are dropped makes every call to it wait seconds.

### The scratch databases

Every test that needs PostgreSQL makes a database of its own on the server `BMO_TEST_POSTGRES` names, else the
machine's own socket's `bmo_test`, and every name carries the process that made it:

- **The server's tests:** the first test of a binary migrates a template, `bmo_web_tmpl_` followed by the
  binary's process id; each test gets a copy of it, `bmo_web_copy_` followed by the process id and a count; and
  a module whose tests share one database seeds it once, `bmo_web_shared_` followed by the process id and a count.
- **The client's tests:** a test file gets a database of its own, `bmo_web_console_` followed by the process id
  and a count, and the browser harness one for its console, `bmo_web_browser_console_` followed by its process id.
- **A drop that fails fails the test.** A copy is dropped when its test ends and a client file's database when
  its file is done; the browser harness drops its own when it stops and exits with a failure where it cannot. The
  drop first ends the suite role's own sessions on the database and then drops it without forcing: forcing needs
  the right to end other roles' processes, an autovacuum worker's among them, which the suite's role need not
  hold, while the plain drop stops an autovacuum worker itself.
- **A template and a shared database outlive their binary,** since a test binary ends without dropping what its
  tests share, and so does any database of a process that was killed.
- **The sweep drops what a dead process left.** Before a server test binary makes its first database, it drops
  every database of the server's three names; before a client test process makes its first, every one of
  `bmo_web_console_`; and before the browser harness makes its own, every one of `bmo_web_browser_console_`. Each
  drops only a database whose process no longer runs on this machine and that no client's session is on, so a
  run of another checkout against the same server keeps its own, and reads no name but its own. A database it
  cannot drop is named on the error stream and left for the next run.

### The browsers' language

Every browser a client test launches lists Korean, `ko-KR`, as its language unless the test names another. The
tests read the console's words in Korean through the shared wording module, and the console follows the browser's
languages for a reader whose account names none (`docs/web.md`, 「Wording and the language pack」), while a browser
left to itself lists its own build's language, English. So the client's tests preload one module, named in
`client/bunfig.toml`, that gives every context and page opened from a launched Chromium, Firefox or WebKit the
Korean locale where the test passes none. A test about another language passes that language as its own `locale`,
which stands.

### Running the console-driven browser files

`client/tests/support/browser-console.ts` stands up the console they drive:

- **What it starts:**
  - the account service, the binary `BMO_WEB_SERVER_BIN` names, on a scratch database of the test server
    (`BMO_TEST_POSTGRES`, or the machine's own socket where it names none);
  - the account service's secret store on a folder of the scratch directory, in place of the data root's `env/`;
  - a stand-in for each unit the console reads, answering the agent list, the owner's room and its figures, the
    Claude accounts with what each has left and the user each belongs to, one of them a fixture account's and the
    rest the platform's, a provider keeping a balance, the model gateway's members with the account each belongs
    to, a road owned whole by that fixture account and another the platform's, an empty TODO board and silent event
    streams, the node service's machines and their live readings as a running one answers them, captured and made
    neutral, stamped as they are asked, a unit's own supply kept as the agency keeps it, a unit's own repositories
    added and removed as the agency keeps them, a sign-up composition read off and written onto the account service's
    chain as the agency does, one fixture member whose runs only their
    own supply can carry, and every other road with the unit's own not-found;
  - the agency's own kinds on the delegation chain, declared as the agency declares them as it stands;
  - in the brain's stand-in for organisations' memories, the org brains made and found by their keys, each keeping
    the memories written into it and moved to `invalidated`, so a page read again shows what a write left, and the
    base standing from the start with one candidate raised from an agent's brain, its source named in its labels,
    and another raised whenever none is left;
  - the brain's two layers on the delegation chain, `brain.global` and `brain.organisation`, declared as the brain
    declares them as it stands;
  - in the receiver's stand-in, whose private room each room is, `privateOf` and `sealed` on every room it reads:
    another account's private room with two lines said in it, `private-room`, and the owner's room, sealed where the
    script runs with `BROWSER_CONSOLE_SEALED_OWNER=1`; a write naming an account in another account's private room, or
    any account in a sealed room, is refused 403 `private-room` as the receiver refuses it; and, on its event stream
    as it opens, three members online in a room no fixture account stands in: one of the fixture's company, one of it
    who turned their presence off, and one the script moves into a company of its own;
  - a stand-in for the tool host's control socket on a Unix socket in the scratch directory, with the console's tool
    session token in a file beside it, answering bmo-explorer's link preview for the pages the media room's link
    messages lead to and its card picture for the picture one of them names (`docs/boundary.md`, 「The web beyond the
    units」), so a card fills with no outside site asked;
  - the fixture accounts each file signs in with, made by the console's own `user` script. Every account made
    with the administrator flag is a platform administrator by the account service's word, and the members, made
    without it, stay members, whose console sections are written whole as the administrator's screen writes them.
    The first account is the data move's administrator, and the move links the owner's sender to it, so it is the
    owner's account: a file that reads the owner's words as the reader's own signs in with it. The accounts the media
    room's and the sticker room's files sign in with each have a sender of their own linked to them, so what each said
    in its room stands on the right;
  - the second stand-in screen's two app kinds on the delegation chain (`docs/accounts.md`, 「An app's two settings」),
    declared as the unit publishing it would, offered and on wherever nobody says otherwise, so a file turns the app
    off for a company of its own and every other file reads the screen as before;
  - the console's development server, under the base path `/console/`, with a build folder of its own,
    `.nuxt-browser-tests`. Only the development server serves the screen-measuring module `console-ids` reads.
    The app's own type settings still stand in `.nuxt`, so a checkout the app was never prepared in is prepared
    first, by `bun run typecheck` in `client/` or `nuxi prepare` in `client/apps/web`. The development server
    bundles every library the console's own files import before any page opens, as the console's Nuxt settings
    name them, since one it met only once a page stood would reload every open page and lose what a test built.
- **What it prints:** the console's address, once it answers.
- **When it stops:** on an interrupt, stopping everything it started, dropping the database and removing its scratch
  directory. It watches every process it started: where one ends while it stands, the account service or the
  development server alike, it names that process and how it ended, stops the rest the same way, keeps the scratch
  directory, whose logs the failure names, and exits with a failure, so a later browser file never meets a console
  that is gone. Where it failed to start it does the same. Where the database cannot be dropped it says so and
  exits with a failure, keeping the directory too.

The tests serve the rest of what they measure through the page's own routes. The files run one at a time,
through the testbed, with the address the script printed:

```
cd client
BMO_WEB_SERVER_BIN=<the bmo-web-server binary> bun tests/support/browser-console.ts
BMO_CONSOLE_TEST_URL=<the address> bmo-testbed run -- bun test tests/browser/console-ids.test.ts
BMO_SKELETON_TEST_URL=<the address> bmo-testbed run -- bun test tests/browser/skeleton.test.ts
```

The first command stands until interrupted, so it runs in a shell of its own beside the others. Beside the
address it prints `BMO_CONSOLE_TEST_FEATURES=` and the console features file that console reads, which stands
nowhere until a test writes it (`docs/web.md`, 「The console's features」); the file that leaves features out,
`sidebar-features`, reads it from that variable and skips without it, and takes the file back once done:

```
BMO_CONSOLE_TEST_URL=<the address> BMO_CONSOLE_TEST_FEATURES=<the file> bmo-testbed run -- bun test tests/browser/sidebar-features.test.ts
```

The console the script stands up listens on this machine's loopback address alone, so a file is run on the
machine that stands it. The testbed's declaration names `BMO_CONSOLE_TEST_URL` and `BMO_SKELETON_TEST_URL` among
the variables only this machine reaches, so a run that sets either is never placed on another machine, where it
would find no console at the address and skip every test.

### The vendored packages as installed

Every package the console takes from a tarball under `client/vendor/` runs as that tarball holds it. Bun installs
a package's files as hard links to its shared install cache, so one file written in place inside any
`node_modules` changes the cache entry and every checkout and build tree linked to it, and a later install,
`--force` among them, links the changed entry again. The client's check therefore reads, for each such
dependency of the client and its workspace members, the tarball the manifest names and the copy installed for
it: every file the tarball holds stands installed with the same bytes. Only the tarball's files are read, since
the install writes markers of its own into the installed copy, `.bun-tag` among them, that no tarball holds. A
finding names the package and the files.

A copy found changed is repaired in the shared cache first: the cache entry is replaced by the tarball's contents,
or removed so the next install extracts it again, and every tree linked to it then has its copy of the
package removed and installs again. A change to a vendored package is made in its own repository and reaches
the console as a new tarball, never as an edit under `node_modules`.

## The console's production build

The change check builds the console for production, as a deployment builds it, wherever a change reaches what
decides what the build bundles: the client's manifests and lock, its patches, the vendored packages, the Nuxt
configuration and the app's modules. The typecheck and the browser files run against the dev server, which loads
a module only once a page asks for it, so a module the production build cannot bundle passes both and stops only
the deployment. The step is the testbed declaration's `console-build`, in the testbed's wide lane. It writes
Nuxt's generated project and the build's output into `client/apps/web/.check-build`, which the checkout ignores,
so a typecheck and a standing dev console in the same checkout keep their own. The app's `tsconfig.json` refers
to the project configs Nuxt generates into `client/apps/web/.nuxt`, and the build's transform reads them for every
file it compiles, so a tree holding no `.nuxt` yet, as a new worktree or bench does after its install, has the step
prepare one first with `nuxi prepare`; a tree that already holds one keeps it untouched.

## The repository-wide checks

The checks that span the repository stand in the root's `tests/`, in `repository.rs`. The root is a Cargo
workspace and holds no package, so the server's crate runs them as a module of its test harness, `repository`, and
they run with the server's tests:

```
bmo-testbed cargo test -p bmo-web-server --test main repository::
```

They read every file git tracks or would track, the new ones it does not ignore among them.

- **Dependencies.** No package depends on a `bmo-*` package but the base libraries `bmo-chat`, `bmo-chat-client`,
  `bmo-ui` and `bmo-text`, and the published clients of the units the console calls (`docs/boundary.md`): not the Cargo workspace's
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
