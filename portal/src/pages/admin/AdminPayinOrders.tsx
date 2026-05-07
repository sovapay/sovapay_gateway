import { useState } from 'react';
import { Search, Calendar } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout';
import { Card, Button, DateTimePicker, StatusTabs, Select } from '../../components/ui';
import type { StatusTab } from '../../components/ui';
import { formatCurrency, formatDateTime, truncateId } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';
import { useExportData } from '../../hooks';

function getStatusBadge(status: string) {
    const styles = {
        'Processed': 'bg-green-100 text-green-800 border-green-200',
        'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'Processing': 'bg-blue-100 text-blue-800 border-blue-200',
        'Failed': 'bg-red-100 text-red-800 border-red-200',
        'Cancelled': 'bg-red-100 text-red-800 border-red-200',
        'Reversed': 'bg-slate-100 text-slate-800 border-slate-200',
        'Refund Processing': 'bg-orange-100 text-orange-800 border-orange-200',
    };

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
            {status}
        </span>
    );
}

export function AdminPayinOrders() {
    const [searchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');
    // Initialize status filter from URL params or localStorage
    const [statusFilter, setStatusFilter] = useState(
        searchParams.get('status') || localStorage.getItem('admin-payin-orders-status') || 'all'
    );
    const [merchantFilter, setMerchantFilter] = useState('all');
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({
        start: undefined,
        end: undefined
    });
    const [page, setPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);

    // Initialize export hook
    const { exportData, loading: exporting } = useExportData(adminMethods.exportOrdersToExcel);

    const pageSize = 10;

    // Build filter object
    const filters: any = { order_type: 'Topup' };
    if (statusFilter !== 'all') filters.status = statusFilter;
    if (merchantFilter !== 'all') filters.merchant_id = merchantFilter;
    if (dateRange.start) filters.from_date = dateRange.start;
    if (dateRange.end) filters.to_date = dateRange.end;

    // Fetch orders with SDK
    const { data: { message: ordersData } = {}, isLoading: loading } = useFrappeGetCall(
        adminMethods.getOrders,
        {
            filter_data: Object.keys(filters).length > 0 ? filters : undefined,
            page,
            page_size: pageSize,
            sort_by: 'creation',
            sort_order: 'desc'
        },
        `admin-payin-orders-${page}-${JSON.stringify(filters)}`
    );

    // Fetch merchants for filter dropdown
    const { data: { message: merchantsData } = {} } = useFrappeGetCall(
        adminMethods.getMerchants,
        { page: 1, page_size: 100 },
        'admin-merchants-list-filter'
    );

    const orders = ordersData?.orders || [];
    const totalCount = ordersData?.total || 0;
    const merchants = merchantsData?.merchants || [];

    // Filter by search query on frontend (for ID, customer name, email)
    const filteredOrders = orders.filter((order: any) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            order.id?.toLowerCase().includes(query) ||
            order.customer?.toLowerCase().includes(query) ||
            order.merchant_name?.toLowerCase().includes(query)
        );
    });

    // Calculate status counts
    const apiCounts = ordersData?.status_counts || {};
    const statusCounts = {
        all: apiCounts.all || 0,
        Queued: apiCounts.Queued || 0,
        Processing: apiCounts.Processing || 0,
        Processed: apiCounts.Processed || 0,
        Cancelled: apiCounts.Cancelled || 0,
        Reversed: apiCounts.Reversed || 0,
        RefundProcessing: apiCounts['Refund Processing'] || 0,
    };

    // Status tabs configuration
    const statusTabs: StatusTab[] = [
        { label: 'All', value: 'all', count: statusCounts.all },
        { label: 'Queued', value: 'Queued', count: statusCounts.Queued },
        { label: 'Processing', value: 'Processing', count: statusCounts.Processing },
        { label: 'Refund Processing', value: 'Refund Processing', count: statusCounts.RefundProcessing },
        { label: 'Processed', value: 'Processed', count: statusCounts.Processed },
        { label: 'Cancelled', value: 'Cancelled', count: statusCounts.Cancelled },
        { label: 'Reversed', value: 'Reversed', count: statusCounts.Reversed },
    ];

    // Count active filters
    const activeFilterCount = [
        merchantFilter !== 'all',
        !!dateRange.start,
        !!dateRange.end
    ].filter(Boolean).length;

    return (
        <DashboardLayout isAdmin>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Payin Orders</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            View and manage all payment orders
                        </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => exportData(filters)} disabled={exporting}>
                        <Calendar className="w-4 h-4 mr-2" />
                        {exporting ? 'Exporting...' : 'Export'}
                    </Button>
                </div>

                {/* Status Tabs */}
                <StatusTabs
                    tabs={statusTabs}
                    activeTab={statusFilter}
                    onChange={(value) => {
                        localStorage.setItem('admin-payin-orders-status', value);
                        setStatusFilter(value);
                        setPage(1);
                    }}
                />

                {/* Search Bar and Filters Button */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by order ID, customer name, or merchant..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="px-2 py-0.5 text-xs font-semibold text-white bg-primary-600 rounded-full">
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
                        ${showFilters ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                    `}
                >
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {/* Date Range - Compact */}
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-700 mb-2">
                                    Date Range
                                </label>
                                <div className="flex items-center gap-2">
                                    <DateTimePicker
                                        value={dateRange.start || ''}
                                        onChange={(value) => setDateRange({ ...dateRange, start: value })}
                                    />
                                    <span className="text-slate-400 text-sm">→</span>
                                    <DateTimePicker
                                        value={dateRange.end || ''}
                                        onChange={(value) => setDateRange({ ...dateRange, end: value })}
                                    />
                                </div>
                            </div>

                            {/* Merchant Filter - Compact */}
                            <div className="w-full sm:w-64">
                                <label className="block text-xs font-medium text-slate-700 mb-2">
                                    Merchant
                                </label>
                                <Select
                                    value={merchantFilter}
                                    onChange={(e) => {
                                        setMerchantFilter(e.target.value);
                                        setPage(1);
                                    }}
                                    options={[
                                        { value: 'all', label: 'All Merchants' },
                                        ...merchants.map((m: any) => ({
                                            value: m.name,
                                            label: m.company_name
                                        }))
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Card padding="none">
                    {loading ? (
                        <div className="p-12 text-center">
                            <p className="text-sm text-slate-500">Loading orders...</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                Order ID
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                Merchant
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                Customer
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                Date
                                            </th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                Amount
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {filteredOrders.map((order: any) => (
                                            <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <Link to={`/admin/orders/payin/${order.id}`}>
                                                        <p className="text-sm font-mono text-slate-900 hover:text-primary-600 transition-colors">{truncateId(order.id, 16)}</p>
                                                    </Link>
                                                    {order.utr && (
                                                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">UTR: {truncateId(order.utr, 12)}</p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-slate-900 font-medium">{order.merchant_name || 'Unknown'}</p>
                                                    <p className="text-xs text-slate-500">{order.merchant_ref_id}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm text-slate-900 font-medium">{order.customer || 'N/A'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(order.status)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm text-slate-500">{formatDateTime(order.date)}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {formatCurrency(Number(order.amount) || 0)}
                                                    </span>
                                                    {order.transaction_amount && (
                                                        <p className="text-[10px] text-slate-400 mt-0.5">Txn: {formatCurrency(Number(order.transaction_amount))}</p>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredOrders.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center">
                                                    <div className="flex flex-col items-center justify-center text-slate-500">
                                                        <Search className="w-8 h-8 mb-2 opacity-20" />
                                                        <p className="text-sm font-medium">No orders found</p>
                                                        <p className="text-xs">Try adjusting your filters or search query</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
                                <p className="text-sm text-slate-500 font-medium">
                                    Showing {filteredOrders.length} of {totalCount} orders
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page === 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page * pageSize >= totalCount}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </DashboardLayout>
    );
}
