import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function JoinBill() {
  const [billInput, setBillInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned = billInput.trim();

    if (!cleaned) {
      setError('Please enter a session ID or link.');
      return;
    }

    // Check if it's a full URL
    try {
      if (cleaned.includes('/sessions/')) {
        const parts = cleaned.split('/sessions/');
        const sessionId = parts[1].split('/')[0].split('?')[0];
        navigate(`/sessions/${sessionId}/view`);
        return;
      }
    } catch {}

    // Otherwise treat as sessionId
    navigate(`/sessions/${cleaned}/view`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-neu-outer flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-card text-text-secondary shadow-neu-sm hover:shadow-neu-inner-sm hover:text-text-main"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-2xl font-bold font-display text-text-main">
            Join Restaurant Bill
          </h2>
        </div>

        <p className="text-sm text-text-secondary">
          Enter the Session ID or paste the link shared by your host to view your share.
        </p>

        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-secondary">
              Session ID or Invite Link
            </label>
            <input
              type="text"
              value={billInput}
              onChange={(e) => setBillInput(e.target.value)}
              placeholder="e.g. 55288577-b159-... or paste link"
              className="rounded-2xl border-none bg-card p-4 text-sm shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
              required
            />
          </div>

          {error && <div className="text-xs text-danger font-medium">{error}</div>}

          <button
            type="submit"
            className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-white shadow-neu-sm hover:bg-primary-hover transition-all"
          >
            <span>View Bill</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="rounded-2xl bg-card p-4 shadow-neu-inner text-xs text-text-secondary text-center">
          💡 No account required! Diners can view items and pay directly via UPI.
        </div>
      </div>
    </div>
  );
}
