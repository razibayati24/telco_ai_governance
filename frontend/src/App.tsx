import { useState, useCallback } from 'react';
import {
  LayoutDashboard,
  DollarSign,
  Gauge,
  FlaskConical,
  Database,
  ShieldAlert,
  RefreshCw,
  Activity,
} from 'lucide-react';
import Overview from './components/Overview';
import CostAnomalies from './components/CostAnomalies';
import PerformanceMonitoring from './components/PerformanceMonitoring';
import QualityEvaluation from './components/QualityEvaluation';
import QueryOptimization from './components/QueryOptimization';
import SecurityAudit from './components/SecurityAudit';
import ChatPopups from './components/ChatPopups';
import { clearAllCache } from './hooks/useApi';
import { useAppConfig } from './hooks/useAppConfig';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cost', label: 'Cost & Anomalies', icon: DollarSign },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'quality', label: 'Quality Evaluation', icon: FlaskConical },
  { id: 'queries', label: 'Query Optimization', icon: Database },
  { id: 'security', label: 'Security Audit', icon: ShieldAlert },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function App() {
  const cfg = useAppConfig();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = useCallback(() => {
    clearAllCache();
    setSpinning(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSpinning(false), 800);
  }, []);

  return (
    <div className="min-h-screen bg-db-dark-900">
      {/* Header */}
      <header className="bg-db-dark-800 border-b border-db-dark-600 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-db-orange rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">
                  {cfg.brand.name} AI Landscape
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  {cfg.app.subtitle}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Last 30 Days</span>
            <button
              onClick={handleRefresh}
              title="Refresh all data"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-db-dark-700 hover:bg-db-dark-600 border border-db-dark-600 hover:border-db-orange/40 transition-all"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400">Live</span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-db-dark-800/50 border-b border-db-dark-700 backdrop-blur-sm sticky top-[60px] z-40">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1 py-2 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-button flex items-center gap-2 whitespace-nowrap ${
                    isActive ? 'tab-button-active' : 'tab-button-inactive'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content -- refreshKey forces remount to re-fetch after cache clear */}
      <main key={refreshKey} className="max-w-[1600px] mx-auto px-6 py-6">
        {activeTab === 'overview' && <Overview />}
        {activeTab === 'cost' && <CostAnomalies />}
        {activeTab === 'performance' && <PerformanceMonitoring />}
        {activeTab === 'quality' && <QualityEvaluation />}
        {activeTab === 'queries' && <QueryOptimization />}
        {activeTab === 'security' && <SecurityAudit />}
      </main>

      {/* Floating Chat Popups */}
      <ChatPopups />
    </div>
  );
}
