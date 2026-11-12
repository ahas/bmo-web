<template>
  <!-- The box a message or a job is written in, wherever one is sent from: the words, kept as a
       draft of this place, the long pastes that stand beside them as marks, and the files, which
       reach it by the clip button, a paste or a drop. What is attached stands in the box's head
       until it is sent, each with its own way out; what the place adds — a reply it answers, a
       choice it launches with — stands before the attachments and in the foot. -->
  <div
    class="flex min-h-0 flex-col"
    @dragover.prevent.stop="onDragOver"
    @dragleave="dragging = false"
    @drop.prevent.stop="onDrop"
    @keydown.capture="mentionKeydown"
    @input="mentionTrack"
    @keyup="mentionTrack"
    @click="mentionTrack"
    @focusout="onFocusOut"
  >
    <!-- The mention an @ starts: the room's people and agents, the choice moved by the arrows and taken by Enter,
         standing over the box so the list never covers what is being written (docs/web.md, the room screen's section
         on mentions). -->
    <div v-if="mentionOpen" data-mentions class="mb-2 flex min-h-0 flex-col overflow-hidden rounded-md border border-default bg-elevated shadow-sm">
      <ul role="listbox" :aria-label="$t('room.aria.mention_list')" class="max-h-56 overflow-y-auto py-1">
        <li v-for="(candidate, index) in mentionItems" :key="`${candidate.kind}:${candidate.text}`">
          <button
            type="button"
            role="option"
            :aria-selected="index === mentionActive"
            :aria-label="candidate.kind === 'agent' ? $t('room.aria.mention_agent', { name: candidate.text }) : $t('room.aria.mention_person', { name: candidate.text })"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm"
            :class="index === mentionActive ? 'bg-muted text-highlighted' : 'text-muted'"
            @mousedown.prevent="chooseMention(index)"
            @mouseenter="aimMention(index)"
          >
            <UAvatar v-if="candidate.avatar !== undefined" v-bind="candidate.avatar" size="2xs" class="shrink-0" />
            <UIcon v-else :name="candidate.kind === 'agent' ? 'i-material-symbols-smart-toy-outline' : 'i-material-symbols-person-outline'" class="size-4 shrink-0 text-dimmed" aria-hidden="true" />
            <span data-mention-name class="truncate">{{ candidate.text }}</span>
          </button>
        </li>
      </ul>
    </div>

    <ChatInput
      ref="box"
      v-model="typed"
      :split="props.split"
      :inline="props.inline"
      :label="props.label"
      :placeholder="dragging ? $t('room.placeholder.drop_here') : props.placeholder"
      :disabled="props.disabled"
      :busy="props.busy"
      :holds="attached.length > 0 || handed.length > 0"
      @keydown.esc="emit('escape', $event)"
      @paste="onPaste"
      @submit="submit"
    >
      <template v-if="$slots.lead || recording || attached.length > 0 || shownPastes.length > 0 || handed.length > 0" #header>
        <div class="flex min-w-0 flex-col gap-2">
          <slot name="lead" />

          <div v-if="recording" data-recording class="flex min-w-0 items-center gap-2 rounded-sm border border-primary px-2 py-1">
            <span class="size-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
            <span class="text-sm text-muted tabular-nums">{{ $t("room.label.recording", { time: playClock(recordedSeconds) }) }}</span>
            <span class="flex-1" />
            <UTooltip :text="$t('room.action.stop_recording')">
              <UButton icon="i-material-symbols-stop-circle" color="primary" variant="ghost" size="xs" :aria-label="$t('room.action.stop_recording')" @click="stopRecording" />
            </UTooltip>
            <UTooltip :text="$t('room.action.cancel_recording')">
              <UButton icon="i-material-symbols-close" color="neutral" variant="ghost" size="xs" :aria-label="$t('room.action.cancel_recording')" @click="cancelRecording" />
            </UTooltip>
          </div>

          <ul v-if="attached.length > 0 || shownPastes.length > 0 || handed.length > 0" class="flex flex-wrap gap-2">
            <!-- A secret saved through the clip stands as its name and kind until it is sent, holding no value
                 (docs/web.md, the room screen's attachments). -->
            <li
              v-for="secret in handed"
              :key="`secret:${secret.name}`"
              data-handed-secret
              class="flex min-w-0 items-center gap-2 rounded-sm border border-default px-2 py-1"
            >
              <UIcon name="i-material-symbols-key-outline" class="size-5 shrink-0 text-dimmed" />
              <span class="max-w-60 truncate text-sm text-muted">{{ $t("secrets.label.handed", { name: secret.name, kind: secret.kind }) }}</span>
              <UTooltip :text="$t('secrets.action.remove_handed', { name: secret.name })">
                <UButton
                  icon="i-material-symbols-close"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="$t('secrets.action.remove_handed', { name: secret.name })"
                  @click="unhand(secret.name)"
                />
              </UTooltip>
            </li>
            <li
              v-for="entry in shownPastes"
              :key="entry.key"
              class="flex min-w-0 items-center gap-2 rounded-sm border border-default px-2 py-1"
            >
              <UIcon name="i-material-symbols-content-paste" class="size-5 shrink-0 text-dimmed" />
              <span class="shrink-0 text-sm font-medium text-muted">{{ pastedLabel($t, entry).name }}</span>
              <span class="max-w-60 truncate text-sm text-muted">{{ pastedLabel($t, entry).head }}</span>
              <span class="shrink-0 text-sm text-dimmed tabular-nums">{{ pastedLabel($t, entry).size }}</span>
              <UTooltip :text="$t('room.action.remove_paste')">
                <UButton
                  icon="i-material-symbols-close"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="$t('room.action.remove_paste')"
                  @click="unpaste(entry)"
                />
              </UTooltip>
            </li>
            <li
              v-for="picked in attached"
              :key="picked.key"
              data-picked
              class="flex min-w-0 items-center gap-2 rounded-sm border border-default px-2 py-1"
            >
              <AudioPlayer
                v-if="picked.voice !== undefined && picked.previewUrl !== null"
                class="w-64 max-w-full shrink-0"
                :src="picked.previewUrl"
                :download="picked.previewUrl"
                :name="$t('room.label.voice_note')"
                :size="fileSizeText(picked.file.size)"
              />
              <img v-else-if="picked.previewUrl !== null" :src="picked.previewUrl" alt="" class="size-8 shrink-0 object-cover" />
              <UIcon v-else name="i-material-symbols-draft-outline" class="size-5 shrink-0 text-dimmed" />
              <span v-if="picked.voice === undefined" class="max-w-60 truncate text-sm text-muted">{{ attachmentLabel(picked.file) }}</span>
              <UTooltip :text="$t('room.aria.remove_named', { name: picked.file.name })">
                <UButton
                  icon="i-material-symbols-close"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="$t('room.aria.remove_named', { name: picked.file.name })"
                  @click="remove(picked.key)"
                />
              </UTooltip>
            </li>
          </ul>
        </div>
      </template>

      <template #tools>
        <!-- A phone's file picker takes one file a tap, so a touch screen offers its photo picker
             beside it, where every tap adds one to the choice; a clip offers the administrator a secret too. A menu
             that would hold the file picker alone is no menu, and the clip opens the picker at once. -->
        <UDropdownMenu v-if="props.attachable && pickers.length > 1" :items="pickers" :content="pickerMenu">
          <UTooltip :text="$t('room.action.attach_file')">
            <UButton
              icon="i-material-symbols-attach-file"
              color="neutral"
              variant="ghost"
              :aria-label="$t('room.action.attach_file')"
              :disabled="props.disabled"
            />
          </UTooltip>
        </UDropdownMenu>
        <UTooltip v-else-if="props.attachable" :text="$t('room.action.attach_file')">
          <UButton
            icon="i-material-symbols-attach-file"
            color="neutral"
            variant="ghost"
            :aria-label="$t('room.action.attach_file')"
            :disabled="props.disabled"
            @click="picker?.click()"
          />
        </UTooltip>
        <!-- The clip is the box's one tool (docs/web.md, the room screen's input box): the voice note's own button and
             every screen's buttons are not shown, while the roads that carry a voice note, a sticker and a room's own
             tools stay in this code and on their routes. -->
        <slot name="tools" />
      </template>
    </ChatInput>

    <!-- The pickers the clip opens, never drawn: the native attribute, which the console's own rule holds
         hidden against a unit bundle's styles (docs/web.md, 「Screens a unit brings」). -->
    <input v-if="props.attachable" ref="picker" data-attach-picker type="file" multiple hidden @change="onPick" />
    <input v-if="props.attachable" ref="mediaPicker" data-attach-media type="file" :accept="MEDIA_ACCEPT" multiple hidden @change="onPick" />
  </div>
</template>

<script setup lang="ts">
import { attachmentLabel, fileSizeText, isPreviewable, pickFiles } from "~/domain/attachments";
import { useDraft, useDraftPastes } from "~/domain/drafts";
import { useMentions } from "~/domain/mentions";
import { useIsland } from "bmo-ui/app/domain/island";
import { composedText, isPasteEntry, pastedLabel, pastedOf, standingPastes, withoutMark } from "~/domain/pasted";
import { playClock } from "~/domain/player";
import { TOUCH_QUERY } from "bmo-ui/app/domain/prompt";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { askSecret, composerPlace, emptyAsk, handedLines, useSecretForm, useSecretSaved } from "~/domain/secret-form";
import { recordingType, voiceFileName } from "~/domain/voice";

import type { ComposedMessage, PickedFile } from "~/domain/attachments";
import type { MentionSources } from "~/domain/mentions";
import type { DraftKind } from "~/domain/drafts";
import type { PastedText } from "~/domain/pasted";
import type { HandedSecret } from "~/domain/secret-form";
import type { RecordingType } from "~/domain/voice";
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  // Whose draft this is: the kind of place and which one of them.
  kind: DraftKind;
  draftId: string | number;
  placeholder: string;
  label?: string;
  disabled?: boolean;
  busy?: boolean;
  split?: boolean;
  // Whether what is sent from here may carry files. A place that cannot take them never offers
  // the clip, and a file pasted or dropped on it is left to the browser.
  attachable?: boolean;
  // Whether the box is one line, its buttons on the words' last line (see ChatInput).
  inline?: boolean;
  // Who the room offers an @, where the place offers one at all: the people who spoke there and the agents answering
  // it (docs/web.md, the room screen's section on mentions). A place that names none offers no mention.
  mention?: MentionSources;
  // Whether the clip offers a secret, which the place grants the administrator alone wherever it offers a clip
  // (docs/web.md, the secret store section).
  secrets?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  disabled: false,
  busy: false,
  split: false,
  attachable: false,
  inline: false,
  mention: undefined,
  secrets: false
});

const emit = defineEmits<{ submit: [message: ComposedMessage]; escape: [event: KeyboardEvent] }>();

const { t } = useI18n();
const island = useIsland(t);

const typed = useDraft(props.kind, props.draftId);

// The mention an @ starts in this box: the room's people and agents, and the words a pick leaves. A place that names
// nobody to mention offers none.
const { open: mentionOpen, items: mentionItems, active: mentionActive, track: mentionTrack, key: mentionKey, choose: chooseMention, aim: aimMention, close: closeMention } = useMentions(
  typed,
  () => box.value?.textarea() ?? null,
  () => props.mention ?? { people: [], agents: [] },
  () => props.mention !== undefined
);

// A key the open list takes never reaches the box or the screen behind it, so Enter picks a name rather than sending
// the words, and the arrows never move the caret.
function mentionKeydown(event: KeyboardEvent): void {
  if (!mentionKey(event)) return;

  event.preventDefault();
  event.stopPropagation();
}

// Pressing away from the box puts the list away, unless the press was on the list itself, which keeps the keyboard.
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;

  if (mentionOpen.value && (!(next instanceof Node) || !(event.currentTarget as HTMLElement | null)?.contains(next))) {
    closeMention();
  }
}

// The long pastes waiting beside the box, kept with the draft; the ones sent are those whose mark
// still stands in it.
const pasted = useDraftPastes(props.kind, props.draftId);
const shownPastes = computed<PastedText[]>(() => standingPastes(typed.value, pasted.value));
const attached = ref<PickedFile[]>([]);
const dragging = ref(false);
const picker = useTemplateRef<HTMLInputElement>("picker");
const mediaPicker = useTemplateRef<HTMLInputElement>("mediaPicker");
const touch = useNarrow(TOUCH_QUERY);

// A picker asked for pictures and videos alone opens a phone's own photo picker.
const MEDIA_ACCEPT = "image/*,video/*";

const pickers = computed<DropdownMenuItem[]>(() => [
  ...(touch.value ? [{ label: t("room.action.attach_media"), icon: "i-material-symbols-photo-library-outline", onSelect: () => mediaPicker.value?.click() }] : []),
  { label: t("room.action.attach_document"), icon: "i-material-symbols-draft-outline", onSelect: () => picker.value?.click() },
  ...(props.secrets ? [{ label: t("room.action.attach_secret"), icon: "i-material-symbols-key-outline", onSelect: askHanded }] : [])
]);

// The secrets saved through this box's clip: each a name and its kind's words, and never a value. They are this
// box's alone, kept in no draft, and go into the room as the pack's line when the box is sent.
const secretForm = useSecretForm();
const secretSaved = useSecretSaved();
const handed = ref<HandedSecret[]>([]);
const place = computed(() => composerPlace(props.kind, props.draftId));

// The menu hands the focus back to the clip as it closes, which a form opened from it would read as a press outside
// itself and close on; so a menu closing on the secret form leaves the focus where the form put it.
let formFromMenu = false;
const pickerMenu = {
  side: "top" as const,
  align: "start" as const,
  onCloseAutoFocus: (event: Event) => {
    if (formFromMenu) event.preventDefault();

    formFromMenu = false;
  }
};

function askHanded(): void {
  formFromMenu = true;
  askSecret(secretForm, emptyAsk(), { kind: "composer", place: place.value });
}

watch(secretSaved, (saved) => {
  if (saved === null || saved.target.kind !== "composer" || saved.target.place !== place.value) return;

  handed.value = [...handed.value.filter((one) => one.name !== saved.handed.name), saved.handed];
});

function unhand(name: string): void {
  handed.value = handed.value.filter((one) => one.name !== name);
}
const box = useTemplateRef<{ focus: () => void; textarea: () => HTMLTextAreaElement | null }>("box");

// Recording stands in the box the way an attachment does: one note at a time, with its own length, and a way to
// stop it or throw it away before it goes.
const recording = ref(false);
const starting = ref(false);
const recordedSeconds = ref(0);
const recordable = ref(false);
let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let clock: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let recordedFor = 0;
let discard = false;
let disposed = false;
let captured: RecordingType | null = null;

onMounted(() => {
  recordable.value =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";
});

function submit(): void {
  if (props.disabled || props.busy || recording.value) {
    return;
  }

  const typedText = composedText(typed.value, shownPastes.value);
  const handedText = handedLines(t, handed.value, false);
  const text = handedText === "" ? typedText : typedText.trim() === "" ? handedText : `${typedText}\n\n${handedText}`;

  if (text.trim() === "" && attached.value.length === 0) {
    return;
  }

  emit("submit", { text, files: [...attached.value] });
}

// A browser draws an image it already holds; everything else stands as its name and size.
function previewOf(file: File): string | null {
  return isPreviewable(file.type) ? URL.createObjectURL(file) : null;
}

function supportedRecording(type: string): boolean {
  return typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type);
}

async function startRecording(): Promise<void> {
  if (!recordable.value || recording.value || starting.value || props.disabled || props.busy) {
    return;
  }

  if (attached.value.length > 0) {
    island.say({ title: t("room.error.file_with_voice"), tone: "warning" });

    return;
  }

  starting.value = true;

  try {
    let media: MediaStream;

    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      island.say({ title: t("room.error.voice_denied"), tone: "warning" });

      return;
    }

    if (disposed) {
      media.getTracks().forEach((track) => track.stop());

      return;
    }

    const chosen = recordingType(supportedRecording);
    let started: MediaRecorder;

    try {
      started = new MediaRecorder(media, chosen === null ? undefined : { mimeType: chosen.type });
    } catch {
      media.getTracks().forEach((track) => track.stop());
      island.say({ title: t("room.error.voice_unsupported"), tone: "warning" });

      return;
    }

    stream = media;
    recorder = started;
    captured = chosen;
    chunks = [];
    discard = false;
    startedAt = Date.now();
    recordedFor = 0;
    recordedSeconds.value = 0;
    started.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    started.onstop = () => finishRecording();

    try {
      started.start(500);
    } catch {
      stopTracks();
      recorder = null;
      island.say({ title: t("room.error.voice_unsupported"), tone: "warning" });

      return;
    }

    recording.value = true;
    clock = setInterval(() => {
      recordedSeconds.value = Math.round((Date.now() - startedAt) / 1000);
    }, 250);
  } finally {
    starting.value = false;
  }
}

function stopRecording(): void {
  if (recorder === null || recorder.state === "inactive") {
    return;
  }

  recordedFor = Math.round((Date.now() - startedAt) / 1000);
  recorder.stop();
  stopClock();
}

function cancelRecording(): void {
  if (recorder === null || recorder.state === "inactive") {
    stopTracks();
    recording.value = false;
    recordedSeconds.value = 0;

    return;
  }

  discard = true;
  stopRecording();
}

function finishRecording(): void {
  if (recorder === null) {
    return;
  }

  const type = recorder.mimeType || captured?.type || "";
  const blob = new Blob(chunks, { type });
  const seconds = Math.max(1, recordedFor || Math.round((Date.now() - startedAt) / 1000));
  const at = Date.now();

  chunks = [];
  recorder = null;
  stopTracks();
  recording.value = false;
  recordedSeconds.value = 0;

  if (discard) {
    discard = false;

    return;
  }

  if (blob.size === 0) {
    island.say({ title: t("room.error.voice_empty"), tone: "warning" });

    return;
  }

  const name = voiceFileName(at, type);
  const file = new File([blob], name, { type });
  const picked: PickedFile = {
    key: `voice-${at}-${Math.random().toString(16).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(blob),
    voice: { seconds }
  };

  attached.value = [picked];
}

function stopTracks(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  stopClock();
}

function stopClock(): void {
  if (clock !== null) {
    clearInterval(clock);
    clock = null;
  }
}

// Files reach here three ways — the clip button, a drop, a paste into the box — and all three end
// in the same list, with anything refused said out loud rather than dropped.
function attach(files: readonly File[]): void {
  if (files.length === 0 || !props.attachable) {
    return;
  }

  if (attached.value.some((picked) => picked.voice !== undefined)) {
    island.say({ title: t("room.error.voice_with_files"), tone: "warning" });

    return;
  }

  const picked = pickFiles(t, attached.value, files, previewOf);

  attached.value = picked.files;

  for (const refusal of picked.refusals) {
    island.say({ title: refusal, tone: "warning" });
  }
}

function remove(key: string): void {
  const going = attached.value.find((picked) => picked.key === key);

  if (going?.previewUrl != null) {
    URL.revokeObjectURL(going.previewUrl);
  }

  attached.value = attached.value.filter((picked) => picked.key !== key);
}

// The box emptied after a send. A place that keeps showing the files — a room, whose feed stands
// them as sending — takes their previews over and lets them go itself.
function clear(options: { keepPreviews?: boolean } = {}): void {
  if (recording.value) {
    cancelRecording();
  }

  if (options.keepPreviews !== true) {
    for (const picked of attached.value) {
      if (picked.previewUrl !== null) {
        URL.revokeObjectURL(picked.previewUrl);
      }
    }
  }

  typed.value = "";
  pasted.value = [];
  attached.value = [];
  handed.value = [];
}

// The previews still in the tray go back to the browser with the box; the words stay as the draft.
onScopeDispose(() => {
  disposed = true;
  discard = true;

  if (recorder !== null && recorder.state !== "inactive") {
    recorder.stop();
  }

  stopTracks();

  for (const picked of attached.value) {
    if (picked.previewUrl !== null) {
      URL.revokeObjectURL(picked.previewUrl);
    }
  }
});

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;

  attach([...(input.files ?? [])]);
  input.value = "";
}

function onDragOver(event: DragEvent): void {
  dragging.value = props.attachable && (event.dataTransfer?.types.includes("Files") ?? false);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  attach([...(event.dataTransfer?.files ?? [])]);
}

// A picture in the clipboard arrives as a file with no name of its own; the box keeps the text it
// was carrying, so pasted words still land in it — unless there are so many of them that they are
// text to hand over rather than to edit, and then a mark stands for them where the caret is, and
// the words go back in that place when the message is sent.
function onPaste(event: ClipboardEvent): void {
  const files = [...(event.clipboardData?.files ?? [])];

  if (files.length > 0 && props.attachable) {
    event.preventDefault();
    attach(files);

    return;
  }

  const text = event.clipboardData?.getData("text/plain") ?? "";

  if (!isPasteEntry(text)) {
    return;
  }

  event.preventDefault();

  const entry = pastedOf(text, pasted.value);

  pasted.value = [...pasted.value, entry];
  insertAtCaret(event.target, entry.mark);
}

// Text put where the caret is, as typing would put it: through the editing command, so undo takes
// it back, and by hand where the browser no longer has the command.
function insertAtCaret(target: EventTarget | null, text: string): void {
  const area = target as HTMLTextAreaElement | null;

  if (area === null || typeof area.setRangeText !== "function") {
    typed.value += text;

    return;
  }

  area.focus();

  if (document.execCommand("insertText", false, text)) {
    return;
  }

  area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

function unpaste(entry: PastedText): void {
  typed.value = withoutMark(typed.value, entry);
}

defineExpose({ focus: () => box.value?.focus(), attach, clear });
</script>
