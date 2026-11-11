// The supervisors whose owner account is the signed-in reader, by name: the BMOs whose log and turns they read
// whatever sections they hold (docs/web.md, 「Access」).
export default defineEventHandler(async (event): Promise<string[]> => {
  const signed = await signedInUser(event);

  if (signed.id === null) return [];

  return (await readSupervisors().catch(() => [])).filter((supervisor) => supervisor.ownerAccount === signed.id).map((supervisor) => supervisor.name);
});
