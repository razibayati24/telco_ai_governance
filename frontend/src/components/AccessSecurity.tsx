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
  Cell,
} from 'recharts';
import { ShieldAlert } from 'lucide-react';
import { useApi, formatNumber } from '../hooks/useApi';
import { Loading, ErrorState, EmptyState } from './LoadingState';

interface DeniedTrend {
  day: string;
  denied_count: number;
}

interface DeniedUser {
  user_email: string;
  denied_count: number;
  days_with_denials: number;
}

interface ServiceAccess {
  service_name: string;
  action_name: string;
  denied_count: number;
  allowed_count: number;
  total_count: number;
}

interface RecentDenied {
  event_date: string;
  user_email: string;
  action_name: string;
  service_name: string;
  source_ip_address: string;
  status_code: string;
  event_count: number;
}

function CustomTooltip({ active, payload, label }: any) {
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
}

export default function AccessSecurity() {
  const { data: deniedTrend, loading: tLoad, error: tErr } = useApi<DeniedTrend[]>('/api/access/denied-trend');
  const { data: topUsers, loading: uLoad, error: uErr } = useApi<DeniedUser[]>('/api/access/top-denied-users');
  const { data: byService, loading: sLoad, error: sErr } = useApi<ServiceAccess[]>('/api/access/by-service');
  const { data: recentDenied, loading: rLoad, error: rErr } = useApi<RecentDenied[]>('/api/access/recent-denied');

  const totalDenied = (deniedTrend || []).reduce((s, d) => s + d.denied_count, 0);

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      <div className="card bg-gradient-to-r from-red-900/20 to-db-dark-800 border-red-500/30">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-sm text-gray-300">Denied Access Attempts (30d)</p>
            <p className="text-2xl font-bold text-red-400">{formatNumber(totalDenied)}</p>
          </div>
        </div>
      </div>

      {/* Denied Trend + Top Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Denied Trend Line Chart */}
        <div className="card">
          <h3 className="card-header">Denied Access Over Time</h3>
          {tLoad ? (
            <Loading />
          ) : tErr ? (
            <ErrorState message={tErr} />
          ) : (deniedTrend || []).length === 0 ? (
            <EmptyState message="No denied access events in the last 30 days" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={deniedTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => v?.slice(5, 10)}
                  stroke="#4B5563"
                  fontSize={11}
                />
                <YAxis stroke="#4B5563" fontSize={11} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="denied_count"
                  name="Denied"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#EF4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Denied Users */}
        <div className="card">
          <h3 className="card-header">Top Users with Denied Access</h3>
          {uLoad ? (
            <Loading />
          ) : uErr ? (
            <ErrorState message={uErr} />
          ) : (topUsers || []).length === 0 ? (
            <EmptyState message="No denied access users found" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(topUsers || []).slice(0, 10)} layout="vertical" margin={{ left: 160 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21293A" horizontal={false} />
                <XAxis type="number" stroke="#4B5563" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="user_email"
                  width={155}
                  stroke="#4B5563"
                  fontSize={10}
                  tick={{ fill: '#9CA3AF' }}
                  tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '...' : v}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="denied_count" name="Denied Count" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Access by Service - Heatmap-style table */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Access by Service & Action</h3>
        {sLoad ? (
          <Loading />
        ) : sErr ? (
          <ErrorState message={sErr} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Action</th>
                <th className="text-right">Allowed</th>
                <th className="text-right">Denied</th>
                <th className="text-right">Total</th>
                <th>Denial Rate</th>
              </tr>
            </thead>
            <tbody>
              {(byService || []).map((s, i) => {
                const denialRate = s.total_count > 0 ? (s.denied_count / s.total_count) * 100 : 0;
                return (
                  <tr key={i}>
                    <td className="font-medium text-gray-200">{s.service_name}</td>
                    <td className="text-gray-400 text-xs font-mono">{s.action_name}</td>
                    <td className="text-right font-mono text-emerald-400">{formatNumber(s.allowed_count)}</td>
                    <td className="text-right font-mono text-red-400">{formatNumber(s.denied_count)}</td>
                    <td className="text-right font-mono">{formatNumber(s.total_count)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-db-dark-600 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(denialRate, 100)}%`,
                              backgroundColor: denialRate > 50 ? '#EF4444' : denialRate > 20 ? '#F59E0B' : '#10B981',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-400">{denialRate.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Denied Events */}
      <div className="card overflow-x-auto">
        <h3 className="card-header">Recent Denied Access Events</h3>
        {rLoad ? (
          <Loading />
        ) : rErr ? (
          <ErrorState message={rErr} />
        ) : (recentDenied || []).length === 0 ? (
          <EmptyState message="No recent denied events" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Action</th>
                <th>Service</th>
                <th>Source IP</th>
                <th className="text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {(recentDenied || []).map((e, i) => (
                <tr key={i}>
                  <td className="text-gray-400 font-mono text-xs">{e.event_date}</td>
                  <td className="font-medium text-gray-200 max-w-[200px] truncate">{e.user_email}</td>
                  <td className="text-xs font-mono text-gray-400">{e.action_name}</td>
                  <td className="text-gray-300">{e.service_name}</td>
                  <td className="font-mono text-xs text-gray-400">{e.source_ip_address || '-'}</td>
                  <td className="text-right font-mono text-red-400">{e.event_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
