// The minutes between two of the agency's flushes of the deploy queue (docs/web.md, 「Administration」, the providers
// tab; the agency's `docs/api.md`, 「settings」, `deployFlushMinutes`).

/** The minutes in force, as the agency answers them, or null where its answer carries none. */
export interface DeployFlushView {
  minutes: number | null;
}

/** A change of the minutes: a number for the agency to take or refuse, or null to return to the agency's own. */
export interface DeployFlushAsk {
  minutes: number | null;
}
