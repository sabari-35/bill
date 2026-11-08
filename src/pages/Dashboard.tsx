import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { formatCurrency } from '../lib/utils';
import { 
  Users, 
  Receipt, 
  Play, 
  ChevronRight, 
  Calendar 
} from 'lucide-react';

interface GroupItem {
  id: string;
  name: string;
  restaurant_name: string | null;
  created_at: string;
  member_count?: number;
}

interface SessionItem {
  id: string;
  restaurant_name: string | null;
  table_number: string | null;
  status: string;
  grand_total: number;
  created_at: string;
  groups?: {
    name: string;
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('Host');

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        setUserName(user.user_metadata?.name || user.email?.split('@')[0] || 'Host');

        // Fetch user groups
        const { data: groupsData } = await supabase
          .from('groups')
          .select('*, group_members(id)')
          .eq('host_id', user.id)
          .order('created_at', { ascending: false });

        if (groupsData) {
          const mappedGroups = groupsData.map((g: any) => ({
            ...g,
            member_count: g.group_members?.length || 0,
          }));
          setGroups(mappedGroups);
        }

        // Fetch user sessions
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('*, groups(name)')
          .eq('host_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsData) {
          setSessions(sessionsData);
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [navigate]);

  return (
    <Layout>
      <div className="flex flex-col gap-8 pt-2 pb-12">

        {/* Welcome Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display text-text-main">
              Welcome back, <span className="text-primary">{userName}</span> 👋
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Manage your dining groups and split bills with zero hassle.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/sessions/new"
              className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
            >
              <Play className="h-4 w-4 fill-current" />
              Start Session
            </Link>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider px-1">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/groups/new"
              className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-neu-sm transition-all hover:shadow-neu-inner-sm group"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-neu-sm transition-transform group-hover:scale-105">
                <Users className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-text-main">Create Group</span>
                <span className="text-xs text-text-secondary">Add regular friends & dining circles</span>
              </div>
            </Link>

            <Link
              to="/sessions/new"
              className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-neu-sm transition-all hover:shadow-neu-inner-sm group"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-neu-sm transition-transform group-hover:scale-105">
                <Receipt className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-text-main">New Bill Session</span>
                <span className="text-xs text-text-secondary">Split a new restaurant or cafe check</span>
              </div>
            </Link>
          </div>
        </section>

        {/* Active & Recent Sessions */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Recent Sessions ({sessions.length})
            </h2>
            {sessions.length > 0 && (
              <Link to="/sessions/new" className="text-xs font-semibold text-primary hover:underline">
                + New Session
              </Link>
            )}
          </div>

          {loading ? (
            <div className="rounded-3xl bg-card p-8 text-center shadow-neu-inner">
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-card p-8 text-center shadow-neu-inner">
              <Receipt className="h-10 w-10 text-text-secondary opacity-40 mb-1" />
              <p className="text-text-main font-bold">No active sessions yet.</p>
              <p className="text-xs text-text-secondary max-w-sm">
                Ready for your next dinner? Start a bill session to begin itemizing and splitting.
              </p>
              <Link
                to="/sessions/new"
                className="mt-2 rounded-2xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-neu-sm hover:bg-primary-hover"
              >
                Start First Session
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((sess) => (
                <Link
                  key={sess.id}
                  to={`/sessions/${sess.id}`}
                  className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-neu-sm transition-all hover:shadow-neu-inner-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-text-main">
                        {sess.restaurant_name || 'Restaurant Bill'}
                      </h3>
                      <p className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
                        {sess.table_number && <span>{sess.table_number} • </span>}
                        <span>{sess.groups?.name || 'Group'}</span>
                      </p>
                    </div>

                    <span
                      className={`rounded-xl px-2.5 py-1 text-xs font-bold ${
                        sess.status === 'COMPLETED'
                          ? 'bg-success/20 text-success'
                          : sess.status === 'LOCKED'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-primary/20 text-primary'
                      }`}
                    >
                      {sess.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-text-secondary/10 text-xs">
                    <span className="flex items-center gap-1 text-text-secondary">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(sess.created_at).toLocaleDateString()}
                    </span>
                    <span className="font-bold text-base font-display text-primary">
                      {formatCurrency(sess.grand_total)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Groups Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Your Groups ({groups.length})
            </h2>
            <Link to="/groups/new" className="text-xs font-semibold text-primary hover:underline">
              + New Group
            </Link>
          </div>

          {loading ? (
            <div className="rounded-3xl bg-card p-8 text-center shadow-neu-inner">
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-card p-8 text-center shadow-neu-inner">
              <Users className="h-10 w-10 text-text-secondary opacity-40 mb-1" />
              <p className="text-text-main font-bold">You haven't created any groups yet.</p>
              <p className="text-xs text-text-secondary">
                Groups allow you to save your friends and reuse them across multiple bill sessions.
              </p>
              <Link
                to="/groups/new"
                className="mt-2 rounded-2xl bg-card px-5 py-2.5 text-xs font-bold text-primary shadow-neu-sm hover:shadow-neu-inner-sm"
              >
                Create Your First Group
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {groups.map((grp) => (
                <Link
                  key={grp.id}
                  to={`/groups/${grp.id}/members`}
                  className="flex flex-col justify-between rounded-3xl bg-card p-5 shadow-neu-sm transition-all hover:shadow-neu-inner-sm group"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                        {grp.name.charAt(0).toUpperCase()}
                      </div>
                      <ChevronRight className="h-4 w-4 text-text-secondary group-hover:text-primary transition-colors" />
                    </div>
                    <h3 className="font-bold text-base text-text-main mt-3">
                      {grp.name}
                    </h3>
                    {grp.restaurant_name && (
                      <p className="text-xs text-text-secondary mt-0.5 truncate">
                        📍 {grp.restaurant_name}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 mt-3 border-t border-text-secondary/10 flex items-center justify-between text-xs text-text-secondary">
                    <span>{grp.member_count} member{grp.member_count === 1 ? '' : 's'}</span>
                    <span className="font-semibold text-primary">Manage &rarr;</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </Layout>
  );
}
