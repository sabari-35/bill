import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signUpError, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        }
      }
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      // In a real app with triggers, the profiles table would be updated automatically
      // We'll rely on the RLS or an edge function, but for now we navigate away
      navigate('/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-neu-outer">
        <h2 className="mb-2 text-center text-3xl font-bold text-text-main font-display">Create Account</h2>
        <p className="mb-8 text-center text-text-secondary">Start hosting bill sessions.</p>
        
        <form onSubmit={handleSignup} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-text-secondary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
              placeholder="Host Name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-text-secondary">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
              placeholder="host@example.com"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-text-secondary">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && <div className="text-sm text-danger text-center font-medium">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 rounded-2xl bg-primary py-4 text-lg font-semibold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
