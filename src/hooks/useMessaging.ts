/**
 * useMessaging — MariaDB REST edition.
 * Replaced Firestore onSnapshot real-time listeners with REST polling.
 * Polls the messages endpoint every 10 seconds while the hook is mounted.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { JwtUser } from './useAuth';
import { Message, Staff } from '../types';
import { apiGet, apiPost, apiPut } from '../api';

const POLL_MS = 10_000;

/** Build a deterministic DM channel ID from two user IDs */
export function dmChannel(uidA: string, uidB: string): string {
  return `dm_${[uidA, uidB].sort().join('_')}`;
}

interface UseMessagingOptions {
  user: JwtUser | null;
  tenantId: string | null;
  currentUserStaff: Staff | null;
  staff: Staff[];
}

export function useMessaging({ user, tenantId, currentUserStaff, staff }: UseMessagingOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('general');
  const [unreadCount, setUnreadCount] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myId = currentUserStaff?.id || user?.uid || '';

  // ── Fetch messages ────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!user || !tenantId) { setMessages([]); return; }
    try {
      const data = await apiGet<Message[]>(`/api/mariadb/tenants/${tenantId}/messages?limit=200`);
      setMessages(data || []);
    } catch (err) {
      console.error('Messages fetch error:', err);
    }
  }, [user, tenantId]);

  useEffect(() => {
    fetchMessages();
    pollingRef.current = setInterval(fetchMessages, POLL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchMessages]);

  // ── Unread count ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myId) { setUnreadCount(0); return; }
    const relevant = messages.filter(m => {
      if (m.channel === 'general') return true;
      if (m.channel.startsWith('dm_') && m.channel.includes(myId)) return true;
      return false;
    });
    setUnreadCount(relevant.filter(m => !(m.readBy || []).includes(myId)).length);
  }, [messages, myId]);

  // ── Send a message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, channel: string) => {
    if (!text.trim() || !user || !currentUserStaff || !tenantId) return;

    const payload = {
      channel,
      senderId: currentUserStaff.id,
      senderName: currentUserStaff.name,
      senderRole: currentUserStaff.role,
      text: text.trim(),
      readBy: [currentUserStaff.id],
    };

    try {
      await apiPost(`/api/mariadb/tenants/${tenantId}/messages`, payload);
      // Optimistic refresh
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }, [user, currentUserStaff, tenantId, fetchMessages]);

  // ── Mark messages as read ─────────────────────────────────────────────────────
  const markChannelRead = useCallback(async (channel: string) => {
    if (!myId || !tenantId) return;

    const unread = messages.filter(
      m => m.channel === channel && !(m.readBy || []).includes(myId)
    );

    await Promise.all(
      unread.map(m =>
        apiPut(`/api/mariadb/tenants/${tenantId}/messages/${m.id}/read`, { userId: myId })
          .catch(e => console.warn('markRead failed:', e))
      )
    );

    // Optimistic local update
    setMessages(prev =>
      prev.map(m =>
        m.channel === channel && !(m.readBy || []).includes(myId)
          ? { ...m, readBy: [...(m.readBy || []), myId] }
          : m
      )
    );
  }, [messages, myId, tenantId]);

  // ── Get messages for a channel ────────────────────────────────────────────────
  const getChannelMessages = useCallback((channel: string): Message[] => {
    return messages
      .filter(m => m.channel === channel)
      .sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return ta - tb;
      });
  }, [messages]);

  // ── Unread count per channel ──────────────────────────────────────────────────
  const getChannelUnread = useCallback((channel: string): number => {
    if (!myId) return 0;
    return messages
      .filter(m => m.channel === channel)
      .filter(m => !(m.readBy || []).includes(myId)).length;
  }, [messages, myId]);

  return {
    messages,
    devBroadcasts: [] as Message[], // Legacy compat — no longer separate
    activeChannel,
    setActiveChannel,
    unreadCount,
    sendMessage,
    markChannelRead,
    getChannelMessages,
    getChannelUnread,
    isDev: false,
    myId,
    staff,
    dmChannel,
  };
}
