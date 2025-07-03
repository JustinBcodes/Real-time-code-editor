/**
 * Collaborative Editor component using Monaco Editor
 * Handles real-time text synchronization and cursor tracking
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useWebSocket } from '../context/WebSocketContext';
import { TextChangeMessage, CursorChangeMessage, User } from '../types';

interface CollaborativeEditorProps {
  initialContent?: string;
  language?: string;
  theme?: string;
  onContentChange?: (content: string) => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  initialContent = '',
  language = 'javascript',
  theme = 'vs-dark',
  onContentChange,
}) => {
  const { 
    sendTextChange, 
    sendCursorChange, 
    onTextChange, 
    onCursorChange,
    currentUserId,
    connectedUsers 
  } = useWebSocket();
  
  const [content, setContent] = useState(initialContent);
  const [cursors, setCursors] = useState<Map<string, User>>(new Map());
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isRemoteChange = useRef(false);
  const lastSentContent = useRef(initialContent);

  // Handle remote text changes
  useEffect(() => {
    onTextChange((message: TextChangeMessage) => {
      if (message.user_id === currentUserId) return; // Ignore our own changes
      
      isRemoteChange.current = true;
      setContent(message.content);
      lastSentContent.current = message.content;
      
      // Update the editor content
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        if (model && model.getValue() !== message.content) {
          model.setValue(message.content);
        }
      }
      
      isRemoteChange.current = false;
    });
  }, [onTextChange, currentUserId]);

  // Handle remote cursor changes
  useEffect(() => {
    onCursorChange((message: CursorChangeMessage) => {
      if (message.user_id === currentUserId) return; // Ignore our own cursor
      
      setCursors(prev => {
        const newCursors = new Map(prev);
        newCursors.set(message.user_id, {
          user_id: message.user_id,
          cursor_position: message.position,
          selection_start: message.selection_start,
          selection_end: message.selection_end,
        });
        return newCursors;
      });
      
      // Update cursor decorations in editor
      updateCursorDecorations();
    });
  }, [onCursorChange, currentUserId]);

  // Update cursor decorations in the editor
  const updateCursorDecorations = useCallback(() => {
    if (!editorRef.current) return;
    
    const model = editorRef.current.getModel();
    if (!model) return;
    
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    
    cursors.forEach((user, userId) => {
      if (userId === currentUserId || !user.cursor_position) return;
      
      const position = model.getPositionAt(user.cursor_position);
      
      // Create cursor decoration
      decorations.push({
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        options: {
          className: `remote-cursor remote-cursor-${userId.slice(-6)}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: { value: `Cursor: ${userId}` }
        }
      });
      
      // Create selection decoration if exists
      if (user.selection_start !== undefined && user.selection_end !== undefined && 
          user.selection_start !== user.selection_end) {
        const startPos = model.getPositionAt(user.selection_start);
        const endPos = model.getPositionAt(user.selection_end);
        
        decorations.push({
          range: new monaco.Range(
            startPos.lineNumber, 
            startPos.column, 
            endPos.lineNumber, 
            endPos.column
          ),
          options: {
            className: `remote-selection remote-selection-${userId.slice(-6)}`,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          }
        });
      }
    });
    
    editorRef.current.deltaDecorations([], decorations);
  }, [cursors, currentUserId]);

  // Handle editor mount
  const handleEditorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    
    // Set initial content
    if (initialContent) {
      editor.setValue(initialContent);
    }
    
    // Handle content changes
    editor.onDidChangeModelContent((event) => {
      if (isRemoteChange.current) return; // Don't send remote changes back
      
      const newContent = editor.getValue();
      setContent(newContent);
      
      // Only send changes if content actually changed and it's different from last sent
      if (newContent !== lastSentContent.current) {
        const position = editor.getPosition();
        const offset = position ? editor.getModel()?.getOffsetAt(position) : 0;
        
        sendTextChange(newContent, offset);
        lastSentContent.current = newContent;
        onContentChange?.(newContent);
      }
    });
    
    // Handle cursor position changes
    editor.onDidChangeCursorPosition((event) => {
      if (isRemoteChange.current) return;
      
      const model = editor.getModel();
      if (!model) return;
      
      const position = event.position;
      const offset = model.getOffsetAt(position);
      
      // Get selection if exists
      const selection = editor.getSelection();
      let selectionStart: number | undefined;
      let selectionEnd: number | undefined;
      
      if (selection && !selection.isEmpty()) {
        selectionStart = model.getOffsetAt(selection.getStartPosition());
        selectionEnd = model.getOffsetAt(selection.getEndPosition());
      }
      
      sendCursorChange(offset, selectionStart, selectionEnd);
    });
    
    // Handle selection changes
    editor.onDidChangeCursorSelection((event) => {
      if (isRemoteChange.current) return;
      
      const model = editor.getModel();
      if (!model) return;
      
      const selection = event.selection;
      const position = selection.getPosition();
      const offset = model.getOffsetAt(position);
      
      let selectionStart: number | undefined;
      let selectionEnd: number | undefined;
      
      if (!selection.isEmpty()) {
        selectionStart = model.getOffsetAt(selection.getStartPosition());
        selectionEnd = model.getOffsetAt(selection.getEndPosition());
      }
      
      sendCursorChange(offset, selectionStart, selectionEnd);
    });
    
    // Configure editor options
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 14,
      lineHeight: 21,
      fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, monospace',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      folding: true,
      cursorStyle: 'line',
      cursorBlinking: 'blink',
      insertSpaces: true,
      tabSize: 2,
    });
  }, [initialContent, sendTextChange, sendCursorChange, onContentChange]);

  // Update decorations when cursors change
  useEffect(() => {
    updateCursorDecorations();
  }, [updateCursorDecorations]);

  // Update content when initial content changes
  useEffect(() => {
    if (initialContent !== content && !isRemoteChange.current) {
      setContent(initialContent);
      lastSentContent.current = initialContent;
      
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        if (model && model.getValue() !== initialContent) {
          model.setValue(initialContent);
        }
      }
    }
  }, [initialContent, content]);

  return (
    <div className="w-full h-full relative">
      <Editor
        height="100%"
        language={language}
        theme={theme}
        value={content}
        onMount={handleEditorDidMount}
        options={{
          selectOnLineNumbers: true,
          roundedSelection: false,
          readOnly: false,
          cursorStyle: 'line',
          automaticLayout: true,
        }}
      />
      
      {/* Custom styles for remote cursors */}
      <style>{`
        .remote-cursor {
          border-left: 2px solid #ff6b6b;
          position: relative;
          z-index: 1000;
        }
        
        .remote-cursor::before {
          content: '';
          position: absolute;
          top: -2px;
          left: -1px;
          width: 6px;
          height: 6px;
          background-color: #ff6b6b;
          border-radius: 50%;
        }
        
        .remote-selection {
          background-color: rgba(255, 107, 107, 0.2);
        }
        
        /* Different colors for different users */
        .remote-cursor-${currentUserId?.slice(-6)} {
          border-left-color: #4ecdc4;
        }
        .remote-cursor-${currentUserId?.slice(-6)}::before {
          background-color: #4ecdc4;
        }
        .remote-selection-${currentUserId?.slice(-6)} {
          background-color: rgba(78, 205, 196, 0.2);
        }
      `}</style>
    </div>
  );
}; 