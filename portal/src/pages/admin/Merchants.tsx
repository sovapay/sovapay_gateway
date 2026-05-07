import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MoreVertical, Building2, Clock, Ban, ArrowUpRight, ShieldCheck, User, Mail, Lock, Eye, EyeOff, Wallet, Pen} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge, Button, Dropdown, DropdownItem, DropdownSeparator, Modal, Input, useToast } from '../../components/ui';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { adminMethods, authMethods } from '../../services/methods';
import { useDebounce } from '../../hooks';

// ... other imports


function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'approved':
      return <Badge variant="success" dot>Approved</Badge>;
    case 'submitted':
      return <Badge variant="warning" dot>Submitted</Badge>;
    case 'draft':
      return <Badge variant="slate" dot>Draft</Badge>;
    case 'rejected':
      return <Badge variant="error" dot>Rejected</Badge>;
    case 'suspended':
      return <Badge variant="error" dot>Suspended</Badge>;
    case 'terminated':
      return <Badge variant="error" dot>Terminated</Badge>;
    default:
      return <Badge variant="slate">{status}</Badge>;
  }
}


export function Merchants() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  // Initialize status filter from localStorage
  const [statusFilter, setStatusFilter] = useState(localStorage.getItem('admin-merchants-status') || 'all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Add New Merchant Dialog State
  const [showAddMerchantDialog, setShowAddMerchantDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const { success, error: errorToast } = useToast();

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Fetch merchants with real API
  const { data: { message: merchantsData } = {}, isLoading: loading, mutate: refetch } = useFrappeGetCall(
    adminMethods.getMerchants,
    {
      page,
      page_size: pageSize,
      search_text: debouncedSearch || undefined,
      filter_data: statusFilter !== 'all' ? { status: statusFilter } : undefined
    },
    `admin-merchants-list-${page}-${debouncedSearch}-${statusFilter}`
  );

  // Fetch integrations list
  const { data: { message: integrationsRes } = {} } = useFrappeGetCall(
    adminMethods.getIntegrations,
    undefined,
    'admin-integrations'
  );

  const { call: signup } = useFrappePostCall(authMethods.signup);
  const { call: updateMerchant } = useFrappePostCall(adminMethods.updateMerchant);

  // Termination State
  const [terminationTarget, setTerminationTarget] = useState<string | null>(null);
  const [terminationLoading, setTerminationLoading] = useState(false);
  // Update Balance State
  const [balanceTarget, setBalanceTarget] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceAction, setBalanceAction] = useState<'Credit' | 'Debit'>('Credit');
  const { call: updateWalletBalance } = useFrappePostCall(adminMethods.updateWalletBalance);

  const confirmUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceTarget || !balanceAmount) return;

    try {
      setBalanceLoading(true);
      const res = await updateWalletBalance({
        merchant_id: balanceTarget,
        amount: parseFloat(balanceAmount),
        action: balanceAction
      });

      if (res?.message?.success) {
        success('Success', res.message.message);
        setBalanceTarget(null);
        setBalanceAmount('');
        refetch();
      } else {
        errorToast('Error', res?.message?.error || 'Failed to update balance');
      }
    } catch (error: any) {
      errorToast('Error', error.message || 'Failed to update balance');
    } finally {
      setBalanceLoading(false);
    }
  };

  // Handle Add New Merchant
  const handleAddMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (!formData.companyName) {
      setFormError('Company name is required');
      return;
    }

    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    try {
      setFormLoading(true);

      const response = await signup({
        email: formData.email,
        password: formData.password,
        full_name: formData.name, // Note: backend expects snake_case most likely, matching authService.signup param mapping if it was raw, but authService used camelCase mapped to snake_case. Let's assume standard backend params.
        company_name: formData.companyName,
      });

      if (response?.message?.error) { // Check for explicit error in message if your backend format does that, otherwise try/catch handles it.
        throw new Error(response.message.error);
      }

      // Reset form and close dialog
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        companyName: '',
      });
      setShowAddMerchantDialog(false);

      // Refresh merchants list
      refetch();

      // Show success message
      success('Success', 'Merchant created successfully!');
    } catch (error: any) {
      // Frappe call error might be in error.message or response body
      const errorMsg = error.message || (error.messages && error.messages[0]) || 'Failed to create merchant. Please try again.';
      setFormError(errorMsg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleTerminate = (merchantName: string) => {
    setTerminationTarget(merchantName);
  };

  const confirmTerminate = async () => {
    if (!terminationTarget) return;

    try {
      setTerminationLoading(true);
      const response = await updateMerchant({
        merchant: terminationTarget,
        status: 'Terminated'
      });

      if (response.message?.success) {
        success('Success', 'Merchant account terminated successfully');
        setTerminationTarget(null);
        refetch();
      } else {
        errorToast('Error', 'Failed to terminate account');
      }
    } catch (error: any) {
      errorToast('Error', error.message || 'Failed to terminate account');
    } finally {
      setTerminationLoading(false);
    }
  };

  const merchants = merchantsData?.merchants || [];
  const totalCount = merchantsData?.total_count || 0;

  // Calculate status counts
  const apiCounts = merchantsData?.status_counts || {};
  const statusCounts = {
    all: apiCounts.All || 0,
    approved: apiCounts.Approved || 0,
    submitted: apiCounts.Submitted || 0,
    draft: apiCounts.Draft || 0,
    rejected: apiCounts.Rejected || 0,
    suspended: apiCounts.Suspended || 0,
    terminated: apiCounts.Terminated || 0,
  };

  return (
    <DashboardLayout isAdmin>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Merchants</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage all merchant accounts and track their performance
            </p>
          </div>
          <Button onClick={() => setShowAddMerchantDialog(true)}>
            <Building2 className="w-4 h-4 mr-2" />
            Add New Merchant
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {(['all', 'approved', 'submitted', 'draft', 'rejected', 'suspended', 'terminated'] as const).map((status) => (
            <button
              key={status}
              onClick={() => {
                localStorage.setItem('admin-merchants-status', status);
                setStatusFilter(status);
                setPage(1);
              }}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap
                ${statusFilter === status
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }
              `}
            >
              <span>{status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusFilter === status ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {statusCounts[status]}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar and Filters Button */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, ID, or email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
            />
          </div>
          <button
            onClick={() => {
              document.getElementById('merchants-filters')?.classList.toggle('max-h-0');
              document.getElementById('merchants-filters')?.classList.toggle('max-h-96');
              document.getElementById('merchants-filters')?.classList.toggle('opacity-0');
              document.getElementById('merchants-filters')?.classList.toggle('opacity-100');
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
          id="merchants-filters"
          className="overflow-hidden transition-all duration-300 ease-in-out max-h-0 opacity-0"
        >
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-500">
              Additional filters coming soon...
            </div>
          </div>
        </div>

        <Card padding="none">
          {loading ? (
            <div className="p-12 text-center">
              <p className="text-sm text-slate-500">Loading merchants...</p>
            </div>
          ) : merchants.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-sm text-slate-500">No merchants found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Merchant
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Payin Processor
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Payout Processor
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-2 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {merchants.map((merchant: any) => (
                      <tr
                        key={merchant.name}
                        className="hover:bg-slate-50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => navigate(`/admin/merchants/${merchant.name}`)}
                          >
                            <div className="relative">
                              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center border border-primary-200 group-hover:scale-110 transition-transform overflow-hidden">
                                {merchant.company_logo ? (
                                  <img
                                    src={merchant.company_logo}
                                    alt={merchant.company_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Building2 className="w-5 h-5 text-primary-600" />
                                )}
                              </div>
                              {merchant.status === 'Approved' && (
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white p-0.5 shadow-sm">
                                  <ShieldCheck className="w-3 h-3 text-success-500" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 leading-tight">{merchant.company_name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{merchant.company_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(merchant.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {formatCurrency(merchant.wallet_balance || 0)}
                            </p>
                            <p className="text-[10px] text-slate-400">Wallet balance</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700">
                            {merchant.payin_processor
                              ? (integrationsRes?.processors?.find((p: any) => p.name === merchant.payin_processor)?.integration_name || merchant.payin_processor)
                              : 'None'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700">
                            {merchant.integration
                              ? (integrationsRes?.processors?.find((p: any) => p.name === merchant.integration)?.integration_name || merchant.integration)
                              : 'None'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700">{formatRelativeTime(merchant.creation)}</span>
                        </td>
                        <td className="px-2 py-4 text-right">
                          <Dropdown
                            trigger={
                              <button className="p-2 hover:bg-slate-200 rounded-lg transition-colors border border-transparent hover:border-slate-300">
                                <MoreVertical className="w-4 h-4 text-slate-500" />
                              </button>
                            }
                          >
                            <DropdownItem onClick={() => navigate(`/admin/merchants/${merchant.name}`)} icon={<ArrowUpRight className="w-4 h-4" />}>
                              View details
                            </DropdownItem>
                            <DropdownItem
                              icon={<Clock className="w-4 h-4" />}
                              onClick={() => navigate(`/admin/merchants/${merchant.name}?tab=transactions`)}
                            >
                              Transactions
                            </DropdownItem>
                            <DropdownItem
                              icon = {<Pen className="w-4 h-4"/>}
                              onClick={() => navigate(`/admin/merchants/${merchant.name}?tab=configuration`)}
                            >
                              Edit configuration
                            </DropdownItem>
                            <DropdownItem
                              icon={<Wallet className="w-4 h-4" />}
                              onClick={() => setBalanceTarget(merchant.name)}
                            >
                              Update balance
                            </DropdownItem>
                            <DropdownSeparator />
                            {merchant.status !== 'Terminated' && (
                              <DropdownItem
                                danger
                                icon={<Ban className="w-4 h-4" />}
                                onClick={() => handleTerminate(merchant.name)}
                              >
                                Terminate account
                              </DropdownItem>
                            )}
                          </Dropdown>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
                <p className="text-sm text-slate-500 font-medium">
                  Showing {merchants.length} of {totalCount} merchants
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

      <Modal
        isOpen={terminationTarget !== null}
        onClose={() => !terminationLoading && setTerminationTarget(null)}
        title="Confirm Termination"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            Are you sure you want to terminate this merchant account? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="secondary"
              onClick={() => setTerminationTarget(null)}
              disabled={terminationLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmTerminate}
              loading={terminationLoading}
            >
              Terminate Account
            </Button>
          </div>
        </div>
      </Modal>
      {/* Update Balance Modal */}
      <Modal
        isOpen={balanceTarget !== null}
        onClose={() => !balanceLoading && setBalanceTarget(null)}
        title="Update Wallet Balance"
      >
        <form onSubmit={confirmUpdateBalance} className="space-y-4">
          <div className="flex gap-4 mb-4">
            <button
              type="button"
              onClick={() => setBalanceAction('Credit')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${balanceAction === 'Credit'
                  ? 'bg-success-50 text-success-700 border-success-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
            >
              Credit
            </button>
            <button
              type="button"
              onClick={() => setBalanceAction('Debit')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${balanceAction === 'Debit'
                  ? 'bg-error-50 text-error-700 border-error-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
            >
              Debit
            </button>
          </div>

          <Input
            label="Amount (₹)"
            type="number"
            min="1"
            step="0.01"
            placeholder="0.00"
            value={balanceAmount}
            onChange={(e) => setBalanceAmount(e.target.value)}
            required
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBalanceTarget(null)}
              disabled={balanceLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={balanceAction === 'Credit' ? 'success' : 'danger'}
              loading={balanceLoading}
            >
              {balanceAction} Wallet
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add New Merchant Dialog */}
      <Modal
        isOpen={showAddMerchantDialog}
        onClose={() => !formLoading && setShowAddMerchantDialog(false)}
        title="Add New Merchant"
      >
        <form onSubmit={handleAddMerchant} className="space-y-4">
          {formError && (
            <div className="p-3 text-sm text-error-700 bg-error-50 rounded-lg">
              {formError}
            </div>
          )}

          <Input
            label="Full name"
            type="text"
            placeholder="John Smith"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            leftIcon={<User className="w-4 h-4" />}
            required
          />

          <Input
            label="Company name"
            type="text"
            placeholder="Acme Inc."
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            leftIcon={<Building2 className="w-4 h-4" />}
            required
          />

          <Input
            label="Work email"
            type="email"
            placeholder="you@company.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            hint="Must be at least 8 characters"
            required
          />

          <Input
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm your password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            leftIcon={<Lock className="w-4 h-4" />}
            required
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddMerchantDialog(false)}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={formLoading}
            >
              Create Merchant
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout >
  );
}
