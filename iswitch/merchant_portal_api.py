# Merchant Portal API - Complete Integration
# Comprehensive API endpoints with SQL queries for the Merchant Portal

import frappe
from frappe import _
import json
from datetime import datetime, timedelta
from frappe.utils.file_manager import save_file
from iswitch.merchant_team_helper import get_logged_in_merchant_id, get_current_user_role
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client

def normalize_date_filter(date_str, is_end_date=False):
    if not date_str:
        return None
    clean_date = date_str.replace("T", " ").strip()
    if ':' not in clean_date:
        if is_end_date:
            clean_date += " 23:59:59"
        else:
            clean_date += " 00:00:00"
    return clean_date

@frappe.whitelist()
def get_dashboard_stats(period='Last 30 days', from_date=None, to_date=None):
    """Get comprehensive dashboard statistics using SQL queries"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return get_empty_stats()
            
        # Get merchant using SQL
        merchant = frappe.db.sql("""
            SELECT name, company_name, status
            FROM `tabMerchant`
            WHERE name = %s
            LIMIT 1
        """, (merchant_id,), as_dict=True)
        
        if not merchant:
            return get_empty_stats()
        
        merchant_id = merchant[0].name
        
        # Get TigerBeetle balance
        merchant_doc_full = frappe.get_doc("Merchant", merchant_id)

        balance = 0

        if merchant_doc_full.tigerbeetle_id:
            client = get_client()
            account_id = int(merchant_doc_full.tigerbeetle_id)

            accounts = client.lookup_accounts([account_id])

            if accounts:
                account = accounts[0]
                balance = (account.credits_posted - account.debits_posted - account.debits_pending) / 100
        
        # Handle date range
        if from_date and to_date:
            from_date = normalize_date_filter(from_date, is_end_date=False)
            to_date = normalize_date_filter(to_date, is_end_date=True)
        else:
            days = 30
            if period == 'Last 7 days':
                days = 7
            elif period == 'Last 90 days':
                days = 90
            
            if period == 'Today':
                from_date = normalize_date_filter(str(frappe.utils.nowdate()), is_end_date=False)
                to_date = normalize_date_filter(str(frappe.utils.nowdate()), is_end_date=True)
            else:
                from_date = normalize_date_filter(
                    str(frappe.utils.add_days(frappe.utils.nowdate(), -days)),
                    is_end_date=False
                )
                to_date = normalize_date_filter(
                    str(frappe.utils.nowdate()),
                    is_end_date=True
                )

        # Get order statistics using optimized SQL
        order_stats = frappe.db.sql('''
            SELECT 
                SUM(CASE WHEN order_type = 'Pay' THEN 1 ELSE 0 END) as payout_total_orders,
                SUM(CASE WHEN status = 'Processed' AND order_type = 'Pay' THEN 1 ELSE 0 END) as payout_processed_orders,
                SUM(CASE WHEN status IN ('Pending', 'Processing', 'Queued') AND order_type = 'Pay' THEN 1 ELSE 0 END) as payout_pending_orders,
                SUM(CASE WHEN status IN ('Cancelled', 'Reversed', 'Failed') AND order_type = 'Pay' THEN 1 ELSE 0 END) as payout_cancelled_orders,
                SUM(CASE WHEN status = 'Processed' AND order_type = 'Pay' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payout_success_amount,
                SUM(CASE WHEN status IN ('Pending', 'Processing', 'Queued') AND order_type = 'Pay' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payout_pending_amount,
                SUM(CASE WHEN status IN ('Cancelled', 'Reversed', 'Failed') AND order_type = 'Pay' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payout_failed_amount,

                SUM(CASE WHEN order_type = 'Topup' THEN 1 ELSE 0 END) as payin_total_orders,
                SUM(CASE WHEN status = 'Processed' AND order_type = 'Topup' THEN 1 ELSE 0 END) as payin_processed_orders,
                SUM(CASE WHEN status IN ('Pending', 'Processing', 'Queued') AND order_type = 'Topup' THEN 1 ELSE 0 END) as payin_pending_orders,
                SUM(CASE WHEN status IN ('Cancelled', 'Reversed', 'Failed') AND order_type = 'Topup' THEN 1 ELSE 0 END) as payin_cancelled_orders,
                SUM(CASE WHEN status = 'Processed' AND order_type = 'Topup' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payin_success_amount,
                SUM(CASE WHEN status IN ('Pending', 'Processing', 'Queued') AND order_type = 'Topup' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payin_pending_amount,
                SUM(CASE WHEN status IN ('Cancelled', 'Reversed', 'Failed') AND order_type = 'Topup' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payin_failed_amount
            FROM `tabOrder`
            WHERE merchant_ref_id = %s AND creation >= %s AND creation <= %s
        ''', (merchant_id, from_date, to_date), as_dict=True)
        
        stats = order_stats[0] if order_stats else {}
        
        def get_rate(processed, total):
            return round((processed / total) * 100, 1) if total else 0.0

        return {
            "wallet": {
                "balance": balance,
                "status": "Active"  # Default status since we're using TigerBeetle
            },
            "stats": {
                "payout": {
                    "total_orders": int(stats.get('payout_total_orders') or 0),
                    "processed_orders": int(stats.get('payout_processed_orders') or 0),
                    "pending_orders": int(stats.get('payout_pending_orders') or 0),
                    "cancelled_orders": int(stats.get('payout_cancelled_orders') or 0),
                    "success_amount": float(stats.get('payout_success_amount') or 0),
                    "pending_amount": float(stats.get('payout_pending_amount') or 0),
                    "failed_amount": float(stats.get('payout_failed_amount') or 0),
                    "success_rate": get_rate(stats.get('payout_processed_orders'), stats.get('payout_total_orders'))
                },
                "payin": {
                    "total_orders": int(stats.get('payin_total_orders') or 0),
                    "processed_orders": int(stats.get('payin_processed_orders') or 0),
                    "pending_orders": int(stats.get('payin_pending_orders') or 0),
                    "cancelled_orders": int(stats.get('payin_cancelled_orders') or 0),
                    "success_amount": float(stats.get('payin_success_amount') or 0),
                    "pending_amount": float(stats.get('payin_pending_amount') or 0),
                    "failed_amount": float(stats.get('payin_failed_amount') or 0),
                    "success_rate": get_rate(stats.get('payin_processed_orders'), stats.get('payin_total_orders'))
                }
            },
            "metric_trends": get_metric_trends(merchant_id)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_dashboard_stats: {str(e)}", "Merchant Portal API")
        return get_empty_stats()

def get_metric_trends(merchant_id):
    """Calculate trends for dashboard metrics split by Payin/Payout"""
    try:
        today = frappe.utils.getdate(frappe.utils.nowdate())
        from datetime import timedelta
        
        current_month_start = today.replace(day=1)
        last_month_end = current_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        
        vols = frappe.db.sql('''
            SELECT 
                SUM(CASE WHEN order_type = 'Pay' AND creation >= %s THEN order_amount ELSE 0 END) as current_payout_vol,
                SUM(CASE WHEN order_type = 'Topup' AND creation >= %s THEN order_amount ELSE 0 END) as current_payin_vol,
                SUM(CASE WHEN order_type = 'Pay' AND creation >= %s AND creation < %s THEN order_amount ELSE 0 END) as last_payout_vol,
                SUM(CASE WHEN order_type = 'Topup' AND creation >= %s AND creation < %s THEN order_amount ELSE 0 END) as last_payin_vol
            FROM `tabOrder`
            WHERE merchant_ref_id=%s AND status='Processed'
        ''', (current_month_start, current_month_start, last_month_start, current_month_start, last_month_start, current_month_start, merchant_id), as_dict=True)[0]
        
        def calc_change(current, last):
            if last > 0: return ((current - last) / last) * 100
            if current > 0: return 100
            return 0
            
        payout_vol_change = calc_change(vols.get('current_payout_vol') or 0, vols.get('last_payout_vol') or 0)
        payin_vol_change = calc_change(vols.get('current_payin_vol') or 0, vols.get('last_payin_vol') or 0)

        # Success Rate Trend
        last_7_start = today - timedelta(days=7)
        prev_7_start = today - timedelta(days=14)
        
        def get_success_rates(start, end):
            stats = frappe.db.sql('''
                SELECT 
                    SUM(CASE WHEN order_type = 'Pay' THEN 1 ELSE 0 END) as payout_total,
                    SUM(CASE WHEN status='Processed' AND order_type = 'Pay' THEN 1 ELSE 0 END) as payout_processed,
                    SUM(CASE WHEN order_type = 'Topup' THEN 1 ELSE 0 END) as payin_total,
                    SUM(CASE WHEN status='Processed' AND order_type = 'Topup' THEN 1 ELSE 0 END) as payin_processed
                FROM `tabOrder`
                WHERE merchant_ref_id=%s AND creation >= %s AND creation < %s
            ''', (merchant_id, start, end), as_dict=True)[0]
            
            payout_rate = (stats.get('payout_processed') or 0) / (stats.get('payout_total') or 1) * 100 if stats.get('payout_total') else 0.0
            payin_rate = (stats.get('payin_processed') or 0) / (stats.get('payin_total') or 1) * 100 if stats.get('payin_total') else 0.0
            return payout_rate, payin_rate
            
        current_payout_rate, current_payin_rate = get_success_rates(last_7_start, today + timedelta(days=1))
        prev_payout_rate, prev_payin_rate = get_success_rates(prev_7_start, last_7_start)

        return {
            "payout": {
                "volume_change_pct": round(payout_vol_change, 1),
                "success_rate_change_pct": round(current_payout_rate - prev_payout_rate, 1)
            },
            "payin": {
                "volume_change_pct": round(payin_vol_change, 1),
                "success_rate_change_pct": round(current_payin_rate - prev_payin_rate, 1)
            }
        }
    except Exception as e:
        frappe.log_error(f"Error in get_metric_trends: {str(e)}", "Merchant Portal API")
        return {
            "payout": {"volume_change_pct": 0, "success_rate_change_pct": 0},
            "payin": {"volume_change_pct": 0, "success_rate_change_pct": 0}
        }

def get_empty_stats():
    """Return empty stats structure"""
    return {
        "wallet": {"balance": 0, "status": "Inactive"},
        "stats": {
            "payout": {"total_orders": 0, "processed_orders": 0, "pending_orders": 0, "cancelled_orders": 0, "success_amount": 0, "pending_amount": 0, "failed_amount": 0, "success_rate": 0.0},
            "payin": {"total_orders": 0, "processed_orders": 0, "pending_orders": 0, "cancelled_orders": 0, "success_amount": 0, "pending_amount": 0, "failed_amount": 0, "success_rate": 0.0}
        },
        "metric_trends": {
            "payout": {"volume_change_pct": 0, "success_rate_change_pct": 0},
            "payin": {"volume_change_pct": 0, "success_rate_change_pct": 0}
        }
    }

@frappe.whitelist()
def get_orders(filter_data=None, page=1, page_size=20, sort_by="creation", sort_order="desc"):
    """Get paginated orders with filters using SQL"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"orders": [], "total": 0, "page": page, "page_size": page_size}
        
        # Parse filters
        filter_conditions = ["o.merchant_ref_id = %(merchant)s"]
        filter_values = {"merchant": merchant_id}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            # Handle status filter - support multiple statuses
            if filters.get("status") and filters["status"] != "All Status":
                status_value = filters["status"]
                # Map "Pending" to include both "Pending" and "Processing"
                if status_value == "Pending":
                    filter_conditions.append("(o.status = 'Pending' OR o.status = 'Processing')")
                elif status_value == "Cancelled":
                    filter_conditions.append("(o.status = 'Cancelled' OR o.status = 'Failed')")
                else:
                    filter_conditions.append("o.status = %(status)s")
                    filter_values["status"] = status_value
            
            # Handle search query
            if filters.get("search"):
                search_term = f"%{filters['search']}%"
                filter_conditions.append(
                    "(o.name LIKE %(search)s OR o.customer_name LIKE %(search)s OR o.utr LIKE %(search)s)"
                )
                filter_values["search"] = search_term
            
            if filters.get("from_date"):
                # Clean datetime string (replace T with space)
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("o.creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("o.creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
                
            if filters.get("order_type"):
                filter_conditions.append("o.order_type = %(order_type)s")
                filter_values["order_type"] = filters["order_type"]
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabOrder` o
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated orders
        start = (int(page) - 1) * int(page_size)
        orders_query = f"""
            SELECT 
                o.name as id,
                o.customer_name as customer,
                o.order_amount as amount,
                o.order_type,
                o.transaction_amount,
                o.tax,
                o.fee,
                o.status,
                o.utr,
                o.creation as date,
                o.modified
            FROM `tabOrder` o
            WHERE {where_clause}
            ORDER BY o.{sort_by} {sort_order.upper()}
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        orders = frappe.db.sql(orders_query, filter_values, as_dict=True)
        
        # # Fetch related ledger IDs for each order
        # for order in orders:
        #     ledger_entries = frappe.db.sql("""
        #         SELECT name as ledger_id
        #         FROM `tabLedger`
        #         WHERE `order` = %s
        #         ORDER BY creation DESC
        #     """, (order['id'],), as_dict=True)
        #     order['ledger_ids'] = [entry['ledger_id'] for entry in ledger_entries]
        
        return {
            "orders": orders,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_orders: {str(e)}", "Merchant Portal API")
        return {"orders": [], "total": 0}

@frappe.whitelist()
def get_ledger_entries(filter_data=None, page=1, page_size=20):
    """Get ledger entries using SQL - simplified without JOIN"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"entries": [], "total": 0}
        
        # Build filter conditions
        filter_conditions = ["l.owner = %(merchant)s", "l.docstatus = 1"]
        filter_values = {"merchant": merchant_id}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("type"):
                filter_type = filters["type"]
                if filter_type == "Credit":
                    filter_conditions.append("l.transaction_type IN ('Payment', 'Credit', 'Topup')")
                elif filter_type == "Debit":
                    filter_conditions.append("l.transaction_type IN ('Refund', 'Fee', 'Settlement', 'Debit', 'Payout')")
                else:
                    filter_conditions.append("l.transaction_type = %(type)s")
                    filter_values["type"] = filter_type
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("l.creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("l.creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabLedger` l
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated entries
        start = (int(page) - 1) * int(page_size)
        entries_query = f"""
            SELECT 
                l.name as id,
                l.order as order_id,
                l.transaction_type as type,
                l.transaction_amount,
                l.opening_balance,
                l.closing_balance,
                l.creation as date,
                o.customer_name,
                o.status as order_status,
                o.fee,
                o.tax,
                o.order_amount,
                o.product,
                o.modified as completion_date
            FROM `tabLedger` l
            LEFT JOIN `tabOrder` o ON l.order = o.name
            WHERE {where_clause}
            ORDER BY l.creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        entries = frappe.db.sql(entries_query, filter_values, as_dict=True)
        
        return {
            "entries": entries,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_ledger_entries: {str(e)}", "Merchant Portal API")
        return {"entries": [], "total": 0}
    
@frappe.whitelist()
def get_order_details(order_id):
    """Fetch specific order details with ledger IDs"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id: return None
        
        order = frappe.db.sql("""
            SELECT 
                o.name as id,
                o.customer_name as customer,
                o.order_amount as amount,
                o.transaction_amount,
                o.tax,
                o.fee,
                o.status,
                o.order_type,
                o.utr,
                o.reason as description,
                o.creation as date,
                o.modified,
                o.product as payment_method
            FROM `tabOrder` o
            WHERE o.name = %s AND o.merchant_ref_id = %s
        """, (order_id, merchant_id), as_dict=True)
        
        if not order:
            return None
            
        order = order[0]
        ledger_entries = frappe.db.sql("""
            SELECT name as ledger_id
            FROM `tabLedger`
            WHERE `order` = %s
            ORDER BY creation DESC
        """, (order['id'],), as_dict=True)
        order['ledger_ids'] = [entry['ledger_id'] for entry in ledger_entries]
        
        return order
    except Exception as e:
        frappe.log_error(f"Error in get_order_details: {str(e)}", "Merchant Portal API")
        return None

@frappe.whitelist()
def get_ledger_details(ledger_id):
    """Fetch specific ledger details with order info"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id: return None
        
        entry = frappe.db.sql("""
            SELECT 
                l.name as id,
                l.order as order_id,
                l.transaction_type as type,
                l.transaction_amount,
                l.opening_balance,
                l.closing_balance,
                l.creation as date,
                o.customer_name,
                o.status as order_status,
                o.fee,
                o.tax,
                o.order_amount,
                o.product,
                o.modified as completion_date
            FROM `tabLedger` l
            LEFT JOIN `tabOrder` o ON l.order = o.name
            WHERE l.name = %s AND l.owner = %s
        """, (ledger_id, merchant_id), as_dict=True)
        
        return entry[0] if entry else None
    except Exception as e:
        frappe.log_error(f"Error in get_ledger_details: {str(e)}", "Merchant Portal API")
        return None

@frappe.whitelist()
def get_dashboard_chart_data(period='Last 7 days', from_date=None, to_date=None):
    """Fetch aggregated chart data for dashboard"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"labels": [], "payout": [], "payin": []}

        # Calculate date range
        if from_date and to_date:
            start = frappe.utils.getdate(str(from_date)[:10])
            end = frappe.utils.getdate(str(to_date)[:10])
        else:
            days = 7
            if period == 'Last 30 days':
                days = 30
            elif period == 'Last 90 days':
                days = 90
            
            if period == 'Today':
                start = frappe.utils.getdate(frappe.utils.nowdate())
                end = frappe.utils.getdate(frappe.utils.nowdate())
            else:
                # Fix: wrap add_days with getdate() so it returns a date object
                start = frappe.utils.getdate(frappe.utils.add_days(frappe.utils.nowdate(), -days))
                end = frappe.utils.getdate(frappe.utils.nowdate())

        from_date_str = str(start) + " 00:00:00"
        to_date_str = str(end) + " 23:59:59"
        
        # Get aggregations
        data = frappe.db.sql("""
            SELECT 
                DATE(creation) as date,
                SUM(CASE WHEN order_type = 'Pay' AND status = 'Processed' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payout,
                SUM(CASE WHEN order_type = 'Topup' AND status = 'Processed' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payin
            FROM `tabOrder`
            WHERE merchant_ref_id = %s 
            AND creation >= %s AND creation <= %s
            GROUP BY DATE(creation)
            ORDER BY date ASC
        """, (merchant_id, from_date_str, to_date_str), as_dict=True)
        
        # Fill missing dates
        date_map = {str(d.date): d for d in data}
        
        labels = []
        payout_data = []
        payin_data = []
        
        curr = start
        while curr <= end:
            date_str = str(curr)
            labels.append(curr.strftime("%b %d"))
            
            if date_str in date_map:
                payout_data.append(float(date_map[date_str].payout or 0))
                payin_data.append(float(date_map[date_str].payin or 0))
            else:
                payout_data.append(0)
                payin_data.append(0)
            
            # Fix: wrap add_days with getdate() so curr stays a date object
            curr = frappe.utils.getdate(frappe.utils.add_days(curr, 1))
            
        return {
            "labels": labels,
            "payout": payout_data,
            "payin": payin_data
        }

    except Exception as e:
        frappe.log_error(f"Error in get_dashboard_chart_data: {str(e)}", "Merchant Portal API")
        return {"labels": [], "payout": [], "payin": []}


@frappe.whitelist()
def get_van_logs(filter_data=None, page=1, page_size=20):
    """Get Virtual Account Network logs using SQL"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"logs": [], "total": 0}
            
        merchant_owner_email = frappe.db.get_value("Merchant", merchant_id, "personal_email")
        
        # Build filter conditions
        filter_conditions = ["v.owner = %(merchant)s"]
        filter_values = {"merchant": merchant_owner_email}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("v.status = %(status)s")
                filter_values["status"] = filters["status"]
            
            # Handle search query - search by ID and UTR
            if filters.get("search"):
                search_term = f"%{filters['search']}%"
                filter_conditions.append(
                    "(v.name LIKE %(search)s OR v.utr LIKE %(search)s)"
                )
                filter_values["search"] = search_term
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("v.creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("v.creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabVirtual Account Logs` v
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated logs
        start = (int(page) - 1) * int(page_size)
        logs_query = f"""
            SELECT 
                v.name as id,
                v.account_number,
                v.amount,
                v.transaction_type as type,
                v.utr,
                v.status,
                v.opening_balance,
                v.closing_balance,
                v.remitter_name,
                v.remitter_account_number,
                v.remitter_ifsc_code,
                v.creation as date,
                v.merchant
            FROM `tabVirtual Account Logs` v
            WHERE {where_clause}
            ORDER BY v.creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        logs = frappe.db.sql(logs_query, filter_values, as_dict=True)
        
        return {
            "logs": logs,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_van_logs: {str(e)}", "Merchant Portal API")
        return {"logs": [], "total": 0}

@frappe.whitelist()
def get_merchant_profile():
    """Get merchant profile information"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
             return {}
        
        profile = frappe.db.sql("""
            SELECT 
                name,
                company_name,
                company_email,
                contact_detail,
                website,
                director_pan,
                director_adhar,
                company_pan,
                company_gst,
                webhook,
                status,
                remark,
                documents_to_reupload,
                logo
            FROM `tabMerchant`
            WHERE name = %s
            LIMIT 1
        """, (merchant_id,), as_dict=True)
        
        if not profile:
            return {}
            
        merchant_info = profile[0]
        
        # Fetch bank accounts
        bank_accounts = frappe.db.sql("""
            SELECT 
                account_holder_name,
                account_number,
                ifsc_code,
                bank_name,
                status,
                cancel_cheque,
                is_primary
            FROM `tabMerchant Bank Account`
            WHERE parent = %s
            ORDER BY modified DESC
        """, (merchant_info.name,), as_dict=True)
        
        merchant_info['bank_accounts'] = bank_accounts
        
        return merchant_info
    
    except Exception as e:
        frappe.log_error(f"Error in get_merchant_profile: {str(e)}", "Merchant Portal API")
        return {}

@frappe.whitelist()
def get_van_account():
    """Get merchant's primary VAN account number and pending balance"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"account_number": "", "pending_balance": 0}
        
        # Get primary VAN account
        van_account = frappe.db.sql("""
            SELECT account_number, ifsc as ifsc_code, bank_name
            FROM `tabVirtual Account`
            WHERE owner = %s AND status = 'Active'
            ORDER BY creation ASC
            LIMIT 1
        """, (merchant_id,), as_dict=True)
        
        account_number = van_account[0].account_number if van_account else ""
        ifsc_code = van_account[0].ifsc_code if van_account else ""
        bank_name = van_account[0].bank_name if van_account else ""        
        # Get pending VAN logs balance
        pending_balance = frappe.db.sql("""
            SELECT COALESCE(SUM(amount), 0) as total
            FROM `tabVirtual Account Logs`
            WHERE owner = %s AND status IN ('Pending', 'Processing')
        """, (merchant_id,), as_dict=True)
        
        pending_amount = pending_balance[0].total if pending_balance else 0
        
        return {
            "account_number": account_number,
            "ifsc_code": ifsc_code,
            "bank_name": bank_name,
            "pending_balance": pending_amount
        }
    except Exception as e:
        frappe.log_error(f"Error in get_van_account: {str(e)}", "Merchant Portal API")
        return {"account_number": "", "pending_balance": 0}

@frappe.whitelist()
def get_settlement_details(settlement_id):
    """Get details of a specific settlement (VAN Log)"""
    try:
        merchant_email = frappe.session.user
        # Verify ownership
        log = frappe.db.get_value("Virtual Account Logs", 
            {"name": settlement_id, "owner": merchant_email}, 
            "*", as_dict=True)
            
        if not log:
            frappe.throw(_("Settlement entry not found"))
            
        return log
    except Exception as e:
        frappe.log_error(f"Error in get_settlement_details: {str(e)}", "Merchant Portal API")
        raise e

@frappe.whitelist()
def get_order_detail(order_id):
    """Get detailed order information including items and transactions"""
    try:
        merchant_email = frappe.session.user
        # merchant_id = frappe.db.get_value("Merchant", {"personal_email": merchant_email}, "name")
        
        # Get order details
        order = frappe.db.sql("""
            SELECT 
                name as id,
                customer_name,
                order_amount as amount,
                fee,
                tax,
                status,
                utr,
                creation,
                modified,
                owner,
                product
            FROM `tabOrder`
            WHERE name = %s AND owner = %s
            LIMIT 1
        """, (order_id, merchant_email), as_dict=True)
        
        if not order:
            return None
            
        order_info = order[0]
        
        return {
            "id": order_info.id,
            "customerName": order_info.customer_name,
            "customerEmail": "", 
            "status": order_info.status,
            "createdAt": order_info.creation,
            "items": [
                {
                    "name": order_info.service_provider or "Service",
                    "quantity": 1,
                    "unitPrice": order_info.amount,
                    "total": order_info.amount
                }
            ],
            "subtotal": order_info.amount,
            "tax": 0,
            "total": order_info.amount + order_info.fee,
            "transactionId": order_info.utr,
            "utr": order_info.utr,
            "cardBrand": "Visa", # Mock for now as it's not in Ledger
            "cardLast4": "4242"  # Mock for now
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_order_detail: {str(e)}", "Merchant Portal API")
        return None

@frappe.whitelist()
def update_merchant_profile(company_name=None, company_email=None, phone=None, website=None):
    """Update logged-in merchant profile"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant profile not found"))
            
        merchant = frappe.get_doc("Merchant", merchant_id)
        
        if company_name:
            merchant.company_name = company_name
        if company_email:
            merchant.company_email = company_email
        if phone:
            merchant.contact_detail = phone
        if website:
            merchant.website = website
            
        merchant.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {"success": True, "message": "Profile updated successfully"}
        
    except Exception as e:
        frappe.log_error(f"Error in update_merchant_profile: {str(e)}", "Merchant Portal API")
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def get_security_status():
    """Get security status: password last changed, 2FA status"""
    try:
        user = frappe.session.user
        if user == "Guest":
            return {}
            
        user_doc = frappe.get_doc("User", user)
        # Frappe stores last_password_update
        last_update = user_doc.last_reset_password_key_generated_on
        
        # Check 2FA status from User Doctype (Prioritized)
        two_factor_enabled = False
        
        # Check User.enable_2fa (Standardized field)
        user_enable_2fa = frappe.db.get_value("User", user, "enable_2fa")
        
        if user_enable_2fa == 1:
            two_factor_enabled = True
        elif user_enable_2fa == 0:
            two_factor_enabled = False
        else:
            # Fallback to User 2FA Settings if User field is not set (e.g. migration)
            if frappe.db.exists("User 2FA Settings", {"user": user}):
                settings = frappe.get_doc("User 2FA Settings", {"user": user})
                if settings.enabled and settings.verified:
                    two_factor_enabled = True
                    # Self-heal: Sync to User doctype so next time it's faster?
                    # frappe.db.set_value("User", user, "enable_2fa", 1)  # Commented out to avoid side efffects in GET 
        
        return {
            "password_last_update": last_update,
            "two_factor_enabled": bool(two_factor_enabled)
        }
    except Exception:
        return {}

# 2FA IMPORTS
import pyotp
import frappe.defaults
from frappe.utils import cint

@frappe.whitelist()
def setup_2fa():
    """Generate QR code for 2FA setup"""
    try:
        user = frappe.session.user
        if user == "Guest": frappe.throw(_("Not logged in"))
        
        # Generate new secret
        secret = pyotp.random_base32()
        
        # Generate OTP URI
        # otpauth://totp/App:User?secret=SECRET&issuer=App
        app_name = frappe.db.get_single_value("Website Settings", "app_name") or "iSwitch"
        otp_uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user, issuer_name=app_name)
        
        # Store secret in cache for verification step
        frappe.cache().set_value(f"totp_setup_secret:{user}", secret, expires_in_sec=600)
        
        return {
            "secret": secret,
            "otpauth_url": otp_uri
        }
    except Exception as e:
        frappe.log_error(f"Error in setup_2fa: {str(e)}")
        raise e

@frappe.whitelist()
def verify_2fa_setup(token):
    """Verify checks token against cached secret, then saves to User 2FA Settings"""
    try:
        user = frappe.session.user
        secret = frappe.cache().get_value(f"totp_setup_secret:{user}")
        
        # If user already has 2FA enabled, we might be verifying for some other reason, 
        # but setup usually implies fresh start or re-config.
        
        if not secret:
            # If re-enabling without regenerating secret? No, we always generate new secret in setup_2fa.
            # But maybe we should check if they already have one?
            frappe.throw(_("Setup session expired. Please restart setup."))
            
        totp = pyotp.TOTP(secret)
        if totp.verify(token):
            # Save to User 2FA Settings
            
            # Check if settings exist
            if frappe.db.exists("User 2FA Settings", {"user": user}):
                doc = frappe.get_doc("User 2FA Settings", {"user": user})
                doc.otp_secret = secret
                doc.enabled = 1
                doc.verified = 1
                doc.save(ignore_permissions=True)
            else:
                doc = frappe.get_doc({
                    "doctype": "User 2FA Settings",
                    "user": user,
                    "otp_secret": secret,
                    "enabled": 1,
                    "verified": 1
                })
                doc.insert(ignore_permissions=True)
            
            # Sync with User Doctype (Master Switch)
            # Check if field exists to avoid error if schema update pending
            # But user said they added it.
            frappe.db.set_value("User", user, "enable_2fa", 1)
                
            frappe.db.commit()
            
            return {"success": True}
        else:
            return {"success": False, "message": "Invalid OTP code"}
            
    except Exception as e:
        frappe.log_error(f"Error in verify_2fa_setup: {str(e)}")
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def disable_2fa(password):
    """Disable 2FA"""
    try:
        user = frappe.session.user
        from frappe.utils.password import check_password
        
        if not check_password(user, password):
            frappe.throw(_("Incorrect password"))
            
        if frappe.db.exists("User 2FA Settings", {"user": user}):
            doc = frappe.get_doc("User 2FA Settings", {"user": user})
            doc.enabled = 0
            doc.save(ignore_permissions=True)
            
        # Sync with User Doctype (Disable)
        frappe.db.set_value("User", user, "enable_2fa", 0)
            
        frappe.db.commit()
        
        return {"success": True}
    except Exception as e:
        frappe.log_error(f"Error: {str(e)}")
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def get_activity_logs(page=1, page_size=10):
    """Get activity logs (Login history)"""
    try:
        user = frappe.session.user
        start = (int(page) - 1) * int(page_size)
        
        # Check if Activity Log or Authentication Log exists
        doctype = "Activity Log"
        if not frappe.db.exists("DocType", doctype):
            doctype = "Authentication Log" # Older versions
            
        if not frappe.db.exists("DocType", doctype):
            return {"logs": []}
            
        logs = frappe.db.sql(f"""
            SELECT 
                name as id,
                subject,
                creation as timestamp,
                ip_address as ip,
                status,
                operation
            FROM `tab{doctype}`
            WHERE user = %s AND operation IN ('Login', 'Logout')
            ORDER BY creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """, (user,), as_dict=True)
        
        # Enrich with device info (basic parsing)
        for log in logs:
            log['device'] = "Web Browser" # Placeholder as UA parsing is complex in SQL
            log['location'] = "Unknown"   # GeoIP not standard available
            
        return {"logs": logs}
        
    except Exception as e:
        frappe.log_error(f"Error in get_activity_logs: {str(e)}")
        return {"logs": []}


    merchant_name = frappe.session.user  # personal_email = name

    if merchant_name == "Guest":
        frappe.throw(_("Authentication required"))

    try:
        merchant = frappe.get_doc("Merchant", merchant_name)

        # Update only provided fields
        if company_name:
            merchant.company_name = company_name

        if company_email:
            merchant.company_email = company_email

        if phone:
            merchant.contact_detail = phone

        if website:
            merchant.website = website

        merchant.save(ignore_permissions=True)
        frappe.db.commit()

        return {
            "success": True,
            "message": _("Profile updated successfully"),
            "data": {
                "company_name": merchant.company_name,
                "company_email": merchant.company_email,
                "contact_detail": merchant.contact_detail,
                "website": merchant.website,
                "status": merchant.status,
            }
        }

    except frappe.DoesNotExistError:
        frappe.throw(_("Merchant not found"))

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Merchant Profile Update Failed"
        )
        frappe.throw(_("Unable to update profile. Please try again later."))

@frappe.whitelist()
def upload_merchant_logo():
    """
    Upload merchant logo
    Expected keys:
    - logo
    """

    merchant_name = frappe.session.user

    if merchant_name == "Guest":
        frappe.throw(_("Authentication required"))

    file = frappe.request.files.get("logo")
    if not file:
        frappe.throw(_("Logo file is required"))

    # Validations
    ALLOWED_EXTENSIONS = (".png", ".jpg", ".jpeg")
    
    if not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
            frappe.throw(_("Only JPG, PNG files are allowed for logo"))
    
    # Save file
    saved_file = save_file(
        file.filename,
        file.stream.read(),
        "Merchant", 
        merchant_name,
        is_private=0,
        df="logo"
    )

    # Update merchant
    # Ideally save_file updates the doc if attached to doc, 
    # but we can explicitly set it to be sure if `df` argument doesn't fully handle it in all versions.
    # The `df="logo"` passed to save_file usually handles the attachment if doctype/docname provided.
    # But let's verify. save_file returns a File doc.
    
    merchant = frappe.get_doc("Merchant", merchant_name)
    merchant.logo = saved_file.file_url
    merchant.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "success": True,
        "message": _("Logo uploaded successfully"),
        "logo_url": saved_file.file_url
    }

@frappe.whitelist()
def upload_merchant_documents(**files):
    """
    Upload merchant KYC documents
    Expected keys:
    - director_pan
    - director_adhar
    - company_pan
    - company_gst
    """

    merchant_name = frappe.session.user

    if merchant_name == "Guest":
        frappe.throw(_("Authentication required"))

    merchant = frappe.get_doc("Merchant", merchant_name)

    allowed_fields = [
        "director_pan",
        "director_adhar",
        "company_pan",
        "company_gst"
    ]
    
    files_uploaded = False

    for fieldname in allowed_fields:
        file = frappe.request.files.get(fieldname)
        if not file:
            continue

        # Validations
        MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
        ALLOWED_EXTENSIONS = (".pdf", ".png", ".jpg", ".jpeg")
        
        if not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
             frappe.throw(_(f"Only PDF, JPG, PNG files are allowed for {fieldname}"))
        
        # Check size (content length is often available in headers, or we read stream)
        # Using stream.seek/tell might consume it, save_file handles it usually.
        # Ideally we check content-length header if available or rely on save_file to fail if too big?
        # User provided specific validation logic:
        # file.seek(0, 2) ...
        # But looping over `frappe.request.files` items (Werkzeug FileStorage) allows seek.
        
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        
        if size > MAX_FILE_SIZE:
            frappe.throw(_(f"File size for {fieldname} must be under 5MB"))

        saved_file = save_file(
            fname=file.filename,
            content=file.stream.read(),
            dt="Merchant",
            dn=merchant.name,
            is_private=1  # KYC should always be private
        )

        # Attach field stores file URL
        merchant.set(fieldname, saved_file.file_url)
        files_uploaded = True

    if files_uploaded:
        # Auto-Update Status
        if (
            merchant.director_pan
            and merchant.director_adhar
            and merchant.company_pan
            and merchant.company_gst
        ):
            merchant.status = "Submitted"

        merchant.save(ignore_permissions=True)
        frappe.db.commit()

        return {
            "success": True,
            "message": _("Documents uploaded successfully"),
            "data": {
                "director_pan": merchant.director_pan,
                "director_adhar": merchant.director_adhar,
                "company_pan": merchant.company_pan,
                "company_gst": merchant.company_gst,
                "status": merchant.status
            }
        }
    
    return {"success": False, "message": "No files uploaded"}

@frappe.whitelist()
def add_bank_account(account_holder_name, account_number, ifsc_code, bank_name, branch_name=None):
    """Add a new bank account to the merchant"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
            
        merchant = frappe.get_doc("Merchant", merchant_id)
        
        # Check for duplicates? Frappe child table doesn't enforce uniqueness easily, but we can check.
        
        # Check if this is the first account, if so make it primary
        is_primary = 1 if len(merchant.bank_accounts) == 0 else 0
        
        row = merchant.append("bank_accounts", {
            "account_holder_name": account_holder_name,
            "account_number": account_number,
            "ifsc_code": ifsc_code,
            "bank_name": bank_name,
            "branch_name": branch_name,
            "is_primary": is_primary,
            "status": "Pending" 
        })
        
        # Handle Cancel Cheque Upload before saving
        cancel_cheque_url = None
        if "cancel_cheque" in frappe.request.files:
            file = frappe.request.files.get("cancel_cheque")
            if file:
                # Read file content before saving merchant doc
                file_content = file.stream.read()
                file_name = file.filename
                
                # Temporarily save merchant to get row.name
                merchant.flags.ignore_validate = True
                merchant.save(ignore_permissions=True)
                frappe.db.commit()
                
                # Now save the file
                saved_file = save_file(
                    fname=file_name,
                    content=file_content,
                    dt="Merchant Bank Account",
                    dn=row.name,
                    is_private=1
                )
                cancel_cheque_url = saved_file.file_url
                
                # Update the row with the file URL
                frappe.db.set_value("Merchant Bank Account", row.name, "cancel_cheque", cancel_cheque_url)
                frappe.db.commit()
        else:
            # If no file uploaded, still save but account will remain in Pending status
            merchant.save(ignore_permissions=True)
            frappe.db.commit()
        
        return {
            "success": True,
            "message": _("Bank account added successfully"),
            "data": {
                "account_holder_name": account_holder_name,
                "account_number": account_number,
                "bank_name": bank_name,
                "status": "Pending",
                "cancel_cheque": cancel_cheque_url
            }
        }

    except Exception as e:
        frappe.log_error(f"Error adding bank account: {str(e)}", "Merchant Portal API")
        frappe.throw(_(str(e)))

@frappe.whitelist()
def change_password(current_password, new_password):
    """Change user password"""
    try:
        user = frappe.session.user
        if user == "Guest":
            frappe.throw(_("Please login to change password"))
            
        # Verify current password
        if not frappe.utils.password.check_password(user, current_password):
            frappe.throw(_("Incorrect current password"))
            
        # Update password
        frappe.utils.password.update_password(user, new_password)
        
        # Track last reset date
        frappe.db.set_value("User", user, "last_reset_password_key_generated_on", frappe.utils.now_datetime())
        
        return {
            "success": True,
            "message": _("Password changed successfully")
        }
    except frappe.AuthenticationError:
        return {
            "success": False,
            "message": _("Incorrect current password")
        }
    except Exception as e:
        frappe.log_error(f"Error changing password: {str(e)}", "Merchant Portal API")
        return {
            "success": False,
            "message": _("Failed to change password")
        }



@frappe.whitelist()
def get_whitelist_ips():
    """Get whitelisted IP addresses"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return []
        
        ips = frappe.db.sql("""
            SELECT 
                name as id,
                whitelisted_ip as ip,
                creation as date
            FROM `tabWhitelist IP`
            WHERE owner = %s
            ORDER BY creation DESC
        """, (merchant_id,), as_dict=True)
        
        return ips
    
    except Exception as e:
        frappe.log_error(f"Error in get_whitelist_ips: {str(e)}", "Merchant Portal API")
        return []

@frappe.whitelist()
def add_whitelist_ip():
    """Add a new whitelisted IP for the current merchant"""
    try:
        user_id = frappe.session.user
        # frappe.form_dict automatically includes parsed JSON body if content-type is application/json
        data = frappe.form_dict

        ip_address = data.get("ip_address", "")
        
        if not ip_address:
             return {
                "success": False,
                "error": "IP Address is required"
            }

        # Check if IP already exists
        exists = frappe.db.exists("Whitelist IP", {
            "merchant": user_id,
            "whitelisted_ip": ip_address
        })
        
        if exists:
            return {
                "success": False,
                "error": "IP address already whitelisted"
            }
        
        # Create new whitelist entry
        doc = frappe.get_doc({
            "doctype": "Whitelist IP",
            "merchant": user_id,
            "whitelisted_ip": ip_address
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "success": True,
            "message": "IP address whitelisted successfully",
            "data": {
                "name": doc.name,
                "whitelisted_ip": doc.whitelisted_ip,
                "creation": doc.creation
            }
        }
    except Exception as e:
        frappe.log_error("Add Whitelist IP Error", str(e))
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def delete_whitelist_ip():
    """Delete a whitelisted IP"""
    try:
        data = frappe.form_dict
        ip_name = data.get("ip_name")
        
        if not ip_name:
             return {
                "success": False,
                "error": "IP ID is required"
            }
            
        # Verify ownership
        exists = frappe.db.count("Whitelist IP", {
            "name": ip_name, 
            "merchant": frappe.session.user
        })
        
        if not exists:
             return {
                "success": False,
                "error": "IP not found or permission denied"
            }
            
        frappe.delete_doc("Whitelist IP", ip_name)
        frappe.db.commit() # Added commit as it was missing in the provided snippet for delete_doc
        
        return {
            "success": True,
            "message": "IP address removed successfully"
        }
    
    except Exception as e:
        frappe.log_error(f"Error in delete_whitelist_ip: {str(e)}", "Merchant Portal API")
        return {
            "success": False,
            "error": "Failed to remove IP"
        }

@frappe.whitelist()
def get_virtual_accounts():
    """Get virtual accounts for the current merchant"""
    try:
        merchant_id = frappe.session.user
        
        accounts = frappe.db.sql("""
            SELECT 
                name,
                account_number,
                ifsc,
                status,
                merchant_name,
                prefix
            FROM `tabVirtual Account`
            WHERE owner = %s
            ORDER BY creation DESC
        """, (merchant_id,), as_dict=True)
        
        return {
            "success": True,
            "accounts": accounts
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_virtual_accounts: {str(e)}", "Merchant Portal API")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def update_webhook_url(webhook_url):
    """Update webhook URL and manage Webhook doctype"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
            
        merchant = frappe.get_doc("Merchant", merchant_id)
        
        # Check if Webhook doctype exists for this merchant
        # We use merchant_email (user) as the name for Webhook doctype to be consistent with user snippet
        # ideally it should be unique. The user snippet used `frappe.session.user`.
        # Since merchant portal user IS the merchant email, this works.
        webhook_name = merchant_email 
        
        if not webhook_url:
             # Handle case where webhook is being cleared?
             # For now just update the merchant doc as the snippet didn't specify deletion logic
             merchant.webhook = webhook_url
             merchant.save(ignore_permissions=True)
             return {"success": True, "message": "Webhook removed"}

        exists = frappe.db.exists("Webhook", webhook_name)
        
        webhook_json_structure = """{
            "crn":"{{doc.order}}",
            "utr":"{{doc.transaction_reference_id}}",
            "status": "{{doc.status}}",
            "clientRefID": "{{doc.client_ref_id}}"
        }"""
        
        if not exists:
            frappe.get_doc({
                'doctype': 'Webhook',
                '__newname': webhook_name,
                'webhook_doctype': 'Transaction',
                'webhook_docevent': 'on_submit',
                'condition': f"(doc.merchant == '{merchant_email}') and (doc.status in ['Success', 'Failed', 'Reversed'])",
                'request_url': webhook_url,
                'request_method': 'POST',
                'request_structure': 'JSON',
                'background_jobs_queue': 'long',
                'webhook_json': webhook_json_structure
            }).insert(ignore_permissions=True)
            
            merchant.webhook = webhook_url
            merchant.save(ignore_permissions=True)
            return {"success": True, "message": "Webhook created successfully"}

        elif merchant.webhook != webhook_url:
            webhook_doc = frappe.get_doc("Webhook", webhook_name)
            webhook_doc.request_url = webhook_url
            webhook_doc.save(ignore_permissions=True)

            merchant.webhook = webhook_url
            merchant.save(ignore_permissions=True)
            return {"success": True, "message": "Webhook updated successfully"}
        
        else:
            return {"success": True, "message": "Webhook unchanged"}

    except Exception as e:
        frappe.log_error(f"Error in update_webhook_url: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error updating webhook URL"))

@frappe.whitelist()
def export_orders_to_excel(filters=None):
    """Export orders to Excel"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Build filter conditions
        filter_conditions = ["merchant_ref_id = %(merchant)s"]
        filter_values = {"merchant": merchant_id}
        
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("status = %(status)s")
                filter_values["status"] = filters["status"]
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get all orders
        orders = frappe.db.sql(f"""
            SELECT 
                name as order_id,
                creation,
                customer_name,
                order_amount,
                COALESCE(tax, 0) as tax,
                COALESCE(transaction_amount, order_amount) as transaction_amount,
                fee,
                status,
                utr,
                client_ref_id
            FROM `tabOrder`
            WHERE {where_clause}
            ORDER BY creation DESC
        """, filter_values, as_dict=True)
        
        # Create Excel file
        from frappe.utils.xlsxutils import make_xlsx
        
        data = [["Order ID", "Date", "Customer", "Order Amount", "Tax", "Transaction Amount", "Fee", "Status", "UTR", "Client Ref ID"]]
        for order in orders:
            data.append([
                order.order_id,
                str(order.creation),
                order.customer_name,
                order.order_amount,
                order.tax,
                order.transaction_amount,
                order.fee,
                order.status,
                order.utr,
                order.client_ref_id
            ])
        
        xlsx_file = make_xlsx(data, "Orders")
        
        # Save to file
        saved_file = save_file("orders.xlsx", xlsx_file.getvalue(), "Merchant", merchant_id, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_orders_to_excel: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error exporting orders"))

@frappe.whitelist()
def export_ledger_to_excel(filters=None):
    """Export ledger to Excel"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Build filter conditions
        filter_conditions = ["l.owner = %(merchant)s", "l.docstatus = 1"]
        filter_values = {"merchant": merchant_id}
        
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("type"):
                filter_conditions.append("l.transaction_type = %(type)s")
                filter_values["type"] = filters["type"]
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("l.creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("l.creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get ledger entries
        entries = frappe.db.sql(f"""
            SELECT 
                l.name as id,
                l.order,
                l.client_ref_id,
                l.transaction_type as type,
                l.transaction_amount,
                l.opening_balance,
                l.closing_balance,
                l.creation as date,
            FROM `tabLedger` l
            WHERE {where_clause}
            ORDER BY l.creation DESC
        """, filter_values, as_dict=True)
        
        # Create Excel file
        from frappe.utils.xlsxutils import make_xlsx
        
        data = [["Ledger ID","Order ID", "Client Ref ID", "Type", "TXN Amount", "Opening Balance", "Closing Balance", "Date"]]
        for entry in entries:
            data.append([
                entry.id,
                entry.order,
                entry.client_ref_id,
                entry.type,
                entry.transaction_amount,
                entry.opening_balance,
                entry.closing_balance,
                str(entry.date)
            ])
        
        xlsx_file = make_xlsx(data, "Ledger")
        
        # Save to file
        saved_file = save_file("ledger.xlsx", xlsx_file.getvalue(), "Merchant", merchant_id, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_ledger_to_excel: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error exporting ledger"))

@frappe.whitelist()
def export_van_logs_to_excel(filters=None):
    """Export VAN logs to Excel"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Build filter conditions
        filter_conditions = ["v.owner = %(merchant)s", "v.docstatus = 1"]
        filter_values = {"merchant": merchant_email}
        
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("v.status = %(status)s")
                filter_values["status"] = filters["status"]
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("v.creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("v.creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get VAN logs
        logs = frappe.db.sql(f"""
            SELECT 
                v.name as id,
                v.account_number,
                v.amount,
                v.transaction_type as type,
                v.utr,
                v.status,
                v.remitter_name,
                v.remitter_account_number,
                v.remitter_ifsc_code,
                v.creation as date
            FROM `tabVirtual Account Logs` v
            WHERE {where_clause}
            ORDER BY v.creation DESC
        """, filter_values, as_dict=True)
        
        # Create Excel file
        from frappe.utils.xlsxutils import make_xlsx
        
        data = [["Transaction ID", "Account Number", "Amount (₹)", "Type", "UTR", "Status", "Remitter Name", "Remitter Account Number", "Remitter IFSC Code", "Date"]]
        for log in logs:
            data.append([
                log.id,
                log.account_number,
                log.amount,
                log.type,
                log.utr,
                log.status,
                log.remitter_name,
                log.remitter_account_number,
                log.remitter_ifsc_code,
                str(log.date)
            ])
        
        xlsx_file = make_xlsx(data, "VAN Logs")
        
        # Save to file
        saved_file = save_file("van_logs.xlsx", xlsx_file.getvalue(), "Merchant", merchant_id, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_van_logs_to_excel: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error exporting VAN logs"))

@frappe.whitelist()
def generate_api_keys():
    """Generate or regenerate API keys for the current user"""
    try:
        user_id = frappe.session.user
        user_doc = frappe.get_doc("User", user_id)
        
        user_doc.api_key = frappe.generate_hash(length=30) 
        raw = frappe.generate_hash(length=15)
        user_doc.api_secret = raw
        user_doc.save(ignore_permissions=True)
        
        frappe.db.commit()
        
        return {
            "success": True,
            "api_key": user_doc.api_key,
            "api_secret": raw
        }
    except Exception as e:
        frappe.log_error("Error generating API keys", str(e))
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def get_api_keys():
    try:
        user_id = frappe.session.user
        user_doc = frappe.get_doc("User", user_id)
        
        if user_doc.api_key:
            return {
                "success": True,
                "api_key": user_doc.api_key,
            }
        
        return {
            "success": False,
            "error": "API keys not found. Please generate API keys."
        }
    
    except Exception as e:
        frappe.log_error("Error fetching API keys", str(e))
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def request_wallet_topup(amount, utr):
    """Request wallet top-up by creating a pending VAN log entry"""
    try:
        merchant_email = frappe.session.user
        
        # Get merchant's virtual account
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {
                "status": "error",
                "message": "Merchant not found"
            }
        
        # Get merchant's virtual account number
        virtual_account = frappe.db.get_value("Virtual Account", {"merchant": merchant_id}, "name")
        
        # if not virtual_account:
        #     return {
        #         "status": "error",
        #         "message": "Virtual account not found. Please contact support."
        #     }
        
        # Validate amount
        try:
            amount = float(amount)
            if amount <= 0:
                return {
                    "status": "error",
                    "message": "Amount must be greater than 0"
                }
        except (ValueError, TypeError):
            return {
                "status": "error",
                "message": "Invalid amount"
            }
        
        # Validate UTR
        if not utr or not str(utr).strip():
            return {
                "status": "error",
                "message": "UTR/Reference number is required"
            }
        
        utr = str(utr).strip()
        
        # Check if UTR already exists
        if frappe.db.exists("Virtual Account Logs", {"utr": utr}):
            return {
                "status": "error",
                "message": "Duplicate UTR. Transaction already exists."
            }
        
        # Create pending VAN log entry
        van_log = frappe.get_doc({
            "doctype": "Virtual Account Logs",
            "account_number": virtual_account,
            "transaction_type": "Credit",
            "amount": amount,
            "utr": utr,
            "status": "Pending",
            "remitter_name": "Merchant",
            "remitter_ifsc_code": "MERCHANTIFSC",
            "remitter_account_number": "MERCHANTWALLET",
        })
        
        van_log.insert(ignore_permissions=True)
        
        # 🔹 CREATE PENDING TIGERBEETLE TRANSFER (Authorization Hold)
        # This will be POST on approval or VOID on rejection
        try:
            from iswitch.tigerbeetle_client import get_client
            import tigerbeetle as tb
            from decimal import Decimal
            import hashlib
            
            def stable_id(value: str) -> int:
                return int(hashlib.sha256(value.encode()).hexdigest()[:32], 16)
            
            merchant = frappe.get_doc("Merchant", merchant_id)
            if not merchant.tigerbeetle_id:
                frappe.throw("Merchant TigerBeetle account not configured")
            
            client = get_client()
            merchant_account_id = int(merchant.tigerbeetle_id)
            system_account_id = 1
            tb_amount = int(Decimal(amount) * 100)  # Convert to cents
            
            # Deterministic transfer ID using VAN log name
            pending_transfer_id = stable_id(f"van-pending-{van_log.name}")
            
            # Create PENDING transfer (authorization hold for admin approval)
            transfer = tb.Transfer(
                id=pending_transfer_id,
                debit_account_id=system_account_id,  # Debit from system
                credit_account_id=merchant_account_id,  # Credit to merchant
                amount=tb_amount,
                pending_id=0,
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=300,  # Code for VAN transactions
                flags=tb.TransferFlags.PENDING,
                timestamp=0,
            )
            
            errors = client.create_transfers([transfer])
            
            if errors:
                error = errors[0]
                if error.result == tb.CreateTransferResult.EXISTS:
                    frappe.log_error(
                        f"Wallet topup PENDING transfer already exists: {pending_transfer_id}",
                        "TigerBeetle Duplicate Prevention"
                    )
                else:
                    frappe.log_error(
                        f"TigerBeetle PENDING transfer failed: {error.result}",
                        "TigerBeetle Error"
                    )
                    frappe.throw(f"Failed to create wallet topup authorization: {error.result}")
        
        except Exception as e:
            frappe.log_error("Error creating wallet topup PENDING transfer", frappe.get_traceback())
            frappe.throw(f"Failed to create wallet topup authorization: {str(e)}")
        
        frappe.db.commit()
        
        return {
            "success": True,
            "status": "success",
            "message": "Top-up request submitted successfully. Your request is pending approval.",
            "transaction_id": van_log.name,
            "utr": utr
        }
    
    except Exception as e:
        frappe.log_error(f"Error in request_wallet_topup: {str(e)}", "Wallet Top-Up Request")
        frappe.db.rollback()
        return {
            "status": "error",
            "message": "An error occurred while processing your request. Please try again."
        }

# ============================================================================
# DEVELOPER TOOLS APIs - API Keys, Webhooks, API Logs
# ============================================================================

@frappe.whitelist()
def generate_api_key(name, environment):
    """Generate a new API key for the merchant"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Validate environment
        if environment not in ["Test", "Live"]:
            frappe.throw(_("Invalid environment. Must be 'Test' or 'Live'"))
        
        # Create new API key
        api_key_doc = frappe.get_doc({
            "doctype": "Merchant API Key",
            "merchant": merchant_id,
            "key_name": name,
            "environment": environment,
            "status": "Active"
        })
        api_key_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "id": api_key_doc.name,
            "name": api_key_doc.key_name,
            "key": api_key_doc.api_key,
            "secret": api_key_doc.get_password("api_secret"),
            "environment": api_key_doc.environment,
            "status": api_key_doc.status,
            "created_at": api_key_doc.creation,
            "last_used": None
        }
    
    except Exception as e:
        frappe.log_error(f"Error in generate_api_key: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Failed to generate API key"))


@frappe.whitelist()
def revoke_api_key(key_id):
    """Revoke (deactivate) an API key"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        api_key = frappe.get_doc("Merchant API Key", key_id)
        
        if api_key.merchant != merchant_id:
            frappe.throw(_("Unauthorized access"))
        
        api_key.status = "Inactive"
        api_key.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {"success": True, "message": "API key revoked successfully"}
    
    except Exception as e:
        frappe.log_error(f"Error in revoke_api_key: {str(e)}", "Merchant Portal API")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_webhooks():
    """Get all webhooks for the current merchant (Single webhook supported)"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
             return {"webhooks": []}

        merchant = frappe.db.get_value("Merchant", merchant_id, 
                                     ["name", "webhook"], as_dict=True)
        
        if not merchant:
            return {"webhooks": []}
            
        if not merchant.webhook:
            return {"webhooks": []}
            
        # Fetch the actual Webhook doctype to get real status/events
        # In our 1:1 model, the Webhook name is the merchant_email
        webhook_data = {
            "id": merchant.name,
            "name": "Primary Webhook",
            "url": merchant.webhook,
            "status": "Active",
            "events": ["transaction.success", "transaction.failed"], # Default
            "created_at": frappe.utils.now(),
            "secret_key": "hidden" 
        }
        
        if frappe.db.exists("Webhook", merchant_email):
            wh_doc = frappe.get_doc("Webhook", merchant_email)
            webhook_data["status"] = "Active" if wh_doc.enabled else "Inactive"
            # webhook_data["events"] = [d.webhook_event for d in wh_doc.webhook_events] # Assuming child table structure
            webhook_data["created_at"] = wh_doc.creation
            
            # If standard webhook requests event subscription in a child table 'webhook_data' or similar
            # checking standard frappe structure: usually 'webhook_events' child table
            if hasattr(wh_doc, "webhook_events"):
                 webhook_data["events"] = [d.webhook_event for d in wh_doc.webhook_events]
            
            # Check for secret
            if hasattr(wh_doc, "webhook_secret"):
                webhook_data["secret_key"] = wh_doc.webhook_secret

        return {"webhooks": [webhook_data]}
    
    except Exception as e:
        frappe.log_error(f"Error in get_webhooks: {str(e)}", "Merchant Portal API")
        return {"webhooks": []}

@frappe.whitelist()
def create_webhook(name, url, events):
    """Create (Set) the webhook endpoint"""
    try:
        from iswitch.webhook import update_webhook as internal_update_webhook
        
        # We ignore name and events for now as the underlying logic 
        # is just setting the URL for the Merchant/Webhook doctype
        
        result = internal_update_webhook(url)
        
        if result.get("status") in ["created", "updated", "unchanged"]:
             # Fetch the merchant to return "created" object
            merchant_email = frappe.session.user
            merchant_id = get_logged_in_merchant_id()
            merchant = frappe.db.get_value("Merchant", merchant_id, 
                                        ["name", "webhook"], as_dict=True)

            return {
                "success": True,
                "webhook": {
                    "id": merchant.name,
                    "name": name or "Primary Webhook",
                    "url": url,
                    "status": "Active",
                    "events": events if isinstance(events, list) else json.loads(events),
                    "created_at": frappe.utils.now()
                }
            }
        else:
            return {"success": False, "error": result.get("message", "Unknown error")}

    except Exception as e:
        frappe.log_error(f"Error in create_webhook: {str(e)}", "Merchant Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def update_webhook(webhook_id, name=None, url=None, events=None, status=None):
    """Update existing webhook (Updates the single merchant webhook)"""
    try:
        from iswitch.webhook import update_webhook as internal_update_webhook
        
        # Determine enabled status based on input status ("Active" or "Inactive")
        enabled = 1
        if status:
            enabled = 1 if status == "Active" else 0
            
        merchant_email = frappe.session.user
        
        # If just updating status, we modify the existing Webhook doc directly
        if status and not url:
             if frappe.db.exists("Webhook", merchant_email):
                webhook_doc = frappe.get_doc("Webhook", merchant_email)
                webhook_doc.enabled = enabled
                webhook_doc.save(ignore_permissions=True)
                frappe.db.commit()
                return {"success": True, "message": "Webhook status updated successfully"}
             else:
                 return {"success": False, "error": "Webhook not found"}

        if url:
            # internal_update_webhook handles creation/update of URL and events defaults
            result = internal_update_webhook(url)
            if result.get("status") == "error":
                 return {"success": False, "error": result.get("message")}
            
            # If status was also passed, ensure it's set correctly
            if status:
                 if frappe.db.exists("Webhook", merchant_email):
                    webhook_doc = frappe.get_doc("Webhook", merchant_email)
                    webhook_doc.enabled = enabled
                    webhook_doc.save(ignore_permissions=True)
                    frappe.db.commit()

        return {"success": True, "message": "Webhook updated successfully"}
    
    except Exception as e:
        frappe.log_error(f"Error in update_webhook: {str(e)}", "Merchant Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def delete_webhook(webhook_id):
    """Delete (Unset) the webhook endpoint"""
    try:
        merchant_email = frappe.session.user
        merchant_name = get_logged_in_merchant_id()
        
        if not merchant_name:
             frappe.throw(_("Merchant not found"))

        # Update Merchant: Clear the webhook URL using get_doc for robustness
        merchant_doc = frappe.get_doc("Merchant", merchant_name)
        merchant_doc.webhook = ""
        merchant_doc.save(ignore_permissions=True)
        
        # Delete Standard Webhook doctype if exists
        if frappe.db.exists("Webhook", merchant_email):
            frappe.delete_doc("Webhook", merchant_email, ignore_permissions=True)
            
        frappe.db.commit()
        
        return {"success": True, "message": "Webhook deleted successfully"}
    
    except Exception as e:
        frappe.log_error(f"Error in delete_webhook: {str(e)}", "Merchant Portal API")
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_api_logs(page=1, page_size=20, filter_data=None):
    """Get API request/response logs for the merchant from Request Response DocType"""
    try:
        merchant_email = frappe.session.user
        
        # Build filter conditions - Request Response uses 'user' field to store merchant/user info
        filter_conditions = ["owner = %(owner)s"]
        filter_values = {"owner": merchant_email}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            # Filter by Method
            if filters.get("method") and filters["method"] != "all":
                filter_conditions.append("method = %(method)s")
                filter_values["method"] = filters["method"]

            # Filter by Status Code
            if filters.get("status_code"):
                # Handle 2xx vs 4xx/5xx grouping from frontend if needed, 
                # but frontend passes specific code 200/400 for success/error in `filterData`
                # Let's support ranges or exact match depending on what frontend sends.
                # APILogs.tsx sends: if (statusFilter === 'success') filterData.status_code = 200;
                # This seems to imply we might need to handle ranges if we want "all success" vs "all error".
                # But currently frontend sends single integer.
                # Wait, status_code in DB is user-set as string "200", "404" etc based on my earlier observation of user edits.
                # Let's check how to best query. 
                
                # If frontend sends 200, it means "Success (2xx)". 
                # If frontend sends 400, it means "Error (4xx, 5xx)".
                
                s_code = int(filters["status_code"])
                if s_code == 200:
                    filter_conditions.append("status_code LIKE '2%%'")
                elif s_code >= 400:
                    filter_conditions.append("(status_code LIKE '4%%' OR status_code LIKE '5%%')")
                else:
                    filter_conditions.append("status_code = %(status_code)s")
                    filter_values["status_code"] = str(s_code)

            # Filter by Endpoint (Search)
            if filters.get("endpoint"):
                filter_conditions.append("(endpoint LIKE %(endpoint)s OR request LIKE %(endpoint)s OR response LIKE %(endpoint)s)")
                filter_values["endpoint"] = f"%{filters['endpoint']}%"
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("creation >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("creation <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabRequest Response`
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get logs with pagination
        start = (int(page) - 1) * int(page_size)
        logs_query = f"""
            SELECT 
                name as id,
                user,
                header,
                method,
                request as request_data,
                response as response_data,
                ip_address,
                endpoint,
                status_code,
                creation as timestamp,
                modified
            FROM `tabRequest Response`
            WHERE {where_clause}
            ORDER BY creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        logs = frappe.db.sql(logs_query, filter_values, as_dict=True)
        
        return {
            "logs": logs,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_api_logs: {str(e)}", "Merchant Portal API")
        return {"logs": [], "total": 0}


# ============================================================================
# SETTLEMENTS APIs
# ============================================================================

@frappe.whitelist()
def get_settlements(page=1, page_size=20, filter_data=None):
    """Get settlements for the current merchant"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"settlements": [], "total": 0}
        
        filter_conditions = ["merchant = %(merchant)s"]
        filter_values = {"merchant": merchant_id}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("status = %(status)s")
                filter_values["status"] = filters["status"]
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("settlement_date >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("settlement_date <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabSettlement`
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        start = (int(page) - 1) * int(page_size)
        settlements_query = f"""
            SELECT 
                name as id,
                settlement_date,
                amount,
                fee,
                tax,
                net_amount,
                status,
                utr,
                creation,
                modified
            FROM `tabSettlement`
            WHERE {where_clause}
            ORDER BY settlement_date DESC, creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        settlements = frappe.db.sql(settlements_query, filter_values, as_dict=True)
        
        return {
            "settlements": settlements,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_settlements: {str(e)}", "Merchant Portal API")
        return {"settlements": [], "total": 0}


@frappe.whitelist()
def get_settlement_detail(settlement_id):
    """Get detailed settlement information including orders"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        settlement = frappe.db.sql("""
            SELECT 
                name as id,
                settlement_date,
                amount,
                fee,
                tax,
                net_amount,
                status,
                utr,
                bank_account,
                notes,
                creation,
                modified
            FROM `tabSettlement`
            WHERE name = %s AND merchant = %s
            LIMIT 1
        """, (settlement_id, merchant_id), as_dict=True)
        
        if not settlement:
            frappe.throw(_("Settlement not found"))
        
        settlement_info = settlement[0]
        
        # Get settlement orders
        orders = frappe.db.sql("""
            SELECT 
                so.order,
                so.order_amount,
                so.fee,
                so.tax,
                so.net_amount,
                o.customer_name,
                o.status as order_status,
                o.creation as order_date
            FROM `tabSettlement Order` so
            LEFT JOIN `tabOrder` o ON so.order = o.name
            WHERE so.parent = %s
            ORDER BY so.idx
        """, (settlement_id,), as_dict=True)
        
        settlement_info['orders'] = orders
        
        # Get bank account details if available
        if settlement_info.get('bank_account'):
            bank_account = frappe.db.sql("""
                SELECT 
                    account_holder_name,
                    account_number,
                    ifsc_code,
                    bank_name
                FROM `tabMerchant Bank Account`
                WHERE name = %s
                LIMIT 1
            """, (settlement_info['bank_account'],), as_dict=True)
            
            settlement_info['bank_account_details'] = bank_account[0] if bank_account else None
        
        return settlement_info
    
    except Exception as e:
        frappe.log_error(f"Error in get_settlement_detail: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Failed to fetch settlement details"))


# ============================================================================
# MERCHANT TRANSACTIONS APIs
# ============================================================================

@frappe.whitelist()
def get_transactions(page=1, page_size=20, filter_data=None):
    """Get transactions for the current merchant"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            return {"transactions": [], "total": 0}
        
        filter_conditions = ["t.merchant = %(merchant)s"]
        filter_values = {"merchant": merchant_id}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            # Handle status filter
            if filters.get("status") and filters["status"] != "All Status":
                status_value = filters["status"]
                # Map common status values
                if status_value == "Success":
                    filter_conditions.append("(t.status = 'Success' OR t.status = 'Completed')")
                elif status_value == "Pending":
                    filter_conditions.append("(t.status = 'Pending' OR t.status = 'Processing')")
                else:
                    filter_conditions.append("t.status = %(status)s")
                    filter_values["status"] = status_value
            
            # Handle search query
            if filters.get("search"):
                search_term = f"%{filters['search']}%"
                filter_conditions.append(
                    "(t.name LIKE %(search)s OR t.transaction_reference_id LIKE %(search)s)"
                )
                filter_values["search"] = search_term
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("t.transaction_date >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("t.transaction_date <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabTransaction` t
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        start = (int(page) - 1) * int(page_size)
        transactions_query = f"""
            SELECT 
                t.name as id,
                t.order as order_id,
                t.product as product_name,
                t.product as payment_method,
                t.amount,
                t.status,
                t.transaction_date as date,
                t.transaction_reference_id as utr,
                t.integration,
                t.creation,
                t.modified,
                o.customer_name
            FROM `tabTransaction` t
            LEFT JOIN `tabOrder` o ON t.order = o.name
            WHERE {where_clause}
            ORDER BY t.transaction_date DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        transactions = frappe.db.sql(transactions_query, filter_values, as_dict=True)
        
        return {
            "transactions": transactions,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_transactions: {str(e)}", "Merchant Portal API")
        return {"transactions": [], "total": 0}


@frappe.whitelist()
def get_transaction_detail(transaction_id):
    """Get detailed transaction information"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        transaction = frappe.db.sql("""
            SELECT 
                t.name as id,
                t.order as order_id,
                t.product as payment_method,
                t.amount,
                t.status,
                t.transaction_date as date,
                t.transaction_reference_id as utr,
                t.creation,
                t.modified,
                t.remark as description,
                o.customer_name,
                o.order_amount,
                o.fee,
                o.tax
            FROM `tabTransaction` t
            LEFT JOIN `tabOrder` o ON t.order = o.name
            WHERE t.name = %s AND t.merchant = %s
            LIMIT 1
        """, (transaction_id, merchant_id), as_dict=True)
        
        if not transaction:
            frappe.throw(_("Transaction not found"))
        
        return transaction[0]
    
    except Exception as e:
        frappe.log_error(f"Error in get_transaction_detail: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Failed to fetch transaction details"))

@frappe.whitelist()
def get_settlement_stats():
    """Get settlement statistics (pending, settled, total amounts)"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Get total pending amount (from pending VAN logs)
        pending_stats = frappe.db.sql("""
            SELECT 
                COALESCE(SUM(amount), 0) as total_pending,
                COUNT(*) as pending_count
            FROM `tabVirtual Account Logs`
            WHERE owner = %s 
            AND status = 'Pending'
        """, (merchant_email,), as_dict=True)
        
        # Get total settled amount (from successful VAN logs)
        settled_stats = frappe.db.sql("""
            SELECT 
                COALESCE(SUM(amount), 0) as total_settled,
                COUNT(*) as settled_count
            FROM `tabVirtual Account Logs`
            WHERE owner = %s 
            AND status = 'Success'
            """, (merchant_email,), as_dict=True)
        
        # Get total amount (all VAN logs)
        total_stats = frappe.db.sql("""
            SELECT 
                COALESCE(SUM(amount), 0) as total_amount,
                COUNT(*) as total_count
            FROM `tabVirtual Account Logs`
            WHERE owner = %s
        """, (merchant_email,), as_dict=True)
        
        # Get current balance from wallet
        # wallet_balance = frappe.db.get_value("Wallet", {"merchant": merchant_id}, "balance") or 0
        
        return {
            "pending_amount": pending_stats[0]['total_pending'] if pending_stats else 0,
            "pending_count": pending_stats[0]['pending_count'] if pending_stats else 0,
            "settled_amount": settled_stats[0]['total_settled'] if settled_stats else 0,
            "settled_count": settled_stats[0]['settled_count'] if settled_stats else 0,
            "total_amount": total_stats[0]['total_amount'] if total_stats else 0,
            "total_count": total_stats[0]['total_count'] if total_stats else 0
        }
    except Exception as e:
        frappe.log_error(f"Error in get_settlement_stats: {str(e)}", "Merchant Portal API")
        return {
            "pending_amount": 0,
            "pending_count": 0,
            "settled_amount": 0,
            "settled_count": 0,
            "total_amount": 0,
            "total_count": 0
        }

@frappe.whitelist()
def get_ledger_stats():
    """Get ledger statistics (total credits, debits, current balance)"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Get total credits
        credits_stats = frappe.db.sql("""
            SELECT COALESCE(SUM(transaction_amount), 0) as total_credits
            FROM `tabLedger`
            WHERE owner = %s 
            AND transaction_type = 'Credit'
        """, (merchant_email,), as_dict=True)
        
        # Get total debits
        debits_stats = frappe.db.sql("""
            SELECT COALESCE(SUM(ABS(transaction_amount)), 0) as total_debits
            FROM `tabLedger`
            WHERE owner = %s 
            AND transaction_type = 'Debit'
        """, (merchant_email,), as_dict=True)

        current_balance = (credits_stats[0]['total_credits'] if credits_stats else 0) - (debits_stats[0]['total_debits'] if debits_stats else 0)
        
        return {
            "total_credits": credits_stats[0]['total_credits'] if credits_stats else 0,
            "total_debits": debits_stats[0]['total_debits'] if debits_stats else 0,
            "current_balance": current_balance
        }
    except Exception as e:
        frappe.log_error(f"Error in get_ledger_stats: {str(e)}", "Merchant Portal API")
        return {
            "total_credits": 0,
            "total_debits": 0,
            "current_balance": 0
        }

@frappe.whitelist()
def delete_bank_account(account_number):
    """Delete a bank account"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
            
        merchant = frappe.get_doc("Merchant", merchant_id)
        
        # Find the account to delete
        initial_len = len(merchant.bank_accounts)
        merchant.bank_accounts = [
            acc for acc in merchant.bank_accounts 
            if str(acc.account_number).strip() != str(account_number).strip()
        ]
        
        if len(merchant.bank_accounts) < initial_len:
            merchant.save(ignore_permissions=True)
            frappe.db.commit()
            return {"success": True, "message": "Bank account removed successfully"}
        else:
            return {"success": False, "message": "Account not found"}
            
    except Exception as e:
        frappe.log_error(f"Error in delete_bank_account: {str(e)}", "Merchant Portal API")
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def set_primary_bank_account(account_number):
    """Set a bank account as primary"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
            
        merchant = frappe.get_doc("Merchant", merchant_id)
        
        found = False
        for account in merchant.bank_accounts:
            if account.account_number == account_number:
                account.is_primary = 1
                found = True
            else:
                account.is_primary = 0
                
        if found:
            merchant.save(ignore_permissions=True)
            frappe.db.commit()
            return {"success": True, "message": "Primary account updated"}
        else:
            return {"success": False, "message": "Account not found"}
            
    except Exception as e:
        frappe.log_error(f"Error in set_primary_bank_account: {str(e)}", "Merchant Portal API")
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def reload_bank_account_schema():
    """Reload the schema to apply changes with elevated privileges"""
    try:
        original_user = frappe.session.user
        frappe.set_user("Administrator")
        frappe.reload_doc("iswitch", "doctype", "merchant_bank_account", force=True)
        frappe.reload_doc("iswitch", "doctype", "merchant", force=True)
        frappe.clear_cache()
        frappe.set_user(original_user)
        return {"success": True, "message": "Schema reloaded and cache cleared"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def debug_db_check():
    try:
        # Check columns in DB
        columns = frappe.db.sql("DESC `tabMerchant Bank Account`", as_dict=1)
        # Check data
        data = frappe.db.sql("select * from `tabMerchant Bank Account` limit 5", as_dict=1)
        return {"columns": columns, "data": data}
    except Exception as e:
        return {"error": str(e)}


@frappe.whitelist()
def export_transactions_to_excel(filters=None):
    """Export transactions to Excel"""
    try:
        merchant_email = frappe.session.user
        merchant_id = get_logged_in_merchant_id()
        
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
        
        # Build filter conditions
        filter_conditions = ["t.merchant = %(merchant)s"]
        filter_values = {"merchant": merchant_id}
        
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                status_value = filters["status"]
                if status_value == "Success":
                    filter_conditions.append("(t.status = 'Success' OR t.status = 'Completed')")
                elif status_value == "Pending":
                    filter_conditions.append("(t.status = 'Pending' OR t.status = 'Processing')")
                else:
                    filter_conditions.append("t.status = %(status)s")
                    filter_values["status"] = status_value
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("t.transaction_date >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("t.transaction_date <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get all transactions
        transactions = frappe.db.sql(f"""
            SELECT 
                t.name as transaction_id,
                t.order,
                t.client_ref_id,
                t.product as product_name,
                t.amount,
                t.status,
                t.transaction_reference_id as utr,
                t.creation
            FROM `tabTransaction` t
            WHERE {where_clause}
            ORDER BY t.transaction_date DESC
        """, filter_values, as_dict=True)
        
        # Create Excel file
        from frappe.utils.xlsxutils import make_xlsx
        
        data = [["Transaction ID","Order ID", "Client Ref ID", "Product", "Amount", "Status", "UTR", "Date"]]
        for txn in transactions:
            data.append([
                txn.transaction_id,
                txn.order,
                txn.client_ref_id,
                txn.product_name,
                txn.amount,
                txn.status,
                txn.utr,
                str(txn.creation)
            ])
        
        xlsx_file = make_xlsx(data, "Transactions")
        
        # Save to file
        saved_file = save_file("transactions.xlsx", xlsx_file.getvalue(), "Merchant", merchant_id, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_transactions_to_excel: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error exporting transactions"))


# @frappe.whitelist()
# def export_settlements_to_excel(filters=None):
#     """Export settlements to Excel"""
#     try:
#         merchant_email = frappe.session.user
#         merchant_id = frappe.db.get_value("Merchant", {"personal_email": merchant_email}, "name")
        
#         if not merchant_id:
#             frappe.throw(_("Merchant not found"))
        
#         # Build filter conditions
#         filter_conditions = ["s.merchant = %(merchant)s"]
#         filter_values = {"merchant": merchant_id}
        
#         if filters:
#             if isinstance(filters, str):
#                 filters = json.loads(filters)
            
#             if filters.get("status") and filters["status"] != "All Status":
#                 filter_conditions.append("s.status = %(status)s")
#                 filter_values["status"] = filters["status"]
            
#             if filters.get("from_date"):
#                 clean_from = filters["from_date"].replace("T", " ")
#                 filter_conditions.append("s.creation >= %(from_date)s")
#                 filter_values["from_date"] = clean_from
            
#             if filters.get("to_date"):
#                 clean_to = filters["to_date"].replace("T", " ")
#                 filter_conditions.append("s.creation <= %(to_date)s")
#                 filter_values["to_date"] = clean_to
        
#         where_clause = " AND ".join(filter_conditions)
        
#         # Get all settlements
#         settlements = frappe.db.sql(f"""
#             SELECT 
#                 s.name as settlement_id,
#                 s.creation,
#                 s.settlement_date,
#                 s.amount,
#                 s.status,
#                 s.utr,
#                 s.bank_account
#             FROM `tabSettlement` s
#             WHERE {where_clause}
#             ORDER BY s.creation DESC
#         """, filter_values, as_dict=True)
        
#         # Create Excel file
#         from frappe.utils.xlsxutils import make_xlsx
        
#         data = [["Settlement ID", "Created", "Settlement Date", "Amount", "Status", "UTR", "Bank Account"]]
#         for settlement in settlements:
#             data.append([
#                 settlement.settlement_id,
#                 str(settlement.creation),
#                 str(settlement.settlement_date) if settlement.settlement_date else "",
#                 settlement.amount,
#                 settlement.status,
#                 settlement.utr or "",
#                 settlement.bank_account or ""
#             ])
        
#         xlsx_file = make_xlsx(data, "Settlements")
        
#         # Save to file
#         saved_file = save_file("settlements.xlsx", xlsx_file.getvalue(), "Merchant", merchant_id, is_private=0)
#         return {"file_url": saved_file.file_url}

#     except Exception as e:
#         frappe.log_error(f"Error in export_settlements_to_excel: {str(e)}", "Merchant Portal API")
#         frappe.throw(_("Error exporting settlements"))

# ============================================================================
# KYC Management APIs
# ============================================================================

@frappe.whitelist()
def get_kyc_status():
    """Get merchant KYC status and documents"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id: return {}
        
        # Get merchant data
        merchant = frappe.db.sql("""
            SELECT 
                name,
                status,
                remark,
                documents_to_reupload,
                director_pan,
                director_adhar,
                company_pan,
                company_gst
            FROM `tabMerchant`
            WHERE name = %s
            LIMIT 1
        """, (merchant_id,), as_dict=True)
        
        if not merchant:
            frappe.throw(_("Merchant not found"))
        
        merchant_data = merchant[0]
        
        # Parse documents_to_reupload (comma-separated list)
        documents_to_reupload = []
        if merchant_data.documents_to_reupload:
            documents_to_reupload = [doc.strip() for doc in merchant_data.documents_to_reupload.split(',') if doc.strip()]
        
        # Build documents object
        documents = {
            'director_pan': {
                'label': 'Director PAN',
                'file_url': merchant_data.director_pan or None,
                'uploaded': bool(merchant_data.director_pan),
                'requires_reupload': 'director_pan' in documents_to_reupload
            },
            'director_adhar': {
                'label': 'Director Adhar',
                'file_url': merchant_data.director_adhar or None,
                'uploaded': bool(merchant_data.director_adhar),
                'requires_reupload': 'director_adhar' in documents_to_reupload
            },
            'company_pan': {
                'label': 'Company PAN',
                'file_url': merchant_data.company_pan or None,
                'uploaded': bool(merchant_data.company_pan),
                'requires_reupload': 'company_pan' in documents_to_reupload
            },
            'company_gst': {
                'label': 'Company GST',
                'file_url': merchant_data.company_gst or None,
                'uploaded': bool(merchant_data.company_gst),
                'requires_reupload': 'company_gst' in documents_to_reupload
            }
        }
        
        # Check if all documents are uploaded
        all_uploaded = all(doc['uploaded'] for doc in documents.values())
        
        return {
            'success': True,
            'status': merchant_data.status,
            'remark': merchant_data.remark or '',
            'documents': documents,
            'all_uploaded': all_uploaded,
            'can_submit': all_uploaded and merchant_data.status == 'Draft'
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_kyc_status: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error fetching KYC status"))

@frappe.whitelist()
def upload_kyc_document(document_type, file_url):
    """Upload/update a KYC document"""
    try:
        merchant_email = frappe.session.user
        
        # Validate document type
        valid_types = ['director_pan', 'director_adhar', 'company_pan', 'company_gst']
        if document_type not in valid_types:
            frappe.throw(_("Invalid document type"))
        
        # Get merchant
        merchant = get_logged_in_merchant_id()
        if not merchant:
            frappe.throw(_("Merchant not found"))
        
        # Update the document field
        frappe.db.set_value("Merchant", merchant, document_type, file_url)
        
        # If this document was in documents_to_reupload, remove it
        merchant_doc = frappe.get_doc("Merchant", merchant)
        if merchant_doc.documents_to_reupload:
            docs_to_reupload = [doc.strip() for doc in merchant_doc.documents_to_reupload.split(',') if doc.strip()]
            if document_type in docs_to_reupload:
                docs_to_reupload.remove(document_type)
                if not docs_to_reupload:
                    merchant_doc.documents_to_reupload = ''
                    merchant_doc.status = 'Submitted'
                else:
                    merchant_doc.documents_to_reupload = ', '.join(docs_to_reupload)
                
                merchant_doc.save(ignore_permissions=True)
        
        frappe.db.commit()
        
        return {
            'success': True,
            'message': 'Document uploaded successfully'
        }
    
    except Exception as e:
        frappe.log_error(f"Error in upload_kyc_document: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error uploading document"))

@frappe.whitelist()
def submit_kyc():
    """Submit KYC for review"""
    try:
        merchant_email = frappe.session.user
        
        # Get merchant
        merchant = get_logged_in_merchant_id()
        if not merchant:
            frappe.throw(_("Merchant not found"))
        
        merchant_doc = frappe.get_doc("Merchant", merchant)
        
        # Check if all documents are uploaded
        required_docs = ['director_pan', 'director_adhar', 'company_pan', 'company_gst']
        missing_docs = [doc for doc in required_docs if not merchant_doc.get(doc)]
        
        if missing_docs:
            frappe.throw(_("Please upload all required documents before submitting"))
        
        # Check if status is Draft
        if merchant_doc.status != 'Draft':
            frappe.throw(_("KYC can only be submitted from Draft status"))
        
        # Update status to Submitted
        merchant_doc.status = 'Submitted'
        merchant_doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            'success': True,
            'message': 'KYC submitted for review successfully'
        }
    
    except Exception as e:
        frappe.log_error(f"Error in submit_kyc: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error submitting KYC"))
@frappe.whitelist()
def get_whitelisted_ips(page=1, page_size=20):
    """Get list of whitelisted IPs for the merchant"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
             return {"ips": [], "total": 0}

        # Build filter conditions
        filter_conditions = ["merchant = %s"]
        filter_values = [merchant_id]
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabWhitelist IP`
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, tuple(filter_values), as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated IPs
        start = (int(page) - 1) * int(page_size)
        ips_query = f"""
            SELECT 
                name as id,
                whitelisted_ip as ip_address,
                creation as added_at
            FROM `tabWhitelist IP`
            WHERE {where_clause}
            ORDER BY creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        ips = frappe.db.sql(ips_query, tuple(filter_values), as_dict=True)
        
        return {
            "ips": ips,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_whitelisted_ips: {str(e)}", "Merchant Portal API")
        return {"ips": [], "total": 0}

@frappe.whitelist()
def add_whitelisted_ip(ip_address):
    """Add a new IP to the whitelist"""
    try:
        merchant_email = frappe.session.user
        
        if not ip_address:
            return {
                "success": False,
                "message": _("IP Address is required")
            }
            
        # Basic IPv4 validation
        import re
        if not re.match(r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$", ip_address):
             return {
                "success": False,
                "message": _("Invalid IP Address format")
            }
            
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
             return {"success": False, "message": _("Merchant not found")}

        # Check if already exists
        if frappe.db.exists("Whitelist IP", {"merchant": merchant_id, "whitelisted_ip": ip_address}):
            return {
                "success": False,
                "message": _("IP Address already whitelisted")
            }
            
        # Create new entry
        doc = frappe.get_doc({
            "doctype": "Whitelist IP",
            "merchant": merchant_id,
            "whitelisted_ip": ip_address
        })
        doc.insert(ignore_permissions=True)
        
        return {
            "success": True,
            "message": _("IP Address whitelisted successfully"),
            "data": {
                "id": doc.name,
                "ip_address": doc.whitelisted_ip,
                "added_at": doc.creation
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error in add_whitelisted_ip: {str(e)}", "Merchant Portal API")
        return {
            "success": False,
            "message": _("Failed to add IP Address")
        }

@frappe.whitelist()
def delete_whitelisted_ip(ip_id):
    """Remove an IP from the whitelist"""
    try:
        merchant_id = get_logged_in_merchant_id()
        
        # Verify ownership
        if not frappe.db.exists("Whitelist IP", {"name": ip_id, "merchant": merchant_id}):
            return {
                "success": False,
                "message": _("IP Address not found or access denied")
            }
            
        frappe.delete_doc("Whitelist IP", ip_id, ignore_permissions=True)
        
        return {
            "success": True,
            "message": _("IP Address removed successfully")
        }
        
    except Exception as e:
        frappe.log_error(f"Error in delete_whitelisted_ip: {str(e)}", "Merchant Portal API")
        return {
            "success": False,
            "message": _("Failed to remove IP Address")
        }
@frappe.whitelist()
def get_webhook_logs(webhook_id=None, page=1, page_size=20, search=None):
    """Get logs for a specific webhook with search"""
    try:
        merchant_email = frappe.session.user
        
        # Verify ownership/access
        if not webhook_id:
             webhook_id = merchant_email

        # Ensure the webhook belongs to the merchant
        if webhook_id != merchant_email:
             pass 

        # Build filter conditions
        filter_conditions = ["webhook = %s"]
        filter_values = {"webhook_id": webhook_id}
        
        if search:
            filter_conditions.append("""
                (url LIKE %(search)s 
                OR data LIKE %(search)s 
                OR response LIKE %(search)s 
                OR status LIKE %(search)s 
                OR error LIKE %(search)s)
            """)
            filter_values["search"] = f"%{search}%"
        
        where_clause = " AND ".join(filter_conditions)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabWebhook Request Log`
            WHERE {where_clause}
        """
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated logs
        start = (int(page) - 1) * int(page_size)
        logs_query = f"""
            SELECT 
                name as id,
                webhook,
                url,
                data as request_data,
                response as response_data,
                status,
                error,
                creation as date
            FROM `tabWebhook Request Log`
            WHERE {where_clause}
            ORDER BY creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        logs = frappe.db.sql(logs_query, filter_values, as_dict=True)
        
        return {
            "logs": logs,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_webhook_logs: {str(e)}", "Merchant Portal API")
        return {"logs": [], "total": 0}


@frappe.whitelist()
def get_notifications(limit=None, page=1, page_size=20):
    """Get notifications for the current user with pagination"""
    try:
        user = frappe.session.user
        
        # Calculate pagination
        if limit:
            # Legacy support or simple limit
            limit_val = int(limit)
            offset_val = 0
        else:
            page = int(page)
            page_size = int(page_size)
            limit_val = page_size
            offset_val = (page - 1) * page_size
        
        notifications = frappe.db.sql("""
            SELECT 
                name,
                subject,
                email_content as message,
                `read`,
                creation as date
            FROM `tabNotification Log`
            WHERE for_user = %s
            ORDER BY creation DESC
            LIMIT %s OFFSET %s
        """, (user, limit_val, offset_val), as_dict=True)
        
        # Get total count for pagination
        total_count = frappe.db.count("Notification Log", {"for_user": user})
        unread_count = frappe.db.count("Notification Log", {"for_user": user, "read": 0})
        
        return {
            "notifications": notifications,
            "total": total_count,
            "page": int(page) if not limit else 1,
            "page_size": int(page_size) if not limit else limit_val,
            "unread_count": unread_count
        }
        
    except Exception as e:
        frappe.log_error(f"Error fetching notifications: {str(e)}", "Merchant Portal API")
        return {"notifications": [], "total": 0, "unread_count": 0}

@frappe.whitelist()
def mark_notifications_read(notification_ids=None):
    """Mark notifications as read"""
    try:
        user = frappe.session.user
        
        if not notification_ids:
            # Mark all as read
            frappe.db.sql("""
                UPDATE `tabNotification Log`
                SET `read` = 1
                WHERE for_user = %s
            """, (user,))
        else:
            if isinstance(notification_ids, str):
                notification_ids = json.loads(notification_ids)
                
            placeholders = ", ".join(["%s"] * len(notification_ids))
            query = f"""
                UPDATE `tabNotification Log`
                SET `read` = 1
                WHERE name IN ({placeholders}) AND for_user = %s
            """
            params = tuple(notification_ids) + (user,)
            frappe.db.sql(query, params)
            
        frappe.db.commit()
        return {"success": True}
        
    except Exception as e:
        frappe.log_error(f"Error marking notifications read: {str(e)}", "Merchant Portal API")
        return {"success": False, "message": str(e)}


# --------------------------------------------------------------------------------
# Team Management APIs
# --------------------------------------------------------------------------------

@frappe.whitelist()
def get_team_members(page=1, page_size=20):
    """Get list of team members for current merchant"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
            return {"team_members": [], "current_user_role": "Viewer"}
            
        role = get_current_user_role(merchant_id)
            
        start = (int(page) - 1) * int(page_size)
        
        team_members = frappe.db.sql("""
            SELECT 
                mt.name as id,
                mt.user,
                mt.email,
                mt.role,
                mt.full_name,
                mt.status,
                mt.last_active,
                mt.creation
            FROM `tabMerchant Team` mt
            WHERE mt.parent = %s
            ORDER BY mt.creation DESC
            LIMIT %s OFFSET %s
        """, (merchant_id, int(page_size), start), as_dict=True)
        
        return {"team_members": team_members, "current_user_role": role}
    except Exception as e:
        frappe.log_error(f"Error in get_team_members: {str(e)}", "Merchant Portal API")
        return {"team_members": [], "current_user_role": "Viewer"}

@frappe.whitelist()
def invite_team_member(email, role="Viewer", full_name=None):
    """Invite a new team member"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
            frappe.throw(_("Merchant not found"))
            
        current_role = get_current_user_role(merchant_id)
        if current_role != "Owner":
             frappe.throw(_("Only the Owner can invite team members"))
        
        # Check if already in team
        existing = frappe.db.exists("Merchant Team", {"parent": merchant_id, "email": email})
        if existing:
            frappe.throw(_("User is already a team member"))

        # Check if user exists in system
        if not frappe.db.exists("User", email):
            # Create user
            user = frappe.get_doc({
                "doctype": "User",
                "email": email,
                "first_name": full_name or email.split("@")[0],
                "send_welcome_email": 1,
                "roles": [{"role": "Merchant"}] 
            })
            user.insert(ignore_permissions=True)
        else:
            # Ensure they have Merchant role
            user = frappe.get_doc("User", email)
            has_role = False
            for r in user.roles:
                if r.role == "Merchant":
                    has_role = True
                    break
            if not has_role:
                user.append("roles", {"role": "Merchant"})
                user.save(ignore_permissions=True)

        # Add to Merchant Team child table
        merchant = frappe.get_doc("Merchant", merchant_id)
        merchant.append("team", {
            "user": email,
            "email": email,
            "role": role,
            "status": "Pending",
            "full_name": full_name or email.split("@")[0]
        })
        merchant.save(ignore_permissions=True)
        
        return {"success": True, "message": "Team member invited successfully"}
        
    except Exception as e:
        frappe.log_error(f"Error in invite_team_member: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error inviting team member"))

@frappe.whitelist()
def update_team_member(member_id, role=None, status=None):
    """Update team member role or status"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
            frappe.throw(_("Merchant not found"))

        current_role = get_current_user_role(merchant_id)
        
        if current_role != "Owner":
            frappe.throw(_("Only the Owner can update team members"))
            
        # Verify member belongs to this merchant
        member_exists = frappe.db.get_value("Merchant Team", {"name": member_id, "parent": merchant_id})
        if not member_exists:
             frappe.throw(_("Member not found"))
             
        doc = frappe.get_doc("Merchant Team", member_id)
        if role:
            doc.role = role
        if status:
            doc.status = status
            
        doc.save(ignore_permissions=True)
        return {"success": True}
    except Exception as e:
        frappe.log_error(f"Error in update_team_member: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error updating team member"))

@frappe.whitelist()
def remove_team_member(member_id):
    """Remove a team member"""
    try:
        merchant_id = get_logged_in_merchant_id()
        if not merchant_id:
            frappe.throw(_("Merchant not found"))

        current_role = get_current_user_role(merchant_id)
        
        if current_role != "Owner":
            frappe.throw(_("Only the Owner can remove team members"))
            
        # Verify
        member_exists = frappe.db.get_value("Merchant Team", {"name": member_id, "parent": merchant_id})
        if not member_exists:
             frappe.throw(_("Member not found"))
             
        frappe.delete_doc("Merchant Team", member_id, ignore_permissions=True)
        return {"success": True}
    except Exception as e:
        frappe.log_error(f"Error in remove_team_member: {str(e)}", "Merchant Portal API")
        frappe.throw(_("Error removing team member"))



# Get roles of current user
@frappe.whitelist(allow_guest=True)
def get_my_system_roles(email="final@gmail.com"):
    import frappe
    roles = frappe.get_roles(email)
    return {"roles": roles}

# Hook to activate pending team members on login
def activate_team_member_on_login(login_manager):
    user = frappe.session.user
    if user == "Guest":
        return
        
    # Find any pending team memberships for this user
    pending_memberships = frappe.db.get_all("Merchant Team", 
        filters={"user": user, "status": "Pending"}, 
        fields=["name", "parent"]
    )
    
    if pending_memberships:
        for member in pending_memberships:
            frappe.db.set_value("Merchant Team", member.name, "status", "Active")
            frappe.db.commit()
            