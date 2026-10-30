CREATE TABLE IF NOT EXISTS central_day.management_runs (
 id text PRIMARY KEY, trigger text NOT NULL, actor_id text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, status text NOT NULL, error_code text, counts jsonb
);
CREATE TABLE IF NOT EXISTS central_day.management_snapshots (
 id text PRIMARY KEY, payload jsonb NOT NULL, content_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.management_current (
 id integer PRIMARY KEY CHECK(id=1), snapshot_id text NOT NULL REFERENCES central_day.management_snapshots(id),
 run_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.management_sources (
 key text PRIMARY KEY, kind text NOT NULL, source_data jsonb NOT NULL, present boolean NOT NULL DEFAULT true,
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.management_manual (
 key text PRIMARY KEY REFERENCES central_day.management_sources(key), fields jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1, actor_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.management_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id text, key text NOT NULL, actor_id text NOT NULL,
 kind text NOT NULL, before_data jsonb, after_data jsonb, at timestamptz NOT NULL DEFAULT now()
);
