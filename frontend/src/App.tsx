import { useState } from 'react';
import { MessageSquare, BarChart3, Activity } from 'lucide-react';
import Chat from './components/Chat';
import Dashboards from './components/Dashboards';
import { useAppConfig } from './hooks/useAppConfig';

/* ----------------------------------------------------------------------
 * Top-level app shell — two tabs:
 *   • Chat:        Full-page Multi-Agent Supervisor (Agent Bricks)
 *                  experience.  Wires to /api/agent/{config,ask}.
 *   • Dashboards:  Container for the original 6 analytics sub-tabs
 *                  (Overview, Cost & Anomalies, Performance, Quality,
 *                  Queries, Security).  Lives in components/Dashboards.tsx.
 *
 * Brand-aware: header strings come from /api/config (useAppConfig).
 * -------------------------------------------------------------------- */

const topTabs = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'dashboards', label: 'Dashboards', icon: BarChart3 },
] as const;

type TopTabId = (typeof topTabs)[number]['id'];

export default function App() {
  const cfg = useAppConfig();
  const [activeTab, setActiveTab] = useState<TopTabId>('chat');

  return (
    <div className="min-h-screen bg-db-dark-900 flex flex-col">
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

          <nav className="flex items-center gap-1">
            {topTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-db-orange text-white shadow-lg shadow-db-orange/20'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-db-dark-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400">Live</span>
          </div>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'dashboards' && <Dashboards />}
      </div>
    </div>
  );
}
