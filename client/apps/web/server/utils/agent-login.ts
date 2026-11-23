import { agencyClient } from "@agency/client";

import { unitAt } from "./units";

// Whether a person must set up a login of their own before they start (docs/web.md, 「The join page」; the agency's
// `docs/supply.md`, 「The sources a person's chain leaves open」): asked of the agency in the person's name, their
// runs only their own supply can carry and they hold none that is on. An agency that does not answer asks nothing of
// the person, so nobody is held at the door by an outage.
export async function agentLoginNeeded(user: number): Promise<boolean> {
  const unit = unitAt("AGENCY");

  if (unit === null) return false;

  const client = agencyClient(unit.address, unit.token ?? "", async (request) => {
    const headers = new Headers(request.headers);

    headers.set("Owner-Key", String(user));
    headers.set("Owner-Role", "member");

    return await fetch(new Request(request, { headers }));
  });

  try {
    const answer = await client.GET("/supply-sources");

    if (answer.data === undefined) throw new Error(`the agency answered ${answer.response.status}`);

    return answer.data.personalOnly && !answer.data.ownSupply;
  } catch (error) {
    console.warn(`account ${user}: whether it needs a login of its own could not be read: ${String(error)}`);

    return false;
  }
}
