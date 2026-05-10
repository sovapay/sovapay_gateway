import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Search, Check, X, AlertCircle, Calendar, MoreVertical } from 'lucide-react';
import { useToast, Button, StatusTabs, Dropdown, DropdownItem, Select, DateTimePicker } from '../../components/ui';
import type { StatusTab } from '../../components/ui';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';
import { useExportData } from '../../hooks';

export function AdminVANLogs() {
    const [searchQuery, setSearchQuery] = useState('');
    // Initialize status filter from localStorage
    const [statusFilter, setStatusFilter] = useState(localStorage.getItem('admin-vanlogs-status') || 'all');
    const [page, setPage] = useState(1);
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [showApproveDialog, setShowApproveDialog] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [merchantFilter, setMerchantFilter] = useState('all');
    const [entryTypeFilter, setEntryTypeFilter] = useState('all');
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({
        start: undefined,
        end: undefined
    });

    const pageSize = 10;
    const { success: showSuccess, error: showError } = useToast();

    // Initialize export hook
    const { exportData, loading: exporting } = useExportData(adminMethods.exportVANLogs);

    const { call: approveTopup } = useFrappePostCall(adminMethods.approveTopup);
    const { call: rejectTopup } = useFrappePostCall(adminMethods.rejectTopup);

    // Fetch merchants for filter dropdown
    const { data: { message: merchantsData } = {} } = useFrappeGetCall(
        adminMethods.getMerchants,
        { page: 1, page_size: 100 },
        'admin-merchants-list-filter'
    );
    const merchants = merchantsData?.merchants || [];

    // Build filter object
    const filters: any = {};
    if (statusFilter !== 'all') filters.status = statusFilter;
    if (merchantFilter !== 'all') filters.merchant_id = merchantFilter;
    if (entryTypeFilter !== 'all') filters.entry_type = entryTypeFilter;
    if (dateRange.start) filters.from_date = dateRange.start;
    if (dateRange.end) filters.to_date = dateRange.end;

    // Fetch VAN logs
    const { data: { message: vanData } = {}, isLoading: loading, mutate: refetch } = useFrappeGetCall(
        adminMethods.getVANLogs,
        {
            filter_data: Object.keys(filters).length > 0 ? filters : undefined,
            page,
            page_size: pageSize
        },
        `admin-van-logs-${page}-${JSON.stringify(filters)}`
    );

    const vanLogs = vanData?.logs || [];
    const totalCount = vanData?.total || 0;

    // Filter by search query on frontend
    const filteredLogs = vanLogs.filter((log: any) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            log.id?.toLowerCase().includes(query) ||
            log.merchant_name?.toLowerCase().includes(query) ||
            log.utr?.toLowerCase().includes(query) ||
            log.remitter_name?.toLowerCase().includes(query)
        );
    });

    // Calculate stats
    const pendingLogs = vanLogs.filter((log: any) => log.status === 'Pending');
    const successLogs = vanLogs.filter((log: any) => log.status === 'Success');

    const totalPending = pendingLogs.reduce((sum: number, log: any) => sum + (log.amount || 0), 0);
    const totalSuccess = successLogs.reduce((sum: number, log: any) => sum + (log.amount || 0), 0);

    const handleApprove = async () => {
        if (!selectedLog) return;

        setProcessing(true);
        try {
            const result = await approveTopup({ log_id: selectedLog.id });
            if (result.message?.success) {
                showSuccess('Success', 'Top-up request approved successfully!');
                setShowApproveDialog(false);
                setSelectedLog(null);
                refetch();
            } else {
                showError('Error', result.message?.message || 'Failed to approve');
            }
        } catch (err: any) {
            showError('Error', err.message || 'Failed to approve top-up');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedLog) return;

        setProcessing(true);
        try {
            const result = await rejectTopup({ log_id: selectedLog.id });
            if (result.message?.success) {
                showSuccess('Success', 'Top-up request rejected successfully!');
                setShowRejectDialog(false);
                setSelectedLog(null);
                refetch();
            } else {
                showError('Error', result.message?.message || 'Failed to reject');
            }
        } catch (err: any) {
            showError('Error', err.message || 'Failed to reject top-up');
        } finally {
            setProcessing(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
            'Success': 'bg-green-100 text-green-800 border-green-200',
            'Failed': 'bg-red-100 text-red-800 border-red-200',
        };
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                {status}
            </span>
        );
    };

    // Status counts from API
    const apiCounts = vanData?.status_counts || {};
    const statusCounts = {
        all: apiCounts.all || 0,
        Pending: apiCounts.Pending || 0,
        Success: apiCounts.Success || 0,
        Failed: apiCounts.Failed || 0,
    };

    // Status tabs configuration
    const statusTabs: StatusTab[] = [
        { label: 'All', value: 'all', count: statusCounts.all },
        { label: 'Pending', value: 'Pending', count: statusCounts.Pending },
        { label: 'Success', value: 'Success', count: statusCounts.Success },
        { label: 'Failed', value: 'Failed', count: statusCounts.Failed },
    ];

    return (
        <DashboardLayout isAdmin>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Wallet Top-ups</h1>
                        <p className="text-sm text-slate-500 mt-1">Manage merchant wallet top-up requests</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => exportData(filters)} disabled={exporting}>
                        <Calendar className="w-4 h-4 mr-2" />
                        {exporting ? 'Exporting...' : 'Export'}
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-6">
                        <p className="text-sm font-medium text-slate-500">Total Entries</p>
                        <p className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6">
                        <p className="text-sm font-medium text-yellow-700">Pending Approval</p>
                        <p className="text-2xl font-bold text-yellow-900 mt-2">{statusCounts.Pending}</p>
                        <p className="text-xs text-yellow-600 mt-1">{formatCurrency(totalPending)}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl border border-green-200 p-6">
                        <p className="text-sm font-medium text-green-700">Approved</p>
                        <p className="text-2xl font-bold text-green-900 mt-2">{statusCounts.Success}</p>
                        <p className="text-xs text-green-600 mt-1">{formatCurrency(totalSuccess)}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                        <p className="text-sm font-medium text-red-700">Rejected</p>
                        <p className="text-2xl font-bold text-red-900 mt-2">{statusCounts.Failed}</p>
                    </div>
                </div>

                {/* Status Tabs */}
                <StatusTabs
                    tabs={statusTabs}
                    activeTab={statusFilter}
                    onChange={(value) => {
                        localStorage.setItem('admin-vanlogs-status', value);
                        setStatusFilter(value);
                        setPage(1);
                    }}
                />

                {/* Filters Row */}
                <div className="flex flex-col md:flex-row items-center gap-4">
                    {/* Search Bar */}
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by ID, merchant, UTR, or remitter name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                        />
                    </div>
                    
                    {/* Entry Type Filter */}
                    <div className="w-full md:w-48">
                        <Select
                            value={entryTypeFilter}
                            onChange={(e) => setEntryTypeFilter(e.target.value)}
                            options={[
                                { value: 'all', label: 'All Entry Types' },
                                { value: 'Admin', label: 'Admin' },
                                { value: 'Merchant', label: 'Merchant' },
                                { value: 'Realtime', label: 'Realtime' },
                            ]}
                        />
                    </div>

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border rounded-lg transition-all whitespace-nowrap ${showFilters || dateRange.start || dateRange.end || merchantFilter !== 'all' ? 'text-primary-700 bg-primary-50 border-primary-200' : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span>More Filters</span>
                        {(dateRange.start || dateRange.end || merchantFilter !== 'all') && (
                            <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                        )}
                    </button>
                </div>

                {/* Collapsible Filter Panel */}
                <div
                    className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${showFilters ? 'max-h-96 opacity-100 mb-6' : 'max-h-0 opacity-0'}
                    `}
                >
                    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Merchant Filter */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    Filter by Merchant
                                </label>
                                <Select
                                    value={merchantFilter}
                                    onChange={(e) => setMerchantFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Merchants' },
                                        ...merchants.map((m: any) => ({
                                            value: m.name,
                                            label: m.company_name
                                        }))
                                    ]}
                                />
                            </div>

                            {/* Date Range */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    Date Range
                                </label>
                                <div className="flex items-center gap-3">
                                    <DateTimePicker
                                        value={dateRange.start || ''}
                                        onChange={(val) => setDateRange(prev => ({ ...prev, start: val }))}
                                    />
                                    <span className="text-slate-400">to</span>
                                    <DateTimePicker
                                        value={dateRange.end || ''}
                                        onChange={(val) => setDateRange(prev => ({ ...prev, end: val }))}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        {(merchantFilter !== 'all' || dateRange.start || dateRange.end) && (
                            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    onClick={() => {
                                        setMerchantFilter('all');
                                        setDateRange({ start: undefined, end: undefined });
                                    }}
                                    className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                                >
                                    Clear all filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="mt-6 overflow-x-auto">
                    {loading ? (
                        <div className="py-12 text-center">
                            <p className="text-sm text-slate-500">Loading...</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-slate-50 border-y border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Transaction ID
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Merchant
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Entry Type
                                    </th>

                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        UTR
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
                                    <th className="px-2 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filteredLogs.map((log: any) => (
                                    <tr
                                        key={log.id}
                                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => setSelectedLog(log)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <Link to={`/admin/settlements/${log.id}`} className="block">
                                                <span className="text-sm font-mono text-slate-900 hover:text-primary-600">{log.id}</span>
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm text-slate-900 font-medium">{log.merchant_name || 'Unknown'}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                log.remitter_name === 'Admin' ? 'bg-purple-100 text-purple-700' :
                                                log.remitter_name === 'Merchant' ? 'bg-blue-100 text-blue-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                                {log.remitter_name === 'Admin' ? 'Admin' : 
                                                 log.remitter_name === 'Merchant' ? 'Merchant' : 
                                                 'Realtime'}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm font-mono text-slate-600">{log.utr || 'N/A'}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(log.status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm text-slate-500">
                                                {formatDateTime(log.date)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            <span className="text-sm font-bold text-slate-900">
                                                {formatCurrency(log.amount || 0)}
                                            </span>
                                        </td>
                                        <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                                            {log.status === 'Pending' && (
                                                <Dropdown
                                                    trigger={
                                                        <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors border border-transparent hover:border-slate-300">
                                                            <MoreVertical className="w-4 h-4 text-slate-500" />
                                                        </button>
                                                    }
                                                >
                                                    <DropdownItem
                                                        icon={<Check className="w-4 h-4" />}
                                                        onClick={() => {
                                                            setSelectedLog(log);
                                                            setShowApproveDialog(true);
                                                        }}
                                                    >
                                                        Approve
                                                    </DropdownItem>
                                                    <DropdownItem
                                                        danger
                                                        icon={<X className="w-4 h-4" />}
                                                        onClick={() => {
                                                            setSelectedLog(log);
                                                            setShowRejectDialog(true);
                                                        }}
                                                    >
                                                        Reject
                                                    </DropdownItem>
                                                </Dropdown>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {
                    filteredLogs.length === 0 && !loading && (
                        <div className="py-12 text-center">
                            <p className="text-sm text-slate-500">No top-up requests found matching criteria.</p>
                        </div>
                    )
                }

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <p className="text-sm text-slate-500 font-medium">
                        Showing {filteredLogs.length} of {totalCount} entries
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-slate-600 px-3">
                            Page {page} of {Math.ceil(totalCount / pageSize)}
                        </span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= Math.ceil(totalCount / pageSize)}
                            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* Approve Dialog */}
            {showApproveDialog && selectedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <Check className="w-6 h-6 text-green-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-slate-900">Approve Top-up Request</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Are you sure you want to approve this wallet top-up request?
                                </p>
                                <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Merchant:</span>
                                        <span className="font-medium text-slate-900">{selectedLog.merchant_name}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Amount:</span>
                                        <span className="font-bold text-green-600">{formatCurrency(selectedLog.amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">UTR:</span>
                                        <span className="font-mono text-slate-900">{selectedLog.utr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowApproveDialog(false);
                                    setSelectedLog(null);
                                }}
                                disabled={processing}
                                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={processing}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                                {processing ? 'Processing...' : 'Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Dialog */}
            {showRejectDialog && selectedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-slate-900">Reject Top-up Request</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Are you sure you want to reject this wallet top-up request?
                                </p>
                                <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Merchant:</span>
                                        <span className="font-medium text-slate-900">{selectedLog.merchant_name}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Amount:</span>
                                        <span className="font-bold text-red-600">{formatCurrency(selectedLog.amount)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">UTR:</span>
                                        <span className="font-mono text-slate-900">{selectedLog.utr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowRejectDialog(false);
                                    setSelectedLog(null);
                                }}
                                disabled={processing}
                                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={processing}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                                {processing ? 'Processing...' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
