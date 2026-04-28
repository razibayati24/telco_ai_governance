import { useCallback, useState } from 'react';
import {
  LayoutDashboard,
  DollarSign,
  Gauge,
  FlaskConical,
  Database,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import Overview from './Overview';
import CostAnomalies from './CostAnomalies';
import PerformanceMonitoring from './PerformanceMonitoring';
import QualityEvaluation from './QualityEvaluation';
import QueryOptimization from './QueryOptimization';
import SecurityAudit from './SecurityAudit';
import { clearAllCache } from '../hooks/useApi';

/* ----------------------------------------------------------------------
 * Dashboards container — holds the original 6 dashboard sub-tabs.
 * Lifted out of App.tsx so the top-level layout can host two tabs:
 * Chat (full-page) and Dashboards (this file).
 * -------------------------------------------------------------------- */

const subTabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cost', label: 'Cost & Anomalies', icon: DollarSign },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'quality', label: 'Quality Evaluation', icon: FlaskConical },
  { id: 'queries', label: 'Query Optimization', icon: Database },
  { id: 'security', label: 'Security Audit', icon: ShieldAlert },
] as const;

type SubTabId = (typeof subTabs)[number]['id'];

export default function Dashboards() {
  const [activeTab, setActiveTab] = useState<SubTabId>('overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = useCallback(() => {
    clearAllCache();
    setSpinning(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSpinning(false), 800);
  }, []);

  return (
    <div className="flex flex-col">
      {/* Sub-tab navigation */}
      <nav className="bg-db-dark-800/50 border-b border-db-dark-700 backdrop-blur-sm sticky top-[60px] z-40">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between">
          <div className="flex gap-1 py-2 overflow-x-auto">
            {subTabs.map((tab) => {
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
          </div>
        </div>
      </nav>

      {/* Content -- refreshKey forces remount to re-fetch after cache clear */}
      <main key={refreshKey} className="max-w-[1600px] mx-auto w-full px-6 py-6">
        {activeTab === 'overview' && <Overview />}
        {activeTab === 'cost' && <CostAnomalies />}
        {activeTab === 'performance' && <PerformanceMonitoring />}
        {activeTab === 'quality' && <QualityEvaluation />}
        {activeTab === 'queries' && <QueryOptimization />}
        {activeTab === 'security' && <SecurityAudit />}
      </main>
    </div>
  );
}
