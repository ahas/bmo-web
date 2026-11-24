-- The room relations taken away (docs/accounts.md, 「The tables」): every tuple on a room or naming a room's
-- members, the room kind's rows of the rules' projection, and the words grants were made with.

DELETE FROM public.relation_tuples WHERE resource_type = 'bmo_room' OR subject_type = 'bmo_member';

DELETE FROM public.relation_definitions WHERE resource_type IN ('bmo_room', 'bmo_member');

DELETE FROM public.permission_definitions WHERE resource_type IN ('bmo_room', 'bmo_member');

DROP TABLE public.grant_words;
