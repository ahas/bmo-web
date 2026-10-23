import type { DeployLogLine } from "#shared/types";

// The last lines of the shown deployment's own log, its deploy unit's journal, for the title bar's popover. A
// record that names no deploy unit has no journal to read.
const LINES = 80;

export default defineEventHandler(async (event): Promise<DeployLogLine[]> => {
  await requireAdministrator(event);

  const unit = shownReading(readDeployReadings()).record?.unit ?? null;

  return unit === null ? [] : deployJournal(unit, LINES);
});
