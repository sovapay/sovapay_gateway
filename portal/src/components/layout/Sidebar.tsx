import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, ShoppingCart, BookOpen, FileText,
  Code, Settings, ChevronDown,
  Building2, Wallet, BarChart3
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../hooks';

interface SidebarProps {
  isAdmin?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { name: string; href: string }[];
}

const merchantNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Payin Orders', href: '/orders/payin', icon: ArrowLeftRight },
  { name: 'Payout Orders', href: '/orders/payout', icon: ShoppingCart },
  { name: 'Ledger', href: '/ledger', icon: BookOpen },
  { name: 'Settlements', href: '/settlements', icon: Wallet },
  { name: 'Deposit Funds', href: '/wallet/deposit', icon: Building2 },
  { name: 'Developers', href: '/developers', icon: Code },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    children: [
      { name: 'Profile', href: '/settings/profile' },
      { name: 'Team', href: '/settings/team' },
      { name: 'Security', href: '/settings/security' },
      // { name: 'Notifications', href: '/settings/notifications' },
      { name: 'KYC', href: '/settings/kyc' },
    ],
  },
];

const adminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Merchants', href: '/admin/merchants', icon: Building2 },
  { name: 'Payin Orders', href: '/admin/orders/payin', icon: ArrowLeftRight },
  { name: 'Payout Orders', href: '/admin/orders/payout', icon: ShoppingCart },
  { name: 'KYC Reviews', href: '/admin/kyc-reviews', icon: FileText },
  { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
  // Temporarily disabled - not implemented with real APIs:
  // { name: 'Risk Alerts', href: '/admin/risk-alerts', icon: AlertTriangle },
  // { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Settlements', href: '/admin/van-logs', icon: Wallet },
  { name: 'Virtual Accounts', href: '/admin/virtual-accounts', icon: Building2 },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

function NavItemComponent({ item }: { item: NavItem; isAdmin: boolean }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(
    item.children?.some(child => location.pathname.startsWith(child.href)) || false
  );

  const isActive = location.pathname === item.href ||
    (item.children && item.children.some(child => location.pathname.startsWith(child.href)));

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg
            transition-colors duration-150
            ${isActive ? 'text-slate-900 bg-slate-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}
          `}
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-5 h-5" />
            {item.name}
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="mt-1 ml-8 space-y-1">
            {item.children.map(child => (
              <NavLink
                key={child.href}
                to={child.href}
                className={({ isActive }) => `
                  block px-3 py-2 text-sm rounded-lg transition-colors duration-150
                  ${isActive
                    ? 'text-slate-900 bg-slate-100 font-medium'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }
                `}
              >
                {child.name}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.href}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg
        transition-colors duration-150
        ${isActive
          ? 'text-slate-900 bg-slate-100'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }
      `}
    >
      <item.icon className="w-5 h-5" />
      {item.name}
    </NavLink>
  );
}

export function Sidebar({ isAdmin = false, isOpen = false, onClose }: SidebarProps) {
  const { user } = useAuth();

  // Filter navigation items based on role
  let navItems = isAdmin ? adminNavItems : merchantNavItems;

  if (!isAdmin && user?.merchant?.role && user.merchant.role !== 'Owner') {
    navItems = navItems.map(item => {
      if (item.name === 'Settings' && item.children) {
        return {
          ...item,
          children: item.children.filter(child => child.name !== 'KYC')
        };
      }
      return item;
    });
  }

  // Get merchant info from auth context
  const merchant = !isAdmin && user?.merchant ? {
    businessName: user.merchant.company_name || 'Merchant',
    isLive: user.merchant.status === 'Active',
    logo: user.merchant.logo
  } : null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`
        fixed left-0 top-0 z-50 h-screen w-64 bg-white border-r border-slate-200 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:z-40
      `}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              {user?.appLogo ? (
                <img
                  src={user.appLogo}
                  alt={user?.appName || "Logo"}
                  className="h-11 w-auto object-contain"
                />
              ) : (
                <div className="text-2xl font-bold text-primary-600">
                  {user?.appName || 'iSwitch'}
                </div>
              )}
              {isAdmin && (
                <span className="ml-2 text-xs bg-slate-900 text-white px-1.5 py-0.5 rounded">Admin</span>
              )}
            </div>
          </div>

          {!isAdmin && merchant && (
            <div className="px-4 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3 px-2">
                <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center overflow-hidden">
                  {merchant.logo ? (
                    <img src={merchant.logo} alt={merchant.businessName} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-5 h-5 text-primary-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{merchant.businessName}</p>
                  <p className="text-xs text-slate-500">
                    {user?.user.email}
                  </p>
                </div>
              </div>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
            {navItems.map(item => (
              <NavItemComponent key={item.href} item={item} isAdmin={isAdmin} />
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
