import { describe, expect, test } from "bun:test";

// The home screen stands one block to a kind of agent, and every one of them is read out of the
// catalogue. A block written into the page instead — one heading, one address, one set of
// figures, all of them one agent's — can only ever show that agent, so on a machine running more
// than one worker the one at work would stand idle and the one idle would stand working. The
// rule is read off the file that ships, because what makes it true is the shape of the markup
// and not anything a rendered screen would name.

const source = await Bun.file(new URL("../../../apps/web/app/pages/index.vue", import.meta.url)).text();
const at = source.indexOf("<script");
const template = source.slice(0, at);
const script = source.slice(at);

// One line of the page, by something only that line says.
function lineWith(mark: string): string {
  const found = script.split("\n").filter((line) => line.includes(mark));

  expect(found).toHaveLength(1);

  return found[0] ?? "";
}

describe("the blocks below the gates", () => {
  test("are the kinds this screen stands, the workers among them", () => {
    // Which kinds stand is the console's own arrangement; who is in each of them is the
    // archive's, so a worker the owner adds arrives without this page being touched.
    expect(lineWith("STANDING_KINDS: readonly")).toContain('"worker"');
    expect(script).toContain("groupAgents(t, agents.value.agents, key)");
    expect(template).toContain("groupLabel($t, group.key)");
  });

  test("stand one row to an agent, each under its own name, figures and log", () => {
    expect(template).toContain('v-for="agent in group.agents"');
    expect(template).toContain(":to=\"`/agents/${agent.name}`\"");
    expect(template).toContain("vitalsOf(agent.name, null)");
    expect(template).toContain("runsOf(agent.name)");
  });

  test("hold no worker's name of their own, since holding one is holding the wrong one", () => {
    expect(source).not.toContain("WORKER_AGENT");
  });

  test("still say what the job on a worker is a run of, under that worker's own row", () => {
    expect(template).toContain("subtitle(agent)");
    // The run is looked for under the row's own agent, so the item shown on a worker is the
    // item that worker is at.
    expect(script).toContain("runOfAgent(agent, live.value)");
    expect(script).toContain("runningWorkLabel(t, run)");
  });
});

// What the room list says before it has anything to say. The read is this browser's own, so the
// server never starts it: the server stands at idle and the browser is already asking, at the
// same moment and on the same markup. Anything that draws those two states differently makes
// the page arrive one way and redraw itself the other, and the framework answers that by
// throwing the block away and drawing it again from nothing.
describe("the room list before the rooms are there", () => {
  const section = template.slice(template.indexOf('>{{ $t("common.label.room") }}<'), template.indexOf('home.title.gate_agents'));

  test("there is a room block to read, so nothing below passes on an empty string", () => {
    expect(section).toContain('common.status.rooms_loading');
    expect(section).toContain('common.status.no_rooms');
  });

  test("every state short of a read that came back is the one branch", () => {
    expect(section).toContain(`v-else-if="!roomsShown"`);
  });

  test("and never one named state, which is the one the server is not in", () => {
    // The server sits at idle where the browser sits at pending, so a branch that names either
    // of them by itself is a branch the two sides disagree about.
    expect(section).not.toContain("status === 'pending'");
    expect(section).not.toContain("status === 'idle'");
  });

  test("so saying there are no rooms is a claim made only after somebody asked", () => {
    const notYet = section.indexOf("!roomsShown");
    const none = section.indexOf('common.status.no_rooms');

    expect(notYet).toBeGreaterThan(-1);
    expect(none).toBeGreaterThan(notYet);
  });
});

// The front door's own bar. Every other screen's bar names that screen; this one names nothing,
// because the mark at the top of the sidebar has already said which console this is.
describe("the bar over the home screen", () => {
  test("carries no name and no mark of its own", () => {
    const bar = template.slice(template.indexOf("<UDashboardNavbar"), template.indexOf("</UDashboardNavbar>"));

    expect(bar).not.toContain("APP_NAME_KO");
    expect(bar).not.toContain("icon=");
    expect(script).not.toContain("APP_NAME_KO");
  });

  test("takes the empty heading out of the bar rather than leaving it standing", () => {
    expect(template).toContain(`:ui="{ title: 'hidden' }"`);
  });

  test("is the one title bar every screen carries, its buttons the layout's one set", async () => {
    const actions = await Bun.file(new URL("../../../apps/web/app/components/ConsoleTitleBarActions.vue", import.meta.url)).text();

    expect(template).toContain('<ConsoleTitleBar :ui="{ title: \'hidden\' }" />');
    expect(template).not.toContain("<UsageMeters");
    expect(actions).toContain("<TodoOpenButton />");
    expect(actions).toContain("<UsageMeters />");
  });
});
