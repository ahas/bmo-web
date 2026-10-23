# Web console loading skeletons

How the console keeps the place of content it is still fetching. The components it is built from are the
bmo-ui layer's (bmo-ui's `docs/components.md`); this says how the console uses them.

## What a skeleton is for

- **It keeps a place, and only a place.** A region that must fetch what it shows stands a skeleton the size and
  shape of what is coming, so the screen does not jump when the answer lands.
- **It stands only where fetched content will stand** — a piece of text, a picture, a figure, an item of a list.
  Everything the screen can draw without the answer is drawn at once: the layout, a card's frame, a section
  title, a header, a button, a tab, a toolbar, a search field.
- **No screen is covered whole.** A screen that fetches from several places gives each region its own place, and
  a region whose answer has arrived shows it while the others are still waiting.
- **It stands only once the fetch has begun.** Every read of this console is the browser's, so the page the
  server draws, and the browser's hydration of it, have asked for nothing. There each bar keeps its place at its
  full size and draws nothing, and no busy status is announced; the bars and the status come up together as
  hydration ends, which is when the reads start. The frame around them — titles, labels, a card's border — is
  real and stands from the first frame, so nothing moves when the bars appear.
  - What a place is held up by is the answer's absence and never the read's own state. A read that runs in the
    browser alone has not begun in the server's picture and has begun in the browser's first frame, so a place
    standing on that state stands in one and not the other, which is a hydration mismatch and a jump where the
    place should have been.
- **It stands once, in one shape.** From the moment it stands until its content lands, a place keeps the pieces
  it stood with and the height it stood at. It only ever goes away: nothing turns into a second placeholder, and
  no placeholder stands once any of its neighbours has turned into content.
  - A region whose content waits on two reads waits for both before it turns into content, rather than turning
    into rows that still hold placeholders of their own.
  - A screen whose frame the browser has to choose — a splitter on a wide screen, a single list on a phone —
    draws its body empty until the browser has chosen, and then stands the frame with the placeholders inside
    it.
  - A table's placeholder keeps the columns it stood up with; names learnt while it waits are drawn with the
    rows.
  - The foot of a list asks for the next page only once it has been measured against the rows that landed, so a
    first page does not bring a second placeholder under itself before anyone scrolled.
  - Next pages read one after another because the foot still stands in view once each has landed — a filter
    that leaves few of a page's rows on the screen — are one wait: the foot's placeholder stands from the first of
    them until the foot has left the view or nothing more is held, and does not go and come back between them.
- **It is for the first fetch.** Content already on the screen stays on the screen while it is read again; a
  successful empty answer is content and its empty state stays too. What says a re-read is going is the spinner
  on the control that asked for it, with a notice read out to assistive technology and taking no room on the
  screen.
- **A failure replaces it.** A fetch that failed shows its reason and a way to ask again, never a skeleton that
  does not end. A unit that cannot be reached is such a failure, for the regions that read it alone.
- **A next page is a first fetch of its own items**, so a list already shown may carry a skeleton of the
  incoming items at its own end.

## What it is built from

- **`SkeletonBar`** is the one shimmering bar every skeleton is drawn out of. It hides itself from assistive
  technology, stands still for a reader who asked for less movement and draws nothing before the browser has
  taken the page over, so none of the three is restated where a bar is drawn. Its size is the caller's.
- **`SkeletonLine`** is one line of text that has not arrived: the whole of the line box the real text stands
  in, with the bar inside it. A run of these is exactly as tall as the same run of real lines.
- **`SkeletonText`** is a passage of them, with only the last line short.
- **`ContentSkeleton`** is the region: the busy status under a readable name, a surface nothing can be pressed
  through, and the repetition of one piece inside the same container class the real pieces stand in. **The piece
  itself is the caller's, given as the slot** — only the screen that draws the real item knows what one looks
  like, so no shape is held centrally. Real text placed in the slot stays readable; the bars hide themselves.
- **`SkeletonStatus`** is the busy status alone, for a place kept inline where a region's block and list do not
  fit — a figure beside a button, a picture still loading. It waits for the browser the same way, and what it
  keeps the place of is its slot.
- **Those three are the only places a bar or a busy status is drawn.**
- **`DataTableSkeleton`** is the place a shared table keeps. It is given the same column names the table is
  given, so the head stands at once and only the cells under it wait; a column whose name is not known yet waits
  with them.
- A screen whose real row is elaborate keeps its placeholder beside it as a component of its own — the TODO
  board's row is drawn that way, because the board draws it in two places.

## Matching the shape

- **The shape is read off the real thing, never invented.** A list's placeholder is a few copies of one item:
  the item's own height, its own number of lines, its own columns, its own frame, and the list's own gap between
  them.
- **How many pieces stand is what the region holds, never more.** A placeholder run longer than the rows that
  land leaves the screen to collapse under the reader.
- **Where a row changes shape with the width** — a phone putting a number on a line of its own — the placeholder
  changes with it.
- **Where a row's height is settled by the container rather than the window**, the placeholder stands the form
  the row is read in and is shorter, never taller, at the other widths.
- What cannot be known before the answer is how long a list is. So what is promised is that the frame above the
  rows does not move: the toolbar, the search field and the first section's title stand where they stood.

## The regression test

- **Where:** the console's browser test of the skeletons, under `client/tests/`, which drives a real console and
  reads the screen as numbers. It uses no production data.
- **How to run it:** set `BMO_SKELETON_TEST_URL` to a development console's own address, standing on a scratch
  database, with unit addresses nobody listens on. Its fixture account is made in that database alone.
- **By default it is skipped:** the ordinary run has no console of its own.
- **What it holds the screens to,** at a desktop width and at a phone's, every read but the login held open: the
  screen's own title stands before anything is known; the place kept for the answer is inside the body, says it
  is busy and holds nothing that can be pressed; and the title has not moved once the answer lands.
- **What it holds the TODO board to** on top of that: every section title stands while the rows are read, the
  placeholder row is the landing row's own height, width and left edge, and reading the board again keeps the
  rows on the screen with no placeholder coming back.
- **What it holds every fetching screen to,** at both widths: no bar and no busy status is on the screen before
  hydration ends, and from then until the last placeholder goes, every frame holds only what stood in the frame
  before it — no place changes its pieces or its height, and none stands after any other has turned into
  content.
- **What it holds the cache siren screen to,** at both widths: with a filter that leaves none of the rows read,
  the foot's placeholder stands at most once while the further pages are read.
- **What it holds the database screen to,** at both widths: each of its two placeholders keeps the dense table's
  own head and row heights, and its head shares the table's left edge.
- **What it holds the units' line to:** the live screen's button and a room's box show the pack's loading words
  while the ask is held, then its failure words once the unreachable address has answered, and the button's
  colour differs between the two.
- **Not covered here:** every screen's delay and failure paths one by one, and a real finger.
