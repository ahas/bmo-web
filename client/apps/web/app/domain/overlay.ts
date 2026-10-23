import { visibleFrame } from "bmo-ui/app/domain/screen";

import type { Ref } from "vue";

// Whether something overlays the foot of the window — a phone's keyboard laid over the page rather than
// cut out of it — as the visual viewport reports it, the way the shell reads what is visible
// (docs/web.md, 「Layout fundamentals」). A pinched screen is a magnified one and overlays nothing. A
// server render knows no viewport and answers false; the browser reads it once it has the page.
export function useOverlaid(): Readonly<Ref<boolean>> {
  const overlaid = ref(false);

  if (!import.meta.client) {
    return overlaid;
  }

  const read = (): void => {
    const visual = window.visualViewport;

    overlaid.value =
      visual !== null &&
      visibleFrame({ windowHeight: window.innerHeight, height: visual.height, offsetTop: visual.offsetTop, scale: visual.scale }) !== null;
  };

  onMounted(() => {
    read();
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
  });

  onScopeDispose(() => {
    window.visualViewport?.removeEventListener("resize", read);
    window.visualViewport?.removeEventListener("scroll", read);
  });

  return overlaid;
}
