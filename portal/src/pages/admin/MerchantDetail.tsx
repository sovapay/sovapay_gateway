import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  ArrowLeft, Building2, Globe, Mail,
  CheckCircle, Ban, FileText, CreditCard,
  Activity, MoreVertical, Settings, ArrowRightLeft, X, Send
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { Card, Badge, Button, Modal, Tabs, TabsList, TabsTrigger, TabsContent, Dropdown, DropdownItem, DropdownSeparator, useToast, Select, Input } from '../../components/ui';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/formatters';

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="success" dot size="md">Active</Badge>;
    case 'under_review':
      return <Badge variant="warning" dot size="md">Under Review</Badge>;
    case 'submitted':
      return <Badge variant="warning" dot size="md">Submitted</Badge>;
    case 'pending':
      return <Badge variant="slate" dot size="md">Pending</Badge>;
    case 'suspended':
      return <Badge variant="error" dot size="md">Suspended</Badge>;
    case 'approved':
      return <Badge variant="success" dot size="md">Approved</Badge>;
    case 'rejected':
      return <Badge variant="error" dot size="md">Rejected</Badge>;
    case 'terminated':
      return <Badge variant="error" dot size="md">Terminated</Badge>;
    default:
      return <Badge variant="slate" size="md">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  }
}

import { useFrappeGetCall, useFrappePostCall, useFrappeUpdateDoc } from 'frappe-react-sdk';
import { adminMethods } from '../../services/methods';
import { useAdminKYC, useAdminServices, useAdminMerchant } from '../../hooks';



export function MerchantDetail() {
  const { id } = useParams();
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [suspensionNotes, setSuspensionNotes] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationSubject, setNotificationSubject] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');

  // Edit Merchant Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    company_name: '',
    company_email: '',
    website: '',
    business_type: '',
  });
  const [updatingMerchant, setUpdatingMerchant] = useState(false);

  // State for editable pricing
  const [editablePricing, setEditablePricing] = useState<any[]>([]);
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);

  // KYC Modal States
  const [showKYCRejectModal, setShowKYCRejectModal] = useState(false);
  const [kycRejectionRemark, setKycRejectionRemark] = useState('');
  const [kycDocumentsToReupload, setKycDocumentsToReupload] = useState<string[]>([]);
  const [showKYCApproveModal, setShowKYCApproveModal] = useState(false);

  // Processor Change States
  const [showProcessorDropdown, setShowProcessorDropdown] = useState(false);
  const [updatingProcessor, setUpdatingProcessor] = useState(false);
  const [updatingPayinProcessor, setUpdatingPayinProcessor] = useState(false);

  const { success, error: showError } = useToast();

  // Use SDK hooks
  const { approveKYC, rejectKYC, approving, rejecting } = useAdminKYC();
  const processingKYC = approving || rejecting;
  const { services: products } = useAdminServices();
  const {
    suspendMerchant,
    reactivateMerchant,
    sendMerchantNotification,
    adjustFunds,
    suspending,
    reactivating,
    sendingNotification,
    adjustingFunds
  } = useAdminMerchant();

  // Fund Adjustment State
  const [showAdjustFundsModal, setShowAdjustFundsModal] = useState(false);
  const [adjustFundsType, setAdjustFundsType] = useState<'Hold' | 'Release'>('Hold');
  const [adjustFundsAmount, setAdjustFundsAmount] = useState('');
  const [adjustFundsRemark, setAdjustFundsRemark] = useState('');

  const handleAdjustFunds = async () => {
    if (!adjustFundsAmount || parseFloat(adjustFundsAmount) <= 0) {
      showError('Invalid Amount', 'Please enter a valid amount');
      return;
    }
    try {
      await adjustFunds(id || '', adjustFundsType, parseFloat(adjustFundsAmount), adjustFundsRemark);
      setShowAdjustFundsModal(false);
      setAdjustFundsAmount('');
      setAdjustFundsRemark('');
      merchantDetailsRefetch();
    } catch (e) {
      // Error handled in hook
    }
  };

  // Define available documents for re-upload
  const kycDocumentTypes = [
    { id: 'director_pan', label: 'Director PAN' },
    { id: 'director_adhar', label: 'Director Aadhaar' },
    { id: 'company_pan', label: 'Company PAN' },
    { id: 'company_gst', label: 'Company GST' }
  ];

  // Fetch merchant details, transactions, and activity logs using SDK hooks
  const {
    data: { message: merchantDetailsRes } = {},
    isLoading: loadingDetails,
    error: detailsError,
    mutate: merchantDetailsRefetch
  } = useFrappeGetCall(
    adminMethods.getMerchantDetails,
    { merchant_name: id },
    `admin-merchant-details-${id}`
  );

  const { data: { message: logsRes } = {} } = useFrappeGetCall(
    adminMethods.getMerchantActivityLogs,
    { merchant_id: id },
    `admin-merchant-logs-${id}`
  );

  // Fetch integrations list
  const { data: { message: integrationsRes } = {} } = useFrappeGetCall(
    adminMethods.getIntegrations,
    undefined,
    'admin-integrations'
  );

  // ACTIONS
  const { updateDoc } = useFrappeUpdateDoc();
  const { call: updateBankAccountStatus } = useFrappePostCall(adminMethods.updateBankAccountStatus);
  const { call: updateMerchantCall } = useFrappePostCall(adminMethods.updateMerchant);


  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || localStorage.getItem('merchant-detail-tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Handle tab change with localStorage persistence
  const handleTabChange = (value: string) => {
    localStorage.setItem('merchant-detail-tab', value);
    setActiveTab(value);
  };

  // Derived state
  const merchantData = merchantDetailsRes?.merchant;
  const activityLogs = logsRes?.logs || [];

  const loading = loadingDetails;
  const error = detailsError ? (detailsError.message || 'Failed to load merchant details') : (merchantDetailsRes && !merchantDetailsRes.success ? merchantDetailsRes.error : null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);



  // Handle KYC Approval
  const handleApproveKYC = () => {
    setShowKYCApproveModal(true);
  };


  const processApproveKYC = async () => {
    try {
      await approveKYC(id || '');
      setShowKYCApproveModal(false);
      merchantDetailsRefetch();
    } catch (err: any) {
      // Error already shown by hook
    }
  };

  // Handle KYC Rejection
  const handleRejectKYC = async () => {
    if (!kycRejectionRemark.trim()) {
      showError('Required', 'Please provide a reason for rejection');
      return;
    }

    try {
      await rejectKYC(id || '', kycRejectionRemark, kycDocumentsToReupload);
      setShowKYCRejectModal(false);
      setKycRejectionRemark('');
      setKycDocumentsToReupload([]);
      merchantDetailsRefetch();
    } catch (err: any) {
      // Error already shown by hook
    }
  };

  // Handle Account Suspension
  const handleSuspendAccount = async () => {
    if (!suspensionReason) {
      showError('Required', 'Please select a reason for suspension');
      return;
    }

    try {
      const reason = `${suspensionReason}${suspensionNotes ? ': ' + suspensionNotes : ''}`;
      await suspendMerchant(id || '', reason);
      setShowSuspendModal(false);
      setSuspensionReason('');
      setSuspensionNotes('');
      merchantDetailsRefetch();
    } catch (err: any) {
      // Error already shown by hook
    }
  };

  // Handle Account Reactivation
  const handleReactivateAccount = () => {
    setShowReactivateModal(true);
  };

  const processReactivateAccount = async () => {
    try {
      await reactivateMerchant(id || '');
      setShowReactivateModal(false);
      merchantDetailsRefetch();
    } catch (err: any) {
      // Error already shown by hook
    }
  }


  // Handle Send Notification
  const handleSendNotification = async () => {
    if (!notificationSubject.trim() || !notificationMessage.trim()) {
      showError('Required', 'Please enter subject and message');
      return;
    }

    try {
      await sendMerchantNotification(id || '', notificationSubject, notificationMessage);
      setShowNotificationModal(false);
      setNotificationSubject('');
      setNotificationMessage('');
    } catch (err: any) {
      // Error already shown by hook
    }
  };

  // Handle Update Merchant
  const handleUpdateMerchant = async () => {
    if (!editFormData.company_name.trim()) {
      showError('Required', 'Company name is required');
      return;
    }

    if (!editFormData.company_email.trim()) {
      showError('Required', 'Company email is required');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editFormData.company_email)) {
      showError('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // URL validation if website is provided
    if (editFormData.website && editFormData.website.trim()) {
      try {
        new URL(editFormData.website);
      } catch {
        showError('Invalid URL', 'Please enter a valid website URL');
        return;
      }
    }

    setUpdatingMerchant(true);
    try {
      await updateDoc('Merchant', id || '', {
        company_name: editFormData.company_name,
        company_email: editFormData.company_email,
        website: editFormData.website,
        business_type: editFormData.business_type,
      });

      success('Success', 'Merchant updated successfully!');
      setShowEditModal(false);
      merchantDetailsRefetch();
    } catch (err: any) {
      console.error('Error updating merchant:', err);
      const errorMsg = err.message || (err.messages && err.messages[0]) || 'Failed to update merchant';
      showError('Error', errorMsg);
    } finally {
      setUpdatingMerchant(false);
    }
  };

  // Handle Payout Processor Change
  const handleProcessorChange = async (processorName: string) => {
    setUpdatingProcessor(true);
    try {
      await updateMerchantCall({
        merchant: id || '',
        status: merchantData.status || 'Active',
        integration: processorName
      });

      success('Success', `Payout processor ${merchantData.integration ? 'changed' : 'set'} to ${processorName || 'default'}`);
      setShowProcessorDropdown(false);
      merchantDetailsRefetch();
    } catch (err: any) {
      console.error('Error updating payout processor:', err);
      const errorMsg = err?.message || 'Failed to update processor';
      showError('Error', errorMsg);
    } finally {
      setUpdatingProcessor(false);
    }
  };

  // Handle Payin Processor Change
  const handlePayinProcessorChange = async (processorName: string) => {
    setUpdatingPayinProcessor(true);
    try {
      await updateMerchantCall({
        merchant: id || '',
        status: merchantData.status || 'Active',
        payin_processor: processorName
      });

      success('Success', `Payin processor ${merchantData.payin_processor ? 'changed' : 'set'} to ${processorName || 'default'}`);
      merchantDetailsRefetch();
    } catch (err: any) {
      console.error('Error updating payin processor:', err);
      const errorMsg = err?.message || 'Failed to update payin processor';
      showError('Error', errorMsg);
    } finally {
      setUpdatingPayinProcessor(false);
    }
  };

  // ... (renders)



  if (loading) {
    return (
      <DashboardLayout isAdmin>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !merchantData) {
    return (
      <DashboardLayout isAdmin>
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-slate-900">Merchant not found</h2>
          <p className="text-slate-500 mt-2">{error}</p>
          <Link to="/admin/merchants" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
            Back to merchants
          </Link>
        </div>
      </DashboardLayout>
    );
  }


  // Use the fetched data
  const merchant = {
    id: merchantData.name,
    businessName: merchantData.company_name,
    industry: merchantData.business_type || 'Technology',
    status: merchantData.status ? merchantData.status.toLowerCase() : 'draft',
    totalVolume: 0,
    balance: merchantData.wallet_balance || 0,
    // payinBalance: merchantData.payin_balance || 0,
    lienBalance: merchantData.lien_balance || 0,
    website: merchantData.website || '',
    businessType: merchantData.business_type || 'Unspecified',
    email: merchantData.company_email,
    createdAt: merchantData.creation,
    kycStatus: merchantData.kyc_status ? merchantData.kyc_status.toLowerCase().trim() : 'pending',
    logo: merchantData.company_logo,
  };

  return (
    <DashboardLayout isAdmin>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          <Link
            to="/admin/merchants"
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center overflow-hidden border border-primary-200">
                {merchant.logo ? (
                  <img
                    src={merchant.logo}
                    alt={merchant.businessName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-primary-600" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-slate-900">{merchant.businessName}</h1>
                  {getStatusBadge(merchant.status)}
                </div>
                <p className="text-sm text-slate-500">{merchant.industry} | {merchant.id}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dropdown
              trigger={
                <Button
                  variant="secondary"
                  disabled={updatingPayinProcessor}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  {merchantData?.payin_processor ? 'Change Payin Processor' : 'Set Payin Processor'}
                </Button>
              }
            >
              {integrationsRes?.processors?.map((processor: any) => {
                const isCurrent = merchantData?.payin_processor === processor.name ||
                  (!merchantData?.payin_processor && processor.default === 1);
                return (
                  <DropdownItem
                    key={processor.name}
                    onClick={() => handlePayinProcessorChange(processor.default === 1 ? '' : processor.name)}
                    disabled={updatingPayinProcessor || isCurrent}
                  >
                    {processor.integration_name}
                    {isCurrent && ' (Current)'}
                  </DropdownItem>
                );
              })}
              {(!integrationsRes?.processors || integrationsRes.processors.length === 0) && (
                <DropdownItem disabled>
                  No processors available
                </DropdownItem>
              )}
            </Dropdown>
            <Dropdown
              trigger={
                <Button
                  variant="secondary"
                  disabled={updatingProcessor}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  {merchantData?.integration ? 'Change Payout Processor' : 'Set Payout Processor'}
                </Button>
              }
            >
              {integrationsRes?.processors?.map((processor: any) => {
                const isCurrent = (merchantData?.integration === processor.name) ||
                  (!merchantData?.integration && processor.default === 1);

                return (
                  <DropdownItem
                    key={processor.name}
                    onClick={() => handleProcessorChange(processor.default === 1 ? '' : processor.name)}
                    disabled={updatingProcessor || isCurrent}
                  >
                    {processor.integration_name}
                    {isCurrent && ' (Current)'}
                  </DropdownItem>
                );
              })}
              {(!integrationsRes?.processors || integrationsRes.processors.length === 0) && (
                <DropdownItem disabled>
                  No processors available
                </DropdownItem>
              )}
            </Dropdown>
            <Dropdown
              trigger={
                <Button variant="secondary">
                  Actions
                  <MoreVertical className="w-4 h-4" />
                </Button>
              }
            >
              <DropdownItem onClick={() => setShowNoteModal(true)}>
                Add Note
              </DropdownItem>
              <DropdownItem icon={<Send className="w-4 h-4" />} onClick={() => setShowNotificationModal(true)}>
                Send Notification
              </DropdownItem>
              <DropdownItem onClick={() => {
                setEditFormData({
                  company_name: merchantData.company_name || '',
                  company_email: merchantData.company_email || '',
                  website: merchantData.website || '',
                  business_type: merchantData.business_type || '',
                });
                setShowEditModal(true);
              }}>Edit Merchant</DropdownItem>

              <DropdownSeparator />
              {merchant.status === 'approved' ? (
                <DropdownItem danger icon={<Ban className="w-4 h-4" />} onClick={() => setShowSuspendModal(true)}>
                  Suspend Account
                </DropdownItem>
              ) : merchant.status === 'suspended' ? (
                <DropdownItem icon={<CheckCircle className="w-4 h-4" />} onClick={handleReactivateAccount}>
                  Reactivate Account
                </DropdownItem>
              ) : null}
            </Dropdown>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <p className="text-sm text-slate-500">Total Volume</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {formatCurrency(merchant.totalVolume)}
            </p>
          </Card>
          <Card>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500">Payout Balance</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">
                  {formatCurrency(merchant.balance)}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => {
                setAdjustFundsType('Hold');
                setAdjustFundsAmount('');
                setShowAdjustFundsModal(true);
              }}>
                Adjust
              </Button>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                <p className="text-xs font-medium text-slate-500">Lien Balance</p>
              </div>
              <p className="text-sm font-bold text-amber-600">{formatCurrency(merchant.lienBalance)}</p>
            </div>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Payin Processor</p>
            <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
              {merchantData?.payin_processor
                ? (integrationsRes?.processors?.find((p: any) => p.name === merchantData.payin_processor)?.integration_name || merchantData.payin_processor)
                : 'Default'}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Payout Processor</p>
            <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
              {merchantData?.integration
                ? (integrationsRes?.processors?.find((p: any) => p.name === merchantData.integration)?.integration_name || merchantData.integration)
                : 'Default'}
            </p>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <h3 className="text-sm font-medium text-slate-900 mb-4">Business Information</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Business Type</p>
                      <p className="text-sm text-slate-900 capitalize">{merchant.businessType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Current Processor</p>
                      <p className="text-sm text-slate-900">
                        {merchantData.integration
                          ? (integrationsRes?.processors?.find((p: any) => p.name === merchantData.integration)?.integration_name || merchantData.integration)
                          : (integrationsRes?.processors?.find((p: any) => p.default === 1)
                            ? integrationsRes.processors.find((p: any) => p.default === 1).integration_name
                            : 'Not Set')}
                      </p>
                    </div>
                  </div>
                  {merchant.website && (
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500">Website</p>
                        <a href={merchant.website} className="text-sm text-primary-600 hover:text-primary-700">
                          {merchant.website}
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm text-slate-900">{merchantData.company_email || 'Not Set'}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-medium text-slate-900 mb-4">Verification Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">KYC Status</span>
                    {(() => {
                      const status = merchant.status.toLowerCase();
                      let label = merchant.kycStatus.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
                      let variant: 'success' | 'warning' | 'error' | 'slate' | 'info' = 'slate';

                      if (status === 'draft') {
                        label = 'Not Submitted';
                        variant = 'slate';
                      } else if (status === 'submitted') {
                        label = 'Under Review';
                        variant = 'warning';
                      } else if (status === 'approved') {
                        label = 'Verified';
                        variant = 'success';
                      } else if (status === 'rejected') {
                        label = 'Rejected';
                        variant = 'error';
                      } else if (status === 'suspended') {
                        label = 'Suspended';
                        variant = 'error';
                      } else if (status === 'terminated') {
                        label = 'Terminated';
                        variant = 'error';
                      } else {
                        // Fallback logic
                        if (merchant.kycStatus === 'verified' || merchant.kycStatus === 'approved') variant = 'success';
                        else if (merchant.kycStatus === 'pending_review' || merchant.kycStatus === 'submitted' || merchant.kycStatus === 'pending') variant = 'warning';
                        else if (merchant.kycStatus === 'rejected') variant = 'error';
                      }

                      return (
                        <Badge variant={variant}>
                          {label}
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Status</span>
                    {getStatusBadge(merchant.status)}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Member Since</span>
                    <span className="text-sm text-slate-900">{formatDate(merchant.createdAt)}</span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>


          <TabsContent value="documents">
            <Card>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">KYC Documents</h3>
              {merchantData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Director PAN */}
                  {merchantData.director_pan && (
                    <div className="p-4 border border-slate-200 rounded-lg hover:border-primary-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary-600" />
                          <span className="font-medium text-slate-900">Director PAN</span>
                        </div>
                        <Badge variant="success" size="sm">Uploaded</Badge>
                      </div>
                      <a
                        href={merchantData.director_pan}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        View Document →
                      </a>
                    </div>
                  )}

                  {/* Director Aadhaar */}
                  {merchantData.director_adhar && (
                    <div className="p-4 border border-slate-200 rounded-lg hover:border-primary-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary-600" />
                          <span className="font-medium text-slate-900">Director Aadhaar</span>
                        </div>
                        <Badge variant="success" size="sm">Uploaded</Badge>
                      </div>
                      <a
                        href={merchantData.director_adhar}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        View Document →
                      </a>
                    </div>
                  )}

                  {/* Company PAN */}
                  {merchantData.company_pan && (
                    <div className="p-4 border border-slate-200 rounded-lg hover:border-primary-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary-600" />
                          <span className="font-medium text-slate-900">Company PAN</span>
                        </div>
                        <Badge variant="success" size="sm">Uploaded</Badge>
                      </div>
                      <a
                        href={merchantData.company_pan}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        View Document →
                      </a>
                    </div>
                  )}

                  {/* Company GST */}
                  {merchantData.company_gst && (
                    <div className="p-4 border border-slate-200 rounded-lg hover:border-primary-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary-600" />
                          <span className="font-medium text-slate-900">Company GST</span>
                        </div>
                        <Badge variant="success" size="sm">Uploaded</Badge>
                      </div>
                      <a
                        href={merchantData.company_gst}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        View Document →
                      </a>
                    </div>
                  )}
                </div>
              )}

              {(!merchantData || (!merchantData.director_pan && !merchantData.director_adhar && !merchantData.company_pan && !merchantData.company_gst)) && (
                <div className="text-center py-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No Documents Uploaded</p>
                  <p className="text-sm mt-1">Merchant hasn't uploaded any KYC documents yet</p>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <div className="space-y-4">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log: any, index: number) => (
                    <div key={index} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">{log.subject || log.operation || 'Activity'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-slate-500">by {log.full_name || 'System'}</p>
                          {log.ip_address && (
                            <>
                              <span className="text-xs text-slate-300">•</span>
                              <p className="text-xs text-slate-500 font-mono">{log.ip_address}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.modified)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Activity className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No Activity Logs</p>
                    <p className="text-sm mt-1">No activity has been recorded for this merchant yet</p>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="configuration">
            <Card className="border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Product Pricing Configuration</h3>
                    <p className="text-xs text-slate-500">Manage merchant's product pricing and fee structure</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {isEditingPricing ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setIsEditingPricing(false);
                          setEditablePricing([]);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          setSavingPricing(true);
                          try {
                            // Use SDK to update child table directly
                            await updateDoc('Merchant', id || '', {
                              product_pricing: editablePricing
                            });

                            setIsEditingPricing(false);
                            setEditablePricing([]);
                            success('Success', 'Pricing updated successfully!');
                            merchantDetailsRefetch();
                          } catch (err: any) {
                            console.error('Error updating pricing:', err);
                            const errorMsg = err.message || (err.messages && err.messages[0]) || 'Failed to update pricing';
                            showError('Error', errorMsg);
                          } finally {
                            setSavingPricing(false);
                          }
                        }}
                        disabled={savingPricing}
                      >
                        {savingPricing ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsEditingPricing(true);
                        setEditablePricing(merchantData?.product_pricing || []);
                      }}
                    >
                      Edit Configuration
                    </Button>
                  )}
                </div>
              </div>

              {isEditingPricing ? (
                <div className="p-6 space-y-4">
                  {editablePricing.map((pricing: any, index: number) => (
                    <div key={index} className="p-4 border border-slate-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-900">Product #{index + 1}</h4>
                        <button
                          onClick={() => {
                            const newPricing = editablePricing.filter((_: any, i: number) => i !== index);
                            setEditablePricing(newPricing);
                          }}
                          className="text-xs text-error-600 hover:text-error-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Product</label>
                          <Select
                            value={pricing.product}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].product = e.target.value;
                              setEditablePricing(newPricing);
                            }}
                            options={[
                              { value: '', label: 'Select Product' },
                              ...products.map((product: any) => ({
                                value: product.name,
                                label: product.product_name || product.name
                              }))
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Fee Type</label>
                          <Select
                            value={pricing.fee_type}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].fee_type = e.target.value;
                              setEditablePricing(newPricing);
                            }}
                            options={[
                              { value: 'Percentage', label: 'Percentage' },
                              { value: 'Fixed', label: 'Fixed' }
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Fee</label>
                          <input
                            type="number"
                            step="0.01"
                            value={pricing.fee}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].fee = parseFloat(e.target.value);
                              setEditablePricing(newPricing);
                            }}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Tax Fee Type</label>
                          <Select
                            value={pricing.tax_fee_type}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].tax_fee_type = e.target.value;
                              setEditablePricing(newPricing);
                            }}
                            options={[
                              { value: 'Percentage', label: 'Percentage' },
                              { value: 'Fixed', label: 'Fixed' }
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Tax Fee</label>
                          <input
                            type="number"
                            step="0.01"
                            value={pricing.tax_fee}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].tax_fee = parseFloat(e.target.value);
                              setEditablePricing(newPricing);
                            }}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Start Value</label>
                          <input
                            type="number"
                            value={pricing.start_value}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].start_value = parseFloat(e.target.value);
                              setEditablePricing(newPricing);
                            }}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">End Value</label>
                          <input
                            type="number"
                            value={pricing.end_value}
                            onChange={(e) => {
                              const newPricing = [...editablePricing];
                              newPricing[index].end_value = parseFloat(e.target.value);
                              setEditablePricing(newPricing);
                            }}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditablePricing([...editablePricing, {
                        product: '',
                        fee_type: 'Percentage',
                        fee: 0,
                        tax_fee_type: 'Percentage',
                        tax_fee: 0,
                        start_value: 0,
                        end_value: 0
                      }]);
                    }}
                  >
                    + Add Product
                  </Button>
                </div>
              ) : merchantData && merchantData.product_pricing && merchantData.product_pricing.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30">
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fee Type</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fee</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tax Fee Type</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tax Fee</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {merchantData.product_pricing.map((pricing: any, index: number) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <CreditCard className="w-4 h-4 text-primary-600" />
                              <span className="text-sm font-medium text-slate-900">{pricing.product}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="slate" size="sm">{pricing.fee_type}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-900">
                              {pricing.fee_type === 'Percentage' ? `${pricing.fee}%` : `₹${pricing.fee}`}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="slate" size="sm">{pricing.tax_fee_type}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-900">
                              {pricing.tax_fee_type === 'Percentage' ? `${pricing.tax_fee}%` : `₹${pricing.tax_fee}`}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs text-slate-500">
                              ₹{formatNumber(pricing.start_value)} - ₹{formatNumber(pricing.end_value)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Settings className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No Pricing Configuration</p>
                  <p className="text-sm mt-1">No product pricing has been configured for this merchant yet</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setIsEditingPricing(true);
                      setEditablePricing([{
                        product: '',
                        fee_type: 'Percentage',
                        fee: 0,
                        tax_fee_type: 'Percentage',
                        tax_fee: 0,
                        start_value: 0,
                        end_value: 0
                      }]);
                    }}
                  >
                    + Add First Product
                  </Button>
                </div>
              )}
            </Card>

            {/* Whitelisted Accounts Section */}
            <Card className="border border-slate-200 mt-6 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Whitelisted Accounts</h3>
                    <p className="text-xs text-slate-500">Bank accounts approved for settlements</p>
                  </div>
                </div>
              </div>

              {merchantData && merchantData.bank_accounts && merchantData.bank_accounts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30">
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bank Name</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Holder</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account No.</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">IFSC</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Document</th>
                        <th className="px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {merchantData.bank_accounts.map((account: any, index: number) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Building2 className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-900">{account.bank_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {account.account_holder_name}
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-600">
                            {account.account_number}
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-600">
                            {account.ifsc_code}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={
                                (account.status === 'Verified' || account.status === 'Approved') ? 'success' :
                                  account.status === 'Pending' ? 'warning' :
                                    (account.status === 'Rejected' || account.status === 'Declined') ? 'error' : 'slate'
                              }
                            >
                              {account.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {account.cancel_cheque ? (
                              <a
                                href={account.cancel_cheque}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                View Cheque
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No document</span>
                            )}
                          </td>
                          <td className="px-2 py-4">
                            {account.status === 'Pending' && (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={async () => {
                                    try {
                                      const res = await updateBankAccountStatus({
                                        bank_account: account.name,
                                        status: 'Approved'
                                      });
                                      if (res.message?.success) {
                                        success('Approved', 'Bank account approved successfully');
                                        merchantDetailsRefetch();
                                      } else {
                                        showError('Error', res.message?.message || 'Failed to approve');
                                      }
                                    } catch (err: any) {
                                      showError('Error', err.message || 'Failed to approve');
                                    }
                                  }}
                                  className="h-7 px-2"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={async () => {
                                    try {
                                      const res = await updateBankAccountStatus({
                                        bank_account: account.name,
                                        status: 'Rejected'
                                      });
                                      if (res.message?.success) {
                                        success('Rejected', 'Bank account rejected');
                                        merchantDetailsRefetch();
                                      } else {
                                        showError('Error', res.message?.message || 'Failed to reject');
                                      }
                                    } catch (err: any) {
                                      showError('Error', err.message || 'Failed to reject');
                                    }
                                  }}
                                  className="h-7 px-2"
                                >
                                  <Ban className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No Whitelisted Accounts</p>
                  <p className="text-sm mt-1">No bank accounts have been added yet</p>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>


      <Modal
        isOpen={showSuspendModal}
        onClose={() => setShowSuspendModal(false)}
        title="Suspend Account"
        description="This will immediately disable the merchant's ability to process payments"
      >
        <div className="space-y-4">
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg">
            <p className="text-sm text-error-700">
              Suspending this account will stop all payment processing and disable API access. The merchant will be notified.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason for suspension
            </label>
            <Select
              options={[
                { value: '', label: 'Select a reason' },
                { value: 'fraud', label: 'Suspected fraud' },
                { value: 'violation', label: 'Terms violation' },
                { value: 'risk', label: 'High risk activity' },
                { value: 'other', label: 'Other' }
              ]}
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Additional notes
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Add any additional details..."
              value={suspensionNotes}
              onChange={(e) => setSuspensionNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowSuspendModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleSuspendAccount} disabled={suspending}>
              <Ban className="w-4 h-4" />
              {suspending ? 'Suspending...' : 'Suspend Account'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        title="Add Note"
        description="Add a note about this merchant"
      >
        <div className="space-y-4">
          <textarea
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="Enter your note here..."
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowNoteModal(false)}>
              Cancel
            </Button>
            <Button>Save Note</Button>
          </div>
        </div>
      </Modal>

      {/* KYC Rejection Modal */}
      <Modal
        isOpen={showKYCRejectModal}
        onClose={() => {
          setShowKYCRejectModal(false);
          setKycRejectionRemark('');
          setKycDocumentsToReupload([]);
        }}
        title="Reject KYC Submission"
        description={`Provide a reason for rejecting ${merchant?.businessName}'s KYC`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Rejection Reason <span className="text-error-600">*</span>
            </label>
            <textarea
              rows={4}
              value={kycRejectionRemark}
              onChange={(e) => setKycRejectionRemark(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="e.g., Documents are blurry, expired, or information doesn't match..."
            />
            <p className="text-xs text-slate-500 mt-1">
              This message will be sent to the merchant so they can resubmit with corrections.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Documents to Re-upload (Optional)
            </label>
            <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
              {kycDocumentTypes.map((doc) => (
                <div key={doc.id} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`doc-${doc.id}`}
                    checked={kycDocumentsToReupload.includes(doc.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setKycDocumentsToReupload([...kycDocumentsToReupload, doc.id]);
                      } else {
                        setKycDocumentsToReupload(kycDocumentsToReupload.filter(id => id !== doc.id));
                      }
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-slate-300 rounded"
                  />
                  <label htmlFor={`doc-${doc.id}`} className="ml-2 block text-sm text-slate-700">
                    {doc.label}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Selected documents will be marked as rejected and the merchant will be prompted to re-upload them.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="secondary"
              onClick={() => {
                setShowKYCRejectModal(false);
                setKycRejectionRemark('');
                setKycDocumentsToReupload([]);
              }}
              disabled={processingKYC}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRejectKYC}
              disabled={processingKYC || !kycRejectionRemark.trim()}
            >
              <X className="w-4 h-4" />
              {processingKYC ? 'Rejecting...' : 'Reject KYC'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* KYC Approval Modal */}
      <Modal
        isOpen={showKYCApproveModal}
        onClose={() => setShowKYCApproveModal(false)}
        title="Approve KYC Submission"
        description={`Are you sure you want to approve KYC for ${merchant?.businessName}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will mark the merchant's KYC as verified and activate their account.
            Ensure you have verified all submitted documents.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="secondary"
              onClick={() => setShowKYCApproveModal(false)}
              disabled={processingKYC}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={processApproveKYC}
              disabled={processingKYC}
            >
              {processingKYC ? 'Approving...' : 'Confirm Approval'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Send Notification Modal */}
      <Modal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        title="Send Notification"
        description={`Send a notification to ${merchant?.businessName}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
            <Input
              value={notificationSubject}
              onChange={(e) => setNotificationSubject(e.target.value)}
              placeholder="e.g. Important Update regarding your account"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[120px]"
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              placeholder="Type your message here..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setShowNotificationModal(false)} disabled={sendingNotification}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSendNotification} disabled={sendingNotification || !notificationSubject || !notificationMessage}>
              {sendingNotification ? 'Sending...' : 'Send Notification'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reactivate Account Modal */}
      <Modal
        isOpen={showReactivateModal}
        onClose={() => setShowReactivateModal(false)}
        title="Reactivate Account"
        description={`Are you sure you want to reactivate ${merchant?.businessName}'s account?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will immediately restore the merchant's ability to process payments and access the portal.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setShowReactivateModal(false)}>
              Cancel
            </Button>
            <Button variant="success" onClick={processReactivateAccount} disabled={reactivating}>
              <CheckCircle className="w-4 h-4 mr-2" />
              {reactivating ? 'Reactivating...' : 'Confirm Reactivation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Merchant Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Merchant"
        description={`Update business information for ${merchant?.businessName}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Company Name <span className="text-error-600">*</span>
            </label>
            <Input
              value={editFormData.company_name}
              onChange={(e) => setEditFormData({ ...editFormData, company_name: e.target.value })}
              placeholder="Enter company name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Company Email <span className="text-error-600">*</span>
            </label>
            <Input
              type="email"
              value={editFormData.company_email}
              onChange={(e) => setEditFormData({ ...editFormData, company_email: e.target.value })}
              placeholder="company@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Website
            </label>
            <Input
              type="url"
              value={editFormData.website}
              onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business Type
            </label>
            <Select
              value={editFormData.business_type}
              onChange={(e) => setEditFormData({ ...editFormData, business_type: e.target.value })}
              options={[
                { value: '', label: 'Select Business Type' },
                { value: 'Individual', label: 'Individual' },
                { value: 'Company', label: 'Company' },
              ]}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="secondary"
              onClick={() => setShowEditModal(false)}
              disabled={updatingMerchant}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdateMerchant}
              disabled={updatingMerchant || !editFormData.company_name || !editFormData.company_email}
            >
              {updatingMerchant ? 'Updating...' : 'Update Merchant'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Adjust Funds Modal */}
      <Modal
        isOpen={showAdjustFundsModal}
        onClose={() => setShowAdjustFundsModal(false)}
        title="Adjust Merchant Funds"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Hold funds (move to Lien) or Release funds (move to Main Wallet).
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div
              onClick={() => setAdjustFundsType('Hold')}
              className={`cursor-pointer border rounded-lg p-4 text-center transition-colors ${adjustFundsType === 'Hold' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <p className="font-semibold text-slate-900">Mark Lien</p>
              <p className="text-xs mt-1 text-slate-500">Main → Lien</p>
            </div>
            <div
              onClick={() => setAdjustFundsType('Release')}
              className={`cursor-pointer border rounded-lg p-4 text-center transition-colors ${adjustFundsType === 'Release' ? 'border-success-500 bg-success-50 text-success-900' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              <p className="font-semibold text-slate-900">Release Funds</p>
              <p className="text-xs mt-1 text-slate-500">Lien → Main</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 font-medium">₹</span>
              <Input
                type="number"
                placeholder="0.00"
                value={adjustFundsAmount}
                onChange={(e) => setAdjustFundsAmount(e.target.value)}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {adjustFundsType === 'Hold'
                ? `Available Main Balance: ${formatCurrency(merchant.balance)}`
                : `Available Lien Balance: ${formatCurrency(merchant.lienBalance)}`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remark</label>
            <Input
              value={adjustFundsRemark}
              onChange={(e) => setAdjustFundsRemark(e.target.value)}
              placeholder="Reason for adjustment"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowAdjustFundsModal(false)}>Cancel</Button>
            <Button
              isLoading={adjustingFunds}
              variant={adjustFundsType === 'Hold' ? 'danger' : 'success'}
              onClick={handleAdjustFunds}
              disabled={!adjustFundsAmount || parseFloat(adjustFundsAmount) <= 0 || adjustingFunds}
            >
              Confirm {adjustFundsType}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout >
  );
}
