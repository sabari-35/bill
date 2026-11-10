import { supabase } from './supabase';

export interface MemberSessionShare {
  sessionId: string;
  sessionRestaurant: string;
  sessionDate: string;
  groupId: string;
  groupName: string;
  grandTotal: number; // in paise
  shareAmount: number; // in paise
  isPaid: boolean;
  participantId: string;
}

export interface MemberSettlementSummary {
  memberId: string;
  name: string;
  phone: string | null;
  groupId: string;
  groupName: string;
  totalBilled: number; // in paise
  totalSettled: number; // in paise
  totalPending: number; // in paise
  sessionsCount: number;
  paidSessionsCount: number;
  sessions: MemberSessionShare[];
}

export interface GroupAnalytics {
  groupId: string;
  groupName: string;
  restaurantName: string | null;
  totalSpent: number; // in paise
  totalSettled: number; // in paise
  totalPending: number; // in paise
  settlementRate: number; // 0 - 100
  sessionsCount: number;
  membersCount: number;
  members: MemberSettlementSummary[];
}

export interface GlobalAnalytics {
  totalSpent: number; // in paise
  totalSettled: number; // in paise
  totalPending: number; // in paise
  settlementRate: number; // 0 - 100
  totalGroupsCount: number;
  totalSessionsCount: number;
  totalMembersCount: number;
  groups: GroupAnalytics[];
  allMembers: MemberSettlementSummary[];
}

/**
 * Calculates the exact share for each participant in a session
 */
export function calculateSessionShares(
  session: {
    id: string;
    subtotal: number;
    tax_total: number;
    service_charge: number;
    discount: number;
    grand_total: number;
  },
  participants: { id: string; group_member_id: string; status: string }[],
  items: { id: string; session_id: string; total_price: number }[],
  allocations: { item_id: string; participant_id: string; quantity: number }[]
): Map<string, number> {
  const shares = new Map<string, number>();

  if (!participants || participants.length === 0) {
    return shares;
  }

  // If no items, divide grand_total equally among participants
  if (!items || items.length === 0 || !allocations || allocations.length === 0) {
    const total = session.grand_total || 0;
    const equalShare = Math.round(total / participants.length);
    for (const p of participants) {
      shares.set(p.id, equalShare);
    }
    return shares;
  }

  // Map allocations by item
  const allocByItem = new Map<string, { participant_id: string; quantity: number }[]>();
  for (const a of allocations) {
    const list = allocByItem.get(a.item_id) || [];
    list.push(a);
    allocByItem.set(a.item_id, list);
  }

  const baseAmounts = new Map<string, number>();
  for (const p of participants) {
    baseAmounts.set(p.id, 0);
  }

  for (const item of items) {
    const itemAllocs = allocByItem.get(item.id) || [];
    if (itemAllocs.length === 0) continue;

    const totalQty = itemAllocs.reduce((sum, a) => sum + (a.quantity || 1), 0);
    if (totalQty <= 0) continue;

    for (const a of itemAllocs) {
      const pQty = a.quantity || 1;
      const amount = Math.round((item.total_price * pQty) / totalQty);
      baseAmounts.set(a.participant_id, (baseAmounts.get(a.participant_id) || 0) + amount);
    }
  }

  const subtotal = session.subtotal || 1;
  const tax = session.tax_total || 0;
  const service = session.service_charge || 0;
  const discount = session.discount || 0;

  for (const p of participants) {
    const base = baseAmounts.get(p.id) || 0;
    if (subtotal > 0 && base > 0) {
      const ratio = base / subtotal;
      const taxShare = Math.round(tax * ratio);
      const serviceShare = Math.round(service * ratio);
      const discountShare = Math.round(discount * ratio);
      const finalShare = Math.max(0, base + taxShare + serviceShare - discountShare);
      shares.set(p.id, finalShare);
    } else {
      shares.set(p.id, base);
    }
  }

  return shares;
}

/**
 * Loads analytics for a specific group
 */
export async function fetchGroupAnalytics(groupId: string): Promise<GroupAnalytics> {
  const [groupRes, membersRes, sessionsRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*').eq('group_id', groupId),
    supabase.from('sessions').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
  ]);

  const group = groupRes.data || { id: groupId, name: 'Group', restaurant_name: null };
  const members = membersRes.data || [];
  const sessions = sessionsRes.data || [];

  if (sessions.length === 0) {
    return {
      groupId,
      groupName: group.name,
      restaurantName: group.restaurant_name,
      totalSpent: 0,
      totalSettled: 0,
      totalPending: 0,
      settlementRate: 100,
      sessionsCount: 0,
      membersCount: members.length,
      members: members.map((m) => ({
        memberId: m.id,
        name: m.name,
        phone: m.phone,
        groupId,
        groupName: group.name,
        totalBilled: 0,
        totalSettled: 0,
        totalPending: 0,
        sessionsCount: 0,
        paidSessionsCount: 0,
        sessions: [],
      })),
    };
  }

  const sessionIds = sessions.map((s) => s.id);

  const [partRes, itemsRes] = await Promise.all([
    supabase.from('session_participants').select('*').in('session_id', sessionIds),
    supabase.from('items').select('*').in('session_id', sessionIds),
  ]);

  const participants = partRes.data || [];
  const items = itemsRes.data || [];
  const itemIds = items.map((i) => i.id);

  let allocations: any[] = [];
  if (itemIds.length > 0) {
    const allocRes = await supabase.from('item_allocations').select('*').in('item_id', itemIds);
    allocations = allocRes.data || [];
  }

  // Group items & allocations by session
  const itemsBySession = new Map<string, any[]>();
  for (const item of items) {
    const list = itemsBySession.get(item.session_id) || [];
    list.push(item);
    itemsBySession.set(item.session_id, list);
  }

  const partsBySession = new Map<string, any[]>();
  for (const p of participants) {
    const list = partsBySession.get(p.session_id) || [];
    list.push(p);
    partsBySession.set(p.session_id, list);
  }

  // Member tracking map
  const memberMap = new Map<string, MemberSettlementSummary>();
  for (const m of members) {
    memberMap.set(m.id, {
      memberId: m.id,
      name: m.name,
      phone: m.phone,
      groupId,
      groupName: group.name,
      totalBilled: 0,
      totalSettled: 0,
      totalPending: 0,
      sessionsCount: 0,
      paidSessionsCount: 0,
      sessions: [],
    });
  }

  let totalGroupSpent = 0;
  let totalGroupSettled = 0;

  for (const session of sessions) {
    totalGroupSpent += session.grand_total || 0;
    const sessParts = partsBySession.get(session.id) || [];
    const sessItems = itemsBySession.get(session.id) || [];
    const sessShares = calculateSessionShares(session, sessParts, sessItems, allocations);

    for (const p of sessParts) {
      const share = sessShares.get(p.id) || 0;
      const isPaid = p.status === 'PAID';

      if (isPaid) {
        totalGroupSettled += share;
      }

      const memberSummary = memberMap.get(p.group_member_id);
      if (memberSummary) {
        memberSummary.totalBilled += share;
        if (isPaid) {
          memberSummary.totalSettled += share;
          memberSummary.paidSessionsCount += 1;
        } else {
          memberSummary.totalPending += share;
        }
        memberSummary.sessionsCount += 1;
        memberSummary.sessions.push({
          sessionId: session.id,
          sessionRestaurant: session.restaurant_name || 'Bill Session',
          sessionDate: session.created_at,
          groupId,
          groupName: group.name,
          grandTotal: session.grand_total,
          shareAmount: share,
          isPaid,
          participantId: p.id,
        });
      }
    }
  }

  const memberList = Array.from(memberMap.values()).sort((a, b) => b.totalPending - a.totalPending);
  const totalGroupPending = Math.max(0, totalGroupSpent - totalGroupSettled);
  const settlementRate = totalGroupSpent > 0 ? Math.round((totalGroupSettled / totalGroupSpent) * 100) : 100;

  return {
    groupId,
    groupName: group.name,
    restaurantName: group.restaurant_name,
    totalSpent: totalGroupSpent,
    totalSettled: totalGroupSettled,
    totalPending: totalGroupPending,
    settlementRate,
    sessionsCount: sessions.length,
    membersCount: members.length,
    members: memberList,
  };
}

/**
 * Loads overall global analytics across all groups for the host
 */
export async function fetchGlobalAnalytics(): Promise<GlobalAnalytics> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: groupsData, error: groupsErr } = await supabase
    .from('groups')
    .select('*')
    .eq('host_id', user.id)
    .order('created_at', { ascending: false });

  if (groupsErr) throw groupsErr;
  const groups = groupsData || [];

  if (groups.length === 0) {
    return {
      totalSpent: 0,
      totalSettled: 0,
      totalPending: 0,
      settlementRate: 100,
      totalGroupsCount: 0,
      totalSessionsCount: 0,
      totalMembersCount: 0,
      groups: [],
      allMembers: [],
    };
  }

  // Fetch group analytics in parallel
  const groupAnalyticsList = await Promise.all(
    groups.map((g) => fetchGroupAnalytics(g.id))
  );

  let totalSpent = 0;
  let totalSettled = 0;
  let totalSessions = 0;
  const allMembers: MemberSettlementSummary[] = [];

  for (const ga of groupAnalyticsList) {
    totalSpent += ga.totalSpent;
    totalSettled += ga.totalSettled;
    totalSessions += ga.sessionsCount;
    allMembers.push(...ga.members);
  }

  const totalPending = Math.max(0, totalSpent - totalSettled);
  const settlementRate = totalSpent > 0 ? Math.round((totalSettled / totalSpent) * 100) : 100;

  // Sort members by highest pending amount first
  allMembers.sort((a, b) => b.totalPending - a.totalPending);

  return {
    totalSpent,
    totalSettled,
    totalPending,
    settlementRate,
    totalGroupsCount: groups.length,
    totalSessionsCount: totalSessions,
    totalMembersCount: allMembers.length,
    groups: groupAnalyticsList,
    allMembers,
  };
}

