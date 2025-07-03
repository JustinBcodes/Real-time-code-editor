/**
 * Session Manager component for creating and joining collaborative sessions
 */

import React, { useState, useEffect } from 'react';
import { Users, Plus, LogIn, Copy, Check, AlertCircle } from 'lucide-react';
import { Session } from '../types';

interface SessionManagerProps {
  onJoinSession: (sessionId: string) => void;
  currentSessionId?: string | null;
  connectedUsers: string[];
}

export const SessionManager: React.FC<SessionManagerProps> = ({
  onJoinSession,
  currentSessionId,
  connectedUsers,
}) => {
  const [sessionId, setSessionId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const API_BASE_URL = 'http://localhost:8000/api';

  // Clear messages after timeout
  useEffect(() => {
    if (error || success) {
      const timeout = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [error, success]);

  // Clear copied state after timeout
  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copied]);

  const createSession = async () => {
    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const session: Session = await response.json();
      setSuccess(`Session created: ${session.session_id}`);
      onJoinSession(session.session_id);
    } catch (err) {
      setError('Failed to create session. Please try again.');
      console.error('Create session error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const joinSession = async () => {
    if (!sessionId.trim()) {
      setError('Please enter a session ID');
      return;
    }

    setIsJoining(true);
    setError('');
    setSuccess('');

    try {
      // Check if session exists
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId.trim()}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Session not found');
        }
        throw new Error('Failed to join session');
      }

      const session: Session = await response.json();
      setSuccess(`Joining session: ${session.session_id}`);
      onJoinSession(session.session_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
      console.error('Join session error:', err);
    } finally {
      setIsJoining(false);
    }
  };

  const copySessionId = async () => {
    if (!currentSessionId) return;

    try {
      await navigator.clipboard.writeText(currentSessionId);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy session ID:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = currentSessionId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
    }
  };

  const generateRandomId = () => {
    const randomId = Math.random().toString(36).substring(2, 10);
    setSessionId(randomId);
  };

  return (
    <div className="bg-gray-800 border-b border-gray-700 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Current Session Info */}
        {currentSessionId && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-400 font-medium">Connected to session:</span>
                  <code className="bg-green-900/50 px-2 py-1 rounded text-green-300">
                    {currentSessionId}
                  </code>
                </div>
                <button
                  onClick={copySessionId}
                  className="flex items-center space-x-1 text-green-400 hover:text-green-300 transition-colors"
                  title="Copy session ID"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="flex items-center space-x-2 text-green-400">
                <Users size={16} />
                <span className="text-sm">
                  {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''} online
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Session Controls */}
        {!currentSessionId && (
          <div className="space-y-4">
            {/* Create New Session */}
            <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Plus size={20} className="mr-2" />
                Create New Session
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Start a new collaborative coding session and share the session ID with others.
              </p>
              <button
                onClick={createSession}
                disabled={isCreating}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>{isCreating ? 'Creating...' : 'Create Session'}</span>
              </button>
            </div>

            {/* Join Existing Session */}
            <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <LogIn size={20} className="mr-2" />
                Join Existing Session
              </h3>
              <p className="text-gray-400 text-sm mb-3">
                Enter a session ID to join an existing collaborative session.
              </p>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="Enter session ID"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && joinSession()}
                  />
                </div>
                <button
                  onClick={generateRandomId}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                  title="Generate random ID"
                >
                  🎲
                </button>
                <button
                  onClick={joinSession}
                  disabled={isJoining || !sessionId.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
                >
                  <LogIn size={16} />
                  <span>{isJoining ? 'Joining...' : 'Join'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-center space-x-2">
            <AlertCircle size={16} className="text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded-lg flex items-center space-x-2">
            <Check size={16} className="text-green-400" />
            <span className="text-green-400">{success}</span>
          </div>
        )}
      </div>
    </div>
  );
}; 