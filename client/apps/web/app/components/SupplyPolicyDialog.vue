<template>
  <!-- One supply policy written whole: the sources it allows, in the order a run falls through them, and the
       monthly cap on personal credits where the policy kind carries one (docs/web.md, 「Organisation」, the supply
       tab; the settings' supply section). One supply at the foot sends the whole form, open only while it differs from
       what opened; the writer answers every refusal, which stands in the dialog. -->
  <SettingsDialog v-model:open="open" :title="props.title" :dirty="changes">
    <div class="flex flex-col divide-y divide-default">
      <div v-for="(source, index) in rows" :key="source" class="flex items-center gap-x-4 py-3" :data-supply-policy-row="source">
        <span class="flex min-w-0 grow basis-40 flex-col">
          <span class="text-sm" :class="isAllowed(source) ? 'text-highlighted' : 'text-muted'">{{ sourceLabel(t, source) }}</span>
        </span>
        <template v-if="source !== 'stop'">
          <IconButton size="xs" icon="i-material-symbols-arrow-upward" :label="$t('common.aria.move_up_named', { name: sourceLabel(t, source) })" :disabled="!canMove(source, -1)" @click="move(source, -1)" />
          <IconButton size="xs" icon="i-material-symbols-arrow-downward" :label="$t('common.aria.move_down_named', { name: sourceLabel(t, source) })" :disabled="!canMove(source, 1)" @click="move(source, 1)" />
          <USwitch :model-value="isAllowed(source)" :aria-label="$t('supply.aria.source_switch', { name: sourceLabel(t, source) })" @update:model-value="(on: boolean) => void toggle(source, on)" />
        </template>
      </div>
    </div>

    <UFormField v-if="props.cap" :label="$t('supply.label.member_credit_cap')" name="cap">
      <UInput v-model="capWords" class="w-40 text-end tabular-nums" inputmode="numeric" :placeholder="$t('supply.label.cap_none')" :aria-label="$t('supply.label.member_credit_cap')" />
    </UFormField>

    <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error">{{ failure }}</p>

    <template #footer="{ close }">
      <UButton :label="$t('common.action.cancel')" color="neutral" variant="ghost" :disabled="busy" @click="close()" />
      <UButton :label="$t('common.action.save')" :loading="busy" :disabled="busy || !changes.dirty.value || capBad" @click="void save(close)" />
    </template>
  </SettingsDialog>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useOpenedWith } from "bmo-ui/app/domain/form-save";

import { draftRows, sourceLabel } from "~/domain/supply";

import type { PolicyDraft } from "~/domain/supply";
import type { SupplyPolicy, SupplySource } from "#shared/supply";

interface Props {
  title: string;
  // What the form opens with: the standing policy, or what is in force above where none stands.
  draft: PolicyDraft;
  // Whether this policy kind carries the per-person monthly cap on organisation credits.
  cap?: boolean;
  // Who writes the policy: the unit's, the person's or the platform's own route, as the caller holds it.
  send: (policy: SupplyPolicy) => Promise<unknown>;
}

const props = withDefaults(defineProps<Props>(), { cap: true });
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();

const allowed = ref<SupplySource[]>([]);
const order = ref<SupplySource[]>([]);
const capWords = ref("");
const busy = ref(false);
const failure = ref("");

// The form stands filled at each opening, and its opened-with values are read then, not before.
watch(open, (standing) => {
  if (!standing) return;

  allowed.value = [...props.draft.allowed];
  order.value = [...props.draft.order];
  capWords.value = props.draft.memberCreditCredits === null ? "" : String(props.draft.memberCreditCredits);
  failure.value = "";
});

const changes = useOpenedWith(() => ({ allowed: allowed.value.join(","), order: order.value.join(","), cap: capWords.value.trim() }), { open });

const rows = computed<SupplySource[]>(() => draftRows({ allowed: allowed.value, order: order.value, memberCreditCredits: null }));

function isAllowed(source: SupplySource): boolean {
  return source === "stop" || allowed.value.includes(source);
}

function openRows(): SupplySource[] {
  return rows.value.filter((one) => one !== "stop" && isAllowed(one));
}

function canMove(source: SupplySource, by: number): boolean {
  const index = openRows().indexOf(source);

  return isAllowed(source) && index >= 0 && index + by >= 0 && index + by < openRows().length;
}

function move(source: SupplySource, by: number): void {
  const list = openRows();
  const from = list.indexOf(source);
  const to = from + by;

  if (from < 0 || to < 0 || to >= list.length) return;
  const next = list.slice();
  const [taken] = next.splice(from, 1);

  if (taken === undefined) return;
  next.splice(to, 0, taken);
  order.value = [...next, "stop"];
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

async function save(close: () => void): Promise<void> {
  if (busy.value || !changes.dirty.value || capBad.value) return;

  busy.value = true;
  failure.value = "";
  try {
    await props.send({
      allowed: openRows(),
      order: [...openRows(), "stop"],
      memberCreditCredits: capWords.value.trim() === "" ? null : Number(capWords.value.trim())
    });

    emit("saved");
    close();
  } catch (error) {
    failure.value = failureText(error, t("supply.error.policy_failed"));
  } finally {
    busy.value = false;
  }
}
</script>
