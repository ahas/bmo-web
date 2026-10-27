# The web console

The app's name is a word of the language pack like every other the console shows (`app.label.name`), filled
with the chat agent's label the deployment's settings give: the browser tab and the login screen stand as it, and
so does the name under the icon installed on a phone (`app.label.manifest_name`). No screen header carries the app's name: a screen's header names that
screen, and the front door names nothing at all, since the mark at the top of the sidebar already says
which console this is.

It is an app to read what the deployment keeps in a browser, speak on the web to a room's chat agent and
its gate agents, and see what each of the deployment's agents is doing right now in that agent's own
internal log as it is. The screen is shaped like a common AI chat app: a sidebar of rooms and agents on the
left, a conversation or log in the middle, an input box below. The app is `client/apps/web`, running on Bun
alone over Nuxt and Nuxt UI, extending the bmo-ui layer; the screens a unit brings of its own are loaded while the
console runs, from the manifest that unit answers (「Screens a unit brings」).

- **What a screen shows is its unit's.** Where this document says **the bot**, it means the units behind the
  console's server that hold what a screen shows — the receiver, the agency and bmo-job — each
  reached through its own routes (`docs/boundary.md`, 「Calls the console makes」); **the archive** is the
  store of the unit that owns what is shown, and **the control API** is those routes. The console's own data
  is the server's (`docs/accounts.md`, 「The tables」).
- **No screen stands for a feature nothing serves.** A screen is the console's own, reading the units it calls,
  or a unit's own, loaded from the manifest the unit answers; a unit that answers none brings no entry, no route
  and no page.
- **The mail, files, archive, code review and remote access screens are their units' own,** each a console
  bundle loaded from its unit's manifest, whose calls this app relays (「Screens a unit brings」). A bundle's
  share page, below its screen path at `share/`, is the one screen outside the login, and GitHub's deliveries the
  one call (「Access」).

## Layout fundamentals

- **The body stands in one width of 768 pixels.** On any screen the content does not exceed that width
  and stands centred in the space left over.
  - That number is in one place, the bmo-ui layer's `--ui-container` (bmo-ui's `docs/boundary.md`,
    「Tokens」), and is not written per screen — the layer's app configuration lays it on the dashboard
    panel every screen stands on, so a screen added later stands at the same width with nothing said.
  - On a narrow screen the width does not bind, and only the panel's 16-pixel gutter is left on either
    side.
  - **768 is the width of the content itself.** A gutter is added outside it, never taken out of it: a
    screen whose container carries its own side room — room, gate and agent-log screens — lets that container grow by the room, so the
    text still stands 768 wide. A box drawn around an item — a message hovered, chosen or brought
    into view — keeps 12 pixels of room of its own on each side, outside the item's content, so the
    content keeps its full width and never touches the box's edge.
  - **Only twelve screens stand outside this width, read horizontally,** and all twelve release the width in
    their own panel: the DB screen reads a table by scanning across, the code graph, document viewer,
    code review and mail screen read splitter-divided parts side by side, one search reads its findings and their source
    list side by side, agent management stands its settings tables edge to edge, and the remote screen
    gives a terminal or a desktop the whole panel, and the three monitor screens — the monitor overview, this
    machine's monitor and each node's screen — and the card arbiter screen read tiles and charts of live figures across the panel. One search's findings and agent management's general
    tab still stand at the reading width inside their part. The login screen does not stand on a panel at
    all and stands centred in its own card. A screen that releases the width keeps the panel's own room
    around its content unless it has a reason of its own to stand flush.
- **A list is found as it was left.** Opening a row and coming back is one move, not an arrival: the scroll, the
  choice and the pages already read are where they were.
  - Where the list and the detail stand on one screen, the detail is drawn over the list rather than in its place, so
    the list is never taken down. That is the mail screen on a phone, where the conversation stands over the list and
    Back closes it.
  - A screen that is one screen for every place inside it names itself to the router by one name, not by its own
    address. Named by the address it would be a different screen for every conversation, torn down and built again on
    each one.
  - A screen keyed by place is named by its path and by the parts of the query it reads itself, each screen naming
    its own, and never by its whole address. The rest of the query is written by what stands around the screen — an
    item opened on the TODO panel writes `?todo=` into whatever address is open — and a change there leaves the
    screen standing as it was.
  - Where the list is a screen of its own that the detail leaves — the search list, agent management — the router is
    told to keep the screen where what it has read is worth keeping, and the scroll is written down as it is made and
    put back on the return. It is written down as it is made because a kept screen is set aside before it is told it
    has left, and a detached element's offset reads as nothing.
- **A list that chooses many always offers the whole of them.** Wherever a list has a choosing state
  it carries one control that takes every row shown or gives the whole choice up, at every width and
  from the moment the state is entered — never folded into a menu, and never standing on a wide
  screen alone.
  - It is a checkbox, and it stands at the three states the choice can be in: none of the rows shown,
    some of them as the checkbox's own indeterminate, all of them. A press takes the choice to
    whichever end it is not at, and the name it carries — 전체 선택 or 전체 해제 — is that end, so the
    tooltip and the accessible name say what pressing would do.
  - A row of such a list marks itself chosen with a checkbox's own square, so one list is not read as
    two ways of choosing.
  - The box is smaller than a finger, so it stands in a cell as wide as a toolbar is tall and the
    whole cell is pressed; the cell carries the hover and the press colors the way a toolbar's other
    cells do.
  - What the states mean and what a press means are decided in one place for the whole console rather
    than per screen, so no list answers differently. The list supplies the rows it is showing and what
    was chosen, and receives which of the two ends the press asked for.
- **The width binds not the panel body but what the body holds.** The vertically flowing box is the
  panel body, so narrowing the box itself to 768 puts the scrollbar beside the text, not at the window
  edge. So the box fills the screen — up to the TODO panel on the right in a room screen — and what
  stands inside it stops at 768.
  - Which box carries the scroll differs per screen. On list screens (home, live status, cache siren,
    archive, search list) the panel body flows as is; on agent management the section box under the tab
    row flows; on room, gate and agent-log screens the container
    inside the body holds the width and the body flows; on the DB screen the body releases the width and
    the table box flows within itself horizontally and vertically. Either way the flowing box fills the
    place it sits in, so the scrollbar always stands at the right edge of that place.
- **A content screen always leaves room at its foot.** If the last line ends where the scroll ends, a
  fully-read screen cannot be told by eye from one not yet loaded. That room is the panel body's gutter,
  the same on all four sides — 16 on a phone, 24 wider. No per-screen bottom gutter is written.
- **The only screens that remove it are those that stand something at the foot or fill to the edge.**
  Room, gate and agent-log screens have an input box below that box, so a gutter would open a gap in the
  middle of the screen rather than at its foot. The DB screen stands its paging flush at the foot. The code
  graph, document viewer, code review, mail screen and one search are bodies split into splitter sections,
  and a section must fill to its end for its border to stand. Agent management's tables fill the section edge to
  edge. The remote screen's terminal and desktop fill the panel to its edges. There are no others but
  those twelve.
- **A box put in the body is not shrunk.** A box told to shrink spills its content past its border, and
  the spilled content does not take the containing box's bottom gutter with it — the scroll just ends at
  the last line. It is a kind of misalignment that leaves no trace in any file, so shrinking itself is
  not done. The exceptions are where what the box holds flows within itself: the DB screen's table box,
  agent management's sections, and the remote screen's terminal or desktop. There the box wrapping it shrinking to fit the
  panel is right, and the panel itself does not flow.
- **A writing box stands at the width of the box holding it.** A multi-line writing box left on its own
  is an inline thing of about twenty characters, so inside a row of boxes the parent stretches it to
  fill, and inside a plain block it stands narrow on its own — the same box read at a different width per
  place. So the width is not written per box but comes in one line where the panel body's width comes —
  making what a screen could forget impossible to forget.
- **A popover stands only as far as the room left to it, and flows within if it overflows.** A popover is
  drawn beside the place that opened it and grows to what it holds, so a long content on a phone runs off
  the bottom with no way to see its tail.
  - The room left is already measured by the side seating the popover before it draws — the height and
    width between the opening place and the window edge, and the ceiling comes from there. So there is no
    screen measuring the window itself, and no screen writing down a number that goes false when the
    opening place moves.
  - Past the ceiling the popover flows vertically within itself — by wheel or by finger — and reaching
    the end does not turn to the page behind. This rule too is not written per popover but comes in one
    line where the panel body's width comes. A popover standing at its own width on a screen with room is
    unchanged — the ceiling binds only when room is short.
- **The vertical stands by what is visible, not the window's height.** The console's shell is nailed to
  the window and clips overflow, so what is longer than the window is not pushed down but simply gone —
  not folded but with nowhere to fold. What is cut off is always the foot of the column, the input box.
  So the vertical has two rules.
  - **The first: no piece has a floor.** Neither the panel every screen stands on nor the sidebar beside
    it sets a minimum height. The bands over the screen — the play bar and the question bar — take their
    share off the column first, so any piece insisting on one screen height grows longer than the room
    left by exactly those bands. The login screen alone is the exception: it does not stand on the shell
    and stands centred in its own card, so one screen height is exactly what that screen means to do —
    one screen of the height below, and the card is centred by its own margins so that a card taller
    than that room scrolls to its top rather than losing it.
  - **The second: what is visible is not the window's height.** A phone's virtual keyboard does not cut
    the page but overlays it, so the window keeps its height with its bottom going behind the keys. So the
    console holds the actually visible height and where it starts in two values, `--bmo-screen` and
    `--bmo-screen-top`, and the shell stands by those two — and so does the login screen, which stands
    on no shell and would otherwise hold a phone's keyboard over its own button. While nothing
    overlays, the whole window is the answer — kept at `100dvh` to follow the address bar rising and
    falling — and when something overlays, the smaller number the browser reports as the visual
    viewport enters there. Reading the start too is because the browser pushes its page up to show
    the focused box. A screen zoomed with two fingers is
    not an overlaid screen, so it is not touched. The browser is told from the start with the viewport
    meta to take the keyboard's place off the page, and in a browser that does not listen these two values
    make the same place. The remote desktop's own keyboard is the one laid over the page instead
    (the remote unit's documents, 「The on-screen keyboard」).
    - Whether something overlays is read against the height the shell takes on its own — `100dvh` as the
      browser lays it out, or the window's own height where that is taller — never against the window's
      height alone. A phone's browser can report its window and the visible part of it as one height while
      the dynamic viewport still runs on under a bar the browser has laid over the page's foot, as Chrome on
      Android's bottom bar over the gesture bar can be from a page's load until its first touch. Read against
      the window alone, nothing would overlay, the shell would stand at `100dvh`, and its foot — the room's
      input bar — would stand under that bar until the page is touched.
    - The reading is taken as the screen is first drawn, on the frame after it and again a quarter, one and
      two and a half seconds later, whenever the visual viewport changes size or moves, the window changes
      size or scrolls, the page is shown again from the browser's history, the screen turns, or the tab comes
      back into view — so a browser settling its bars after a reload re-places the shell without waiting on
      a touch. Where a browser knows no `dvh`, the whole window is `100vh`.
    - **The room's input bar holds itself in view.** Each time the reading is taken the room measures its
      input bar against the visible part. A bar whose foot stands below what is visible while a bar or a
      keyboard covers the window has the shell stand at the visible part instead. One that stands below it
      while nothing covers the window — the box the room stands in laid out taller than the visible part,
      as a phone's browser can lay one out from its page's load until its first touch — is lifted by how far
      it stands below, and the end of the conversation with it, so the last message still stands above the
      bar; the lift is measured again each time the reading is taken and is nothing once the box fits again.
      The first time on a page that the bar stands below, the screen tells the console's log the numbers it
      read — the window's height, the visible part's height, start and zoom, the dynamic viewport's height,
      where the bar stood, and the top and height of the box it stands in and of each box around that one up
      to the shell — so a browser that lays the page out that way is measured the next time it does.
  - **The third: the document itself never scrolls.** Every scroll is a part's own. A screen that stands
    on no shell — a share link's page, the remote screens — stands on the one screen
    frame instead, which is pinned the way the shell is, by the same two values. Being pinned is what
    makes it the anchor of everything laid out absolutely inside it: a word kept for a screen reader
    alone, a hidden native control, a badge. A frame that is only as tall as the screen but anchors
    nothing lets each such piece find its place against the page itself, at the depth it would sit in
    its part's scrolled content, and the page grows a scroll of its own beside the parts' scrolls. The
    login screen is the exception again: it is its own card's scroller and anchors what it holds itself.
- **A video let go of full screen finds its screen where it was left.** Taking a player to full screen takes
  the layout with it: the video leaves the flow, the window grows or a phone turns on its side, and every part
  scrolling around the player clamps or is anchored somewhere else — then comes back with the video at a
  place the reader never scrolled to. So the console as a whole, on no screen's behalf, writes down where each
  part scrolling around a video stood at the press or key that reached the video, before full screen can move
  anything, and puts that back when full screen is let go, frame after frame for a second while the window
  settles, stopping the moment the reader scrolls, presses or types. A part puts back its offset unless it
  says for itself what its place is (the room's conversation does, 「Room screen」). Full screen is read from
  the standard change, its WebKit prefix, and the begin and end an iPhone's own player announces on the video
  itself, since an iPhone plays full screen outside the page. A picture opened whole is a sheet over the page
  rather than full screen and moves nothing under it.
- **What floats over the screen keeps clear of the bars a phone lays over it.** The console asks to be drawn
  under a phone's own bars (`viewport-fit=cover`), so a phone that draws its page edge to edge lays its
  gesture bar over the foot of the window and says how tall it is as the bottom safe area. The two
  insets are kept in the stylesheet as `--bmo-safe-top` and `--bmo-safe-bottom`, nought wherever the
  device reports none.
  - Every sheet and panel that reaches the bottom edge — a drawer from any side but the top, a
    slideover, the phone's sidebar — adds the bottom inset inside its own box, under whatever padding
    its content already keeps. Its colour still runs to the screen's edge; only what it holds stands
    above the bar, so its last line keeps the same room from the bar that the other sheets keep.
  - A dialog in the middle is centred between the two insets and its ceiling leaves them out, so a
    tall one stands clear of the bars at the top and the foot alike.
  - Both are set once in the component configuration, never per sheet: a sheet written later stands
    clear without being told.
  - The room's input bar stands at the foot of the shell, which stands by what is visible (above), so a
    keyboard coming up or the address bar going re-places it with the shell rather than covering it.
    While nothing overlays the window the bar adds the bottom inset under its own padding, so its box
    stands above the gesture bar and its ground runs on under it; while a keyboard or the browser's own
    bar overlays the window's foot it adds none, since that stands where the gesture bar was. Whether
    anything overlays is the shell's own reading (above). The room keeps the bar's height,
    the inset with it, as its room at the foot, so the last message, the photo held at the foot and the
    way down stand clear of the gesture bar too.
- **What retreats when room is short is fixed.** A room's foot is a compressible column, and when
  compressed the question-card stack folds first — the stack grows only to 4/10 of the visible height and
  flows within itself above that. The input box retreats in no case. Even with a job asking several at
  once, a sound ringing and the keyboard up, the input box stands within the screen and the hand reaches
  it. The input box does not push the column with its own text either — it grows to eight lines with the
  text written but not past 3/10 of the visible height, and beyond that flows within itself. Both the
  room's input box and the input box instructing a runner or worker directly do so.
- **Whether Enter sends or breaks a line is set by what the hand writes with.** On a machine whose main
  input is a mouse or trackpad, Enter sends and Shift+Enter or Alt+Enter breaks. On a machine whose main input is a
  finger (`pointer: coarse`), Enter breaks and sending is only by the send button — because the on-screen
  keyboard has Enter as its only line-break key. It is not split by screen width because width does not
  say the keyboard: a narrowed desktop window has Shift, and a tablet laid landscape is wide but has only
  Enter. A laptop with a touchscreen has the trackpad as its main input, so it stands on the desktop
  side. On a machine where Enter sends, an Enter pressed while composing Hangul sends too: the
  composition is let finish, the message goes with the last syllable in it, and no line break is left
  behind. The repeated Enter some browsers send right after the commit is the same press and sends
  nothing more. On a machine where Enter breaks, ending the composition and breaking the line is exactly
  right. The room's input box, the gate-test input box, and the runner/worker instruction input box all
  follow this rule.
- **A line written in an input box keeps its breaks while the writing goes on.** Each line is filled as
  far as it holds before the next begins, and a line already filled is never laid out again for what is
  typed after it, so nothing above the cursor moves while a person types. A Korean word therefore breaks
  between syllables at the box's edge rather than moving to the next line whole, and a syllable still
  being composed stays where it was begun; only a word written in Latin letters still moves whole as it
  outgrows its line, and a run with no break in it wider than the box breaks anywhere. Every box in which
  a message, an instruction or a word to the chat agent is written breaks this way, the room's among them, so the
  room's box breaks its words differently from a bubble (「Every message is a bubble」), which is read
  rather than written.

## Motion

- **A fade is for a thing that comes and goes on its own over the screen** — the message pill's words,
  a popover, a menu, a dialog and its shade, a tooltip — and for nothing else. An item of a list never
  fades, and neither does the content of a page, a panel or a tab as it is replaced.
- **One screen moves along one axis at a time.** A fade never runs on the same screen as a slide, a
  scroll or items changing places, and nothing slides sideways while something beside it moves up
  or down.
  - The parts of one change of mode are one movement, whatever way each goes: they start in the same
    frame, take one length and one easing, and end in the same frame, so no part is seen waiting for
    another. Choosing messages is one (「Choosing and copying」): the top bar growing down and the choosing
    column opening sideways run together.
- **How a thing comes and goes says where it came from.**
  - A thing that comes out of a place grows out of that place with a fade and shrinks back into it:
    a dialog out of the control pressed to open it (「Floating things」), a menu, a list or a tooltip
    out of what it stands beside.
  - A thing that comes from no place in particular never grows. The message pill unfolds sideways
    from its own centre and only its words fade (「Messages」). A dialog nothing was pressed for only
    fades.
  - A sheet or a drawer slides in from its edge.
  - Content is never laid out again while its box opens: it stands at its final width from the first
    frame and the box hides what lies past its edge, so nothing is cut short, scrolled or wrapped
    again on the way.
- **One set of lengths and easings,** six custom properties on the root of the console's stylesheet,
  and every movement the console draws or retimes names one of them rather than a number of its
  own. A test fails on a length written anywhere else.

  | Name | Value | For |
  | --- | --- | --- |
  | `--bmo-motion-quick` | 150ms | A thing changing state where it stands — a colour, a mark turning, a tab's marker, a figure's characters turning — and a menu, a list or a tooltip out of its control. Felt, never waited on. |
  | `--bmo-motion-pop` | 200ms | A dialog out of its control and its shade; a sheet sliding in. The shortest that still shows where it came from. |
  | `--bmo-motion-unfold` | 320ms | A box changing size — the pill unfolding or moving to its next shape, a region folding open, a list item unfolding or folding — list items sliding to new places, and a tab's panel sliding sideways. Edges travel furthest; shorter reads as a jump. |
  | `--bmo-ease-enter` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Arriving: fast, then settling, so it can be read before it stops. |
  | `--bmo-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving: slow where the eye already is, then gone — the enter run backwards. |
  | `--bmo-ease-move` | `cubic-bezier(0.4, 0, 0.2, 1)` | A thing that stays on screen while it changes. |

  - Tailwind's default transition length and easing are `quick` and `move`, so every `transition-*`
    class without its own length follows them.
  - The component library's own movements are kept — each already grows from its control or slides
    from its edge — and only retimed onto these, in the bmo-ui layer's app configuration.
  - The voice player keeps its own bounce (the voice unit's documents, 「The console's player」). The
    phone's sidebar and every bottom drawer keep the drawer library's own slide, since the same
    curve settles a drawer a finger has thrown.
- **A list whose items come, go and change places while it is read is a moving list**
  (`MovingList`), and it shows that by position alone.
  - The items that stay slide to their new places. An item that comes unfolds its height from
    nothing where it lands, one that goes folds its height to nothing where it stood, and the
    items around it close up as it does — the list's own gap between items included, so nothing
    jumps at the end. What the item shows is laid out at its full size throughout and only clipped.
  - Every item moves at once, at `unfold`, eased by `move`: no item waits for the one before it.
  - Items are keyed by their own lasting id, never by position.
  - The TODO panel's sections, the room lists on the home and room-list screens and the sidebar's
    rooms are moving lists: a search, a condition, an item added, finished or carried by its
    handle, and a room a message lifts up the list all move this way.
- **The TODO panel's state tabs move the list as one panel sideways** (`TabSlide`). The list under
  the tabs is one panel keyed by its tab, and the new tab's panel comes in from the side its tab
  stands on in the tab order while the old one leaves to the other side, both together, at `unfold`
  eased by `move`. The rows inside move with their panel and have no movement of their own, and the
  new panel opens at its own top. A tab bar whose tabs are screens of their own and steps of the
  address — the agents, monitor and live screens — changes page, and moves nothing.
- **A number that changes while it is read turns only its changed characters** (`RollingNumber`).
  - Each character stands in a window of its own, one character wide and one line high, the places
    counted from the right so the ones stay over the ones. A character that changes leaves its window
    and its successor comes in: where the number grew, the new one comes up from below and the old one
    leaves upward; where it shrank, the new one comes down from above and the old one leaves
    downward. A place a growing number adds comes in the same way; one it drops goes at once.
  - Every other character, the words and unit round the number and the rest of the line stand still,
    and its figures are tabular, so its width does not flutter as they turn.
  - It moves at `quick`, the arriving character eased by `enter` and the leaving one by `exit`; a
    number as it is first drawn stands still.
  - It is one component, and every number that changes on a screen standing open is drawn by it: a
    count inside a sentence is that sentence's figure alone, the words round it drawn by the
    language pack's own sentence with the figure in its place.
- **A list replaced by a different one stands at once.** The TODO panel read for another room, when
  the page moves into or out of a room made for companions, is a different list: it is keyed by the
  room it was read for, so when that read lands the new list replaces the old with none of its rows
  moving.
- **A room opened or switched to stands at its opening place from its first frame** (「Room screen」).
  Its skeleton stands while it is fetched, and the conversation replaces it at once, already at its
  end or at the message it opens at, with the day marks heading its rows. It is never drawn at one
  place and then jumped or glided to another, and no day mark stands before the rows it heads.
- **Which tool moves what.** A list is Vue's own `TransitionGroup`, through `MovingList`. A tab's
  panel is Vue's own `Transition` of one keyed element, through `TabSlide`. One element
  becoming another on the same page — a sent message flying from the input box to its place — is
  `motion-v` with a shared `layoutId`, always under `MotionConfig` with `reducedMotion="user"`, since
  its own default ignores the reader's setting. One element becoming another across two pages is the
  browser's view transitions, through Nuxt's `experimental.viewTransition`. A page change on its own
  does not move: the new page stands at once. One list is moved by one engine, never two.
- **A reader who asked for less movement sees nothing move, grow or unfold.** Every transition's
  length is nought, the pill and the voice player stand and go at once, and a dialog, a menu or a
  folding region only fades where it stands.

## Access

The owner alone sees it. Without logging in, no screen and no API open. The agent log holds a room's
conversation and the credentials handed to the browser searcher as they are, so the log stands behind
this rule alone and goes nowhere else.

- **GitHub's deliveries are the one call taken with no sign-in.** GitHub posts an organisation's webhook
  deliveries to `api/github/deliveries` under the console's base path, and nobody signs in to post them. The
  console takes that one path for `POST` alone, and a body of at most 1 MB, and hands it on unchanged to the
  agency's `POST /github/deliveries` with its `Content-Type`, `X-GitHub-Event`, `X-GitHub-Delivery` and
  `X-Hub-Signature-256` headers and the agency's token, answering with the agency's status and body. Whether
  the delivery is GitHub's is the agency's to say, by its signature: the console judges nothing of it. A larger
  body is refused 413 and nothing is handed on; an agency that does not answer is 502. Each delivery leaves one
  line in the console's log: its event, its delivery id and the status it was answered with.

**Once the multi-user model is in force, the sign-in is the account service's**
(`docs/accounts.md`).

- **Signing in** posts the name and the password to the service, and the seal this app keeps holds
  the sumida session it is handed, the user and whether that user is the platform administrator.
  Every request carrying such a seal asks the service whether its session still stands, at most once
  every thirty seconds, and a session gone clears the seal.
- **A service that does not answer that question ends no session.** The request is refused with this
  app's 503 of the service not answering and the seal stays, so a deployment restarting the service
  signs nobody out: the next request asks again, and a send refused meanwhile waits (the room
  screen's **대기**).
- **A cleared seal is gone for the rest of the request that cleared it.** Neither the route nor a page
  drawn on the server reads that request as signed in, so a session gone is never answered once more
  with what it may no longer read, and a page drawn on it goes straight to the login screen.
- **An empty session cookie is no session.** The checks on a request read one as they read a request
  with no cookie.
- **A service that does not answer signs nobody in,** and says so in the login screen's error line.
- **A seal this app wrote before the model** stays readable as the administrator's until the
  contraction, since only their account could have signed it.
- **The administrator reaches every screen and route.** Anyone else reaches only the routes opened
  to them, each read under its scope: their own account, their phones and their tabs, and the rooms
  they are a member of and hold the console grant in. Every other route answers them as if nothing
  stood there; the list of opened routes is kept in one place, and a test holds every route file to it.
- **The settings' login form changes the name and the password on the service,** and keeps this app's own
  account of the same name in step, for the services below that still check their login there.

**The console shows a member — a signed-in user other than the administrator — only the screens their
opened routes serve.** The routes refuse them either way; what this adds is that no screen opens onto
nothing.

- **Whether the one signed in is the administrator is read off the session the browser already
  holds.** A sign-in on the service writes it into the seal; a seal that does not name it is a console
  login or one written before the model, and both are the administrator's, as the routes read them.
- **Each screen says whether a member may open it.** A member opens home, the settings, the rooms they may
  read and the screens units bring whose manifest's role is `member` — and, where the manifest asks for the
  owner key, only when their login has a user; asking for any other address takes them home.
- **A member's console stands in a shell of its own.** Its sidebar is the console's mark, the screens units
  bring that they may open, their rooms and the user menu: none of the console's own screens, agents, nodes or
  search, no queue panel, question bar or briefing player, and nothing in it reports which room the tab shows. Its sidebar hears the bot's stream for
  one thing, a message landing in one of their rooms, which moves the room's unread count and place
  (「Sidebar」).
- **A member's home is their rooms,** one line each with its name, message count and last message
  time, and nothing that waits on an agent's figures.
- **On a room, a member reads the conversation and sees it move.** The box to write in, the session
  information, the bar's queue button and usage meters, the gates' verdicts under the messages and the
  line of other work going in the room are the administrator's.
  - Its photos, files, link previews, picture viewer and date jump are read under the rooms the
    conversation is.
  - The messages route hands a member the messages alone, with none of the verdicts recorded on them.
- **The bot's stream reaches a member scoped to the rooms they may read,** as those stand when the
  stream opens.
  - It carries a message arriving, a turn beginning and the way it ended, each with the room, the
    message and who answered, and the word that a room's registration was removed; of the bot's
    picture, the turns going in those rooms and how much each was handed, and the message each holds
    queued for a turn.
  - What a turn is doing step by step, the verdicts, the other work running anywhere, the queue, the
    console's own events, bmo-job's and the agency's events, which name no room, and anything of a room
    they do not read never reach them. The one console
    word that does is `deploy`, which carries nothing but that the deployment moved (「Deployment in
    the title bar」).
- **Nothing on a member's room asks after the bot itself, its owner or the pictures index.** Whether
  the bot answers moves only the box to write in, whose room it is only the administrator's tools,
  and the index names every room and person; a member's feed draws every face by its initials.
- **On the account, a member changes their name and password and sees and revokes their phones.**
  The notifications, the app download and the briefing player are the administrator's, and the
  screen reads none of them for a member.

**A login that ends leads to the login screen, from any screen, and back after the next login.**

- **A refusal for the login makes the tab ask whether its session still stands.** Every call this
  app answers with 401, from any screen, and every drop of the bot's stream asks the session as the
  server reads it, once for a burst of them.
  - A session gone is a login ended: the tab forgets it and goes to the login screen, which the
    screens and streams it held go down with, so nothing is asked again on the clock.
  - A session still standing leaves the tab where it is: the 401 was a refusal of something else,
    such as a wrong current password in the settings' login form.
  - A server that does not answer the question says nothing of the login, so a console that is down
    still reads as the bot not answering and never as a login ended.
- **The login screen says the login ended** when a tab was sent to it by one, in the warning colour
  above the fields, and says nothing when it was simply opened.
- **The next login returns to the screen the tab was on,** its address carried in the login screen's
  own; an address outside this app is never followed, and with none the login goes home.

**A login stands for one of two spans, and the login screen picks between them.** The switch there —
로그인 유지 — is off unless it is asked for, and off is what the console has always done: the cookie
carries no expiry at all, which is what makes it the browser's own session cookie and gone as soon as the
browser closes.

- **Switched on, the login stands until 7 days pass with no visit.** The span is one number in the
  shared config, and it is the cookie's expiry and the age past which the server refuses the seal both at
  once, so a copy of the cookie kept past it opens nothing either. A kept login is a cookie sitting on a
  machine and this console is reachable from outside the house, so it is given an end rather than left
  standing.
- **The 7 days are counted from the last visit, not from the login.** Every request carrying a kept
  session reseals it, at most once a minute, and the reseal moves both ends together: the cookie's
  expiry and the seal's own expiry are set 7 days from that moment. A console in use therefore stays
  logged in, and one left unopened for 7 days asks for the password again.
- **The login screen's switch names no span.** It reads 로그인 유지 alone; the span lives in the config
  and this section, not on the label.
- **Which of the two it is rides in the session itself.** Every write of the session reseals the cookie,
  so a write that did not know would silently turn a kept login back into one that dies with the browser
  — changing the account's own name or password is such a write, and it keeps the span the login had.

**The accounts are this machine's login, not only this console's.** A service on this machine that
asks for the same login reads them where they stand, and the console owes it that they keep standing so.

- **What it may do:** open the server's database read-only, find the row of `web_users` by `name`, and verify
  the password against `password_hash` with Bun's own password check. The hash is argon2id, made by
  the account command.
- **What it keeps of its own:** its sessions, its cookie and its login throttle. The console's
  session is never read by it and a login there opens nothing here, nor the other way round.
- **What it never does:** write the table. An account is made, renamed and given a new password here
  alone, and a change here reaches that service at its next login.
- **What that asks of the console:** the table's name and those two columns keep their meaning. A
  change to either is a change to that contract, not to this app alone.

Every screen reads through this app's server, which asks the unit the screen's data is that unit's: rooms and
messages the receiver, verdicts and turns the receiver, execution records and agent logs the agency, the queue
bmo-job (`docs/boundary.md`). The server makes each of those calls through the unit's published TypeScript client,
and the unit's fixed path reaches a browser as it stands under the relay, `/api/<unit>/`. When a unit does not
answer, the screens that read it say so and the rest stand; a room whose receiver does not answer writes that fact
as the input box's placeholder. The box still takes words and files, which wait in the browser until the bot
answers again (the room screen's **대기**).

- **What a screen knows of the control API is one of four things:** it is still asking, the bot took
  the call and did not answer in time, nothing took the call at all, or the bot answered. Not having
  heard yet is not a failure, and a bot that is busy is not a bot that is gone.
- **A late answer and a refused call are told apart where the call is made.** A call the bot's port
  took but the bot did not answer before the wait ran out is the bot being held up — its one thread
  busy — and comes back as this app's 504; a call nothing took, one the control port's front answered
  with the bot behind it not answering (`docs/boundary.md`), or one that broke on the way, is the
  bot being down and comes back as the 503 it always was. The routes that report whether the bot is
  there carry which of the two it was.
- **A screen's own call that this app never answered says nothing of the bot.** A browser offline for
  a moment, or a phone waking with its requests cut, never reached the bot's port at all, so such a
  call leaves the screen's last reading standing, or still asking where it had none, rather than
  reading as a failure. Only an answer of this app's — the bot's state as it reported it, or a refusal
  of its own — moves the reading.
- **A reading other than an answer is asked again on its own clock,** every poll interval until the bot
  answers, whatever the event stream is doing: the stream says when a turn ends, and a screen whose
  one read missed would otherwise stand on that miss until the next turn anywhere.
- **Asking reads 「API 로드 중」 in the quiet colour; a late answer reads 「API 응답 지연」 in the
  warning colour; a failure reads 「API 로드 실패」 in the error colour; an answer reads as
  nothing.** One module holds the four and every screen that speaks of the bot says it through that
  module, so none of them can call a question not yet answered, or a bot merely slow, a failure.
- **A call refused for the login says nothing of the bot either.** It leaves the reading where it
  stood, and the tab goes to the login screen instead.

One kind of path stands outside the login: a console bundle's share page, below its screen path at
`share/<token>`. A link opens one document or file to whoever holds it, with no account and no session.
The page, its bundle's module, stylesheet and words, and the share reads its manifest names are the only
paths that answer without one (bmo-ui's `docs/console-bundles.md`, 「Share pages」).

- **The module and the stylesheet are the service's to give.** They are relayed with no session, no owner key
  and no role, which a service whose manifest names a share read answers as it does its words.
- **The link is the whole key.** Its address carries a token and nothing besides, and every read its page
  makes is a share read: a `GET` or `HEAD` whose path a pattern under the manifest's `shareReads` matches,
  each carrying the token, which the service answers for a live token alone. It is relayed with no session
  and, whoever is signed in, with no owner key and no role, so every holder of the token reads the same. A
  manifest that names none has no share read.
- **What it opens is that one thing** — a document and the pages it refers to, or a file and its
  download — and nothing of the console it came from.
- **It ends by itself.** Every link carries an expiry chosen when it is made, and past that time it
  opens nothing. The owner takes it away earlier where they want it gone sooner.
- **It leads nowhere else.** No other screen of this console stands within reach of it, and the page
  carries none of the console's own frame to reach them by.

## Wording and the language pack

Every word the console shows stands in one file, `client/apps/web/i18n/locales/ko.yaml`, and a screen, a
server route or a shared module names a key into it rather than writing the words. A wording fix is an
edit to that file alone, once the guide below carries the word.

- **The guide behind the words stands at the repository's root, `WORDING.md`.** It holds the principle a
  Korean sentence follows and the console glossary: the one Korean word each console concept is written
  as. A worker writing or changing UI text reads it, follows it, and adds a line when a concept first
  needs its word. No test reads it, and no other repository receives it.
- **The mechanism is `@nuxtjs/i18n`**, set up as the bmo-ui layer asks of its host (bmo-ui's
  `docs/boundary.md`, 「What the host owes」): no locale prefix in the address, the pack in YAML under
  `client/apps/web/i18n/locales/`, the locale declared with the
  `language` the document's `lang` is written from.
  - **There is one locale, `ko`.** A second locale would be a second file every wording fix has to
    reach, so none is kept, and the browser's own language is never asked.
  - Nuxt UI's own words — the command palette, the empty table, a close button — come from its `ko`
    locale; the few keys that locale lacks are supplied from the pack in `app/app.vue`.
- **A key is `<domain>.<role>.<key>`, in lower snake case.**
  - The domain is the screen or the feature the words belong to — `todo`, `research`, `agents`,
    `archive`, `live`, `siren`, `usage`, `app` and their kin. A word two or more domains share stands once under `common`.
  - The role is one of `title`, `label`, `action`, `placeholder`, `aria`, `status`, `message`,
    `error`.
  - A value is read by the vue-i18n engine: a value is filled with `{name}`, a count with `{n}`, and a
    literal `@`, `{`, `}` or `|` is written escaped as `{'@'}`. The pack never uses plural forms.
- **One sentence is one key.** Code never assembles a sentence out of pieces a parameter could carry.
  Where a particle or a phrasing turns on a state, the code chooses between whole keys.
  - A name the pack cannot know — an agent's label read from the archive — is handed in with the particle
    after it already joined, by the console's own particle helper, and the placeholder says so:
    `{subject}` is the name with 이 or 가. A name that takes 의, which never changes, stays `{name}`.
- **A key is always written out whole.** A map from a state to its words maps the state to a key
  written in full; a key assembled out of pieces cannot be found by reading, and is refused.
- **Who asks the pack, and how.**
  - A component asks with `$t` in its template and with the `t` of `useI18n()` in its script.
    - A prop whose default is words has no default: `defineProps` is lifted out of the setup, where
      no translator stands yet. The prop is left unset and the component falls back to its key where
      the words are shown.
    - A sentence that carries markup of its own, a styled name inside it, is one key read through
      `<i18n-t>`, the markup standing in the named slots its placeholders name.
    - A value never begins or ends with a space or a separator. The template compiler drops a
      stretch of bare whitespace standing first or last inside an element, so a space or a ` · `
      that joins the words to what stands before them is written in the template, outside the
      interpolation, where it survives; a space at the end of a span goes after its closing tag.
  - Code in `app/domain/` or `shared/` that has words to say, a pure function and a
    composable alike, never asks for a translator itself. It is handed one of the `Translate` type
    as its first parameter, and its caller passes its own `t`, or `$t` from a template.
  - A table in that code that gives each state or kind its words holds the key instead, and the
    words are asked for where they are put on the screen.
  - The console's server and the tests ask through `shared/wording.ts`, which reads the same pack through
    the same engine. The server resolves a key before it answers, so the message a failed request
    carries and the title a push notification carries are still words, in the shape they always had.
    Where the server calls a function a screen also calls, it hands that function this translator,
    so the two read one text.
  - Client app code takes nothing from that module but the `Translate` type; a screen's words come
    from the module's own instance.
- **No Korean stands in the code.** A string compared against a value, used as an id or a key, sent to
  a unit or matched against what a unit answers is not wording, and stands in the data file beside the pack,
  `client/apps/web/i18n/data/ko.yaml`, read by name; a code file holds none.
- **The pack answers the layer under it.** The bmo-ui layer reads keys of its own from the host's pack
  (bmo-ui's `docs/boundary.md`, 「Wording keys」), so a key it reads counts as asked for, and the pack holds
  every one. A console bundle carries its own pack under its namespace, and the console merges the packs
  of every bundle it extends (bmo-ui's `docs/console-bundles.md`, 「Words」); no bundle's word stands here.
- **Words a unit answers with as codes are rendered here.** A label the console shows of another unit's
  state — a held item's label, a queue place, the parts of a TODO row — comes to it as that unit's code and
  fields, and is rendered from the server's pack (`docs/language-pack.md`), the same words a room is told.
  - **The two packs keep one set of rules** — a folder or a file to a language, keys by domain,
    `{name}` marks, one sentence to a key — and stay two files, since this pack is compiled by
    vue-i18n and the server's is read as plain text with its marks filled.
- **A guard keeps it so** (`client/tests/i18n/wording.test.ts`). It fails on Korean standing in the source of
  `app`, `server`, `shared`, `scripts` or the service worker under `public` of `client/apps/web`, on a key
  asked for that the pack does not hold, on a key the pack holds that nothing asks for — the console or the
  bmo-ui layer — on a key the bmo-ui layer reads that the pack lacks, on a key built out of pieces, on a key
  not named by the rule above, on a value the engine cannot read, and on client app code taking anything but
  a type from `shared/wording.ts`, which would carry the pack into the browser's bundle where the development
  server cannot serve it. A bundle's own pack is not held to this: it is the bundle's, and the console only
  merges it.
- **The pack is large and is opened by its group.** A change opens the one top-level domain it is
  about rather than the whole file.

## Screen

### Fonts

- **Nothing is drawn under 14 pixels.** Caption, metadata, badge, table and secondary text are 14; normal
  body 16; a subtitle or a section of a screen 18; a title 20. The step below 14 is not used by any screen,
  and the stylesheet draws it at 14 as well, so a component of the library that asks for it — a badge, a
  small button, a menu item — stands at 14 too. The code and document editors read at 14.
- **Icons come from Material Symbols,** served by the app's icon endpoint, and the library's own components
  are told to draw theirs from the same set. An agent's mark in the catalogue is a Material Symbols name;
  a seed mark from another set is rewritten to its Material Symbols counterpart when the bot starts. Every agent's
  mark is the one the agency answers for its kind, so the agents of one kind look alike; the console holds no mark
  of its own for an agent, beyond one for an agent the agency answers no mark for. Where a chat agent stands as its
  face (「Profile photos」), the face takes the mark's place.
  - **Every icon a screen names is one the set holds.** A name the set lacks draws nothing at all, an empty
    button with no word to say it failed, so a test holds every Material Symbols name the console's code
    writes to the set the console installs.
  - **An icon first drawn after the page has loaded never redraws the page's letters.** The icon library
    puts the style of each icon it draws for the first time into the page's head, ahead of every other
    stylesheet. A sheet put in ahead of the others makes the browser rebuild its whole set of fonts, and for
    one frame every letter on the screen stands in the system font behind before the console's own comes
    back, so the whole screen lurches and returns. The console has the library's icon styles put in behind
    the others instead: they sit in a cascade layer and match with no weight of their own, so where they
    stand changes nothing they draw.
- **The console's own mark belongs to no icon set.** It is the tab's icon standing on the screen: the mascot's
  controls, each in its own colour and outlined in a darker shade of it, on a rounded square of the mascot's mint
  (「The console's pictures」), so the picture on a tab, on a home screen and at the top of the sidebar is
  read as one. Its colours are the chat agent's own rather than the theme's tokens, so it stands the same in either
  theme. The tab's
  icon is files the page names and the screen's is a component; both are drawn from the same control
  shapes, colours and frame, and a check holds the component to them.
- **The mark is 20 CSS pixels square, the rounded square filling it,** one vector drawing the browser
  smooths at whatever density the screen has.
- **The interface's letters stand in Apple SD Gothic Neo.** The font files are in the repository with
  the app and served by the app itself, so opening this screen involves no outside distributor, and every
  machine reads the same face, a Mac's own copy included. Hangul and Latin come from one family, so the
  two sit on the same line. It is Apple's own typeface, shipped with macOS and under no open licence; the
  owner chose to carry it all the same.
- **Only the four weights the screens actually use — 400, 500, 600, 700 — are carried,** and the rest are
  not. Each is trimmed to the letters Pretendard's subset build carries, the common Hangul among them, so
  one weight is around 185KB. A rare letter outside that range — a playfully invented syllable or Japanese
  kana — is taken by the system font behind it. Of the ten thousand Hangul in the archive, four are such.
  Each face names the ranges it covers, Latin and Hangul and the punctuation and symbols around them, so
  a letter outside them goes straight to the faces behind.
- **The files are built, not taken as released.** `client/apps/web/scripts/interface-font.py` cuts them from the
  release, and puts two things into them the release lacks.
  - Tabular figures: the release carries no OpenType features, so a copy of each digit on one shared
    width is added under `tnum`, and a figure set in tabular numbers keeps its width as it ticks.
  - Lines centred on the Hangul: the release's own vertical metrics leave every line's letters sitting
    low, so the ascent and descent are split again to stand the Hangul's ink in the middle of the line,
    as Pretendard's does. All four weights take the regular's, so a bold word keeps the line's
    baseline.
- **Behind it stands Pretendard, for what Apple SD Gothic Neo lacks.** The release lacks most accented
  Latin, the middle dot, the minus sign and the narrow spaces, so Pretendard is carried cut to exactly
  those, around 33KB a weight, and the two together read every letter Pretendard's subset build carries.
- **The faces are fetched with the page, not after it.** The page's head preloads the four interface
  weights, so they are in hand by the time the first screen is drawn and the letters do not swap from
  the system font a moment after it. Should one still arrive late, letters stand first in the system
  font behind and are swapped in place when it arrives.
- **Monospace letters stand in CaskaydiaCove.** It is Cascadia Code from Nerd Fonts, carried and served
  by the app the same way as the interface's face. What is carried is one weight trimmed to letters, digits,
  punctuation, arrows and box-drawing, so it is 36KB — the icon glyphs that are the reason to carry a Nerd
  Font are not carried. This console draws icons as pictures, not letters, so no screen asks for them, and
  carrying them would make the file thirty times larger. There is nowhere asking for bold monospace, so
  there is one weight.
- **Behind it stands the interface's face.** No monospace font has Hangul. Without the interface's face
  behind, Hangul in a monospace place passes the whole stack to whatever font happens to be on that
  machine, which makes a different face per machine, none of which is this console's face. Standing the
  two in this order makes Latin, digits and symbols come out in the coding font, and the Hangul between
  them in the interface's own face, with Pretendard behind it for what that face lacks — split within
  one line. The system monospace stack stays behind those two, as the place a
  machine still missing both leans on.
- **A place needing monospace stays monospace.** The agent log's tool names, arguments and results, the
  full verdict text, the gate-test screen's answer, the DB screen's column names, DDL and SQL input box —
  the places commands, paths and code stand. Where all that was needed was aligned digits, what was wanted
  was not monospace but tabular figures. A percent on a usage meter or a log's time — a digit standing
  beside a Hangul word — is such, and there the interface's own face is given tabular figures.

- **A number saying how much carries a thousands comma, and a number pointing at what does not.** 116002
  has to be counted digit by digit with a finger to tell hundred-thousand from million, and 116,002 reads
  at a glance. So the archive's row count, length, size and token count all carry a comma. Conversely a
  message number, item number, room number, port, year, which run, which choice — a number pointing at what
  — does not. A comma there is not decoration but makes the value wrong. 「항목 #1,203」 is not the item they
  asked about, and scraped off the screen it is no longer even a number.
  - The comma places are one in the console, the bmo-ui layer's `numbers` module, and one in the server's
    pack readers, and a test on each side holds them to the same places.
  - **The locale is written down.** Called plainly, the browser answers with the reader's setting and the
    server with the process's, and the two need not match. If the server's first frame and the browser's
    re-drawn one differ, the framework throws that place away whole and redraws it.
- **A number that changes as you watch and a number read down a column stand as figures of equal digit
  width.** A value changing every second while read — uptime, elapsed, remaining time — and a value that
  must line up vertically to read — a log's or the siren's time, or usage figures. Ordinary digits differ
  in width per glyph, so a 1 changing to an 8 alone widens the column, and if that column is in a header
  the whole top line shifts every second. So a box holding such a value uses tabular figures — the value
  itself unchanged and only the width fixed, with the Hangul beside it left in the interface's face.
  - **Tabular figures are drawn at geometric precision.** Chromium on Linux rounds each glyph's
    advance to a whole pixel after hinting, so digits of one shared width in the font still land a
    pixel apart on the screen — a 1 and a 3 narrower than the rest at 14px — and a figure ticking
    from 29% to 37% narrows by one. Drawn at geometric precision, every glyph stands at its true
    advance and every digit at one width. The console's stylesheet sets it once on the tabular
    figures class.
- **A figure that ticks in a column, or beside something else on its line, keeps the width of the
  widest it realistically reaches** (`SteadyFigure`). Tabular figures hold a width only while the
  places stay as many; a use going from 9% to 10% or a power from 8.8 W to 82.1 W gains one, and a
  column sized to its content then moves the bars, names and columns beside it.
  - The figure's owner names its widest form — a use at 100%, a temperature at 100 °C, a store full,
    a power at its limit — and that form stands unseen under the reading, so the box is the wider of
    the two and keeps its width from the first frame.
  - A figure in a column whose figures are compared down it stands at the column's end.

### The console's pictures

- **Every icon of the console is the mascot's controls,** its trademark, never its whole figure: the yellow cross pad
  (`#f9e000`) at the left, and at the right the blue triangle (`#6dcdf7`), the small green button
  (`#5db851`) at the triangle's lower right and the large red one (`#ef3538`) under both, at the sizes
  they have on the mascot's front. The installed app's icons, the tab's icons, the home-screen icon, the account
  picture, the notification's small picture and the console's mark are
  all of them.
  - The buttons stand as they stand on the front. The cross pad keeps its height there, but an icon
    carries none of the slot and bars between it and the buttons, so it stands 14 units of the front from
    them, outline to outline, rather than across the front's width.
- **The login screen's logo is no icon and carries the mascot whole:** one drawing of the mascot's front, laid out after
  the mascot's picture with its perspective flattened, the mint body, the pale green screen with the two
  oval eyes and the wide, shallow smile, the dark slot under the screen, the small blue dot at the slot's
  right, the yellow cross pad at the left, the three buttons at the right and the two dark blue bars under
  the cross pad.
  - The drawing is a straight front view. Every button is flat, with no side face and no shadow, since a
    front view shows none.
  - The body is about 3 wide to 4 tall, the proportion the mascot reads at in the photo with the side and the top
    it shows there; the parts on it keep the sizes and the spacing measured off the photo, but for the
    buttons, which stand higher: the red button's bottom edge is level with the bottom edge of the two bars.
  - The icons' controls are this drawing's own, in the same colours and outlines, so the controls on the
    logo and on an icon are the same.
- **Every picture stands in `client/apps/web/scripts/icons.ts`,** the controls' shapes, their colours and the
  rounded square's frame in `client/apps/web/shared/bmo-controls.ts`, which the console's mark reads as well, and
  `bun scripts/icons.ts`, run in `client/apps/web`, draws them all again: the console's into `public/icons/`, each as an
  SVG beside the PNGs of the sizes it ships in. A picture is never edited by hand: the drawing changes and they are all drawn again.
- **Every picture is drawn from vector shapes and smoothed at the size it ships in.** Each PNG is rendered
  from its SVG at that PNG's own pixel size, never shrunk from a larger picture or blown up from a smaller
  one, and no shape is rendered with smoothing turned off, so every edge, the 16-pixel tab icon's and the
  notification's small picture's included, is antialiased rather than stepped.
- **Each control is outlined in a darker shade of its own colour, never in black:** the same hue at a lower
  lightness, dark yellow round the cross pad (`#a68800`), dark blue round the triangle (`#086791`), dark
  green round the green button (`#346d2c`) and dark red round the red one (`#a50d10`). Each control's
  outline colour stands beside its own colour in the shared module.
- **Each icon in colour is the controls on the mascot's body mint (`#5fbb9c`),** the colour the face project
  samples off the official design's pictures (the face unit's documents, 「The colours」); the console's
  themes carry no mint of the mascot's own. The green and the blue differ from the mint by little more than hue,
  and the darker outline is what keeps them apart from it at every size.
  - The app's icon, shown uncut at 512 and 192, as the tab's icon at 32 and 16 and as the console's mark,
    is a rounded square of the mint, its corners rounded by 22.5% of its side and transparent outside
    them, with the controls in it. The controls are wider than tall, so each frame sizes them by their
    width: the app's icon sets them filling 70% of the square's width; the tab's and the mark's, 88%,
    since at their size every pixel of them counts.
  - A picture a platform cuts to a shape of its own has no ground of its own: the whole square is the
    mint, so the rounded shape the platform cuts it to is the mint itself and nothing else shows around it.
    - The maskable icon, which Android cuts to its own shape, sets the controls inside the circle of 32%
      of the side, well within the 40% every such shape leaves whole. The account picture for the
      machine's login is this one, since a login screen shows an account as a circle.
    - The home-screen icon at 180, which iOS rounds itself and which would have its transparent corners
      painted black, is the whole square with the controls filling 70% of its width.
- **The notification's small picture is the controls' silhouette:** the cross pad and the three buttons,
  each filled with its outline, and nothing else.
- **The notification's small picture is 24dp square,** drawn once and rendered at 24, 48 and 72 pixels for
  one, two and three device pixels to a CSS pixel, with the controls standing 2dp in from its sides, the
  margin Android keeps clear around a status-bar icon, so the platform never crowds it against its
  neighbours. Android paints every opaque pixel in a colour of its own, so the silhouette's soft edge is
  carried by the alpha channel.

### Colour

- **The colours are the library's semantic tokens** — primary, secondary, success, info, warning, error
  and a neutral grey, the primary and the neutral named by the account's theme (「Themes」). A light
  theme paints each from its 500 shade and a dark one from its 400.
- **A coloured badge's words read at 4.5:1 or better in both themes.** The 500 shade the light theme
  paints with is a fill colour: as text on white or on its own tint it reads at 1.8 to 3.3, and a white
  word on it at under 4. So in the light theme every badge takes its colour tokens from a darker shade
  instead — the 800, the step at which every colour still reads on the elevated surface under its own
  tint — set once on the class every badge carries rather than badge by badge. Each of the four shapes
  — solid, outline, soft and subtle — stays the shape it is: the solid badge's fill darkens under its
  white word, the others' words darken on their own tint. The dark theme's 400 already reads at 5 or
  better and is left as it is.
- A check paints every colour in every shape on each surface a badge is read on — the page, the muted
  one and the elevated one a card or a hovered row lays under it — in both themes, and measures the words
  as the browser drew them. The accented surface is only a press, and no badge is read on it.

### Themes

- **Each account reads the console in a theme of its own choosing,** kept against the account on the
  server, so it follows the person to every browser and device. An account that never chose one,
  and a screen read before anyone has signed in, reads 청록.
- **A theme names the accent and the grey, and nothing else:** the accent (the primary token) and
  the neutral grey every ground, surface, edge and letter of the page is read from. The focus ring,
  the badges and the name colours keep the steps they take of the tokens, and a bubble's grounds are
  the palette's (「Palettes」), so choosing a theme changes everything but the bubbles.

  | Name | Accent | Neutral |
  | --- | --- | --- |
  | 청록 | teal | zinc |
  | 바다 | sky | zinc |
  | 숲 | emerald | stone |
  | 보라 | violet | mauve |
  | 노을 | orange | stone |

- **A theme is one entry of the console's theme list,** carrying its name and its two colours; the
  page, the settings' list and every contrast check read the list, so a theme added there is offered,
  drawn and checked with nothing else changed.
- **The screen mode stands beside the theme and apart from it:** 시스템, 밝게 or 어둡게, kept in a cookie
  of the browser (「Sidebar」), and every theme is drawn in both modes.

### Palettes

- **Each account chooses a palette for the conversation's bubbles,** apart from its theme and kept
  against the account the same way. An account that never chose one reads 청록.
- **A palette names the bubbles' grounds, and nothing else:** the owner's ground and everyone else's,
  each in the light mode and the dark. Every ink and surface inside a bubble is computed from its
  ground (「The conversation's measures」), its hues the theme's colours, so choosing a palette changes
  nothing outside a bubble.

  | Name | The owner's, light | The owner's, dark | Everyone else's, light | Everyone else's, dark |
  | --- | --- | --- | --- | --- |
  | 청록 | `#d8f3f3` | `#17504f` | `#f4f4f5` | `#27272a` |
  | 바다 | `#dceafa` | `#1b3d5c` | `#f4f4f5` | `#27272a` |
  | 숲 | `#dcf2e3` | `#1d4a33` | `#f5f5f4` | `#292524` |
  | 보라 | `#ebe5fb` | `#3a2d63` | `#f3f1f3` | `#2a212c` |
  | 노을 | `#fce5d8` | `#5a301f` | `#f5f5f4` | `#292524` |
  | 레몬 | `#fbf0b3` | `#4a4216` | `#f4f4f5` | `#27272a` |

- **A palette is one entry of the console's palette list,** carrying its name and its grounds, read
  by the page, the settings' list and the contrast checks as the theme list is.
- **A palette that shares a theme's name shares its id,** and the theme table, when it is made, takes
  each account's palette as its theme as well, so an account keeps the colours it read the console in.

### Both on the page

- **The page stands in the account's theme and palette from its first frame.** The server reads both
  for the page it sends and states their colours in the page's head, over the library's own, so even
  the ground painted before any stylesheet arrives is the account's.
- **Every pair keeps the console's contrast promises in both modes.** The checks of a bubble's inks and
  surfaces and of the code themes' token colours on a code block's ground, inside a bubble and out,
  run over every palette under every theme; the checks of the badges and of the focus ring run over
  every theme.

### Focus

- **No screen focuses an input on arrival; focus follows a user action.** Opening a screen — the console's
  own, the login screen among them, or one a unit brings — never puts the caret in a box, since on a phone a
  focused box raises the keyboard over the screen the person came to read. A box takes the focus when the person
  asked for it: pressing reply, opening a dialog or a drawer that is there to be typed in, starting to edit a
  cell. The component library's chat prompt focuses itself as it mounts unless told not to, so every place that
  draws one tells it not to; a test reads the console's pages and layouts for a box focused on arrival and its
  chat prompts for one left to focus itself.
- **Focus is shown only where the keyboard put it.** A control focused by a press of the mouse or a
  finger draws nothing; one the keyboard reached — Tab, an arrow along a list, a dialog handing focus
  back after a key closed it — draws the focus ring. The browser's own `:focus-visible` tells the two
  apart, and nothing in the console draws a ring on `:focus` alone.
- **The ring is one style for the whole console,** three custom properties on the root of the
  console's stylesheet.

  | Name | Value | For |
  | --- | --- | --- |
  | `--bmo-focus` | primary's 600 in the light theme, its 400 in the dark | The ring's colour, the theme's accent at the step that reads at 3:1 or better on the page, the muted and the elevated surface. |
  | `--bmo-focus-width` | 2px | How thick the ring is. |
  | `--bmo-focus-gap` | 2px | How far outside the element it stands. |

  - The ring is an outline, so it follows the element's own corner radius.
  - A row inside a box that clips what stands past its edge — a scrolling list, a tab bar, a table —
    draws the ring inside its own edge instead (`focus-inset`), at the same width.
  - It is set on the stylesheet's base for every element, and over the colour and width the component
    library gives its own controls, so no component names either; a test fails on a focus colour or
    width written beside a component.
  - A library control that redraws its own edge on focus keeps the edge it rests with: the ring alone
    says it has focus.
- **A field shows focus on its own edge, with no ring.** A text box, a number box and a select — a
  place a value is typed or chosen in — takes the accent on its edge while it holds focus, and a field
  drawn with no edge takes the elevated background instead. A text box shows it however it was
  focused, since the caret is in it either way.
- **The message box shows it on its bar.** The chat prompt every box written to is built on — the
  console's `ChatInput` and the gate screen's — draws no ring around itself or its text. While its
  text holds focus, the bar's background steps from the half-elevated tone to the elevated one; only
  where the keyboard brought the focus there does its edge take the accent as well. A press of the mouse or
  a finger in the box changes its colour alone. Its buttons draw the ring when the keyboard reaches them.

### Corners

- **Every corner of the console takes one of four tiers,** all read off the component library's one radius
  (`--ui-radius`, 4px), and nothing is given a radius of its own: no arbitrary value, no radius written inline.

  | Tier | Value | For |
  | --- | --- | --- |
  | small | 4px, the radius itself | A chip and a badge, the library's own for its small badge, all one height side by side; and what stands 4px inside a large box's corner: a button inside the input box, the time standing over a picture. |
  | medium | 6px, one and a half times it | A button, a field, a quote or a highlighted line inside a card or a bubble: the library's own default for each. |
  | large | 8px, twice it | A box that holds others: a card, a panel, a message bubble, the input box, an item of a list drawn as a card. |
  | round | a circle | A face, a dot. Nothing else is round. |

- **What stands inside a rounded box near its edge follows that box's corner.** An element closer to the box's
  edge than the box's radius takes the box's radius less its inset, so the two curves are concentric; one
  standing the radius or further in is clear of the corner and takes its own tier. A picture running to the
  edge takes no corners of its own and is cut by the box's.
- Chips and badges that stand side by side are one tier, one height and one padding, whatever each says.

### Usage in the title bar

- **On any screen, what the slot the chat runs on has left stands at the right of the header.** The slot is
  named — its provider, and the login where the provider holds more than one — and beside it stand two
  windows, **session** (a 5-hour window) and **weekly** (a 7-day window), each as the share remaining, read
  yellow at 40% or under and red at 10% or under.
- **The slot is the agency's answer, not the screen's pick.** The agency names the agent serving the chat now:
  the provider its road answers on and, where that provider holds logins, the one it walks to now (the
  agency's `docs/cache-fallback.md`), with that slot's own session and weekly windows. So the bar follows the
  runs rather than the head of the account list, and it changes when the road moves on; another key
  answering on the provider it was set to, such as a gate on a registered model, does not move it. The
  provider stands under the label the agency gives it. With one login there is nothing to tell apart and
  the bar names none. A window belongs to the login that reported it, so a figure with no login named
  would be a figure about nobody, and the bar never borrows another login's figure for the slot.
- **A figure the agency does not state stands as a dash.** A window of the slot that the agency names
  no reading for reads 「—」; a slot on a provider that holds no login and reports no window — a provider
  paid by the request — stands as its name and what it has left in money, 「잔액 US$25.60」, where the agency
  reads a balance for it, and as its name and 「남은 사용량 —」 where it reads none, since there is no limit to
  show; and where the agency names no slot at all, the bar shows dashes. No figure is guessed or carried over from
  another slot.
- **There is one axis.** Standing a token count beside the percent would have that count read as a
  percent too, so no tokens stand in the title bar or in its panel.
- **At phone width the two fold into one meter icon.** Standing both percents would eat enough room to cut
  the room name off. The folding boundary is the width where this display used to hide its label (sm), not
  a newly made number. Even folded, what should be known is told — the icon stands in the loudest of the
  two windows' colours, so if either is red the icon is red. Pressing that place opens the same panel
  whether folded or not. Folded, the login the figures are of is named in the mark's own tooltip, since
  there is nowhere else on the bar to say it.
- **The panel is each account's remaining usage, and nothing else.** Every registered Claude account
  stands as a group of its own, in the order the agency lists them and under the name the owner gave it,
  holding that account's own session and weekly windows as the share remaining, each with how long is left
  until it resets; the account the chat runs on now is marked 「사용 중」. Where the chat runs on a provider
  that holds no login, that slot stands first as a group of its own, marked the same way, with whatever
  windows it reports. A slot or an account the agency reads a balance for — a provider paid by the request, an
  endpoint account — carries it as a row of its own: 「잔액」, the amount in its currency, and how long ago it was
  read. An account whose windows and balance the agency states none of says so in one line rather than
  standing a figure, and with no account registered and no slot named the panel says there is no
  account. No tally of tokens by model, gate or user and no list of saved sessions stands in it.
- **The panel keeps to the window and scrolls inside it,** since what stands past the bottom of a panel
  that does not scroll is drawn where nothing can reach it.
- **It leads to the accounts.** The panel's own heading carries the way to the Claude 계정 list,
  where the logins, their order and their switches are — what the figures are read against, and the
  only place any of it is changed.

- **Tokens stand as four — 「읽기」, 「쓰기」, 「캐시읽기」, 「캐시쓰기」 — with 「총 …」 beside them.** Those
  four are the tokens one run reports: what was sent, what was written, what was read from cache, what was
  newly written to cache. A continued session resends the same prefix each turn, so the cache-read share
  is most of the total, and the total of the four only rises the whole life of a session, so it is no
  answer to what used how much. Nor are the four folded into one — which value is being asked is the
  reader's to decide, and a figure chosen for them is no answer to their question. Nor is the total hidden
  — the traffic exchanged is a fact of its own. On a narrow row the two caches fold under one name as
  「캐시 읽기 / 쓰기 A / B」, and even then both values stand in full.
- **What one answer spent stands as one figure: the tokens it wrote.** It is the token chip on an agent's
  answer's chip line on the room screen, beside a run's end on an agent's screen and on a job
  worker's job line (「Room screen」, 「Agent screen」): the token mark and one figure, 「50K」, with no letter and no word. Read, cache read and
  cache write are what each request carried in, and a continued session carries the whole of itself in
  again on every turn, so they say how long the session has grown rather than what the answer made; they
  stand only in the chip's spread. A round none of whose runs was measured reads one 「—」.
  - Pressing the chip spreads one line per run, each with its four kinds as one bar (below): 「읽기」,
    「쓰기」, 「캐시읽기」, 「캐시쓰기」 named beside their figures.
  - No screen header and no room's session info carries a week's or an all-time total in this form.
    The question the chip answers is what one answer cost, and a stretch's total says nothing about any
    one answer.
- **Where a row's four stand as one bar,** the row's name and 「총 …」 stand on the top
  line, below it one track crossing that row's total cut into four shares, and below that the four names
  lie horizontally in one line with their coloured dot and figure — folding onward if room is short. The
  width is each's share of that row's total, so what ate the row is read before the figures are summed by
  eye. The four divide the total with nothing left, so no note is added below the bar — a track filled to
  the end is that note. Where a row that could not take its share is mixed in, the track ends short by that
  much, and naming the shortfall is the 「분리 전」 line below.
- **A share too small to see is drawn unseen.** A read of 1.5K standing beside a cache-read of 182.7M is
  not a hundred-thousandth, so it is not even one pixel on screen. Still no minimum width is given — in a
  picture where width is the share, a minimum width overstates that share hundreds of times, and this
  console does not let a picture say what a figure did not. So nothing is hidden either: that kind stands
  in the legend with its dot, name and figure, and a figure that size is read there anyway.
- **The bar's look** — thickness and legend shape — comes from one place with the TODO item's time bar.
  Writing the measurements per screen would drift the two apart bit by bit whenever one is touched, and
  nobody spots two near-identical pictures drifted apart.
- **This bar stands only where several shares divide one thing.** That the track's length is the whole and
  a piece's width is that share is all this picture says, so standing it on a non-division makes the picture
  say what a figure did not. So it stands in three places — a run's or a job model's row and a home-screen row's
  weekly tokens (four divide the total), a TODO item's time bar (spans divide the total time), a room-stats
  card's messages (people and each of the room's agents divide that room's messages). Where it does not stand is as clear. A
  limit's percent has one share, not a division; the siren's per-minute bars and room-stats' time-band bars
  are sizes laid along time, not one cut; and the most-talkative people is the top few picked out, dividing
  nothing exhaustively — a track ending short is stood only where the reason is told beside it.
- **「총 …」 is the four summed.** One model's share in one run is one row, and that row carries the five
  figures that run reported — the four, and their sum. So when every row in a window holds its share, the
  two figures standing side by side on screen do not disagree, and whoever summed the four by eye lands on
  the total beside them. If any row in the window could not take its share, they part by that much, and
  naming the parted share is the 「분리 전」 line below.
- **A row with no way to measure its share is not filled with zeros.** Such a row holds only the total with
  the four empty, and writing 0 there is a claim that nothing was read or written, which is false. Such a
  place stands nameless as one 「—」. A name attaches to a present value, so standing a name before an absent
  one says the absent is present. With no share to divide, no bar stands either — a standing empty track
  would be a picture saying it was measured and found empty, reversing what the 「—」 beside it says. And if
  any such row is in the window, 「분리 전 N건 …」 stands below it saying how much of the window the standing
  figures fail to cover. With none, that line does not stand.
- **When each window resets stands as how much is left** — over a day 「1일 3시간 후 초기화」, within a day
  「3시간 20분 후」, within an hour 「20분 후」, under a minute 「곧 초기화」. Units are stood to two, and a
  second unit of 0 dropped, and seconds are not counted — a value changing every second is not news but a
  flicker and shakes the line. If the reset time already passed, instead of counting back from 0 it writes
  「초기화 지남」 — the account tells its window only when a run answers within a new window, so a passed time
  standing means the old window still stands. The time the account gave rides on that line and comes up on
  hover. The same context value stands in that agent's screen header too. The value is written to the
  archive whenever the bot answers, and the screen rereads on the bot's word that a turn ended, so it
  changes soon after a run ends.

### Deployment in the title bar

- **While a deployment runs, every screen's title bar says so.** A mark stands at the head of the bar's
  right end, before the queue button and the usage figures, from the moment a deployment begins until
  a short while after it ends, and nothing stands there otherwise. It reads the testbed's progress
  record (the testbed's `docs/deploy.md`, 「What a deployment says of itself as it runs」) of every unit
  whose deploy root `DEPLOY_ROOTS` lists, `deploy-progress.json` under each, so a deployment of any unit
  shows; a console that lists none stands no run.
  - **Which run stands.** A run under way stands before any that has ended, the one begun last where
    several run at once; with none under way, the one that ended last. For the administrator the run is
    named by its unit, the deploy root's own folder name, at the head of what the mark says after its
    state: 「배포 중 · bmo-web · 빌드 · 2:14」; a member hears only that a run is under way (「Access」).
  - Wide, it is a spinning mark, 「배포 중」, the stage and the time since the deployment began,
    ticking each second in tabular figures. At phone width it is the spinning mark alone, its words
    in its tooltip.
  - Pressed, it opens a popover: the commit and what it carries — every commit since the deploy that put the
    release before this one live, oldest first, each by its short hash and subject — then the stages, and the last
    lines of the deployment unit's journal, read with `journalctl` again every few seconds while the popover
    stands. A commit whose subject names an item (`#NNNN`) opens that item in the TODO panel, as the hold's items
    do. The carried commits are read from the deployed log and from the build tree's own git log between the two
    deploys; the release's version commit is its marker rather than work it carries, so it is left off, and a
    deploy that carries only that one still shows it.
  - The stages stand whole from the run's first moment, in the order of the run's plan — 검사·테스트, 백업,
    릴리스 준비, 빌드, 전환 전 단계, 서비스 재시작, 헬스 체크, 마무리, and 롤백 where one is put back
    (the testbed's `docs/deploy.md`, 「What a deployment says of itself as it runs」) — so what is done, what is under way and what is
    left read at a glance: one passed carries a check and how long it took, the one under way a
    spinning mark and its time ticking, each one still to come an empty circle and muted words, with
    no time.
  - Under each stage stand its heavy steps by their names — a part of the backup by the part alone,
    스냅샷, 압축, 확인 — told the same three ways: one ended carries a check and how long it took,
    its wait for the machine's turn and its run together, a failed one in the error colour with its
    exit code; the step under way spins with its time ticking; the steps written as ahead stand
    with an empty circle, in order. So the steps of the stage under way add up to its time, the
    running one included.
  - The quieter the row, the further from now: an ended step a step quieter than the one under way,
    one still to come quieter again, each still reading at 4.5:1 in both themes.
  - Once the run has ended or been cut off, nothing still to come stands: only what happened.
- **A deployment's hold on the queue stands in the same place** while no run is under way, in the warning
  colour: 「배포 대기 · #1389 끝나면 올라감」, the items whose Jobs must end before the batch goes up, or how
  many Jobs where their items could not be read. The hold is bmo-job's, read from its `GET /queue/holds`
  as the TODO panel reads it. How long it may wait is not a time the deployment ends, so the mark never
  says it.
  - Its popover is the one place the hold stands whole: what goes up, each item by number and title; the
    Jobs it waits for, by their items' numbers and titles and each with why; what the batch takes away;
    the limit, said as what happens then — 「02:37까지 끝나지 않으면 대기를 해제합니다.」 — and the 해제
    button, which lets the hold go. A hold standing with no run behind it is shown the same way.
- **The end stands for two minutes, then goes:** 「배포 완료」, 「배포 실패 · 롤백」, 「배포 실패」,
  「배포 안 함」, or 「배포 중단됨」 for a run whose process went without ending its record, each with the
  run's unit after it. The record says why a
  run put nothing live in the testbed's own English sentence and with no code, so the mark says the outcome
  alone. Its
  popover is the same as the run's, with the outcome at its head.
- **A page older than the console being served says so.** Where the build the console server runs
  differs from the page's own, the mark is the deploy icon, Material Symbols' updated deployed code, as an icon
  button in the accent colour at every width — the title bar's own icon button, its words 「새 버전 · 새로고침」 in
  its tooltip and its accessible name; pressing it loads the page again, as the popover's 새로고침 button, which
  wears the same icon, does. The mark stands in the place the running mark spins in and trades places with it
  whenever a run of any unit begins or ends, so it is never a circular arrow, which there reads as the spinner
  turned into an arrow; while a run goes, the mark is the plain spinning progress mark, an arc with no arrowhead.
  It is read every time the stream opens, which it does again once
  bmo-web is back from a deployment's restart.
- **It is told live, and stands through the units' restarts.** The console server looks at the progress
  record and the run's process every second and tells every open tab's stream a `deploy` word when
  either changed; a tab reads the deployment again on that word and every time its stream opens. None
  of this goes through a unit, so a unit's restart leaves the mark as it was; bmo-web's own restart
  breaks the stream for a moment, and the stream that opens again reads it afresh.
- **One mark opens at a time.** The popover opens on the mark of the screen standing, and only there. A screen
  the router keeps set aside keeps its own mark, which never opens while it is set aside: it has nothing on the
  screen to hang from, and would stand at the window's corner beside the real one.
- **The title bar is the only place a deployment stands.** Nothing under a room's conversation says it, since
  it is no run of that room.
- **A member is told only that the chat agent is being updated:** 「업데이트 중」 and the time since it began, and
  the 「새 버전」 mark. Pressed, it says that answers may be slow until it ends. The route hands a member
  nothing of what goes live or how.

### Profile photos

- Rooms and people stand with the photo kept for them: the one the archive keeps, or else the one their chat
  service shows — a room the receiver numbers itself, such as a room made for a companion, and the numbers it gives
  a companion and the chat agent there wear the archive's. The room in the sidebar and that room's
  the chat agent, the room header and beside a bubble are all the same photo. The chat agent stands with its own photo too. The
  photo beside a bubble attaches to the side that bubble stands on — words on the left on the left, words on
  the right on the right.
- **Every chat agent stands the same way, wherever it stands.** The chat agents are equal, so each stands as its
  own face on the agents page, in the sidebar's agent branch, in the search, in its own screen's bar, in a room's
  header and beside its bubbles: the picture kept for the person number its words stand under, as the receiver
  names that number in the owner's room, in a room it is a companion of or in any other room it answers, or else
  the picture of a room made for it; failing both, the first letter of its label on its identity's colour.
- **An agent's words wear the agent's face in every room.** The receiver names the agent whose words a message is
  on every send it makes, so each agent that speaks in a room — the chat agent, a companion — stands with its own
  face beside its lines, on a chat service's road and on the record road alike, where its words stand under no
  number of their own. A notice the receiver says in a room's voice wears the face of the agent the room answers as. A room's own session wears that
  room's picture. Where a chat agent stands as a mark instead, it is the mark the agency answers for its kind,
  as every other agent's is (「Fonts」).
- **A picture is set in the console as readily as a provider hands one in.** A picture is the receiver's to keep,
  filled by a chat service handing a person's or a room's photo in and by the console setting one (the receiver's
  `PUT /avatars/{kind}/{subject}`, its `docs/api.md`); the newer of the two stands, and an agent's picture is the
  console's alone, never a provider's. The console sets three:
  - **an agent's,** by its registration name, on its own page — the 사진 button beside its name, for the
    administrator — and in a companion's settings, the picture standing under every number the agent's words stand
    under;
  - **a room's,** from the room's menu, 방 사진, for the administrator;
  - **one's own,** in 설정 › 계정, 프로필 사진: the sender linked to the account, the owner's for the administrator.
  Each is one shape: the picture standing now, 사진 고르기 picking a file, the picked one shown in its place with
  저장 and 취소, and 제공자 사진으로 되돌리기, which drops the console's picture so the provider's stands again (the
  receiver's `DELETE`). A refusal is said in the pack's words for its code — too large, not a picture, an agent
  with no number yet. Every screen takes a changed picture as the receiver tells of it, and the screen that set it
  at once.
- **A place with no message yet carries the same photo as a message.** The line standing while the chat agent thinks
  carries the same photo on the same side as the chat agent's answer that will stand there, and a line being sent
  carries the sender's photo. So even when an answer or message actually arrives, the photo does not change
  and the line does not shift. If the chat agent has never spoken in that room and there is no photo to choose, it
  stands as its letter, as every chat agent does.
- **A photo opens whole when pressed.** A face beside a bubble and the room's photo in the room header are each
  a button that opens that very picture large, in the same viewer; the header's is the room's own picture,
  which in a room made for a companion is the companion's. A room or a face standing as its letter has no
  picture to open and is no button.
- **The photo is fetched by the owner's account.** A bot account cannot see others' profile photos, and only the
  reader sees what the Telegram client sees. A fetched photo is kept by the bot as a file in its own
  directory, and the archive's table records which photo it is and when it was received. The screen only
  reads that file, and opening a screen never calls Telegram.
- **A changed photo the bot follows on its own.** Telegram numbers each profile photo and that number changes
  when the photo changes, so the bot occasionally checks only rooms' and people's numbers and fetches only
  what changed. The address the screen calls a photo by carries the time it was last received. So opening the
  same room twice uses what the browser had, and after the photo changed the address differs and it is
  refetched.
- **A person or room with no photo has the first letter of its name stand instead,** in a colour
  drawn from its own identity, so two of them are never the same mark. One identity is always the
  same letter in the same colour wherever it stands — sidebar, room, mail — because a list whose
  names are gone is read by that mark alone. The console decides it in one place, and every list
  that folds its names away asks that one place rather than drawing a mark of its own. There is no
  place a broken image stands. A chat agent with no photo stands as its letter like everyone else.
  - **A person's or a room's letter stands on the hue its name is drawn in.** The circle takes the 700 step of
    the one of the conversation's eight name colours chosen by the same number (「The conversation's measures」),
    so a person's face and the name at the head of their bubble are one colour, in every theme; a private
    room is its person's number, so it wears the same hue in the room list. Everything else that stands as
    a letter — a mail address, a machine — keeps the console's tones drawn from its own key.
- **A companion stands with the picture it carries, and a room made for it with the one its seed names**
  (the agency's `docs/companions.md`). Neither is a Telegram photo, and no unit serves them yet, so a companion, a
  room made for it and the chat agent's face under the console's numbers stand as their letters
  (`docs/boundary.md`, 「Gaps the console meets」). Where a unit serves them, a companion's picture stands
  beside its name in every room it speaks in, and on its own room in the sidebar and its header; a room made for
  several companions wears none and stands as its letter; and the chat agent, speaking in such a room under a
  number of the console's, wears there the face it wears in the owner's own chat.
- The photo is in the same place as the rest of this app. It does not open without login, its address is made
  only of a room or person number, and no file outside the bot's photo directory goes out on any request.

### Sidebar

- Dragging the sidebar border to adjust its width does not cap the maximum. Even on a narrow window it can be
  widened past a fixed proportion of the screen width, unbound.
- **Search stands at the top of the sidebar, under the console's mark** — Nuxt UI's `ContentSearchButton`, opening
  `ContentSearch` as a command palette. Ctrl+K (⌘K on a Mac) opens and closes it from anywhere, in a text box
  too; nothing else in the console takes that key. Folded to icons, the button is the search icon alone with
  its name as a tooltip; in the phone drawer it is the full-width button. The console has no `@nuxt/content`:
  the module's `content` switch registers the two components, and the palette is handed its groups directly.
  - It finds what the sidebar lists and nothing else: the screens, each tab a screen keeps in its address as an
    entry under that screen, the rooms, every agent in its branch and every node under 노드 — so a worker
    the owner adds is found the moment it stands in the sidebar. A folded branch is found all the same. A node is
    found by its internal name and its address too.
  - The typed phrase is matched through the console's shared list search, the same way every list matches.
    What a row shows — its name and the group it stands in — is marked where it matched; an agent's internal
    name, a room's chat number and a screen tab's key are matched too, and a hit only there shows as one line
    under the row.
  - With nothing typed it lists every entry. Choosing one goes to its screen and closes the palette and, on a
    phone, the drawer. The palette is a layer: the back gesture closes it. It carries no theme group — the
    screen mode is the user menu's.
  - The screens and their tabs are one list in the code, read by both the sidebar and the search, so a screen
    added to one is in the other. A screen a unit brings takes its manifest's own title and icon, merged into
    the list from the manifests the reader may open (「Screens a unit brings」); one whose address no screen of
    the list holds stands after them.

Four groups.

- **Live status** — always one at the top. Below it stand, in this order, **mail**, **cache siren**, **DB**,
  **파일**, **아티팩트**, **document viewer**, **code review**, **agent management**, **monitor**, **게이트** and
  **remote**, and after them any other screen a unit brings, the brain's among them. Live status, cache siren, DB,
  document viewer, agent management and monitor are the console's own and always stand; mail, 파일, 아티팩트, code
  review, 게이트 and remote, and the screens after them, are the units' own and stand only while their unit answers
  its manifest, under the manifest's own name and icon (「Screens a unit brings」). The monitor's second tab is the
  card board; `/cards` leads there.
  This group does not fold — it is a flat list of screens with no branch to fold, and the fold the sidebar
  remembers is only the agent group's below.
- **Rooms** — the rooms stand in the order the receiver's room list gives them, the pinned first. The owner's private
  chat is the room the receiver's `GET /owner` names — a room the console made on the record road as readily as a chat
  service's one-to-one — and stands under the chat agent's label; every other room, the owner's chat-service
  one-to-one among them once it is not that room, stands under its own title. A one-to-one with no title of its own is
  called by the person whose number it is, as the receiver names that person, and a room with no name either comes up
  as a chat number. A room the console made itself — one made for companions — stands from the moment it is made, before any
  word is said in it; until then it stands after every room that has words. Choosing a room shows that room's
  conversation.
  - **The 추가 button beside the group's name adds a room,** for the administrator, in a dialog of three choices made in
    turn, each offered by what the chat service declares and never by its name (the receiver's `docs/api.md`,
    「Rooms」):
    - **A chat service:** every one the receiver names that takes a mode, each with the modes it states said
      under the choice. One that neither lists its account's rooms (`listsRooms`) nor its contacts
      (`listsContacts`) is still offered, and says in one sentence that nothing can be added from it here.
    - **A room, in one of two tabs.** 기존 방, where the service lists its rooms, holds them page by page, each
      with its title or number and kind; a room the receiver already holds is marked, by its mode where it was
      added (and not chosen again) and as 이미 있는 방 where it was never added. 새 대화, where the service lists
      its contacts, holds every contact with a search over their names, each marked 사람 or 봇 and, where the
      account already has a one-to-one with it, marked as that room is. Choosing one contact starts a one-to-one
      where the service starts one (`startsChats`); where it starts groups (`startsGroups`), several may be
      chosen, and a group's name is then asked. A service that lists contacts but starts neither shows them and
      says that it starts no conversation. A tab the service does not offer does not stand.
    - **A mode** among the service's `roomModes` — 아바타, the room's agents answering under the owner's account,
      offered only where the room's own modes, where the service states them, hold `human-avatar`; or 기록 전용,
      the room read and recorded and never answered — each said under the choice, with a title that may be left
      empty, which a group needs.
    추가 posts the choices, the receiver asking the service to start a conversation first where one was chosen
    from the contacts, and the room stands in the list at once. A refusal the receiver answers with a code is
    said in the pack's sentence under the dialog: a service that lists no rooms or no contacts, a conversation of
    a kind the service does not start, a contact it does not know, a start it refused, a room the service does
    not know, an avatar mode the service does not hold active, a room already added, a service that did not
    answer. The dialog keeps no unsaved-changes guard: it opens, lists, adds and closes, and closing it asks
    nothing whatever was chosen.
  - **A room carries how many of its messages the reader has not read**, as a number at the line's end
    (「Unread messages」); folded to pictures, a room with any carries a dot on its picture's rim at about two o'clock instead, where a
    badge conventionally sits, placed from the picture's own centre so the row's width does not move it.
  - **A room moves to its new place rather than jumping there.** The rooms are a moving list
    (「Motion」): when a message lifts a room up the list, the room slides from where it stood to
    where it now stands while the rooms it passes slide down by one line, its count changing as it
    goes, and a burst of rooms moving close together carries each on from wherever it had reached.
    The menu keys its rows by position, so each room is a menu of its own one entry in a row of the
    moving list, keyed by the room, and the rooms stand under one navigation landmark.
  - **A room whose registration is removed leaves the list at once,** at the `room-removed` event
    (「방 등록 삭제」), as the moving list takes a row away; a pinned number it leaves behind is passed
    over as any number the receiver no longer has.
  - **Pinned rooms stand above the rest, in the order they were pinned.** Which rooms are pinned and in what
    order is one setting the receiver keeps, a list of room numbers (the receiver's `docs/store.md`,
    `console_pinned_rooms`), so a room renamed keeps its place and a number the receiver no longer has is passed
    over. The console reads it through the receiver's room list, each room's `pinned`, and every room not on the
    list stands under them in the order above. A room is pinned and let go from its own screen's menu
    (「고정」), and the receiver writes the order.
- **Agents** — every one of the chat agent's agents stands. Choosing one shows that agent's log. The list is not held by
  this app but comes from the archive's `agents` table. The name is as written there, and each stands as 「Profile
  photos」 says — a chat agent as its face, a worker with the one worker mark — so if the owner makes
  one more worker, that worker stands in this list under its own name. **It lists the agents a person designates
  and the workers, and nothing else:** a row of the `chat` kind holding a role, and a row of the `worker` kind. The
  rows the agency keeps for the gate unit's sessions — the `gate` kind, and a `chat` row holding no role — and the
  runners' rows never stand here, whatever the agency lists: a gate stands on the agent management screen's 게이트 tab, a runner the agent
  screen's 서쳐 tab's. The same holds for the agent management screen's lists of agents. Grouped in branches, one
  per group of kinds, each branch read from the kinds of the rows and naming no agent:
  - **지정된 에이전트** — every designated agent: the chat agent and every companion, side by side, each under
    its own label, so another companion stands here the moment its row does. Under each stand its room
    sessions: the chat agent's one per room a session was recorded for, a companion's one per room it answers, each
    named by its room's name, in the order the rooms stand, and each opening the agent's log at its last line
    in that room — or at the log's end while the room has none. The owner's private chat stands not as a chat number but as the name the language pack gives it. A room name is
    the same everywhere on screen, so nowhere — sidebar, live status, log header — does a number come up
    as is. The branch's name stands until the owner names it otherwise.
  - **Job workers** — the worker. On screen this branch is labelled 저장소, the name the group goes by
    wherever it stands: the sidebar, the home page and the live status tab.
- Workers always stand whether or not the bot answers. An entry carries its name and
  nothing that grows beside it, so the name is never crowded out. A currently running agent gets a spinning circle —
  so that seeing the list alone tells what is alive, it carries a turning mark, not a stopped dot.
- **The branches each fold and unfold, and how each branch stood is remembered by that browser.** Not
  only the folded but the unfolded is remembered, so a branch deliberately left open is open next time too. A
  branch never touched has nothing to remember and stands open — the reason this group exists is to have the
  whole catalogue at a glance, so a branch folds only when the owner folded it. The memory of a branch not on
  screen now is not touched. The the chat agent branch stands only when the bot answers, so folding another branch while
  the bot is gone does not erase that branch's memory. If a stored value is not a branch-name/yes-no pair —
  hand-written in, or a shape this console no longer uses — that value is discarded and that branch stands
  open. Folding is not a matter of screen width, so while the sidebar is folded to icons alone a branch cannot
  be opened or closed and the memory stays.
- **A branch is one control.** The row naming a branch and the chevron at its end are one button, so the
  branch's id stands once on the page and the list its `aria-controls` names is that branch's own — a
  screen reader and keyboard movement reach the branch they were sent to.
  - That holds in the phone's drawer too, which is drawn in the browser alone: the console carries one
    patch of `reka-ui`, under `client/patches/`, by which a collapsible region's id is made with the
    region's root rather than with its list, so a button drawn before its list already names it.
  - No id stands twice anywhere on a console screen. `client/tests/browser/console-ids.test.ts` holds home,
    every screen the sidebar lists and the first room and agent to that at a desktop width and at a
    phone's with the drawer open, and holds each branch's button, its chevron and the keyboard to
    opening and closing the list it names.
  - It drives the console given in `BMO_CONSOLE_TEST_URL`, the one `client/tests/support/browser-console.ts`
    stands up, with its fixture account made in that console's own database. The suite stands up no console,
    so it skips it there (`docs/checks.md`, 「Running the console-driven browser files」).
- **노드** — the machines the chat agent reaches beyond this one, the same list herdr shows on its left
  (the node unit's documents). It stands under the agents, in the list's own order, and not at all while the list
  is empty. Each node stands as its own letter on a colour drawn from its name, since each is an identity
  of its own — an ssh node and a jake agent stand side by side, their connection type left to the node's
  screen and the monitor — with its state as a dot at the row's end — green connected, red disconnected
  or any failure, grey not yet checked — and the state word as the row's accessible description. Folded,
  the dot is drawn over the avatar's corner. The list is read again whenever the bot says it moved.
  Choosing a node opens its screen.
- Folded, only icons and the rooms' own photos remain — a screen is one of a kind and stands as its
  icon, a room is an identity and stands as its own picture or letter, and an agent branch stands as
  its branch's own mark, its chat agents each as its face and its workers with the worker mark — and on a narrow
  screen it becomes a drawer opened by the top button.
- **Folded, everything names itself on hover.** Every screen, room, the fold button, the user menu
  button (the account name) and the stream line each carry a tooltip saying the words they show
  spread, and that is also their accessible name. A folded agent branch opens its agents beside its
  mark on hover, under the branch's name, so an agent is reached with the sidebar folded too.
  Spread, the names stand and no tooltip repeats them; the fold button, an icon at every width,
  keeps its tooltip (축소 or 확장) both ways.
- **Unread messages.** Each account is counted for itself, the administrator and a member alike, in
  the rooms it reads.
  - **What is counted** is every message past the place the account has read to, but its own — said by
    any identity linked to it, and for the administrator the owner's own identity — and the opening line a Telegram
    client sends, which no screen shows.
  - **The place read to is the later of two:** the mark the console keeps for the account, and the
    account's own last message in the room, from whichever provider it wrote. A provider does not
    tell the receiver what a person has read, so reading a room elsewhere cannot be known; writing in it
    can, and whoever wrote has read the room up to there.
  - **The mark is kept on the server,** so every browser and phone the account signs in on reads one
    count. It only ever moves forward.
  - **A room an account meets for the first time is read as it stands,** so nothing old is called new; what
    lands in it after counts. The messages past a mark are walked on the receiver's line from the marked
    message, five hundred at most, and a room further behind counts that many.
  - **A message is read once the foot of its row has stood in the room's view, in a tab on the screen.**
    Opening a room marks what is in view; a reader scrolled up into older messages marks nothing
    newer until it comes into view; a tab in the background marks nothing. The room's last row in
    view reads everything the room holds to its end, the voice that belongs to a line and the
    pictures of an album with it.
  - **A room with unread messages opens at the first of them** (「Room screen」), so entering a room
    reads only what comes into view.
  - **The count moves as the room does.** A message landing in any room the reader reads reads the
    list again over the stream, whichever screen is open; a mark the room makes lowers its
    count at once.
  - **A mark reaches every tab of the account.** When a mark lands on the server, the console's own stream
    says so — `room-read`, naming the room — to that account's open tabs alone, on every browser and phone it
    is signed in on, and each reads its list again, so a room read in one tab stops counting in every other
    without a reload. No unit is asked for it: the mark is the console's own.
  - **A count never moves back behind what the screen already knows.** The list and a mark's answer
    each say the place their count runs from, and a count from a place behind the one the screen
    holds for that room is older news and is not shown: a list read that set off before a mark
    landed does not raise again the count the mark lowered. Only a message past the mark raises it.
  - **The room open and read at its end carries no count**: what lands there is seen as it lands.
    A room still taking its opening place is not yet read anywhere, so its count stands until the
    room has settled there and then goes, once.
  - **The number stands at the line's end** as a count badge (「Count badges」), in a tint of the primary
    colour, as `99+` past 99, and not at all at nought. It takes no more height than the line and stands on
    its middle, so the line and its name stay where they are as the number changes; the name is cut before
    it, and the number turns as it changes (「Motion」).
- The drawer closes on an outside press. Swiping horizontally does not drag the drawer along — a panel dragged whenever a
  hand skimming the list flows sideways cannot be read. At the bottom is the user menu: open the settings
  (「Settings」), change the screen mode to light, dark or system, or log out. A reader who never chose a mode reads dark, and the mode is
  kept in a cookie, so the server paints the first frame in it and knows it for a page it sends (bmo-artifact's `docs/archive.md`, 「How a
  document is drawn」). The menu opens above its button, aligned to
  the button's left edge and as wide as it. Above the menu, while the bot's stream is not carrying anything, a line
  says so; it leads to the live status screen.
- A screen with no place of its own in the sidebar puts a return hook in the header. The gate screen returns
  to that gate's agent screen. On a narrow screen the sidebar is a drawer, so that
  hook is the way out of that screen.

### A line longer than its box

- Live status and the cache siren are boards standing several things in one line, so at phone-ish width a
  line grows longer than its box. A line longer than its box is not cut ending in an ellipsis but flows on
  its own. It runs to the end and back to the start repeatedly, pausing briefly at each end so the head and
  tail can both be read. What flows is one set of letters — the same words are not copied to make it flow, so
  the line is still scraped and copied as one sentence and read by a screen reader as one sentence.
- **Only a line of words flows. A time does not flow.** What flow buys is the tail that would have been cut,
  and that is worth it only when there are unread words at the end. A time is a fixed-digit block, read at a
  glance rather than scanned, so a clock that will not sit still reads worse than a narrow one. If room is
  short, the line just breaks between the date and the time, so nothing is lost. So a line of time alone gets
  no flow — a line where a time sits between words flows as is, because what is cut there is not the time but
  the words after it.
- A line that fits its box does not move at all. Moving with nothing to show only makes it harder to read, and
  such a line is cut in the box and ends in an ellipsis as before. The measuring does not end once but keeps
  watching the box's width and the line's words — narrowing the window starts the flow, widening stops it on
  the spot. A line redrawn every second, like elapsed time, does not return to the start on redraw. Only the
  distance and the duration are swapped, so the flow already going continues.
- The speed is the same on every line. Set at so many pixels a second, so a long line does not read slower
  than a short one; instead it takes that much longer to reach the end. While a pointer rests on it, and while
  keyboard focus is in the box holding it, it stays still to be read slowly. In a browser told to reduce
  motion, no line moves on its own, and instead the box is pushed by hand to see the end. Even as such a
  horizontally pushed box, it does not fight the vertical scroll — sweeping a finger up and down over that
  line keeps the line in place and scrolls the screen, and only sweeping left and right pushes the line. The
  browser decides by direction, and no rule barring that decision is put on this line.

### Count badges

- **A count standing as a badge beside a label** — a room's unread messages, a tab's rows — is one small pill
  everywhere, set once in the console's number module and named by every place that stands one.
  - The caption size, 14px, in normal weight and tabular figures, on a 16px line with no room above or below
    it, so the pill stands inside the line of the label beside it and on its middle.
  - A tint of its colour under the colour's own words — never the colour filled solid — so a count is read
    without standing out from the list it is in: the primary colour where it is news to the reader, neutral
    where it only says how many.
  - Its ends round whole, and it is at least as wide as it is tall.
  - Its number turns as it changes (「Motion」).

### A value shown as what it is

- **No screen draws a JSON object or array as text** — not in a label, a cell, a chip, a row, a field's value or
  a tooltip. A value is shown as what it is: a list as its rows, an object as its named fields in the console's own
  words (`WORDING.md`), a moment as a moment, a yes or no as a state word, a number as a number, and a long body —
  a schema, a payload, a tool's raw result — in a block of its own with its highlighting, where a reader expects
  code. A field whose value is itself an object stands its fields one level in, under its name.
- **A value of a kind the screen does not know** stands as a sentence saying so, naming what it is, never as the
  value's own JSON.

### Model names where room is short

- **A compact line names a model short**, and its tooltip names it whole. The compact lines are a TODO row's model
  chip, the model in the TODO modal's head, a step's model on the progress stepper, the model line in a step's or a
  task's dialog head, the models in a work view's head and a figure's line inside a bubble. A table's cell, a
  settings form and a verdict card name the model whole.
- **A model stands alone.** No line puts beside a model's name why its road was taken — that the provider order fell
  to it, that its runs went out on more than one — nor the model the work asked for; the road table on the agent
  management screen is where a road's reason is read.
- **The short name is one reading for every such place:** a Claude model is its provider's letters and its family's
  initial with its version — `CC::O55` for `claude-code/claude-opus-5-5`, S, H and F for Sonnet, Haiku and Fable, a
  dated build's date left out; a Qwen model is its version without the dot, the initials of its build's words and
  its kind — `Q38-FN-Coder` for `qwen3.8-flash-next-coder-…` — its quantisation left out; a DeepSeek model is `DS::`
  and its words after `deepseek-`, each led by a capital — `DS::Flash` for `deepseek/deepseek-flash`, `DS::V4-Pro`
  for `deepseek-v4-pro`, named so on DeepSeek's own provider or with none. A model no rule shortens stands whole.

### The default among choices

- **A list of choices that holds the default marks it, and only it,** with 기본값: the choice reads `<what it stands
  for> (기본값)` where the default names a value the screen knows — `섀도 (기본값)` for a gate's Laya mode — and 기본값
  alone where it stands for the tier's, the engine's or the bot's own choice. A cell or a field that holds the default
  reads the same words, and an empty number box that stands for it holds 기본값 as its placeholder.

### Name and value lists

- **A list of names each with its value is one shape everywhere:** a hardware tile's figures, a
  file's properties, a reset's result and every other two-column list of a label and its content
  carry the console's one `pair-list` class, so all of them lay out the same.
- **From the small breakpoint up, a name stands beside its value;** under it, at a phone's width,
  the name stands on its own line over its value, and one pair is parted from the next by more than
  the name is from its value.
- **A value is never cut.** A word or a path that cannot break keeps its whole width, and the list
  scrolls sideways inside its own box; the screen never does. No value in such a list ends in an
  ellipsis. A list standing inside a message bubble breaks such a value where the bubble ends
  instead, since everything a bubble spreads is held to its width.
- A list of several figures to a row, or a form's label and field, is not this shape and keeps its
  own columns.

### Where a list stands empty

- **What stands in an empty list is a name, not a sentence.** A list, a table or a panel with nothing in
  it carries a noun phrase ending in 없음 — 기록된 로그 없음, 남은 일 없음, 등록된 계정 없음 — and never
  a sentence ending in 없습니다. The line is a label for what is missing, read at a glance beside the
  headings and counts around it, and a sentence there reads as if the screen were talking.
- **What is not that line** keeps its sentence: a refusal the bot gave, a reason a thing cannot be read,
  a result the screen states — those are the screen answering, and they end in 니다 as they always did.
- **A line that is the whole body stands in its middle.** Where the line is all a screen's body or a tab's
  body holds — its one list standing empty, or the unit it reads not answering — it stands centred in that body
  across and down, in the quiet colour. A line that stands among other
  content — an empty list under figures that did land — stays where the list's first row would stand.

### The progress stepper

- **Work that goes forward in stages reads as one vertical stepper wherever it stands,** Nuxt UI's `UStepper`
  standing upright, drawn by one component: a TODO item's work order on the 상태 tab of its modal, and a worker
  session's screen, only where the job that session holds is a co-work item or the worker laid out a plan of
  stages. A plan is the newest call of the session's plan tool that its log holds: a call whose arguments carry a
  list of steps, each with its words and its status (Claude Code's `todos`, Codex's `plan`), read by that shape
  and never by the tool's name. Where neither stands, no stepper does.
- **A step is one stage:** a work order's step (「The list is the procedure」 under 「TODO panel」), or one step of a
  worker's plan. Steps stand top to bottom in the order they began, or the plan's own order.
- **A step carries its dot, its title, its owner, its model and its time.** The dot is the state's: done, a check
  in the success colour; running, a spinning mark in the primary colour; waiting, an empty ring; failed, a cross in
  the error colour; skipped, a struck circle in the dimmed colour. The title takes the width left and ends in an
  ellipsis. The owner is the co-worker role, or the worker for a plan's step; the model is the one the stage ran
  on. The time is how long the stage ran, in tabular figures: the running stage's counter grows every second, and
  a stage not begun carries none. A plan's step carries no model or time of its own where the plan says none.
- **A stage of several tasks holds them as sub-stages** — a co-work stage's branches, a research stage's items —
  one line each under the stage, with its dot, its title, its owner, its model and its time.
- **Pressing a stage or a sub-stage opens it in the work view** (「The work view」 under 「Agent screen」). No step
  folds and no step has a body: the stepper says where the work stands, and the work view is where it is read.
- **A log is no stepper.** An agent's log stands flat under it, a line after another, and no run is a step.
- **Its placeholder is a run of step heads** — the dot and one line — and stands on a stepper's first read only, by
  the rules `docs/skeleton-loading.md` sets; a re-read keeps the steps on the screen.

### Text written in markdown

Body text a person or model writes in markdown stands as formatting, not asterisks and backticks — bold,
inline code, code blocks, lists, headings, quotes, tables, links. The places such body text stands:

- **Room screen** — the bubbles of what an agent said, the chat agent or a companion. What a person said is handed over with formatting stripped
  by Telegram, so it stands as the literal characters. A bubble with a custom emoji inserted among the text
  stands as literal characters too. Where a picture would sit is recorded as a character position, and
  stripping formatting shrinks the characters and misaligns that position.
- **Agent screen** — thinking, words, prompt, notes, end.
- **TODO item** — the original instruction, approval comments, completion report, an unfinished item and its
  resolution reason, appended words, the turns of that item's talk, and what a job asked.
- **Work order** — the intent and instruction, and the instruction and result of a window opening one task.
- **Verdicts** — where a room's verdict chip is expanded, and the full verdict standing in the verdict-display
  setting's unclassified.
- **A job's question** — the question and its reason on a question card, and the question bar's question over
  every screen.
- **Gate screen** — the gate's answer.
- **Code graph** — markdown files.
- **Archive screen** — a document's findings.
- **Document viewer** — the markdown documents the chat agent reads, their translation, and the turns of talk about a
  passage.
- **Code review** — markdown files and review thread turns.

- **Some places stand literal.** A machine-written value, or a place whose job is to show what was sent as it
  was — a tool call's arguments and a tool result, an agent log's start line, a work order's and a task's
  failure reason, a verdict's one word, the DB screen's cells, the text of a page the archive saved, a test
  sentence put into the gate screen, and a line cut to one line (a summary's head, a stage label).
- **There are four readings.** Text from the archive treats one line break as a line break — a report or a
  conversation is text written a line at a time. HTML written in it is not parsed into tags but shown as
  literal characters — an angle bracket a model wrote or words someone sent do not become an element inside
  the console. Image syntax does not load the image but stands as a link to its address, so one line someone
  wrote does not call the browser that opened the console out to an outside server. A file the code graph
  opens is a document line-wrapped by hand, so continued lines merge into one paragraph, and HTML and images
  written in the document stand as part of the document. Text standing in one line — the flowing question bar,
  a question's reason continuing after a label — takes only in-line formatting: bold and inline code stand as
  formatting, and block syntax like a heading or list and line breaks fold into that one line. A link and an
  image stand as their own characters. The question bar is a line the whole of which is a link to that
  question, so standing another link inside it would send one press to two places. Written HTML shown as
  characters is the same as archive text. A search's findings read like archive text but the two differ: the
  searcher's structural lines stand as headings and labels, and an image stands as an image, not a link. But
  that image does not call the outside address as is; only when it is an image recorded in that search record
  does it point at the copy the console server fetched. An image at an address not in the record stands as a
  link, as in archive text. The rule that an image stands as a link elsewhere is unchanged. A document
  viewer's document merges continued lines into one paragraph like a code-graph document, but written HTML
  stands as characters and images as links. A library document is what an editor transcribed from a room's
  conversation, so that one address someone wrote does not call the browser that opened the console out to an
  outside server. In a viewer document each heading carries the contents' anchor, and each top-level block
  carries the original line it started on (`docs/documents-viewer.md`, 「Table of contents and scroll sync」).
- **One tilde is a strikethrough nowhere.** A strikethrough stands only on text wrapped in two tildes. Text
  that looks wrapped in one tilde — 「3\~5일」, 「10시\~12시」 — stands as written everywhere. A search's findings
  go one step further and strike through no tilde count.
- **A table keeps readable columns in every place.** A table stands in a box that scrolls it sideways, and is
  laid out at the width its cells ask for, up to about ten characters' width a column or the body's width,
  whichever is wider — never squeezed down to a narrow body. A column keeps a readable minimum width, and a
  word in a cell breaks where it has a space, so a Korean word never folds one syllable to a line; only a run
  longer than its whole column breaks inside itself. A table wider than the body scrolls inside its box, never
  the page, so a phone reads a table as a desktop does, by scrolling it. The renderer and one stylesheet rule
  state it for every place above.
- **A picture stands centred.** A picture that stands as an image stands on a line of its own in the middle of
  the body's width, and its caption is centred under it.
- **A code block carries a copy button.** Every code block (a fenced block) stands in a box with an icon button
  over its top right corner, in every place above that has blocks; inline code and a text standing in one line
  carry none.
  - The button is always shown, so a finger reaches it without hovering, and carries hover and press colours.
    It names itself 「복사」 beside it on hover and on focus.
  - A press puts the lines inside the fence on the clipboard as written — without the language name, the
    blank lines around them or the trailing space, keeping the first line's indent — and the button shows a
    check and says 「복사됨」 for a moment before going back.
  - The renderer draws the button with the text, so every place has it; the component that puts the text on
    the screen takes the press. The block keeps clear of the button on its right.
- **A code block names its language and is coloured in it.** A fenced block whose fence names a language —
  「```shell」 — carries that name at its top left, on the copy button's centre line, and its lines start under
  that head row. A block with no language carries no name and stays uncoloured.
  - The colouring is the code panel's own: the same editor's tokenizers and its two themes, so code reads alike
    in a message and in a file. The fence's word is matched against the editor's languages by their name, their
    other names and their file endings — 「sh」, 「bash」, 「ts」, 「py」 — and a word none of them claims leaves
    the block uncoloured.
  - Text the language leaves plain keeps the console's own text colour; only what the tokenizer marks takes the
    theme's colours, light or dark as the console stands, coloured again when the theme switches.
  - Every colour of the two themes reads at 4.5:1 or more on the block's own ground, which is the same inside
    either side's bubble and outside one; where the editor's own colour for a kind of token falls short, the
    console's theme sets it darker or lighter in the same hue. Keywords, strings and numbers each stand in a
    colour of their own, and comments in italics besides, since the editor gives comments and numbers two
    greens. A character the tokenizer cannot place — a Korean name in Rust — stands in the text colour rather
    than in the editor's error red.
  - A `diff` or `patch` block, which the editor has no tokenizer of its own for, is read by the mark each line
    opens with: a file's and a hunk's head in the theme's keyword and type colours, an added line green and a
    removed line red.
  - A block is coloured whenever it comes near the screen, within 400px of it: in the text the page first
    draws, and in a message that arrives, or a stretch read in, after the renderer is already in the browser.
    Blocks waiting are coloured one to a frame, so a message carrying many never holds a frame a send's rise or
    a scroll is drawing; a block already coloured is coloured again at once when the theme switches.
  - The editor is several megabytes, so it comes down in its own chunk the first time a block with a language
    is on the screen, never before; until then the block stands uncoloured. The colouring only wraps the lines
    in colour, so the text a copy or a selection takes is the text as written.
- **A diagram block is drawn as its diagram.** A fenced block whose language is `mermaid` is not code but a
  picture: it stands with no copy button and is drawn by Mermaid (12, the `neo` look) as the diagram it
  describes, in every place above that has blocks — the 아카이브 and its share page above all.
  - Mermaid is several megabytes and most texts carry none, so it comes down in its own chunk the first time a
    diagram is drawn, never before.
  - It is drawn in the console's own typeface, after that typeface has loaded, so the boxes are sized for the
    words they hold, Korean included.
  - It is drawn in the theme the console stands in — `neo` in light, `neo-dark` in dark — and drawn again
    when the theme switches.
  - It tells series apart by colour. The slices of a pie, the bars and lines of a chart, the sections of a
    timeline or a mind map, and the boxes of a flow its writer marked `c1` to `c8`, each take one of eight
    categorical hues in a fixed order — blue, orange, aqua, yellow, magenta, green, violet, red — stepped for
    each theme and checked for colour-blind separation against the console's surface. A mark wears the full
    hue; a box or a section that holds words wears a tint of it, and every word keeps the console's own text
    colour. A ninth series has no hue of its own. Slices are parted by a gap of the surface colour, and a
    share printed on a slice stands on a ring of that colour, so it reads on any hue.
  - It stands centred at the size it was laid out at, and a diagram wider than the column shrinks to stand
    whole in it, so neither the page nor the diagram's own box moves sideways; words a phone draws too small
    are read by zooming.
  - **It zooms in place.** The wheel over it zooms around the pointer, with no key held, and a trackpad's
    pinch does the same; a wheel with nothing left to zoom — out at fitting, in at the most — scrolls the page
    on, so reading past a diagram never sticks on it. Two fingers pinch it and move it; one finger on a
    fitted diagram scrolls the page, and on a zoomed one moves the diagram. A drag moves a zoomed diagram, and
    a double click zooms in at that point or back out to fitting. It zooms from fitting up to eight times,
    as a picture does (「사진 보기」), never moved so far that an edge comes away from its box, and what a
    zoom carries past the box is clipped.
  - **Its zoom buttons** stand in a row under it on its trailing side — zoom out, zoom in and fit, the
    picture viewer's own three — always shown, so a finger has them, and each names itself over it on hover
    and on focus. One with nothing left to do stands dimmed. The renderer draws them with the text, as it
    does a code block's copy button; until the diagram is drawn, and where its source stands instead, they
    are not shown.
  - A diagram drawn again when the theme switches stands fitted.
  - A label breaks between words and never inside one, so a Korean word is not split between syllables; the
    boxes are measured for the lines as they break.
  - Until it is drawn, and where Mermaid refuses the source, the source stands as the code block it was
    written as, so the text still says what it meant.
  - Mermaid runs at its strict security level: the words in a diagram cannot become markup or a link that
    runs anything, and nothing in it responds to a press.
- **Strong words close in Korean.** A pair of double asterisks that CommonMark would not close — one after a
  bracket or a quote and before a letter, as in 「**「그림」**과」 — still sets its words in bold, in every
  kind of text. Where CommonMark already reads the pair, its reading stands.
- **Either way it passes sanitising.** The HTML a markdown is turned into passes DOMPurify once before it
  enters the screen. Scripts, event attributes and `javascript:` addresses drop there. A link opens in a new
  tab, and the opened page cannot touch the console window.
- **There is one renderer.** Every place uses the same renderer and the same formatting. The formatting's look
  is written by the console itself with its own tokens and monospace face, so it reads the same in light and
  dark. A code-graph document stands at document size, a search's findings stand at a reading scale of their
  own (「아카이브 screen」), and other places' body follows that place's letter size and colour with
  narrow gaps between paragraphs. A code block is scrolled sideways in a document, and so is a block in other
  places' body whose fence names a language other than plain text: code keeps its lines as written, as a
  message's code does on a phone. A block there with no language, or one naming plain text or markdown
  (`text`, `txt`, `plaintext`, `md`, `markdown`), folds its lines at the end — so an original instruction quoting a
  whole conversation inside a fence does not vanish sideways off a phone-width card.
- **The first instant is literal.** The renderer is in the browser only, so it is in neither the console's
  first bundle nor the server bundle. When markdown body first stands, it comes down once in its own chunk,
  and body after that stands straight as formatting without waiting. So the server-drawn screen and the
  instant before the renderer comes down stand the same text as literal characters, then turn to formatting,
  with no empty moment. Without the renderer, it stays literal.

### List search

- **One search for every list.** A list hands the console's search module, for each record, every text it
  carries, each marked as shown on the line or not. The phrase typed is matched whole and without regard to
  case, so `단계 7/9` finds exactly the lines that say it.
- **What the line shows is searched.** A number, a state, a badge read on the screen finds its line as surely as a
  word inside the stored data does.
- **A hit is marked where it stands.** The matched part of every shown text is highlighted.
- **A hit only in hidden data is said under the line.** When nothing the line shows matched, one line under it names
  the field it matched in and the words around the hit.
- **Where it is used.** The TODO panel reads it in full, and so do agent management's settings search and the 아카이브 list. The
  document viewer's tree and its found lines, the DB screen's cells, the code graph's node
  table and agent management's tables mark their hits with it; the graph matches with it too, and its match
  badges say which hidden field a node was found by.

### The title bar

- **Every screen carries the one title bar, with the same buttons in the same places.** It is one component:
  the sidebar button, the screen's name and mark, what acts on that screen alone beside its name (an agent's
  설정 and 중지, a room's menu and its window clock), and at its right end the one set of buttons — the
  deployment's mark, and for the administrator the TODO button and the usage figures. No screen composes a bar
  of its own or leaves a button of the set out. The one difference a screen may make is the room's: its bar is
  the same bar on the translucent ground the room's bars lie over the conversation on.
- **The set of buttons is one instance, held by the layout,** and laid into the bar of whichever screen
  stands. A page change moves it into the next screen's bar: nothing in it is stood up again, read again or
  drawn as loading, a button that has its figures keeps showing them, and none of it blinks.
  `client/tests/browser/title-bar.test.ts` holds that the set is the same element across a page change.
- **A screen a unit brings stands under the same bar.** The console offers its bar to every screen under its
  layout, provided under the key `bmo-console-title-bar` as bmo-ui's `docs/console-bundles.md` states the contract, and a bundle's route that asks for it — `consoleTitleBar`
  true in the route's meta — is drawn under the console's bar, named by its manifest's title and mark, the sidebar
  button and the set of buttons in it as on every screen. Such a screen draws no bar of its own: what acts on it
  as a whole it lays beside the name, in the place the offer names (`[data-title-bar-screen-actions]`), by a
  deferred teleport, and its own panels carry no bar. The bar and that place stand before the screen does, on every
  road to it — the first load, from a screen of the console's own, from another bundle's screen: the bar follows
  the route being gone to as soon as the navigation is taken, so the place is in the page by the time the screen
  mounts, and it stays while the screen being left still stands, until that screen has gone. Between two bundles'
  screens it is the same bar and the same place, renamed. A bundle read where nothing offers the bar — its unit's own
  app, or a console without the offer — draws its own, and a route that does not ask stands as its bundle draws it.
- **The title bar holds only what every screen holds** — the sidebar button, the screen's name, the deployment's
  mark, the TODO button and the usage figures — and beside the name what acts on that screen as a whole. What acts
  on one screen's content — its filters, its reread, the time its
  data was read, the original of a document — stands in that screen's own row under the title bar, at the
  right end of its tab bar, or in its content's title, never in the title bar. The screen's own row is one
  line high on a phone; filters that do not fit it fold into one button opening them.
- **A title bar's icon button is a square**, the component library's own icon button: its mark at the
  library's icon size with the same padding on every side, so every button in the bar that shows only a mark
  is one size. A mark whose words fold away at phone width — the deployment's, the usage figures — becomes
  that same square from the moment it stands alone. `client/tests/browser/topbar-square.test.ts` measures every
  button in the title bar that shows only a mark, at a desktop width and a phone's, in light and dark.

### Tab bar and toolbar

- **One row under the title bar, never two.** A screen whose sections stand as tabs holds them on the one row
  under its title bar, and what acts on the screen's content — its refresh and the moment it was read, its
  filters, a status line it keeps — stands at that same row's right end. No screen stacks a second row of its
  own controls under its tabs. Where the row is too narrow for both, the tabs scroll sideways inside it, a
  status line is cut short, and a control's words fold into its tooltip, its mark standing alone; the control
  itself never leaves the row. A toolbar that belongs to one thing inside the screen — an editor's, a table's —
  stands against that thing, not under the tabs (「The title bar」).
- Tabs are of two kinds and the two are not mixed. **Open-and-close tabs** — files, documents, sessions the
  reader opens and closes — stand as the console's shared **tab bar**, and **fixed switches within a screen** —
  section tabs of a narrow screen, the DB screen's table and SQL — stand as the component library's tabs. There
  is nowhere lining up buttons to mimic tabs.
- **The tab bar.** One line shaped like lab-app's tab row, and a tab belongs to a screen, not a route. The tab
  list is held by that screen, and the tab bar draws it and only reports what was pressed, what is closed, and
  what was dragged where. Pressing a tab or moving with arrow, Home or End keys makes that tab stand, and a
  standing tab always comes to a visible place within the row. Closing is by the tab's close mark, the middle
  button, the Delete key on a focused tab, and the right-button menu over a tab — close, close others, close
  right, close all. Dragging a tab onto another puts it before that tab, and onto an empty place puts it at the
  back. The close mark always shows on the standing tab and shows on hover on others, and on a finger-pointer
  device always shows. Closing a file or document a tab stands on stands the most recently seen of the
  remaining tabs, and with none left returns to an empty screen. A file tab carries the file name, and if
  same-named files are open together carries the whole path. The full path stands on hovering the tab.
- **A tab is the row's whole height.** The row's bottom line is drawn over the tabs' last pixel rather than as
  a border under them, so a tab stands exactly as tall as the row — 36 pixels, 40 under a finger — and the
  same holds for the component library's tab rows. The actions at the right end stand 4 pixels apart and 4
  pixels from the row's edge, the same edge the toolbar's buttons keep.
- **A tab's menu under a finger.** A long press on a tab is a drag, so a finger opens a tab's menu by tapping
  the tab that already stands; it drops from the tab's bottom-left corner. A tap on any other tab stands it,
  and a right click opens it wherever there is a mouse.
- **Pinning.** The right-button menu of a tab pins it or lets it go (고정, 고정 해제).
  - Pinned tabs stand together at the left end of the row, in the order they were pinned; a tab let go stands
    first after them.
  - A pinned tab shows a pin where its close mark would be. It closes only by its own closing — the menu's
    닫기, the middle button, Delete — never by 다른 탭 닫기, 오른쪽 탭 닫기 or 모든 탭 닫기.
  - A drag never crosses the edge between pinned tabs and the rest; a tab let go past it stops at it.
  - A screen that closes tabs for room closes the unpinned tab seen longest ago, and never a pinned one.
  - A screen may add choices of its own to a tab's menu, under the closings and the pin.
- **A read-only tab bar** shows, switches and pins. It has no close mark and no dragging, its menu holds the pin
  alone, and it does not listen to Delete. It is used where the tab list is set by something other than that
  screen — the code graph's node files.
- **Tabs are kept for the account on the server.** Each screen that uses the tab bar keeps its tabs — which are
  open, in what order, which are pinned and which stands — in the console's own table of tab states, under the
  logged-in account and a key the screen names for itself, and never in the browser.
  - The screen reads what was kept once it stands, merges it with whatever it opened meanwhile, and writes its
    tabs back a moment after they stop changing and when the page is left.
  - A kept value is read only as far as it still reads as tabs; the rest is dropped.
  - The code review keeps each worker's open files and the file standing in it; opening a worker, or the screen
    with no file in the address, stands that file.
  - The document viewer keeps its open documents and the one standing; the screen opened with no document in the
    address stands that one.
  - The code graph's code panel keeps the files pinned in each project, and the file each node last stood on,
    which the node opens at while it still names that file.
  - The remote screen keeps its tabs as 「Remote screen」 says.
- **Actions are one group.** Work on what the standing tab shows — showing reviews among code, a review on a
  file, asking the chat agent, reading again — is not scattered but gathered as one group: at the right end of the toolbar
  where a toolbar stands under the tab bar, else at the right end of the tab-bar line. Three or fewer stand as
  icon buttons, each named on hover, and a toggle stands pressed while on; four or more, and almost any group on a
  phone, fold into one vertical-dots menu, where a toggle carries its check. A screen never shows two
  vertical-dots menus at once: where the toolbar under a tab bar already holds one on a phone, the tab bar's own
  group of three or fewer stays as icon buttons there too. The buttons that fold or open a side
  part stand on that part's own side of the toolbar, apart from the group, and on a phone the ones that open a
  sheet join the group.
- **Every icon button has a tooltip.** A button that shows an icon and no words — in a group, alone in a toolbar
  or a header, a dialog's close, the button that opens a menu — names what it does on hover and on keyboard
  focus, with the same words as its accessible name.
- **Properties are the last of the group.** What a file or document is — its path, kind, writer, size,
  language, commit — does not stand above the body. The properties action opens it: a popover on the button that
  asked on a wide screen, a sheet from the bottom on a narrow one, which Back closes. The document viewer, the
  code screen and a document of the 아카이브 use it.
- **View switching.** A view that is on or off — a translation — is a toggle in the toolbar. A choice of three or
  more ways of reading one thing — rendering, source, split — is a switch whose choices share its width equally,
  standing in the toolbar; two peer views of a file under a tab bar — rendering and code — stand as that switch at
  the right end of the tab bar's own row, so tabs never stack more than two rows deep. On a phone a switch shows
  its icons alone.
- **Dropdowns** are never narrower than their longest item nor wider than the screen, their items scrolling
  sideways past that, and open against the edge of the button that opened them. A menu dropped from a button
  is exactly as wide as its longest item: it takes no floor of its own — neither the button's width nor the
  fixed minimum the component library gives a menu — and an item's trailing column, where a check, a key or a
  submenu's arrow stands, takes no room on a row that has none of them. A list that drops for a value it
  shows — a select, an input with a list — is floored at its control's width, so it lines up under it.
- **The toolbar** binds the info and buttons for one target — an editor, a document — in one line, attached to
  that target with no gutter. It fills the container end to end, its top and bottom borders continuing the tab
  bar's, view switch's and editor's, and its items have no border each but are split by dividers. Overflow
  flows sideways within the toolbar. An item attached to the right end is pushed to the end.
- **A toolbar's icon button is a square of the toolbar's own height** — 36 pixels, 40 under a finger — so the
  row reads as one band of equal cells and a finger has the whole height to aim at. The toolbar itself decides
  it, off what the button holds: a button whose whole content is one mark is an item button, and a select, a
  switch or a button carrying a word is not. So a toolbar written later is held to it without being told, and
  the editor's own formatting row is a toolbar of this kind too.
- **A cell is as wide as what it holds.** A cell of words — the path, a label, a field — keeps the toolbar's
  own room on either side; a cell holding only buttons — a group of actions, the 더보기 that folds them — keeps
  none, since its buttons are already the row's squares, so a folded group's 더보기 stands as square as its
  neighbours. A button carrying a word keeps the component library's own padding and gap rather than the
  toolbar's. All of it is set once on the toolbar, off what a cell holds.
- **A button's word never breaks into two lines**, however narrow the toolbar has been squeezed to, and that
  too is set once for every button in every toolbar rather than on the buttons one at a time. The square that
  goes with it is a floor and not a fixed width: a button holding one mark stands exactly as wide as the row is
  tall, and a button holding more than a mark grows to hold it. Both halves are needed together, because what
  a stylesheet can read of a button is its elements and not its text — a word written straight beside a mark
  looks from there exactly like a mark standing alone, and a width it could not push past would fold that word
  down the middle of the row. A toolbar left with more in it than its container is wide flows sideways, which is
  the overflow it already has, and never folds a word.
- **A bar gathers by the room it has, not by the window's width.** A toolbar in a side panel, in one half of a
  splitter or over a list standing in a reading column is as narrow as that part however wide the window around
  it is — a list panel beside an open thread is often narrower than a phone — so the room is read off the bar
  itself and never off the screen.
  - Short of that room the bar keeps what a hand reaches for first, written in the order it is reached for, and
    folds the rest into one 더보기 menu at the end of the row. With the room, it stands them all.
  - How much room is enough, and how many stand on either side of it, is one reading for every bar of the
    console rather than one per screen.
  - The control that chooses every row is never one of the ones that gather: it stands at every width and from
    the moment the choosing state is entered. The way out of that state is not gathered either, and it stands at
    the far end of the bar, where a closing belongs.
  - Flowing sideways is what is left for a bar that has gathered all it can and still has more than its
    container is wide.
- **A choosing control stands on the same vertical line as the marks it speaks for.** The 전체 선택 checkbox over
  a list and the mark on each of its rows stand one under the other, and a reader reads the column of them at a
  glance.
  - The control's box is held to the leading edge of its cell rather than centred in it, so it lands wherever
    that cell's own leading room puts it — the same room a row gives its own mark — with nothing measured per
    screen. The cell stays a square of the bar's own height and the whole of it is pressed.
  - Where the rows stand in a reading column and the bar does not, the bar's contents stand in that same column,
    and the bar keeps at its trailing edge the room the scrolling body's scrollbar takes. Otherwise the column
    centred inside the scroll and the column centred outside it fall half a scrollbar apart, and the line bends
    the moment the list grows past a screenful.
- The tab bar and toolbar stand at the same height and grow a little taller together on a finger pointer.
- **A row of the component library's tabs keeps its whole height.** The row it stands in has a fixed height and
  no padding above or below; the tabs fill that height, the row draws its own bottom line and the active line
  stands on the row's bottom edge. Nothing squeezes the tabs, so they never scroll vertically, and a row wider
  than its place scrolls sideways. The TODO panel, its modal, the co-work step dialog, the agent management
  screen and the live status board all draw their tab rows this way.
  The editor and document below them fill the section with no rounded border.

### Home screen

The first place on entering, where what is running on this machine is skimmed a line per branch. Six groups.
This is the administrator's home; a member's is their rooms alone (「Access」).

Its bar carries no name and no mark of its own, only what stands on every screen — the deployment mark, the
queue's button and the usage meters — so the front door opens on the groups themselves.

- **Live status** — one hook to the live status screen.
- **Rooms** — the rooms as the receiver lists them. The room name, message count and last message time stand.
- **Gate agents** — every gate the agency's catalogue holds, in the gate order the gate unit serves where it stands
  in it and in the catalogue's order otherwise, each opening its agent page.
- **Runners** — the searcher and the browser searcher.
- **Job workers** — each worker on this machine stands a line. As the agent doing the queue's work it stands in
  its own group. If a job runs on a worker, which item that job is a run of attaches under that worker's name,
  and a job launched with no item attaches the line its launcher wrote for why it was launched in the same
  place. A worker with no job running is written only as doing the
  queue's work.

The gate, runner and job worker groups are stood by reading that branch's rows from the catalogue as they are.
So if the owner makes one more worker, that worker stands here at once under its own name. If a branch has nobody, no
empty group is stood and the group itself does not stand.

The room lines, gate lines, runner lines and worker lines stand with **what that agent is doing now and
four figures**. The four are uptime, model, context and this week's tokens. A value the machine records nowhere
leaves that place blank — not stood as 0. 0 says measured-and-found-none, and a blank says there is nothing to
measure, and the two differ.

- **Model** — the bot records the model each agent last ran, so it is on every branch.
- **Context** — a room's chat agent holds a session, so the size it held on last answering is written. Runners hold
  no session — they open and drop context per run — so this place is **the size held when the last
  run ended**. Not the value held now but a reading of how much one run of that branch loads. A gate reports no
  size, so its place is blank, and a worker has nothing to write here and is blank too. An agent that has not
  run once since this value began being written is likewise.
- **This week's tokens** — the bot records with each run whose it is, so a per-agent sum is actually read.
  By the same rule as the title bar, after 「주간」 the four stand with their names and 「총 …」 beside them, and if a
  run this week could not take its share, 「분리 전 N건 …」 attaches after. **The four stand as one bar together** —
  the bar a popover's row stands as, drawn the same, so where one agent's week went is the same picture on any
  screen. At phone-ish width only the track stands and the four names fold. Lining the four up in a row would
  fold each line into four and turn the list into paragraphs, and what is needed in a skimming place is the
  picture, with the four figures read at any width by pressing the title bar's meter. The folding width is the
  width where that meter folds (sm). The popover has room, so there the four names do not fold. An agent with no run record in the seven-day window is blank there.
- **Uptime** — there is nowhere recording when a session started. What there is is only **how long the currently
  running run has gone**, so uptime is that, and an agent not running has no uptime and is blank. A session never
  ends by clock, so making a new column to record the start time would only stand empty for weeks, so it is not
  made.

**What it is doing now** stands only states the machine actually knows.

- **압축 중** — while a room's chat agent folds its context. Folding opens and closes no archive row, so it is read only
  while the bot carries it in its own picture.
- **검색 중** — while a searcher's or browser searcher's run runs.
- **정리 중** — while a digest's or person-book writer's run runs.
- **작업 중** — while a worker's job runs.
- **판정 중** — while a gate judges.
- **생각 중 · 답 쓰는 중 · 〈툴 이름〉 사용 중** — while a room's chat agent runs its turn. Which phase is as that run's
  stream itself says, and the tool is named by the word a person calls it by rather than by the name the CLI
  sends — the same word the room's own line uses, so one state does not read two ways on two screens. A phase
  the stream gave no tool name to stands 툴 사용 중.

An agent with nothing running has no state. A guessed state is worse than none.

Figures are not crammed into one line but wrap to the next when room is short. So at phone-ish width all five are
read to the end and nothing is cut. Values are reread often — context on the bot's word that a turn ended, the
running state on the bot's live events, uptime every second — but rereading does not make the screen jump or
anything return to the start. The line is held by name and swapped in place instead of redrawn.

If the bot does not answer, the model, context and current work disappear, and only the room list read from the
archive and this week's tokens remain. That is all that can actually be known then.

### Live status screen

- **The Herdr tab** shows the most recent structured herdr execution records, each with provider, work line
  and recorded transport outcome and a mark for that outcome. An unfinished record is labelled as requiring
  live-state confirmation rather than presented as proof of a live model. Transport exit is not a successful
  model answer. Older archives without this table show an empty list, its one line centred in the tab's body
  (「Where a list stands empty」); the console never creates the bot's table. Herdr is written with its capital
  wherever a person reads it.

- The place to skim at a glance what the gates, runners and job workers are doing now. A board standing
  result states, not a place to read logs — what is running, what it was, how long it took, how it ended, is all.
  Logs are on the agent screen.
- **A section to a tab.** The five sections — co-worker pool, gate, runner, job worker, Herdr —
  stand as the component library's tabs on the console's own tab row, under the title bar and in that order,
  and one of them stands at a time. Per group what is running now stands first, recent records below, and a
  group with nothing running says only what is missing, since the tab over it already names the group.
  - **Which tab stands is in the address** (`?tab=`), the pool being the screen's own address, so a link opens
    the section it was taken on and moving to another tab is a step of the history. A tab the address does not
    know falls back to the pool with nothing said. The choice is kept nowhere else.
  - The tabs are the screen's own list, which the console search reads too, so a section is found by its own
    name from anywhere.
  - **Every section is drawn whether it stands or not**, and the one standing is the one shown. So the pool
    goes on reading while another tab stands, and a tab opened again is full rather than starting over with a
    skeleton.
  - On a phone the row has not the width for both a mark and a name on five tabs, so the marks are what gives
    way and the names stand alone; the row fits one line at a phone's width, the tabs scrolling sideways inside
    it only where the machine's line and the refresh leave them too little.
  - **Gates** — every gate, in the gate order (the gate unit's documents).
  - **Runners** — the searcher and the browser searcher.
  - **Job workers** — the worker.
- The tab row carries, at its right end, the time the bot's picture was taken — or, in red, that the bot
  does not answer (「Tab bar and toolbar」, one row under the title bar). It is a button: pressing it reads the
  picture again, and it spins while it does. On a phone the time folds into its tooltip and the refresh stands as
  its mark.
- **The same row carries, just before it, the machine's room in one line** (the agency's `docs/agent-control.md`, 「Room on
  the machine」): load against threads, memory pressure, available memory, free swap, open jobs and those
  with a browser, as the bot's minute watch last read them. Where a launch limit is met the line's mark turns
  to a warning. Pressing the line opens the reading whole: when it was read, every figure, the limits holding
  launches, the memory each job and agent holds, the largest processes, the testbed's queue (the testbed's `docs/testbed.md`)
  — the command holding the machine's turn and those waiting behind it in order, each by its job and item —,
  where any work node takes work the machines work goes round under 노드 배정 — each with how many jobs
  and heavy runs it was given and its room, and where the next heavy run goes (the agency's `docs/work-nodes.md`,
  「The rotation」) — and the way to the hardware monitor. Where a command holds the turn the line carries it as one more part,
  the holder and how many wait. On a phone the line keeps the memory pressure and the open jobs.
- **The co-worker pool is a grid of tiles** (코워커 풀), read from the bot and read again every few
  seconds while the screen stands.
  1. **One row per worker, first.** A job worker is the builder stage itself, so it has exactly one place:
     its tile is busy while any job of that worker runs — an ordinary job or a co-work turn — and idle
     otherwise. How many builder places there are is how many workers there are.
  2. **One row per co-worker tier on each provider turned on that lends co-workers** — Reliable, Fine, Light
     and Simple — with a tile for every place its limit gives. A turned-off provider and a single model have
     no row (the agency's `docs/model-tiers.md`, 「Common co-worker capacity」); a tier closed at 0 has one only while
     something still runs, is held or waits there. The row's head names the provider and the tier, how many
     of its places are in use out of the limit, and how many requests wait for one.
  3. **A tile says at a glance which state its place is in**: working (a child runs in it), held (a
     reservation keeps it for an owner who has not used it yet) or idle, by its colour and its mark. A busy
     tile carries the role and the item or run it serves.
  4. **Hovering a tile** shows its state and what it is assigned to: the item or run, the stage and task, the
     role, the tier, the provider and model, and how long it has been there.
  5. **Pressing a busy tile opens the live log** of the run doing that work, at the place that run began and
     following its newest lines: a dialog in the middle of a wide screen, a sheet from the bottom edge of a
     phone. A co-work branch opens its own log; a research branch opens its search or browse run's log; a
     native co-worker opens the log of the worker job that called it; a worker's tile opens that job's log.
     An idle tile opens nothing.
- Runners write execution records to a table of their own, and which group a record belongs to is read by which
  branch the agent that ran that line is — the branch the catalogue answers, and a name the catalogue does not
  know is read as a runner. Reading is per branch, as gates are read per gate.
- A running line has the agent name, which room's work, who launched it, when it started, and how long it has
  gone. A gate is launched by nobody — it runs as part of answering — so a gate line has no launcher. The elapsed
  is redrawn every second. A run with a ceiling shows the ceiling and remaining time together, and when the
  remaining runs out, the overrun shows. A run with no ceiling — a search is such — shows only the elapsed. A
  queue job carries its item number, and a co-work step carries how far its work order came as a some/some like
  the TODO panel. A search carries its own depth (basic, thorough, exhaustive), a job its own model. A group with
  nothing running is not left blank but written 「실행 중인 것 없음」.
- **A job standing still on the owner says so.** A job whose pane stopped on a confirmation the runner put to them
  wears a raised-hand status icon and a 「확인 창 대기」 chip; a job waiting on a question it asked them wears the
  same icon and 「응답 대기」. On a phone the chip takes the model chip's place.
- **Every running line stands a 「중지」.** What a line is stopped by is the stop target the bot's picture gives
  it (the agency's `docs/agent-control.md`, 「Stopping」), so the button stands on every line that has one, on this board's
  groups and on the agent screens alike: a chat turn and a gate by their execution, a runner and a
  job worker by their unit, and a busy co-worker tile by the parent it runs inside. Pressing asks
  「실행을 중지할까요?」 in place — the line's own question, never a screen over the screen — and on confirming
  the control API stops that target. A tile has not the width to hold the question, so the question
  grows under the group of tiles instead, naming the tile it is about while that tile stands marked;
  and an open question goes back with the back gesture, as everything a screen goes into does. A search has no ceiling of its own, so this is the one way one ends short
  of its own answer. The runner cuts its run, salvages what the run wrote so far and returns it to the room,
  then closes the run row as 「사용자가 중지」; with nothing to salvage the room hears one line that the work was
  cut off with no result, and a stopped chat turn leaves that same line in the room it was answering. A job
  and a co-work run are also stopped through their item, by the 중지 of the TODO item or its work order panel
  (bmo-job's `docs/work-orders.md`, 「the owner stops an item now」), which ends every run that item holds at once. Whichever
  road it took, the run closes as 「사용자가 중지」, never as 실패 or 보고 없이 종료됨.
- **A line whose stop is asked reads 중지 중.** The answer a stop gives is that it was asked, so the line
  carries that word until the bot's picture next says the run is gone, and it is that line that carries it —
  a person pressing one stop can see which one is in flight. A stop the bot refused, or could not carry,
  stands as an error on the line it was pressed on, and stays there while the line does rather than going
  away with the section.
- **A co-work run is read not by its unit name but by the place it stands in the work order.** The name the bot
  gives such a run is an identifier joining item, task and round, and the log, unit and control API find that run
  by that name, so the name itself is left as is. But since it is not a name made for a person to read, on screen
  it stands as 계획, 단계 몇-몇, 설계 종합, 구현 몇, 최종 검증. From the second round on, which round attaches, and not on the
  first. The item number is not put in that name — every screen already has the item standing beside the run
  line, so it would only write the same number twice in one line. The name-reading place is shared by every
  screen, so this rule reaches the live status, room and siren screens at once, and an agent with a label in the
  catalogue always stands by that label, so the rule reaches only labelless runs.
- Recent records are the last few runs per group. What it ended as and how long it took stand together, and which
  room's work attaches. A job carries which item's run it was as an item number, and a job launched with no item
  stands without a number, under the line its launcher wrote for why it was launched.
- Every line wears a status mark in its state's colour: a running line its agent's mark, a finished line a mark
  for how it ended (done, failed, cut off, stopped). The chip at the right of a line holds one ended state only. There are nine states — 끝남, 답을 못 냈다고 보고,
  실패, 천장에서 잘림, 사람이 중지, 제 일을 띄운 채 거부됨, 한도에 걸림, 실행이 답을 못 냄, 보고 없이 죽음.
  「응답 실패 보고」 is a search writing in its result's first line that it could not meet the done condition,
  and the answer itself has gone to the room. A gate's end is that gate's verdict folded into one of three — 통과,
  거부, 판정. The chip carries in no case what a run left. Content in a chip is cut and unread, and it is not this
  screen's job.
- **A watch run says which watch it holds, in one line.** Under the run line of a watch stands the watch it
  holds as 「워치 #N · <name>」 and nothing else: its number and its short name. A watch carrying no name of its
  own is shown by the head of its note instead, so a line never stands without saying which watch it is. A
  watch serving no memory carries a 「메모리 없음」 badge on that line, since nothing closing a memory will ever
  end it (the brain's `docs/memories.md`, 「Watches」). Pressing the line opens its detail in place: how often it checks
  and how long is left of its deadline, the last check with its exit, the memory it serves by number or that it
  serves none, the whole of what it promised, the whole check, and the deadline or the timer's moment. A watch is joined to its run by the unit the watch row names. A timer and a check between two runs
  stand in no run, so the runner group lists them under 「러너 없는 워치」 with the same one line; the room it
  was set in and whether it waits for its next check stand first in that detail. While the bot does not answer, no run is known, so every standing watch stands there under 「워치」. The name and the note are the chat agent's own words about what it promised, and are the one text beyond room names this screen
  carries.
- The conversation content on this screen is only the room name and the message number the run attached to. Neither
  what was asked, nor what was answered, nor what a job was told stands here. The place to see that is the agent
  screen.
- **Pressing a line goes to see that run.** A running line goes to that agent's screen, to the end of the log
  where lines pile now. A recent-record line goes to the same screen at where that run started — not the log's
  start or end, but where that run wrote its first line.
- The way to get there differs per branch. Runners and jobs each run in their own unit and the log piles under
  that unit name, so a line names that name and picks that run exactly. A gate has no unit and the number attached to the log
  restarts from 1 each time the bot starts, so it names the place found by the verdict time minus its duration,
  and the room that verdict attached to. One gate judges one room one at a time, so the two settle the run, and if
  there is no line of that room around there — already deleted or never kept — it shows the log's end.
- What a gate judged attaches as a chip on the room screen too, but what that run exchanged inside is only in the
  log, so a gate line goes to the log too. The log keeps only 4,000 lines per week per agent, so if the sought run
  is already deleted, any branch shows the log's end.
- A line shows as pressable and can be moved to by the Tab key. The way back is the sidebar's live status. The
  agent screen has its own place in the sidebar, so unlike the gate-test screen it puts no return hook in the
  header.

#### How liveness is known

Two ways, split because the running places differ.

- **A gate is the bot's own run.** Its process runs in the gate's standing herdr pane, but the bot launches it and
  waits, so the bot's memory is the fact. If the bot dies the gate is stopped with it and the control API does not
  answer either, so the screen says the bot is gone. There is nowhere to disagree.
- **A runner and a job worker run in a temporary systemd unit outside the bot.** So the record and the unit
  are seen together. A run writes its row to the archive at start and closes it at end, and whether an unclosed
  row is still alive is **asked of the unit**. A run killed from outside has no chance to write its end, so the
  row stays open, so the record alone looks like it runs forever, and the unit alone cannot say which room's work
  started when. The record says what, the unit says yes/no.
- An unclosed row with no unit is a run that died with no report. It disappears from what is running now and
  remains in recent records as 「보고 없이 종료됨」. The bot closes a runner's row so, and closes a job's
  row when it next starts, telling that room the job ended.
- A run with no unit at all — run by hand — has no unit to ask, so it opens no row and only writes what it wrote
  and what it carried on ending.
- A case where a unit never came up does not reach here. The side launching a runner (the search, browser, voice
  launcher) opens the row first and asks for the unit, so if the ask fails there is no runner to close. There the
  launcher closes its own row as 「실행 오류」 — the place that knows what happened is there, and writing a
  run that did nothing as 「보고 없이 종료됨」 would be untrue. So on this screen that row never looks even briefly like
  it runs.
- The bot's picture carries more things that are not runs — **a room folding its context**, **a room
  answering a turn now** and **a message waiting for its turn** (docs/live-state.md). All three happen in the same
  place as a gate — in the bot's own memory, as work it holds and waits on — so they are settled the same way. None
  opens or closes a row, so while it happens the only place to read it is this picture. An answering room and a
  waiting message do not stand in this screen's list — what stands here is runs in units and
  gates, and the place to see how far that turn came is that room's screen. What the picture carries is which room
  has been answering what since when.
- Asking the unit is done by the bot alone. With no unclosed row it does not ask at all, and asks once every few
  seconds only when there is one. An event flows only the moment the picture changes, so the screen changes on its
  own at every start and end with nothing to refresh. But while nothing changes nothing flows, so a screen opened
  in between has nothing to hear — so the stream hands the picture once as it is at opening and flows onward at each
  change. This first picture uses no event number, so a screen counting the break by that number does not lose its
  count. The app does not look at units directly and holds nothing.

### Cache siren screen

- The place to see whether each Claude request running on this machine went to cache or burned new tokens. What is
  watched is not only the chat agent but all of this machine's Claude transcripts — a room's chat agent, a job worker, a session the owner
  launched themselves all stand in one table.
- The kind filter lists every kind the siren knows, in the siren's own order, whether the requests read hold it
  or not; a kind only the records name stands after them.
- The screen's own row under the title bar stands the list's three filters on the left and, on the right, 「업타임
  <분>분 · 마지막 요청 <시각>」 while the watch is alive. If the watch does not answer, nothing stands there — the body
  says it cannot reach in its own words, so no place opening as two blanks is left.
- **At phone width that row folds.** The three filters fold into one 필터 button carrying how many of them narrow
  the list, and the uptime line folds into one clock icon at the width where the usage display in the title bar
  folds (sm), in the same shape and opening on the same press. Pressing the clock spreads uptime and last request
  each into its own line. The folded and the spread are the same fact from
  one place, so they cannot say different things.
- The body stands the new tokens burned in the last minute, how many sessions moved in 30 minutes and how many
  transcripts are watched — two to a row on a phone — and a per-minute bar of the last 10 minutes. Beside it the
  three alarm criteria — yellow, red, 60-second burst — attach as numbers. Without the criteria the bar's height means
  nothing. Where the screen is wide the bars take half of the 768-pixel column and those figures the other half,
  and the bars grow to whatever height that half gives them, down to a floor of their own.
- Below is the request list. One line is one request. Where the list is wide enough it is one row, and the
  columns belong to the list rather than to each row: one grid is declared for the whole list and every row is
  laid out on its lines, so a value is read straight down instead of being hunted for row by row. A row still
  draws its own border, its own ground and its own inner room on top of those lines.
  - The width that decides the one-line form is the **list's own width**, not the window's: a sidebar and the
    TODO panel take theirs first, and a rule read off the window squeezes nine columns into a column of prose.
  - The one line stands at the 768-pixel column: the list stands inside the column like every other list screen,
    and the one-line form switches on at a list width that column holds.
  - Time, agent and session take the width their own words ask for, each up to a ceiling of its own, and what is
    too long for that ceiling is cut there. What the watch said of the request — the reason — is read before the
    model: it takes the width its own words ask for from what is left, with no ceiling, and slides inside that
    width only when even the whole remainder is too short for it. What the request went out on — mode and
    model — takes whatever the reason leaves, down to a floor that keeps it readable, and slides inside it. The
    new tokens and the cache-read tokens stand at the trailing end of the line, right-aligned in tabular figures.
  - A value the watch could not give — a request with no session, a request it said nothing about — still holds
    its column, or every cell after it slides one place to the left and the list reads ragged. The mark that
    says a row can be pressed keeps a column too, so a row that leads nowhere stands its figures exactly where
    the row above stands them.
- Where the list is not wide enough the row folds into lines, and everything in it reads from the leading edge:
  the first line stands the time, agent and session then the mode and model, the second what the watch said and
  then the two token counts, and on a phone the time takes a line of its own above both.
- The kind is the mark at the line head, in either form. The kind is as the siren divides it — warm (a normal cache hit), request (a repeat request with
  no accounting attached), start (a session's first request), growth (cache hit but new tokens large), cold
  (re-prefill), refusal (model auto-switch), burst (new tokens clustered within 60 seconds), and besides those quota,
  error, compact, notice, and each kind wears a mark of its own in its colour at the line head. notice is not the
  model but a note the CLI left — a line a turn with no answer to return, like
  compaction, leaves, and being no failure it does not stand as an error. A line rising red is the line the siren
  sounds, and it stands the same colour in the list.
- **A burst line is not one request but one 60-second window.** It is a line summing every request this machine's
  transcripts made in the last 60 seconds measured by request time, so the new tokens and cache are the sum of the
  requests in that window, and the line head stands the projects that requested in that window in order of large new
  tokens — the first name made almost all of that burst. The reason place stands 「60초 동안 요청 N건」, and this N is the
  count of API requests, not of runs. One search launching twenty co-workers makes a hundred requests a minute. So this
  line's number differs in unit from the per-run records the console's usage display counts — the usage display counts
  one of the bot's runs as one line and sums what that run wrote on ending, and includes even a gate that leaves no
  transcript but not sessions outside the bot. Whether one run's sum equals the siren's summed requests can be checked
  against that run's one session. The reason the siren attached to that request also stands, translated into Korean on
  this screen — a session's first request, a model switch, compaction, cache lifetime passed, the prefix moved.
- **Rolling to the end attaches more.** The list loads sixty at a time newest first, and reaching the end appends the
  next page. With no more it ends 「끝」, and while loading a placeholder stands there — the same footing as the archive
  screen. But the way it asks differs. The watch does not pile up the past but holds a ring of the
  last few hundred and serves from its end, so there is no cursor to page back by. So one more page here is **asking for
  more**, and what comes back is always the whole list as of now. If as many came as asked, there is more behind, and if
  fewer than asked came, the ring ended there and there is no more to ask. The ring size is the ceiling, so no more than
  that is asked.
- What was rolled out to grow stays even when its own clock rereads. The whole list comes anew each time but always at
  the size now asked, so reading down does not return to the first sixty. Lines stand by the serial number the watch
  assigned, so a reread does not stand the same line twice.
- **Why the prefix moved.** The siren knows only that the prefix moved; what moved it — a room told to reread a
  document, code going live, the session-opening line itself moving — is the agency's record, which no route serves
  the console (`docs/boundary.md`, 「Gaps the console meets」). So no request stands a cause, and a line that lost its
  prefix says only what the siren said of it.
- **Which agent's request.** The name at the line head is the agent that made that request, called by its label. There
  are two grounds only — the agent a row the siren took from a caller names, and a runner running in its own deploy
  directory. Which agent holds which session is the agency's record, served by no route, so every other line stands as
  its project name and is grouped in the filter as **그 외**. A gate leaves no transcript, so it does not stand on this
  screen at all.
- **Pressing goes to where that request was.** One request is one call an agent made, and where a call is written a line
  at a time is only that agent's log, so pressing a line opens that log — at the first line of the run that request
  belonged to. The same rule the live status screen's lines follow. A request a room's chat agent made goes to that session's
  log, not the room screen — what stands in a room is what was said, and what this screen says is what was burned to say
  it. With no log line around that time, it goes to the end of that agent's log — the screen right, the place merely the
  end.
- **A line with nowhere to go is not pressable.** A line grouped as **그 외** has no screen in this console to open. Such a line stands not as a link but a plain line, with no finger mark or
  press mark. A pressable line stands a chevron at the right end and its background changes on hover, so the two are told
  apart by eye.
- **Filters.** Three in the screen's own row — per agent, per kind and per model — and only what is actually in the list
  now stands as a choice. The choice stays in that browser.
- Beside those counts **the 5-hour limit and the weekly limit** stand as percents. The siren asks its quota source for those
  values from the agency, which gathers the account windows carried in its runs' answers and serves them in the shape the
  siren expects (the cache siren's `docs/api.md`, 「Quota source」). If the source does not answer, the two cells stay a dash.
  What is not there is not stood up as if it were.
- **The two limits are the active agent's.** The siren reads the slot its source marks active — the provider the road
  answers on and the login it walks to now — and the screen names whose figures they are beside them: the account's
  name where the provider holds more than one account, and the provider's label where the active provider holds no
  login. With one login there is nothing to tell apart and nothing is named.
- The screen does not attach to the siren directly. The app's server asks the siren's `GET /stats` and `GET /events` at
  the address `CACHE_SIREN_ADDRESS` names, and the browser calls only the app's paths. It does not keep a stream open
  either — asking once every few seconds is all, so if the siren dies the screen only writes so and nothing else is held.

### DB screen

- The place to read the server's own database as tables and rows: the console's accounts, its devices, its tabs,
  its palettes and themes, its read places, its document threads, and sumida's users, sessions, keys and grants.
  Another unit's data is that unit's, read through its own screens, and no table of another unit is reached here.
  All this screen promises is the one thing that what shows here is what is inside. There are two ways to read.
  **표** is choosing one table and skimming it, **SQL** is asking directly, and both answer with a table of the
  same shape. The two switch by the tabs of the screen's own row under the title bar, whose right end stands how
  many rows were read in how many milliseconds when and the button that reads again.
- **The table fills the panel.** The table's toolbar — the table choice, the search and the schema button — stands
  flush over the rows, the rows fill what is left edge to edge with tight cells, and the paging stands flush at the
  foot of the window whatever the table's length.
- **It cannot write.** This screen's reading does not use the app's own connection at all. Each read runs on a
  connection of its own in a read-only transaction, so a statement changing a row is refused not by a word list this
  app recognises but by the database itself. A directly typed query has one more layer: the query is wrapped whole
  in a subquery to run, so anything not one SELECT-shaped statement is caught at the parser first, and joining two
  statements with a semicolon is caught in the same place.
- **It can be stopped.** Each read runs in a process of its own, killed at the console's deadline, and carries a
  statement timeout the database enforces a moment past it, so a query missing a join condition is cancelled rather
  than burning a core. A query past the limit says so, and the console answers
  other things meanwhile.
- **Skimming a table.** Choosing a table stands its rows fifty at a time. The table choice is a dropdown with a
  search box, so a table is found by typing part of its name. The choices carry how many rows each table holds, and
  the last-opened table is remembered by that browser. The order is the table's own, newest row first. Pressing a
  column name sorts ascending by that column, pressing again descending, pressing a third time returns to the
  table's own order. The search box searches the whole table, not the loaded page — it searches the typed characters
  in every column of that table, and how many rows matched and which page changes with it. Search, sort and page do
  not erase each other and stand together. The schema button opens the table's properties in a dialog — each
  column's name, type and primary-key/required state, and the statement the table was made with.
- **A long value.** A list cell carries only the value's head. Multi-line prose is folded into one line and loaded
  too, and a cut cell is marked cut. Pressing a row opens that whole row — column names stand above the value not
  beside it and the value stands whole, so it is read to the end even at phone-ish width. The list holds only the
  head, so this place rereads that row. The ground for picking it is the identity the database gave that row, so
  what opens is the row that was on screen, not another that looks like it. A wide table flows sideways within its
  box, and the screen itself is not pushed aside.
- **A JSON value is never shown as its text** (「A value shown as what it is」). A value that is a JSON object or
  list — a `json` or `jsonb` column, or a text column holding one — stands in a list cell as what it holds: an
  object as how many fields and the first of their names, a list as how many members. The opened row stands it as
  its named fields, one row each, a nested field under its parent's name, a yes or a no as a state word and an
  empty value as 없음; a value too long to have been read whole says how long it is and stands its shape alone.
  Copying the row still copies the value as the database holds it.
- **Column names are stuck.** Rows flow within that box too, so going down fifty rows keeps the column of the cell
  being read standing above. The name stands over its own background so a row passing beneath does not show
  through, and pushed sideways the name is pushed along its column. The page control below the box stays in place
  while rows flow.
- **Column widths move.** Dragging the right edge of a column name, or pressing the arrow keys on that edge, widens
  or narrows that column. The first move holds every column at the width it stood at, so only the one moved
  changes, and a widened column shows more of each value. Another table, or another query's columns, starts again
  at natural widths.
- **What is not hidden and what is not shown.** Only the credentials hide their value — the web account's password
  hash, the notification device's two keys, and sumida's users' passwords and its keys. They are
  credentials, not records, and no screen of this console has ever shown them. In table skimming such a value is not
  even selected. A constant stands in its place so the value never leaves the database, and search does not search
  that column either — whether a search hits or not is itself an answer about that value. In a directly typed query,
  if the answer's column name is that name it is hidden. The way to fetch it by renaming remains, but that is
  deliberate by someone who logged in with their own account, not something caught by eye while skimming.
- **When it rereads.** It reads only on command. The live stream carries what the units are doing now, and skimming
  a table is not that. If rows shifted while reading, the reading place is lost, and there is no value in recounting
  the whole table on each notice. Instead the screen's own row stands how many rows were read in how many
  milliseconds when, and the button beside it rereads.
- **The address keeps the view.** The side being read and the table open stand in the address (`?view=sql`,
  `?table=`), so a shared link opens the same table.
- **SQL.** The query box grows with the query, and under it the rule (read only, the row cap, the time limit) stands
  on the left and 실행 on the right.
- **Limits.** Up to five hundred rows answer at once, and an answer stopped there says so. A list cell carries up to
  four hundred characters, and expanding one row has a far larger limit so any prose stands whole.

### Message files

- **What they are.** The files that came with a room's messages — a voice message, an audio file, a video, a document,
  a sticker, a briefing the chat agent sent — kept by the receiver with each message (the receiver's
  `docs/room-files.md`). The console has no screen of its own for them; a room's line plays or opens its file where it
  stands.
- **The road a file goes out by.** The browser names no path. Given the room and message number and kind, a file goes
  out only through the route the receiver serves for that message's file, behind this app's sign-in; the policy on the
  road says nothing can be a script, and it answers range requests so a large video or a long recording plays from the
  middle too.
- **While the receiver serves no such route,** a room's line names its file and its kind and neither plays nor opens it,
  and no file is read from the receiver's folders.

### Document viewer screen

- The place **The owner reads** the markdown documents the chat agent reads. What is read from where, how paths are fenced,
  and who runs the search, translation and passage talk are in `docs/documents-viewer.md`, and here the
  screen's shape is told. A document is the chat agent's insides, so the list, body, translation and talk all open only
  behind login. In the sidebar it stands beside the 아티팩트. This screen reads and writes nothing; the brain's
  library, its memories and its fragments are the brain's own screen's, which the brain brings by its manifest
  (「Screens a unit brings」).
- **The list.** Documents stand by their titles, not their file names — inside a person's or a room's group the
  title's lead naming that person is dropped, since the group already says it; a document with no title stands by
  its file name, and the file name itself is in the properties. Documents of one branch that would read the same
  stand by their whole titles, which name the person or room the group left out, and where those are the same too,
  with their file names after them. Each document wears the file explorer's file mark and each branch its folder
  mark, as in the code review. They stand as a per-branch folding tree, a branch per root: the checkouts the
  deployment names, in its order, then the agency's roots — rulebooks, agent instructions, system prompts — each marked 읽을 수 없음 with a
  tooltip saying where it belongs and that it is not served here, the agency's documents standing behind a route
  the agency does not serve yet, and holding nothing (`docs/documents-viewer.md`, 「The roots kept by other
  units」).
  With no checkout named, the list holds those unread roots alone and no document opens. The search box above the list searches document name, title and body
  text. While searching, the tree unfolds only the matched documents and their ancestors, and if matched in
  the body the line's context stands in one line. Pressing a matched line opens the document at that line.
  The search box takes the section's padding; the tree and the found lines below it reach the section's
  edges, scroll on their own, and line their rows up with the search box's text. A name the list's width cuts
  short stands whole in a tooltip, and only one actually cut (「Tooltips」); since a tap opens the document, a
  finger rests on the name to read it.
- **An open document.** A document opened by list, search, link or address stands as a **document tab** on
  the tab bar above the document section (「Tab bar and toolbar」). A tab carries the file name and stands
  its title and path on hover, and is pressed to switch, closed and dragged. It has a count ceiling, past
  which the longest-unseen tab closes. The tab belongs to that visit, so it is empty when newly opened.
- **The document's toolbar.** Under the tab bar stands one toolbar, and it stands with no document open too. On
  its left: the list's button — folding the list on a wide screen, opening it on a phone — then, with a document
  open, the view switch (rendering, source, split), the translation toggle, and, while a translation is coming in, its progress. On its right: 「〈이름〉에게 질문」, the chat agent's label filled in, reading
  again and the properties, and last the contents' fold on a wide screen. On a phone the actions and the contents fold into one vertical-dots menu, the view switch shows its
  icons alone, and the toolbar is one compact row.
- **One document.** Nothing stands above the body but the toolbar. Its path, branch, writer, size, original
  language and translation language are in the properties (「Tab bar and toolbar」). Source is a box showing the
  markdown as written. The source box is a read-only Monaco showing markdown syntax colours, and the rendering box is drawn
  by the console's one renderer. Split has source left, rendering right, its width divided by a middle handle.
  The two boxes move together synced by line. The chosen view and width stay in this browser. A piece link
  inside an index document opens that piece in the viewer.
- **The rendering box moves only up and down.** At every width, a phone's among them, nothing in it moves the box
  or the page sideways: a table and a code block scroll sideways inside their own boxes, a diagram stands whole
  in the column and zooms in place (「A diagram block is drawn as its diagram」), and a long word, address or run
  of code breaks at the column's edge. The view the screen opens in folds the other box from the first frame,
  so the rendering box stands at its full width while the source box is still loading.
- **Contents.** The document's headings stand beside the document as a list indented by depth, scrolling
  within itself. The heading at the reading place is marked, and pressing goes to it. The address is changed
  to point at that heading so the place can be handed over. A document with no heading has no contents.
- **Asking to be taken somewhere.** Asking in the question box above the contents goes to the heading whose
  section holds most of the question's words (`docs/documents-viewer.md`, 「Asking to be taken somewhere」). A dropdown at the head of the box chooses 「이 문서」 or 「모든 문서」. Asking over all documents stands the chosen
  documents as candidates and opens the first, going to its heading. The remaining candidates stay as chips,
  pressing one going to that document's place. While seeking, the box says 찾는 중, and if it does not find,
  찾은 위치 없음.
- **Asking about a passage.** Dragging to select text in any box pops up 「〈이름〉에게 질문」 beside the selection.
  Pressing opens the talk drawer, and the selected passage attaches as a quote above the words box. The drawer
  stands the talk about that document in order, and each of the owner's words stands with the passage of that time as
  a quote. Pressing the quote goes to that passage's heading. Answers come as notices like item talk — a sent
  word stands at once, while the chat agent answers it stands as answering, and when the answer ends the drawer rereads.
  A word unanswered because of a 휴식 상태 is marked so. The drawer opens without a passage too, to ask about
  the whole document. It stands at the side on a wide screen and rises from the bottom on a phone, and back
  closes it.
- **Translation.** The translation toggle — named by the target language on a wide screen, 번역 on a phone — stands
  dimmed while the console names no translator (`docs/documents-viewer.md`, 「Asking to be taken somewhere, and
  reading a translation」), with a tooltip saying so, and an address asking for the translated reading opens the
  original. Where a translator is served, it shows
  the text carried into the language that is not the original's. The carried parts are kept per version of the
  document, so a version already carried stands at once with no request and without the translator, and a document
  changed on disk is a new version and is carried again. Otherwise the carried parts fill in one by one with a
  waiting mark on the original above the not-yet ones, and the toolbar counts them as `n/m p%`. Parts that could
  not be carried are counted as 번역 실패 in a band above the body with a re-request button, and beside the count
  stands what the translator said of them — each different sentence once, in its own words — and if the translator
  did not answer, its reason, its road and a re-request button stand there. In the translation view too the contents,
  two-box sync, search and passage-asking all work. Asking with a passage chosen in the translation carries
  that the passage is a translation.
- On a wide screen the list, document and contents stand in three sections. The list and contents sections
  can be folded. On a narrow screen the document stands alone, shows one of rendering and source, and split
  cannot be chosen; the list opens from the toolbar's list button, and the contents and the question box from
  the menu's 목차, each as a sheet rising from the bottom, which back closes. Choosing a document in the list
  sheet puts it away and opens the document, and pressing a heading in the contents sheet puts it away and goes
  to that place in the document. With no document open the body says so and, on a phone, offers the list. If a document cannot be read
  its reason and a reread button stand, and while reading the list and while reading a document follow the
  console's loading display.

### Monitor screen

- **`/monitor`, 모니터, is two tabs under the title bar, one level deep:** 기기, every machine's hardware, which
  bmo-node reads, and 서비스, the card master's board (「Monitor's services tab」). The tab stands in the address
  (`?tab=`), 기기 being the screen's own address and 서비스 `?tab=services`, so a link opens the same tab and
  moving between them is a step of the history. Only the open tab reads anything. The console search finds
  each tab as it finds a screen.
- `/cards` sends a reader on to `/monitor?tab=services`, so a link made to that address lands on the master's
  board.
- **기기 shows every machine at a glance** (bmo-node's `docs/hardware.md`, 「Which machines」): this machine first,
  then the nodes in the node list's order, one tile each; a node that is this machine is shown as this machine's
  tile alone. It fills the panel rather than standing in the reading column, and so does each machine's own
  monitor.
- **A machine goes by the label its reading hands over** — this machine by its host name — on its tile and as the
  title of its own monitor; no name is written into the code. Until the first reading lands the name's place is a
  skeleton, and where the reading could not be asked at all it reads as its connection type.
- The tiles stand as many to a row as the panel holds at a width their rows read well at, so a tile is never
  stretched to the whole panel, and every tile of a row is as tall as the row; on a phone they are one column.
- A tile carries:
  - its name, its live tracking switch (bmo-node's `docs/hardware.md`, 「Tracking」) and its connection type —
    SSH or Jake for a node, 로컬 for this machine;
  - each GPU by its short model name, the maker's and the brand's words dropped (`RTX 3070`);
  - a bar for each GPU's VRAM and one for RAM, each with its figures in their physical units and its fill after
    them;
  - a small copy of its chip at one height on every tile;
  - two live charts side by side over the last minute (bmo-node's `docs/hardware.md`, 「Live」), 사용률 and 온도,
    each drawing the CPU and every GPU as lines of their own colours on one axis, with each one's name in its
    line's colour beside its latest value.
- The OS, the CPU's model and the storage devices stand only on the machine's own monitor, so a tile's height
  never turns on its disks or its cores. A tile opens the machine's own monitor from anywhere on it but its
  switch: `/monitor/local` for this machine, `/monitor/<node>` for a node. A machine that cannot be read says so
  on its tile in the error colour.
- **A machine's own monitor** is the system card across the top, then one card per piece of hardware, each with
  its live charts of the last minute and its record over the span its dropdown names, from 5분 to 1개월. Cards
  are padded 16px and stand 16px apart. Its columns are decided by the room the monitor itself has: wide, the CPU
  and the storage take a broader column with the memory, every GPU, board and failed services beside them in
  that order; middling, the two columns share the width; narrow, one column in the order CPU, memory, GPU,
  storage, board. The system card carries the live tracking switch, and the CPU card the CPU limit, each written
  to the node service as it is set.
- **How it reads.** A machine with its latest reading is asked every second while its screen stands and its tab
  is visible, the live charts are filled from the node service's live record on opening and on coming back, and
  a record is a span of the node service's readings gathered into the span's points (bmo-node's
  `docs/hardware.md`, 「History」). The console keeps no copy of either.
- Every figure that is a share of a whole — a use, a fill, a power against its limit, a temperature against a
  hundred degrees — is a bar, coloured only where its figure has steps: a temperature against its part's limit
  and a fill, a use never. The bars of one card stand as one group: the names in a column, the bars starting on
  one line and the figures ending on one. A figure is written in its physical unit, and a share stands after it
  rather than in its place (bmo-node's `docs/hardware.md`, 「Units」).
- Every figure that ticks stands in tabular figures, and a value the machine did not answer reads 읽지 못함 rather
  than nought.

### Monitor's services tab

- **The 서비스 tab of 모니터 shows every card the card master reads** (bmo-arbiter's `docs/api.md`, 「The
  cluster」). It reads the master's picture alone, through the console's own server, and changes nothing; it is
  read again the moment the master's picture changes, through its event stream. It fills the panel as a
  monitoring board.
- **The master's row** heads the board: whether the console reaches the master and its version (버전). The rules
  stand in it only when the master could not read them, in the error colour with why. A master the console
  cannot reach says so in one line in the error colour, and the last picture read stays under it.
- **The whole board, 전체, stands under the master's row,** every node's card, unit and service on one view, in
  the order the sections below take:
  - a chart of every card as one horizontal bar on one shared MiB scale, drawn with ECharts in the form of its
    custom-series profile: the card's capacity as a frame drawn first, so what is left empty is the free room,
    then each unit on the card as a block in its service's colour with its part's pattern (none, stripes, dots,
    in the order a service's parts first stand), then the memory in use that no unit accounts for in a neutral
    tone, one block for each share named below; the node's name and card on the left, or over the bar where the
    chart is narrower than a phone's landscape, and on the right its memory used and in all with the free room
    under it; a slider under the chart widens a stretch of the scale, so a block of a few MiB can be seen, and
    touching or hovering a block names it with its size;
  - each service wears one colour on the board and the tiles below alike, given in the order the services
    stand, so no two of the first ten share one;
  - the services, one row each in shared columns: its colour, its name, its memory on the cards (its units' and
    its processes' own), and its standing as chips — whose claim holds a card, whose turn a card is, how many
    tickets of it wait. A service is every name the picture carries: a unit's, a ticket's, a turn's, a claim's,
    an occupant's on any node (the catch-all `*` aside), a process's and a unit's the rules declare;
  - under each service, one row per card it holds anything on — the node, with the card's number where the node
    has more than one — with the service's memory on that card, and the kind from the rules (상시, 요청 시, 채움)
    and where its units are — 로드됨, RAM, NVMe, 일부, or 대기 중 for a unit a waiting ticket asks for that no card
    holds — said once for the card where its units agree; the units the rules name exactly that no card holds and
    no ticket asks for stand under a row of their own, 카드 밖, each as 언로드됨 with the size the rules measured;
  - under each card's row, its units, never naming the node again: the part with its pattern, under it what the
    service says the unit holds where it says — 블록 0~17, 풀 어텐션 블록 4개, MTP, 출력층 — its memory, and its
    kind and place where they differ from the other units of the card; then the memory the service's processes
    take on the card past its units, as CUDA 컨텍스트 with the processes' names;
  - after the services, 서비스 밖: for each card, every process no service is known for by its name, and what the
    driver keeps that no process accounts for, 드라이버 예약; where the processes cannot be read, the memory past
    the units stands as one share, 드라이버·컨텍스트;
  - the waiting tickets of every card: the service, the node, the unit asked for, the place, how long it has
    waited and the counted wait, or 대기 없음.
  - Every name in it is the picture's: nothing on the board names a node, a service or a unit of its own.
- **Each group of the rules** stands as a section titled with its name, its cards' memory in all and free, and a
  bar of the whole; then a node that answers but no group chooses stands in a section of its own.
- **Each node's card is a tile,** as many to a row as the panel holds at the width a tile reads well at, one
  column on a phone, every tile shown whole, nothing folded or cut:
  - its node's mark and name, the link to the master as a chip (연결됨, or 끊김 with since when), and the node's
    own version;
  - the occupant whose claim holds the card, by its own name, and the engine waiting at this card's stage with
    for how long, each as a chip when it stands;
  - the card's memory: one bar split by the units on the card, each unit in its service's colour and the free
    room last, and under it the units in shared columns — name, with where it is beside it where it is not on the
    card (RAM, NVMe, or 일부), its memory in MiB, and its last unload and load in ms;
  - whose turn the card is (the service and how long it has held it), and the queue: each ticket's service,
    place, the unit it asks for where it names one, and how long it has waited;
  - the host memory the node's dumps take, with the most the rules let them take, what the node has available
    and the share a standing claim keeps available, where each is known;
  - the dump store's extents and slots in use.
- **우선순위** stands after the nodes' tiles: the order the rules keep among the cards' occupants, read from the
  master's picture and never written here.
  - A table of the occupants, one row each, lowest tier first: its name, its tier as the rules give it, and the
    nodes it stands on as an occupant.
  - A table of the services, one row each in the order the master lists them: its name, its tier where the rules
    give one, its priority, the nodes it may be placed on, the card memory it asks for, whether it takes one node
    or many and whether it holds a card alone.
  - A line under the title says the order is the rules file's, by its path, and that it is changed there and not
    on the console.
- **The events** stand last, newest first: what the master saw change and what it ordered, in its own words.
- Every figure carries thousands separators and stands in tabular figures, and a value the master could not read
  reads 읽지 못함.

### Agent management screen

- **What it is for.** The agent list itself, the job workers, keepalive, the provider order and
  enablement, the Claude accounts and their order, the shared model tiers, each work key's road and
  account, each gate's road, wait and Laya mode, the common spawning pool and the searchers. The list is the archive's `agents` table, and everything this
  screen edits is written through the bot — the console does not write the bot's tables directly. The
  table itself is read raw as `agents` on the DB screen.
- **A section to a tab.** The tabs are 일반, 워커, 모델, 실행 경로, 게이트, 대화 상대 and 서쳐. The tab stands in
  the address (`?tab=`), so a shared link opens the same section and moving between tabs is a step of the
  history. The tab row stands under the title bar and carries, at its right end, the open section's own
  action (일반's, 워커's and 대화 상대's 추가 — 일반's a menu of Claude 계정, 등록 모델, 모델 파일, 기본 프롬프트 and
  에이전트, since that tab adds all five), the settings search and the one button that reads every section again, which
  spins while it reads. The title bar keeps only what every page carries, and no section repeats its tab's
  name as a title of its own.
- **The settings search** looks over every section at once: section names, agent and work-key names
  and keys, the names the owner calls an agent by, providers and their reasons, Claude accounts by the
  names they gave them and by the path each is reached by, registered model names and the models behind
  them, tiers and the models they map to, co-worker limits and the searchers' work keys. It uses the console's shared list
  search, so a hit on what a row shows is marked there and a hit only in what the row holds stands as
  one line under the result. Where the tab row has room the search is a box beside the tabs with its
  results under it; where it does not (a phone) it is a button opening the same search in a centred modal.
  Pressing a result opens its tab, brings its row to the middle of the view and marks it a moment; the
  open tab's rows mark the phrase too.
- **Every table on the screen is the one shared settings table.** It fills the section edge to edge, one
  row to a line, has no pages, and scrolls sideways inside its own box so that no cell is cut; the page
  itself never scrolls sideways. Every column's width is dragged at the right edge of its name, or moved
  with the arrow keys there, the way the DB screen's columns are: the first drag holds every column at the
  width it stands at, so only the dragged one moves.
- **A cell edits its own value, in place.** Pressing a cell that holds a setting opens a dropdown aligned
  to that cell, holding that cell's value and nothing else: a list for a choice, a number box for a number,
  a text box for a text, and — for a tier's model — the model with its effort. A choice is saved as it is
  picked; a number or a text is saved with Enter or the check button beside it, and Escape leaves it as it
  was. While a value is being saved the cell spins, and a refused one keeps the dropdown open with the bot's
  reason under the field, or, for a choice, says the reason in a notice. A cell showing what the bot worked
  out — the model a key starts on now, what last answered — is not pressed. Dialogs are left only for what
  is not one cell: adding a worker, a worker's whole settings, and asking once before a reset or a removal.
- **A table that is the whole section fills it.** 실행 경로 and 게이트 are one table each: the table takes
  the section's whole height however few its rows, its header holds to the section's top while the rows
  scroll, and its sideways scrollbar stands on the section's floor. 모델, with its tables, and 서쳐, with its
  table above the sentence of what it cannot show, scroll as a page, and each table there takes only its own height.
- **The tab row never scrolls vertically**; tabs that do not fit scroll sideways.
- **No introduction stands above a section.** What a setting does is its label and its place; the
  reasons behind the settings are in the documents named below, not on the screen.
- **A worker's, a gate's and a room agent's own settings are also edited on their own screens.**
  This screen stays the whole of every setting; the agent screen and the gate screen open its pieces in
  place (see those screens), and no second editor exists anywhere:
  - a worker's whole settings are the same dialog the 워커 tab opens for that worker;
  - a gate's settings are that gate's one row of the 게이트 table, the same cells, shown in a dialog;
  - the gates of an agent that answers in a room are what that agent's 게이트 cell of 에이전트별 설정 drops down,
    shown in a dialog;
  - the settings of an agent whose turns its settings' pieces make, a companion's, are its one block of
    the 대화 상대 tab, shown in a dialog together with its gates as its 게이트 cell holds them; the screen tells such
    an agent by the turn shape its row carries (the agency's `docs/agents.md`, 「One runner」).
  - All four save through the same bot paths and meet the same refusals as here, and the console reads the
    same shared data after a save, so a value changed on one screen is what the other shows. The worker's,
    the agent's gates' and the companion's dialogs are forms (「Forms」): one 저장 in the footer saves
    every change made in them, the gate switches included. The gate's dialog is its table row, each cell
    saving as it is chosen.
- **What stays on this screen only.** Nothing that belongs to more than one worker or gate is offered on
  their own screens: the 실행 경로 rows (`job-worker` is every worker's road at once, and a `role:` key is a
  co-worker role, not a worker), the shared model tiers, the co-worker limits, the provider order, the
  Claude accounts, the 전체 캐시 유지 switch and the searchers' work keys each belong to the whole bot or to
  something other than one worker or gate.

#### 일반

- **캐시 유지.** One line with the 전체 캐시 유지 switch, and under it how many agents have their own
  switch down. What stops is only keeping a prefix warm: a stopped agent still asks as before, a room
  answers as before and a job runs as before. A stopped line's record is not moved forward — moving it
  would make a cooled prefix look warm — and if one of two agents sharing a line stops, the line is
  still warmed for the remaining one. A provider turned off in the order below is not warmed even with
  this switch on, and neither is a Claude account turned off or resting — each account's prefixes are
  warmed on their own. Search and browse requests are outside the order, but that runner's Claude keepalive
  follows the off too (the agency's `docs/cache-fallback.md`).
- **활성 공급자 및 우선순위.** Every provider — Claude Code, Codex, OpenRouter and 등록 모델 — in the
  order every automatic walk follows, one row each: a drag handle in a column of its own, the place in
  the order, a status mark, the name, the reason the provider cannot answer on this machine now (the
  Codex executable, a registered OpenRouter model with its key, the gateway's key
  file or an empty registry) — said in the pack's sentence for the agency's code of it, the agency's own English
  sentence as its tooltip, and a code the pack holds no sentence for said as the code — the up and down
  arrows and the enable switch. Grabbing a handle and dragging saves the whole order at once, by mouse
  and finger alike; a refused save puts the bot's order back with the reason under the list. Lowering a
  switch turns that provider off at once; a turned-off row stands dimmed and keeps its place. Turning
  off the last one is refused by the bot. The default is all on in that order, and 기본 순서로
  stands only when the order differs. While a stand-in is answering, its row carries 대신 답하는 중. The
  OpenRouter key is never read by this screen — the bot says only whether each provider is usable.
- **등록 모델.** Under the provider order, every registered model the agency serves at `/models` (its
  `docs/api.md`, 「providers, models, pin-checks, tiers and fallback」), one row each: its name, the model
  behind it, the first tier it is mapped at, and a mark beside its name saying whether its addresses
  answer — 응답함 or 응답 안 함. 추가 in the tab row opens a box for a new registration's name, fixed
  once made and written with lowercase letters, digits and hyphens beginning with a letter, and the model
  its addresses serve; the agency starts it at the registry's smallest window, answer and wait, and with no
  address. A row's more-menu opens the same box to change the model behind the registration, the name
  staying, or removes it, a removal asked first in the message pill and a removal the bot refuses showing
  the bot's reason under the list. A save the bot refuses keeps the box open with the reason under the
  field it names.
- **모델 파일.** Under 등록 모델, every entry of the model catalogue, which the agency serves at
  `/model-catalogue` (its `docs/model-catalogue.md`), one
  row each: its label and name, its file, its size in GB with one decimal, the first twelve characters
  of its SHA-256, its source — 내려받기 for an `https` address, the run's path for a training's — its
  engine and registration, its nodes as chips, its defaults (생각, temperature, top_p,
  presence_penalty, max_tokens, each a dash where empty), its note, and 서빙 중 on the entry whose file
  its engine serves now. Above the list, the latest choice of a model for each engine: the entry, who
  chose it and when, and 진행 중 with the step it is at, 완료, or 실패 with its reason, with the last
  lines of its log under it while it runs or where it failed; it is read again every few seconds while
  one runs. 추가 in the tab row opens a box for a new entry; a row's more-menu opens the same box to
  change it, 이 모델로 바꾸기 to choose it for its engine — asked first in the message pill, naming the
  engine and the entry and saying the registration answers nothing until the engine is up again — and 삭제, asked first, a removal the bot
  refuses showing its reason under the list. The box holds every field of an entry, the name fixed once
  made, each default with 기본값 for empty.
- **기본 프롬프트.** Under 모델 파일, every base prompt the archive keeps (the agency's `docs/base-prompts.md`), one
  row each: its label and name, its length in characters, the agents that choose it by their
  labels, or 쓰는 에이전트 없음, and when and by whom it was last saved. 추가 in the tab row opens a
  modal for a new one — the name, the label and the text, pasted whole; a row's more-menu opens the
  same modal on that prompt to read and change it (its name fixed), and 삭제, asked first in the
  message pill. The text area grows with its text
  and the modal's body scrolls; under it stand the value names a prompt may carry
  (`{{cwd}}` and the rest). Saving a text that agents choose asks first in the modal, naming the
  agents whose sessions start afresh, with 취소 and 저장. A save or a removal the bot refuses keeps
  the modal open, or the list as it was, with the bot's reason.
- **Claude 계정.** Under 기본 프롬프트, the Claude accounts in the order the Claude Code entry walks
  them, one row each: a drag handle in a column of its own, the place in the order, a mark saying whether
  that login is standing, near its end or gone — a login near its end also carrying how long is left, and
  one that has ended carrying 로그인 필요 — the name the owner gave it, where its credential is reached —
  a configuration directory or a token file, shown as that path — the up and down arrows, the row's
  more-menu and the enable switch. The row runs go out on now carries 사용 중, and the account the owner chose
  to run on carries 고른 계정. A row's more-menu holds 지금 이 계정으로, which makes that account the
  chosen one and stands disabled on an account that is off; the chosen row's menu holds 순서대로 in its
  place, which lets the choice go. Where the chosen account is not the one in use — resting at its
  limit, its login gone, or the login in use still being spent to its limit — a line under the list
  says so, naming the account runs go out on and when a rest ends (the agency's `docs/cache-fallback.md`,
  「Running on one account now」). 추가 in the tab
  row opens a box for a new account's name, which of the two ways its credential is reached, and the path
  it is reached by; a row's more-menu edits the same three or removes the account. Dragging
  a handle saves the whole order at once, by mouse and finger alike, and the arrows move one row the same
  way; lowering a switch turns that account
  off at once and its row stands dimmed keeping its place; turning off the last one that is on is refused
  by the bot. **No cell, no box and no answer the bot gives this screen carries a token, a cookie or
  anything out of a credential file** — the path is the whole of what is shown, and what the screen learns
  about a login is only whether it stands and when it ends.

- **에이전트별 설정.** One table of every agent's own settings, the agents its rows and the settings its columns:
  every agent in its group — the chat agent, workers, gates, runners — under the group's heading row, one row each, and
  the columns 에이전트, 롤, 캐시 유지, 생각, Effort and one column for each gate a turn passes, the pre-gate's then the
  post-gate's, under the gate's name. Every value is edited in its own cell the one way the table edits: pressing
  the cell drops down from it the list of its values, and the one chosen is saved at once, a refusal said in a
  notice. Every agent stands in it exactly once: a worker the agency
  lists both as an agent and as a worker is one row, the worker's own fields on its agent's row, and a row stands in the
  group its kind names. No other list on the tab repeats the agents for their role, their warming, their thinking or
  their gates. The table takes its own height among the tab's sections and scrolls sideways inside its own box on a
  phone, so no cell is cut.
  - **에이전트** is the title column: its mark, its name and key, what last answered on it and, under them, its
    warming mark. Pressing the name opens that agent's own screen.
  - **캐시 유지** holds the agent's own keepalive, 켬 or 끔, and for a worker also 다음 Job까지 끄기 (below).
    - **The switch reads what the cache warmer holds** (the cache warmer's `docs/api.md`): on where one of the
      agent's warming targets, under whichever consumer registered it, warms now — the switch the owner threw
      on its subject, or the target's own default where none is thrown — and off for an agent the warmer holds
      no target of, so an agent nobody turned on reads off. Throwing it throws the agent's subject under every
      consumer that holds a target for it. A row with its switch down carries 멈춤; while the whole round is off every row
      still on carries 전체 멈춤, and the switch is then the setting to use when the round comes back on.
  - **롤** is read, not chosen, and its cell is not pressable: an agent's role is set when it is registered (the agency's
    `docs/agent-roles.md`). The row names it by the pack's word for the code the bot declares it under — 채팅,
    워커, 서쳐, 번역기, 게이트 — and, beside it, what it gives, the bundles by the pack's short Korean names for their
    codes, or 기능 묶음 없음; a code the pack holds no word for is said as the code, and a role the bot no longer
    declares, or any while the bot is not answering, stands as the role's own name.
- **에이전트 추가.** 에이전트 in the tab row's 추가 menu opens a form registering an agent of any kind through the agency's
  `POST /agents` (its `docs/api.md`, 「agents」): its key and label, its kind — 대화, 워커, 러너 or 게이트 — its role
  among those the bot declares, the kind's own where none is chosen, and for a 대화 agent the model
  it is pinned to and the worker its items go to, for a 워커 its folder. It is owned by the login that adds it,
  its user on the account service as `ownerAccount`. A refusal naming a field stands under that field, a name
  already taken under the key; the brain the agency made, kept or could not make is said in a notice. The agent
  stands in the table at once.
- **The gates stand in the parts of the gate order** (the gate unit's documents) — 프리게이트, 포스트게이트 and
  턴 밖, each under its own heading and in the turn's order within it, as on 게이트. A gate that runs in
  both 프리게이트 and 포스트게이트 stands in each, and its two switches are one setting.
- **다음 Job까지 끄기.** A worker's 캐시 유지 cell also offers 다음 Job까지 끄기, which turns its warming off now, until
  that worker's next job; nothing but that job turns it back on. The cell then reads 다음 Job까지
  꺼짐, and the choice stands disabled while the worker is not being warmed anyway — its warming off, the
  whole round off, or already turned off. A row's warming mark stands on the line under its name, so the name is
  never cut. The marks are searchable like the names
  (the agency's `docs/cache-fallback.md`).
- **생각 and Effort** are the table's next two columns, a choice each, for the agents whose thinking and effort are
  their own (the agency's `docs/model-tiers.md`, 「An agent's own thinking and effort」) — the chat agent, each worker
  that is no support worker, the two editors and the two searchers; every other row shows a dash in both. Pressing
  either cell drops its list down from the cell.
  - **생각** is 기본값, 켬 or 끔, and **Effort** is 기본값 or one of `low`, `medium`, `high`, `xhigh` and
    `max`; each is saved as it is picked, through the bot, and a refused save puts the bot's reason
    in a notice.
  - **What does not reach the provider the agent begins on is said where it stands:** a choice none
    of which reaches it stands disabled with 지원 안 함, a level it does not take is marked 미적용 in the
    list, and a cell whose saved choice does not reach it carries a 미적용 mark naming, when the
    pointer rests on it, the levels it does take.
  - While the bot is not answering, the cells show what the archive holds and nothing of what reaches
    a provider.
  - A support worker is not listed, since it runs on its base's settings, and neither is a gate,
    whose thinking and effort are its tier's.
- **A gate's column** holds, for every agent that answers in a room — the chat agent and each companion — its own
  switch of that gate (the gate unit's documents, 「Each agent's own gates」), 켬 or 끔; an agent whose turn does not
  pass the gate shows a dash. A gate standing in both parts of a turn has one column, since its switch is one
  setting for both. Which gates an agent's turn passes is the bot's word, so while the bot is not answering the
  columns are not drawn. Shown in an agent's own dialog, its gates stand as switches that wait for that dialog's
  저장.
- **세션.** Under the table of 에이전트별 설정, every session an agent holds now (the agency's `docs/session-resets.md`), one row
  each in the agent list's order: the agent's face or mark (「Profile photos」), label and key, which session it is — the chat agent's chat
  session, a worker's recorded sessions with their models, a companion's session in one room with its
  room and generation — the last time it was cleared, and an 초기화 button.
  - A waiting reset stands on its row as 초기화 대기, with the button off until it is carried out.
  - 초기화 asks first on its own row, which grows a step: one line of what the reset clears — that
    it waits for the running turn or job to end where one runs — with 취소 and 초기화; confirmed, it
    asks the bot and reads the list again.
  - Which sessions there are is the bot's word, so while the bot is not answering the section shows
    nothing.

#### 워커

- **Job workers.** A table of the workers — name and key, the checkout path, what an automatic job of
  theirs starts on and how many runs they made — with a more-menu at the right of each row (편집, 로그,
  and 지우기 for a worker that is not the built-in one). The name cell edits the worker's label and the
  path cell its path, in place; the built-in worker's path is not pressed. Under a worker's path stand the
  documents its session prefix carries, in their order, where it names any. 편집 opens the worker's
  dialog with the label, the path, the 프리픽스 문서 list, the preamble, the dev-server command, the 공급자 choice, the 샘플링
  block of a worker pinned to a registered model, the 기본 프롬프트 choice, 추가지원 워커
  수 and 캐시 유지 수 (the agency's `docs/worker-slots.md`), the 노드 체크아웃 list, the 강등 복원 switch and the 주기적
  캐시 유지 switch; 추가 in the tab row opens the same dialog for a new one.
- **노드 체크아웃** lists the base's checkouts on the work nodes, one per node, each with its node and its
  path there and a button taking it away; under it a node select of the nodes that take jobs and a
  path field, whose placeholder is the path the checkout takes where none is written, add one. They
  are held with the rest of the form and sent at its one save (the agency's `docs/work-nodes.md`, 「A checkout on a
  node」). A worker with neither support workers nor node checkouts, other than the built-in one, has
  **실행 노드** instead: 이 기계 or a node that takes jobs, its path then being the node's. A worker has no model of its own: its pinned
  provider, or else the order and the `job-worker` key, decide where its automatic jobs start, and one
  job on another model is chosen where that job is launched. The
  built-in worker runs this repository and cannot be deleted or moved — its path is rewritten on every
  start — but its label, preamble and dev-server command can change.
- **프리픽스 문서** lists the documents the worker's session prefix carries, in the order the prefix takes them
  (the agency's `docs/api.md`, 「workers」): each a path relative to the worker's checkout or absolute under the
  umbrella, which the field says in one sentence under it. Each stands on a line of its own with buttons moving it
  up and down and taking it away; a path field and an add button under them put one at the end. The list is
  held with the rest of the form and sent whole at its one save, on a new worker as on one being edited; an
  empty list is none. A support worker's follows its base, so its dialog holds none.
- **Support workers** stand in the same list under their base, each marked 추가지원. Their label and path
  cells do not edit, their menu has no delete, and their dialog holds only the 강등 복원 switch: what they
  are called, where they work and how many there are follow the base's two numbers
  (the agency's `docs/worker-slots.md`). 캐시 유지 수 never passes 추가지원 워커 수; lowering the count lowers it with it.
- **The preamble and dev-server command** are written in the worker's dialog. The preamble is
  multi-line text standing at the front of that worker's job prompt; it is not the worker session's
  prefix, so editing it does not cool the cache. The dev-server command is one shell line run by the
  dev-server pane of that worker's herdr workspace; within a few seconds of saving it swaps to the new
  command or comes down. Both empty are none (the agency's `docs/worker-bench.md`). The preamble takes up to 8,000
  characters and the command up to 1,000 without a line break; the bot refuses more.
- **공급자** is 자동 by default, the worker key's road. Choosing a provider pins the worker to it: its
  automatic jobs and the words said to it on its own screen run there alone, on the worker key's tier
  mapping for that provider; choosing a registered model, listed by its name under 등록 모델, pins the
  worker to that registration with its own answer size and thinking default (the agency's `docs/own-llm.md`, 「A
  worker pinned to a provider」). The choices are those the worker key's own chooser offers, each shut
  with its reason where this machine cannot run it.
- **샘플링** stands under 공급자 while the choice is a registered model: the worker's own sampling
  settings, laid out as a companion's 생성 파라미터 are, each with what it is for, its bounds and a box
  whose empty value is the engine's default, a switch's choice being 켬, 끔 or 기본 (the agency's `docs/own-llm.md`,
  「A worker pinned to a provider」). They are held with the rest of the form and sent at its one
  save, which asks nothing more; a value the bot refuses is shown under its box and nothing of the
  save's sampling is written.
- **기본 프롬프트** is 없음 by default, the harness's own prompt with the worker's rules appended;
  choosing one of the base prompts hands the worker that prompt with its rules after it as its whole
  system prompt (the agency's `docs/base-prompts.md`). Saving a change of it starts the worker's sessions afresh,
  which the field says under it while the choice differs from the saved one.
- **강등 복원** is on by default. Off, a run of that worker that falls to a lesser model keeps its
  session rather than dropping it, and the next job goes on in it (the agency's `docs/cache-fallback.md`).
- **주기적 캐시 유지** is on by default and is the same standing switch the 일반 tab's row for that
  worker carries, so turning it off in either place turns it off in both. Off, no warming round reaches
  that worker's sessions and no job turns it back on; the worker takes its jobs exactly as it did, and
  its row carries 캐시 유지 꺼짐 beside its name in this table (the agency's `docs/cache-fallback.md`).
- **Name and path are checked on receipt.** A name is two to thirty-two characters starting with a
  lowercase letter or digit, with only dot, underscore and hyphen, and not one another agent uses —
  logs pile one per name. A path must be absolute, exist and be a directory. A new worker's path may be
  left empty, and the bot makes a directory of its own for it (the agency's `docs/worker-bench.md`, 「Working
  directory」).
- **A worker outside a git repository** is accepted and carries 「git 아님」 beside its name: its jobs run
  as ordinary jobs, never as co-work. The path field says so in its help line.
- **One job at a time per checkout.** The lock is one per working directory; the session is one per
  worker per model. The TODO table is one, and an item's worker assignment splits it into one line per
  worker, so within one worker it is one at a time and different workers run at once. Two workers
  aimed at the same directory wait on each other.
- **Which worker the owner speaks to is decided by walking to that worker's screen.** Each worker has its own
  input box on its own screen, and what is typed there is said to that worker and to no other. A job is not
  launched from there at all: the console's road to a worker is the word, and jobs come from the TODO.

#### 모델

- **The tier table:** a row per tier — the chat agent, Frontier, Reliable, Fine, Light, Simple — and a column per
  provider, a turned-off one included. A cell shows that provider's model for that tier and, under it,
  its effort — or, in the 등록 모델 column, its Token Size and whether it thinks. A turned-off provider's
  column head carries 꺼짐 and its cells are edited like any other; a missing mapping says so in red.
- **A cell's dropdown sets that one mapping.** It offers the provider's registered models and, for
  Claude Code, Codex and OpenRouter, the efforts the chosen model supports. The 등록 모델 column's
  is set by registration, Token Size (기본값, 1,024, 2,048, 4,096 or 8,192), where 기본값 is the
  registration's answer size, and a 생각 choice of 기본값, 생각 or 생각 안 함, where 기본값 is the
  registration's thinking default (the agency's `docs/own-llm.md`, 「Settings per tier」). OpenRouter's list starts filtered to free models with a 무료 모델만 switch; a
  free listing does not guarantee access, quota, tool support or a successful run. The dropdown names
  every work key assigned to that tier. The mapping is saved as soon as the model and the effort make a
  pair the model supports; a model whose list does not hold the current effort waits for an effort to be
  picked. A saved value outside the list stays shown and is marked as one the catalogue no longer
  names, in the list and on the cell it is saved in — a cell is marked only for a provider whose list
  has been read on this screen, and the mark says what it is when the pointer rests on it; a catalogue
  failure blocks the save and offers a reread, and nothing is reset to a code default
  on its own. The Claude Code list marks the generations it has superseded and offers them beside the
  ones in service; where what stands on the screen is the last list read rather than a fresh
  one, it says so under the model with the time that read was taken. Saving applies from the next run of
  every work key on that tier and does not touch a running one (the agency's `docs/model-tiers.md`).
- **The fold-ratio grid** (압축 기준) stands under it: a row per tier and a column per provider, as the agency
  lists every provider it declares at every tier in ladder order (the agency's `docs/api.md`, 「fold-ratios」).
  A fold ratio is the share of a model's window a session may fill before it is folded once the turn that
  crossed it is over. A cell shows the ratio as a percent and, under it, where it comes from: set on the
  console, the provider's own default, or the general default. A line under the grid's head says what the
  percent is.
- **A fold-ratio cell's box sets that one ratio:** a number box taking a whole percent from 1 to 100, saved with
  Enter or the check button. The change reaches the next turn that reads it; no running session is folded by
  the set itself, and a refused value stays in the box with the pack's sentence for the agency's code under it.
- **The co-worker table** (코워커 한도) stands under the fold-ratio grid: a row per co-worker tier and a column per
  provider, as the agency's pool lists its places (the agency's `docs/api.md`, 「pool, seat-requests, reservations
  and roles」); a turned-off provider and a single model have none (the agency's `docs/model-tiers.md`). The chat agent and Frontier have no row: they are the chat agent's own tier and the job worker's,
  never a borrowed co-worker's, so they have no limit, and the builder's turns run as many at once as
  there are workers (the agency's `docs/model-tiers.md`). A cell shows the limit with a status mark (0 is 막힘) and,
  under it, how many places run, how many are held and how many wait. It is a different question from
  how many tasks a co-work's stage holds, which its plan alone sets.
- **The table only reads.** The agency serves no route that changes a limit, so no cell is pressed and a sentence
  under the table says so (`docs/boundary.md`, 「Gaps the console meets」). A first read that fails says so with a
  reread; a later one that fails keeps what was read.
- The counts are read again every few seconds while the tab stands. Which role is on which tier is chosen
  on the 실행 경로 tab as its `role:` key; a role is never switched on or off from the screen.
- **The draft-process table** (드래프트 과정) stands under the co-worker table: what a round's answer is asked
  before it goes out, as the receiver keeps it (the receiver's `docs/drafting.md`, 「The process table」). A row
  per key of a provider, a tier and an agent, each a name or 전체 for any, in the order the receiver lists them —
  the policy's rows, each replaced by the console's of the same key, then the console's own keys. A line under
  the table's head says that a turn reads the most specific row that matches it, an agent's before a provider's
  and a provider's before a tier's.
  - **A row's cells:** 질문 순서, the questions of an ordinary turn in order; 짧은 턴 질문, those of a light turn;
    짧은 턴 기준, how short the room's words must be for a light turn, in characters; 제한 시간, the time the whole
    process may take, in seconds; 시간 초과 시, 보내기 or 보내지 않기; and where the row comes from, 콘솔 설정 or
    기본값. A list with no question stands as 질문 없음.
  - **Each cell sets that one value,** the row's other values sent with it as they stand — the question a send
    is read from and the time a turn runs before the room is told it is still at work among them, which the
    table does not show — so a default row a cell is changed on becomes the console's row of the same key. A list's dropdown is an ordered pick from the
    catalogue, each question standing under the pack's word for it — 의도 파악, 기억 정리, 메시지 작성 and their kin —
    and one the console added under its own name; the questions chosen stand in that same word, in order, each
    moved up or down or taken out, and a question not yet chosen is added before `final`, which stands last in
    every list that holds a question and is taken out only where it stands alone, emptying the list. 저장 sends the
    list. The two numbers take a whole number, 0 to 1,000 characters and 1 to 3,600 seconds, and 시간 초과 시 is a
    pick of its two.
  - **추가** in the table's head opens a box of a provider (전체 or one the agency lists), a tier (전체 or one
    of its ladder) and an agent (전체 or a registered agent); a key that already stands is not offered. The new
    row starts from the values of the row that key matches now and is the console's at once.
  - **A console's row carries 삭제 at its end,** asked first: the receiver takes the row away, and where the
    policy holds a row of the same key that row stands again. A default row carries none.
  - **A refused set** — a list naming a question the catalogue does not hold, a list not ending in `final`, a
    number out of range — says the pack's sentence for the receiver's code under the box or in a notice, and
    the row stands as the receiver holds it. Every change reaches the next round that reads the table.
- **The questions** (드래프트 질문) stand under the process table: a row per question of the catalogue, its
  name, its text in the language it was written in, and where it comes from, 콘솔 설정 or 기본값. Pressing a
  text opens a box of it, at most 4,000 characters and never empty, saved with 저장; closing it unsaved says
  nothing and keeps nothing of what was typed. 추가 in its head opens a
  box of a new name — a lowercase word of letters, digits and dashes — and its text; the new question is then
  offered in every list's pick. A refusal is said by the pack's sentence for the receiver's code.
- **Either table's read that fails** says so with a reread, as the fold-ratio grid's does.

#### 실행 경로

- **One table of the work keys that are not gates** — the chat agent, the job worker, the two editors, the
  co-work roles (`role:*`), the search depths and browse — with each key's provider, its Claude account,
  its tier, the model its run now starts on (and on which provider), and what last answered on it. A key whose
  enabled providers leave it no road carries a warning mark and says why. Workers share `job-worker`.
  - **Each key's tier and what it resolves to** are the agency's `GET /work-keys`: the tier, the tiers it may take
    and, per provider, the model it resolves to, or why it does not — said under the model in the pack's sentence
    for the agency's code, the agency's own sentence where it gives no code standing as the general sentence
    that the road cannot be taken now. The model's cell keeps a ceiling of its own: a note longer than it is cut on
    one line and stands whole in the tooltip every cut line gets. A key the answer does not carry shows 등급 배정 없음.
  - **A provider is named by its code** in the pack's words — the products by their own names, the registry as
    등록 모델 — never by the agency's English label.
- **The provider cell** chooses 자동 or one provider, for a key that has a road of its own. 자동 walks the
  enabled providers of the order; a provider runs the key on that provider alone and does not walk on,
  and while that provider is off the key walks as 자동 (the agency's `docs/cache-fallback.md`, 「The per-key choice is
  automatic or one provider」). A provider whose program cannot carry the key's run line, or which this
  machine lacks, stands disabled in the list with its reason under it, and the bot refuses it for the
  same reason — receiving it and routing another way at run time would make the screen and the run
  disagree.
- **The 계정 cell** chooses 자동 or one Claude account, so each key can sit on an account of its own. 자동
  walks the account order; a named account runs the key on that account alone and does not move to
  another, and while that account is off the key walks the account order as 자동 does — which the cell
  says under the name. An account that is
  off stands disabled in the list with that as its reason. The cell is pressed wherever the provider cell
  is, which is a key with a road of its own; it shows a dash on a key with no road of its own, and on one
  set to a provider other than Claude Code, since neither key's runs reach an account
  (the agency's `docs/cache-fallback.md`, 「The per-key choice is automatic or one provider」).
- **The tier cell** chooses the key's tier, each choice with the model it maps to on the provider the key
  starts on. A co-work role the pool lends out offers only the co-worker tiers — Reliable, Fine, Light and
  Simple — and the bot refuses the chat agent or Frontier for it; `builder`, the worker's own turn, offers every
  tier. Where an older per-key setting was kept at the migration, the dropdown lists those settings and
  a checkbox that accepts the chosen tier over them before the tier can be picked.

#### 게이트

- **턴 게이트 heads the tab:** every gate a turn passes, as the gate unit's `GET /gates` lists it — the pre-gate's
  and the post-gate's, never an off-turn one and never one the unit has shelved — one row each: its name, where it
  stands (its part and its step), the condition its step runs under, its Laya mode where it has a Laya probe and
  「Laya 질문 없음」 where it has none, its switch where its profile lets it be turned off, and the switch of its
  cache warming where the agency holds a session for it. A dash stands where it has neither switch. The console
  holds no view of a room's verdicts by gate, so a row leads nowhere else.
- **One table of the gates** — each with a profile, so as gates grow the rows grow — with each gate's
  provider, its Claude account, its tier (and under it the registration, Token Size and thinking the
  tier gives it on the registry's provider), its time limit and what last answered on it. The person-book search and summariser and the knowledge
  classifier are rows here too (the brain's `docs/people-book.md`, the brain's `docs/knowledge.md`).
- **The table stands in the parts of the gate order** (the gate unit's documents), each under its own heading row:
  프리게이트, 포스트게이트 and 턴 밖, in that order, one header and one set of columns across all three.
  - Within a part the rows follow the turn's steps. The first cell is the step's number within its
    part; the gates of one step share it and carry a mark that they run together.
  - A step that runs only in some turns names its condition under the number.
  - A gate that runs in both 프리게이트 and 포스트게이트 has a row in each. Both rows are that one gate's
    settings, and a cell changed in one reads the same in the other.
  - A gate's own screen opens its one row alone, without parts.
- **Each cell edits its own value:** the provider, the account and the tier as on 실행 경로, and the time
  limit — always the gate's real value in seconds, chosen from the seconds the screen offers from 5 to
  300 (the bot takes any whole number from 1 to 300). There is no 기본값 choice and no way to empty the
  cell: the table is the only place a gate's wait is set (the agency's `docs/own-llm.md`, 「Per-gate time limit」).
  A gate's model is always its tier, never a provider's model, and
  its thinking and answer room come from that tier, never below the gate's own floor (the agency's `docs/own-llm.md`).
  A gate has one road and nothing behind it, so the time limit is where it gets or loses its verdict.
- **A gate whose profile offers Laya** has Laya among its providers (the gate unit's documents, 「A gate whose
  provider is Laya」). On Laya its tier cell cannot be pressed: it shows 체크포인트 with the checkpoint
  the Laya server names for that gate in its latest health check, or 확인 전 where the server has
  named none, and its account and τ cells show a dash, since neither is read. Its time limit cell
  stays pressable: it is how long the gate waits for Laya, and its fallback LLM again after it. In
  place of its Laya mode stands the LLM it asks where Laya gives no verdict, 대체 with the provider
  or 대체 없음, pressed for the provider its road would begin on with 기본값, 대체 없음 and each
  provider kept on (the gate unit's documents, 「A gate whose provider is Laya」).
- **Laya stands on this tab too** (the gate unit's documents):
  - A band above the table gives the Laya server's state from its latest health check, as the gate unit's `GET
    /laya` answers it — 응답함, 사용 중 where its card was taken for the last call, the failure word, 꺼짐 where no
    address is set, or 확인 전; where the gate unit is not reached, 연결 안 됨 — with the model, the VRAM it holds
    (in whole MB below a gigabyte, in GB to one place from there) and how long the check took, in the node screen's state colours. It is pressed for a popover of the
    details — model, device, VRAM, load time, address, when it was checked and last answered — with
    노드 보기 to the node whose host the address names, where one does. The band and the table share the
    page's one gutter: the band's words start where the table's first column does, its button's own inset
    counted in the gutter rather than added to it.
  - The table carries each gate's Laya mode and τ as cells that edit their own value like the others.
    The mode offers the default, named by the mode it stands for with 기본값 (「The default among choices」), and the four modes; τ offers 없음 and the grid the
    agreement is counted at. A gate that declares no probe shows a dash in both and in the next.
  - **A gate's options are the gate unit's.** Its time limit, its switch, its Laya mode, τ and fallback LLM
    are read with the table from the gate unit's `GET /options/{gateName}`, for each gate its `GET /gates`
    lists, and a cell that changes one writes it with `POST /options/{gateName}`. A row the gate unit does
    not list, or a table read while the unit is not reached, has no options and shows a dash in their cells.
  - Read-only beside them, 일치: the gate's agreement with its LLM, over the pairs it rests on and the
    failures beside them, and at the gate's τ the share Laya would settle and how often it agrees
    there. A gate Laya settles one question at a time counts questions instead of pairs, and beside
    them the share of its questions Laya settled (the gate unit's documents, 「Agreement」). It keeps its place with a skeleton until the records are read.
  - A mode of 필터 or 비대칭 for a gate with no τ is refused by the gate unit, as is a mode the gate cannot
    run in, and the refusal is said in a notice in the pack's sentence for its code. The whole of it is read from the gate unit's `GET /laya` and read again every half minute while the tab
    stands, and when a turn ends.

#### 대화 상대

- **A list heads the tab:** every agent that answers in a room — the chat agent and each companion — one row each
  in the agent list's order, with its mark, its label and its name, whether it is the chat agent or a companion,
  the model it is pinned to (a companion's registration by its label; a dash for the chat agent, whose model is its
  tier's on 실행 경로) and the rooms it answers — the chat agent's room, and each room a companion holds a session in
  or was made for. Pressing a companion's row brings its block below into view; pressing the chat agent's opens its
  own screen. A companion for a model of the deployment's own is added from the tab row's 추가 menu (below).
- **One block for each companion** (the agency's `docs/companions.md`, 「Its settings」), in the agent list's order — a
  companion's system prompt is its base prompt, the fixed companion role and its persona, so what a block sets of it is
  the base prompt and the persona —
  headed by its picture, its label and its name, and the tab is one form (「Forms」): every block's
  changes wait for the one 저장 in the footer at the tab's foot. A block holds, top to bottom:
  - **모델:** its registration, a list of the registrations that have an address; and, where the
    catalogue holds entries for that registration, 엔진 모델, a list of them with the one its engine
    serves now marked 서빙 중. Another entry, once saved, starts the choice, whose progress stands under
    the list as the 일반 tab's 모델 파일 shows it (the agency's `docs/model-catalogue.md`).
  - **기본 프롬프트:** its base prompt (the agency's `docs/base-prompts.md`), a list of 없음 and every base prompt
    by its label.
  - **생성 파라미터:** the generation settings (the agency's `docs/companions.md`, 「Its generation settings」), one
    line each: the setting's name, a few words of what it does beside it in full sight, and a number box
    holding its value, 기본 where the engine's default stands, and its bounds after what it does; a
    switch among them, `preserve_thinking`, is a choice of 기본, 켬 and 끔 in place of the box, with no
    bounds; above them 생각, a choice of 기본, 켬 and 끔. On a phone what it does stands under the name.
  - **참조 주입:** a switch for whether a turn is given its reference block.
  - **페르소나:** the persona's text in a text area as tall as its text, holding
    the companion's own where its settings hold one and its file's otherwise, with 파일 내용 on the
    file's. Saved, the text is the companion's own; 파일 내용으로 되돌리기 puts the file's text back in
    the box, and the save then empties the companion's own.
  - **보낼 시스템 프롬프트:** the saved settings' length and the first twelve characters of its hash,
    with a 크게 보기 button opening the whole text the next turn sends in a modal.
  - **방 세션:** each room the companion holds a session in, its generation, when its system prompt
    last changed, or a dash, and an 초기화 button asking the same as the 일반 tab's 세션 does; a waiting
    reset stands as 초기화 대기. A reset is an action rather than a setting, and goes as it is asked.
  - A save overwrites what it changes, and the block shows no earlier value of any setting.
- **대화 상대 추가** is the tab's 추가 on the tab row (the agency's `docs/companions.md`, 「Where a companion and its
  rooms come from」): a dialog of 이름, 표시 이름, 모델 — the registrations that have an address — 작업
  워커 — the workers but support workers — and 방 제목, with 취소 and 추가. The bot checks every field and
  a refusal stands under the field it names; an added companion stands as a block at once, with a room
  of the console's own that it answers alone. Where a console room already stood under its name, the
  companion takes that room back with its record, and the notice after the add says so.
- **삭제** stands in the header of a block the console added, never of one the deployment seeds. It
  asks first, naming what goes — the companion's settings, sessions and person records — and saying
  that the rooms it answered stay with their messages and documents, and goes as it is asked, as a
  reset does. A room goes only by its own 방 등록 삭제 (「방 등록 삭제」).
- **The save** sends each block's changed settings as one change the bot checks whole, then another
  base prompt, then another engine entry, at once (「Forms」). What a change sets off stands under the
  field it is about while it differs from what is saved: another 툴 or 기본 프롬프트 opening a new
  session in every room, 생성 파라미터 or 생각 starting each room session the companion holds afresh,
  and another engine entry loading on its engine, with the registration answering nothing until the
  engine is up again.
- **A refused save** keeps every field as written with the bot's reason under the one it names.

#### 서쳐

- **The searchers' work keys, as rows of the road table.** A research is a session the agency starts on a
  research work key, its model and tier read off that key's road and the tier table (the agency's `docs/api.md`,
  「What the redesign took out」). The tab holds the keys on the agency's search and browse lines — a profile whose
  line is one of them, and a tier-assigned key no profile declares that the agency puts on one by its name — each as
  the 실행 경로 tab's row: its provider, its Claude account, its tier, the model its run now starts on and what last
  answered on it. Each cell saves through the same road and tier assignment as there and meets the same refusals;
  a read that fails is that table's, with its reread.
- **Where the agency holds no research key,** one sentence says so in place of the table.
- **What every research run is held to** stands under it, as the agency's research settings hold it (the agency's
  `docs/research-runs.md`, 「What a run is held to: the research settings」), each value in a cell of its own that
  saves that one value at once as the road table's cells do, and meets the agency's refusal under its box:
  - **키별 한도** — a research key to a row, under the name the road table gives it: **브랜치**, how many pooled
    branches a run of it may open, and **시간**, for how many minutes its web tools stay open.
  - **가져오기** — one row of the four settings every key shares: **브랜치 역할**, the co-worker role whose tier a
    search's branches go out on, chosen from the agency's co-worker roles; **가져오기 전략**, one of three — 직접
    먼저, 브라우저 먼저 or 직접만; and **호스트 간격** and **엔진 간격**, the milliseconds between two direct
    requests to one host and between two requests to one search engine, each 기본값 where the web tools' own
    stands and set back to it by an emptied box.
  - Whether a value is the policy's default or the owner's own stands beside the section's title.
- **검색 엔진** — every search engine the web tools answer for, one row each: its name, its category, its state
  as a mark and a word — 정상, 저하, 중단 — and where they are known why, when it was last seen and, for one
  suspended, how long it stays so. Where the engines could not be read, one line says why in their place. The
  table is read again with the settings.

#### Around the tabs

- **What is refused, the list and the key say.** A nonexistent work key, a model or effort a provider's
  catalogue does not offer, a mode other than `auto` or one of the four providers, an order that does
  not hold the four providers once each with at least one on, an account choice other than `auto` or an
  account that exists, an account order that does not hold every registered account once each with at
  least one on, an account whose configuration directory or token file is not an absolute path that is
  there, an account under a name another already carries, a registry effort other than empty,
  `thinking` or `no-thinking`, a Token Size other than the four offered, and a gate time limit that is empty or outside
  1 to 300 seconds are not saved. Each model is checked against its real list where it is saved.
- The run prompt put into a job, search or gate has nothing to do with the length of one Telegram
  message. A web control request takes up to a million characters, and whether it can enter the model
  is decided by the chosen model's context and that run's system prompt. Words sent to a room and
  attached to an upload take up to 100,000 characters, and what does not fit one Telegram message the
  bot splits (the room screen's **input box**).
- **The title bar's limit follows the slot the chat runs on.** It shows the provider the chat's road answers on, the
  login it walks to where that provider holds more than one, and that slot's own session and weekly windows as the agency
  states them; the expanded panel holds a group for every registered Claude account, in the order the agency lists them,
  each headed by the account's name and holding its own session and weekly figures and reset times, so what one account
  has left is read without asking which one is answering now (「Usage in the title bar」). The slot the chat runs on is
  marked in its group heading. An account with no reading still has its group, saying so, and a provider that reports no
  window, such as one paid by the request, stands as its name with 「—」.
- **A privileged Codex is YOLO and never-ask.** A room and job worker allowed all four tools in Claude
  Code, like the owner's private chat, run with `--dangerously-bypass-approvals-and-sandbox`. It is not
  the half setting of only `approval_policy=never` with a workspace-write bubblewrap, so local TODO,
  search and control scripts are not blocked on loopback and the worker finishes the deployment
  procedure outside the repository too. An ordinary room keeps the existing permission boundary as
  read-only, and a gate takes no shell tool in the first place.

### Agent screen

- The place to read one agent's log. Not a summary or a verdict but the lines that agent actually left
  inside, as they are. A designated agent's room session — the chat agent's or a companion's — shows its standing pane
  the same way for every agent: what the session was handed and how it answered, as the pane shows it
  (the agency's `docs/companions.md`, 「What a turn shows」). A running run appends new lines as they arrive, and a finished run scrolls up to
  rewind. While standing at the very bottom it follows new lines down, and while scrolled up to read it
  does not follow. Only the reader takes it off the bottom: the window growing shorter under the input box
  that arrives at the foot of a worker's screen, or the lines reflowing, leaves a reader at the bottom there.
- Entering by pressing a line in live status opens not at the log's end but where that run started. Then
  **이전 줄 더 보기** and **다음 줄 더 보기** stand together to go both ways, and new lines are not followed
  automatically. Pressing 다음 줄 to catch up to the log's end resumes following from there.
- Beside the agent's name in the title bar stand its branch and a chart mark. The mark carries no
  figure; pressing it spreads this agent's figures — its model, the context its session holds and the
  week's tokens with their names and a bar — and an agent nothing is known about has no mark. While running, 「업타임 00:00:00」 stands beside it. Not
  the start time but the length from start to now, redrawn only in that place every second — not redrawing
  the screen, not asking the bot more. Which agent it is the same header's name already says, so that line
  carries only the length. A gate's screen also has, beside its name, the button to the place to test that
  gate alone. The right end of the title bar keeps only what every screen carries.
- **At phone width the bar keeps the name readable and folds what stands beside it** (sm, the width every
  title bar folds at). The uptime goes behind the chart mark, standing above the figures when it is pressed,
  and the mark stands for the uptime alone where the agent has no figures. 중지, the gate's test and 설정
  are one group behind the shared vertical-dots menu, whose button spins while a stop is under way. The
  bar's marks keep the one square every title bar's marks have, and none of them overlaps another.
  `client/tests/browser/agent-topbar.test.ts` measures the bar of a running worker at 360, 390 and 1280 pixels
  wide against a dev console, as the other title bar checks do.
- **설정** stands beside the name, as an icon button, where the agent has settings of its own: a job
  worker's opens the worker settings dialog of the agent management screen's 워커 tab, a gate's opens
  that gate's row of the 게이트 table in a dialog, and an agent that answers in a room — the chat agent, a
  companion — opens its gates, as its 게이트 cell of 에이전트별 설정 holds them, in a dialog. Every other agent has no such button, since what it runs
  on is either shared or set on the agent management screen alone. Saving here is saving there: the same
  path, the same refusals, and the name, marks and model on this screen read again after a save.
- A line has a time, a kind and content. There are eight kinds.
  - **시작** — a run opened. Which room's work, and which model and depth it runs at, attach.
  - **생각** — the thinking the run wrote itself.
  - **말** — the text the run wrote.
  - **프롬프트** — the input handed to the model. The prompt a gate received and the script handed to a
    Claude workflow stand here. The chat agent's chat agent stands here each turn's request prompt as it was sent —
    the turn scope, the room context, the references the gates chose, the quiet instructions and the
    message blocks — and, as a line of its own labelled **시스템 프롬프트**, the system prompt its session
    was launched with. The system prompt line is written when a launch composes a system prompt whose
    text differs from the last one written for that agent, so each distinct version stands once, in the
    run that first carried it.
  - **What it was handed** — what the turn was handed before it ran, one line per piece and in the order it entered the
    prompt. Each wears the word its own sort has — **방 문맥**, **기억**, **인물북**, **참조 문서**, **룰**,
    **지식**, **지난 대화** — and they share one tone, so they read as one family and the word is what tells
    one from another. The line names the piece: the slug or path of a document, a person's own sheet, and for
    the archive the room with the numbers read back and how many messages that was. A reference document
    wears one more mark left of its word, an icon alone: one for a body that went in full on this turn,
    another for one the session already held, which went as a one-line mark (the gate unit's documents,
    「Loaded once per session」). The mark names itself in a tooltip on hover and on a held finger. Only an
    agent whose log keeps whole what its runs were handed writes them, which is the chat agent's chat and nothing else.
  - **메모** — what the bot wrote beside the run. Where the run line went, whether appended words went in,
    why the run could not answer, what instruction a branch received.
  - **A call** — what was called and what came back, as one block in the Claude Code terminal look (「A tool
    call」 below). It wears no kind word.
  - **답** — the answer a pane program's turn gave, its words standing as markdown; the record's own fields
    around them — the model, the usage, how full the session stood — are no part of the line.
  - **끝** — how the run ended.
- **A pane program's progress lines are no line of the log.** The agency files a pane program's `progress`
  records as they come (its `docs/run-records.md`, 「Agent log」), and each is read into what it says rather than
  shown: a call's start and its settling are the call's own block, matched by the call's id, its mark spinning
  while the call runs and its result line saying how long it ran and how much came back once it settled; a usage
  record is the run's running total in the work view's head (「The work view」); how full the session stands is
  the head's context figure; the thinking and writing phases are what 지금 says. None stands as a row, and no
  field of one — its id, its moment, its call's id, whether its input was cut — is shown.
- **A line of a kind the console does not know** wears its kind's own word and a 자세히 press that spreads what
  it holds as a name and value list; it never stands as a bare field list.
- The text of thinking, words, notes and end stands as markdown text (「Text written in markdown」),
  and the start line, the prompt, a call's command and its result stand as the literal characters sent.
- **A prompt stands whole.** It is shown in full, verbatim and monospaced, with its line breaks kept — no
  markdown rendering, no clamp, no fold and no summary. A long one wraps and scrolls inside the log's own
  scroll region, and never scrolls the page sideways.
- **A tool call** is one block in the terminal look a diff is drawn in: a bordered box of monospaced lines on
  the screen's own surface, the same component for every tool. Nothing of a call stands as its raw JSON. A call
  and its result are one pair: the command, and its result right under it in the same block, matched by the
  call's id however many lines were written between them.
  1. **The top line is the call's description**, the one it came with; a call that came with none names its tool
     and its key argument instead — the file for `Read`, `Write` and `Edit`, the pattern for a search, the
     address for the web, the instruction for a subagent — and an MCP tool by its name without its server.
  2. **Under it, the command, as a prompt of oh-my-zsh's pure theme in the console's ANSI palette** (one palette,
     declared once as tokens, in both themes). Its first line names who ran it, `worker@checkout` — the agent and
     the checkout's folder name — then the call's time, the checkout's path in blue and its branch, with a red `*`
     where the checkout is dirty; the branch and the mark stand only where a unit serves them (`docs/boundary.md`,
     「Gaps the console meets」). Its second line is a blue `❯` and the command: a shell call's command line, any
     other tool's call written as a command — its name and its arguments, each value as it was sent. The command
     is never folded: it stands whole, wrapping at the box's width, its line breaks and indentation kept. A shell
     command is coloured the way zsh's syntax highlighting colours a typed line, in the same ANSI palette: the
     command words, the options, the quoted strings, the variables, and the pipes, redirections and separators,
     each a colour of its own. A shell command that visibly writes a file — a redirection into it, `tee`, `sed -i`
     — names that file on its top line after its description.
  3. **Under it, the result,** the only part of a call that folds. Its first five lines always stand; where it
     runs longer, a press under them shows how many lines are hidden and spreads them, and the same press folds
     them back. It is coloured by the console's one code highlighter, the chat's code blocks' own, in the language
     the call's target names: a file tool's result and a shell command that reads one file by that file's
     extension; a search's result line by line, each by its own path's extension, the path and the line number
     coloured apart from the text; and only where no extension is known, by what the text is — JSON, a diff or a
     shell session. A result that carries none of these stands plain. A road that records no result text — a
     pane program that says only how long a call ran — stands that one line.
  4. **A file change stands in the same block as `Updated`**: an edit or a write — Claude Code's `Edit`,
     `MultiEdit` and `Write`, a pane program's `edit` and `write` — is drawn as the change it made, read off the
     call's own arguments (the text it replaced and the text it put in, or the whole of what it wrote), and so is
     a result carrying the structured patch its provider recorded. The change is drawn as Claude Code draws it: a
     head naming it (`Update(<path>)`, `Write(<path>)`, or `Updated <path> (+n -m)` for a file a shell command
     changed) with how many lines went in and out, and under it the changed lines with a `+` or `-` mark, context
     lines unmarked, added and removed lines in the success and error tones of the brain chip's added lines, with
     their line numbers where the record knows them. The lines start folded under the head, which is pressed to
     spread them and again to fold them. The path is relative to the checkout where it lies inside it, and on a
     phone a long line wraps inside the block.
  - The screen is sent only the patch, the file path and the result's type out of the stored structured result,
    never the whole of it; a patch past the size the screen is sent stands as the ordinary result instead.
  - **Codex's file changes are drawn the same way.** Codex's own stream names only the paths a patch touched; the
    diff is in the session record Codex keeps for the thread, read as the run goes and put beside the result line
    it belongs to, matched by the set of paths in the order the changes happened. A file Codex changed through a
    shell command, and a run that keeps no thread, have no diff. OpenRouter and the deployment's own registered
    engines record no tool events, so they have no diff.
- **Every run carries what it spent.** Under the line a run ended on stands the same token chip the
  room screen puts beside an answer (「Room screen」): the tokens that one run wrote. Pressing it spreads
  its lines, each with its four kinds as a bar, and a run that went unmeasured says so on its own line; a
  run with no runs of its own to list spreads one line, 「이 실행」, with its four figures and their bar.
  - A run is named by the run its log lines are kept under, and the usage record carries that name on
    each row the run wrote, so a run's figure is its own rows and no neighbour's.
  - A gate's run that reported nothing has no usage row, and its chip is read off the road it
    walked, which says it went unmeasured rather than showing noughts.
  - A run with no usage row and no road — a job on an OpenRouter dsh line, a run killed
    before its result — has no chip. So has a run whose rows were written before the record carried
    the run's name.
- **A the chat agent turn carries its round.** On the chat agent's chat agent screen the chip of a turn's run adds up the
  whole round that turn belongs to, by the rule of the room screen's chip, and pressing it spreads one
  line per run of the round — the turn itself, every gate that read its messages or its answer, and
  every rewrite: the stage, the provider and model that answered, how long it took and the four
  figures. A road written before its tokens were kept on it shows 「—」 for them. The run of a rewrite
  is a run of the same session too, and its own chip carries its own reading only, so the round is
  counted once, on the turn.
  - The round is named on the gate road record, on the turn's own road and on the messages it sent,
    so a turn's round is read by that name.
  - A turn whose call failed still carries its round: its own road is written as failed, with no
    figures, and the chip reads the gates that did report plus the turn as unmeasured.
  - While a turn of the chat is running, the foot of its agent screen carries that turn's live chip,
    the same one the room's running line carries. No other agent's stream tells the screen what it
    spends as it goes, so no other run has such a chip; its chip arrives when the run ends. A job
    worker's job has its job line instead (below).
- **A job worker's screen carries its job at the head of its work view** (「The work view」), the figures the CLI
  keeps at the foot of its own screen. It speaks of one job: the run the screen was opened at where that run is one
  of this worker's jobs, otherwise the job the worker is running now, otherwise its last one. A worker with no job
  yet has none.
  - **작업 지시** is the job's prompt in its Korean reading, and under 영어본 the English its worker was handed
    where that says something else (docs/worker-language.md, 「A job's prompt」), read once the job is known, with a
    skeleton of one line until it lands; it stands on one line in the head and spreads whole when pressed.
  - **The job line** is one line — the item's number and title (or the purpose of a job with no item), 「실행 중
    00:12:34」 ticking or how long a finished job took, how many tool calls the job made, subagents' included, and the
    tokens — and the spread work order holds one line per model the job used: the model, 「총 …」 and its four kinds
    as the popover's bar (「Usage in the title bar」). The item's number opens the item.
  - The figures are bmo-job's (its `docs/reading.md`, "A worker's job line") once the job has ended: what the spans
    it wrote as it ended say it called and spent. While it runs, bmo-job says neither what its models have spent
    nor every call it made (`docs/boundary.md`, 「Gaps the console meets」), so they are read off its log as it grows
    (「The work view」): the calls whose result has come back, and the newest usage record of the job's run, as
    입력, 출력 and 캐시 읽기. A job whose log holds neither yet, and a finished job that wrote no spend, read 「—」.
  - They are asked again on the poll, whenever a turn ends, and whenever the agency says a job started, changed or
    ended, so the view follows a job without the screen being reopened.
  - A road written before the record carried the round is placed by time instead. The turn's own
    road is the one of its room written inside the turn's log lines, and every other road of the room
    goes to the turn before or after it by the message it was about and by nearness in time.
- **A subagent** has its own place. When a job or runner calls a tool that spreads a branch, that call
  becomes the subagent's head, and what happened inside that branch — the tools it called, results and
  words — attaches indented one step under that head. Each branch's doing is read separately. A line
  belonging to no branch is not indented.
- Which branch a line belongs to is set by the id of the call it came from, not by what the branch-spreading
  tool's name is. The name the CLI sets and it may change, but the id the stream carries per line, so a
  branch whose name is unknown lands in its place too.
- **A Claude workflow** stands in the same place in the same shape. A Claude workflow the CLI runs not as a
  tool-call chain in the stream but as its own background task, so the stream carries only that the task
  started, how the branches are going, and that it ended. So below a Claude workflow call the script handed
  over stands first, and per branch what instruction on which model and how it ended — elapsed, tokens, how
  many tools it used, the head of what it returned — stand in order while running. The tools, arguments and
  results a branch called inside attach after the Claude workflow ended — because the Claude workflow's
  per-branch record is read then, and there was none in the stream before that. A branch has a ceiling on the
  lines it can put in the log, so a widely spread job does not push out its own log.
- **The log is flat.** One agent's log is every line it left, one after another in the order written; a run begins
  at its 시작 line and ends at its 끝 line, with what it spent under that line, and no run is folded or made a step.
  Where two runs went side by side, each line still stands under the agent's one flow, its run named on its 시작
  line. A worker session whose job is a co-work item or carries a plan stands the stepper above its log
  (「The progress stepper」).
  - **A line that is words** stands as the markdown it was written in; **a line that is a record** — how the run
    was opened, a stream's own event — stands as its named fields where it is a JSON object or list, a text inside
    it that is itself JSON among them, and whole as it was stored otherwise (「A value shown as what it is」).
  - **The agent screen keeps the panel's room at its foot** under the last line, as every content screen does
    (bmo-ui's `docs/design.md`, 「Room at the foot」), and gives it up only where the launch box stands there.
- **The work view.** A worker's screen, the agent log dialog a room, the live board or the TODO panel opens, and the
  co-work stage dialog are one view, opened from different places; nothing in it depends on where it was opened.
  It is a fixed head over one scrolling body:
  1. **The head stays in view** however far the log is scrolled, and is compact: one line of the job — its item's
     number and title, its state mark (spinning while it runs), how long it has run or took, how many tool calls it
     made and the tokens — then **지금**, what the session is doing now while it runs, then **작업 지시** on one line,
     cut, which is pressed to spread the whole work order — the English its worker was handed and every model's
     share with it — and pressed again to fold it.
  2. **지금** says the current stage of the stepper by the stage's own words where the job has stages, and the
     newest call by its description, or the newest line the session wrote; never a tool's or a stage's key.
  3. **The figures are read off the log as it grows** while the job runs: the tool calls are the calls whose result
     has come back, and the tokens are the newest usage record's — 입력, 출력 and 캐시 읽기 — and once the job has
     ended its own figures stand. 「—」 stands only where nothing has been read yet. How full the session stands
     follows, where its record says.
  4. **The stages**, where the job is a co-work item or the worker laid out a plan, and **결과**, what the stage or the
     job left — its result, its failure, or why it was skipped — stand at the top of the body, above the log.
  5. **로그** — the session's log, flat, a co-work stage's narrowed to that stage's run, the one part that scrolls.
     It opens at its end, the newest lines in view, and follows the end while new lines arrive as long as the
     reader is at the end; scrolling up stops the following, and a 맨 아래로 button standing over the log's foot
     takes the reader back to the end and following again. A view opened at an older run of the agent's own screen
     opens at that run instead.
  The view grows with its log wherever it stands and is never squeezed to the box it scrolls in, so the head stays in
  view on a worker's screen as in a dialog. The dialog's **페이지로** opens the worker's screen at the run the dialog
  stood at, and at its end where the dialog opened there, so the screen shows the same head over the same log.
  A stage of several tasks is no tab row of them: each task is a sub-stage of the stepper, and opening one opens
  the view at that task.
- **The input box that speaks to a runner or a worker directly** is below. It stands on the searcher and
  browser searcher, and **each job worker's screen**. Which agent is a worker is what the archive answers, not
  a list the app holds — if the owner makes one more worker, names it and points it at its repository, this input
  box stands on that worker's screen with nothing said. Writing names in the app would know only workers there
  at writing, and would never stand on a worker made after. It does not stand on a name the catalogue does not
  call a worker — the log still opens. What the box does differs by whose screen it is on, and it says which by
  its own label: **시킬 일** on a runner's screen and **할 말** on a worker's.
- **On a runner's screen it launches that runner** without the room's chat agent, and the launched run's log flows in
  the same place. The launching is the same as when the chat agent launches — a searcher chooses a depth. The launching
  call returns at once without waiting, and when the run ends its result goes to the owner's private chat like
  any run.
- **On a worker's screen it says something to that worker itself, and launches nothing.** the owner's word to a
  worker is not a job: it is a direct instruction in an emergency, or a remark added to what the worker is
  already doing, so it opens no unit and takes none of that worker's job place — the queue goes on naming
  items while the word is being answered, and no job chip stands under the screen for it. This box is where
  the owner tells a worker something at once, so the words go straight into that worker's own pane, within seconds,
  by whichever of the two roads fits:
  - **A turn of the worker's own is running** — a job of it, or a turn answering an earlier word — the words
    are put into that turn's input queue, exactly as words appended to a job's own item are, and the turn
    takes them into what it is doing.
  - **Nothing is running in its pane** — a turn of the worker's own is started on the spot, on the session a
    job would resume. With no session standing, that turn brings one up: the same road the worker's keepalive
    takes to wake it.
  - **Another worker's job in the same checkout is no obstacle.** What a word waits on is the worker's own
    pane, not the checkout: two workers pointed at one directory each take words in their own pane whatever
    the other is running.
  - Either way the words wait in the archive until a session has actually been handed them, and are tried
    again every few seconds until then, so a word that reached nobody is handed over at the next chance
    rather than lost.
  - **Why a word has not gone in stands under it.** A pane waiting on a question a person has to answer, a
    machine at rest or a provider switched off leaves a line under the word saying so, once; such a word
    is tried again a minute later, or at once when another word is said. A word put into a running job's
    turn says so under it too.
- **A word and its answer stand on that worker's screen and nowhere else.** The bot writes the word into the
  worker's own log the moment it is said, as a line of its own labelled 보낸 말, so it stands above the box
  whether it has reached a session yet or not. What the worker answers to a turn of its own is written into
  the same log, in the run that word opened; what it answers inside a running job is part of that job's own
  run and report. Neither is sent to any room: the owner's private chat is the chat agent's, and a word said to a worker
  never becomes something the chat agent said there.
- **This box is the room's own box** (「Room screen」): the same Enter rule, growth, draft, long-paste marks and
  attachment tray, from one component. On a worker's screen it takes files too — by the clip, a paste or a drop,
  up to ten at 50MB each — and words may be left out when files are there. The bot writes a word's files
  into a directory of their own under that worker's workbench (`uploads/<time>-<id>/`, keeping each file's
  name and numbering a repeated one) and ends the words with the list of their paths, so the worker reads
  them with its own tools. A searcher's and a browser searcher's box offers no clip: those runners are shown
  the web and nothing on this machine.

#### Where the log comes from

- The log is **the agency's run log** (the agency's `docs/api.md`, 「Run log and run records」): the very process
  reading the run's stream writes it a line at a time as it reads, and the console reads one agent's whole log —
  every line it left, across its runs — through the agency's `GET /log/agents/{agentName}/lines`. The screen opens
  on the newest page, reads the page before the oldest line it holds and follows the newest, and opens at the page
  a moment stands in, narrowed to a room where the link names one. A screen opened at one run reads that run from
  the agency's `GET /log-lines`, narrowed to it, and the lines above it are the same agent log: a page read upward
  from a run lands on the lines the run before it left.
- **Why it is written rather than streamed:** each arriving line is kept, so a run killed from outside stays up to
  just before it died, and a finished run rewinds by going back by id. Relaying the stream alone would lose a killed
  run's end and could not rewind a finished one, and pushing what one job pours to each connected browser is the
  console's to avoid.
- The screen asks for new lines after an id every few seconds, through this app's server, only while a log is open.
- **A worker job's detailed record takes as its original the structured record the provider left, not the
  terminal screen.** herdr's `pane.read` can read one scene of the alternate screen visible now and
  `pane_output_changed` reports the revision that scene changed to, but does not re-give the letters of a past
  revision. A screen with width-dependent reflow and ANSI overwrites cannot split tool calls and results
  exactly, and cannot be read after the pane closed. So a pane can be used only to link a run to a pane or to
  know the current screen changed, and is not the data deciding run order, a tool's success or replaying a
  finished job. There is no opening, focusing or typing into a pane for the console.
- Claude Code hands over the `assistant` and `user` records of the session JSONL the worker already reads
  without shortening, preserving `tool_use` and `tool_result` and the structured result beside them. Codex
  preserves the start and end of the item exec emits the same way. The block order inside one source event,
  the provider's message and item ids, the tool ref and parent, and a sequence that keeps rising within a job
  are written together, so several lines in the same second do not shake order. The thinking shown on screen is
  only the thinking summary actually in this record, and no hidden reasoning not in the record is made or
  revealed.
- OpenRouter's dsh run lines give only the final answer with no structured intermediate tool
  events. A job on this run line writes only the answer and end state, and reads detailed records of Bash, Read,
  Edit and the like as **지원하지 않음**. It does not scrape the terminal screen to make tool events that were not
  there. Likewise an Edit, MultiEdit or Write that has only a call with no result proving success is written as
  a request only and not called an applied diff. If failure is stated, as failed; if there is a result but its
  application cannot be proven, left as unconfirmed.
- A worker job line binds directly to `jobs.id`. A retry has a new job id and new sequence, and provider fallback
  continues within the same job as lines with each provider's source. The line stands a readable head, and the
  full text and structured result are preserved beside it. A line already cut before the new code came has only
  the remaining text.
- These detailed lines, unlike an ordinary agent log's recent view, stay while the job row stays. The ordinary
  log's line-count and age cleanup deletes only lines not bound to a job, and does not return the latest log
  instead when a nonexistent job or an already-gone record is asked.

#### What a turn was handed

- A turn of the chat agent's chat does not ask for most of what it reads: the room's own context, its standing memories, the
  sheets of whoever spoke, the chunks the reference gates and the person-book search picked, and the
  stretch of the room the turn went back and read are all put in front of it while its prompt is built. None of
  it is a tool call, so nothing of it would be visible anywhere; each piece is written as a `context` line of
  its own, after the prompt line and in the order it entered the prompt.
- The line's name says which sort of thing it is — `room`, `memory`, `person`, `document`, `rule`, `knowledge`,
  `archive` — and each library and each standing entry answers for its own sort rather than a reader guessing
  it from a path. The text says which piece: a slug or a path for a document, the sheet's own file for a
  person, and for the archive the room with the numbers it read and how many messages that was. A reply
  reaching back for a message not otherwise on the page is its own archive line.
- What is already written down elsewhere is not written twice: the system prompt is a prompt line of its own,
  the turn's own prompt holds the quiet instruction whole, and messages the chat agent re-reads by running a script of its
  own during the turn are that tool call's lines.
- A room whose context this run does not restate leaves no `room` line — the session it continues already holds
  it, so nothing entered there.
- Only a log that keeps whole what its runs were handed writes these, which is the chat agent's chat and nothing else.

#### What a line never carries

- A credential is taken out of a tool call and out of what the tool handed back before the line is written,
  so the archive never holds one and no screen has to hide it. What goes is the value alone: an authorization
  header's token, a provider key, the value of a `--password`-style flag, an assignment such as
  `TELEGRAM_BOT_TOKEN=…`, a password written into an address, the password the console's own account script
  takes, and any field of a tool's arguments whose name says it holds one — its whole value, whether a string
  or a login given as an object or a list. `«가려진 값»` stands in its place.
- A call that opened a file whose contents are credentials — an env file, a key, a credentials file, by the
  same rule the code review uses to hide such a file — keeps its arguments, so the line still says which file
  was read, and its result is not kept at all: every line of such a file is a value, and there is no shape to
  look for.
- What a run and the bot wrote in their own words — thinking, the answer, notes, a verdict — is never touched
  by this. Only a tool's arguments and a tool's result are.
- Masking takes time in proportion to the line's length. A job's runner masks each line on the same thread
  that watches the job's pane, and a picture a tool hands back is one word of hundreds of thousands of
  characters with no space in it; a shape that searched such a word afresh from every character in it would
  hold the runner for minutes a picture, leave it far behind the record, and keep the job open long after
  its session ended.

#### How much is kept

Four bounds keep it from growing forever.

- **One line's list length** — a line bound to a job carries up to 4,000 characters in the list including
  thinking, words, notes and end, and reads the separately preserved full text split into fixed sizes. Of those,
  tool arguments and tool results carry up to 2,000 in the list.
  - A non-job agent log does not cut a person-written line.
  - It cuts tool arguments and results at 2,000 and a gate's prompt at 4,000, and keeps nothing past the cut.
  - An agent whose log keeps its prompts whole — the chat agent's chat agent — stores every prompt line in full,
    and the screen shows that full text.
- **Lines per agent** — only the recent 4,000 lines not bound to a job are kept and older ones deleted.
- **Age** — a line not bound to a job and older than 7 days is deleted regardless of the per-agent line count.
- **Bytes per agent** — the lines not bound to a job hold at most 64 MB of text per agent; past that the
  oldest are deleted first.
- A run that has not written its end line is reached by neither the line count nor the bytes. One agent
  answers for every room the chat agent talks in, so a turn waiting on a tool would otherwise lose its own opening
  lines to the rooms writing beside it and could no longer be read from its start. The age still takes it:
  a run open a week later is not one anybody is waiting on.
- An agent's newest system prompt line is deleted by none of these bounds, so the version its session runs
  on always stands.
- Deletion is done by the writing side once every 200 lines, and once when the bot starts.

### Room screen

- **The room is the receiver's.** Its list, its name and its line, page by page, past a message, one message and
  where a day begins, are read from the receiver's console routes, and the owner's words and files go out through
  its sends (`docs/boundary.md`, 「Calls the console makes」). A message that carries files is read again for them
  and for the metadata it arrived with; a photo, a file's bytes, the room's pictures, its figures and the chat
  agent's window come from the receiver's routes for each; the verdicts a message was judged by come from the
  gate, and what a round spent and did from the agency. What no unit serves the console stands empty — what
  opened a turn beside its verdicts, a line's voice briefing and a link's preview — and the sections below
  that draw them stand empty with them (`docs/boundary.md`, 「Gaps the console meets」).
- Conversation piles up as a chat screen. The right is the owner's own side and nobody else's: what they
  themselves sent stands there, and every other voice — the chat agent, another person in a group, a notice — stands on
  the left, the same rule in their own chat as in a group. The side says whose message it is and nothing
  about how it reads: an agent's answer, the chat agent's or a companion's, is markdown, and what
  a person wrote is still the characters it is. Which messages an agent sent is the
  server's answer, carried on each message, and never a name the screen compares: the server asks the receiver,
  once for each sender on a page, whether a message of that sender's is one an agent filed. So a row standing for a
  turn and the answer that takes its place wear one look, whichever agent answers.
  - **An answer sent in the owner's own account wears the agent's face.** A room answered in a chat service's
    `human-avatar` voice has the agent's words go out under the owner's account there, so the archive files them
    under the owner's number and name. A send the receiver archived itself names the agent whose words they are and
    the voice it went out in (`human-avatar`, `human-reader` or the agent's own `bot-account`; the receiver's
    `docs/api.md`, 「Messages」). The row of a send in a person's account wears that agent's name — its label in the
    `agents` table — and its picture, and beside the name a small mark naming the account it went out in,
    "〈이름〉 계정으로 보냄"; a send in the agent's own bot account is the agent's alone. A message that names no
    agent was written before the receiver named one on its sends, so the server asks once for each agent's number on
    a page whose messages went out in a round whether that number is the owner's, and a message under it that went out
    in no round stands under the account's own name and picture.
  - **Which messages stand on the right.** A message is the signed-in person's, and stands on the right, when
    its sender is any of the senders linked to their account on the account service (`docs/accounts.md`, 「Users
    and senders」), or, for the platform administrator, the sender the receiver names as the owner's (its
    `GET /owner`), under which the receiver archives every message the owner sends from the console. It holds in
    every room alike, one a chat service carries and one the console made on the record road. Where no sender is
    known as theirs the room reads down the left.
  Times are all Seoul time. A date mark goes
  where the date changes, holding to the top while its day is read. Pressing it opens a calendar centred under
  it, and the day chosen there brings the room to the first thing said that day or after it; a day after which
  nothing was said says so. Scrolling up loads 100 more earlier messages at a time, and while standing at the
  bottom the screen follows each new message in, as far as its first line allows (below).
- **What is taken from Telegram is how the conversation behaves and is laid out, never how it looks.** Runs, what
  stands inside a bubble, the photo holding to the foot, how a message arrives and how the way down comes and goes
  follow Telegram; the corners, colours, buttons, the input and the top bar are the console's own shared style
  (「The conversation's measures」).
- **Every message is a bubble.** Someone else's words, an agent's answer among them, stand on the raised
  ground; the owner's own stand on mint (「The conversation's measures」). A picture, an album and a file stand in a bubble
  too; only a sticker sent alone stands with no bubble (「말 없는 메시지」). Everything a message says of itself
  stands inside its bubble: the sender's name at its head, the meta line at its foot (「메타 줄」), and what the
  meta line's chips spread, under it (「칩 줄」).
  - A bubble's words break where they have a space, so a Korean word never folds a syllable onto a line of its
    own; only a run with no break in it wider than the bubble, a long web address among them, folds anywhere.
  - A file it holds, the sound player among them, stays inside its inner room at every width, never cut at its
    trailing edge (「소리 듣기」).
- **One sender's run is one block.** Messages one after another from the same sender on the same side form a
  run, whatever each carries — words, a picture, an album, a file, a voice — as long as each comes within ten
  minutes of the one before it, on the same day, with nothing standing between them.
  - Two messages of a run stand half the step apart that two runs stand, so a run reads as one block beside its
    name, its corners, its tail and its photo (「The conversation's measures」).
  - The sender's name stands once, at the head of the run's first bubble, inside it. The owner's own runs carry
    no name: the right side is theirs alone.
  - Every corner of a bubble takes the large tier; where two bubbles of a run meet, the corners on the photo's
    side take the small tier, so the run reads as one block, and the corner its tail hangs from is square.
  - A notice, a turn passed over (「A turn the chat agent chose not to answer」) and a date mark each end the run before them.
  - A running turn's row is a row of its speaker's run like any other, so the answer that takes its place stands
    in the same run, in the same bubble and beside the same photo.
- **The run's last bubble carries the tail.** A small tail in the bubble's own colour hangs off its foot on the
  photo's side, left for the others and right for the owner, and that corner is square. No other bubble of the
  run carries one, and a message with no bubble has no tail either.
  - **The tail wraps the photo.** Its concave edge is an arc on the photo circle's own centre, its radius the
    photo's radius plus the step between the photo and the bubble, so it follows the photo's edge at that one
    step all the way. The arc leaves the bubble's side at the height of the photo's centre, where it runs
    straight down the side, so the two meet without a corner, and ends on the bubble's foot line.
  - Its size is read off the photo and that step alone: as tall as the photo's radius and as wide as the step.
    A photo or a step of another size draws another tail, and no measure of the tail's own stands anywhere.
  - It reaches a pixel into the bubble, painted in the same colour, so no seam stands between the two at any
    pixel ratio.
- **One width for both sides.** A bubble on either side is at most the same width, set by the room's width.
  - Under 640px, a phone's width, it is the row less its own photo's column and the choosing column
    (「Choosing and copying」), so it runs on over most of the far side's photo column: a phone has no room to keep that
    column clear, and a meta line of chips needs it to stand on one line. The choosing column stays clear on the far
    side at all times, so a message on the left slid aside by it while choosing is never cut or narrowed, and the
    owner's messages on the right leave it free for the marks.
  - From 640px it is the row less the photo's column on its own side and the photo's column on the other, so the
    far column stays clear and a bubble on the left never reaches where one on the right could begin, and also
    at most three quarters of the row less its own photo's column. The far photo column is wider than the
    choosing column, so it keeps that clear too.
- **A bubble is as wide as its widest line.** Words that wrap, a meta line that drops under them and a
  chip line that wraps leave the bubble as wide as the longest line they actually stand on — a line of
  the words with any blank kept at its end, a line of the meta line, the sender's name and the quote at
  its head — never as wide as the room it could have taken, so no blank stands at the trailing side of
  a wrapped bubble.
  - Each line wraps where it wrapped before; only the empty room past the longest line is taken away.
  - A bubble holding anything but words and its meta line under its head — a picture, a link card, a
    file, a running turn, a chip's spread standing open — keeps the width its contents ask for; one holding a
    sound player is as wide as the player or its words (「소리 듣기」).
  - The width is read again whenever the room for the bubble or what stands in it changes.
- **One photo to a run, beside its last bubble.** The photo stands on the run's outer side, its foot level with
  the foot of the run's last bubble.
  - While the run goes on below the visible part of the conversation, the photo holds to the foot of that part,
    a small step above the input bar's top edge, and follows that edge as the bar grows or shrinks — a second
    line of words, a picture waiting to go — sliding with the scroll until it meets the last bubble, where it
    stops. It never stands behind the input bar.
  - Each run has its own photo, and it never leaves its run: scrolled past the run's head, it goes up with it.
  - Whose photo stands is what 「Profile photos」 says, the owner's own included: the run only decides where it
    stands.
- **The conversation's measures** are one set, declared once on the stylesheet's root, and every part of the
  room — a message, the running turn, a picture, the bubble rising out of the input bar — names them rather than
  a number of its own. They follow Telegram's layout rounded to the console's 4px grid, and the console's own
  tiers for every corner (「Corners」).

  | Measure | Value | Telegram |
  | --- | --- | --- |
  | Bubble corner | 8px, the large tier; 4px where two bubbles of a run meet; the tail's corner square | 15–16px, 5px |
  | A run's join time | 10 minutes between one message and the next | |
  | Bubble inner room | 8px top and foot, 12px sides | 8px and 11px |
  | Step between messages | 4px between two messages of one run, whoever sent it — a person, the chat agent or a companion — so the run reads as one; 8px between runs: a quarter of the 8px is each row's own room round its box and a quarter each run's round its rows. Only a day mark, a passed-over line, a passing word and the running work keep room of their own round them | 2px within a run, 6–8px between runs |
  | Day mark | centred, 32px from the bubble above it and 32px from the one below, the same on both sides wherever it stands | |
  | Photo | 32px, a circle | 33px |
  | Photo to bubble | 8px | 7px |
  | Tail | an arc on the photo's centre, 24px round, from the photo's centre height to the foot; 16px tall, 8px across, reaching 1px into the bubble | 11 × 20px |
  | Choosing column | 24px: the mark's 20px square hung 4px outside the reading column, and the photo's 8px gap from it | |
  | Bubble's widest | under 640px the row less its own photo column and the choosing column; from 640px the row less both photo columns, and at most three quarters of the row less one | 430px |
  | Name to what follows it | 4px | 4px |
  | Name colour | one of eight theme colours — red, orange, amber, emerald, teal, sky, violet, pink — at the 700 step in the light theme and the 400 step in the dark, chosen by the sender's number, so a person, an agent included, wears one colour in every room | a colour per person |
  | Meta line | 14px letters on a 20px line, muted, tabular figures, 4px between its parts | 13px |
  | The owner's ground | one token, `--chat-mine`, its tail the same token: the account's palette's own ground for the screen mode (「Palettes」) — under 청록 a dark teal, `#17504f`, in the dark mode and a light teal, `#d8f3f3`, in the light | green |
  | Everyone else's ground | one token, `--chat-theirs`: the palette's other ground for the screen mode (「Palettes」) — under 청록 the zinc grey of the page's raised surface — so the surfaces inside the bubble can step from it | |
  | Surfaces inside a bubble | every surface drawn inside a bubble — a raised panel such as a spread instruction's line, a press, a badge's ground and edge, inline code, a table's head, a hairline — is a step of that bubble's own ground, the owner's teal and everyone else's grey alike: its hue and chroma are the ground's, and its lightness the ground's moved a set share towards black in the light theme and white in the dark, the dark theme's shares larger as the page's own surfaces stand further apart there. The sunk well a code block stands in, and the page's own ground, take the ground's hue at the lightness the page gives them, with no more chroma than a screen shows there, so a colour fixed against the page — a code block's syntax colours — reads inside a bubble as it does outside one. So a surface stays of its bubble's colour whatever colour the ground takes, and the inks above read on the raised panel and the sunk well at the same 4.5:1, a mark at 3:1 | |
  | Inks inside a bubble | every secondary colour drawn inside a bubble is derived from that bubble's own ground, the owner's teal and the raised ground of everyone else's alike: its lightness is the ground's, moved a set share of the way to black in the light theme and to white in the dark, and its hue and chroma are its own — the text's for the muted and dimmed letters, the theme colour's for the accent and the success, error, warning, info and secondary colours. So the muted and dimmed letters, a link, a quote's strip, a chip's letters and icon, a verdict's mark and the send mark read at 4.5:1 or better, on the bubble and on the wash an open chip or a soft badge lays over it, in both themes, and keep it when a ground changes colour. The verdict mark's passing and failing colours are a mark's, read at 3:1, so they take a mark ink of their own, moved a smaller share than the letters' inks so their colour stays vivid: the passing green keeps its own chroma, as much of it as the screen shows, in both themes, and only the failing red is held to a chroma the screen still shows at the dark theme's light mark, where a strong red does not fit. They read at 3:1 or better on the same grounds and washes, and keep it when a ground changes colour | |
  | Meta line over a picture | 4px in from the picture's corner, 4px corners, 8px sides | 6px sides |
  | Top bar | 48px, the height every page's top bar has, a 20px picture | |
  | Picture, name and menu | 12px from the picture to the name and from the name to the menu's dots, the gap read between what the eye sees, so the menu button's own room reaches under the name's end; the menu stays beside the name, all three on one centre line | |
  | Input bar | 8px above and below the input box; the box 4px round its controls, 32px buttons with 4px corners | |
  | Photo and way down above the input bar | 8px | |
- **The top bar and the input bar lie over the conversation.** Each runs the panel's full width with no
  rounding — the top bar at every other page's top bar's height, padding, title and mark size, its edge under
  it; the input bar along the panel's foot with its edge over it — on a translucent ground that blurs what
  passes behind it, and the conversation runs to the panel's top and foot underneath them. Only the room's
  bars are translucent: every other page's top bar stays opaque.
  - What the conversation holds to its top — a date mark, a new part's first line — is held under the top bar,
    and its end stands above the input bar: the conversation keeps the measured height of each bar as room at
    its top and foot, so nothing — the last message, the line of running work — is left behind either bar when
    the reader stands at the top or the end.
  - The input box in the bar is one box: the words have no ground or corners of their own, the attach button
    stands before them and the send button after them, both on the words' last line — level with a single
    line, at the foot of several — and each 4px inside the box's edge on every side.
  - The words in the room's input box run the box's whole width between the attach button and the send button,
    and break as the words in every input box do, keeping each line written while the writing goes on (「A
    line written in an input box keeps its breaks while the writing goes on」). Once sent they stand at a
    bubble's breaks, between words and at the bubble's narrower width, and the flight shows them at those
    breaks from its first frame (「What arrives comes in at the end, and nothing standing moves」).
  - Choosing opens no bar of its own: the top bar grows downward and the choosing row unfolds inside it, on the
    same ground, under the same edge, and folds back the same way when choosing ends (「선택」). The grown bar lies over
    the conversation, which keeps only the resting bar's height as its room at the top, so no message moves by a pixel
    as the bar grows or shrinks; only a day mark held at the top steps down with the bar's foot, and a message
    scrolled to while choosing stops under the grown bar rather than behind it.
  - The growing touches nothing the conversation is laid out by, so it runs on the compositor and every frame of it
    is drawn on time. The row is laid out at its full height under the bar from the start and kept clipped; the
    bar's ground, its edge and its fade slide down over it as one piece, by the row's own height, and the row's
    contents slide down out of the bar's foot with them; folding is the same slide back. So the folded bar stands
    right from the first frame drawn, before anything is measured. The conversation's room at the top never
    changes, and the scroll padding changes once as choosing starts or ends; the day marks alone move with the bar,
    stepping down at its pace.
  - Opening and closing choosing makes and removes nothing in any message: each message's mark stands drawn all
    along, hidden past its cell's edge while nothing is chosen, and only slides.
  - Words passing under the top bar do not end at a hard line at its foot: the bar's ground fades out a short way
    under its edge, so a line half under it reads as going under rather than cut.
  - The bars' edges run on to the panel's own border, meeting the line beside the panel with no gap, and
    the scrollbar runs between the bars rather than under them: its track starts under the top bar's edge and
    ends over the input bar's, on the panel's edge, so neither bar covers it. The input bar and the choosing
    row in the top bar keep the scrollbar's room as padding at their trailing edge, so their column is the conversation's.
    Where the scrollbar is one the console cannot shorten — Firefox's, and a touch screen's own, which lies
    over the conversation and takes no room — it runs the panel's full height and the bars lie over its two
    ends.
- **The way down.** A button stands a small step above the input bar's top edge, its trailing edge on the send
  button's trailing edge, and moves with that edge as the bar grows.
  - It stands only while the reader stands away from the end — scrolled back, held at a long answer's first
    line, or reading a stretch that stops short of the end — and never while the screen's own glide is carrying
    the reader down to what arrived.
  - It goes while the reader scrolls up, and slides up from under the bar's edge once they scroll down from a
    place short of the end; reaching the end, it slides back down and goes.
  - Messages arriving at the end while the reader stands away are counted on it, and the count goes with it.
  - A reader who asked for less movement sees it stand and go at once.
- **What arrives comes in at the end, and nothing standing moves.**
  - A message someone else sends, an agent's answer among them, rises a short way into its place, up the axis
    the conversation glides along. It never fades: an item of a list does not, and a fade never runs beside the
    glide (「Motion」).
  - The row of a turn that starts running rises in the same way, whichever designated agent runs it, since it is a
    row arriving at the end like any other (「지금 하는 일」).
  - A message the owner sends rises out of the input bar as its own bubble: from the first frame the bubble —
    its ground, corners and tail, its words, pictures and meta line — stands at its own size and line breaks,
    its first part where that part stood in the input box — the first line of the words, or the file's
    preview — and only moves to its place. Nothing changes size and nothing is scaled, so no line breaks anew
    on the way, no letter or picture stretches and no corner rounds late; a picture keeps the room its shape
    asks for from the start. The rise follows the bubble's place frame by frame, so a list gliding under it is
    followed.
    - The words take the bubble's width and line breaks in the frame the flight leaves the box, and keep them
      to the landing. Where the box broke them otherwise, as a long message in a wide room, they break anew in
      that one frame and never again on the way; nothing is done to hide that frame.
    - The box empties in the very frame the flight leaves it, its first frame standing where the box's own
      words stood, so there is never a frame of both, of neither, or of the bubble standing in its place.
    - The bubble rises from under the input bar's translucent ground and comes out over its top edge, since
      the bar lies over the conversation and the flight travels in the conversation (below).
    - Pressing send leaves the focus in the box, so a phone's keyboard stays up and the window keeps its height
      under the flight; nothing moves but the flight and the list's one glide making room for it.
    - The meta line flies where it stands on arrival, at the end of the words' last line or on a line of its own
      (「메타 줄」), as one block with the ground and the words: the bubble's layout, the meta line's place included,
      is settled in the very update that first lays the bubble out, before the flight copies it. A send mark
      changing while the bubble flies changes on the landed bubble, in place.
    - The archived message taking the place of the one on its way while it still flies takes over as the place
      the flight goes to, so the flight runs to its end and lands on that row.
    - The flight moves on `transform` alone, so nothing is laid out again for it from its first frame to its
      last, and its clock starts at its first drawn frame, so the work of sending never eats its start.
    - A message on its way changing state draws its own row again and no other, and a read of the archive draws
      again only the rows whose message it found changed: every other row keeps the drawing it has, so sending
      and the reads that follow it put no work on the page that would hold the flight's frames.
  - Only the new row moves. A row taking another's place — the archived message taking the place of the one that
    was on its way — comes in still, but for an answer taking the place of the turn that ran for it, which
    settles into it (「지금 하는 일」); every row already standing keeps its place and its look through the arrival.
    - A picture the owner sent never goes blank at that change. Until the archived message's own copy of it has
      loaded and been decoded, the archived row draws the preview the row on its way was drawing, at the shape
      that preview measured, whether the change comes during the rise or after it; the preview is let go once
      the copy stands in its place.
  - A rise and a settle fly in the conversation's own layer, over the rows and under whatever is laid over the
    conversation, as the rows themselves are: the top bar, the input bar and the questions in it, the way down,
    a day mark held at the top, a notice, and every tooltip, menu, popover, dialog, sheet, drawer and the
    phone's sidebar open while a message arrives stand over the flight, and it never shows through any of them.
    - The conversation marks the layer the flight is drawn in; a flight with no such layer around its bubble
      is drawn in the page's body.
    - The layer holds, as its last child, a place of no box of its own that every flight is put in, so a flight
      coming and going changes no row's standing among its siblings, the list's own first, last and only child
      included, and no row's style is worked out again for it.
  - A reader who asked for less movement sees each arrival at once, with no motion.
  - Rows read in by paging, by opening the room or by going to a message come in still: only an arrival at the
    end of a room being read moves.
- **Going to a message far back reads only around it.** A day from the calendar, a pressed quote and an address
  naming a message all go the same way: a message the screen already holds is scrolled to, and any other is read
  with the fifty messages before it and the fifty after it, which replace what the screen held — three reads, however
  far back it is. The screen then stands away from the room's end: scrolling up reads older pages as ever, scrolling
  down reads the next hundred at a time until nothing is left past them, and only then does the screen stand at the
  end again. While it stands away, a new message in the room is not attached under what is shown — that would leave
  a gap between — and neither is the running turn's line; an edit to a message it shows still arrives. The
  arrow that takes the reader down, and sending a message, read the room's end afresh and go there.
- **A read of the room's end never lands on a feed that was replaced while it was on its way.** News
  of a message, the stream coming back and the clock each read the end of the room and join it to
  what is held where its rows stand (「A page joins the room's line where its rows stand」 below). Where a go to a message, a day or the way down replaced the feed after such a read
  was asked, its answer is dropped: added under the stretch now shown, it would stand the room's end
  under that stretch with everything between them missing.
- **A room with unread messages opens at the first of them** where it would stand out of view at the
  room's end: that message stands in the middle of the view, so what is below it is read by scrolling
  down to it. A room read to its end, one whose first unread message is already in view at its end,
  and one whose count the screen does not know yet open at the end. Nothing is marked read until the
  room has taken its opening place (「Sidebar」, 「Unread messages」).
- **Where a room opens is settled before it is drawn** (「Motion」). A room its address opens at a
  message reads the stretch around that message as its first read, the way a message far back is
  read, and never the end first. Any other room asks for its end at once, beside the room list that
  carries the reader's read mark, and neither read waits for the other to begin; once both have
  answered, the room opens at its first unread message within the end's page where that page holds
  it, reads the stretch around it where the page does not — the end's answer is then let go without
  being drawn — and opens at its end where nothing is unread. While the skeleton stands nothing of
  either answer is drawn. The rows are laid out and scrolled to the opening place while the
  conversation is unseen, and only then shown, so the room's skeleton gives way to the conversation
  already standing where it opens, and nothing is seen scrolling. A message the stretch cannot be
  read around opens the room at its end.
  - **The first frame shown is the whole conversation.** The rows, the day marks heading them and
    the words an answer wrote in markdown are shown in one frame: the day marks are drawn from the
    same rows in the same update, never before them and never after them, and the markdown renderer
    is in the browser before the rows are first laid out, so no answer is laid out as its plain text
    first and again under the reader once the conversation stands.
- **The room is one screen for as long as its room stays the same.** Only the room in the address
  makes it another screen. The rest of the address belongs to what stands around the room: an item
  opened or closed on the TODO panel (`?todo=`), whether from the panel, the deploy mark, a job's
  line or a notification, leaves the room standing as it was. Its rows, its scroll, its input box
  and what is typed there stay, and it is neither read again nor opened anew at its first unread
  message.
- **A message the address names is gone to once, then let go of.** A room opened at such a message
  (`?at=`) opens there; one already standing when its address comes to name a message — the playing
  bar pressed while its own room is open — goes to it as a pressed quote does, without being opened
  anew. Either way the room then takes the message off its address, so a reload, a tab the browser
  restores or a step back to the room opens it as any room opens — at its first unread message or
  its end — and never again at a message long since read past.
- **What stands is what a person actually sent.** Of the lines in the archive, one is not written by a
  person. The Telegram app, on opening a 1:1 chat with a bot, sends the start command `/start` on that
  person's behalf — an act that opened the chat, not words anyone made. It does not stand on screen, and the
  date mark that stood for it alone disappears with it. A date mark comes from the words standing that day, or
  from a turn running in it (「지금 하는 일」), so with neither there is no mark.
- The filtering criterion is only what is true on **both** counts: a 1:1 chat with a positive room number,
  and a body that is `/start` alone or the `/start <payload>` form a deep link appended a value to. Starting
  with a slash filters nothing on its own — a person types `/clear`, writes a path like `/etc/hosts`, and
  sends `/명령@봇이름` to another bot in a group. All those are that person's words and stand as is. The
  archive has no mark recording this distinction, so the criterion is read from those two.
- What is hidden is only the screen. The archive row stays, and the context the chat agent reads its own room in does
  not change. The filtering is at the one place that fetches a room's lines, so every screen reading those
  lines sees the same criterion — the room screen or another place standing a conversation later, nothing to
  touch separately.
- **Standing at the bottom keeps up with whatever grows, and a new message is read from its first line.** What
  stands on this screen usually comes after the conversation is all placed — photos are all fetched, messages
  settle, a running turn piles its stages, a line saying a job or search is running for this room appears, and
  a job's question card stands at the foot. Each time, the conversation's end moves below the reader. It does
  not count what grew one by one but **watches the conversation's height and the reading window's height
  themselves**. A counted list would have to be grown by hand each time something new stands at the screen's
  foot, and not growing it says nothing — one missed becomes a person entering the room being pushed off the end
  by that height. The height answers the whole of that list at once, and even what will later stand there.
  While scrolled up to read, nothing pulls the person down. What is held is not the scroll position but 「was
  it standing at the end」, and only the reader's own move up lets go of it: the window pulled up because what
  stood below the end went away — the placeholder for later messages, say — is still standing at the end.
- **A conversation is not a log.** A log is read for its latest line, so it pins its end (the live log, run
  records). A conversation is read from where the new part begins, so a reader following the end is carried
  down only as far as keeps the first line of what is new in view: the row the new part begins with is never
  carried past the top of the window, clear of the date mark holding there. A reply longer than the screen
  stands with its first line at the top and the rest below, to be scrolled down to.
  - The row the new part begins with is the first row after the owner's own last message — that message itself
    while nothing has answered it — so a reply in several messages is read from its first; where that row has
    already been scrolled past, or nothing new comes after it, it is the first row not yet seen whole. A running
    turn's row counts as a row, and the answer that takes its place stands where it stood.
  - Sending is the reader's own move: what stood before it counts as read, a reader scrolled up is brought to
    the end at once, and the sent message is the new part, held by its first line like any other. A row
    standing before the owner's own last message never begins a new part, however it grows afterwards: a
    link card or picture of an earlier answer that loads only as sending brings it into view leaves the reader
    at the end.
  - **What stood when the reader came to the end has been read.** Opening the room at its end, the way down,
    sending, the reader's own scroll down to the end and a glide of the screen's arriving there each count
    every row standing then as read. However such a row grows afterwards — a link card, a picture, a video, a
    voice player or a file card sizing itself late, a running turn piling its stages — it never begins a new
    part: a reader following the end is kept at the very end at once, before the frame is drawn, so the view
    neither stands off the end nor glides back to it. A row that goes and comes back is a new row.
  - Only new rows are held. The reading window shrinking — a phone's virtual keyboard, a question card at the
    foot — brings the end up with it for a reader who stood at the end, at once.
  - What is new rises from the foot: the conversation glides up to it rather than jumping a screen at a time,
    and a reader who asked for less movement is moved at once. The way down, opening a room, a row already
    read growing and putting the reader back after choosing or a full screen video stay a move at once.
  - A reader held at a first line stays following: more rows arriving move nothing, the arrow down stands as
    ever, and scrolling down to the end follows the end from there.
- **Scroll anchoring: what the reader opens stays where they opened it.** A message whose height the reader
  changes themselves — a chip opened or folded under it, a 「더 보기」 spread — or whose picture or link card
  arrives while it is in view of a reader away from the end, is not new content, and is read apart from
  anything arriving.
  - The message's top stays where it stood on screen, and what it gained opens downwards; what it lost closes
    up under it.
  - Where what opened passes the foot of the visible part, the conversation glides up only until the message's
    top reaches the top, under the date mark there, the same stop as a new part's first line.
  - What the message then shows counts as seen, so the next arrival is read from its own first line.
  - **A reader standing at the end lets go of it only by their own press.** Opening or folding something is the
    reader's own move, so they are never carried to the end for it, whichever message it was; what arrives
    afterwards is counted on the way down as for any reader away from the end, and the end is followed again
    only once they scroll back down to it themselves or ask for it — the way down, sending.
  - It is one rule for every such change, told apart from an arrival in one place: a press inside a message, or
    a picture arriving inside one in view of a reader away from the end, anchors that message for the change
    that follows, and only a change in that message's own height is read this way.
  - **A picture or a link card arriving while the reader follows the end is content growing,** wherever its
    message stands, and the reader keeps following the end. In a message already read — one that stood as
    the reader came to the end — it keeps them at the very end. In a message still being read from its first
    line, it carries them no further than that first line, so the message's top never passes the top.
  - A picture arriving in a message out of view grows the conversation like anything else, and a reader at the
    end stays at the end.
- The bottom is where the scroll's total height minus the current position and the visible height is within
  1 pixel. A person reading about 120 pixels up is not bound to the bottom. A late scroll event after the
  height grew does not clear the following state, and following is released only when the reader's own
  position moved up. The browser's own scroll anchoring is no such move: where rows above the view change
  height — a row laying out its meta line once it is drawn, a picture above — the browser moves the scroll so
  that what is in view stays where it stood, and a reader following the end keeps following it and is carried
  to it. Where height watching and new-message reading end, the current following state is confirmed again
  and the move made at once.
- **Following the end and scroll anchoring never act at once.** While the reader follows the end, the end
  decides where the view stands: whatever the browser's own scroll anchoring moves in a frame, the end is set
  again in that same frame, before it is drawn. Once the reader's own move up lets go of the end, following
  moves nothing, and only anchoring keeps what is in view — the browser's, and the screen's own for a message
  the reader changed. Scrolling back down to the end takes it up again, and an earlier page read in above
  puts the row being viewed back where it stood. A reserved move does not pull down a person who scrolled up while waiting on the
  render.
- **A video taken full screen leaves the reader where they were.** While a video in the conversation is full
  screen, the conversation is shorter by the video and its window is the screen's, so the scroll clamps to an
  end that is not the room's and the bottom test above reads a reader in the middle as standing at the end.
  The conversation's place for the full screen hold (「Layout fundamentals」) is therefore the one entering
  and leaving choosing keeps: a reader at the room's end is put back at the end, whatever arrived meanwhile, and any other reader
  gets the first message in view back at the height it stood and is released from following.
- **A new message takes and attaches only that one line.** The bot's notice says by number which message
  settled. Re-fetching the whole room end while a fast room is open is fetching a hundred lines dozens of
  times a minute for one line, making the cost of a notice arriving more than the old clock of the
  notice-less days. So per notice the screen asks one of two. **When a number it already holds comes,** it is
  not settled but edited — editing a message keeps the number — so it re-reads that one line **pointing** at
  that number. **When a number seen for the first time comes,** it asks for what is **after** the last line it
  holds, by the page — usually that one line. Even when notices overlap, lines are placed by number so it is
  one line, and even if a whole notice is missed the next notice brings the ones in between too. Reading
  scrolled back, the line attaches to the end and the place being looked at stays. There is one place it
  cannot attach: if what was missed is more than a page, what returns is the front of the missed span, not
  the room's end, and then it reads the room's end the way the stream coming back does (below).
- **A cursor is a place, not a number.** A room mixes two sets of numbers — the positive Telegram counted up
  from 1, and the negative the archive counted down below 0 for words not through Telegram. The two cannot be
  compared, so a larger number does not mean later. So 「after this line」 and 「before this line」 are always
  read as the **place** that line stands in among the room's lines, and what the cursor hands over is only the
  number of a line the screen actually holds. It does not invent a number not in the archive as a cursor —
  comparing a placeless number as a figure would return that room's oldest line, standing a months-old line
  and its date mark in the middle of today's conversation. Calling one line by name is done by pointing, not
  by cursor.
- **A page joins the room's line where its rows stand, never where it arrived.**
  - A row the screen already holds is replaced where it stands. Every other row of the page goes beside the
    held row it stands next to in the page: one before the page's first held row stands before that row, one
    after a held row right after it. The room's end read over a stretch the screen opened at an unread
    message begins before that stretch does, and its earlier rows stand above the stretch, never under the
    newest row with the day's date mark repeated.
  - A page sharing no row with what is held is placed by what was asked for: an older page before every row
    held, a newer one after.
  - The room's end read while the screen stands at the end — the stream coming back, the clock, a run
    settling, a send — that shares no row with what is held means messages were missed between the two. The
    screen then reads past its newest row, up to the most one read may carry, and the end joins on after it;
    where even that does not reach the end, the room's end replaces what was held, as opening the room at its
    end does. No stretch of the room is ever missing between two rows shown.
- **답까지 걸린 시간** — an agent's answer, the chat agent's or a companion's, carries at the trailing end of its meta line,
  before the verdict mark and the time, how long that room waited. What is measured is from when the earliest not-yet-answered message this answer replied to
  arrived in the room to when that answer went out, both ends on one clock — Telegram's where Telegram carried
  the answer, this machine's otherwise — so it equals the difference of the two times on screen. An answer once rejected and rewritten measures to when the room read those words,
  so the rewrite time is in it. A message with nothing measured — what a room said, and an old answer whose
  measured value is not kept — attaches nothing. Not a dash, not 0 seconds, nothing.
- **사진** — a message with a photo shows the photo in place. Pressing opens it in the picture viewer. The
  archive's mark for it — `[사진]` at the head of the message — is not shown above the picture, since the picture
  says the same; a caption after the mark stays, and a message whose picture is not kept keeps its mark. A photo goes
  out only through the message it is attached to, read from the receiver's picture of that message, which serves
  nothing outside the room's folder of its picture store.
- **사진이 있는 말풍선** — a picture runs to the bubble's edges, with no inner room or corners of its own: the
  bubble's own corners cut it. The run's name and a quote stand over it inside the bubble's inner room, and the
  caption under it, with the bubble's inner room on its top, sides and foot. A picture with nothing under it
  carries its meta line over its own foot at the trailing end, on a dark translucent ground in light letters, so
  it reads on any picture.
- **말 없는 메시지** — a sticker sent alone stands as Telegram stands it: the sticker beside the run's photo, with no
  bubble, no name line and no tail, and without the archive's mark for it (`[스티커 …]`), which stays in the archive
  and in what an agent reads.
  - The sticker stands in a fixed 160px square box, drawn contained in it, so its row is its full height before
    the file has loaded and nothing under it moves when it lands.
  - Its meta line stands outside the box, beside its trailing edge at its foot, as the image overlay chip; where
    the line carries more than the time and its marks, or spreads anything, it stands under the sticker instead.
  - The same holds for a sticker from any sender and any provider that keeps the sticker's file, a moving one
    included; a sticker whose file is not kept keeps its mark in a bubble.
  - Every other message keeps its bubble, and one that carried nothing at all keeps the bubble with its
    empty-message mark.
- **앨범** — the pictures of one send stand as one row: the row of the first picture, carrying the send's caption
  under the pictures, which stand as one mosaic running to the bubble's edges with a hairline of the bubble's
  ground between cells and no corners of their own, each opening in the viewer on itself.
  - The mosaic fills the bubble's width with no empty bars: each picture is cut to its cell. Two stand side by
    side; three or four whose first is not wide stand as that one large on the leading side with the rest stacked
    beside it at one height; otherwise the first stands over the rest, and five or more stand in rows of three,
    rows of two taking what three would leave alone. Each row stands at the height its pictures fill the width at
    by their own shapes, a picture whose shape is not known yet counted as a square.
  - The time stands at the end of the caption's line, or over the last picture's foot where there is no caption.
  - A label a picture carries is drawn into the picture itself; the archive keeps no label of its own per picture.
  - They are gathered by the album the sender named them into — the archive keeps, on each picture of a send of
    several, the number of its first picture — never by how close together they arrived, so two pictures sent one
    at a time stay two rows.
- **사진 보기** — the viewer covers the screen with the picture centred at the size that fits, never larger than the
  picture itself. The wheel zooms in and out around the pointer, a drag moves a zoomed picture, two fingers pinch to
  zoom and move it, and a double click or double tap zooms in at that point or back out to fitting; `+`, `-` and `0`
  do the same from the keys. A zoomed picture is never moved so far that an edge comes away from the screen's edge,
  and a picture smaller than the screen along an axis stays centred on it. The foot carries zoom out, how far it is
  zoomed, zoom in and fit. It zooms from fitting up to eight times. Esc, the close button and the back gesture close it.
- **방 사진 넘기기** — a picture opened from a room's feed opens in the room's own viewer, which walks every picture
  the room holds, an album's pictures one by one among them, in the room's order.
  - The arrow keys, the arrows at the viewer's sides on a screen wider than a phone, and a sideways stroke on a
    fitted picture go to the picture before or after. A stroke goes on once it carries the picture past a share of
    the screen's width and more sideways than upright; a shorter one springs back, and one towards an end with no
    picture follows the finger only partly. A zoomed picture's stroke moves the picture instead.
  - The viewer reads the room's pictures outward from the one it opened on, a page either side, and reads the next
    page once it stands within a few pictures of either end of what it holds, so walking on never stops at the end
    of the feed's pages. The pictures either side of the one shown are fetched ahead.
  - The head names who sent the picture, when, and where it stands among all of the room's pictures, `n/total`.
  - A picture with no archived message behind it — one still on its way — and a picture shown outside a room open
    alone.
- **메시지에서 보기** — the viewer's head carries it as an icon button. It closes the viewer and brings the message the
  picture went out in into view, marked as a pressed quote's is; a picture of an album lands on the album's row. A
  message the feed has not read is read with the stretch of the room around it, as a quote's is.
- **속성** — beside it, the picture's properties: who sent it, when, the message's number, the kept file's name, its
  size and format, the size the browser read off the picture once it loaded, and the caption without the picture
  mark. A picture whose file is no longer kept says so in place of the file's rows. They open as a popover on a wide
  screen and a sheet from the bottom on a phone, as every properties list does.
- **프로필 사진** — pressing the face beside a message that has a picture opens that picture in the same viewer. A face
  that is only an initial or an icon is not pressable.
- **링크** — a web address in a message's words is a link that opens in a new tab, whether the message is plain words or
  markdown. A markdown link `[글](주소)` goes to the address its parentheses hold and to nothing after them. A bare
  address ends where the sentence takes over: at a space, at a Korean letter written straight after it — 「주소에」 — at a
  closing bracket the address did not open, and before the sentence's punctuation after it — a full stop, a comma. A pair of
  brackets inside the address, as a wiki page's name carries, stays in it. The link previews and every screen that draws
  markdown read addresses by this same rule.
- **링크 미리보기** — under the words, each distinct address of a message stands a card, up to three a message: the site's
  name, the page's title and what the page says of itself, and the page's picture, from the page's own sharing tags. A
  card is a link to the page and opens in a new tab. Until the page has been read, and where it could not be, the card
  stands the address's site alone. A card is asked for only once its message comes near the screen. The console's
  server reads the page and its picture itself — the address is taken from the archived message, never from the
  request — the way a search's source previews are read, with the same address checks, bounds and cache, so the
  reader's browser calls no outside server for a card.
  - An address standing inside code — a fenced block or inline code, as markdown reads them — is something to copy,
    not a page to visit, and gets no card. An address in the words around it keeps its card.
- **메타 줄** — the foot of every bubble is one line, the same for a message and for the turn still running
  (「지금 하는 일」), drawn by one component.
  - At its leading end stand the chips of what the turn did, what it spent and what it wrote down; at its
    trailing end the answer's waiting time (「답까지 걸린 시간」), the verdict mark, the time and the owner's
    send mark (「보내는 중」), the trailing end standing the bubble's inner room from its edge.
  - Every message carries its own time, whatever place it holds in its run and whoever sent it — a notice the chat agent
    voices, a job's report and the owner's own words alike — so a line that lands minutes after another of the
    same sender still says when it came. Only a running turn's row, which is no message yet, has none.
  - Everything on it is one size, one line height and one colour, on one middle line, and every figure on it
    is tabular (「The conversation's measures」).
  - The line breaks between its two ends before it breaks among the chips: where the chips and the trailing end do
    not fit on one line, the chips keep one line of their own and the trailing end takes the line under them,
    at the bubble's trailing edge. The chips wrap among themselves only where they alone are wider than the
    bubble's widest, and the trailing end then still stands under them. The owner's bubbles and every other
    sender's keep their time there by the same rule.
    - At a phone's 360px the bubble's widest leaves the line 240px: the chips alone fit there, and a
      turn with few chips stands its whole line on one, while one carrying every chip and its waiting time
      needs about 330px and so stands its trailing end under the chips.
  - A line carrying nothing but its verdict mark, its time and its send mark, and standing
    straight after the words stands at the end of the words' last line, as Telegram lays it, wherever that line
    leaves it room, and drops to a line of its own under the words only where it does not; so a short message's
    bubble is one line tall, as wide as its words and the line beside them.
    - The words keep room for it as a blank as wide as the line at the end of their last line: where the blank
      fits, the line stands over it; where it does not, the blank alone wraps to a line of its own, and the line
      stands there. The blank never takes a letter of the words with it: they stand on as many lines as they
      would with no line at their end, so words that fit one line keep it.
    - Standing straight after a sound player, the same line stands at the end of the player's own meta line,
      which keeps a blank as wide as it (「소리 듣기」), so a voice message takes no line under its player.
    - Chips at its leading end, an answer's waiting time, anything standing between the words and the line (a link card, a file line), words
      ending in anything but a paragraph or a heading (a list, a code block, a table, a quote) and a chip's
      spread standing open each put the line on a line of its own under the words, its trailing end at the
      bubble's trailing edge.
    - Only over a picture with nothing under it does it stand on the picture's foot instead, as the image
      overlay chip.
- **The image overlay chip** — the meta line standing over a picture's foot, at its trailing corner, or beside a
  sticker's box, 4px from its trailing edge with its foot on the box's foot (「말 없는 메시지」).
  - Beside a sticker its ground is black at 60% rather than half, since it stands on the page's own ground and
    the light theme's needs the darker step for its letters to read at 4.5:1.
  - Its ground is black at half opacity, its corners the small tier, and it stands 4px in from the picture's
    trailing edge and foot.
  - It keeps 8px of room at both ends and 4px between its parts — the verdict mark, the time, the send
    mark — on the meta line's 20px line; no part keeps side room of its own, and it keeps no room for verdicts
    still to come, growing away from the time as they arrive.
  - Its letters are white at three quarters at rest; a part that is pressed answers a pointer by its letters
    alone, full white under the pointer and pressed, and draws no box of its own, so nothing lightens over the
    picture and the mark and the picture stay read.
  - A tooltip of one of its parts comes up above it, clear of it, and nothing in it is picked up or dragged by a
    held finger.
- **칩 줄** — how full the session stood, a verdict, what the turn did, what it spent, what it wrote down, how its
  answer was drafted and the voice briefing that speaks it stand as chips on the meta line, inside the bubble, and what a chip spreads stands inside the bubble under that
  line, at the bubble's own width, parted from it by the bubble's own step and never boxed a second time.
  A person's message and an agent's answer carry different chips, each only what is its own: a person's message
  carries its 판정 alone, what became of it; an agent's answer carries what its round did and sent — 컨텍스트, 브레인,
  사용 토큰, 툴 사용, 기록함, 드래프트 and 보이스브리핑 — and no 판정 of its own.
  Nothing spread is wider than the bubble, so the bubble's edge never cuts it: a long word, address or name
  wraps at that width, and a fenced code block or a table scrolls sideways inside its own box. A
  message carries no button of its own anywhere else; what is done to one message is in its menu. The room's top
  bar holds no verdict setting.
  - **Every chip is a mark with a figure or nothing** — no chip carries a word. What it is, is its tooltip and
    the name a screen reader hears, with 축소 or 확장 after it: 컨텍스트, 브레인, 사용 토큰, 툴 사용, 기록함, 드래프트, 판정, 보이스브리핑.
    컨텍스트 spreads nothing, so it is heard by its name and figure alone, with neither word after it.
  - **One look for every chip** — they wear one look, one height and one padding, and every chip that spreads answers a
    pointer alike: a chip standing open carries a background of its own, and each state walks its own three
    colours — resting, under the pointer, pressed — so no press and no hover ever lands on the colour the chip
    already wears. 컨텍스트 is pressed for nothing, so it rests in the closed chip's colours and takes no
    hover or press colour; a tap or a resting pointer brings up its tooltip.
  - **The order the chips stand in** — on an answer, 컨텍스트, 브레인, 사용 토큰, 툴 사용, 기록함, 드래프트, 보이스브리핑; on a
    person's message, 판정 alone, just before the time. 컨텍스트 stands first, where the owner
    placed it. After it, the order is what the turn's own clock decides rather than a taste: the documents
    handed to the turn and what it spends stand from its first second, a call joins them the moment it is
    made, what the turn wrote down and how the answer was drafted arrive with the answer, and the full reading is asked for
    only once the answer is there to read. A chip that arrives late stands after those already there, so
    nothing standing is pushed sideways when it lands, and the reader's pointer is still over the chip it was
    over. 컨텍스트 alone is read once the turn has ended, so the running block carries none and the answer's
    chips stand that one chip's width further along than the running block's did.
  - **컨텍스트** — how full the session's context window stood once the turn that sent the answer ended, as one
    whole percentage, 「42%」: what that turn's last request carried against the window of the model it ran
    on, as the session itself reported it. It stands on the message that carries the round's spend, read
    off the last run of the round that reported it (「Which road answered is recorded」 in
    the agency's `docs/own-llm.md`). A message whose round reported no such figure — one sent before it was kept, a run
    on a road that reports none, a turn that failed — carries no 컨텍스트 chip.
  - Each chip folds and spreads what is under it on its own, apart from the others.
  - **A chip never brings up the keyboard.** A finger's press on a message is the row's own, held from the
    browser so a hold chooses rather than selects, and with it goes the focus the press would have moved; a
    tap on a chip, or on any control a message carries, therefore takes the focus off wherever it stood
    outside that message, so the input box left focused by a send gives it up and a phone does not raise its
    keyboard again on the tap. Only a tap on the input box itself brings the keyboard.
- **판정** — a person's message carries what became of it, and nothing else of the round that read it. The
  verdict chip is the verdict mark alone, with no dot and no count, standing just before the time; its tooltip
  names it and what it says. An agent's answer carries no verdict chip: what drafted and sent it stands in its
  드래프트.
  - **Pressing the mark spreads one line, the message's outcome, in words**: 답함 with the answer it drew,
    답하지 않음, 기다림, 함께 읽음 with the message it was read with, 실패, or 판정 중 while it is being judged; a
    message whose gates spoke and whose round has decided nothing yet reads 결정 전. The answer, and the message it
    was read with, stand on the line by their time as a link that jumps to that message and lands on it, the way
    a reply's quote does (「답장 인용」); one the page does not carry stands as the word alone. Pressing the mark
    again folds the line.
  - **The line carries a 자세히 press only where there is more than the outcome**: the cards of the gates that
    read the message, and the instructions its turn carried. Pressing it spreads them under the line and pressing
    again folds them. It is the cards' only fold: no card opens or closes on its own, so a verdict arriving while
    they are open stands open with the rest, and one arriving while they are closed stays folded. The browser
    does not remember which message was left open.
  - **The outcome is read off the latest round that read the message**: the verdict of the round's own turn — the
    chat agent's or a companion's `REPLY`, `SKIP`, `WAIT`, `FAILED` — a round that went silent (`skipped`), and a
    verdict naming the message the turn read last (`read-with`), whose link goes to the message of the same round
    that carries the turn's own verdict.
  - **Which verdicts are a person's message's and which an answer's.** The verdicts of the round's draft process
    (`draft`), of its send (`send`), and of the checks and rewrites the answer went through on its way out — 출력
    형식, the content gate and its rewrite and addition, and every second asking (`…-again`) — are the answer's, and
    stand in the 드래프트 of the round's answer on the page, its last message. Every other verdict is the
    message's that the round read. The gate files a round's verdicts under the message the round read last and
    its send under the answer, and a round the agent opened itself — a follow-up, a line after a restart — files
    them all under its answer: a verdict filed under an agent's message that is not the answer's stands under the
    person's message carrying the same round's verdicts on the page, and under nothing where the page has none.
    An answer's verdict whose round's answer the page does not carry stands under nothing.
  - **While the message is being judged the mark beats** — a heartbeat, two quick swells of its size and
    brightness and a rest, over and over, in the chip's own grey; its tooltip says 판정 중. A message is being
    judged while a gate is judging it, while it waits for the chat agent's turn, and while the chat agent's turn that read it last is
    still going, from the turn's start until the room has read its answer.
    - **The wait counts from the moment the receiver puts the message into the room's queue for the chat agent**, through
      the queue's quiet delay and whatever the round waits on before it opens, until a turn of theirs takes it, so
      the mark beats from the send itself. The bot's picture holds that message as queued, the newest of the
      room's only, since the round reads the newest last and the earlier ones only along with it
      (docs/live-state.md, 「A message waiting for its turn」).
    - The turn names the message it reads last from its start, in its start event and in the bot's picture,
      and moves on to a message pushed into it, so a screen that came in after the turn began knows it as well
      (docs/live-state.md, 「What a running turn says of itself」), and the mark beats on through the gaps
      between its gates before any verdict has arrived.
    - A companion's turn writes its verdict on its own answer, so the message it read is not being judged.
    - A reader who asked for less movement sees the mark stand still, dimmed to half its colour, for as long as
      it would beat.
    - **A verdict that ends a stage's work is final.** A message holding a verdict written since its judging
      began that opens with an ending word — `SKIP`, `CLEAN`, `DEFUSE`, `REPLY`, `SENT`, `PASS`, `FAIL` or
      `FAILED` — is judged no longer, whatever the queue or the turns in the receiver's picture still say of it:
      a round the gate ended at a skip takes no turn, and a picture still holding the message queued or its turn
      going would otherwise beat the mark until something else moved it. The beat stands again only for judging
      that begins after that verdict.
    - The live runs of the gates are served by no unit (`docs/boundary.md`, 「Gaps the console meets」), so a
      picture naming none leaves the beat to the queue and the turns.
  - **Once judging is over the mark takes the colour of the whole**: the bubble's green mark ink where at least
    one verdict passed, answered, went out or came out clean — `PASS`, `REPLY`, `SENT`, `CLEAN` — and none failed
    (판정 통과), its red mark ink where any failed — `FAIL`, `FAILED` — (판정 실패), and the chip's own grey where
    none of them did either — a skip, a defuse, a pick, a `none`, 함께 읽음 (판정). The two
    marks are the inks 「The conversation's measures」 gives a mark inside a bubble: the green vivid at its full
    strength, each reading at 3:1 or better on the bubble and on the open chip's wash, the owner's and everyone
    else's alike. The change of colour takes the quick length.
  - A mark that comes while the message is on screen with verdicts already settled — no judging seen before
    them — pops in, a short scale and fade on the pop length. A message read in with its mark already there
    stands it at once, and a reader who asked for less movement sees it stand at once.
  - A message sent in the last ten minutes keeps room on its meta line for the mark from the start, so the time
    and the bubble do not move when it comes.
  - A spread card stands the stage name, its time, how long that stage took, the verdict in words, and the road
    that run walked. A length of time stands in seconds to one decimal, 「11.8초」, never in milliseconds.
    - **The verdict's words**: 선택 with the names chosen, 선택 없음, 후보 없음, 이상 없음 for a sanitiser's `CLEAN`,
      무력화, 통과, 실패 with what failed, 건너뜀, 답을 읽지 못함 for `UNREADABLE`, 답 없음 for `NO-ANSWER`, a
      situation rule's 적용 and 사용 each with its names, and 함께 읽음. The names chosen stand as their slugs, the
      records' own names. A verdict of another shape reads 알 수 없는 판정, its text under 원문.
    - **What the gate wrote under the verdict**, its detail, stands folded under 원문 and is never spread with the
      card. No marker, no `key=value` and no English word of the gate's stands on a card; the raw verdict is the
      copy's (「What a copy holds」).
    - **The road** is one line each, writing the provider and model by their recorded names, then how that road
      ended — 응답함, 시간 초과, 크기 초과로 거부, 오류, 없음 — and its seconds. A gate has one road so one line
      stands, and only a run split by size stands one line per part. A result the screen does not know stands by
      the recorded words, so an old verdict's line reads by the words of that time. A non-gate stage and a verdict
      from before road records existed have no road.
  - **A picker's card stands what its model was asked.** A verdict of a picker or the matcher — 시스템 문서, 방
    규칙, 라이브러리 지식, 사람 찾기, 방 기억, 상황 규칙 — carries the lines the model read of its candidates
    (the gate's `docs/api.md`, 「Judgements」), and its card stands them under the verdict in the order the model
    read them: each line character for character, monospaced and wrapping where the bubble ends, and its answer
    beside it — 예 or 아니요, a rule's 적용 and 사용 each as 예 or 아니요, and 읽지 못함 where the answer was not
    read. Those lines take the place of the list of picked names the verdict's detail holds, which says less
    than they do. A verdict that carries no lines stands as before. A verdict the live stream announces carries
    its lines where the stream hands them, and the page read after it carries them all the same.
  - **What opened the turn stands with its verdicts.** Spread, a message's verdicts are headed, for each
    turn they belong to, by the quiet instructions that turn carried: one line each, its sort and its one-line
    summary, cut to the line. Pressing a line spreads the instruction's whole text under it, read the moment it
    is first asked for, with a spinner on the line's mark until it is in; pressing again folds it. Spread, the
    line stands its whole summary over as many lines as it takes, and the text never runs past the bubble: a long
    unbroken run of it — a path, a record — breaks where the bubble ends. A line of the text that is a record the
    system wrote, a JSON object or list standing alone on its line, stands as a name and value list (「Name and
    value lists」) between the text's words: a nested name after its parent's, a list's member by its place from
    one, a list of plain values as one value. Under them the text as it was handed stands folded under 원문. A
    text with no record in it stands as it was handed. Every
    gate's card of the turn — a `SKIP`, a `none`, a pick — stands under the same heading, which is said once
    per turn. A turn that carried none — somebody spoke and nothing else came — has no heading, and neither
    does a turn whose round the record does not name or whose rows were settled before rows named their
    round (the receiver's `docs/bmo-window.md`, 「Quiet instruction」). A sort stands in the words the language pack gives its key, or as the key where the pack has none, and a row that names no sort stands as 조용한 지시.
  - **A `SKIP: 후보 없음` card says what was narrowed.** Under its text stands how many candidates the
    gate's libraries held before the narrowing and how many it left, and, where the turn was the bot's own
    lines alone and the gate narrows such a turn by the item rule alone, that it took only the pieces tied
    to an item number those lines named (the gate unit's documents, 「What the code narrows before a gate
    is asked」). A gate whose record holds no offer row for the turn, the situation rules among them, stands
    its text alone.
  - **A gate's card says what each rule kept.** Under its text, a card whose round's offers record holds a row
    for its gate stands one line of how many candidates each rule kept — by item, by keyword, by word, by person
    and by recency — as "항목 3 · 키워드 2 · 단어 0 · 인물 1 · 최근 0", every rule standing whether it kept any
    or none (the gate's `docs/api.md`, 「Judgements」). A card with no such row stands no such line.
  - The turn's instructions are read from the receiver (the receiver's `docs/boundary-api.md`, 「What opened a
    turn」) when the room's verdicts are read, so the heading stands the moment the cards spread; a front that
    cannot be reached leaves the cards as they were, without it. The offers record comes with the verdicts
    themselves, each of the gate's verdicts carrying its round's.
  - **A turn's verdicts stand under the last message it read**, so every earlier message of the same turn
    carries one verdict of its own, 함께 읽음, naming that last message. A message a turn read and passed over
    in its answer then never looks like one no turn read: a message with no verdict at all is one that woke
    nobody.
  - **A verdict the gate holds under no message stands under the message its round answered with.** The gate
    puts a round's verdicts under the answering message once the answer is sent (the gate's `docs/api.md`,
    「Judgements」); a verdict the gate still holds under none, whose round names a message the page carries,
    stands under that message as it would have. One that names no round, or a round no message of the page
    answered, stands under nothing.
  - **A verdict stands only under a message it could have been about.** One recorded more than ten minutes
    before the message was sent was left by an earlier message that held the same number before the record
    lost it, and the message does not carry it. Ten minutes is wider than any run between judging an answer
    and sending it.
  - **A page carries the verdicts of the time it covers.** Each page of the room — its end, a page further
    back, the stretch around a message, a single message — reads the gate's verdicts of the room written from
    ten minutes before its first message was sent, to an hour past its last message's sending for a page short of
    the end — a turn's verdicts are written while it goes on, after the message it read — and to now for the end,
    and keeps those that stand under one of its messages; a stretch with more verdicts than
    one of the gate's pages holds is read page after page. A gate that does not answer leaves the page without
    verdicts rather than unread, since the room is the receiver's. The gate states its times in epoch
    milliseconds, and the console reads them as unix seconds, as it reads the receiver's.
  - **Verdicts arrive with the room's reads.** No unit's stream says a verdict was written, so a message's
    verdicts arrive with the read that follows a turn's ending and with every other read of the room; a
    verdict a stream does announce stands until the read carrying it arrives.
- **브레인 · 툴 사용** — an agent's answer, the chat agent's or a companion's, carries what its own round did as two
  chips, each a count. **브레인** is what the round read from the brain: the brain documents the reference put in
  front of its turns and the stretches of the room they read back, and every call it made to the brain's tools — a
  call whose tool, its server set aside, is one of the brain's (`brain_list`, `brain_similar`, `brain_recall` and
  every other `brain_` tool), or a shell command running one as `bmo use <server>/brain_…` — each a row naming what
  it read: the call's top line (「A tool call」 under 「Agent screen」). **툴 사용** is every call the round made, a brain call among them, counted once a
  call. A reference document that went as an already-loaded mark is not counted, since nothing of it was read on
  that turn; it still stands in the list, wearing the mark that says so. Pressing either spreads its own sort as
  lines, in the order the round did them and wearing the badges the agent's own log wears; pressing again folds
  the list. They say nothing the verdicts already say. Once the turn has ended, 툴 사용 draws each call as the agent's
  own log draws it (「A tool call」 under 「Agent screen」) — its top line, the command under the prompt, never
  folded, and its result under it — whatever program the turn ran on, a pane program's calls as a stream's.
  - **The lines come from the record**, read out of the agency's log of every run of the round — its own turn and
    each question its draft process asked the same session — the first time either list is opened, so what a turn
    did reads the same however long after it ended and whatever the screen was doing while it ran. A run is read by
    the name its lines are kept under, which is the run's unit name, never the round's. The room's running block and
    these lists are the same lists in the same look: the ones the turn was watched doing.
  - **They stand on the answer's last message**, the way the figure does, and only where that round left that sort
    of action at all. A turn that only spoke leaves none and stands neither.
  - **An answer whose round the record does not name has neither**, since there is no run to read.
  - **Where the round's end names what it read from the brain** (the receiver's `docs/drafting.md`, 「The round
    log」), those pieces are the brain's documents in place of the ones the agency's log says the turn was handed.
    They come with the page, read with the round's summary, and stand at the head of the list before anything is
    read.
  - **The 브레인 chip's figure is what the session holds read, and what this round read new**: the count of the
    pieces that went as a mark of a version the session already held, then a plus and, in the success colour,
    the count of what the round read new — the pieces that went whole, those the agent read itself through the
    index, and the brain calls. 「1+3」 is one held and three new; a round that read nothing new stands the plain
    count, and one that held nothing stands 「+3」. A screen reader hears 브레인, the held count, and 새로 읽음 with
    the new count. A turn still running counts the same way off what its stream has said.
  - **Spread, it is one list, read like a diff**: each new piece a line in the success colour on its own wash
    with a leading plus, as an added line, and each held one plain under them, in the muted colour with the
    plus's room kept blank. A piece stands by the index's words for it; the room's own due memories, the entry
    `memories/<room>` (the gate's `docs/reference-selection.md`, 「What a turn is given」), as 이 방의 때가 된 기억;
    anything else by its path. The brain calls follow the pieces, read from the log the first time the list
    opens, and a round that made none reads nothing. The same list stands in the 드래프트 spread, after the
    round's end.
  - **Pressing a piece opens it** in a modal of its own, centred at every width, which Back closes: its name, its
    path and whether this round read it new or the session held it. Where the round's end names the brain's
    memory the piece is, the modal reads that memory the first time it opens, with a skeleton while it comes,
    and stands its key, its type, its whole text, its layer, its subjects, when it was written, and a button to
    that memory's page on the brain's screen. Where it names none, the modal stands the piece's text as the
    gate serves it where the gate's index lists the path (the gate's `GET /reference/pieces/{slug}`), and its
    name and path alone otherwise. Only an administrator, the brain screen's one reader, opens a piece; for
    anyone else the lines stand still.
  - **What the record does not hold stands as nothing.** A round on a road whose turns hand the agency no list of
    what they were handed leaves no reference document in its log, so its 브레인 holds its brain calls alone
    (`docs/boundary.md`, 「Gaps the console meets」).
  - **Each list is its own message's and its own chip's.** An answer's two lists start folded, and pressing one
    spreads or folds that list on that message alone — the other chip's list, the other answers and the turn still
    running stand as they stood. The browser keeps none of it (「활동 표시의 접힘」).
- **보이스브리핑** — every the chat agent line carries the chip that reads it out in full, and a summary spoken for the line
  stands as no row of its own (the voice engine's `docs/boundary-api.md`, 「Briefings」). A voice message and a turn
  still running carry none. What a line's chip stands on is the voice engine's word, read with the page: the
  briefings of the room, each naming the line it speaks and whether it is the line's summary or its full reading.
  - **Nothing is made until it is pressed.** The chip says where the reading stands, by its mark and its
    tooltip: the voice mark before anything is made and once it is there (보이스브리핑), the mark of spinning
    work while it is being made (보이스브리핑 만드는 중), and the voice mark in the error colour where it could not
    be made (보이스브리핑 실패).
  - **Pressing it spreads the sound's own player**, the one of 「소리 듣기」, which waits for its play press, on
    opening as on a page loading or a tab coming back; pressing the chip again folds it and the sound stops. Played
    to its end, the player folds itself after a moment, unless the reader paused or moved it along while it played,
    or played it again in that moment. Pressed before anything is made, it asks the receiver for the reading (its
    `docs/api.md`, `POST /rooms/{roomId}/messages/{messageId}/reading`) and spreads one line saying it is being
    made, and the player takes that line's place the moment the engine's stream says the reading ended done, for as
    long as the chip stays spread, waiting for its play press. Pressed after it failed, it asks again. A refusal — the whole briefing switched off, an agent with no voice, a line the receiver does not
    hold, a voice engine it could not reach — spreads its sentence in the error colour.
  - **A line read before the engine spoke readings** keeps the voice message the room heard it as, named by the
    engine's row, and its chip plays that voice message.
  - **A jump to the voice message lands on the line**, the briefing player's press among them.
  - **The chip moves as the reading does.** The voice engine's stream says a briefing was taken in, ended, or
    named its line, and the chip of the line it speaks follows it there: making once it is taken in, there or
    failed once it ends.
- **기록함** — a chat agent answer carries what its round wrote down: every note of the room, memory, new TODO row
  and word appended to one, made by the turn or by any time the round asked the same session again. The chip
  is the count; pressing it spreads one line per record — where it landed as a badge (메모 #N, 기억 #N, 상황 규칙 #N, 새 항목 #N,
  항목 #N 덧붙임, the number where the call's own answer named it) and what it said.
  - **It is read off what the round's writing verbs kept**, never off what the answer says about them: each
    recording tool of the deployment's tool server and each writing script keeps what it wrote under the run it worked for,
    and one that refused wrote and kept nothing. A run that kept nothing — one from before the verbs kept anything
    — is read off its calls the way the promise check reads one (the receiver's `docs/answer-checks.md`, 「A promise stands on a record」), a tool call
    by the record its catalogue entry declares (the receiver's `docs/chat-mcp.md`). The records ride on the answer whole, so
    spreading them reads nothing more.
  - **It stands on the answer's last message**, and only where the round wrote something down.
- **드래프트** — a chat agent answer carries how its round made it and sent it (the receiver's `docs/drafting.md`):
  the chip is the count of the rounds the process asked — its questions, items and checks; neither its end, the
  agent's own judgement before the round, nor a row of the round's own turn, where the log holds one, is counted
  — and pressing it spreads the round as a person reads it, in this order.
  - **The rounds, one line each**, in the order written: the round's number, what it asked — the question's word
    (정보 확인, 사실 확인, 기억 정리, 약속 점검, 의도 파악, 규칙·말투 점검, 메시지 작성, 도착 확인, and 판단 for the
    agent's judgement before the round), or the question's own name where the pack has none — what it decided —
    답함, 보냄, 넘김, 실패, or the receiver's word for one the console does not know — how long its answer is,
    「110자」, and how long it took, 「11.8초」. 바뀜 follows where the answer differs from the one before it.
  - **The slow round is marked**: where more than one round ran, the round that took longest, when it took at
    least twice as long as any other, wears a clock mark and its time in the warning colour.
  - **Pressing a round's line spreads its answer** — the notes that round wrote, or the message in the last —
    whole as it was written, wrapping at the bubble's width; pressing again folds it. A round with no answer is
    pressed for nothing.
  - **Then the end, one line**: what went out — 메시지 보냄, 보내지 않음, 보류, 시간 초과 후 메시지 보냄 or 시간 초과
    후 보내지 않음 — and how long the whole took.
  - **Then what was read before it**: the 브레인 chip's own list (「브레인 · 툴 사용」), in the same look, where the
    round's end names any piece.
  - **Then the send and the answer's checks**: the answer's verdicts (「판정」), each a line of its stage's name and
    the verdict in words — 보냄 for the send, with how many parts it went as where it went as more than one — and
    its time; the answer's own words, which a round's turn verdict carries, stand on no line, since the bubble
    holds them.
  - **Nothing stands in the receiver's or the gate's own form**: no `ROUND`, `END` or `SENT`, no `answerChars=`,
    no milliseconds and no process key. The raw rows are the copy's (「What a copy holds」).
  - **The rounds are read the first time the chip is pressed,** from the receiver's round log by the message's
    round (`GET /rounds/drafts`), with a skeleton of three lines while they come and a sentence where the read
    fails; pressing again folds them and a later press reads nothing more. Where the log holds no row of the
    round, the gate's `draft` verdicts stand for the rounds, each its number, its question's word and what it
    decided. The count and whether the chip stands come with the page itself, which reads the page's rounds once
    when it is read.
  - **It stands on the answer's last message**, and only where the round's process left a row other than one of
    the round's own turn, or the gate wrote a `draft` verdict of it. A companion's answer, a round that waited and
    a turn from before the process was kept carry none.
- **사용 토큰** — an agent's answer, the chat agent's or a companion's, carries what that answer wrote: the token mark and one figure (「What one answer spent
  stands as one figure」).
  - **What is counted is the round.** A round is everything the bot ran to produce that answer: the
    turn of the room's session, every gate that read the messages on the way in (the sanitiser, the
    reference gates, the person-book search), every gate that read the answer on the way out
    (the output gate's decision and verification), and every addition or
    second asking of the session. The figure is the written tokens of every run of the round added up.
  - **A run that reported nothing adds nothing.** A road that timed out, and a gate on a registered
    engine's MCP road, carry no reading, and neither does a run that failed — a turn or a rewrite whose call threw.
    Such a run's line in the spread says it went unmeasured rather than letting its share read as
    nought. A round none of whose runs was measured reads one dash.
  - **An answer sent as several messages carries the chip once**, on its last message. A part that was
    the last when it arrived gives its chip up to the part after it.
  - **A round that sent nothing has no chip here.** A wait, a skip, and an answer the gate turned into
    silence leave no message to stand beside; that round's figure is on the chat agent's agent screen.
  - **Pressing the chip spreads the round**, one line per run: the stage, the provider and model that
    answered and how long it took, and under it that run's four kinds as one group of bars — 읽기,
    쓰기, 캐시읽기, 캐시쓰기, each named beside its figure. A round read as one figure stands one line, 이 실행, and
    where the agency's ledger gives the context its last run closed on, a line under it says why the cache read is
    what it is: 요청 N회 · 컨텍스트 ~K · 캐시 읽기 N, the requests being the cache read over that context, rounded,
    since every request carries the whole context in again.
  - **An answer from before the round was recorded has no chip.** The round is named on the answer's
    message and on each run's road record, and an answer without that name has nothing to be counted
    by.
  - A KakaoTalk answer is archived when Iris echoes it back. The send leaves its round waiting for that
    room's next echo of the chat agent's own words for two minutes, and the echo takes it; an echo that does not
    come back inside that time leaves the answer with no chip.
- **The words are the reader's** — with a mouse, the conversation's letters can be dragged to select and copied, except while
  selecting, when pressing a line is selecting. On a touch screen a held finger chooses messages rather than letters
  (「Choosing and copying」), so a message's letters are selected by holding them once that message is chosen: a hold there is
  always the browser's own select and copy, never the conversation's to read as choosing, and the console opens
  nothing over it.
- **메시지 메뉴** — right-clicking a message opens that message's menu. On a touch screen a plain tap on the message
  opens it — except on what presses on its own: a link, a link card, a photo, a face, a quote, a button.
  - **Only the message itself opens it:** its bubble, a picture or an album by its own block, a sticker standing with
    no bubble, and a notice's line. A press on the row's empty room beside the bubble, by the face or across the row's
    width opens nothing, neither this menu nor the browser's own.
  Pressing while holding ctrl (cmd), and pressing the context-menu key or Enter with the line focused, open the same
  menu. The browser's own menu does not pop at the right-click place, and a held finger never opens either menu. An open menu is moved by arrow keys, chosen by Enter and closed by Esc. The conversation
  enters one tab place — entering first is the last message — and lines are moved by up/down arrows. It holds
  five.
  - **답장** — starts a reply to that message (「답장」 below).
  - **복사** — the record written in 「What a copy holds」 below.
  - **텍스트만 복사** — only the body written in the bubble. No room name, time, sender or verdict attaches, so it
    is one word to transcribe as is. A wordless message like a photo or sticker has the mark the archive wrote as
    its body so that is copied, and a message with an entirely empty body has this item off.
  - **대화번호 복사** — one line naming which room and which message this is, and nothing of what it says:
    `방 <room name> (chatId <chat number>) · 메시지 #<message number>`. It is what the owner pastes to the chat agent to point at a
    message, and the chat agent reads that one message back with the archive scan's `--chat <chat number> --id <message
    number>`. The room's name is the one the console shows; the two numbers are what find the message.
  - **선택** — start selecting, with the message the menu was opened on chosen first.
  - The menu does not open on a message being selected or not yet in the room — a line being sent and a line that
    could not be sent.
  - **The shortcuts are this screen's only while selecting.** Esc, copy and select-all are registered on this
    screen only while selecting is on. A registered shortcut takes that key from the browser whether used or not,
    so registering always would keep a copy from happening after selecting letters.
- **Choosing and copying** — one message is copied from its menu. To take several at once, start selecting with the menu's
  **선택**, or on a touch screen hold a message for half a second: selecting starts with that message chosen, with a
  short vibration where the phone has one. A finger that goes on to move without lifting chooses every message
  between the held one and the one under it, and moving back gives the passed messages up again; what was chosen
  before the hold stays. While the finger stands near the top or bottom edge the conversation scrolls that way,
  faster the nearer the edge, and keeps choosing. A finger that moves before the half second, or under which the
  conversation starts to scroll, is a scroll, and one that lands on a conversation still gliding from a flick is
  stopping it; neither holds anything however long it then rests (「A held finger」). Holding an unchosen message while selecting adds it and starts the same
  drag from it, so a selection is built in as many holds as the reading takes, scrolled between, rather than in the
  one sweep the first hold began. A hold or a drag spends only the click its own lift sends — a drag sends none — so
  the next press is a press of its own: a message a drag passed and gave back is taken again by one tap, however soon
  after the lift it comes and wherever the finger lifted. While selecting, pressing a line toggles
  it on and off, and pressing with shift selects the span whole. As Telegram does it, entering the mode opens the choosing column
  (「The conversation's measures」) at the leading edge of every message: its checkbox's square slides in from
  past that edge, and a message on the left, its photo and its bubble together, slides aside by the column's width,
  the bubble keeping its width, its shape and its lines, since the bubble's widest always keeps that column clear on
  the far side (「One width for both sides」). The square stands on the centre of its message's first line and has no
  room of its own above it: a system line's one line, the name at a bubble's head, the first line of the message a
  bubble answers where that heads it, or else the first line of the words, so a message of one line has its square
  at its middle and a long one keeps it beside its first line. A message that opens on no line, a picture, a
  sticker or a file, has its square where a line of words would stand. The square takes its line's height from that line's own type,
  so it stays centred at any text size. The owner's messages on the right stay where they stand, the column
  already clear beside them, and a system line keeps the column clear on both sides at all times, so it stands
  centred and still. The slide is a transform of the unfold length on the move easing, and leaving runs it back;
  where the reader asked for less movement the column opens and closes at once. A line moves as one piece: its
  photo, its bubble with the time and the send state inside it, and what hangs under it take the one slide, its
  length, easing and wait declared once for them all, so they start in the same frame and stand at the same offset
  in every frame. The run's photo stands outside its rows, so it takes that same slide rather than one of its own,
  and is never seen ahead of its bubble or behind it. A chosen message's square stands
  filled and checked, and its line is painted across the conversation's whole width, from the panel's edge to the
  scrollbar, with no room added round the bubble. Messages chosen one after another are one band, its ground running
  across the room between them, which parts where a message between them is left out; the bands lie behind the
  messages, so a run joining or parting moves nothing. Above, the 전체 선택 checkbox and the count chosen stand at the left and 복사 and
  취소 at the right — the bar's contents standing in the conversation's own reading column, so the checkbox over the
  list and the squares down the messages stand on one vertical line — and the input box stays at the foot as it was,
  so words are written and sent while selecting, and the conversation still keeps the foot's height as its room at the
  end. The checkbox, the count, 복사 and 취소 stand on one centre line in a row that unfolds inside the top bar
  (「The top bar and the input bar lie over the conversation」), the bar sliding down over it.
  The bar growing down and the column opening sideways are one change of mode, so they are one movement (「Motion」):
  the bar's ground and row, a day mark held at the top, the squares and the lines sliding aside all take the one
  length, easing and wait, declared once for them all — the unfold length on the move easing, with no wait — so
  entering, they start in the same frame and the bar stands grown in the frame the squares stand in place, and
  leaving, the bar folds as the column closes and both are gone in the same frame. Where the reader asked for less
  movement both stand and go at once.
  Entering and leaving the mode reflows no words and moves no message: the held message stays under the finger, the
  first message in view stays where it stood, and a reader at the room's end stays at the end.
  Neither entering nor leaving touches the input box or where the keyboard is. Exit by Esc or
  cancel. While selecting, Ctrl+C (⌘C on Mac) copies and Ctrl+A (⌘A) selects all. Copying ends selecting on the
  spot. The three-dot menu beside the room's name also has start selecting and copy all.
- **What a copy holds** — a copy is not a visible shape but a record to be read elsewhere. The first line has the room name
  and chat number, each message stands in one line with its time, sender, sender number, message number and body,
  and below it the content of every chip the message carries, whether the chip is open on screen or not, in this
  order: its verdicts (판정) in time order as stage name, time and verdict, a verdict's content following indented
  where it differs from the verdict; 드래프트, the gate's rows of the round's draft process and then each round row
  as the chip lists it — its number, question, kind, outcome, characters and milliseconds; 툴 사용, each call by its
  tool's name with the size of its result, or that it failed; 브레인, each piece the round's end names as read — its
  group's word, its name and its path — or, where the end names none, each document the turn was handed, and then
  each call that read the brain; 사용 토큰, each road the round's runs took with its figure; and 전송 last. What a chip reads
  only when opened — the round rows, the calls — is read for the copy, and a read that fails leaves that chip's
  content out rather than holding the copy. Copying one message or several has the same shape.
  - **A message's verdicts in a copy are the ones the screen gives it** (「판정」): a person's message copies its
    판정 and an answer copies its 드래프트 and its send, each in the record's own words.
  - **A copy holds the chosen messages and their own verdicts, and nothing of any other message.** A verdict that
    is the answer the message drew — the chat agent's or a companion's `REPLY`, a send's `SENT` — stands as that
    word alone: what the answer says is the answering message's own, which a copy takes only where that message
    is chosen too.
- **입력창** — words written here go up to that room as is under the owner's name. They go out on the Telegram
  provider's owner-account road, no different from words typed directly in Telegram. They stay in the archive as
  the owner's message, and that room's chat agent takes them like any words and answers. If the reader is not connected it is
  not sent and says so. Up to 100,000 characters are sent at once. A Telegram message holds up to 4,096, so words
  longer than that are split at paragraph and line boundaries and put up in order — dropping no character
  and splitting no character in two. That room's chat agent takes the consecutive pieces merged into one turn and reads
  them as one block. A line stood at the conversation's end becomes that message when the first piece goes up, and
  the rest follow as ordinary messages.
  - **In a room the console made for companions,** the words never leave this machine: they are kept as the
    owner's message under the console's own number and the room's answerers take them (the agency's `docs/companions.md`).
    A companion's answer stands on the left with its name and picture and the chat agent's with its own, and each turn shows on
    a running line as the chat agent's does, wearing the name and picture of whoever is answering. Each speaker has a running
    line of its own, so in a room of the chat agent and a companion the two turns stand as two lines at once and each goes when its own
    turn ends; a screen opened or reloaded in the middle of either reads it off the bot's picture. Such a room takes words
    alone: nothing is offered to attach, a dropped file is not taken, and a file sent to it anyway is refused.
- **답장** — the menu's 답장 stands a bar at the head of the input box: an icon, the name of whoever said that
  message and the start of its words on one line (a wordless message stands its archive mark), and a close button.
  The bar keeps inside the box at every width: the words are cut short with an ellipsis and the close button stays
  in view at its end. A paste's or a file's entry under it keeps inside the box the same way.
  The bar stays until the message is sent or the reply is dropped — by the close button or Esc in the box — and
  choosing 답장 on another message replaces it. The keyboard goes to the box. What is sent next goes as a reply to
  that message: the words, or with files the first file, which is the one carrying the words. The rest of a long
  text split into parts goes as ordinary messages after it.
  - **In a room**, the reply is a Telegram reply made by the owner's account, so the room sees it as one and the
    receiver takes it the way it takes any reply: the archive records the message it answers, and that room's chat agent
    reads the turn with the same `[replies to message N, sent by …, which said: …]` note a reply typed in Telegram carries.
    The message to answer is named to Telegram by the number the owner's account knows it by. A supergroup numbers
    its messages once for everyone, so that is the archive's number. A basic group and the private chat number them
    per account: a line the archive took from the account's own history carries that number under its offset, and a
    line the receiver took in is found in the account's history by its time and words. A message that cannot be found
    there — gone from Telegram, or never in it — is refused with a sentence rather than sent without the reply.
  - **In the owner's private chat**, words from the console never reach Telegram (「입력창」), so the reply is recorded
    on the archived message itself and the turn carries the same note. A file sent from there goes through
    Telegram and is a Telegram reply as in a room.
  - A line on its way stands the reply it carries, and 다시 보내기 sends it as the same reply.
- **답장 인용** — a message that answers another stands a quote at the head of its bubble: a bar on the leading edge,
  the name of whoever said the answered message and the start of its words, cut to one line. It stands 8px above the
  words. It comes from the
  archive with the page, so it stands even when the answered message is far above what is loaded. Pressing it
  brings the answered message into view the way an address naming a message does, and marks it for a moment. An answered message the archive does not hold stands as 「기록에 없는 메시지」 and presses to
  nothing.
  - **What the answered message carried stands as a small preview** between the bar and the name: its picture, a
    sticker, or a video's first frame, each a 40px square; a sound or any other file stands as its mark.
  - The words beside it are the answered message's caption, the archive's mark for what it carried taken off.
    One that said nothing else says what it carried: 「사진」, 「스티커」, 「동영상」 or 「음성 메시지」 with the length
    the archive's mark gives, or a file's own name.
  - The bar at the head of the input box, while a reply is being written, says the same words.
- **What was done to a message** — the acts a room's record keeps on its messages (the receiver's
  `docs/messages.md`, 「What an agent can send back」) stand on the message itself, in every room the receiver serves
  them for, a record room among them, and follow the receiver's `message-changed` news: the room reads that one
  message again the moment the news comes, as it reads one that was edited.
  - **A deleted message** stands where it stood as one quiet line in its bubble, 삭제된 메시지, with its time; its
    words, what it carried and its chips are gone, and its menu offers nothing but its link.
  - **An edited message** carries 수정됨 on its meta line before its time, and its tooltip says when it changed.
  - **Reactions** stand in a row of their own at the foot of the bubble's words, above its meta line: each emoji
    once with how many put it there, tabular, the reactions of the reader's own senders in the accent's wash, and a
    tooltip naming who put it there — an agent by its label, a person by the name the room knows them by, else
    their number.
  - **A pinned message** wears a pin mark on its meta line, and the room's top bar carries a pinned button beside the
    room's menu while the room holds one: the pin mark and, from the sm width, the first line of the pinned message it
    stands at, cut, with that message's words whole in its tooltip and how many are pinned where there are several.
    Pressing it brings that message into view and marks it, the way a reply's quote does, and steps the button to the
    next older pinned message for the next press, the newest again after the oldest. The room's pinned messages are those of the stretch
    the room has read, since no route names a room's pinned messages apart (`docs/boundary.md`, 「Gaps the console
    meets」).
  - **The reader's own acts** — editing their own message, deleting one, pinning, reacting, a sticker from the input
    box — stand in the message's menu and the input box once the receiver serves them as the reader's own
    (`docs/boundary.md`, 「Gaps the console meets」); until then no control offers them.
- **A long paste** — pasting 2,000 or more characters at once does not spill into the input box. A mark —
  `[붙여넣기 1 · 3,210자]` — goes in at the caret, and a one-line entry above the box stands the mark's name, the
  text's head and how many characters. Sending puts each text back where its mark stands, so the pastes and the
  typed words keep the order they were written in. Deleting a mark drops its text; undo brings the mark and the
  text back. Removing an entry takes its mark out of the box. The texts are kept with the draft, so a mark left
  in a draft still has its words after a reload. A file cannot be placed this way: each file goes up as a
  Telegram message of its own, so there is no place inside the words for it. It is not uploaded as a file because that room's chat agent cannot read a file's
  content — a file uploaded to a room stands only by name in the conversation. It must go as words for the chat agent to
  read.
- **보내는 중** — a word pressed to send stands at the conversation's end on the spot without waiting, and the input
  box is emptied at once. Where it stands is told by one small mark in the line its name and time already stand
  in, beside the time: a clock while it goes, waits and is checked, a check once the bot has numbered it, and a
  red exclamation mark when it failed. Every message of the owner's own carries that mark, the check once it
  stands in the archive, so the mark's column is always there and a change of state changes only the mark and
  its tooltip — never a line under the bubble, the bubble's height or width, or where the time stands. When it
  actually goes up and that message is re-read from the archive, that line becomes an ordinary message, and it is the
  same row throughout: the message takes the line's place inside the line's own row, under the key the line stood
  under, so the row keeps where it stands, its size and its look and only its mark changes; it is never drawn again,
  never gone for a frame and never moved, however many lines are on their way behind it, whichever of their messages
  the archive carries first. A stood line and an uploaded message never
  both stand, not even while the send is still out: the bot files the owner's words before it carries them on to
  the room's other providers and answers the send only after, so the archive can carry them first. Until the send
  answers, the line is found by what it carries alone, standing under the owner's name, filed no earlier than a few
  seconds before it was pressed and bound to no other line — words by their words, a photo by a message with its
  caption, or none — and it then stands down from the conversation for that message but stays on its way, so the
  order sends go in and what becomes of the send are as they were, and the number the send answers with settles
  it. The photos of one press stand down together, once the archive carries every one of them with its picture.
  The archive files a photo's message a moment before it keeps the picture, and until the picture is kept that
  message does not stand: the line keeps standing with its preview in that message's place, so the conversation
  shows the photo once and never an empty bubble beside it. Once the picture is kept the message takes the line's
  place drawing the line's preview until its own copy has loaded. If the message number the bot returned is in the archive, that message is that line, and since
  numbers are not the same per room — the owner's private chat has their account and the bot number it separately —
  if it is not found by number it is found by what the archive carried. Words are recognised as the same words
  standing up in place under the owner's name, a photo by the photo uploaded then. One uploaded message binds one
  stood line only. Words the archive keeps as another speaker's — a line the owner sends into an avatar-mode KakaoTalk
  room opening with 「[〈이름〉]: 」 is kept as the chat agent's words with the prefix taken off (the KakaoTalk service's `docs/kakao.md`) — are found by
  number alone.
- **The line's day** — a line on its way stands at the conversation's foot in the conversation's last day, or its
  own day where that is later, as the running row does, so a line put up on an earlier day never opens a date mark
  under the later days. Its time then reads with its date (`10-12 11:01`), since the date mark over it is not its
  own.
- **사진 여러 장** — the photos of one press go as one album, so while they go they stand as one line: the album's
  mosaic of their previews with the words once under it, the very shape of the archived album that takes its
  place. The album lands as a whole: once the archive carries any one of its messages, the whole line becomes
  that album, so a caption that comes back changed or a picture matched to another of the album's messages
  never leaves a second bubble standing. A photo of the press that failed stands on a line of its own, since
  다시 보내기 sends it alone. A line that went and whose message the archive never carries leaves after half a
  minute on its own clock, read or no read.
- **One send at a time, in order** — what is pressed to send goes to the bot one send at a time, in the order it was pressed: a
  send waits until the one before it has answered — gone, failed, or checking — so the room carries the words in
  the order they were written. A press of words with files is one send, as it always was.
- **대기** — the input box and its send button never close for the bot or this app being away: a deployment
  restarting both, a bot stopped, a browser offline. What is sent meanwhile stands at the end as ever, its mark
  the clock and its tooltip 「연결되면 보냄」, and waits. A send that met no answer at all, this app's own 503 — a bot
  that did not take the call, or one whose reader is not connected — or a 5xx the proxy in front of a stopped
  app answered in place of this app is no failure: the same
  send is tried again after a second, then after longer each time up to fifteen seconds, and at once when the
  screen reads the bot answering again or the browser comes back online. A call refused for the login waits the
  same way while the tab goes to the login screen. The ones behind it wait behind it, so the order holds. A send
  the bot has still not taken after ten minutes of tries on one screen turns failed, its reason saying the bot
  never took it, so it is sent again or deleted by hand rather than left waiting for good; opening the room again
  starts the ten minutes afresh. A call sending words that this app has not answered in a minute is given up on
  the screen and tried again under its key, so a call lost on the way never holds the line on 「보내는 중」.
- **Kept in the browser** — every line on its way, words and files alike, is kept in that browser's own storage
  (IndexedDB) under its room until the archive carries it or it is deleted. A reload, a closed tab or a browser
  restarted puts each line back where it stood, in its state, and sends on whatever had not yet been answered.
  The room screen is what sends, so lines left waiting in a room the reader moved away from go when that room
  is opened again.
  Files are kept apart from the line's state, so the state changing never writes a file again.
- **Once only** — every send carries a key the browser made for it, the same on every try. This app keeps each key
  it was handed for a week in its own data folder, the one its settings name, one small file per room and key, made only where none stands, so
  of two tries of one key only one ever reaches the bot. A key whose send has answered hands that same answer to
  every later try; a key whose send is still going, or whose app stopped before the answer came, answers as a
  send that ran late, so the screen watches for it (「Checking」). A send the bot refused or did not take frees its
  key for the next try. A send that ran late is still listened for: this app keeps waiting on the bot for two
  minutes past the 45 seconds it gave the screen, and writes under the key the message the send went out as, or
  the refusal that came instead. The screen asks for a key's outcome on a route of its own, which reads the
  record and sends nothing. **다시 보내기** is a new send and takes a new key.
- **Checking** — a send can take longer than a read: the bot waits its turn on a road that does one thing at a time,
  such as the owner's PC KakaoTalk, before the words go. So a send is given 45 seconds, and a send the bot took but
  did not answer in that time is no failure: its mark stays the clock, its tooltip reads 「보냈는지 확인하는 중」, it offers no 다시 보내기, and
  becomes the message as soon as the archive carries it, the way a line on its way does. While it is checked the
  screen asks every few seconds what its key came to: the message it went out as makes it that message, found by
  number, and a refusal makes it failed with the bot's reason. A line restored from the browser in this state is
  asked for at once. Only a line neither the archive nor its key has settled two minutes after the answer ran
  late turns failed, and its reason says the send was never confirmed, so it is checked in the room before being
  sent again rather than sent twice. A file answered late is watched in the archive alone.
- **보내지 못함** — if it could not be sent, its mark is a red exclamation mark, and pressing it opens a menu with the
  reason, **다시 보내기** and **지우기**. The written words do not return to the input box but stay on that line, so pressing 다시 보내기
  sends them again as is, after whatever is waiting ahead of it. A failed line is kept in the browser like any
  other, so a reload leaves it standing with its reason until it is resent or deleted.
- **첨부** — photos and files are pasted and sent in the same input box. Choose by the clip button, drag onto the
  screen, or paste from the clipboard. All three work and several may be pasted at once. What is pasted stands as
  a line with its name and size before sending, a photo with a preview, and can be removed one by one. Files go
  with no words at all — Enter or the send button sends them with the box empty.
  - **The clip on a touch screen** opens a menu of two, since a phone's file picker chooses one file per tap:
    **사진·동영상** opens the phone's own photo picker, where every tap adds a picture or a video to the choice,
    and **파일** opens the file picker. On a screen with a mouse the clip opens the file picker at once. Both
    pickers take several files in one choice.
  - **Several files are one send.** They go up together in one request, and the bot puts them into the room as
    Telegram albums, the way a phone sends several at once (the receiver's `docs/boundary-api.md`, `POST /say-file`): photos and
    videos as one album, documents as one, sounds as one, and a GIF alone, since Telegram puts none in an album.
    The words written with them go once, as the caption of the first album. A road other than Telegram has no
    album for them, so there each file is a message of its own and the words go ahead of them.
  - **In the owner's private chat they never reach Telegram.** Each file stands as their own console message, a photo as
    a picture and anything else as a file with its download, the words on the first however long, and the chat agent's
    answer stays on the console (the receiver's `docs/unified-bmo.md`, 「Console conversation in the private chat」).
  - **The caption.** A caption is up to 1,024 in Telegram, so words longer than that are not put in the caption
    but go the same road as the input box's words — split if needed — before the files, and the files follow
    with no caption. Its line breaks reach the room as typed, so the archived caption is the very words the line
    on its way stood with, and the archived message takes that line's place the moment it arrives.
  - **The kind** is split by the file's MIME. JPEG and PNG are photos, GIF a moving image, other images files so
    the original is not damaged, video a video, sound audio, and everything else a file. A photo-bound file with no
    extension is uploaded with one attached — the name must be so to stand as a photo in Telegram. One file is up
    to 50MB, ten at once. A larger file does not attach and says so on the spot with its name and size, and choosing over ten says which was dropped. The reader's actual limit is
  far larger, but this line is not exceeded as the road carries it whole from the browser through the app to the
  bot. The proxies in front of the console — NPM and this machine's nginx site — put no ceiling of their own on a
  request's size, so the app's ceiling is the one that holds. Pressing send moves the attached from the list above the input box to the conversation's end, standing one
  line per file to show what is going up. A photo stands a preview there, and other files stand a name. Each file's
  outcome returns on its own, an album that did not go answering for every file in it, so an uploaded line becomes
  an ordinary message, the pictures of one album gathering into one 앨범 row, and only an un-uploaded line stays
  with its reason and 다시 보내기. So if one of several sticks, only that one goes again, and a file already in the
  room never goes up twice. A photo, voice, audio or ordinary file stays as the message the receive update
  recorded in the archive. When the file's storage finishes, the same message's attachment mark is updated.
- **지금 하는 일** — from the moment that room's session received something to the moment that turn ends, a line
  flows below the conversation. The received moment, not the model-asking moment — in between stand waiting on a
  context being folded, the summary opening a new session, the reference gates and the sanitiser lined up, so
  reaching the ask is often the longest stretch of that turn. A room that heard shows it heard from the moment it
  heard. That line writes what this turn received — how many words the room said, how many quiet instructions the
  bot put before them, both if both. If more words arrive while waiting and merge into the same turn, that count
  rises too. A turn that received nothing and a turn where the bot has said nothing say nothing here — an unknown
  count is not invented as something else. The line holds no list of the turn's stages: what each gate said
  stands under the message it judged (「판정」), and a second copy here is what made the two disagree. This line
  stands in the very place of the answer soon to stand, because it is that place: one component draws a row of
  this conversation, and the running turn is handed to it as a row like any other. So the side, the photo, the
  name, the column the words read in and the meta line at its foot are not matched between the two — there is
  only one of each.
  - **The running row stands in the day its answer will be dated.** That is the day its turn began, or the
    conversation's last day where that is later, since the row stands at the foot whatever day it began on. A
    turn begun on a day after the last one said in the room stands under that day's date mark, so the answer
    that opens the day settles into a place the mark already stands over and nothing above it moves.
  - **The running row has no ground.** Its name, its line and its meta line stand where the answer's will, but
    on no bubble ground, with no tail and no time on the meta line; what the meta line otherwise carries, its
    chips and their marks, stands as on any row.
  - **The answer settles into the place.** As the answer takes the row's place, its ground — colour, corners
    and tail — grows from the box the turn's words stood in to the answer's bubble, while its words, laid out at
    the bubble's own size from the first frame, only move with that box. Nothing is scaled. The box rides with
    the list, so a list gliding to show the answer is followed. A reader who asked for less movement sees the
    answer stand at once.
  - **The block gives its place up the moment the answer has it, and not before.** The answer reaches the room
    by two reads: the news of the message itself, which the bot sends as the answer is filed, and the read the
    turn's ending makes. Whichever brings the answer first, the block hands its place to it in the same render,
    so the block and its answer never stand together and the conversation is never short by the block's height
    in between.
    - Until then the ending is held: a turn that ended by sending its answer stands its block until that answer
      is in the feed, by the news of the message or by the ending's read. The bot files the answer before it
      says the turn sent it, so the ending's read brings it in the ordinary run of things; where that read is in
      and the answer is not, the block stands fifteen seconds more and then goes, so a read that failed never
      leaves a finished turn saying it is still going.
    - The block gives its place up in the update the answer arrives in, and what stands after the block — the
      listening row — comes in the update after, so the answer is always there before it.
    - A turn that ended with no answer to read gives its place up at that read, to the line that says why
      (below).
    - A turn still running after its answer stands — an answer in parts, more work after the words — stands its
      block again under the answer at the turn's next word of itself.
  A verdict attaches
  to that message before the archive is re-read. A turn ended with no answer shows its reason briefly and
  disappears — when it waited expecting more words, when the run failed, when somebody stopped it. The reason
  names the agent whose turn it was, by the same name its running row wore, so a companion's failed turn says
  the companion failed. That reason is not a bubble but a line standing centred like a date mark, with no photo,
  so the agent does not appear to have said what it did not. It stands above the lines of running work, which stay at the foot for as long as they run.
- **A turn the chat agent chose not to answer stays in the owner's own chat.** There a turn that ended in silence — the
  session answered `<<SKIP>>` — leaves a line 「〈이름〉가 이번에는 답하지 않았습니다.」
  under the last message that turn read, and it stands there for good rather than fading. Only the chat agent's turns end
  this way, so the line names the chat agent, by the same name its running row wears.
  - **A group room stands no such line,** and no passing reason for a silent turn either. There the chat agent staying out
    of an exchange is the ordinary course, one line per message passed over is noise, and the listening row
    (「The listening row」) already says it is there. The judgement is still written and still rides on the message's chip
    line.
  - **Which rooms are groups is the bot's own split of rooms:** every room but the owner's own chat
    (the receiver's `docs/wake.md`). The console knows the owner's chat from its own answer, or from the bot's health answer
    where its own has none; a room it cannot tell stands as the owner's chat does.
  - **It is read from the archive.** The bot writes the ending down as a judgement of the stage `skipped` on the
    message the turn read, so a reload, another device or a page read back from the room's past stands the same
    line; the read that follows the turn's ending carries it, so the line stands as the turn's answer would.
  - **It is a faint centred line, not a message.** It wears the same muted look as the date mark and the passing
    reason, carries no photo and no bubble, and is not a row of the conversation: choosing, copying, replying and
    arrow movement do not reach it. Its judgement still rides on the message it stands under, so copying that
    message carries it and the message's chip line names it.
  - **One message stands one line.** Silent turns are never adjacent — each one read a message of its own, and the
    line stands under that message — so they need no grouping. Two silent turns over the same message stand as
    one line that counts them.
  - **A turn that read nothing of the room leaves no line.** A round run for an instruction alone has no message of
    the room it passed over, so its ending is written with no message and shows as the passing reason instead.
- **A system notice stands as a system line, not a bubble.** A line the bot sent as the service —
  filed under the bot's own sender name, its words opening with the system notice mark
  (the receiver's `docs/voiced-notices.md`, 「System notices」) — is the server's answer `notice` on that message.
  - It stands centred and muted like the date mark, its time after its words, with no photo, no name
    line and no bubble, so the chat agent is not seen to have said it.
  - It is still a message of the room: choosing, copying, replying and arrow movement reach it as
    any row.
  - It is not an agent's answer: it carries no chip line and no full reading, since it is never read
    in the chat agent's voice.
- **The running work is a group of its own** at the conversation's foot: a line per search, browse or job running
  for this room, each opening its log. Its lines stand close together, and the group is spaced from the
  conversation as the conversation's own rows are.
- **A screen opened mid-turn sees that line too.** The notice standing the line goes out once at turn start, so
  one not watching then cannot hear it, and if that notice was pushed out of what the bot holds while the stream
  broke and resumed, it does not come again. So this line is read not only from the notice but from the picture the
  bot puts out. The picture carries which room has been answering what since when, and the stream hands that
  picture as it is at opening. Whether the screen just opened or broke and resumed, if there is a running turn that
  line stands, and the moment the picture drops that turn the line disappears with it. Notice and picture fill the
  same one line — the two do not each stand their own.
- **The line belongs to the room, not to the screen showing it.** The tab keeps one record of every room's running
  turns, moved by the same notices and pictures whichever room is on screen, and a room's screen reads its turns
  out of that record. So going to another room and coming back finds the line standing where it was, with what the
  turn has done so far; the running work group and the home screen's 〈이름〉가 답변 중 on a room's line stand the same way. A reload or another device reads the
  picture the stream opens with, which is the same record from the bot's side.
- **Thinking, and using a tool** — that one line stands differently by what the answering agent is doing now. While
  thinking it is a blinking line saying "〈이름〉가 생각하는 중". When it starts writing the answer that place says
  "〈이름〉가 답을 쓰는 중", and while a tool is being worked it says "〈이름〉가 〈툴 이름〉 사용 중" — so a wait is
  not all seen as the same wait, and the wait that is a tool says which tool. A companion's turn whose engine a
  Job holds says "〈이름〉가 같은 모델을 쓰는 #〈항목〉 Job이 끝나기를 기다리는 중" until the Job ends
  (the agency's `docs/companions.md`, 「The engine it shares」), read off the bot's picture as well as its events, so a screen
  opened in the middle of the wait shows it; the agents list's row says "Job 종료 대기 중".
  - **The chat agent's line says which question of the draft process it is on** (the receiver's `docs/drafting.md`).
    The receiver tells each question just before it goes out, as a `draft` event of kind `start` naming its place
    in the process from 1, how many questions the process asks and the question's name, and from that event the
    line stands as the round and the question in place of the state: "라운드 2/5 · 사실 확인", the question named in
    the language pack's words for it and by its own name where the pack has none. The last question writes the
    message, so its line says that instead: "라운드 5/5 · 메시지 작성 중". Until the first question's start — the
    gates and the reference before it — the line says the state alone. The rows the process writes as each
    question is answered move the line nothing, and no line waits on one: a round whose first answer is a wait
    tells its first question's start and no row, and its line stands on that question until the turn ends. The
    process's `end` row brings the line back to the state alone. A
    process that ended with its text withheld or past its ceiling says so in the passing word once the turn has
    ended — "〈이름〉의 답이 점검을 통과하지 못해 보내지 않았습니다.", "〈이름〉가 시간 안에 답을 마치지 못해 보내지 않았습니다." or
    "〈이름〉가 시간 안에 답을 마치지 못해 그때까지의 답을 보냈습니다." — and a skip says it as any silent turn does. A
    companion's turn runs no process, and its line says the state alone.
  - **The name is the one answering on that row.** Each running row is one speaker's turn, so a companion's row
    names the companion and the chat agent's row names the chat agent, and a room both answer at once stands both rows, each with its
    own name. The receiver names the speaker on every event of a turn and on the turn its picture holds, by the
    answering agent's registration name (the receiver's `docs/api.md`, 「Events and the live board」). A speaker
    whose name is the receiver's default answerer's — which the agent list carries beside its agents, read from
    the owner's room's answerers, the deployment's chat agent standing for it before the list has arrived — is the
    chat agent, and its row is the one its listening row stands as; a speaker of any other name is a companion. Every
    event of a turn reaches the turn whose speaker bears the same name, its sending and its draft rows among them,
    and which of the two a turn is, is read as it is shown, so a name arriving after the turn began moves the turn
    to its own row. A turn whose speaker is absent or null is the chat agent's. The name on the row is the agent's label in the `agents` table, never the
    registration name the event carries: a companion's from its own row, the chat agent's from the row of the
    session answering every room, and only before the catalogue has arrived does a row fall back — the chat
    agent's to the language pack's word for it, a companion's to its registration name. The particle after the name, 가 or
    이, follows the name's last sound. The tool is named by the word a person calls it by — 셸, 읽기, 편집,
  웹 · web_search — and never by the name the CLI sends; a tool the vocabulary does not carry stands under the
  name it came with, which says more than 툴 alone. The line reads the tool's name and nothing else the call
  carried, so no argument of a call can reach it. A phase whose stream named no tool stands "〈이름〉가 툴 사용 중".
  The shimmer of that line is the whole sign that the turn is going, in every phase; no mark spins beside it.
- **The listening row** — in a group room, while the chat agent's window there is open and no turn of its is running, its running row
  stands as four plain lines: its name, at its head wherever the row opens a run of its own as on any row; "채팅 활성화";
  "〈이름〉가 듣는 중"; and "앞으로 2:41 동안". So the room reads it as present for the whole conversation rather
  than coming and going with every turn, and reads how long the conversation still has before it stops listening.
  No chip, badge or mark stands among them.
  - **The time left counts down by the second,** in minutes and seconds as a timer reads them, its figures tabular
    and turning as every changing number does (「Motion」). It is counted from what the console last answered,
    so each read that finds the window moved on — a call or an answer restarting it — sets it again at once.
    It stands alone on the row's last line, which never wraps onto a second one, so the row keeps its height.
  - **It is the same row as its turn's.** A turn beginning there changes the row's lines to the turn's own words in
    place, and a turn ending with the window still open changes it back, so between turns nothing comes, goes or
    moves. An answer still takes the turn's place as above, and the listening row then stands again under it.
  - **It is a turn row's height.** Its lines are each a meta line tall and one step apart, as a turn's name, the
    line of what it was handed, its state and its chip line are: "채팅 활성화" stands where the line of what a turn was
    handed stands, "〈이름〉가 듣는 중" where its state stands, and the time left where its chip line stands. So
    the row is one height listening and working, and the conversation above it never moves as a turn begins or ends.
  - **It is still, with no shimmer and no chips.** The shimmer says a turn is going and the chips say what a turn
    spent; listening is no turn, so neither stands.
  - **The window is the receiver's,** as the receiver and the conversation write it for the chat agent's own agent
    (the receiver's `docs/wake.md`, 「The names and the window」), read through its
    `GET /console/rooms/{chat}/window`. The room asks the console how long it has left when it
    opens, again on each thing in the room that may move it — a message filed or queued, a turn beginning or
    ending, the window itself written or closed (`window-closed`), early or by its time — and once more as that
    time runs out, so the row goes when the window closes and never on a guess of the screen's. The countdown only reads that answer down between reads and
    never closes anything itself.
  - The owner's own chat stands no listening row: every message there reaches the chat agent with no window at all.
- **The window's time left stands in the top bar.** While the chat agent's window in a group room is open, the
  room's top bar carries how long it has left, beside the room's name and its menu, whether a turn is running or
  the listening row stands, so how long the conversation still has is read without going to the room's end. It is
  a listening mark and the time left as a timer reads it, counting down by the second in tabular figures that turn
  as every changing number does, and its tooltip and the name a screen reader hears say that the chat agent
  listens. It counts down from the same answer the listening row counts from and is read on the same occasions
  (above); it goes once the time it counts reaches nought, and stands nowhere while the window is shut, so the
  owner's own chat never carries it.
- **What the turn did** — spread from the meta line, inside the bubble, stand the things the turn has done, oldest first, one line each, as
  two lists: the documents put in front of it and the stretch of the room it read back, and every tool it has
  called. They wear the same badges the agent's own log wears — 방 문맥, 기억, 인물북, 참조 문서, 룰, 지식,
  지난 대화 — with a reference document's full-or-held mark left of its badge as the log wears it, and a
  call wears the same chip the log gives it — the tool's own name with its icon — beside what the call was
  about: its file for a file tool, its command for a shell. A credential in those arguments stands masked, the way the record holds it. A
  call that came back a failure carries 실패; one still out and one that came back well stand plainly.
  - The block carries the newest few and each list says 이전 n개 above its own, so a turn of a hundred calls
    neither grows the block without end nor sends the whole of itself again on every call.
  - The lists spread inside the bubble, under its meta line, from the 브레인 and 툴 사용 chips the finished
    answer wears — the same ones, drawn by the one component that draws the meta line of every row — and each
    counts its sort for the whole turn, what the block could not stand included. Pressing either folds or
    spreads its own list and nothing else: the other list stays as it stood, and no answer's list moves with it.
  - When the answer takes the row's place, everything the running bubble had spread is folded: the answer stands
    as its words and its meta line, and nothing of the turn's work stays under it unless the reader spreads it
    again from the answer's own chips.
- **활동 표시의 접힘** — what the browser remembers is how the reader last left each of the running block's two
  lists, one choice per sort, so a turn whose 툴 사용 was folded away starts the turns after it with 툴 사용
  folded and 브레인 as it was left.
  - **A browser that was never told stands both folded**: what a call carried — a command, a file — is read
    only by spreading it, never shown in the conversation unasked.
  - **It is the running block's alone.** A finished answer's lists start folded whatever the running block's
    choice, and pressing an answer's chip writes nothing into it; pressing a running block's chip moves that
    one list on that row and remembers the choice for the next turn, never reaching a row already standing.
  - **The lists are read from the log when one is first spread and not before**, so a room standing open costs
    no reading of a log it does not show.
- **One run with its answer** — the running turn stands in its answer's place, in the same run, with the same name at its head and
  the same photo beside its foot, but on no bubble ground, with no tail and no time (「지금 하는 일」); its meta line
  carries the chips on its leading end as the answer's does. What the turn received and the state line are both at
  the meta line's size, line height and colour, each alone on its own line, so the block reads at one size. The
  two stand one step apart — the bubble's own step, the same one between the name above them and the meta line
  below, so the whole bubble reads at one rhythm rather than at two. The state line
  stands directly under what the turn received, at the head of the block: it is the one line of the block that
  is read over and over while the turn runs, and standing it under the stack would move it down the screen on
  every call that lands, leaving a reader to find it again each time. Under the words comes the meta line —
  브레인, 사용 토큰 and 툴 사용 at its leading end, the time at its trailing end — and what the turn has done
  grows downwards from under it when spread, which is where a finished answer spreads the same lists.
- **사용 토큰** — the meta line always carries the token chip the answer will carry, in the place it will carry it,
  filling as the turn runs: 「\~48K」, what the turn has written so far. Its mark is the same token mark a finished
  chip wears — the 「\~」 on the estimate and the shimmering line above say the figure is still moving — and
  pressing it spreads one line, 「진행 중」, with the four kinds as a group of bars.
  - The figure is an estimate while running: the thinking tokens the CLI counts as it goes, and the answer and
    tool calls written so far measured by their length. The output count the stream carries mid-way is a
    placeholder, so it is not used.
  - Read, cache read and cache write in the spread are what the turn's requests so far reported: the stream
    states each request's input, cache read and cache write once, and each request is added once.
  - Before anything has been written, the chip stands with what is known — nothing yet, one dash — rather than
    a nought.
  - When the answer arrives the row becomes the message, and its chip is the round's recorded figure
    (「사용 토큰」 under the room's messages), so the estimate never outlives the run. The chip does not move as it
    changes: it stood where it stands on the answer, and what arrives with the answer stands after it
    (「The order the chips stand in」).
- **What else runs for this room** — besides the chat agent's answer, a job or a standing watch's check —
  stands below as **one line of counts**, never one line per run, however many run.
  - The parts are 「Job <n>」 for jobs and 「워치 <n>」 for watch checks, joined by a middle dot: 「Job 7 · 워치 3」.
    A part with nothing in it does not stand, and the line stands while any part does. The line still knows a
    search's `검색 <n>` and the rest's `기타 <n>` from a picture that carries one; no unit serves those runs now.
  - A deployment is never one of its parts: it is no run of this room, and the title bar's mark is the one place it
    stands (「Deployment in the title bar」).
  - It never wraps: on a screen too narrow for it the line is cut at its edge. It is centred under the conversation,
    and its shimmering words are its only running sign, with no spinning mark beside them.
  - The jobs are the agency's `GET /jobs` at `starting` and `running`: a job whose launch named no room is placed
    in the room its item's scope names, and one whose item names no room stands in no room. The line is
    read again when the agency says a job started, changed or ended, and on the catch-up read a reopened stream
    brings. A watch's check comes from the board's standing watches. The runs of searches, gates and runners going
    now are served by no unit (`docs/boundary.md`, 「Gaps the console meets」), so the line carries none of them.
  - Pressing it opens the log of what runs, with no dialog between. With one run it opens that run's log at once;
    with several it drops a menu of them, one line a run, and choosing one opens its log.
- **A run line says what runs, how long, and who launched it.** In that menu each of this room's runs — jobs and watches'
  checks — stands as one line: what runs (a job its item or its model if
  no item), how long it has gone, and **who launched it**. The launcher writes its own name on launching, so what
  that room's chat agent launched stands as that room's chat agent's, what the owner launched from the console as launched from the
  console, what another room's chat agent launched by that chat agent's name. So a search one room's chat agent launched reads
  as that room's on its screen, and a job the owner's private chat launched for another room's work reads as launched from
  the owner's private chat in that room.
  What ran with no name written stands with no launcher — the room work is attached to is not guessed as the
  launcher. A co-work run stands by its place in the work order, not its unit name, and that being the same rule
  wherever a run line stands, it is written on the live status side. What runs is not something this screen can
  shorten, so the line is never cut: a menu wider than the screen scrolls sideways as every menu of the console
  does. Choosing the line opens that agent's log over the conversation: on a wide screen as a centred modal, on a
  narrow screen as a sheet rising from the bottom to fill the screen. What
  is inside is the very log view the agent screen uses, so the line's shape, spread and following are the same, and
  being the log now in use it holds the end and follows new lines. A **페이지로** button above crosses to that
  agent's screen at the same run and place (「The work view」), and pressing closes what is open and moves there. Closing is by outside press, Esc and a close
  button, and a sheet has a handle above it too.
- **A watch's line is named after the watch, not after the agent looking.** Where the run standing there is a
  standing watch's check, the line carries 「워치 #N · <name>」 — the watch's number and the few words it was set
  with, or the head of its note where it was set without a name — and nothing about the watch under it, the
  same one line the live status board stands under a watch's runner. How often it looks, how long is left, its
  condition and what it promised are never on that line, however long the note behind it is. Pressing it opens
  the watch itself above the log, with its detail already open: how often it looks and how long is left, how
  the last look went, the whole of the note, the condition, and the deadline or the timer's moment. A check that wrote no log is the ordinary case, so what the
  watch says stands whether there is a log under it or not.

#### A companion's 모델 설정 and 초기화

- **A room a companion answers in carries two more entries in its top bar's menu, for the owner alone:**
  모델 설정 and 초기화, in a group of their own under 세션 정보, 메시지 고르기, 전체 복사 and 고정. A room with more than one companion
  carries the pair for each, named by the companion's label. Nobody else signed in sees them, and the
  console's server refuses either for anyone but the administrator.
- **모델 설정 opens the companion's settings dialog** — the very component the agent list opens, its
  대화 상대 block and its gates' block, saved by the one 저장 (「Forms」) — so the two places never
  differ.
- **초기화 opens a dialog of its own** (the agency's `docs/companions.md`, 「Starting it afresh」):
  - two checkboxes, 대화 기록 and 인물 기록, each with a line saying what it takes, both unchecked as
    it opens;
  - with neither checked, the dialog offers a fresh session alone: this room's session starts afresh at its next
    turn, as the session reset does (the agency's `docs/session-resets.md`), and nothing is deleted. It reads the
    session list first and says which of the room's sessions ends; where the room holds no session
    of the companion, it says the next turn opens a new one anyway and the button stays off;
  - with either checked, it reads nothing: each checkbox's own line is all it says of what goes, and
    초기화 is on at once;
  - the foot's button says what it does — 새 세션 시작 or 초기화 — and 새 세션 시작 is on only once
    the session list is read;
  - 초기화 deletes then and there, and the dialog turns into what it took, as a name and value list
    (「Name and value lists」): with 대화 기록, the rooms whose whole record went and the rooms where
    only the companion's own rows went; then each table's count, the files and folders, the archive
    copies that gave up rows, the person-book runs it stopped and anything it could not remove. The
    checkboxes go, and the foot carries 닫기 alone;
  - a refused reset keeps the dialog as it was, with the reason; one that went through is shown only
    there, and the session list says when each room session it ended was cleared.

#### 대화에서 찾기

- **Every room's top bar menu carries 대화에서 찾기, for every reader,** first in its first group. It opens a find row
  in the top bar, where the choosing row stands: a search box, how many messages hold the phrase and which of them
  is shown, a button to the one before and the one after, and 닫기. The bar grows by the row as it does for
  choosing, so no message moves.
- **What it finds is the console's list search** (「List search」): the phrase typed, matched whole and without regard
  to case, in what a message shows — its words, its sender's name and its files' names. Every hit standing on the
  screen is marked where it stands, inside the bubble as it is drawn, markdown included, and the hit being shown
  more strongly than the rest.
- **It searches the messages the room has loaded.** The newest hit is shown first; the button up steps to older
  ones, the button down to newer ones, and Enter and Shift+Enter in the box do the same. Each step brings the
  message into view and marks it for a moment, as a pressed quote does. Under the count stands that only the
  loaded messages were searched, while the room goes on before them, with 이전 메시지 더 불러오기, which loads
  the next page further back and searches it too.
- **Escape or 닫기 closes it,** clearing every mark, and the bar folds back.

#### 고정

- **Every room's top bar menu carries 고정, or 고정 해제 for a pinned room, for the owner alone,** in its first
  group after 전체 복사. The pinned order is one list for every reader, so nobody else signed in sees it, and the
  console's server refuses its route for anyone but the administrator.
- **고정 stands the room last among the pinned, and 고정 해제 takes it out;** the receiver writes the order
  (`docs/boundary.md`, 「Calls the console makes」), and every room list re-reads the receiver's once it has
  answered, so the sidebar moves the room to its new place.
- **A refused pin is said by the pack's sentence for the receiver's code,** as a notice, and the list stands as
  it was.

#### 채팅 서비스

- **Every room's top bar menu carries 채팅 서비스 for the owner alone,** after 고정. Which providers a room is on
  is one setting of its registration, which the receiver keeps (its `docs/receiver.md`, 「A room's chat
  providers」), so nobody else signed in sees it, and the console's server refuses its routes for anyone but the
  administrator.
- **It opens a dialog listing every provider the receiver names,** in the receiver's order, each a row with its
  name — the receiver's own label for it — and a switch that stands on where the room is on it. A room whose list
  was never set shows the providers it stands on now, and a line saying so.
- **A switch saves the whole list at once:** turned on, the provider is added at the list's end; turned off, it
  is taken out. A room is on one provider at least, so the last switch on cannot be turned off. While the list is
  written every switch waits; a refused write is said in the dialog by the pack's sentence for the receiver's code,
  and the switches stand as the receiver last answered.
- **The rule the dialog states:** a room on the room's record alone — the receiver's own road, which this console
  reads — reaches no messenger, and what is said there stands in the archive and the console; turning a messenger
  on starts carrying every message kept from then on to it, and turning it off stops that. The rule is the
  receiver's and turns on the list alone: the console names no provider apart from the others, in its code or in
  what it sends.

#### 방 등록 삭제

- **Every room's top bar menu carries 방 등록 삭제 for the owner alone,** last, in a group of its own.
  Nobody else signed in sees it, and the console's server refuses its two routes for anyone but the
  administrator (the chat library's `docs/protocol.md`, 「Removing a room's registration」).
- **It opens a dialog that reads what the removal would take before anything is written:**
  - what goes, as a name and value list (「Name and value lists」): the count of each kind of record,
    the folders with their files, the brain's documents of the room and the archive copies that hold
    it;
  - what stays: the items, jobs, job questions and searches filed from the room, and its usage;
  - the warnings: each companion answering the room, the open items and questions filed there,
    another user's private chat by that user's name, and a road that can still reach the room;
  - the settings naming the room that no declaration matches, listed as kept.
- **A refused room shows the reason and no confirm;** the foot carries 닫기 alone.
- **Otherwise the foot carries 취소 and 삭제,** and 삭제 is on only once the list is read. Pressed, it
  asks no further, and the dialog turns into what the removal took, with anything it could not remove.
- **The `room-removed` event closes the room everywhere:** the sidebar drops the room, and a room
  screen open on it, on this device or another, goes to the home screen with a notice that the room's
  registration was removed. A screen whose own removal dialog stands open goes once the dialog is
  closed, so what the removal took stays to be read.
  - Only a removal made after the tab opened acts: a tab's first stream is handed what the bot's
    ring still holds, a removal from before then is already in what the tab read, and the same room
    registered again since must not be closed by it.

#### 세션 정보

- **The sheet is the room's figures, counted on the way out.** Nothing of it is kept anywhere; it
  is read from the receiver's `GET /console/rooms/{chat}/figures` each time it opens, its messages by the hour
  counted in the zone the console shows every time in.
- **What no unit counts by room stands as "—":** an agent's runs, its last run and its tokens, which the agency
  answers by no room, so the receiver hands each as null (its `docs/boundary-api.md`, 「A room's figures」). The
  rules below are what those figures mean wherever they are counted.
- **Who wrote a message is decided as the room screen decides it** (「Room screen」): an agent's when
  filed under the bot's own sender name, which is the chat agent's, or under a number a road gave an
  agent. Every other message is a person's.
- **The messages card divides the count into people and each agent that spoke**, one share each,
  named by the agent's own label. 마지막 응답 is the latest message of any agent there.
- **Talkers are people only.** 가장 많이 말한 사람 and the count of who spoke leave every agent out, a
  companion as much as the chat agent.
- **The agents shown are the room's own.** The room's designated agents, or the chat agent where the
  room names none, and after them any other agent that spoke there. Each stands as a block of its
  own, headed by its label.
- **A block's session is where that agent keeps its session for this room:**
  - The chat agent's is the chat session, one for every room where the chat agent is unified: its open
    session and model, its last answer's route, its context, runs and last run, as its agent row
    records them;
  - an agent keeping a session per room, as a companion does (the agency's `docs/companions.md`, 「The session」),
    shows that room session: the provider and model it was opened on while it holds one, the agent's
    last answer's route, and the runs of its own in this room — how many, the last one's time and
    the context that run carried in (read, cache read and cache write).
- **Tokens are the agent's usage rows for this room**, the week's and all of them: the rows of the
  agent whose run names this room as its second part (`chat:<room>:…`, `handoff:<room>:…`), and for
  the chat agent also the rows standing under the room's own agent name, `chat:<room>`. A row of a
  shared agent naming no run is no room's.

#### 소리 듣기

- **A kept sound stands as its player.** the chat agent's voice briefings sent to a room that speak no line of it, a voice message someone sent in a
  room, an audio file somebody sent, and a file line whose name is a sound — MP3, WAV, OGG, OGA, OPUS, M4A, AAC,
  FLAC — whatever kind of row holds it, so a recording the chat agent sent as a file plays too. It stands in place of its file
  line as the console's own audio player, and nothing of the browser's own player shows.
- **A bubble holding a player is as wide as the player or its words, whichever is wider.** The player asks for
  320 px, or the bubble's widest where that is narrower, and always takes the bubble's whole width, so no blank
  stands past its waveform; words wider than it widen the bubble and the player with it.
- **The player is laid out as a Telegram voice message is,** with no frame of its own: it stands on whatever ground
  holds it. It is one component, and every sound of the console stands in it — a room's sounds here, a line's
  spoken reading (「칩 줄」), and a document's sounds in the 아카이브 and under its share link (bmo-artifact's `docs/archive.md`).
  1. A round play and pause button at its leading edge, in the accent, centred on the player.
  2. Beside it, as one group with it, the sound's own waveform as a row of upright bars running to the player's
     trailing edge, and under it one small muted meta line.
  3. The download button, an icon button with its tooltip, stands at the trailing end of that meta line and takes
     no more height than the line. A player that is the last thing in its bubble keeps a blank at the line's end
     for the bubble's own meta line, which stands there (「메타 줄」). The line's parts stand the meta line's step
     apart, so a phone's narrowest player keeps the place, the download and the time on one line while it plays;
     the clock itself never breaks, and where a longer clock leaves no room, what follows it takes the line under.
  4. The file's name is the player's accessible name and is said in the download's tooltip; it is not written on
     the player.
- **The waveform is read from the sound itself.**
  1. The file is fetched and decoded in the browser once the player comes near the screen, and each bar is the
     loudest stretch of the sound under it. As many bars stand as fit the width the player is given.
  2. Until that reading lands, and for a file too large to fetch for it, the bars stand low and even.
  3. The played stretch is in the accent and the rest dimmed, so the waveform is the progress bar. The accent
     follows the sound frame by frame while it plays, for every reader, since it says where the sound is rather
     than decorating it. Both are solid colours with no gradient between them: the accent ends at a hard edge
     exactly at the place playing, cutting through a bar where the place falls inside one, so nothing is lit
     before the sound plays and every bar is at its end.
  4. A press or a drag on it seeks there, and so do the arrow keys, Home and End once it has the focus; it
     cannot be moved until the length is known. A drag on it is its own, never a hold choosing the row or a press
     opening its menu.
- **The meta line says the length and the size at rest, and the place while it plays.** In tabular figures,
  minutes always in two places and hours in front past an hour:
  1. at its start, the whole length and the stored size (`00:14, 108.2 KB`), the length a skeleton while it is
     fetched;
  2. once it plays or stands anywhere past its start, the elapsed over the whole length (`00:03 / 00:09`), the size
     gone.
- **While it plays, an aura rings the play button and moves with the sound.**
  1. The ring swells and brightens with the loudness heard at that moment, eased from frame to frame, and its
     light turns slowly round the button the way an aurora drifts.
  2. The loudness is read off a copy of the element's output, as the briefing player's visualiser reads it
     (the voice unit's documents, 「The console's player」); where the browser gives no copy, off the sound's own
     waveform at the place it is playing.
  3. Paused or ended, the ring fades away; a reader who asked for less movement is given a still ring while it
     plays.
- **Its states:**
  1. From the press until the sound is first heard, the play button spins. The sound is heard once the
     browser says it plays or its clock moves on, whichever comes first.
  2. From then until it stops, the button is the pause button, and a press stops it at once. A stall
     for bytes while it plays, a seek into a stretch not yet fetched among them, leaves the button as
     it is: the waveform's accent standing still and the aura falling to its quiet ring say it.
  3. A sound the browser cannot play says so in place of the meta line, the waveform dims, and the download stays.
  A line whose file is gone stands no player — a fact the archive answers, so nothing offers to play what only
  pressing would reveal is not there; it stays the dim file line of 「첨부와 Telegram 표현」.
- **A player stands one bubble padding from the words beside it,** the room a picture keeps from its caption, on
  whichever side the words stand; the bubble's width and the step between messages stay as they are.
- **A voice message is stored whoever sent it.** It is words a room said in its own voice, and unkept it plays once
  and is gone with no way to recover. It stays even when not called by name, even when not the two people the
  collector watches. Attached audio and ordinary files are stored regardless of sender within the size limit.
  Storing an ordinary attachment makes no summary job and does not tell the owner. The existing briefing-alert
  conditions are kept. A voice or a file stays as its own line in the archive (`[음성 1:25]`, `[파일 계약서.pdf]`), so
  the room screen reads it in place.
- **The mark is not said twice.** `[음성]` with or without its length, `[오디오]` naming nothing or naming the
  file line's own name, and `[파일 <name>]` are not shown above a player that stands; the words after the mark stay,
  so a voice briefing reads as what it says. An `[오디오 …]` mark naming a performer and a title stays, since the
  file line does not say them.
- **Only one plays at a time.** Starting a sound or a video pauses whatever other sound or video on the screen was
  playing, where it stands, so pressing it again resumes from there.
- **It plays in its room.** A room's conversation is read again each time the bot says a message came, and a row
  keeps its player through that, so a sound going is not cut by the room hearing something new. Leaving the room
  takes its players with it, and a sound going stops there.
- **A file is called by message, not by path.** The browser names the room, the message number and the file's place
  among the message's files; the console asks the receiver for that file (its `docs/boundary-api.md`, 「A message's
  files and picture」), which serves only what its store keeps inside the room's folder. Only a logged-in person
  who may read the room can receive it, and to skip sound in the middle a partial request is needed, so the range
  asked for is handed on and the stretch answered is handed back. The road is cut per kind — sound, video, document
  and the Telegram expressions — and each goes out by an address naming its kind; a file whose type its kind does
  not take is refused rather than handed on, and a document, or a sound or video asked for to keep, leaves as a
  file to keep.

#### 첨부와 Telegram 표현

- A stored attachment stands as a line of its own under the words: a file icon, the original file name, the actual
  stored size in B, KB or MB, and a download button at its end. The archive's mark for it — `[파일 <name>]` at the head
  of the message — is not shown again above that line, since the line says the same; a caption after the mark stays,
  and a message that is the file alone stands the line with no bubble round it (**말 없는 메시지**).
  Copying still takes the archived text as it is. An attachment that cannot be received stands the same line, dim,
  with 「받을 수 없음」 in place of the button. An ordinary file is offered to a logged-in user as a forced download, and HTML and SVG are not run as console documents. Stored audio in
  an unsupported playback format can be downloaded as a file too. A download failure, size overrun and lost file stay
  as an unreceivable state, and the same attachment received again is retried. If an edit puts a different file in the
  same message, the stored bytes are swapped for the new. The name an attachment carries is derived, so two different
  files often yield the same name, so whether it is the same file is told not by name but by the unique identifier
  Telegram gives each file. If one side does not know the identifier there is no evidence it changed, so the bytes are
  left and that row records the identifier.
- **A kept video stands as its player.** A video, a round video note, a GIF and a video attached as a file are all
  a video here, and so is a file line whose name is a video — MP4, M4V, MOV or WebM — whatever kind of row holds
  it. It stands above its file line as the browser's own video player, playing where it stands, no wider than the
  bubble and no taller than 320 px. Where Telegram said what shape the video is — its size, a round note's side, or
  its thumbnail's — the player stands in that shape from the first frame, so nothing under it moves when the file
  answers. Before it is pressed only its length, its size and the moment just past its start
  are fetched, so its first frame stands as the preview on a phone too. The file line under it keeps the name, the
  size and the download. The mark the archive wrote for it — `[동영상 0:56]`, `[동영상 메모 0:02]`, `[GIF 0:05]`, or
  `[파일 <name>]` — is not shown again above it; a caption after the mark stays. A MOV is served as MP4, since it is
  the same family inside and a browser that plays MP4 takes it under that type. A video in any other format stands as
  its file line alone, to download.
- Records that did not previously store a file keep the description only and do not auto-recover past Telegram records.
- **A file the chat agent sends stays too.** the chat agent sends a file only through its own send-file script, which takes a message whose
  file is kept, never a path. The file goes up as a Telegram document, as a reply to the message it came from when
  that message is in the same room. The sent message is archived under the chat agent's name as `[파일 <name>]`, and the file is
  kept for that message the way a received one is, so the room screen stands it with its download line and a copy
  of the file stays even if the original is removed. A file sent any other way — straight through the Bot API —
  leaves no line in the archive.
- The original text, caption and custom-emoji entities and sticker information of a new Bot API message are stored
  separately. A message the chat agent sent too — the message Telegram returned is recorded as is, so the custom emoji the chat agent wrote
  has an asset for the screen to restore. Not only room answers and stickers but alerts, reminders, job reports, search
  results, photos and voice — every road the chat agent speaks stays that way. Another bot's custom emoji the reader receives has
  its identifier preserved too, and static and WEBM stickers are stored. The reader's TGS stickers store the original
  but currently stay as a description on screen. A static sticker and custom emoji show as the original picture, a WEBM
  as a silent video. A TGS the browser cannot play directly, so a Telegram thumbnail if present gives a still preview.
  Without a thumbnail or supporting asset, the original emoji/sticker description stays. An ordinary Unicode emoji uses
  the browser font as before. This is web display and does not change custom-emoji sending eligibility. Entities and
  sticker IDs lost from an earlier record are not guessed as a description string.

#### Loading marks for content read later

- What a skeleton stands for, what it is built from and how its shape is matched to the real thing are in
  [the loading-skeleton account](skeleton-loading.md).
- An area fetched for the first time is told apart from a successful empty result. Only the region the answer lands in
  is covered: the layout, the section titles, the headers, the toolbars and the buttons around it stand from the first
  frame, and the placeholder inside is the shape of what will replace it. Assistive technology is given a readable
  loading notice; the decoration cannot be operated and does not move under a reduce-motion setting. No minimum display
  time delays a fast response. Already-read content is kept during a background refresh. While re-reading an
  already-read list, what stands on screen is only the 「새로고침」 button's spinner, and the same thing is not stood
  again as a phrase. That button is not pressable while running and its icon is hidden from assistive technology, so
  the read notice is put in a separate place not taking the screen. An extra page is shown only at the list's end, and
  an error is not turned into an empty result. A late answer of a detail fetch is not applied to another item. When an
  image's original ratio is unknown, only a representative size is reserved, so exact height matching is not
  guaranteed.

#### TODO 패널

- After login, the same TODO panel stands on the right of every page. Being in the common layout, moving pages keeps
  the open item, search and scroll state. On a narrow screen it becomes a drawer opened by each page's top-bar
  「TODO 열기」 button.
- **The panel's head stands at the page top bar's height**, taken from the same header-height token, so the two
  bottom borders are one straight line across the window. The token is 48px, for the top bar, the sidebar's head
  and this head alike.
- **The boundary to the page is one 1px line, the panel's own leading border**, drawn open and folded, in both themes.
  The page stands in a box of its own beside the panel, and is the last element of that box, so its own panel draws
  no trailing edge there and no second line stands beside the panel's. Dragging the
  edge lights that same line rather than drawing another.
- **The head is titled TODO**, with the count of open questions beside it in the warning colour while any stand, and the
  buttons at its right end. The counts stand on the state tabs rather than in the head: **대기**, **진행 중**, **결재 대기**,
  **보류** and **병합됨** each carry a badge of how many lines that state holds, and a tab whose state holds none carries
  no badge. 전체 and 완료 carry none — the first is the sum of the rest and the second only grows.
- **A line never pushes the panel sideways.** The title gives way and wraps however long it is, and the arrow at the
  line's end keeps its place.
- **Pressing a line stands that item's detail as a modal.** It does not spread inside the list — the panel is a
  fixed-width column and a line bears the whole of the original instruction, completion report, talk and buttons pressed
  on it, so spreading below the line pushes the rest of the queue off screen. So, like everything long in this console,
  on a wide screen it stands as a centred modal, on a narrow screen a sheet rising from the bottom, and however long it
  does not exceed the window and scrolls within. Closing is by the close button, an outside press, Esc and back, and
  whichever way it closes it passes the same place. What draws the modal is the one panel being looked at — on a narrow
  screen the side column floats too but is hidden by a class, and drawing both would stand two modals and one back would
  close neither.
- **A right press, or a held finger, on a line stands that item's menu.** It carries the line's quick acts, so they
  are done without opening it:
  1. **Job 로그** on a line a job is running for — that job's log, opened at once over the panel at its run and
     following it, the same log dialog a room's run line opens. A line no job runs for has nothing to show, so the
     entry is not there. A job that ended between the menu opening and the press answers with the message pill
     saying so; the line under the list is never the only answer. In the opened item the state mark at its head,
     실행 중 and the stage it names, is the same press: it opens that job's log over the item.
     - The job is the one the agency lists as starting or running for the item, read off each job's own state, so
       a list that answers more than it was asked for never hands the log a job that has ended.
  2. **승인** on a request waiting on them and not set aside.
  3. **보류** on a line not set aside, **보류 해제** on one that is. The hold takes no reason here; one with a reason is
     set from the opened item.
  4. **맨 위로** where the line stands in the queue behind another.
  5. **완료 처리** on a line no job is going on for, and not wound down or stopped (bmo-job's `docs/todo.md`, 「Closing」).
  6. **추가 지시** — a small centred dialog of one box and its send button, adding the same words the opened item's 추가 지시 adds.
  7. **결재 취소** on an approved line, or **버리기** on a request or a set-aside line — the acts that take something
     away, standing apart at the menu's end, and each asks once more before it goes. 결재 취소 asks as a step the
     line grows under its badges — the question, that the item leaves the queue and its work order launches no
     further step, then **취소** and **결재 취소**; 버리기, the one act here that cannot be taken back, asks in the
     message pill.
  - An act the line's state does not allow is not in the menu at all, and a finished or merged line opens no menu.
  - Every other act goes through the same road as the opened item's buttons, and what it did, or why it was
    refused, stands in the line under the list.
  - The hold is the console's one held finger (「A held finger」), so a finger scrolling the list never opens the menu,
    and the lift that follows a hold does not open the line as well.
- **The modal is built as a screen to read one item.** The list line's shape is not carried over — a line shape fitted to
  a narrow column only lines up cell by cell in a wide place. The head stands the number and title uncut, and one line
  below gathers where this item stands now: state, approval (approved or awaiting, and who asked), worker, model,
  co-work, priority. For an unfinished item the worker and co-work are cells changed right there, and for a finished item
  read-only tags. The body is two sets of tabs, in one order across both: 결과 (only where there is one), 상태,
  지시 and 요청 원문 on the left, 의논 and 관리 on the right.
  - **Left: 결과, 상태, 지시 and 요청 원문** — how the item ended, what became of it and what it says.
    - **결과** stands only on an item that carries a report or unfinished-items, and it is the first tab of
      the row. It holds every report bmo-job keeps of the item (bmo-job's `docs/api.md`, 「Reports」) — the closing
      one, **완료 보고**, first — the latest first where the item closed more than once — and after it the others, **진행 보고** and **보류 사유**, in the order they were
      written — and then the **미결** with its resolution. Each report is headed by its kind, the moment it was
      written and who wrote it, and every one of them stands at its whole length with no fold and no scroll of its
      own: a report is the item's account of itself, and a part of it put away behind a press is a part not read.
      The tab reads the reports again each time the item is opened and whenever the queue moves, so a report
      written while the dialog is open stands without reopening it. What is done about an unfinished-item stands inside the unfinished-item's own cell and under its
      words — the **미결 해소** box with its button while the note still stands, and **항목 세우기** under a line —
      because both are written about those words and a box on another tab is written blind. A resolved note carries
      when it was resolved and why under a line in the same cell, not in a cell of its own.
    - **요청 원문** is what this item is, in the request's own words. Not the instruction poured whole into one box but stood per part in its own cell:
      exchanged conversation, what the work is, conclusion, what to do. A line the chat agent filed itself stands the chat agent's judgement and
      source unfinished-items, a line filed from the console seeing unfinished-items stands the owner's words and source
      unfinished-items. The cell names are the instruction's own and the order is the one set for reading an item — the
      console, `--show` and the job prompt all stand the same order, so it is not an order this screen assigns itself, and
      an instruction written in any order stands in this order here. An old instruction not built in parts stands whole in
      one cell. The exchanged conversation stands in one cell with each word carrying who said it when, and that time reads
      as Seoul time like the console's other times. The cell stands at its whole length with no scroll of its own; the
      tab is the one scroll. The owner's approval comment stands at the end of this group, and after it **추가 지시**, the
      words added to the item, each with who said it and when, a 지우기 that takes one back, and the box 지시 사항 that
      adds one: what the chat agent reads and organizes, which no worker reads (bmo-job's `docs/todo.md`, 「Added words」).
    - **상태** stands the **실행 기록**, then the **작업 단계**, then what a job asked, then the **결재 기록**:
      every approval the item carries, newest first, each with the caller whose token gave it and when, and its kind
      (bmo-job's `docs/api.md`, 「Items」): a **결재**, an approver's, which is what lets the item's work begin, or a
      **추천**, the chat agent's word for it, which moves nothing and stands apart in its own colour so it is never
      read as the owner's. An approval taken back is gone from the item and from the record. The 실행 기록 always stands, saying which run is going if a job runs and that there is none yet if no job
      has run — an empty place saying nothing would leave the reader unable to tell no record from unread.
      While a job of the item runs, 상태 reads its job line again every few seconds and on every word the agency
      says of the job, so its time, its tool calls, its tokens and how far it has come move as they happen, and the
      작업 단계 move with every task that starts or ends, not only at a job's or a stage's end.
    - **지시** is what the work is told: the item's brief, the chat agent's organized instruction. The brief is written once, in
      the original a job reads, and stands in that original with its translation under it (「The original, and its
      translation under it」). Under it stand the chat agent's changes to it, each with when and whether the
      running job has been handed it; and the work order — its draft with 저장, or the order as it runs.
  - **The original, and its translation under it.** A text a worker or a job wrote is read in the language it was
    written in and in the reader's own: the brief and each change to it, the running work order's purpose and
    instruction, each report, and a co-work task's work order and result. Each stands as it was written, and under it,
    headed by the language it is in, its reading in the language the console speaks to its reader — 한국어 번역. The
    original is never hidden, folded or replaced by its reading, and nothing is pressed to read either.
    - **The road** is the gate's translating route, `POST /translations`, which the gate's `gate/translate` tool
      and a bundle's screens also take. The console asks it through a route of its own, `POST /api/translations`,
      on its own credential and for the reader's role, rather than through the relay: the relay judges a call by
      the page it came from, and the TODO dialog is the layout's, standing over a bundle's screen as much as over
      the console's own, where a call relayed from that page would be the bundle's and refused. A console that
      names no gate offers no reading.
    - **Each text is asked for once.** The gate keeps every translation it makes under its original and its
      language and answers a kept one without its translator, the tab keeps every whole reading for its life, and
      two places asking for the same text at once share the one ask. So reopening an item, or another item quoting the
      same words, asks the translator nothing again.
    - **It lands as it arrives.** While a reading is on its way, the place under the original says it is being
      translated; the reading stands the moment it comes, each text on its own, so a short text stands translated
      before a long one beside it. A text already in the reader's language takes no reading and stands alone.
    - **What did not come says so,** in one line under the original with **다시 요청**: a translator that refused
      or failed, or one still too busy after its waits. A reading the translator could not render every part of
      stands with a line saying that some parts stand in the original.
  - **Right: 의논 and 관리** — the talk about the item and what the owner does to it.
    - **의논** is the talk with the chat agent about the item. The talk takes the tab's whole height and the words box, the room's
      own box, attaches to the tab's bottom edge — with no turns yet, while they load and when they fail alike, the empty
      place above it takes the height; the talk drops to its end when a new word comes. The turns scroll on their own,
      and the column around them does not scroll.
    - **관리** is approval/order/hold/stop/discard. On an approval-awaiting line their first act is approve or discard, so those
      buttons are at the top. It carries nothing about an unfinished-item, which is written about where it is read. A
      merged line says which item carries it, and a finished line says in one line that nothing is left to do here.
      Its **결재 취소**, like its discard, asks once more in place: the button gives way to the question, what taking the
      approval back does, and the two answers.
      Every button of a group stands at that group's right, and a box of words has its button on
      the row under it. The lines between the parts of a group reach the group's own border.
  - Where the modal is too narrow for two columns the two sets stand as one row of tabs over one scroll, in the same
    order: 결과, 상태, 지시, 요청 원문, 의논, 관리. That row carries the tab names without their icons, so all six fit a
    phone's width rather than scrolling the last of them out of sight.
  - Opening an item selects **결과** where it stands and **상태** otherwise, in the left column and in the single row
    alike, and the right column opens on **의논**. The choice is made each time another item is opened, so an item
    that reaches its end while open keeps the tab being read.
  - The modal is a page of its own, so each action stands beside the section it acts on rather than in a common foot.
- **The co-work step dialog** opens from a stage or a sub-stage of the 작업 단계, and is the work view
  (「The work view」 under 「Agent screen」) of that stage's task: a head of the stage's own line, one scroll for the
  body and a foot fixed under it. It has no tab row: a stage of several tasks opens at the one pressed, each task
  being a sub-stage of the stepper, and the work order and the result stand one under the other.
  - A builder turn's result, which is JSON the bot reads, is laid out to read: a plan as its steps and their tasks —
    title, role, model and instruction — a list of things to build as its tasks, and any other JSON as its fields. The
    text as it was written stands whole under 원문, never folded. The JSON the bot reads is not changed.
  - A co-worker writes in English (bmo-job's `docs/work-orders.md`, 「Reading a co-worker's English on the console」),
    so the task's work order and its result each stand in the original with the translation under it (「The original,
    and its translation under it」). A builder turn's result is laid out from the original and its fields are not
    translated: what it holds is the bot's to read, and 원문 under it is the text as written.
  - The verbs the task's state takes — 지시 수정, 건너뛰기, 되돌리기, 다시 실행 — stand in the foot at its right end. What a
    verb asks for before it is sent stands at the end of the body, and the foot then holds 취소 and the verb's own button.
- **Ending a work order.** The work order's own buttons — 중지 and **지시서 종료** — stand at the right. 지시서 종료 asks for
  the 종료 사유 and then **남은 작업 건너뛰고 종료**.
- **작업 단계** is the work order's steps on the progress stepper (「The progress stepper」), drawn as a vertical stepper
  and never as a list, whether the order gives its stages to co-workers or to the one worker alone. An item with no
  work order of stages whose job laid out a plan of its own — the newest plan its latest job wrote with its plan tool,
  as the work view reads it (「The work view」 under 「Agent screen」) — stands that plan's steps on the same stepper,
  each with its state, read again every few seconds while the job runs (「실행 기록」 below); a step of it opens nothing, since the plan is
  the job's own work and its log is where it is read. A stage of the work order has a head of two
  lines per step. The first line holds the step's name and its co-worker types, which keep their width, then its
  title, which takes the rest and ends in an ellipsis, and at the right end the time it took, lined up down the list.
  The second holds the models, which take the free width and slide where they do not fit, then at the right end the
  progress as `n/m p%` for a step of more than one task. A step of several tasks holds them as its sub-stages, a line
  each, and pressing a step or a sub-stage opens the co-work step dialog at it.
- **Boxes grow with their text.** On a phone no box in the modal has a ceiling, so the modal's own scroll is never caught
  by a box; on a wide screen a box stops at a ceiling and scrolls inside, and the talk's box always does, since the talk
  above it must stay in view.
- What changes by width is how the tabs stand, and what stands is the same. In a sheet and a modal below 1024px the six
  tabs stand as one row over one scroll. From 1024px the modal uses nearly the whole window and the two sets stand as two
  columns, each with its own tab row and its own scroll, so a long instruction is read on the left while the talk stays
  in place on the right. When the chat agent rewrites the draft in talk, the work order on the left is seen changing beside it.
- The TODO is bmo-job's, read through its listings and its readings of an item (`docs/boundary.md`, 「Calls the console
  makes」), and here is where the owner handles those lines. Three groups stand top to bottom in this order.
  - **결재 대기** — the items in the `draft` state, requests another room's chat agent received from a room's person and filed,
    gather at the top. The only group asking the owner something, so first. Who asked in which room stands, and it does not enter the queue before approval.
  - **대기열** — approved unfinished items stand. With several workers this one line splits into per-worker lines to run, but
    what stands on screen is one list and each line's worker tag says which line it belongs to. **Every line a job is still going on for stands at the top** — 진행 중,
    중단 대기 중, 중지 중, 마무리 중 and 완료 보고 중 alike — and below them the rest by priority, then by item number for the
    same priority. Whether a job is still going on for a line is one judgement of the panel's, the same one that answers an
    item with an unfinished job line, so the pin, the 진행 중 filter and its badge never disagree about a line. Each line has a number, title and state;
    under the title stand the lines the row says in words, and its chips — the state, the model, the worker and every other tag —
    stand last, at the row's foot,
    and an item nobody has taken yet is **대기**, a running item **진행 중**, a work-order-stopped item **멈춤**. A stopped
    item does not leave the line but stands in its priority place, and standing first in its worker line it carries under its
    title, above its chips, the first line of the stop reason, the reason not yet resumed and the counted failure count — reading the bot's
    judgement as is and not guessing separately (bmo-job's `docs/work-orders.md`, 「A stopped work order's turn」). Which of 대기 and
    진행 중 is answered by the job — an item with an unfinished job line is 진행 중, and the state letters on the item are
    words a session writes by hand so are not asked. The number a person sees is the item number alone, so no job number
    stands anywhere. **A running line says which step of the work order is under way, by its name** — 진행 중 · 조사,
    진행 중 · 구현 1/4 (bmo-job's `docs/work-orders.md`, 「What a step is called」). Only a build step is counted, among the build
    steps alone: the to-dos synthesis set each run in turn, so which of them is under way is how far the work has come.
    The numerator is the step running now, and a skipped step counts as a passed place. A design step — 계획, 조사, 검토,
    설계 종합 — and 최종 검증 stand as their names alone: a stage's place among the stages says how the plan was cut, not how
    far the order came. A reopened work order carries which round in front. A single-session job that is not co-work has no count at all so stands
    as one **진행 중**. How many times an item was run is not progress but past history, so it does not stand on this tag and
    is read as the run count on the time line after it ends. This some/some is the one set of rules the bot reads from a work
    order, and the TODO panel, the running-run line, the home screen's worker cell and the in-progress board in the owner's private
    chat all use that one set. The panel re-reads each time the work order takes a step. An item with a set model attaches
    that model too. An item with an assigned worker attaches that worker name too — a line with no assignment stands no tag,
    and such a line is taken by the Built-in worker. An item to run as co-work carries a **협업** tag — standing only on
    lines turned on, and the rest run as one session. A job turns the item to complete then writes the report, so an item in
    between is complete while the job still runs, and that line is **완료 보고 중**. A reporting line stays at the top with
    the running ones, where it stood while running, until its job has ended; the 진행 중 filter shows it and its badge counts
    it. Being unfinished work its tag colour is like 진행 중's, and being a completed line it carries no drag handle, has no
    place in the order a drop saves, and opening it has no button to press.
  - **A running line says what its job is waiting on,** where the job marked a long wait (the agency's `docs/agent-control.md`, 「A
    job's own mark on a long wait」): one line under the title, above the chips, behind an hourglass, 「기다리는 중: <무엇> · <대상> ·
    <남은 시간>」, the target being 유닛 and its name or pid and its number, and the time left counted down the way
    every future time on the console is (「25분 남음」). Once the time it gave has passed the last part says 「예상 시각
    넘김」 and the line turns the warning colour. A mark whose target has gone is not shown. While a backlog deployment
    holds the queue waiting for jobs to end, each item whose job it waits on carries one more line under it behind a rocket,
    「이 Job이 끝나면 배포가 올라감」, so the paused queue reads as waiting on named work. Both lines are part of the row, plain
    words with no hover or press of their own, and the row opens by its title like every other line of it. Both
    are searched like every other word on the row. bmo-job's readings carry neither the wait nor the deployment's wait on a
    row yet (`docs/boundary.md`, 「Gaps the console meets」), so neither line stands until they do.
  - **중단 대기 중** — an item held while a run of it is still going stands in the queue under this word, in the
    warning colour, until the run has ended (bmo-job's `docs/work-orders.md`). The 진행 중 filter shows it, since it is still
    running.
  - **중지 중** — an item the owner stopped whose runs are still ending stands in the queue under this word, in the
    warning colour, until they have; the 진행 중 filter shows it too. Once they have, it joins the hold group.
  - **재개 대기** — an item the owner wound down to be resumed later stands in the queue under this word, with its reason
    naming the condition, and under **마무리 중** while the run it wound down is still ending. It is held, but it is
    work they asked to have resumed rather than put away, so it is never hidden with the hold group.
  - **보류** — items set aside now. **Viewing all, this group is not seen at all** — being unseen is the whole of a hold.
    The only visible place is one hold chip, seen together when searching. The chip says why the item was set aside, and
    the kinds never share a word: **보류** for a plain hold, **중지** for an item the owner stopped mid-run, **실패로 보류**
    for an item the failure count set aside, and none of them is **재개 대기** (above). The opened item stands the kind beside the reason and the time. None of
    them is **멈춤**, which is a work order stopped in the queue and not held. Searching is deliberate looking, so hiding a
    matched line would have search lie about the table. So it is not forgotten: the 보류 tab's badge always says how many
    are held — unseen and gone differ.
  - **병합됨** — items merged into another unfinished item (bmo-job's `docs/todo.md`, 「The merge」). Like the hold group it is
    unseen when viewing all, and stands under its own chip and in a search; its tab's badge counts it apart from 보류. A line
    wears **#N에 병합됨** with a merge mark. The opened item's 상태 tab stands a 병합 card: on a merged item the item it
    went to, on the carrying item the items merged into it with 완료 or 병합됨 each, and every number opens that item —
    one further back than the finished page in hand is read on its own, so the link never lands on nothing. Nothing acts on
    a merged item: the 관리 tab says only which item carries it, and no words are added to it. Once the carrying item is
    finished, the merged ones are finished with it and stand among the 완료 with a **#N에 병합** line.
  - **완료** — items whose report is done. Completion is marking not deleting, so what has been done stays here.
    - **The most recently filed stands first,** by item number, highest first: bmo-job's lines carry no moment an item
      was closed, and the number is the order items were filed in.
    - **The server sorts it,** so the page in hand and every 더 보기 after it continue one order, and a search
      narrows that order without rearranging it.
    - If bmo-job keeps a report of the item, that line stands a document mark, and with more than one report it
      carries how many; the mark's tooltip names them by kind. The board reads the reports of each finished and held
      item it hands over, and keeps what it read for an item for a minute while the item is unchanged, so a page read
      again in that minute asks bmo-job nothing more of them (`docs/boundary.md`, 「Gaps the console meets」). If it
      left unfinished-items
      a **미결** tag — telling which line left its own story without opening. A resolved unfinished-item reads as
      **미결 해소**, told apart at a glance from what remains. An unfinished-item whose branches were each stood as their
      own line resolves on its own the moment those lines all finish, so the resolution reason standing here reads
      「이 미결에서 세운 줄이 전부 끝나서 해소됐습니다」 and names by number and title which lines did. So there is no
      resolving a line-stood unfinished-item by hand. The resolution box stays, since an unfinished-item nobody stood as a
      line must be resolved by the reader, and even with lines left the owner can close it by their judgement. Conversely,
      standing one more branch from an already-resolved unfinished-item returns it to unfinished — a line nobody did came
      from that unfinished-item, so the same rule reads it so.
- **Auto-progress stops and resumes in the panel header.** At the right of the header, beside reread, stands a button, and
  pressing stops the machine moving on to the next item: the chat agent is told of no waiting queue and launches nothing. While stopped a band stands below the header saying 자동 진행 일시정지, with the
  resume button in that band. When the panel is folded the vertical band's text says the pause too — a folded screen not knowing it is
  stopped is the worst this switch can do. What stops is only the moving on: the queue's lines, approval and order stand as is,
  and a job and a co-work stage already running run to the end. Pressing goes to bmo-job like this screen's other
  writes, and the value the screen reads rides in the board the panel asks for anyway, read from bmo-job's holds; a press
  from another screen follows when the panel next reads.
  The state is bmo-job's so it stays when the service restarts, and bmo-job's command line, `bmo todo --pause` and
  `--resume`, holds the same switch. The switch is their pause alone: resuming never lets a deployment's hold go, and where one
  still stands the panel says so with what it waits for.
- **A deployment's hold stands in a band of its own.** While a backlog deployment holds the queue for a schema move older
  runners cannot survive (the testbed's `docs/deploy.md`), a band under the header reads what the title bar's mark reads — 「배포 대기 ·
  #1389 끝나면 올라감」 — and a folded panel carries the word too. Pressing the band opens the title bar's deployment
  popover, the one place the hold stands whole; the panel keeps no window of its own repeating it, and a panel standing
  as a drawer steps aside for the popover. The popover's 해제 button asks first in the message pill what letting it go does — the deployment deploys nothing and the commits
  stay waiting, since restarting now could break the jobs running across the restart — and then goes to bmo-job. The hold
  is read from bmo-job's holds with the board.
- **A line reads first by its tag colour.** Completion wears the finished colour, told at a glance from states beside it. 대기
  and 보류 are a neutral saying nothing, 진행 중 and 완료 보고 중 are the console's primary, and only 결재 대기 is a warning
  colour — the only line asking the owner something. And **a completed line reads at the same brightness as others** — a record of
  what was done, not to be dimmed.
- **The state tabs and the filter narrow the groups together.** The tabs under the search pick a state — 전체, 대기,
  진행 중, 결재 대기, 보류, 병합됨, 완료. Beside them a filter button opens a popover at every width, the panel being a
  narrow column wherever it stands, and it sets conditions on the table's own columns:
  - **워커** — the worker that does the line. A line with no assignment is the Built-in worker's, so picking that
    worker finds those lines too. The workers come from the agents table, with any other name a line still carries.
  - **미결** — a 미결 still standing, or one already resolved.
  - **협업** — lines run as co-work, or as one session.
  - **요청한 방** and **요청한 사람** — the room a request came from (or none) and the name it was filed under, out of
    what the table holds.
- **In a room made for companions the panel shows that room's items alone.** While such a room is the page, the
  panel stands narrowed to the items whose requesting room is that room — in a companion's room the ones it filed, in a room of several
  theirs and the chat agent's (the agency's `docs/companions.md`, 「Filing a TODO item」) — and the 요청한 방 condition is fixed to it and
  cannot be changed there. Leaving the room puts back the conditions the browser keeps, which
  the room never wrote over.
- **Conditions combine and go together with the search.** Every set condition narrows every group at once, and a
  search inside them finds only among what they left. The button shows how many are set, the popover's 「모두
  해제」 and the button beside the filter button drop them all in one press, and the choice is kept in this browser
  like the tab and the order.
- **A condition is applied on the server, to every line bmo-job lists, not to the lines in hand.** 완료 comes a page at
  a time, so narrowing only the page on screen would leave it thin; the page, its total and the unfinished groups all
  answer to the same conditions. The room a request came from is not on bmo-job's lines, so the room condition offers
  none to pick. Under a condition a group left empty does not stand, and the line under the search says how many
  matched. The lists a condition is picked from are read from the whole table and never narrowed, so a condition that
  empties the panel can still be changed.
- **The tab badges count the whole table,** or in a room made for companions the whole of that room's items. They are
  counted apart from whatever a search or a condition left on screen — a badge says how that state stands. 대기 and 진행 중 split the queue between them, a line held while its run
  still ends counting under 진행 중 where its filter shows it; a 완료 보고 중 line is finished and counts under neither.
  The folded strip keeps the whole count in one line, since it has no tabs.
- **Nothing drags under a condition or a search**, for the reason nothing drags under a state tab other than 대기: the
  lines between are hidden.
- **The tab, the order and the conditions are put back once the panel has mounted.** The server draws the defaults,
  and putting a kept choice back before hydration would leave the server's attributes — the filter button's name,
  the panel's width — standing on the page.
- **완료 appends as you go down.** Only this group grows endlessly, so it comes twenty at a time. Reaching the list end brings
  the next twenty, and when all came it says how many there were — so no confusion whether the list merely stopped or ended.
  The front two groups come whole. Those two are the work they hold now so the count is plain, and above all **a queue with a
  line missing cannot be dragged to order**.
- Asking the next group, the panel asks not for the next twenty but **whole for as far as skimmed so far**. A list read
  at once always agrees with itself front and back, but piling pages up would skip a line or stand it twice if some
  item turned to complete in between. This table is hundreds of lines so the cost of re-reading the front is cheaper than the
  cost of preventing that mismatch.
- **Search searches the whole table.** Searching only the loaded lines would change the answer by how far down you came, and
  that is no answer. It is the console's list search (「List search」): what a line shows — its `#number`, title, state word
  with its stage (`진행 중 · 단계 7/9`), model — the one its work ran on, by its short name and its whole one (「Model names where room is short」) — worker, `협업`, the 미결 badge, the requester line of a request waiting on
  them, the stopped and checkout lines — and what the item holds without showing it — the instruction, the completion report,
  the unfinished-items and the approval comment. The server reads each line's texts from the same list the panel draws its
  marks from, so the two never disagree about why a line was found. And **all three groups are searched** — searching only complete would find nothing when
  looking for work standing in the queue, and that is a trap. How many were found stands below the box summing the three
  groups. Found results append the same way, and clearing the search returns to the original list.
- **A fresh read does not throw away what was skimmed.** When the panel reads again — on bmo-job's notice that an
  item, a queue, a question, a work order or an item's talk moved, and on the catch-up read a reopened stream
  brings — what it asks is not the first twenty but as much
  as it already held, and the search term goes too. While a line is being dragged and
  while an order saves, appending waits too — a line growing below moves the ground under the dragging foot.
- **A running line is always at the top.** A running job's item stands at the front of the queue whatever its priority. What
  runs now is not to be found scrolling down the queue but seen the moment the panel opens. This top is not laid on the screen
  only but the order itself — dropping a line saves what stands on screen as is, so a screen-only top makes a place on screen
  the saved order cannot say, and from then the screen is not the order to save. Removing the handle under a filter
  prevents exactly that. Unless the owner drags a line, nothing in the table's priority changes because of this, and dragging saves
  the list they were looking at as is — the one taking rank 1 is a running line, and that line is not a candidate to assign while
  running and was at the front anyway when assigned. When the job ends that line leaves the queue and the rest stay in the order
  they gave. A 완료 보고 중 line does not count here.
- **Which worker does it is decided by opening the line.** Opening a line stands a worker-choosing cell in the modal head's tag
  line, and every worker on this machine stands in the list — the list is the agency's, so if the owner makes one more
  worker it stands here at once. Beside the chosen worker stands its repository path, since the name alone does not say where the
  work happens. Choosing **배정 없음** releases the assignment and that item becomes the Built-in worker's. This value is not a
  past record but a future assignment — it is what bmo-job reads on assigning, and the session launches the job on the worker it
  points at. Changing the assignment leaves the item's place, approval and rest unchanged.
- **Whether to run as co-work is set in the same modal.** Right behind the worker-choosing cell stands a switch — on, that item's
  job runs splitting branches; off, it runs as one session. Off is every worker's default, so a line nobody turned on is all one
  session. This too is not a past record but a future setting — it is read on launching a job, and turning it on or off moves the
  item's place, approval and rest not at all. A line turned on is told by its tag without opening.
- **A job failure is mended before the queue moves on.** the chat agent is told the job ended in an error, analyses it, runs the repair
  of its cause and then the failed item again; the item stays at the front of its line meanwhile. Failing to finish the same item
  three times, or a chain of repairs failing past its third round, drops it to the hold group as **실패로 보류** — not deleting or closing, so the line, place and record stay, and one hold-release button stands it again. Then the owner
  hears in their own room in one line which item dropped and why.
- **완료 보고 중 is bound by time.** Five minutes after being marked complete, whatever the job line, that item is complete and its
  line leaves the queue for the complete group. If the runner dies the job line stays unfinished, so without binding such an item
  would stand forever 완료 보고 중 in the queue. Five minutes is the same length as the grace the bot gives before considering a
  job's runner dead, and reporting actually takes less than half that. Whether the grace is up the panel measures by its own
  seconds clock, so that line finds its own place asking the archive nothing.
- **Job의 질문.** A job asks the owner what is hard to decide itself — hard to undo, or set by the owner's taste — and stands waiting the
  answer. A question awaiting an answer stands **inside the owner's private chat's conversation, right above their words box**. The conversation
  side, not the queue beside it, because a question is words handed to them — where their eye and hand already are when the bot asks
  them something, and that place is not pushed out however the conversation scrolls. The queue beside is a place to read work, not
  to exchange words. Which item asked, what it asks, the choices and which is recommended, one line why it cannot decide itself,
  and how much is left and what number it goes to if left, stand together. There are two roads to answer — press a choice, or write
  into the box an answer the choices do not hold. What the job reads is one line either way — a chosen one is that choice's words,
  a written one those words as is.
- **Choosing and sending are different presses.** Pressing a choice only chooses it, not sends. A chosen one stands in a full
  colour so what is on the line is read on screen, and the button below says by name what will be sent, like 「2번으로 답하기」. Only
  pressing that button sends. With nothing chosen the button stands 「답하기」 and is not pressable. It is split so because it cannot
  be undone — the bot writes the answer once on that line and refuses a second, so one wrong press is the end. On the other side one
  job stands stopped waiting that answer.
- Undoing has two roads too. Pressing a chosen choice again releases it, and 「선택 취소」 beside it releases it too. Writing
  anything in the write box releases a chosen one — the two are one answer and the bot refuses a body carrying both, so the screen
  keeps them from standing together. Conversely choosing a choice clears written words.
- **The deadline can be stopped.** A question has one minute on it. It keeps a job from standing long while the owner is not watching,
  but it is short for reading the choices slowly while watching. So beside the card's remaining time stands 「타이머 정지」. Pressing
  writes the time left then to the line and stops the clock, and the card and band say it is stopped. While stopped the recommendation
  is not adopted on its own — the deadline is measured by the job that asked, and the job follows the deadline that line says each time
  it reads it. Answering by number in Telegram, and choosing or writing in the console, stay open while stopped. 「타이머 재개」 counts
  again from the time left when stopped.
- **A stop has an end too.** Left stopped, the job stands holding its checkout's lock, and the next item bound to that checkout stands
  too. So a stop is up to 30 minutes. While stopped the card and band count the time left until the stop ends, and with no answer in
  it, it goes to the recommendation and the chat hears the stop got no answer and went to the recommendation. Resuming and stopping
  again puts 30 minutes on anew — pressing means they are at the screen, so each press is worth a new wait. Stopping and resuming, like an
  answer, are written by the bot on that line, and neither changes an already-decided question.
- The same question is aimed at by chat, console and time together. The three decide the same line with the same conditional write, so
  the first to reach stays and a later one overwrites nothing and hears what it was already decided by. A decided question stays with
  the item that asked and is read on opening that line. Answered by the owner, gone to the recommendation on no answer, and missed with nobody
  answering read differently at a glance.
- **There is one place to answer.** The queue beside keeps per item a record of what the question was and how it was decided, but it
  cannot be answered there. Two answering places would make two things to keep for one question, and which is real would split per
  screen. So the card stands once in the conversation and the queue only reads.
- The question is read with the queue. A job having asked one, and it being decided, are to the bot the same kind of notice that the
  queue moved, so a question stands on screen the moment it stands — a job stands stopped waiting on the other side so it must be at
  once. The time left its own seconds clock counts. The answer is written on that line through the bot after a send press. If a question
  awaits an answer, the panel header and the folded panel's vertical band say the count.
- **It is seen on whatever screen.** The card stands only on the owner's private chat's screen, so if only that screen said a question came, one on
  another screen would have no way to know. A question has one minute and with no answer goes to the recommendation, so passing it by
  unaware decides for the owner without the owner. So while a question awaits an answer, **one band stands at the top of every console screen.** The
  place the play bar stands and for the same reason — walking to another screen must not remove what happens on the other side.
- The band stands which item asked, what it asks, and **how much is left and what number it goes to if left**. The time left drops per
  second, and if stopped the fact that it is stopped and the time left until the stop ends stand — the deadline being the whole of this
  display, it cannot be done by a disappearing alert or an uncounting badge. Pressing the band goes to where that question stands, the
  owner's private chat. The card standing there ends it — where the band takes you and where you answer are one place. However many ways to notice,
  there is one place to answer. Making one more set of choices, reason and write box on the band would split the two.
- **With nothing to wait for, there is nothing.** The band exists only while a question awaits an answer. When the owner answered, or the
  deadline passed and it went to the recommendation, or it was missed with nobody answering, it disappears on the spot leaving no place.
  That is why it is not an ever-present obstruction — it stands only while a job really stands stopped on the other side, and then
  interrupting is right. If several wait, the nearest deadline stands on the band and the rest attach only as a count. The question list
  is read by the whole console as one — the band, card and panel see the same reading so the three cannot say different things.
- **Appending words to an item.** Opening a line stands the words appended to that item so far right above the talk place, and one more
  word is appended by the box below. A condition coming to mind an hour after work started always happens, and a word written here goes
  to the chat agent, never to a job: the bot wakes the chat agent with it, the chat agent folds what it asks into the item's brief, and a running job is handed only the chat agent's
  change, organized, in English, while a later job reads the new brief (bmo-job's `docs/todo.md`, 「Added words」). An appended word is one line and
  is never rewritten, and who appended it when stands per line. How many stands in the box header. A completed item stands no box. A word
  appended to work nobody will take again reaches nobody, and if there is something to say to such an item, reopen it and append. Writing
  an appended word is like every other change — the console asks and the bot writes.
- **Taking an appended word back.** Each standing word carries a 지우기 beside it, and the press asks once before it is done. The row is
  marked rather than struck off: the words stay in their own place on the screen, struck through and muted, with when they were taken back,
  and the header counts them apart from the ones still standing. What leaves is every later reading — the item read with `--show` and the
  brief the chat agent writes next — so a word taken back asks nothing of anybody again. What cannot leave is a run's own context: a change the chat agent has
  already handed a running job is in that run and no press reaches into it, so the confirmation on a word folded into such a change says
  exactly that before it is made: that a change carrying the word was already handed to a running job and stays in that run. Which
  changes carry a word is not recorded, so a word counts as possibly carried once any change of the chat agent's made after the word was added
  has been handed to a job, and also where the word itself carries a handing time of its own. The same road is a shell's too, its
  answer saying the same in the same case, and a word already taken back is not taken back a second time.
- The word-appending box stands right above the talk place because both are where they write on an open line, and above because a word
  written here attaches to the item as their words as is, while the talk is a conversation with the chat agent about the item. It stands off the words
  above it by the gap this modal keeps between its own sections rather than the one it keeps between two words said, or the place one more
  word is written into reads as one more word already said. The talk's own box stands off its turns the same way, for the same reason.
- **Talking about an item.** Opening a line opens that item's talk place too. The owner speaks here about the item — and about what is attached
  to it — and the chat agent answers. What it was told to do, what a job did, what it left, how a question was decided, whether it is still worth
  doing, and the like. And while an item is a draft, **the draft is kept edited here** as it is talked over. Exchanged words stay bound to
  that item, so reopening later reads that talk as is.
- **The chat agent itself answers.** Words said here enter the chat agent's conversation session — the very session receiving the owner's private chat — as one turn
  of the private chat. So it knows the talk exchanged about that item in the private chat and holds the private chat's rights and tools.
  But that turn is no room's turn. The answer goes to no Telegram room and returns only here, the output gate does not read it, and no
  room's window, read position or typing indicator moves. One session takes every room's turns in one line, so if the chat agent is answering in a
  room the talk turn runs after that turn ends. During a 휴식 상태 no turn is taken, and those words are marked answered-not because of the
  휴식 상태.
- A turn does not carry the item's record whole. The chat agent reads the item directly with its tools — to read the current shape after an earlier
  turn rewrote it. What a turn carries is which item (number, title, state), this place's rules, the last few turns of talk, the words just
  said. The last few turns are re-carried because a session forgets earlier turns when folded or newly opened, and the whole talk stays in
  the table.
- **The chat agent rewrites the item.** For an unfinished item with no running job it rewrites the title and the three parts the chat agent wrote on intake —
  what the work is, what to do, conclusion (the chat agent's judgement for a line it filed itself) — and if the work order is still a draft its intent
  and instruction too (`--edit`). The exchanged-conversation original, instruction original and source unfinished-items are transcribed
  words so are not edited. Editing the conclusion or to-do changes the work-order-draft field still saying the same thing, and a field
  written separately in the console is left. When the item changes the panel re-reads at once, so the body beside the talk shows what it now
  says. A finished item is a record of what was done so is not edited, and a running item runs on the words that job got so is not edited —
  adding a condition to such an item is done by an appended word when the owner asks. Approval, hold, discard and order are still their buttons, and
  the chat agent does them only when they tell it in talk.
- **The answer comes as a notice.** One turn can take minutes so the console does not hold the answer waiting. A sent word is written and
  stands the moment the bot receives it. While the chat agent writes an answer it stands so, and when the turn ends the bot flows a notice that that
  item's talk moved and the panel re-reads. A turn with no answer keeps only their word and writes nothing after — that word was really said,
  and there being no answer really happened. Why it did not come (휴식 상태, usage limit, API failure, just did not come) the bot holds and
  stands below that word. Sending again while answering an earlier word in one item is refused — a session that has not answered the first
  word at all would read the second.
- **The queue runs while talking too.** A talk turn is one turn of the chat agent's session, not a job. It takes no job lock, writes no job line, and
  is not caught by the "running job" that holds a checkout. So while auto-progress stands, the chat agent is told of a free worker and launches
  its next item even while the owner talks over one item.
- **It opens the same on an item with an unfinished-item too.** The talk place does not care about a line's state so it opens on a finished
  item and one with an unfinished-item too. The item the chat agent reads stands the **unfinished-item original whole** — an unfinished-item is a
  divider-less prose paragraph so several branches often mix in one paragraph, and pre-cutting the branches invents a structure not in the
  text. Reading the branches is what the talk does, so the paragraph is left and cutting is the reader's. An already-resolved unfinished-item
  stands, below the original, the reason it is no longer unfinished, so the chat agent does not speak of it as still remaining work.
- **What can be done after talking is right there.** Having talked over an unfinished-item, the owner has three acts — mark that unfinished-item
  resolved, stand a new item from it, or leave it. The former two stand as buttons in the unfinished-item cell. Resolve was there before, and
  **이 미결에서 항목 세우기** stands with it now. Writing the title and what to do stands that line as awaiting approval, and **the
  unfinished-item original attaches whole to the new item** — so a month later reading that line alone tells what it is. Standing it is not
  approval. It stands beside other requests awaiting the owner's approval. The original line changes nothing — the unfinished-item original stays on
  it and is not resolved. Standing stays after resolving too. Resolving says it is no longer remaining work, not that the text is gone, so
  noticing later while reading that one branch is still work, stand it then.
- **A source can be several.** One branch really does stay in two unfinished-items together — 126 came from 72 and 78 together, and 164 from
  87 and 88 together. The standing cell's **출처** line stands the item being viewed fixed, and beside it a chooser names other unfinished-items
  together. The choices are every item with an unresolved unfinished-item — whether in the loaded page or not, whatever is being searched.
  Another line pointing at the same work as the one being viewed is not a line they found. An already-resolved unfinished-item is not a choice.
  It is already sorted, and reopening it is done separately on that line. Chosen sources attach to the new line's instruction original each in
  its own block, and all those unfinished-items resolve together when this line and its sibling lines all finish.
- **The talk knows lines already stood.** The item the chat agent reads stands, below the unfinished-item, the lines already stood from it with their
  number, title and whether finished. Without it, it would say to stand a branch already a line again — the unfinished-item paragraph does not
  record what has already been stood. A link is a table fact so it is not read from prose but read and carried in.
- **After standing, go straight to that line.** If the guidance after standing said only the number, that line would have to be found in the
  awaiting-approval group. The guidance stands a link opening that line too, the very address a notification uses to open an item. Changing the
  address opens that line, so it opens even pressed with the console already open.
- This place is why an unfinished-item actually closes. An unfinished-item is resolved when every branch is done or each stood as its own line,
  and if the road to stand a branch as a line were only in the shell, that rule could not be followed in the console. Where to cut a branch a
  person decides — with no divider in the paragraph, only the reader can say which branch it is, so they write the title and content. A line
  stood here is their request. What they typed is the instruction original, and they are the requester.
- **Width and folding.** The panel's left edge is a handle. Dragging changes the width, and it does not get too narrow or too wide. Folding by
  the header button leaves one vertical band, and pressing that band unfolds it. Width and fold stay in that browser, so entering next it is as
  left — in the same place as the verdict chip setting or the cache siren's filters. A panel stood as a drawer has no width or fold. What is
  inside is as when it stands beside, and it closes by the header's close button or an outside press.
- **One line per border.** That line is drawn by the panel in front at its end — the same as the line splitting the sidebar and the screen, and
  the line splitting the code graph's sections — and the panel behind draws nothing at its head. Drawing one more where the front already drew
  puts two 1-pixels side by side reading as one twice-thick line. The line inside a handle is absent before dragging, and dragging stands it over
  that border colouring that line — not standing a new line beside it. The panel drawing its end is also only when something really stands behind.
  At a width where the panel does not stand, the panel is still a sibling, so otherwise one line dividing nothing would stay along the window edge.
- **Filter.** Below the search is the state filter, drawn as the component library's tabs in one row, with the
  conditions button at its right end. Choosing one — all, waiting, in progress, awaiting approval, held, complete — leaves
  only that state's lines. There is no chip for 완료 보고 중 — words worn briefly on the way out, not a list to stand and view,
  and that line stands in the queue viewing all. The lines always stand in queue order, the priority the owner assigned; there is
  no other sort. The chosen filter stays in that browser too. The queue's group is named 대기열.
- **A line is two columns.** The left column is the handle's own and every line keeps it, whether or not that line can be
  carried, so the number, title, state and everything else of every line start on one left edge. On a phone the item number
  stands on a line of its own above the title, so the title has the width. A line's state tag wears the state's mark beside
  its word.
- **Drag to reorder.** A line waiting in the queue carries a handle in that left column. Grabbing the handle and placing over another line goes to that
  place — dragging up stands before the placed line, down after it. Mouse, pen or finger grabs by one thing, so it drags by hand on phone and
  tablet too. Only **대기** lines carry a handle. A running line is already launched work so its standing place decides nothing, a 완료 보고 중 line
  is finished work standing in the queue while the report goes out, and a complete line and an awaiting-approval line are not in the queue in the
  first place — an unapproved request has no place in the order until approval. The arrow buttons in the modal stay. That is the same by keyboard,
  and drag is not on a keyboard.
- **The only place to drag is the one handle.** Pressing elsewhere on a line does not drag but opens that item's modal, and a finger sweeping
  outside the handle scrolls the panel like any list. Only a finger starting on the handle lifts a line without scrolling. Pressing and releasing
  in place is not a drag — a line lifts only on the slightest move, so tapping the handle saves nothing. While a line is lifted the dragged line
  stands a dim dotted line, and the drop place a thick border.
- **When there is no drag at all.** A handle stands only under the 전체 or the 대기 tab, with no condition and no search.
  The 대기 tab hides only the lines that are not waiting — a running line, which the order pins to the front whatever is
  saved, and a 완료 보고 중 line, which the order leaves out — so every line an order could move is on screen, and what is
  saved is still the whole queue, the hidden lines included. Under any other tab, a condition or a search the lines between
  are hidden, so a line nobody saw would be quietly moved; then no handle stands, and nothing says why.
- **What is saved is the whole queue.** On dropping the screen turns to the new order, and to the bot goes not "moved to nth" but the whole story
  that the queue is now this order. The bot first checks that order is its current queue — the same count with the same items and no overlap.
  Otherwise the queue moved in between so it is not written but refused, and the screen returns the line to its place and says so. An old order never
  overwrites the table. An accepted order is renumbered 1, 2, 3… from the queue front — the very value system other buttons and scripts use, and it
  touches nothing outside the queue. While a line is being dragged and while an order saves, whoever asks that reading waits, and the moment the hand
  releases one held-back read goes out.
- **Hold is an axis apart from approval and completion.** Awaiting approval is not yet approved, and hold is decided-not-now. So an approved queue
  item and an awaiting-approval request can both be held — both are things one can say not now to. A completed item has nothing to defer so is
  refused. On holding, the line leaves both the queue and awaiting-approval for the hold group. Approval and priority stay. A held item can be deleted
  too from that item's modal by **버리기 → 정말 버리기**. There is no need to release the hold first regardless of approval, and cancelling at the
  confirm step leaves it.
- **The bot never assigns a held item.** It drops from the very list the queue reads on choosing the next, not filtered after choosing. Priority is
  untouched so releasing a hold returns it to its original place — one at the front returns to the front. An already-running job a hold does not stop.
  What a hold blocks is being assigned next.
- **Stopping is the hold that also ends what runs.** While an item is running, or its work order is under way, the 관리 group stands
  a **중지** row above 보류: a reason box with the button beside it. The reason is required — the button stays disabled until a line is written — since a stop cuts
  work in flight and the reason is what the item carries until it is taken up. Pressing sends the stop through the bot's control API
  (bmo-job's `docs/work-orders.md`, 「the owner stops an item now」): the runs end, finished work stays, and the item is held as **중지**. The item comes back by the
  same **보류 해제** as any hold, and its work order then resumes from the interrupted tasks.
- **A reason is taken but not required.** Resolving an unfinished-item requires one line — that being the whole record of why it is no longer
  unfinished. A hold differs. It is reversible, and most setting-aside has no reason worth a sentence. Requiring one line each time only piles up
  lines nobody means. Written, it stays, and releasing the hold clears it with the state.
- **Nothing is placed above a running line.** Placing over a running line or where it would be above it stands the line right below the running line —
  the highest a waiting line can stand. The saved order gets the same top applied, so wherever it was aimed, the list on screen and the list to the bot
  are one.
- **A 완료 보고 중 line is not renumbered.** It is finished work so not the queue, and saving the order keeps its own number. After the queue is
  renumbered from 1 the place its number points at differs so the line may shift a few rows, and it is left. Its standing place decides nothing — the
  완료 보고 중 tag says what it is, and no handle or arrow attaches — because pinning it somewhere would push it off the place it ran the job during the
  ordinary minutes when the order is not changed. Keeping that place is why the 완료 보고 중 state exists. In minutes that line drops to complete.
- Pressing a line stands that item's instruction in the modal's 지시 group. An item filed from conversation is four pieces — exchanged conversation,
  what the work is, conclusion, what to do — with the front conversation as the owner's words and the chat agent's answer at intake, the other three written by the chat agent in
  its own words at intake. Each piece its own cell, and every cell stands at its whole length; the tab is the one scroll. A line the chat agent filed by its own judgement stands judgement and source unfinished-items, so not four pieces. What can be done stands in
  that modal's 관리 group. On an awaiting-approval line, **승인** or **버리기**. On a queue line, **맨 위로**, a move up or down,
  **맨 아래로** — behind every other line of the queue, the rest keeping their numbers — taking the approval back, or
  editing and saving the 결재 의견 attached to it. On a completed line only its unfinished-item is acted on. All go through the bot's control API so the bot
  always writes the table, and approval happens only in the owner's place. That intake is not approval, and that a room's chat agent cannot approve, this panel does
  not weaken.
- **An item waits on approval while its state is `draft`, and only then.** The item's state is the job service's word on
  whether its work may begin (bmo-job's `docs/api.md`, 「States and moves」): a `draft` stands among 결재 대기, and an item in any
  other state is past approval — in the queue, running, held or ended. An item raised with an unattended label opens at once
  with no approval recorded (bmo-job's `docs/api.md`, 「Unattended labels」), so it stands in the queue and its line reads 결재 없이
  열림 rather than 결재됨. The approvals an item carries say who approved or recommended it and nothing more: an
  approval of the `approval` kind, which the console's own caller gives — the console sends an approval with no name of its own,
  since who gives it is the caller its token names (bmo-job's `docs/api.md`, 「Items」) — is what moves a `draft` to `open`, and
  its line then reads 결재됨. A draft carrying only the chat agent's **추천** still waits on the owner among 결재 대기, its line
  saying it is recommended, and the owner's 결재 still decides it.
- **Approval makes the queue re-examined.** Putting an item in the queue is approval, so where approved the bot re-examines the queue and if no job is
  running assigns the front item there. A job's launching is grounded on that assignment alone, and a chat session cannot launch unassigned work.
  Reversing approval removes the item from the queue so it assigns nothing.
- **Un-approval does not delete.** Only approval is released so that line leaves the queue for awaiting-approval. The one thing that removes an item from
  the table is **버리기**, and discard asks once more after pressing — a line whose approval was reversed stands right beside the discard button, so a step
  is put in so reversing does not delete. Reversing asks once more too, in the opened item as in the line's menu, since an item that leaves the queue
  stops its work order between steps.
- **Approval comment.** On approving, the owner can attach a word. A request for extra work or a question, written in the box beside the approve button, is
  stored with the item. Opening the item stands that word below the instruction original, and when the item is assigned the chat agent in the owner's private chat gets that word too. On
  launching the job that word rides the prompt as is, and the job answers it in the report — a question getting no answer is worse than no question.
- An already-approved line has the same box, so a comment can be edited and saved without reversing approval. Saving that box empty clears what was
  written. A comment rides a job when a job is launched for that item, so a word written on an already-running item does not reach that job and rides the
  next run — written so on the line. An item with a comment shows a mark on the list line too, so a line with a word attached is known without opening.
- **완료 보고와 미결.** A job, finishing and closing the item, writes with it how it completed and what it left unfinished. The same text as the report to
  the room, stored whole uncut. Opening a line that carries either stands the **결과** tab first and selected, with each report and the **미결** each in its own cell. So long after the report
  flowed by, opening one item reads how it ended and what remained. An item with no such record is an old item closed before jobs were asked to report,
  and it is not backfilled.
- In the 상태 tab, the **실행 기록** cell stands how long the work took as a bar. What it counts is read from the agency's jobs
  of the item on its worker (its `GET /jobs`), as the dialog opens and every few seconds while a job of it runs: how many ran
  it, their time, and, from the latest job's own lines, the road it answered on and the plan it laid out. The time of every job that carried this item summed stands at the top,
  and an item run twice or more attaches how many times beside it. A failed attempt is time the item paid so it is summed too, and a still-running job is
  counted as none — while running, one line attaches which run is going. An item with no job run stands one line that no job has run yet, and an item run
  before spans were recorded stands only the total time with no bar below.
- The bar is two. **구간** is wait, prepare, the agent's run and wrap-up lined in the order the job passes them; the run is
  named by who ran it and on which road — the item's worker, or 기본 워커 where it names none, and the provider and model
  its work last went out on (`<worker> · <provider>/<model> 실행`), 에이전트 실행 before any run went out. Those four divide the item's time with nothing
  left so the width is the share as seen. A span too short to read drops from the legend and the bar leaving its place empty — the dropped share dropped
  from the whole too, so the remaining spans' width is still each's share of the item's whole time. **`<worker> · <road>` 실행 중 도구별 시간**
  (에이전트 실행 중 도구별 시간 before any run went out) is where time went inside it —
  tools and branches lined longest-first to five with the rest folded into one "기타 N가지". This side counts things run side by side overlapping so it is
  each's share of each other, not the job's whole, said in a smaller line under the bar's title. So the legend writes time not proportion — a proportion putting the sum of
  overlap-counted things at 100 is not true. A tool called several times attaches how many, and a branch reporting tokens stands them after the time.
- Names stand as human-readable words, not the CLI's calling name. A tool by its Korean name, an MCP tool by which server's what tool, a Claude workflow's
  branch by what it was doing and on which model. The time waiting on branches does not stand when those branches stand together — it would count the same
  time once more under a name saying nothing. In an item with no branch to wait on in the list, that time stands with its own name.
- The place to spread every attempt and what a job spent on what is not the screen but `bmo todo --show <id>`. There too names read as the same
  words and the rule dropping branch-wait time from the list is the same. But above that list stand three lines not on screen — the Claude run split into
  branch-wait time, own-tool-call time and model time. The third being the remainder of the first two, the three summed make that span, and that is all it
  promises — side-by-side calls each count their own seconds, so the overlap drops not from the two but from the model's share. In an unsplittable job — one
  run before spans were recorded, or one where side-by-side calls sum longer than the span they sat in — nothing, not 0, stands.
- **미결 해소.** The unfinished-item cell has a place to resolve it too. Writing one line why it is no longer remaining work and pressing **미결 해소** stands,
  below, when it was resolved and that one line, with not a character of what the job wrote erased. A resolved line reads **미결 해소** even standing in the list.
- Resolution is per item. An unfinished-item is prose so marking one passage inside it would invent a structure not in the text. Instead the way of writing
  fills that — if one passage of an unfinished-item is still real work, stand that passage as an item, and when every passage of a text is done or stood as its
  own item, resolve the whole text. An item with no unfinished-item and an already-resolved one the bot refuses, so nothing is overwritten and the screen says
  why not. Closing an item with another unfinished-item makes it a new one so the earlier resolution disappears with it.
- **A new item is not made here.** An item's worth is in the instruction original, and that original comes only from the conversation the owner had with the chat agent in their private chat. Putting an input box in the panel would make a line with no such conversation. New work is spoken in the owner's private chat's input box, and the chat agent files it as the
  original.
- The panel is updated by the events the bot flows. On one word that the queue moved, it re-reads the queue and questions together, and with them the
  open item's 추가 지시 and an item opened from a link beyond the page, since either can be what moved. Not only when the bot changes the table — a side
  that wrote straight to the archive also says one word to the bot after writing, so a change outside the bot rides the same word: a room filing a new
  request, the chat agent approving, holding, releasing or adding words to an item, a job launched on an item, a runner handing the chat agent's change to the job
  running it, and a job turning an item complete. A re-read the word sets off draws over what stands without blanking it first, so a list or a detail
  that did not change does not flicker.

### Settings

The settings are one large dialog over whatever screen is open, opened by 설정 in the user menu at the
sidebar's foot (「Sidebar」). They are no screen of their own: `/account` takes the reader home with the
dialog open at 계정.

- **The dialog is a list of sections and the open section beside it.** The list stands in a column at
  the dialog's left under the title 설정, each section one line of an icon and its name; the open one
  is marked. The section's own name heads the right, with the dialog's close mark at its right end,
  and its content scrolls under it.
  - The sections are 계정, 테마, 대화방, 알림 and 보이스브리핑. A member is shown 계정, 테마 and 대화방; 알림
    and 보이스브리핑 are the administrator's.
  - A section's content stands in groups under small headings, each group a column of rows parted by
    hairlines. A row carries its name and, where the name needs it, one muted line under it at the
    left, and its control at the right: a choice of two or three a segmented control, a longer one a
    list, an on-off a switch, an action a button. A row whose control does not fit beside its name
    puts the control under it, at the right.
  - Everything in it takes effect as it is changed: a choice, a switch. Nothing
    waits for a save, and the dialog closes at once. The one form, the name and the password, is a
    dialog of its own opened from 계정, with its own 저장 at its foot.
- **On a narrow screen the dialog fills the screen** and opens on the list of sections alone, over the
  sidebar drawer it was opened from (「Floating things」). A tap on one goes into it: the head then carries
  a back arrow before the section's name, and the arrow or the back gesture returns to the list. The close mark stands at the head's right end on both.
- **An address opens it at one section:** `?settings=` and a section's key — `account`, `theme`,
  `palette`, `notifications`, `briefing` — on any address of the console opens the dialog at that
  section, gone into on a narrow screen, and at the first section the reader may open where the key
  names none of them. The key is taken off the address as the dialog opens: what is open over a screen
  is not a place (「Floating things」), so the back gesture closes the dialog, or leaves the section on a
  narrow screen, and the page stays where it was. Opened from the user menu it starts at 계정, and on a
  narrow screen at the list.

#### 계정

- **로그인 정보** carries the account's name as its line and 변경, which opens the form: the current
  password, the new name and the new password, which may be left empty. The current password must be
  entered for either change, and 저장 is open only while the name or the password differs; closing
  with a change asks first (「Forms」).
- A changed name takes everything the account holds with it — the devices it rings, the phones that
  play its briefings, the tabs each screen stands with, its questions on the gate screen, its theme and
  its palette.

#### 테마

- **화면 모드** chooses 시스템, 밝게 or 어둡게 for this browser, the same choice the user menu offers.
- **테마** is the account's theme (「Themes」), chosen from a list, each item its name after two dots of
  its colours in the screen mode being read: the accent and the raised grey. A choice takes effect on
  the whole console at once and is kept against the account as it is made.
- **미리보기** draws the theme on a small piece of the console in its own box: a primary and a neutral
  button, a field, a switch, a badge, a link and muted letters, on the page's ground. It stands in the theme chosen or, while the list is open, in the one under the pointer or the
  keyboard. 밝게 and 어둡게 beside its name draw it in either mode without changing the console's own,
  and it starts in the mode being read. It is a picture of the colours: nothing in it is pressed.
- **초기화** goes back to 청록.

#### 대화방

- **팔레트** is the account's palette (「Palettes」), chosen from a list, each item its name after two
  dots of its grounds in the screen mode being read: the owner's and everyone else's. Its line under
  the name is 대화방 색. One choice changes the bubbles at once, and nothing else, and is kept against
  the account as it is made.
- **미리보기** is a short conversation drawn by the room screen's own runs and bubbles: two of the
  reader's own, each with its time and send check, and two of the chat agent's, carrying a link, a short code
  block, a chip and a passing verdict mark. It stands in the palette chosen or, while the list is open,
  in the one under the pointer or the keyboard, under the account's theme; the list closing hands it
  back to the palette chosen, whatever the focus lands on as it closes. 밝게 and 어둡게 beside its
  name work as the theme's preview's do.
- **초기화** goes back to 청록.

#### 알림

- The device's push notifications (「Notifications」): while this device is not subscribed, one row
  says so with 알림 받기. Once it is, each kind is a row with its name, its note and a switch, taking
  effect as it is switched, and 테스트 발송 and 알림 끄기 stand under them. The account's other devices
  follow, each a row with when it subscribed and what it hears, and 알림 끄기 for that device.

#### 보이스브리핑

- The voice briefing's two switches, the receiver's (its `docs/api.md`, `GET`/`PUT /voice-briefing`): **전체
  보이스브리핑**, whether anything is spoken at all, and **플레이어에 표시**, whether a summary comes to the
  console's player as it ends, where it waits for a press. Each is set on its own as it is pressed, and stays
  switchable while the other is off. A switch the receiver refused springs back, and the refusal stands under the
  section in one line.
- **The player, placed and tried** (「Messages」, the briefing's player). **위치** chooses 왼쪽 or 오른쪽 and **높이**
  the height in pixels from the top of the page area, a number box with px after it that stands empty, holding
  기본값, where the player keeps its first place — as low as the page area lets it, above whatever bar stands at
  the screen's foot. Both are this viewer's, kept in this browser beside the place a drag leaves the player at, and
  are where the player stands when it next shows; each takes effect as it is changed. **초기화** puts the player
  back at its first place.
  - **들어보기** brings the trial voice — about a minute of the chat agent's voice, shipped with the console as a
    file, so nothing is synthesised at the press — to the same player, where it waits for the play press as a
    briefing does, so how it comes out, swells with the voice, is dragged and goes can be watched at any time; the
    button reads **정지** while it stands and takes it down.
  - The trial is this tab's alone: no other tab hears of it and nothing keeps it. Pressed while a briefing plays,
    it waits behind it as another briefing would, and the player's press during it leads back to the screen it
    was tried on, with the settings open at 보이스브리핑.

### Messages

- **The console says everything it has to say in one place.** A notice of something that arrived, the word that an
  action went through or did not, and the question a press that cannot be taken back asks first all stand on one
  pill at the top of the screen, centred. There is no second road: the component library's own toaster is not stood
  up at all, and the browser's own dialogs are not used, so nothing can speak into a corner nobody watches. A test
  sweeps the console's files for either and fails on one.
- **It is a pill of one radius at every size.** With a line to say it stands as a narrow line; with a description or
  something to press under it, it widens into a card of the same rounding. It is measured and given that size rather
  than told to fit its content, so it moves between one shape and the next instead of jumping.
- **It unfolds from its own centre.** It comes out of no place in particular, so it does not grow out of one: it opens
  sideways from its exact middle, from no width to its full width, and folds back the same way as it goes. Only what
  it says fades, never the pill. What it says is laid out at its full width from the first frame, so while the pill
  is still narrower the words are hidden past its edge rather than cut short, scrolled or wrapped again. A reader who
  asked for less movement is given none of it: it stands at once and goes at once.
- **The whole of it is the press.** Where the notice leads somewhere — a conversation, an item, a room — pressing its
  words, its line or its mark goes there, and there is no button to find. Where it leads nowhere the press is how a
  reader is rid of it before its time is up. A press it offers besides that, such as taking back something already
  done, is a button of its own inside it.
- **One stands and the rest wait.** Several pieces of news arriving together do not stack into a column, because a
  column of them covers the screen they are reporting on. The one standing carries how many are behind it, and the
  next takes its place the moment it goes, so the pill morphs from one to the next rather than going away and coming
  back. The same thing said twice replaces itself where it stands. The line is held to five, and what is dropped is
  its oldest end.
- **A question holds the island until it is answered.** Its words are not a press, it has no time of its own, and it
  takes the pill at once from whatever notice was standing, which goes to the head of the line. The back gesture
  takes it back the way it takes back everything drawn over the screen; a notice is not registered that way, since a
  notice goes on its own and a press of back spent on one is a press the reader has to make twice. A question asked
  while the page is already being left takes no entry of its own: it is holding that navigation, and the navigation
  moves the history itself.
- **A voice briefing playing is not news and does not stand on it.** It stands as a small player of its own,
  floating over the page area the way a picture-in-picture window does, while the island goes on carrying the news
  beside it. The layout holds it, so it stays as the reader moves between screens, and it stands over everything the
  screen draws — its lists, its toolbars, a room's input bar — while a dialog or a drawer opened over the screen
  covers it like the rest.
  - **What it shows:** its press — the visualiser moving with the sound while it plays, a play mark in its place while
    it waits for a press — then the briefing's title over a thin bar of how far the sound has played, and
    **그만듣기**, its close mark. The press pauses a sound playing and plays one waiting; the title leads to the
    line the briefing speaks, in its room, and leaves it playing. The player names itself 보이스브리핑 to assistive
    technology, and each press names itself in a tooltip.
  - **Where it stands:** at first at the bottom right of the page area, on the content's gutter, above whatever
    bar stands at the screen's foot — a room's input bar, the remote screen's row of keys, any bar a screen marks
    as its foot (bmo-ui's `docs/console-bundles.md`, 「How a bundle mounts」) — so nothing it covers by default is
    a bar a screen acts from; it reads that bar again while it stands, so one that grows lifts it. It is moved by dragging it with a mouse or a finger: it follows the pointer and cannot leave the page
    area, staying on the gutter at each side and at the foot, below the screen's title row at the top and above
    its foot's bar; let go, it settles on the nearer side, left or right, at the height it was let go at, and a
    quick throw toward one side settles it there. A press that moves less than a few pixels is a press, and a drag
    never presses what it started on.
  - **Where it was left is kept in this browser** — the side and the height — across briefings and reloads; a
    page area too short for the height kept shows it as low as it allows without losing the height kept for a
    taller one, and one never dragged stands at its first place.
  - **It comes and goes from its own middle,** growing out of its centre a little past its size and back, and
    shrinking back into it, with no fade; a reader who asked for less movement sees it appear and go at once.
  - **Back stops it,** as Back puts away anything floating over the screen (「Floating things」): the press that
    would have left the page ends the briefing playing and every one waiting, as 그만듣기 does.
  - **Nothing plays by itself.** What comes to the player is what the voice engine's stream says has ended (its
    `docs/boundary-api.md`, 「Events」, 「Briefings」): a `briefing.ended` of a `summary`, `done`, whose `plays`
    holds. It stands in the player waiting for the reader's press on play — on opening, on a page loading, on a tab
    coming back from the background, and behind another that has ended alike. One that ended more than half an
    hour before — a stream handing back what it kept — is left to its line; a full reading never comes to the
    player, and one whose `plays` does not hold is left to its line. The settings' trial voice comes the same way.
  - **Played to its end, it goes.** Once a briefing has played to its end the player stays a moment, then goes,
    and the next one waiting comes to it; one the reader paused or moved along while it played, or played again in
    that moment, stays, at its end, until it is closed.
  - **One after another.** A briefing that arrives while another plays waits behind it and plays once it has
    ended, after a short pause. **그만듣기**, the close mark, ends the one playing and every one waiting in this
    tab; a briefing this browser has played or stopped is not played again when the stream hands it back.
  - **One tab plays.** Several console tabs in one browser agree among themselves which one plays — the tab being
    looked at first, then one merely shown, then a hidden one — so a briefing is heard once per browser.
  - **While it plays its surface swells a little with the sound,** the surface alone, so a press aimed at it never
    misses; a reader who asked for less movement is given it still. A sound refused by a browser that will not
    start one nobody pressed for waits for the press. Starting a briefing pauses any other sound playing on the
    screen.
- **Its surface is fixed dark in both themes**, so the text and the marks on it are fixed with it rather than left
  to the theme's own colours. The tone is carried by the mark alone — a note, something gone through, a warning,
  something gone wrong — and never by the whole surface.
- **Where it stands.** Over everything else on the screen, which is what a notice under a dialog would not be; it is
  drawn into the page's body beside what the component library floats there, since the console's own root is an
  isolated stacking context and a number alone would not lift it. It follows the same offset the shell is laid out
  from, so a browser pushing its page up to reveal a focused box does not carry it off the top, and it keeps clear
  of whatever a device puts at the top of its own screen. On a phone it stands inside the panel's own gutter, and
  while it stands it is over the screen's own title row.
- **What is not this.** A confirmation that belongs to the row or the item it acts on stays where that item is, as a
  step the row grows rather than a thing floating over the screen — the question at the top says nothing about which
  row it is about. A form's own refusal stays in the form, beside the field that was refused. Both are states of a
  screen rather than news.

### Forms

- **A form saves once, from its foot.** A dialog or a page that edits stored values carries one 저장,
  in the footer at its bottom that stays put while the body scrolls. No section, field, list or switch
  inside it saves on its own: what is changed is held in the form until 저장 sends every changed value
  together, and a dialog closes once its save has gone through.
- **저장 is on only while something differs** from what is saved; with nothing changed it stands
  disabled.
- **저장 saves at once.** No question stands between the press and the save, whatever the save sets off;
  what a field's change sets off — a room's session starting afresh, an engine loading another model —
  is said beside that field before the press.
- **A save that went through is what is saved from then on.** The form takes what the bot answered as
  its new saved values, every field it sent among them, so the form holds no change the moment the
  save is done: 저장 goes back to disabled, and closing or leaving asks nothing.
- **Leaving with changes asks first.** Closing a dialog whose form holds changes — its close button,
  Esc, a press outside, the back gesture — and leaving a page or a tab that holds them ask in the
  message pill whether to throw them away: 버리기 drops them and goes, 취소 stays with them. With
  nothing changed it goes at once.
- **A refused save keeps every change as written,** with the reason under the field it names. A save
  that goes to the bot by several paths stops at the first refusal, and what went through before it
  stands as saved.
- **A text box of a form grows with its text and never scrolls inside,** at every width: the dialog's
  or the page's body is the one scroll. The box is measured again whenever its width changes as well
  as its text — a scrollbar coming up beside it, the window resized, a webfont landing — so text
  wrapped onto more lines never leaves it short, and growing moves neither the scroll around it nor
  the caret off the screen. `GrowingTextarea` is that box, once for every form. Only an input pinned
  outside a scroll — a conversation's box under its messages, the query box above its results —
  stops at a height and scrolls inside past it, and on a phone not even that.
- **A number box stands as wide as the values it takes,** with its unit, where it has one, after it
  rather than over it. Every number the console takes is typed in one, a form's field and a cell's
  dropdown alike, and each carries its two step buttons, each naming itself in a tooltip.
  - On a wide screen the two stand stacked at its trailing end, an up arrow over a down arrow, each
    half the box's height: Nuxt UI's vertical number field with its own arrows.
  - On a narrow screen, the width the console calls a phone at, they stand at its two ends, − at its
    leading end and + at its trailing end, the value centred between them: Nuxt UI's horizontal
    number field with its own − and +.
  - On a touch screen the box is taller and the buttons wider, so each is 24px or more.
  - `NumberInput` is that box, once for every form.
- **A modal opened from inside a form to write one piece of it** — a text written in a box of its own —
  hands what was written back to the form with 확인 rather than saving it; the form's own 저장 saves it.
- **What is not a form** takes effect as it is done, and carries no 저장: a table whose cells are each
  their own editor (`## Tables`), a page of standing switches, and the records of a list each stored on
  its own — adding, changing, moving or removing one. A list that is itself one setting, as an order of
  pieces, is a field of its form. A switch shown inside a form's dialog is part of that form and waits
  for its 저장.

### A held finger

- **A finger resting on one point for half a second is a hold,** a touch screen's right press: it
  opens the menu a screen offers there, or starts choosing on a list that chooses many, with a short
  vibration where the phone has one.
- **A finger that moves while it is held is not holding.** Before the half second is up the press
  ends, opening no menu and choosing nothing, as soon as any of these happens:
  - it slides more than ten pixels from where it landed, the distance a phone itself reads a touch as
    moving by;
  - what it stands on starts to scroll — the list, the panel or the page;
  - it lifts, a second finger lands, or the browser takes the touch for a gesture of its own.
  - So a scroll that sets off slowly and then stops with the finger still down stays a scroll, and a
    hold is asked for by lifting and pressing again.
- **A finger that lands on something still gliding from a flick is stopping it,** not pressing: it
  holds nothing however long it then rests.
- **What a hold does once it has fired is the screen's.** A menu it opened stays open while the
  finger moves on or lifts; a hold on a choosing list drags the choice along the rows it passes.
- **Where a hold opens a menu, a finger never selects words.** Anywhere on such a surface — on its
  words as much as between them — a finger's press takes no text selection and brings up no menu
  of the phone's own, so the hold always reaches the screen's menu. A mouse selects and copies the
  same words as ever, and a field inside the surface keeps its caret and its words for either.
- **One mechanism reads every hold of the console's own** — a list's choosing, the files screen's
  menus — so a hold takes as long and ends on the same movement wherever it stands, and a screen
  supplies only what a hold means there. A menu left on the menu component's own hold ends it on
  any movement and on a scroll, which is never looser than this.

### Tooltips

- **Words that say more than what they stand on go through one shared tooltip:** a name cut short by
  its box, a number standing for something with a name, a mark whose meaning is its name. A screen
  says what the tooltip holds and how a finger reaches it; how it comes up, where it stands, how wide
  it grows and how it goes are the shared tooltip's, the same on every screen.
- **A pointer brings it up on hover and the keyboard on focus,** including a focus landing on a
  button or link inside what it stands on. It grows out of what it stands on on the console's quick
  motion, as every tooltip does (「Motion」).
- **A finger has no hover.** Where a tap does nothing else, a tap brings it up; where a tap acts — a
  link, a row, a list item that opens something — a finger rests on it instead, by the console's one
  held finger (「A held finger」), and lifting that finger presses nothing. The next touch anywhere
  puts it away, and a touch on what it stands on does not bring it straight back.
- **Its words wrap** inside a box no wider than a phone has room for, so a long name or title is read
  whole rather than cut a second time.
- **A cut name names itself only where it is actually cut.** Whether the box cuts it is measured as it
  is about to come up, so widening a panel stops the tooltip and narrowing it starts it, and a name
  read whole on the screen has no tooltip repeating it.
- **Every line cut with an ellipsis shows whole, wherever it stands, with nothing written for it.**
  One layer stands over the whole console and finds the line itself: under the pointer, the line
  whose box ends its words in an ellipsis, or clamps them to a count of lines, and actually cuts
  them; under a keyboard focus, that line or the first such line inside what took the focus; under
  a finger, the line it holds. It brings up the shared tooltip over that line with the line's whole
  words, so a new screen's cut lines show whole on the day it is written.
  - A pointer waits the tooltip's usual moment before it comes up, and moving on to another cut line
    while one stands brings that one up at once. Leaving the line, pressing anywhere or scrolling
    what holds it puts it away; a focus puts it away on leaving.
  - A finger holds the line, by the console's one held finger, since the layer cannot know what a tap
    does there, and lifting that finger presses nothing. A row that answers a hold of its own — a
    menu, the start of choosing — still does, with the tooltip over the line beside it, and the
    tooltip goes once the finger moves on or the next touch lands. The held line selects no words
    while it is held, so the phone's own selection does not take the hold.
  - A line already inside a tooltip of its own is left to that tooltip, so nothing is said twice. A
    line that slides rather than ending in an ellipsis is read whole by its sliding and has none.
  - What the tooltip holds is what the line holds: a value the server sent already cut, such as a
    database cell's head, shows that head whole and no more.

#### An item by its number

- **Every place the console shows a TODO item by its number alone names it in a tooltip:** the
  number and title, then the worker it names and where it stands, in the TODO panel's own words for
  that (진행 중, 대기, 보류 and the rest). That covers a run's item on the live screen, in a room's
  running lines and on an agent's job line, the turn waiting on an item's Job for its engine, the machine's memory holders, the
  item a question belongs to, a memory's item, the items a code review filed and a just-raised item's
  link in the TODO panel. A place that already shows the whole title beside the number, wrapping it
  rather than cutting it, carries none.
- **One component shows the number.** It takes the number, reads the item and puts up the tooltip;
  what it stands on is the number itself unless the screen gives it something else, such as a line
  that already carries the number in words. A new screen showing an item by number uses it and so
  names the item with nothing written for it.
- **Where there is room, the title stands beside the number:** the deployment's popover lists each
  item it carries and each it waits for by number and title, read as the list stands, with a skeleton
  where a title is still coming. The title wraps rather than being cut, so the item is named already
  and carries no tooltip: a number with its title beside it never has one.
- **An item is read when it is about to be named,** as a pointer comes over it, a focus or a finger
  lands, or a list that shows titles stands. Numbers asked for in the same moment go in one read,
  what was read answers at once for half a minute and is read again after that, since where an item
  stands moves while the page is open. A number with no item behind it says so, and a read that
  failed says that, never a skeleton that does not end.

### Floating things

- With something floating over the screen, back clears that first. On a phone, back is a gesture to close what is
  being looked at, not to leave the page, and if the page changes leaving something floating, the reading place is
  lost. Only with nothing to clear does the page move. With several stacked, one at a time from the top.
- **What is cleared** is everything that floats over the screen: a dialog, a sheet, a drawer, a popover, a
  dropdown menu, a select's list, a context menu, the enlarged photo, the sidebar's search palette, a narrow
  screen's TODO drawer and sidebar drawer. Three things that are states the screen entered rather than drawn over
  it count too, since to the reader they are the same 「place to get out of」: message-select mode, the mail list's
  selection mode, and a remote session's view taken to the whole window.
- **Leaving a state the screen entered does not move the keyboard.** A region such a state stood down is built
  again on the way out, and nothing in it takes the focus for itself on being built — the console's box for
  writing takes none, and a screen that wants it there hands it over itself. The focus goes back only where it
  was there before the state was entered, and every way out of the state goes through the one place that decides
  it, so a way added later is held to it without being told. Otherwise a phone's keyboard rises over the thing
  the reader has just come back to look at, every time and whichever way they left.
- Stacking is common. A select opened inside a sheet, the account menu opened inside the sidebar drawer, a TODO
  item's detail over the TODO drawer, the work-order task modal inside that detail: each back closes the top one
  and leaves the one under it standing.
- **What opens over another stands over it.** The one opened last is drawn on top of everything standing, takes
  the presses, and is the one back and a tap away close first, whatever order the page set them up in.
  - A floating thing is drawn into the page's body at the place its component took when it was set up, not when
    it opened. So one set up with the console itself, ahead of every screen, is set up afresh each time it opens
    and lands after everything already standing. The settings dialog is such a one.
  - Opened from the user menu in a narrow screen's sidebar drawer, the settings dialog stands over the drawer,
    which waits under it and stands again once the dialog has closed. The drawer going while the dialog stands
    leaves the dialog standing; only the dialog's own close, back or Esc closes it.
- **What floats keeps what it holds until it is off the screen.** Closing is animated — half a second for a
  sheet, a fifth for a dialog — and it is being looked at for the whole of that, so what it draws is not emptied
  on the press that closed it. A dialog drawing a row it was opened on holds that row until it is gone; one
  opened again on another row shows that one straight away. A dropdown holding a box keeps the box's text as it
  goes, so a box that refuses being empty never flashes its refusal on the way out; it starts again from the saved
  value the next time it opens. What is held is only what is drawn: the thing is
  told to close at once and closes at once.
- **A dialog grows out of the control that opened it.** It fades in while growing from where the pressed control
  stands, and fades and shrinks back into it as it goes, so where it came from is seen rather than remembered. The
  control is the press made just before it opened, wherever it stood — a menu's choice already gone by then
  included. A dialog nothing was pressed for, one that opens of its own accord, only fades, since it comes from no
  place. One watch over the page reads this for every dialog the library draws, so no screen says it. A sheet or a
  drawer slides in from its edge instead, and a popover, a menu or a tooltip already grows out of what it stands
  beside. A reader who asked for less movement sees a dialog only fade.
- **What a popover holds stands in place as it opens.** It grows out of what it stands beside as a whole, and
  nothing inside it moves on its own: a list in it moves its items only once the popover stands where it opens and
  has finished growing, so no item slides in from where the popover was drawn before it was placed. A list that
  changes while the popover stands moves as any list does (「Motion」). The deployment's popover in the title bar is
  such a one, its stages and their steps a list.
- **A dialog that fills the screen stands and goes at once.** The picture viewer and every other dialog drawn
  fullscreen neither grows nor fades: its final shape is the screen itself, and any size it passed through on the
  way would be a shape that fits nothing. The browser's own fullscreen — a video, the remote screen — is the
  browser's and draws no movement of the console's.
- **What is not cleared** is a tooltip, which answers hover and keyboard focus rather than a press, and what grows
  inside the screen instead of floating over it — a spread verdict line, the chat agent's spread thinking-stage line, the
  stand-an-item cell in an unfinished-item, the discard's confirm step. Several of those may be spread at once, so
  folding them one by one with back would take ten presses to leave a page.
- **No screen registers what the component library floats.** The library marks every floating thing it draws as a
  dismissable layer and says on the same element whether it stands open; the console watches the page for those
  marks, so each one becomes a layer the moment it opens and stops being one the moment it closes, on every screen,
  including one written later. Such a layer is closed by the same Esc the library already answers. A screen
  registers only what the library does not draw — the three states above, and the mail composer docked at the
  bottom right of a desktop screen, which floats over the page though the library does not draw it.
- Intercepting the gesture is done in one place, with the app's own history entry — one pushed on opening and taken
  back on closing, so opening and closing leaves history as it was. The address stays: what is open is not a place,
  so a refresh or a link should not try to open it.
  - A choice that closes one floating thing and opens another in the same press — a menu's 편집 opening a dialog —
    pushes the new entry only once the old one's step back has landed, so one back then closes the dialog and the
    next leaves the page.
  - The one that closed hands the keyboard's focus back to the control it was opened from, as every floating
    thing does on going, and that move lands outside the one just opened. It is the closing putting the focus
    back rather than the reader leaving, so it closes nothing: a menu's 속성 leaves the details standing beside
    the button, a menu's 정의로 이동 leaves its list of places standing, whichever of the two settles first. Only a
    press outside, Esc or back closes what the choice opened.
  - If a choice changes the page — a link in a drawer, a menu's link, a search palette choice — the entry stays
    behind, and returning to that place just passes it to the original page. An entry whose floating thing is gone
    — one buried under a newer layer, or one from before the page was loaded again — is passed the same way. One
    back per page is unchanged.
  - On the installed app, and on the desktop's back button, shortcut and mouse button, the same gesture enters the
    same place.
- Taking an entry back is the app's own step, not a move of the reader's: the router never reads it as one. The
  browser lands that step a moment after it is asked for, so a move begun in that moment — a choice in a sheet that
  puts the sheet away and then opens what was chosen — waits for it to land before it goes. Otherwise the step would
  land on top of the move and cancel it, and the choice would close the sheet and open nothing.
- **A finger's tap away from what floats only closes it.** On a touch screen, a tap outside the topmost floating
  thing closes that one and presses nothing under it: with a message menu open, a tap on another message closes the
  menu and opens no other, and the next tap opens that message's menu. A mouse is left as it is — a click away closes
  the floating thing and does what it points at.
- **The press that closes one is the press being handled.** A touch that lands outside what floats is a press only once
  it is lifted as one, and it may never become one at all — the finger drags away instead, or the press it would have
  been is the one the rule above spent on closing something else. Such a press does not lapse: it waits, and the next
  press anywhere, inside what floats as readily as outside it, is the one it lands on. A button pressed inside a dialog
  then does what it was pressed for and the dialog goes at the same moment, which reads as a dialog closing itself on
  the press that was meant to work it. So an outside press that is not the press being handled closes nothing, and the
  press that closes is always the one the reader has just made.
- **One context menu at a time.** A context menu holds the page while it stands: a right click elsewhere closes it
  before opening the menu of the place pressed, and a tap elsewhere only closes it, so two never stand at once.
- **Small dialogs stand in the middle, sheets are parts of the page.** On a narrow screen a sheet rising from the
  bottom is only for a part of the page taken out — a side panel, a list or tree that chooses the body, sources,
  properties — and for a large dialog that is a screen of its own: an agent's log, a TODO item, a work-order step, a
  DB row. A dialog that is no part of the page — a confirmation, one setting's form, a
  rename, a search, writing a review, filing a TODO — is a centred modal at every width, and a list to pick from
  opened at a place is a popover at every width. A modal is centred on the part of the screen that can be seen, so
  a phone's keyboard never covers its field or its buttons.
- **A dropdown stays inside the screen.** Every list dropped from a control — a select, a dropdown menu, a context
  menu — is as wide as its longest item and never narrower than its control, but never wider than the screen less a
  gutter each side. Past that its items scroll sideways together, uncut.

### Unsent words

- Writing in an input box and leaving the screen without sending keeps that word in that browser, standing where it
  was on returning. It stays in three places — the room's input box, the gate-test input box, the runner/worker
  instruction input box. It stays separately per place — a room per room, a gate per gate, an instruction per agent —
  so words written elsewhere do not mix. Once sent it clears. The room's input box empties where send was pressed,
  because that word already stands as a line at the conversation's end. An unsent word too stays not in the input box
  but on that line awaiting resend. The gate and instruction boxes keep the word in place if it could not be sent.
  What is put into the login screen and the settings' login form is credentials not unsent words, so nothing is kept.

## Installing on a phone

- The app can be installed. Put on the home screen by the browser's install menu, it comes up like an app with no
  address bar, its icon the mascot's controls on a rounded square of the mascot's mint (「The console's pictures」). The
  manifest stands the app's English name, the start URL and scope at the console's base path, standalone, and its background and theme
  colours in the console's dark ground, the colour the page's own theme colour gives the chrome, so the splash an
  installed app opens on is the icon's mint shape on the console's ground, with no wash of mint around it. The icons
  carry 192 and 512, and a maskable version Android cuts to its own shape, which is the one the splash shows.
- **An installed app is drawn edge to edge, under the phone's own bars.** What stands at the foot of a screen — a
  sheet, a dialog, the room's input bar — keeps clear of the gesture bar, and what stands at the foot while the
  keyboard is up stands above the keys, as 「Layout fundamentals」 says of what floats over the screen and of the
  vertical.
- **An installed app keeps the icon it was installed with until its browser takes the new one.** On Android, Chrome
  bakes the manifest's icons and colours into the app it installs. It looks at the manifest again as the app is
  opened, at most once a day, and on finding them changed asks for a rebuilt app only once every window of the app is
  closed and the phone is on Wi-Fi and charging, so the new icon can take days to reach a phone. `about://webapks` in
  Chrome on the phone shows each installed app's last update and queues one with its update button; removing the app
  from the home screen and installing it again takes the new icon at once.
  The console's server serves the manifest at `manifest.webmanifest` under the console's path rather than keeping it
  as a static file, so its name and the line that says what the app is come out of the language pack.
- **Every address of the installed app follows the configured base path,** the one `BMO_WEB_BASE_URL` names (「Where
  it opens」). The manifest's start URL, scope and icons are written under it; the page registers the service worker
  at `sw.js` under it, with the base path as the worker's scope; and the worker reads its base from that scope, so
  the icons it names and keeps, the windows it takes as the console's and the front door a notification with no
  place opens all stand under the same path. None of these addresses is written with a base of its own, so a console
  built under another base path installs, registers and notifies under that one.
- The service worker handles the shell and notifications. What it caches is only the icons, and **it caches no API
  response, no manifest and does not intervene in page navigation.** This screen is a place to see what happens now,
  so a cached answer is soon a wrong answer, and login state must always be as the server says. So even while the
  worker runs the session flows as usual.
- **The icons follow their content without anyone's hand.** The build reads every file of the console's icons into one
  shell version, a hash of their bytes, and every address naming an icon carries it: the manifest's icons, the page's
  own links, and the pictures a notification carries. The page registers the service worker with the version in its
  address, and the worker keeps the icons in a cache named after it. So a redrawn icon is a new address everywhere:
  the page registers a new worker, which drops every older cache as it takes over, and an installed app reading the
  manifest sees its icons' addresses changed and takes the new pictures. Uninstalling the app clears neither the
  site's worker nor its cache, so this is the one road a redrawn icon reaches a phone by.
  - The manifest's own address carries the version too, so even a worker of an older build, which kept the manifest,
    misses its cache for it and asks the server.

## Notifications

- **A notification comes even when the console is not watched.** An installed app or a browser, even with the tab
  closed — the browser receives a notification not on the screen but in the service worker, so even with the console
  not up the worker wakes and stands the notification.
- **Three things are notified.** What a job asked, what an agent said in a room, and new mail in one of the
  console's mail accounts (the mail unit's documents). Split because the owner acts differently on each — a question stands a job
  stopped and goes to the recommendation in a minute, a room message is an agent speaking where they may not be looking,
  and mail is someone outside writing in. A newly attached device receives all three: since they said they want room notifications by browser, none is quietly excluded; instead what to
  receive is turned off per device in the settings' 알림 section. A phone questions only, a desk all, and so on.
- **A job's end rings nothing of its own.** A job's report is written to the chat agent in English, and reaches the owner only as
  the chat agent's own Korean answer in its room (the agency's `docs/worker-language.md`), which rings as a room message. An item closing is
  therefore no notification: one rung as the item closed would carry the worker's English before the chat agent had said
  anything.
- **A room message is caught where every room's words reach the stream,** not agent by agent. The bot's stream says
  `sent` for an answer a turn filed and `message` for any row written in a room, whoever wrote it — the chat agent, a companion,
  a job's report, a script's send. The console reads the row each names and rings only where an agent filed it, by
  the same test the room screen uses to stand a row as an agent's, so an agent added later rings with nothing changed
  here. A person's own words never ring, and neither does a voice message: it speaks a line that rang on its own.
  Only what was said after this console started listening rings, so the stream replaying what it kept rings nothing.
- **A room message is not sent while they are looking at that room.** Every open console tab of the administrator tells this server which
  room it shows and whether it is visible: on opening a room, on being hidden or shown, and every half minute while it
  is visible. A tab gone silent for longer than a few of those reports is taken as gone. While a visible tab of an
  account shows a room, that room's messages go to none of that account's devices; another room, a hidden tab, an app
  in the background or no tab at all, and they go. The service worker's own check stays behind it as a second guard,
  for the moment between a tab opening a room and its report arriving.
- **One room's messages are bundled.** What a room says is gathered for a couple of seconds and sent as one
  notification, so an answer filed in several parts rings once. Every notification of a room carries that room's tag,
  so a later one replaces the earlier in the tray without ringing again, and its title counts the messages since they
  last looked at that room; an hour without one starts the count again.
- **What a room message says:** the room's name as the title, then who said it and the first line of what was said.
  Pressing it opens that room.
- **A question names its item by number and title together** in the notification's title, then what it asked. A
  number alone says nothing on a lock screen to somebody who does not keep every number in mind; a question whose
  item cannot be read names the number alone.
- **Each kind declares itself.** A kind carries its own name, its note in the settings' 알림 section, whether a new device
  receives it, and the path that rings it; the 알림 section and the delivery filter read the list of kinds and
  nothing else, so a kind added later changes no file but its own and that list. The two kinds of the bot's stream
  are rung by the plugin that listens to it; a bundle's notice kind is rung by the plugin that reads the stream
  of a unit whose manifest names the kind, in the bundle's own words. That stream is read for nobody signed in, so it carries the
  platform administrator's owner key, in the administrator's role: the user the account service names its
  administrator, its id as a decimal number (`docs/boundary.md`, 「Calls the console makes」).
- **A device receives a kind unless it was turned off there.** What a device stores is what it refused, so a kind added
  after the device subscribed reaches it too.
- **The test button rings a test of its own,** not one of the kinds, and reaches every device of the account whatever
  it has turned off.
- **What overlaps Telegram is left overlapping.** A room on Telegram rings there too. The console cannot quiet
  Telegram — that is theirs to decide on their device — so it does only what it can: let it be turned off per device, and
  **not ring for what they are already looking at**. The console holds the bot's stream per open tab so the screen shows the
  notice itself, so a bell ringing there is noise. Only for that screen, though — a tab looking at the cache siren screen
  has no way to know a question in the queue, so it rings then.
- **Pressing goes to that place.** A question stands the queue panel with that item open, a room
  message stands that room, and mail opens the conversation of the newest message that arrived. The address a
  notification carries is written by the server under the configured base path, and a window told to go there takes
  that base off before handing the place to its router. If a console is already open its window
  is brought forward and moved, not opened anew. A window installed as an app is not always one the service worker
  controls, and such a window refuses to be moved from there; it is then focused and told where to go, and the console
  carries itself to that place. A window that answers neither is left alone and a fresh one is opened.
- **A notification carries two pictures.** The large one is the console's own icon, shown beside the text. The small one
  is what Android draws in its status bar, and the platform paints every opaque pixel of it in a colour of its own: a
  full-colour square handed over there arrives as a solid white block, so the small one is a silhouette whose shape is
  carried by its alpha alone and nothing else.
- **The small picture is the one drawn for the phone's density.** The window registering the service worker names its
  screen's density in the worker's address, rounded up to a whole number, and the worker hands over the status-bar
  picture drawn for that density, or the next finer one for a density between them, which the platform only shrinks.
  A window on a screen of another density registers the worker again under its own.
- **A subscription binds to the logged-in account.** One device is one subscription, and that line belongs to the account
  that made it. A browser not logged in cannot subscribe, so there is no road for just anyone to receive room content.
  What a notification carries is only a question a job put to them, the first line an agent said in a room with the room and the speaker, and for mail the account, the sender and the subject — never a mail's
  body, this machine's paths, tokens or an agent's insides. The carried content itself is sealed with a key the browser made so the push service in
  between cannot read it.
- **One pile of the same notice is read once.** The bot's todo event carries only the fact that the table moved, so what
  to notify must be read from the archive each time. So the same event coming in a row repeats the same read that many
  times and the answer is each time the same. Not a rare place — the bot hands a stream that lost its place all it has in
  the buffer, so hundreds arrive in one breath each time it resumes. This server answers requests and does that read on
  one thread, so reading per event leaves the console answering no request meanwhile.
- So an event only marks the table moved, and reading is done once per brief window. What is read is not the event but the
  state standing in the archive now, so one read replacing two hundred finds what two hundred would — with nothing to lose
  inside an event in the first place, no notice is lost bundled. What came in during a read the following read takes, and
  reads do not overlap. So a notification may be about a second late, and to one reading on a locked screen the question of
  a second ago and now are the same question.
- And that read opens only the jobs' questions. One notification says only the item number and the question, while
  the whole board the panel stands brings lists nobody asked for and, per line, how many times that item ran and how
  long it took — a value dug per line from the job table that says nothing about a question.
- **Only one console rings.** What sends notifications is a Nitro plugin so one runs per console server, each reading the
  bot's same stream. So with two consoles up, one event notifies twice. Someone touching the console runs their dev server
  beside the deployed one so this is not a rare place.
- It is not split by a lock. The lock a job and the synthesiser use splits equals — the first in writes and the later waits
  — which does not fit here. These two are not equal. The deployed one must always ring and the one a person touches must
  not, and a lock does not know which of its holders is which. Under a first-in rule a running dev server would take the
  deployed one's bell, and the quieted console would not even say it went quiet. Worse than hearing twice.
- So it is split by an already-true difference. **A built console rings, and a console run from source does not.** The
  deployed unit is unchanged by this and does not go quiet whatever the developer does. The verdict is written to stop the
  bell only when 「is this a dev server」 answers yes, so even a case where the runtime does not answer that question at all
  falls to the ringing side.
- To see this road ring on a dev server, launch it with `BMO_PUSH_IN_DEV=1`. Then both ring, and that is a deliberate two.
  To see exactly one, bring down the deployed console first. To only see whether a device receives a notification at all,
  this is not needed — the 알림 section's test button rings once from either server.
- **A dead subscription clears itself.** When the push service answers that the subscription is gone (404 or 410) that line
  is deleted. The browser was emptied, the app removed or the subscription swapped, so it will not come back. Other failures
  are not deleted — a service wobbling briefly is no reason to discard a device forever.
- **The signing keys are on this machine.** Push needs a key pair identifying this server. `bun scripts/vapid.ts` makes it,
  and the two lines go in the console's environment. The public side goes to each subscribing browser and the secret side never leaves this
  machine so it is not put in the repository. Without keys the console says on the spot it cannot send notifications and the
  rest runs as usual. Making new keys invalidates every subscription made with the old, and each device must reattach.

## Screens a unit brings

A unit with screens of its own serves them as a console bundle and describes the bundle in a manifest, both by
bmo-ui's console plugin contract (bmo-ui's `docs/console-bundles.md`). The console attaches each bundle by its
manifest while it runs: no unit's screen is built into it, and nothing here names one.

- **The units asked are every unit the settings name.** The server asks each unit whose `<NAME>_ADDRESS` is set
  for `GET /console-manifest`, with that unit's token and no owner key or role, when it starts and once a minute
  after. A unit that answers anything but a 200, that nothing answers, or that takes longer than five seconds
  brings no screen, and nothing says so on a screen. A manifest that does not read through bmo-ui's
  `consoleManifest`, or whose words do not answer, brings none either, and the server's log names the fault.
  Two manifests sharing a name, a screen path or a service name both bring none.
- **The service is relayed under the name its manifest gives,** at the address and with the token of the unit
  that answered it: the paths under its `apiPrefix`, each route its manifest names under `relays` by its method and
  path, its module and its stylesheet, and nothing else of it. A relayed call gives the service thirty seconds to
  begin its answer, and a call to the translator's route (below) the console's `NUXT_TRANSLATOR_BEGIN_MS`, ninety
  seconds by default; a service that has not begun by then is a 504. Its
  event stream and its socket are relayed where the manifest asks for them, and the notices it names under
  `pushKinds` are rung (「Notifications」).
- **A bundle calls the services it names.** A manifest's `calls` names the other services its screens call
  through the relay, each by the service name that service's own manifest gives it. A call from a bundle's page,
  told by the page address the browser sends as the call's referrer, to a service another manifest names is
  relayed only where the page's manifest names that service, and then as that service's own screen's calls are:
  only the paths its own manifest lets through, and only for a reader its own role and owner key allow. Any other
  such call is refused 403, but for a read of that service's module, its stylesheet or a file in its module's
  folder or below it, such as the chunks a module loads as a screen is reached, so a screen opened from another's
  page still loads. A unit the console calls directly answers no manifest, and
  the rule does not reach it.
- **The translator a bundle translates through** is named by the console's environment
  (`NUXT_PUBLIC_BMO_UI_TRANSLATOR_SERVICE` and `NUXT_PUBLIC_BMO_UI_TRANSLATOR_PATH`, `docs/boundary.md`,
  「Settings」), as bmo-ui's runtime configuration reads it; the console's code names none. A bundle's screen asks it
  through bmo-ui's translation module, and with neither set no screen translates. How many originals one ask
  carries and how many asks a tab holds out at once are the same configuration's
  (`NUXT_PUBLIC_BMO_UI_TRANSLATOR_BATCH` and `NUXT_PUBLIC_BMO_UI_TRANSLATOR_ASKS_AT_ONCE`), bmo-ui's defaults
  standing where neither is set.
- **A reader is handed the screens their role opens.** The console's `GET /api/console-bundles` answers the
  bundles whose manifest's role the signed-in reader's role allows, leaving out one that asks for the owner key
  where the login has no user: each with its name, title and icon, its screen path, the relay addresses of its
  module and its stylesheet, and its words. A page drawn on the server reads the same list, so the sidebar
  names every screen on its first frame, and the words are merged into the console's pack under the bundle's
  namespace as the list is read.
- **A screen's module is loaded the first time its path is opened.** The browser reads the module through the
  relay and, before it runs, points every import of `vue`, `vue-router`, `vue-i18n`, `nuxt/app` and of
  `@nuxt/ui`'s and bmo-ui's own paths at the console's own copy, so a bundle draws with the console's components
  and runs inside the console's app. A file of the bundle the module imports is read the same way, one imported
  only when it is reached at the moment it is reached. The module's routes then stand under the console's frame
  — in place of a console page that stood at the same address, a placeholder — and its stylesheet is linked
  once, in a cascade layer of its own above the console's base and below its components and utilities, so a
  class both style reads as the console's and a bundle's copy of a utility never undoes the frame around it. A loaded module stays for the life of the tab; a manifest naming a new one reaches the next tab.
  - **A bundle's variants still win over a plain utility.** A utility under a variant — a width (`md:`), a state
    (`hover:`), a child or a selector of its own — is meant to beat the plain utility it stands beside, and in
    the bundles' layer it would lose to the console's plain copy of that utility. So the console reads the
    stylesheet once more and lays its variant rules alone in a second layer of the bundles', above the console's
    utilities, where a browser that scopes styles holds them to the page area of a bundle's screen. A screen's
    `flex-col md:flex-row` then turns to a row at its width as the bundle wrote it, while its plain utilities still
    give way to the console's.
  - **A bundle's screen stands in the page area.** The page area beside the sidebar and the task panel is the box a
    bundle's screen is laid out in, a fixed position included: a screen whose root is fixed to the window — a
    dashboard group of its own — fills the page area and never the window, so the sidebar, the task panel and the
    page area's edges stand around it as around every page, and no part of another page stands under it.
- **A bundle's page is drawn in the browser.** The server holds no bundle's module, so an address under a
  bundle's screen path is answered with the app's shell, and the browser draws the page once the module is in.
- **A share page reads only its own bundle.** Asked with no session for an address under a screen path's
  `share/`, the list answers that one bundle's screen path, module, stylesheet and words, and nothing else of any
  manifest (「Access」).

## How the units are talked to

- **The console's own server is the only caller.** Each unit's address and token are on the server side alone,
  and the browser calls only this app's paths (`docs/boundary.md`, 「Calls the console makes」). The server is
  reached for the session, the users and the grants; the agency for agents, sessions, runs and roads; bmo-job for
  the TODO queue, its work orders, its questions and its workers; the receiver for rooms, their messages, the
  owner's words and the live board; each console bundle for its own
  screen, its share page and its notices; the cache siren and the cache warmer for their screens.
- **A bundle's screen reaches its service through one relay.** The bundle calls the console's relay base, the
  service's name and the path the service's own API writes; the console hands it on to the address of the
  unit that answered the bundle's manifest with the service's token and the owner key and role of the person signed in — their
  user's id on the account service and whether they are the administrator or a member, set in place of any the
  browser sent — and hands the answer back as it came. A socket the manifest
  asks for stands at the same path and is relayed the same way: each frame is handed on as it came, and the
  close code ends both sides. Nothing here
  re-exposes a unit's API under a name of its own, so a route a service changes reaches its screen with no
  change in this console (bmo-ui's `docs/console-bundles.md`).
- **The stream.** The receiver, bmo-job and the agency each publish a stream of events. The console's server holds
  one stream to each, and relays them into one stream per browser tab, event by event: an event cut across two
  reads waits here until the rest of it comes, so the frames this app writes into the same stream of its own — the
  keepalive and the stopping frame — always land between two whole events, never inside one. A unit that answers
  the relay with a refusal — a token that does not match, a fault of its own — is written in this app's log with the
  status it gave, since the browser only sees a stream that ends, and once per refusal rather than at every try.
  - **The receiver's stream is the tab's.** When it ends the relay ends, and the tab opens it again as below.
  - **bmo-job's and the agency's are the relay's to keep.** One that ends, refuses or is not up yet is asked again
    after three seconds for as long as the tab's stream stands, bmo-job's from the last event the relay passed on;
    a unit whose address is not set is not asked.
  - **Each reaches the tab under names of its own,** so nothing of one is read as another's: bmo-job's events as
    `job`, its numbers counted apart from the receiver's, each event naming its kind and what it carries; the
    agency's turns going out and ending and its jobs starting, changing and ending as `agency`, with their kind
    beside what they carry. The tab reads bmo-job's item and queue moving as the TODO moving, a work order or task
    changing as that item's work order and an item's notes, reports and replies as that item's talk; and it reads
    an agency turn as an agent's turn going out or ending, which the worker's job line and the live board read back
    on, and an agency job as work running for its room, which the room's working line and the live board read back
    on.
- **What the screen knows is this stream.** The room screen knowing what it is doing now, the live status screen
  knowing starts and ends, the home's context and usage bars moving, the TODO panel re-reading the queue and
  questions — all one thing. Instead of each screen running its own clock re-asking every few seconds, each says
  which notice makes it re-read and reads only when that notice comes. One browser tab opens one stream — each
  screen opening one would soon eat the browser's connection limit to one origin, and each of those would take
  more connections from this app to the units. The first screen asking opens it and the last leaving closes it.
- **A notice carries what moved too.** So a screen that got a notice can read only what moved, and the room screen
  does that. The other two reasons cannot — a resumed stream does not know what moved while broken, and a clock
  runs where there is no notice at all — so those two re-read whole what the screen shows.
- **A clock runs only while the stream is broken.** While the stream is alive the screen asks nothing
  periodically. When it breaks the screen re-reads on its own clock — the very interval that screen originally
  kept — and re-reads whole once the moment it resumes. What moved while broken was known to nobody, so that one
  read fills the gap. The stream asks each unit to continue from the last event number seen from it, so what each
  unit flowed in between comes too.
- **A stream that goes quiet is a break.** This app writes a keepalive frame on every stream every five seconds,
  as a named frame the page hears rather than a comment line it never sees. A page that has heard nothing at all on
  its stream for twenty seconds takes it for lost: it closes it, says so on the browser console, and opens it again
  as after any break, with the catch-up read that follows. A connection that died without closing — a laptop
  waking, a phone changing networks, a tab the browser froze — would otherwise leave the screen connected and deaf,
  with the clock not running because nothing looks broken.
- **The first try to reopen comes after about a second.** A unit's restart takes one to three seconds, so a reopen
  that waited longer would show a break the owner never needed to see. Each try after that waits longer, up to
  fifteen seconds, so a unit that stays down is not asked in a flood. The cursor a reopen carries — the last number
  and the run of the receiver and of bmo-job — is the same whichever try it is. The agency numbers its events by
  nothing and replays none, so what it said while the stream was down is covered by the catch-up read alone.
- **A number counts only within one run of its unit.** An event number is that unit's process counting its own
  events, so its restart counts from the start. So it must be said which run a number was received in to be a
  readable number — the receiver's and bmo-job's streams say their run in the first word, the console asks to
  continue naming that run, and to a reader holding a past run's number the unit hands all it has. Without this, after a restart every
  new run's number would read as already-seen and none would pass — the connection fine but nothing carried, and
  the connection alive so the clock does not run and the screen does not even know it is deaf.
- **A stop a unit means says so first.** A unit stopped on purpose writes a `stopping` frame on every open stream
  before it lets go. The frame carries no number and moves no cursor, like the frame that carries the live picture:
  it is news about the stream, not an event of the run. This app relays the receiver's as it stands, since that
  stream is the tab's, and this app's own server
  writes the same frame on every stream it relays when it is itself shut down.
- **A break after that frame reads as a restart.** The screen says `재시작 중` rather than a break, and goes back
  to its usual state the moment the new run names itself on the reopened stream. If no run speaks within two
  minutes — longer than a deployment waits for a unit to answer — the restart reads as a break after all. A stream
  that ends with no frame before it reads as a break at once.
- And the fact of being broken stands in the sidebar — the screen never quietly shows a stale value. The sidebar
  holds one line for it, only while the stream is not connected: `재시작 중` during a restart a unit announced,
  `연결 끊김` during any other break, and nothing before the first stream has spoken or while it is connected. This
  is a different fact from a unit not answering a request, which is said separately at the place that made the
  request.
- **A read that fails during an announced restart is not a failure.** While a restart a unit announced lasts, a
  screen whose read failed keeps what it last read and says only `다시 연결하는 중`, a calm line in the quiet
  colour, where its failure would stand. It is said once for a screen: a part that reads inside a screen already
  saying it says nothing more. When the new run names itself on the reopened stream the screen reads again on its
  own, with no press, and keeps that line until the read has settled. Only a read that fails again then, a restart
  whose wait ran out, or a failure met outside a restart is said as a failure.
- **A failed read is said in one band.** The error band carries the reason, and the refresh that reads again stands
  inside it at its trailing end, as an icon button named 새로고침 on hover; no separate button stands under or beside
  the band. Every screen says its read failures in this one band.
- **The cache siren does not ride the stream.** Its screen runs its own clock: the siren publishes no stream the
  console relays.
- **An agent's log and its job line ride the agency's stream.** The console relays the agency's `GET /events` — its
  turns, its runs and sessions created, changed or stopped, and its jobs — and an open log, a work view's job line
  and its stepper read again the moment one of them concerns that agent. While the stream is down they read on their
  own clock. The agency announces no single line of a log and no tool call of a job, so while one of the agent's
  runs is going, or its job runs, that clock carries its lines and figures as well; a log whose runs have all ended,
  and a job that has ended, read on the stream alone.
- The live status screen gets the status once on opening and thereafter swaps in the status the stream carries.

## Tables

- **The console's own tables are the server's** (`docs/accounts.md`, 「The tables」): the console accounts, the push
  devices, the tab states, the palettes and themes, how far each user has read each room, and the threads about a
  document. The console reads and writes those and no other unit's.
- **Everything else a screen shows is another unit's,** read through that unit's routes (`docs/boundary.md`): the
  agents, their log and their runs are the agency's; the TODO items, their talk, the questions, the jobs and the
  work orders are bmo-job's; the rooms, the messages, the judgements and the message files are the receiver's; the
  documents and their share links are bmo-artifact's. The brain's memories, library and fragments are the brain's
  own screen's, which the brain brings by its manifest.
- **The DB screen opens the server's own database alone,** read-only, through a connection opened read-only.

## Settings

The console reads its settings from its environment: the units' addresses and tokens of `docs/boundary.md`,
「Settings」, and these of its own. `client/apps/web/.env.example` is the sample.

| Name | Meaning |
|---|---|
| `PORT` | The port the built server listens on |
| `NUXT_SESSION_PASSWORD` | The key sealing the login cookie. 32 characters or more. Changing it logs everyone out |
| `WEB_DATABASE_URL` | The server's PostgreSQL database, where the console's own tables stand (「Tables」) |
| `NUXT_PUBLIC_CHAT_AGENT_NAME` | The name the chat agent's messages stand under, which the console tells its lines by |
| `NUXT_PUBLIC_CHAT_AGENT_LABEL` | The label a room and a page call the chat agent by |
| `BMO_WEB_SERVER_BIN`, `BMO_WEB_SERVER_DIR` | The server's binary and the folder its settings stand in, which the account command runs (「Making an account and resetting a password」) |
| `BMO_VAPID_PUBLIC_KEY` | The public side of the notification key pair. Goes to each subscribing browser |
| `BMO_VAPID_PRIVATE_KEY` | Its secret side. Never leaves the machine. Without either, notifications cannot be sent |
| `BMO_VAPID_SUBJECT` | Where to contact about this server's push. A `mailto:` or `https:` address, and the default points at no person |
| `BMO_PUSH_IN_DEV` | Makes the dev server send notifications too (`1`, `true`, `yes`). A built server always sends regardless |
| `WEB_DATA_DIR` | The console's own data folder: the keys a send is held once by. Inside no checkout; `~/.local/share/bmo-web/data` where it is not set |
| `BMO_WEB_BASE_URL` | The base path every page and road stands under; `/bmo/` where none is named |
| `BMO_WEB_OUTPUT_DIR` | Where a build writes its release; `.output` where none is named. The deployment names a release's own directory |
| `BMO_WEB_BUILD_DIR` | Where Nuxt writes its generated project; `.nuxt` where none is named. A standing dev console names its own, so a typecheck in the same checkout leaves what it serves alone |
| `BMO_WEB_DEV_HOSTS` | The hosts a dev server answers beyond its own, comma-separated |

A unit's address and token are read by name on the console's server, `<NAME>_ADDRESS` and `<NAME>_TOKEN`; a unit
whose address is not set is a unit the console does not reach.

Make a key like this:

```
openssl rand -base64 48
```

Make a notification key pair like this, in `client/apps/web`. Put the two lines as they are in the environment.

```
bun scripts/vapid.ts
```

## First setup

```
cd <checkout>/client
bun install
cp apps/web/.env.example apps/web/.env
```

The install is the client workspace's one install, for the console and its packages alike. Open
`apps/web/.env`, change `NUXT_SESSION_PASSWORD` to the value just made, and put each unit's address and token in.

## Making an account and resetting a password

The first account cannot be made in the browser. The command below makes an account, and overwrites the password
for an existing name. It also restores a forgotten password.

```
cd <checkout>/client/apps/web
bun scripts/user.ts set <id> <password>
```

An id is 2–64 letters, digits, dots, underscores and hyphens. A password is 8 characters or more. A password is
hashed with argon2id so the original stays nowhere.

Where the model is in force, the sign-in is the account service's, so the command also makes or resets the
service's user of that name through the account command (`docs/accounts.md`, 「The account command」).
`--administrator` makes that user the platform administrator. The command runs the binary `BMO_WEB_SERVER_BIN`
names in the folder `BMO_WEB_SERVER_DIR` names, and refuses with neither set. The console account is written in
the database `WEB_DATABASE_URL` names.

## Running in development

```
cd <checkout>/client/apps/web
bun --bun nuxi dev
```

Opens at the port and base path the environment names. Notifications do not go out from the dev server — the
deployed console and it both ringing on one event would come twice, and to ring from the dev server too, launch it
with `BMO_PUSH_IN_DEV=1` (「Notifications」 above). A dev server launched beside a running console is launched on
another port, and stands on its own unit addresses, a scratch server database and stand-ins where a unit is not
wanted.

The static check is this:

```
bun run typecheck
```

This one only. Running `bunx tsc --noEmit` in `apps/web` passes silently, not because it passed the check but
because it read nothing — its `tsconfig.json` has an empty file list and is a shell holding the projects Nuxt makes
only as references, so a call not following the references has no file to see. Planting a type error and running
the two side by side, the former ends 0 and only `bun run typecheck` catches it.

Do not build by hand. The one road to put the console up is the deployment, and the build is its step.

## Running as a service

The console stands as the systemd user unit this repository's `deploy/` holds, `bmo-web.service`, running the built
`.output/server/index.mjs` out of the release. The server stands as a unit of its own beside it,
`bmo-web-server.service`. Both are linked, started and restarted by the testbed's deployment of this repository
(`testbed.toml`; the testbed's `docs/deploy.md`), into the deploy tree `~/.local/share/bmo-web/deploy`.

- **The server is the deployment's service,** marked `bot`: the deployment waits on its health, `bmo-web-server
  health` run in the release's `server/`, and watches it stay up. The console is marked `restart`, restarted by
  every deployment just before the server.
- **What a deployment does for this repository,** beyond the testbed's own steps: the server's release build; the
  console's install and build in the build tree, written into the release being built; and before the flip, the
  server's settings held to what it stands on (`bmo-web-server settings`: `server.token` and `names.chat_agent`
  must be set), the document wording file written into the release as `documents.ko.yaml` for bmo-artifact
  (`docs/boundary.md`, 「The document wording file」), and the server's migrations, every one of which only adds, so
  the release still serving reads on through them.
- **The settings stand under the data root,** never in the repository and never in a release: the server's as
  `env/web.toml`, which each release links to as `server/settings.local.toml` (`docs/boundary.md`, 「Settings」), and
  the console's environment as `env/web-console.env`, which each release links to as `client/apps/web/console.env`
  and the console's unit reads; the build reads it too, since the base path is fixed as the console is built, so it
  is written as plain `KEY=value` lines, the keys `client/apps/web/.env.example` lists. The ports, the base path and
  the public name are among them. A deployment finding either file missing is refused, and neither unit starts
  without its own.

- **A request waits on its answer up to Bun's ceiling of 255 seconds.** Bun's server cuts a request that has sent
  nothing for its idle limit, ten seconds unless told otherwise, and the console's server reports that cut as
  `request timed out after 10 seconds` while the browser sees the request fail. A change carried to a unit can take
  longer — a companion's reset waits out a person-book run's stop — so the unit sets `NITRO_BUN_IDLE_TIMEOUT` to that
  ceiling.
- **A build takes a larger heap than Node gives by default.** Bundling the server runs past the default heap
  limit, so the build script raises it to six gigabytes (`NODE_OPTIONS=--max-old-space-size=6144`).
- **Each deployment is a release of its own.** The testbed builds a release into a directory of its own and flips
  the deploy tree's link to it, and the units run out of the link. A running Nitro server reads a route's chunk from
  disk the moment it is first asked, and a chunk name carries a hash of its content, so rebuilding onto the standing
  place would leave a route the running server has not yet read without its file; a release beside the standing one
  never touches what the running process reads, and the restart after the flip starts it on the new one.

See state and logs like this:

```
systemctl --user status <unit>
journalctl --user -u <unit> -f
```

## Where it opens

- The app listens on the port its settings name, with every path under its base path. Outside, the deployment's
  reverse proxy hands the console's public address to this port. The proxy must not strip the path but hand the base
  path as is, and must flow the event stream without buffering so it is not broken.
- The proxy must also keep an idle connection open for a long time, for the event stream.

## The worker's run mode and messages

- A live worker's state is shown from the agency's runs and bmo-job's jobs. A running job is not treated as ended
  just because the log went quiet. A job stores the run mode and model it actually started with, apart from the
  requested model, and shows the new run value when a provider switch happens.
- The worker log is read to the run mode. From Claude's stream-json and Codex's JSONL, messages and tool calls and
  results are recorded in the same worker/job's log as they arrive. OpenRouter's headless run emits no intermediate
  event so it records the start mode and the final response and end, and does not make and show intermediate
  messages. A failure and the next provider's start are told apart within the same run too.

## Profile photos

- A profile photo comes from the archive and from each chat service: the receiver keeps a picture for every room
  and person the archive knows that has one, and the Telegram service keeps Telegram's. The console reads them
  through those units, a room's and a person's by their kind and id, and serves them under its own path behind
  the sign-in.
- The receiver and the Telegram service each list the pictures they keep at `GET /avatars`, a page at a time,
  each with the moment it was taken and oldest first. The console reads both lists page by page and joins them,
  the receiver's first for a number both keep, since the receiver is the archive; each picture's address carries
  the moment it was taken, so a browser keeps what it holds until a new picture changes the address. One picture
  is asked of the receiver first and of the Telegram service where the receiver keeps none. A list a unit does not
  answer leaves only its pictures out, and a room or a person with no picture in either list stands as its
  letter.
- When a photo is added, changed or deleted the receiver's stream carries a refresh event and the left room list and
  conversation profiles re-read the common list. While disconnected it checks at one-minute intervals, and re-reads at
  once on reconnect. Opening a screen does not call the chat service's platform.

## Remaining usage

- The account rate shows as 'remaining usage'. The provider's reported consumption is subtracted from 100%, 100% being all usable
  and 0% none. As the remaining shrinks it becomes a caution or warning colour. The internal consumption and threshold judging a
  휴식 상태 are kept as they are.
- **Every Claude account has its own meters.** A window belongs to the account whose login reported it,
  so each registered account's session and weekly windows stand in a group of their own under that
  account's name, whichever account is serving, and none of them is ever read in place of another's: a
  reader asking about one account's window is handed that account's or nothing. A 휴식 상태 is judged
  against the account the window belongs to, and the rooms fall quiet only when no account and no
  provider will answer.
  - Each account's windows are read on a clock by asking the account-usage endpoint with that account's
    own login, taken from its own credential folder, and each reading replaces that account's previous
    set, so a window the account no longer reports does not stay. An account whose login cannot be asked
    right now — expired, refused, rate-limited or unreachable — keeps its last reading.
  - A window a Claude answer carries is written under the login that produced it, and a reading whose
    login cannot be named is not written (the agency's `docs/cache-fallback.md`).
  - The group of the account automatic runs go out on now is marked as the one in use.
  - A window more than a day from its reset names the weekday it turns over on beside the time left,
    since two logins keep their weeks on different days; the date and hour stand behind it.
  - A window whose reset time has passed is shown as reset, not as the percentage it held before the
    reset, until a new reading arrives.
- The screen reads the figures again once a minute. Which of a slot's windows is its session and which its week is the
  agency's pick from the provider's own names, so a weekly window is never shown as a session window, nor another model's
  window taken for the account's.
- The model providers are the four Claude Code, Codex, OpenRouter and 등록 모델, and setting a key's run mode to one of them runs
  that key on that provider alone, whatever the accounts' auto-fallback would have done. A key set to
  Claude Code, or left automatic, also names the account it runs on: one account alone, or the account
  order walked from the top.
- The remaining-usage popover opens within the window's width and height and a long list scrolls within. It holds the
  remaining usage of each account alone — a group per registered Claude account holding that account's windows, and the
  slot the chat runs on marked (「Usage in the title bar」) — and no tally of tokens and no list of sessions.
- A failed read of the popover's figures keeps what was read last on the title bar and in the popover, and the popover says
  the failure above them in the one error band (「How the bot is talked to」 says how a read during a restart reads).
- The TODO detail's work order edits the intent, run instruction and builder model in the draft. If the draft's intent and
  instruction are still the item's own words, those two cells do not stand and only a line saying so and 「따로 작성」 stand — the same
  text already stands in the 지시 group right above, so standing them as cells makes two copies on one screen. Pressing 따로 적기 opens
  the cell holding that text, and a draft once written separately always stands as a cell thereafter. The builder model is what the
  item does not say so always stands. A cell nobody typed follows a draft edited elsewhere — the chat agent's edit in item talk — as read, and a
  cell someone typed keeps its text until saved or left. Automatic or one of the three worker providers' models can be chosen, and
  after progress the steps of the order are read as below. A task done in one go stands no round — every task runs once so that
  count says nothing. A step of one task stands no some/some — calling a lone one 1/1 is the same. A task's state is one of pending, running, complete, failed, skipped, and skipped
  carries its own name and mark so as not to mix with complete. The progress line counts complete and skipped apart too, and a
  skipped task's modal shows the skip reason and its time. Work decided not to be done reading as work done makes the whole record
  say something false (bmo-job's `docs/work-orders.md`). A task's modal stands the stage verb its state takes: edit-instruction for a pending,
  failed or skipped task, skip that writes a reason, restore a skip, rerun for a complete, failed or skipped task. An in-progress or
  stopped work order stands fold that writes a reason. An in-progress work order also stands **중지**, which writes a required reason
  too and sends the same stop as the TODO item's: it is worded apart from the fold, since a stop keeps everything to resume from and a fold
  ends the order for good. A work order stopped that way stands its stop reason in the progress line. Pressing sends the same request as the script's verb through the bot's one
  door, and if the bot does not accept it the reason — because a running builder, because a previous round — is written there as is, and
  a refusal because of a running builder names the stop as the way to end it.
  The buttons filter by state only and the phase condition the bot judges, so the screen holds no second rulebook. Reorder and recover
  an overwritten round are done by script only.
- **The list is the procedure, one item to a step, with no section headings.** A step is one thing the
  order did in turn: the plan, one stage of branches, the synthesis, one build task, the final turn, and an
  earlier round of a reopened order. Steps stand in the order they ran; a step not yet started stands after
  them in the order the plan put it. A stage of several branches is one item, not one line per branch — a
  stage of three votes standing as three lines made the list too long to read.
- **A step is a head of two lines beside its state mark** on the progress stepper. The first is the step's name,
  its role and its title, and the mark beside it says its state — read whole, `완료 · screener · Screen the
  root-cause claims`. A stage's name is the stage title the plan gave it; a
  single task's name is its own title, and a task with none takes its group's name. A stage mixing roles
  names every role in it. The step's state is running while any task in it runs, failed while any failed,
  waiting while none has started, skipped when every task was skipped, and done otherwise. The second line
  is the model each of its tasks ran on — every distinct one the step used, each by its short name and alone
  (「Model names where room is short」; bmo-job's `docs/work-orders.md`, 「The model a step ran on」) — then, for a step of more than one task, how many of them are settled as a some/some. How long the step
  took stands at the right end of the first line, where every stepper keeps its time. A first line wider than
  the row ends in an ellipsis and shows whole in the tooltip every cut line carries (「Tooltips」); a second
  line wider than the row slides instead, since its models are names and its marks stand at its end. The some/some stands one more space off the model, since a
  model ending in a digit followed by a place starting with one reads as one number.
- **The time a step took, and the order's whole time, count only what was running.** A task's run opens
  where the task started and closes where the job that ran it finished — a task still going runs to now.
  A step's time is its own tasks' runs merged where they overlap, so a stage's branches side by side count
  once; the order's time is every task's run merged the same way across every step. What lies between the
  runs counts for nothing, which is the whole point of counting them: an order paused and resumed a week
  later, a stage waiting for a place in the pool, a task rerun long after the rest of its stage — none of
  that is work, and the total says the hour the order worked rather than the week it stood. The panel's
  progress line carries the order's start, its end once it is done, and that worked total. A run whose end
  the archive no longer holds is left out rather than guessed at, and a step with no measurable run at all
  stands with no time beside it. Nothing new is recorded for any of this: a task keeps when it started, and
  its job row keeps when it finished.
- **Pressing a step's head unfolds its tasks in place,** and a running step stands unfolded when it first
  appears. Each task is one line — its state mark, its role and title, its model line, and the time it took —
  and the body holds no instruction and no result, so a long one never pushes the rest of the order down.
- **Pressing a task opens the step in a modal at that task** — centred on a wide screen, rising from the
  bottom on a narrow one. The head is the step's two lines. A step of more than one task has a tab per task above the
  body, each named by the task's short title with its state mark on the left; a single task has no such
  row. Under it the body splits into the instruction and the result, one tab each. The result tab holds the
  run number, the time the task took, the result, the failure and the skip reason, and says none for a task
  that has left nothing yet. The step verb stands below those tabs, about the task in the open tab. However
  long the result, the height is the modal's and the inside scrolls.
- Progress re-reads at once on the shared SSE's TODO event and corrects once on reconnect. No periodic query
  or warning while broken. Resuming a stopped state preserves successful tasks and proceeds from the failed
  (bmo-job's `docs/work-orders.md`). A stopped work order the bot resumes itself in its turn, and the panel's resume
  button resumes now without waiting the turn. A stopped work order's panel shows its place in the queue —
  whether its turn to resume, and if yielding, because of what — and the counted failure count in the same
  words as its line in the TODO panel. A finished work order is reopened where the intent, run instruction
  and builder model are edited, and a reopened work order's previous-round tasks stand under the draft as
  one step per round. If auto-progress is stopped, that resume place says so — while the switch is off, even
  a resume does not launch the next stage.
