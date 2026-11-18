// A text put on the clipboard. The clipboard API is only offered on a secure origin, so a copy that it
// refuses falls back to the selection the browser has always had.
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text);

      return true;
    } catch {
      // Falls through to the textarea below.
    }
  }

  return selectionCopy(text);
}

// The selection copy copies what holds the focus, and a dialog keeps the focus inside itself, so the text is held
// inside the dialog that holds it, if any. The browser answers yes to a copy of an empty selection as readily as to
// one of the text, so the copy counts only where the text itself was selected; the focus then goes back.
function selectionCopy(text: string): boolean {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const host = before?.closest<HTMLElement>("[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog") ?? document.body;
  const holder = document.createElement("textarea");

  holder.value = text;
  holder.setAttribute("readonly", "");
  holder.setAttribute("aria-hidden", "true");
  holder.style.position = "fixed";
  holder.style.top = "0";
  holder.style.left = "0";
  holder.style.opacity = "0";
  host.appendChild(holder);
  holder.focus({ preventScroll: true });
  holder.select();

  try {
    const selected = document.activeElement === holder && holder.selectionEnd - holder.selectionStart === text.length;

    return selected && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    holder.remove();
    before?.focus({ preventScroll: true });
  }
}

// A text put on the clipboard that is still being made, such as words around a link the server is still asked for.
// A browser lets a page write the clipboard only while the press that asked for it is fresh, so this is called in
// the press itself, before anything is awaited: where the clipboard API takes an entry whose content is still to
// come, the write is begun at once and holds the press; elsewhere the text is copied once it is made, which a
// browser may refuse by then. A text that is never made copies nothing.
export async function copyPending(text: Promise<string>): Promise<boolean> {
  if (navigator.clipboard?.write !== undefined && typeof ClipboardItem !== "undefined") {
    const blob = text.then((made) => new Blob([made], { type: "text/plain" }));

    // A write refused before it reads the entry leaves a text never made unread, which is no fault of the page.
    blob.catch(() => undefined);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);

      return true;
    } catch {
      // Falls through to the copy of the text once made.
    }
  }

  try {
    return await copyText(await text);
  } catch {
    return false;
  }
}
