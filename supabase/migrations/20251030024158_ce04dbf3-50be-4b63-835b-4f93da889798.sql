-- Create messages table for chat between companies and officers
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES officer_profiles(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('company', 'officer')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Companies can view and send messages for their conversations
CREATE POLICY "Companies can manage their messages"
ON public.messages
FOR ALL
USING (
  company_id IN (
    SELECT id FROM company_profiles WHERE user_id = auth.uid()
  )
);

-- Officers can view and send messages for their conversations
CREATE POLICY "Officers can manage their messages"
ON public.messages
FOR ALL
USING (
  officer_id IN (
    SELECT id FROM officer_profiles WHERE user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_messages_company_officer ON public.messages(company_id, officer_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_messages_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Add status column to job_postings if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'job_postings' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.job_postings 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'pending', 'filled'));
  END IF;
END $$;