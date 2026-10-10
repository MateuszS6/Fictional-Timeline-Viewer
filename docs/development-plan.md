# Timeline Studio development plan

Updated 10 October 2026 after reviewing the current source, supplied live DB results and the MCU/TVA clarification. This distinguishes verified current behaviour from code proposed in chat but not yet applied.

## Working agreement

- Keep implementation instructions, code and concise learning explanations in chat. The user applies application and database changes. Documentation can be updated directly when requested.
- Put clarification questions in the final chat response so the user can answer in a later message at their own pace. Do not use disappearing question prompts for this workflow.
- Finish the required functionality before adding extras. Clarify behaviour where it changes the data model or persistent timeline membership.
- Supabase is the source of truth. `docs/supabase/schema.sql` and `docs/supabase/functions.sql` are user-maintained reference snapshots, not confirmed live exports or an automatically applied migration system.

## Current baseline

- Franchise/universe management and character/project create, edit and delete controls are implemented.
- Required character/project origins, required universe names, nullable universe codes, and RESTRICT on all four universe references are confirmed by the user's live DB results on 10 October. Normal deletion must preserve those protections.
- The character manager can include other characters within the selected franchise and use Show/Hide to change selected-timeline membership independently of origin.
- Existing projects can be added to a timeline, reordered, removed from that timeline, or permanently deleted everywhere. The existing-project picker also includes projects without timeline memberships when their primary universe belongs to the selected franchise.
- The user implemented compact origin labels for visiting characters only, preferring code to name, and added a shared link-colour variable. Timeline Hide controls still exist; the user now wants them removed.
- Appearance types are standard, flashback and footage. Events are death, revival, blip and return, at or after a project.
- Timeline rows come from explicit `universe_characters` membership. Projects come from `universe_projects`. Character origin does not filter a visitor out of the selected timeline.
- Current source passes lint and both TypeScript configurations in the 10 October review. No live DB queries/writes or interactive browser tests were performed. Proposed source changes are checked separately before delivery; they are not the current implementation.

## Product rules and clarifications

- Keep universe identity separate from official naming/designation. A universe record is still required for an origin even if its official name/code is unknown, absent or the universe is destroyed in the story.
- Universe name remains a required local display label; code remains optional. Use Main Continuity where suitable, or a code as the local name when there is no official name. Do not introduce nullable names. Compact visitor labels prefer code; local names remain useful in headings and selectors.
- Compact visitor labels should prefer a nonblank code, then a nonblank name, then a readable fallback. Longer names can be exposed in a tooltip/accessibility label when navigation is added.
- Follow the user's definition of variants: versions of a character from different universes. Do not introduce a same-origin variant model. Each database record still has its own ID; do not infer a new uniqueness constraint or a numerical cap from this definition alone.
- Preserve the MCU/TVA example: MCU-origin characters can appear as footage in Loki on the TVA timeline without adding Loki to the MCU timeline. Franchise membership does not imply inclusion in every universe chronology.
- Keep the existing shared character-project appearance/event model for simplicity. Linking one project to multiple timelines shares its appearances and events; its order can differ in each timeline. Edits to a cell affect every linked timeline where that character's row is visible. Do not add per-universe appearance tables or duplicate projects solely for this.
- Desired row behaviour is participation in selected projects, not arbitrary visitor membership. The current code still uses universe_characters; the screenshot is not evidence of automatic participation. Before replacing Show/Hide, confirm the proposed first-appearance workflow: Edit on timeline opens a temporary row, then saved appearances/events determine ordinary inclusion. Include event-only characters. Groups/sorting/filtering are for later; they must not be implemented as hidden canonical data.
- Origin links should reveal/focus a missing or hidden destination row only for the visit. They must not insert appearances, link projects, change character identity or persist visibility. When no projects exist, explain that a project must be added first.
- Normal universe deletion must be blocked by originating characters, primary projects and character/project timeline memberships. Repair any older missing origins using their actual universe; do not guess assignments or silently delete retained records.
- Force deletion remains deferred. If introduced, define its scope explicitly and preserve visitors/shared records based elsewhere. Deleting an originating record can affect other timelines and must be explained.

## Review results and remaining decisions

- Confirmed live: projects_title_key is UNIQUE(title); release_date has no uniqueness constraint in the supplied results; universe_projects_position_key is UNIQUE(universe_id, timeline_position) DEFERRABLE. The snapshot now names that position constraint so it matches the reorder function. No live schema change is needed for these confirmations.
- Origin NOT NULL declarations were already updated by the user. The compact label helper, project-removal quote and character ID sorting tie-breaker are also fixed in current source.
- The supplied character constraints do not list an alias uniqueness constraint. Standalone unique indexes were not inspected in this review; do not invent a uniqueness rule or conclude that all indexes are absent.
- Remaining cell bug: overlapping event-type/position saves can resend an old value. The chat proposal uses one pending-write guard for the displayed timeline and disables cell/editor actions until the write finishes. This is not a multi-user concurrency system.
- Timeline origin navigation is proposed within the selected franchise, matching the existing management scope. A missing/out-of-franchise origin must have a disabled, explained label rather than silently selecting an unavailable universe.
- The user is undecided about retaining Show/Hide. This chat pass removes only the timeline Hide/Undo UI; character-page Show/Hide and universe_characters remain. Ask in normal chat before removing persistent selection behaviour or its table.
- If automatic participation is approved, replace membership reads with IDs from appearances and events in the selected projects, keep first-appearance editing possible, and deal explicitly with obsolete universe_characters references. Its RESTRICT FK can otherwise block deletion of an empty universe. Do not silently drop the table or delete stored visibility choices.

## Next passes, in order

### 1. Finish multiverse appearances and origin navigation

- Keep shared character-project appearances/events and existing project linking/reordering/unlinking. No new tables for the MCU/TVA/Doomsday examples.
- Apply the chat proposal: replace timeline Hide with a compact origin link, open the selected origin timeline and focus the same character ID, temporarily include a hidden row, tidy the cramped name layout, and prevent overlapping timeline saves.
- The user applies this source code manually. Confirm implementation and run the acceptance checks before marking this pass complete.
- Resolve automatic participation versus existing Show/Hide with the user, then implement the chosen row selection and first-appearance editing path together.
- Acceptance checks: TVA footage remains absent from MCU without a Loki column; follow an MCU visitor to their MCU row without a new DB write; a hidden row opens for that visit; leaving/re-entering normally restores saved visibility; a code-less origin uses its name; an empty origin timeline explains the missing projects; same-alias characters retain distinct IDs.
- Link one test project to two timelines and confirm shared cells, independent order and non-destructive unlinking. Slow or failed cell saves must not admit duplicate/stale edits, and controls must recover after failure.

### 2. Appearance/event types and lifeline/status behaviour

- Agree on the concrete types needed from the previous spreadsheet workflow, then update types, live database accepted values, editor options and marker visuals together.
- Decide which properties may coexist on one appearance before expanding the current single appearance-type field. Avoid treating a visual label as proof of life/status.
- Add a small status indicator beside the name: cross for deceased, question mark for unknown, no icon otherwise. Agree on the status source/derivation; footage, flashbacks, missing appearances and revival must be handled deliberately.
- Revisit presumed ongoing continuity and the latest lifeline connector once status/event semantics are settled.

### 3. Functional and visual refinement

- Refine icons, marker shapes, colours, spacing, compact labels, focus/hover feedback, editor positioning and narrow-screen behaviour around the completed functionality.
- Revisit grouping, sorting and filtering for hundreds of characters when the user defines the desired controls; do not expand this multiverse pass with them.
- Check missing/empty/error cases and keyboard access for the existing editor/navigation controls.
- Test a small representative set of timelines and correct issues before bulk population. Avoid adding unrelated features during this refinement pass.

### 4. People, crew, and credits

- Retain the previously requested people/crew/credits work after the timeline and multiverse functionality. Use the smallest useful contributor/role/project model when this pass begins.

### Population and public release

- The user's immediate aim is to finish multiverse support, appearance/event functionality and functional/visual refinement before bulk timeline population and outreach.
- Before public deployment/outreach, replace the current public write policies with appropriate editor/viewer access and verify database/RPC permissions.

## Reference maintenance

- Keep schema/function snapshots under `docs/supabase`. Prefer a schema export to manually reconstructing constraints, indexes, functions and policies.
- Optional later improvement: a project-scoped, read-only Supabase MCP connection can expose live metadata for review. No such database-inspection connection is available in this chat currently.
- `cross-universe-pass-guide.md` is historical material from 8 October. The current source, this plan and the latest chat decisions take precedence; implementation instructions remain in chat.

