import { useIsland } from "bmo-ui/app/domain/island";

import { useAdministrator, useSignedUser } from "~/domain/access";
import { messageLinks } from "#shared/links";
import { FIELD_KEY_MAX, FIELD_LABEL_MAX, KIND_DESCRIPTION_MAX, KIND_FIELDS_MAX, KIND_KEY_MAX, KIND_NAME_MAX, SECRET_QUERY, requestRefusalOf, secretRequestOfLink } from "#shared/secret-kinds";

import type { KindFault, KindProblem, SecretField, SecretInput, SecretKind, SecretKindList, SecretRequest } from "#shared/secret-kinds";
import type { KeptSecret, SecretList } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { ComputedRef, Ref } from "vue";

// The secret form (docs/web.md, the secret store section): one dialog over whatever screen is open, opened by the composer's
// clip and by an agent's request, and what a save hands back to whoever opened it. Every save goes to the reader's
// own space. The settings section opens a form of its own. Nothing here ever holds a value: the form's own boxes are
// the only place one stands.

/** What the form is opened with: a name, the kind or the fields to ask in, and what the secret is for. */
export interface SecretAsk {
  name: string;
  kind: string | null;
  fields: SecretField[] | null;
  purpose: string;
  replace: boolean;
}

/** Who the form answers once a save goes through: a room a request was answered over, or a composer. */
export type SecretTarget =
  | { kind: "request"; room: string | null }
  | { kind: "composer"; place: string };

export interface SecretFormState {
  open: boolean;
  ask: SecretAsk;
  target: SecretTarget;
}

/** A secret a save put in the store, as a room is told of it: its name and its kind's words. */
export interface HandedSecret {
  name: string;
  kind: string;
}

/** The last save the shared form made, for whoever it was opened for. */
export interface SecretSaved {
  target: SecretTarget;
  handed: HandedSecret;
  at: number;
}

export function emptyAsk(): SecretAsk {
  return { name: "", kind: null, fields: null, purpose: "", replace: false };
}

export function useSecretForm(): Ref<SecretFormState> {
  return useState<SecretFormState>("secret-form", () => ({ open: false, ask: emptyAsk(), target: { kind: "request", room: null } }));
}

export function useSecretSaved(): Ref<SecretSaved | null> {
  return useState<SecretSaved | null>("secret-saved", () => null);
}

/** The shared form opened on an ask, for the target that answers its save. */
export function askSecret(state: Ref<SecretFormState>, ask: SecretAsk, target: SecretTarget): void {
  state.value = { open: true, ask, target };
}

/** The place a composer answers to, its box's kind and draft, so a save made from it comes back to it alone. */
export function composerPlace(kind: string, draft: string | number): string {
  return `${kind}:${draft}`;
}

// The read under way, so the request lines of one page ask once between them.
let reading: Promise<[SecretKindList, SecretList]> | null = null;

/** The kinds and the secrets the reader's own space holds, read once for every form and request in the tab. */
export function useSecretLists(): {
  kinds: Ref<SecretKind[] | null>;
  secrets: Ref<KeptSecret[] | null>;
  read: () => Promise<void>;
} {
  const kinds = useState<SecretKind[] | null>("secret-kinds", () => null);
  const secrets = useState<KeptSecret[] | null>("secret-list", () => null);

  async function read(): Promise<void> {
    reading ??= Promise.all([$fetch<SecretKindList>("/api/secret-kinds"), $fetch<SecretList>("/api/secrets")]).finally(() => {
      reading = null;
    });

    const [kindList, secretList] = await reading;

    kinds.value = kindList.kinds;
    secrets.value = secretList.secrets;
  }

  return { kinds, secrets, read };
}

/** Whether the reader's space holds a secret under the name, changed at or after a moment in milliseconds. */
export function savedSince(secrets: readonly KeptSecret[] | null, name: string, since: number): boolean {
  return secrets?.some((secret) => secret.name === name && secret.changedAt >= since) === true;
}

export const INPUT_LABELS: Readonly<Record<SecretInput, string>> = {
  line: "secrets.label.input_line",
  lines: "secrets.label.input_lines",
  file: "secrets.label.input_file"
};

const FAULT_ERRORS: Readonly<Record<KindProblem, { key: string; max?: number }>> = {
  key: { key: "secrets.error.fault_key", max: KIND_KEY_MAX },
  name: { key: "secrets.error.fault_name", max: KIND_NAME_MAX },
  description: { key: "secrets.error.fault_description", max: KIND_DESCRIPTION_MAX },
  no_fields: { key: "secrets.error.fault_no_fields" },
  too_many_fields: { key: "secrets.error.fault_too_many_fields", max: KIND_FIELDS_MAX },
  field_key: { key: "secrets.error.fault_field_key", max: FIELD_KEY_MAX },
  field_label: { key: "secrets.error.fault_field_label", max: FIELD_LABEL_MAX },
  field_repeated: { key: "secrets.error.fault_field_repeated" },
  field_alone: { key: "secrets.error.fault_field_alone" }
};

/** A rule a kind breaks, said in the pack's words. */
export function faultText(t: Translate, fault: KindFault): string {
  const said = FAULT_ERRORS[fault.problem];

  return t(said.key, { max: said.max ?? 0 });
}

/** The words a kind is told by: its name, or the keys of fields composed by hand. */
export function kindWords(t: Translate, kind: SecretKind | null, fields: readonly SecretField[]): string {
  return kind?.name ?? t("secrets.message.composed", { keys: fields.map((field) => field.key).join(", ") });
}

/** The line a room is told a secret was saved in, never holding a value: one line to each secret. */
export function handedLines(t: Translate, handed: readonly HandedSecret[], requested: boolean): string {
  const key = requested ? "secrets.message.request_saved" : "secrets.message.handed";

  return handed.map((one) => t(key, { name: one.name, kind: one.kind })).join("\n");
}

/**
 * The console's own addresses a request link may stand under: its public address, as its settings name it, and the
 * address it is being read at.
 */
export function useConsoleBases(): ComputedRef<string[]> {
  const configured = useRuntimeConfig().public.consoleAddress;
  const { baseURL } = useRuntimeConfig().app;

  return computed(() => {
    const bases = typeof configured === "string" && configured !== "" ? [configured] : [];

    return import.meta.client ? [...bases, `${location.origin}${baseURL}`] : bases;
  });
}

/** The requests a message's words carry, each name once: its addresses and its formatting's links. */
export function secretRequestsOf(text: string, formats: readonly { url?: string }[] | undefined, bases: readonly string[]): SecretRequest[] {
  // Most messages carry none, and are passed over before their words are read for addresses.
  if (!text.includes(`${SECRET_QUERY}=`) && !(formats ?? []).some((format) => format.url?.includes(`${SECRET_QUERY}=`) === true)) return [];

  const links = [...messageLinks(text, Number.POSITIVE_INFINITY), ...(formats ?? []).flatMap((format) => (format.url === undefined ? [] : [format.url]))];
  const found = new Map<string, SecretRequest>();

  for (const link of links) {
    const request = secretRequestOfLink(link, bases);

    if (request !== null && request.name !== "" && !found.has(request.name)) found.set(request.name, request);
  }

  return [...found.values()];
}

/** The words a request's kind is told by: the kind's name where it is kept, else what the request names. */
export function requestKindWords(t: Translate, request: SecretRequest, kinds: readonly SecretKind[] | null): string {
  const kind = request.kind === null ? null : (kinds?.find((one) => one.key === request.kind) ?? null);

  if (kind !== null) return kind.name;
  if (request.kind !== null) return request.kind;

  return t("secrets.message.composed", { keys: (request.fields ?? []).map((field) => field.key).join(", ") });
}

/**
 * The press on a request in a room: the form opened in place over the room, replacing where the reader's space holds
 * the name since the message, and the refusal, not the form, for a reader the request is not for.
 */
export function useSecretRequest(): (request: SecretRequest, room: number, sentAt: number) => void {
  const { t } = useI18n();
  const island = useIsland(t);
  const administrator = useAdministrator();
  const reader = useSignedUser();
  const form = useSecretForm();
  const { secrets } = useSecretLists();

  return (request, room, sentAt) => {
    const refusal = requestRefusalOf(request, reader.value, administrator.value);

    if (refusal !== null) {
      island.say({ title: t(refusal), tone: "warning" });

      return;
    }

    const replace = savedSince(secrets.value, request.name, sentAt * 1000);

    askSecret(form, { name: request.name, kind: request.kind, fields: request.fields, purpose: request.purpose, replace }, { kind: "request", room: String(room) });
  };
}

// The messages whose request has opened the form by itself in this tab.
const openedOnce = new Set<string>();

/** Whether a message's request may open the form by itself: the first time it is asked, and never again. */
export function firstOpening(message: string): boolean {
  if (openedOnce.has(message)) return false;

  openedOnce.add(message);

  return true;
}
