import { h } from "vue";

import { drawnSet } from "#shared/drawn-pictures";

import type { FunctionalComponent } from "vue";

// The image element a face is drawn in (docs/web.md, 「A picture drawn small」): the kept picture's address, and every
// step of its copies for the browser to choose from by the width the face stands at. The avatar hands its element the
// width its size draws it at, which is the width named here; with none handed, the width is the one it is laid out at,
// which the browser reads only of a picture loaded as it comes into view.
export const DrawnImage: FunctionalComponent = (_, { attrs }) => {
  const src = typeof attrs.src === "string" ? attrs.src : "";
  const width = Number(attrs.width);
  const sized = Number.isFinite(width) && width > 0;

  return h("img", { ...attrs, srcset: src === "" ? undefined : drawnSet(src), sizes: sized ? `${width}px` : "auto", loading: sized ? attrs.loading : "lazy" });
};

DrawnImage.displayName = "DrawnImage";
