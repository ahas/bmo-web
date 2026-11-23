import { AccountRefusal, resolveChain } from "./account-service";
import { ownerKeyOf } from "./owner-key";

import type { SignedIn } from "./accounts";
import type { AttachedBundle } from "./console-manifests";
import type { ConsoleManifest } from "bmo-ui/shared/console-manifest";
import type { H3Event } from "h3";

// Whether a screen that is an app stands on for the signed-in reader (docs/web.md, 「Screens a unit brings」;
// docs/accounts.md, 「An app's two settings」): an app's key is the service name a bundle's manifest gives, and the
// unit publishing the app declares two kinds on the delegation chain under that key, whether the app is offered
// under a link and whether it is on. The console resolves both for the reader's person as it acts and keeps no answer
// past the request: what the chain says now is what a list or a relayed call is held to.

/** The two settings an app stands on. */
export const APP_SETTINGS = ["offered", "on"] as const;

export type AppSetting = (typeof APP_SETTINGS)[number];

// An app's key as a kind's key carries it: a kebab-case name, the service name a manifest gives.
const APP_KIND = /^app\.([a-z][a-z0-9-]*)\.(offered|on)$/;

/** The key of an app's kind on the chain. */
export function appKind(app: string, setting: AppSetting): string {
  return `app.${app}.${setting}`;
}

/** The app and the setting a kind's key names, or null where it is no app's. */
export function appOfKind(key: string): { app: string; setting: AppSetting } | null {
  const found = APP_KIND.exec(key);

  return found === null ? null : { app: found[1]!, setting: found[2] as AppSetting };
}

/** The refusal's code where the account service holds no such kind: nobody declared it, so it says nothing against
 * an app. */
const NO_SUCH_KIND = "no-such-kind";

/** The code a relayed call to an app turned off for the reader is refused with. */
export const APP_OFF = "app-off";

/** What the gate asks of the account service: a kind's value resolved for a person, which throws the service's
 * refusal where it refuses. */
export interface AppGateDeps {
  resolve: (key: string, person: string) => Promise<unknown>;
}

/** The account service's own resolution. */
export const CHAIN_DEPS: AppGateDeps = {
  resolve: async (key, person) => (await resolveChain(key, { person })).value
};

/** Whether one resolution lets an app through: a value but `false` does, and so does a kind nobody declared; a
 * resolution the service refuses otherwise, or does not answer, holds the app off. */
async function lets(asked: Promise<unknown>): Promise<boolean> {
  try {
    return (await asked) !== false;
  } catch (error) {
    if (error instanceof AccountRefusal && error.code === NO_SUCH_KIND) return true;

    console.error("app gate: an app is held off, its setting not answered:", error);

    return false;
  }
}

/**
 * The apps standing on for one person, each asked once for the life of the gate. A login with no user has no person to
 * resolve for, and every app stands open to it.
 */
export class AppGate {
  private readonly asked = new Map<string, Promise<boolean>>();

  constructor(
    private readonly person: string | null,
    private readonly deps: AppGateDeps = CHAIN_DEPS
  ) {}

  /** Whether an app stands open for the person: offered and on, as the chain resolves both for them. */
  open(app: string): Promise<boolean> {
    if (this.person === null) return Promise.resolve(true);

    let held = this.asked.get(app);

    if (held === undefined) {
      const person = this.person;

      held = Promise.all(APP_SETTINGS.map((setting) => lets(this.deps.resolve(appKind(app, setting), person)))).then((words) => words.every(Boolean));
      this.asked.set(app, held);
    }

    return held;
  }

  /** Whether a bundle's screen stands open for the person: a screen only the administrator opens is one the system is
   * run with, never an app, and any other stands as its service's app does. */
  opens(manifest: ConsoleManifest): Promise<boolean> {
    return manifest.role === "administrator" ? Promise.resolve(true) : this.open(manifest.serviceName);
  }

  /** The bundles among `bundles` whose screen stands open for the person, in their order. */
  async openBundles(bundles: readonly AttachedBundle[]): Promise<AttachedBundle[]> {
    const open = await Promise.all(bundles.map((bundle) => this.opens(bundle.manifest)));

    return bundles.filter((_, at) => open[at]);
  }
}

/** The gate of one request for its signed-in reader, made once and asked by everything the request does. */
export function appGateOf(event: H3Event, signed: SignedIn): AppGate {
  const context = (event.context ??= {});
  const held = context.appGate as AppGate | undefined;

  if (held !== undefined) return held;

  const made = new AppGate(ownerKeyOf(signed));

  context.appGate = made;

  return made;
}
