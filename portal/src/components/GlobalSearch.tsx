import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, CreditCard, DollarSign, Building2, Landmark } from 'lucide-react';
import { useFrappePostCall } from 'frappe-react-sdk';
import { adminMethods, merchantMethods } from '../services/methods';

interface SearchResult {
    type: 'order' | 'transaction' | 'settlement' | 'merchant' | 'virtual_account';
    id: string;
    title: string;
    subtitle: string;
    url: string;
}

interface GlobalSearchProps {
    isAdmin?: boolean;
}

export function GlobalSearch({ isAdmin = false }: GlobalSearchProps) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const { call: adminSearch } = useFrappePostCall(adminMethods.globalSearch);
    const { call: getOrders } = useFrappePostCall(merchantMethods.getOrders);
    const { call: getVANLogs } = useFrappePostCall(merchantMethods.getVANLogs);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Search with debouncing
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim().length < 2) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setLoading(true);
            try {
                if (isAdmin) {
                    // Admin Search
                    const result = await adminSearch({ query });
                    const response = result.message;

                    if (response && response.results) {
                        setResults(response.results);
                        setIsOpen(true);
                    } else {
                        setResults([]);
                        setIsOpen(true);
                    }
                } else {
                    // Merchant Search
                    const searchResults: SearchResult[] = [];
                    const addedIds = new Set<string>(); // Track added IDs to avoid duplicates

                    // Parallel search across orders and VAN logs
                    const [ordersRes, logsRes] = await Promise.allSettled([
                        getOrders({ page: 1, page_size: 5, filter_data: { search: query } }),
                        getVANLogs({ page: 1, page_size: 5, filter_data: { search: query } })
                    ]);

                    // Process orders
                    if (ordersRes.status === 'fulfilled' && ordersRes.value.message?.orders) {
                        ordersRes.value.message.orders.forEach((order: any) => {
                            if (!addedIds.has(order.id)) {
                                searchResults.push({
                                    type: 'order',
                                    id: order.id,
                                    title: order.id,
                                    subtitle: `${order.customer || 'N/A'} - ₹${order.amount}`,
                                    url: `/orders/${order.order_type === 'Topup' ? 'payin' : 'payout'}/${order.id}`
                                });
                                addedIds.add(order.id);
                            }
                        });
                    }

                    // Process VAN logs (settlements)
                    if (logsRes.status === 'fulfilled' && logsRes.value.message?.logs) {
                        logsRes.value.message.logs.forEach((log: any) => {
                            if (!addedIds.has(log.id)) {
                                searchResults.push({
                                    type: 'settlement',
                                    id: log.id,
                                    title: log.id,
                                    subtitle: `₹${log.amount} - ${log.status || 'Pending'}`,
                                    url: `/settlements/${log.id}`
                                });
                                addedIds.add(log.id);
                            }
                        });
                    }

                    setResults(searchResults);
                    setIsOpen(true);
                }
            } catch (error) {
                console.error('Search error:', error);
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, isAdmin, adminSearch, getOrders, getVANLogs]);

    const handleResultClick = (url: string) => {
        navigate(url);
        setQuery('');
        setResults([]);
        setIsOpen(false);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'order':
                return <FileText className="w-4 h-4 text-slate-400" />;
            case 'transaction':
                return <CreditCard className="w-4 h-4 text-slate-400" />;
            case 'settlement':
                return <DollarSign className="w-4 h-4 text-slate-400" />;
            case 'merchant':
                return <Building2 className="w-4 h-4 text-slate-400" />;
            case 'virtual_account':
                return <Landmark className="w-4 h-4 text-slate-400" />;
            default:
                return <Search className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div ref={searchRef} className="relative w-full">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search transactions, orders, customers..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true);
                    }}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-primary-600"></div>
                    </div>
                )}
            </div>

            {/* Results Dropdown */}
            {isOpen && results.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                    <div className="p-2">
                        {results.map((result, index) => (
                            <button
                                key={`${result.type}-${result.id}-${index}`}
                                onClick={() => handleResultClick(result.url)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                {getIcon(result.type)}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate">
                                        {result.title}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate">
                                        {result.subtitle}
                                    </p>
                                </div>
                                <span className="text-xs text-slate-400 capitalize">
                                    {result.type}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* No Results */}
            {isOpen && query.trim().length >= 2 && results.length === 0 && !loading && (
                <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-8 z-50 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                        <Search className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-900">No results found</p>
                    <p className="text-xs text-slate-500 mt-1">
                        We couldn't find anything for "{query}"
                    </p>
                </div>
            )}
        </div>
    );
}
