-- Stores only a random one-time nonce and delivery status, never report text or personal data.
CREATE TABLE public.owner_report_deliveries (
  nonce uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'uncertain')),
  sent_parts integer NOT NULL DEFAULT 0 CHECK (sent_parts >= 0)
);
ALTER TABLE public.owner_report_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_report_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_report_deliveries TO service_role;
COMMENT ON TABLE public.owner_report_deliveries IS 'One-time manual owner report delivery claims. No automatic jobs and no report contents.';
