import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useApi, formatNumber, formatDbu } from '../hooks/useApi';
import { Loading, ErrorState } from './LoadingState';

interface KPIs {
  total_cost_dbus_30d: number;
  avg_latency_ms: number;
  mlflow_success_rate: number;
  query_failure_rate: number;
  denied_access_30d: number;
  cost_anomalies: number;
}

interface DailyRequest {
  day: string;
  total_requests: number;
  total_errors: number;
}

interface DailyCost {
  day: string;
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

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  sublabel,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  sublabel?: string;
}) {
  return (
    <div className="kpi-card group hover:border-db-dark-500 transition-all duration-200">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {sublabel && <span className="text-xs text-gray-500 mt-0.5">{sublabel}</span>}
    </div>
  );
}

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

export default function Overview() {
  const { data: kpis, loading: kLoad, error: kErr } = useApi<KPIs>('/api/overview/kpis');
  const {
    data: dailyReqs,
    loading: rLoad,
    error: rErr,
  } = useApi<DailyRequest[]>('/api/overview/daily-requests');
  const {
    data: dailyCost,
    loading: cLoad,
    error: cErr,
  } = useApi<DailyCost[]>('/api/overview/daily-cost');

  // Pivot cost data for stacked area chart
  const costChartData = (() => {
    if (!dailyCost) return [];
    const byDay: Record<string, Record<string, number>> = {};
    dailyCost.forEach((r) => {
      if (!byDay[r.day]) byDay[r.day] = { day: r.day } as any;
      byDay[r.day][r.cost_category] = (byDay[r.day][r.cost_category] || 0) + r.total_dbus;
    });
    return Object.values(byDay).sort((a: any, b: any) => a.day.localeCompare(b.day));
  })();

  const costCategories = dailyCost
    ? [...new Set(dailyCost.map((r) => r.cost_category))]
    : [];

  return (
    <div className="space-y-6">
      {/* Description Banner */}
      <div className="card bg-gradient-to-r from-db-dark-800 to-db-dark-700 border-db-orange/20">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-db-orange mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-400 leading-relaxed">
            An autonomous AI agent that continuously monitors, analyzes, and acts on platform telemetry data to ensure GenAI workloads are cost-effective, high-performing, and properly governed.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {kLoad ? (
        <Loading label="Loading KPIs..." />
      ) : kErr ? (
        <ErrorState message={kErr} />
      ) : kpis ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            icon={DollarSign}
            label="Total AI Cost (30d)"
            value={formatDbu(kpis.total_cost_dbus_30d) + ' DBUs'}
            color="bg-amber-600"
          />
          <KpiCard
            icon={Clock}
            label="Avg Latency"
            value={(kpis.avg_latency_ms ?? 0).toFixed(0) + 'ms'}
            color="bg-blue-600"
          />
          <KpiCard
            icon={CheckCircle}
            label="MLflow Success Rate"
            value={(kpis.mlflow_success_rate ?? 0).toFixed(1) + '%'}
            color="bg-emerald-600"
          />
          <KpiCard
            icon={XCircle}
            label="Query Failure Rate"
            value={(kpis.query_failure_rate ?? 0).toFixed(2) + '%'}
            color="bg-purple-600"
          />
          <KpiCard
            icon={ShieldAlert}
            label="Denied Access"
            value={formatNumber(kpis.denied_access_30d)}
            color="bg-red-600"
            sublabel="Last 30 days"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Cost Anomalies"
            value={String(kpis.cost_anomalies ?? 0)}
            color="bg-db-orange"
            sublabel="Detected"
          />
        </div>
      ) : null}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Request Trend */}
        <div className="card">
          <h3 className="card-header">Daily AI Request Volume</h3>
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
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: '#9CA3AF' }}
                />
                <Line
                  type="monotone"
                  dataKey="total_requests"
                  name="Requests"
                  stroke="#FF6F00"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#FF6F00' }}
                />
                <Line
                  type="monotone"
                  dataKey="total_errors"
                  name="Errors"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cost Trend */}
        <div className="card">
          <h3 className="card-header">Daily AI Cost by Category (DBUs)</h3>
          {cLoad ? (
            <Loading />
          ) : cErr ? (
            <ErrorState message={cErr} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
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
                {costCategories.map((cat) => (
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
      </div>
    </div>
  );
}
