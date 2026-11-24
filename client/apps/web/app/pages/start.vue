<template>
  <!-- The start guide (docs/web.md, 「The start guide」): what a person sets before their BMO can answer them, a step at
       a time, the flow and its steps the console's server's, the progress kept there as each step is passed. Like the
       join page, it stands on no shell: one card, the whole width on a phone. -->
  <div class="relative flex overflow-y-auto bg-default p-4 text-default" :style="{ top: 'var(--bmo-screen-top)', height: 'var(--bmo-screen)' }" data-guide>
    <UCard class="m-auto w-full max-w-lg">
      <template #header>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <h1 class="min-w-0 flex-1 break-keep text-xl font-semibold text-highlighted" data-guide-title>{{ title }}</h1>
            <IconButton v-if="guide !== null && guide.flow !== null && guide.leavable" icon="i-material-symbols-close" :label="$t('guide.action.close')" :disabled="busy" data-guide-close @click="void leave()" />
          </div>
          <div v-if="step !== null && guide !== null" class="flex items-center gap-3">
            <UProgress :model-value="progress.share" size="sm" class="min-w-0 flex-1" :aria-label="$t('guide.title.page')" />
            <span class="shrink-0 text-sm tabular-nums text-muted" data-guide-progress>{{ $t("guide.label.progress", { at: progress.at.toLocaleString(), of: progress.of.toLocaleString(), share: progress.share.toLocaleString() }) }}</span>
          </div>
        </div>
      </template>

      <div v-if="guide === null && failure === ''" aria-busy="true">
        <ContentSkeleton :rows="3" :label="$t('guide.status.loading')">
          <SkeletonLine width="w-2/3" />
        </ContentSkeleton>
      </div>

      <div v-else-if="guide === null" class="flex flex-col items-end gap-3">
        <UAlert class="w-full" color="error" variant="subtle" :description="failure" />
        <UButton color="neutral" variant="subtle" icon="i-material-symbols-refresh" :label="$t('common.action.refresh')" @click="void read()" />
      </div>

      <div v-else-if="step !== null" class="flex flex-col gap-4" :data-guide-step="step">
        <p class="whitespace-pre-line break-keep text-sm text-toned" data-guide-line>{{ line }}</p>

        <URadioGroup
          v-if="step === 'provider' && guide.roads.length > 0"
          v-model="chosen"
          :items="roadItems"
          value-key="value"
          variant="card"
          class="w-full"
          data-guide-roads
        />
        <UAlert v-else-if="step === 'provider'" color="neutral" variant="subtle" :description="$t('guide.message.no_roads')" data-guide-no-roads />

        <GuideConnect v-else-if="step === 'connect' && road !== null" :key="road.road" v-model:done="stepDone" v-model:dirty="connectDirty" :flow="guide.flow ?? 'member'" :road="road" @registered="(name: string) => void registered(name)" />
        <GuideTest v-else-if="step === 'test' && road !== null" :key="tested.road + (tested.model ?? '')" v-model:done="stepDone" :road="tested.road" :model="tested.model" />
        <GuideMachine v-else-if="step === 'machine'" v-model:done="stepDone" />
        <GuideDefaultModel v-else-if="step === 'model'" ref="committer" v-model:done="stepDone" />
        <GuideCompany v-else-if="step === 'company'" ref="committer" v-model:done="stepDone" />
        <GuideTalk v-else-if="step === 'talk'" ref="talk" v-model:room="room" />

        <p v-if="failure !== ''" role="alert" class="break-words text-sm text-error" data-guide-page-failure>{{ failure }}</p>
      </div>

      <template v-if="guide !== null && step !== null" #footer>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton v-if="previous !== null" color="neutral" variant="ghost" :label="$t('guide.action.back')" :disabled="busy" data-guide-back @click="void back()" />

          <template v-if="step === 'supply' && guide.need === 'optional'">
            <UButton color="neutral" variant="subtle" :label="$t('guide.action.later')" :loading="busy" data-guide-later @click="void putOff()" />
            <UButton :label="$t('guide.action.now')" :loading="busy" data-guide-now @click="void takeUp()" />
          </template>
          <template v-else-if="step === 'talk'">
            <template v-if="room !== null && room !== undefined">
              <UButton color="neutral" variant="subtle" :label="$t('guide.action.open_room')" :loading="busy" data-guide-open-room @click="void finish(false)" />
              <UButton :label="$t('guide.action.send')" :loading="busy" :disabled="!sayable" data-guide-send @click="void finish(true)" />
            </template>
            <UButton v-else :label="$t('guide.action.done')" :loading="busy" :disabled="room === undefined" data-guide-done @click="void finish(false)" />
          </template>
          <template v-else>
            <UButton v-if="laterHere" color="neutral" variant="subtle" :label="$t('guide.action.later')" :disabled="busy" data-guide-later @click="void putOff()" />
            <UButton :label="$t('guide.action.next')" :loading="busy" :disabled="!forward" data-guide-next @click="void next()" />
          </template>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";

import { useConfirm } from "~/domain/confirm";
import { guideOpensAgain } from "~/domain/guide";
import { roadLabel } from "~/domain/supply";
import { useVisibleShell } from "~/domain/overlay";

import { REGISTRY_ROAD, guideProgress, stepBeside } from "#shared/guide";

import type { GuideRoad, GuideStep, GuideView } from "#shared/guide";

definePageMeta({ layout: false, everyLogin: true });

useVisibleShell();

const { t } = useI18n();
const guide = ref<GuideView | null>(null);
const step = ref<GuideStep | null>(null);
const failure = ref("");
const busy = ref(false);
// Whether what the open step asks is done, as its own part says.
const stepDone = ref(false);
// The road chosen on the provider step, before it is kept.
const chosen = ref<string | undefined>(undefined);
// The room the last step opens: undefined while it is read, null where none stands.
const room = ref<number | null | undefined>(undefined);
// Whether the connect step holds something typed that leaving it would throw away.
const connectDirty = ref(false);
const confirm = useConfirm();
const committer = ref<{ commit: () => Promise<boolean> } | null>(null);
const talk = ref<{ say: () => Promise<boolean>; sayable: boolean } | null>(null);

const flowName = computed(() => guide.value?.flow ?? "member");
const progress = computed(() => (guide.value === null || step.value === null ? { at: 0, of: 0, share: 0 } : guideProgress(guide.value.steps, step.value)));
const previous = computed(() => (guide.value === null || step.value === null ? null : stepBeside(guide.value.steps, step.value, -1)));
const sayable = computed(() => talk.value?.sayable === true);

// The road kept, or a local AI's registration standing as `registered::<name>` so its test names it.
const keptRoad = computed(() => guide.value?.road ?? null);
const road = computed<GuideRoad | null>(() => {
  const name = (keptRoad.value ?? "").split("::")[0];

  return guide.value?.roads.find((one) => one.road === name) ?? null;
});
const tested = computed(() => {
  const [name = "", model] = (keptRoad.value ?? "").split("::");

  return { road: name, model: name === REGISTRY_ROAD ? (model ?? null) : null };
});

// Each step's title and its one line, the provider step titled as the platform's supply for the administrator.
const TITLES: Record<GuideStep, string> = {
  welcome: "guide.title.welcome",
  supply: "guide.title.supply",
  provider: "guide.title.provider",
  connect: "guide.title.connect",
  test: "guide.title.test",
  machine: "guide.title.machine",
  model: "guide.title.model",
  company: "guide.title.company",
  talk: "guide.title.talk"
};

// The one line of the steps whose line is the same in every flow and for every choice.
const LINES: Record<Exclude<GuideStep, "supply" | "provider" | "connect">, string> = {
  welcome: "guide.message.step_welcome",
  test: "guide.message.step_test",
  machine: "guide.message.step_machine",
  model: "guide.message.step_model",
  company: "guide.message.step_company",
  talk: "guide.message.step_talk"
};

const title = computed(() => {
  if (step.value === null) return t("guide.title.page");
  if (step.value === "provider" && flowName.value === "platform") return t("guide.title.platform");

  return t(TITLES[step.value]);
});

const line = computed(() => {
  switch (step.value) {
    case "supply":
      return t(guide.value?.need === "required" ? "guide.message.step_supply_required" : "guide.message.step_supply_optional");
    case "provider":
      return t(flowName.value === "platform" ? "guide.message.step_platform" : "guide.message.step_provider");
    case "connect":
      return t(road.value?.kind === "login" ? "guide.message.step_connect_login" : road.value?.kind === "local" ? "guide.message.step_connect_local" : "guide.message.step_connect_key");
    case null:
      return "";
    default:
      return t(LINES[step.value]);
  }
});

// A road's name and its line: Claude by where it signs in, a key by its provider, a local AI by its address's kind.
const roadItems = computed(() =>
  (guide.value?.roads ?? []).map((one) => {
    if (one.kind === "login") {
      return { value: one.road, label: t("supply.label.road_claude"), description: t(flowName.value === "platform" ? "guide.label.road_login_platform" : "guide.label.road_login_member") };
    }
    if (one.kind === "local") return { value: one.road, label: t("guide.label.road_local"), description: t("guide.label.road_local_line") };

    return { value: one.road, label: t("guide.label.road_key", { provider: roadLabel(t, one.road) }), description: t("guide.label.road_key_line") };
  })
);

// Whether the way forward opens: a choice made on the provider step, the work of the steps that do one done, and every other step
// open as it stands.
const forward = computed(() => {
  switch (step.value) {
    case "provider":
      return chosen.value !== undefined;
    case "connect":
    case "test":
    case "machine":
    case "model":
    case "company":
      return stepDone.value;
    default:
      return true;
  }
});

// Where an optional supply or a machine may be put off from: the test of an optional supply, and the machine.
const laterHere = computed(() => (step.value === "test" && guide.value?.need === "optional") || step.value === "machine");

// Whether the last step is being finished, which leads on by itself.
let finishing = false;

function stood(view: GuideView): void {
  // A guide finished leads on from its last step, which stays as it stood until the next page opens.
  if (finishing) return;

  guide.value = view;
  step.value = view.step;
  stepDone.value = false;
  connectDirty.value = false;
  // A reader with no flow, the administrator on a platform that works among them, has nothing here.
  if (view.flow === null) void navigateTo("/");
}

async function read(): Promise<void> {
  failure.value = "";
  try {
    stood(await $fetch<GuideView>("/api/me/guide"));
    chosen.value = (guide.value?.road ?? "").split("::")[0] || undefined;
  } catch (error) {
    failure.value = failureText(error, t("guide.error.read_failed"));
  }
}

async function change(body: Record<string, unknown>): Promise<boolean> {
  busy.value = true;
  failure.value = "";
  try {
    stood(await $fetch<GuideView>("/api/me/guide", { method: "PUT", body }));

    return true;
  } catch (error) {
    failure.value = failureText(error, t("guide.error.failed"));

    return false;
  } finally {
    busy.value = false;
  }
}

async function go(to: GuideStep): Promise<void> {
  await change({ step: to });
}

// The step after the open one: its own write first where it holds one, the road kept as it is chosen, and a test passed
// asking the gate again, since a member whose own supply was required may now go anywhere.
async function next(): Promise<void> {
  if (guide.value === null || step.value === null) return;

  if (committer.value !== null && (step.value === "model" || step.value === "company")) {
    busy.value = true;
    const went = await committer.value.commit();

    busy.value = false;
    if (!went) return;
  }

  if (step.value === "test") await guideOpensAgain();

  const after = stepBeside(guide.value.steps, step.value, 1);

  if (after === null) return;

  if (step.value === "provider") {
    const keep = chosen.value === keptRoad.value?.split("::")[0] ? keptRoad.value : (chosen.value ?? null);

    await change({ step: after, road: keep });

    return;
  }

  await go(after);
}

// The supply put off: the steps that set it up stand as none, and the guide goes on past them.
async function putOff(): Promise<void> {
  if (step.value === "machine") {
    const after = guide.value === null ? null : stepBeside(guide.value.steps, "machine", 1);

    if (after !== null) await go(after);

    return;
  }

  await change({ supplyLater: true, step: "machine" });
}

async function takeUp(): Promise<void> {
  await change({ supplyLater: false, step: "provider" });
}

// A local AI registered stands as the road kept, so its test names its registration.
async function registered(name: string): Promise<void> {
  await change({ road: name, step: "connect" });
  stepDone.value = true;
}

// The last step: the words said where the reader asked, the guide finished, and their room opened, or home where none
// stands.
async function finish(saying: boolean): Promise<void> {
  if (saying && talk.value !== null && !(await talk.value.say())) return;

  // Where the guide leads once finished, read before the finished guide stands, which opens at its first step again.
  const to = room.value === null || room.value === undefined ? "/" : `/rooms/${room.value}`;

  finishing = true;
  if (!(await change({ finish: true }))) {
    finishing = false;

    return;
  }

  // The gate is asked again before the guide is left, so it leads nowhere back to a guide finished.
  await guideOpensAgain();
  await navigateTo(to);
}

// Leaving the connect step with something typed asks first, as a form closing with a change does.
async function mayLeaveStep(): Promise<boolean> {
  if (step.value !== "connect" || !connectDirty.value) return true;

  return await confirm({ title: t("common.title.discard_changes"), confirm: t("common.action.discard") });
}

async function back(): Promise<void> {
  if (previous.value !== null && (await mayLeaveStep())) await go(previous.value);
}

// The guide put aside, kept where it stands, and the reader taken home.
async function leave(): Promise<void> {
  if (!(await mayLeaveStep())) return;
  if (!(await change({ leave: true }))) return;

  await guideOpensAgain();
  await navigateTo("/");
}

watch(step, (now) => {
  if (now !== "talk") room.value = undefined;
});

onMounted(() => void read());

useHead({ title: () => t("guide.title.page") });
</script>
