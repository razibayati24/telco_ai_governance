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
import { Loading, ErrorState } from './LoadingState';

interface ModelStats {
  destination_model: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  avg_latency_ms: number;
  avg_ttfb_ms: number;
  total_errors: number;
}

interface DailyTokens {
  day: string;
  destination_model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface LatencyData {
  destination_model: string;
  avg_latency_ms: number;
  avg_ttfb_ms: number;
  total_requests: number;
}

const MODEL_COLORS = [
  '#FF6F00', '#8B5CF6', '#10B981', '#3B82F6', '#F59E0B',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#06B6D4', '#E11D48', '#A855F7', '#22C55E', '#EAB308',
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? formatNumber(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

export default function AIGateway() {
  const { data: byModel, loading: mLoad, error: mErr } = useApi<ModelStats[]>('/api/gateway/by-model');
  const { data: dailyTokens, loading: dLoad, error: dErr } = useApi<DailyTokens[]>('/api/gateway/daily-tokens');
  const { data: latency, loading: lLoad, error: lErr } = useApi<LatencyData[]>('/api/gateway/latency-by-model');

  // Pivot daily tokens by model for multi-line chart
  const tokenChartData = (() => {
    if (!dailyTokens) return [];
    const byDay: Record<string, any> = {};
    dailyTokens.forEach((r) => {
      if (!byDay[r.day]) byDay[r.day] = { day: r.day };
      byDay[r.day][r.destination_model] = (byDay[r.day][r.destination_model] || 0) + r.total_tokens;
    });
    return Object.values(byDay).sort((a: any, b: any) => a.day.localeCompare(b.day));
  })();

  const allModels = dailyTokens ? [...new Set(dailyTokens.map((r) => r.destination_model))] : [];

  // Truncate model names for bar chart
  const requestChartData = (byModel || []).map((m) => ({
    ...m,
    name: m.destination_model?.length > 20 ? m.destination_model.slice(0, 17) + '...' : m.destination_model,
  }));

  const latencyChartData = (latency || []).map((m) => ({
    ...m,
    name: m.destination_model?.length > 20 ? m.destination_model.slice(0, 17) + '...' : m.destination_model,
  }));

  return (
    <div className="space-y-6">
      {/* Requests by Model + Latency by Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests by Model */}
        <div className="card">
          <h3 className="card-header">Requests by Model (30d)</h3>
          {mLoad ? (
            <Loading />
          ) : mErr ? (
            <ErrorState message={mErr} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, (requestChartData.length || 1) * 32)}>
              <BarChart data={requestChartData} layout="vertical" margin={{ left: 150 }}>
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
                <Bar dataKey="total_requests" name="Requests" fill="#FF6F00" radius={[0, 4, 4, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

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
                <Bar dataKey="avg_latency_ms" name="Avg Latency" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="avg_ttfb_ms" name="Avg TTFB" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Token Consumption Trends */}
      <div className="card">
        <h3 className="card-header">Token Consumption Trends by Model</h3>
        {dLoad ? (
          <Loading />
        ) : dErr ? (
          <ErrorState message={dErr} />
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={tokenChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => v?.slice(5, 10)}
                stroke="#4B5563"
                fontSize={11}
              />
              <YAxis stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
              {allModels.slice(0, 10).map((model, i) => (
                <Line
                  key={model}
                  type="monotone"
                  dataKey={model}
                  name={model}
                  stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Model Details Table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Model Details</h3>
        {mLoad ? (
          <Loading />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Requests</th>
                <th className="text-right">Input Tokens</th>
                <th className="text-right">Output Tokens</th>
                <th className="text-right">Total Tokens</th>
                <th className="text-right">Avg Latency</th>
                <th className="text-right">Avg TTFB</th>
                <th className="text-right">Errors</th>
              </tr>
            </thead>
            <tbody>
              {(byModel || []).map((m, i) => (
                <tr key={i}>
                  <td className="font-medium text-gray-200">{m.destination_model}</td>
                  <td className="text-right font-mono">{formatNumber(m.total_requests)}</td>
                  <td className="text-right font-mono">{formatNumber(m.total_input_tokens)}</td>
                  <td className="text-right font-mono">{formatNumber(m.total_output_tokens)}</td>
                  <td className="text-right font-mono">{formatNumber(m.total_tokens)}</td>
                  <td className="text-right font-mono">{m.avg_latency_ms?.toFixed(0)}ms</td>
                  <td className="text-right font-mono">{m.avg_ttfb_ms?.toFixed(0)}ms</td>
                  <td className="text-right font-mono">{formatNumber(m.total_errors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
