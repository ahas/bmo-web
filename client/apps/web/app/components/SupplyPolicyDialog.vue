<template>
  <!-- One supply policy written whole: the sources it allows, in the order a run falls through them, and the
       monthly cap on personal credits where the policy kind carries one (docs/web.md, 「System and organisation」, the
       supply tab; the settings' supply section). The allowed sources are carried to another place by the handle at
       each row's left, by the pointer or by its arrow keys, and the order waits for the form's one save like
       everything else in it. The platform's form carries beside each source a second switch, whether a
       person's own setting may change it, and under the sources one more of it for the order (「System and
       organisation」, the
       credits tab). An organisation's form is handed what the platform makes available, and a source out of it
       stands with its switch off and disabled and the words saying the platform has it off. One save at the foot
       sends the whole form, open only while it differs from what opened; the writer answers every refusal, which
       stands in the dialog. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="changes">
    <div ref="orderList" class="flex flex-col divide-y divide-default">
      <div
        v-for="one in placed"
        :key="one.source"
        class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-3"
        :class="one.place === null ? '' : orderDrag.mark(one.place)"
        :data-supply-policy-row="one.source"
        :data-order-index="one.place ?? undefined"
      >
        <OrderHandle :place="one.place" :drag="orderDrag" :name="sourceLabel(t, one.source)" />
        <span class="flex min-w-0 grow basis-40 flex-col">
          <span class="text-sm" :class="isAllowed(one.source) ? 'text-highlighted' : 'text-muted'">{{ sourceLabel(t, one.source) }}</span>
          <span v-if="!isAvailable(one.source)" class="text-sm text-muted" data-supply-policy-platform-off>{{ $t("supply.label.platform_off") }}</span>
        </span>
        <span v-if="one.source !== 'stop'" class="flex shrink-0 items-center gap-2">
          <USwitch :model-value="isAllowed(one.source)" :disabled="!isAvailable(one.source)" :aria-label="$t('supply.aria.source_switch', { name: sourceLabel(t, one.source) })" @update:model-value="(on: boolean) => void toggle(one.source, on)" />
        </span>
        <USwitch
          v-if="props.overrides && one.source !== 'stop'"
          :model-value="overridable.includes(one.source)"
          :label="$t('supply.label.overridable')"
          :aria-label="$t('supply.aria.source_overridable', { name: sourceLabel(t, one.source) })"
          class="shrink-0"
          data-supply-policy-overridable
          @update:model-value="(on: boolean) => setOverridable(one.source, on)"
        />
      </div>
      <div v-if="props.overrides" class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-3" data-supply-policy-row="order">
        <OrderHandle :place="null" :drag="orderDrag" :name="$t('supply.label.order')" />
        <span class="flex min-w-0 grow basis-40 flex-col">
          <span class="text-sm text-highlighted">{{ $t("supply.label.order") }}</span>
        </span>
        <USwitch v-model="orderOverridable" :label="$t('supply.label.overridable')" :aria-label="$t('supply.aria.order_overridable')" class="shrink-0" data-supply-policy-overridable />
      </div>
    </div>

    <UFormField v-if="props.cap" :label="$t('supply.label.member_credit_cap')" name="cap">
      <UInput v-model="capWords" class="w-40 text-end tabular-nums" inputmode="numeric" :placeholder="$t('supply.label.cap_none')" :aria-label="$t('supply.label.member_credit_cap')" />
    </UFormField>

    <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value || capBad" @click="void save()" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { useRowDrag } from "~/domain/row-drag";
import { POLICY_SOURCES, draftRows, sourceLabel } from "~/domain/supply";

import type { PolicyDraft, PolicyWrite } from "~/domain/supply";
import type { SupplySource } from "#shared/supply";

interface Props {
  title: string;
  // What the form opens with: the standing policy, or what is in force above where none stands.
  draft: PolicyDraft;
  // Whether this policy kind carries the per-person monthly cap on organisation credits.
  cap?: boolean;
  // Whether this policy kind says what a person's own setting may change: the platform's alone.
  overrides?: boolean;
  // Who writes the policy: the unit's, the person's or the platform's own route, as the caller holds it.
  send: (policy: PolicyWrite) => Promise<unknown>;
  // The sources the platform makes available to this policy, where the form is handed them: a source out of them is
  // off for every layer, and the form neither opens it nor keeps it. None handed, every source stands open.
  available?: readonly SupplySource[] | null;
}

const props = withDefaults(defineProps<Props>(), { cap: true, overrides: false, available: null });
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();

const allowed = ref<SupplySource[]>([]);
const order = ref<SupplySource[]>([]);
const capWords = ref("");
const overridable = ref<SupplySource[]>([]);
const orderOverridable = ref(false);
const busy = ref(false);
const failure = ref("");

// The form stands filled at each opening, and its opened-with values are read then, not before.
watch(open, (standing) => {
  if (!standing) return;

  allowed.value = props.draft.allowed.filter(isAvailable);
  order.value = props.draft.order.filter((one) => one === "stop" || isAvailable(one));
  capWords.value = props.draft.memberCreditCredits === null ? "" : String(props.draft.memberCreditCredits);
  overridable.value = [...props.draft.overridable];
  orderOverridable.value = props.draft.orderOverridable;
  failure.value = "";
});

// Which sources a person may change is a set, compared whatever order its switches were thrown in.
const changes = useOpenedWith(
  () => ({ allowed: allowed.value.join(","), order: order.value.join(","), cap: capWords.value.trim(), overridable: [...overridable.value].sort().join(","), orderOverridable: orderOverridable.value }),
  { open }
);

const rows = computed<SupplySource[]>(() => draftRows({ allowed: allowed.value, order: order.value }));

// Each row and the place it holds in the order the reader carries: the sources switched on stand in that order,
// while one switched off, the end of the fall and a source the platform keeps off stand outside it and hold no
// place a carry moves.
const placed = computed<{ source: SupplySource; place: number | null }[]>(() => {
  const carried = openRows();

  return rows.value.map((source) => {
    const at = carried.indexOf(source);

    return { source, place: at < 0 ? null : at };
  });
});

// The form holds the order until its one save sends it, so a carry is answered here and nowhere else.
const orderList = ref<HTMLElement | null>(null);
const orderDrag = useRowDrag({ list: orderList, ready: () => !busy.value, drop: (from, to) => movePlace(from, to) });

// The order with one source set down on another's place; `stop` stays the end of the fall it is.
function movePlace(from: number, to: number): void {
  const next = openRows();
  const [taken] = next.splice(from, 1);

  if (taken === undefined) return;

  next.splice(to, 0, taken);
  order.value = [...next, "stop"];
}

function setOverridable(source: SupplySource, on: boolean): void {
  overridable.value = on ? [...overridable.value.filter((one) => one !== source), source] : overridable.value.filter((one) => one !== source);
}

function isAvailable(source: SupplySource): boolean {
  return source === "stop" || props.available === null || props.available.includes(source);
}

function isAllowed(source: SupplySource): boolean {
  return source === "stop" || allowed.value.includes(source);
}

function openRows(): SupplySource[] {
  return rows.value.filter((one) => one !== "stop" && isAllowed(one));
}

// A source switched on takes the last place among the allowed ones; switched off, it drops out of the order and
// its place is kept where it was for the time it comes back.
function toggle(source: SupplySource, on: boolean): void {
  if (on) {
    allowed.value = [...allowed.value, source];
    order.value = [...openRows().filter((one) => one !== source), source, "stop"];
  } else {
    allowed.value = allowed.value.filter((one) => one !== source);
    order.value = order.value.filter((one) => one !== source && one !== "stop").concat("stop");
  }
}

const capOk = computed(() => capWords.value.trim() === "" || /^[1-9][0-9]*$/.test(capWords.value.trim()));
const capBad = computed(() => props.cap === true && !capOk.value);

// The order a save writes: the sources switched on, in their order; for the platform's form the sources a person may
// switch on as well, after them, since a person's own order may hold any of them.
function writtenOrder(): SupplySource[] {
  return props.overrides ? rows.value.filter((one) => one !== "stop" && (isAllowed(one) || overridable.value.includes(one))) : openRows();
}

// A save that went through closes the form at once: what it held is saved, so closing asks nothing.
async function save(): Promise<void> {
  if (busy.value || !changes.dirty.value || capBad.value) return;

  busy.value = true;
  failure.value = "";
  try {
    await props.send({
      allowed: openRows(),
      order: [...writtenOrder(), "stop"],
      memberCreditCredits: capWords.value.trim() === "" ? null : Number(capWords.value.trim()),
      overridable: POLICY_SOURCES.map((one) => one.value).filter((one) => overridable.value.includes(one)),
      orderOverridable: orderOverridable.value
    });

    emit("saved");
    open.value = false;
  } catch (error) {
    failure.value = failureText(error, t("supply.error.policy_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
