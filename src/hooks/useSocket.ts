/**
 * useSocket - WebSocket connection manager
 * Connects to Socket.IO only when a workstation/register is open
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl } from '../apiConfig';
import { JwtUser } from './useAuth';

interface UseSocketOptions {
  user: JwtUser | null;
  tenantId: string | null;
  enabled?: boolean;
  workstationId?: string | null;
  tableId?: string | null;
  tabId?: string | null;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  joinWorkstation: (id: string) => void;
  leaveWorkstation: (id: string) => void;
  joinTable: (id: string) => void;
  leaveTable: (id: string) => void;
  joinTab: (id: string) => void;
  leaveTab: (id: string) => void;
  joinMessages: (tenantId: string) => void;
  leaveMessages: (tenantId: string) => void;
  emit: (event: string, payload?: any) => void;
}

export function useSocket({ user, tenantId, enabled = true, workstationId, tableId, tabId }: UseSocketOptions): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Get access token
  const getAccessToken = useCallback(() => {
    // Migration: try new key first, fall back to old key
    return localStorage.getItem('masepos_access_token') || localStorage.getItem('jpos_access_token');
  }, []);

  // Connect to Socket.IO when user is authenticated
  const connect = useCallback(() => {
    if (!enabled || !user || !tenantId || socketRef.current) return;

    const token = getAccessToken();
    if (!token) return;

    const socketUrl = getSocketBaseUrl();
    
    const newSocket = io(socketUrl, {
      auth: {
        token: `Bearer ${token}`,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setIsConnected(true);
      
      // Join tenant channel
      newSocket.emit('join_tenant', tenantId);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
  }, [enabled, user, tenantId, getAccessToken]);

  // Disconnect from Socket.IO
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  }, []);

  // Join workstation channel
  const joinWorkstation = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('join_workstation', id);
    }
  }, []);

  // Leave workstation channel
  const leaveWorkstation = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('leave_workstation', id);
    }
  }, []);

  // Join table channel
  const joinTable = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('join_table', id);
    }
  }, []);

  // Leave table channel
  const leaveTable = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('leave_table', id);
    }
  }, []);

  // Join tab channel
  const joinTab = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('join_tab', id);
    }
  }, []);

  // Leave tab channel
  const leaveTab = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('leave_tab', id);
    }
  }, []);

  // Join messages channel
  const joinMessages = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('join_messages', id);
    }
  }, []);

  // Leave messages channel
  const leaveMessages = useCallback((id: string) => {
    if (socketRef.current && id) {
      socketRef.current.emit('leave_messages', id);
    }
  }, []);

  const emit = useCallback((event: string, payload?: any) => {
    if (socketRef.current && event) {
      socketRef.current.emit(event, payload);
    }
  }, []);

  // Connect/disconnect based on active channels
  useEffect(() => {
    // Connect only when the caller explicitly enables live socket work.
    if (enabled && user && tenantId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, user, tenantId, connect, disconnect]);

  // Join/leave channels based on active state
  useEffect(() => {
    if (!socket) return;

    // Join workstation when active
    if (workstationId) {
      joinWorkstation(workstationId);
    } else {
      // Leave all workstations when no active workstation
      // In a real app, you might want to track all joined workstations
    }

    // Join table when active
    if (tableId) {
      joinTable(tableId);
    }

    // Join tab when active
    if (tabId) {
      joinTab(tabId);
    }

    return () => {
      if (workstationId) leaveWorkstation(workstationId);
      if (tableId) leaveTable(tableId);
      if (tabId) leaveTab(tabId);
    };
  }, [socket, workstationId, tableId, tabId, joinWorkstation, leaveWorkstation, joinTable, leaveTable, joinTab, leaveTab]);

  return {
    socket,
    isConnected,
    connect,
    disconnect,
    joinWorkstation,
    leaveWorkstation,
    joinTable,
    leaveTable,
    joinTab,
    leaveTab,
    joinMessages,
    leaveMessages,
    emit,
  };
}
