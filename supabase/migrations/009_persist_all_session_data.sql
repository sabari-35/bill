-- 009_persist_all_session_data.sql
-- Move all local session state & settings completely to Supabase DB

-- 1. Ensure sessions table stores host UPI ID and custom tax percentage in DB
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS host_upi_id TEXT DEFAULT 'host@upi',
ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) DEFAULT 5.0;

-- 2. Store default UPI ID on host user profile in DB
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- 3. Ensure payments table has a unique constraint for (session_id, participant_id) for safe upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_payments_session_participant'
  ) THEN
    ALTER TABLE payments ADD CONSTRAINT uq_payments_session_participant UNIQUE (session_id, participant_id);
  END IF;
END $$;

-- 4. Enable full CRUD policies on payments for hosts and participants
DROP POLICY IF EXISTS "Hosts can manage payments" ON payments;
CREATE POLICY "Hosts can manage payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = payments.session_id AND sessions.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = payments.session_id AND sessions.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can insert payments" ON payments;
CREATE POLICY "Participants can insert payments"
  ON payments FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants can update payments" ON payments;
CREATE POLICY "Participants can update payments"
  ON payments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 5. Ensure hosts can update all fields of their sessions (subtotal, tax_total, tax_percent, service_charge, discount, grand_total, host_upi_id)
DROP POLICY IF EXISTS "Hosts can update their sessions" ON sessions;
CREATE POLICY "Hosts can update their sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- 6. Ensure participants and hosts can update participant status (e.g., PAID, JOINED)
DROP POLICY IF EXISTS "Participants and hosts can update participant status" ON session_participants;
CREATE POLICY "Participants and hosts can update participant status"
  ON session_participants FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 7. Performance indexes
CREATE INDEX IF NOT EXISTS idx_sessions_host_upi ON sessions(host_upi_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_participant ON payments(session_id, participant_id);

