import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { formatCurrency, generateWhatsAppUrl, generateUpiUrl, getQrCodeImageUrl } from '../lib/utils';
import {
  fetchGlobalAnalytics,
  type GlobalAnalytics,
  type MemberSettlementSummary,
} from '../lib/analytics';
import {
  ArrowLeft,
  Search,
  Receipt,
  Users,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  QrCode,
  Sparkles,
  RefreshCw,
  FolderOpen,
  X
} from 'lucide-react';

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export default function Analytics() {
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hostUpi, setHostUpi] = useState<string>('host@upi');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');

  // Expanded member IDs for viewing session history
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());

  // Modal: QR Code payment view for a member
  const [qrModalMember, setQrModalMember] = useState<MemberSettlementSummary | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const analytics = await fetchGlobalAnalytics();
      setData(analytics);

      // Fetch host's default UPI ID
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('upi_id')
          .eq('id', user.id)
          .single();
        if (profile?.upi_id) {
          setHostUpi(profile.upi_id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setError(err.message || 'Failed to load settlement analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle Member Expand
  const toggleMemberExpand = (memberId: string) => {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  // Quick toggle a participant's payment status directly from the ledger
  const handleToggleParticipantPayment = async (
    participantId: string,
    currentStatusPaid: boolean,
    sessionId: string,
    shareAmount: number
  ) => {
    const newStatus = currentStatusPaid ? 'JOINED' : 'PAID';
    try {
      // 1. Update session_participants
      const { error: partErr } = await supabase
        .from('session_participants')
        .update({ status: newStatus })
        .eq('id', participantId);

      if (partErr) throw partErr;

      // 2. Persist in payments table
      if (newStatus === 'PAID') {
        await supabase
          .from('payments')
          .upsert({
            session_id: sessionId,
            participant_id: participantId,
            amount: shareAmount,
            currency: 'INR',
            status: 'SUCCESS',
            paid_at: new Date().toISOString(),
          }, { onConflict: 'session_id,participant_id' });
      } else {
        await supabase
          .from('payments')
          .update({ status: 'CANCELLED' })
          .eq('session_id', sessionId)
          .eq('participant_id', participantId);
      }

      // Reload fresh data from DB
      await loadData();
    } catch (err: any) {
      alert(`Error updating payment status: ${err.message}`);
    }
  };

  // Generate personalized WhatsApp settlement reminder for a diner
  const handleSendWhatsAppReminder = (member: MemberSettlementSummary) => {
    const pendingSessions = member.sessions.filter((s) => !s.isPaid);
    if (pendingSessions.length === 0) {
      alert(`${member.name} has already settled all bills! 🎉`);
      return;
    }

    let msg = `Hi *${member.name}*! 👋\n\n`;
    msg += `Here is your current pending settlement summary for *${member.groupName}*:\n\n`;

    pendingSessions.forEach((s) => {
      msg += `• *${s.sessionRestaurant}*: ${formatCurrency(s.shareAmount)} ⏳\n`;
    });

    msg += `\n*Total Pending: ${formatCurrency(member.totalPending)}*\n\n`;
    msg += `You can settle directly via UPI to: *${hostUpi}*\n`;
    msg += `UPI Link: ${generateUpiUrl({ upiId: hostUpi, amountInRupees: member.totalPending / 100, payeeName: 'SplitBill Settlement' })}\n\n`;
    msg += `Thank you! 🍽️`;

    const url = generateWhatsAppUrl({ phone: member.phone, message: msg });
    window.open(url, '_blank');
  };

  // Filtered member list
  const filteredMembers = useMemo(() => {
    if (!data) return [];

    return data.allMembers.filter((m) => {
      // Group filter
      if (selectedGroupId !== 'ALL' && m.groupId !== selectedGroupId) {
        return false;
      }

      // Status filter
      if (statusFilter === 'PENDING' && m.totalPending <= 0) return false;
      if (statusFilter === 'SETTLED' && m.totalPending > 0) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(term);
        const matchesPhone = m.phone ? m.phone.includes(term) : false;
        const matchesGroup = m.groupName.toLowerCase().includes(term);
        if (!matchesName && !matchesPhone && !matchesGroup) return false;
      }

      return true;
    });
  }, [data, selectedGroupId, statusFilter, searchTerm]);

  // Aggregate stats for currently filtered view
  const filteredTotals = useMemo(() => {
    let billed = 0;
    let settled = 0;
    let pending = 0;

    for (const m of filteredMembers) {
      billed += m.totalBilled;
      settled += m.totalSettled;
      pending += m.totalPending;
    }

    return { billed, settled, pending };
  }, [filteredMembers]);

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12 animate-in fade-in">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-card shadow-neu-sm hover:shadow-neu-inner text-text-secondary hover:text-text-main transition-all"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-text-main flex items-center gap-2">
                Settlements & Analytics
                <Sparkles className="h-5 w-5 text-primary" />
              </h1>
              <p className="text-xs text-text-secondary mt-0.5">
                Complete person-by-person ledger and overall expenditure analytics.
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 self-start sm:self-auto rounded-2xl bg-card px-4 py-2.5 text-xs font-bold text-text-secondary shadow-neu-sm hover:shadow-neu-inner transition-all hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Ledger</span>
          </button>
        </div>

        {/* Global Summary Cards */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Spend */}
            <div className="rounded-3xl bg-card p-5 shadow-neu-outer flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Total Spent
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Receipt className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold font-display text-text-main">
                  {formatCurrency(data.totalSpent)}
                </span>
                <p className="text-[11px] text-text-secondary mt-1">
                  Across {data.totalSessionsCount} bills in {data.totalGroupsCount} groups
                </p>
              </div>
            </div>

            {/* Total Settled */}
            <div className="rounded-3xl bg-card p-5 shadow-neu-outer flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Total Settled
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-success/15 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-bold font-display text-success">
                    {formatCurrency(data.totalSettled)}
                  </span>
                  <span className="text-xs font-bold text-success/80">
                    ({data.settlementRate}%)
                  </span>
                </div>
                <div className="w-full bg-card shadow-neu-inner rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-success h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, data.settlementRate)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Total Pending / Need to Collect */}
            <div className="rounded-3xl bg-card p-5 shadow-neu-outer flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Need to Settle
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning/15 text-warning">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold font-display text-warning">
                  {formatCurrency(data.totalPending)}
                </span>
                <p className="text-[11px] text-text-secondary mt-1">
                  Remaining amount to be collected
                </p>
              </div>
            </div>

            {/* Collection Progress & Diners */}
            <div className="rounded-3xl bg-card p-5 shadow-neu-outer flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Dining Network
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold font-display text-text-main">
                  {data.totalMembersCount} Diners
                </span>
                <p className="text-[11px] text-text-secondary mt-1">
                  Participating across all dining circles
                </p>
              </div>
            </div>

          </div>
        )}

        {/* Group Analytics Carousel / Overview */}
        {data && data.groups.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4 text-primary" />
              Groups Expenditure & Settlement Progress
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.groups.map((g) => (
                <Link
                  key={g.groupId}
                  to={`/groups/${g.groupId}`}
                  className="rounded-2xl bg-card p-4 shadow-neu-sm hover:shadow-neu-inner transition-all flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-text-main truncate">
                      {g.groupName}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-card shadow-neu-inner text-text-secondary">
                      {g.sessionsCount} bills
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-text-secondary">Total:</span>
                    <span className="font-bold text-text-main font-display">
                      {formatCurrency(g.totalSpent)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-success font-semibold">
                        Settled: {formatCurrency(g.totalSettled)}
                      </span>
                      <span className="text-warning font-semibold">
                        Owed: {formatCurrency(g.totalPending)}
                      </span>
                    </div>
                    <div className="w-full bg-card shadow-neu-inner rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, g.settlementRate)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search, Filter Bar & Controls */}
        <div className="rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search by diner name, phone, or group..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border-none bg-card py-2.5 pl-10 pr-4 text-xs font-semibold shadow-neu-inner outline-none text-text-main placeholder:text-text-secondary/60"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-main"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter by Group */}
            {data && data.groups.length > 0 && (
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="rounded-2xl border-none bg-card px-3.5 py-2.5 text-xs font-bold text-text-main shadow-neu-sm outline-none cursor-pointer"
              >
                <option value="ALL">All Groups ({data.groups.length})</option>
                {data.groups.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.groupName}
                  </option>
                ))}
              </select>
            )}

            {/* Filter by Settlement Status */}
            <div className="flex items-center rounded-2xl bg-card p-1 shadow-neu-inner text-xs font-bold">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-xl px-3 py-1.5 transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-primary text-white shadow-neu-sm'
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('PENDING')}
                className={`rounded-xl px-3 py-1.5 transition-all ${
                  statusFilter === 'PENDING'
                    ? 'bg-warning text-white shadow-neu-sm'
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setStatusFilter('SETTLED')}
                className={`rounded-xl px-3 py-1.5 transition-all ${
                  statusFilter === 'SETTLED'
                    ? 'bg-success text-white shadow-neu-sm'
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                Settled
              </button>
            </div>
          </div>
        </div>

        {/* Master Diner Settlement Ledger List */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold font-display text-text-main flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Diner Settlement Ledger ({filteredMembers.length})
            </h2>
            <div className="text-xs text-text-secondary font-semibold">
              Showing: {formatCurrency(filteredTotals.pending)} pending of {formatCurrency(filteredTotals.billed)} billed
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl bg-card p-12 text-center shadow-neu-inner flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-xs text-text-secondary font-medium">Computing live settlements across all database records...</p>
            </div>
          ) : error ? (
            <div className="rounded-3xl bg-card p-8 text-center shadow-neu-outer text-danger text-sm">
              {error}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-3xl bg-card p-10 text-center shadow-neu-inner flex flex-col items-center justify-center gap-2">
              <Users className="h-10 w-10 text-text-secondary opacity-40 mb-1" />
              <p className="font-bold text-sm text-text-main">No diners found matching criteria</p>
              <p className="text-xs text-text-secondary">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {filteredMembers.map((member) => {
                const isExpanded = expandedMemberIds.has(member.memberId);
                const isFullySettled = member.totalPending <= 0 && member.totalBilled > 0;

                return (
                  <div
                    key={`${member.groupId}-${member.memberId}`}
                    className="rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-3 transition-all hover:shadow-neu-inner-sm overflow-hidden"
                  >
                    {/* Top Tier: Diner Info & Overall Financials */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Left: Avatar & Identity */}
                      <div 
                        className="flex items-center gap-3 cursor-pointer select-none min-w-0 flex-1"
                        onClick={() => toggleMemberExpand(member.memberId)}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/40 font-brand text-2xl font-bold text-primary shadow-neu-inner-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-text-main truncate">
                              {member.name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-card shadow-neu-inner text-text-secondary shrink-0">
                              {member.groupName}
                            </span>
                          </div>
                          <div className="text-xs text-text-secondary flex items-center gap-2 mt-0.5">
                            {member.phone ? (
                              <span>📱 {member.phone}</span>
                            ) : (
                              <span className="italic opacity-60">No phone</span>
                            )}
                            <span>•</span>
                            <span>{member.sessionsCount} bill session(s)</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Balance & Status Pill */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-text-secondary/10">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-text-secondary uppercase tracking-wider block font-semibold">
                            Pending Balance
                          </span>
                          <span className={`text-lg font-bold font-display ${
                            isFullySettled ? 'text-success' : (member.totalPending > 0 ? 'text-warning' : 'text-text-main')
                          }`}>
                            {formatCurrency(member.totalPending)}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <span className={`text-xs font-bold px-3 py-1 rounded-xl shadow-neu-sm shrink-0 ${
                          isFullySettled 
                            ? 'bg-success/15 text-success border border-success/30'
                            : (member.totalPending > 0 
                                ? 'bg-warning/15 text-warning border border-warning/30'
                                : 'bg-card text-text-secondary')
                        }`}>
                          {isFullySettled 
                            ? 'All Settled ✅' 
                            : (member.totalPending > 0 ? 'Needs Settlement ⏳' : 'No Bills Yet')}
                        </span>

                        {/* Expand Chevron */}
                        <button
                          onClick={() => toggleMemberExpand(member.memberId)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl bg-card shadow-neu-sm hover:shadow-neu-inner text-text-secondary shrink-0"
                          title="View Bill Details"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>

                    </div>

                    {/* Middle Tier: Metrics Summary Bar */}
                    <div className="grid grid-cols-3 gap-2 bg-card p-2.5 rounded-2xl shadow-neu-inner text-xs">
                      <div>
                        <span className="text-[10px] text-text-secondary block">Total Billed:</span>
                        <span className="font-bold text-text-main font-display">{formatCurrency(member.totalBilled)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block">Settled (Paid):</span>
                        <span className="font-bold text-success font-display">{formatCurrency(member.totalSettled)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block">Paid Bills:</span>
                        <span className="font-bold text-text-main">{member.paidSessionsCount} / {member.sessionsCount}</span>
                      </div>
                    </div>

                    {/* Action Bar: WhatsApp Reminder & UPI QR */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {/* WhatsApp Reminder */}
                      <button
                        onClick={() => handleSendWhatsAppReminder(member)}
                        className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-success shadow-neu-sm hover:shadow-neu-inner transition-all border border-success/30"
                        title="Send WhatsApp Reminder"
                      >
                        <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                        <span>Send WhatsApp Reminder</span>
                      </button>

                      {/* Pay QR Modal Trigger */}
                      {member.totalPending > 0 && (
                        <button
                          onClick={() => setQrModalMember(member)}
                          className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-primary shadow-neu-sm hover:shadow-neu-inner transition-all"
                          title="View UPI QR Code"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>View UPI QR</span>
                        </button>
                      )}
                    </div>

                    {/* Expandable Session Breakdown */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-text-secondary/10 flex flex-col gap-2.5 animate-in fade-in">
                        <span className="text-xs font-bold text-text-main flex items-center justify-between">
                          <span>Session Breakdown & Payment Status ({member.sessions.length}):</span>
                          <span className="text-[10px] font-normal text-text-secondary">
                            Tap 'Mark Paid' or 'Unpaid' to change status
                          </span>
                        </span>

                        {member.sessions.length === 0 ? (
                          <p className="text-xs text-text-secondary italic">This member has not been added to any active bills yet.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {member.sessions.map((sess) => (
                              <div
                                key={sess.sessionId}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl bg-card p-3 shadow-neu-inner text-xs"
                              >
                                <div>
                                  <Link
                                    to={`/sessions/${sess.sessionId}`}
                                    className="font-bold text-text-main hover:text-primary transition-colors hover:underline block"
                                  >
                                    {sess.sessionRestaurant}
                                  </Link>
                                  <span className="text-[10px] text-text-secondary">
                                    {new Date(sess.sessionDate).toLocaleDateString()} • Table total: {formatCurrency(sess.grandTotal)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                  <div className="text-right">
                                    <span className="text-[10px] text-text-secondary block">Their Share:</span>
                                    <span className="font-bold text-primary font-display">{formatCurrency(sess.shareAmount)}</span>
                                  </div>

                                  <button
                                    onClick={() =>
                                      handleToggleParticipantPayment(
                                        sess.participantId,
                                        sess.isPaid,
                                        sess.sessionId,
                                        sess.shareAmount
                                      )
                                    }
                                    className={`rounded-xl px-2.5 py-1 text-xs font-bold shadow-neu-sm transition-all ${
                                      sess.isPaid
                                        ? 'bg-success text-white hover:bg-success/90'
                                        : 'bg-card text-warning shadow-neu-inner hover:bg-warning/15'
                                    }`}
                                  >
                                    {sess.isPaid ? 'Settled ✅' : 'Mark Paid?'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal: UPI QR Code for instant diner settlement */}
        {qrModalMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col items-center gap-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold font-display text-text-main text-base">
                    Settle with {qrModalMember.name}
                  </h3>
                </div>
                <button
                  onClick={() => setQrModalMember(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card shadow-neu-sm text-text-secondary hover:text-text-main"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="text-center">
                <span className="text-xs text-text-secondary">Amount to Settle:</span>
                <div className="text-3xl font-bold font-display text-primary mt-0.5">
                  {formatCurrency(qrModalMember.totalPending)}
                </div>
                <span className="text-[11px] text-text-secondary font-semibold">
                  Receiving UPI: {hostUpi}
                </span>
              </div>

              {/* QR Image */}
              <div className="p-3 bg-white rounded-2xl shadow-neu-inner">
                <img
                  src={getQrCodeImageUrl(
                    generateUpiUrl({
                      upiId: hostUpi,
                      payeeName: 'SplitBill Settlement',
                      amountInRupees: qrModalMember.totalPending / 100,
                      note: `Settlement for ${qrModalMember.groupName}`
                    }),
                    220
                  )}
                  alt="UPI QR Code"
                  className="h-48 w-48 object-contain"
                />
              </div>

              <p className="text-[11px] text-text-secondary text-center">
                Scan with any UPI app (GPay, PhonePe, Paytm) to settle the pending balance.
              </p>

              <button
                onClick={() => setQrModalMember(null)}
                className="w-full rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-neu-sm hover:bg-primary-hover transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
