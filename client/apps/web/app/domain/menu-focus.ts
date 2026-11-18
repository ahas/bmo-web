// A menu whose item opened a dialog hands its trigger no focus (docs/web.md, 「Focus」): the menu gives the focus
// back once its leaving is drawn, which on a phone comes after the dialog has taken it, so while a dialog stands open
// the menu keeps it to itself and the focus stays in the dialog.

/** A menu content's `onCloseAutoFocus`: refused while a dialog stands open. */
export function keepDialogFocus(event: Event): void {
  if (document.querySelector('[role="dialog"][data-state="open"]') !== null) event.preventDefault();
}
