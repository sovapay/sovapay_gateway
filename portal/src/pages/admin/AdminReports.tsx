import { useState, useEffect } from 'react';
import {
    Download, TrendingUp, Users, Activity, FileText, CreditCard, Landmark, Calendar, Clock
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Button, Badge, DateTimePicker, Select, Modal } from '../../components/ui';
import { RevenueAreaChart } from '../../components/charts/RevenueAreaChart';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';
import { useExportData } from '../../hooks';

type ReportTab = 'overview' | 'payin_ledgers' | 'payout_ledgers' | 'payin_report' | 'payout_report';

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


    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({ 
        start: undefined, 
        end: undefined 
    });
    const [merchantFilter, setMerchantFilter] = useState('all');

    const [searchQuery] = useState('');
    const [ledgerTypeFilter, setLedgerTypeFilter] = useState(localStorage.getItem('admin-reports-ledger-type') || 'all');
    const [reportStatusFilter, setReportStatusFilter] = useState(localStorage.getItem('admin-reports-status') || 'all');
    const [currentPage, setCurrentPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    const [isCustomRangeModalOpen, setIsCustomRangeModalOpen] = useState(false);
    const [tempDates, setTempDates] = useState<{ start?: string, end?: string }>({ 
        start: undefined, 
        end: undefined 
    });

    const activeFilterCount = (merchantFilter !== 'all' ? 1 : 0) + (dateRange.start || dateRange.end ? 1 : 0);

    const handleApplyRange = () => {
        if (tempDates.start && tempDates.end && tempDates.start > tempDates.end) {
            return;
        }
        setDateRange({ start: tempDates.start!, end: tempDates.end! });
        setIsCustomRangeModalOpen(false);
        setCurrentPage(1);
    };

    // Fetch merchants for filter dropdown
    const { data: { message: merchantsData } = {} } = useFrappeGetCall(
        adminMethods.getMerchantsForFilter,
        {},
        'admin-merchants-filter'
    );
    const allMerchants = merchantsData?.merchants || [];

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

    // Fetch ledgers
    const ledgerFilters = {
        start_date: dateRange.start,
        end_date: dateRange.end,
        merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined,
        entry_type: ledgerTypeFilter !== 'all' ? ledgerTypeFilter : undefined,
        group: activeTab === 'payin_ledgers' ? 'Payin' : (activeTab === 'payout_ledgers' ? 'Payout' : undefined),
        page: currentPage,
        page_size: 20
    };

    const isLedgersTab = activeTab === 'payin_ledgers' || activeTab === 'payout_ledgers';

    const { data: { message: ledgersData } = {} } = useFrappeGetCall(
        isLedgersTab ? adminMethods.getReportLedgers : '',
        ledgerFilters,
        isLedgersTab ? `admin-report-ledgers-${JSON.stringify(ledgerFilters)}` : null
    );

    // Fetch Payin Report
    const { data: { message: payinReportData } = {} } = useFrappeGetCall(
        activeTab === 'payin_report' ? adminMethods.getPayinReport : '',
        {
            start_date: dateRange.start,
            end_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined,
            status: reportStatusFilter !== 'all' ? reportStatusFilter : undefined
        },
        `admin-payin-report-${dateRange.start}-${dateRange.end}-${merchantFilter}-${reportStatusFilter}`
    );

    // Fetch Payout Report
    const { data: { message: payoutReportData } = {} } = useFrappeGetCall(
        activeTab === 'payout_report' ? adminMethods.getPayoutReport : '',
        {
            start_date: dateRange.start,
            end_date: dateRange.end,
            merchant_id: merchantFilter !== 'all' ? merchantFilter : undefined,
            status: reportStatusFilter !== 'all' ? reportStatusFilter : undefined
        },
        `admin-payout-report-${dateRange.start}-${dateRange.end}-${merchantFilter}-${reportStatusFilter}`
    );

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, merchantFilter, searchQuery, ledgerTypeFilter, reportStatusFilter]);

    const metrics = metricsData || {
        payin_revenue: 0,
        payout_revenue: 0,
        revenue_percentage: 0,
        new_merchants: 0
    };

    const chartData = (trendData?.trend_data || []).map((item: any) => ({
        date: item.date,
        payin_revenue: item.payin_revenue,
        payout_revenue: item.payout_revenue,
        revenue: (item.payin_revenue || 0) + (item.payout_revenue || 0)
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

        if (isLedgersTab) {
            if (merchantFilter !== 'all') filters.merchant = merchantFilter;
            if (ledgerTypeFilter !== 'all') filters.type = ledgerTypeFilter;
            filters.group = activeTab === 'payin_ledgers' ? 'Payin' : 'Payout';
        } else if (activeTab === 'payin_report' || activeTab === 'payout_report') {
            if (merchantFilter !== 'all') filters.merchant_id = merchantFilter;
            if (reportStatusFilter !== 'all') filters.status = reportStatusFilter;
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

    const ledgerEntries = ledgersData?.ledgers || [];
    const ledgersTotal = ledgersData?.total || 0;

    const pageSize = 20;

    const tabs = [
        { id: 'overview', label: 'Overview', icon: TrendingUp },
        { id: 'payin_report', label: 'Payin Report', icon: FileText },
        { id: 'payout_report', label: 'Payout Report', icon: FileText },
        { id: 'payin_ledgers', label: 'Payin Ledger', icon: Activity },
        { id: 'payout_ledgers', label: 'Payout Ledger', icon: Activity }
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


                    {/* Status Tabs for Ledgers */}
                    {isLedgersTab && (
                        <div className="flex flex-col gap-4">
                            {/* Type Filter Tabs */}
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
                        </div>
                    )}

                    {/* Status Tabs for Payin/Payout Reports */}
                    {(activeTab === 'payin_report' || activeTab === 'payout_report') && (
                        <div className="flex flex-wrap gap-2">
                            {(['all', 'Success', 'Pending', 'Failed'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => {
                                        localStorage.setItem('admin-reports-status', status);
                                        setReportStatusFilter(status);
                                        setCurrentPage(1);
                                    }}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all
                                        ${(reportStatusFilter === status)
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                        }
                                    `}
                                >
                                    <span>{status}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Search Bar for Reports */}
                    {(activeTab === 'payin_report' || activeTab === 'payout_report') && (
                        <div className="relative w-full md:w-64">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search merchant..."
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                    )}

                    {/* Filters Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`
                            flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all border
                            ${showFilters 
                                ? 'bg-slate-900 text-white border-slate-900' 
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}
                        `}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${showFilters ? 'bg-primary-500 text-white' : 'bg-primary-600 text-white'}`}>
                                {activeFilterCount}
                            </span>
                        )}
                        {showFilters ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Collapsible Filter Panel */}
                <div
                    className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${showFilters ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}
                    `}
                >
                    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                        <div className="flex flex-col sm:flex-row gap-6">
                            {/* Merchant Filter */}
                            <div className="w-full sm:w-64">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Merchant
                                </label>
                                <Select
                                    value={merchantFilter}
                                    onChange={(e) => {
                                        setMerchantFilter(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    options={[
                                        { value: 'all', label: 'All Merchants' },
                                        ...allMerchants.map((m: any) => ({
                                            value: m.id,
                                            label: m.name
                                        }))
                                    ]}
                                />
                            </div>

                            {/* Date Filter */}
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Date Range
                                </label>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            setTempDates({
                                                start: dateRange.start || '',
                                                end: dateRange.end || ''
                                            });
                                            setIsCustomRangeModalOpen(true);
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors w-full sm:w-auto"
                                    >
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        {dateRange.start && dateRange.end ? (
                                            <span>{formatDateTime(dateRange.start)} → {formatDateTime(dateRange.end)}</span>
                                        ) : (
                                            <span className="text-slate-500">Select Date Range</span>
                                        )}
                                    </button>
                                    {(dateRange.start || dateRange.end) && (
                                        <button
                                            onClick={() => {
                                                setDateRange({ start: undefined, end: undefined });
                                                setCurrentPage(1);
                                            }}
                                            className="text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap"
                                        >
                                            Clear dates
                                        </button>
                                    )}
                                </div>
                            </div>
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
                                        <p className="text-sm font-medium text-slate-500">Total Payout Revenue</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(metrics.payout_revenue)}</p>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">Total Payin Revenue</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(metrics.payin_revenue)}</p>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">Overall Revenue Margin</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{metrics.revenue_percentage.toFixed(2)}%</p>
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
                    </div>
                )}                {isLedgersTab && (
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
                                            <td className="px-6 py-4 text-sm text-slate-600">{entry.description}</td>
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
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
                            <p className="text-sm text-slate-500 font-medium">
                                Showing {ledgerEntries.length} of {ledgersTotal} entries
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={currentPage * pageSize >= ledgersTotal}
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {(activeTab === 'payin_report' || activeTab === 'payout_report') && (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {activeTab === 'payin_report' ? (
                                <>
                                    <Card>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Payin</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {formatCurrency(payinReportData?.summary?.total_payin || 0)}
                                        </p>
                                    </Card>
                                    <Card>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Fees</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {formatCurrency(payinReportData?.summary?.total_fees || 0)}
                                        </p>
                                    </Card>
                                    <Card>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">GST</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {formatCurrency(payinReportData?.summary?.total_gst || 0)}
                                        </p>
                                    </Card>
                                    <Card className="bg-primary-50 border-primary-100">
                                        <p className="text-sm font-medium text-primary-700 uppercase tracking-wider">Credited</p>
                                        <p className="text-2xl font-bold text-primary-900 mt-1">
                                            {formatCurrency(payinReportData?.summary?.total_credited || 0)}
                                        </p>
                                    </Card>
                                </>
                            ) : (
                                <>
                                    <Card>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Payout</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {formatCurrency(payoutReportData?.summary?.total_payout || 0)}
                                        </p>
                                    </Card>
                                    <Card>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Fees</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {formatCurrency(payoutReportData?.summary?.total_fees || 0)}
                                        </p>
                                    </Card>
                                    <Card>
                                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">GST</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {formatCurrency(payoutReportData?.summary?.total_gst || 0)}
                                        </p>
                                    </Card>
                                    <Card className="bg-primary-50 border-primary-100">
                                        <p className="text-sm font-medium text-primary-700 uppercase tracking-wider">Total Debited</p>
                                        <p className="text-2xl font-bold text-primary-900 mt-1">
                                            {formatCurrency(payoutReportData?.summary?.total_debited || 0)}
                                        </p>
                                    </Card>
                                </>
                            )}
                        </div>

                        {/* Merchant Table */}
                        <Card padding="none">
                            <div className="p-4 border-b border-slate-200">
                                <h3 className="font-semibold text-slate-900">
                                    {activeTab === 'payin_report' ? 'Payin' : 'Payout'} Report by Merchant
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-widest">Merchant Name</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                                {activeTab === 'payin_report' ? 'Total Payin' : 'Total Payout'}
                                            </th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">Fees</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">GST</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                                {activeTab === 'payin_report' ? 'Total Credited' : 'Total Debited'}
                                            </th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-widest">Txn Count</th>
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(activeTab === 'payin_report' ? payinReportData?.rows : payoutReportData?.rows)?.map((row: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 text-sm text-slate-900 font-medium">{row.merchant_name || 'Unknown'}</td>
                                                <td className="px-6 py-4 text-sm text-right text-slate-900">
                                                    {formatCurrency(activeTab === 'payin_report' ? row.total_payin : row.total_payout)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-right text-slate-600">{formatCurrency(row.total_fees)}</td>
                                                <td className="px-6 py-4 text-sm text-right text-slate-600">{formatCurrency(row.total_gst)}</td>
                                                <td className="px-6 py-4 text-sm text-right font-semibold text-slate-900">
                                                    {formatCurrency(activeTab === 'payin_report' ? row.total_credited : row.total_debited)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-right text-slate-500">{row.txn_count}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <Badge variant="primary" className="cursor-pointer hover:bg-primary-100">View</Badge>
                                                </td>
                                            </tr>
                                        ))}
                                        {((activeTab === 'payin_report' ? payinReportData?.rows : payoutReportData?.rows)?.length === 0) && (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                                    No data found for the selected filters.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            <Modal
                isOpen={isCustomRangeModalOpen}
                onClose={() => setIsCustomRangeModalOpen(false)}
                title="Select Custom Range"
                size="md"
            >
                <div className="space-y-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary-500" />
                                START DATE & TIME
                            </label>
                            <DateTimePicker
                                value={tempDates.start || ''}
                                onChange={(val) => setTempDates({ ...tempDates, start: val })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary-500" />
                                END DATE & TIME
                            </label>
                            <DateTimePicker
                                value={tempDates.end || ''}
                                onChange={(val) => setTempDates({ ...tempDates, end: val })}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={() => setIsCustomRangeModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleApplyRange}>
                            Apply Range
                        </Button>
                    </div>
                </div>
            </Modal>
        </DashboardLayout>
    );
}
