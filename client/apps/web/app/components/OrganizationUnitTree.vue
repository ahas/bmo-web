<template>
  <!-- The units tab's tree (docs/web.md, 「Organisation settings」, its chart): companies at its top, each unit
       under its parent to any depth. A press on a unit chooses it and leaves its branch as it is; the chevron at a
       branch's end, or an arrow key, opens or closes the branch in place. What stands open is the screen's, so it
       outlives the drawer. Every name stands whole: the tree is as wide as its widest row, and what holds it scrolls
       sideways where it is wider. -->
  <UTree
    v-model:expanded="expanded"
    :items="items"
    :model-value="chosenItem"
    :get-key="(item: UnitItem) => String(item.id)"
    :as="{ link: 'div' }"
    color="neutral"
    :ui="{ linkLabel: 'flex-1 overflow-visible text-clip whitespace-nowrap' }"
    :on-toggle="keepOnPress"
    @update:model-value="(item: unknown) => choose(item as UnitItem | undefined)"
  >
    <!-- A unit's name marks its row for people carried over the tree, and stands lit while they would land there. -->
    <template #item-label="{ item }">
      <span :data-unit-drop="item.id" class="rounded-sm" :class="props.dropping === item.id ? 'bg-primary/15 ring-1 ring-primary' : ''">{{ item.label }}</span>
    </template>
    <!-- The chevron's own box overhangs the row's line rather than making a branch's row taller than a leaf's. -->
    <template #item-trailing="{ item, expanded: open, handleToggle }">
      <UTooltip v-if="item.children?.length" :text="$t(open ? 'organization.action.collapse' : 'organization.action.expand')">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          tabindex="-1"
          class="-my-1"
          icon="i-material-symbols-chevron-right"
          :aria-label="$t(open ? 'organization.action.collapse' : 'organization.action.expand')"
          :aria-expanded="open"
          :ui="{ leadingIcon: ['transition-transform motion-reduce:transition-none', open ? 'rotate-90' : ''] }"
          data-unit-branch-toggle
          @click.stop="handleToggle()"
        />
      </UTooltip>
    </template>
  </UTree>
</template>

<script setup lang="ts">
import { isCompany, unitBranches } from "~/domain/organization";

import type { TreeItem } from "@nuxt/ui";
import type { UnitBranch, UnitPlace } from "~/domain/organization";

interface Props {
  units: readonly UnitPlace[];
  chosen: number | null;
  // The unit people carried from the unit chosen would be moved into, lit while they stand over it.
  dropping?: number | null;
}

type UnitItem = TreeItem & { id: number; label: string; children?: UnitItem[] };

const props = withDefaults(defineProps<Props>(), { dropping: null });
const emit = defineEmits<{ choose: [unit: number] }>();
// The keys of the branches standing open, kept by the screen.
const expanded = defineModel<string[]>("expanded", { required: true });

function itemOf(branch: UnitBranch<UnitPlace>): UnitItem {
  const { unit, children } = branch;

  return {
    id: unit.id,
    label: unit.name,
    icon: isCompany(unit) ? "i-material-symbols-domain" : "i-material-symbols-groups-outline",
    children: children.length === 0 ? undefined : children.map(itemOf)
  };
}

const items = computed(() => unitBranches(props.units).map(itemOf));

const chosenItem = computed(() => {
  const find = (among: UnitItem[]): UnitItem | undefined => {
    for (const item of among) {
      const found = item.id === props.chosen ? item : find(item.children ?? []);

      if (found !== undefined) return found;
    }

    return undefined;
  };

  return props.chosen === null ? undefined : find(items.value);
});

// A press on the row chooses alone; the chevron and the arrow keys open and close.
function keepOnPress(event: CustomEvent<{ originalEvent: Event }>): void {
  if (event.detail.originalEvent.type === "click") event.preventDefault();
}

// The tree takes a press on the unit already chosen as a choice of none, which keeps the unit where it is.
function choose(item: UnitItem | undefined): void {
  if (item !== undefined) emit("choose", item.id);
}
</script>
