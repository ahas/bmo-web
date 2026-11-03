<template>
  <!-- A cell holding a number or a text: its dropdown is a box with the value in it, saved with
       Enter or the check button, left as it was with Escape. A refused value keeps the dropdown open
       with the reason under the box. -->
  <SettingsPopoverCell v-model:open="open" :label="props.label" :disabled="props.disabled" :busy="saving">
    <slot />

    <template #content>
      <form class="flex min-w-0 flex-col gap-3" novalidate @submit.prevent="submit">
        <UFormField :label="props.label" :name="props.label" :error="shownFault" :help="props.help" :ui="CELL_FIELD_UI">
          <div class="flex min-w-0 items-center gap-2">
            <NumberInput
              v-if="props.kind === 'number'"
              :model-value="boxed"
              :min="props.min"
              :max="props.max"
              :step="props.step"
              :step-snapping="false"
              locale="en-US"
              :digits="digits"
              :aria-label="props.label"
              :disabled="saving"
              autofocus
              @update:model-value="(value: number | null | undefined) => settle(value ?? null)"
              @input="text = ($event.target as HTMLInputElement).value.replaceAll(GROUP_SEPARATOR, '')"
              @keydown.escape="open = false"
            />
            <UInput
              v-else
              :model-value="text"
              class="min-w-0 flex-1"
              :class="props.mono ? 'font-mono' : ''"
              :aria-label="props.label"
              :disabled="saving"
              autofocus
              @update:model-value="text = String($event)"
              @keydown.escape="open = false"
            />
            <UTooltip :text="$t('common.action.save')">
              <UButton type="submit" icon="i-material-symbols-check" color="primary" variant="soft" :loading="saving" :disabled="!changed || fault !== null" :aria-label="$t('common.action.save')" />
            </UTooltip>
          </div>
        </UFormField>

        <slot name="extra" />
      </form>
    </template>
  </SettingsPopoverCell>
</template>

<script setup lang="ts">
import { CELL_FIELD_UI } from "~/domain/settings-cells";

interface Props {
  value: string | number | null;
  label: string;
  kind?: "number" | "text";
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  mono?: boolean;
  disabled?: boolean;
  // What is wrong with the typed text before it is sent, or null.
  check?: (text: string) => string | null;
  // Saves the typed text; the bot's refusal in its own words, or null once it took it.
  save: (text: string) => Promise<string | null>;
}

const props = withDefaults(defineProps<Props>(), { kind: "number", check: () => null });

const open = ref(false);
// What the box holds, read as text: a number box's as it is typed, so the check and the save
// button follow every key, and what it settled on once it takes a value. The number it shows is
// moved only by the box itself, so a half-typed value is never written back over what is typed.
const text = ref("");
const boxed = ref<number | null>(null);
// The box writes its value in en-US, thousands separated by commas, and what is typed is read
// without them.
const GROUP_SEPARATOR = ",";
// As many characters as the largest value it takes, or seven where it names none.
const UNBOUNDED = 9_999_999;
const digits = computed(() => Math.max((props.max ?? UNBOUNDED).toLocaleString("en-US").length, String(props.min ?? 0).length));
const refused = ref("");
const saving = ref(false);

const initial = computed(() => (props.value === null ? "" : String(props.value)));
const changed = computed(() => text.value.trim() !== initial.value);
const fault = computed(() => props.check(text.value));
const shownFault = computed(() => (fault.value ?? refused.value) || undefined);

// Every opening starts from what the bot holds now.
watch(open, (now) => {
  if (!now) return;
  text.value = initial.value;
  boxed.value = props.value === null || props.value === "" ? null : Number(props.value);
  refused.value = "";
});

watch(text, () => {
  refused.value = "";
});

// The value the box settled on, clamped to its bounds as it takes it, is what is sent.
function settle(value: number | null): void {
  boxed.value = value;
  text.value = value === null ? "" : String(value);
}

async function submit(): Promise<void> {
  if (!changed.value || fault.value !== null || saving.value) return;

  saving.value = true;

  try {
    const answer = await props.save(text.value.trim());

    if (answer === null) {
      open.value = false;
    } else {
      refused.value = answer;
    }
  } finally {
    saving.value = false;
  }
}
</script>
