import { useState } from 'react';
import {
  BarChart3,
  Shield,
  DollarSign,
  Activity,
  Network,
  Heart,
  MessageSquare,
  LayoutDashboard,
  BookOpen,
} from 'lucide-react';
import Overview from './components/Overview';
import ModelServing from './components/ModelServing';
import AIGateway from './components/AIGateway';
import CostObservatory from './components/CostObservatory';
import AccessSecurity from './components/AccessSecurity';
import EndpointHealth from './components/EndpointHealth';
import GenieQA from './components/GenieQA';
import PolicyAssistant from './components/PolicyAssistant';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'serving', label: 'Model Serving', icon: BarChart3 },
  { id: 'gateway', label: 'AI Gateway', icon: Network },
  { id: 'cost', label: 'Cost Observatory', icon: DollarSign },
  { id: 'access', label: 'Access & Security', icon: Shield },
  { id: 'health', label: 'Endpoint Health', icon: Heart },
  { id: 'policy', label: 'Policy Assistant', icon: BookOpen },
  { id: 'genie', label: 'Genie Q&A', icon: MessageSquare },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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
                  AI Governance & Observability
                </h1>
                <p className="text-[11px] text-gray-500 leading-tight">
                  MT&T Enterprise AI Platform
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Last 30 Days</span>
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

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {activeTab === 'overview' && <Overview />}
        {activeTab === 'serving' && <ModelServing />}
        {activeTab === 'gateway' && <AIGateway />}
        {activeTab === 'cost' && <CostObservatory />}
        {activeTab === 'access' && <AccessSecurity />}
        {activeTab === 'health' && <EndpointHealth />}
        {activeTab === 'policy' && <PolicyAssistant />}
        {activeTab === 'genie' && <GenieQA />}
      </main>
    </div>
  );
}
