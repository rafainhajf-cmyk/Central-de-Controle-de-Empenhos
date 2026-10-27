-- Proposta de estrutura; não executada automaticamente.
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_user_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS app_user_sessions_user_id ON app_user_sessions(user_id);
