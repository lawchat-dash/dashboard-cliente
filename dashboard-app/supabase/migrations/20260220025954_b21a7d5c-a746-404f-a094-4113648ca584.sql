
-- Add client_name column to helena_cards
ALTER TABLE public.helena_cards ADD COLUMN IF NOT EXISTS client_name text;

-- Add client_name column to helena_sessions
ALTER TABLE public.helena_sessions ADD COLUMN IF NOT EXISTS client_name text;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_helena_cards_client_name ON public.helena_cards (client_name);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_client_name ON public.helena_sessions (client_name);
