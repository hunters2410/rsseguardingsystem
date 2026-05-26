CREATE TABLE IF NOT EXISTS public.number_plates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_text text NOT NULL,
  camera_id uuid REFERENCES public.cameras(id) ON DELETE CASCADE,
  confidence numeric,
  snapshot_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.number_plates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to number_plates" ON public.number_plates FOR ALL USING (true);
