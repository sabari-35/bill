import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { 
  formatCurrency, 
  toPaise, 
  fromPaise, 
  generateUpiUrl, 
  getQrCodeImageUrl,
  generateWhatsAppUrl
} from '../lib/utils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  CheckCircle2,
  QrCode,
  Copy,
  ExternalLink,
  Lock,
  Unlock,
  Check,
  Utensils,
  DollarSign,
  AlertCircle,
  X,
  Sliders,
  ChevronDown,
  ChevronUp,
  Minus
} from 'lucide-react';

interface SessionData {
  id: string;
  group_id: string;
  host_id: string;
  restaurant_name: string | null;
  table_number: string | null;
  currency: string;
  status: string;
  subtotal: number; // in paise
  tax_total: number;
  service_charge: number;
  discount: number;
  round_off: number;
  grand_total: number;
  created_at: string;
  groups?: {
    name: string;
  };
}

interface Participant {
  id: string; // session_participants.id
  group_member_id: string;
  status: string; // 'JOINED', 'PAID', etc.
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
  split_type: string;
  allocated_amount: number; // in paise
}

interface Item {
  id: string;
  session_id: string;
  name: string;
  category: string | null;
  ordered_quantity: number;
  unit_price: number; // in paise
  total_price: number; // in paise
  price_status: string;
  item_allocations?: ItemAllocation[];
}

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export default function SessionWorkspace() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionData | null>(() => {
    // Instant cache retrieval to prevent reload 404
    try {
      const cached = sessionStorage.getItem(`splitbill_cache_sess_${sessionId}`);
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

  // Additional Charges state
  const [taxPercent, setTaxPercent] = useState<number>(5);
  const [serviceChargeRupees, setServiceChargeRupees] = useState<number>(0);
  const [discountRupees, setDiscountRupees] = useState<number>(0);

  // Host UPI configuration
  const [hostUpiId, setHostUpiId] = useState<string>(() => {
    return localStorage.getItem('splitbill_host_upi') || 'host@upi';
  });

  // Modal states
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isWhatsAppShareModalOpen, setIsWhatsAppShareModalOpen] = useState(false);
  const [activePaymentParticipant, setActivePaymentParticipant] = useState<Participant | null>(null);
  
  // Direct WhatsApp Phone prompt modal for a participant
  const [phonePromptParticipant, setPhonePromptParticipant] = useState<Participant | null>(null);
  const [enteredPhone, setEnteredPhone] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Expandable diner breakdowns
  const [expandedDinerIds, setExpandedDinerIds] = useState<Set<string>>(new Set());

  // New Item form state: Supports Shared, Portions, and Solo splits
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemCategory, setNewItemCategory] = useState('Food');
  
  // Map of participantId -> quantity/portion for this dish (defaults to 1 each for selected)
  const [dinerPortions, setDinerPortions] = useState<{ [participantId: string]: number }>({});
  const [splitMode, setSplitMode] = useState<'SELECTED' | 'PORTIONS' | 'SOLO'>('SELECTED');
  const [soloParticipantId, setSoloParticipantId] = useState<string>('');
  const [addingItem, setAddingItem] = useState(false);

  // Edit Split on Existing Item Modal
  const [editingSplitItem, setEditingSplitItem] = useState<Item | null>(null);
  const [editingPortions, setEditingPortions] = useState<{ [participantId: string]: number }>({});

  // Super-fast parallel query execution
  const loadSessionData = useCallback(async () => {
    if (!sessionId) return;
    try {
      if (!session) setLoading(true);
      setError(null);

      // Execute queries in parallel for ultra-fast performance
      const [sessRes, partRes, itemsRes] = await Promise.all([
        supabase.from('sessions').select('*, groups(name)').eq('id', sessionId).single(),
        supabase.from('session_participants').select('*, group_members(id, name, phone)').eq('session_id', sessionId),
        supabase.from('items').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
      ]);

      if (sessRes.error) throw sessRes.error;
      setSession(sessRes.data);
      sessionStorage.setItem(`splitbill_cache_sess_${sessionId}`, JSON.stringify(sessRes.data));

      if (partRes.error) throw partRes.error;
      setParticipants(partRes.data || []);

      if (itemsRes.error) throw itemsRes.error;
      const itemsList = itemsRes.data || [];
      setItems(itemsList);

      // Fetch allocations for items
      if (itemsList.length > 0) {
        const itemIds = itemsList.map((i) => i.id);
        const { data: allocData, error: allocErr } = await supabase
          .from('item_allocations')
          .select('*')
          .in('item_id', itemIds);

        if (!allocErr && allocData) {
          setAllocations(allocData);
        }
      } else {
        setAllocations([]);
      }
    } catch (err: any) {
      console.error(err);
      if (!session) {
        setError(err.message || 'Failed to load session');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, session]);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Helper: map item allocations
  const allocationsByItem = useMemo(() => {
    const map = new Map<string, ItemAllocation[]>();
    for (const alloc of allocations) {
      const list = map.get(alloc.item_id) || [];
      list.push(alloc);
      map.set(alloc.item_id, list);
    }
    return map;
  }, [allocations]);

  // Compute calculated subtotal from items in paise
  const calculatedSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.total_price || 0), 0);
  }, [items]);

  // Compute Tax, Tip, Discount, Grand Total
  const calculatedTaxTotal = useMemo(() => {
    return Math.round(calculatedSubtotal * (taxPercent / 100));
  }, [calculatedSubtotal, taxPercent]);

  const calculatedServiceCharge = useMemo(() => {
    return toPaise(serviceChargeRupees);
  }, [serviceChargeRupees]);

  const calculatedDiscount = useMemo(() => {
    return toPaise(discountRupees);
  }, [discountRupees]);

  const calculatedGrandTotal = useMemo(() => {
    const total = calculatedSubtotal + calculatedTaxTotal + calculatedServiceCharge - calculatedDiscount;
    return Math.max(0, total);
  }, [calculatedSubtotal, calculatedTaxTotal, calculatedServiceCharge, calculatedDiscount]);

  // COMPREHENSIVE MATHEMATICAL BREAKDOWN:
  // Handles multi-item, shared dishes, specific portions, and solo items accurately!
  const participantBreakdown = useMemo(() => {
    const breakdown = new Map<
      string,
      { 
        baseAmount: number; 
        totalOwed: number; 
        taxShare: number;
        serviceShare: number;
        discountShare: number;
        dishes: { 
          name: string; 
          amount: number; 
          portion: number; 
          totalDishQty: number; 
          totalDishPrice: number;
          splitCount: number;
        }[] 
      }
    >();

    // Initialize all participants with 0
    for (const p of participants) {
      breakdown.set(p.id, { 
        baseAmount: 0, 
        totalOwed: 0, 
        taxShare: 0,
        serviceShare: 0,
        discountShare: 0,
        dishes: [] 
      });
    }

    // Allocate each dish strictly based on who consumed it and their portion
    for (const item of items) {
      const itemAllocs = allocationsByItem.get(item.id) || [];
      if (itemAllocs.length === 0) continue;

      // Sum total portions assigned for this dish
      const totalPortionsAssigned = itemAllocs.reduce((sum, a) => sum + (a.quantity || 1), 0);
      if (totalPortionsAssigned <= 0) continue;

      for (const alloc of itemAllocs) {
        const pPortion = alloc.quantity || 1;
        // Exact proportion of this dish's total price
        const shareForThisPerson = Math.round((item.total_price * pPortion) / totalPortionsAssigned);

        const cur = breakdown.get(alloc.participant_id) || { 
          baseAmount: 0, 
          totalOwed: 0, 
          taxShare: 0, 
          serviceShare: 0, 
          discountShare: 0, 
          dishes: [] 
        };

        cur.baseAmount += shareForThisPerson;
        cur.dishes.push({
          name: item.name,
          amount: shareForThisPerson,
          portion: pPortion,
          totalDishQty: item.ordered_quantity,
          totalDishPrice: item.total_price,
          splitCount: itemAllocs.length,
        });

        breakdown.set(alloc.participant_id, cur);
      }
    }

    // Fair proportional distribution of Taxes, Service Charge, and Discounts:
    // Diners who consumed more pay their fair proportion of tax; diners who consumed 0 pay 0 tax!
    for (const p of participants) {
      const cur = breakdown.get(p.id) || { 
        baseAmount: 0, 
        totalOwed: 0, 
        taxShare: 0, 
        serviceShare: 0, 
        discountShare: 0, 
        dishes: [] 
      };

      if (calculatedSubtotal > 0 && cur.baseAmount > 0) {
        const ratio = cur.baseAmount / calculatedSubtotal;
        cur.taxShare = Math.round(calculatedTaxTotal * ratio);
        cur.serviceShare = Math.round(calculatedServiceCharge * ratio);
        cur.discountShare = Math.round(calculatedDiscount * ratio);
        cur.totalOwed = Math.max(0, cur.baseAmount + cur.taxShare + cur.serviceShare - cur.discountShare);
      } else {
        cur.totalOwed = cur.baseAmount;
      }

      breakdown.set(p.id, cur);
    }

    return breakdown;
  }, [participants, items, allocationsByItem, calculatedSubtotal, calculatedTaxTotal, calculatedServiceCharge, calculatedDiscount]);

  // Sync totals to DB
  const syncSessionTotals = useCallback(async () => {
    if (!sessionId) return;
    try {
      await supabase
        .from('sessions')
        .update({
          subtotal: calculatedSubtotal,
          tax_total: calculatedTaxTotal,
          service_charge: calculatedServiceCharge,
          discount: calculatedDiscount,
          grand_total: calculatedGrandTotal,
        })
        .eq('id', sessionId);
    } catch (e) {
      console.warn('Could not sync session totals to DB', e);
    }
  }, [sessionId, calculatedSubtotal, calculatedTaxTotal, calculatedServiceCharge, calculatedDiscount, calculatedGrandTotal]);

  useEffect(() => {
    if (session) {
      syncSessionTotals();
    }
  }, [syncSessionTotals, session]);

  // Generate personalized WhatsApp message for a diner
  const getPersonalWhatsAppMessage = useCallback((p: Participant) => {
    const info = participantBreakdown.get(p.id);
    const owes = info?.totalOwed || 0;
    const shareUrl = `${window.location.origin}/sessions/${sessionId}/view`;

    let msg = `Hi *${p.group_members.name}*! 🍽️\n\n`;
    msg += `Here is your bill share for *${session?.restaurant_name || 'Restaurant Bill'}*`;
    if (session?.table_number) msg += ` (${session.table_number})`;
    msg += `:\n\n`;

    if (info?.dishes && info.dishes.length > 0) {
      msg += `🍔 *Items you consumed:*\n`;
      info.dishes.forEach((d) => {
        const label = d.portion > 1 ? `${d.portion} portions` : (d.splitCount > 1 ? `shared` : 'solo');
        msg += `• ${d.name} (${label}): ${formatCurrency(d.amount)}\n`;
      });
      if (info.taxShare > 0) {
        msg += `• Proportional Tax (GST): ${formatCurrency(info.taxShare)}\n`;
      }
      if (info.serviceShare > 0) {
        msg += `• Service Charge / Tip: ${formatCurrency(info.serviceShare)}\n`;
      }
      if (info.discountShare > 0) {
        msg += `• Discount: -${formatCurrency(info.discountShare)}\n`;
      }
      msg += `\n`;
    } else {
      msg += `No dishes assigned.\n\n`;
    }

    msg += `💰 *Your Total to Pay: ${formatCurrency(owes)}*\n\n`;
    msg += `💳 *Pay Host UPI:* ${hostUpiId}\n`;
    msg += `🔗 *View Live Bill & Pay:* ${shareUrl}\n\n`;
    msg += `Thank you! ✨`;

    return msg;
  }, [participantBreakdown, sessionId, session, hostUpiId]);

  // Generate Full Group Summary WhatsApp message
  const getGroupWhatsAppSummaryMessage = useCallback(() => {
    const shareUrl = `${window.location.origin}/sessions/${sessionId}/view`;
    let text = `🍽️ *SplitBill Summary - ${session?.restaurant_name || 'Bill'}*\n`;
    if (session?.table_number) text += `📍 ${session.table_number}\n`;
    text += `💰 Grand Total: ${formatCurrency(calculatedGrandTotal)}\n\n`;
    text += `👥 *Individual Share:*\n`;

    for (const p of participants) {
      const owes = participantBreakdown.get(p.id)?.totalOwed || 0;
      const isPaid = p.status === 'PAID';
      text += `• ${p.group_members.name}: ${formatCurrency(owes)} ${isPaid ? '✅ (Paid)' : '⏳ (Pending)'}\n`;
    }

    text += `\n💳 *Pay Host UPI:* ${hostUpiId}\n`;
    text += `📱 *View Live Bill Link:* ${shareUrl}\n`;
    return text;
  }, [session, calculatedGrandTotal, participants, participantBreakdown, hostUpiId, sessionId]);

  // Direct WhatsApp send trigger
  const handleDirectWhatsAppSend = (p: Participant) => {
    const phone = p.group_members.phone;
    if (!phone) {
      setPhonePromptParticipant(p);
      setEnteredPhone('');
      return;
    }

    const msg = getPersonalWhatsAppMessage(p);
    const url = generateWhatsAppUrl({ phone, message: msg });
    window.open(url, '_blank');
    showToast(`Opening WhatsApp for ${p.group_members.name}...`);
  };

  // Save phone number and open WhatsApp immediately
  const handleSavePhoneAndSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phonePromptParticipant) return;

    const rawPhone = enteredPhone.trim();
    if (!rawPhone) return;

    try {
      const { error } = await supabase
        .from('group_members')
        .update({ phone: rawPhone })
        .eq('id', phonePromptParticipant.group_members.id);

      if (error) throw error;

      setParticipants((prev) =>
        prev.map((item) =>
          item.id === phonePromptParticipant.id
            ? { ...item, group_members: { ...item.group_members, phone: rawPhone } }
            : item
        )
      );

      const msg = getPersonalWhatsAppMessage(phonePromptParticipant);
      const url = generateWhatsAppUrl({ phone: rawPhone, message: msg });
      window.open(url, '_blank');

      setPhonePromptParticipant(null);
      showToast(`Phone saved & WhatsApp opened!`);
    } catch (err: any) {
      alert(`Error saving phone: ${err.message}`);
    }
  };

  // Open Add Item modal with smart defaults
  const handleOpenAddItem = () => {
    setNewItemName('');
    setNewItemPrice('');
    setNewItemQty(1);
    setNewItemCategory('Food');
    setSplitMode('SELECTED');
    
    // Default: all participants selected with 1 portion
    const initialPortions: { [id: string]: number } = {};
    participants.forEach((p) => {
      initialPortions[p.id] = 1;
    });
    setDinerPortions(initialPortions);

    if (participants.length > 0) {
      setSoloParticipantId(participants[0].id);
    }
    setIsAddItemOpen(true);
  };

  // Add Item to Bill
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice || !sessionId) return;

    setAddingItem(true);
    try {
      const unitPricePaise = toPaise(newItemPrice);
      const totalPricePaise = unitPricePaise * newItemQty;

      // 1. Insert item
      const { data: itemData, error: itemErr } = await supabase
        .from('items')
        .insert([
          {
            session_id: sessionId,
            name: newItemName.trim(),
            category: newItemCategory,
            ordered_quantity: newItemQty,
            unit_price: unitPricePaise,
            total_price: totalPricePaise,
            price_status: 'PRICED',
          },
        ])
        .select()
        .single();

      if (itemErr) throw itemErr;

      // 2. Prepare allocations based on selected mode
      let allocRows: any[] = [];

      if (splitMode === 'SOLO') {
        // Entire dish assigned to one diner
        if (soloParticipantId) {
          allocRows = [
            {
              item_id: itemData.id,
              participant_id: soloParticipantId,
              quantity: newItemQty,
              split_type: 'SOLO',
              allocated_amount: totalPricePaise,
            },
          ];
        }
      } else {
        // Shared or Portions: only diners with portion > 0
        const activeEntries = Object.entries(dinerPortions).filter(([_, qty]) => qty > 0);
        const totalAssignedPortions = activeEntries.reduce((sum, [_, qty]) => sum + qty, 0);

        allocRows = activeEntries.map(([pId, qty]) => ({
          item_id: itemData.id,
          participant_id: pId,
          quantity: qty,
          split_type: splitMode === 'PORTIONS' ? 'PORTION' : 'EQUAL',
          allocated_amount: Math.round((totalPricePaise * qty) / Math.max(1, totalAssignedPortions)),
        }));
      }

      if (allocRows.length > 0) {
        const { data: allocData, error: allocErr } = await supabase
          .from('item_allocations')
          .insert(allocRows)
          .select();

        if (allocErr) throw allocErr;
        setAllocations((prev) => [...prev, ...(allocData || [])]);
      }

      setItems((prev) => [...prev, itemData]);
      setIsAddItemOpen(false);
      showToast(`${itemData.name} added to bill!`);
    } catch (err: any) {
      alert(`Error adding item: ${err.message}`);
    } finally {
      setAddingItem(false);
    }
  };

  // Open Edit Split modal for an existing item
  const handleOpenEditSplit = (item: Item) => {
    setEditingSplitItem(item);
    const itemAllocs = allocationsByItem.get(item.id) || [];
    const portMap: { [pId: string]: number } = {};

    participants.forEach((p) => {
      const match = itemAllocs.find((a) => a.participant_id === p.id);
      portMap[p.id] = match ? (match.quantity || 1) : 0;
    });

    setEditingPortions(portMap);
  };

  // Save updated split on an item
  const handleSaveEditSplit = async () => {
    if (!editingSplitItem) return;

    try {
      const activeEntries = Object.entries(editingPortions).filter(([_, qty]) => qty > 0);
      if (activeEntries.length === 0) {
        alert('At least one diner must be assigned to this dish.');
        return;
      }

      // Delete old allocations for this item
      await supabase.from('item_allocations').delete().eq('item_id', editingSplitItem.id);

      const totalPortions = activeEntries.reduce((sum, [_, q]) => sum + q, 0);
      const newRows = activeEntries.map(([pId, qty]) => ({
        item_id: editingSplitItem.id,
        participant_id: pId,
        quantity: qty,
        split_type: qty > 1 ? 'PORTION' : 'EQUAL',
        allocated_amount: Math.round((editingSplitItem.total_price * qty) / totalPortions),
      }));

      const { data, error } = await supabase.from('item_allocations').insert(newRows).select();
      if (error) throw error;

      // Update state
      setAllocations((prev) => [
        ...prev.filter((a) => a.item_id !== editingSplitItem.id),
        ...(data || []),
      ]);

      setEditingSplitItem(null);
      showToast(`Split updated for ${editingSplitItem.name}!`);
    } catch (err: any) {
      alert(`Error updating split: ${err.message}`);
    }
  };

  // Quick toggle diner in/out of an item from the main screen
  const handleToggleItemParticipant = async (itemId: string, participantId: string) => {
    const itemAllocs = allocationsByItem.get(itemId) || [];
    const existing = itemAllocs.find((a) => a.participant_id === participantId);

    try {
      if (existing) {
        if (itemAllocs.length <= 1) {
          alert('At least one person must remain assigned to this item.');
          return;
        }
        await supabase.from('item_allocations').delete().eq('id', existing.id);
        setAllocations((prev) => prev.filter((a) => a.id !== existing.id));
      } else {
        const { data, error } = await supabase
          .from('item_allocations')
          .insert([
            {
              item_id: itemId,
              participant_id: participantId,
              split_type: 'EQUAL',
              quantity: 1,
              allocated_amount: 0,
            },
          ])
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setAllocations((prev) => [...prev, data]);
        }
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete Item
  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Remove "${itemName}" from bill?`)) return;

    try {
      const { error: delErr } = await supabase.from('items').delete().eq('id', itemId);
      if (delErr) throw delErr;

      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setAllocations((prev) => prev.filter((a) => a.item_id !== itemId));
      showToast(`Removed "${itemName}"`);
    } catch (err: any) {
      alert(`Error deleting item: ${err.message}`);
    }
  };

  // Toggle payment status (PAID / UNPAID)
  const handleTogglePaymentStatus = async (participant: Participant) => {
    const newStatus = participant.status === 'PAID' ? 'JOINED' : 'PAID';

    try {
      const { error } = await supabase
        .from('session_participants')
        .update({ status: newStatus })
        .eq('id', participant.id);

      if (error) throw error;

      setParticipants((prev) =>
        prev.map((p) => (p.id === participant.id ? { ...p, status: newStatus } : p))
      );

      showToast(
        newStatus === 'PAID'
          ? `Marked ${participant.group_members.name} as Paid! ✅`
          : `Marked ${participant.group_members.name} as Unpaid.`
      );
    } catch (err: any) {
      alert(`Error updating payment: ${err.message}`);
    }
  };

  // Toggle Session Status
  const handleUpdateSessionStatus = async (newStatus: string) => {
    if (!sessionId) return;
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: newStatus })
        .eq('id', sessionId);

      if (error) throw error;
      setSession((prev) => (prev ? { ...prev, status: newStatus } : null));
      showToast(`Session status updated to ${newStatus}`);
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const toggleDinerBreakdown = (pId: string) => {
    setExpandedDinerIds((prev) => {
      const next = new Set(prev);
      if (next.has(pId)) next.delete(pId);
      else next.add(pId);
      return next;
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-neu-sm" />
            <p className="text-text-secondary font-medium text-xs">Opening bill workspace...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !session) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-card p-10 text-center shadow-neu-outer mt-6">
          <AlertCircle className="h-12 w-12 text-danger" />
          <h2 className="text-2xl font-bold font-display text-text-main">Session Not Found</h2>
          <p className="text-text-secondary text-xs">{error || 'This bill session could not be found.'}</p>
          <Link to="/dashboard" className="rounded-2xl bg-primary px-6 py-3 font-semibold text-white shadow-neu-sm">
            Back to Dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  const shareUrl = `${window.location.origin}/sessions/${sessionId}/view`;

  return (
    <Layout>
      <div className="flex flex-col gap-6 pt-2 pb-16">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-2xl bg-card px-5 py-3 text-sm font-semibold text-text-main shadow-neu-outer border border-primary/20 animate-bounce">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {toastMessage}
          </div>
        )}

        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-text-secondary shadow-neu-sm transition-all hover:shadow-neu-inner-sm hover:text-text-main"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl sm:text-3xl font-bold font-display text-text-main">
                  {session.restaurant_name || 'Restaurant Bill'}
                </h2>
                <span
                  className={`rounded-xl px-3 py-0.5 text-xs font-bold ${
                    session.status === 'COMPLETED'
                      ? 'bg-success/20 text-success'
                      : session.status === 'LOCKED'
                      ? 'bg-warning/20 text-warning'
                      : 'bg-primary/20 text-primary'
                  }`}
                >
                  {session.status}
                </span>
              </div>
              <p className="text-xs text-text-secondary flex items-center gap-2 mt-0.5">
                {session.table_number && <span>{session.table_number} • </span>}
                <span>Group: {session.groups?.name || 'Dining'}</span>
                <span>• {participants.length} Diners</span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Direct WhatsApp Share Button */}
            <button
              onClick={() => setIsWhatsAppShareModalOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-bold text-success shadow-neu-sm transition-all hover:shadow-neu-inner-sm border border-success/30"
              title="Send bill directly via WhatsApp"
            >
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
              <span>Send WhatsApp</span>
            </button>

            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-text-main shadow-neu-sm transition-all hover:text-primary hover:shadow-neu-inner-sm"
              title="Share Bill QR Code"
            >
              <QrCode className="h-4 w-4 text-primary" />
              <span>Share QR</span>
            </button>

            {session.status === 'DRAFT' ? (
              <button
                onClick={() => handleUpdateSessionStatus('LOCKED')}
                className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-warning shadow-neu-sm hover:shadow-neu-inner-sm"
              >
                <Lock className="h-4 w-4" />
                <span>Lock Bill</span>
              </button>
            ) : session.status === 'LOCKED' ? (
              <button
                onClick={() => handleUpdateSessionStatus('COMPLETED')}
                className="flex items-center gap-1.5 rounded-2xl bg-success px-5 py-3 text-sm font-semibold text-white shadow-neu-sm hover:opacity-90"
              >
                <Check className="h-4 w-4" />
                <span>Mark Completed</span>
              </button>
            ) : (
              <button
                onClick={() => handleUpdateSessionStatus('DRAFT')}
                className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-text-secondary shadow-neu-sm hover:shadow-neu-inner-sm"
              >
                <Unlock className="h-4 w-4" />
                <span>Reopen</span>
              </button>
            )}
          </div>
        </div>

        {/* Diners / Participants Bar */}
        <div className="rounded-3xl bg-card p-4 sm:p-5 shadow-neu-outer">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              Dining Participants ({participants.length})
            </h3>
            <span className="text-[11px] text-text-secondary">Tap any diner to view UPI QR or WhatsApp</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none">
            {participants.map((p) => {
              const owes = participantBreakdown.get(p.id)?.totalOwed || 0;
              const isPaid = p.status === 'PAID';

              return (
                <div
                  key={p.id}
                  className={`flex flex-col justify-between gap-2 rounded-2xl p-3 min-w-[155px] text-left transition-all ${
                    isPaid
                      ? 'bg-card shadow-neu-inner border border-success/30'
                      : 'bg-card shadow-neu-sm hover:shadow-neu-inner-sm'
                  }`}
                >
                  <button
                    onClick={() => setActivePaymentParticipant(p)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-sm text-text-main truncate">
                        {p.group_members.name}
                      </span>
                      {isPaid ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-primary font-display mt-0.5 block">
                      {formatCurrency(owes)}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg inline-block mt-1 ${
                        isPaid ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleDirectWhatsAppSend(p)}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-card py-1.5 text-[11px] font-bold text-success shadow-neu-inner-sm hover:bg-success/10 transition-colors"
                    title={p.group_members.phone ? `Send to ${p.group_members.phone}` : 'Enter phone & send'}
                  >
                    <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Grid: Items Section + Summary & Settlement */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Items Ordered & Dish Splitting */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-bold font-display text-text-main">
                    Bill Items ({items.length})
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Select exactly who ate each dish or assign portions
                  </p>
                </div>

                <button
                  onClick={handleOpenAddItem}
                  className="flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Dish
                </button>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-card p-10 text-center shadow-neu-inner">
                  <Utensils className="h-10 w-10 text-text-secondary opacity-30 mb-2" />
                  <p className="font-bold text-text-main">No dishes added yet</p>
                  <p className="text-xs text-text-secondary max-w-sm mt-1">
                    Add food & beverages from your check. You can split equally, assign portions, or assign solo dishes!
                  </p>
                  <button
                    onClick={handleOpenAddItem}
                    className="mt-4 rounded-xl bg-card px-5 py-2.5 text-xs font-bold text-primary shadow-neu-sm hover:shadow-neu-inner-sm"
                  >
                    + Add First Dish
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {items.map((item) => {
                    const itemAllocs = allocationsByItem.get(item.id) || [];
                    const assignedParticipantIds = new Set(itemAllocs.map((a) => a.participant_id));
                    const totalPortions = itemAllocs.reduce((s, a) => s + (a.quantity || 1), 0);

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-neu-sm transition-all hover:shadow-neu-inner-sm"
                      >
                        {/* Item Row Top */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                              {item.ordered_quantity}x
                            </div>
                            <div>
                              <div className="font-bold text-text-main text-base">{item.name}</div>
                              <div className="text-xs text-text-secondary flex items-center gap-2">
                                <span>{formatCurrency(item.unit_price)} each</span>
                                <span>•</span>
                                <span className="font-semibold text-primary font-display">
                                  {formatCurrency(item.total_price)}
                                </span>
                                {itemAllocs.length > 0 && (
                                  <span className="text-[11px] text-text-secondary">
                                    • {itemAllocs.length} {itemAllocs.length === 1 ? 'diner' : 'diners'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditSplit(item)}
                              className="flex items-center gap-1 rounded-xl bg-card px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:text-primary shadow-neu-sm hover:shadow-neu-inner-sm transition-all"
                              title="Customize Portions / Split"
                            >
                              <Sliders className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Portions</span>
                            </button>

                            <button
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Remove dish"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Diner Allocation Chips (Click to toggle in/out) */}
                        <div className="flex flex-col gap-1.5 pt-2 border-t border-text-secondary/10">
                          <div className="flex items-center justify-between text-[11px] text-text-secondary">
                            <span>Consumed by (tap to toggle):</span>
                            <span>{totalPortions} portion{totalPortions === 1 ? '' : 's'} assigned</span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {participants.map((p) => {
                              const alloc = itemAllocs.find((a) => a.participant_id === p.id);
                              const isAssigned = Boolean(alloc);
                              const portion = alloc ? (alloc.quantity || 1) : 0;
                              const share = isAssigned && totalPortions > 0 
                                ? Math.round((item.total_price * portion) / totalPortions) 
                                : 0;

                              return (
                                <button
                                  key={p.id}
                                  onClick={() => handleToggleItemParticipant(item.id, p.id)}
                                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    isAssigned
                                      ? 'bg-primary text-white shadow-neu-inner-sm'
                                      : 'bg-card text-text-secondary shadow-neu-sm hover:text-text-main'
                                  }`}
                                  title={isAssigned ? `Paying ${formatCurrency(share)}` : 'Click to add to dish'}
                                >
                                  <span>{p.group_members.name}</span>
                                  {isAssigned && (
                                    <span className="text-[10px] opacity-90 font-mono">
                                      ({portion > 1 ? `${portion}x • ` : ''}{formatCurrency(share)})
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bill Adjustments: GST, Tip & Discount */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer">
              <h3 className="text-lg font-bold font-display text-text-main mb-4">
                Taxes, Fees & Discounts
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* GST */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">
                    GST / Tax (%):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={taxPercent}
                      onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-2xl border-none bg-card p-3 shadow-neu-inner outline-none text-sm font-bold"
                    />
                    <span className="text-sm font-semibold text-text-secondary">%</span>
                  </div>
                  <span className="text-[11px] text-text-secondary">
                    = {formatCurrency(calculatedTaxTotal)}
                  </span>
                </div>

                {/* Service Charge */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">
                    Service Charge / Tip (₹):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={serviceChargeRupees}
                    onChange={(e) => setServiceChargeRupees(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-2xl border-none bg-card p-3 shadow-neu-inner outline-none text-sm font-bold"
                  />
                  <span className="text-[11px] text-text-secondary">
                    = {formatCurrency(calculatedServiceCharge)}
                  </span>
                </div>

                {/* Discount */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">
                    Discount / Promo (₹):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={discountRupees}
                    onChange={(e) => setDiscountRupees(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-2xl border-none bg-card p-3 shadow-neu-inner outline-none text-sm font-bold text-success"
                  />
                  <span className="text-[11px] text-text-secondary">
                    = -{formatCurrency(calculatedDiscount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Settlement & Who Owes What */}
          <div className="flex flex-col gap-6">

            {/* Grand Total Summary Card */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-4">
              <h3 className="text-lg font-bold font-display text-text-main flex items-center justify-between">
                <span>Grand Total</span>
                <span className="text-2xl font-bold font-display text-primary">
                  {formatCurrency(calculatedGrandTotal)}
                </span>
              </h3>

              <div className="flex flex-col gap-2 pt-2 border-t border-text-secondary/10 text-xs">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-text-main">{formatCurrency(calculatedSubtotal)}</span>
                </div>
                {calculatedTaxTotal > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Tax ({taxPercent}%):</span>
                    <span className="font-semibold text-text-main">+{formatCurrency(calculatedTaxTotal)}</span>
                  </div>
                )}
                {calculatedServiceCharge > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Service Charge:</span>
                    <span className="font-semibold text-text-main">+{formatCurrency(calculatedServiceCharge)}</span>
                  </div>
                )}
                {calculatedDiscount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount:</span>
                    <span className="font-semibold">-{formatCurrency(calculatedDiscount)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Individual Breakdown & Settle Status */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-outer flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold font-display text-text-main">
                  Who Owes What
                </h3>
                <span className="text-xs font-semibold text-text-secondary">
                  {participants.filter((p) => p.status === 'PAID').length} / {participants.length} Paid
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {participants.map((p) => {
                  const info = participantBreakdown.get(p.id);
                  const owes = info?.totalOwed || 0;
                  const isPaid = p.status === 'PAID';
                  const isExpanded = expandedDinerIds.has(p.id);

                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-neu-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div 
                          className="cursor-pointer flex-1"
                          onClick={() => toggleDinerBreakdown(p.id)}
                        >
                          <div className="font-bold text-sm text-text-main flex items-center gap-1.5">
                            <span>{p.group_members.name}</span>
                            {p.group_members.phone && (
                              <span className="text-[10px] text-text-secondary font-sans">
                                ({p.group_members.phone})
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-text-secondary" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
                            )}
                          </div>
                          <div className="text-xs font-bold text-primary font-display mt-0.5">
                            {formatCurrency(owes)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Pay QR button */}
                          <button
                            onClick={() => setActivePaymentParticipant(p)}
                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-card shadow-neu-inner text-primary hover:text-primary-hover"
                            title="View UPI QR"
                          >
                            <QrCode className="h-4 w-4" />
                          </button>

                          {/* Direct WhatsApp button */}
                          <button
                            onClick={() => handleDirectWhatsAppSend(p)}
                            className="flex items-center gap-1 rounded-xl bg-card px-2.5 py-1.5 text-xs font-bold text-success shadow-neu-sm hover:shadow-neu-inner-sm transition-all border border-success/30"
                            title={p.group_members.phone ? `WhatsApp ${p.group_members.phone}` : 'Enter phone & send'}
                          >
                            <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                            <span>WhatsApp</span>
                          </button>

                          {/* Mark Paid Toggle */}
                          <button
                            onClick={() => handleTogglePaymentStatus(p)}
                            className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all ${
                              isPaid
                                ? 'bg-success text-white shadow-neu-sm'
                                : 'bg-card text-warning shadow-neu-inner hover:bg-warning/10'
                            }`}
                          >
                            {isPaid ? 'Paid ✅' : 'Paid?'}
                          </button>
                        </div>
                      </div>

                      {/* Expandable itemized breakdown showing strictly what they ate */}
                      {isExpanded && info && (
                        <div className="pt-2 border-t border-text-secondary/10 flex flex-col gap-1 text-[11px] animate-in fade-in">
                          {info.dishes.length === 0 ? (
                            <span className="text-text-secondary italic">No dishes assigned to this person.</span>
                          ) : (
                            info.dishes.map((d, i) => (
                              <div key={i} className="flex justify-between text-text-secondary">
                                <span>
                                  {d.name} {d.portion > 1 ? `(${d.portion}x)` : (d.splitCount > 1 ? `(1/${d.splitCount})` : '')}
                                </span>
                                <span className="font-semibold text-text-main">{formatCurrency(d.amount)}</span>
                              </div>
                            ))
                          )}
                          {info.taxShare > 0 && (
                            <div className="flex justify-between text-text-secondary pt-0.5 border-t border-text-secondary/5">
                              <span>Tax share (GST):</span>
                              <span className="font-semibold text-text-main">+{formatCurrency(info.taxShare)}</span>
                            </div>
                          )}
                          {info.discountShare > 0 && (
                            <div className="flex justify-between text-success">
                              <span>Discount proportion:</span>
                              <span className="font-semibold">-{formatCurrency(info.discountShare)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Host UPI Setting */}
            <div className="rounded-3xl bg-card p-6 shadow-neu-inner flex flex-col gap-2">
              <label className="text-xs font-bold text-text-main flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                Host Receiving UPI ID:
              </label>
              <input
                type="text"
                value={hostUpiId}
                onChange={(e) => {
                  setHostUpiId(e.target.value);
                  localStorage.setItem('splitbill_host_upi', e.target.value);
                }}
                placeholder="yourname@okhdfcbank"
                className="w-full rounded-2xl border-none bg-card p-3 text-xs shadow-neu-outer outline-none font-semibold text-text-main"
              />
              <span className="text-[10px] text-text-secondary">
                Included in every WhatsApp message & UPI QR code for diners to pay you.
              </span>
            </div>

          </div>
        </div>

        {/* Modal: Direct WhatsApp Hub */}
        {isWhatsAppShareModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-[#25D366]">
                    <WhatsAppIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-display text-text-main">
                      Send via WhatsApp
                    </h3>
                    <p className="text-xs text-text-secondary">
                      Send bill breakdown directly to personal chats or group chat
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsWhatsAppShareModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Option 1: Send to WhatsApp Group Chat */}
              <div className="rounded-2xl bg-card p-4 shadow-neu-inner flex flex-col gap-3 mb-5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-text-main">
                    Option 1: Share Complete Bill with Group
                  </span>
                  <span className="text-[11px] font-semibold text-primary">All Diners</span>
                </div>
                <p className="text-xs text-text-secondary">
                  Opens WhatsApp so you can choose your dining group chat. Includes everyone's share & the live link!
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const msg = getGroupWhatsAppSummaryMessage();
                      const url = generateWhatsAppUrl({ message: msg });
                      window.open(url, '_blank');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success py-2.5 text-xs font-bold text-white shadow-neu-sm hover:opacity-90"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Open WhatsApp Group Share
                  </button>
                  <button
                    onClick={() => {
                      const msg = getGroupWhatsAppSummaryMessage();
                      navigator.clipboard.writeText(msg);
                      showToast('Summary copied to clipboard!');
                    }}
                    className="rounded-xl bg-card px-3 py-2.5 text-xs font-semibold text-text-secondary shadow-neu-sm hover:text-text-main"
                    title="Copy Text"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Option 2: Send Directly to Each Diner */}
              <div className="flex flex-col gap-3">
                <span className="font-bold text-sm text-text-main px-1">
                  Option 2: Send Personal Share to Each Person Directly
                </span>

                <div className="flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {participants.map((p) => {
                    const owes = participantBreakdown.get(p.id)?.totalOwed || 0;
                    const hasPhone = Boolean(p.group_members.phone);

                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl bg-card p-3 shadow-neu-sm text-xs"
                      >
                        <div>
                          <div className="font-bold text-text-main">
                            {p.group_members.name}
                          </div>
                          <div className="text-text-secondary flex items-center gap-2">
                            <span className="font-bold text-primary font-display">{formatCurrency(owes)}</span>
                            {hasPhone ? (
                              <span className="text-[11px] text-text-secondary">📱 {p.group_members.phone}</span>
                            ) : (
                              <span className="text-[11px] text-danger font-medium">⚠️ No WhatsApp number</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDirectWhatsAppSend(p)}
                          className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 font-bold text-success shadow-neu-inner-sm hover:bg-success/10 transition-colors"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                          <span>{hasPhone ? 'Send' : 'Add No. & Send'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Phone Number Prompt when user clicks WhatsApp for a participant without a phone */}
        {phonePromptParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-neu-outer animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
                  <h3 className="text-lg font-bold font-display text-text-main">
                    Enter WhatsApp Number
                  </h3>
                </div>
                <button
                  onClick={() => setPhonePromptParticipant(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-text-secondary mb-4">
                What is <strong>{phonePromptParticipant.group_members.name}</strong>'s mobile number? We'll save it and open their WhatsApp chat with the bill link.
              </p>

              <form onSubmit={handleSavePhoneAndSend} className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-2xl bg-card px-3 py-3 text-xs font-bold text-text-secondary shadow-neu-inner">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={enteredPhone}
                    onChange={(e) => setEnteredPhone(e.target.value)}
                    placeholder="98765 43210"
                    required
                    autoFocus
                    className="flex-1 rounded-2xl border-none bg-card p-3 text-sm shadow-neu-inner outline-none font-sans"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPhonePromptParticipant(null)}
                    className="flex-1 rounded-2xl bg-card py-3 text-xs font-semibold text-text-secondary shadow-neu-sm hover:text-text-main"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-success py-3 text-xs font-bold text-white shadow-neu-sm hover:opacity-90"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    Save & Send
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Dish (With Shared, Portions, and Solo Modes) */}
        {isAddItemOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold font-display text-text-main">Add Dish / Item</h3>
                <button
                  onClick={() => setIsAddItemOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddItem} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-secondary">Item / Dish Name</label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g. Chicken Biryani, Butter Naan, Cold Coffee"
                    required
                    autoFocus
                    className="rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary">Unit Price (₹)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      placeholder="e.g. 350"
                      required
                      className="rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none font-bold text-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-text-secondary">Total Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                      className="rounded-2xl border-none bg-card p-3.5 text-sm shadow-neu-inner outline-none"
                    />
                  </div>
                </div>

                {/* Split Mode Selector */}
                <div className="flex flex-col gap-2 pt-2 border-t border-text-secondary/10">
                  <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    How was this dish consumed?
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSplitMode('SELECTED')}
                      className={`rounded-xl py-2 px-2 text-xs font-bold transition-all ${
                        splitMode === 'SELECTED'
                          ? 'bg-primary text-white shadow-neu-sm'
                          : 'bg-card text-text-secondary shadow-neu-sm hover:text-text-main'
                      }`}
                    >
                      Shared by People
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode('PORTIONS')}
                      className={`rounded-xl py-2 px-2 text-xs font-bold transition-all ${
                        splitMode === 'PORTIONS'
                          ? 'bg-primary text-white shadow-neu-sm'
                          : 'bg-card text-text-secondary shadow-neu-sm hover:text-text-main'
                      }`}
                    >
                      By Portions / Qty
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode('SOLO')}
                      className={`rounded-xl py-2 px-2 text-xs font-bold transition-all ${
                        splitMode === 'SOLO'
                          ? 'bg-primary text-white shadow-neu-sm'
                          : 'bg-card text-text-secondary shadow-neu-sm hover:text-text-main'
                      }`}
                    >
                      Only 1 Person
                    </button>
                  </div>
                </div>

                {/* Mode 1: Shared by Selected People */}
                {splitMode === 'SELECTED' && (
                  <div className="flex flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-neu-inner">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-text-secondary">
                        Select who ate this (unselected diners pay ₹0):
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const all: { [id: string]: number } = {};
                            participants.forEach((p) => { all[p.id] = 1; });
                            setDinerPortions(all);
                          }}
                          className="text-primary hover:underline text-[11px]"
                        >
                          All
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setDinerPortions({})}
                          className="text-text-secondary hover:underline text-[11px]"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {participants.map((p) => {
                        const isSelected = (dinerPortions[p.id] || 0) > 0;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => {
                              setDinerPortions((prev) => ({
                                ...prev,
                                [p.id]: isSelected ? 0 : 1,
                              }));
                            }}
                            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-primary text-white shadow-neu-inner-sm'
                                : 'bg-card text-text-secondary shadow-neu-sm hover:text-text-main'
                            }`}
                          >
                            {p.group_members.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mode 2: By Portions / Quantities */}
                {splitMode === 'PORTIONS' && (
                  <div className="flex flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-neu-inner max-h-52 overflow-y-auto">
                    <span className="text-xs font-bold text-text-secondary">
                      Specify exact portions eaten by each person:
                    </span>

                    <div className="flex flex-col gap-2 pt-1">
                      {participants.map((p) => {
                        const qty = dinerPortions[p.id] || 0;
                        return (
                          <div key={p.id} className="flex items-center justify-between text-xs bg-card p-2 rounded-xl shadow-neu-sm">
                            <span className="font-semibold text-text-main">{p.group_members.name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setDinerPortions((prev) => ({ ...prev, [p.id]: Math.max(0, qty - 1) }))}
                                className="h-6 w-6 rounded-lg bg-card shadow-neu-sm hover:shadow-neu-inner-sm flex items-center justify-center font-bold"
                              >
                                -
                              </button>
                              <span className="font-bold text-sm text-primary w-6 text-center">{qty}</span>
                              <button
                                type="button"
                                onClick={() => setDinerPortions((prev) => ({ ...prev, [p.id]: qty + 1 }))}
                                className="h-6 w-6 rounded-lg bg-card shadow-neu-sm hover:shadow-neu-inner-sm flex items-center justify-center font-bold"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mode 3: Solo / 1 Diner */}
                {splitMode === 'SOLO' && (
                  <div className="flex flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-neu-inner">
                    <span className="text-xs font-bold text-text-secondary">
                      Select the single diner who had this:
                    </span>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {participants.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => setSoloParticipantId(p.id)}
                          className={`rounded-xl p-2.5 text-xs font-semibold transition-all text-left truncate ${
                            soloParticipantId === p.id
                              ? 'bg-primary text-white shadow-neu-inner-sm'
                              : 'bg-card text-text-secondary shadow-neu-sm'
                          }`}
                        >
                          {p.group_members.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={addingItem || !newItemName.trim() || !newItemPrice}
                  className="mt-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-white shadow-neu-sm hover:bg-primary-hover disabled:opacity-50"
                >
                  {addingItem ? 'Adding Dish...' : 'Add to Bill'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Split on an Existing Dish */}
        {editingSplitItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold font-display text-text-main">
                    Edit Split: {editingSplitItem.name}
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Total: {formatCurrency(editingSplitItem.total_price)}
                  </p>
                </div>

                <button
                  onClick={() => setEditingSplitItem(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-bold text-text-secondary">
                  Assign portions / consumption for each person:
                </span>

                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                  {participants.map((p) => {
                    const qty = editingPortions[p.id] || 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs bg-card p-3 rounded-2xl shadow-neu-sm">
                        <span className="font-bold text-text-main">{p.group_members.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingPortions((prev) => ({ ...prev, [p.id]: Math.max(0, qty - 1) }))}
                            className="h-7 w-7 rounded-lg bg-card shadow-neu-sm hover:shadow-neu-inner-sm flex items-center justify-center font-bold"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-bold text-sm text-primary w-6 text-center">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setEditingPortions((prev) => ({ ...prev, [p.id]: qty + 1 }))}
                            className="h-7 w-7 rounded-lg bg-card shadow-neu-sm hover:shadow-neu-inner-sm flex items-center justify-center font-bold"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingSplitItem(null)}
                    className="flex-1 rounded-2xl bg-card py-3 text-xs font-semibold text-text-secondary shadow-neu-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditSplit}
                    className="flex-1 rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-neu-sm hover:bg-primary-hover"
                  >
                    Save Split
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Share Live Bill / QR Code */}
        {isShareModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer text-center animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold font-display text-text-main">
                  Scan to View & Pay
                </h3>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-text-secondary mb-4">
                Have friends at the table scan this QR with their camera to open the live bill!
              </p>

              <div className="flex justify-center p-4 rounded-2xl bg-white shadow-neu-inner mb-4">
                <img
                  src={getQrCodeImageUrl(shareUrl, 220)}
                  alt="Bill QR Code"
                  className="h-48 w-48 object-contain"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    showToast('Live bill link copied!');
                  }}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-neu-sm hover:bg-primary-hover"
                >
                  <Copy className="h-4 w-4" />
                  Copy Share Link
                </button>

                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-card py-3 text-xs font-semibold text-text-secondary shadow-neu-sm hover:shadow-neu-inner-sm hover:text-text-main"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Guest View in New Tab
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Modal: UPI Payment for Specific Participant */}
        {activePaymentParticipant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-card p-6 sm:p-8 shadow-neu-outer text-center animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold font-display text-text-main">
                  {activePaymentParticipant.group_members.name}'s Share
                </h3>
                <button
                  onClick={() => setActivePaymentParticipant(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-card text-text-secondary hover:text-text-main shadow-neu-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {(() => {
                const owes = participantBreakdown.get(activePaymentParticipant.id)?.totalOwed || 0;
                const owesRupees = fromPaise(owes);
                const upiUrl = generateUpiUrl({
                  upiId: hostUpiId,
                  payeeName: 'Host',
                  amountInRupees: owesRupees,
                  note: `SplitBill - ${session.restaurant_name || 'Bill'}`,
                });

                return (
                  <div className="flex flex-col items-center gap-4">
                    <div className="text-3xl font-bold font-display text-primary">
                      {formatCurrency(owes)}
                    </div>

                    <div className="p-3 rounded-2xl bg-white shadow-neu-inner">
                      <img
                        src={getQrCodeImageUrl(upiUrl, 200)}
                        alt="UPI QR Code"
                        className="h-44 w-44 object-contain"
                      />
                    </div>

                    <p className="text-xs text-text-secondary">
                      Scan with Google Pay, PhonePe, Paytm, or BHIM to pay {formatCurrency(owes)} directly to <strong>{hostUpiId}</strong>
                    </p>

                    <div className="flex flex-col w-full gap-2">
                      <a
                        href={upiUrl}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-neu-sm hover:bg-primary-hover"
                      >
                        Open UPI App
                      </a>

                      <button
                        onClick={() => {
                          handleDirectWhatsAppSend(activePaymentParticipant);
                        }}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-card py-2.5 text-xs font-bold text-success shadow-neu-sm hover:shadow-neu-inner-sm"
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                        Send Share on WhatsApp
                      </button>

                      <button
                        onClick={() => {
                          handleTogglePaymentStatus(activePaymentParticipant);
                          setActivePaymentParticipant(null);
                        }}
                        className={`rounded-2xl py-3 text-xs font-bold shadow-neu-sm ${
                          activePaymentParticipant.status === 'PAID'
                            ? 'bg-card text-text-secondary shadow-neu-inner'
                            : 'bg-card text-success hover:bg-success/10'
                        }`}
                      >
                        {activePaymentParticipant.status === 'PAID' ? 'Mark as Unpaid' : 'Mark as Paid ✅'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
