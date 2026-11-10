import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { formatCurrency, generateWhatsAppUrl } from '../lib/utils';
import { 
  ArrowLeft, 
  UserPlus, 
  Trash2, 
  Users, 
  Receipt, 
  Play, 
  Utensils, 
  Calendar, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Phone,
  Edit2,
  Check,
  X,
  BookOpen,
  Plus,
  BarChart3,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { fetchGroupAnalytics, type GroupAnalytics, type MemberSettlementSummary } from '../lib/analytics';
import { generateUpiUrl } from '../lib/utils';

interface Group {
  id: string;
  name: string;
  restaurant_name: string | null;
  created_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  name: string;
  phone: string | null;
  status: string;
  created_at: string;
}

interface Session {
  id: string;
  status: string;
  restaurant_name: string | null;
  grand_total: number;
  created_at: string;
}

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export default function GroupMembers() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group Analytics & Settlement states
  const [groupAnalytics, setGroupAnalytics] = useState<GroupAnalytics | null>(null);
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());
  const [hostUpi, setHostUpi] = useState<string>('host@upi');

  // New member form
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Frequent dining friends across other groups for fast 1-click addition
  const [frequentFriends, setFrequentFriends] = useState<{ name: string; phone: string | null }[]>([]);

  // Inline editing of phone number
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');

  // Start Session with Session Name Modal
  const [isStartSessionModalOpen, setIsStartSessionModalOpen] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionRestaurant, setSessionRestaurant] = useState('');
  const [sessionTable, setSessionTable] = useState('');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(new Set());
  const [startingSession, setStartingSession] = useState(false);

  // Check if browser supports Contact Picker API
  const isContactPickerSupported = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  const fetchGroupDetails = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch group
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupError) throw groupError;
      setGroup(groupData);

      // Fetch group members
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (membersError) throw membersError;
      const mems = membersData || [];
      setMembers(mems);
      setSelectedAttendeeIds(new Set(mems.map((m) => m.id)));

      // Fetch past sessions for this group
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);

      // Load group settlement analytics & host profile
      try {
        const analytics = await fetchGroupAnalytics(groupId);
        setGroupAnalytics(analytics);
      } catch (aErr) {
        console.warn('Failed to calculate group analytics:', aErr);
      }

      // Pull other frequent friends across groups to enable 1-click add
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('upi_id').eq('id', user.id).single();
        if (profile?.upi_id) setHostUpi(profile.upi_id);

        const { data: allMembersData } = await supabase
          .from('group_members')
          .select('name, phone')
          .neq('group_id', groupId)
          .limit(20);

        if (allMembersData) {
          // Deduplicate
          const currentNames = new Set(mems.map((m) => m.name.toLowerCase()));
          const unique: { name: string; phone: string | null }[] = [];
          const seen = new Set<string>();

          for (const item of allMembersData) {
            const key = item.name.toLowerCase();
            if (!currentNames.has(key) && !seen.has(key)) {
              seen.add(key);
              unique.push(item);
            }
          }
          setFrequentFriends(unique.slice(0, 6));
        }
      }
    } catch (err: any) {
      console.error('Error fetching group details:', err);
      setError(err.message || 'Failed to load group details.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  // Direct Phone Contacts Picker
  const handleSelectFromPhoneContacts = async () => {
    if (!isContactPickerSupported) {
      alert('Contact Picker API is supported in mobile Chrome/Safari. On desktop, please use the input below or select from frequent friends!');
      return;
    }

    try {
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
      if (contacts && contacts.length > 0) {
        const rowsToAdd = contacts.map((c: any) => ({
          group_id: groupId,
          name: (c.name && c.name[0]) ? c.name[0] : 'Contact',
          phone: (c.tel && c.tel[0]) ? c.tel[0].replace(/\D/g, '') : null,
          status: 'JOINED',
        }));

        const { data, error } = await supabase.from('group_members').insert(rowsToAdd).select();
        if (error) throw error;
        if (data) {
          setMembers((prev) => [...prev, ...data]);
          showNotification(`Added ${data.length} contact(s) directly from phone! 📱`);
        }
      }
    } catch (err: any) {
      // User cancelled picker or error
      if (err.name !== 'AbortError') {
        console.warn('Contacts selection error:', err);
      }
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim() || !groupId) return;

    setAddingMember(true);
    try {
      const { data, error: insertError } = await supabase
        .from('group_members')
        .insert([
          {
            group_id: groupId,
            name: memberName.trim(),
            phone: memberPhone.trim() || null,
            status: 'JOINED',
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        setMembers((prev) => [...prev, data]);
        setSelectedAttendeeIds((prev) => new Set([...prev, data.id]));
        setMemberName('');
        setMemberPhone('');
        showNotification(`${data.name} added to group!`);
      }
    } catch (err: any) {
      alert(`Error adding member: ${err.message}`);
    } finally {
      setAddingMember(false);
    }
  };

  const toggleMemberExpand = (memberId: string) => {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleToggleMemberSessionPayment = async (
    participantId: string,
    currentStatusPaid: boolean,
    sessionId: string,
    shareAmount: number
  ) => {
    const newStatus = currentStatusPaid ? 'JOINED' : 'PAID';
    try {
      await supabase
        .from('session_participants')
        .update({ status: newStatus })
        .eq('id', participantId);

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

      await fetchGroupDetails();
      showNotification('Payment status updated! ✅');
    } catch (err: any) {
      alert(`Error updating payment: ${err.message}`);
    }
  };

  const handleSendMemberWhatsAppReminder = (memberSummary: MemberSettlementSummary) => {
    const pendingSessions = memberSummary.sessions.filter((s) => !s.isPaid);
    if (pendingSessions.length === 0) {
      handleSendWhatsAppGreeting({ 
        id: memberSummary.memberId, 
        name: memberSummary.name, 
        phone: memberSummary.phone, 
        group_id: groupId || '', 
        status: 'JOINED', 
        created_at: '' 
      });
      return;
    }

    let msg = `Hi *${memberSummary.name}*! 👋\n\n`;
    msg += `Here is your pending bill settlement for *${group?.name || 'our group'}*:\n\n`;

    pendingSessions.forEach((s) => {
      msg += `• *${s.sessionRestaurant}*: ${formatCurrency(s.shareAmount)} ⏳\n`;
    });

    msg += `\n*Total Pending: ${formatCurrency(memberSummary.totalPending)}*\n\n`;
    msg += `You can pay via UPI to: *${hostUpi}*\n`;
    msg += `UPI Link: ${generateUpiUrl({ upiId: hostUpi, amountInRupees: memberSummary.totalPending / 100, payeeName: 'SplitBill Settlement' })}\n\n`;
    msg += `Thanks! 🍽️`;

    const url = generateWhatsAppUrl({ phone: memberSummary.phone, message: msg });
    window.open(url, '_blank');
  };

  const handleAddFrequentFriend = async (friend: { name: string; phone: string | null }) => {
    if (!groupId) return;
    try {
      const { data, error } = await supabase
        .from('group_members')
        .insert([
          {
            group_id: groupId,
            name: friend.name,
            phone: friend.phone,
            status: 'JOINED',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setMembers((prev) => [...prev, data]);
        setSelectedAttendeeIds((prev) => new Set([...prev, data.id]));
        setFrequentFriends((prev) => prev.filter((f) => f.name !== friend.name));
        showNotification(`${data.name} added!`);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from this group?`)) return;

    try {
      const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId);

      if (deleteError) throw deleteError;

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      showNotification(`${name} removed.`);
    } catch (err: any) {
      alert(`Error removing member: ${err.message}`);
    }
  };

  const handleSavePhone = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('group_members')
        .update({ phone: editingPhoneValue.trim() || null })
        .eq('id', memberId);

      if (error) throw error;

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, phone: editingPhoneValue.trim() || null } : m))
      );
      setEditingMemberId(null);
      showNotification('WhatsApp number updated! 📱');
    } catch (err: any) {
      alert(`Error updating phone: ${err.message}`);
    }
  };

  const handleSendWhatsAppGreeting = (member: GroupMember) => {
    if (!member.phone) return;
    const msg = `Hi ${member.name}! 👋 I've added you to our dining group "${group?.name || 'SplitBill'}" on SplitBill. When we split bills, you'll receive your itemized shares directly here!`;
    const url = generateWhatsAppUrl({ phone: member.phone, message: msg });
    window.open(url, '_blank');
  };

  // Open modal asking for Session Name
  const handleOpenStartSessionModal = () => {
    setSessionName('');
    setSessionRestaurant(group?.restaurant_name || '');
    setSessionTable('');
    setSelectedAttendeeIds(new Set(members.map((m) => m.id)));
    setIsStartSessionModalOpen(true);
  };

  const handleLaunchSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;

    setStartingSession(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const finalTitle = sessionName.trim()
        ? (sessionRestaurant.trim() ? `${sessionName.trim()} @ ${sessionRestaurant.trim()}` : sessionName.trim())
        : (sessionRestaurant.trim() || group.name);

      // Create new session for this group
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert([
          {
            group_id: group.id,
            host_id: user.id,
            restaurant_name: finalTitle,
            table_number: sessionTable.trim() || null,
            currency: 'INR',
            status: 'DRAFT',
            subtotal: 0,
            grand_total: 0,
          },
        ])
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Add selected attendees as participants
      const attendeeList = members.filter((m) => selectedAttendeeIds.has(m.id));
      if (attendeeList.length > 0) {
        const participantRows = attendeeList.map((m) => ({
          session_id: newSession.id,
          group_member_id: m.id,
          status: 'JOINED',
        }));

        await supabase.from('session_participants').insert(participantRows);
      }

      // Navigate straight to the session workspace!
      navigate(`/sessions/${newSession.id}`);
    } catch (err: any) {
      alert(`Failed to start session: ${err.message}`);
      setStartingSession(false);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-neu-sm" />
            <p className="text-text-secondary font-medium text-xs">Loading group details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !group) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-card p-10 text-center shadow-neu-outer mt-6">
          <AlertCircle className="h-12 w-12 text-danger" />
          <h2 className="text-2xl font-bold font-display text-text-main">Group Not Found</h2>
          <p className="text-text-secondary max-w-md">{error || 'This group may have been deleted.'}</p>
          <Link
            to="/dashboard"
            className="mt-2 rounded-2xl bg-primary px-6 py-3 font-semibold text-white shadow-neu-sm"
          >
            Back to Dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 pb-16">
        {/* Toast Alert */}
        {notification && (
          <div className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-2xl bg-card px-5 py-3 text-sm font-semibold text-success shadow-neu-outer border border-success/20 animate-bounce">
            <CheckCircle2 className="h-4 w-4" />
            {notification}
          </div>
        )}

        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-text-secondary shadow-neu-sm transition-all hover:shadow-neu-inner-sm hover:text-text-main"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl sm:text-3xl font-bold font-display text-text-main">
                  {group.name}
                </h2>
              </div>
              {group.restaurant_name && (
                <p className="flex items-center gap-1.5 text-xs text-text-secondary mt-0.5">
                  <Utensils className="h-3.5 w-3.5 text-primary" />
                  {group.restaurant_name}
                </p>
              )}
            </div>
          </div>

          {/* Quick Start Session Button (Triggers Session Name Dialog) */}
          <button
            onClick={handleOpenStartSessionModal}
            className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
          >
            <Play className="h-4 w-4 fill-current" />
            Start Bill Session
          </button>
        </div>

        {/* Group Analytics Overview Cards */}
        {groupAnalytics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Spent in this Group */}
            <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-1">
              <div className="flex items-center gap-2 text-text-secondary text-xs font-semibold">
                <Receipt className="h-4 w-4 text-primary" />
                <span>Group Spent</span>
              </div>
              <span className="text-xl sm:text-2xl font-bold font-display text-text-main truncate">
                {formatCurrency(groupAnalytics.totalSpent)}
              </span>
              <span className="text-[10px] text-text-secondary">
                {groupAnalytics.sessionsCount} session(s)
              </span>
            </div>

            {/* Total Settled in this Group */}
            <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-1">
              <div className="flex items-center gap-2 text-text-secondary text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>Settled</span>
              </div>
              <span className="text-xl sm:text-2xl font-bold font-display text-success truncate">
                {formatCurrency(groupAnalytics.totalSettled)}
              </span>
              <span className="text-[10px] text-success/80 font-bold">
                {groupAnalytics.settlementRate}% collected
              </span>
            </div>

            {/* Total Pending in this Group */}
            <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-1">
              <div className="flex items-center gap-2 text-text-secondary text-xs font-semibold">
                <Clock className="h-4 w-4 text-warning" />
                <span>Need to Settle</span>
              </div>
              <span className="text-xl sm:text-2xl font-bold font-display text-warning truncate">
                {formatCurrency(groupAnalytics.totalPending)}
              </span>
              <span className="text-[10px] text-text-secondary">
                Remaining to collect
              </span>
            </div>

            {/* Link to Full Overall Analytics Page */}
            <Link
              to="/analytics"
              className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer hover:shadow-neu-inner transition-all flex flex-col justify-between gap-1 group border border-primary/20"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-primary">
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4" />
                  Full Ledger
                </span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold font-display text-text-main group-hover:text-primary transition-colors block">
                  Overall Analytics →
                </span>
                <span className="text-[10px] text-text-secondary font-medium block">
                  All circles & diners
                </span>
              </div>
            </Link>
          </div>
        )}

        {/* Members Management Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Member List & Past Bills */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display text-text-main">
                      Group Members ({members.length})
                    </h3>
                    <p className="text-xs text-text-secondary">
                      Diners who will participate in this group's bills
                    </p>
                  </div>
                </div>

                {/* Direct Contacts Button for Mobile Browsers */}
                {isContactPickerSupported && (
                  <button
                    onClick={handleSelectFromPhoneContacts}
                    className="flex items-center gap-1.5 rounded-xl bg-success/15 px-3 py-1.5 text-xs font-bold text-success hover:bg-success/25 transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Choose from Contacts</span>
                  </button>
                )}
              </div>

              {/* Members List */}
              {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-card p-8 text-center shadow-neu-inner">
                  <Users className="h-10 w-10 text-text-secondary opacity-40 mb-2" />
                  <p className="font-semibold text-text-main">No members yet</p>
                  <p className="text-xs text-text-secondary">
                    Add friends below or pick directly from your phone contacts!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
                  {members.map((member, index) => {
                    const memberSummary = groupAnalytics?.members.find((m) => m.memberId === member.id);
                    const isExpanded = expandedMemberIds.has(member.id);
                    const owes = memberSummary?.totalPending || 0;
                    const isFullySettled = owes <= 0 && (memberSummary?.totalBilled || 0) > 0;

                    return (
                      <div
                        key={member.id}
                        className="flex flex-col gap-2.5 rounded-2xl bg-card p-3.5 px-4 shadow-neu-sm transition-all hover:shadow-neu-inner-sm overflow-hidden"
                      >
                        {/* Member Header Row */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 font-bold text-primary font-brand text-xl">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-text-main flex items-center gap-2">
                                <span className="truncate">{member.name}</span>
                                {index === 0 && (
                                  <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary shrink-0">
                                    Initial
                                  </span>
                                )}
                              </div>

                              {/* Phone number display & edit */}
                              {editingMemberId === member.id ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="tel"
                                    value={editingPhoneValue}
                                    onChange={(e) => setEditingPhoneValue(e.target.value)}
                                    placeholder="WhatsApp (e.g. 9876543210)"
                                    className="rounded-xl border-none bg-card p-1.5 px-2.5 text-xs shadow-neu-inner outline-none w-44 font-sans"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSavePhone(member.id)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-success text-white hover:opacity-90"
                                    title="Save phone"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingMemberId(null)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                                    title="Cancel"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                                  {member.phone ? (
                                    <>
                                      <span className="flex items-center gap-1 font-medium text-text-main truncate">
                                        <Phone className="h-3 w-3 text-success shrink-0" />
                                        {member.phone}
                                      </span>
                                      <button
                                        onClick={() => {
                                          if (memberSummary && owes > 0) {
                                            handleSendMemberWhatsAppReminder(memberSummary);
                                          } else {
                                            handleSendWhatsAppGreeting(member);
                                          }
                                        }}
                                        className="flex items-center gap-1 text-[11px] font-semibold text-success hover:underline shrink-0"
                                        title={owes > 0 ? 'Send pending bill summary' : 'Open WhatsApp chat'}
                                      >
                                        <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                                        WhatsApp
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingMemberId(member.id);
                                          setEditingPhoneValue(member.phone || '');
                                        }}
                                        className="text-text-secondary hover:text-primary shrink-0"
                                        title="Edit WhatsApp number"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEditingMemberId(member.id);
                                        setEditingPhoneValue('');
                                      }}
                                      className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                                    >
                                      <Phone className="h-3 w-3" />
                                      + Add Phone
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Settlement Status & Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Settlement Status Pill */}
                            <div className="text-right">
                              {owes > 0 ? (
                                <span className="rounded-xl px-2.5 py-1 text-xs font-bold bg-warning/15 text-warning border border-warning/30 inline-block font-display">
                                  Owes {formatCurrency(owes)} ⏳
                                </span>
                              ) : isFullySettled ? (
                                <span className="rounded-xl px-2.5 py-1 text-xs font-bold bg-success/15 text-success border border-success/30 inline-block">
                                  Settled ✅
                                </span>
                              ) : (
                                <span className="text-[11px] text-text-secondary font-medium">
                                  No bills
                                </span>
                              )}
                            </div>

                            {/* Expand bill session breakdown */}
                            {memberSummary && memberSummary.sessions.length > 0 && (
                              <button
                                onClick={() => toggleMemberExpand(member.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-card shadow-neu-sm hover:shadow-neu-inner text-text-secondary"
                                title="View bill sessions"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            )}

                            {/* Remove Member */}
                            <button
                              onClick={() => handleRemoveMember(member.id, member.name)}
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expandable Session Breakdown */}
                        {isExpanded && memberSummary && (
                          <div className="pt-2.5 border-t border-text-secondary/10 flex flex-col gap-2 animate-in fade-in">
                            <div className="flex items-center justify-between text-[11px] text-text-secondary font-semibold">
                              <span>
                                Billed in {memberSummary.sessions.length} session(s) • Total: {formatCurrency(memberSummary.totalBilled)}
                              </span>
                              <span className="text-success font-bold">
                                Settled: {formatCurrency(memberSummary.totalSettled)}
                              </span>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              {memberSummary.sessions.map((sess) => (
                                <div
                                  key={sess.sessionId}
                                  className="flex items-center justify-between rounded-xl bg-card p-2 px-3 shadow-neu-inner text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <Link
                                      to={`/sessions/${sess.sessionId}`}
                                      className="font-bold text-text-main hover:text-primary transition-colors truncate block"
                                    >
                                      {sess.sessionRestaurant}
                                    </Link>
                                    <span className="text-[10px] text-text-secondary">
                                      {new Date(sess.sessionDate).toLocaleDateString()}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span className="font-bold text-primary font-display">
                                      {formatCurrency(sess.shareAmount)}
                                    </span>

                                    <button
                                      onClick={() =>
                                        handleToggleMemberSessionPayment(
                                          sess.participantId,
                                          sess.isPaid,
                                          sess.sessionId,
                                          sess.shareAmount
                                        )
                                      }
                                      className={`rounded-lg px-2 py-0.5 text-[11px] font-bold shadow-neu-sm transition-all ${
                                        sess.isPaid
                                          ? 'bg-success text-white hover:bg-success/90'
                                          : 'bg-card text-warning shadow-neu-inner hover:bg-warning/15'
                                      }`}
                                    >
                                      {sess.isPaid ? 'Paid ✅' : 'Paid?'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sessions History Card */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-bold font-display text-text-main">
                    Group Bills ({sessions.length})
                  </h3>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-2xl bg-card p-6 text-center shadow-neu-inner">
                  <p className="text-xs text-text-secondary">
                    No bills split for this group yet. Tap <strong>Start Bill Session</strong> above to begin!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {sessions.map((sess) => (
                    <Link
                      key={sess.id}
                      to={`/sessions/${sess.id}`}
                      className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-neu-sm transition-all hover:shadow-neu-inner-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-neu-inner text-primary">
                          <Receipt className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-text-main text-sm">
                            {sess.restaurant_name || 'Restaurant Bill'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(sess.created_at).toLocaleDateString()}
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-primary font-display">
                              {formatCurrency(sess.grand_total)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span
                        className={`rounded-xl px-3 py-1 text-xs font-bold ${
                          sess.status === 'COMPLETED'
                            ? 'bg-success/15 text-success'
                            : sess.status === 'LOCKED'
                            ? 'bg-warning/15 text-warning'
                            : 'bg-primary/15 text-primary'
                        }`}
                      >
                        {sess.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Add Member Form (Contacts + Manual) */}
          <div className="flex flex-col gap-5">
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-4">
              <h3 className="text-lg font-bold font-display text-text-main">
                Add Member
              </h3>

              {/* Option 1: Native Phone Contacts Picker (if on supported device) */}
              {isContactPickerSupported && (
                <button
                  type="button"
                  onClick={handleSelectFromPhoneContacts}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3 px-4 text-xs font-bold text-success shadow-neu-sm hover:shadow-neu-inner-sm transition-all border border-success/30"
                >
                  <BookOpen className="h-4 w-4 text-success" />
                  <span>Choose from Phone Contacts</span>
                </button>
              )}

              {/* Option 2: Frequent Friends Quick-Add Chips */}
              {frequentFriends.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                    Recent Dining Friends:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {frequentFriends.map((f, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAddFrequentFriend(f)}
                        className="flex items-center gap-1 rounded-xl bg-card px-2.5 py-1 text-xs font-semibold text-text-main shadow-neu-sm hover:text-primary hover:shadow-neu-inner-sm"
                        title={f.phone || ''}
                      >
                        <Plus className="h-3 w-3 text-primary" />
                        <span>{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Option 3: Manual Input Form */}
              <form onSubmit={handleAddMember} className="flex flex-col gap-3 pt-1 border-t border-text-secondary/10">
                <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                  Or Type Manually:
                </span>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-text-secondary">
                    Friend's Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="e.g. Rahul, Sneha, Alex"
                    required
                    className="rounded-2xl border-none bg-card p-3 text-xs shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                      WhatsApp Number
                    </span>
                    <span className="text-[10px] text-text-secondary opacity-60">Optional</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="rounded-xl bg-card px-2.5 py-2.5 text-xs font-bold text-text-secondary shadow-neu-inner">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={memberPhone}
                      onChange={(e) => setMemberPhone(e.target.value)}
                      placeholder="98765 43210"
                      className="flex-1 rounded-2xl border-none bg-card p-3 text-xs shadow-neu-inner outline-none font-sans"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={addingMember || !memberName.trim()}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-card py-3 text-xs font-bold text-text-main shadow-neu-sm hover:text-primary hover:shadow-neu-inner-sm disabled:opacity-50 mt-1"
                >
                  <UserPlus className="h-4 w-4" />
                  {addingMember ? 'Adding...' : 'Add to Group'}
                </button>
              </form>
            </div>

            {/* Quick Share / How it works Card */}
            <div className="rounded-3xl bg-card p-5 shadow-neu-inner text-xs flex flex-col gap-2">
              <h4 className="font-bold text-text-main font-display flex items-center gap-1.5">
                <span className="font-brand text-lg text-primary">SplitBill</span> Tip
              </h4>
              <p className="text-text-secondary leading-relaxed">
                Add your friends once. When you start bill sessions, you can pick who attended and assign dishes individually so everyone pays only for what they had.
              </p>
            </div>
          </div>

        </div>

        {/* Modal: Ask for Session Name when Starting Session */}
        {isStartSessionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold font-display text-text-main">
                    Start Bill Session
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Group: <strong>{group.name}</strong>
                  </p>
                </div>

                <button
                  onClick={() => setIsStartSessionModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleLaunchSession} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">
                    Session Name / Event <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g. Sunday Brunch, Weekend Dinner, Pizza Night"
                    required
                    autoFocus
                    className="rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
                  />
                  <p className="text-[11px] text-text-secondary">
                    Every session has its own name so you can easily reference it later.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary">
                      Restaurant / Venue
                    </label>
                    <input
                      type="text"
                      value={sessionRestaurant}
                      onChange={(e) => setSessionRestaurant(e.target.value)}
                      placeholder="e.g. Cafe Mocha"
                      className="rounded-2xl border-none bg-card p-3 text-xs shadow-neu-inner outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary">
                      Table / Note
                    </label>
                    <input
                      type="text"
                      value={sessionTable}
                      onChange={(e) => setSessionTable(e.target.value)}
                      placeholder="e.g. Table 12"
                      className="rounded-2xl border-none bg-card p-3 text-xs shadow-neu-inner outline-none"
                    />
                  </div>
                </div>

                {/* Who is attending this meal? */}
                {members.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-neu-inner">
                    <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
                      <span>Attending this session ({selectedAttendeeIds.size}/{members.length}):</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAttendeeIds(new Set(members.map((m) => m.id)))}
                        className="text-primary hover:underline text-[11px]"
                      >
                        Select All
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {members.map((m) => {
                        const isSelected = selectedAttendeeIds.has(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedAttendeeIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(m.id)) next.delete(m.id);
                                else next.add(m.id);
                                return next;
                              });
                            }}
                            className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-primary text-white shadow-neu-inner-sm'
                                : 'bg-card text-text-secondary shadow-neu-sm'
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsStartSessionModalOpen(false)}
                    className="flex-1 rounded-2xl bg-card py-3.5 text-xs font-semibold text-text-secondary shadow-neu-sm hover:text-text-main"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={startingSession || !sessionName.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-neu-sm hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {startingSession ? 'Launching...' : 'Launch Session'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
