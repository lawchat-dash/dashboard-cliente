ALTER TABLE public.helena_cards
  ADD COLUMN sessions_synced boolean NOT NULL DEFAULT false;

CREATE INDEX idx_helena_cards_sessions_synced
  ON public.helena_cards (sessions_synced)
  WHERE sessions_synced = false;