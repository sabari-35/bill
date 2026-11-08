import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { formatCurrency } from '../lib/utils';
import { 
  Users, 
  Receipt, 
  Play, 
  ChevronRight, 
  Calendar, 
  Utensils, 
  Plus,
  Sparkles,
  TrendingUp,
  X
} from 'lucide-react';

interface SessionItem {
  id: string;
  restaurant_name: string | null;
  table_number: string | null;
  status: string;
  grand_total: number;
  created_at: string;
}

interface GroupMember {
  id: string;
  name: string;
  phone: string | null;
}

interface GroupWithSessions {
  id: string;
  name: string;
  restaurant_name: string | null;
  created_at: string;
  group_members: GroupMember[];
  sessions: SessionItem[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('Host');

  // Modal to ask for session name when starting bill session
  const [sessionModalGroup, setSessionModalGroup] = useState<GroupWithSessions | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [sessionRestaurant, setSessionRestaurant] = useState('');
  const [sessionTable, setSessionTable] = useState('');
  const [startingSession, setStartingSession] = useState(false);

  // Expanded groups tracking
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      setUserName(user.user_metadata?.name || user.email?.split('@')[0] || 'Host');

      // Optimized single joined query: fetch groups with their members and sessions together!
      const { data: groupsData, error } = await supabase
        .from('groups')
        .select(`
          *,
          group_members(id, name, phone),
          sessions(id, restaurant_name, table_number, status, grand_total, created_at)
        `)
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (groupsData) {
        // Sort nested sessions by created_at desc
        const formatted = groupsData.map((g: any) => ({
          ...g,
          group_members: g.group_members || [],
          sessions: (g.sessions || []).sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ),
        }));
        setGroups(formatted);

        // Expand all groups by default
        setExpandedGroupIds(new Set(formatted.map((g: any) => g.id)));
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Open the Start Session modal with defaults
  const handleOpenStartSessionModal = (grp: GroupWithSessions, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSessionModalGroup(grp);
    setSessionName('');
    setSessionRestaurant(grp.restaurant_name || '');
    setSessionTable('');
  };

  // Create session with custom name & details
  const handleLaunchSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionModalGroup) return;

    setStartingSession(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const finalTitle = sessionName.trim()
        ? (sessionRestaurant.trim() ? `${sessionName.trim()} @ ${sessionRestaurant.trim()}` : sessionName.trim())
        : (sessionRestaurant.trim() || sessionModalGroup.name);

      const { data: newSession, error: sessErr } = await supabase
        .from('sessions')
        .insert([
          {
            group_id: sessionModalGroup.id,
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

      if (sessErr) throw sessErr;

      // Add all group members as participants in the session
      if (sessionModalGroup.group_members.length > 0) {
        const participantRows = sessionModalGroup.group_members.map((m) => ({
          session_id: newSession.id,
          group_member_id: m.id,
          status: 'JOINED',
        }));

        await supabase.from('session_participants').insert(participantRows);
      }

      // Navigate straight to the session workspace!
      navigate(`/sessions/${newSession.id}`);
    } catch (err: any) {
      alert(`Error starting session: ${err.message}`);
      setStartingSession(false);
    }
  };

  // Performance metrics computation
  const totalSessionsCount = groups.reduce((acc, g) => acc + g.sessions.length, 0);
  const totalAmountSettled = groups.reduce(
    (acc, g) => acc + g.sessions.reduce((sAcc, s) => sAcc + (s.grand_total || 0), 0),
    0
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 pb-16">

        {/* Welcome Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display text-text-main">
              Welcome back, <span className="font-brand text-4xl text-primary font-bold">{userName}</span>
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              All your dining circles and bills organized cleanly by group.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/groups/new"
              className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
            >
              <Plus className="h-4 w-4" />
              New Group
            </Link>
          </div>
        </div>

        {/* Performance Metrics Summary Bar */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-1">
            <div className="flex items-center gap-2 text-text-secondary text-xs font-semibold">
              <Users className="h-4 w-4 text-primary" />
              <span>Groups</span>
            </div>
            <span className="text-xl sm:text-2xl font-bold font-display text-text-main">
              {groups.length}
            </span>
          </div>

          <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-1">
            <div className="flex items-center gap-2 text-text-secondary text-xs font-semibold">
              <Receipt className="h-4 w-4 text-primary" />
              <span>Sessions</span>
            </div>
            <span className="text-xl sm:text-2xl font-bold font-display text-text-main">
              {totalSessionsCount}
            </span>
          </div>

          <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer flex flex-col gap-1">
            <div className="flex items-center gap-2 text-text-secondary text-xs font-semibold">
              <TrendingUp className="h-4 w-4 text-success" />
              <span>Total Settled</span>
            </div>
            <span className="text-lg sm:text-2xl font-bold font-display text-primary truncate">
              {formatCurrency(totalAmountSettled)}
            </span>
          </div>
        </div>

        {/* Groups Listing (Hierarchy: Groups -> Nested Sessions) */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold font-display text-text-main flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Your Dining Groups ({groups.length})
            </h2>
            <span className="text-xs text-text-secondary">
              Sessions listed inside each group
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl bg-card p-12 text-center shadow-neu-inner">
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-xs text-text-secondary mt-3 font-medium">Loading groups & bills...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-card p-10 text-center shadow-neu-inner">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="h-7 w-7" />
              </div>
              <div className="max-w-sm">
                <h3 className="font-bold text-lg text-text-main font-display">No groups created yet</h3>
                <p className="text-xs text-text-secondary mt-1">
                  Create your first group (e.g. Friends, Roommates, Office Crew) to start itemizing and splitting restaurant checks.
                </p>
              </div>
              <Link
                to="/groups/new"
                className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-neu-sm hover:bg-primary-hover"
              >
                Create First Group
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => {
                const isExpanded = expandedGroupIds.has(group.id);
                const memberCount = group.group_members.length;
                const sessionCount = group.sessions.length;

                return (
                  <div
                    key={group.id}
                    className="rounded-3xl bg-card p-5 sm:p-6 shadow-neu-outer transition-all flex flex-col gap-4"
                  >
                    {/* Group Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div 
                        className="flex items-center gap-3.5 cursor-pointer flex-1 min-w-[200px]"
                        onClick={() => toggleGroupExpand(group.id)}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/30 text-primary font-brand text-2xl font-bold shadow-neu-inner">
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-bold font-display text-text-main flex items-center gap-2">
                            <span>{group.name}</span>
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {sessionCount} {sessionCount === 1 ? 'bill' : 'bills'}
                            </span>
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-text-secondary mt-0.5">
                            {group.restaurant_name && (
                              <span className="flex items-center gap-1">
                                <Utensils className="h-3 w-3 text-primary" />
                                {group.restaurant_name}
                              </span>
                            )}
                            <span>•</span>
                            <span className="font-medium text-text-main">
                              {memberCount} {memberCount === 1 ? 'member' : 'members'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Group Action Buttons */}
                      <div className="flex items-center gap-2 sm:gap-3">
                        <button
                          onClick={(e) => handleOpenStartSessionModal(group, e)}
                          className="flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-neu-sm hover:bg-primary-hover hover:shadow-neu-inner-sm transition-all"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Start Bill</span>
                        </button>

                        <Link
                          to={`/groups/${group.id}/members`}
                          className="flex items-center gap-1 rounded-2xl bg-card px-3.5 py-2.5 text-xs font-semibold text-text-secondary shadow-neu-sm hover:shadow-neu-inner-sm hover:text-text-main transition-all"
                          title="Manage Group Members"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>Members</span>
                        </Link>

                        <button
                          onClick={() => toggleGroupExpand(group.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-text-secondary shadow-neu-sm hover:shadow-neu-inner-sm transition-transform"
                          title={isExpanded ? 'Collapse sessions' : 'Expand sessions'}
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90 text-primary' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Nested Sessions for this Group (Collapsible) */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-text-secondary/10 flex flex-col gap-2.5 animate-in fade-in">
                        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider px-1">
                          Sessions for {group.name}
                        </span>

                        {group.sessions.length === 0 ? (
                          <div className="rounded-2xl bg-card p-4 text-center shadow-neu-inner flex items-center justify-between text-xs">
                            <span className="text-text-secondary">
                              No bills split for this group yet.
                            </span>
                            <button
                              onClick={(e) => handleOpenStartSessionModal(group, e)}
                              className="font-bold text-primary hover:underline"
                            >
                              + Start First Bill Session
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {group.sessions.map((sess) => (
                              <Link
                                key={sess.id}
                                to={`/sessions/${sess.id}`}
                                className="flex items-center justify-between rounded-2xl bg-card p-3.5 px-4 shadow-neu-sm hover:shadow-neu-inner-sm transition-all group/sess"
                              >
                                <div>
                                  <div className="font-bold text-sm text-text-main group-hover/sess:text-primary transition-colors">
                                    {sess.restaurant_name || 'Restaurant Bill'}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-text-secondary mt-0.5">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(sess.created_at).toLocaleDateString()}
                                    </span>
                                    {sess.table_number && <span>• {sess.table_number}</span>}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="font-bold text-sm text-primary font-display">
                                    {formatCurrency(sess.grand_total)}
                                  </div>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg inline-block mt-0.5 ${
                                      sess.status === 'COMPLETED'
                                        ? 'bg-success/15 text-success'
                                        : sess.status === 'LOCKED'
                                        ? 'bg-warning/15 text-warning'
                                        : 'bg-primary/15 text-primary'
                                    }`}
                                  >
                                    {sess.status}
                                  </span>
                                </div>
                              </Link>
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
        </section>

        {/* Modal: Ask for Session Name when Starting Session */}
        {sessionModalGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold font-display text-text-main">
                    Start Bill Session
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Group: <strong>{sessionModalGroup.name}</strong>
                  </p>
                </div>

                <button
                  onClick={() => setSessionModalGroup(null)}
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
                    placeholder="e.g. Sunday Brunch, Team Lunch, Birthday Party"
                    required
                    autoFocus
                    className="rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
                  />
                  <p className="text-[11px] text-text-secondary">
                    Helps you and your diners identify this specific bill.
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
                      placeholder="e.g. Toit, Cafe Mocha"
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
                      placeholder="e.g. Table 4"
                      className="rounded-2xl border-none bg-card p-3 text-xs shadow-neu-inner outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-card shadow-neu-inner text-xs text-text-secondary">
                  👥 <strong>{sessionModalGroup.group_members.length} members</strong> from {sessionModalGroup.name} will be added to this bill session.
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSessionModalGroup(null)}
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
