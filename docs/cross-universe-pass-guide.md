# Cross-universe management: historical implementation guide

Historical instructions prepared on 8 October 2026. The user has since implemented a modified version. Keep new implementation steps in chat; use the current source and development plan for current behaviour. Do not reapply this guide wholesale.

The original proposed source was checked using temporary copies. The 9 October review also checked the current user implementation with lint and both TypeScript configurations. Supabase metadata has not been inspected directly; the user-maintained snapshots now live under docs/supabase and need the verification described in the development plan.

Keep these rules throughout:

- Every character has an origin universe; every project has a primary universe. A universe can have a descriptive name and no official code. Destruction in the story does not mean deleting its database record.
- Origin and timeline membership are independent. MCU Iron Man can appear on the TVA timeline; this must not add Loki to the MCU timeline.
- Adding an existing project creates a membership, not a copy. Removing a membership keeps the project and its appearances/events. Permanent deletion still affects every universe.
- Normal universe deletion is blocked by any origin, primary-universe or timeline membership reference. Force deletion is deferred pending agreement about what to remove. A visiting character must not be globally deleted merely because the visited universe is removed.
- The controls below work within the selected franchise. Existing timeline rendering continues to use explicit character membership.

Status icons and clicking through to a character's origin timeline are recorded for later. No variant tables, status fields or event-model changes are introduced here.

## 1. Protect universe deletion and restore existing origins

First run this read-only query in Supabase. It lists records left without an origin/primary universe. It does not guess or change their assignments.
```sql
select 'character' as record_type, id, alias as label
from public.characters
where origin_universe_id is null
union all
select 'project', id, title
from public.projects
where primary_universe_id is null
order by record_type, id;
```

If it returns rows, restore each record to its actual universe in the Supabase table editor. Create an appropriately named universe first if necessary; its code can be blank. Do not use the currently selected universe as an automatic replacement. Keep the records unless you intentionally want to delete them.

You can apply the deletion guard below immediately, even before repairing those older rows. Save it as a separate SQL file for reference and run it in Supabase. The constraint names come from your previously supplied live foreign-key results. If a name has since changed, the transaction fails without leaving half the changes applied.

`RESTRICT` makes the database refuse a universe deletion while any of these references exist. It also protects writes made outside the app. Character/project deletion rules are unchanged.

Create [supabase/guard-universe-deletion.sql](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/supabase/guard-universe-deletion.sql).
```sql
begin;

alter table public.characters
    drop constraint characters_origin_universe_id_fkey,
    add constraint characters_origin_universe_id_fkey
        foreign key (origin_universe_id)
        references public.universes(id) on delete restrict;

alter table public.projects
    drop constraint projects_primary_universe_id_fkey,
    add constraint projects_primary_universe_id_fkey
        foreign key (primary_universe_id)
        references public.universes(id) on delete restrict;

alter table public.universe_characters
    drop constraint universe_characters_universe_id_fkey,
    add constraint universe_characters_universe_id_fkey
        foreign key (universe_id)
        references public.universes(id) on delete restrict;

alter table public.universe_projects
    drop constraint universe_projects_universe_id_fkey,
    add constraint universe_projects_universe_id_fkey
        foreign key (universe_id)
        references public.universes(id) on delete restrict;

commit;
```


Once the audit returns no rows, run this second file. `NOT NULL` requires an assignment for every record; the foreign key requires that assignment to point to a real universe. If the audit still finds records, stop this step and restore their intended assignments first.

Create [supabase/require-origins.sql](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/supabase/require-origins.sql).
```sql
begin;

do $$
begin
    if exists (
        select 1 from public.characters where origin_universe_id is null
    ) or exists (
        select 1 from public.projects where primary_universe_id is null
    ) then
        raise exception 'Restore missing character origins and project primary universes before applying this change.';
    end if;
end;
$$;

alter table public.characters
    alter column origin_universe_id set not null;

alter table public.projects
    alter column primary_universe_id set not null;

commit;
```


Replace the `details` declaration in `handleDelete`. Your existing `23503` error check already handles a database refusal correctly; no extra client-side counting or deletion service is needed.

File: [src/pages/WorkspacesPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/WorkspacesPage.tsx).
```tsx
const details = kind === "franchise"
            ? "This franchise must have no universes before it can be deleted."
            : "This universe can only be deleted when no characters, projects " +
            "or timeline memberships reference it. Move or remove those " +
            "references first.";
```


After the required-origin SQL succeeds, change this property in `Character`. `CharacterInput` already requires a number.

File: [src/types/character.ts](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/types/character.ts).
```tsx
origin_universe_id: number;
```


Change this property in both `Project` and `ProjectInput` after the SQL succeeds.

File: [src/types/project.ts](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/types/project.ts).
```tsx
primary_universe_id: number;
```


Replace the primary-universe state declaration. New projects start with the selected universe; existing projects keep their assignment.

File: [src/components/projects/ProjectForm.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/components/projects/ProjectForm.tsx).
```tsx
const [primaryUniverseId, setPrimaryUniverseId] = useState<number>(
        project?.primary_universe_id ?? universeId
    );
```


Insert this validation immediately before the existing `savingRef.current = true`. It allows the original outside-franchise assignment to be preserved, matching the existing form option.

File: [src/components/projects/ProjectForm.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/components/projects/ProjectForm.tsx).
```tsx
if (
            !universes.some((universe) => universe.id === primaryUniverseId) &&
            primaryUniverseId !== originalPrimaryId
        ) {
            setError("Choose a primary universe.");
            return;
        }

        savingRef.current = true;
```


Replace these props/opening lines of the primary-universe `<select>`, removing the Unassigned option. Keep the existing outside-franchise option and universe list below it.

File: [src/components/projects/ProjectForm.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/components/projects/ProjectForm.tsx).
```tsx
value={primaryUniverseId}
                            onChange={(event) =>
                                setPrimaryUniverseId(Number(event.target.value))
                            }
                            required
                        >
```


## 2. Manage visiting characters from the Characters page

The list will show characters originating here plus characters already shown on this timeline. A checkbox reveals the other characters in the selected franchise. Existing Show/Hide actions then work for visitors too; adding a visitor does not invent an appearance.

This small helper gives the same universe label to the character list, timeline and project picker. It uses a readable name when no code exists, and an ID fallback for an existing link outside the loaded franchise.

Create [src/utils/formatUniverseLabel.ts](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/utils/formatUniverseLabel.ts).
```ts
import type { Universe } from "../types/universe";

export function formatUniverseLabel(
    universeId: number,
    universes: Universe[]
): string {
    const universe = universes.find((item) => item.id === universeId);

    if (!universe) return "Universe #" + universeId;

    return universe.code
        ? universe.name + " (" + universe.code + ")"
        : universe.name;
}
```


Replace `getCharactersByOriginUniverse` with this function. `.in(...)` accepts any of the franchise's universe IDs, instead of one origin ID.

File: [src/services/characters.ts](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/services/characters.ts).
```tsx
export async function getCharactersForUniverses(
    universeIds: number[]
): Promise<Character[]> {
    if (universeIds.length === 0) return [];

    const { data, error } = await supabase
        .from("characters")
        .select("*")
        .in("origin_universe_id", universeIds)
        .order("alias")
        .order("id");

    if (error) throw error;

    return data ?? [];
}
```


Rename the imported service to `getCharactersForUniverses` (the call is changed below).

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
getCharactersForUniverses
```


Add the universe-label import alongside the existing form import.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
import CharacterForm from "../components/characters/CharacterForm";
import { formatUniverseLabel } from "../utils/formatUniverseLabel";
```


Add the checkbox state after the characters state.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
const [characters, setCharacters] = useState<Character[]>([]);
    const [includeOtherUniverses, setIncludeOtherUniverses] = useState(false);
```


Add this derived list after `controlsDisabled`. It is calculated from the existing data, so it does not need another state variable or effect.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
const controlsDisabled = editor !== null || changingCharacterId !== null;

    const visibleCharacters = characters.filter((character) =>
        includeOtherUniverses ||
        character.origin_universe_id === universeId ||
        timelineCharacterIds.includes(character.id)
    );
```


Replace the character-loading call inside `Promise.all`.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
getCharactersForUniverses(
                        universes.map((universe) => universe.id)
                    ),
```


Include `universes` in the loading effect dependencies because its IDs now determine which records are fetched.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
}, [universeId, universes, loadAttempt]);
```


Clear a previous action error when opening an editor.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
setNotice(null);
        setActionError(null);
        setEditor(value);
```


Remove this old block from `handleSave`. The loaded list now contains the whole franchise, so saving a visitor must not remove it from that list.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
if (savedCharacter.origin_universe_id !== universeId) {
                return remaining;
            }
```


Replace the old origin-name lookup and save notice with this shorter notice. The checkbox now controls visibility.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
setNotice(savedCharacter.alias + " saved.");
```


Use the visible list for the displayed count.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
{visibleCharacters.length}{" "}
                    {visibleCharacters.length === 1 ? "character" : "characters"}
```


Insert this checkbox immediately before the empty-list/table conditional, and change that conditional to use `visibleCharacters`.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
<label className="management-summary">
                <input
                    type="checkbox"
                    checked={includeOtherUniverses}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                        setIncludeOtherUniverses(event.target.checked)
                    }
                />
                {" Include other characters in this franchise"}
            </label>

            {visibleCharacters.length === 0 ? (
```


Replace the old empty-list message.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
No characters match this view. Include other universes to find more.
```


Render `visibleCharacters` in the table.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
{visibleCharacters.map((character) => {
```


Add the origin column after Real name.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
<th scope="col">Real name</th>
                                <th scope="col">Origin universe</th>
```


Add the matching body cell in the same position.

File: [src/pages/CharactersPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/CharactersPage.tsx).
```tsx
<td>{character.real_name ?? "?"}</td>
                                        <td>{formatUniverseLabel(
                                            character.origin_universe_id,
                                            universes
                                        )}</td>
```


Update the Characters page description so it includes visiting characters.

File: [src/App.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/App.tsx).
```tsx
description = `Manage characters and their visibility on ${universeName}`;
```


## 3. Show character origins on the timeline

Historical proposal below: the current implementation instead shows compact labels for visitors only. Follow the project convention that variants are versions from different universes; no same-origin variant system is planned. The next pass will replace timeline Hide controls with origin navigation. Do not infer changes to live uniqueness constraints from this historical example.

Add these two imports.

File: [src/components/timeline/CharacterRow.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/components/timeline/CharacterRow.tsx).
```tsx
import TimelineCell from "./TimelineCell";
import { useWorkspace } from "../../context/WorkspaceContext";
import { formatUniverseLabel } from "../../utils/formatUniverseLabel";
```


Add these declarations at the start of `CharacterRow`, before the existing `rowAppearances` calculation. The existing workspace context supplies the universe names; no new provider is needed.

File: [src/components/timeline/CharacterRow.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/components/timeline/CharacterRow.tsx).
```tsx
const { universes, selectedUniverseId } = useWorkspace();
    const isVisitor = character.origin_universe_id !== selectedUniverseId;
    const originLabel = formatUniverseLabel(
        character.origin_universe_id,
        universes
    );
```


Replace only the alias span. Keep the existing Hide button and appearance cells. The text identifies origin without depending on colour alone.

File: [src/components/timeline/CharacterRow.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/components/timeline/CharacterRow.tsx).
```tsx
<span>
                    <span>{character.alias}</span>
                    <small
                        className={isVisitor
                            ? "character-origin character-origin-visitor"
                            : "character-origin"}
                    >
                        {isVisitor ? "From " : ""}{originLabel}
                    </small>
                </span>
```


Append these rules to [src/styles/timeline.css](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/styles/timeline.css).
```css
.character-origin {
    display: block;
    margin-top: 3px;
    color: var(--color-secondary);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.3;
}

.character-origin-visitor {
    color: #9ccaff;
}
```


## 4. Link existing projects without copying or changing them

The picker will offer projects whose primary universe belongs to the selected franchise and which are not already in this timeline. It includes projects with no timeline memberships, so those records remain reachable through their primary universe. Adding puts the project at the end; use the existing Edit → Position control to move it.

Run this function definition in Supabase and save the file for reference. It only inserts a timeline link. Locking the universe prevents two simultaneous additions from choosing the same position; `on conflict` makes a repeated request harmless. The existing character/project deletion rules remain intact.

Create [supabase/link-project-to-universe.sql](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/supabase/link-project-to-universe.sql).
```sql
create or replace function public.link_project_to_universe(
    p_universe_id bigint,
    p_project_id bigint
)
returns setof public.projects
language plpgsql
security invoker
set search_path = ''
as $$
begin
    -- Use the same chronology lock as save_project_in_universe.
    perform 1 from public.universes
    where id = p_universe_id
    for update;

    if not found then
        raise exception 'Universe does not exist or is unavailable.';
    end if;

    insert into public.universe_projects (
        universe_id, project_id, timeline_position
    )
    select
        p_universe_id,
        p_project_id,
        coalesce(max(timeline_position), 0) + 1
    from public.universe_projects
    where universe_id = p_universe_id
    on conflict (universe_id, project_id) do nothing;

    return query
    select p.*
    from public.projects p
    join public.universe_projects up on up.project_id = p.id
    where up.universe_id = p_universe_id
    order by up.timeline_position;
end;
$$;

revoke execute on function public.link_project_to_universe(bigint, bigint)
    from public;
grant execute on function public.link_project_to_universe(bigint, bigint)
    to anon, authenticated;
```


Append these three functions to [src/services/projects.ts](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/services/projects.ts). `unlinkProjectFromUniverse` deletes a row in the membership table, so it does not delete the project or its appearances/events.
```ts
export async function getProjectsForPrimaryUniverses(
    universeIds: number[]
): Promise<Project[]> {
    if (universeIds.length === 0) return [];

    const { data, error } = await supabase
        .from("projects")
        .select("*")
        .in("primary_universe_id", universeIds)
        .order("title")
        .order("id");

    if (error) throw error;
    return data ?? [];
}

export async function linkProjectToUniverse(
    universeId: number,
    projectId: number
): Promise<Project[]> {
    const { data, error } = await supabase.rpc(
        "link_project_to_universe",
        { p_universe_id: universeId, p_project_id: projectId }
    );

    if (error) throw error;
    return data ?? [];
}

export async function unlinkProjectFromUniverse(
    universeId: number,
    projectId: number
): Promise<void> {
    const { error } = await supabase
        .from("universe_projects")
        .delete()
        .eq("universe_id", universeId)
        .eq("project_id", projectId)
        .select("project_id")
        .single();

    if (error) throw error;
}
```


Replace the project-service import and add the universe-label import.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
import {
    deleteProject,
    getProjectsForUniverse,
    getProjectsForPrimaryUniverses,
    saveProjectInUniverse,
    linkProjectToUniverse,
    unlinkProjectFromUniverse
} from "../services/projects";
import { formatUniverseLabel } from "../utils/formatUniverseLabel";
```


Add these states beside the existing project list. `projects` is the ordered current timeline; `libraryProjects` supplies existing records from the franchise.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
const [projects, setProjects] = useState<Project[]>([]);
    const [libraryProjects, setLibraryProjects] = useState<Project[]>([]);
    const [existingProjectId, setExistingProjectId] = useState("");
    const [linking, setLinking] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);
```


Rename `deletingRef` to `changingRef` everywhere in this file. The same immediate lock will protect link, unlink and delete actions.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
changingRef
```


Replace `controlsDisabled` and add the derived picker list. No additional effect is needed to keep the picker in sync.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
const controlsDisabled =
        editor !== null || deletingId !== null || linking || removingId !== null;

    const availableProjects = libraryProjects.filter((project) =>
        !projects.some((linked) => linked.id === project.id)
    );
```


Replace the loading block inside `loadProjects`. These independent requests can run together.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
const [data, library] = await Promise.all([
                    getProjectsForUniverse(universeId),
                    getProjectsForPrimaryUniverses(
                        universes.map((universe) => universe.id)
                    )
                ]);

                if (cancelled) return;

                setProjects(data);
                setLibraryProjects(library);
```


Update the effect dependencies to include the franchise universe list.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
}, [universeId, universes, loadAttempt]);
```


In `handleSave`, add the library update immediately after `setProjects(orderedProjects)`. It replaces stale copies with the saved records and includes newly created projects. `Set` provides a list of IDs we have already refreshed. Keep the existing `setNotice(...)` call after this block.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
setProjects(orderedProjects);
        setLibraryProjects((current) => {
            const updatedIds = new Set(orderedProjects.map((project) => project.id));

            return [
                ...current.filter((project) => !updatedIds.has(project.id)),
                ...orderedProjects
            ].filter((project) =>
                universes.some((universe) =>
                    universe.id === project.primary_universe_id
                )
            ).sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
        });
```


After permanent deletion, also remove the project from the picker library. Replace the old deletion notice with this block.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
setLibraryProjects((current) =>
                current.filter((item) => item.id !== project.id)
            );
            setExistingProjectId("");
            setNotice(project.title + " deleted.");
```


Add these handlers before the existing `if (loading)` block. They share the same lock as deletion, and each restores its busy state in `finally`, including when the request fails.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
async function handleLinkProject() {
        if (changingRef.current || editor !== null) return;

        const project = availableProjects.find((item) =>
            item.id === Number(existingProjectId)
        );
        if (!project) return;

        changingRef.current = true;
        setLinking(true);
        setNotice(null);
        setActionError(null);

        try {
            const orderedProjects = await linkProjectToUniverse(universeId, project.id);
            setProjects(orderedProjects);
            setExistingProjectId("");
            setNotice(project.title + " added to this timeline.");
        } catch (caughtError) {
            console.error(caughtError);
            setActionError("Could not add the project to this timeline. Please try again.");
        } finally {
            changingRef.current = false;
            setLinking(false);
        }
    }

    async function handleUnlinkProject(project: Project) {
        if (changingRef.current || editor !== null) return;

        if (!window.confirm(
            'Remove "' + project.title + '" from this timeline?\n\n' +
            "The project, appearances and events stay saved. " +
            "Other timelines are unchanged. You can add the project again later."
        )) return;

        changingRef.current = true;
        setRemovingId(project.id);
        setNotice(null);
        setActionError(null);

        try {
            await unlinkProjectFromUniverse(universeId, project.id);
            setProjects((current) => current.filter((item) => item.id !== project.id));
            setNotice(project.title + " removed from this timeline.");
        } catch (caughtError) {
            console.error(caughtError);
            setActionError("Could not remove the project from this timeline. Please try again.");
        } finally {
            changingRef.current = false;
            setRemovingId(null);
        }
    }
```


Insert this separate picker form after `ProjectForm` and before the table/empty-list conditional. It uses the existing form styles; keep it outside the other form.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
<form
                className="management-form"
                aria-label="Add existing project"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleLinkProject();
                }}
            >
                <fieldset disabled={controlsDisabled}>
                    <label className="form-field">
                        <span>Add an existing project to this timeline</span>
                        <select
                            value={existingProjectId}
                            onChange={(event) => setExistingProjectId(event.target.value)}
                            disabled={availableProjects.length === 0}
                            required
                        >
                            <option value="" disabled>
                                {availableProjects.length === 0
                                    ? "No other projects in this franchise"
                                    : "Choose a project"}
                            </option>
                            {availableProjects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.title}{" — "}
                                    {formatUniverseLabel(project.primary_universe_id, universes)}
                                </option>
                            ))}
                        </select>
                        <small>
                            Adds it at the end. Use Edit to change its timeline position.
                        </small>
                    </label>
                    <div className="form-actions">
                        <button
                            type="submit"
                            className="utility-button"
                            disabled={!existingProjectId}
                        >
                            {linking ? "Adding..." : "Add to timeline"}
                        </button>
                    </div>
                </fieldset>
            </form>

            {projects.length === 0 ? (
```


Add a Primary universe column after Release date.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
<th scope="col">Release date</th>
                                <th scope="col">Primary universe</th>
```


Add the matching body cell.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
<td>{project.release_date ?? "Not set"}</td>
                                    <td>{formatUniverseLabel(
                                        project.primary_universe_id,
                                        universes
                                    )}</td>
```


Insert Remove from timeline immediately before the existing permanent Delete button. Keep the Delete button and its handler.

File: [src/pages/ProjectsPage.tsx](C:/Users/matbu/Documents/Projects/Fictional-Media-Timeline-Viewer/src/pages/ProjectsPage.tsx).
```tsx
<button
                                                type="button"
                                                className="utility-button"
                                                disabled={controlsDisabled}
                                                onClick={() => handleUnlinkProject(project)}
                                            >
                                                {removingId === project.id
                                                    ? "Removing..."
                                                    : "Remove from timeline"}
                                            </button>
```


## 5. Check the behaviour before extending it

Run the normal lint and build checks after typing the changes. Then use temporary test records where deletion is involved:

1. A universe with an originating character must refuse deletion even if that character is hidden from its timeline. A universe with a primary project must also refuse deletion even if that project has no timeline links.
2. A universe with only visiting-character or shared-project memberships must refuse deletion. After removing those memberships, an otherwise empty universe can be deleted without touching the visitors' origin records.
3. A project form has no Unassigned option. Both origin columns reject null writes in Supabase after the required-origin migration.
4. On the TVA Characters page, include other franchise characters, show an MCU character, and edit their footage appearance on the Loki column. Check that their origin label says MCU and Loki has not been added to the MCU project list.
5. Two variants with the same alias but different origins should have different secondary labels. If adding the second variant gives a duplicate error, inspect the live character unique indexes before altering any constraint; do not change IDs or create duplicate appearance records.
6. Add an existing project to a second timeline. Verify that its project ID and primary universe stay the same, then reorder it using Edit. The first timeline's order must stay unchanged.
7. Remove the project from the second timeline. Its appearances/events and first membership must remain. If you remove its last membership, it should become available in Add existing project within its primary universe's franchise; add it back to edit or permanently delete it.
8. A universe with no code still displays its name.

After this foundation is verified, address the existing overlapping cell-save issue and agree on universe-specific appearance/event behaviour before changing that data model. A character's origin is not automatically their current status: later status icons must handle death/revival and footage correctly.
