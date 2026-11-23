<template>
  <!-- The tail a run's last bubble hangs off its foot on the photo's side, in the bubble's own
       colour (docs/web.md, 「The run's last bubble carries the tail」). It fills the step between the
       bubble and the photo up to the height of the photo's centre, less the photo circle grown by
       that step, so its concave edge runs at one distance round the photo. It reaches a pixel into
       the bubble under the bubble's square corner, in the bubble's own ground, so the two are one
       shape at every pixel ratio rather than two shapes meeting along an edge the browser may draw a
       seam on. Grown, it is the same tail widened on its outer edges by the length its consumer gives,
       in its consumer's colour, for a ring drawn round it. -->
  <span
    aria-hidden="true"
    class="pointer-events-none absolute"
    :class="[props.grown ? 'bubble-tail-grown' : 'bubble-tail bottom-0', props.side === 'right' ? '-scale-x-100' : '']"
    :data-side="props.side"
  />
</template>

<script setup lang="ts">
import type { MessageSide } from "~/domain/room";

interface Props {
  side: MessageSide;
  // Whether to draw the tail grown on its outer edges by `--tail-grow`, in the current colour.
  grown?: boolean;
}

const props = withDefaults(defineProps<Props>(), { grown: false });
</script>

<style scoped>
/* Every measure of the tail is read off the photo and its step from the bubble. The photo's foot
   stands level with the bubble's foot, so its centre is a photo's radius up from that foot, which is
   the tail's top edge, and a photo's radius out past the step, which is outside the tail's leading
   edge. The arc on that centre is the photo's radius and the step together; it meets the bubble's
   side at the top, running straight down it, and the half pixel either side of it is the arc's own
   smoothing. The tail is the bubble's own ground, the very colour painted the very way, and the arc is
   only cut out of it, so tail and bubble cannot differ by a shade where they meet. The right side's tail
   is the left one turned about. */
.bubble-tail,
.bubble-tail-grown {
  --tail-face-radius: calc(var(--chat-face) / 2);
  --tail-arc-radius: calc(var(--tail-face-radius) + var(--chat-face-gap));
}

.bubble-tail {
  --tail-arc: radial-gradient(
    circle var(--tail-arc-radius) at calc(var(--tail-face-radius) * -1) 0,
    transparent calc(100% - 0.5px),
    #000 calc(100% + 0.5px)
  );
  width: calc(var(--chat-face-gap) + 1px);
  height: var(--tail-face-radius);
  background-color: var(--bubble);
  -webkit-mask-image: var(--tail-arc);
  mask-image: var(--tail-arc);
}

.bubble-tail[data-side="left"] {
  inset-inline-start: calc(var(--chat-face-gap) * -1);
}

.bubble-tail[data-side="right"] {
  inset-inline-end: calc(var(--chat-face-gap) * -1);
}

/* The tail grown by `--tail-grow` is every point that close to it: a band that far inside the arc, from
   the top, where it runs on down the bubble's side, round to the arc's foot end; a disc of that radius
   on the foot end, where the arc meets the foot line at a point; and a strip that far under the foot.
   The foot end stands where the arc crosses the foot line, at the angle below the photo's centre whose
   sine is the photo's radius over the arc's, and CSS divides no length by another, so that ratio is read
   as the tangent of the angle the two lengths make. The box reaches out past the tail's leading edge and
   under its foot by the growth; the band is cut to the arc's own angles by the conic layer, and the
   layers stand together as one mask. */
.bubble-tail-grown {
  --tail-foot-angle: asin(tan(atan2(var(--tail-face-radius), var(--tail-arc-radius))));
  --tail-foot: calc(var(--tail-arc-radius) * cos(var(--tail-foot-angle)) - var(--tail-face-radius) + var(--tail-grow));
  --tail-centre: calc(var(--tail-grow) - var(--tail-face-radius));
  bottom: calc(var(--tail-grow) * -1);
  width: calc(var(--chat-face-gap) + 1px + var(--tail-grow));
  height: calc(var(--tail-face-radius) + var(--tail-grow));
  background-color: currentColor;
  mask-image:
    radial-gradient(
      circle var(--tail-grow) at var(--tail-foot) var(--tail-face-radius),
      #000 calc(100% - 0.5px),
      transparent calc(100% + 0.5px)
    ),
    linear-gradient(#000 0 0),
    conic-gradient(from 90deg at var(--tail-centre) 0, #000 0deg, #000 var(--tail-foot-angle), transparent var(--tail-foot-angle)),
    radial-gradient(
      circle calc(var(--tail-arc-radius) - var(--tail-grow)) at var(--tail-centre) 0,
      transparent calc(100% - 0.5px),
      #000 calc(100% + 0.5px)
    );
  mask-size:
    100% 100%,
    calc(100% - var(--tail-foot)) var(--tail-grow),
    100% 100%,
    100% 100%;
  mask-position:
    0 0,
    var(--tail-foot) var(--tail-face-radius),
    0 0,
    0 0;
  mask-repeat: no-repeat;
  mask-composite: add, add, intersect, add;
}

.bubble-tail-grown[data-side="left"] {
  inset-inline-start: calc((var(--chat-face-gap) + var(--tail-grow)) * -1);
}

.bubble-tail-grown[data-side="right"] {
  inset-inline-end: calc((var(--chat-face-gap) + var(--tail-grow)) * -1);
}
</style>
