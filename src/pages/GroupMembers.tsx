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
  Phone,
  Edit2,
  Check,
  X
} from 'lucide-react';

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

  // New member form
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Inline editing of phone number
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');

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
      setMembers(membersData || []);

      // Fetch past sessions for this group
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);
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
        setMemberName('');
        setMemberPhone('');
        showNotification(`${data.name} added to the group!`);
      }
    } catch (err: any) {
      alert(`Error adding member: ${err.message}`);
    } finally {
      setAddingMember(false);
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

  const handleStartSession = async () => {
    if (!group) return;
    setStartingSession(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Create new session for this group
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert([
          {
            group_id: group.id,
            host_id: user.id,
            restaurant_name: group.restaurant_name || group.name,
            currency: 'INR',
            status: 'DRAFT',
            subtotal: 0,
            grand_total: 0,
          },
        ])
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Add all group members as participants in this session
      if (members.length > 0) {
        const participantRows = members.map((m) => ({
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
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-text-secondary font-medium">Loading group details...</p>
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
          <p className="text-text-secondary max-w-md">{error || 'This group may have been deleted or you do not have permission to view it.'}</p>
          <Link
            to="/dashboard"
            className="mt-2 rounded-2xl bg-primary px-6 py-3 font-semibold text-white shadow-neu-sm transition-all hover:bg-primary-hover"
          >
            Back to Dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2">
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
              <h2 className="text-2xl sm:text-3xl font-bold font-display text-text-main">
                {group.name}
              </h2>
              {group.restaurant_name && (
                <p className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Utensils className="h-3.5 w-3.5 text-primary" />
                  {group.restaurant_name}
                </p>
              )}
            </div>
          </div>

          {/* Quick Start Session Button */}
          <button
            onClick={handleStartSession}
            disabled={startingSession}
            className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-base font-semibold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm disabled:opacity-60"
          >
            <Play className="h-5 w-5 fill-current" />
            {startingSession ? 'Launching...' : 'Start Bill Session'}
          </button>
        </div>

        {/* Members Management Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Member List */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display text-text-main">
                      Group Members ({members.length})
                    </h3>
                    <p className="text-xs text-text-secondary">
                      Members can receive bill links directly to their WhatsApp
                    </p>
                  </div>
                </div>
              </div>

              {/* Members List */}
              {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-card p-8 text-center shadow-neu-inner">
                  <Users className="h-10 w-10 text-text-secondary opacity-40 mb-2" />
                  <p className="font-semibold text-text-main">No members yet</p>
                  <p className="text-sm text-text-secondary">
                    Add friends with their WhatsApp numbers below to split bills with them!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
                  {members.map((member, index) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-2xl bg-card p-3.5 px-4 shadow-neu-sm transition-all hover:shadow-neu-inner-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 font-bold text-primary font-display">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-text-main flex items-center gap-2">
                            <span>{member.name}</span>
                            {index === 0 && (
                              <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                                Host / Initial
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
                                  <span className="flex items-center gap-1 font-medium text-text-main">
                                    <Phone className="h-3 w-3 text-success" />
                                    {member.phone}
                                  </span>
                                  <button
                                    onClick={() => handleSendWhatsAppGreeting(member)}
                                    className="flex items-center gap-1 text-[11px] font-semibold text-success hover:underline"
                                    title="Open WhatsApp chat"
                                  >
                                    <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                                    WhatsApp
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingMemberId(member.id);
                                      setEditingPhoneValue(member.phone || '');
                                    }}
                                    className="text-text-secondary hover:text-primary"
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
                                  + Add WhatsApp Phone
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveMember(member.id, member.name)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sessions History Card */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-bold font-display text-text-main">
                    Group Sessions ({sessions.length})
                  </h3>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-2xl bg-card p-6 text-center shadow-neu-inner">
                  <p className="text-sm text-text-secondary">
                    No bills split for this group yet. Click <strong>Start Bill Session</strong> above to begin!
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
                          <div className="font-semibold text-text-main">
                            {sess.restaurant_name || 'Restaurant Bill'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(sess.created_at).toLocaleDateString()}
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-primary">
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

          {/* Right Column: Add Member Form & Quick Tips */}
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <h3 className="text-lg font-bold font-display text-text-main mb-2">
                Add New Member
              </h3>
              <p className="text-xs text-text-secondary mb-4">
                Include their WhatsApp phone number so you can send their bill breakdown directly.
              </p>

              <form onSubmit={handleAddMember} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-secondary">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="e.g. Rahul, Priya, Alex"
                    required
                    className="rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                      WhatsApp Phone Number
                    </span>
                    <span className="text-[10px] text-text-secondary opacity-70">Optional</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="rounded-2xl bg-card px-3 py-3.5 text-xs font-bold text-text-secondary shadow-neu-inner">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={memberPhone}
                      onChange={(e) => setMemberPhone(e.target.value)}
                      placeholder="98765 43210"
                      className="flex-1 rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm font-sans"
                    />
                  </div>
                  <p className="text-[10px] text-text-secondary">
                    Used to directly send individual bill links & UPI requests on WhatsApp.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={addingMember || !memberName.trim()}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3.5 text-sm font-semibold text-text-main shadow-neu-sm transition-all hover:text-primary hover:shadow-neu-inner-sm disabled:opacity-50 mt-1"
                >
                  <UserPlus className="h-4 w-4" />
                  {addingMember ? 'Adding...' : 'Add to Group'}
                </button>
              </form>
            </div>

            {/* Quick Share / How it works Card */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-inner text-sm flex flex-col gap-3">
              <h4 className="font-bold text-text-main font-display flex items-center gap-2">
                <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                Direct WhatsApp Delivery
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                When you split a bill in any session, SplitBill generates a direct WhatsApp link for each friend with their exact portion of food, tax, and an instant UPI payment link.
              </p>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
