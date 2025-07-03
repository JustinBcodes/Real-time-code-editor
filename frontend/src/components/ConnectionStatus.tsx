/**
 * Connection Status component to display WebSocket connection state
 */

import React from 'react';
import { Wifi, WifiOff, RotateCcw, AlertCircle } from 'lucide-react';
import { ConnectionStatus as ConnectionStatusType } from '../types';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  status, 
  className = '' 
}) => {
  const getStatusConfig = () => {
    if (status.connected) {
      return {
        icon: <Wifi size={16} />,
        text: 'Connected',
        className: 'text-green-400 bg-green-900/30 border-green-700',
      };
    }
    
    if (status.reconnecting) {
      return {
        icon: <RotateCcw size={16} className="animate-spin" />,
        text: 'Reconnecting...',
        className: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
      };
    }
    
    if (status.error) {
      return {
        icon: <AlertCircle size={16} />,
        text: status.error,
        className: 'text-red-400 bg-red-900/30 border-red-700',
      };
    }
    
    return {
      icon: <WifiOff size={16} />,
      text: 'Disconnected',
      className: 'text-gray-400 bg-gray-900/30 border-gray-700',
    };
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg border text-sm font-medium ${config.className} ${className}`}>
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
}; 