import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import {
    ArrowLeft, Copy, CheckCircle, XCircle, Clock,
    CreditCard, Mail, User, RotateCcw, ExternalLink
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge } from '../../components/ui';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';

function getStatusBadge(status: string) {
    const statusLower = status?.toLowerCase() || '';

    if (statusLower.includes('success') || statusLower.includes('paid')) {
        return <Badge variant="success" dot size="md">Success</Badge>;
    } else if (statusLower.includes('processing')) {
        return <Badge variant="info" dot size="md">Processing</Badge>;
    } else if (statusLower.includes('pending')) {
        return <Badge variant="warning" dot size="md">Pending</Badge>;
    } else if (statusLower.includes('fail') || statusLower.includes('cancelled')) {
        return <Badge variant="error" dot size="md">Failed</Badge>;
    } else if (statusLower.includes('refund')) {
        return <Badge variant="slate" dot size="md">Refunded</Badge>;
    }
    return <Badge variant="slate" size="md">{status}</Badge>;
}

function getStatusIcon(status: string) {
    const statusLower = status?.toLowerCase() || '';

    if (statusLower.includes('success') || statusLower.includes('paid')) {
        return <CheckCircle className="w-5 h-5 text-success-500" />;
    } else if (statusLower.includes('processing')) {
        return <Clock className="w-5 h-5 text-info-500" />;
    } else if (statusLower.includes('pending')) {
        return <Clock className="w-5 h-5 text-warning-500" />;
    } else if (statusLower.includes('fail') || statusLower.includes('cancelled')) {
        return <XCircle className="w-5 h-5 text-error-500" />;
    } else if (statusLower.includes('refund')) {
        return <RotateCcw className="w-5 h-5 text-slate-500" />;
    }
    return <Clock className="w-5 h-5 text-slate-500" />;
}

export function TransactionDetail() {
    const { id } = useParams();
    const [copied, setCopied] = useState(false);

    const { data: { message: response } = {}, isLoading: loading, error: apiError } = useFrappeGetCall(
        adminMethods.getTransactionDetails,
        { transaction_id: id },
        `admin-transaction-details-${id}`
    );

    const transaction = response?.transaction || response; // Handle both wrapper and direct responses
    const error = apiError?.message || (response && !transaction ? 'Transaction not found' : null);

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

    if (error || !transaction) {
        return (
            <DashboardLayout isAdmin>
                <div className="text-center py-12">
                    <h2 className="text-lg font-medium text-slate-900">Transaction not found</h2>
                    <p className="text-slate-500 mt-2">{error || 'Unknown error'}</p>
                    <Link to="/admin/transactions" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
                        Back to transactions
                    </Link>
                </div>
            </DashboardLayout>
        );
    }

    const timeline = [
        {
            status: 'Transaction initiated',
            timestamp: transaction.creation || transaction.created_at,
            icon: <CreditCard className="w-4 h-4" />,
        },
        {
            status: transaction.status,
            timestamp: transaction.modified || transaction.updated_at || transaction.creation,
            icon: getStatusIcon(transaction.status),
        },
    ];

    return (
        <DashboardLayout isAdmin>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link
                        to="/admin/transactions"
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </Link>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-semibold text-slate-900">
                                {formatCurrency(transaction.amount)}
                            </h1>
                            {getStatusBadge(transaction.status)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm text-slate-500 font-mono">ID: {transaction.id || transaction.name}</span>
                            <button
                                onClick={() => copyToClipboard(transaction.id || transaction.name)}
                                className="p-1 hover:bg-slate-100 rounded transition-colors"
                            >
                                {copied ? (
                                    <CheckCircle className="w-4 h-4 text-success-500" />
                                ) : (
                                    <Copy className="w-4 h-4 text-slate-400" />
                                )}
                            </button>
                            {transaction.order_id && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <span className="text-sm text-slate-500 font-mono">Order: {transaction.order_id}</span>
                                    <Link to={`/admin/orders/${transaction.order_id}`} className="p-1 hover:bg-slate-100 rounded transition-colors" title="View Order">
                                        <ExternalLink className="w-4 h-4 text-slate-400" />
                                    </Link>
                                </>
                            )}
                        </div>
                        <div className="mt-2">
                            <p className="text-sm text-slate-600">
                                Merchant: <span className="font-medium text-slate-900">{transaction.merchant_name}</span>
                                <span className="text-xs text-slate-400 ml-2">({transaction.merchant_id})</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-6">
                        <Card>
                            <h3 className="text-sm font-medium text-slate-900 mb-4">Payment Details</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Amount</p>
                                    <p className="text-sm font-medium text-slate-900">
                                        {formatCurrency(transaction.amount)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Currency</p>
                                    <p className="text-sm font-medium text-slate-900 uppercase">
                                        {transaction.currency || 'INR'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Payment Method</p>
                                    <p className="text-sm font-medium text-slate-900 capitalize">
                                        {transaction.payment_method?.replace('_', ' ') || '-'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Description</p>
                                    <p className="text-sm font-medium text-slate-900">
                                        {transaction.description || '-'}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <h3 className="text-sm font-medium text-slate-900 mb-4">Timeline</h3>
                            <div className="space-y-4">
                                {timeline.map((event, index) => (
                                    <div key={index} className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                                {event.icon}
                                            </div>
                                            {index < timeline.length - 1 && (
                                                <div className="w-px h-full bg-slate-200 my-2" />
                                            )}
                                        </div>
                                        <div className="flex-1 pb-4">
                                            <p className="text-sm font-medium text-slate-900">{event.status}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {formatDateTime(event.timestamp)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {transaction.metadata && Object.keys(transaction.metadata).length > 0 && (
                            <Card>
                                <h3 className="text-sm font-medium text-slate-900 mb-4">Metadata</h3>
                                <div className="bg-slate-50 rounded-lg p-4">
                                    <pre className="text-xs text-slate-700 font-mono overflow-auto">
                                        {JSON.stringify(transaction.metadata, null, 2)}
                                    </pre>
                                </div>
                            </Card>
                        )}
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
                                            {transaction.customer_name || '-'}
                                        </p>
                                        <p className="text-xs text-slate-500">Customer</p>
                                    </div>
                                </div>
                                {transaction.customer_email && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                            <Mail className="w-5 h-5 text-slate-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">
                                                {transaction.customer_email}
                                            </p>
                                            <p className="text-xs text-slate-500">Email</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card>
                            <h3 className="text-sm font-medium text-slate-900 mb-4">Summary</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Amount</span>
                                    <span className="text-slate-900">
                                        {formatCurrency(transaction.amount)}
                                    </span>
                                </div>
                                {transaction.fee>=0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Processing fee</span>
                                        <span className="text-slate-900">
                                            -{formatCurrency(transaction.fee)}
                                        </span>
                                    </div>
                                )}
                                {transaction.tax>=0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Tax fee</span>
                                        <span className="text-slate-900">
                                            -{formatCurrency(transaction.tax)}
                                        </span>
                                    </div>
                                )}
                                <div className="pt-3 border-t border-slate-200 flex justify-between">
                                    <span className="text-sm font-medium text-slate-900">Net</span>
                                    <span className="text-sm font-medium text-slate-900">
                                        {formatCurrency(transaction.amount - (transaction.fee || 0) - (transaction.tax || 0))}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
