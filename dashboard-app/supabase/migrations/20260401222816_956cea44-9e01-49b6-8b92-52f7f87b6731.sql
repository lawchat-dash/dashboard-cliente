INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access" ON storage.objects FOR SELECT USING (bucket_id = 'assets');
CREATE POLICY "Admin insert access" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'assets');