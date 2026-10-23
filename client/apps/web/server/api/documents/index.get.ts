import type { DocumentList } from "#shared/types";

// Every document the viewer can open, by root, and the roots other units keep standing unread. The list is walked
// on every call, so a document changed or gone on disk is never listed as it stood. The pieces a reference gate may
// attach are the brain's rows before they are files, so what the row says about them comes with the list
// (`docs/documents-viewer.md`). A translation is offered where the console names the translator.
export default defineEventHandler(async (event): Promise<DocumentList> => {
  await requireUserSession(event);

  const roots = documentRoots();
  const listed = listDocuments(roots);
  const fragments = await documentFragments(roots, listed);

  return {
    roots: documentRootViews(roots),
    documents: listed.map((entry) => ({
      root: entry.root,
      path: entry.path,
      title: entry.title,
      size: entry.size,
      group: null,
      fragment: fragments.get(`${entry.root}/${entry.path}`) ?? null
    })),
    translation: translatorNamed()
  };
});
