import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useApi, formatNumber } from '../hooks/useApi';
import { Loading, ErrorState, EmptyState } from './LoadingState';

interface RunTrend {
  day: string;
  total_runs: number;
  succeeded: number;
  failed: number;
  success_rate: number;
}

interface Experiment {
  experiment_name: string;
  total_runs: number;
  succeeded: number;
  failed: number;
  avg_duration_sec: number;
  unique_users: number;
}

interface MetricRow {
  metric_name: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  stddev_value: number;
  total_runs: number;
}

interface FailedRun {
  created_by: string;
  total_failed: number;
  total_runs: number;
  failure_rate: number;
}

interface DurationTrend {
  day: string;
  avg_duration_sec: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number'
            ? (p.name?.includes('Rate') || p.name?.includes('%') ? p.value.toFixed(1) + '%' : formatNumber(p.value))
            : p.value}
        </p>
      ))}
    </div>
  );
}

export default function QualityEvaluation() {
  const { data: runTrend, loading: rtLoad, error: rtErr } = useApi<RunTrend[]>('/api/quality/run-trend');
  const { data: experiments, loading: exLoad, error: exErr } = useApi<Experiment[]>('/api/quality/experiments');
  const { data: metrics, loading: mLoad, error: mErr } = useApi<MetricRow[]>('/api/quality/metrics');
  const { data: failedRuns, loading: fLoad, error: fErr } = useApi<FailedRun[]>('/api/quality/failed-runs');
  const { data: durationTrend, loading: dLoad, error: dErr } = useApi<DurationTrend[]>('/api/quality/duration-trend');

  // Truncate experiment names
  const experimentChartData = (experiments || []).map((e) => {
    // Strip "/Users/" prefix but keep email + experiment name
    const raw = e.experiment_name;
    const cleaned = raw.replace(/^\/Users\//, '');
    const label = cleaned.length > 45 ? cleaned.slice(0, 42) + '...' : cleaned;
    return { ...e, name: label };
  });

  // Detect drift: latest avg_value is > 2 stddev from overall avg
  const metricsWithDrift = (metrics || []).map((m) => ({
    ...m,
    has_drift: m.stddev_value > 0 && Math.abs(m.avg_value) > 2 * m.stddev_value,
  }));

  return (
    <div className="space-y-6">
      {/* Success Rate Trend + Run Duration Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Run Success Rate Trend */}
        <div className="card">
          <h3 className="card-header">Run Success Rate Trend</h3>
          {rtLoad ? (
            <Loading />
          ) : rtErr ? (
            <ErrorState message={rtErr} />
          ) : (runTrend || []).length === 0 ? (
            <EmptyState message="No MLflow run data available" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={runTrend || []}>
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
                  domain={[0, 100]}
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
                            {p.name}: {p.value?.toFixed(1)}%
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="success_rate"
                  name="Success Rate %"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Run Duration Trend */}
        <div className="card">
          <h3 className="card-header">Avg Run Duration Trend (sec)</h3>
          {dLoad ? (
            <Loading />
          ) : dErr ? (
            <ErrorState message={dErr} />
          ) : (durationTrend || []).length === 0 ? (
            <EmptyState message="No duration data available" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={durationTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v?.slice(5, 10)}
                  stroke="#4B5563"
                  fontSize={11}
                />
                <YAxis stroke="#4B5563" fontSize={11} tickFormatter={(v) => `${v}s`} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avg_duration_sec"
                  name="Avg Duration (sec)"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#F59E0B' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Run Count by Experiment */}
      <div className="card">
        <h3 className="card-header">Top 10 Experiments by Run Count</h3>
        {exLoad ? (
          <Loading />
        ) : exErr ? (
          <ErrorState message={exErr} />
        ) : (experimentChartData.length === 0) ? (
          <EmptyState message="No experiment data available" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, experimentChartData.length * 36)}>
            <BarChart data={experimentChartData} layout="vertical" margin={{ left: 220 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
              <XAxis type="number" stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <YAxis
                type="category"
                dataKey="name"
                width={215}
                stroke="#4B5563"
                fontSize={10}
                tick={{ fill: '#9CA3AF' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
              <Bar dataKey="succeeded" name="Succeeded" fill="#10B981" stackId="1" barSize={20} />
              <Bar dataKey="failed" name="Failed" fill="#EF4444" stackId="1" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Metrics Table + Failed Runs by User */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Metrics Table */}
        <div className="card overflow-x-auto lg:col-span-2">
          <h3 className="card-header">Top Metrics (Drift Detection)</h3>
          {mLoad ? (
            <Loading />
          ) : mErr ? (
            <ErrorState message={mErr} />
          ) : (metricsWithDrift.length === 0) ? (
            <EmptyState message="No metric data available" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric Name</th>
                  <th className="text-right">Avg Value</th>
                  <th className="text-right">Min</th>
                  <th className="text-right">Max</th>
                  <th className="text-right">Std Dev</th>
                  <th className="text-right">Runs</th>
                  <th>Drift</th>
                </tr>
              </thead>
              <tbody>
                {metricsWithDrift.map((m, i) => (
                  <tr key={i} className={m.has_drift ? 'bg-red-900/10' : ''}>
                    <td className="font-medium text-gray-200 font-mono text-xs">{m.metric_name}</td>
                    <td className="text-right font-mono">{m.avg_value?.toFixed(4)}</td>
                    <td className="text-right font-mono text-gray-400">{m.min_value?.toFixed(4)}</td>
                    <td className="text-right font-mono text-gray-400">{m.max_value?.toFixed(4)}</td>
                    <td className="text-right font-mono text-gray-400">{m.stddev_value?.toFixed(4)}</td>
                    <td className="text-right font-mono">{formatNumber(m.total_runs)}</td>
                    <td>
                      {m.has_drift ? (
                        <span className="tier-badge border text-red-400 bg-red-500/20 border-red-500/30">
                          DRIFT
                        </span>
                      ) : (
                        <span className="tier-badge border text-emerald-400 bg-emerald-500/20 border-emerald-500/30">
                          NORMAL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Failed Runs by User */}
        <div className="card overflow-x-auto">
          <h3 className="card-header">Failed Runs by User</h3>
          {fLoad ? (
            <Loading />
          ) : fErr ? (
            <ErrorState message={fErr} />
          ) : (failedRuns || []).length === 0 ? (
            <EmptyState message="No failed runs found" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th className="text-right">Failed</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Fail %</th>
                </tr>
              </thead>
              <tbody>
                {(failedRuns || []).map((f, i) => (
                  <tr key={i}>
                    <td className="font-medium text-gray-200 max-w-[150px] truncate text-xs">{f.created_by}</td>
                    <td className="text-right font-mono text-red-400">{f.total_failed}</td>
                    <td className="text-right font-mono">{f.total_runs}</td>
                    <td className={`text-right font-mono ${f.failure_rate > 50 ? 'text-red-400' : f.failure_rate > 20 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {f.failure_rate?.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
