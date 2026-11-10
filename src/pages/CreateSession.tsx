import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { ArrowLeft, Utensils, Users, Play, Plus, Check } from 'lucide-react';

interface Group {
  id: string;
  name: string;
  restaurant_name: string | null;
}

interface GroupMember {
  id: string;
  name: string;
  phone: string | null;
}

export default function CreateSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedGroupId = searchParams.get('groupId');

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(preselectedGroupId || '');
  const [restaurantName, setRestaurantName] = useState('');
  const [tableNumber, setTableNumber] = useState('');

  // Group members and selection
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // Quick new member
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');

  // Quick new group creation toggle
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGroups() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        const { data, error: groupErr } = await supabase
          .from('groups')
          .select('*')
          .eq('host_id', user.id)
          .order('created_at', { ascending: false });

        if (groupErr) throw groupErr;
        setGroups(data || []);

        if (preselectedGroupId) {
          setSelectedGroupId(preselectedGroupId);
        } else if (data && data.length > 0) {
          setSelectedGroupId(data[0].id);
        } else {
          setIsCreatingNewGroup(true);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load groups');
      } finally {
        setLoading(false);
      }
    }

    loadGroups();
  }, [navigate, preselectedGroupId]);

  // When selectedGroupId changes, fetch its members and update restaurant name default
  useEffect(() => {
    if (!selectedGroupId || isCreatingNewGroup) {
      setGroupMembers([]);
      setSelectedMemberIds(new Set());
      return;
    }

    const currentGroup = groups.find((g) => g.id === selectedGroupId);
    if (currentGroup && currentGroup.restaurant_name && !restaurantName) {
      setRestaurantName(currentGroup.restaurant_name);
    }

    async function loadMembers() {
      const { data, error } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', selectedGroupId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setGroupMembers(data);
        // Default select all members
        setSelectedMemberIds(new Set(data.map((m) => m.id)));
      }
    }

    loadMembers();
  }, [selectedGroupId, isCreatingNewGroup, groups]);

  const toggleMemberSelection = (id: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllMembers = () => {
    setSelectedMemberIds(new Set(groupMembers.map((m) => m.id)));
  };

  const handleQuickAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim() || !selectedGroupId) return;

    try {
      const { data, error } = await supabase
        .from('group_members')
        .insert([
          {
            group_id: selectedGroupId,
            name: newMemberName.trim(),
            phone: newMemberPhone.trim() || null,
            status: 'JOINED',
          },
        ])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setGroupMembers((prev) => [...prev, data]);
        setSelectedMemberIds((prev) => new Set([...prev, data.id]));
        setNewMemberName('');
        setNewMemberPhone('');
      }
    } catch (err: any) {
      alert(`Error adding member: ${err.message}`);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      let activeGroupId = selectedGroupId;

      // If user chose to create a new group on the fly
      if (isCreatingNewGroup || !activeGroupId) {
        if (!newGroupName.trim()) {
          setError('Please provide a name for the group.');
          setSubmitting(false);
          return;
        }

        const { data: newGroup, error: groupErr } = await supabase
          .from('groups')
          .insert([
            {
              host_id: user.id,
              name: newGroupName.trim(),
              restaurant_name: restaurantName.trim() || null,
            },
          ])
          .select()
          .single();

        if (groupErr) throw groupErr;
        activeGroupId = newGroup.id;

        // Add Host as first member if no members exist
        const hostName = user.user_metadata?.name || 'Host (Me)';
        const { data: hostMember } = await supabase
          .from('group_members')
          .insert([
            {
              group_id: activeGroupId,
              name: hostName,
              user_id: user.id,
              status: 'JOINED',
            },
          ])
          .select()
          .single();

        if (hostMember) {
          selectedMemberIds.add(hostMember.id);
        }
      }

      // 1. Create the session
      const { data: sessionData, error: sessionErr } = await supabase
        .from('sessions')
        .insert([
          {
            group_id: activeGroupId,
            host_id: user.id,
            restaurant_name: restaurantName.trim() || 'Restaurant Bill',
            table_number: tableNumber.trim() || null,
            currency: 'INR',
            status: 'DRAFT',
            subtotal: 0,
            grand_total: 0,
            tax_percent: 5.0,
            host_upi_id: 'host@upi',
          },
        ])
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // 2. Add selected members as participants
      const membersToAttach = Array.from(selectedMemberIds);
      if (membersToAttach.length > 0) {
        const participantRows = membersToAttach.map((memberId) => ({
          session_id: sessionData.id,
          group_member_id: memberId,
          status: 'JOINED',
        }));

        await supabase.from('session_participants').insert(participantRows);
      }

      // Done! Redirect to the session workspace
      navigate(`/sessions/${sessionData.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to start session');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-text-secondary font-medium">Preparing session...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-text-secondary shadow-neu-sm transition-all hover:shadow-neu-inner-sm hover:text-text-main"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold font-display text-text-main">
              Start New Bill Session
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary">
              Set up restaurant details and select dining participants.
            </p>
          </div>
        </div>

        {/* Form Container */}
        <div className="rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer max-w-2xl mx-auto w-full">
          <form onSubmit={handleCreateSession} className="flex flex-col gap-6">

            {/* Step 1: Select or Create Group */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-text-main font-display flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Select Group
                </label>
                {groups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewGroup(!isCreatingNewGroup)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {isCreatingNewGroup ? 'Use Existing Group' : '+ Create New Group'}
                  </button>
                )}
              </div>

              {isCreatingNewGroup || groups.length === 0 ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Weekend Crew, Office Lunch"
                    className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm text-sm"
                    required
                  />
                  <p className="text-[11px] text-text-secondary">
                    A new group will be created automatically with this name.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {groups.map((grp) => (
                    <button
                      type="button"
                      key={grp.id}
                      onClick={() => setSelectedGroupId(grp.id)}
                      className={`flex flex-col text-left p-4 rounded-2xl transition-all ${
                        selectedGroupId === grp.id
                          ? 'bg-card shadow-neu-inner border-2 border-primary/40'
                          : 'bg-card shadow-neu-sm hover:shadow-neu-inner-sm'
                      }`}
                    >
                      <span className="font-bold text-sm text-text-main">{grp.name}</span>
                      {grp.restaurant_name && (
                        <span className="text-xs text-text-secondary truncate mt-0.5">
                          📍 {grp.restaurant_name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Dining Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-text-secondary flex items-center gap-1.5">
                  <Utensils className="h-4 w-4 text-primary" />
                  Restaurant / Cafe Name
                </label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="e.g. Mainland China"
                  required
                  className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm text-sm"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-text-secondary">
                  Table Number <span className="font-normal opacity-60">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="e.g. Table 12 or Patio"
                  className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm text-sm"
                />
              </div>
            </div>

            {/* Step 3: Who is Dining? (Participants) */}
            {!isCreatingNewGroup && selectedGroupId && (
              <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-neu-inner">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text-main font-display">
                    Attending Members ({selectedMemberIds.size}/{groupMembers.length})
                  </label>
                  <button
                    type="button"
                    onClick={selectAllMembers}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Select All
                  </button>
                </div>

                {groupMembers.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    No members in this group yet. Add friends below to include them in the bill.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {groupMembers.map((m) => {
                      const isSelected = selectedMemberIds.has(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleMemberSelection(m.id)}
                          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-primary text-white shadow-neu-sm'
                              : 'bg-card text-text-secondary shadow-neu-sm hover:text-text-main'
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                              isSelected ? 'border-white bg-white/20' : 'border-text-secondary/40'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Quick Add Person */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 pt-2 border-t border-text-secondary/10">
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="+ Name"
                    className="flex-1 rounded-xl border-none bg-card p-2 px-3 text-xs shadow-neu-inner outline-none"
                  />
                  <input
                    type="tel"
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    placeholder="WhatsApp No. (Optional)"
                    className="flex-1 rounded-xl border-none bg-card p-2 px-3 text-xs shadow-neu-inner outline-none font-sans"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddMember}
                    disabled={!newMemberName.trim()}
                    className="rounded-xl bg-card px-3 py-2 text-xs font-bold text-primary shadow-neu-sm hover:shadow-neu-inner-sm disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5 inline mr-1" />
                    Add
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-danger/10 p-3 text-center text-sm font-semibold text-danger">
                {error}
              </div>
            )}

            {/* Launch Button */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm disabled:opacity-50"
            >
              <Play className="h-5 w-5 fill-current" />
              {submitting ? 'Launching Bill Session...' : 'Start Bill Splitting'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
