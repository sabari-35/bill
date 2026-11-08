import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Fast check local session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        setUser(session.user);
        setLoading(false);
      } else {
        // Fallback check user
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!isMounted) return;
          if (!user) {
            navigate('/login');
          } else {
            setUser(user);
          }
          setLoading(false);
        });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        if (event === 'SIGNED_OUT' || !session) {
          navigate('/login');
        } else {
          setUser(session.user);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-neu-sm" />
          <span className="font-brand text-2xl font-bold text-primary">SplitBill</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-primary selection:text-white pb-20">
      <header className="sticky top-0 z-50 glass-overlay shadow-neu-sm mb-6 px-6 py-3 flex items-center justify-between rounded-b-3xl">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white font-brand text-2xl font-bold shadow-neu-sm transition-transform group-hover:scale-105">
            SB
          </div>
          <span className="font-brand text-3xl font-bold text-primary tracking-wide">
            SplitBill
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-block text-xs font-semibold text-text-secondary bg-card px-3 py-1.5 rounded-xl shadow-neu-inner">
            {user.user_metadata?.name || user.email?.split('@')[0]}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl bg-card px-3.5 py-2 text-xs font-semibold text-text-secondary shadow-neu-sm transition-all hover:shadow-neu-inner-sm hover:text-danger"
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4">
        {children}
      </main>
    </div>
  );
}
