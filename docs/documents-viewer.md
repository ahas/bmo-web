# Document viewer

## What the viewer is

- **Where people read the deployment's markdown:** the console's document viewer shows the documents a
  deployment names as its roots — its repositories' operating documents, and, through the units that keep them,
  the documents the agents read.
- **What the owner does there:** reads documents, selects a passage and asks the chat agent about it, and
  switches a reference fragment off and on.
- **No editing here.** No document's text is written from this screen. When something needs changing, it is
  filed as an item. The fragment switch is the one write, and it writes the brain's row rather than a document.
- **Where the rest is:** the screen's shape is in `docs/web.md`, 「Document viewer screen」. This document says
  what is read from where, and who does what.

## Document roots

- **Every document belongs to one root.** A root states its own:
  - its label (the group in the viewer list)
  - where its documents are read from
  - what counts as a document under it, and what is excluded
  - who writes those documents
  - how the list groups its documents
- **Adding a root is adding one root declaration.** None of listing, reading or searching branches on a root's
  name.

### The roots a deployment names

- **A checkout's documents.** Each root of this kind is an entry of the `DOCUMENT_ROOTS` setting
  (`docs/boundary.md`, 「Settings」): a key, which the root's document names begin with, a label and the top of a
  checkout. Its documents are the `.md` files under its `docs/` and the upper-case `.md` files at its top, and
  they are written by people. A deployment names as many as it wants read, one to a checkout, and an entry
  that is not a key, a label and an absolute top, or whose key is taken, names no root.
- **The base directory is only a fence.** What is a document is decided by the root's document rule, as a closed
  list. A checkout's top also holds code and configuration, and none of it is a document.
- **Which tree is read:** the tree the setting names, as it stands. A deployment that names a deploy tree shows
  exactly the version the deployment runs; a worker's development console names its own checkout.

### The roots kept by other units

The library of the brain (person books, room rules, knowledge) and the agency's documents (rulebooks, personas,
agent instructions and the system prompts it assembles) are their units' own. The viewer reads them only through
a route their unit serves for whole documents, and neither unit serves one; these roots stand in the list
unread and are read from nowhere. Neither unit's folders are read from their paths.

- **Each such root says where it belongs.** Its declaration carries, beside its label and its writer, the sentence
  its unread mark is named by: the brain's library is read on the brain's own screen, which no bundle serves the
  console yet, and the agency's documents wait on a route the agency serves for them. The sentence is the root's
  own, so a root added here brings its own and nothing else changes.

### Why the writer is shown

- **Some documents are not written by people:** a library's documents are rewritten by editors every batch, and
  system prompts are what a deployment assembled.
- **The viewer names the writer** at the head of each document, to show that changing what was seen there means
  changing the writer, not the document.

## Document names and versions

- **A document's name** is **the root name plus the relative path within that root**.
  - Console addresses, list rows, and thread records all point at documents by this name.
  - Absolute paths never leave the server.
- **The version:** reading a document brings its body together with its **version** — the SHA-256 of the body
  bytes.
- **What hangs on it:** words said about a passage record which version they looked at.
- **Future editing:** a request would give the version received at read time, and be refused if the version
  changed meanwhile.

## Path boundaries

- **Behind login only.** The viewer opens only after login.
- **Only what a root allows.** The server reads only files a root declaration allows.
- **A request may give only** a root name and a relative path.

### The checks

- **Root names** must be declared. An unknown name is a nonexistent document.
- **Relative paths** are refused if they contain any of: an empty segment, a `.` or `..` segment, an absolute
  path, a backslash, NUL, or a segment starting with a dot.
  - Judged on the path after URL decoding, so encoded separators get the same verdict.
- **Real paths:** the base directory and the target file are both resolved to real paths, and the target is read
  only if it is inside the base. A symbolic link inside the base that points outside is not read.
- **The target** must be a regular file with the `.md` extension that fits the root's document rule. Read size
  has a ceiling.
- **Listing:**
  - It does not follow symbolic links.
  - It skips dot files and directories, `node_modules`, `.git` and build output directories.
- **Secrets** — the `.env` family, keys and tokens — are not `.md`, so they appear in neither listing nor
  reading.
- **Search** (text search) runs only inside documents the listing allows.

## Reference fragments

Some of the documents the viewer lists are pieces a reference gate may attach to a turn, and those are rows of
the brain's fragments before they are files (the brain's `docs/fragments.md`). What the row says about such a
document is shown beside it, since the row is the original there and the file tree says only that a file exists.

- **Where the rows come from:** the brain's `GET /fragments`, every row with `down`, the word each kind is called
  by from `GET /fragments/kinds`, and `POST /fragments/active` for the switch (`docs/boundary.md`).
- **A document is matched to its row by where its body sits.** A row names its body as a path, and the viewer
  resolves every document it lists to a real file; the document whose file the row's path names under the top of
  a root the viewer reads is that fragment. Nothing turns on a root's name or a kind's name to make the match, and a row whose body
  is under no root the viewer reads matches nothing and so is not listed.
- **What comes from the row:** the fragment's kind, under the word the brain calls it by, or its own name where
  the brain gives none; the room it belongs
  to, or every room; the slug a gate answers under; the title the index entry carries, which is what the list
  shows the document by; whether it is offered; when a turn last attached it and how many have.
- **What still comes from the file:** the body, its version, its size and its language. Nothing of the text is
  read out of the row.
- **The standing is switched here.** The switch sends the fragment's kind and slug to the brain, which writes the
  row and records that a person set it. A document that is no fragment has no switch.
- **A document with no row is not a fragment and says nothing at all.** No mark, no properties of its own and no
  switch.
- **While the brain cannot be reached,** documents stand as documents and no fragment mark or switch is shown.

## Large documents

- **Long operating documents open whole.** A large document is kept out of a model's context, a rule that does
  not apply to a person's browser.
- **Pieces open one at a time.** Pressing a piece link inside an index document opens that piece in the viewer.

## Table of contents and scroll sync

### The contents come from the original

- **One component reads the headings.** It reads the original's ATX headings (`#` to `######`) in order. Lines
  inside a fenced code block are not headings.
- **Per heading it produces:** the depth, the text, an anchor unique within the document, and the original line
  number.
- **Duplicate text:** when two headings have the same text, the later anchor gets a number.
- **It is `DocumentToc`,** the console's own, where a document kind's outline becomes the contents. The
  bmo-artifact bundle draws its own outline inside its own bundle.

### The rendered text remembers the original lines

- **Line marks:** when the viewer renders a document, the renderer tags each top-level block with the original
  line it starts on, and each heading with its contents anchor.
- **Not an id:** the anchor is a separate mark, not the element's id. A name derived from heading text that
  collides with a document object name gets its id stripped by sanitising.
- **What follows from shared anchors:**
  - Pressing an entry goes to that heading.
  - A document opened with a URL fragment stands at that heading too.

### The current entry

- **Which one:** the last heading past the top edge of the reading pane is the current entry.
- **Display:** the contents mark that row, and scroll within themselves to keep it visible when long.
- **Source pane only:** while only the source pane is visible, the same judgement uses the source pane's top
  line.

### Two panes are synced by line

- **Source to rendered:** from the top visible line of the source pane — the document's markdown as it is — find
  the block containing it and how far into that block it is, and move the rendered pane to the same block at the
  same ratio.
- **Rendered to source:** the reverse is the same — the block at the top of the rendered pane and the ratio
  within it give the original line.
- **No jitter:** the pane a person scrolls leads, and the following pane does not react to its own moved scroll.
  So the two panes never push each other and shake.
- **Switching views:** switching to a single-pane view hands the position over by the same calculation, so the
  reading place is kept.

## Asking about a passage

- **How it starts:** dragging to select text in the rendered or source pane lets the owner ask the chat agent
  about that passage.
- **The same road as item threads:** the talk is a round of the owner's private chat on the chat agent's
  session, which the receiver's `POST /talks` carries with a topic (the receiver's `docs/boundary-api.md`). Only
  the topic differs from an item's talk, which bmo-job carries.

### A document turn

- **What it carries:** the topic, of kind `document`, with the document's name, its group's label, its writer, a
  path the agent can open with its tools, its version, the heading and the selected passage (its length has a
  ceiling); the last few turns of the talk about that document; and the words just said.
- **No full document:** the agent reads it with its tools.
- **This place's rules,** which the receiver's turn carries: answers come only here; the agent does not edit
  documents here; a change the owner asks for is filed as an item.

### The record

- **Where:** the console's own `document_talk` table, tied to the document name (`docs/accounts.md`, 「The
  tables」).
- **Each line:** who said it, the words, the time; for the owner's words, the passage, heading and version
  selected then.
- **The console writes it:** the owner's words as soon as they are sent, the agent's answer when `POST /talks`
  answers. A talk that comes back with nothing writes no answer, and its refusal is shown under the words.
- **Where a talk stands** — whether its last words are being answered, and why they came back with nothing — is
  held by the console's server, and every tab hears that a document's talk moved as the words are written and as
  the turn ends.

### What an answer never touches

- **Its reach:** it goes to no chat service's room, and it moves no room's window, read position or typing
  indicator.
- **A rest:** while the agent rests, the receiver refuses the talk with `resting`, and the words stand as
  unanswered because of the rest.
- **Busy:** while the agent is already answering, new words are not accepted.

## Asking to be taken somewhere, and reading a translation

The seek gate, which takes a question to the place in the documents that answers it, and the translator, which
renders a document into the other language, are the gate unit's. The viewer's question box searches the documents'
text alone, since the console does not call the seek gate (`docs/boundary.md`, 「Screens of units not yet split」).
The translator is called (`docs/boundary.md`, 「Calls the console makes」):

- **A document's version is cut into parts** by the console, each of a size the translator takes, and the version
  the parts are kept under is the document's own version and that size hashed together, so parts cut at another
  size are never read against these.
- **The parts with no translation are handed to the translator,** and with a re-request the failed ones too; it
  keeps each part as it comes back, or as failed with a sentence saying what its last answer lost.
- **The view reads every part it has kept for the version,** and where it stands on the rest — how many it still
  holds and why it last failed, if it did. Its event that a document's translation moved reaches every open tab
  as the console's own word, and the viewer reads the translation again.

- **Asked of one document,** a question goes to the section holding most of its words, the heading that opens
  it, or the document's top where the lines before its first heading hold most.
- **Asked of every document,** the documents holding most of its words stand as candidates, most first, each at
  its own such section. Its words are what a word segmenter cuts it into, lowered; a document's title counts
  toward each of its sections.

## Where editing would attach

- **Today the viewer writes nothing but a fragment's standing.** No document's text is written here.
- **If editing were added:**
  - Only to documents of roots people write.
  - As a write request giving the document name and the version received at read time.
  - Path boundaries get the same verdict as reading.
