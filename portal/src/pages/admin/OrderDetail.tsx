import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
    ArrowLeft, Copy, CheckCircle, User,
    CreditCard
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge } from '../../components/ui';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';

function getStatusBadge(status: string) {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('processed') || statusLower.includes('success') || statusLower === 'paid') {
        return <Badge variant="success" dot size="md">Processed</Badge>;
    } else if (statusLower.includes('processing')) {
        return <Badge variant="info" dot size="md">Processing</Badge>;
    } else if (statusLower.includes('pending')) {
        return <Badge variant="warning" dot size="md">Pending</Badge>;
    } else if (statusLower.includes('cancelled') || statusLower.includes('fail')) {
        return <Badge variant="error" dot size="md">Cancelled</Badge>;
    } else if (statusLower.includes('refunded')) {
        return <Badge variant="slate" dot size="md">Refunded</Badge>;
    }
    return <Badge variant="slate" size="md">{status}</Badge>;
}

export function AdminOrderDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [copied, setCopied] = useState(false);

    const { data: { message: response } = {}, isLoading: loading, error: apiError } = useFrappeGetCall(
        adminMethods.getOrderDetails,
        { order_id: id },
        `admin-order-details-${id}`
    );

    // Provide safe defaults for potentially undefined `response`
    const order = response?.order || response;
    const error = apiError?.message || (response && !order ? 'Order not found' : null);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <DashboardLayout isAdmin>
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !order) {
        return (
            <DashboardLayout isAdmin>
                <div className="text-center py-12">
                    <h2 className="text-lg font-medium text-slate-900">Order not found</h2>
                    <p className="text-slate-500 mt-2">{error || 'Unknown error'}</p>
                    <button onClick={() => navigate(-1)} className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
                        Back
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout isAdmin>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
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
                                    <p className="text-xs text-slate-500 mb-1">Merchant</p>
                                    <p className="text-sm font-medium text-slate-900">
                                        {order.merchant_name || 'Unknown'}
                                    </p>
                                </div>
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
                                    <span className="text-base font-medium text-slate-900">
                                        Total
                                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                                            {order.order_type === 'Topup' ? '(amount − fee − tax)' : '(amount + fee + tax)'}
                                        </span>
                                    </span>
                                    <span className="text-base font-semibold text-slate-900">
                                        {order.order_type === 'Topup'
                                            ? formatCurrency((order.amount || 0) - (order.fee || 0) - (order.tax || 0))
                                            : formatCurrency((order.amount || 0) + (order.fee || 0) + (order.tax || 0))
                                        }
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
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-slate-500">Account Number</span>
                                        <span className="text-sm font-mono font-medium text-slate-900">{order.account_number || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-slate-500">IFSC Code</span>
                                        <span className="text-sm font-mono font-medium text-slate-900 uppercase">{order.ifsc_code || '-'}</span>
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
                                            <p className="text-sm font-medium text-slate-900">Last updated</p>
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
