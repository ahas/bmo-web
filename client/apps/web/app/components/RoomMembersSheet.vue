<template>
  <!-- A room's members (docs/web.md, the room screen's members entry): each with their face, their name and the status
       line their chat service read, and the mark of a console user, pressed through to that person's page, on a
       member the account service knows as an account. A member it does not know stands as a member alone. -->
  <!-- A side sheet on a wide screen, as the room's session sheet is; a bottom drawer on a narrow one, where a panel pulled up to
       consult stands. -->
  <component :is="narrow ? UDrawer : USlideover" v-model:open="open" :title="$t('members.title.sheet')" :description="props.title">
    <template #close="{ ui }">
      <ShellClose :class="ui.close()" @close="open = false" />
    </template>

    <template #body>
      <ContentSkeleton v-if="!loaded && pending" :rows="3" :list-class="LIST" :label="$t('members.status.loading')">
        <div :class="ROW">
          <USkeleton class="size-8 shrink-0 rounded-full" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonBar class="h-4 w-32" />
            <SkeletonBar class="h-4 w-48" />
          </div>
        </div>
      </ContentSkeleton>

      <ReadFailure :failure="failure" :message="failed" :reading="pending" @retry="read()" />

      <p v-if="loaded && members.length === 0" class="text-sm text-dimmed">{{ $t("members.label.none") }}</p>

      <ul v-else-if="loaded" :class="LIST" data-room-members>
        <li v-for="member in members" :key="member.person ?? `name:${member.name}`" :data-room-member="member.person ?? ''">
          <NuxtLink
            v-if="member.account !== null && mayOpenPeople"
            :to="`/people/${member.account}`"
            :class="[ROW, 'transition-colors hover:bg-elevated active:bg-accented focus-inset']"
            :data-console-user="member.account"
          >
            <RoomMemberLine :member="member" :avatars="props.avatars" />
          </NuxtLink>
          <div v-else :class="ROW" :data-console-user="member.account ?? undefined">
            <RoomMemberLine :member="member" :avatars="props.avatars" />
          </div>
        </li>
      </ul>
    </template>
  </component>
</template>

<script setup lang="ts">
import { failureText } from "bmo-ui/app/domain/errors";
import { useNarrow } from "bmo-ui/app/domain/screen";

import { UDrawer, USlideover } from "#components";

import { useReadFailure } from "~/domain/events";
import { useSectionAccess } from "~/domain/section-access";
import { mayRead } from "#shared/sections";

import type { AvatarIndex } from "~/domain/avatars";
import type { RoomMember } from "#shared/types";

interface Props {
  chatId: number;
  title: string;
  avatars: AvatarIndex;
  administrator: boolean;
}

// The list and each row share one shape, so the skeleton's rows stand where the members land.
const LIST = "flex flex-col gap-1";
const ROW = "flex min-h-12 min-w-0 items-center gap-3 rounded-md px-2 py-2";

const props = defineProps<Props>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const narrow = useNarrow();
const access = useSectionAccess();

// A person's page is the account section's, so a member is pressed through to it only for a reader who may read
// that section (docs/web.md, 「Person's page」).
const mayOpenPeople = computed<boolean>(() => props.administrator || mayRead(access.value, "account"));

const members = ref<RoomMember[]>([]);
const loaded = ref(false);
const pending = ref(false);
const failed = ref("");
let generation = 0;
onScopeDispose(() => { generation++; });

// Each opening reads the members afresh, since the chat service may have read them again since the last look.
async function read(): Promise<void> {
  const mine = ++generation;

  pending.value = true;
  failed.value = "";

  try {
    const answer = await $fetch<RoomMember[]>(`/api/rooms/${props.chatId}/members`);

    if (mine !== generation) return;
    members.value = answer;
    loaded.value = true;
  } catch (error) {
    if (mine !== generation) return;
    failed.value = failureText(error, t("members.error.load_failed"));
  } finally {
    if (mine === generation) pending.value = false;
  }
}

const failure = useReadFailure({
  failed: () => open.value && failed.value !== "",
  reading: () => pending.value,
  reread: () => void read()
});

watch(open, (standing) => {
  if (standing) void read();
});
</script>
