import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useApi, formatDbu } from '../hooks/useApi';
import { Loading, ErrorState } from './LoadingState';

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

const COST_COLORS: Record<string, string> = {
  'Anthropic Model Serving': '#8B5CF6',
  'OpenAI Model Serving': '#10B981',
  'Gemini Model Serving': '#3B82F6',
  'Model Training': '#F59E0B',
  'Real-Time Inference': '#FF6F00',
};

const PIE_COLORS = ['#FF6F00', '#8B5CF6', '#10B981', '#3B82F6', '#F59E0B'];

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

export default function CostObservatory() {
  const { data: dailyCost, loading: dLoad, error: dErr } = useApi<DailyCost[]>('/api/cost/daily');
  const { data: distribution, loading: pLoad, error: pErr } = useApi<CostDistribution[]>('/api/cost/distribution');
  const { data: bySku, loading: sLoad, error: sErr } = useApi<CostBySku[]>('/api/cost/by-sku');

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

  return (
    <div className="space-y-6">
      {/* Total Cost Banner */}
      <div className="card bg-gradient-to-r from-db-dark-800 to-db-dark-700 border-db-orange/30">
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

      {/* Stacked Area Chart + Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Area Chart */}
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

      {/* SKU Cost Table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Cost by SKU</h3>
        {sLoad ? (
          <Loading />
        ) : sErr ? (
          <ErrorState message={sErr} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU Name</th>
                <th>Category</th>
                <th className="text-right">Total DBUs</th>
                <th className="text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {(bySku || []).map((s, i) => (
                <tr key={i}>
                  <td className="font-medium text-gray-200 max-w-[400px]">
                    <span className="text-xs font-mono">{s.sku_name}</span>
                  </td>
                  <td>
                    <span
                      className="tier-badge"
                      style={{
                        backgroundColor: `${COST_COLORS[s.cost_category] || '#6B7280'}20`,
                        color: COST_COLORS[s.cost_category] || '#9CA3AF',
                        borderColor: `${COST_COLORS[s.cost_category] || '#6B7280'}40`,
                        borderWidth: '1px',
                      }}
                    >
                      {s.cost_category}
                    </span>
                  </td>
                  <td className="text-right font-mono">{formatDbu(s.total_dbus)}</td>
                  <td className="text-right font-mono text-gray-400">
                    {totalDbus > 0 ? ((s.total_dbus / totalDbus) * 100).toFixed(1) : 0}%
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
