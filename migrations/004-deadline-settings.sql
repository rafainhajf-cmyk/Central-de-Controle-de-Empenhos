CREATE TABLE IF NOT EXISTS central_day.settings (
 key text PRIMARY KEY,
 value jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1,
 actor_id text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
