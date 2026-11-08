import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

export default function CreateGroup() {
  const [name, setName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Get current user to set as host
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setError("You must be logged in to create a group.");
      setLoading(false);
      return;
    }

    // Ensure profile exists (handles users created before the DB trigger)
    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: user.user_metadata?.name || 'Host',
        email: user.email,
      }, { onConflict: 'id' });

    const { data, error: insertError } = await supabase
      .from('groups')
      .insert([
        { 
          host_id: user.id, 
          name, 
          restaurant_name: restaurantName || null 
        }
      ])
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
    } else if (data) {
      // Successfully created, now redirect to add members
      navigate(`/groups/${data.id}/members`);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-4">
        <div className="flex items-center gap-4 px-2">
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-neu-sm transition-all hover:shadow-neu-inner-sm text-text-secondary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <h2 className="text-2xl font-bold text-text-main font-display">Create New Group</h2>
        </div>

        <div className="rounded-3xl bg-card p-8 shadow-neu-outer">
          <form onSubmit={handleCreateGroup} className="flex flex-col gap-6">
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-text-secondary">Group Name <span className="text-danger">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
                placeholder="e.g. Sunday Dinner"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-text-secondary">Restaurant / Location <span className="font-normal opacity-70">(Optional)</span></label>
              <input
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="rounded-2xl border-none bg-card p-4 shadow-neu-inner outline-none transition-all focus:shadow-neu-inner-sm"
                placeholder="e.g. ABC Restaurant"
              />
            </div>

            {error && <div className="text-sm text-danger text-center font-medium">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 rounded-2xl bg-primary py-4 text-lg font-semibold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
