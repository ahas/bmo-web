-- The agent object kinds taken away (docs/accounts.md, 「The tables」): every tuple on a worker, a repository or a
-- tool capability, and those kinds' rows of the rules' projection.

DELETE FROM public.relation_tuples WHERE resource_type IN ('bmo_worker', 'bmo_repository', 'bmo_tools');

DELETE FROM public.relation_definitions WHERE resource_type IN ('bmo_worker', 'bmo_repository', 'bmo_tools');

DELETE FROM public.permission_definitions WHERE resource_type IN ('bmo_worker', 'bmo_repository', 'bmo_tools');
