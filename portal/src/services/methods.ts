/**
 * Frappe SDK Method Constants
 * 
 * This file exports all Frappe backend method names as constants
 * for use with frappe-react-sdk hooks (useFrappeGetCall, useFrappePostCall)
 * 
 * IMPORTANT: These match the actual @frappe.whitelist() decorated functions
 * in the iSwitch Frappe app backend
 */

// ============================================================================
// MERCHANT PORTAL METHODS (from merchant_portal_api.py)
// ============================================================================

export const merchantMethods = {
    // Dashboard
    getDashboardStats: 'iswitch.merchant_portal_api.get_dashboard_stats',
    getWalletBalance: 'iswitch.merchant_portal_api.get_wallet_balance',
    getDashboardChartData: 'iswitch.merchant_portal_api.get_dashboard_chart_data',

    // Orders
    getOrders: 'iswitch.merchant_portal_api.get_orders',
    getOrderDetails: 'iswitch.merchant_portal_api.get_order_details',
    getOrderDetail: 'iswitch.merchant_portal_api.get_order_detail',

    // Transactions
    getTransactions: 'iswitch.merchant_portal_api.get_transactions',
    getTransactionDetails: 'iswitch.merchant_portal_api.get_transaction_detail',

    // Ledger
    getLedgerEntries: 'iswitch.merchant_portal_api.get_ledger_entries',
    getLedgerDetails: 'iswitch.merchant_portal_api.get_ledger_details',
    getLedgerStats: 'iswitch.merchant_portal_api.get_ledger_stats',

    // Settlements (VAN Logs)
    getSettlements: 'iswitch.merchant_portal_api.get_van_logs',
    getSettlementDetails: 'iswitch.merchant_portal_api.get_settlement_details',
    getSettlementStats: 'iswitch.merchant_portal_api.get_settlement_stats',

    // Virtual Account
    getVANAccount: 'iswitch.merchant_portal_api.get_van_account',
    getVANLogs: 'iswitch.merchant_portal_api.get_van_logs',

    // Profile & Settings
    getMerchantProfile: 'iswitch.merchant_portal_api.get_merchant_profile',
    // updateMerchantProfile, uploadLogo replaced by useMerchantProfile (standard hooks)

    // API Keys
    getAPIKeys: 'iswitch.merchant_portal_api.get_api_keys',
    generateAPIKeys: 'iswitch.merchant_portal_api.generate_api_keys',

    // Webhooks
    // Webhooks
    // getWebhooks, create/update/delete replaced by useWebhooks (standard hooks)
    getWebhookLogs: 'iswitch.merchant_portal_api.get_webhook_logs',

    // IP Whitelist
    // IP Whitelist
    // Replaced by useIPWhitelist (standard hooks)

    // API Logs
    getAPILogs: 'iswitch.merchant_portal_api.get_api_logs',

    // Security
    getSecurityStatus: 'iswitch.merchant_portal_api.get_security_status',
    getSecurityLogs: 'iswitch.merchant_portal_api.get_activity_logs',
    changePassword: 'iswitch.merchant_portal_api.change_password',
    setup2FA: 'iswitch.merchant_portal_api.setup_2fa',
    verify2FA: 'iswitch.merchant_portal_api.verify_2fa_setup',
    disable2FA: 'iswitch.merchant_portal_api.disable_2fa',

    // KYC
    // KYC
    // getKYCStatus, uploadKYCDocument replaced by useKYC (standard hooks)
    // Wallet & Payments
    requestWalletTopup: 'iswitch.merchant_portal_api.request_wallet_topup',
    addBankAccount: 'iswitch.merchant_portal_api.add_bank_account',

    // Notifications
    getNotifications: 'iswitch.merchant_portal_api.get_notifications',
    markNotificationsRead: 'iswitch.merchant_portal_api.mark_notifications_read',

    // Export Functions
    exportTransactions: 'iswitch.merchant_portal_api.export_transactions_to_excel',
    exportOrders: 'iswitch.merchant_portal_api.export_orders_to_excel',
    exportLedger: 'iswitch.merchant_portal_api.export_ledger_to_excel',
    exportVANLogs: 'iswitch.merchant_portal_api.export_van_logs_to_excel',

    // Team Management
    getTeamMembers: 'iswitch.merchant_portal_api.get_team_members',
    inviteTeamMember: 'iswitch.merchant_portal_api.invite_team_member',
    updateTeamMember: 'iswitch.merchant_portal_api.update_team_member',
    removeTeamMember: 'iswitch.merchant_portal_api.remove_team_member',

    // File Upload
    uploadFile: 'upload_file',
} as const;

export const adminMethods = {
    getDashboardStats: 'iswitch.admin_portal_api.get_dashboard_stats',
    getOrders: 'iswitch.admin_portal_api.get_orders',
    getOrderDetails: 'iswitch.admin_portal_api.get_order_details',
    getTransactions: 'iswitch.admin_portal_api.get_transactions',
    getTransactionDetails: 'iswitch.admin_portal_api.get_transaction_details',
    getMerchants: 'iswitch.admin_portal_api.get_merchants',
    getMerchantDetails: 'iswitch.admin_portal_api.get_merchant_details',
    updateMerchant: 'iswitch.admin_portal_api.update_merchant',
    adjustMerchantFunds: 'iswitch.admin_portal_api.adjust_merchant_funds',
    getIntegrations: 'iswitch.admin_portal_api.get_processors',
    // Services (Migrated to useAdminServices)
    getProcessors: 'iswitch.admin_portal_api.get_processors',
    // getServices & toggleServiceStatus replaced by useAdminServices (standard hooks)

    getVANLogs: 'iswitch.admin_portal_api.get_van_logs',
    getVANLogDetails: 'iswitch.admin_portal_api.get_van_log_details',
    approveTopup: 'iswitch.admin_portal_api.approve_wallet_topup',
    rejectTopup: 'iswitch.admin_portal_api.reject_wallet_topup',
    getLedgerEntries: 'iswitch.admin_portal_api.get_ledger_entries',
    getKYCSubmissions: 'iswitch.admin_portal_api.get_kyc_submissions',
    getMerchantKYCDetails: 'iswitch.admin_portal_api.get_merchant_kyc_details',
    approveKYC: 'iswitch.admin_portal_api.approve_kyc',
    rejectKYC: 'iswitch.admin_portal_api.reject_kyc',
    getVirtualAccounts: 'iswitch.admin_portal_api.get_virtual_accounts',
    getVirtualAccountDetails: 'iswitch.admin_portal_api.get_virtual_account_details',
    creditWallet: 'iswitch.admin_portal_api.credit_wallet',
    updateWalletBalance: 'iswitch.admin_portal_api.update_wallet_balance',
    updateBankAccountStatus: 'iswitch.admin_portal_api.update_bank_account_status',
    exportOrdersToExcel: 'iswitch.admin_portal_api.export_orders_to_excel',
    exportTransactionsToExcel: 'iswitch.admin_portal_api.export_transactions_to_excel',
    exportMerchantsToExcel: 'iswitch.admin_portal_api.export_merchants_to_excel',
    exportLedger: 'iswitch.admin_portal_api.export_ledger_to_excel',
    exportVANLogs: 'iswitch.admin_portal_api.export_van_logs_to_excel',
    exportReport: 'iswitch.admin_portal_api.export_report',

    // Merchant Actions & logs
    getMerchantActivityLogs: 'iswitch.admin_portal_api.get_merchant_activity_logs',
    suspendMerchant: 'iswitch.admin_portal_api.suspend_merchant',
    reactivateMerchant: 'iswitch.admin_portal_api.reactivate_merchant',
    sendMerchantNotification: 'iswitch.admin_portal_api.send_merchant_notification',
    updateMerchantPricing: 'iswitch.admin_portal_api.update_merchant_pricing',

    // Platform Settings
    getPlatformSettings: 'iswitch.admin_portal_api.get_platform_settings',
    updateProductStatus: 'iswitch.admin_portal_api.update_product_status',
    updateIntegrationStatus: 'iswitch.admin_portal_api.update_integration_status',
    saveIntegration: 'iswitch.admin_portal_api.save_integration',
    updateSecuritySettings: 'iswitch.admin_portal_api.update_security_settings',
    getIntegrationSecret: 'iswitch.admin_portal_api.get_integration_secret',


    // Admin 2FA
    get2FAStatus: 'iswitch.admin_portal_api.get_2fa_status',
    setup2FA: 'iswitch.admin_portal_api.setup_2fa',
    verify2FASetup: 'iswitch.admin_portal_api.verify_2fa_setup',
    disable2FA: 'iswitch.admin_portal_api.disable_2fa',
    verify2FALogin: 'iswitch.admin_portal_api.verify_2fa_login',

    // Reports
    getMerchantsForFilter: 'iswitch.admin_portal_api.get_merchants_for_filter',
    getProductsForFilter: 'iswitch.admin_portal_api.get_products_for_filter',
    getReportMetrics: 'iswitch.admin_portal_api.get_report_metrics',
    getVolumeTrend: 'iswitch.admin_portal_api.get_volume_trend',
    getProductDistribution: 'iswitch.admin_portal_api.get_product_distribution',
    getReportInsights: 'iswitch.admin_portal_api.get_report_insights',
    getReportTransactions: 'iswitch.admin_portal_api.get_report_transactions',
    getPayinReport: 'iswitch.admin_portal_api.get_payin_report',
    getPayoutReport: 'iswitch.admin_portal_api.get_payout_report',
    getReportLedgers: 'iswitch.admin_portal_api.get_report_ledgers',

    // Search & Broadcast
    globalSearch: 'iswitch.admin_portal_api.global_search',
    sendBroadcastNotification: 'iswitch.admin_portal_api.send_broadcast_notification',
} as const;



// ============================================================================
// AUTHENTICATION METHODS
// ============================================================================

export const authMethods = {
    // From portal_auth_api.py
    getUserContext: 'iswitch.portal_auth_api.get_user_context',
    signup: 'iswitch.portal_auth_api.signup',
    checkSession: 'iswitch.portal_auth_api.check_session',
    getWebsiteSettings: 'iswitch.portal_auth_api.get_website_settings',

    // From session_api.py (alternative)
    getUserDetails: 'iswitch.session_api.get_user_context',
} as const;

// ============================================================================
// ONBOARDING METHODS (from onboarding_api.py)
// ============================================================================

export const onboardingMethods = {
    // Add actual endpoints as needed
    getOnboardingStatus: 'iswitch.onboarding_api.get_onboarding_status',
    updateBusinessType: 'iswitch.onboarding_api.update_business_type',
    updateBusinessInfo: 'iswitch.onboarding_api.update_business_info',
    updateAddress: 'iswitch.onboarding_api.update_address',
    addBankAccount: 'iswitch.onboarding_api.add_bank_account',
    uploadDocument: 'iswitch.onboarding_api.upload_document',
    completeOnboarding: 'iswitch.onboarding_api.complete_onboarding',
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type MerchantMethod = typeof merchantMethods[keyof typeof merchantMethods];
export type AdminMethod = typeof adminMethods[keyof typeof adminMethods];
export type AuthMethod = typeof authMethods[keyof typeof authMethods];
export type OnboardingMethod = typeof onboardingMethods[keyof typeof onboardingMethods];
