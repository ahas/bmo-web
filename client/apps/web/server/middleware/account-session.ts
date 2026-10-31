import { wording } from "#shared/wording";

// A seal is good only while the login it holds stands (docs/web.md, 「Access」): one past its span is
// ended; one holding a sumida session stands while that session stands on the account service, asked
// about at most once a window; and one holding none stands only while the model is not in force. A seal
// no longer good is ended, so the rest of the request is refused as one nobody signed. A service that
// does not answer ends nothing: the request is refused as the service being down and the seal stays for
// the next one. A request with no session cookie is left alone, as the slide leaves it, and so is a
// websocket upgrade, which the relay's socket asks about itself as it opens.
export default defineEventHandler(async (event) => {
  if (getRequestHeader(event, "upgrade") !== undefined || !carriesSession(event)) {
    return;
  }

  const session = await getUserSession(event);

  if (session.user === undefined) {
    return;
  }

  const state = await sealState(session, browserAddress(event));

  if (state === "unanswered") {
    throw fail(503, wording("app.error.accounts_down"));
  }

  if (state === "gone") {
    await endSession(event);
  }
});
