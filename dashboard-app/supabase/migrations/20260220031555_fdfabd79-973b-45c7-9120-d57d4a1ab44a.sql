
-- Add client_level column for attention tags (1=Verde, 2=Laranja, 3=Vermelho)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_level integer NOT NULL DEFAULT 1;

-- Add constraint for valid levels
CREATE OR REPLACE FUNCTION public.validate_client_level()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_level NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'client_level must be 1, 2, or 3';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER check_client_level
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.validate_client_level();
