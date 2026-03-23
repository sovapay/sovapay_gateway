import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Users, FileText, DollarSign,
  Activity, ChevronUp, ChevronDown, ArrowUpRight
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge, Button } from '../../components/ui';
import { InteractiveAreaChart } from '../../components/charts/InteractiveAreaChart';
import { formatCurrency } from '../../utils/formatters';
import { BroadcastMessageModal } from '../../components/admin';

import { useFrappeGetCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';


function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
  color = 'slate',
}: {
  title: string;
  value: string;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down';
  color?: 'slate' | 'success' | 'warning' | 'error';
}) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600',
    success: 'bg-success-100 text-success-600',
    warning: 'bg-warning-100 text-warning-600',
    error: 'bg-error-100 text-error-600',
  };
  const getFontSize = (val: string) => {
    if (val.length > 14) return 'text-base font-semibold';
    if (val.length > 11) return 'text-lg font-semibold';
    if (val.length > 9)  return 'text-xl font-semibold';
    return 'text-2xl font-semibold';
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`${getFontSize(value)} text-slate-900 mt-1 truncate`}>{value}</p>
          {change && (
            <div className={`flex items-center gap-1 mt-1 text-sm ${trend === 'up' ? 'text-success-600' : 'text-error-600'}`}>
              {trend === 'up' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span>{change}</span>
            </div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

export function AdminDashboard() {
  const [period, setPeriod] = useState('Last 30 days');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Fetch real dashboard stats with period
  const { data: { message: dashboardData } = {} } = useFrappeGetCall(
    adminMethods.getDashboardStats,
    {
        period,
        merchant: selectedMerchant !== 'all' ? selectedMerchant : undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
    },
    `admin-dashboard-stats-${period}-${selectedMerchant}-${fromDate}-${toDate}`
  );

  const { data: { message: kycData } = {} } = useFrappeGetCall(
    adminMethods.getKYCSubmissions,
    { status: 'Submitted' },
    'admin-pending-kyc'
  );

  const { data: { message: merchantsData } = {} } = useFrappeGetCall(
    adminMethods.getMerchants,
    { page: 1, page_size: 5 },
    'admin-recent-merchants'
  );

  const defaultStats = {
    total_orders: 0,
    processed_orders: 0,
    pending_orders: 0,
    cancelled_orders: 0,
    total_processed_amount: 0,
    total_pending_amount: 0,
    total_cancelled_amount: 0,
    total_orders_amount: 0,
    pending_settlements: 0,
  };

  const stats = dashboardData?.stats || defaultStats;

  // Transform chart data for InteractiveAreaChart (Orders & Volume)
  const chartDataRaw = dashboardData?.chart_data;
  const chartData = chartDataRaw?.categories?.map((date: string, index: number) => ({
    date,
    orders: chartDataRaw.series[1]?.data[index] || 0,
    volume: chartDataRaw.series[0]?.data[index] || 0
  })) || [];

  const merchants = merchantsData?.merchants || [];
  const merchantOptions = merchants.map((m: any) => ({
    id: m.name,
    name: m.company_name,
  }));
  
  // Calculate metrics
  const totalVolume = stats.total_processed_amount || 0;
  const totalPendingVolume = stats.total_pending_amount || 0;
  const totalFailedVolume = stats.total_cancelled_amount || 0;
  const totalOrders = stats.total_orders || 0;
  const processedOrders = stats.processed_orders || 0;
  const successRate = totalOrders > 0 ? ((processedOrders / totalOrders) * 100).toFixed(1) : '0.0';

  // Count merchants by status
  const merchantStats = dashboardData?.merchant_stats || { active: 0, pending: 0, suspended: 0, total: 0 };
  const activeMerchants = merchantStats.active;
  const pendingVerifications = merchantStats.pending;
  const suspendedMerchants = merchantStats.suspended;
  const totalMerchants = merchantStats.total;


  return (
    <>
      <DashboardLayout isAdmin>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Admin Dashboard</h1>
              <p className="text-sm text-slate-500 mt-1">
                Platform overview and key performance metrics
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-success-500 animate-pulse"></span>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Live System Status</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Volume"
              value={formatCurrency(totalVolume)}
              change={`${dashboardData?.metric_trends?.volume_change_pct > 0 ? '+' : ''}${dashboardData?.metric_trends?.volume_change_pct || 0}% vs last month`}
              icon={DollarSign}
              trend={dashboardData?.metric_trends?.volume_change_pct >= 0 ? 'up' : 'down'}
              color={dashboardData?.metric_trends?.volume_change_pct >= 0 ? 'success' : 'error'}
            />
            <MetricCard
              title="Pending Volume"
              value={formatCurrency(totalPendingVolume)}
              change={`${dashboardData?.metric_trends?.pending_volume_change_pct > 0 ? '+' : ''}${dashboardData?.metric_trends?.pending_volume_change_pct || 0}% vs last month`}
              icon={DollarSign}
              trend={dashboardData?.metric_trends?.pending_volume_change_pct >= 0 ? 'up' : 'down'}
              color="warning"
            />
            <MetricCard
              title="Failed Volume"
              value={formatCurrency(totalFailedVolume)}
              change={`${dashboardData?.metric_trends?.failed_volume_change_pct > 0 ? '+' : ''}${dashboardData?.metric_trends?.failed_volume_change_pct || 0}% vs last month`}
              icon={DollarSign}
              trend={dashboardData?.metric_trends?.failed_volume_change_pct <= 0 ? 'up' : 'down'}
              color="error"
            />
            <MetricCard
              title="Success Rate"
              value={`${successRate}%`}
              change={`${dashboardData?.metric_trends?.success_rate_change_pct > 0 ? '+' : ''}${dashboardData?.metric_trends?.success_rate_change_pct || 0}% vs last week`}
              icon={Activity}
              trend={dashboardData?.metric_trends?.success_rate_change_pct >= 0 ? 'up' : 'down'}
              color={dashboardData?.metric_trends?.success_rate_change_pct >= 0 ? 'success' : 'error'}
            />
          </div>

          {/* Chart Section - Full Width */}
          <div className="mb-6">
            <InteractiveAreaChart
              data={chartData}
              period={period}
              onPeriodChange={setPeriod}
              merchants={merchantOptions}
              onMerchantChange={(id) => setSelectedMerchant(id)}
              onDateRangeChange={(from, to) => {
                  setFromDate(from);
                  setToDate(to);
              }}
          />
          </div>

          {/* Bottom Section - Merchant Overview & System Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-slate-900">Merchant Overview</h3>
                  <Link to="/admin/merchants" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                    View all
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-2xl font-semibold text-slate-900">{totalMerchants}</p>
                    <p className="text-xs text-slate-500">Total</p>
                  </div>
                  <div className="text-center p-3 bg-success-50 rounded-lg border border-success-100">
                    <p className="text-2xl font-semibold text-success-600">{activeMerchants}</p>
                    <p className="text-xs text-slate-500">Active</p>
                  </div>
                  <div className="text-center p-3 bg-warning-50 rounded-lg border border-warning-100">
                    <p className="text-2xl font-semibold text-warning-600">{pendingVerifications}</p>
                    <p className="text-xs text-slate-500">Under Review</p>
                  </div>
                  <div className="text-center p-3 bg-error-50 rounded-lg border border-error-100">
                    <p className="text-2xl font-semibold text-error-600">{suspendedMerchants}</p>
                    <p className="text-xs text-slate-500">Suspended</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {merchants.slice(0, 3).map((merchant: any) => (
                    <Link
                      key={merchant.name}
                      to={`/admin/merchants/${merchant.name}`}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-200">
                          <Users className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{merchant.company_name}</p>
                          <p className="text-xs text-slate-500">{merchant.company_email}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          merchant.status === 'Approved' ? 'success' :
                            merchant.status === 'Submitted' ? 'warning' :
                              merchant.status === 'Suspended' ? 'error' : 'slate'
                        }
                      >
                        {merchant.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">System Activity</h3>
                </div>
                <div className="space-y-4">
                  <Link to="/admin/orders?status=Processing" className="block">
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <DollarSign className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Pending Orders</p>
                          <p className="text-xs text-slate-500">Orders awaiting processing</p>
                        </div>
                      </div>
                      <Badge variant="warning">{stats.pending_orders || 0}</Badge>
                    </div>
                  </Link>

                  <Link to="/admin/van-logs?status=pending" className="block">
                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                          <ArrowUpRight className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Pending Settlements</p>
                          <p className="text-xs text-slate-500">Settlements to be cleared</p>
                        </div>
                      </div>
                      <Badge variant="warning">{stats.pending_settlements || stats.pending_orders || 0}</Badge>
                    </div>
                  </Link>

                  <Link to="/admin/kyc-reviews?status=pending" className="block">
                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100 hover:bg-orange-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Pending KYC</p>
                          <p className="text-xs text-slate-500">Merchants awaiting review</p>
                        </div>
                      </div>
                      <Badge variant="warning">{kycData?.submissions?.length || 0}</Badge>
                    </div>
                  </Link>
                </div>


              </Card>

              {/* Broadcast Messaging Widget */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Quick Actions</h3>
                </div>
                <button onClick={() => setShowBroadcastModal(true)} className="block w-full text-left">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg border border-primary-200 hover:from-primary-100 hover:to-primary-200 transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center shadow-sm">
                        <svg
                          className="w-5 h-5 text-white transform rotate-45"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Send Broadcast</p>
                        <p className="text-xs text-slate-600">Message all merchants</p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-5 h-5 text-primary-600" />
                  </div>
                </button>
              </Card>


            </div>
          </div>
        </div>
      </DashboardLayout>

      {/* Broadcast Message Modal */}
      <BroadcastMessageModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
      />
    </>
  );
}
