-- Two grouping systems become one.
--
-- Competitors shipped idea_folders (competitor_ideas.folder_id) months before
-- Projects existed. Projects then added project_id to both chat_threads and
-- competitor_ideas - and nothing ever wrote it. The whole column appears twice
-- in the codebase, both times in a SELECT. So the user had two lists: folders
-- that worked and projects that could be created but never filled.
--
-- A saved competitor idea, the conversation it started and the notes about it
-- are one piece of work. There is no version of this product where they belong
-- in different filing cabinets, so the folders become projects and the old
-- cabinet goes.
--
-- The copy and the drop are in one migration on purpose: if the copy fails the
-- transaction rolls back and nothing is lost. Leaving idea_folders behind
-- "just in case" is how the two-systems problem started.

-- Notes on a project. The thing people actually want a project for is somewhere
-- to write down what they are trying to do.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes text;

-- 1. Every folder becomes a project, keeping its name and its age. ON CONFLICT
--    is not usable here (projects has no unique name constraint, deliberately -
--    two projects may share a name), so an existing project of the same name is
--    matched instead and the folder merges into it.
INSERT INTO projects (user_id, name, created_at, updated_at)
SELECT f.user_id, f.name, f.created_at, f.created_at
FROM idea_folders f
WHERE NOT EXISTS (
  SELECT 1 FROM projects p WHERE p.user_id = f.user_id AND p.name = f.name
);

-- 2. Ideas filed in a folder move to the matching project. Ideas that were
--    saved but unfiled stay unfiled - "saved without deciding where" is a real
--    state and inventing a project for it would be worse than leaving it.
UPDATE competitor_ideas ci
SET project_id = p.id
FROM idea_folders f
JOIN projects p ON p.user_id = f.user_id AND p.name = f.name
WHERE ci.folder_id = f.id
  AND ci.user_id = f.user_id
  AND ci.project_id IS NULL;

-- 3. The old cabinet.
ALTER TABLE competitor_ideas DROP COLUMN IF EXISTS folder_id;
DROP TABLE IF EXISTS idea_folders;
