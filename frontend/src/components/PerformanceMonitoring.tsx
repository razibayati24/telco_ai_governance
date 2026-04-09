import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useApi, formatNumber } from '../hooks/useApi';
import { Loading, ErrorState, EmptyState } from './LoadingState';

interface LatencyData {
  destination_model: string;
  avg_latency_ms: number;
  avg_ttfb_ms: number;
  total_requests: number;
}

interface DailyRequests {
  day: string;
  total_requests: number;
}

interface DailyErrors {
  day: string;
  total_requests: number;
  total_errors: number;
  error_rate_pct: number;
}

interface SlaRow {
  destination_model: string;
  avg_latency: number;
  max_latency: number;
  total_requests: number;
  error_rate: number;
  sla_status: string;
}

interface ModelTokens {
  destination_model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
}

const SLA_COLORS: Record<string, string> = {
  GREEN: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
  YELLOW: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
  RED: 'text-red-400 bg-red-500/20 border-red-500/30',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? (p.name?.includes('Rate') || p.name?.includes('%') ? p.value.toFixed(2) + '%' : formatNumber(p.value)) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function PerformanceMonitoring() {
  const { data: latency, loading: lLoad, error: lErr } = useApi<LatencyData[]>('/api/gateway/latency-by-model');
  const { data: dailyReqs, loading: rLoad, error: rErr } = useApi<DailyRequests[]>('/api/performance/daily-requests');
  const { data: dailyErrors, loading: eLoad, error: eErr } = useApi<DailyErrors[]>('/api/performance/daily-errors');
  const { data: sla, loading: sLoad, error: sErr } = useApi<SlaRow[]>('/api/performance/sla');
  const { data: modelTokens, loading: tLoad, error: tErr } = useApi<ModelTokens[]>('/api/performance/model-tokens');

  // Truncate model names for latency chart
  const latencyChartData = (latency || []).slice(0, 15).map((m) => ({
    ...m,
    name: m.destination_model?.length > 22 ? m.destination_model.slice(0, 19) + '...' : m.destination_model,
  }));

  // Token chart data
  const tokenChartData = (modelTokens || []).map((m) => ({
    ...m,
    name: m.destination_model?.length > 22 ? m.destination_model.slice(0, 19) + '...' : m.destination_model,
  }));

  return (
    <div className="space-y-6">
      {/* Latency by Model + Throughput Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency by Model */}
        <div className="card">
          <h3 className="card-header">Avg Latency by Model (ms)</h3>
          {lLoad ? (
            <Loading />
          ) : lErr ? (
            <ErrorState message={lErr} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, (latencyChartData.length || 1) * 32)}>
              <BarChart data={latencyChartData} layout="vertical" margin={{ left: 150 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
                <XAxis type="number" stroke="#4B5563" fontSize={11} tickFormatter={(v) => `${formatNumber(v)}ms`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={145}
                  stroke="#4B5563"
                  fontSize={10}
                  tick={{ fill: '#9CA3AF' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                <Bar dataKey="avg_latency_ms" name="Avg Latency" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="avg_ttfb_ms" name="Avg TTFB" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Throughput Trend */}
        <div className="card">
          <h3 className="card-header">Daily Request Throughput</h3>
          {rLoad ? (
            <Loading />
          ) : rErr ? (
            <ErrorState message={rErr} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyReqs || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v?.slice(5, 10)}
                  stroke="#4B5563"
                  fontSize={11}
                />
                <YAxis stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total_requests"
                  name="Requests"
                  stroke="#FF6F00"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#FF6F00' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Error Rate Trend + Top Models by Tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Error Rate Trend */}
        <div className="card">
          <h3 className="card-header">Daily Error Rate Trend</h3>
          {eLoad ? (
            <Loading />
          ) : eErr ? (
            <ErrorState message={eErr} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyErrors || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v?.slice(5, 10)}
                  stroke="#4B5563"
                  fontSize={11}
                />
                <YAxis
                  stroke="#4B5563"
                  fontSize={11}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} className="text-xs" style={{ color: p.color }}>
                            {p.name}: {p.value?.toFixed(2)}%
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="error_rate_pct"
                  name="Error Rate %"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#EF4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Models by Token Consumption */}
        <div className="card">
          <h3 className="card-header">Top Models by Token Consumption</h3>
          {tLoad ? (
            <Loading />
          ) : tErr ? (
            <ErrorState message={tErr} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, (tokenChartData.length || 1) * 32)}>
              <BarChart data={tokenChartData} layout="vertical" margin={{ left: 150 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
                <XAxis type="number" stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={145}
                  stroke="#4B5563"
                  fontSize={10}
                  tick={{ fill: '#9CA3AF' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                <Bar dataKey="total_input_tokens" name="Input Tokens" fill="#8B5CF6" stackId="1" barSize={18} />
                <Bar dataKey="total_output_tokens" name="Output Tokens" fill="#10B981" stackId="1" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* SLA Validation Table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">SLA Validation</h3>
        {sLoad ? (
          <Loading />
        ) : sErr ? (
          <ErrorState message={sErr} />
        ) : (sla || []).length === 0 ? (
          <EmptyState message="No SLA data available" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Avg Latency (ms)</th>
                <th className="text-right">Max Latency (ms)</th>
                <th className="text-right">Total Requests</th>
                <th className="text-right">Error Rate</th>
                <th>SLA Status</th>
              </tr>
            </thead>
            <tbody>
              {(sla || []).map((s, i) => (
                <tr key={i}>
                  <td className="font-medium text-gray-200">{s.destination_model}</td>
                  <td className="text-right font-mono">{(s.avg_latency ?? 0).toFixed(0)}ms</td>
                  <td className="text-right font-mono text-gray-400">{(s.max_latency ?? 0).toFixed(0)}ms</td>
                  <td className="text-right font-mono">{formatNumber(s.total_requests)}</td>
                  <td className={`text-right font-mono ${(s.error_rate ?? 0) > 5 ? 'text-red-400' : (s.error_rate ?? 0) > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {(s.error_rate ?? 0).toFixed(2)}%
                  </td>
                  <td>
                    <span className={`tier-badge border ${SLA_COLORS[s.sla_status] || 'text-gray-400 bg-gray-500/20'}`}>
                      {s.sla_status}
                    </span>
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
