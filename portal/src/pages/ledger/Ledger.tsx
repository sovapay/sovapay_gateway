import { useState } from 'react';
import { Download, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge, Button } from '../../components/ui';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { merchantMethods } from '../../services';
import { useExportData } from '../../hooks';

const isCredit = (type: string) => {
  const t = type?.toLowerCase() || '';
  return t.includes('payment') || t.includes('credit') || t.includes('topup');
};

const isDebit = (type: string) => {
  const t = type?.toLowerCase() || '';
  return t.includes('refund') || t.includes('fee') || t.includes('settlement') || t.includes('debit') || t.includes('payout');
};

function getTypeBadge(type: string) {
  if (isCredit(type)) {
    return <Badge variant="success">Credit</Badge>;
  } else if (isDebit(type)) {
    return <Badge variant="error">Debit</Badge>;
  }
  return <Badge variant="slate">{type}</Badge>;
}

function getTypeIcon(type: string) {
  if (isCredit(type)) {
    return <ArrowUpRight className="w-4 h-4 text-success-500" />;
  } else if (isDebit(type)) {
    return <ArrowDownRight className="w-4 h-4 text-error-500" />;
  }
  return <Minus className="w-4 h-4 text-slate-400" />;
}

export function Ledger() {
  // Initialize type filter from localStorage
  const [typeFilter, setTypeFilter] = useState(localStorage.getItem('merchant-ledger-type') || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  // const [exporting, setExporting] = useState(false); // replaced in hook usage
  const { exportData, loading: exporting } = useExportData(merchantMethods.exportLedger);
  const pageSize = 20;

  // Build filter data
  const filterData = typeFilter !== 'all' ? { type: typeFilter } : undefined;

  // Fetch ledger statistics from backend
  const { data: { message: stats } = {} } = useFrappeGetCall(
    merchantMethods.getLedgerStats,
    undefined,
    'ledger-stats'
  );

  // Fetch ledger entries
  const { data: { message: ledgerData } = {}, isLoading: loading } = useFrappeGetCall(
    merchantMethods.getLedgerEntries,
    {
      page: currentPage,
      page_size: pageSize,
      filter_data: filterData
    },
    ['ledger', currentPage, typeFilter]
  );

  const entries = ledgerData?.entries || [];
  const total = ledgerData?.total || 0;

  // Handle export
  const handleExport = async () => {
    await exportData(filterData);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Ledger</h1>
            <p className="text-sm text-slate-500 mt-1">
              Track all financial movements in your account
            </p>
          </div>
          <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <p className="text-sm text-slate-500">Total Credits</p>
            <p className="text-2xl font-semibold text-success-600 mt-1">
              +{formatCurrency(stats?.total_credits || 0)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Total Debits</p>
            <p className="text-2xl font-semibold text-error-600 mt-1">
              -{formatCurrency(stats?.total_debits || 0)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Current Balance</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(stats?.current_balance || 0)}
            </p>
          </Card>
        </div>

        <div className="flex gap-2">
          {(['All', 'Credit', 'Debit'] as const).map((type) => (
            <button
              key={type}
              onClick={() => {
                const newType = type === 'All' ? 'all' : type;
                localStorage.setItem('merchant-ledger-type', newType);
                setTypeFilter(newType);
              }}
              className={`
                px-4 py-2 text-sm font-medium rounded-lg transition-colors
                ${(typeFilter === 'all' && type === 'All') || typeFilter === type
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }
              `}
            >
              {type}
            </button>
          ))}
        </div>

        <Card padding="none">
          {loading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="text-sm text-slate-500 mt-4">Loading ledger...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Credit
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Debit
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {entries.map((entry: any) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-500">
                            {formatDateTime(entry.date)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(entry.type)}
                            <span className="text-sm text-slate-900">
                              {entry.order_id || entry.type || 'Transaction'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {getTypeBadge(entry.type)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isCredit(entry.type) ? (
                            <span className="text-sm font-medium text-success-600">
                              +{formatCurrency(entry.transaction_amount)}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isDebit(entry.type) ? (
                            <span className="text-sm font-medium text-error-600">
                              -{formatCurrency(entry.transaction_amount)}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-medium text-slate-900">
                            {formatCurrency(entry.closing_balance)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {entries.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-500">No ledger entries found</p>
                </div>
              )}

              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {entries.length} of {total} entries
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
                    disabled={entries.length < pageSize}
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
    </DashboardLayout>
  );
}
