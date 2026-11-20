<template>
  <!-- A chip that is pressed. It stands among badges, so it is one of them, of the same tier, height and padding as
       the small badge beside it, and its colour, icon and words are the badge's own, handed through. Like every pressed
       thing it changes colour on hover and on press, each a deeper tint of its own words' colour, so it reads in every
       colour a chip takes. -->
  <UBadge as="button" type="button" variant="subtle" size="sm" class="cursor-pointer transition-colors hover:bg-current/15 active:bg-current/25">
    <template v-if="$slots.default" #default><slot /></template>
  </UBadge>
</template>
