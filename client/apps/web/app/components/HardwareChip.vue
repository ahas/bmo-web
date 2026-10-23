<!-- The chip as it physically stands (bmo-node's docs/hardware.md, 「The chip」): the package's dies in their
     places, and inside each die the cores, the cache and the other parts where they sit. It is one
     drawing rather than boxes inside boxes: the package is an outline in its temperature's colour,
     and every die, part and core is a cell of it, parted from its neighbours by a hairline and told
     apart by its fill. Each core is filled in the neutral colour as far across as its use reaches; a
     die carries its temperature where a sensor reports one, coloured against the CPU's limit as the
     package's outline is, and each cache is a strip in the cache's own colour. Compact, as a tile draws
     it, the dies, cores and caches keep their places and colours in an area of one height whatever
     the chip, its rows of dies sharing that height, and the words, the parts that are only a name
     and the empty places on the package are left out. -->
<template>
  <!-- The hairlines between dies are the package showing through a one-pixel gap. -->
  <div
    class="flex flex-col gap-px border bg-(--ui-border)"
    :class="[heatClasses(temperatureHeat(chip.celsius, limit)).border, compact ? 'h-20' : '']"
    :aria-hidden="compact ? 'true' : undefined"
  >
    <div v-for="(row, r) in chip.rows" :key="r" class="flex flex-wrap gap-px" :class="compact ? (cored(row) ? 'min-h-0 flex-1' : 'shrink-0') : ''">
      <template v-for="(die, d) in placed(row)" :key="d">
        <!-- A place on the package with no die in it keeps its room, so the die beside it stands
             where it physically does. -->
        <div v-if="die === null" class="hidden min-w-24 flex-1 bg-default sm:block" />

        <div
          v-else
          class="flex min-w-0 flex-1 flex-col divide-y divide-default"
          :class="[die.role === 'io' ? 'bg-elevated' : 'bg-default', compact ? 'min-h-3 min-w-24' : 'min-w-64']"
        >
          <div v-if="!compact" class="flex items-center justify-between gap-2 px-2 py-1 text-sm">
            <span class="font-medium">{{ die.label }}</span>
            <span v-if="die.role === 'compute'" class="tabular-nums" :class="heatClasses(temperatureHeat(die.celsius, limit)).text">{{ celsiusText($t, die.celsius) }}</span>
          </div>

          <div
            v-if="drawn(die).length > 0"
            class="flex min-h-0 flex-1"
            :class="die.direction === 'column' ? 'flex-col divide-y divide-default' : 'flex-row divide-x divide-default'"
          >
            <template v-for="(item, i) in drawn(die)" :key="i">
              <div
                v-if="item.kind === 'part'"
                class="flex items-center justify-center text-sm text-muted"
                :class="[item.off ? 'bg-default opacity-60' : 'bg-elevated', die.direction === 'row' ? 'px-1 py-2' : 'px-2 py-1']"
              >
                <span :class="die.direction === 'row' ? '[writing-mode:vertical-rl]' : ''">{{ item.off ? $t("hardware.label.off_named", { label: item.label }) : item.label }}</span>
              </div>

              <div
                v-else
                class="grid min-w-0 flex-1 divide-x divide-default"
                :class="item.right.length > 0 ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_auto]'"
              >
                <HardwareCores :cores="item.left" :compact="compact" />
                <div class="flex items-center justify-center text-sm" :class="[CACHE, compact ? 'w-3' : 'px-1']">
                  <span v-if="!compact" class="[writing-mode:vertical-rl]">{{ item.label }} · {{ item.cache }}</span>
                </div>
                <HardwareCores v-if="item.right.length > 0" :cores="item.right" :compact="compact" />
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { celsiusText, heatClasses, temperatureHeat } from "~/domain/hardware";

import type { ChipView, DieView } from "#shared/types";

// The CPU's limit the package and its dies are coloured against; none where it is not known.
const props = withDefaults(defineProps<{ chip: ChipView; limit?: number | null; compact?: boolean }>(), { limit: null, compact: false });

// A cache's own tint and words, outside the heat steps and apart from the parts' grey.
const CACHE = "bg-sky-500/25 text-sky-800 dark:bg-sky-400/30 dark:text-sky-100";

// Compact, a place on the package that holds no die is left out, so the dies there take the width.
function placed(row: (DieView | null)[]): (DieView | null)[] {
  return props.compact ? row.filter((die) => die !== null) : row;
}

// Compact, a part that is only its name would stand as a bare grey band, so only the cores are drawn.
function drawn(die: DieView): DieView["items"] {
  return props.compact ? die.items.filter((item) => item.kind !== "part") : die.items;
}

// Compact, the rows holding cores share the chip's height and a row of no cores keeps only its own.
function cored(row: (DieView | null)[]): boolean {
  return row.some((die) => die?.items.some((item) => item.kind === "cluster"));
}
</script>
