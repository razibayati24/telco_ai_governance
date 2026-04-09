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

interface DailyQuery {
  day: string;
  total_queries: number;
  avg_duration_ms: number;
  total_read_bytes: number;
  total_spill_bytes: number;
  cache_hits: number;
  succeeded: number;
  failed: number;
}

interface QueryByType {
  statement_type: string;
  total_queries: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  total_duration_ms: number;
  total_read_bytes: number;
  total_spill_bytes: number;
  cache_hits: number;
}

interface ExpensiveQuery {
  start_time: string;
  executed_by: string;
  statement_type: string;
  statement_preview: string;
  total_duration_ms: number;
  execution_duration_ms: number;
  read_bytes: number;
  read_rows: number;
  spilled_local_bytes: number;
  warehouse_id: string;
  execution_status: string;
}

interface QueryByUser {
  executed_by: string;
  total_queries: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  total_read_bytes: number;
  total_spill_bytes: number;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[Math.min(i, sizes.length - 1)];
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '0ms';
  if (ms >= 60000) return (ms / 60000).toFixed(1) + 'min';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms.toFixed(0) + 'ms';
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

export default function QueryOptimization() {
  const { data: daily, loading: dLoad, error: dErr } = useApi<DailyQuery[]>('/api/queries/daily');
  const { data: byType, loading: tLoad, error: tErr } = useApi<QueryByType[]>('/api/queries/by-type');
  const { data: expensive, loading: eLoad, error: eErr } = useApi<ExpensiveQuery[]>('/api/queries/expensive');
  const { data: byUser, loading: uLoad, error: uErr } = useApi<QueryByUser[]>('/api/queries/by-user');

  // Cache hit rate per day
  const cacheRateData = (daily || []).map((d) => ({
    day: d.day,
    cache_hit_rate: d.total_queries > 0 ? (d.cache_hits / d.total_queries) * 100 : 0,
  }));

  // Data spill trend
  const spillData = (daily || []).map((d) => ({
    day: d.day,
    spill_bytes: d.total_spill_bytes || 0,
  }));

  // Query type chart data
  const typeChartData = (byType || []).map((t) => ({
    ...t,
    name: t.statement_type || 'UNKNOWN',
  }));

  return (
    <div className="space-y-6">
      {/* Daily Query Volume + Cache Hit Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Query Volume */}
        <div className="card">
          <h3 className="card-header">Daily Query Volume</h3>
          {dLoad ? (
            <Loading />
          ) : dErr ? (
            <ErrorState message={dErr} />
          ) : (daily || []).length === 0 ? (
            <EmptyState message="No query data available" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={daily || []}>
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
                <Line
                  type="monotone"
                  dataKey="total_queries"
                  name="Total Queries"
                  stroke="#FF6F00"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cache Hit Rate Trend */}
        <div className="card">
          <h3 className="card-header">Cache Hit Rate Trend</h3>
          {dLoad ? (
            <Loading />
          ) : dErr ? (
            <ErrorState message={dErr} />
          ) : cacheRateData.length === 0 ? (
            <EmptyState message="No cache data available" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cacheRateData}>
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
                  dataKey="cache_hit_rate"
                  name="Cache Hit Rate %"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Query Duration by Type + Data Spill Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query Duration by Statement Type */}
        <div className="card">
          <h3 className="card-header">Avg Duration by Statement Type</h3>
          {tLoad ? (
            <Loading />
          ) : tErr ? (
            <ErrorState message={tErr} />
          ) : typeChartData.length === 0 ? (
            <EmptyState message="No statement type data available" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(250, typeChartData.length * 36)}>
              <BarChart data={typeChartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
                <XAxis type="number" stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatDuration(v)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={95}
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
                            {p.name}: {formatDuration(p.value)}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="avg_duration_ms" name="Avg Duration" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Data Spill Trend */}
        <div className="card">
          <h3 className="card-header">Data Spill Trend</h3>
          {dLoad ? (
            <Loading />
          ) : dErr ? (
            <ErrorState message={dErr} />
          ) : spillData.length === 0 ? (
            <EmptyState message="No spill data available" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={spillData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v?.slice(5, 10)}
                  stroke="#4B5563"
                  fontSize={11}
                />
                <YAxis stroke="#4B5563" fontSize={11} tickFormatter={(v) => formatBytes(v)} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-db-dark-700 border border-db-dark-500 rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} className="text-xs" style={{ color: p.color }}>
                            {p.name}: {formatBytes(p.value)}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="spill_bytes"
                  name="Spill Bytes"
                  stroke="#F97316"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#F97316' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top 10 Expensive Queries */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Top 10 Expensive Queries</h3>
        {eLoad ? (
          <Loading />
        ) : eErr ? (
          <ErrorState message={eErr} />
        ) : (expensive || []).length === 0 ? (
          <EmptyState message="No expensive query data available" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Type</th>
                <th>Preview</th>
                <th className="text-right">Duration</th>
                <th className="text-right">Bytes Read</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(expensive || []).map((q, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs text-gray-400 whitespace-nowrap">
                    {q.start_time ? q.start_time.slice(0, 16).replace('T', ' ') : '-'}
                  </td>
                  <td className="text-gray-200 max-w-[150px] truncate text-xs">{q.executed_by}</td>
                  <td>
                    <span className="tier-badge border bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {q.statement_type}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-gray-400 max-w-[300px] truncate" title={q.statement_preview}>
                    {q.statement_preview}
                  </td>
                  <td className="text-right font-mono whitespace-nowrap">{formatDuration(q.total_duration_ms)}</td>
                  <td className="text-right font-mono text-gray-400 whitespace-nowrap">{formatBytes(q.read_bytes)}</td>
                  <td>
                    <span className={`tier-badge border ${q.execution_status === 'FINISHED' ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' : 'text-red-400 bg-red-500/20 border-red-500/30'}`}>
                      {q.execution_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Users by Query Duration */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Top Users by Total Query Duration</h3>
        {uLoad ? (
          <Loading />
        ) : uErr ? (
          <ErrorState message={uErr} />
        ) : (byUser || []).length === 0 ? (
          <EmptyState message="No user query data available" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th className="text-right">Total Queries</th>
                <th className="text-right">Total Duration</th>
                <th className="text-right">Avg Duration</th>
                <th className="text-right">Data Read</th>
                <th className="text-right">Data Spilled</th>
                <th>Spill Ratio</th>
              </tr>
            </thead>
            <tbody>
              {(byUser || []).map((u, i) => {
                const spillRatio = u.total_read_bytes > 0 ? (u.total_spill_bytes / u.total_read_bytes) * 100 : 0;
                return (
                  <tr key={i}>
                    <td className="font-medium text-gray-200 max-w-[200px] truncate text-xs">{u.executed_by}</td>
                    <td className="text-right font-mono">{formatNumber(u.total_queries)}</td>
                    <td className="text-right font-mono">{formatDuration(u.total_duration_ms)}</td>
                    <td className="text-right font-mono text-gray-400">{formatDuration(u.avg_duration_ms)}</td>
                    <td className="text-right font-mono text-gray-400">{formatBytes(u.total_read_bytes)}</td>
                    <td className={`text-right font-mono ${u.total_spill_bytes > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {formatBytes(u.total_spill_bytes)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-db-dark-600 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(spillRatio, 100)}%`,
                              backgroundColor: spillRatio > 50 ? '#EF4444' : spillRatio > 20 ? '#F59E0B' : '#10B981',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-400">{spillRatio.toFixed(1)}%</span>
                      </div>
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
