-- 008_performance_and_constraints.sql
-- Performance indexes & data integrity constraints for SplitBill

-- 1. INDEXES FOR LIGHTNING-FAST QUERIES
CREATE INDEX IF NOT EXISTS idx_groups_host_id ON groups(host_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group_id ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_member_id ON session_participants(group_member_id);
CREATE INDEX IF NOT EXISTS idx_items_session_id ON items(session_id);
CREATE INDEX IF NOT EXISTS idx_item_allocations_item_id ON item_allocations(item_id);
CREATE INDEX IF NOT EXISTS idx_item_allocations_participant_id ON item_allocations(participant_id);

-- 2. VALIDATION CHECK CONSTRAINTS
DO $$
BEGIN
  -- Add session table constraints if not present
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sessions_grand_total_positive') THEN
    ALTER TABLE sessions ADD CONSTRAINT chk_sessions_grand_total_positive CHECK (grand_total >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sessions_subtotal_positive') THEN
    ALTER TABLE sessions ADD CONSTRAINT chk_sessions_subtotal_positive CHECK (subtotal >= 0);
  END IF;

  -- Add items table constraints if not present
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_items_ordered_qty_positive') THEN
    ALTER TABLE items ADD CONSTRAINT chk_items_ordered_qty_positive CHECK (ordered_quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_items_unit_price_positive') THEN
    ALTER TABLE items ADD CONSTRAINT chk_items_unit_price_positive CHECK (unit_price IS NULL OR unit_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_items_total_price_positive') THEN
    ALTER TABLE items ADD CONSTRAINT chk_items_total_price_positive CHECK (total_price IS NULL OR total_price >= 0);
  END IF;

  -- Add item_allocations constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_alloc_qty_positive') THEN
    ALTER TABLE item_allocations ADD CONSTRAINT chk_alloc_qty_positive CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_alloc_amount_positive') THEN
    ALTER TABLE item_allocations ADD CONSTRAINT chk_alloc_amount_positive CHECK (allocated_amount >= 0);
  END IF;
END $$;
