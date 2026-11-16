<template>
  <!-- One person on the people tab (docs/web.md, 「Organisation」, the people tab), read-only: the head with the person's
       picture, name, login, marks and the management menu at its right end, then the groups, each read on its own with
       skeletons shaped like its rows and a failure said in its place. Nothing here changes anything by itself; every
       change is an act of the menu, opening the dialog it opens on its own tab. -->
  <article class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4" :data-roster-person="props.user">
    <header class="flex flex-col gap-2">
      <div class="flex min-h-10 min-w-0 items-center gap-3">
        <IconButton v-if="props.back" icon="i-material-symbols-arrow-back" :label="$t('common.action.back')" data-roster-back @click="emit('back')" />
        <template v-if="person !== null">
          <UAvatar v-bind="face" size="xl" class="shrink-0" />
          <div class="flex min-w-0 flex-col">
            <h2 class="text-lg font-semibold break-words text-highlighted">{{ person.name }}</h2>
            <span class="text-sm break-all text-muted">{{ person.login }}</span>
          </div>
        </template>
        <SkeletonStatus v-else-if="personFailure === ''" as="div" class="flex min-w-0 flex-1 items-center gap-3" :label="$t('roster.status.person_loading')">
          <SkeletonBar class="size-10 shrink-0 rounded-full" />
          <span class="flex min-w-0 flex-1 flex-col">
            <SkeletonLine size="lg" width="w-1/2" />
            <SkeletonLine width="w-1/3" />
          </span>
        </SkeletonStatus>
      </div>

      <div v-if="person !== null" class="flex min-h-8 flex-wrap items-center gap-2" data-roster-person-marks>
        <UBadge v-if="person.administrator" color="primary" variant="subtle" :label="$t('roster.label.administrator')" />
        <UBadge :color="stateFace.color" variant="subtle" :icon="stateFace.icon" :label="$t(stateFace.label)" data-roster-person-state />
        <UDropdownMenu v-if="menu.length > 0" :items="menu" :content="{ align: 'end' }">
          <UButton
            class="ms-auto"
            color="neutral"
            variant="outline"
            :label="$t('roster.action.manage')"
            trailing-icon="i-material-symbols-keyboard-arrow-down"
            :loading="acting"
            data-roster-manage
          />
        </UDropdownMenu>
      </div>
      <!-- The marks' row keeps its place while the person is read, the state's chip standing as a bar. -->
      <div v-else-if="personFailure === ''" class="flex min-h-8 items-center">
        <SkeletonBar class="h-7 w-16 rounded-sm" />
      </div>
      <p v-if="actFailure !== ''" role="alert" class="text-sm break-words whitespace-pre-line text-error">{{ actFailure }}</p>
    </header>

    <!-- The account and the organisation groups are the one read of the person; a failure of it stands in the
         account group's place. -->
    <SettingsGroup :title="$t('settings.label.account')">
      <FailedRead v-if="person === null && personFailure !== ''" class="py-3" :message="personFailure" :reading="personReading" @retry="readPerson" />
      <PairRows v-else :rows="accountRows" :skeleton="accountLabels" :label="$t('roster.status.person_loading')" />
    </SettingsGroup>

    <SettingsGroup v-if="person !== null || personFailure === ''" :title="$t('people.label.organization')">
      <PairRows :rows="organizationRows" :skeleton="organizationLabels" :label="$t('roster.status.person_loading')" />
    </SettingsGroup>

    <SettingsGroup :title="$t('settings.label.bmo')">
      <FailedRead v-if="bmo.failure.value !== ''" class="py-3" :message="bmo.failure.value" :reading="bmo.reading.value" @retry="bmo.read" />
      <p v-else-if="bmo.data.value !== null && !bmo.data.value.hasBmo" class="py-3 text-sm text-muted">{{ $t("roster.label.no_bmo") }}</p>
      <PairRows v-else :rows="bmoRows" :skeleton="bmoLabels" :label="$t('roster.status.bmo_loading')">
        <template #picture>
          <span class="flex items-center gap-2">
            <UAvatar v-if="bmoPicture !== null" :src="bmoPicture" :alt="$t('bmo_profile.label.picture')" size="md" />
            <BmoMark v-else class="size-8" />
            <span v-if="bmoPicture === null" class="text-highlighted">{{ $t("bmo_profile.label.default_value", { value: $t("account.label.bmo_name") }) }}</span>
          </span>
        </template>
        <template #persona>
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-highlighted tabular-nums">{{ personaText }}</span>
            <UButton v-if="persona !== null" size="sm" color="neutral" variant="outline" :label="$t('common.label.view')" data-roster-persona @click="personaOpen = true" />
          </span>
        </template>
      </PairRows>
    </SettingsGroup>

    <template v-if="administrator">
      <SettingsGroup :title="$t('common.label.room')">
        <FailedRead v-if="rooms.failure.value !== ''" class="py-3" :message="rooms.failure.value" :reading="rooms.reading.value" @retry="rooms.read" />
        <ContentSkeleton v-else-if="rooms.data.value === null" :rows="2" listClass="flex flex-col py-1" :label="$t('roster.status.rooms_loading')">
          <div class="flex items-center gap-3 py-2">
            <SkeletonBar class="size-8 shrink-0 rounded-full" />
            <span class="flex min-w-0 flex-1 flex-col">
              <SkeletonLine width="w-1/2" />
              <SkeletonLine width="w-1/3" />
            </span>
          </div>
        </ContentSkeleton>
        <p v-else-if="rooms.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_rooms") }}</p>
        <ul v-else class="flex flex-col py-1" data-roster-rooms>
          <li v-for="room in rooms.data.value" :key="room.chatId">
            <NuxtLink :to="`/rooms/${room.chatId}`" :class="ROW_LINK">
              <UAvatar v-bind="avatarFor(avatars, 'room', room.chatId, room.title)" size="md" class="shrink-0" />
              <span :class="ROW_LINES">
                <span :class="ROW_LINE">
                  <HintTip :text="room.title" cut press class="min-w-0 flex-1 truncate text-highlighted">{{ room.title }}</HintTip>
                  <span v-if="room.lastMessageAt !== null" class="shrink-0 text-muted tabular-nums">{{ formatStamp(toUnixSeconds(room.lastMessageAt)) }}</span>
                </span>
                <span :class="ROW_LINE" class="text-muted">
                  <span class="truncate tabular-nums">{{ [$t(room.kind === "private" ? "roster.label.private_room" : "roster.label.group_room"), $t("roster.label.message_count", { count: countText(room.messageCount) })].join(" · ") }}</span>
                </span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </SettingsGroup>

      <SettingsGroup :title="$t('agents.label.column_agent')">
        <FailedRead v-if="agents.failure.value !== ''" class="py-3" :message="agents.failure.value" :reading="agents.reading.value" @retry="agents.read" />
        <ContentSkeleton v-else-if="agents.data.value === null" :rows="2" listClass="flex flex-col py-1" :label="$t('roster.status.agents_loading')">
          <div class="flex items-center gap-3 py-2">
            <SkeletonBar class="size-6 shrink-0 rounded-full" />
            <span class="flex min-w-0 flex-1 flex-col">
              <SkeletonLine width="w-1/3" />
              <SkeletonLine width="w-1/2" />
            </span>
          </div>
        </ContentSkeleton>
        <p v-else-if="agents.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_agents") }}</p>
        <ul v-else class="flex flex-col py-1" data-roster-agents>
          <li v-for="agent in agents.data.value" :key="agent.name">
            <NuxtLink :to="agentLink(agent.name)" :class="ROW_LINK">
              <AgentMark :agent="markOf(agent)" icon-class="size-6" aria-hidden="true" />
              <span :class="ROW_LINES">
                <span :class="ROW_LINE">
                  <HintTip :text="agent.label" cut press class="min-w-0 flex-1 truncate text-highlighted">{{ agent.label }}</HintTip>
                  <HintTip :text="$t(agent.enabled ? 'roster.status.on' : 'roster.status.off')" press class="inline-flex shrink-0">
                    <span role="img" class="inline-flex" :aria-label="$t(agent.enabled ? 'roster.status.on' : 'roster.status.off')" data-roster-agent-state>
                      <UIcon
                        :name="agent.enabled ? 'i-material-symbols-toggle-on' : 'i-material-symbols-toggle-off-outline'"
                        class="size-5"
                        :class="agent.enabled ? 'badge-ink text-success' : 'text-muted'"
                      />
                    </span>
                  </HintTip>
                </span>
                <span :class="ROW_LINE" class="text-muted">
                  <span class="truncate">{{ agentLine(agent) }}</span>
                </span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </SettingsGroup>

      <SettingsGroup :title="$t('agents.label.column_sessions')">
        <FailedRead v-if="sessions.failure.value !== ''" class="py-3" :message="sessions.failure.value" :reading="sessions.reading.value" @retry="sessions.read" />
        <ContentSkeleton v-else-if="sessions.data.value === null" :rows="2" listClass="flex flex-col py-1" :label="$t('roster.status.sessions_loading')">
          <div class="flex flex-col py-2">
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-1/2" />
          </div>
        </ContentSkeleton>
        <p v-else-if="sessions.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_sessions") }}</p>
        <ul v-else class="flex flex-col py-1" data-roster-sessions>
          <li v-for="session in sessions.data.value" :key="session.id" class="py-2" :class="ROW_LINES">
            <span :class="ROW_LINE">
              <span class="min-w-0 flex-1 truncate text-highlighted">{{ session.agent }}</span>
              <span v-if="session.context !== null" class="shrink-0 text-muted tabular-nums">{{ contextText(session.context) }}</span>
            </span>
            <span :class="ROW_LINE" class="text-muted">
              <span class="min-w-0 flex-1 truncate">{{ session.roomTitle ?? session.scope }}</span>
              <span class="shrink-0 text-toned">{{ [providerWord(providers, session.provider), session.model].join(" · ") }}</span>
            </span>
          </li>
        </ul>
      </SettingsGroup>

      <SettingsGroup :title="$t('roster.label.runs')">
        <FailedRead v-if="runs.failure.value !== ''" class="py-3" :message="runs.failure.value" :reading="runs.reading.value" @retry="runs.read" />
        <ContentSkeleton v-else-if="runs.data.value === null" :rows="3" listClass="flex flex-col py-1" :label="$t('roster.status.runs_loading')">
          <div class="flex flex-col py-2">
            <SkeletonLine width="w-1/2" />
            <SkeletonLine width="w-1/3" />
          </div>
        </ContentSkeleton>
        <p v-else-if="runs.data.value.length === 0" class="py-3 text-sm text-muted">{{ $t("roster.label.no_runs") }}</p>
        <ul v-else class="flex flex-col py-1" data-roster-runs>
          <li v-for="run in runs.data.value" :key="run.id">
            <NuxtLink :to="momentLink(run.agent, toUnixSeconds(run.startedAt))" :class="ROW_LINK">
              <span :class="ROW_LINES">
                <span :class="ROW_LINE">
                  <span class="min-w-0 flex-1 truncate text-highlighted">{{ run.agent }}</span>
                  <span class="shrink-0 text-muted tabular-nums">{{ formatStamp(toUnixSeconds(run.startedAt)) }}</span>
                </span>
                <span :class="ROW_LINE" class="text-muted">
                  <span class="min-w-0 flex-1 truncate">{{ run.roomTitle ?? run.name }}</span>
                  <span v-if="run.endedAt !== null" class="shrink-0 tabular-nums">{{ tookText(run.startedAt, run.endedAt) }}</span>
                  <span class="shrink-0">{{ endingText(run) }}</span>
                </span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </SettingsGroup>
    </template>

    <SettingsDialog v-model:open="personaOpen" :title="$t('bmo_profile.label.persona')" :description="person?.name">
      <p class="text-sm break-words whitespace-pre-wrap text-default" data-roster-persona-text>{{ persona ?? "" }}</p>
    </SettingsDialog>

    <OrganizationMoveDialog ref="moveDialog" v-model:open="moving" :units="units" :name-of="nameOf" @moved="actDone" />
    <OrganizationMachineDialog v-model:open="machineOpen" :user="props.user" :name="person?.name ?? ''" @changed="actDone" />
    <ProfileDialog v-model:open="profileOpen" :user="props.user" :profile="profile" :description="person?.name" @saved="actDone" />
  </article>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { elapsedText, formatStamp, toUnixSeconds } from "bmo-ui/app/domain/time";

import { useAdministrator, useSignedUser } from "~/domain/access";
import { groupIcon } from "~/domain/agents";
import { avatarFor, identityMark, useAvatars } from "~/domain/avatars";
import { percentOf, providerWord, roadText, useProviders } from "~/domain/axes";
import { followsLine, nameShown, sourceLine } from "~/domain/bmo-profile";
import { useConfirm } from "~/domain/confirm";
import { countText } from "~/domain/numbers";
import { organizationAddress } from "~/domain/organization";
import { ROSTER_ROLE_LABELS, ROSTER_STATE_FACES, rosterActs, rosterRoleOf, runEnding } from "~/domain/roster";
import { agentLink, momentLink } from "~/domain/status";

import type { PairRow, PairSkeleton } from "~/domain/pair-rows";
import type { AgentMarkSubject } from "~/domain/agent-face";
import type { RosterAct } from "~/domain/roster";
import type { RosterAgent, RosterBmo, RosterDetail, RosterRoom, RosterRun, RosterSession } from "#shared/roster";
import type { UserProfile } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { UnitRow } from "@web/server-client";
import type { Ref } from "vue";

interface Props {
  user: string;
  // Whether the person stands over the list on a narrow screen, with the way back at the head.
  back?: boolean;
}

const props = withDefaults(defineProps<Props>(), { back: false });
// `back` asks for the list again; `changed` hands on the person as read again after an act, for their row.
const emit = defineEmits<{ back: []; changed: [person: RosterDetail] }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const administrator = useAdministrator();
const signed = useSignedUser();
const avatars = useAvatars();
const { data: providers } = useProviders();

const base = computed(() => `/api/organization/people/${encodeURIComponent(props.user)}`);

// A row of a group that opens what it names: the row's own box, pressed as a whole, its mark centred beside its two
// lines. A row is two lines at every width, the words that say which item it is first and cut last, so a narrow region
// never squeezes them out for the cells beside them.
const ROW_LINK = "-mx-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-elevated active:bg-accented";
const ROW_LINES = "flex min-w-0 flex-1 flex-col text-sm";
const ROW_LINE = "flex min-w-0 items-center gap-3";

// --- The person ---

const person = ref<RosterDetail | null>(null);
const personFailure = ref("");
const personReading = ref(false);

// A failure stands until a read goes through; a person read again after an act keeps what stood meanwhile.
async function readPerson(): Promise<void> {
  personReading.value = true;

  try {
    person.value = await $fetch<RosterDetail>(base.value);
    personFailure.value = "";
  } catch (error) {
    personFailure.value = failureText(error, t("roster.error.person_read_failed"));
  } finally {
    personReading.value = false;
  }
}

const face = computed(() => identityMark(`user:${props.user}`, person.value?.name ?? ""));
const stateFace = computed(() => ROSTER_STATE_FACES[person.value?.state ?? "active"]);

function stamp(at: number | null): string {
  return at === null ? t("common.label.no_record") : formatStamp(toUnixSeconds(at));
}

// The account group: the login, the name, the job title, the contact details for the administrator alone, the state with who
// marked the person left and when, when the account was made and when they last signed in.
const accountLabels = computed(() => [
  t("account.label.user_id"),
  t("account.label.full_name"),
  t("account.label.job_title"),
  ...(administrator.value ? [t("account.label.landline"), t("account.label.mobile"), t("account.label.email")] : []),
  t("roster.label.state"),
  t("roster.label.made_at"),
  t("roster.label.last_sign_in")
]);

const accountRows = computed<PairRow[] | null>(() => {
  const one = person.value;

  if (one === null) return null;

  const contact = (label: string, value: string | undefined): PairRow[] => (value === undefined ? [] : [{ key: label, label, value: value === "" ? "—" : value }]);

  return [
    { key: "login", label: t("account.label.user_id"), value: one.login },
    { key: "name", label: t("account.label.full_name"), value: one.name },
    { key: "job", label: t("account.label.job_title"), value: one.jobTitle === "" ? "—" : one.jobTitle },
    ...contact(t("account.label.landline"), one.landline),
    ...contact(t("account.label.mobile"), one.mobile),
    ...contact(t("account.label.email"), one.email),
    {
      key: "state",
      label: t("roster.label.state"),
      value: t(ROSTER_STATE_FACES[one.state].label),
      under: one.left === null ? undefined : t("roster.label.left_by", { time: formatStamp(toUnixSeconds(one.left.at)), name: one.left.byName })
    },
    { key: "made", label: t("roster.label.made_at"), value: formatStamp(toUnixSeconds(one.madeAt)) },
    { key: "sign-in", label: t("roster.label.last_sign_in"), value: stamp(one.lastSignInAt) }
  ];
});

// The organisation group: the company, the unit's path from the company down, the role and the units the person heads directly.
const organizationLabels = computed(() => [t("invites.label.company"), t("invites.label.unit"), t("organization.label.role")]);

const organizationRows = computed<PairRow[] | null>(() => {
  const one = person.value;

  if (one === null) return null;

  return [
    { key: "company", label: t("invites.label.company"), value: one.company.name },
    { key: "unit", label: t("invites.label.unit"), value: one.path.map((unit) => unit.name).join(" › ") },
    { key: "role", label: t("organization.label.role"), value: t(ROSTER_ROLE_LABELS[rosterRoleOf(one)]) },
    ...(one.headOf.length === 0 ? [] : [{ key: "head-of", label: t("roster.label.head_of"), value: one.headOf.map((unit) => unit.name).join(", ") }])
  ];
});

// --- A group read on its own ---

interface GroupRead<T> {
  data: Ref<T | null>;
  failure: Ref<string>;
  reading: Ref<boolean>;
  read: () => Promise<void>;
}

// One group's read: what it holds once read, and a failure said in its place until a read goes through.
function groupRead<T>(load: () => Promise<T>, failed: string): GroupRead<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const failure = ref("");
  const reading = ref(false);

  async function read(): Promise<void> {
    reading.value = true;

    try {
      data.value = await load();
      failure.value = "";
    } catch (error) {
      failure.value = failureText(error, failed);
    } finally {
      reading.value = false;
    }
  }

  return { data, failure, reading, read };
}

// --- BMO ---

const bmo = groupRead(() => $fetch<RosterBmo>(`${base.value}/bmo`), t("roster.error.bmo_read_failed"));

// The BMO group's place while it is read, sized for the case met most: every part of the profile the deployment's, so
// no line says where a part came from and no persona stands to open, and the permission following the person's unit,
// whose line stands.
const bmoLabels = computed<PairSkeleton[]>(() => [
  { label: t("bmo_profile.label.name") },
  { label: t("bmo_profile.label.call_names") },
  { label: t("bmo_profile.label.picture"), beside: "picture" },
  { label: t("bmo_profile.label.persona") },
  { label: t("bmo_profile.label.permission"), under: true },
  { label: t("agents.label.column_road") }
]);

const persona = computed(() => bmo.data.value?.standing.persona.value ?? null);
const personaText = computed(() =>
  persona.value === null ? t("bmo_profile.label.default_value", { value: t("common.label.none") }) : t("roster.label.persona_length", { count: countText([...persona.value].length) })
);
const personaOpen = ref(false);
const bmoPicture = computed(() => (bmo.data.value?.picture === true ? `${base.value}/bmo/picture` : null));

const bmoRows = computed<PairRow[] | null>(() => {
  const one = bmo.data.value;

  if (one === null) return null;

  const { name, callNames, persona: personaPart, picture } = one.standing;
  const from = (source: typeof name.from) => sourceLine(t, source) ?? undefined;

  return [
    { key: "name", label: t("bmo_profile.label.name"), value: nameShown(t, name.value), under: from(name.from) },
    { key: "call-names", label: t("bmo_profile.label.call_names"), value: callNames.value.length > 0 ? callNames.value.join(", ") : t("bmo_profile.label.no_call_names"), under: from(callNames.from) },
    { key: "picture", label: t("bmo_profile.label.picture"), under: from(picture.from) },
    { key: "persona", label: t("bmo_profile.label.persona"), under: from(personaPart.from) },
    {
      key: "permission",
      label: t("bmo_profile.label.permission"),
      value: t(one.standing.personalize ? "bmo_profile.label.allow" : "bmo_profile.label.deny"),
      under: followsLine(t, { setting: one.personalizeSetting, allowed: one.standing.personalize, company: false }) ?? undefined
    },
    // The road of their supervisor, in the words agent management's road cell reads it in.
    { key: "road", label: t("agents.label.column_road"), value: one.road === null ? "—" : (roadText(providers.value, one.road) ?? "—") }
  ];
});

// --- The administrator's groups ---

const rooms = groupRead(() => $fetch<RosterRoom[]>(`${base.value}/rooms`), t("roster.error.rooms_read_failed"));
const agents = groupRead(() => $fetch<RosterAgent[]>(`${base.value}/agents`), t("roster.error.agents_read_failed"));
const sessions = groupRead(() => $fetch<RosterSession[]>(`${base.value}/sessions`), t("roster.error.sessions_read_failed"));
const runs = groupRead(() => $fetch<RosterRun[]>(`${base.value}/runs`), t("roster.error.runs_read_failed"));

function markOf(agent: RosterAgent): AgentMarkSubject {
  const group = agent.kind === "supervisor" ? "supervisor" : "role";

  return { name: agent.name, label: agent.label, chatId: null, group, icon: groupIcon(group) };
}

// An agent's second line: whose seat it is, its supervisor's word or its role, and its road where it has one.
function agentLine(agent: RosterAgent): string {
  const kind = agent.kind === "supervisor" ? t("agents.label.column_supervisor") : (agent.role ?? "");
  const road = agent.road === null ? null : roadText(providers.value, agent.road);

  return [kind, road].filter((one) => one !== null && one !== "").join(" · ");
}

function contextText(context: { carried: number; window: number }): string {
  return t("roster.label.context", { carried: countText(context.carried), window: countText(context.window), share: percentOf(context.window === 0 ? 0 : context.carried / context.window) });
}

function tookText(startedAt: number, endedAt: number): string {
  return elapsedText(t, toUnixSeconds(endedAt) - toUnixSeconds(startedAt));
}

function endingText(run: RosterRun): string {
  const ending = runEnding(run);

  return ending.outcome === null ? t(ending.key) : t(ending.key, { outcome: ending.outcome });
}

// --- The management menu ---

const acts = computed<RosterAct[]>(() => (person.value === null ? [] : rosterActs({ administrator: administrator.value, user: signed.value === null ? null : String(signed.value) }, person.value)));
const acting = ref(false);
const actFailure = ref("");

const ACT_ITEMS: Readonly<Record<RosterAct, { label: string; icon: string; color?: "error" }>> = {
  move: { label: "organization.action.move", icon: "i-material-symbols-move-item-outline" },
  machine: { label: "organization.action.bind", icon: "i-material-symbols-computer-outline" },
  profile: { label: "roster.action.profile", icon: "i-material-symbols-badge-outline" },
  sections: { label: "roster.action.sections", icon: "i-material-symbols-admin-panel-settings-outline" },
  bmo: { label: "bmo_profile.label.permission", icon: "i-material-symbols-face-outline" },
  leave: { label: "organization.action.mark_left_confirm", icon: "i-material-symbols-person-off-outline", color: "error" }
};

const menu = computed<DropdownMenuItem[]>(() =>
  acts.value.map((act) => ({ label: t(ACT_ITEMS[act].label), icon: ACT_ITEMS[act].icon, color: ACT_ITEMS[act].color, onSelect: () => void take(act) }))
);

async function take(act: RosterAct): Promise<void> {
  actFailure.value = "";

  if (act === "move") await startMove();
  else if (act === "machine") machineOpen.value = true;
  else if (act === "profile") await openProfile();
  else if (act === "sections") void router.push(organizationAddress("permissions", route.query, { user: props.user }));
  else if (act === "bmo") openBmoPermission();
  else await markLeft();
}

// An act that went through: the person read again, and their row with them.
async function actDone(): Promise<void> {
  await readPerson();
  if (person.value !== null) emit("changed", person.value);
}

// Something an act needs read first, its control spinning meanwhile; a refusal said under the head.
async function prepared<T>(work: () => Promise<T>): Promise<T | null> {
  acting.value = true;

  try {
    return await work();
  } catch (error) {
    actFailure.value = failureText(error, t("organization.error.failed"));

    return null;
  } finally {
    acting.value = false;
  }
}

// The move: the chart's move dialog, for this person alone, at its first step; it reads the units as they stand.
const moving = ref(false);
const units = ref<UnitRow[]>([]);
const moveDialog = useTemplateRef<{ start: (people: readonly string[], to?: number | null) => void }>("moveDialog");

function nameOf(user: string): string {
  return user === props.user ? (person.value?.name ?? user) : user;
}

async function startMove(): Promise<void> {
  const read = await prepared(() => $fetch<UnitRow[]>("/api/organization/units"));

  if (read === null) return;

  units.value = read;
  moveDialog.value?.start([props.user]);
}

// The machine: the chart's machine dialog.
const machineOpen = ref(false);

// The profile: the profile form of the account section, for this person, opened on their profile as it stands.
const profileOpen = ref(false);
const profile = ref<UserProfile | null>(null);

async function openProfile(): Promise<void> {
  const read = await prepared(() => $fetch<UserProfile>(`/api/users/${encodeURIComponent(props.user)}/profile`));

  if (read === null) return;

  profile.value = read;
  profileOpen.value = true;
}

// The BMO permission: the BMO tab at the person's company, their unit open.
function openBmoPermission(): void {
  const one = person.value;

  if (one !== null) void router.push(organizationAddress("agent", route.query, { company: String(one.company.id), unit: String(one.unit.id) }));
}

// Marking the person left, asked first as the chart asks it.
async function markLeft(): Promise<void> {
  const taken = await confirm({
    title: t("organization.title.mark_left"),
    item: person.value?.name ?? "",
    effect: t("organization.message.mark_left"),
    confirm: t("organization.action.mark_left_confirm")
  });

  if (!taken) return;

  const done = await prepared(() => $fetch(`/api/organization/users/${encodeURIComponent(props.user)}/leave`, { method: "POST" }));

  if (done !== null) await actDone();
}

// Every group is read as the person opens, the administrator's alone asked by the administrator alone.
onMounted(() => {
  void readPerson();
  void bmo.read();

  if (administrator.value) {
    void rooms.read();
    void agents.read();
    void sessions.read();
    void runs.read();
  }
});
</script>
