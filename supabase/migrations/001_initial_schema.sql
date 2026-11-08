-- 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. GROUPS
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL,
    restaurant_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. GROUP MEMBERS
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    user_id UUID REFERENCES profiles(id), -- Optional: if member has a registered account
    status TEXT NOT NULL DEFAULT 'INVITED', -- INVITED, JOINED, ACTIVE, LEFT
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SESSIONS
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES profiles(id),
    restaurant_name TEXT,
    table_number TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, OPEN, LOCKED, PRICED, PAYMENT_OPEN, PARTIALLY_PAID, PAID, COMPLETED, CANCELLED
    subtotal BIGINT NOT NULL DEFAULT 0, -- Stored in paise
    tax_total BIGINT NOT NULL DEFAULT 0,
    service_charge BIGINT NOT NULL DEFAULT 0,
    discount BIGINT NOT NULL DEFAULT 0,
    round_off BIGINT NOT NULL DEFAULT 0,
    grand_total BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 5. SESSION PARTICIPANTS
CREATE TABLE session_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    group_member_id UUID NOT NULL REFERENCES group_members(id),
    status TEXT NOT NULL DEFAULT 'JOINED',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ITEMS
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    ordered_quantity INTEGER NOT NULL DEFAULT 1,
    unit_price BIGINT, -- Can be NULL initially
    total_price BIGINT,
    price_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PRICED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. ITEM ALLOCATIONS
CREATE TABLE item_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    split_type TEXT NOT NULL DEFAULT 'EQUAL', -- EQUAL, CUSTOM, EXACT
    share_percentage NUMERIC(5,2),
    allocated_amount BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. PAYMENTS
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES session_participants(id),
    amount BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    cashfree_order_id TEXT,
    cashfree_payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'CREATED', -- CREATED, PENDING, SUCCESS, FAILED, CANCELLED, REFUNDED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

-- 9. PAYMENT EVENTS (Webhooks)
CREATE TABLE payment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. INVITE TOKENS
CREATE TABLE invite_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES session_participants(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    session_id UUID REFERENCES sessions(id),
    action TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
