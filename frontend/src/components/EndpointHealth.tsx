import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, CheckCircle, MinusCircle, Activity } from 'lucide-react';
import { useApi, formatNumber } from '../hooks/useApi';
import { Loading, ErrorState } from './LoadingState';

interface TierDistribution {
  utilization_tier: string;
  endpoint_count: number;
}

interface EndpointDetail {
  endpoint_name: string;
  entity_type: string;
  entity_name: string;
  task: string;
  created_by: string;
  last_config_change: string;
  total_requests_30d: number;
  total_tokens_30d: number;
  unique_users_30d: number;
  last_request_time: string | null;
  utilization_tier: string;
}

const TIER_COLORS: Record<string, string> = {
  Idle: '#EF4444',
  'Very Low': '#F97316',
  Low: '#F59E0B',
  Moderate: '#3B82F6',
  Active: '#10B981',
};

const TIER_BG: Record<string, string> = {
  Idle: 'bg-red-500/20 text-red-300 border-red-500/30',
  'Very Low': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Low: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Moderate: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const RECOMMENDATIONS: Record<string, string> = {
  Idle: 'Consider decommissioning - no traffic in 30 days',
  'Very Low': 'Investigate low usage - may need promotion or removal',
  Low: 'Usage below expected levels - review adoption strategy',
  Moderate: 'Healthy utilization - monitor for scaling needs',
  Active: 'Well utilized - ensure capacity is sufficient',
};

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, value, name }: any) {
  if (value === 0) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#9CA3AF" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
      {name} ({value})
    </text>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-300">{d.name}</p>
      <p className="text-sm font-bold" style={{ color: d.payload.fill }}>{d.value} endpoints</p>
    </div>
  );
}

export default function EndpointHealth() {
  const { data: tiers, loading: tLoad, error: tErr } = useApi<TierDistribution[]>('/api/health/utilization-tiers');
  const { data: endpoints, loading: eLoad, error: eErr } = useApi<EndpointDetail[]>('/api/health/endpoints');

  const totalEndpoints = (tiers || []).reduce((s, t) => s + t.endpoint_count, 0);
  const idleCount = (tiers || []).find((t) => t.utilization_tier === 'Idle')?.endpoint_count || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {(tiers || []).map((t) => {
          const Icon = t.utilization_tier === 'Idle' ? AlertTriangle :
                       t.utilization_tier === 'Active' ? CheckCircle :
                       t.utilization_tier === 'Moderate' ? Activity : MinusCircle;
          return (
            <div key={t.utilization_tier} className="kpi-card">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: TIER_COLORS[t.utilization_tier] }} />
                <span className="kpi-label">{t.utilization_tier}</span>
              </div>
              <div className="kpi-value" style={{ color: TIER_COLORS[t.utilization_tier] }}>
                {t.endpoint_count}
              </div>
              <span className="text-xs text-gray-500">{totalEndpoints > 0 ? ((t.endpoint_count / totalEndpoints) * 100).toFixed(0) : 0}% of total</span>
            </div>
          );
        })}
      </div>

      {/* Donut Chart + Idle Warning */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <h3 className="card-header">Utilization Distribution</h3>
          {tLoad ? (
            <Loading />
          ) : tErr ? (
            <ErrorState message={tErr} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={(tiers || []).map((t) => ({ name: t.utilization_tier, value: t.endpoint_count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={60}
                  label={PieLabel}
                  labelLine={{ stroke: '#4B5563' }}
                >
                  {(tiers || []).map((t, i) => (
                    <Cell key={i} fill={TIER_COLORS[t.utilization_tier] || '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recommendations */}
        <div className="card lg:col-span-2">
          <h3 className="card-header">Health Recommendations</h3>
          <div className="space-y-3">
            {idleCount > 0 && (
              <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/30">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-red-300">Critical: {idleCount} Idle Endpoints</span>
                </div>
                <p className="text-xs text-gray-400">
                  These endpoints have received zero requests in the last 30 days but continue to consume resources.
                  Review and decommission unused endpoints to reduce costs.
                </p>
              </div>
            )}
            {Object.entries(RECOMMENDATIONS).map(([tier, rec]) => {
              const count = (tiers || []).find((t) => t.utilization_tier === tier)?.endpoint_count || 0;
              if (count === 0) return null;
              return (
                <div key={tier} className="flex items-start gap-3 p-3 rounded-lg bg-db-dark-700/50">
                  <div
                    className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0"
                    style={{ backgroundColor: TIER_COLORS[tier] }}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-200">{tier}</span>
                    <span className="text-xs text-gray-500 ml-2">({count} endpoints)</span>
                    <p className="text-xs text-gray-400 mt-0.5">{rec}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Endpoints Table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">All Endpoints</h3>
        {eLoad ? (
          <Loading />
        ) : eErr ? (
          <ErrorState message={eErr} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Type</th>
                <th>Tier</th>
                <th className="text-right">Requests (30d)</th>
                <th className="text-right">Tokens (30d)</th>
                <th className="text-right">Users (30d)</th>
                <th>Last Request</th>
                <th>Last Config Change</th>
              </tr>
            </thead>
            <tbody>
              {(endpoints || []).map((ep, i) => (
                <tr key={i} className={ep.utilization_tier === 'Idle' ? 'bg-red-900/10' : ''}>
                  <td className="font-medium text-gray-200 max-w-[250px] truncate">{ep.endpoint_name}</td>
                  <td className="text-xs text-gray-400">{ep.entity_type?.replace(/_/g, ' ')}</td>
                  <td>
                    <span className={`tier-badge border ${TIER_BG[ep.utilization_tier] || ''}`}>
                      {ep.utilization_tier}
                    </span>
                  </td>
                  <td className="text-right font-mono">{formatNumber(ep.total_requests_30d)}</td>
                  <td className="text-right font-mono">{formatNumber(ep.total_tokens_30d)}</td>
                  <td className="text-right font-mono">{ep.unique_users_30d}</td>
                  <td className="text-xs font-mono text-gray-400">
                    {ep.last_request_time ? ep.last_request_time.slice(0, 16).replace('T', ' ') : 'Never'}
                  </td>
                  <td className="text-xs font-mono text-gray-400">
                    {ep.last_config_change ? ep.last_config_change.slice(0, 16).replace('T', ' ') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
