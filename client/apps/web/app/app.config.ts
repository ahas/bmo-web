import { DEFAULT_THEME } from "bmo-ui/shared/themes";

// What every list dropped from a control stands as: as wide as its longest item, but at most the
// screen less a gutter each side, its items scrolling sideways together past that. The width is the
// content's own rather than a floor of "fit": a floor always beats a ceiling, and a list held only by
// a floor runs off a phone. The floor each kind of list adds is named whole, class and all, since the
// stylesheet is built from the words written here.
// An item's trailing column — a check, a key, a submenu's arrow — is drawn on every row whether it
// holds one or not, and an empty one still costs the row its gap, so it stands only where it holds
// something.
function dropdown(floor: string) {
  return {
    content: `w-max max-w-[calc(100vw-1rem)] ${floor} ${GROWS}`,
    viewport: "overflow-x-auto",
    group: "w-max min-w-full",
    itemTrailing: "empty:hidden",
    itemLabel: "text-clip whitespace-nowrap",
    itemDescription: "text-clip whitespace-nowrap"
  };
}

// A list's group headings at the library's two small sizes, which name a fixed ten pixels the
// stylesheet's own step does not reach, at the caption size.
const HEADINGS_AT_CAPTION = {
  xs: { label: "text-sm" },
  sm: { label: "text-sm" }
};

// How the library's own floating things and folding regions come and go, at the console's timing
// (docs/web.md, 「Motion」). The library's movements themselves are kept, since each already says
// where the thing came from: a menu, a list or a tooltip grows out of the control it stands beside,
// a sheet slides from its edge, a region opens downward from its heading. Only how long each takes
// and how it eases is the console's, named by kind of movement, so the same kind is the same length
// on every component. Each is written whole, class and all, since the stylesheet is built from the
// words written here.
const GROWS =
  "data-[state=open]:animate-[scale-in_var(--bmo-motion-quick)_var(--bmo-ease-enter)] data-[state=closed]:animate-[scale-out_var(--bmo-motion-quick)_var(--bmo-ease-exit)]";
const GROWS_AFTER_DELAY =
  "data-[state=delayed-open]:animate-[scale-in_var(--bmo-motion-quick)_var(--bmo-ease-enter)] data-[state=closed]:animate-[scale-out_var(--bmo-motion-quick)_var(--bmo-ease-exit)]";
const UNFOLDS =
  "data-[state=open]:animate-[collapsible-down_var(--bmo-motion-unfold)_var(--bmo-ease-enter)] data-[state=closed]:animate-[collapsible-up_var(--bmo-motion-unfold)_var(--bmo-ease-exit)]";
const SHADES =
  "data-[state=open]:animate-[fade-in_var(--bmo-motion-pop)_var(--bmo-ease-enter)] data-[state=closed]:animate-[fade-out_var(--bmo-motion-pop)_var(--bmo-ease-exit)]";

export default defineAppConfig({
  ui: {
    // The marks Nuxt UI draws on its own components, in the one icon set this console uses.
    icons: {
      arrowDown: "i-material-symbols-arrow-downward",
      arrowLeft: "i-material-symbols-arrow-back",
      arrowRight: "i-material-symbols-arrow-forward",
      arrowUp: "i-material-symbols-arrow-upward",
      caution: "i-material-symbols-error-outline",
      check: "i-material-symbols-check",
      chevronDoubleLeft: "i-material-symbols-keyboard-double-arrow-left",
      chevronDoubleRight: "i-material-symbols-keyboard-double-arrow-right",
      chevronDown: "i-material-symbols-keyboard-arrow-down",
      chevronLeft: "i-material-symbols-chevron-left",
      chevronRight: "i-material-symbols-chevron-right",
      chevronUp: "i-material-symbols-keyboard-arrow-up",
      close: "i-material-symbols-close",
      copy: "i-material-symbols-content-copy-outline",
      copyCheck: "i-material-symbols-library-add-check-outline",
      dark: "i-material-symbols-dark-mode-outline",
      drag: "i-material-symbols-drag-indicator",
      ellipsis: "i-material-symbols-more-horiz",
      error: "i-material-symbols-cancel-outline",
      external: "i-material-symbols-arrow-outward",
      eye: "i-material-symbols-visibility-outline",
      eyeOff: "i-material-symbols-visibility-off-outline",
      file: "i-material-symbols-draft-outline",
      folder: "i-material-symbols-folder-outline",
      folderOpen: "i-material-symbols-folder-open-outline",
      hash: "i-material-symbols-tag",
      info: "i-material-symbols-info-outline",
      light: "i-material-symbols-light-mode-outline",
      loading: "i-material-symbols-progress-activity",
      menu: "i-material-symbols-menu",
      minus: "i-material-symbols-remove",
      panelClose: "i-material-symbols-left-panel-close-outline",
      panelOpen: "i-material-symbols-left-panel-open-outline",
      plus: "i-material-symbols-add",
      reload: "i-material-symbols-refresh",
      search: "i-material-symbols-search",
      stop: "i-material-symbols-stop-outline",
      star: "i-material-symbols-star-outline",
      success: "i-material-symbols-check-circle-outline",
      system: "i-material-symbols-desktop-windows-outline",
      tip: "i-material-symbols-lightbulb-outline",
      upload: "i-material-symbols-upload",
      warning: "i-material-symbols-warning-outline"
    },
    // The library's own colours are the default theme's; the account's theme is stated over them in
    // the page's head (docs/web.md, 「Themes」).
    colors: {
      primary: DEFAULT_THEME.accent,
      neutral: DEFAULT_THEME.neutral
    },
    // The sidebar stands beside the panels and is held to the same floor for the same reason: it
    // is a column of the shell and takes the shell's height by standing in it, so a floor of its
    // own only makes it taller than the shell whenever the shell is shorter than the window — and
    // what goes over the edge is the foot of it, where their own account and the word that the news
    // has stopped arriving stand.
    // Nothing is drawn under 14px, so the small avatars' initial and the two small badge sizes
    // keep their tight boxes and take the caption size.
    avatar: {
      variants: {
        size: {
          "3xs": { root: "size-4 text-sm/4" },
          "2xs": { root: "size-5 text-sm/5" }
        }
      }
    },
    // Every badge carries the class that darkens its colours in the light theme (main.css), so its
    // words read at 4.5:1 whatever shape and colour it is given.
    badge: {
      slots: {
        base: "badge-ink"
      },
      variants: {
        size: {
          xs: { base: "text-sm/4 px-1 py-0 gap-1 rounded-sm" },
          sm: { base: "text-sm/4 px-1.5 py-0.5 gap-1 rounded-sm" }
        }
      }
    },
    // A tooltip's words are drawn under the floor by default, and they are the only words that say
    // what an icon button does. They take the caption size in the box the library already gave
    // them, tightened to that box's own line so the tooltip keeps its height.
    tooltip: {
      slots: {
        content: `text-sm/4 ${GROWS_AFTER_DELAY}`
      }
    },
    // The marker under the chosen tab moves to the next one as a thing changing state where it stands.
    // A tab stands in a strip that scrolls sideways and cuts whatever reaches past it, so its focus
    // ring is drawn inside its own edge (main.css, `focus-inset`).
    tabs: {
      slots: {
        trigger: "focus-inset",
        indicator: "duration-(--bmo-motion-quick) ease-(--bmo-ease-move)"
      }
    },
    collapsible: {
      slots: {
        content: UNFOLDS
      }
    },
    // A group of the sidebar's pages opens under its heading the way any folded region does.
    navigationMenu: {
      compoundVariants: [{ orientation: "vertical", collapsed: false, class: { content: UNFOLDS } }]
    },
    // A key's name on a shortcut hint is drawn at three sizes the library names in pixels, under
    // the floor and out of reach of the stylesheet's own step, so each takes the caption size in
    // the box it already had.
    kbd: {
      variants: {
        size: {
          sm: "h-4 min-w-[16px] text-sm/4",
          md: "h-5 min-w-[20px] text-sm/5",
          lg: "h-6 min-w-[24px] text-sm/6"
        }
      }
    },
    // A checkbox is pressed like a button and has to answer like one, and the library leaves both the
    // box and the words beside it the page's own cursor and one colour whether a pointer is over them
    // or not. Every checkbox of this console takes the hand and lightens under the pointer and again
    // under the press. It lightens rather than taking a background: a checked box is filled edge to
    // edge by its own mark, and a colour laid behind that would never be seen.
    checkbox: {
      slots: {
        base: "enabled:cursor-pointer enabled:hover:opacity-80 enabled:active:opacity-60",
        label: "cursor-pointer"
      }
    },
    // A switch is pressed like a button and has to answer like one: the library leaves it the page's
    // own cursor and the one track colour whether a pointer is over it or not, so hovering one says
    // nothing back. Every switch of this console takes the hand and lightens its track under the
    // pointer and again under the press, whichever side it stands on and whatever colour it carries.
    // Its label is drawn under the floor at the two small sizes, and takes the caption size instead.
    switch: {
      slots: {
        base: "enabled:cursor-pointer enabled:hover:opacity-80 enabled:active:opacity-60"
      },
      variants: {
        size: {
          xs: { wrapper: "text-sm" },
          sm: { wrapper: "text-sm" }
        }
      }
    },
    dashboardSidebar: {
      slots: {
        root: "min-h-0"
      }
    },
    // The column width is what the content itself stands at; the container's own side room is
    // added outside it at each width, so text never reads narrower than the column because the
    // container that holds it pads itself. The room is said as a variable of the container's own,
    // which the panel's width rule below adds to the column for whatever it holds.
    container: {
      base: "[--bmo-inset:2rem] sm:[--bmo-inset:3rem] lg:[--bmo-inset:4rem] max-w-[calc(var(--ui-container)+var(--bmo-inset))]"
    },
    // A dropdown is never narrower than its longest item, so no choice is cut, and never wider than
    // the screen, so none runs off a phone. Where the longest item is wider than the screen the
    // list stands at the screen's width and its items scroll sideways together, uncut: a choice
    // shortened with an ellipsis is one that cannot be told from its neighbour. Every list that
    // drops from a control is held to it here, so a list written later cannot be the one that
    // forgot. The cap is the screen rather than the room measured beside the control: a list
    // opened near an edge is slid back inside rather than squeezed against it.
    // A select's own list stands as a popper, and its growing is said on that position rather than on
    // the list itself, so the console's timing is said there too. The heading of a group of choices is
    // drawn under the floor at the two small sizes, and takes the caption size instead.
    select: {
      slots: dropdown("min-w-[min(var(--reka-select-trigger-width),calc(100vw-1rem))]"),
      variants: { position: { popper: { content: GROWS } }, size: HEADINGS_AT_CAPTION }
    },
    selectMenu: {
      slots: dropdown("min-w-[min(var(--reka-combobox-trigger-width),calc(100vw-1rem))]"),
      variants: { position: { popper: { content: GROWS } }, size: HEADINGS_AT_CAPTION }
    },
    inputMenu: { slots: dropdown("min-w-[min(var(--reka-combobox-trigger-width),calc(100vw-1rem))]") },
    // A list that drops for a value it shows is floored at its control's width, so it lines up under
    // what it replaces. A menu dropped from a button or a pointer is not: the button says nothing
    // of the menu's content, and the library's own fixed minimum leaves a short menu standing half
    // empty, so it is taken back to none.
    dropdownMenu: { slots: dropdown("min-w-0") },
    contextMenu: { slots: dropdown("min-w-0") },
    // A dialog stands in the part of the screen that can be seen. On a phone the keyboard covers
    // the foot of the window while a field in the dialog is being written in, and a dialog centred
    // on the whole window puts its field and its buttons behind the keys; centred on what is
    // visible, it stays above them. What is visible leaves out the bars a phone lays over its own
    // page, so a tall dialog stands clear of the status bar and the gesture bar alike.
    //
    // It comes and goes by the console's own movement rather than the library's, which grows every
    // dialog out of its own middle: here it grows out of the control pressed to open it, and only
    // fades where nothing was (`~/domain/dialog-origin`).
    modal: {
      variants: {
        transition: {
          true: {
            overlay: SHADES,
            content: "data-[state=open]:animate-[bmo-dialog-in_var(--bmo-motion-pop)_var(--bmo-ease-enter)] data-[state=closed]:animate-[bmo-dialog-out_var(--bmo-motion-pop)_var(--bmo-ease-exit)]"
          }
        }
      },
      compoundVariants: [
        // A dialog that fills the screen stands and goes at once: its final shape is the screen
        // itself, so any size it passes through on the way is a shape that fits nothing.
        {
          transition: true,
          fullscreen: true,
          class: {
            overlay: "data-[state=open]:animate-none data-[state=closed]:animate-none",
            content: "data-[state=open]:animate-none data-[state=closed]:animate-none"
          }
        },
        {
          scrollable: false,
          fullscreen: false,
          class: {
            content:
              "top-[calc(var(--bmo-screen-top)+var(--bmo-safe-top)+(var(--bmo-screen)-var(--bmo-safe-top)-var(--bmo-safe-bottom))/2)] max-h-[calc(var(--bmo-screen)-var(--bmo-safe-top)-var(--bmo-safe-bottom)-2rem)] sm:max-h-[calc(var(--bmo-screen)-var(--bmo-safe-top)-var(--bmo-safe-bottom)-4rem)]"
          }
        }
      ]
    },
    // A sheet that reaches the foot of the screen keeps what it holds above a phone's gesture bar:
    // the room the bar takes is added inside the sheet's own box, under whatever padding its content
    // keeps, so its colour still runs to the edge while its last line stands as far from the bar as
    // every other sheet's does. The phone's sidebar is one of these drawers, so it is held too.
    drawer: {
      compoundVariants: [{ direction: ["bottom", "left", "right"], class: { content: "pb-(--bmo-safe-bottom)" } }]
    },
    slideover: {
      variants: {
        transition: {
          true: { overlay: SHADES }
        }
      },
      compoundVariants: [
        { side: ["bottom", "left", "right"], class: { content: "pb-(--bmo-safe-bottom)" } },
        {
          transition: true,
          side: "top",
          class: {
            content:
              "data-[state=open]:animate-[slide-in-from-top_var(--bmo-motion-pop)_var(--bmo-ease-enter)] data-[state=closed]:animate-[slide-out-to-top_var(--bmo-motion-pop)_var(--bmo-ease-exit)]"
          }
        },
        {
          transition: true,
          side: "right",
          class: {
            content:
              "data-[state=open]:animate-[slide-in-from-right_var(--bmo-motion-pop)_var(--bmo-ease-enter)] data-[state=closed]:animate-[slide-out-to-right_var(--bmo-motion-pop)_var(--bmo-ease-exit)]"
          }
        },
        {
          transition: true,
          side: "bottom",
          class: {
            content:
              "data-[state=open]:animate-[slide-in-from-bottom_var(--bmo-motion-pop)_var(--bmo-ease-enter)] data-[state=closed]:animate-[slide-out-to-bottom_var(--bmo-motion-pop)_var(--bmo-ease-exit)]"
          }
        },
        {
          transition: true,
          side: "left",
          class: {
            content:
              "data-[state=open]:animate-[slide-in-from-left_var(--bmo-motion-pop)_var(--bmo-ease-enter)] data-[state=closed]:animate-[slide-out-to-left_var(--bmo-motion-pop)_var(--bmo-ease-exit)]"
          }
        }
      ]
    },
    // The title bar's parts stand 4px apart, as every spacing is a multiple of 4px, and the screen's mark 12px from its
    // name (docs/web.md, 「The title bar」).
    dashboardNavbar: {
      slots: {
        root: "gap-1",
        left: "gap-1",
        icon: "me-2",
        right: "gap-1"
      }
    },
    dashboardPanel: {
      slots: {
        // A panel takes the height it is given and no more. On its own a panel asks for a whole
        // screen of height as its floor, which is right where the panel is the whole screen and
        // wrong here: the strips that stand over every screen — what is playing, and a job that
        // has stopped to ask something — take their own height out of the column first, and a
        // panel that still insists on a full screen is that much taller than the room left for
        // it. The shell clips rather than scrolls, so what goes over the edge is the foot of the
        // panel: the box being typed in. The floor is lifted here so the panel shrinks to its share.
        root: "min-h-0",
        // Every screen's content stands in the one column width this console reads at — the
        // number is --ui-container in main.css — centred in whatever is left over. It is set
        // here on the panel every screen is built out of rather than on each screen, so a
        // screen added later stands the same width without being told, and so the width cannot
        // drift into as many values as there are pages. A screen that must be wider says so on
        // its own panel: the DB screen does, because a table is read by running the eye across
        // it.
        //
        // A thing it holds that pads its own sides — a container — says how much in --bmo-inset, and
        // stands that much wider, so its content still reads at the column width.
        //
        // What carries the width is what the panel holds, not the panel's body itself: the body
        // is the box that scrolls, and a scroll box narrowed to the column puts its scrollbar
        // beside the text instead of at the edge of the window. So the box stays as wide as the
        // screen and each thing standing in it is what stops at the column.
        //
        // The room the content stands in is written here too, and the foot of it is the point: a
        // screen whose last row ends exactly where the scroll ends reads as cut off rather than
        // finished. It is the same room on all four sides, so there is one pair of numbers and
        // not a bottom of its own. Stating it here rather than leaving it to the component's own
        // default is what makes it this console's rule instead of something inherited that could
        // go quiet: a screen may still stand its content flush by saying so, and the ones that do
        // are the ones with something at the foot below this box.
        body: "p-4 sm:p-6 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[calc(var(--ui-container)+var(--bmo-inset,0px))]"
      }
    },
    popover: {
      slots: {
        // A popover is drawn beside what opened it and grows to whatever it was given, so a
        // panel that runs long runs straight off the bottom of a phone and its tail cannot be
        // reached at all. The room it actually has was worked out for it before it was drawn:
        // the popper publishes the height and the width left between the thing that opened it
        // and the edge of the window, and taking the ceiling from there means no screen measures
        // the window for itself and no panel is held to a number that stops being true the
        // moment its trigger moves. Past that ceiling the panel scrolls, by wheel or by finger,
        // and the scroll stops at its own edge instead of carrying on into the page behind it.
        //
        // It is said here rather than on each popover for the reason the column width is: a
        // popover written later cannot be the one that forgot, and a panel that fits today fits
        // by luck. What a popover says about its own width is untouched — where there is room
        // the shape it was given stands, and the ceiling binds only where there is not.
        content: `max-h-(--reka-popover-content-available-height) max-w-(--reka-popover-content-available-width) overflow-y-auto overscroll-contain ${GROWS}`
      }
    },
    // The bar every message box is written in wears its focus on the bar itself (main.css, `focus-bar`).
    chatPrompt: {
      slots: {
        root: "focus-bar"
      }
    },
    textarea: {
      slots: {
        // A box to write in stands the width of what holds it, wherever it stands. On its own a
        // textarea is an inline thing that takes the width of a couple of dozen letters, so in a
        // plain block — a card, a panel of an item — it comes out narrower than the fields above
        // and below it, while in a column of flexed boxes it is stretched to the full width by
        // its parent. That is one control reading two ways for a reason nobody looking at the
        // screen can see. It is settled here, once, rather than by each screen remembering to
        // say it.
        root: "w-full"
      }
    }
  }
});
