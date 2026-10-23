# Inventory: what bmo-web takes from the old bmo repository

bmo-web is the web console: its server, the account service on sumida, and its client, the Nuxt console.
This inventory lists every member it takes from the old single bmo repository and every member near it
that it leaves, each exactly once, with the task of item #1736 that carries it. Old members are read at
the old repository's commit `3e4c032dacb24033f4efbb4fda04c655b751ca1e`. The split plan, archive
document #301, settles which unit owns what.

Phase 1 carries behaviour unchanged. The console's screens stay this repository's where their unit has
split without a plugin bundle of its own (the agency, bmo-job, the receiver, the brain, the cache siren
and the cache warmer); they call that unit's HTTP API instead of its code, its tables or the old control
port. The archive screen comes from bmo-artifact's plugin bundle. A screen of a unit not yet split is a
placeholder until that unit's own item carries it.

## The console client: 1,238 files

Paths are relative to the old `client/`. A folder written with a trailing slash stands for every file
under it. The sort follows the old code graph's features: a file goes with the feature it is made of,
the earliest group in the order below where several features share it; a file the bmo-ui layer or the
bmo-artifact bundle already carries at the same path is not carried; a test goes with the file it tests.

| Set | Files | Carried by |
|---|---|---|
| The console workspace | 7 | build-6 (console workspace) |
| The console shell | 210 | build-7 (console shell) |
| The agency screens | 169 | build-9 (agency screens) |
| The job screens | 53 | build-10 (job screens) |
| The receiver screens | 136 | build-11 (receiver screens) |
| The brain screens | 39 | build-12 (brain screens) |
| The home, cache-siren, deployment and database screens | 33 | build-13 (ops screens) |
| The console's user unit | 1 | build-14 (deployment) |
| Already in bmo-ui | 165 | build-6 (console workspace) |
| Already in the bmo-artifact console plugin bundle | 58 | build-6 (console workspace) |
| A screen of bmo-mail | 113 | not carried: bmo-mail's console bundle |
| A screen of bmo-remote | 92 | not carried: bmo-remote's console bundle |
| A screen of bmo-node | 44 | the monitor screen carried, reading the node service; the node screen not carried |
| A screen of bmo-review | 32 | not carried: bmo-review's console bundle |
| A screen of bmo-drive | 27 | not carried: bmo-drive's console bundle |
| A screen of bmo-voice, not yet split | 14 | not carried: placeholder (build-8) |
| A screen of bmo-graph, not yet split | 16 | not carried: placeholder (build-8) |
| A screen of bmo-arbiter | 10 | carried as the monitor screen's services tab, reading the card master |
| A screen of bmo-gate, not yet split | 8 | not carried: placeholder (build-8) |
| The phone app, dropped with `android/` | 11 | not carried: dropped (build-8) |
| **Total** | **1238** | |

The groups of kept files are copied in this order, each restoring the places in the shell that name it:
workspace, shell, agency, job, receiver, brain, ops.

### The console workspace (7 files)

Stands here as its own place in the Bun workspace under `client/`, re-cut for `apps/web`. Carried by build-6 (console workspace).

`.env.example`; `.gitignore`; `bunfig.toml`; `nuxt.config.ts`; `package.json`; `patches/reka-ui@2.10.4.patch`; `tsconfig.json`.

| Old member | Stands here as |
|---|---|
| `package.json` | `client/package.json`, the workspace (`apps/*`, `packages/*`) with the patch, the tests' own packages and bmo-ui; `client/apps/web/package.json`, the console, depending on `@web/accounts` from the workspace and on the console bundles from their packs under `client/vendor/`, without the old workspace's `@bmo/*` packages or the libraries of screens not carried |
| `nuxt.config.ts` | `client/apps/web/nuxt.config.ts`, extending the console bundles and bmo-ui, stating `bmoUi`'s zone, locale, date locale and relay base, with the server pack's reader pointed at `server/lang/` and the bundles' declarations read by `modules/console-bundles.ts`. What bmo-ui's layer now brings (the screen mode, the viewport, the first-frame ground, the semantic colours) and what served screens not carried are gone; a dev server's extra hosts are a setting |
| `tsconfig.json`, `.env.example` | `client/apps/web/` of the same names; the sample names every unit's address and token |
| `.gitignore` | `client/.gitignore` |
| `bunfig.toml` | `client/bunfig.toml`, holding the tests under `client/tests/`; its preloads were the old test kit's and the old bot's, none of which comes |
| `patches/reka-ui@2.10.4.patch` | `client/patches/`, the same patch bmo-ui and the bmo-artifact bundle carry, applied in the workspace's lockfile, which holds the packages it shares with bmo-ui at bmo-ui's own versions |

The packs under `client/vendor/` are made with `bun pm pack` in a scratch export (`git archive`) of each
repository's committed tree, never in its checkout: bmo-ui at revision 0.1.0-rev.5, the console
bundles bmo-artifact-client, bmo-mail-client, bmo-review-client, bmo-drive-client and bmo-remote-client, each at
its current revision, and bmo-text at 0.1.0-rev.5, which the mail bundle imports as `bmo-markup`; the
workspace's `overrides` points that name at the pack. Two of the bundles reach their own files by a host alias,
and one's `$fetch` type does not narrow in a host's typecheck, so their vendored copies correct the two paths
and the cast; the gaps they stand for are written in `docs/boundary.md`.

### The console shell (210 files)

Stands here as `client/apps/web/` at the same path; a test under `client/tests/`. Carried by build-7 (console shell).

Three of them first sorted as bmo-ui's stay web's, each because kept code imports from it a name bmo-ui does not
export (below, 「Already in bmo-ui」), and each holds only that name:

- `app/domain/numbers.ts`, for `COUNT_LOCALE`, which the agency's `app/domain/usage.ts` imports. bmo-ui answers
  the locale through `countLocale()`, reading the host's `bmoUi.locale`, and exports no constant.
- `app/domain/player.ts`, for `mediaUrl`, which five receiver screens import (`JudgementChips`, `MessageVideo`,
  `RoomMessage`, `RoomQuote`, `TelegramAsset`). It names the console's own media road, and bmo-ui's player takes
  a sound's address as given.
- `browser/touch.ts`, the touch harness 17 kept browser tests drive the page with, at `client/tests/browser/`.
  bmo-ui keeps its own copy among its tests, which its package does not export.

`shared/wording.ts` is the shell's: the `wording()` function over the console's pack, taking its `Translate`,
`WordingParams` and `Pack` types from bmo-ui's `shared/wording`.

`app/app.config.ts`; `app/app.vue`; `app/assets/css/main.css`; `app/assets/fonts/AppleSDGothicNeo-Bold.subset.woff2`; `app/assets/fonts/AppleSDGothicNeo-Medium.subset.woff2`; `app/assets/fonts/AppleSDGothicNeo-Regular.subset.woff2`; `app/assets/fonts/AppleSDGothicNeo-SemiBold.subset.woff2`; `app/assets/fonts/LICENSE-NotoSansSymbols2.txt`; `app/assets/fonts/NotoSansSymbols2-subset.woff2`; `app/components/BmoMark.test.ts`; `app/components/BmoMark.vue`; `app/components/ChatInput.vue`; `app/components/ItemTip.vue`; `app/components/MarkdownText.test.ts`; `app/components/MarkdownText.vue`; `app/components/PalettePreview.vue`; `app/components/ReadFailure.vue`; `app/components/SettingsAccount.vue`; `app/components/SettingsChoiceCell.vue`; `app/components/SettingsInputCell.vue`; `app/components/SettingsModal.vue`; `app/components/SettingsNotifications.vue`; `app/components/SettingsPalette.vue`; `app/components/SettingsPopoverCell.vue`; `app/components/SettingsTheme.vue`; `app/components/UserMenu.vue`; `app/domain/access.ts`; `app/domain/avatars.test.ts`; `app/domain/avatars.ts`; `app/domain/control.test.ts`; `app/domain/control.ts`; `app/domain/copy.test.ts`; `app/domain/copy.ts`; `app/domain/events.test.ts`; `app/domain/events.ts`; `app/domain/finding-blocks.ts`; `app/domain/item-tips.test.ts`; `app/domain/item-tips.ts`; `app/domain/jump.test.ts`; `app/domain/jump.ts`; `app/domain/kept-choice.ts`; `app/domain/login-end.test.ts`; `app/domain/login-end.ts`; `app/domain/markdown-load.ts`; `app/domain/markdown.test.ts`; `app/domain/markdown.ts`; `app/domain/palette.ts`; `app/domain/push.test.ts`; `app/domain/push.ts`; `app/domain/route-key.test.ts`; `app/domain/route-key.ts`; `app/domain/screens.test.ts`; `app/domain/screens.ts`; `app/domain/settings-dialog.ts`; `app/domain/settings.ts`; `app/domain/tab-state.ts`; `app/domain/theme.ts`; `app/domain/urls.ts`; `app/domain/watching.test.ts`; `app/domain/watching.ts`; `app/forms.test.ts`; `app/layouts/` (3 files); `app/middleware/auth.global.ts`; `app/pages/account.vue`; `app/pages/login.vue`; `app/pages/rooms/index.vue`; `app/plugins/appearance.ts`; `app/plugins/login-end.client.ts`; `app/plugins/names.ts`; `app/plugins/pwa.client.ts`; `app/plugins/watching.client.ts`; `app/returning.test.ts`; `browser/bubble-contrast.test.ts`; `browser/console-ids.test.ts`; `browser/dragselect-harness.ts`; `browser/holdmenu-harness.ts`; `browser/markdown.test.ts`; `browser/market-move-contrast.test.ts`; `browser/measure-source.ts`; `browser/measure.ts`; `browser/motion-harness.ts`; `browser/openings-harness.ts`; `browser/page-import-dom.test.ts`; `browser/shot.test.ts`; `browser/shot.ts`; `browser/skeleton.test.ts`; `i18n/` (2 files); `modules/dev-measure.ts`; `modules/shell-version.ts`; `public/icons/` (19 files); `public/sw.js`; `scripts/archive-shape.ts`; `scripts/icons.ts`; `scripts/interface-font.py`; `scripts/rooms.ts`; `scripts/turn.ts`; `scripts/user.ts`; `scripts/vapid.ts`; `server/api/account.post.ts`; `server/api/account/` (6 files); `server/api/auth/` (4 files); `server/api/avatars.get.ts`; `server/api/avatars/[kind]/[id].get.ts`; `server/api/control.get.ts`; `server/api/events.get.ts`; `server/api/media/[kind]/[chatId]/[messageId].get.ts`; `server/api/push.delete.ts`; `server/api/push.get.ts`; `server/api/push.post.ts`; `server/api/push/` (2 files); `server/api/tab-states/` (3 files); `server/middleware/account-session.ts`; `server/middleware/route-scope.ts`; `server/middleware/session-slide.ts`; `server/plugins/push.ts`; `server/plugins/registrations.ts`; `server/plugins/relays.ts`; `server/route-scope.test.ts`; `server/routes/manifest.webmanifest.get.ts`; `server/utils/accounts.ts`; `server/utils/app-manifest.ts`; `server/utils/avatars.test.ts`; `server/utils/avatars.ts`; `server/utils/bot-relay.ts`; `server/utils/build.ts`; `server/utils/console-events.ts`; `server/utils/control.test.ts`; `server/utils/control.ts`; `server/utils/db.test.ts`; `server/utils/db.ts`; `server/utils/fail.ts`; `server/utils/media.test.ts`; `server/utils/media.ts`; `server/utils/opened-routes.ts`; `server/utils/palettes.ts`; `server/utils/push.test.ts`; `server/utils/push.ts`; `server/utils/pushnews.test.ts`; `server/utils/pushnews.ts`; `server/utils/pushsweep.test.ts`; `server/utils/pushsweep.ts`; `server/utils/relays.test.ts`; `server/utils/relays.ts`; `server/utils/request.ts`; `server/utils/resolved-words.test.ts`; `server/utils/room-reach.test.ts`; `server/utils/room-reach.ts`; `server/utils/room-stream.test.ts`; `server/utils/room-stream.ts`; `server/utils/roomnews.test.ts`; `server/utils/roomnews.ts`; `server/utils/session-cookie.ts`; `server/utils/session-life.test.ts`; `server/utils/session-life.ts`; `server/utils/sse-frames.test.ts`; `server/utils/sse-frames.ts`; `server/utils/sw.test.ts`; `server/utils/tab-states.ts`; `server/utils/themes.ts`; `server/utils/todosearch.test.ts`; `server/utils/users.ts`; `server/utils/watching.ts`; `shared/auth.d.ts`; `shared/bmo-controls.test.ts`; `shared/bmo-controls.ts`; `shared/config.ts`; `shared/document-design.test.ts`; `shared/document-design.ts`; `shared/paths.test.ts`; `shared/paths.ts`; `shared/pinned-rooms.test.ts`; `shared/pinned-rooms.ts`; `shared/shell-version.ts`; `shared/wording.ts`; `shared/yaml.d.ts`.

How the shell stands here:

- **Its database is the server's.** `server/utils/db.ts` reaches the console's own tables in the server's
  PostgreSQL through Bun's SQL client and holds no statement on another unit's table; the old control port's
  uses are calls on the units' routes through `server/utils/units.ts` (`docs/boundary.md`, 「Calls the console
  makes」).
- **Written for it:** `shared/agent-names.ts`, the chat agent's name and label as the deployment sets them;
  `shared/text-marks.ts` over the data file `i18n/data/ko.yaml`, the Korean the code matches on;
  `server/utils/units.ts`, a unit's address, token and call; `server/utils/owner.ts`, the owner's private chat
  as the receiver answers it; `server/plugins/names.ts` and `app/plugins/names.ts`, which register the chat
  agent's names; `app/domain/settings-cells.ts`, the settings cells' shared classes; and among the tests
  `client/tests/support/web-database.ts` with its fixture `client/tests/fixtures/web-tables.sql`, a scratch
  database holding the console's tables, and `client/tests/support/browser-console.ts`, the console the
  console-driven browser tests drive.
- **Copied in from the old shared packages:** `shared/markdown-structure.ts` and `shared/web-address.ts`, the
  markdown reader's structure and an address's reading, from the old markup package.
- **Its fixtures:** a test's Korean input stands in `client/tests/fixtures/`, at the test's own path, read by
  key; `server/utils/media.test.ts` reads none, its case on the old roads file being the receiver's.

Of the 210, these are not carried here:

| Old member | Where it stands |
|---|---|
| `app/domain/settings.ts` | split: each settings section goes with the group whose screen it sets, and the cells' classes stand in `app/domain/settings-cells.ts` |
| `app/domain/finding-blocks.ts` | not carried: the bmo-artifact bundle draws a finding, and the shell's markdown reads none |
| `app/components/PalettePreview.vue` | with the receiver screens, build-11, at the same path: it draws a room's bubbles |
| `app/components/ItemTip.vue`, `app/domain/item-tips.ts`, `app/domain/item-tips.test.ts` | with the job screens, build-10, at the same path |
| `server/utils/todosearch.test.ts` | not carried: it searched the old archive's rows; the board's search over bmo-job's readings is held by `server/utils/todos.test.ts` |
| `app/domain/copy.test.ts` | the receiver screens, build-11, with the room copy `app/domain/copy.ts` loses; the shell keeps `copyText` alone |
| `server/utils/db.test.ts` | not carried: it carried the share links' table of the old archive file across a change of shape, and that table is bmo-artifact's; `client/tests/server/web-tables.test.ts` holds the console's tables |
| `browser/page-import-dom.test.ts` | not carried: it ran the old web layer's page reading, which is not this repository's |
| `app/returning.test.ts` | the agency screens, build-9, for its agents screen's cases; its mail and archive cases are bmo-mail's and bmo-artifact's, whose screens are not the shell's |
| `browser/market-move-contrast.test.ts` | not carried: it measured a finding's marks, which the bmo-artifact bundle draws |
| `server/plugins/registrations.ts`, the old `app/plugins/names.ts` | not carried: they registered the bot's names, archive seeds and providers for the bot's own modules, none of which the console loads; the names plugins above register the chat agent's names from the deployment's settings |
| `scripts/rooms.ts`, `scripts/archive-shape.ts`, `scripts/turn.ts` | not carried: each read the old archive's tables, which are other units' |
| `app/assets/fonts/NotoSansSymbols2-subset.woff2`, `app/assets/fonts/LICENSE-NotoSansSymbols2.txt` | with bmo-remote's screens, build-8: only the remote terminal drew those symbols |

The places in the shell that name a later group's file are cut here, and that group restores them:

- **The job screens (build-10):** stand again — the TODO panel's aside and drawer, the question bar, the TODO
  query, the item tips and the TODO choices of the settings (`app/domain/todo-settings.ts`, out of the old
  settings module). The push plugin's ringing of a question stays cut: it read every open question with its
  words, which no route serves (`docs/boundary.md`, 「Gaps the console meets」).
- **The receiver screens (build-11):** stand again — the rooms list in both layouts, the room jump group and
  `roomItems` of the screens, the palette preview, the opened room, image, link and picture routes, a sent
  attachment in the launch box, the turn actions' fold (`app/domain/turn-actions-fold.ts`, out of the old settings
  module) and the report copy (`app/domain/room-copy.ts`, out of the old copy module). `shared/briefings.ts` stays
  out: the voice briefings it read are the voice unit's, and the voice mark is the data file's.
- **The agency screens (build-9):** stand again — the sidebar's agent groups with their folds
  (`app/domain/agent-folds.ts`) and their live marks read from `/api/status`, the agents in the console search,
  the stream notice's link to the live screen, the agents and live screen entries, and the configuration's
  fallback modes and Laya road. The gate stages stay out, the gate unit's, and the job models' check is the
  job screens' to restore.
- **The ops screens (build-13):** stand again — the home page at `/`, `/api/deploy`, the deployment mark on the
  rooms page, the cache-siren and database entries, and their kept choices, carved out of the old settings module as
  `app/domain/siren-settings.ts` and `app/domain/db-settings.ts`.
- **The brain screens (build-12):** stand again — the documents and memories entries, and `DocumentToc.vue`, which
  the console's own document viewer uses.
- **The placeholders (build-8):** the graph, monitor, cards, gates and briefing entries stand again as
  placeholders (below, 「Screens of the units that ship no console bundle」); the mail, files, code and remote
  entries stand as their units' console bundles bring them. The briefing player and the stream's
  briefing-stop words are not carried. The mail notices' push kind is rung by the plugin that reads the mail
  bundle's declared stream, in the bundle's words.

### The agency screens (169 files)

Stands here as `client/apps/web/` at the same path, calling the agency over HTTP; a test under `client/tests/`. Carried by build-9 (agency screens).

`app/components/AgentGatesDialog.vue`; `app/components/AgentLogDialog.vue`; `app/components/AgentLogDiff.vue`; `app/components/AgentLogRow.test.ts`; `app/components/AgentLogRow.vue`; `app/components/AgentLogRowSkeleton.vue`; `app/components/AgentLogView.test.ts`; `app/components/AgentLogView.vue`; `app/components/AgentTurnFigures.test.ts`; `app/components/AgentTurnFigures.vue`; `app/components/AgentsAccounts.vue`; `app/components/AgentsBasePrompts.vue`; `app/components/AgentsCatalogue.vue`; `app/components/AgentsCompanions.vue`; `app/components/AgentsCoworkerLimits.vue`; `app/components/AgentsGates.vue`; `app/components/AgentsGeneral.vue`; `app/components/AgentsReasoning.vue`; `app/components/AgentsRegistry.vue`; `app/components/AgentsRegistrySkeleton.vue`; `app/components/AgentsRoles.vue`; `app/components/AgentsRouteTable.vue`; `app/components/AgentsSessions.vue`; `app/components/AgentsTierTable.vue`; `app/components/AgentsWorkers.vue`; `app/components/CompanionResetDialog.vue`; `app/components/CompanionSettingsBlock.vue`; `app/components/CompanionSettingsDialog.vue`; `app/components/ContextStateMark.test.ts`; `app/components/ContextStateMark.vue`; `app/components/CoworkerPoolBoard.vue`; `app/components/EngineHealthList.vue`; `app/components/ExecutionModelSelect.vue`; `app/components/GateSettingsDialog.vue`; `app/components/GenerationFields.vue`; `app/components/JobStatusLine.vue`; `app/components/LayaStatusLine.vue`; `app/components/LiveRunSkeleton.vue`; `app/components/MachineRoom.vue`; `app/components/PoolTile.vue`; `app/components/ResearchSettings.test.ts`; `app/components/ResearchSettings.vue`; `app/components/RoomCompanionTools.vue`; `app/components/RunSpend.vue`; `app/components/SessionResetStep.vue`; `app/components/SettingsResults.vue`; `app/components/StopConfirm.vue`; `app/components/TokenChip.vue`; `app/components/UsageMeters.test.ts`; `app/components/UsageMeters.vue`; `app/components/UsageSplit.test.ts`; `app/components/UsageSplit.vue`; `app/components/WatchDetail.vue`; `app/components/WatchFacts.vue`; `app/components/WorkerSettingsDialog.vue`; `app/domain/accounts.test.ts`; `app/domain/accounts.ts`; `app/domain/agent-settings.test.ts`; `app/domain/agent-settings.ts`; `app/domain/agents.test.ts`; `app/domain/agents.ts`; `app/domain/base-prompts.test.ts`; `app/domain/base-prompts.ts`; `app/domain/catalogue-models.ts`; `app/domain/catalogue.ts`; `app/domain/chips.test.ts`; `app/domain/chips.ts`; `app/domain/companions.test.ts`; `app/domain/companions.ts`; `app/domain/gate-order.test.ts`; `app/domain/gate-order.ts`; `app/domain/job-line.test.ts`; `app/domain/job-line.ts`; `app/domain/judgements.test.ts`; `app/domain/judgements.ts`; `app/domain/laya.test.ts`; `app/domain/laya.ts`; `app/domain/log.test.ts`; `app/domain/log.ts`; `app/domain/machine.test.ts`; `app/domain/machine.ts`; `app/domain/patch.test.ts`; `app/domain/patch.ts`; `app/domain/pool-board.test.ts`; `app/domain/pool-board.ts`; `app/domain/registry.test.ts`; `app/domain/registry.ts`; `app/domain/research-settings.ts`; `app/domain/research.test.ts`; `app/domain/research.ts`; `app/domain/row-drag.ts`; `app/domain/sessions.ts`; `app/domain/spans.test.ts`; `app/domain/spans.ts`; `app/domain/status.test.ts`; `app/domain/status.ts`; `app/domain/stopping.test.ts`; `app/domain/stopping.ts`; `app/domain/turns.test.ts`; `app/domain/turns.ts`; `app/domain/usage.test.ts`; `app/domain/usage.ts`; `app/domain/vitals.test.ts`; `app/domain/vitals.ts`; `app/domain/watches.test.ts`; `app/domain/watches.ts`; `app/pages/agents/` (4 files); `app/pages/live.test.ts`; `app/pages/live.vue`; `browser/agent-topbar.test.ts`; `server/api/agent-gate.post.ts`; `server/api/agent-reasoning.post.ts`; `server/api/agent-role.post.ts`; `server/api/agent-sampling.get.ts`; `server/api/agent-sampling.post.ts`; `server/api/agents.get.test.ts`; `server/api/agents.get.ts`; `server/api/agents/` (4 files); `server/api/base-prompts.get.ts`; `server/api/base-prompts.post.ts`; `server/api/companions.get.ts`; `server/api/companions.post.ts`; `server/api/companions/` (3 files); `server/api/coworker-pool.get.ts`; `server/api/fallback.get.ts`; `server/api/fallback.post.test.ts`; `server/api/fallback.post.ts`; `server/api/fallback/` (3 files); `server/api/keepalive.get.ts`; `server/api/keepalive.post.test.ts`; `server/api/keepalive.post.ts`; `server/api/model-tiers.get.ts`; `server/api/model-tiers.post.ts`; `server/api/model-catalogue.get.ts`; `server/api/model-catalogue.post.ts`; `server/api/model-tiers/models.get.ts`; `server/api/models.get.ts`; `server/api/models.post.ts`; `server/api/models/` (2 files); `server/api/research-settings.get.ts`; `server/api/research-settings.post.test.ts`; `server/api/research-settings.post.ts`; `server/api/run-stop.post.test.ts`; `server/api/run-stop.post.ts`; `server/api/session-reset.post.ts`; `server/api/sessions.get.ts`; `server/api/status.get.ts`; `server/api/usage.get.ts`; `server/api/workers/node.post.ts`; `server/utils/agentlog.test.ts`; `server/utils/agentlog.ts`; `server/utils/control-change.ts`; `server/utils/job-line.test.ts`; `server/utils/job-line.ts`; `server/utils/status.ts`; `server/utils/turns.test.ts`; `server/utils/turns.ts`; `server/utils/usage.test.ts`; `server/utils/usage.ts`; `shared/types.ts`.

`app/domain/chips.ts`, `app/domain/judgements.ts` and `app/domain/vitals.ts`, with their tests, were first sorted
with the receiver and ops screens; the agency screens read them, and they are the earliest group that does.
`shared/types.ts` stands with the shell, which carries the shapes every screen shares; the agency screens' shapes
are added to it.

How the agency screens stand here:

- **They call the agency, bmo-job, the receiver, bmo-artifact and the cache warmer** (`docs/boundary.md`, 「Calls
  the console makes」): `server/utils/agency.ts` the agency's routes with its codes, `server/utils/keepalive.ts`
  the warmer's round and subjects, `server/utils/research.ts` bmo-artifact's research settings,
  `server/utils/companions.ts` the receiver's companion add and remove, and the run stop bmo-job's `/run/stop`.
  The old control port's helper, `server/utils/control-change.ts`, is not carried: `server/utils/agency.ts`
  stands in its place.
- **The shapes they read are written here:** `shared/agency.ts`, the agency's answers, and `shared/research.ts`,
  bmo-artifact's research settings with the form's checks over the bounds that answer carries; the rest stand in
  `shared/types.ts` beside the shell's, the node unit's and the gate unit's among them.
- **Copied in from the old shared packages:** `shared/mcp-names.ts`, `app/domain/model-face.ts` and
  `app/domain/watch-name.ts`; and, out of modules of later groups the agency screens read,
  `app/domain/polling.ts` (the polling and the feed's edges, out of the room module), `app/domain/agent-folds.ts`
  (out of the old settings module) and the row drag's pointer rules, which `app/domain/row-drag.ts` now holds
  (out of the TODO module).
- **What no unit serves stands unavailable** (`docs/boundary.md`, 「Gaps the console meets」): the log across an
  agent's runs, the runs going beside the chat and what has just run but the jobs, usage, a turn's figures and
  what a running job has spent, the tools' icons; and of the units not yet split, Laya, the gate order and the
  nodes.
- **The Korean the tests feed in** stands in `client/tests/fixtures/` at each test's own path; the branch word a
  run's name is filed under stands in the data file beside the pack. The tests stand the units in on loopback
  ports (`client/tests/support/units.ts`), with Nitro's own imports in place (`client/tests/support/nitro.ts`),
  a gate order and an agent's conversation of their own (`client/tests/support/gate-order.ts`,
  `client/tests/support/conversation.ts`).

Of these, not carried here:

| Old member | Where it stands |
|---|---|
| `server/utils/status.ts` | not carried: it read the executions, gate runs, runner and job records, watches, the machine's standing and the nodes out of the old archive; the job records are read through bmo-job's `GET /jobs/recent`, and the rest no unit serves (`docs/boundary.md`, 「Gaps the console meets」) |
| `server/utils/usage.ts`, `server/utils/usage.test.ts` | not carried: they read the usage rows and sessions of the old archive, which no unit serves |
| `server/utils/turns.ts`, `server/utils/turns.test.ts` | not carried: they read a turn's roads and spend out of the old archive, which no unit serves |
| `server/utils/job-line.ts`, `server/utils/job-line.test.ts` | not carried: they read a worker's job out of bmo-job's tables and the agency's transcripts; `server/utils/job-runs.ts` reads the job line, its prompt and the jobs that have just run through bmo-job's routes, held by `server/api/agent-job.get.test.ts` |
| `server/utils/control-change.ts` | not carried: `server/utils/agency.ts` stands in its place |
| `server/utils/agentlog.test.ts` | rewritten: the log is read through the agency's run log, so the test stands the agency in |
| the agency route tests (`server/api/agents.get.test.ts`, `fallback.post.test.ts`, `keepalive.post.test.ts`, `research-settings.post.test.ts`, `run-stop.post.test.ts`) | rewritten onto stood-in units, each refusal said by the pack's sentence |
| the cross-checks of `app/domain/spans.test.ts` and `app/domain/status.test.ts` against the old packages' sources | not carried: another unit's files are never read; the branch word and the endings are held to the data file and to a list of the test's own |

The places in the agency screens that name a later group's file are cut here, and that group restores them:

- **The receiver screens (build-11):** stand again — the rooms an agent's sessions are titled and ranked by, in the
  sidebar and on the agents screen; the read-now mark in a room's turn actions; and the room module and its page
  take the polling and the feed's edges from `app/domain/polling.ts`. The voice briefing's switch is the receiver's,
  which reads it by no route, so its section stands unavailable.
- **The job screens (build-10):** stand again — the TODO module and its panel take the row drag's pointer rules
  from `app/domain/row-drag.ts`.

### The job screens (53 files)

Stands here as `client/apps/web/` at the same path, calling bmo-job over HTTP; a test under `client/tests/`. Carried by build-10 (job screens).

`app/components/BuilderResult.vue`; `app/components/LaunchPrompt.test.ts`; `app/components/LaunchPrompt.vue`; `app/components/QuestionAsk.vue`; `app/components/QuestionBar.vue`; `app/components/TodoInstruction.vue`; `app/components/TodoItemDetail.vue`; `app/components/TodoOpenButton.vue`; `app/components/TodoPanel.test.ts`; `app/components/TodoPanel.vue`; `app/components/TodoRowSkeleton.vue`; `app/components/TodoTime.vue`; `app/components/TodoUnapproveStep.vue`; `app/components/WorkOrderPanel.test.ts`; `app/components/WorkOrderPanel.vue`; `app/components/WorkTaskDialog.test.ts`; `app/components/WorkTaskDialog.vue`; `app/domain/questions.test.ts`; `app/domain/questions.ts`; `app/domain/todos.test.ts`; `app/domain/todos.ts`; `app/domain/work-translation.test.ts`; `app/domain/work-translation.ts`; `app/domain/workorder.test.ts`; `app/domain/workorder.ts`; `server/api/deploy-hold-release.post.ts`; `server/api/launch.post.ts`; `server/api/question-pause.post.ts`; `server/api/questions.get.ts`; `server/api/questions.post.ts`; `server/api/queue-pause.post.test.ts`; `server/api/queue-pause.post.ts`; `server/api/todos.get.ts`; `server/api/todos.post.test.ts`; `server/api/todos.post.ts`; `server/api/todos/` (10 files); `server/api/worker-word.post.test.ts`; `server/api/worker-word.post.ts`; `server/api/workers.post.ts`; `server/utils/todos.test.ts`; `server/utils/todos.ts`; `server/utils/work-order-view.ts`; `server/utils/work-text.test.ts`; `server/utils/work-text.ts`.

How the job screens stand here:

- **They call bmo-job** (`docs/boundary.md`, 「Calls the console makes」) through `server/utils/job.ts`, with its
  refusal codes in `server/utils/job-codes.ts`, each said by the pack's sentence for it. `server/utils/todos.ts`
  reads the board and an item out of bmo-job's listings and readings into the rows the panel shows, and
  `server/utils/work-order-view.ts` reads an item's work order; neither holds a statement on bmo-job's tables.
- **They read back on bmo-job's events,** which the shell's relay (`server/utils/bot-relay.ts`) carries beside the
  receiver's from a cursor of their own, with the agency's turns; `app/domain/unit-events.ts`, written new, reads
  both into the console's events.
- **What bmo-job's readings do not carry stands empty** (`docs/boundary.md`, 「Gaps the console meets」): a row's
  room, brief, filing and finishing moments, its order's progress, stop and held checkout, its job's wait and
  the deployment's wait on it; an item's approvals and its talk's turns; the questions list, so the question bar
  and the question card stand with none; a task's end; and a work order's translation, bmo-gate's.
- **Copied in from the old shared packages:** `shared/todo-blocks.ts`, `shared/ran-model.ts` and
  `shared/work-time.ts`, out of the old job package, and `app/domain/queue-place.ts`, its words for a stopped
  order's place and a held row said through the pack; the work-order shapes stand in `shared/types.ts`. Out of
  modules of later groups the job screens read: `shared/translation.ts` and `shared/translation-parts.ts`, the
  cutting of a text for the translator (listed with the brain screens, whose document viewer reads them too; their
  test comes with that group); the deployment hold's
  line, `holdWaits`, into `app/domain/queue-place.ts`; and a language's name, `languageName`, into
  `app/domain/work-translation.ts`. The job models' check the agency screens left to this group stays out: no
  member of it reads one.
- **The launch box stands on the room's composer,** `app/components/ChatComposer.vue`, which comes with the
  receiver screens; until it does, the box draws nothing. The room list and the owner the panel names a request
  and its own room by, `/api/rooms` and `/api/owner`, come with the receiver screens too; until then a request is
  named by its requester alone. The deployment's hold opens the title bar's deployment popover, which comes with
  the ops screens.
- **Every sentence a person reads stands in the pack:** the block heads bmo-job writes an instruction in, the
  phases a job's time is divided into, the held words and a stopped order's place, what came of telling the
  queue and why a talk's turn went unanswered. The branch word a co-work span is filed under is bmo-job's own,
  `branch`, in the data file. The tests stand bmo-job in on a loopback port, and their Korean stands in
  `client/tests/fixtures/` at each test's own path.

Of these, not carried here:

| Old member | Where it stands |
|---|---|
| `server/utils/work-text.ts`, `server/utils/work-text.test.ts` | not carried: they read a work order's text out of the old archive to translate it, which is bmo-gate's |
| `server/utils/todos.test.ts`, the route tests (`server/api/queue-pause.post.test.ts`, `todos.post.test.ts`, `worker-word.post.test.ts`) | rewritten onto a stood-in bmo-job, each refusal said by the pack's sentence for its code |
| the cross-check of `app/domain/todos.test.ts` against the old sources' phase words, and its instructions composed by the old job package | not carried: another unit's files are never read; the phases and the block heads are bmo-job's as its documents state them |
| the room screen's check in `app/domain/questions.test.ts` and the deployment mark's in `app/components/TodoPanel.test.ts` | stand again with the receiver screens, build-11, and the ops screens, build-13, whose files they read |

### The receiver screens (136 files)

Stands here as `client/apps/web/` at the same path, calling the receiver over HTTP; a test under `client/tests/`. Carried by build-11 (receiver screens).

`app/components/AlbumMosaic.vue`; `app/components/BubbleTail.vue`; `app/components/ChatComposer.vue`; `app/components/ContextChip.vue`; `app/components/JudgementChips.test.ts`; `app/components/JudgementChips.vue`; `app/components/LineChip.test.ts`; `app/components/LineChip.vue`; `app/components/LinkPreviews.vue`; `app/components/ListeningLine.vue`; `app/components/MessageImage.vue`; `app/components/MessageVideo.vue`; `app/components/RoomDayPicker.vue`; `app/components/RoomMessage.test.ts`; `app/components/RoomMessage.vue`; `app/components/RoomMessageSkeleton.vue`; `app/components/RoomPictureViewer.vue`; `app/components/RoomQuote.vue`; `app/components/RoomRemovalDialog.vue`; `app/components/RoomSenderRun.vue`; `app/components/RoomStats.vue`; `app/components/RoomWork.test.ts`; `app/components/RoomWork.vue`; `app/components/RunProgress.test.ts`; `app/components/RunProgress.vue`; `app/components/SettingsBriefing.vue`; `app/components/SidebarRooms.vue`; `app/components/TelegramAsset.vue`; `app/components/TelegramText.vue`; `app/components/TurnActions.vue`; `app/components/TurnOpening.test.ts`; `app/components/TurnOpening.vue`; `app/components/TurnRecords.vue`; `app/domain/album.test.ts`; `app/domain/album.ts`; `app/domain/attachments.test.ts`; `app/domain/attachments.ts`; `app/domain/bottom.ts`; `app/domain/bubble-fit.ts`; `app/domain/drafts.test.ts`; `app/domain/drafts.ts`; `app/domain/expressions.test.ts`; `app/domain/expressions.ts`; `app/domain/first-line.ts`; `app/domain/flight.test.ts`; `app/domain/flight.ts`; `app/domain/gallery.test.ts`; `app/domain/gallery.ts`; `app/domain/messagemenu.test.ts`; `app/domain/messagemenu.ts`; `app/domain/outbox-store.ts`; `app/domain/outbox.test.ts`; `app/domain/outbox.ts`; `app/domain/pasted.test.ts`; `app/domain/pasted.ts`; `app/domain/picture-shapes.ts`; `app/domain/read-marks.test.ts`; `app/domain/read-marks.ts`; `app/domain/room-feed.test.ts`; `app/domain/room-list.test.ts`; `app/domain/room-list.ts`; `app/domain/room-removal.test.ts`; `app/domain/room-removal.ts`; `app/domain/room-window.test.ts`; `app/domain/room-window.ts`; `app/domain/room.test.ts`; `app/domain/room.ts`; `app/domain/roomstats.test.ts`; `app/domain/roomstats.ts`; `app/domain/tapfocus.ts`; `app/domain/working.test.ts`; `app/domain/working.ts`; `app/pages/rooms/[chatId].vue`; `browser/bottom.test.ts`; `browser/bubble-fit.test.ts`; `browser/bubble-wrap.test.ts`; `browser/flight-layer.test.ts`; `browser/flight-meta.test.ts`; `browser/meta-inline.test.ts`; `browser/outbox-store.test.ts`; `browser/prompt-wrap.test.ts`; `browser/room-feed-gap.test.ts`; `browser/tapfocus-touch.test.ts`; `server/api/briefing/read.post.ts`; `server/api/images/[chatId]/[messageId].get.ts`; `server/api/owner.get.ts`; `server/api/rooms.get.ts`; `server/api/rooms/` (15 files); `server/api/tool-icons.get.ts`; `server/api/voice-briefing.get.ts`; `server/api/voice-briefing.post.test.ts`; `server/api/voice-briefing.post.ts`; `server/utils/actions.test.ts`; `server/utils/actions.ts`; `server/utils/archive.test.ts`; `server/utils/archive.ts`; `server/utils/chat-tool-facts.ts`; `server/utils/images.ts`; `server/utils/message-media.ts`; `server/utils/openings.test.ts`; `server/utils/openings.ts`; `server/utils/roads.test.ts`; `server/utils/roads.ts`; `server/utils/room-links.ts`; `server/utils/room-pictures.ts`; `server/utils/room-reads.test.ts`; `server/utils/room-reads.ts`; `server/utils/room-window.ts`; `server/utils/roomstats.test.ts`; `server/utils/roomstats.ts`; `server/utils/send-keys.test.ts`; `server/utils/send-keys.ts`; `server/utils/spends.test.ts`; `server/utils/spends.ts`; `shared/briefings.test.ts`; `shared/briefings.ts`; `shared/gate-roads.test.ts`; `shared/gate-roads.ts`; `shared/links.test.ts`; `shared/links.ts`; `shared/read-place.ts`; `shared/spoken.ts`.

How the receiver screens stand here:

- **They call the receiver** (`docs/boundary.md`, 「Calls the console makes」) through `server/utils/receiver.ts`,
  written new, with its refusal codes, each said by the pack's sentence for it. `server/utils/archive.ts` reads the
  rooms and a room's line from the receiver's console routes into the shapes the room screen draws, asking once a
  sender on a page whether it is an agent's; `server/utils/room-reads.ts` keeps the read marks in the console's own
  `web_room_reads` and counts on the receiver's line past them; the sends, a room's removal and what opened a turn
  go to the receiver's own routes. The voice briefing is served by no route, so its switch and a line's reading
  stand unavailable. No statement of theirs reads another unit's table.
- **A message's files and photos, a room's pictures, its figures and the chat agent's window there** come from the
  receiver's console routes: a file's bytes and a photo handed on whole through `unitBytes` in
  `server/utils/units.ts`, under the types `server/utils/media.ts` holds each kind to.
- **What no unit serves stands empty** (`docs/boundary.md`, 「Gaps the console meets」): a link's preview, the
  judgements beside a page, a round's figures and actions, a line's voice briefing, and an agent's runs and tokens
  in a room. A room is pinned and let go from its screen's menu, which the old console did not offer, through the
  receiver's routes for the pinned order.
- **Written new:** `server/utils/receiver.ts`; `server/api/rooms/[chatId]/pin.post.ts`, the pin;
  `app/domain/room-copy.ts` and `app/domain/turn-actions-fold.ts`, the
  parts of the old copy and settings modules the room screen reads; `shared/particles.ts`, the subject particle a
  name from another unit takes, its two forms in the data file. `app/components/PalettePreview.vue` comes from the
  shell's list. The marks a message's text opens with for what it carried, the service's notice mark and the paste
  mark stand in the data file beside the pack, read in `shared/text-marks.ts`.
- **The chat agent is named by its role** in code, tests and comments, and by the deployment's settings where a room
  falls back to it; the old fixed sender name is not carried. The tests stand the receiver in on a loopback port,
  and their Korean stands in `client/tests/fixtures/` at each test's own path.

Of these, not carried here:

| Old member | Where it stands |
|---|---|
| `server/utils/actions.ts`, `server/utils/actions.test.ts`, `server/utils/chat-tool-facts.ts` | not carried: they read a turn's records and the tool host's facts, which no route serves |
| `server/utils/spends.ts`, `server/utils/spends.test.ts` | not carried: they read a round's usage rows, which no route serves |
| `server/utils/roads.ts`, `server/utils/roads.test.ts`, `shared/gate-roads.ts`, `shared/gate-roads.test.ts` | not carried: the roads a judgement's run walked are the gate's |
| `server/utils/roomstats.ts`, `server/utils/roomstats.test.ts`, `server/utils/room-window.ts`, `server/utils/room-pictures.ts` | not carried: they counted and read the old archive; the receiver counts a room's figures and serves its window and its pictures, which the routes read through `server/utils/receiver.ts` |
| `server/utils/images.ts` | not carried: it read a photo off the disk; the receiver serves a message's picture, which the photo route hands on |
| `shared/briefings.ts`, `shared/briefings.test.ts` | not carried: a line's voice briefing is the voice unit's |
| `shared/spoken.ts` | not carried: the receiver's pages leave out what no person said |
| `app/components/SettingsBriefing.vue` | not carried: it placed the voice briefing player, which the console does not carry |
| `server/utils/archive.test.ts`, `server/utils/room-reads.test.ts`, `server/utils/openings.test.ts`, `server/api/voice-briefing.post.test.ts` | rewritten onto a stood-in receiver, each refusal said by the pack's sentence for its code |
| `server/utils/message-media.ts` | carried, rewritten onto the receiver's list of a message's files and the metadata it arrived with, asked only of a message whose page names a file |

### The brain screens (39 files)

Stands here as `client/apps/web/` at the same path, calling the brain over HTTP; a test under `client/tests/`. Carried by build-12 (brain screens).

`app/components/DocumentPane.vue`; `app/components/DocumentReader.vue`; `app/components/DocumentSeek.vue`; `app/components/DocumentSide.vue`; `app/components/DocumentTalk.vue`; `app/components/DocumentToc.vue`; `app/components/DocumentTree.vue`; `app/components/MemoryActiveSwitch.vue`; `app/components/MemoryCondition.vue`; `app/components/MemoryDetail.vue`; `app/components/MemoryWatch.vue`; `app/domain/documents.test.ts`; `app/domain/documents.ts`; `app/domain/memories.ts`; `app/pages/documents.test.ts`; `app/pages/documents.vue`; `app/pages/memories.test.ts`; `app/pages/memories.vue`; `server/api/documents/` (9 files); `server/api/memories.get.ts`; `server/api/memories.post.ts`; `server/utils/document-fragments.test.ts`; `server/utils/document-fragments.ts`; `server/utils/document-records.ts`; `server/utils/document-request.ts`; `server/utils/documents.test.ts`; `server/utils/documents.ts`; `server/utils/memories.test.ts`; `server/utils/memories.ts`; `shared/translation.test.ts`; `shared/translation.ts`.

How the brain screens stand here:

- **The memories screen calls the brain** (`docs/boundary.md`, 「Calls the console makes」) through
  `server/utils/brain.ts`, written new, with the brain's codes, each said by the pack's sentence for it. A row is
  read by what the agency calls its agent, by what the receiver calls its room and its people and by the message
  the receiver keeps; the watch serving a row is served by no route and stands empty.
- **The document viewer's roots are checkouts a setting names,** `DOCUMENT_ROOTS`: each one's `docs/` and the
  upper-case markdown at its top. The brain's library and the agency's documents stand in the list unread, and
  neither unit's folders are read. `server/utils/documents.ts` is rewritten on those roots; the seek indexes and
  the seek gate's three steps are not carried, since the gate is the gate unit's, and a question is answered by the
  documents' own text. A fragment is the brain's row, matched by the file its path names under a root, its kind
  called by the brain's label for it.
- **The talk about a document** that `server/utils/document-records.ts` read stands as
  `server/utils/document-talk.ts`, on the console's own `document_talk` (「The tables」 below; build-18): the console
  writes the owner's words as they are sent, hands the turn to the receiver's `POST /talks` and writes the chat
  agent's answer as it comes, holding which talk is being answered, and tells every tab that the talk moved.
- **A translation stands unavailable:** the translator is the gate unit's, so both translation routes answer as
  unavailable and the toggle says why.
- **Korean and names:** the seek index's Korean root descriptions went with the index; the tests' Korean stands in
  `client/tests/fixtures/` at each test's own path, and their names are neutral.

Of these, not carried here:

| Old member | Where it stands |
|---|---|
| `server/utils/document-records.ts` | not carried: the talk it read is `server/utils/document-talk.ts`'s; the group names it read were the brain's roots', which stand unread; the translations it read are the gate unit's |
| `server/utils/memories.test.ts`, `server/utils/documents.test.ts`, `server/utils/document-fragments.test.ts` | rewritten onto stood-in units and checkouts of their own |

### The home, cache-siren, deployment and database screens (33 files)

Stands here as `client/apps/web/` at the same path; a test under `client/tests/`. Carried by build-13 (ops screens).

`app/components/AgentVitals.vue`; `app/components/DbRowDialog.vue`; `app/components/DbRows.test.ts`; `app/components/DbRows.vue`; `app/components/DeployMark.test.ts`; `app/components/DeployMark.vue`; `app/components/SirenRowSkeleton.vue`; `app/domain/dbview.test.ts`; `app/domain/dbview.ts`; `app/domain/deploy.test.ts`; `app/domain/deploy.ts`; `app/domain/siren.test.ts`; `app/domain/siren.ts`; `app/pages/db.vue`; `app/pages/index.test.ts`; `app/pages/index.vue`; `app/pages/siren.test.ts`; `app/pages/siren.vue`; `browser/topbar-square.test.ts`; `server/api/db/` (4 files); `server/api/deploy.get.ts`; `server/api/deploy/log.get.ts`; `server/api/siren.get.ts`; `server/plugins/deploy.ts`; `server/utils/dbview.test.ts`; `server/utils/dbview.ts`; `server/utils/deploy.test.ts`; `server/utils/deploy.ts`; `server/utils/siren.test.ts`; `server/utils/siren.ts`.

How the ops screens stand here:

- **The home page** stands the rooms the receiver lists and the agents of the agency's catalogue, the gates among
  them in the catalogue's order; the old gate list (`app/domain/gates.ts`) is the gate unit's and is not read. The
  chat agent is known by the name the deployment registers.
- **The cache siren screen** reads the siren's `GET /stats` and `GET /events` at `CACHE_SIREN_ADDRESS`. The sessions
  each agent held and the moves of a cache prefix stood in the old archive and are the agency's now, served by no
  route, so a request is named only by the siren's row or a runner's directory and carries no cause.
- **The deployment mark** reads the testbed's progress record at `DEPLOY_PROGRESS_FILE`, in the shape the testbed
  writes it (`shared/deploy-progress.ts`, written new for the record's stages, steps and ending), and the deployment's
  hold from bmo-job's `GET /queue/holds`. The old record's items and its reasons' codes are not the testbed's, so a
  run's popover lists no items and a stopped run says its outcome alone.
- **The DB screen** reads the server's own database alone, on PostgreSQL, in read-only transactions run by a process
  of its own; the old SQLite reading is not carried. It withholds the console's account hashes and push keys and
  sumida's users' passwords and keys.
- **Korean and names:** the tests' Korean stands in `client/tests/fixtures/` at each test's own path, their names and
  paths are neutral, and pack sentences that named the agent now name the chat agent by its role or its label.

Of these, not carried here:

| Old member | Where it stands |
|---|---|
| `server/utils/dbview.test.ts`, `server/utils/siren.test.ts`, `server/utils/deploy.test.ts` | rewritten onto a scratch PostgreSQL database, a stood-in siren and bmo-job, and progress records in the testbed's shape |

### The console's user unit (1 files)

Stands here as `deploy/`. Carried by build-14 (deployment).

`bmo-web.service`.

It stands as `deploy/bmo-web.service`, run out of this repository's deploy tree with its environment linked from
the data root's `env/web-console.env`, and restarted by every deployment before the server. Beside it, written new,
stands `deploy/bmo-web-server.service`, the server's unit, which the old repository ran inside its bot's binary; the
deployment waits on it through the new `bmo-web-server health`.

### Already in bmo-ui (165 files)

Stands here as not carried: the same module from the bmo-ui layer, which kept code imports by the package's path. Carried by build-6 (console workspace).

What kept code takes from these was read off every one of the 609 kept code files, its imports by the TypeScript
compiler and its templates' components by Vue's, against what bmo-ui's sources at its packed version export:

- **Modules:** kept code imports from 38 of bmo-ui's modules, 35 under `app/domain/` and 3 under `shared/`, and
  bmo-ui exports every name it imports but two, `COUNT_LOCALE` and `mediaUrl`, whose modules stay the shell's
  (above). It also imports the browser tests' touch harness, which stays the shell's too.
- **Components:** kept templates use 35 of them, and bmo-ui registers each by the same name.
- **The rest** are bmo-ui's own tests, its page plugins, its stylesheet's fonts and the modules only other
  modules of the layer use, which no kept file names.

`app/app.config.test.ts`; `app/assets/css/fonts.test.ts`; `app/assets/fonts/CaskaydiaCoveNFM-Regular.subset.woff2`; `app/assets/fonts/LICENSE-CaskaydiaCove.txt`; `app/assets/fonts/LICENSE-Pretendard.txt`; `app/assets/fonts/Pretendard-Bold.gap.woff2`; `app/assets/fonts/Pretendard-Medium.gap.woff2`; `app/assets/fonts/Pretendard-Regular.gap.woff2`; `app/assets/fonts/Pretendard-SemiBold.gap.woff2`; `app/components/ActionGroup.vue`; `app/components/AudioPlayer.vue`; `app/components/ChooseAll.vue`; `app/components/ColumnResizeHandle.vue`; `app/components/ContentSkeleton.vue`; `app/components/CutLineTip.vue`; `app/components/DataTable.test.ts`; `app/components/DataTable.vue`; `app/components/DataTableSkeleton.vue`; `app/components/FilesConflictDialog.vue`; `app/components/FilesNameField.vue`; `app/components/FilesProgress.vue`; `app/components/FilesText.vue`; `app/components/GrowingTextarea.test.ts`; `app/components/GrowingTextarea.vue`; `app/components/HintTip.test.ts`; `app/components/HintTip.vue`; `app/components/ImageViewer.vue`; `app/components/LoadingImage.vue`; `app/components/LoadingVideo.vue`; `app/components/MarqueeLine.vue`; `app/components/MessageIsland.test.ts`; `app/components/MessageIsland.vue`; `app/components/MovingList.vue`; `app/components/NumberInput.vue`; `app/components/PaletteSwatch.vue`; `app/components/PropertyList.vue`; `app/components/RollingNumber.vue`; `app/components/RollingSentence.vue`; `app/components/ScreenFrame.vue`; `app/components/SearchHit.vue`; `app/components/SearchText.vue`; `app/components/SettingsDialog.vue`; `app/components/SettingsGroup.vue`; `app/components/SettingsRow.vue`; `app/components/SettingsSegment.vue`; `app/components/ShellClose.vue`; `app/components/SkeletonBar.vue`; `app/components/SkeletonLine.vue`; `app/components/SkeletonStatus.vue`; `app/components/SkeletonText.vue`; `app/components/SteadyFigure.vue`; `app/components/TabBar.test.ts`; `app/components/TabBar.vue`; `app/components/TabSlide.vue`; `app/components/TabSwitch.vue`; `app/components/ThemePreview.vue`; `app/components/ThemeSwatch.vue`; `app/components/ToolBar.test.ts`; `app/components/ToolBar.vue`; `app/domain/actionbar.test.ts`; `app/domain/actionbar.ts`; `app/domain/bars.test.ts`; `app/domain/bars.ts`; `app/domain/chooseall.test.ts`; `app/domain/chooseall.ts`; `app/domain/closing.test.ts`; `app/domain/closing.ts`; `app/domain/code-colour.ts`; `app/domain/code-copy.ts`; `app/domain/code-themes.test.ts`; `app/domain/code-themes.ts`; `app/domain/column-widths.test.ts`; `app/domain/column-widths.ts`; `app/domain/cut-lines.ts`; `app/domain/diagram.ts`; `app/domain/dialog-origin.test.ts`; `app/domain/dialog-origin.ts`; `app/domain/dragselect.test.ts`; `app/domain/dragselect.ts`; `app/domain/errors.ts`; `app/domain/file-icons.test.ts`; `app/domain/file-icons.ts`; `app/domain/foot.test.ts`; `app/domain/foot.ts`; `app/domain/form-save.ts`; `app/domain/fullscreen.ts`; `app/domain/holdmenu.ts`; `app/domain/icon-styles.test.ts`; `app/domain/icon-styles.ts`; `app/domain/island.test.ts`; `app/domain/island.ts`; `app/domain/layers.test.ts`; `app/domain/layers.ts`; `app/domain/list-place.test.ts`; `app/domain/list-place.ts`; `app/domain/list-preview.test.ts`; `app/domain/list-preview.ts`; `app/domain/loading.test.ts`; `app/domain/loading.ts`; `app/domain/longpress.test.ts`; `app/domain/longpress.ts`; `app/domain/marquee.test.ts`; `app/domain/marquee.ts`; `app/domain/modality.test.ts`; `app/domain/modality.ts`; `app/domain/monaco.ts`; `app/domain/moving-list.ts`; `app/domain/numbers.test.ts`; `app/domain/openings.ts`; `app/domain/overlays.test.ts`; `app/domain/overlays.ts`; `app/domain/player.test.ts`; `app/domain/prompt.test.ts`; `app/domain/prompt.ts`; `app/domain/scheme.ts`; `app/domain/screen.test.ts`; `app/domain/screen.ts`; `app/domain/scroll-within.ts`; `app/domain/side-parts.ts`; `app/domain/sound-tap.ts`; `app/domain/tab-slide.ts`; `app/domain/table-sections.test.ts`; `app/domain/table-sections.ts`; `app/domain/tabs.test.ts`; `app/domain/tabs.ts`; `app/domain/time.test.ts`; `app/domain/time.ts`; `app/domain/tooltip.ts`; `app/domain/waveform.test.ts`; `app/domain/waveform.ts`; `app/domain/zoom.test.ts`; `app/domain/zoom.ts`; `app/focus.test.ts`; `app/motion.test.ts`; `app/onscreen.test.ts`; `app/plugins/dialog-origin.client.ts`; `app/plugins/fullscreen.client.ts`; `app/plugins/icon-styles.client.ts`; `app/plugins/input-modality.client.ts`; `app/plugins/overlays.client.ts`; `app/plugins/painted.client.ts`; `app/selection.test.ts`; `app/skeletons.test.ts`; `app/ticking.test.ts`; `browser/badge-contrast.test.ts`; `browser/code-colour.test.ts`; `browser/code-copy.test.ts`; `browser/cut-lines.test.ts`; `browser/diagram.test.ts`; `browser/dragselect-touch.test.ts`; `browser/focus-ring.test.ts`; `browser/fullscreen.test.ts`; `browser/holdmenu-touch.test.ts`; `browser/interface-font.test.ts`; `browser/measure.test.ts`; `browser/motion.test.ts`; `browser/openings.test.ts`; `browser/scroll-within.test.ts`; `browser/touch.test.ts`; `shared/palettes.test.ts`; `shared/palettes.ts`; `shared/search.test.ts`; `shared/search.ts`; `shared/themes.test.ts`; `shared/themes.ts`.

### Already in a unit's console bundle (58 files of the artifact bundle)

Stands here as not carried: each bundle the console extends carries its own files, and its screens call their unit
through the console's relay. The files below are bmo-artifact's, whose bundle the console also extends. Carried by build-6 (console workspace).

`app/components/ArchiveAttachments.vue`; `app/components/ArchiveBody.test.ts`; `app/components/ArchiveBody.vue`; `app/components/ArchivePageFrame.vue`; `app/components/ArchiveRowSkeleton.vue`; `app/components/ArchiveShareDialog.vue`; `app/components/ArchiveSourceItem.vue`; `app/components/ArchiveSources.vue`; `app/components/ArchiveTextPreview.vue`; `app/components/DocumentPictureViewer.vue`; `app/components/FindingFold.vue`; `app/components/FindingGallery.vue`; `app/components/FindingMap.vue`; `app/components/HostedPageFrame.vue`; `app/components/ShareLinkDialog.test.ts`; `app/components/ShareLinkDialog.vue`; `app/domain/archive.test.ts`; `app/domain/archive.ts`; `app/domain/document-pictures.ts`; `app/domain/share-links.ts`; `app/pages/archive/` (3 files); `app/pages/share/[token].vue`; `browser/document-pictures.test.ts`; `server/api/archive/` (11 files); `server/api/share/[token]/` (6 files); `server/api/share/share.test.ts`; `server/middleware/moved-screens.ts`; `server/utils/card-picture.ts`; `server/utils/hosted-page.test.ts`; `server/utils/hosted-page.ts`; `server/utils/moved-screens.test.ts`; `server/utils/moved-screens.ts`; `server/utils/page-bridges.ts`; `server/utils/search-shares.test.ts`; `server/utils/search-shares.ts`; `server/utils/searches.test.ts`; `server/utils/searches.ts`; `shared/document-pictures.test.ts`; `shared/document-pictures.ts`; `shared/share-head.test.ts`; `shared/share-head.ts`.

### Screens of the units that ship no console bundle (92 files)

The files of bmo-graph, bmo-gate and bmo-voice are not carried: each unit's own console bundle carries its
screen when it publishes one. Until then the console shows a placeholder in the screen's place (build-8;
`docs/boundary.md`, 「Screens of units not yet split」), from these files written for it:

- `client/apps/web/app/components/ScreenPlaceholder.vue`, the one placeholder page body: the screen's name and
  icon, and the pack's `screens.message.not_available`. Each unit's entry stands in `app/domain/screens.ts`,
  marked as a placeholder, with its label in the pack under `screens.label`.
- One page to a unit, holding the placeholder alone: `app/pages/graph.vue`, `app/pages/gates/[...path].vue` and
  `app/pages/briefing.vue`. Where one stands at an old member's path, it is this placeholder and not that member.
- `client/tests/app/pages/placeholders.test.ts`, rendering each placeholder page through Vue's own compiler
  and server renderer with `client/tests/support/render-page.ts`.

The monitor screen of bmo-node and the card board of bmo-arbiter are carried as the monitor screen's two tabs
(`docs/web.md`, 「Monitor screen」): the components, the domain modules and their tests as they stood, the monitor
page with a machine's own monitor below it at `/monitor/<machine>`, and `/cards` sending a reader on to the
services tab; the console's server reads the node service and the card master over their APIs instead of the old
archive, live record and the master's old state route, and the shapes the screen draws are copied into
`shared/hardware.ts` and `shared/cards.ts`. The node screen, the node list in the sidebar and a node's check are
not carried.

The old pages below the addresses that are not carried — a node's own page at `/nodes/{name}`, a shared
folder's page at `/share/files/{token}` — stand as no page, and a link to one finds none.

- **bmo-mail (113 files), carried by bmo-mail's console bundle:** `app/components/MailAddressField.vue`; `app/components/MailAvatar.vue`; `app/components/MailBody.vue`; `app/components/MailComposeForm.vue`; `app/components/MailComposer.vue`; `app/components/MailEditor.vue`; `app/components/MailEditorSkeleton.vue`; `app/components/MailLabelChoice.vue`; `app/components/MailList.vue`; `app/components/MailMessageCard.vue`; `app/components/MailNav.vue`; `app/components/MailNavEntry.test.ts`; `app/components/MailNavEntry.vue`; `app/components/MailRow.vue`; `app/components/MailSettingsBody.vue`; `app/components/MailThread.vue`; `app/domain/mail-api.ts`; `app/domain/mail-body.ts`; `app/domain/mail-editor-load.test.ts`; `app/domain/mail-editor-load.ts`; `app/domain/mail-editor.test.ts`; `app/domain/mail-editor.ts`; `app/domain/mail-fit.ts`; `app/domain/mail-frame.test.ts`; `app/domain/mail-frame.ts`; `app/domain/mail-notice.test.ts`; `app/domain/mail-notice.ts`; `app/domain/mail-summary.test.ts`; `app/domain/mail-summary.ts`; `app/domain/mail.test.ts`; `app/domain/mail.ts`; `app/pages/mail/[...path].vue`; `browser/mail-body.test.ts`; `scripts/mail-bench.test.ts`; `scripts/mail-bench.ts`; `server/api/mail/` (37 files); `server/plugins/mail.ts`; `server/utils/mail/` (39 files); `shared/mail.ts`.
- **bmo-remote (92 files), carried by bmo-remote's console bundle:** `app/assets/fonts/CaskaydiaCoveNerdFontMono-Bold.woff2`; `app/assets/fonts/CaskaydiaCoveNerdFontMono-Regular.woff2` (the remote terminal's faces, which bmo-ui does not carry; the shell's stylesheet loses their faces with them); `app/components/RemoteDesktop.vue`; `app/components/RemoteDesktopLogin.vue`; `app/components/RemoteExtraKeys.vue`; `app/components/RemoteRenameModal.vue`; `app/components/RemoteTerminal.vue`; `app/components/RemoteTerminalPanel.vue`; `app/components/RemoteViewMenu.vue`; `app/components/RemoteWindowBar.vue`; `app/domain/remote/` (16 files); `app/pages/remote/` (3 files); `modules/dev-websocket.ts`; `remote/` (2 files); `scripts/bench-bot.test.ts`; `scripts/bench-bot.ts`; `scripts/bench-server.test.ts`; `scripts/bench-server.ts`; `scripts/bench.test.ts`; `scripts/bench.ts`; `scripts/build-ironrdp.ts`; `scripts/ironrdp-avc420.test.ts`; `scripts/ironrdp-bundle.test.ts`; `scripts/ironrdp-bundle.ts`; `server/api/remote/` (6 files); `server/plugins/dev-use.ts`; `server/plugins/websocket.ts`; `server/utils/rdcleanpath.test.ts`; `server/utils/rdcleanpath.ts`; `server/utils/rdp-client-info.test.ts`; `server/utils/rdp-client-info.ts`; `server/utils/rdp-framing.test.ts`; `server/utils/rdp-framing.ts`; `server/utils/rdp-hangul.test.ts`; `server/utils/rdp-hangul.ts`; `server/utils/rdp-input.ts`; `server/utils/rdp-negotiation.test.ts`; `server/utils/rdp-negotiation.ts`; `server/utils/rdp-nla.test.ts`; `server/utils/rdp-nla.ts`; `server/utils/rdp-pointers.test.ts`; `server/utils/rdp-pointers.ts`; `server/utils/rdp-redirection.test.ts`; `server/utils/rdp-redirection.ts`; `server/utils/rdp-typist.test.ts`; `server/utils/rdp-typist.ts`; `server/utils/remote-desktop-focus.test.ts`; `server/utils/remote-desktop-focus.ts`; `server/utils/remote-desktop-keys.test.ts`; `server/utils/remote-desktop-keys.ts`; `server/utils/remote-desktop-socket.test.ts`; `server/utils/remote-desktop-socket.ts`; `server/utils/remote-guard.test.ts`; `server/utils/remote-guard.ts`; `server/utils/remote-input-method.test.ts`; `server/utils/remote-input-method.ts`; `server/utils/remote-pty.test.ts`; `server/utils/remote-pty.ts`; `server/utils/remote-sockets.test.ts`; `server/utils/remote-sockets.ts`; `server/utils/remote-terminal-socket.test.ts`; `server/utils/remote-terminal-socket.ts`; `server/utils/remote-tmux.test.ts`; `server/utils/remote-tmux.ts`; `vendor/` (5 files).
- **bmo-node (44 files):** `app/components/HardwareBoard.vue`; `app/components/HardwareChart.vue`; `app/components/HardwareCharts.vue`; `app/components/HardwareChip.vue`; `app/components/HardwareCore.vue`; `app/components/HardwareCores.vue`; `app/components/HardwareCpu.vue`; `app/components/HardwareCpuLimit.vue`; `app/components/HardwareGpu.vue`; `app/components/HardwareLiveChart.vue`; `app/components/HardwareMemory.vue`; `app/components/HardwareMeter.vue`; `app/components/HardwareMeters.vue`; `app/components/HardwareMonitor.vue`; `app/components/HardwareStorage.vue`; `app/components/HardwareTile.vue`; `app/components/MonitorCard.vue`; `app/components/MonitorDevices.vue`; `app/components/MonitorFacts.vue`; `app/components/NodeConnectionCard.vue`; `app/domain/hardware-chart.test.ts`; `app/domain/hardware-chart.ts`; `app/domain/hardware.test.ts`; `app/domain/hardware.ts`; `app/domain/nodes.test.ts`; `app/domain/nodes.ts`; `app/pages/monitor/` (2 files); `app/pages/nodes/[name].vue`; `server/api/hardware/` (8 files); `server/api/nodes.get.ts`; `server/api/nodes/check.post.ts`; `server/utils/hardware.test.ts`; `server/utils/hardware.ts`; `server/utils/nodes.test.ts`; `server/utils/nodes.ts`; `shared/hardware.ts`.
- **bmo-review (32 files), carried by bmo-review's console bundle:** `app/components/CodeDefinitionList.vue`; `app/components/CodeExplorer.vue`; `app/components/CodeReviewComposer.vue`; `app/components/CodeReviewPane.vue`; `app/components/CodeReviewRow.vue`; `app/components/CodeReviewSheet.vue`; `app/components/CodeReviewTodo.vue`; `app/components/CodeViewer.test.ts`; `app/components/CodeViewer.vue`; `app/domain/code.test.ts`; `app/domain/code.ts`; `app/pages/code.test.ts`; `app/pages/code.vue`; `browser/code-review-touch.test.ts`; `server/api/code/` (12 files); `server/utils/code-request.ts`; `server/utils/code-reviews.ts`; `server/utils/workspace.test.ts`; `server/utils/workspace.ts`; `shared/definitions.test.ts`; `shared/definitions.ts`.
- **bmo-drive (27 files), carried by bmo-drive's console bundle:** `app/components/FilesItem.vue`; `app/components/FilesList.vue`; `app/components/FilesPreview.vue`; `app/components/FilesShareList.vue`; `app/components/FilesTree.vue`; `app/domain/files.test.ts`; `app/domain/files.ts`; `app/pages/files.vue`; `app/pages/share/files/[token].vue`; `server/api/files/` (12 files); `server/api/share/files/` (2 files); `server/utils/file-shares.ts`; `server/utils/files.test.ts`; `server/utils/files.ts`; `shared/file-shares.ts`.
- **bmo-voice (14 files):** `app/components/BriefingPlayer.test.ts`; `app/components/BriefingPlayer.vue`; `app/domain/briefing-position.test.ts`; `app/domain/briefing-position.ts`; `app/domain/briefing.test.ts`; `app/domain/briefing.ts`; `public/briefing-trial.ogg`; `server/api/briefing/events.get.ts`; `server/api/briefing/stop.post.test.ts`; `server/api/briefing/stop.post.ts`; `server/utils/briefing-stream.ts`; `server/utils/presence.test.ts`; `server/utils/presence.ts`; `shared/spoken.test.ts`.
- **bmo-graph (16 files):** `app/components/GraphCode.test.ts`; `app/components/GraphCode.vue`; `app/components/GraphMap.test.ts`; `app/components/GraphMap.vue`; `app/components/GraphNodes.test.ts`; `app/components/GraphNodes.vue`; `app/domain/graph.test.ts`; `app/domain/graph.ts`; `app/pages/graph.test.ts`; `app/pages/graph.vue`; `app/workers.d.ts`; `server/api/graph/` (3 files); `server/utils/checkouts.ts`; `server/utils/graph.ts`.
- **bmo-arbiter (10 files):** `app/components/CardNodeTile.vue`; `app/components/CardsArbiter.vue`; `app/components/CardsBoard.vue`; `app/components/CardsBoardChart.vue`; `app/domain/cards.test.ts`; `app/domain/cards.ts`; `app/pages/cards.vue`; `server/api/cards/` (2 files); `shared/cards.ts`.
- **bmo-gate (8 files):** `app/domain/gates.test.ts`; `app/domain/gates.ts`; `app/pages/gates/` (2 files); `server/api/gate.post.ts`; `server/api/gate/[stage].get.ts`; `server/api/laya.get.ts`; `server/utils/console.ts`.

### The phone app (11 files)

Not carried: the phone app is dropped with `android/`, and these serve only it (build-8).

`app/components/SettingsApp.vue`; `server/api/app/` (6 files); `server/utils/app-devices-model.test.ts`; `server/utils/app-devices.test.ts`; `server/utils/app-devices.ts`; `server/utils/app-release.ts`.

## The account service

The account service stands in `server/`, one Rust project on sumida (build-2, build-3).

| Old member | Stands here as | Carried by |
|---|---|---|
| `bot/bmo-server/src/bmo.sz`, `checks.rs`, `data_move.rs`, `grants.rs`, `phones.rs`, `routes.rs`, `rules.rs`, `users.rs` (the eight files the account-service crate split of commit `2d1704af` moved) | `server/src/` of the same names | build-2 |
| the `Service` and `Refusal` of `bot/bmo-server/src/lib.rs` | `server/src/lib.rs` | build-2 |
| `settle_sumida`, `account` and `account_apart`, and the `user` command, of `bot/bmo-server/src/main.rs` | the server's binary, `server/src/bin/bmo-web-server.rs`: `serve`, `migrate` and `user` | build-2 |
| `bot/bmo-server/src/settings.toml`, sumida's settings for the account service | `server/sumida.toml`; the server's own settings in `server/settings.toml` | build-2 |
| the statement helpers of the old archive pool (`one`, `all`, `run`, the pool and the replanned statement) | `server/src/store.rs` | build-2 |
| `fill_marks` of the old shared policy crate | `server/src/marks.rs` | build-2 |
| the `sumida` git dependency at rev `1ecbf4e48f052ecfd1c12f936fdcb1417d8e5ae0` | `server/Cargo.toml` | build-2 |
| the read of a message's sender out of the shared `messages` table, which a message check and a grant are made on | the receiver port, `server/src/receiver.rs`, asking the receiver's `GET /rooms/{chat}/messages/{message}` | build-2 |
| the room record the account service declared its holdings to | the holdings route and the declaration to the receiver | build-3 |
| `bot/bmo-server/tests/integration/grants.rs` and `sign_in.rs`, and the scratch archive and test ids they stood on | `server/tests/grants.rs`, `server/tests/sign_in.rs` and `server/tests/support/`: 11 tests and 1 | build-2 |
| the two tests of `grants.rs` on whose work an item is (`requester_run`, approvals on a standing rule) | not carried: bmo-job's, standing on its items and the agency's Claude accounts | — |
| `bot/accounts/account-service.ts` | `client/packages/accounts/account-service.ts`: the same functions, asking the server over HTTP at `WEB_SERVER_ADDRESS` with its token instead of the old socket, on the routes `docs/boundary.md` states, a user named by the string id the server gives | build-6 |
| `bot/accounts/account-service-fixture.ts` | `client/tests/support/account-service.ts`, the stand-in on a loopback port, answering those routes | build-6 |
| `bot/accounts/package.json`, `tsconfig.json` | `client/packages/accounts/`'s, the package `@web/accounts` | build-6 |
| `bot/accounts/bunfig.toml` | not carried: its preloads were the old test kit's; the client's tests run from `client/bunfig.toml` | — |
| `testbed/testkit/ids.ts` and `scratch.ts`, the two test-kit modules the console's tests import | `client/tests/support/` of the same names | build-6 |
| `bot/bmo-server/src/control/claude_accounts.rs`, `claude_account_changes.rs`, the `claude_accounts` table and the policy files `claude-code.toml` and `rest.toml` | not carried: bmo-agency's, but for `rest.toml`'s line a room is told as a usage limit begins (below, 「Fixed lines and the document wording」) | — |

### The tables

Web's own migrations make these 10 tables beside sumida's own, which sumida's migrations make:
`user_senders`, `grant_words`, `settings` (web's keys only: the users-moved mark and the administrator),
`web_users`, `web_push_devices`, `web_tab_states`, `web_palettes`, `web_themes`, `web_room_reads` (build-2),
and `document_talk` (build-18, a migration of its own). They come from `archive/bmo-archive/src/migration/archive.sql`,
`m20261006_000000_extensions`, `m20261006_000001_users`, `m20261007_000002_room_reads`,
`m20261009_000001_palettes` and `m20261009_000002_themes`. `document_talk` is the console's own because the
receiver's talk takes the earlier turns from its caller.

| Table near them | Owner |
|---|---|
| `claude_accounts` | bmo-agency |
| `web_search_shares` | bmo-artifact |
| `web_gate_chats` | bmo-gate |
| `web_app_devices` | none: it served the dropped phone app |
| the `console_pinned_rooms` setting | bmo-receiver |
| `web_search_shares_endless` | none: a table a migration makes and renames in passing |

## The language pack: 140 files

`lang/bmo-lang/` is the server's language pack (build-4):

| Old member | Stands here as |
|---|---|
| the 69 parts under `lang/bmo-lang/lang/ko/` | `server/lang/ko/` of the same names, beside the two parts the fixed lines added; a name of the chat agent, the owner or a room in a value is a mark (`{chat_agent}`, `{chat_agent_subject}`, `{owner}`, `{owner_subject}`, `{owner_chat}`, `{owner_chat_agent}`, `{companion}`), and in a comment a role |
| `lang/bmo-lang/src/lib.rs` | `server/src/lang/mod.rs`, the reader and the `part!` macro |
| its 67 other modules | `server/src/lang/` of the same names |
| its test module, `every_part_reads_as_its_type` | `server/tests/language_pack.rs`, beside the private-chat warning's mark |
| `lang/bmo-lang/Cargo.toml` | the server's own dependencies (`indexmap`, `serde-saphyr`) |
| `lang/bmo-lang/package.json`, `bunfig.toml` | not carried: the console's tests import a part by its path under `server/lang/` |

The console's own pack, `client/apps/web/i18n/locales/ko.yaml`, travels with the shell.

## Fixed lines and the document wording

The sentences other units used to compose themselves, and that the server now renders (build-5). Each old member
stays its own unit's; what is taken is the sentence or the composition, never the file.

| Old member | What is taken | Stands here as |
|---|---|---|
| `policy/bmo-policy/policy/rest.toml` | the line a room is told as a usage limit begins, the chat agent's name made a mark | `server/lang/ko/fixed-lines.yaml`, `rest_begins` |
| `policy/bmo-policy/policy/roads.toml` | the line a shut room is told | `server/lang/ko/fixed-lines.yaml`, `chat_denied` |
| `policy/bmo-policy/policy/companion-runner.toml` | the line a room is told of a companion's cut turn | `server/lang/ko/fixed-lines.yaml`, `companion_cut` |
| `bot/word-chain/src/particles.rs` | the subject particle joined to a name | `server/src/words.rs`, with its particles in `server/lang/ko/particles.yaml` |
| `bot/bmo-server/src/doctor.rs`, `queue/telling/failure.rs` | the broken run's account and the last resort | `server/src/words.rs`, `run-broken` |
| `bot/bmo-server/src/chat/restart.rs` | the stopping service's notice | `server/src/words.rs`, `going-down-for-update` and `going-down` |
| `bot/bmo-server/src/chat/health.rs`, `chat/fold.rs` | which line an outage and a fold say | `server/src/words.rs`, `provider-down`, `compacting` and `compact-failed` |
| `bot/bmo-server/src/companion/words.rs` | which line an engine's error says | `server/src/words.rs`, `companion-engine-error` |
| `bot/bmo-server/src/verbs/draws.rs` | a draw's room line, what was asked and what came out | `server/src/words.rs`, `draw` |
| `markup/markup/finding-markdown.ts`, `archive/archive/archive-kinds/search.ts` | the labels a finding is read with, and what an untitled finding is called | `server/lang/ko/search.yaml`, `reading` |

## The documents: 5

| Old document | Stands here as | Carried by |
|---|---|---|
| `docs/accounts.md` | `docs/accounts.md` | build-1 |
| `docs/language-pack.md` | `docs/language-pack.md` | build-1 |
| `docs/documents-viewer.md` | `docs/documents-viewer.md` | build-1 |
| `docs/skeleton-loading.md` | `docs/skeleton-loading.md` | build-1 |
| `docs/web.md` | `docs/web.md`, without the sections of the screens it does not carry: Mail screen, Files screen, 아카이브 screen, Code graph screen, Code review screen, Remote screen, Node screen, Monitor screen, Monitor's 서비스 tab and Gate screen, nor the phone app's settings | build-1 |
