/**
 * Language Server Protocol Integration
 * Provides advanced code intelligence features like autocomplete, error highlighting, and go-to-definition
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import { 
  MonacoLanguageClient, MonacoServices, CloseAction, ErrorAction,
  MessageTransports, createConnection 
} from 'monaco-languageclient';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import { 
  DocumentUri, TextDocumentIdentifier, CompletionItem, Diagnostic,
  Hover, Location, WorkspaceEdit
} from 'vscode-languageserver-protocol';
import { 
  Code, Lightbulb, Search, AlertCircle, CheckCircle, 
  Zap, FileText, GitBranch, Settings
} from 'lucide-react';

// Language Server configurations
const LANGUAGE_SERVERS = {
  typescript: {
    name: 'TypeScript Language Server',
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    serverUrl: 'ws://localhost:3001/typescript',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  python: {
    name: 'Python Language Server (Pylsp)',
    languages: ['python'],
    serverUrl: 'ws://localhost:3002/python',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  rust: {
    name: 'Rust Language Server (rust-analyzer)',
    languages: ['rust'],
    serverUrl: 'ws://localhost:3003/rust',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  go: {
    name: 'Go Language Server (gopls)',
    languages: ['go'],
    serverUrl: 'ws://localhost:3004/go',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  java: {
    name: 'Java Language Server (jdtls)',
    languages: ['java'],
    serverUrl: 'ws://localhost:3005/java',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  csharp: {
    name: 'C# Language Server (OmniSharp)',
    languages: ['csharp'],
    serverUrl: 'ws://localhost:3006/csharp',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  cpp: {
    name: 'C++ Language Server (clangd)',
    languages: ['cpp', 'c'],
    serverUrl: 'ws://localhost:3007/cpp',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  php: {
    name: 'PHP Language Server (intelephense)',
    languages: ['php'],
    serverUrl: 'ws://localhost:3008/php',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  ruby: {
    name: 'Ruby Language Server (solargraph)',
    languages: ['ruby'],
    serverUrl: 'ws://localhost:3009/ruby',
    features: ['completion', 'diagnostics', 'hover', 'definition', 'references', 'formatting']
  },
  json: {
    name: 'JSON Language Server',
    languages: ['json', 'jsonc'],
    serverUrl: 'ws://localhost:3010/json',
    features: ['completion', 'diagnostics', 'hover', 'formatting']
  }
};

interface LanguageServerStatus {
  language: string;
  connected: boolean;
  client?: MonacoLanguageClient;
  diagnostics: Diagnostic[];
  lastActivity: Date;
  features: string[];
}

interface LSPIntegrationProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  language: string;
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void;
  onStatusChange?: (status: LanguageServerStatus) => void;
}

const LanguageServerIntegration: React.FC<LSPIntegrationProps> = ({
  editor,
  language,
  onDiagnosticsChange,
  onStatusChange
}) => {
  const [serverStatus, setServerStatus] = useState<LanguageServerStatus>({
    language,
    connected: false,
    diagnostics: [],
    lastActivity: new Date(),
    features: []
  });
  
  const clientRef = useRef<MonacoLanguageClient | null>(null);
  const connectionRef = useRef<WebSocket | null>(null);

  // Initialize Monaco Language Services
  useEffect(() => {
    MonacoServices.install();
  }, []);

  // Create and connect to language server
  const connectToLanguageServer = useCallback(async (lang: string) => {
    const serverConfig = LANGUAGE_SERVERS[lang as keyof typeof LANGUAGE_SERVERS];
    
    if (!serverConfig) {
      console.warn(`No language server configuration found for ${lang}`);
      return;
    }

    try {
      // Create WebSocket connection
      const webSocket = new WebSocket(serverConfig.serverUrl);
      connectionRef.current = webSocket;

      webSocket.onopen = () => {
        const socket = toSocket(webSocket);
        const reader = new WebSocketMessageReader(socket);
        const writer = new WebSocketMessageWriter(socket);
        const languageClient = createLanguageClient(reader, writer, serverConfig);
        
        clientRef.current = languageClient;
        
        // Start the language client
        languageClient.start();
        
        setServerStatus(prev => ({
          ...prev,
          connected: true,
          client: languageClient,
          features: serverConfig.features,
          lastActivity: new Date()
        }));

        console.log(`✅ Connected to ${serverConfig.name}`);
      };

      webSocket.onclose = () => {
        setServerStatus(prev => ({
          ...prev,
          connected: false,
          client: undefined
        }));
        console.log(`❌ Disconnected from ${serverConfig.name}`);
      };

      webSocket.onerror = (error) => {
        console.error(`Language server connection error for ${lang}:`, error);
        setServerStatus(prev => ({
          ...prev,
          connected: false,
          client: undefined
        }));
      };

    } catch (error) {
      console.error(`Failed to connect to language server for ${lang}:`, error);
    }
  }, []);

  // Create Monaco Language Client
  const createLanguageClient = (
    reader: WebSocketMessageReader,
    writer: WebSocketMessageWriter,
    serverConfig: typeof LANGUAGE_SERVERS[keyof typeof LANGUAGE_SERVERS]
  ): MonacoLanguageClient => {
    const client = new MonacoLanguageClient({
      name: serverConfig.name,
      clientOptions: {
        documentSelector: serverConfig.languages.map(lang => ({ language: lang })),
        errorHandler: {
          error: () => ({ action: ErrorAction.Continue }),
          closed: () => ({ action: CloseAction.DoNotRestart })
        },
        workspaceFolder: {
          uri: 'file:///workspace',
          name: 'workspace'
        },
        initializationOptions: {
          // Language-specific initialization options
          ...(serverConfig.name.includes('TypeScript') && {
            preferences: {
              includeCompletionsForModuleExports: true,
              includeCompletionsWithInsertText: true
            }
          }),
          ...(serverConfig.name.includes('Python') && {
            settings: {
              pylsp: {
                plugins: {
                  pycodestyle: { enabled: true },
                  pyflakes: { enabled: true },
                  autopep8: { enabled: true }
                }
              }
            }
          })
        }
      },
      connectionProvider: {
        get: () => Promise.resolve(createConnection(reader, writer))
      }
    });

    // Handle diagnostics
    client.onReady().then(() => {
      client.onNotification('textDocument/publishDiagnostics', (params) => {
        const diagnostics = params.diagnostics as Diagnostic[];
        setServerStatus(prev => ({
          ...prev,
          diagnostics,
          lastActivity: new Date()
        }));
        
        onDiagnosticsChange?.(diagnostics);
      });
    });

    return client;
  };

  // Connect to appropriate language server when language changes
  useEffect(() => {
    if (language && LANGUAGE_SERVERS[language as keyof typeof LANGUAGE_SERVERS]) {
      connectToLanguageServer(language);
    }

    return () => {
      // Cleanup on unmount or language change
      if (clientRef.current) {
        clientRef.current.stop();
        clientRef.current = null;
      }
      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }
    };
  }, [language, connectToLanguageServer]);

  // Register custom actions and commands
  useEffect(() => {
    if (!editor || !serverStatus.connected) return;

    const disposables: monaco.IDisposable[] = [];

    // Register format document action
    disposables.push(
      editor.addAction({
        id: 'format-document-lsp',
        label: 'Format Document (LSP)',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        contextMenuGroupId: 'lsp',
        contextMenuOrder: 1,
        run: async () => {
          if (clientRef.current) {
            try {
              const model = editor.getModel();
              if (model) {
                const edits = await clientRef.current.sendRequest('textDocument/formatting', {
                  textDocument: { uri: model.uri.toString() },
                  options: {
                    tabSize: 2,
                    insertSpaces: true
                  }
                });
                
                if (edits && edits.length > 0) {
                  editor.executeEdits('lsp-format', edits.map((edit: any) => ({
                    range: edit.range,
                    text: edit.newText
                  })));
                }
              }
            } catch (error) {
              console.error('Format document failed:', error);
            }
          }
        }
      })
    );

    // Register go to definition action
    disposables.push(
      editor.addAction({
        id: 'go-to-definition-lsp',
        label: 'Go to Definition (LSP)',
        keybindings: [monaco.KeyCode.F12],
        contextMenuGroupId: 'lsp',
        contextMenuOrder: 2,
        run: async () => {
          if (clientRef.current) {
            try {
              const position = editor.getPosition();
              const model = editor.getModel();
              
              if (position && model) {
                const locations = await clientRef.current.sendRequest('textDocument/definition', {
                  textDocument: { uri: model.uri.toString() },
                  position: {
                    line: position.lineNumber - 1,
                    character: position.column - 1
                  }
                });
                
                if (locations && locations.length > 0) {
                  const location = locations[0] as Location;
                  // In a real implementation, you'd navigate to the location
                  console.log('Go to definition:', location);
                }
              }
            } catch (error) {
              console.error('Go to definition failed:', error);
            }
          }
        }
      })
    );

    // Register find references action
    disposables.push(
      editor.addAction({
        id: 'find-references-lsp',
        label: 'Find References (LSP)',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
        contextMenuGroupId: 'lsp',
        contextMenuOrder: 3,
        run: async () => {
          if (clientRef.current) {
            try {
              const position = editor.getPosition();
              const model = editor.getModel();
              
              if (position && model) {
                const references = await clientRef.current.sendRequest('textDocument/references', {
                  textDocument: { uri: model.uri.toString() },
                  position: {
                    line: position.lineNumber - 1,
                    character: position.column - 1
                  },
                  context: { includeDeclaration: true }
                });
                
                if (references && references.length > 0) {
                  console.log('References found:', references);
                  // In a real implementation, you'd show references in a panel
                }
              }
            } catch (error) {
              console.error('Find references failed:', error);
            }
          }
        }
      })
    );

    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [editor, serverStatus.connected]);

  // Update status callback
  useEffect(() => {
    onStatusChange?.(serverStatus);
  }, [serverStatus, onStatusChange]);

  // Sync document changes with language server
  useEffect(() => {
    if (!editor || !serverStatus.connected || !clientRef.current) return;

    const model = editor.getModel();
    if (!model) return;

    let version = 0;

    // Send document open notification
    clientRef.current.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: model.uri.toString(),
        languageId: language,
        version: version++,
        text: model.getValue()
      }
    });

    // Listen for content changes
    const disposable = model.onDidChangeContent((event) => {
      if (clientRef.current) {
        clientRef.current.sendNotification('textDocument/didChange', {
          textDocument: {
            uri: model.uri.toString(),
            version: version++
          },
          contentChanges: event.changes.map(change => ({
            range: {
              start: {
                line: change.range.startLineNumber - 1,
                character: change.range.startColumn - 1
              },
              end: {
                line: change.range.endLineNumber - 1,
                character: change.range.endColumn - 1
              }
            },
            text: change.text
          }))
        });
      }
    });

    return () => {
      // Send document close notification
      if (clientRef.current) {
        clientRef.current.sendNotification('textDocument/didClose', {
          textDocument: { uri: model.uri.toString() }
        });
      }
      disposable.dispose();
    };
  }, [editor, language, serverStatus.connected]);

  return null; // This component doesn't render anything visible
};

// Language Server Status Component
interface LSPStatusProps {
  status: LanguageServerStatus;
}

export const LSPStatus: React.FC<LSPStatusProps> = ({ status }) => {
  const getStatusColor = () => {
    if (!status.connected) return 'text-red-600 bg-red-50';
    if (status.diagnostics.some(d => d.severity === 1)) return 'text-red-600 bg-red-50';
    if (status.diagnostics.some(d => d.severity === 2)) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusIcon = () => {
    if (!status.connected) return <AlertCircle className="w-4 h-4" />;
    if (status.diagnostics.some(d => d.severity === 1)) return <AlertCircle className="w-4 h-4" />;
    if (status.diagnostics.some(d => d.severity === 2)) return <Lightbulb className="w-4 h-4" />;
    return <CheckCircle className="w-4 h-4" />;
  };

  const errorCount = status.diagnostics.filter(d => d.severity === 1).length;
  const warningCount = status.diagnostics.filter(d => d.severity === 2).length;

  return (
    <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${getStatusColor()}`}>
      {getStatusIcon()}
      <span className="font-medium">
        {status.connected ? 'LSP Connected' : 'LSP Disconnected'}
      </span>
      {status.connected && (
        <span className="text-xs">
          {errorCount > 0 && `${errorCount} errors`}
          {errorCount > 0 && warningCount > 0 && ', '}
          {warningCount > 0 && `${warningCount} warnings`}
          {errorCount === 0 && warningCount === 0 && 'No issues'}
        </span>
      )}
    </div>
  );
};

// Diagnostics Panel Component
interface DiagnosticsPanelProps {
  diagnostics: Diagnostic[];
  onDiagnosticClick?: (diagnostic: Diagnostic) => void;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ 
  diagnostics, 
  onDiagnosticClick 
}) => {
  const getSeverityIcon = (severity: number) => {
    switch (severity) {
      case 1: return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 2: return <Lightbulb className="w-4 h-4 text-yellow-600" />;
      case 3: return <FileText className="w-4 h-4 text-blue-600" />;
      case 4: return <Search className="w-4 h-4 text-gray-600" />;
      default: return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  const getSeverityText = (severity: number) => {
    switch (severity) {
      case 1: return 'Error';
      case 2: return 'Warning';
      case 3: return 'Information';
      case 4: return 'Hint';
      default: return 'Unknown';
    }
  };

  if (diagnostics.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-600" />
        <p>No diagnostics</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {diagnostics.map((diagnostic, index) => (
        <div
          key={index}
          className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
          onClick={() => onDiagnosticClick?.(diagnostic)}
        >
          <div className="flex items-start space-x-3">
            {getSeverityIcon(diagnostic.severity || 1)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">
                  {getSeverityText(diagnostic.severity || 1)}
                </span>
                <span className="text-xs text-gray-500">
                  Line {(diagnostic.range.start.line + 1)}:{(diagnostic.range.start.character + 1)}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-1">{diagnostic.message}</p>
              {diagnostic.source && (
                <p className="text-xs text-gray-500 mt-1">Source: {diagnostic.source}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LanguageServerIntegration; 