import { maySessionAct, sessionSupervisors } from "../../../utils/agent-sessions";
import { receiver, receiverCall } from "../../../utils/receiver";

// The supervisors answering a room whose session the reader may hand over or reset (docs/web.md, 「A supervisor's
// session handed over or reset」): those the room names, else the default answerer, by their registration names.
export default defineEventHandler(async (event): Promise<string[]> => {
  const signed = await signedInUser(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const [answerers, supervisors] = await Promise.all([
    receiverCall(receiver().GET("/rooms/{roomId}/answerers", { params: { path: { roomId: chatId } } })),
    sessionSupervisors()
  ]);
  const named = answerers.items.map((answerer) => answerer.agentName);
  const answering = named.length > 0 ? named : answerers.default === "" ? [] : [answerers.default];
  const allowed = await Promise.all(
    [...new Set(answering)].map(async (name) => {
      const supervisor = supervisors.find((one) => one.name === name);

      return supervisor !== undefined && (await maySessionAct(signed, supervisor.owner)) ? name : null;
    })
  );

  return allowed.filter((name): name is string => name !== null);
});
