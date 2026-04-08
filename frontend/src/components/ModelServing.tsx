import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useApi, formatNumber } from '../hooks/useApi';
import { Loading, ErrorState } from './LoadingState';

interface TopEndpoint {
  endpoint_name: string;
  entity_type: string;
  total_requests: number;
  total_tokens: number;
  total_errors: number;
  error_rate_pct: number;
}

interface EndpointDetail {
  endpoint_name: string;
  entity_type: string;
  entity_name: string;
  task: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_errors: number;
  error_rate_pct: number;
  unique_users: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl max-w-xs">
      <p className="text-xs text-gray-300 mb-1 truncate">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
}

const ENTITY_COLORS: Record<string, string> = {
  FOUNDATION_MODEL: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  CUSTOM_MODEL: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  EXTERNAL_MODEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

export default function ModelServing() {
  const [filter, setFilter] = useState<string>('');
  const { data: entityTypes } = useApi<string[]>('/api/serving/entity-types');
  const {
    data: topEndpoints,
    loading: tLoad,
    error: tErr,
  } = useApi<TopEndpoint[]>(`/api/serving/top-endpoints${filter ? `?entity_type=${filter}` : ''}`);
  const {
    data: allEndpoints,
    loading: aLoad,
    error: aErr,
  } = useApi<EndpointDetail[]>(`/api/serving/all-endpoints${filter ? `?entity_type=${filter}` : ''}`);

  // Chart data - top 20 truncated names
  const chartData = (topEndpoints || []).map((e) => ({
    ...e,
    name: e.endpoint_name.length > 25 ? e.endpoint_name.slice(0, 22) + '...' : e.endpoint_name,
  }));

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Filter by type:</span>
        <button
          onClick={() => setFilter('')}
          className={`tab-button text-xs ${!filter ? 'tab-button-active' : 'tab-button-inactive'}`}
        >
          All
        </button>
        {(entityTypes || []).map((et) => (
          <button
            key={et}
            onClick={() => setFilter(et)}
            className={`tab-button text-xs ${filter === et ? 'tab-button-active' : 'tab-button-inactive'}`}
          >
            {et.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Top Endpoints Bar Chart */}
      <div className="card">
        <h3 className="card-header">Top 20 Endpoints by Request Volume (30d)</h3>
        {tLoad ? (
          <Loading />
        ) : tErr ? (
          <ErrorState message={tErr} />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(400, (chartData.length || 1) * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 180 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
              <XAxis type="number" stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <YAxis
                type="category"
                dataKey="name"
                width={175}
                stroke="#4B5563"
                fontSize={11}
                tick={{ fill: '#9CA3AF' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total_requests" name="Requests" fill="#FF6F00" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Endpoints Table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">All Endpoints Detail</h3>
        {aLoad ? (
          <Loading />
        ) : aErr ? (
          <ErrorState message={aErr} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Type</th>
                <th>Task</th>
                <th className="text-right">Requests</th>
                <th className="text-right">Input Tokens</th>
                <th className="text-right">Output Tokens</th>
                <th className="text-right">Total Tokens</th>
                <th className="text-right">Errors</th>
                <th className="text-right">Error Rate</th>
                <th className="text-right">Users</th>
              </tr>
            </thead>
            <tbody>
              {(allEndpoints || []).map((ep, i) => (
                <tr key={i}>
                  <td className="font-medium text-gray-200 max-w-[200px] truncate">{ep.endpoint_name}</td>
                  <td>
                    <span className={`tier-badge border ${ENTITY_COLORS[ep.entity_type] || 'bg-gray-500/20 text-gray-300'}`}>
                      {ep.entity_type?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-gray-400 text-xs">{ep.task || '-'}</td>
                  <td className="text-right font-mono">{formatNumber(ep.total_requests)}</td>
                  <td className="text-right font-mono">{formatNumber(ep.total_input_tokens)}</td>
                  <td className="text-right font-mono">{formatNumber(ep.total_output_tokens)}</td>
                  <td className="text-right font-mono">{formatNumber(ep.total_tokens)}</td>
                  <td className="text-right font-mono">{formatNumber(ep.total_errors)}</td>
                  <td className={`text-right font-mono ${ep.error_rate_pct > 5 ? 'text-red-400' : ep.error_rate_pct > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {ep.error_rate_pct}%
                  </td>
                  <td className="text-right font-mono">{ep.unique_users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
