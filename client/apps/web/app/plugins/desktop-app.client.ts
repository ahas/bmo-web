import { probeDesktopApp, useDesktopApp } from "~/domain/desktop-app";

// Whether the console runs in the desktop app's window, asked of the app's bridge once as the page is first drawn
// (docs/web.md, 「The desktop app's window」). The page's root carries who draws the window's controls, so the room
// kept for the system's own is kept by the stylesheet alone; in a browser nothing answers and nothing is marked.
export default defineNuxtPlugin(() => {
  const app = useDesktopApp();

  void probeDesktopApp().then((found) => {
    app.value = found;
    if (found !== null) document.documentElement.dataset.windowControls = found.windowControls;
  });
});
