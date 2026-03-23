import { useState, useEffect } from 'react';
import {
    Download, TrendingUp, Users, Activity, FileText, CreditCard, Landmark
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Button, Badge, DateTimePicker, Select } from '../../components/ui';
import { RevenueAreaChart } from '../../components/charts/RevenueAreaChart';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';
import { useExportData } from '../../hooks';

type ReportTab = 'overview' | 'transactions' | 'ledgers' | 'settlements';

export function AdminReports() {

    // Initialize main tab from localStorage
    const initialTab = (localStorage.getItem('admin-reports-tab') as ReportTab) || 'overview';
    const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);

    // Handle main tab change with localStorage persistence
    const handleTabChange = (tab: ReportTab) => {
        localStorage.setItem('admin-reports-tab', tab);
        setActiveTab(tab);
    };

    // Use SDK-based export hook
    const { exportData, loading: exporting } = useExportData(adminMethods.exportReport);

    // Set default 7-day datetime range
    const getDefaultDateRange = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        // Format as YYYY-MM-DDTHH:mm:ss for datetime picker
        const formatDateTime = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        };

        return {
            start: formatDateTime(start),
            end: formatDateTime(end)
        };
    };

    const [dateRange, setDateRange] = useState(getDefaultDateRange());
    const [merchantFilter, setMerchantFilter] = useState('all');
    const [productFilter, setProductFilter] = useState('all');

    // Initialize status filters from localStorage
    const [statusFilter, setStatusFilter] = useState(localStorage.getItem('admin-reports-transaction-status') || 'all');
    const [searchQuery] = useState('');
    const [ledgerTypeFilter, setLedgerTypeFilter] = useState(localStorage.getItem('admin-reports-ledger-type') || 'all');
    const [settlementStatusFilter, setSettlementStatusFilter] = useState(localStorage.getItem('admin-reports-settlement-status') || 'all');
    const [currentPage, setCurrentPage] = useState(1);

    // Fetch merchants for filter dropdown
    const { data: { message: merchantsData } = {} } = useFrappeGetCall(
        adminMethods.getMerchantsForFilter,
        {},
        'admin-merchants-filter'
    );
    const allMerchants = merchantsData?.merchants || [];

    // Fetch products for filter dropdown
    const { data: { message: productsData } = {} } = useFrappeGetCall(
        adminMethods.getProductsForFilter,
        {},
        'admin-products-filter'
    );
    const allProducts = productsData?.products || [];

    // Fetch metrics
    const { data: { message: metricsData } = {} } = useFrappeGetCall(
        adminMethods.getReportMetrics,
        {
            start_date: dateRange.start,
            end_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined
        },
        `admin-report-metrics-${dateRange.start}-${dateRange.end}-${merchantFilter}`
    );

    // Fetch volume trend
    const { data: { message: trendData } = {} } = useFrappeGetCall(
        adminMethods.getVolumeTrend,
        {
            start_date: dateRange.start,
            end_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined
        },
        `admin-volume-trend-${dateRange.start}-${dateRange.end}-${merchantFilter}`
    );

    // Fetch product distribution
    const { data: { message: distributionData } = {} } = useFrappeGetCall(
        adminMethods.getProductDistribution,
        {
            start_date: dateRange.start,
            end_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined
        },
        `admin-product-distribution-${dateRange.start}-${dateRange.end}-${merchantFilter}`
    );

    // Fetch insights
    const { data: { message: insightsData } = {} } = useFrappeGetCall(
        adminMethods.getReportInsights,
        {
            start_date: dateRange.start,
            end_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined
        },
        `admin-report-insights-${dateRange.start}-${dateRange.end}-${merchantFilter}`
    );

    // Fetch transactions for overview and transactions tab
    const transactionsFilters = {
        start_date: dateRange.start,
        end_date: dateRange.end,
        merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined,
        product: productFilter !== 'all' ? productFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery,
        page: activeTab === 'transactions' ? currentPage : 1,
        page_size: activeTab === 'transactions' ? 20 : 10
    };

    const { data: { message: transactionsData } = {} } = useFrappeGetCall(
        adminMethods.getReportTransactions,
        transactionsFilters,
        `admin-report-transactions-${JSON.stringify(transactionsFilters)}-${activeTab}`
    );

    // Fetch ledgers
    const ledgerFilters = {
        filter_data: JSON.stringify({
            from_date: dateRange.start,
            to_date: dateRange.end,
            merchant: merchantFilter !== 'all' ? merchantFilter : undefined,
            type: ledgerTypeFilter !== 'all' ? ledgerTypeFilter : undefined
        }),
        page: currentPage,
        page_size: 20
    };

    const { data: { message: ledgersData } = {} } = useFrappeGetCall(
        activeTab === 'ledgers' ? adminMethods.getReportLedgers : '',
        ledgerFilters,
        activeTab === 'ledgers' ? `admin-report-ledgers-${JSON.stringify(ledgerFilters)}` : null
    );

    // Fetch settlements
    const settlementsFilters = {
        filter_data: JSON.stringify({
            from_date: dateRange.start,
            to_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined,
            status: settlementStatusFilter !== 'all' ? settlementStatusFilter : undefined
        }),
        page: currentPage,
        page_size: 20
    };

    const { data: { message: settlementsData } = {} } = useFrappeGetCall(
        activeTab === 'settlements' ? adminMethods.getReportSettlements : '',
        settlementsFilters,
        activeTab === 'settlements' ? `admin-report-settlements-${JSON.stringify(settlementsFilters)}` : null
    );

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, merchantFilter, productFilter, statusFilter, searchQuery, ledgerTypeFilter, settlementStatusFilter]);

    // Extract data from API responses
    const metrics = metricsData || {
        total_volume: 0,
        avg_transaction: 0,
        success_rate: 0,
        new_merchants: 0
    };

    const chartData = (trendData?.trend_data || []).map((item: any) => ({
        date: item.date,
        revenue: item.volume
    }));

    const productDistribution = distributionData?.distribution || [];
    const insights = insightsData || {
        top_merchant: { name: 'N/A', percentage: 0 },
        failed_product: { name: 'N/A', count: 0 }
    };

    const handleExport = async () => {
        if (activeTab === 'overview') return;

        let reportType = activeTab;
        let filters: any = {
            from_date: dateRange.start,
            to_date: dateRange.end
        };

        if (activeTab === 'transactions') {
            if (merchantFilter !== 'all') filters.merchant_id = merchantFilter;
            if (statusFilter !== 'all') filters.status = statusFilter;
            if (productFilter !== 'all') filters.product = productFilter;
        } else if (activeTab === 'ledgers') {
            if (merchantFilter !== 'all') filters.merchant = merchantFilter;
            if (ledgerTypeFilter !== 'all') filters.type = ledgerTypeFilter;
        } else if (activeTab === 'settlements') {
            if (merchantFilter !== 'all') filters.merchant_id = merchantFilter;
            if (settlementStatusFilter !== 'all') filters.status = settlementStatusFilter;
        }

        try {
            await exportData({
                report_type: reportType,
                ...filters
            });
        } catch (error) {
            console.error('Export error:', error);
        }
    };

    const adminTransactions = transactionsData?.transactions || [];
    const transactionsTotal = transactionsData?.total || 0;

    const ledgerEntries = ledgersData?.entries || [];
    const ledgersTotal = ledgersData?.total || 0;


    const adminSettlements = settlementsData?.logs || [];
    const settlementsTotal = settlementsData?.total || 0;

    const tabs = [
        { id: 'overview', label: 'Overview', icon: TrendingUp },
        { id: 'transactions', label: 'Transactions', icon: CreditCard },
        { id: 'ledgers', label: 'Ledgers', icon: FileText },
        { id: 'settlements', label: 'Settlements', icon: Landmark }
    ];

    return (
        <DashboardLayout isAdmin>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Platform Reports</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Detailed performance analysis across multiple dimensions
                        </p>
                    </div>
                    {activeTab !== 'overview' && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="secondary"
                                onClick={handleExport}
                                disabled={exporting}
                            >
                                <Download className="w-4 h-4" />
                                {exporting ? 'Exporting...' : 'Export Report'}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id as ReportTab)}
                            className={`
                                flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                                ${activeTab === tab.id
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}
                            `}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Status Tabs and Filters on Same Row */}
                <div className="flex items-center justify-between gap-4">
                    {/* Status Tabs for Transactions */}
                    {activeTab === 'transactions' && (
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'success', 'failed', 'pending', 'processing'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => {
                                        const newStatus = status === 'all' ? 'all' : status.charAt(0).toUpperCase() + status.slice(1);
                                        localStorage.setItem('admin-reports-transaction-status', newStatus);
                                        setStatusFilter(newStatus);
                                        setCurrentPage(1);
                                    }}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all
                                        ${(statusFilter.toLowerCase() === status || (statusFilter === 'all' && status === 'all'))
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                        }
                                    `}
                                >
                                    <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Status Tabs for Ledgers */}
                    {activeTab === 'ledgers' && (
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'credit', 'debit'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => {
                                        const newType = type === 'all' ? 'all' : type.charAt(0).toUpperCase() + type.slice(1);
                                        localStorage.setItem('admin-reports-ledger-type', newType);
                                        setLedgerTypeFilter(newType);
                                        setCurrentPage(1);
                                    }}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all
                                        ${(ledgerTypeFilter.toLowerCase() === type || (ledgerTypeFilter === 'all' && type === 'all'))
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                        }
                                    `}
                                >
                                    <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Status Tabs for Settlements */}
                    {activeTab === 'settlements' && (
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'pending', 'success', 'failed'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => {
                                        const newStatus = status === 'all' ? 'all' : status;
                                        localStorage.setItem('admin-reports-settlement-status', newStatus);
                                        setSettlementStatusFilter(newStatus);
                                        setCurrentPage(1);
                                    }}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all
                                        ${(settlementStatusFilter.toLowerCase() === status || (settlementStatusFilter === 'all' && status === 'all'))
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                        }
                                    `}
                                >
                                    <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Filters Button */}
                    <button
                        onClick={() => {
                            document.getElementById('reports-filters')?.classList.toggle('max-h-0');
                            document.getElementById('reports-filters')?.classList.toggle('max-h-96');
                            document.getElementById('reports-filters')?.classList.toggle('opacity-0');
                            document.getElementById('reports-filters')?.classList.toggle('opacity-100');
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span>Filters</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>

                {/* Collapsible Filter Panel */}
                <div
                    id="reports-filters"
                    className="overflow-hidden transition-all duration-300 ease-in-out max-h-0 opacity-0"
                >
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            <div className="space-y-1 col-span-2">
                                <label className="block text-xs font-medium text-slate-700 mb-2">
                                    Date Range
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <DateTimePicker
                                        value={dateRange.start}
                                        onChange={(value) => setDateRange({ ...dateRange, start: value })}
                                    />
                                    <DateTimePicker
                                        value={dateRange.end}
                                        onChange={(value) => setDateRange({ ...dateRange, end: value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-700 block mb-2">
                                    Merchant
                                </label>
                                <Select
                                    value={merchantFilter}
                                    onChange={(e) => setMerchantFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Merchants' },
                                        ...allMerchants.map((merchant: any) => ({
                                            value: merchant.id,
                                            label: merchant.name
                                        }))
                                    ]}
                                />
                            </div>

                            {activeTab === 'transactions' && (
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-700 block mb-2">
                                        Product
                                    </label>
                                    <Select
                                        value={productFilter}
                                        onChange={(e) => setProductFilter(e.target.value)}
                                        options={[
                                            { value: 'all', label: 'All Products' },
                                            ...allProducts.map((product: any) => ({
                                                value: product.id,
                                                label: product.name
                                            }))
                                        ]}
                                    />
                                </div>
                            )}


                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Metric Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">Total Volume</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(metrics.total_volume)}</p>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">Avg. Transaction</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(metrics.avg_transaction)}</p>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">Success Rate</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.success_rate}%</p>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                                        <Activity className="w-5 h-5" />
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">New Merchants</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.new_merchants}</p>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                                        <Users className="w-5 h-5" />
                                    </div>
                                </div>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                                <RevenueAreaChart data={chartData} />
                            </div>

                            <div className="space-y-6">
                                <Card>
                                    <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider">
                                        Product Distribution
                                    </h3>
                                    <div className="space-y-4">
                                        {productDistribution.map((p: any, i: number) => (
                                            <div key={i}>
                                                <div className="flex justify-between text-sm mb-1.5">
                                                    <span className="text-slate-600 font-medium">{p.product}</span>
                                                    <span className="text-slate-900 font-bold">{p.percentage}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary-500" style={{ width: `${p.percentage}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        {productDistribution.length === 0 && (
                                            <p className="text-sm text-slate-500 text-center py-4">No product data available</p>
                                        )}
                                    </div>
                                </Card>

                                <Card>
                                    <h3 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wider">
                                        Insights
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-success-50 rounded-lg border border-success-100">
                                            <p className="text-sm text-success-800 font-medium">Top performing merchant</p>
                                            <p className="text-xs text-success-600 mt-0.5">
                                                {insights.top_merchant.name} contributed {insights.top_merchant.percentage}% of volume this period.
                                            </p>
                                        </div>
                                        <div className="p-3 bg-warning-50 rounded-lg border border-warning-100">
                                            <p className="text-sm text-warning-800 font-medium">Failed transactions</p>
                                            <p className="text-xs text-warning-600 mt-0.5">
                                                {insights.failed_product.count > 0
                                                    ? `${insights.failed_product.count} failed transactions for ${insights.failed_product.name === 'None' ? 'various products' : insights.failed_product.name}.`
                                                    : "No failed transactions recorded."}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>

                        {/* Recent Transactions Preview */}
                        <Card padding="none">
                            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="font-semibold text-slate-900">Recent Transaction Log</h3>
                                <button onClick={() => setActiveTab('transactions')} className="text-sm text-primary-600 font-medium hover:text-primary-700">
                                    View All
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Merchant</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Product/Method</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Amount</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {adminTransactions.slice(0, 10).map((txn: any) => (
                                            <tr key={txn.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 text-sm font-mono text-slate-900">{txn.id}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600">
                                                    {txn.merchant_name}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600">{txn.product}</td>
                                                <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(txn.amount)}</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant={txn.status === 'Processed' ? 'success' : txn.status === 'Pending' ? 'warning' : 'error'}>
                                                        {txn.status}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                        {adminTransactions.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                                                    No transactions found
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === 'transactions' && (
                    <Card padding="none">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-900">Transaction Report</h3>
                            <span className="text-xs text-slate-500">Showing {adminTransactions.length} entries</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Merchant</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Customer</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {adminTransactions.map((txn: any) => (
                                        <tr key={txn.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-mono text-slate-900">{txn.id.slice(0, 12)}...</td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(txn.date)}</td>
                                            <td className="px-6 py-4 text-sm text-slate-900">
                                                {txn.merchant_name}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-900 font-medium">{txn.customer_name}</div>
                                                <div className="text-xs text-slate-500">{txn.customer_email}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-semibold text-slate-900">{formatCurrency(txn.amount)}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant={txn.status === 'Processed' ? 'success' : txn.status === 'Pending' ? 'warning' : 'error'}>
                                                    {txn.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                    {adminTransactions.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                                No transactions found matching the selected filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-white text-sm">
                            <div className="text-slate-500">
                                Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, transactionsTotal)} of {transactionsTotal}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage * 20 >= transactionsTotal}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {activeTab === 'ledgers' && (
                    <Card padding="none">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-900">Merchant Ledger Report</h3>
                            <span className="text-xs text-slate-500">Showing {ledgerEntries.length} entries</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Merchant</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Description</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">Credit</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">Debit</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">Balance</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {ledgerEntries.map((entry: any) => (
                                        <tr key={entry.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm font-mono text-slate-900">{entry.id}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {entry.merchant_name}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{entry.order_id}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-success-600">{entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-error-600">{entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(entry.balance)}</td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{formatDateTime(entry.date)}</td>
                                        </tr>
                                    ))}
                                    {ledgerEntries.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-500">
                                                No ledger entries found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-white text-sm">
                            <div className="text-slate-500">
                                Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, ledgersTotal)} of {ledgersTotal}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage * 20 >= ledgersTotal}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {activeTab === 'settlements' && (
                    <Card padding="none">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-900">Settlement History Report</h3>
                            <span className="text-xs text-slate-500">Showing {adminSettlements.length} entries</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">ID</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Merchant</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Account</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">UTR</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Remitter</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {adminSettlements.map((log: any) => (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-mono text-slate-900">{log.id}</td>
                                            <td className="px-6 py-4 text-sm text-slate-900">
                                                {log.merchant_name || 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-mono text-slate-600">{log.account_number}</td>
                                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(log.amount)}</td>
                                            <td className="px-6 py-4 text-sm font-mono text-slate-600">{log.utr || '-'}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-900">{log.remitter_name || '-'}</div>
                                                <div className="text-xs text-slate-500">{log.remitter_account_number || ''}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant={
                                                    log.status === 'Success' ? 'success' :
                                                        log.status === 'Pending' ? 'warning' :
                                                            log.status === 'Failed' ? 'error' : 'primary'
                                                }>
                                                    {log.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">{formatDateTime(log.date)}</td>
                                        </tr>
                                    ))}
                                    {adminSettlements.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                                No VAN logs found matching the selected filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-white text-sm">
                            <div className="text-slate-500">
                                Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, settlementsTotal)} of {settlementsTotal}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage * 20 >= settlementsTotal}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}
