/**
 * WebSocket context for managing real-time collaborative editing connections
 */

import React, { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import { 
  WebSocketMessage, 
  ConnectionStatus, 
  TextChangeMessage, 
  CursorChangeMessage,
  SessionJoinedMessage,
  UserJoinedMessage,
  UserLeftMessage,
  ErrorMessage
} from '../types';

interface WebSocketContextType {
  connectionStatus: ConnectionStatus;
  currentSessionId: string | null;
  currentUserId: string | null;
  connectedUsers: string[];
  connect: (sessionId: string, userId?: string) => void;
  disconnect: () => void;
  sendTextChange: (content: string, cursorPosition?: number) => void;
  sendCursorChange: (position: number, selectionStart?: number, selectionEnd?: number) => void;
  onTextChange: (callback: (message: TextChangeMessage) => void) => void;
  onCursorChange: (callback: (message: CursorChangeMessage) => void) => void;
  onSessionJoined: (callback: (message: SessionJoinedMessage) => void) => void;
  onUserJoined: (callback: (message: UserJoinedMessage) => void) => void;
  onUserLeft: (callback: (message: UserLeftMessage) => void) => void;
  onError: (callback: (message: ErrorMessage) => void) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
  serverUrl?: string;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ 
  children, 
  serverUrl = 'ws://localhost:8000' 
}) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    reconnecting: false,
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // Event handlers
  const textChangeHandlerRef = useRef<((message: TextChangeMessage) => void) | null>(null);
  const cursorChangeHandlerRef = useRef<((message: CursorChangeMessage) => void) | null>(null);
  const sessionJoinedHandlerRef = useRef<((message: SessionJoinedMessage) => void) | null>(null);
  const userJoinedHandlerRef = useRef<((message: UserJoinedMessage) => void) | null>(null);
  const userLeftHandlerRef = useRef<((message: UserLeftMessage) => void) | null>(null);
  const errorHandlerRef = useRef<((message: ErrorMessage) => void) | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'text_change':
          textChangeHandlerRef.current?.(message as TextChangeMessage);
          break;
        case 'cursor_change':
          cursorChangeHandlerRef.current?.(message as CursorChangeMessage);
          break;
        case 'session_joined':
          const sessionMsg = message as SessionJoinedMessage;
          setCurrentUserId(sessionMsg.user_id);
          setConnectedUsers(sessionMsg.users);
          sessionJoinedHandlerRef.current?.(sessionMsg);
          break;
        case 'user_joined':
          const userJoinedMsg = message as UserJoinedMessage;
          setConnectedUsers(prev => [...prev, userJoinedMsg.user_id]);
          userJoinedHandlerRef.current?.(userJoinedMsg);
          break;
        case 'user_left':
          const userLeftMsg = message as UserLeftMessage;
          setConnectedUsers(prev => prev.filter(id => id !== userLeftMsg.user_id));
          userLeftHandlerRef.current?.(userLeftMsg);
          break;
        case 'error':
          errorHandlerRef.current?.(message as ErrorMessage);
          break;
        case 'pong':
          // Handle ping/pong for connection health
          break;
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, []);

  const handleOpen = useCallback(() => {
    console.log('WebSocket connected');
    setConnectionStatus({ connected: true, reconnecting: false });
    reconnectAttemptsRef.current = 0;
  }, []);

  const handleClose = useCallback(() => {
    console.log('WebSocket disconnected');
    setConnectionStatus(prev => ({ 
      ...prev, 
      connected: false 
    }));

    // Attempt to reconnect if not manually disconnected
    if (currentSessionId && reconnectAttemptsRef.current < maxReconnectAttempts) {
      setConnectionStatus(prev => ({ 
        ...prev, 
        reconnecting: true 
      }));
      
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        connect(currentSessionId, currentUserId || undefined);
      }, reconnectDelay);
    }
  }, [currentSessionId, currentUserId]);

  const handleError = useCallback((error: Event) => {
    console.error('WebSocket error:', error);
    setConnectionStatus(prev => ({ 
      ...prev, 
      error: 'Connection error' 
    }));
  }, []);

  const connect = useCallback((sessionId: string, userId?: string) => {
    // Close existing connection
    if (websocketRef.current) {
      websocketRef.current.close();
    }

    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl = `${serverUrl}/ws/${sessionId}${userId ? `?user_id=${userId}` : ''}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = handleOpen;
    websocket.onmessage = handleMessage;
    websocket.onclose = handleClose;
    websocket.onerror = handleError;

    websocketRef.current = websocket;
    setCurrentSessionId(sessionId);
  }, [serverUrl, handleOpen, handleMessage, handleClose, handleError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    setCurrentSessionId(null);
    setCurrentUserId(null);
    setConnectedUsers([]);
    setConnectionStatus({ connected: false, reconnecting: false });
    reconnectAttemptsRef.current = 0;
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  const sendTextChange = useCallback((content: string, cursorPosition?: number) => {
    sendMessage({
      type: 'text_change',
      content,
      cursor_position: cursorPosition,
    });
  }, [sendMessage]);

  const sendCursorChange = useCallback((position: number, selectionStart?: number, selectionEnd?: number) => {
    sendMessage({
      type: 'cursor_change',
      position,
      selection_start: selectionStart,
      selection_end: selectionEnd,
    });
  }, [sendMessage]);

  // Event handler setters
  const onTextChange = useCallback((callback: (message: TextChangeMessage) => void) => {
    textChangeHandlerRef.current = callback;
  }, []);

  const onCursorChange = useCallback((callback: (message: CursorChangeMessage) => void) => {
    cursorChangeHandlerRef.current = callback;
  }, []);

  const onSessionJoined = useCallback((callback: (message: SessionJoinedMessage) => void) => {
    sessionJoinedHandlerRef.current = callback;
  }, []);

  const onUserJoined = useCallback((callback: (message: UserJoinedMessage) => void) => {
    userJoinedHandlerRef.current = callback;
  }, []);

  const onUserLeft = useCallback((callback: (message: UserLeftMessage) => void) => {
    userLeftHandlerRef.current = callback;
  }, []);

  const onError = useCallback((callback: (message: ErrorMessage) => void) => {
    errorHandlerRef.current = callback;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Ping/pong for connection health
  useEffect(() => {
    if (connectionStatus.connected) {
      const pingInterval = setInterval(() => {
        sendMessage({ type: 'ping' });
      }, 30000); // Ping every 30 seconds

      return () => clearInterval(pingInterval);
    }
  }, [connectionStatus.connected, sendMessage]);

  const value: WebSocketContextType = {
    connectionStatus,
    currentSessionId,
    currentUserId,
    connectedUsers,
    connect,
    disconnect,
    sendTextChange,
    sendCursorChange,
    onTextChange,
    onCursorChange,
    onSessionJoined,
    onUserJoined,
    onUserLeft,
    onError,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}; 