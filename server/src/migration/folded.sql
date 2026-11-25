-- What the baseline no longer makes, taken from an install that still holds it (docs/accounts.md, 「The tables」):
-- every tuple on a room, a worker, a repository or a tool capability or naming a room's members, those kinds' rows of
-- the rules' projection, and the words grants were made with. An install holding none of it is left as it is.

DELETE FROM public.relation_tuples
    WHERE resource_type IN ('bmo_room', 'bmo_member', 'bmo_worker', 'bmo_repository', 'bmo_tools')
        OR subject_type = 'bmo_member';

DELETE FROM public.relation_definitions
    WHERE resource_type IN ('bmo_room', 'bmo_member', 'bmo_worker', 'bmo_repository', 'bmo_tools');

DELETE FROM public.permission_definitions
    WHERE resource_type IN ('bmo_room', 'bmo_member', 'bmo_worker', 'bmo_repository', 'bmo_tools');

DROP TABLE IF EXISTS public.grant_words;
