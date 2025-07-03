/**
 * Main App component for the Collaborative Code Editor
 */

import React, { useState, useEffect, useCallback } from 'react';
import { WebSocketProvider, useWebSocket } from './context/WebSocketContext';
import { CollaborativeEditor } from './components/CollaborativeEditor';
import { SessionManager } from './components/SessionManager';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Code2, Users, Settings, Download, Upload } from 'lucide-react';
import { SessionJoinedMessage, UserJoinedMessage, UserLeftMessage, ErrorMessage } from './types';

const AppContent: React.FC = () => {
  const {
    connectionStatus,
    currentSessionId,
    currentUserId,
    connectedUsers,
    connect,
    disconnect,
    onSessionJoined,
    onUserJoined,
    onUserLeft,
    onError,
  } = useWebSocket();

  const [sessionContent, setSessionContent] = useState('');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [language, setLanguage] = useState('javascript');
  const [theme, setTheme] = useState('vs-dark');

  // Handle session events
  useEffect(() => {
    onSessionJoined((message: SessionJoinedMessage) => {
      setSessionContent(message.content);
      addNotification(`Joined session: ${message.session_id}`);
    });

    onUserJoined((message: UserJoinedMessage) => {
      addNotification(`${message.user_id} joined the session`);
    });

    onUserLeft((message: UserLeftMessage) => {
      addNotification(`${message.user_id} left the session`);
    });

    onError((message: ErrorMessage) => {
      addNotification(`Error: ${message.message}`, 'error');
    });
  }, [onSessionJoined, onUserJoined, onUserLeft, onError]);

  const addNotification = (message: string, type: 'info' | 'error' = 'info') => {
    const notification = `${new Date().toLocaleTimeString()}: ${message}`;
    setNotifications(prev => [...prev.slice(-4), notification]); // Keep last 5 notifications
    
    // Auto remove notification after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n !== notification));
    }, 5000);
  };

  const handleJoinSession = useCallback((sessionId: string) => {
    connect(sessionId);
  }, [connect]);

  const handleLeaveSession = useCallback(() => {
    disconnect();
    setSessionContent('');
  }, [disconnect]);

  const handleContentChange = useCallback((content: string) => {
    setSessionContent(content);
  }, []);

  const downloadFile = () => {
    const blob = new Blob([sessionContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collaborative-session-${currentSessionId || 'untitled'}.${getFileExtension(language)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const uploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.ts,.py,.java,.cpp,.c,.html,.css,.json,.md,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setSessionContent(content);
          
          // Detect language from file extension
          const ext = file.name.split('.').pop()?.toLowerCase();
          const detectedLanguage = getLanguageFromExtension(ext || '');
          if (detectedLanguage) {
            setLanguage(detectedLanguage);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const getFileExtension = (lang: string): string => {
    const extensions: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      html: 'html',
      css: 'css',
      json: 'json',
      markdown: 'md',
    };
    return extensions[lang] || 'txt';
  };

  const getLanguageFromExtension = (ext: string): string => {
    const languages: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
    };
    return languages[ext] || 'javascript';
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Code2 size={28} className="text-blue-400" />
            <div>
              <h1 className="text-xl font-bold">Collaborative Code Editor</h1>
              <p className="text-sm text-gray-400">Real-time collaborative coding</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Language Selector */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="c">C</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
            </select>

            {/* Theme Selector */}
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="vs-dark">Dark</option>
              <option value="vs-light">Light</option>
              <option value="hc-black">High Contrast</option>
            </select>

            {/* File Operations */}
            <div className="flex space-x-2">
              <button
                onClick={uploadFile}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                title="Upload file"
              >
                <Upload size={16} />
              </button>
              <button
                onClick={downloadFile}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                title="Download file"
              >
                <Download size={16} />
              </button>
            </div>

            {/* Connection Status */}
            <ConnectionStatus status={connectionStatus} />

            {/* Leave Session Button */}
            {currentSessionId && (
              <button
                onClick={handleLeaveSession}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
              >
                Leave Session
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Session Manager */}
      <SessionManager
        onJoinSession={handleJoinSession}
        currentSessionId={currentSessionId}
        connectedUsers={connectedUsers}
      />

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 relative">
          {currentSessionId ? (
            <CollaborativeEditor
              initialContent={sessionContent}
              language={language}
              theme={theme}
              onContentChange={handleContentChange}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-900">
              <div className="text-center">
                <Code2 size={64} className="text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-400 mb-2">
                  Welcome to Collaborative Code Editor
                </h2>
                <p className="text-gray-500">
                  Create or join a session to start collaborative coding
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {currentSessionId && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            {/* Connected Users */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center space-x-2 mb-3">
                <Users size={16} className="text-blue-400" />
                <h3 className="font-semibold">Connected Users</h3>
              </div>
              <div className="space-y-2">
                {connectedUsers.map((userId) => (
                  <div
                    key={userId}
                    className={`flex items-center space-x-2 p-2 rounded ${
                      userId === currentUserId ? 'bg-blue-900/30' : 'bg-gray-900/50'
                    }`}
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm">{userId}</span>
                    {userId === currentUserId && (
                      <span className="text-xs text-blue-400">(You)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="flex-1 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Settings size={16} className="text-gray-400" />
                <h3 className="font-semibold">Activity</h3>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notifications.map((notification, index) => (
                  <div
                    key={index}
                    className="text-xs text-gray-400 p-2 bg-gray-900/50 rounded"
                  >
                    {notification}
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="text-xs text-gray-500 italic">
                    No recent activity
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
};

export default App; 