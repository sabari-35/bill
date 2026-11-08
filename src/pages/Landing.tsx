import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Utensils, DollarSign, ArrowRight, QrCode, Sparkles } from 'lucide-react';

export default function Landing() {
  const [user, setUser] = useState<any>(null);
  const [quickCode, setQuickCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickCode.trim();
    if (!clean) return;

    if (clean.includes('/sessions/')) {
      const sessionId = clean.split('/sessions/')[1].split('/')[0];
      navigate(`/sessions/${sessionId}/view`);
    } else {
      navigate(`/sessions/${clean}/view`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-primary selection:text-white flex flex-col justify-between">
      
      {/* Top Navbar */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white font-bold font-display text-lg shadow-neu-sm">
            SB
          </div>
          <span className="text-2xl font-bold tracking-tight text-primary font-display">
            SplitBill
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Link
              to="/dashboard"
              className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
            >
              Dashboard &rarr;
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-2xl bg-card px-5 py-2.5 text-sm font-semibold text-text-main shadow-neu-sm transition-all hover:shadow-neu-inner-sm"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="hidden sm:inline-flex rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-4xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 rounded-2xl bg-card px-4 py-2 text-xs font-bold text-primary shadow-neu-inner mb-6">
          <Sparkles className="h-4 w-4" />
          Zero-Math Restaurant Bill Splitting
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-text-main font-display max-w-2xl leading-[1.15]">
          Split the food. <br />
          <span className="text-primary">Not the friendship.</span>
        </h1>

        <p className="mt-5 max-w-xl text-base sm:text-lg text-text-secondary leading-relaxed">
          The cleanest way to itemize dishes, divide shared appetizers, accurately split taxes and tips, and settle instantly with Indian UPI.
        </p>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {user ? (
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
            >
              <span>Host a Bill</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          )}

          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-2 rounded-2xl bg-card px-8 py-4 text-lg font-semibold text-text-main shadow-neu-sm transition-all hover:shadow-neu-inner-sm hover:text-primary"
          >
            <QrCode className="h-5 w-5 text-primary" />
            <span>Join with Code</span>
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full text-left">
          <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Utensils className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-text-main font-display">Itemized Sharing</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Didn't drink? Only shared the nachos? Assign each dish exactly to who ate it with one tap.
            </p>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <DollarSign className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-text-main font-display">Proportional Tax & GST</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              GST, service charges, and discounts are distributed proportionally according to what each diner ordered.
            </p>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <QrCode className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-text-main font-display">Instant UPI QR</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Guests scan your bill QR code to open their personal check and pay directly via GPay, PhonePe, or Paytm.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-text-secondary border-t border-text-secondary/10">
        SplitBill &copy; {new Date().getFullYear()} • Smart Restaurant Bill Splitting
      </footer>

      {/* Join Bill Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer text-left animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-bold font-display text-text-main mb-2">
              Join Bill Session
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              Enter the Session ID or paste the link shared by your host:
            </p>

            <form onSubmit={handleQuickJoin} className="flex flex-col gap-4">
              <input
                type="text"
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                placeholder="Paste session code or URL"
                required
                className="rounded-2xl border-none bg-card p-4 text-xs shadow-neu-inner outline-none"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="rounded-2xl bg-card px-4 py-2.5 text-xs font-semibold text-text-secondary shadow-neu-sm hover:text-text-main"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-neu-sm hover:bg-primary-hover"
                >
                  View Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
