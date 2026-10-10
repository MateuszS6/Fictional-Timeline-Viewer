-- Reference snapshot, not an automatically applied migration.
-- Selected constraints/nullability reconciled with user-supplied live results
-- on 10 October 2026. Policies, indexes and other metadata are not fully exported.

create table
    franchises (
        id bigint generated always as identity primary key,
        name text not null unique
    );

create table
    universes (
        id bigint generated always as identity primary key,
        franchise_id bigint not null references franchises (id),
        name text not null,
        code text,
        unique (franchise_id, name)
    );

create table
    projects (
        id bigint generated always as identity primary key,
        title text not null constraint projects_title_key unique,
        release_date date,
        primary_universe_id bigint not null references universes (id) on delete restrict
    );

create table
    universe_projects (
        universe_id bigint not null references universes (id) on delete restrict,
        project_id bigint not null constraint timeline_projects_project_id_fkey
            references projects (id) on delete cascade,
        timeline_position integer not null constraint timeline_projects_position_check
            check (timeline_position > 0),
        primary key (universe_id, project_id),
        constraint universe_projects_position_key
            unique (universe_id, timeline_position) deferrable initially immediate
    );

create table
    characters (
        id bigint generated always as identity primary key,
        alias text not null,
        real_name text,
        origin_universe_id bigint not null references universes (id) on delete restrict
    );

create table
    appearances (
        character_id bigint not null references characters (id) on delete cascade,
        project_id bigint not null references projects (id) on delete cascade,
        appearance_type text not null default 'standard',
        is_detached boolean not null default false,
        primary key (character_id, project_id)
    );

create table
    universe_characters (
        universe_id bigint not null references universes (id) on delete restrict,
        character_id bigint not null references characters (id) on delete cascade,
        primary key (universe_id, character_id)
    );

create table
    character_events (
        id bigint generated always as identity primary key,
        character_id bigint not null references characters (id) on delete cascade,
        project_id bigint not null references projects (id) on delete cascade,
        event_type text not null check (
            event_type in ('death', 'revival', 'blip', 'return')
        ),
        event_position text not null default 'at' check (event_position in ('at', 'after')),
        unique (character_id, project_id)
    );

