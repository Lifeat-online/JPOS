/**
 * useMessaging - MariaDB REST edition.
 * Replaced Firestore onSnapshot real-time listeners with REST polling.
 * Polls the messages endpoint every 10 seconds while the hook is mounted.
 */
import { useState, useEffect, useCallback } from 'react';
import { JwtUser } from './useAuth';
import { Message, Staff } from '../types';
import { apiGet, apiPost, apiPut } from '../api';
import { getDate } from '../utils/date';

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

  const myId = currentUserStaff?.id || user?.uid || '';

  // Fetch messages.
  const fetchMessages = useCallback(async () => {
    if (!user || !tenantId) { setMessages([]); return; }
    try {
      const data = await apiGet<Message[]>(`/api/mariadb/tenants/${tenantId}/messages?limit=200`);
      setMessages(data || []);
    } catch (err) {
      if ((err as { isRateLimit?: boolean } | null)?.isRateLimit) return;
      console.error('Messages fetch error:', err);
    }
  }, [user, tenantId]);

  useEffect(() => {
    let interval: number | null = null;

    const start = () => {
      if (!interval) {
        interval = window.setInterval(fetchMessages, POLL_MS);
      }
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else {
        void fetchMessages();
        start();
      }
    };

    fetchMessages();
    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchMessages]);

  // Unread count.
  useEffect(() => {
    if (!myId) { setUnreadCount(0); return; }
    const relevant = messages.filter(m => {
      if (m.channel === 'general') return true;
      if (m.channel.startsWith('dm_') && m.channel.includes(myId)) return true;
      return false;
    });
    setUnreadCount(relevant.filter(m => !(m.readBy || []).includes(myId)).length);
  }, [messages, myId]);

  // Send a message.
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
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      ...payload,
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Message;

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      await apiPost(`/api/mariadb/tenants/${tenantId}/messages`, payload);
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  }, [user, currentUserStaff, tenantId, fetchMessages]);

  // Mark messages as read.
  const markChannelRead = useCallback(async (channel: string) => {
    if (!myId || !tenantId) return;

    const unread = messages.filter(
      m => m.channel === channel && !(m.readBy || []).includes(myId)
    );

    if (unread.length === 0) return;

    unread.forEach(m => {
      apiPut(`/api/mariadb/tenants/${tenantId}/messages/${m.id}/read`, { userId: myId })
        .catch(e => console.warn(`markRead failed for message ${m.id}:`, e));
    });

    setMessages(prev =>
      prev.map(m =>
        m.channel === channel && !(m.readBy || []).includes(myId)
          ? { ...m, readBy: [...(m.readBy || []), myId] }
          : m
      )
    );
  }, [messages, myId, tenantId]);

  // Get messages for a channel.
  const getChannelMessages = useCallback((channel: string): Message[] => {
    return messages
      .filter(m => m.channel === channel)
      .sort((a, b) => {
        const ta = getDate(a.createdAt).getTime();
        const tb = getDate(b.createdAt).getTime();
        return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
      });
  }, [messages]);

  // Unread count per channel.
  const getChannelUnread = useCallback((channel: string): number => {
    if (!myId) return 0;
    return messages
      .filter(m => m.channel === channel)
      .filter(m => !(m.readBy || []).includes(myId)).length;
  }, [messages, myId]);

  return {
    messages,
    devBroadcasts: [] as Message[],
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
