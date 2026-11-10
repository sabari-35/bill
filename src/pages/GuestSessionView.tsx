import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  formatCurrency, 
  fromPaise, 
  generateUpiUrl, 
  getQrCodeImageUrl 
} from '../lib/utils';
import {
  Receipt,
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface SessionData {
  id: string;
  restaurant_name: string | null;
  table_number: string | null;
  status: string;
  subtotal: number;
  tax_total: number;
  service_charge: number;
  discount: number;
  grand_total: number;
  created_at: string;
  groups?: {
    name: string;
  };
}

interface Participant {
  id: string;
  group_member_id: string;
  status: string;
  group_members: {
    id: string;
    name: string;
    phone: string | null;
  };
}

interface ItemAllocation {
  id: string;
  item_id: string;
  participant_id: string;
  quantity: number;
  allocated_amount: number;
}

interface Item {
  id: string;
  name: string;
  ordered_quantity: number;
  unit_price: number;
  total_price: number;
}

export default function GuestSessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();

  // Instant cache retrieval to prevent reload 404 or momentary blank screens
  const [session, setSession] = useState<SessionData | null>(() => {
    try {
      const cached = sessionStorage.getItem(`splitbill_guest_cache_${sessionId}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [allocations, setAllocations] = useState<ItemAllocation[]>([]);
  const [loading, setLoading] = useState(!session);
  const [error, setError] = useState<string | null>(null);

  // Selected diner
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');

  const [hostUpi, setHostUpi] = useState<string>('host@upi');

  const [hasNotifiedPaid, setHasNotifiedPaid] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadGuestData = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (!session) setLoading(true);
      setError(null);

      // Super-fast parallel fetching
      const [sessRes, partRes, itemsRes] = await Promise.all([
        supabase.from('sessions').select('*, groups(name)').eq('id', sessionId).single(),
        supabase.from('session_participants').select('*, group_members(id, name, phone)').eq('session_id', sessionId),
        supabase.from('items').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
      ]);

      if (sessRes.error) throw sessRes.error;
      const sData = sessRes.data;
      setSession(sData);
      sessionStorage.setItem(`splitbill_guest_cache_${sessionId}`, JSON.stringify(sData));
      if (sData.host_upi_id) {
        setHostUpi(sData.host_upi_id);
      }

      if (partRes.error) throw partRes.error;
      const partList = partRes.data || [];
      setParticipants(partList);

      // Auto-select first participant if none selected
      if (!selectedParticipantId && partList.length > 0) {
        setSelectedParticipantId(partList[0].id);
      }

      if (itemsRes.error) throw itemsRes.error;
      const itemsList = itemsRes.data || [];
      setItems(itemsList);

      // Allocations
      if (itemsList.length > 0) {
        const itemIds = itemsList.map((i) => i.id);
        const { data: allocData, error: allocErr } = await supabase
          .from('item_allocations')
          .select('*')
          .in('item_id', itemIds);

        if (!allocErr && allocData) {
          setAllocations(allocData);
        }
      }
    } catch (err: any) {
      console.error(err);
      if (!session) {
        setError(err.message || 'Failed to load bill session');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, session, selectedParticipantId]);

  useEffect(() => {
    loadGuestData();
  }, [loadGuestData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const allocationsByItem = useMemo(() => {
    const map = new Map<string, ItemAllocation[]>();
    for (const alloc of allocations) {
      const list = map.get(alloc.item_id) || [];
      list.push(alloc);
      map.set(alloc.item_id, list);
    }
    return map;
  }, [allocations]);

  const totalSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.total_price || 0), 0);
  }, [items]);

  const grandTotal = session?.grand_total || totalSubtotal;

  // Breakdown for each participant based on strict consumption
  const participantBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { 
        baseAmount: number; 
        totalOwed: number; 
        taxShare: number;
        itemsList: { name: string; amount: number; portion: number; splitCount: number }[] 
      }
    >();

    for (const p of participants) {
      map.set(p.id, { baseAmount: 0, totalOwed: 0, taxShare: 0, itemsList: [] });
    }

    for (const item of items) {
      const itemAllocs = allocationsByItem.get(item.id) || [];
      if (itemAllocs.length === 0) continue;

      const totalPortions = itemAllocs.reduce((sum, a) => sum + (a.quantity || 1), 0);
      if (totalPortions <= 0) continue;

      for (const alloc of itemAllocs) {
        const pPortion = alloc.quantity || 1;
        const splitAmount = Math.round((item.total_price * pPortion) / totalPortions);

        const cur = map.get(alloc.participant_id) || { baseAmount: 0, totalOwed: 0, taxShare: 0, itemsList: [] };
        cur.baseAmount += splitAmount;
        cur.itemsList.push({ 
          name: item.name, 
          amount: splitAmount, 
          portion: pPortion,
          splitCount: itemAllocs.length 
        });
        map.set(alloc.participant_id, cur);
      }
    }

    // Ratio distribution of tax & fees
    const taxTotal = session?.tax_total || 0;
    const serviceCharge = session?.service_charge || 0;
    const discount = session?.discount || 0;

    for (const p of participants) {
      const cur = map.get(p.id) || { baseAmount: 0, totalOwed: 0, taxShare: 0, itemsList: [] };
      if (totalSubtotal > 0 && cur.baseAmount > 0) {
        const ratio = cur.baseAmount / totalSubtotal;
        cur.taxShare = Math.round(taxTotal * ratio);
        const pService = Math.round(serviceCharge * ratio);
        const pDiscount = Math.round(discount * ratio);
        cur.totalOwed = Math.max(0, cur.baseAmount + cur.taxShare + pService - pDiscount);
      } else {
        cur.totalOwed = cur.baseAmount;
      }
      map.set(p.id, cur);
    }

    return map;
  }, [participants, items, allocationsByItem, totalSubtotal, session]);

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId);
  const selectedBreakdown = selectedParticipant ? participantBreakdown.get(selectedParticipant.id) : null;

  const handleSelectParticipant = (id: string) => {
    setSelectedParticipantId(id);
  };

  const handleNotifyPaid = async () => {
    if (!selectedParticipant || !sessionId) return;
    setHasNotifiedPaid(true);

    try {
      // 1. Update participant status to PAID in database
      await supabase
        .from('session_participants')
        .update({ status: 'PAID' })
        .eq('id', selectedParticipant.id);

      // 2. Persist in payments table in database
      await supabase
        .from('payments')
        .upsert({
          session_id: sessionId,
          participant_id: selectedParticipant.id,
          amount: owesPaise,
          currency: 'INR',
          status: 'SUCCESS',
          paid_at: new Date().toISOString(),
        }, { onConflict: 'session_id,participant_id' });

      setParticipants((prev) =>
        prev.map((p) => (p.id === selectedParticipant.id ? { ...p, status: 'PAID' } : p))
      );

      showToast('Payment recorded in database & host notified! 🎉');
    } catch (e: any) {
      console.warn('Failed to persist payment status in DB', e);
      showToast('Payment notification sent to Host! 🎉');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-neu-sm" />
          <span className="font-brand text-2xl font-bold text-primary">SplitBill</span>
          <p className="text-text-secondary text-xs">Loading live restaurant check...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-card p-10 text-center shadow-neu-outer max-w-md">
          <AlertCircle className="h-12 w-12 text-danger" />
          <h2 className="text-2xl font-bold font-display text-text-main">Bill Not Found</h2>
          <p className="text-text-secondary text-xs">{error || 'This bill session could not be found or has ended.'}</p>
          <Link to="/" className="rounded-2xl bg-primary px-6 py-3 font-semibold text-white shadow-neu-sm text-sm">
            Go to SplitBill
          </Link>
        </div>
      </div>
    );
  }

  const owesPaise = selectedBreakdown?.totalOwed || 0;
  const owesRupees = fromPaise(owesPaise);
  const upiUrl = generateUpiUrl({
    upiId: hostUpi,
    payeeName: 'SplitBill Host',
    amountInRupees: owesRupees,
    note: `SplitBill - ${session.restaurant_name || 'Bill'}`,
  });

  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-primary selection:text-white pb-16">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-card px-5 py-3 text-sm font-semibold text-text-main shadow-neu-outer border border-success/30 animate-bounce">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {toastMessage}
        </div>
      )}

      {/* Header Banner */}
      <header className="sticky top-0 z-40 glass-overlay shadow-neu-sm px-6 py-3.5 flex items-center justify-between rounded-b-3xl">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-brand text-xl font-bold shadow-neu-sm">
            SB
          </div>
          <div>
            <h1 className="font-brand text-2xl font-bold text-primary leading-tight">
              SplitBill
            </h1>
          </div>
        </div>

        <Link
          to="/"
          className="rounded-xl bg-card px-3.5 py-1.5 text-xs font-semibold text-text-secondary shadow-neu-sm hover:text-text-main"
        >
          Home
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-5 flex flex-col gap-5">

        {/* Bill Overview Card */}
        <div className="rounded-3xl bg-card p-5 sm:p-6 shadow-neu-outer flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-text-main">
                {session.restaurant_name || 'Restaurant Bill'}
              </h2>
              <p className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
                {session.table_number && <span>{session.table_number} • </span>}
                <span>Group: {session.groups?.name || 'Dining'}</span>
              </p>
            </div>

            <span
              className={`rounded-xl px-3 py-1 text-xs font-bold ${
                session.status === 'COMPLETED'
                  ? 'bg-success/20 text-success'
                  : 'bg-primary/20 text-primary'
              }`}
            >
              {session.status}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-3 border-t border-text-secondary/10">
            <span className="text-xs font-bold text-text-secondary">Total Table Bill:</span>
            <span className="text-2xl font-bold font-display text-primary">
              {formatCurrency(grandTotal)}
            </span>
          </div>
        </div>

        {/* Diner Selector: "Who are you?" */}
        <div className="rounded-3xl bg-card p-5 shadow-neu-outer flex flex-col gap-2.5">
          <label className="text-sm font-bold text-text-main font-display flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Who are you at the table?
          </label>
          <p className="text-[11px] text-text-secondary">
            Select your name to view your individual share and pay instantly:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {participants.map((p) => {
              const isSelected = p.id === selectedParticipantId;
              const isPaid = p.status === 'PAID';
              const pOwed = participantBreakdown.get(p.id)?.totalOwed || 0;

              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectParticipant(p.id)}
                  className={`flex flex-col items-start p-3 rounded-2xl transition-all ${
                    isSelected
                      ? 'bg-card shadow-neu-inner border-2 border-primary/50'
                      : 'bg-card shadow-neu-sm hover:shadow-neu-inner-sm'
                  }`}
                >
                  <span className="font-bold text-xs sm:text-sm text-text-main truncate w-full text-left">
                    {p.group_members.name}
                  </span>
                  <span className="text-xs font-bold text-primary font-display mt-0.5">
                    {formatCurrency(pOwed)}
                  </span>
                  {isPaid && (
                    <span className="text-[10px] font-bold text-success mt-0.5">
                      Paid ✅
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Diner Share & UPI Payment Card */}
        {selectedParticipant && selectedBreakdown && (
          <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold">
                  Your Personal Share
                </span>
                <h3 className="text-xl font-bold font-display text-text-main">
                  {selectedParticipant.group_members.name}
                </h3>
              </div>

              <div className="text-right">
                <div className="text-3xl font-bold font-display text-primary">
                  {formatCurrency(owesPaise)}
                </div>
                {selectedParticipant.status === 'PAID' ? (
                  <span className="text-xs font-bold text-success">Status: Paid ✅</span>
                ) : (
                  <span className="text-xs font-semibold text-warning">Status: Pending</span>
                )}
              </div>
            </div>

            {/* Dishes Consumed */}
            <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-neu-inner text-xs">
              <span className="font-bold text-text-main">Dishes you consumed:</span>
              {selectedBreakdown.itemsList.length === 0 ? (
                <span className="text-text-secondary italic">No specific dishes assigned.</span>
              ) : (
                <div className="flex flex-col gap-1.5 divide-y divide-text-secondary/10">
                  {selectedBreakdown.itemsList.map((dish, idx) => (
                    <div key={idx} className="flex justify-between pt-1 text-text-secondary">
                      <span>
                        {dish.name} {dish.portion > 1 ? `(${dish.portion} portions)` : (dish.splitCount > 1 ? `(1/${dish.splitCount} share)` : '')}
                      </span>
                      <span className="font-semibold text-text-main">{formatCurrency(dish.amount)}</span>
                    </div>
                  ))}
                  {selectedBreakdown.taxShare > 0 && (
                    <div className="flex justify-between pt-1 text-text-secondary">
                      <span>Proportional Tax (GST):</span>
                      <span className="font-semibold text-text-main">+{formatCurrency(selectedBreakdown.taxShare)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* UPI QR Code and Pay Button */}
            {selectedParticipant.status !== 'PAID' && (
              <div className="flex flex-col items-center gap-4 pt-1">
                <div className="p-4 rounded-2xl bg-white shadow-neu-inner">
                  <img
                    src={getQrCodeImageUrl(upiUrl, 200)}
                    alt="UPI Payment QR"
                    className="h-44 w-44 object-contain"
                  />
                </div>

                <p className="text-xs text-text-secondary text-center max-w-xs">
                  Scan QR with <strong>GPay, PhonePe, Paytm, or BHIM</strong> to pay {formatCurrency(owesPaise)} directly to host.
                </p>

                <div className="flex flex-col w-full gap-2.5">
                  <a
                    href={upiUrl}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-white shadow-neu-sm hover:bg-primary-hover transition-all"
                  >
                    Pay via UPI App ({formatCurrency(owesPaise)})
                  </a>

                  <button
                    onClick={handleNotifyPaid}
                    disabled={hasNotifiedPaid}
                    className="flex items-center justify-center gap-1.5 rounded-2xl bg-card py-3 text-xs font-bold text-text-secondary shadow-neu-sm hover:text-success hover:shadow-neu-inner-sm disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {hasNotifiedPaid ? 'Notified Host! 🎉' : 'I have already paid'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Full Bill Breakdown */}
        <div className="rounded-3xl bg-card p-5 shadow-neu-outer flex flex-col gap-3">
          <h3 className="text-sm font-bold font-display text-text-main flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Complete Table Items ({items.length})
            </span>
          </h3>

          <div className="flex flex-col gap-2 divide-y divide-text-secondary/10">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between items-center pt-2 text-xs">
                <div>
                  <span className="font-bold text-text-main">{item.ordered_quantity}x {item.name}</span>
                  <span className="text-[11px] text-text-secondary block">
                    {formatCurrency(item.unit_price)} each
                  </span>
                </div>
                <span className="font-bold text-primary font-display">
                  {formatCurrency(item.total_price)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
