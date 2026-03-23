import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { authMethods } from '../../services/methods';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
}

export function AuthLayout({ children, title, description }: AuthLayoutProps) {
  const [appLogo, setAppLogo] = useState<string | null>(null);

  const { data: { message: settings } = {} } = useFrappeGetCall<{ message: { app_name: string; app_logo?: string } }>(authMethods.getWebsiteSettings);

  useEffect(() => {
    if (settings) {
      if (settings.app_logo) {
        setAppLogo(settings.app_logo);
      }
    }
  }, [settings]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#6bff0040] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#3d3bf657] rounded-full blur-3xl" />

        <div className="relative">
          <Link to="/" className="flex items-center gap-3">
            {appLogo && (
              <img src="/files/sovapaylogo (1).svg" alt="Logo" className="h-12 w-auto object-contain rounded-xl p-1" />
            ) }
          </Link>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-semibold text-white leading-tight mb-4">
            The payments infrastructure for modern businesses
          </h1>
          <p className="text-lg text-slate-400">
            Accept payments, manage your business, and grow revenue with our complete payments platform.
          </p>
        </div>

        <div className="relative">
          <p className="text-sm text-slate-500">
            Trusted by thousands of businesses worldwide
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-3">
              {appLogo ? (
                <img src="/files/sovapaylogo (1).svg" alt="Logo" className="h-12 w-auto object-contain rounded-xl bg-slate-900 p-1" />
              ) : (
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
              )}
            </Link>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            )}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
