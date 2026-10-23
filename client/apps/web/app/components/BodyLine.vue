<!-- The one line that is all a body holds — its list standing empty, or the unit it reads not answering —
     centred in that body across and down, in the quiet colour (docs/web.md, 「Where a list stands empty」). The
     body it stands in gives it the room to grow into. -->
<template>
  <div class="flex grow flex-col items-center justify-center py-16 text-center">
    <p class="text-sm text-muted">
      <slot />
    </p>
  </div>
</template>
