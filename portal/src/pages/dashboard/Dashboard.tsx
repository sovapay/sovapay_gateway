import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, ArrowRight, AlertCircle,
  CreditCard, Activity, DollarSign
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge, Button, DebitCard, useToast } from '../../components/ui';
import { InteractiveAreaChart } from '../../components/charts/InteractiveAreaChart';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { useAuth } from '../../hooks';
import { useFrappeGetCall, merchantMethods } from '../../services';

function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  change?: string;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down';
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
          {change && (
            <div className="flex items-center gap-1 mt-2">
              {trend === 'up' ? (
                <TrendingUp className="w-4 h-4 text-success-500" />
              ) : trend === 'down' ? (
                <TrendingDown className="w-4 h-4 text-error-500" />
              ) : null}
              <span className={`text-sm font-medium ${trend === 'up' ? 'text-success-600' : trend === 'down' ? 'text-error-600' : 'text-slate-600'}`}>
                {change}
              </span>
              {changeLabel && (
                <span className="text-sm text-slate-500">{changeLabel}</span>
              )}
            </div>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-600" />
        </div>
      </div>
    </Card>
  );
}

function getStatusBadge(status: string) {
  const statusLower = status.toLowerCase();

  if (statusLower.includes('success') || statusLower === 'processed') {
    return <Badge variant="success" dot>Processed</Badge>;
  } else if (statusLower.includes('process') || statusLower.includes('pending')) {
    return <Badge variant="warning" dot>Processing</Badge>;
  } else if (statusLower.includes('fail') || statusLower.includes('cancel')) {
    return <Badge variant="error" dot>Failed</Badge>;
  } else if (statusLower.includes('refund')) {
    return <Badge variant="slate" dot>Refunded</Badge>;
  }

  return <Badge variant="slate">{status}</Badge>;
}

export function Dashboard() {
  const { user } = useAuth();
  const [chartPeriod, setChartPeriod] = useState('Last 30 days');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Fetch dashboard stats using frappe-react-sdk
  const { data: { message: dashboardStats } = {}, isLoading: statsLoading } = useFrappeGetCall(
    merchantMethods.getDashboardStats,
    undefined,
    ['dashboard-stats']
  );

  // Fetch chart data with period parameter
  const { data: { message: chartData } = {}, isLoading: chartLoading } = useFrappeGetCall(
    merchantMethods.getDashboardChartData,
    { period: chartPeriod },
    ['dashboard-chart', chartPeriod]
  );

  // Fetch recent orders for transactions table
  const { data: { message: ordersData } = {}, isLoading: ordersLoading } = useFrappeGetCall(
    merchantMethods.getOrders,
    { page: 1, page_size: 5, sort_by: 'creation', sort_order: 'desc' },
    ['recent-orders']
  );

  // Fetch VAN account info
  const { data: { message: vanAccount } = {}, isLoading: vanLoading } = useFrappeGetCall(
    merchantMethods.getVANAccount,
    undefined,
    ['van-account']
  );

  const loading = statsLoading || ordersLoading || vanLoading || chartLoading;
  const recentOrders = ordersData?.orders || [];
  const stats = dashboardStats?.stats;
  const wallet = dashboardStats?.wallet;

  // Prepare chart data
  const revenueChartData = chartData?.labels?.map((label, index) => ({
    date: label,
    volume: chartData.revenue[index] || 0,
    orders: chartData.orders[index] || 0,
  })) || [];

  // Calculate metrics
  const todayRevenue = stats?.total_processed_amount || 0;
  const totalOrders = stats?.total_orders || 0;
  const processedOrders = stats?.processed_orders || 0;
  const successRate = totalOrders > 0 ? ((processedOrders / totalOrders) * 100).toFixed(1) : '0.0';
  const avgTransactionValue = processedOrders > 0 ? (todayRevenue / processedOrders) : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              Welcome back, {user?.user.full_name || 'Merchant'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/orders">
              <Button variant="secondary">
                View all orders
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

        {wallet?.status !== 'Active' && (
          <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-800">
                Your account requires attention
              </p>
              <p className="text-sm text-warning-700 mt-0.5">
                Please contact support to activate your account.{' '}
                <Link to="/settings/profile" className="font-medium underline">
                  View profile
                </Link>
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Payout Success"
            value={formatCurrency(todayRevenue)}
            icon={DollarSign}
            change={`${(dashboardStats?.metric_trends?.volume_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.volume_change_pct || 0}%`}
            changeLabel="vs last month"
            trend={(dashboardStats?.metric_trends?.volume_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Payout Pending"
            value={formatCurrency(todayRevenue)}
            icon={DollarSign}
            change={`${(dashboardStats?.metric_trends?.volume_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.volume_change_pct || 0}%`}
            changeLabel="vs last month"
            trend={(dashboardStats?.metric_trends?.volume_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Payout Failed"
            value={formatCurrency(todayRevenue)}
            icon={DollarSign}
            change={`${(dashboardStats?.metric_trends?.volume_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.volume_change_pct || 0}%`}
            changeLabel="vs last month"
            trend={(dashboardStats?.metric_trends?.volume_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Success Rate"
            value={`${successRate}%`}
            icon={Activity}
            change={`${(dashboardStats?.metric_trends?.success_rate_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.success_rate_change_pct || 0}%`}
            changeLabel="vs last week"
            trend={(dashboardStats?.metric_trends?.success_rate_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Payin Success"
            value={formatCurrency(todayRevenue)}
            icon={DollarSign}
            change={`${(dashboardStats?.metric_trends?.volume_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.volume_change_pct || 0}%`}
            changeLabel="vs last month"
            trend={(dashboardStats?.metric_trends?.volume_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Payin Pending"
            value={formatCurrency(todayRevenue)}
            icon={DollarSign}
            change={`${(dashboardStats?.metric_trends?.volume_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.volume_change_pct || 0}%`}
            changeLabel="vs last month"
            trend={(dashboardStats?.metric_trends?.volume_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Payin Failed"
            value={formatCurrency(todayRevenue)}
            icon={DollarSign}
            change={`${(dashboardStats?.metric_trends?.volume_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.volume_change_pct || 0}%`}
            changeLabel="vs last month"
            trend={(dashboardStats?.metric_trends?.volume_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            title="Success Rate"
            value={`${successRate}%`}
            icon={Activity}
            change={`${(dashboardStats?.metric_trends?.success_rate_change_pct || 0) > 0 ? '+' : ''}${dashboardStats?.metric_trends?.success_rate_change_pct || 0}%`}
            changeLabel="vs last week"
            trend={(dashboardStats?.metric_trends?.success_rate_change_pct || 0) >= 0 ? 'up' : 'down'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <InteractiveAreaChart
              data={revenueChartData}
              period={chartPeriod}
              onPeriodChange={setChartPeriod}
              onDateRangeChange={(from, to) => {
                  setFromDate(from);
                  setToDate(to);
              }}
            />
          </div>

          <div className="space-y-4">
            <Card padding="none" className="bg-transparent border-none shadow-none">
              <DebitCard
                balance={wallet?.balance || 0}
                pendingBalance={vanAccount?.pending_balance || 0}
                merchantName={user?.merchant?.company_name || 'Merchant'}
                cardNumber={vanAccount?.account_number || ''}
              />
              <div className="grid grid-cols-2 gap-3 mt-6">
                <Link to="/wallet/deposit" className="w-full">
                  <Button className="w-full justify-center">
                    Deposit
                  </Button>
                </Link>
                <Link to="/ledger" className="w-full">
                  <Button variant="secondary" className="w-full justify-center">
                    Ledger
                  </Button>
                </Link>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium text-slate-900 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link
                  to="/developers/api-keys"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-primary-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-900">Get API Keys</span>
                </Link>
                <Link
                  to="/developers/webhooks"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-slate-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-900">Configure Webhooks</span>
                </Link>
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Recent Orders</h3>
            <Link to="/orders" className="text-sm font-medium text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500">No orders yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="pb-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="pb-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="pb-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      UTR
                    </th>
                    <th className="pb-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900 font-mono">
                            {order.id}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatRelativeTime(order.date)}
                          </p>
                        </div>
                      </td>
                      <td className="py-4">
                        <p className="text-sm text-slate-900">{order.customer}</p>
                      </td>
                      <td className="py-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-4">
                        <span className="text-sm text-slate-500 font-mono">
                          {order.utr || '-'}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        <span className="text-sm font-medium text-slate-900">
                          {formatCurrency(order.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
