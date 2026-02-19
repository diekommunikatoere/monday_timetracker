-- Create monday_webhook table
CREATE TABLE IF NOT EXISTS public.monday_webhook (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES public.monday_board(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for board_id
CREATE INDEX IF NOT EXISTS idx_monday_webhook_board ON public.monday_webhook(board_id);

-- Enable RLS
ALTER TABLE public.monday_webhook ENABLE ROW LEVEL SECURITY;

-- Add RLS policies (admin only)
CREATE POLICY "Admin can do everything on monday_webhook"
    ON public.monday_webhook
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_admin = true
        )
    );

COMMENT ON TABLE public.monday_webhook IS 'Stores registered monday.com webhooks for boards.';
