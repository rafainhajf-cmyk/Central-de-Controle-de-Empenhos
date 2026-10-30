CREATE TABLE IF NOT EXISTS central_day.admin_credentials (
 user_id text PRIMARY KEY REFERENCES central_day.profiles(user_id),
 password_hash text NOT NULL,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS central_day.admin_sessions (
 token_hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES central_day.admin_credentials(user_id),
 credential_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON central_day.admin_sessions(expires_at);
