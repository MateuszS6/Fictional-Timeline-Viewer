import { useEffect, useRef, useState } from "react";
import { deleteProject, getProjectsForPrimaryUniverses, getProjectsForUniverse, linkProjectToUniverse, saveProjectInUniverse, unlinkProjectToUniverse } from "../services/projects";
import type { Project, ProjectInput } from "../types/project";
import { useWorkspace } from "../context/WorkspaceContext";
import ProjectForm from "../components/projects/ProjectForm";
import { formatUniverseLabel } from "../utils/formatUniverseLabel";

interface ProjectsPageProps {
    universeId: number;
}

export default function ProjectsPage({
    universeId
}: ProjectsPageProps) {
    const { universes } = useWorkspace();

    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

    const [editor, setEditor] = useState<Project | "new" | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const [libraryProjects, setLibraryProjects] = useState<Project[]>([]);
    const [existingProjectId, setExistingProjectId] = useState("");
    const [linking, setLinking] = useState(false);
    const [removingId, setRemovingId] = useState<number | null>(null);

    const [deletingId, setDeletingId] = useState<number | null>(null);
    const changingRef = useRef(false);

    const controlsDisabled =
        editor !== null ||
        deletingId !== null ||
        linking ||
        removingId !== null;

    const availableProjects = libraryProjects.filter((project) =>
        !projects.some((linked) => linked.id === project.id)
    );

    useEffect(() => {
        let cancelled = false;

        async function loadProjects() {
            try {
                const [data, library] = await Promise.all([
                    getProjectsForUniverse(universeId),
                    getProjectsForPrimaryUniverses(
                        universes.map((universe) => universe.id)
                    )
                ]);

                if (cancelled) return;

                setProjects(data);
                setLibraryProjects(library);
            } catch (error) {
                if (cancelled) return;

                console.error(error);
                setError("Could not load projects.")
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadProjects();

        return () => {
            cancelled = true;
        }
    }, [universeId, universes, loadAttempt])

    function retry() {
        setError(null);
        setLoading(true);
        setLoadAttempt((current) => current + 1);
    }

    function openEditor(value: Project | "new") {
        setNotice(null);
        setActionError(null);
        setEditor(value);
    }

    async function handleSave(
        input: ProjectInput,
        position: number
    ): Promise<void> {
        if (editor === null) throw new Error("No project editor is open.")

        const orderedProjects = await saveProjectInUniverse(
            universeId,
            editor === "new" ? null : editor.id,
            input,
            position
        );

        setProjects(orderedProjects);

        setLibraryProjects((current) => {
            const updatedIds = new Set(
                orderedProjects.map((project) => project.id)
            );

            return [
                ...current.filter((project) => !updatedIds.has(project.id)),
                ...orderedProjects
            ].filter((project) =>
                universes.some((universe) =>
                    universe.id === project.primary_universe_id
                )
            ).sort((a, b) =>
                a.title.localeCompare(b.title) || a.id - b.id
            );
        });

        setNotice(`${input.title} saved at position ${position}.`);
        setEditor(null);
    }

    async function handleDelete(project: Project) {
        if (changingRef.current || editor !== null) return;

        const confirmed = window.confirm(
            `Permanently delete "${project.title}"?\n\n` +
            "This removes the project from every universe and deletes " +
            "all appearances and character events attached to it.\n\n" +
            "This cannot be undone."
        );

        if (!confirmed) return;

        changingRef.current = true;
        setDeletingId(project.id);
        setActionError(null);
        setNotice(null);

        try {
            await deleteProject(project.id);

            setProjects((current) =>
                current.filter((item) => item.id !== project.id)
            );

            setLibraryProjects((current) =>
                current.filter((item) => item.id !== project.id)
            );

            setExistingProjectId("");
            setNotice(`${project.title} deleted.`)
        } catch (caughtError) {
            console.error(caughtError);
            setActionError("Could not delete the project. Please try again.");
        } finally {
            changingRef.current = false;
            setDeletingId(null);
        }
    }

    async function handleLinkProject() {
        if (changingRef.current || editor !== null) return;

        const project = availableProjects.find((item) =>
            item.id === Number(existingProjectId)
        );

        if (!project) return;

        changingRef.current = true
        setLinking(true);
        setNotice(null);
        setActionError(null);

        try {
            const orderedProjects = await linkProjectToUniverse(
                universeId,
                project.id
            );

            setProjects(orderedProjects);
            setExistingProjectId("");
            setNotice(`${project.title} added to this timeline.`);
        } catch (caughtError) {
            console.error(caughtError);
            setActionError(
                "Could not add the project to this timeline. Please try again."
            );
        } finally {
            changingRef.current = false;
            setLinking(false);
        }
    }

    async function handleUnlinkProject(project: Project) {
        if (changingRef.current || editor !== null) return;

        const confirmed = window.confirm(
            `Remove "${project.title}" from this timeline?\n\n` +
            "The project, appearances and events stay saved. " +
            "Other timelines are unchanged. You can add the project again later."
        );

        if (!confirmed) return;

        changingRef.current = true;
        setRemovingId(project.id);
        setNotice(null);
        setActionError(null);

        try {
            await unlinkProjectToUniverse(universeId, project.id);

            setProjects((current) =>
                current.filter((item) => item.id !== project.id)
            );

            setNotice(`${project.title} removed from this timeline.`);
        } catch (caughtError) {
            console.error(caughtError);
            setActionError(
                "Could not remove the project from this timeline. Please try again."
            );
        } finally {
            changingRef.current = false;
            setRemovingId(null);
        }
    }

    if (loading) {
        return (
            <p className="status-message" role="status">
                Loading projects...
            </p>
        )
    }

    if (error) {
        return (
            <div className="status-message status-error" role="alert">
                <p>{error}</p>
                <button
                    type="button"
                    className="utility-button"
                    onClick={retry}
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <section className="management-page" aria-label="Projects">
            <div className="management-toolbar">
                <p className="management-summary">
                    {projects.length}{" "}
                    {projects.length === 1 ? "project" : "projects"}
                    {" · In chronological order"}
                </p>

                <button
                    type="button"
                    className="utility-button"
                    disabled={controlsDisabled}
                    onClick={() => openEditor("new")}
                >
                    Add project
                </button>
            </div>

            {notice && (
                <p className="management-notice" role="status">
                    {notice}
                </p>
            )}

            {actionError && (
                <p className="form-error" role="alert">
                    {actionError}
                </p>
            )}

            {editor !== null && (
                <ProjectForm
                    key={editor === "new" ? "new" : editor.id}
                    project={editor === "new" ? null : editor}
                    universeId={universeId}
                    universes={universes}
                    initialPosition={
                        editor === "new"
                            ? projects.length + 1
                            : projects.findIndex(
                                (project) => project.id === editor.id
                            ) + 1
                    }
                    maxPosition={
                        editor === "new"
                            ? projects.length + 1
                            : projects.length
                    }
                    onSave={handleSave}
                    onCancel={() => setEditor(null)}
                />
            )}

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
                                    {project.title}{" - "}
                                    {formatUniverseLabel(
                                        project.primary_universe_id,
                                        universes
                                    )}
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
                <p className="status-message">
                    No projects are linked to this universe.
                </p>
            ) : (
                <div className="management-table-container">
                    <table className="management-table">
                        <thead>
                            <tr>
                                <th scope="col">Order</th>
                                <th scope="col">Project</th>
                                <th scope="col">Release date</th>
                                <th scope="col">Primary universe</th>
                                <th scope="col">Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {projects.map((project, index) => (
                                <tr key={project.id}>
                                    <td>{index + 1}</td>
                                    <td>{project.title}</td>
                                    <td>{project.release_date ?? "Not set"}</td>
                                    <td>
                                        {formatUniverseLabel(project.primary_universe_id, universes)}
                                    </td>

                                    <td>
                                        <div className="management-row-actions">
                                            <button
                                                type="button"
                                                className="utility-button"
                                                disabled={controlsDisabled}
                                                aria-label={`Edit ${project.title}`}
                                                onClick={() => openEditor(project)}
                                            >
                                                Edit
                                            </button>

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

                                            <button
                                                type="button"
                                                className="utility-button utility-button-danger"
                                                disabled={controlsDisabled}
                                                aria-label={`Delete ${project.title}`}
                                                onClick={() => handleDelete(project)}
                                            >
                                                {deletingId === project.id
                                                    ? "Deleting..."
                                                    : "Delete"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}