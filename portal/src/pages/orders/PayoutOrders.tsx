import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Plus } from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge, Button } from '../../components/ui';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { merchantMethods } from '../../services';
import { CreateOrderModal, ImportOrdersModal } from '../../components/orders';
import { useExportData } from '../../hooks';

function getStatusBadge(status: string) {
  const statusLower = status?.toLowerCase() || '';

  if (statusLower.includes('processed') || statusLower.includes('success') || statusLower === 'paid') {
    return <Badge variant="success" dot>Processed</Badge>;
  } else if (statusLower.includes('processing') || statusLower.includes('pending')) {
    return <Badge variant="warning" dot>Processing</Badge>;
  } else if (statusLower.includes('cancelled') || statusLower.includes('fail') || statusLower.includes('reversed')) {
    return <Badge variant="error" dot>Cancelled</Badge>;
  } else if (statusLower.includes('refunded')) {
    return <Badge variant="slate" dot>Refunded</Badge>;
  }
  return <Badge variant="slate">{status}</Badge>;
}

export function PayoutOrders() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Initialize status filter from localStorage
  const [statusFilter, setStatusFilter] = useState(localStorage.getItem('merchant-payout-orders-status') || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  // const [exporting, setExporting] = useState(false); // Replaced by hook
  const { exportData, loading: exporting } = useExportData(merchantMethods.exportOrders);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const pageSize = 20;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Build filter data
  const filterData = {
    order_type: 'Pay',
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch })
  };

  // Fetch orders with filters using frappe-react-sdk
  const { data: { message: ordersData } = {}, isLoading: loading, mutate: refetch } = useFrappeGetCall(
    merchantMethods.getOrders,
    {
      page: currentPage,
      page_size: pageSize,
      sort_by: 'creation',
      sort_order: 'desc',
      filter_data: Object.keys(filterData).length > 0 ? filterData : undefined
    },
    ['payout-orders', currentPage, pageSize, statusFilter, debouncedSearch]
  );

  const orders = ordersData?.orders || [];
  const total = ordersData?.total || 0;

  // Handle export
  const handleExport = async () => {
    await exportData(filterData);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Payout Orders</h1>
            <p className="text-sm text-slate-500 mt-1">
              View and manage customer orders
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            {/* <Button variant="secondary" onClick={() => setShowImportModal(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button> */}
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Order
            </Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {(['all', 'Processed', 'Pending', 'Cancelled', 'Refunded'] as const).map((status) => (
            <button
              key={status}
              onClick={() => {
                localStorage.setItem('merchant-payout-orders-status', status);
                setStatusFilter(status);
              }}
              className={`
                px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap
                ${statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }
              `}
            >
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>

        <Card padding="none">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="text-sm text-slate-500 mt-4">Loading orders...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        UTR
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Fee
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Tax
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {orders.map((order: any) => (
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/orders/payout/${order.id}`)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900 font-mono">
                            {order.id}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-900">{order.customer || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-900">{order.utr || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-500">
                            {formatDateTime(order.date)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm text-slate-600">{formatCurrency(order.fee || 0)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm text-slate-600">{formatCurrency(order.tax || 0)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-slate-900">
                            {formatCurrency(order.amount)}
                          </span>
                          {order.transaction_amount && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Txn: {formatCurrency(order.transaction_amount)}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {orders.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500">No orders found</p>
                </div>
              )}

              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {orders.length} of {total} orders
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={orders.length < pageSize}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <CreateOrderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => refetch()}
      />

      <ImportOrdersModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => refetch()}
      />
    </DashboardLayout>
  );
}
