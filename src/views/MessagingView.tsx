import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, MessageSquare, Users, Megaphone, Hash,
  ChevronLeft, Circle, Loader2,
} from 'lucide-react';
import { Message, Staff } from '../types';
import { dmChannel } from '../hooks/useMessaging';
import { getDate } from '../utils/date';

const DEV_EMAIL = 'jameskoen78@gmail.com';

interface MessagingViewProps {
  currentUserStaff: Staff | null;
  staff: Staff[];
  messages: Message[];
  devBroadcasts: Message[];
  activeChannel: string;
  setActiveChannel: (ch: string) => void;
  sendMessage: (text: string, channel: string) => Promise<void>;
  markChannelRead: (ch: string) => Promise<void>;
  getChannelMessages: (ch: string) => Message[];
  getChannelUnread: (ch: string) => number;
  isDev: boolean;
  myId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: any): string {
  if (!ts) return '';
  const d = getDate(ts);
  
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function roleColor(role: string) {
  switch (role) {
    case 'admin': return 'text-purple-600 dark:text-purple-400';
    case 'manager': return 'text-blue-600 dark:text-blue-400';
    case 'dev': return 'text-violet-600 dark:text-violet-400';
    default: return 'text-emerald-600 dark:text-emerald-400';
  }
}

function roleBg(role: string) {
  switch (role) {
    case 'admin': return 'bg-purple-100 dark:bg-purple-900/30';
    case 'manager': return 'bg-blue-100 dark:bg-blue-900/30';
    case 'dev': return 'bg-violet-100 dark:bg-violet-900/30';
    default: return 'bg-emerald-100 dark:bg-emerald-900/30';
  }
}

function avatarLetter(name: string) {
  return name?.charAt(0).toUpperCase() || '?';
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showSender }: { msg: Message; isOwn: boolean; showSender: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end`}
    >
      {/* Avatar */}
      {!isOwn && (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${roleBg(msg.senderRole)} ${roleColor(msg.senderRole)}`}>
          {avatarLetter(msg.senderName)}
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {showSender && !isOwn && (
          <div className="flex items-center gap-1.5 px-1">
            <span className={`text-[10px] font-black uppercase tracking-widest ${roleColor(msg.senderRole)}`}>
              {msg.senderName}
            </span>
            {msg.isDevBroadcast && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 uppercase tracking-widest">
                DEV
              </span>
            )}
          </div>
        )}

        <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium leading-relaxed break-words ${
          msg.isSystemNotification
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold'
            : msg.isDevBroadcast
            ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
            : isOwn
            ? 'bg-primary text-white shadow-lg shadow-primary/20 rounded-br-md'
            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 shadow-sm rounded-bl-md'
        }`}>
          {msg.text}
        </div>

        <span className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MessagingView({
  currentUserStaff,
  staff,
  messages,
  devBroadcasts,
  activeChannel,
  setActiveChannel,
  sendMessage,
  markChannelRead,
  getChannelMessages,
  getChannelUnread,
  isDev,
  myId,
}: MessagingViewProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const channelMessages = getChannelMessages(activeChannel);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length, activeChannel]);

  // Mark channel as read when you switch to it (not on every new message)
  useEffect(() => {
    markChannelRead(activeChannel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(input, activeChannel);
      setInput('');
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build channel list
  const otherStaff = staff.filter(s => s.id !== myId);

  const channels = [
    { id: 'general', label: 'General', icon: Hash, description: 'Team-wide announcements' },
    ...(isDev ? [{ id: 'dev-broadcast', label: 'Dev Broadcast', icon: Megaphone, description: 'Platform-wide message' }] : []),
  ];

  const getChannelLabel = (ch: string) => {
    if (ch === 'general') return 'General';
    if (ch === 'dev-broadcast') return 'Dev Broadcast';
    if (ch.startsWith('dm_')) {
      const parts = ch.replace('dm_', '').split('_');
      const otherId = parts.find(p => p !== myId);
      return staff.find(s => s.id === otherId)?.name || 'Direct Message';
    }
    return ch;
  };

  const getChannelIcon = (ch: string) => {
    if (ch === 'general') return Hash;
    if (ch === 'dev-broadcast') return Megaphone;
    return Users;
  };

  const ChannelIcon = getChannelIcon(activeChannel);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-slate-50 dark:bg-[#0B1120]">

      {/* ── Sidebar ── */}
      <AnimatePresence initial={false}>
        {showSidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700/60 flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-black text-slate-900 dark:text-white text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Messages
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {/* Channels */}
              <div className="px-2 py-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Channels</span>
              </div>
              {channels.map(ch => {
                const unread = getChannelUnread(ch.id);
                const isActive = activeChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => { setActiveChannel(ch.id); setShowSidebar(window.innerWidth >= 768); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <ch.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{ch.label}</span>
                    {unread > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Direct Messages */}
              {otherStaff.length > 0 && (
                <>
                  <div className="px-2 py-1.5 mt-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Direct Messages</span>
                  </div>
                  {otherStaff.map(s => {
                    const ch = dmChannel(myId, s.id);
                    const unread = getChannelUnread(ch);
                    const isActive = activeChannel === ch;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setActiveChannel(ch); setShowSidebar(window.innerWidth >= 768); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${roleBg(s.role)} ${roleColor(s.role)}`}>
                          {avatarLetter(s.name)}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="truncate">{s.name}</div>
                          <div className={`text-[10px] font-bold uppercase tracking-widest ${roleColor(s.role)}`}>{s.role}</div>
                        </div>
                        {unread > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                        <Circle className={`w-2 h-2 shrink-0 ${s.status === 'active' ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'}`} />
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Header */}
        <div className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60 px-4 flex items-center gap-3 shrink-0 shadow-sm">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            aria-label="Toggle sidebar"
          >
            {showSidebar ? <ChevronLeft className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2">
            <ChannelIcon className="w-4 h-4 text-slate-500" />
            <span className="font-black text-slate-900 dark:text-white">{getChannelLabel(activeChannel)}</span>
            {activeChannel === 'dev-broadcast' && (
              <span className="px-2 py-0.5 rounded text-[9px] font-black bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 uppercase tracking-widest">
                Platform-wide
              </span>
            )}
          </div>

          <div className="ml-auto text-xs text-slate-400 dark:text-slate-500 font-medium">
            {channelMessages.length} messages
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {channelMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
              <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No messages yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Be the first to say something</p>
            </div>
          ) : (
            channelMessages.map((msg, idx) => {
              const isOwn = msg.senderId === myId;
              const prevMsg = channelMessages[idx - 1];
              const showSender = !prevMsg || prevMsg.senderId !== msg.senderId;

              // System notifications render as a centered alert pill
              if (msg.isSystemNotification) {
                return (
                  <div key={msg.id} className="flex justify-center my-1">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold shadow-sm max-w-xs text-center">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <React.Fragment key={msg.id}>
                  <MessageBubble
                    msg={msg}
                    isOwn={isOwn}
                    showSender={showSender}
                  />
                </React.Fragment>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
          {activeChannel === 'dev-broadcast' && (
            <div className="mb-2 px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-2">
              <Megaphone className="w-3.5 h-3.5" />
              This message will be visible to ALL tenants on the platform.
            </div>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeChannel === 'dev-broadcast'
                    ? 'Broadcast a platform-wide message...'
                    : activeChannel === 'general'
                    ? 'Message the team...'
                    : `Message ${getChannelLabel(activeChannel)}...`
                }
                rows={1}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl focus:outline-none focus:border-primary/50 text-sm font-medium resize-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                input.trim()
                  ? activeChannel === 'dev-broadcast'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30 hover:bg-violet-700'
                    : 'bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary/90'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
              }`}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 px-1">
            Press <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[9px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[9px]">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </div>
  );
}
