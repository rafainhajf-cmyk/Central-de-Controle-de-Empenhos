CREATE TABLE IF NOT EXISTS central_day.financial_books (
 key text PRIMARY KEY REFERENCES central_day.management_sources(key),
 version integer NOT NULL CHECK(version > 0), state jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.financial_operations (
 id uuid PRIMARY KEY, key text NOT NULL REFERENCES central_day.management_sources(key),
 actor_id text NOT NULL, command_hash text NOT NULL, result jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.financial_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation_id uuid NOT NULL UNIQUE REFERENCES central_day.financial_operations(id),
 key text NOT NULL REFERENCES central_day.management_sources(key),
 actor_id text NOT NULL, actor_name text NOT NULL, sector text NOT NULL,
 action text NOT NULL, note text NOT NULL, command jsonb NOT NULL,
 before_data jsonb NOT NULL, after_data jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_events_key ON central_day.financial_events(key,id DESC);
