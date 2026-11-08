import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate('/login');
      } else {
        setUser(user);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          navigate('/login');
        } else {
          setUser(session.user);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  if (!user) return null; // or a loading spinner

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-primary selection:text-white pb-20">
      <header className="sticky top-0 z-50 glass-overlay shadow-neu-sm mb-6 px-6 py-4 flex items-center justify-between rounded-b-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-primary font-display">SplitBill</h1>
        <button
          onClick={handleLogout}
          className="rounded-xl bg-card px-4 py-2 text-sm font-semibold text-text-secondary shadow-neu-sm transition-all hover:shadow-neu-inner-sm hover:text-danger"
        >
          Logout
        </button>
      </header>
      <main className="mx-auto max-w-4xl px-4">
        {children}
      </main>
    </div>
  );
}
