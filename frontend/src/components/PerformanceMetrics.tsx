/**
 * Real-time Performance Metrics Dashboard
 * Displays comprehensive system and collaboration metrics with live updates
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { 
  Activity, Users, Zap, Server, Clock, TrendingUp, 
  AlertTriangle, CheckCircle, XCircle, Wifi, Database,
  Gauge, BarChart3, Timer, Network
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWebSocket } from '../context/WebSocketContext';

interface PerformanceData {
  latency: {
    avg: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
    samples: number;
  };
  throughput: {
    operations_per_second: number;
    messages_per_second: number;
  };
  connections: {
    active: number;
    total: number;
    errors: number;
    reconnections: number;
  };
  errors: {
    total_errors: number;
    error_rate_per_minute: number;
    error_breakdown: Record<string, number>;
  };
  system: {
    sessions_active: number;
    timestamp: number;
  };
}

interface SystemMetrics {
  timestamp: number;
  uptime_seconds: number;
  system: {
    cpu_percent: number;
    memory_total_gb: number;
    memory_used_gb: number;
    memory_percent: number;
    disk_total_gb: number;
    disk_used_gb: number;
    disk_percent: number;
  };
  process: {
    memory_rss_mb: number;
    memory_vms_mb: number;
    cpu_percent: number;
    num_threads: number;
    open_files: number;
    connections: number;
  };
}

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  color?: 'green' | 'red' | 'yellow' | 'blue';
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, value, icon, trend, color = 'blue', subtitle 
}) => {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`p-4 rounded-lg border-2 ${colorClasses[color]} transition-all duration-200`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {icon}
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs opacity-75">{subtitle}</p>}
          </div>
        </div>
        {trend && (
          <div className={`text-sm ${
            trend === 'up' ? 'text-green-600' : 
            trend === 'down' ? 'text-red-600' : 'text-gray-600'
          }`}>
            <TrendingUp className={`w-4 h-4 ${trend === 'down' ? 'rotate-180' : ''}`} />
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface LatencyHistoryItem {
  timestamp: number;
  avg: number;
  p95: number;
  p99: number;
}

const PerformanceMetrics: React.FC = () => {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<LatencyHistoryItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const { connectionStatus } = useWebSocket();

  // Fetch performance metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics');
      const data = await response.json();
      
      setPerformanceData(data.performance);
      setSystemMetrics(data.system);
      setIsConnected(true);
      setLastUpdate(new Date());

      // Update latency history
      if (data.performance?.latency) {
        setLatencyHistory(prev => {
          const newEntry: LatencyHistoryItem = {
            timestamp: Date.now(),
            avg: data.performance.latency.avg,
            p95: data.performance.latency.p95,
            p99: data.performance.latency.p99
          };
          
          // Keep last 50 entries (for a 5-minute window with 6-second intervals)
          const updated = [...prev, newEntry].slice(-50);
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      setIsConnected(false);
    }
  }, []);

  // Setup metrics polling
  useEffect(() => {
    fetchMetrics(); // Initial fetch
    
    const interval = setInterval(fetchMetrics, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 ** 3);
    return gb > 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 ** 2)).toFixed(0)}MB`;
  };

  const getLatencyStatus = (latency: number): { color: 'green' | 'yellow' | 'red', status: string } => {
    if (latency < 50) return { color: 'green', status: 'Excellent' };
    if (latency < 100) return { color: 'yellow', status: 'Good' };
    return { color: 'red', status: 'Needs Attention' };
  };

  const getConnectionStatus = () => {
    if (!isConnected) return { color: 'red' as const, text: 'Disconnected', icon: <XCircle className="w-5 h-5" /> };
    if (!connectionStatus.connected) return { color: 'yellow' as const, text: 'Connecting', icon: <AlertTriangle className="w-5 h-5" /> };
    return { color: 'green' as const, text: 'Connected', icon: <CheckCircle className="w-5 h-5" /> };
  };

  if (!performanceData || !systemMetrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-gray-600">Loading performance metrics...</p>
        </div>
      </div>
    );
  }

  const status = getConnectionStatus();
  const latencyStatus = getLatencyStatus(performanceData.latency.avg);
  
  // Prepare error breakdown data for pie chart
  const errorData = Object.entries(performanceData.errors.error_breakdown).map(([type, count]) => ({
    name: type,
    value: count
  }));

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Performance Dashboard</h1>
          <p className="text-gray-600">Real-time collaborative editor metrics</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium bg-${status.color}-100 text-${status.color}-800`}>
            {status.icon}
            <span>{status.text}</span>
          </div>
          {lastUpdate && (
            <p className="text-sm text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Avg Latency"
          value={`${performanceData.latency.avg.toFixed(1)}ms`}
          subtitle={latencyStatus.status}
          icon={<Timer className="w-6 h-6" />}
          color={latencyStatus.color}
        />
        
        <MetricCard
          title="Active Users"
          value={performanceData.connections.active}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        
        <MetricCard
          title="Operations/sec"
          value={performanceData.throughput.operations_per_second}
          icon={<Zap className="w-6 h-6" />}
          color="green"
        />
        
        <MetricCard
          title="Active Sessions"
          value={performanceData.system.sessions_active}
          icon={<Network className="w-6 h-6" />}
          color="blue"
        />
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="CPU Usage"
          value={`${systemMetrics.system.cpu_percent.toFixed(1)}%`}
          icon={<Gauge className="w-6 h-6" />}
          color={systemMetrics.system.cpu_percent > 80 ? 'red' : systemMetrics.system.cpu_percent > 60 ? 'yellow' : 'green'}
        />
        
        <MetricCard
          title="Memory Usage"
          value={`${systemMetrics.system.memory_percent.toFixed(1)}%`}
          subtitle={`${formatBytes(systemMetrics.system.memory_used_gb * 1024**3)} / ${formatBytes(systemMetrics.system.memory_total_gb * 1024**3)}`}
          icon={<Server className="w-6 h-6" />}
          color={systemMetrics.system.memory_percent > 80 ? 'red' : systemMetrics.system.memory_percent > 60 ? 'yellow' : 'green'}
        />
        
        <MetricCard
          title="Uptime"
          value={formatUptime(systemMetrics.uptime_seconds)}
          icon={<Clock className="w-6 h-6" />}
          color="green"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Latency Trend Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Latency Trends
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={latencyHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              />
              <YAxis label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleTimeString()}
                formatter={(value: number) => [`${value.toFixed(1)}ms`, '']}
              />
              <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} name="Average" />
              <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={2} name="95th Percentile" />
              <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={2} name="99th Percentile" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Error Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Error Breakdown
          </h3>
          {errorData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={errorData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {errorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-green-600">
              <div className="text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                <p className="text-lg font-medium">No Errors</p>
                <p className="text-sm text-gray-500">System running smoothly</p>
              </div>
            </div>
          )}
        </div>

        {/* Connection Stats */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Wifi className="w-5 h-5 mr-2" />
            Connection Statistics
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Active Connections</span>
              <span className="font-semibold text-lg">{performanceData.connections.active}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Connections</span>
              <span className="font-semibold text-lg">{performanceData.connections.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Connection Errors</span>
              <span className={`font-semibold text-lg ${performanceData.connections.errors > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {performanceData.connections.errors}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Reconnections</span>
              <span className="font-semibold text-lg">{performanceData.connections.reconnections}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Success Rate</span>
              <span className="font-semibold text-lg text-green-600">
                {((performanceData.connections.total - performanceData.connections.errors) / Math.max(performanceData.connections.total, 1) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Throughput Metrics */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Throughput Metrics
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Operations per Second</span>
                <span className="font-semibold text-lg">{performanceData.throughput.operations_per_second}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(performanceData.throughput.operations_per_second / 100 * 100, 100)}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Messages per Second</span>
                <span className="font-semibold text-lg">{performanceData.throughput.messages_per_second}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(performanceData.throughput.messages_per_second / 500 * 100, 100)}%` }}
                />
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Target:</strong> Sub-50ms latency, 1000+ ops/sec capacity
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Latency Stats */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Detailed Latency Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{performanceData.latency.avg.toFixed(1)}ms</p>
            <p className="text-sm text-gray-600">Average</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{performanceData.latency.min.toFixed(1)}ms</p>
            <p className="text-sm text-gray-600">Minimum</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{performanceData.latency.max.toFixed(1)}ms</p>
            <p className="text-sm text-gray-600">Maximum</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">{performanceData.latency.p95.toFixed(1)}ms</p>
            <p className="text-sm text-gray-600">95th Percentile</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{performanceData.latency.p99.toFixed(1)}ms</p>
            <p className="text-sm text-gray-600">99th Percentile</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            Samples: {performanceData.latency.samples} | Target: &lt;50ms average latency
          </p>
        </div>
      </div>

    </div>
  );
};

export default PerformanceMetrics; 