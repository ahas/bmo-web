<template>
  <!-- One row's detail, whole, over the list rather than inside it. A row carries an
       instruction, an account, a talk and every button that acts on it, and at the width this
       panel stands in, opening that under the row pushes the rest of the queue off the screen.
       So it is read the way every other long thing in this console is read: in the middle of a
       wide screen, up from the bottom edge of a narrow one, scrolling inside a shell of a fixed
       height.

       Only the panel a person is actually looking at draws it. Both panels are mounted on a
       narrow screen — the aside is hidden by a class rather than unmounted — and a dialog is
       teleported out of the layout, so the hidden one's would stand on the screen just as
       plainly as the drawer's, and both would push an entry of their own onto the back stack. -->
  <component
    :is="narrow ? UDrawer : UModal"
    v-if="shows"
    v-bind="detailShell"
    :open="detailOpen"
    @update:open="detailOpen = $event"
  >
    <template #content>
      <div class="flex h-full min-h-0 flex-col">
        <!-- The document's head (docs/web.md, the TODO modal): the number and the title with the state on a line of its
             own under them, never a chip beside the title, and at the top right the form block, the approval line and
             the item's assignment, where an approval form puts its approval box. It is two columns where the body is, so
             it is only as tall as the taller of the two and the body begins right under it. Where the dialog is too
             narrow for two columns, the box under the state carries the approval line alone and the assignment heads
             the manage tab. -->
        <div class="grid border-b border-default lg:grid-cols-[minmax(0,1fr)_minmax(0,38rem)]" data-item-head>
          <div class="flex min-w-0 flex-col gap-2 px-4 py-3">
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-sm tabular-nums text-muted">#{{ openedItem?.id }}</span>
              <h2 class="min-w-0 flex-1 text-xl font-semibold break-words text-highlighted" data-item-title>{{ openedItem?.title }}</h2>

              <!-- The dialog's one add: a new item raised out of the unfinished note. It belongs to this row, so it is
                   contained and stands before the close mark at every width at the row's own button size, never floating
                   over a screen's own create button (docs/web.md, the add that belongs to a row); on a wide dialog the
                   two stand at the box's top right. -->
              <UTheme v-if="openedItem !== null && openedItem.unfinished !== null && !twoColumns" :props="ROW_BUTTONS">
                <CreateButton contained :label="$t('todo.action.create_item')" @click="startRaise(openedItem.id)" />
              </UTheme>

              <UTooltip v-if="!twoColumns" :text="$t('common.action.close')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-close" :aria-label="$t('common.action.close')" data-item-close @click="detailOpen = false" />
              </UTooltip>
            </div>

            <div v-if="openedItem !== null" class="flex flex-wrap items-center gap-2 text-sm" data-item-state>
              <!-- A running item's state is pressed for its job's log, as the line's job log entry is (docs/web.md, the TODO panel). -->
              <UTooltip v-if="openedItem.running" :text="$t('todo.action.job_log')">
                <UButton
                  :color="stateColour(openedItem)"
                  variant="subtle"
                  size="xs"
                  :icon="stateIcon(openedItem)"
                  :label="stateLabel($t, openedItem)"
                  data-item-state-log
                  @click="emit('log', openedItem)"
                />
              </UTooltip>
              <UBadge v-else :color="stateColour(openedItem)" variant="subtle" size="sm" :icon="stateIcon(openedItem)">
                {{ stateLabel($t, openedItem) }}
              </UBadge>
            </div>

            <!-- A stopped order at the head of its worker's queue, whole: what stopped it, its turn and
                 why it waits, and how many times it failed. The card in the queue says the turn alone. -->
            <dl v-if="openedStop !== null" class="flex flex-col gap-1 text-sm">
              <div v-if="openedStop.reason !== null" class="flex min-w-0 gap-2">
                <dt class="shrink-0 text-muted">{{ $t("todo.label.stop_reason") }}</dt>
                <dd class="min-w-0 break-words text-highlighted">{{ openedStop.reason }}</dd>
              </div>
              <div class="flex min-w-0 gap-2">
                <dt class="shrink-0 text-muted">{{ openedStop.turn }}</dt>
                <dd class="min-w-0 break-words text-highlighted">{{ openedStop.why }}</dd>
              </div>
            </dl>
            <p v-if="openedStop !== null && openedStop.failures > 0" class="text-sm text-warning tabular-nums">
              {{ $t("todo.label.stop_failures", { n: countText(openedStop.failures) }) }}
            </p>

            <TodoFormBox v-if="openedItem !== null && !twoColumns" :cells="approvalLine" />
          </div>

          <!-- The close mark stands at the box's top right, the create button before it, centred on the box's first row: they
               stand in a row as tall as that one, under an edge as thick as the box's. It comes first among what can be focused, so the
               dialog opens with the focus on it rather than on a field of the box. -->
          <div v-if="openedItem !== null && twoColumns" class="flex min-w-0 items-start gap-2 px-4 py-3">
            <span class="order-last box-content flex h-8 items-center gap-2 border-t border-transparent">
              <UTheme v-if="openedItem.unfinished !== null" :props="ROW_BUTTONS">
                <CreateButton contained :label="$t('todo.action.create_item')" @click="startRaise(openedItem.id)" />
              </UTheme>
              <UTooltip :text="$t('common.action.close')">
                <UButton size="sm" color="neutral" variant="ghost" icon="i-material-symbols-close" :aria-label="$t('common.action.close')" data-item-close @click="detailOpen = false" />
              </UTooltip>
            </span>
            <TodoFormBox class="min-w-0 flex-1" :cells="approvalLine">
              <TodoAssignFields v-bind="assignment" shape="cells" @agent="(chosen: ItemAssignment) => void setAgent(openedItem!.id, chosen)" @worker="(chosen: string) => assignWorker(openedItem!.id, chosen)" />
            </TodoFormBox>
          </div>
        </div>

        <!-- The body is two parts, each a set of tabs: on the left the result of an item that has ended, what has
             happened to it, what the work is told and the request's own words; on the right the talk about it and
             what he does to it. Where the dialog is narrow the tabs stand as one row over one scroll. -->
        <div v-if="openedItem !== null" class="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:grid-rows-[minmax(0,1fr)]">
          <UTabs
            v-if="!twoColumns"
            v-model="singleTab"
            :items="detailTabs"
            :content="false"
            color="neutral"
            variant="link"
            size="sm"
            :class="['h-10 shrink-0 px-2', TAB_ROW_LINE]"
            :ui="TAB_ROW_UI"
            :aria-label="$t('todo.aria.item_view')"
          />

          <div v-if="twoColumns || leftTabs.some((one) => one.value === singleTab)" class="flex min-h-0 flex-1 flex-col">
            <UTabs
              v-if="twoColumns"
              v-model="leftTab"
              :items="leftTabs"
              :content="false"
              color="neutral"
              variant="link"
              size="sm"
              :class="['h-10 shrink-0 px-2', TAB_ROW_LINE]"
              :ui="TAB_ROW_UI"
              :aria-label="$t('todo.aria.item_body')"
            />

            <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3" data-item-body>
              <!-- How the item ended, first where it has ended: every report kept of it, the closing one first, and
                   what it left behind, each whole and never folded, so the item reads as the report of itself. Each
                   report stands in its original with its translation a press away. -->
              <section v-if="shownLeft === 'result'" class="flex min-w-0 flex-col gap-4" :aria-label="$t('todo.label.result')">
                <article
                  v-for="report in shownReports"
                  :key="report.id"
                  class="rounded-md border p-3"
                  :class="report.kind === 'final' ? 'border-success/30 bg-success/5' : 'border-default bg-elevated/40'"
                  data-report
                  :data-report-kind="report.kind"
                >
                  <p class="flex flex-wrap items-center gap-x-2 text-sm">
                    <span class="font-medium" :class="report.kind === 'final' ? 'text-success' : 'text-highlighted'">{{ $t(REPORT_KIND_LABELS[report.kind]) }}</span>
                    <span class="text-muted tabular-nums">{{ formatStamp(report.at) }}</span>
                    <span v-if="report.actor !== ''" class="break-all text-muted">{{ report.actor }}</span>
                  </p>
                  <TranslatedText :text="report.body" class="mt-1" />
                </article>

                <!-- What the work left behind, exactly as the closing job wrote it, and what is
                     done about it. Resolving never takes those words off the row: what it adds is
                     when the outstanding note stopped being outstanding and the one line that says
                     why, under a line in the note's own cell. The boxes stand with the note rather
                     than under the manage tab because both are written about these words, and a box
                     on another tab is written blind. -->
                <div
                  v-if="openedItem.unfinished !== null"
                  class="rounded-md border p-3"
                  :class="canResolve(openedItem) ? 'border-warning/30 bg-warning/5' : 'border-default bg-elevated/40'"
                >
                  <p class="text-sm font-medium" :class="canResolve(openedItem) ? 'text-warning' : 'text-muted'">
                    {{ unfinishedLabel($t, openedItem) }}
                  </p>
                  <MarkdownText :text="openedItem.unfinished" class="mt-1 text-sm text-highlighted" />

                  <div v-if="openedItem.unfinishedResolvedAt !== null" class="-mx-3 mt-4 border-t border-default px-3 pt-4">
                    <p class="text-sm font-medium text-success">{{ $t("todo.label.resolved_at", { time: formatStamp(openedItem.unfinishedResolvedAt) }) }}</p>
                    <MarkdownText :text="openedItem.unfinishedResolution ?? ''" class="mt-1 text-sm text-muted" />
                  </div>

                  <!-- What is done about the note stands with the note: saying why it no longer
                       holds, or raising a strand of it as a row of its own. Both are written
                       against the words themselves, which is what they answer. -->
                  <template v-if="openedItem.unfinishedResolvedAt === null">
                    <GrowingTextarea
                      v-model="why"
                      class="mt-4"
                      :rows="2"
                      size="sm"
                      :maxlength="RESOLUTION_LIMIT"
                      :placeholder="$t('todo.placeholder.resolve_reason')"
                      :aria-label="$t('todo.aria.resolve_reason')"
                    />

                    <div class="mt-2 flex justify-end">
                      <UButton
                        size="sm"
                        color="warning"
                        variant="subtle"
                        icon="i-material-symbols-done-all"
                        :label="$t('todo.label.unfinished_resolved')"
                        :disabled="why.trim() === ''"
                        :loading="busy.has(busyKey(openedItem.id, 'resolve'))"
                        @click="resolve(openedItem.id)"
                      />
                    </div>
                  </template>

                  <!-- A strand of the note that is still real work becomes a row of its own. A
                       outstanding note is prose with no dividers, so which strand this is is his to say: he
                       names it and writes what it is, and the note rides onto the new row whole so
                       it can be read a month later. This is what makes resolving reachable — a
                       note is resolved once every strand is done or standing as its own row. The
                       form opens from the head's create button and stands nothing here until then. -->
                  <div v-if="raising.has(openedItem.id)" class="-mx-3 mt-4 border-t border-default px-3 pt-4">
                    <UInput
                      ref="raiseTitleBox"
                      v-model="raiseTitle"
                      class="w-full"
                      size="sm"
                      :maxlength="RAISE_TITLE_LIMIT"
                      :placeholder="$t('todo.label.new_title')"
                      :aria-label="$t('todo.label.new_title')"
                    />

                    <GrowingTextarea
                      v-model="raiseSaid"
                      class="mt-2"
                      :rows="2"
                      size="sm"
                      :maxlength="RAISE_LIMIT"
                      :placeholder="$t('todo.placeholder.new_body')"
                      :aria-label="$t('todo.aria.new_body')"
                    />

                    <!-- One strand of work is often left in two notes at once: #164 came out of
                         both #87 and #88. The row he is standing on is always a source and says
                         so as a fixed chip; the rest he names here, out of the notes still
                         standing. What he picks rides onto the new row, and each of those notes
                         settles when this row and its siblings are done. -->
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <span class="text-sm text-muted">{{ $t("todo.label.sources") }}</span>
                      <UBadge color="neutral" variant="subtle" size="sm" :label="`#${openedItem.id}`" />

                      <ChoiceSelect
                        v-model="raiseSources"
                        :content="{ align: 'start' }"
                        :items="otherNotes(openedItem.id)"
                        value-key="value"
                        multiple
                        size="sm"
                        class="min-w-40"
                        :placeholder="$t('todo.placeholder.more_sources')"
                        :aria-label="$t('todo.aria.more_sources')"
                      />
                    </div>

                    <div class="mt-2 flex flex-wrap justify-end gap-2">
                      <UButton
                        size="sm"
                        color="primary"
                        variant="subtle"
                        icon="i-material-symbols-playlist-add"
                        :label="$t('todo.action.submit_for_approval')"
                        :disabled="raiseTitle.trim() === '' || raiseSaid.trim() === ''"
                        :loading="busy.has(busyKey(openedItem.id, 'raise'))"
                        @click="raise(openedItem.id)"
                      />
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        :label="$t('todo.action.give_up')"
                        @click="closeRaise(openedItem.id)"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <!-- How the item's work was examined: every entry of its review in the order it was written, each whole,
                   a rejection in the warning colour so its reasons read apart from the rest. -->
              <section v-else-if="shownLeft === 'review'" class="flex min-w-0 flex-col gap-3" :aria-label="$t('todo.label.review_turns')">
                <article
                  v-for="entry in reviews"
                  :key="entry.id"
                  class="rounded-md border p-3"
                  :class="entry.kind === 'rejection' ? 'border-warning/30 bg-warning/5' : entry.kind === 'accepted' ? 'border-success/30 bg-success/5' : 'border-default bg-elevated/40'"
                  data-review
                  :data-review-kind="entry.kind"
                >
                  <p class="flex flex-wrap items-center gap-x-2 text-sm">
                    <span class="font-medium" :class="entry.kind === 'rejection' ? 'text-warning' : entry.kind === 'accepted' ? 'text-success' : 'text-highlighted'">{{ $t(REVIEW_KIND_LABELS[entry.kind]) }}</span>
                    <span class="text-muted">{{ entry.stage === null ? $t("todo.label.review_final", { round: entry.round }) : $t("todo.label.review_stage", { stage: entry.stage, round: entry.round }) }}</span>
                    <span v-if="entry.check !== null" class="text-muted">{{ reviewCheckLabel($t, entry.check) }}</span>
                    <span class="text-muted tabular-nums">{{ formatStamp(entry.at) }}</span>
                    <span v-if="entry.actor !== ''" class="break-all text-muted">{{ entry.actor }}</span>
                  </p>
                  <TranslatedText :text="entry.body" class="mt-1" />
                </article>
              </section>

              <!-- What became of the item: its run record and its last job, the co-worker list, what its work asked and
                   the approval record. While a job runs, its figures move as they happen. -->
              <section v-else-if="shownLeft === 'status'" class="flex min-w-0 flex-col gap-2" :aria-label="$t('todo.label.field_state')">
                  <!-- The merge on both sides: the item this one's work went to, and the items whose
                       work this one carries. Each number opens that item. -->
                  <div v-if="openedItem.mergedInto !== null || openedItem.mergedFrom.length > 0" class="rounded-lg border border-default p-3">
                    <p class="text-sm font-medium text-muted">{{ $t("todo.label.field_merged") }}</p>
                    <template v-if="openedItem.mergedInto !== null">
                      <p class="mt-1 flex min-w-0 items-start gap-2 text-sm">
                        <UButton
                          size="sm"
                          variant="link"
                          class="shrink-0 p-0 tabular-nums"
                          :label="`#${openedItem.mergedInto}`"
                          @click="openLinked(openedItem.mergedInto)"
                        />
                        <span class="min-w-0 flex-1 break-words text-highlighted">{{ openedItem.mergedIntoTitle }}</span>
                      </p>
                      <p class="mt-1 text-sm text-muted">{{ mergedLine($t, openedItem, formatStamp) }}</p>
                    </template>
                    <ul v-if="openedItem.mergedFrom.length > 0" class="mt-1 flex flex-col gap-2">
                      <!-- Each merged item's number and title on a line of their own, and how it stands on a row under it. -->
                      <li v-for="one in openedItem.mergedFrom" :key="one.id" class="flex min-w-0 flex-col gap-1 text-sm">
                        <p class="flex min-w-0 items-start gap-2">
                          <UButton size="sm" variant="link" class="shrink-0 p-0 tabular-nums" :label="`#${one.id}`" @click="openLinked(one.id)" />
                          <span class="min-w-0 flex-1 break-words text-highlighted">{{ one.title }}</span>
                        </p>
                        <div class="flex">
                          <UBadge :color="one.done ? 'success' : 'neutral'" variant="subtle" size="sm">{{ one.done ? $t("todo.title.section_done") : $t("todo.title.section_merged") }}</UBadge>
                        </div>
                      </li>
                    </ul>
                  </div>

                  <!-- How long it took, across every run, the phases it was divided into and what
                       the run went to inside them — or which run is going, or that none has. -->
                  <div class="rounded-lg border border-default p-3">
                    <p class="text-sm font-medium text-muted">{{ $t("todo.title.run_log") }}</p>
                    <p v-if="jobRecordLine($t, ranItem ?? openedItem) !== null" class="mt-1 text-sm text-muted">{{ jobRecordLine($t, ranItem ?? openedItem) }}</p>
                    <ItemRunFigures :job="lastJob" :running="openedItem.running" />
                    <TodoTime :item="ranItem ?? openedItem" />
                  </div>

                  <WorkOrderPanel part="steps" :todo-id="openedItem.id" :title="openedItem.title" :instruction="openedItem.instruction" :queue-paused="board.paused" :now="now" :held="setAside(openedItem)" :item="openedItem" :worker="openedItem.worker" :plan="itemRuns?.plan ?? []" />

                  <!-- The question a job stopped to ask, answered here where the item is read (docs/web.md, the TODO
                       modal's section): the same card the strip over the room stands, so the answering is one place. -->
                  <QuestionAsk :only="openedItem.id" />

                  <!-- What each of the item's questions became once it is settled, in the words it was settled on. -->
                  <div v-for="card in settledQuestionsOf(openedItem.id)" :key="card.id" class="rounded-md border p-3" :class="questionTone(card)">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <p class="text-sm font-medium">{{ $t("todo.title.questions") }}</p>
                      <p class="text-sm">{{ card.status }}</p>
                    </div>

                    <MarkdownText :text="card.question" class="mt-1 text-sm text-muted" />

                    <p v-if="card.answer !== null" class="mt-1 text-sm break-words text-highlighted">→ {{ card.answer }}</p>
                  </div>

                  <div v-if="settledFailure !== null" class="flex flex-col gap-2 rounded-md border border-default p-3">
                    <p class="text-sm text-error">{{ settledFailure }}</p>
                    <UButton class="self-end" size="sm" color="neutral" variant="subtle" :loading="settledLoading" @click="loadSettled(openedItem.id)">{{ $t("common.action.refresh") }}</UButton>
                  </div>

                  <!-- Every time the approval was given or taken back, newest first: whose hand,
                       which road and when, so a request found waiting on him again says who put it
                       there. -->
                  <div class="flex flex-col gap-2 rounded-lg border border-default p-3">
                    <p class="text-sm font-medium text-muted">{{ $t("todo.title.approvals") }}</p>
                    <ContentSkeleton
                      v-if="approvalsLoading && approvals.length === 0"
                      :rows="2"
                      listClass="flex flex-col gap-2"
                      :label="$t('todo.status.approvals_loading')"
                    >
                      <SkeletonLine width="w-3/5" />
                    </ContentSkeleton>
                    <template v-else-if="approvalsFailure !== null">
                      <p class="text-sm text-error">{{ approvalsFailure }}</p>
                      <UButton class="self-end" size="sm" color="neutral" variant="subtle" @click="loadApprovals(openedItem.id)">{{ $t("common.action.refresh") }}</UButton>
                    </template>
                    <p v-else-if="approvals.length === 0" class="text-sm text-muted">{{ $t("todo.status.no_approvals") }}</p>
                    <ul v-else class="flex flex-col gap-2">
                      <li v-for="change in approvals" :key="change.id" class="flex min-w-0 items-start gap-x-2 text-sm">
                        <UIcon :name="approvalChangeIcon(change)" class="mt-0.5 size-4 shrink-0" :class="change.kind === 'approval' ? 'text-muted' : 'badge-ink text-info'" />
                        <span class="min-w-0 flex-1 break-words" :class="change.kind === 'approval' ? 'text-highlighted' : 'badge-ink text-info'" :data-approval-kind="change.kind">{{ approvalChangeLine($t, change) }}</span>
                        <span class="shrink-0 text-muted tabular-nums">{{ formatStamp(change.at) }}</span>
                      </li>
                    </ul>
                  </div>

              </section>

              <section v-else-if="shownLeft === 'conversation'" class="flex min-w-0 flex-col gap-2" :aria-label="$t('todo.label.conversation')">
                <TodoInstruction :item="openedItem" />

                <!-- Words added to an item that already stands. What he thinks of an hour into
                     the work is said here and goes to the chat agent, never to a job: the chat agent folds what it asks
                     into the item's brief, and a running job is handed only the chat agent's change. So the
                     words stand with what was said about the item, and the brief they end up in
                     stands in the instruction tab.

                     One lot of words said is a group, and so is the box that says one more, so
                     every pair of them stands on the one larger gap and the lines inside a lot
                     stand on the smaller. Written as one gap throughout, the box that adds a word
                     would stand off the last one said by exactly what separates two words said, and
                     read as one more of them. -->
                <div class="flex flex-col gap-4 rounded-lg border border-default p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm font-medium text-muted">{{ $t("todo.title.notes") }}</p>
                    <p v-if="addedNotes.length > 0" class="text-sm text-muted">
                      {{ removedNotes.length > 0 ? $t("todo.label.notes_count_removed", { n: countText(standingNotes.length), removed: countText(removedNotes.length) }) : $t("todo.label.summary_queue", { n: countText(standingNotes.length) }) }}
                    </p>
                  </div>

                  <ContentSkeleton
                    v-if="notesLoading && notes.length === 0"
                    :rows="2"
                    listClass="flex flex-col gap-4"
                    :label="$t('todo.status.notes_loading')"
                  >
                    <div class="flex flex-col gap-2">
                      <SkeletonLine width="w-2/5" />
                      <SkeletonText :lines="2" size="sm" lastWidth="w-1/2" />
                    </div>
                  </ContentSkeleton>
                  <UButton v-if="noteFailure" class="self-end" size="sm" color="neutral" variant="subtle" @click="loadNotes(openedItem.id)">{{ $t("common.action.refresh") }}</UButton>
                  <p v-if="!notesLoading && addedNotes.length === 0 && !noteFailure" class="text-sm text-muted">{{ $t("todo.status.no_notes") }}</p>

                  <div v-else class="flex flex-col gap-4">
                    <div v-for="added in addedNotes" :key="added.id" class="flex flex-col gap-2">
                      <div class="flex items-center justify-between gap-2">
                        <p class="min-w-0 flex-1 text-sm text-muted">
                          <span class="font-medium text-primary">{{ added.author }}</span>
                          · {{ formatStamp(added.addedAt) }}
                          <!-- Whether the job that was running has actually been handed it. A note
                               nobody has been handed and one a run already holds are different
                               states of the same words, so they read differently on the screen. -->
                          <template v-if="added.deliveredAt !== null"> · {{ $t("todo.status.delivered_suffix") }}</template>
                          <!-- Taken back. The words stay where they were said, because what was
                               asked of the work is part of what the item is; nothing reads them
                               as an instruction again. -->
                          <template v-if="added.removedAt !== null"> · {{ $t("todo.label.removed_at", { time: formatStamp(added.removedAt) }) }}</template>
                        </p>

                        <UTooltip v-if="added.removedAt === null && confirmingNote !== added.id" :text="$t('common.action.delete')">
                          <UButton
                            size="sm"
                            color="error"
                            variant="ghost"
                            icon="i-material-symbols-delete-outline"
                            :aria-label="$t('common.action.delete')"
                            :disabled="busy.has(busyKey(openedItem.id, 'unappend'))"
                            @click="confirmingNote = added.id"
                          />
                        </UTooltip>
                      </div>

                      <MarkdownText :text="added.text" :class="['text-sm', added.removedAt === null ? 'text-highlighted' : 'text-muted line-through']" />

                      <!-- The press that cannot be taken back says so before it is made. Words a
                           change of the chat agent's handed to a running job may carry are in that run's
                           context and nothing here reaches into it: taking them back keeps them
                           out of every later reading and is the whole of what it does. -->
                      <div v-if="confirmingNote === added.id" class="flex flex-col gap-2">
                        <p v-if="added.carried" class="text-sm text-error">{{ $t("todo.message.note_delivered") }}</p>

                        <div class="flex flex-wrap justify-end gap-2">
                          <UButton
                            size="sm"
                            color="error"
                            icon="i-material-symbols-delete-outline"
                            :label="$t('todo.action.confirm_delete')"
                            :loading="busy.has(busyKey(openedItem.id, 'unappend'))"
                            @click="unappend(openedItem.id, added.id)"
                          />
                          <UButton
                            size="sm"
                            color="neutral"
                            variant="ghost"
                            :label="$t('common.action.cancel')"
                            :disabled="busy.has(busyKey(openedItem.id, 'unappend'))"
                            @click="confirmingNote = null"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <p v-if="noteFailure !== null" class="text-sm text-error">{{ noteFailure }}</p>

                  <!-- A finished item is one nobody is working on and nobody will be handed
                       anything for, so there is nothing to add to it: what it carries still reads,
                       and the box is not there. -->
                  <ChatInput
                    v-if="!openedItem.done && openedItem.mergedInto === null"
                    v-model="noteText"
                    :placeholder="$t('todo.placeholder.note')"
                    :maxlength="APPEND_LIMIT"
                    :busy="busy.has(busyKey(openedItem.id, 'append'))"
                    @submit="append(openedItem.id)"
                  />
                </div>
              </section>

              <template v-else-if="shownLeft === 'order'">
                <!-- The item's brief: the chat agent's organized instruction, the one text a job reads for the
                     item. It is written once, in the original the job reads, and stands in that original with its
                     translation a press away.
                     Under it, each change the chat agent made to it, with when, and whether the job running
                     then has been handed it. -->
                <div class="flex flex-col gap-4 rounded-lg border border-default p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm font-medium text-muted">{{ $t("todo.title.brief") }}</p>
                  </div>

                  <p v-if="openedItem.instruction.trim() === ''" class="text-sm text-muted">{{ $t("todo.status.no_brief") }}</p>
                  <TranslatedText v-else :text="openedItem.instruction" />

                  <div v-if="briefChanges.length > 0" class="flex flex-col gap-4">
                    <p class="text-sm font-medium text-muted">{{ $t("todo.title.brief_changes") }}</p>

                    <div v-for="change in briefChanges" :key="change.id" class="flex flex-col gap-2">
                      <p class="text-sm text-muted">
                        {{ formatStamp(change.addedAt) }} · {{ changeHanded(change) }}
                      </p>
                      <TranslatedText :text="change.text" />
                    </div>
                  </div>
                </div>

                <WorkOrderPanel part="order" :todo-id="openedItem.id" :title="openedItem.title" :instruction="openedItem.instruction" :queue-paused="board.paused" :now="now" :held="setAside(openedItem)" :item="openedItem" :worker="openedItem.worker" />
              </template>
            </div>
          </div>

          <div
            v-if="twoColumns || RIGHT_TABS.some((one) => one.value === singleTab)"
            class="flex min-h-0 flex-1 flex-col lg:border-s lg:border-default"
          >
            <UTabs
              v-if="twoColumns"
              v-model="rightTab"
              :items="RIGHT_TABS"
              :content="false"
              color="neutral"
              variant="link"
              size="sm"
              :class="['h-10 shrink-0 px-2', TAB_ROW_LINE]"
              :ui="TAB_ROW_UI"
              :aria-label="$t('todo.aria.item_manage')"
            />

            <!-- The talk scrolls its own turns above the box it is typed into, so its column does not
                 scroll around it; every other part scrolls with the column. -->
            <div class="flex min-h-0 flex-1 flex-col gap-2 overscroll-contain px-4 py-3" :class="shownRight === 'talk' ? 'overflow-hidden' : 'overflow-y-auto'">

              <template v-if="shownRight === 'talk'">
              <!-- Talking about this item with the chat agent, and about whatever hangs off it. The chat agent's own
                   session answers, with its tools, so a draft is shaped here turn by turn and
                   the parts beside it show what the item now says. The turns are kept with the
                   item, so opening it again brings the whole talk back; nothing about it holds
                   the queue. It takes the tab's whole height, with the box it is typed into
                   under the turns. -->
              <div class="flex min-h-0 flex-1 flex-col gap-4">

                <UButton v-if="talkFailure" class="self-end" size="sm" color="neutral" variant="subtle" @click="loadTalk(openedItem.id)">{{ $t("common.action.refresh") }}</UButton>

                <!-- The turns take whatever height the tab has, however few there are — none yet,
                     still loading or not read — so the box under them stands on the tab's bottom
                     edge the way a room's box does. The turns stand on the smaller gap and the box
                     on the larger, or the place a turn is written into reads as one more turn. -->
                <div ref="talkList" class="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
                  <ContentSkeleton
                    v-if="talkLoading && talk.length === 0"
                    :rows="2"
                    listClass="flex flex-col gap-2"
                    :label="$t('todo.status.talk_loading')"
                  >
                    <div>
                      <SkeletonLine width="w-16" />
                      <SkeletonText :lines="2" size="sm" lastWidth="w-2/3" />
                    </div>
                  </ContentSkeleton>
                  <p v-else-if="talk.length === 0 && !talkFailure" class="text-sm text-muted">{{ $t("todo.status.no_talk") }}</p>

                  <div v-for="turn in talk" :key="turn.id">
                    <p class="text-sm font-medium" :class="turn.speaker === 'owner' ? 'text-primary' : 'text-muted'">
                      {{ turn.speaker === "owner" ? $t("common.label.speaker_owner") : $t("common.label.speaker_bmo") }}
                    </p>
                    <MarkdownText :text="turn.text" class="text-sm text-highlighted" />
                  </div>
                </div>

                <p v-if="talkAnswering" class="text-sm text-muted">{{ $t("common.status.bmo_answering") }}</p>
                <p v-else-if="talkUnanswered !== null" class="text-sm text-warning">{{ talkUnanswered }}</p>
                <p v-if="talkFailure !== null" class="text-sm text-error">{{ talkFailure }}</p>

                <ChatInput
                  v-model="talkText"
                  split
                  :placeholder="$t('todo.placeholder.say_to_bmo')"
                  :maxlength="TALK_LIMIT"
                  :disabled="talkAnswering"
                  :busy="talking"
                  @submit="ask(openedItem.id)"
                />
              </div>
              </template>

              <template v-else-if="openedItem !== null">
              <!-- Where the dialog is too narrow for the form block to carry them, the item's assignment heads the manage tab. -->
              <TodoAssignFields v-if="!twoColumns" v-bind="assignment" shape="pairs" @agent="(chosen: ItemAssignment) => void setAgent(openedItem!.id, chosen)" @worker="(chosen: string) => assignWorker(openedItem!.id, chosen)" />

              <!-- His decision on the row first — approving or throwing out a request, or moving
                   and taking back an approved one — then setting it aside, which is neither. -->
              <!-- A merged row is run by nobody, so nothing acts on it here: it is finished with the item
                   it was merged into. -->
              <p v-if="openedItem.mergedInto !== null" class="text-sm text-muted">
                {{ mergedLine($t, openedItem, formatStamp) }}
              </p>

              <div v-else-if="!openedItem.done" class="flex flex-col gap-2 rounded-lg border border-default p-3">
                <template v-if="setAside(openedItem) || todoState(openedItem) === 'pending'">
                  <GrowingTextarea
                    v-if="!setAside(openedItem)"
                    v-model="note"
                   
                    :rows="2"
                    size="sm"
                    :maxlength="NOTE_LIMIT"
                    :placeholder="$t('todo.placeholder.approval_note')"
                    :aria-label="$t('todo.label.field_note')"
                  />

                  <div class="flex flex-wrap justify-end gap-2">
                    <UButton
                      v-if="!setAside(openedItem)"
                      size="sm"
                      icon="i-material-symbols-check"
                      :label="$t('todo.action.approve')"
                      :loading="busy.has(busyKey(openedItem.id, 'approve'))"
                      :disabled="busyBlocks(busy, openedItem.id, 'approve')"
                      @click="approve(openedItem.id)"
                    />

                    <template v-if="confirming === openedItem.id">
                      <UButton
                        size="sm"
                        color="error"
                        icon="i-material-symbols-delete-outline"
                        :label="$t('todo.action.confirm_discard')"
                        :loading="busy.has(busyKey(openedItem.id, 'drop'))"
                        :disabled="busyBlocks(busy, openedItem.id, 'drop')"
                        @click="drop(openedItem.id)"
                      />
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        :label="$t('common.action.cancel')"
                        :disabled="busy.has(busyKey(openedItem.id, 'drop'))"
                        @click="confirming = null"
                      />
                    </template>

                    <UButton
                      v-else
                      size="sm"
                      color="error"
                      variant="ghost"
                      icon="i-material-symbols-delete-outline"
                      :label="$t('todo.action.discard')"
                      :disabled="busyBlocks(busy, openedItem.id, 'drop')"
                      @click="confirming = openedItem.id"
                    />
                  </div>
                </template>

                <template v-else>
                  <div class="flex flex-wrap justify-end gap-2">
                    <UTooltip :text="$t('todo.action.move_top')">
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-material-symbols-keyboard-double-arrow-up"
                        :aria-label="$t('todo.action.move_top')"
                        :disabled="!canTop(board.queue, openedItem.id)"
                        :loading="busy.has(busyKey(openedItem.id, 'top'))"
                        @click="act(openedItem.id, 'top')"
                      />
                    </UTooltip>
                    <UTooltip :text="$t('common.action.move_up')">
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-material-symbols-arrow-upward"
                        :aria-label="$t('common.action.move_up')"
                        :disabled="!canMove(board.queue, openedItem.id, 'up')"
                        :loading="busy.has(busyKey(openedItem.id, 'move', 'up'))"
                        @click="act(openedItem.id, 'move', { direction: 'up' })"
                      />
                    </UTooltip>
                    <UTooltip :text="$t('common.action.move_down')">
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-material-symbols-arrow-downward"
                        :aria-label="$t('common.action.move_down')"
                        :disabled="!canMove(board.queue, openedItem.id, 'down')"
                        :loading="busy.has(busyKey(openedItem.id, 'move', 'down'))"
                        @click="act(openedItem.id, 'move', { direction: 'down' })"
                      />
                    </UTooltip>
                    <UTooltip :text="$t('todo.action.move_bottom')">
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-material-symbols-keyboard-double-arrow-down"
                        :aria-label="$t('todo.action.move_bottom')"
                        :disabled="!canBottom(board.queue, openedItem.id)"
                        :loading="busy.has(busyKey(openedItem.id, 'bottom'))"
                        @click="act(openedItem.id, 'bottom')"
                      />
                    </UTooltip>
                  </div>

                  <!-- An approved item takes his word too, without having to leave the queue. -->
                  <GrowingTextarea
                    v-model="note"
                   
                    :rows="2"
                    size="sm"
                    :maxlength="NOTE_LIMIT"
                    :placeholder="$t('todo.label.field_note')"
                    :aria-label="$t('todo.label.field_note')"
                  />

                  <p v-if="todoState(openedItem) === 'running'" class="text-sm text-warning">
                    {{ $t("todo.status.next_run_applies") }}
                  </p>

                  <div class="flex justify-end">
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="subtle"
                      icon="i-material-symbols-format-quote-outline"
                      :label="$t('common.action.save')"
                      :loading="busy.has(busyKey(openedItem.id, 'approve'))"
                      @click="approve(openedItem.id)"
                    />
                  </div>
                </template>

                <!-- Stopped now: whatever of the item is in flight ends, what it finished stays, and
                     the item is held as his stop until the hold is taken back. The reason is what
                     the item carries meanwhile, so the button waits for one. -->
                <div v-if="canStop(openedItem)" class="-mx-3 flex flex-wrap items-center gap-2 border-t border-default px-3 pt-2" data-item-stop>
                  <UInput
                    v-model="stopWhy"
                    class="min-w-0 flex-1"
                    size="sm"
                    :maxlength="STOP_REASON_LIMIT"
                    :placeholder="$t('todo.label.stop_reason')"
                    :aria-label="$t('todo.label.stop_reason')"
                  />
                  <UButton
                    size="sm"
                    color="warning"
                    variant="subtle"
                    icon="i-material-symbols-back-hand-outline"
                    :label="$t('todo.action.stop')"
                    :disabled="stopWhy.trim() === ''"
                    :loading="busy.has(busyKey(openedItem.id, 'stop'))"
                    @click="stop(openedItem.id)"
                  />
                  <p v-if="stopFailure !== null" role="alert" class="basis-full text-sm whitespace-pre-line text-error">{{ stopFailure }}</p>
                </div>

                <!-- Set aside for now, or taken back. It is neither dropping nor closing: the row
                     keeps its place and its approval, and the queue simply stops seeing it. A request
                     waiting on approval is never set aside, and a hold its own job keeps until its
                     commit goes live is the deployment's to let go, so neither stands on those. A hold
                     carries its reason, so the button waits for one. -->
                <div v-if="canHold(openedItem) || setAside(openedItem)" class="-mx-3 flex flex-wrap items-center gap-2 border-t border-default px-3 pt-2">
                  <template v-if="canHold(openedItem)">
                    <UInput
                      v-model="holdWhy"
                      class="min-w-0 flex-1"
                      size="sm"
                      :maxlength="HOLD_REASON_LIMIT"
                      :placeholder="$t('todo.label.hold_reason')"
                      :aria-label="$t('todo.label.hold_reason')"
                    />
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="subtle"
                      icon="i-material-symbols-pause"
                      :label="$t('todo.action.hold')"
                      :disabled="holdWhy.trim() === ''"
                      :loading="busy.has(busyKey(openedItem.id, 'hold'))"
                      @click="hold(openedItem.id)"
                    />
                    <p v-if="holdFailure !== null" role="alert" class="basis-full text-sm whitespace-pre-line text-error">{{ holdFailure }}</p>
                  </template>

                  <template v-else>
                    <!-- Since when, as which kind — a hold, a stop, a hold on failure — and why. -->
                    <p class="min-w-0 flex-1 text-sm break-words text-muted">{{ heldLine($t, openedItem, formatStamp) }}</p>
                    <UButton
                      size="sm"
                      color="primary"
                      variant="subtle"
                      icon="i-material-symbols-play-arrow"
                      :label="$t('todo.action.unhold')"
                      :loading="busy.has(busyKey(openedItem.id, 'release'))"
                      @click="release(openedItem.id)"
                    />
                  </template>
                </div>

                <!-- The item's job notices, switched off with the reason it carries while they are off, or back on. A
                     finished or merged item sends none, so it stands neither. -->
                <div v-if="canSwitchNotices(openedItem)" class="-mx-3 flex flex-wrap items-center gap-2 border-t border-default px-3 pt-2" data-item-notices>
                  <template v-if="openedItem.noticesOff === null">
                    <UInput
                      v-model="noticesWhy"
                      class="min-w-0 flex-1"
                      size="sm"
                      :maxlength="NOTICES_REASON_LIMIT"
                      :placeholder="$t('todo.label.notices_reason')"
                      :aria-label="$t('todo.label.notices_reason')"
                    />
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="subtle"
                      icon="i-material-symbols-notifications-off-outline"
                      :label="$t('todo.action.notices_off')"
                      :disabled="noticesWhy.trim() === ''"
                      :loading="busy.has(busyKey(openedItem.id, 'notices_off'))"
                      @click="noticesOff(openedItem.id)"
                    />
                  </template>

                  <template v-else>
                    <p class="min-w-0 flex-1 text-sm break-words text-muted">{{ noticesOffLine($t, openedItem, formatStamp) }}</p>
                    <UButton
                      size="sm"
                      color="primary"
                      variant="subtle"
                      icon="i-material-symbols-notifications-outline"
                      :label="$t('todo.action.notices_on')"
                      :loading="busy.has(busyKey(openedItem.id, 'notices_on'))"
                      @click="noticesOn(openedItem.id)"
                    />
                  </template>

                  <p v-if="noticesFailure !== null" role="alert" class="basis-full text-sm whitespace-pre-line text-error">{{ noticesFailure }}</p>
                </div>
              </div>

              <p v-else class="text-sm text-muted">{{ $t("todo.status.done_nothing_to_do") }}</p>

              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import {
  APPEND_LIMIT,
  NOTE_LIMIT,
  HOLD_REASON_LIMIT,
  NOTICES_REASON_LIMIT,
  STOP_REASON_LIMIT,
  RAISE_LIMIT,
  RAISE_TITLE_LIMIT,
  RESOLUTION_LIMIT,
  TALK_LIMIT
} from "#shared/config";
import { UDrawer, UModal } from "#components";
import { useAgentCatalogue } from "~/domain/catalogue";
import { useHeldWhileClosing } from "bmo-ui/app/domain/closing";
import { failureText } from "bmo-ui/app/domain/errors";
import { useLiveRefresh } from "~/domain/events";
import { useIsland } from "bmo-ui/app/domain/island";
import { useNarrow } from "bmo-ui/app/domain/screen";
import { TAB_ROW_LINE, TAB_ROW_UI } from "bmo-ui/app/domain/tabs";
import { countText } from "~/domain/numbers";
import { questionsOfTodo } from "~/domain/questions";
import { formatStamp } from "bmo-ui/app/domain/time";
import {
  approvalChangeIcon,
  approvalCells,
  approvalChangeLine,
  REPORT_KIND_LABELS,
  REVIEW_KIND_LABELS,
  reviewCheckLabel,
  busyBlocks,
  busyKey,
  canBottom,
  canHold,
  canSwitchNotices,
  canMove,
  canResolve,
  canStop,
  canTop,
  heldLine,
  noticesOffLine,
  jobRecordLine,
  mergedLine,
  requesterLine,
  setAside,
  stateColour,
  stateIcon,
  stateLabel,
  stopDetail,
  todoState,
  unfinishedLabel
} from "~/domain/todos";
import { usePolling } from "~/domain/polling";
import type { ItemAssignment } from "~/domain/item-assignment";
import type { ApprovalCell, TodoActFields } from "~/domain/todos";

import type { Ref } from "vue";
import type {
  ItemRuns,
  JobLine,
  JobQuestion,
  RoomSummary,
  TodoAction,
  TodoActionResult,
  TodoApproval,
  TodoBoard,
  TodoItem,
  TodoNote,
  TodoReport,
  TodoReview,
  TodoTalk,
  TodoTalkTurn
} from "#shared/types";
import type { QuestionCard } from "~/domain/questions";

interface Props {
  // Whether the panel holding this dialog is the one a person is reading, which is the one panel
  // that draws it.
  shows: boolean;
  // The row the panel has open, looked up out of every list its board holds.
  item: TodoItem | null;
  // What the dialog acts through and stays true to, which is the panel's: which row is open, which
  // buttons are waiting on the bot, the line under the list, the board and the clock, and the one
  // road every change to a row goes by.
  panel: {
    opened: Ref<number | null>;
    busy: Ref<Set<string>>;
    board: Ref<TodoBoard>;
    questions: Ref<JobQuestion[]>;
    now: Ref<number>;
    rooms: Ref<RoomSummary[]>;
    act: (id: number, action: TodoAction, fields?: TodoActFields, failureKey?: string, refused?: (said: string) => void) => Promise<boolean>;
    reload: () => Promise<void>;
    fetchStray: (id: number) => Promise<void>;
  };
}

const props = defineProps<Props>();
const { t } = useI18n();
const island = useIsland(t);
const emit = defineEmits<{
  close: [];
  // The job log of the running item, which the panel opens.
  log: [item: TodoItem];
}>();

const { opened, busy, board, now, rooms, act, reload, fetchStray } = props.panel;

// The repositories an item may go to, out of the one catalogue read every screen shares: the list is the agency's, so
// this dialog holds none of its own and a repository the owner adds stands here without a change.
const { agents } = useAgentCatalogue();

// What the select stands on for a row nobody has assigned. A select cannot carry an empty string
// as a value, so the unassigned state has a name of its own here and is written back as null.
const UNASSIGNED = "-";

const workers = computed(() => agents.value.agents.filter((agent) => agent.kind === "repository"));

const workerOptions = computed(() => [
  { label: t("todo.label.unassigned_builtin"), value: UNASSIGNED },
  ...workers.value.map((agent) => ({ label: agent.label ?? agent.name, value: agent.name }))
]);

// What the line beside the select says: where the work will actually be done, which is the one
// thing the name alone does not tell him.
function workerNote(item: TodoItem): string {
  return workers.value.find((agent) => agent.name === item.worker)?.path ?? "";
}

// The open item's approval line, heading its form block: who asked and when, the latest recommendation and the latest
// approval, the cells that wait on the approvals standing as bars until they are first read.
const approvalLine = computed<ApprovalCell[]>(() => {
  const item = openedItem.value;

  if (item === null) return [];

  return approvalCells(t, item, approvalsLoading.value && approvals.value.length === 0 ? null : approvals.value, requesterLine(item, rooms.value));
});

// What the open item's assignment cells are drawn from, in the form block or at the top of the manage tab alike.
const assignment = computed(() => {
  const item = openedItem.value!;

  return {
    item,
    ranItem: ranItem.value,
    workerOptions: workerOptions.value,
    unassigned: UNASSIGNED,
    workerPath: workerNote(item),
    agentBusy: busy.value.has(busyKey(item.id, "agent")) || busy.value.has(busyKey(item.id, "model")),
    workerBusy: busy.value.has(busyKey(item.id, "worker"))
  };
});


const route = useRoute();
const router = useRouter();

// Whether a sheet or a modal, on the same width every other dialog in this console changes at.
const narrow = useNarrow();

// What the dialog draws is the open row for as long as the dialog can still be seen: dismissing
// it takes half a second to slide away, and a dialog that emptied itself the moment it was
// dismissed would slide away as a blank frame.
const openedItem = useHeldWhileClosing(() => props.item);
const openedStop = computed(() => (openedItem.value === null ? null : stopDetail(t, openedItem.value)));

// What the jobs that carried the item say of it — how many ran it and for how long, its latest job's line, the road
// that job answered on and the plan it laid out of its own — read as it opens, as a job of it starts, every few
// seconds while it runs, and once more as it ends, so the line stands the ended job's own figures and its end
// (docs/web.md, the TODO modal's state tab).
const itemRuns = ref<ItemRuns | null>(null);
const RUNS_READ_MS = 3000;

async function readRuns(): Promise<void> {
  const item = openedItem.value;

  if (item === null) return;

  try {
    const read = await $fetch<ItemRuns>(`/api/todos/${item.id}/runs`, { query: item.worker === null ? {} : { worker: item.worker } });

    if (openedItem.value?.id === item.id) itemRuns.value = read;
  } catch {
    // A read that fails leaves the record as it stood.
  }
}

watch(() => openedItem.value?.id ?? null, (id) => {
  itemRuns.value = null;
  if (id !== null) void readRuns();
}, { immediate: true });
usePolling(() => {
  if (openedItem.value?.running) void readRuns();
}, RUNS_READ_MS);
// The panel reads the board again whenever the agency says a job started, changed or ended, so the item's own running
// state is that news here: a job that starts is read at once, and one that ends once more for its own figures.
watch(() => openedItem.value?.running ?? false, () => void readRuns());

// The item's last job once its runs are read. Before that, an item that runs or is done had one, so its place is kept
// (undefined); an item that waits may have none, so nothing is kept for it (null).
const lastJob = computed<JobLine | null | undefined>(() => {
  if (itemRuns.value !== null) return itemRuns.value.latest;

  return openedItem.value?.running || openedItem.value?.done ? undefined : null;
});

// The item as its record reads it once its runs are read.
const ranItem = computed<TodoItem | null>(() => {
  const item = openedItem.value;
  const runs = itemRuns.value;

  return item === null || runs === null ? null : { ...item, attempts: Math.max(1, runs.attempts), seconds: runs.seconds, ranOn: runs.ranOn ?? item.ranOn };
});

// The dialog standing, as the thing that opens it and the thing that closes it. Closing goes
// through the panel's own toggle, the one the row's press uses, so what the address carries and
// what is typed into the boxes are let go of in exactly one place however the dialog was
// dismissed — the close button, the backdrop, the escape key or the back gesture.
const detailOpen = computed({
  get: () => opened.value !== null,
  set: (standing: boolean) => {
    if (!standing && opened.value !== null) {
      emit("close");
    }
  }
});

const detailShell = computed(() => {
  const shared = { title: openedItem.value === null ? "TODO" : `#${openedItem.value.id} ${openedItem.value.title}`, description: t("todo.label.detail_description") };

  return narrow.value
    ? { ...shared, direction: "bottom" as const, handleOnly: true, ui: { content: "h-[92dvh]" } }
    : { ...shared, ui: { content: "max-w-3xl h-[80dvh] lg:max-w-[min(96vw,88rem)] lg:h-[90dvh]" } };
});

// What is typed into the open item's approval comment box.
const note = ref("");

// The open item's reports as this dialog last read them, by the item they were read for. Until the dialog's own read
// lands, the board's reading of the item stands.
const readReports = ref<{ id: number; reports: TodoReport[] } | null>(null);
const shownReports = computed<TodoReport[]>(() => {
  const item = openedItem.value;

  if (item === null) return [];

  return readReports.value?.id === item.id ? readReports.value.reports : item.reports;
});

// The detail's tabs, in one order across both columns: how the item ended, what became of it, what the work is told
// and the request's own words on the left, the talk about it and what he does to it on the right. Where the dialog is
// too narrow for two columns they are one row, in the same order.
// The result tab is there only on an item that carries a report or an outstanding note, and it
// stands first, because on an item that has ended that is what he opens it to read.
const RESULT_TAB = { value: "result", label: t("todo.label.result"), icon: "i-material-symbols-task-alt" };
// The review tab is there only on an item whose review holds an entry, right after the result, its label carrying how
// many times the work was sent back.
const reviewTab = computed(() => {
  const sent = openedItem.value?.rejections ?? 0;
  const label = sent > 0 ? `${t("todo.label.review_turns")} · ${t("todo.label.rejections", { n: sent })}` : t("todo.label.review_turns");

  return { value: "review", label, icon: "i-material-symbols-fact-check-outline" };
});
// The open item's review as this dialog last read it, by the item it was read for.
const readReviews = ref<{ id: number; reviews: TodoReview[] } | null>(null);
const reviews = computed<TodoReview[]>(() => (readReviews.value !== null && readReviews.value.id === openedItem.value?.id ? readReviews.value.reviews : []));
const BODY_TABS = [
  { value: "status", label: t("todo.label.field_state"), icon: "i-material-symbols-monitoring" },
  { value: "order", label: t("todo.label.field_instruction"), icon: "i-material-symbols-assignment-outline" },
  { value: "conversation", label: t("todo.label.request_text"), icon: "i-material-symbols-forum-outline" }
];
const RIGHT_TABS = [
  { value: "talk", label: t("todo.label.discussion"), icon: "i-material-symbols-chat-outline" },
  { value: "manage", label: t("todo.label.manage"), icon: "i-material-symbols-settings-outline" }
];
const hasResult = computed(() => openedItem.value !== null && (shownReports.value.length > 0 || openedItem.value.unfinished !== null));
const leftTabs = computed(() => [...(hasResult.value ? [RESULT_TAB] : []), ...(reviews.value.length > 0 ? [reviewTab.value] : []), ...BODY_TABS]);
// The one row of a narrow dialog carries the names alone: six tabs with their icons are wider than
// a phone, and a row that scrolls sideways hides the last of them.
const detailTabs = computed(() => [...leftTabs.value, ...RIGHT_TABS].map(({ value, label }) => ({ value, label })));

const twoColumns = useNarrow("(min-width: 1024px)");
const leftTab = ref("status");
const rightTab = ref("talk");
const singleTab = ref("status");
// Every item opens on its first tab: the result where it has one, its state otherwise, and the talk on the right. It
// is chosen when an item is opened and not as it changes, so an item that ends while it is being read keeps the tab
// he is on; one whose result goes away while it stands on it falls back to its state rather than to a tab that is no
// longer there.
// The open item whose tabs were chosen, so a re-read that hands it back after a moment of none keeps the tab being
// read. The reader closing it lets it go, so the same item opened again opens on its first tab.
let tabsChosenFor: number | null = null;

watch(
  () => props.item?.id ?? null,
  (id) => {
    if (id !== null && id !== tabsChosenFor) {
      tabsChosenFor = id;
      const first = props.item !== null && (props.item.reports.length > 0 || props.item.unfinished !== null) ? "result" : "status";
      leftTab.value = first;
      singleTab.value = first;
      rightTab.value = "talk";
    }
  },
  { immediate: true }
);
watch(
  () => hasResult.value,
  (has) => {
    if (!has) {
      leftTab.value = leftTab.value === "result" ? "status" : leftTab.value;
      singleTab.value = singleTab.value === "result" ? "status" : singleTab.value;
    }
  }
);
const shownLeft = computed(() => (twoColumns.value ? leftTab.value : singleTab.value));
const shownRight = computed(() => (twoColumns.value ? rightTab.value : singleTab.value));
// Which item is a step away from being thrown out: nothing here is removed on one press.
const confirming = ref<number | null>(null);
// Which rows have the raise box open, and what is typed into it. One box is open at a time in
// practice, but the set is what keeps it open on the row it belongs to rather than on whichever
// row happens to be open.
const raising = ref(new Set<number>());
const raiseTitle = ref("");
const raiseSaid = ref("");
// The other notes he named as sources of the row he is raising. The row he is standing on is
// always one and is never in here: it is not his to unpick.
const raiseSources = ref<number[]>([]);
// The raising form's title box, which the head's create button puts the typing in.
const raiseTitleBox = useTemplateRef<{ inputRef: HTMLInputElement | null }>("raiseTitleBox");
// The head row's buttons are the library's small ones, and the create button standing among them takes that size.
const ROW_BUTTONS = { button: { size: "sm" } } as const;
// What is typed into the box beside the hold button: why it is set aside, which the hold waits for.
const holdWhy = ref("");
// What is typed into the box beside the switch-off of the item's job notices, which waits for it the same way.
const noticesWhy = ref("");
// Why the last stop, hold or switch of the notices sent from here was refused, said in its own row until the next send.
const stopFailure = ref<string | null>(null);
const holdFailure = ref<string | null>(null);
const noticesFailure = ref<string | null>(null);
// What is typed into the box beside the stop button. A stop takes a reason, so the button waits.
const stopWhy = ref("");
// What is typed into the open item's box for resolving the outstanding note: the one line that
// says what makes the note no longer outstanding. It belongs to the row that is open, so it goes when another one is.
const why = ref("");
// The talk the open item carries, whether it is being read, what is typed into its box, whether his
// words are on their way to the bot, whether the chat agent is answering, why the last turn came back with
// nothing, and what came back when the talk could not be read or sent. It belongs to whichever item
// is open and is read again every time one is.
const talk = ref<TodoTalkTurn[]>([]);
const talkLoading = ref(false);
const talkText = ref("");
const talking = ref(false);
const talkAnswering = ref(false);
const talkUnanswered = ref<string | null>(null);
const talkFailure = ref<string | null>(null);
// What has been added to the open item since it was filed, whether it is being read, what is typed
// into the box that adds one, and what came back when an adding failed. Like the talk, it belongs
// to whichever item is open and is read again every time one is.
const notes = ref<TodoNote[]>([]);
const notesLoading = ref(false);
const noteText = ref("");
const noteFailure = ref<string | null>(null);
// Which lot of words is standing armed to be taken back. One at a time: arming another is what
// disarms the one before it, so there is never more than one press on the screen that cannot be
// taken back.
const confirmingNote = ref<number | null>(null);
// The words people added, apart from the chat agent's changes to the brief, which stand under the brief.
// The list holds the standing words and the ones taken back, in the order they were said, because
// a word withdrawn is part of what happened to the item; the two are counted apart because only
// the first of them still asks the chat agent for anything.
const addedNotes = computed(() => notes.value.filter((note) => note.kind !== "change"));
const standingNotes = computed(() => addedNotes.value.filter((note) => note.removedAt === null));
const removedNotes = computed(() => addedNotes.value.filter((note) => note.removedAt !== null));
// The chat agent's changes to the brief, oldest first, as the brief came to be.
const briefChanges = computed(() => notes.value.filter((note) => note.kind === "change" && note.removedAt === null));

// Where a change the chat agent made stands with the job it was made for: handed and when, still waiting
// to be handed, or made while no job ran, for the next one to read in the brief.
function changeHanded(change: TodoNote): string {
  if (change.deliveredAt !== null) {
    return t("todo.status.change_handed", { time: formatStamp(change.deliveredAt) });
  }

  return change.jobId !== null ? t("todo.status.change_waiting") : t("todo.status.change_no_job");
}
// Every time the open item's approval was given or taken back, newest first, with whose hand it
// was and the road it came by. The chat agent and a job approve by roads of their own, so the record is read
// with the item, after his own press and again whenever the queue moves.
const approvals = ref<TodoApproval[]>([]);
const approvalsLoading = ref(false);
const approvalsFailure = ref<string | null>(null);
// Which read of the open item is the latest. A read that finished after the dialog moved on to
// another row, or after a later read of the same list began, has nothing left to write; the
// dialog going away counts as moving on.
let detailGeneration = 0;
let talkGeneration = 0;
let notesGeneration = 0;
let reportsGeneration = 0;
let approvalsGeneration = 0;
let settledGeneration = 0;
onScopeDispose(() => { detailGeneration++; });
// Where the talk's turns scroll. A turn that has just arrived is the one he is waiting for, so the
// list goes to its foot whenever the talk grows rather than leaving the answer below the box.
const talkList = useTemplateRef<HTMLElement>("talkList");
watch(
  () => talk.value.length,
  () => void nextTick(() => {
    if (talkList.value !== null) {
      talkList.value.scrollTop = talkList.value.scrollHeight;
    }
  })
);

// The questions this item's job put to the owner that are settled, as the dialog last read them: the ones still open
// are the card above them, from the console's one reading of the open questions.
const settledQuestions = ref<JobQuestion[]>([]);
const settledLoading = ref(false);
const settledFailure = ref<string | null>(null);

function settledQuestionsOf(todoId: number): QuestionCard[] {
  return questionsOfTodo(t, settledQuestions.value, todoId, now.value);
}

// The open item's settled questions, read as it opens and again when bmo-job says one of its questions or replies
// moved, so a question its time settled on the recommendation lands here as the card above lets it go. A read that
// fails leaves what stands and says so beneath them.
async function loadSettled(id: number): Promise<void> {
  const generation = detailGeneration;
  const mine = ++settledGeneration;
  const latest = (): boolean => generation === detailGeneration && mine === settledGeneration && opened.value === id;

  settledLoading.value = true;

  try {
    const answer = await $fetch<JobQuestion[]>(`/api/todos/${id}/questions`);

    if (latest()) {
      settledQuestions.value = answer;
      settledFailure.value = null;
    }
  } catch (error) {
    if (latest()) settledFailure.value = failureText(error, t("todo.error.questions_load_failed"));
  } finally {
    if (latest()) settledLoading.value = false;
  }
}

// How a question reads at a glance: still waiting, his own answer, or the recommendation its time ran out on.
function questionTone(card: QuestionCard): string {
  if (card.state === "open") {
    return "border-warning/40 bg-warning/5 text-warning";
  }

  return card.state === "owner" ? "border-primary/30 bg-primary/5 text-primary" : "border-default text-muted";
}

// The panel has just opened a row or let go of one. Opening brings up whatever word is already on
// it, so saving does not wipe it by accident, and closing leaves nothing behind.
function toggled(id: number, closed: boolean, word: string): void {
  detailGeneration++;

  if (closed) tabsChosenFor = null;

  confirming.value = null;
  note.value = closed ? "" : word;
  why.value = "";
  stopWhy.value = "";
  holdWhy.value = "";
  noticesWhy.value = "";
  stopFailure.value = null;
  holdFailure.value = null;
  noticesFailure.value = null;

  talk.value = [];
  talkText.value = "";
  talkAnswering.value = false;
  talkUnanswered.value = null;
  talkFailure.value = null;

  notes.value = [];
  noteText.value = "";
  readReports.value = null;
  readReviews.value = null;
  noteFailure.value = null;
  confirmingNote.value = null;

  approvals.value = [];
  approvalsFailure.value = null;

  settledQuestions.value = [];
  settledFailure.value = null;

  if (!closed) {
    void loadTalk(id);
    void loadNotes(id);
    void loadReports(id);
    void loadReviews(id);
    void loadApprovals(id);
    void loadSettled(id);
  }
}

// The panel has opened the row the address names. What is typed into the other boxes stands; the
// row's own word, its talk and its added words are read.
async function asked(id: number, word: string): Promise<void> {
  note.value = word;
  await loadTalk(id);
  await loadNotes(id);
  await loadApprovals(id);
  await loadSettled(id);
}

// The talk is read when the item is opened, and only then: it is about that one item, and there
// is nothing of it to show until he opens it.
async function loadTalk(id: number): Promise<void> {
  const generation = detailGeneration;
  const mine = ++talkGeneration;
  const latest = (): boolean => generation === detailGeneration && mine === talkGeneration;
  talkLoading.value = true;
  talkFailure.value = null;
  try {
    const answer = await $fetch<TodoTalk>(`/api/todos/${id}/talk`);
    if (latest() && opened.value === id) {
      // A talk that answers no turns, as a unit answering in another shape does, stands as none.
      talk.value = Array.isArray(answer.turns) ? answer.turns : [];
      talkAnswering.value = answer.answering;
      talkUnanswered.value = answer.failure;
    }
  } catch (error) {
    if (latest() && opened.value === id) talkFailure.value = failureText(error, t("todo.error.talk_load_failed"));
  } finally {
    if (latest()) talkLoading.value = false;
  }
}

// One turn. bmo-job writes the words down at once and the chat agent's own session answers when its place in
// line comes, so what is sent is read straight back and the answer arrives later, as the news that
// the talk moved. Nothing is named or launched any later for it: a turn is a round of the chat agent's
// session, not a job.
async function ask(id: number): Promise<void> {
  const said = talkText.value.trim();

  if (said === "") {
    return;
  }

  talking.value = true;
  talkFailure.value = null;

  try {
    await $fetch(`/api/todos/${id}/talk`, { method: "POST", body: { text: said } });
    talkText.value = "";
    await loadTalk(id);
  } catch (error) {
    // Words the bot refused were not written down, so what he typed stays in the box to send again.
    talkFailure.value = failureText(error, t("common.error.send_failed"));
  } finally {
    talking.value = false;
  }
}

// What has been added to the item is read when it is opened, again after one is added, and again
// whenever the bot says the queue moved: the row that comes back carries when it landed and
// whether the running job has been handed it, and neither of those is this dialog's to guess at.
// The read the bot's word sets off is quiet — it draws over what stands rather than blanking the
// list to a placeholder first, since most of the time nothing on it changed.
async function loadNotes(id: number, quiet = false): Promise<void> {
  const generation = detailGeneration;
  const mine = ++notesGeneration;
  const latest = (): boolean => generation === detailGeneration && mine === notesGeneration;
  if (!quiet) {
    notesLoading.value = true;
    noteFailure.value = null;
  }
  try {
    const answer = await $fetch<TodoNote[]>(`/api/todos/${id}/notes`);
    if (latest() && opened.value === id) {
      notes.value = answer;
      noteFailure.value = null;
    }
  } catch (error) {
    if (latest() && opened.value === id) noteFailure.value = failureText(error, t("todo.error.notes_load_failed"));
  } finally {
    if (latest()) notesLoading.value = false;
  }
}

// The item's reports are read when it is opened and again whenever the bot says the queue moved, so a report written
// while the dialog stands lands in it. An item opened on its state whose first read brings a report turns to the
// result, which is what it would have opened on had the board known.
async function loadReports(id: number, quiet = false): Promise<void> {
  const generation = detailGeneration;
  const mine = ++reportsGeneration;
  const latest = (): boolean => generation === detailGeneration && mine === reportsGeneration;
  const before = hasResult.value;

  try {
    const answer = await $fetch<TodoReport[]>(`/api/todos/${id}/reports`);

    if (latest() && opened.value === id) {
      readReports.value = { id, reports: answer };

      if (!quiet && !before && hasResult.value) {
        leftTab.value = leftTab.value === "status" ? "result" : leftTab.value;
        singleTab.value = singleTab.value === "status" ? "result" : singleTab.value;
      }
    }
  } catch {
    // The board's reading of the reports stands where the dialog's own could not be made.
  }
}

// The record of the open item's approval, read the way its added words are: a quiet read draws over
// what stands, since the queue moving is seldom news of an approval.
async function loadApprovals(id: number, quiet = false): Promise<void> {
  const generation = detailGeneration;
  const mine = ++approvalsGeneration;
  const latest = (): boolean => generation === detailGeneration && mine === approvalsGeneration;
  if (!quiet) {
    approvalsLoading.value = true;
    approvalsFailure.value = null;
  }
  try {
    const answer = await $fetch<TodoApproval[]>(`/api/todos/${id}/approvals`);
    if (latest() && opened.value === id) {
      approvals.value = answer;
      approvalsFailure.value = null;
    }
  } catch (error) {
    if (latest() && opened.value === id) approvalsFailure.value = failureText(error, t("todo.error.approvals_load_failed"));
  } finally {
    if (latest()) approvalsLoading.value = false;
  }
}

// The panel heard that the queue moved, which can be news of the open row's added words.
function reread(id: number): void {
  void loadNotes(id, true);
  void loadReports(id, true);
  void loadReviews(id);
  void loadApprovals(id, true);
  void loadSettled(id);
}

// The item's review is read when it is opened and again whenever the bot says the queue moved, so an entry written
// while the dialog stands lands in it. A read that fails leaves what stands.
let reviewsGeneration = 0;
async function loadReviews(id: number): Promise<void> {
  const generation = detailGeneration;
  const mine = ++reviewsGeneration;

  try {
    const answer = await $fetch<TodoReview[]>(`/api/todos/${id}/reviews`);

    if (generation === detailGeneration && mine === reviewsGeneration && opened.value === id) {
      readReviews.value = { id, reviews: answer };
    }
  } catch {
    // The review stands as last read where this read could not be made.
  }
}

// One lot of words onto an item that already stands. The bot writes them — which job they landed
// in the middle of is the bot's own reading of the queue — so what is added is read back rather
// than put on the screen from here.
async function append(id: number): Promise<void> {
  const said = noteText.value.trim();

  if (said === "") {
    return;
  }

  const key = busyKey(id, "append");

  busy.value.add(key);
  noteFailure.value = null;

  try {
    await $fetch("/api/todos", { method: "POST", body: { action: "append", id, text: said } });
    noteText.value = "";
    await loadNotes(id);
    // The row itself says nothing new, but a job that is running now has one more thing to do
    // before it may report, and the queue is what says whether one is.
    await reload();
  } catch (error) {
    // Nothing was written, so what he typed stays in the box to send again.
    noteFailure.value = failureText(error, t("todo.error.note_send_failed"));
  } finally {
    busy.value.delete(key);
  }
}

// Taking one lot of those words back. The bot writes it, and the row is marked rather than
// deleted, so what comes back is the item's own record read again rather than a row struck off
// the screen from here.
async function unappend(id: number, noteId: number): Promise<void> {
  const key = busyKey(id, "unappend");

  busy.value.add(key);
  noteFailure.value = null;

  try {
    await $fetch("/api/todos", { method: "POST", body: { action: "unappend", id, noteId } });
    confirmingNote.value = null;
    await loadNotes(id);
  } catch (error) {
    // Nothing was written, so the words stand where they were and the confirmation stands with
    // them: the press he made is the one to make again.
    noteFailure.value = failureText(error, t("todo.error.note_delete_failed"));
  } finally {
    busy.value.delete(key);
  }
}

// The open item's talk is read again when the bot says it moved: his words written down, or
// The chat agent's turn on it over, answered or not. The talk of any other item is not this dialog's news.
useLiveRefresh(
  () => {
    if (opened.value !== null) {
      void loadTalk(opened.value);
    }
  },
  {
    on: ["todo-talk"],
    where: (event) => event.type === "todo-talk" && event.todoId === opened.value
  }
);

// A merge link goes to the item it names, in the same dialog: the address is written over rather
// than stepped, since the dialog is the one thing standing and Back closes it.
async function openLinked(id: number): Promise<void> {
  await fetchStray(id);
  await router.replace({ query: { ...route.query, todo: id } });
}

// Which worker is to do it. Nothing else about the row moves: an assignment says where the work
// will be done, not what the work is, so its place in the queue and everything on it stand. The chosen
// value in its cell is what says it went through (docs/web.md, 「Messages」).
async function assignWorker(id: number, chosen: string): Promise<void> {
  const worker = chosen === UNASSIGNED ? null : chosen;

  await act(id, "worker", { worker }, "todo.error.worker_change_failed");
}

// Whom its jobs go out on, one agent or a model and a role, written to its labels. Nothing else about the row moves,
// and a job already running keeps its agent.
async function setAgent(id: number, assignment: ItemAssignment): Promise<void> {
  if ("agent" in assignment) await act(id, "agent", { agent: assignment.agent }, "todo.error.agent_change_failed");
  else await act(id, "model", { model: assignment.model, role: assignment.role ?? undefined }, "todo.error.agent_change_failed");
}

async function approve(id: number): Promise<void> {
  await act(id, "approve", { note: note.value.trim() });
  void loadApprovals(id, true);
}

// An outstanding note that is no longer outstanding — every part of it either done since, or standing as a
// TODO row of its own. What the job wrote stays on the row word for word; what is added is the
// line saying why it no longer stands. The bot refuses a note that is not there and one already
// resolved, and the refusal comes back in the message pill.
async function resolve(id: number): Promise<void> {
  const said = why.value.trim();

  if (said === "") {
    return;
  }

  if (await act(id, "resolve", { why: said })) why.value = "";
}

// Setting one aside, with the reason it is kept with; the button waits for one.
async function hold(id: number): Promise<void> {
  const reason = holdWhy.value.trim();

  if (reason === "") return;

  holdFailure.value = null;

  if (await act(id, "hold", { why: reason }, undefined, (said) => (holdFailure.value = said))) holdWhy.value = "";
}

// Switching its job notices off, with the reason it carries while they are off; the button waits for one.
async function noticesOff(id: number): Promise<void> {
  const reason = noticesWhy.value.trim();

  if (reason === "") return;

  noticesFailure.value = null;

  if (await act(id, "notices_off", { why: reason }, undefined, (said) => (noticesFailure.value = said))) noticesWhy.value = "";
}

// Switching them back on.
async function noticesOn(id: number): Promise<void> {
  noticesFailure.value = null;
  await act(id, "notices_on", {}, undefined, (said) => (noticesFailure.value = said));
}

// Stopping it now. The bot ends what is in flight and holds the item with the reason; the runs end
// after the answer, and the row reads as stopping until they have.
async function stop(id: number): Promise<void> {
  const reason = stopWhy.value.trim();

  if (reason === "") {
    return;
  }

  stopFailure.value = null;

  if (await act(id, "stop", { why: reason }, undefined, (said) => (stopFailure.value = said))) stopWhy.value = "";
}

// Taking it back. It returns to exactly the place it had: its priority never moved.
async function release(id: number): Promise<void> {
  await act(id, "release");
}

function openRaise(id: number): void {
  raising.value = new Set([id]);
  raiseTitle.value = "";
  raiseSaid.value = "";
  raiseSources.value = [];
}

// The head's create button: the result comes forward wherever the reader stood, with the raising form
// open under the note and its title box holding the typing. A form already open keeps what is typed in it.
function startRaise(id: number): void {
  leftTab.value = "result";
  singleTab.value = "result";
  if (!raising.value.has(id)) {
    openRaise(id);
  }
  void nextTick(() => raiseTitleBox.value?.inputRef?.focus());
}

// The notes he may name beside the one he is standing on. Every item whose outstanding note is
// still standing is here, whichever page of the board it is on and whatever is being searched for
// — the row he is looking at and the note that points at the same work are two different rows,
// and he has not searched for the second one.
function otherNotes(id: number): { label: string; value: number }[] {
  return board.value.standingNotes
    .filter((note) => note.id !== id)
    .map((note) => ({ label: `#${note.id} ${note.title}`, value: note.id }));
}

function closeRaise(id: number): void {
  const held = new Set(raising.value);

  held.delete(id);
  raising.value = held;
}

// A strand of this note, raised as a row of its own. It goes up unapproved and waits with the
// other requests: raising is not approving, and what is worth doing is still his to say.
async function raise(id: number): Promise<void> {
  const title = raiseTitle.value.trim();
  const said = raiseSaid.value.trim();

  if (title === "" || said === "") {
    return;
  }

  const key = busyKey(id, "raise");

  busy.value.add(key);

  try {
    const sources = [...raiseSources.value];
    const answer = await $fetch<TodoActionResult>("/api/todos", {
      method: "POST",
      body: { action: "raise", id, title, said, sources }
    });
    const from = [id, ...sources].map((one) => `#${one}`).join(", ");

    closeRaise(id);
    // The new line is news the reader has not seen yet, standing among the requests: the pill names it and its press
    // opens it (docs/web.md, the TODO panel's section).
    island.say(
      answer.raised === undefined
        ? { tone: "success", title: t("todo.message.raised", { from }) }
        : {
            tone: "success",
            title: t("todo.message.raised_item", { from, id: answer.raised }),
            to: router.resolve({ query: { ...route.query, todo: answer.raised } }).fullPath
          }
    );
    await reload();
  } catch (error) {
    island.fail(error, t("todo.error.create_failed"));
  } finally {
    busy.value.delete(key);
  }
}

// The confirmation stands until the press it started comes back: its discard button is the one
// wearing the spinner, and taking it off the screen mid-press would leave the wait nothing to
// show itself on.
async function drop(id: number): Promise<void> {
  const dropped = await act(id, "drop");

  confirming.value = null;

  if (dropped) opened.value = null;
}

defineExpose({ toggled, asked, reread });
</script>
