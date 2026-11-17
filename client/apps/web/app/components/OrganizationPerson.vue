<template>
  <!-- One person on the people tab (docs/web.md, 「Organisation」, the people tab): the head with the person's picture,
       name, login, marks and the management menu at its right end, over a row of tabs, one tab a part of what is the
       person's. The head scrolls away with the content and the row stays at the top of the region once it reaches it,
       its hairline running the region from edge to edge; the head, the row's tabs and the tab open stand in one reading
       column. Each tab is loaded and read as it is first opened and kept while the person stays open. Every change but
       the sections of the permissions tab is an act of the menu, opening the dialog it opens on its own tab. -->
  <article ref="article" class="flex w-full min-w-0 flex-col" :data-roster-person="props.user">
    <div class="p-4">
      <header class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-2">
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
    </div>

    <!-- The tabs' words start on the column's edge, as the head's and the tab's content do: the row is pulled out by
         a tab's own inner padding. -->
    <div ref="paneRow" :class="['sticky top-0 z-10 h-12 shrink-0 bg-default px-4', TAB_ROW_LINE]" data-person-tabs>
      <div class="mx-auto flex h-full w-full min-w-0 max-w-3xl">
        <UTabs
          :model-value="pane.value"
          :items="paneItems"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="-ms-2.5 min-w-0 flex-1 self-stretch"
          :ui="TAB_ROW_UI"
          :aria-label="$t('roster.aria.person_tabs')"
          @update:model-value="(value: string | number) => setPane(String(value))"
        />
      </div>
    </div>

    <div class="p-4">
      <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col" :data-person-pane="pane.value">
        <KeepAlive>
          <component :is="paneComponent" :key="pane.value" :user="props.user" :person="person" :failure="personFailure" :reading="personReading" :administrator="targetAdministrator" @retry="readPerson" />
        </KeepAlive>
      </div>
    </div>

    <OrganizationMoveDialog ref="moveDialog" v-model:open="moving" :units="units" :name-of="nameOf" :roles-of="rolesOfUnit" @moved="actDone" />
    <OrganizationPostDialog
      v-model:open="postOpen"
      :title="$t('organization.action.add_post')"
      :unit="null"
      :user="props.user"
      :units="postUnits"
      :roles="personRoles"
      @saved="actDone"
    />
    <OrganizationMachineDialog v-model:open="machineOpen" :user="props.user" :name="person?.name ?? ''" @changed="actDone" />
    <ProfileDialog v-model:open="profileOpen" :user="props.user" :profile="profile" :description="person?.name" @saved="actDone" />
  </article>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";

import { useAdministrator, useSignedUser } from "~/domain/access";
import { identityMark } from "~/domain/avatars";
import { useConfirm } from "~/domain/confirm";
import { organizationAddress } from "~/domain/organization";
import { PERSON_PANES, personAdministrator, personBase, personPaneOf, personPaneRefused, personPanesFor, withPersonPane } from "~/domain/person-panes";
import { ROSTER_STATE_FACES, rosterActs } from "~/domain/roster";
import { revealOpenTab } from "~/domain/tab-row";

import type { RosterAct } from "~/domain/roster";
import type { RoleView, RosterDetail, RosterPerson } from "#shared/roster";
import type { InviteUnit, UnitRow } from "@web/server-client";
import type { UserProfile } from "#shared/types";
import type { DropdownMenuItem } from "@nuxt/ui";
import type { Component } from "vue";

interface Props {
  user: string;
  // The person's row in the list they were opened from, where it holds them, which says some of what their read will.
  listed?: RosterPerson | null;
  // Whether the person stands over the list on a narrow screen, with the way back at the head.
  back?: boolean;
}

const props = withDefaults(defineProps<Props>(), { back: false, listed: null });
// `back` asks for the list again; `changed` hands on the person as read again after an act, for their row.
const emit = defineEmits<{ back: []; changed: [person: RosterDetail] }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const administrator = useAdministrator();
const signed = useSignedUser();

const base = computed(() => personBase(props.user));

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

const targetAdministrator = computed(() => personAdministrator(person.value, props.listed));
const face = computed(() => identityMark(`user:${props.user}`, person.value?.name ?? ""));
const stateFace = computed(() => ROSTER_STATE_FACES[person.value?.state ?? "active"]);

// --- The management menu ---

const acts = computed<RosterAct[]>(() => (person.value === null ? [] : rosterActs({ administrator: administrator.value, user: signed.value === null ? null : String(signed.value) }, person.value)));
const acting = ref(false);
const actFailure = ref("");

const ACT_ITEMS: Readonly<Record<RosterAct, { label: string; icon: string; color?: "error" }>> = {
  move: { label: "organization.action.move", icon: "i-material-symbols-move-item-outline" },
  post: { label: "roster.action.add_post", icon: "i-material-symbols-group-add-outline" },
  machine: { label: "organization.action.bind", icon: "i-material-symbols-computer-outline" },
  profile: { label: "roster.action.profile", icon: "i-material-symbols-badge-outline" },
  bmo: { label: "bmo_profile.label.permission", icon: "i-material-symbols-face-outline" },
  leave: { label: "organization.action.mark_left_confirm", icon: "i-material-symbols-person-off-outline", color: "error" }
};

const menu = computed<DropdownMenuItem[]>(() =>
  acts.value.map((act) => ({ label: t(ACT_ITEMS[act].label), icon: ACT_ITEMS[act].icon, color: ACT_ITEMS[act].color, onSelect: () => void take(act) }))
);

async function take(act: RosterAct): Promise<void> {
  actFailure.value = "";

  if (act === "move") await startMove();
  else if (act === "post") await startPost();
  else if (act === "machine") machineOpen.value = true;
  else if (act === "profile") await openProfile();
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
  const read = await prepared(async () => {
    const all = await $fetch<UnitRow[]>("/api/organization/units");
    const companies = all.filter((unit) => unit.parent === undefined || unit.parent === null);
    const roles = await Promise.all(companies.map(async (company) => [company.id, await $fetch<RoleView[]>(`/api/organization/companies/${company.id}/roles`)] as const));

    return { all, roles: new Map(roles) };
  });

  if (read === null) return;

  units.value = read.all;
  companyRoles.value = read.roles;
  moveDialog.value?.start([props.user]);
}

// Each company's roles, lowest first, for the move's choice of the role a person carries where they go.
const companyRoles = ref(new Map<number, RoleView[]>());

function rolesOfUnit(unit: number): RoleView[] {
  const byId = new Map(units.value.map((one) => [one.id, one]));
  let at = byId.get(unit);

  while (at !== undefined && at.parent !== undefined && at.parent !== null) at = byId.get(at.parent);

  return at === undefined ? [] : (companyRoles.value.get(at.id) ?? []);
}

// A post given to the person: the units of their company the reader may give one in, but their home unit, and the
// company's roles.
const postOpen = ref(false);
const postUnits = ref<{ label: string; value: string }[]>([]);
const personRoles = ref<RoleView[]>([]);

async function startPost(): Promise<void> {
  const one = person.value;

  if (one === null) return;

  const read = await prepared(() =>
    Promise.all([$fetch<InviteUnit[]>("/api/invites/units"), $fetch<RoleView[]>(`/api/organization/companies/${one.company.id}/roles`)])
  );

  if (read === null) return;

  const [mayGive, roles] = read;
  const byId = new Map(mayGive.map((unit) => [unit.id, unit]));
  const path = (unit: InviteUnit): string => {
    const names: string[] = [];
    let at: InviteUnit | undefined = unit;

    while (at !== undefined && !names.includes(at.name)) {
      names.unshift(at.name);
      at = at.parent === undefined || at.parent === null ? undefined : byId.get(at.parent);
    }

    return names.join(" › ");
  };

  postUnits.value = mayGive.filter((unit) => unit.company.id === one.company.id && unit.id !== one.unit.id).map((unit) => ({ label: path(unit), value: String(unit.id) }));
  personRoles.value = roles;
  postOpen.value = true;
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

// --- The tabs ---

// Each tab says which readers it stands for, and the address names the one open.
const panes = computed(() => personPanesFor({ administrator: administrator.value }));
const pane = computed(() => personPaneOf(route.query, panes.value));
const paneItems = computed(() => panes.value.map((one) => ({ value: one.value, label: t(one.label) })));

// A tab the address names that the reader may not open, or that is no tab, is taken off it with no step of the
// history, the person opening at their first tab.
// It waits until the person stands in the browser, as the screen's own tabs do.
onMounted(() =>
  watch(
    () => route.query,
    (query) => {
      if (personPaneRefused(query, panes.value)) void router.replace({ query: withPersonPane(query, PERSON_PANES[0]!.value) });
    },
    { immediate: true }
  )
);

// Moving to another tab is a step of the history, as the screen's tabs are.
function setPane(next: string): void {
  if (next !== pane.value.value) void router.push({ query: withPersonPane(route.query, next) });
}

// Each tab's component, made once and loaded the first time it is opened.
const components = new Map<string, Component>();
const paneComponent = computed(() => {
  const { value, load } = pane.value;

  if (!components.has(value)) components.set(value, defineAsyncComponent(load));

  return components.get(value)!;
});

// The open tab brought into the row's view on a narrow region where the row scrolls sideways, and, where the head has
// scrolled away, the region brought back to the tab's start, which the row stays over: the person is the whole of the
// region it scrolls in.
const article = useTemplateRef<HTMLElement>("article");
const paneRow = useTemplateRef<HTMLElement>("paneRow");

watch(
  () => [pane.value.value, paneRow.value] as const,
  () => void nextTick(() => revealOpenTab(paneRow.value)),
  { immediate: true, flush: "post" }
);

watch(
  () => pane.value.value,
  () => {
    const region = article.value?.parentElement;
    const start = paneRow.value?.previousElementSibling;

    if (region instanceof HTMLElement && start instanceof HTMLElement && region.scrollTop > start.offsetHeight) region.scrollTop = start.offsetHeight;
  },
  { flush: "post" }
);

onMounted(() => void readPerson());
</script>
