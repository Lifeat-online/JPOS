import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Message, Staff } from '../types';
import { getTenantCollection } from '../tenantHelper';

const DEV_EMAIL = 'jameskoen78@gmail.com';

/** Build a deterministic DM channel ID from two user IDs */
export function dmChannel(uidA: string, uidB: string): string {
  return `dm_${[uidA, uidB].sort().join('_')}`;
}

interface UseMessagingOptions {
  user: User | null;
  tenantId: string | null;
  currentUserStaff: Staff | null;
  staff: Staff[];
}

export function useMessaging({ user, tenantId, currentUserStaff, staff }: UseMessagingOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [devBroadcasts, setDevBroadcasts] = useState<Message[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('general');
  const [unreadCount, setUnreadCount] = useState(0);

  const isDev = user?.email === DEV_EMAIL;
  const myId = currentUserStaff?.id || user?.uid || '';

  // ── Tenant messages ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !tenantId) { setMessages([]); return; }
    const q = query(
      getTenantCollection(db, tenantId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    );
    const unsubscribe = onSnapshot(q,
      (snap) => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message))),
      (err) => console.error('Messages subscription error:', err)
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // ── Dev broadcasts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setDevBroadcasts([]); return; }
    const q = query(
      collection(db, 'devBroadcasts'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q,
      (snap) => setDevBroadcasts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message))),
      (err) => console.error('DevBroadcasts subscription error:', err)
    );
    return () => unsubscribe();
  }, [user]);

  // ── Unread count ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myId) { setUnreadCount(0); return; }

    const relevantMessages = messages.filter(m => {
      if (m.channel === 'general') return true;
      if (m.channel.startsWith('dm_') && m.channel.includes(myId)) return true;
      return false;
    });

    const unread = [
      ...relevantMessages,
      ...devBroadcasts,
    ].filter(m => !(m.readBy || []).includes(myId)).length;

    setUnreadCount(unread);
  }, [messages, devBroadcasts, myId]);

  // ── Send a message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, channel: string) => {
    if (!text.trim() || !user || !currentUserStaff) return;

    const payload: Omit<Message, 'id'> = {
      channel: channel as Message['channel'],
      senderId: currentUserStaff.id,
      senderName: currentUserStaff.name,
      senderRole: currentUserStaff.role,
      text: text.trim(),
      createdAt: serverTimestamp(),
      readBy: [currentUserStaff.id],
      isDevBroadcast: false,
    };

    if (isDev && channel === 'dev-broadcast') {
      await addDoc(collection(db, 'devBroadcasts'), {
        ...payload,
        isDevBroadcast: true,
        tenantId,
      });
    } else if (tenantId) {
      await addDoc(getTenantCollection(db, tenantId, 'messages'), payload);
    }
  }, [user, currentUserStaff, tenantId, isDev]);

  // ── Mark messages as read ─────────────────────────────────────────────────────
  const markChannelRead = useCallback(async (channel: string) => {
    if (!myId || !tenantId) return;

    const unread = messages.filter(
      m => m.channel === channel && !(m.readBy || []).includes(myId)
    );

    await Promise.all(
      unread.map(m =>
        updateDoc(doc(getTenantCollection(db, tenantId, 'messages'), m.id), {
          readBy: [...(m.readBy || []), myId],
        })
      )
    );

    if (channel === 'general') {
      const unreadBroadcasts = devBroadcasts.filter(m => !(m.readBy || []).includes(myId));
      await Promise.all(
        unreadBroadcasts.map(m =>
          updateDoc(doc(collection(db, 'devBroadcasts'), m.id), {
            readBy: [...(m.readBy || []), myId],
          })
        )
      );
    }
  }, [messages, devBroadcasts, myId, tenantId]);

  // ── Get messages for a channel ────────────────────────────────────────────────
  const getChannelMessages = useCallback((channel: string): Message[] => {
    const tenantMsgs = messages.filter(m => m.channel === channel);
    if (channel === 'general') {
      return [...devBroadcasts, ...tenantMsgs].sort((a, b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return ta - tb;
      });
    }
    return tenantMsgs;
  }, [messages, devBroadcasts]);

  // ── Unread count per channel ──────────────────────────────────────────────────
  const getChannelUnread = useCallback((channel: string): number => {
    if (!myId) return 0;
    const msgs = channel === 'general'
      ? [...devBroadcasts, ...messages.filter(m => m.channel === 'general')]
      : messages.filter(m => m.channel === channel);
    return msgs.filter(m => !(m.readBy || []).includes(myId)).length;
  }, [messages, devBroadcasts, myId]);

  return {
    messages,
    devBroadcasts,
    activeChannel,
    setActiveChannel,
    unreadCount,
    sendMessage,
    markChannelRead,
    getChannelMessages,
    getChannelUnread,
    isDev,
    myId,
    staff,
    dmChannel,
  };
}
