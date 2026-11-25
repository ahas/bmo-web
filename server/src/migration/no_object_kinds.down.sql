-- The agent object kinds made again, holding nothing (docs/accounts.md, 「The tables」): their four relations in the
-- rules' projection. The service's start writes the rest of the projection from the rules it runs.

INSERT INTO public.relation_definitions (resource_type, relation, kind, subject_types) VALUES
    ('bmo_worker', 'run', 'stored', '{user}'),
    ('bmo_repository', 'change', 'stored', '{user}'),
    ('bmo_repository', 'deploy', 'stored', '{user}'),
    ('bmo_tools', 'use', 'stored', '{user}')
ON CONFLICT (resource_type, relation) DO NOTHING;
