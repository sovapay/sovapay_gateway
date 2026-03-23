import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowLeft, Copy, CheckCircle, User,
  CreditCard
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge } from '../../components/ui';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { merchantMethods } from '../../services';

function getStatusBadge(status: string) {
  const statusLower = status?.toLowerCase() || '';
  if (statusLower.includes('processed') || statusLower.includes('success') || statusLower === 'paid') {
    return <Badge variant="success" dot size="md">Processed</Badge>;
  } else if (statusLower.includes('processing') || statusLower.includes('pending')) {
    return <Badge variant="warning" dot size="md">Processing</Badge>;
  } else if (statusLower.includes('cancelled') || statusLower.includes('fail')) {
    return <Badge variant="error" dot size="md">Cancelled</Badge>;
  } else if (statusLower.includes('refunded')) {
    return <Badge variant="slate" dot size="md">Refunded</Badge>;
  }
  return <Badge variant="slate" size="md">{status}</Badge>;
}

export function OrderDetail() {
  const { id } = useParams();
  const [copied, setCopied] = useState(false);

  // Fetch order details using frappe-react-sdk
  const { data: { message: order } = {}, isLoading: loading } = useFrappeGetCall(
    merchantMethods.getOrderDetails,
    { order_id: id },
    ['order-detail', id]
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-slate-900">Order not found</h2>
          <Link to="/orders" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
            Back to orders
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/orders"
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">
                Order {order.id}
              </h1>
              {getStatusBadge(order.status)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500">
                Created {formatDateTime(order.date || order.creation)}
              </span>
              <button
                onClick={() => copyToClipboard(order.id)}
                className="p-1 hover:bg-slate-100 rounded transition-colors"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-success-500" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card>
              <h3 className="text-sm font-medium text-slate-900 mb-4">Order Details</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Order Amount</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatCurrency(order.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Transaction Amount</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatCurrency(order.transaction_amount || order.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Fee</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatCurrency(order.fee || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Tax</p>
                  <p className="text-sm font-medium text-slate-900">
                    {formatCurrency(order.tax || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Payment Method</p>
                  <p className="text-sm font-medium text-slate-900 capitalize">
                    {order.payment_method || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">UTR</p>
                  <p className="text-sm font-medium text-slate-900 font-mono">
                    {order.utr || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-sm font-medium text-slate-900">
                    {order.description || '-'}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium text-slate-900 mb-4">Order Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Order Amount</span>
                  <span className="text-slate-900">{formatCurrency(order.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fee</span>
                  <span className="text-slate-900">{formatCurrency(order.fee || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax</span>
                  <span className="text-slate-900">{formatCurrency(order.tax || 0)}</span>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-between">
                  <span className="text-base font-medium text-slate-900">Total</span>
                  <span className="text-base font-semibold text-slate-900">
                    {formatCurrency((order.amount) + (order.fee || 0) + (order.tax || 0))}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <h3 className="text-sm font-medium text-slate-900 mb-4">Customer</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {order.customer || order.customer_name || '-'}
                    </p>
                    <p className="text-xs text-slate-500">Customer</p>
                  </div>
                </div>
              </div>
            </Card>

            {order.utr && (
              <Card>
                <h3 className="text-sm font-medium text-slate-900 mb-4">Payment</h3>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Transaction
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {order.utr}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <Card>
              <h3 className="text-sm font-medium text-slate-900 mb-4">Timeline</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-success-500 mt-2" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Order created</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(order.date || order.creation)}
                    </p>
                  </div>
                </div>
                {order.modified && order.modified !== order.date && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary-500 mt-2" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{order.status}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(order.modified)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
