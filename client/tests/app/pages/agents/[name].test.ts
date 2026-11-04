import { describe, expect, test } from "bun:test";

// What an agent's own title bar carries about that agent. The week's four kinds stand on the bar
// itself, in the short hand the owner reads them in, and the mark they stand on opens the rest.
// Spelt out with their Korean words, their total and what the split cannot account for, that same
// week runs to four hundred-odd pixels of a bar whose one job is the agent's name; in short hand
// it is a figure the bar can carry without losing the name.
//
// What the press opens is the block the home screen puts under this same agent's name, drawn by
// the same component. One agent's figures are one picture wherever the console shows them; a
// second spelling of them in a header is a second thing to keep true, and the two would drift the
// first time either was touched.
//
// It is read off the file that ships: a header is laid out by variants and a rendered bar would
// name none of this.

const source = await Bun.file(new URL("../../../../apps/web/app/pages/agents/[name].vue", import.meta.url)).text();
const template = source.slice(0, source.indexOf("<script"));

// An agent's own run is stopped from its own screen: the button stands beside the uptime that
// says it is running, and the question grows under the title rather than floating over it.
describe("stopping this agent's own run", () => {
  test("the button stands by what the picture named, and the question stands in place", () => {
    expect(template).toContain('stopTarget !== null && !stops.isAsking(stopTarget)');
    expect(template).toContain(`:label="$t('live.status.stopping')"`);
    expect(template).toContain("<StopConfirm");
    expect(source).toContain("stopTargetOf(run.value)");
    expect(source).toContain("useBackClose(computed(() => stops.asking.value !== null)");
  });
});

describe("what an agent's title bar says about that agent", () => {
  test("there is source to read, so nothing below passes on an empty string", () => {
    expect(template.length).toBeGreaterThan(500);
    expect(template).toContain("<ConsoleTitleBar");
    expect(template).not.toContain("<UsageMeters");
  });

  test("carries the agent's figures behind one mark, and no stretch's total on the bar itself", () => {
    expect(template).toContain(`:aria-label="$t('agents.aria.vitals')"`);
    expect(source).not.toContain("weekShort");
    expect(source).not.toContain("shortKindsText");
    expect(template).not.toContain('agents.label.weekly');
    expect(source).not.toContain("weekText");
    expect(source).not.toContain("contextText");
  });

  test("hands the log the turns of the chat going now, and no other agent's", () => {
    expect(template).toContain(':live="chatTurns"');
    expect(source).toContain("row.value?.defaultAnswerer === true");
  });

  test("and what the mark opens is the console's own block for one agent's figures", () => {
    expect(template).toContain("<AgentVitals");
    expect(source).toContain("agentVitals(t, {");
  });

  test("with the four kinds named, because a popover has the room a list row has not", () => {
    expect(template).toContain('legend="inline"');
  });

  test("says nothing about what is running, which the badge beside it is already saying", () => {
    // Handed no live picture, the block has no work to report and leaves that line out.
    const at = source.indexOf("agentVitals(t, {");
    const built = source.slice(at, source.indexOf("})", at));

    expect(built).toContain("live: []");
    expect(template).toContain(":label=\"runningLabel\"");
  });

  test("and leaves no mark at all where nothing is known about the agent", () => {
    expect(template).toContain('v-if="hasFigures"');
  });
});

// A supervisor's, a role's and a repository's own settings are edited from their own screen, through the very dialogs
// the agent management screen opens, so a setting has one editor and one road wherever it is met.
describe("this agent's own settings", () => {
  const script = source.slice(source.indexOf("<script"));

  test("stand behind one button beside the name, for a supervisor, a role and a repository alike", () => {
    expect(template).toContain(`<UTooltip v-if="settingsKind !== null && writable" :text="$t('agents.action.settings')">`);
    expect(template).toContain(`:aria-label="$t('agents.action.settings')"`);
    expect(script).toContain('if (settingsSupervisors.value?.some((one) => one.name === name) === true) return "supervisor";');
    expect(script).toContain('if (settingsRoles.value?.roles.some((one) => one.name === name) === true) return "role";');
  });

  test("open no gate editor, which has no place on this screen", () => {
    for (const gone of ["<AgentGatesDialog", "<GateSettingsDialog", "settingsKind === 'gate'", "settingsKind === 'gates'", "row.value?.gates"]) {
      expect(template).not.toContain(gone);
      expect(script).not.toContain(gone);
    }
  });

  test("open the dialog of its axis or place by its name, the catalogue read again after a save", () => {
    expect(template).toContain('<SupervisorSettingsDialog v-if="writable && settingsKind === \'supervisor\'" v-model:open="settingsOpen" :name="name" :reread="refreshCatalogue" />');
    expect(template).toContain('<RoleSettingsDialog v-else-if="writable && settingsKind === \'role\'" v-model:open="settingsOpen" :name="name"');
    expect(template).toContain('<RepositorySettingsDialog v-else-if="writable && settingsKind === \'repository\'" v-model:open="settingsOpen" :name="name"');
    expect(template).not.toContain("<WorkerSettingsDialog");
  });

  test("never put the button at the right end, which keeps what every screen carries", () => {
    const right = template.slice(template.indexOf("<template #right>"));

    expect(right.slice(0, right.indexOf("</template>"))).not.toContain('agents.action.settings');
  });
});
