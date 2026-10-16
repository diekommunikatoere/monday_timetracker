-- Migration: 045_app_settings.sql
-- Description: Generic key/value app settings (jsonb). First consumer: Sentinel
-- (key 'sentinel' — Valve interval and open/closed state).
--
-- Service-role only (same threat model as 034/036/043: the anon key ships in the browser
-- bundle, so RLS-on-with-no-policies + revoked table privileges is the only acceptable posture).

CREATE TABLE IF NOT EXISTS public.app_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_by  uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

COMMENT ON TABLE public.app_settings IS 'Key/value app settings (jsonb), service-role only. Keys: sentinel.';

INSERT INTO public.app_settings (key, value)
VALUES ('sentinel', '{"intervalSeconds": 60, "valveOpen": true}')
ON CONFLICT (key) DO NOTHING;
