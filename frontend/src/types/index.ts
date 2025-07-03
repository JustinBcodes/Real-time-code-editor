/**
 * Type definitions for the collaborative code editor
 */

export interface User {
  user_id: string;
  cursor_position?: number;
  connected_at?: string;
  selection_start?: number;
  selection_end?: number;
}

export interface Session {
  session_id: string;
  content: string;
  user_count: number;
  users: string[];
  created_at?: string;
  last_activity?: string;
}

export interface Operation {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  text?: string;
  length?: number;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface TextChangeMessage extends WebSocketMessage {
  type: 'text_change';
  content: string;
  user_id: string;
  operations: Operation[];
  cursor_position?: number;
  timestamp: string;
}

export interface CursorChangeMessage extends WebSocketMessage {
  type: 'cursor_change';
  user_id: string;
  position: number;
  selection_start?: number;
  selection_end?: number;
  timestamp: string;
}

export interface SessionJoinedMessage extends WebSocketMessage {
  type: 'session_joined';
  session_id: string;
  user_id: string;
  content: string;
  users: string[];
}

export interface UserJoinedMessage extends WebSocketMessage {
  type: 'user_joined';
  user_id: string;
  timestamp: string;
}

export interface UserLeftMessage extends WebSocketMessage {
  type: 'user_left';
  user_id: string;
  timestamp: string;
}

export interface ErrorMessage extends WebSocketMessage {
  type: 'error';
  message: string;
}

export interface ConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  error?: string;
}

export interface EditorTheme {
  name: string;
  theme: string;
}

export interface SessionInfo {
  session_id: string;
  connection_count: number;
  users: User[];
  content_length: number;
  created_at: string;
} 