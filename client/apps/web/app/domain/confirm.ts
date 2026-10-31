import { ConfirmDialog } from "#components";
import { useOverlay } from "#imports";

// A question the reader answers before an action (docs/web.md, 「Messages」): the component library's dialog, opened
// over everything standing, never the message pill, which tells and never asks.
export interface ConfirmAsked {
  // The question, naming the action.
  title: string;
  // The item the action is taken on, as the screen names it, where the question does not already name it.
  item?: string | null;
  // What going through does, where it is more than the question says.
  effect?: string | null;
  // The way through: the action's own verb.
  confirm: string;
  // The way out, the console's cancel when left out.
  cancel?: string;
}

// Answers whether the reader went through with it. Every way out — its cancel, the close, Esc, a press outside, the
// back gesture — answers no. Each question is a dialog of its own, taken off the page once it has gone.
export function useConfirm(): (asked: ConfirmAsked) => Promise<boolean> {
  const overlay = useOverlay();

  return async (asked) => (await overlay.create(ConfirmDialog, { props: asked, destroyOnClose: true }).open()) === true;
}
