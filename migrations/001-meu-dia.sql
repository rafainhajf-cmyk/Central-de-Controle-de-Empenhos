CREATE SCHEMA central_day;
CREATE TABLE central_day.schema_version (version integer PRIMARY KEY, fingerprint text NOT NULL);
CREATE TABLE central_day.profiles (
 user_id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 role text NOT NULL CHECK (role IN ('admin','manager','sector-lead','operator')),
 sectors text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true, sessions_valid_after timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_day.profile_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text NOT NULL,
 target_id text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_day.activities (
 id uuid PRIMARY KEY, source_key text NOT NULL UNIQUE, source jsonb NOT NULL,
 rule text NOT NULL, rule_version integer NOT NULL, subject text NOT NULL,
 reference text NOT NULL DEFAULT '', ug text, exercise integer, sector text,
 assignee_id text REFERENCES central_day.profiles(user_id), priority integer NOT NULL DEFAULT 3,
 due_on date, state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','in-progress','waiting','completed')),
 next_action text NOT NULL DEFAULT '', issues jsonb NOT NULL DEFAULT '[]',
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_scope ON central_day.activities (sector,assignee_id,state,due_on);
CREATE TABLE central_day.events (
 id uuid PRIMARY KEY, operation_id uuid NOT NULL UNIQUE, activity_id uuid NOT NULL REFERENCES central_day.activities(id),
 actor_id text NOT NULL REFERENCES central_day.profiles(user_id), actor_name text NOT NULL,
 sector text, assignee_id text, action text NOT NULL, note text NOT NULL,
 before_data jsonb, after_data jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_period ON central_day.events (at,sector);
CREATE TABLE central_day.operations (
 id uuid PRIMARY KEY, actor_id text NOT NULL, command_hash text NOT NULL,
 activity_id uuid REFERENCES central_day.activities(id), result jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_day.calendar (
 day date PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('national','local')), label text NOT NULL,
 actor_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_day.calendar_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_day.login_limits (bucket text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL);
