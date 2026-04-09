import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useApi, formatDbu, formatNumber } from '../hooks/useApi';
import { Loading, ErrorState, EmptyState } from './LoadingState';

interface DailyCost {
  day: string;
  cost_category: string;
  total_dbus: number;
}

interface CostDistribution {
  cost_category: string;
  total_dbus: number;
}

interface CostBySku {
  sku_name: string;
  cost_category: string;
  total_dbus: number;
}

interface CostAnomaly {
  usage_date: string;
  cost_category: string;
  daily_dbus: number;
  rolling_avg_7d: number;
  is_anomaly: boolean;
  pct_change: number;
}

interface EndpointTokens {
  endpoint_name: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
}

const COST_COLORS: Record<string, string> = {
  'Anthropic Model Serving': '#8B5CF6',
  'OpenAI Model Serving': '#10B981',
  'Gemini Model Serving': '#3B82F6',
  'Model Training': '#F59E0B',
  'Real-Time Inference': '#FF6F00',
};

const PIE_COLORS = ['#FF6F00', '#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EC4899'];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color || p.payload?.fill }}>
          {p.name}: {formatDbu(p.value)} DBUs
        </p>
      ))}
    </div>
  );
}

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function CostAnomalies() {
  const { data: dailyCost, loading: dLoad, error: dErr } = useApi<DailyCost[]>('/api/cost/daily');
  const { data: distribution, loading: pLoad, error: pErr } = useApi<CostDistribution[]>('/api/cost/distribution');
  const { data: anomalies, loading: aLoad, error: aErr } = useApi<CostAnomaly[]>('/api/cost/anomalies');
  const { data: endpointTokens, loading: eLoad, error: eErr } = useApi<EndpointTokens[]>('/api/cost/endpoint-tokens');

  // Pivot daily cost for stacked area chart
  const costChartData = (() => {
    if (!dailyCost) return [];
    const byDay: Record<string, any> = {};
    dailyCost.forEach((r) => {
      if (!byDay[r.day]) byDay[r.day] = { day: r.day };
      byDay[r.day][r.cost_category] = (byDay[r.day][r.cost_category] || 0) + r.total_dbus;
    });
    return Object.values(byDay).sort((a: any, b: any) => a.day.localeCompare(b.day));
  })();

  const categories = dailyCost ? [...new Set(dailyCost.map((r) => r.cost_category))] : [];
  const totalDbus = (distribution || []).reduce((sum, d) => sum + d.total_dbus, 0);

  // Aggregate anomalies for cost chart overlay -- group by date, sum dbus
  const anomalyDays = new Set(
    (anomalies || []).filter((a) => a.is_anomaly).map((a) => a.usage_date)
  );

  // Anomaly points for the chart
  const anomalyPoints = costChartData
    .filter((d: any) => anomalyDays.has(d.day))
    .map((d: any) => {
      const totalForDay = categories.reduce((s, cat) => s + (d[cat] || 0), 0);
      return { day: d.day, total: totalForDay };
    });

  // Anomaly alerts table data
  const anomalyAlerts = (anomalies || [])
    .filter((a) => a.is_anomaly)
    .sort((a, b) => b.usage_date.localeCompare(a.usage_date));

  const anomalyCount = anomalyAlerts.length;

  // Endpoint tokens chart data (truncate names)
  const tokenChartData = (endpointTokens || []).map((e) => ({
    ...e,
    name: e.endpoint_name.length > 25 ? e.endpoint_name.slice(0, 22) + '...' : e.endpoint_name,
  }));

  return (
    <div className="space-y-6">
      {/* Total Cost Banner + Anomaly Count */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 bg-gradient-to-r from-db-dark-800 to-db-dark-700 border-db-orange/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total AI Cost (Last 30 Days)</p>
              <p className="text-3xl font-bold text-white mt-1">{formatDbu(totalDbus)} <span className="text-lg text-gray-400">DBUs</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Categories</p>
              <p className="text-xl font-bold text-db-orange">{categories.length}</p>
            </div>
          </div>
        </div>
        <div className={`card ${anomalyCount > 0 ? 'bg-gradient-to-r from-red-900/20 to-db-dark-800 border-red-500/30' : 'bg-gradient-to-r from-emerald-900/20 to-db-dark-800 border-emerald-500/30'}`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-8 h-8 ${anomalyCount > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
            <div>
              <p className="text-sm text-gray-400">Cost Anomalies Detected</p>
              <p className={`text-2xl font-bold ${anomalyCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{anomalyCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stacked Area Chart + Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Area Chart with anomaly markers */}
        <div className="card lg:col-span-2">
          <h3 className="card-header">Daily Cost Trend by Category</h3>
          {dLoad ? (
            <Loading />
          ) : dErr ? (
            <ErrorState message={dErr} />
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={costChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v?.slice(5, 10)}
                  stroke="#4B5563"
                  fontSize={11}
                />
                <YAxis stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatDbu(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#9CA3AF' }} />
                {categories.map((cat) => (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    name={cat}
                    stackId="1"
                    stroke={COST_COLORS[cat] || '#6B7280'}
                    fill={COST_COLORS[cat] || '#6B7280'}
                    fillOpacity={0.6}
                  />
                ))}
                {/* Anomaly markers */}
                {anomalyPoints.map((ap, i) => (
                  <ReferenceDot
                    key={i}
                    x={ap.day}
                    y={ap.total}
                    r={6}
                    fill="#EF4444"
                    stroke="#991B1B"
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart */}
        <div className="card">
          <h3 className="card-header">Cost Distribution</h3>
          {pLoad ? (
            <Loading />
          ) : pErr ? (
            <ErrorState message={pErr} />
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={distribution || []}
                    dataKey="total_dbus"
                    nameKey="cost_category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    labelLine={false}
                    label={PieLabel}
                  >
                    {(distribution || []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {(distribution || []).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-300">{d.cost_category}</span>
                    </div>
                    <span className="font-mono text-gray-400">{formatDbu(d.total_dbus)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Endpoint Token Consumption */}
      <div className="card">
        <h3 className="card-header">Top 15 Endpoints by Token Consumption</h3>
        {eLoad ? (
          <Loading />
        ) : eErr ? (
          <ErrorState message={eErr} />
        ) : (tokenChartData.length === 0) ? (
          <EmptyState message="No endpoint token data available" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, tokenChartData.length * 32)}>
            <BarChart data={tokenChartData} layout="vertical" margin={{ left: 180 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
              <XAxis type="number" stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <YAxis
                type="category"
                dataKey="name"
                width={175}
                stroke="#4B5563"
                fontSize={10}
                tick={{ fill: '#9CA3AF' }}
              />
              <Tooltip
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      {payload.map((p: any, i: number) => (
                        <p key={i} className="text-xs" style={{ color: p.color }}>
                          {p.name}: {formatNumber(p.value)}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
              <Bar dataKey="total_input_tokens" name="Input Tokens" fill="#8B5CF6" stackId="1" barSize={18} />
              <Bar dataKey="total_output_tokens" name="Output Tokens" fill="#10B981" stackId="1" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Anomaly Alerts Table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Anomaly Alerts</h3>
        {aLoad ? (
          <Loading />
        ) : aErr ? (
          <ErrorState message={aErr} />
        ) : anomalyAlerts.length === 0 ? (
          <EmptyState message="No cost anomalies detected - all costs within normal range" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th className="text-right">Daily DBUs</th>
                <th className="text-right">7d Rolling Avg</th>
                <th className="text-right">% Change</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {anomalyAlerts.map((a, i) => {
                const absChange = Math.abs(a.pct_change || 0);
                const severity = absChange > 100 ? 'Critical' : absChange > 50 ? 'High' : 'Medium';
                const severityColor = severity === 'Critical' ? 'text-red-400 bg-red-500/20 border-red-500/30' :
                                      severity === 'High' ? 'text-amber-400 bg-amber-500/20 border-amber-500/30' :
                                      'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
                return (
                  <tr key={i} className="bg-red-900/5">
                    <td className="font-mono text-xs text-gray-300">{a.usage_date}</td>
                    <td>
                      <span
                        className="tier-badge"
                        style={{
                          backgroundColor: `${COST_COLORS[a.cost_category] || '#6B7280'}20`,
                          color: COST_COLORS[a.cost_category] || '#9CA3AF',
                          borderColor: `${COST_COLORS[a.cost_category] || '#6B7280'}40`,
                          borderWidth: '1px',
                        }}
                      >
                        {a.cost_category}
                      </span>
                    </td>
                    <td className="text-right font-mono">{formatDbu(a.daily_dbus)}</td>
                    <td className="text-right font-mono text-gray-400">{formatDbu(a.rolling_avg_7d)}</td>
                    <td className={`text-right font-mono ${(a.pct_change || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {(a.pct_change || 0) > 0 ? '+' : ''}{(a.pct_change || 0).toFixed(1)}%
                    </td>
                    <td>
                      <span className={`tier-badge border ${severityColor}`}>
                        {severity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
