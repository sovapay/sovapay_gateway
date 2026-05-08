# Admin Portal API - Complete Integration
# Comprehensive API endpoints with SQL queries for the Admin Portal

from urllib.request import ftpwrapper
from types import FrameType
import frappe
from frappe import _
import json
from datetime import datetime, timedelta
from frappe.utils.file_manager import save_file
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client
from frappe.utils.xlsxutils import make_xlsx

def check_admin_permission():
    # role_profile = frappe.db.get_value("User", frappe.session.user, "role_profile_name")
    if  not (frappe.session.user == "Administrator" or "Admin" in frappe.get_roles()):
        # pass 
        # For now, we'll be lenient to avoid blocking development, 
        # but normally we'd throw a permission error:
        frappe.throw(_("Access Denied: Admin privileges required"), frappe.PermissionError)

def normalize_date_filter(date_str, is_end_date=False):
    """
    Normalize date string for filtering.
    If date_str is just a date (YYYY-MM-DD), append time component.
    If is_end_date is True, append 23:59:59, otherwise append 00:00:00.
    This ensures proper filtering of datetime fields in SQL queries.
    """
    if not date_str:
        return None
    
    # Remove any 'T' and replace with space
    clean_date = date_str.replace("T", " ").strip()
    
    # Check if time component exists (contains ':')
    if ':' not in clean_date:
        # No time component, add it
        if is_end_date:
            clean_date += " 23:59:59"
        else:
            clean_date += " 00:00:00"
    
    return clean_date


@frappe.whitelist()
def get_dashboard_stats(period='Last 30 days', merchant=None, from_date=None, to_date=None):
    """Get comprehensive dashboard statistics for ALL merchants"""
    try:
        check_admin_permission()
        
        base_conditions = ["1=1"]
        base_values = {}

        if merchant:
            base_conditions.append("merchant_ref_id = %(merchant)s")
            base_values["merchant"] = merchant

        
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

        base_conditions.append("creation >= %(from_date)s")
        base_conditions.append("creation <= %(to_date)s")
        base_values["from_date"] = from_date
        base_values["to_date"] = to_date

        base_where = " AND ".join(base_conditions)

        # Get global order statistics
        order_stats = frappe.db.sql(f"""
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
            FROM `tabOrder` WHERE {base_where}
        """,base_values, as_dict=True)

        # Chart data query — adds date range on top of base conditions
        chart_where = base_where
        chart_values = base_values

        # Get pending settlements count
        settlement_stats = frappe.db.sql("""
            SELECT COUNT(*) as pending_settlements
            FROM `tabVirtual Account Logs`
            WHERE status = 'Pending'
        """, as_dict=True)

        # Get Merchant counts by status
        merchant_counts = frappe.db.sql("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status IN ('Submitted', 'Under Review') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'Suspended' THEN 1 ELSE 0 END) as suspended
            FROM `tabMerchant`
        """, as_dict=True)
        
        merch_stats = merchant_counts[0] if merchant_counts else {'total': 0, 'active': 0, 'pending': 0, 'suspended': 0}

        stats = order_stats[0] if order_stats else {}
        stats['pending_settlements'] = settlement_stats[0].pending_settlements if settlement_stats else 0
        
        
        daily_stats = frappe.db.sql(f"""
            SELECT 
                DATE(creation) as date,
                SUM(CASE WHEN order_type = 'Pay' AND status = 'Processed' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payout,
                SUM(CASE WHEN order_type = 'Topup' AND status = 'Processed' THEN COALESCE(transaction_amount, 0) ELSE 0 END) as payin
            FROM `tabOrder`
            WHERE {chart_where}
            GROUP BY DATE(creation)
            ORDER BY date ASC
        """, chart_values, as_dict=True)

        # Format chart data
        dates = []
        payout_series = []
        payin_series = []
        
        # Create a map for quick lookup
        stats_map = {str(d.date): d for d in daily_stats}
        
        # Generate full date range
        start = frappe.utils.getdate(str(from_date)[:10])
        end = frappe.utils.getdate(str(to_date)[:10])

        curr = start
        while curr <= end:
            date_str = str(curr)
            stat = stats_map.get(date_str, {})
            
            dates.append(date_str)
            payout_series.append(float(stat.get('payout', 0)))
            payin_series.append(float(stat.get('payin', 0)))
            
            curr = frappe.utils.add_days(curr, 1)

        today = frappe.utils.getdate(frappe.utils.nowdate())
        current_month_start = today.replace(day=1)
        last_month_end = current_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        last_7_start = today - timedelta(days=7)
        prev_7_start = today - timedelta(days=14)

        # Helper to build metric conditions with merchant filter
        def metric_where(extra_conditions):
            conditions = base_conditions + extra_conditions
            return " AND ".join(conditions)
        
        vols = frappe.db.sql(f"""
            SELECT 
                SUM(CASE WHEN order_type = 'Pay' AND creation >= %(current_month_start)s THEN transaction_amount ELSE 0 END) as current_payout_vol,
                SUM(CASE WHEN order_type = 'Topup' AND creation >= %(current_month_start)s THEN transaction_amount ELSE 0 END) as current_payin_vol,
                SUM(CASE WHEN order_type = 'Pay' AND creation >= %(last_month_start)s AND creation < %(current_month_start)s THEN transaction_amount ELSE 0 END) as last_payout_vol,
                SUM(CASE WHEN order_type = 'Topup' AND creation >= %(last_month_start)s AND creation < %(current_month_start)s THEN transaction_amount ELSE 0 END) as last_payin_vol
            FROM `tabOrder`
            WHERE {metric_where(["status='Processed'"])}
        """, {**base_values, "current_month_start": current_month_start, "last_month_start": last_month_start}, as_dict=True)[0]
        
        def calc_change(current, last):
            if last > 0: return ((current - last) / last) * 100
            if current > 0: return 100
            return 0
            
        payout_vol_change = calc_change(vols.get('current_payout_vol') or 0, vols.get('last_payout_vol') or 0)
        payin_vol_change = calc_change(vols.get('current_payin_vol') or 0, vols.get('last_payin_vol') or 0)

        def get_success_rates(start_date, end_date):
            rate_where = metric_where(["creation >= %(start_date)s", "creation < %(end_date)s"])
            stats_res = frappe.db.sql(f"""
                SELECT 
                    SUM(CASE WHEN order_type = 'Pay' THEN 1 ELSE 0 END) as payout_total,
                    SUM(CASE WHEN status='Processed' AND order_type = 'Pay' THEN 1 ELSE 0 END) as payout_processed,
                    SUM(CASE WHEN order_type = 'Topup' THEN 1 ELSE 0 END) as payin_total,
                    SUM(CASE WHEN status='Processed' AND order_type = 'Topup' THEN 1 ELSE 0 END) as payin_processed
                FROM `tabOrder`
                WHERE {rate_where}
            """, {**base_values, "start_date": start_date, "end_date": end_date}, as_dict=True)[0]
            
            payout_rate = (stats_res.get('payout_processed') or 0) / (stats_res.get('payout_total') or 1) * 100 if stats_res.get('payout_total') else 0.0
            payin_rate = (stats_res.get('payin_processed') or 0) / (stats_res.get('payin_total') or 1) * 100 if stats_res.get('payin_total') else 0.0
            return payout_rate, payin_rate
            
        current_payout_rate, current_payin_rate = get_success_rates(last_7_start, today + timedelta(days=1))
        prev_payout_rate, prev_payin_rate = get_success_rates(prev_7_start, last_7_start)

        def get_rate(processed, total):
            return round((processed / total) * 100, 1) if total else 0.0

        return {
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
                },
                "pending_settlements": int(stats.get('pending_settlements', 0))
            },
            "metric_trends": {
                "payout": {
                    "volume_change_pct": round(payout_vol_change, 1),
                    "success_rate_change_pct": round(current_payout_rate - prev_payout_rate, 1)
                },
                "payin": {
                    "volume_change_pct": round(payin_vol_change, 1),
                    "success_rate_change_pct": round(current_payin_rate - prev_payin_rate, 1)
                }
            },
            "merchant_stats": {
                "total": int(merch_stats.get('total', 0)),
                "active": int(merch_stats.get('active', 0)),
                "pending": int(merch_stats.get('pending', 0)),
                "suspended": int(merch_stats.get('suspended', 0))
            },
            "chart_data": {
                "categories": dates,
                "series": [
                    {
                        "name": "Payout",
                        "data": payout_series
                    },
                    {
                        "name": "Payin",
                        "data": payin_series
                    }
                ]
            }
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_dashboard_stats: {str(e)}", "Admin Portal API")
        return get_empty_stats()

def get_empty_stats():
    """Return empty stats structure"""
    return {
        "stats": {
            "payout": {"total_orders": 0, "processed_orders": 0, "pending_orders": 0, "cancelled_orders": 0, "success_amount": 0, "pending_amount": 0, "failed_amount": 0, "success_rate": 0.0},
            "payin": {"total_orders": 0, "processed_orders": 0, "pending_orders": 0, "cancelled_orders": 0, "success_amount": 0, "pending_amount": 0, "failed_amount": 0, "success_rate": 0.0},
            "pending_settlements": 0
        },
        "metric_trends": {
            "payout": {"volume_change_pct": 0, "success_rate_change_pct": 0},
            "payin": {"volume_change_pct": 0, "success_rate_change_pct": 0}
        },
        "merchant_stats": {"total": 0, "active": 0, "pending": 0, "suspended": 0},
        "chart_data": {"categories": [], "series": []}
    }

@frappe.whitelist()
def get_orders(filter_data=None, page=1, page_size=20, sort_by="creation", sort_order="desc"):
    """Get paginated orders for ALL merchants"""
    try:
        check_admin_permission()
        from iswitch.validators import validate_sort_field, validate_sort_order, ALLOWED_ORDER_SORT_FIELDS
        
        # SECURITY FIX: Validate sort parameters to prevent SQL injection
        sort_by = validate_sort_field(sort_by, ALLOWED_ORDER_SORT_FIELDS, default='creation')
        sort_order = validate_sort_order(sort_order, default='DESC')
        
        # Base conditions (Always apply, used for status counts)
        base_conditions = ["1=1"] 
        base_values = {}
        
        # Status condition (Only apply to main query)
        status_condition = ""
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                status = filters["status"]
                if status == "Processing":
                    status_condition = "o.status IN ('Processing', 'Refund Processing')"
                elif status == "Cancelled":
                    status_condition = "o.status IN ('Cancelled', 'Failed')" 
                else:
                    status_condition = "o.status = %(status)s"
                    base_values["status"] = status  # Add to values map, but only use in query if needed
            
            if filters.get("from_date"):
                clean_from = normalize_date_filter(filters["from_date"], is_end_date=False)
                base_conditions.append("o.creation >= %(from_date)s")
                base_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = normalize_date_filter(filters["to_date"], is_end_date=True)
                base_conditions.append("o.creation <= %(to_date)s")
                base_values["to_date"] = clean_to

            if filters.get("order_type"):
                base_conditions.append("o.order_type = %(order_type)s")
                base_values["order_type"] = filters["order_type"]
                
            # Allow admin to filter by specific merchant if needed (future proofing)
            if filters.get("merchant_id"):
                base_conditions.append("o.merchant_ref_id = %(merchant_id)s")
                base_values["merchant_id"] = filters["merchant_id"]

        # Construct Where Clauses
        base_where = " AND ".join(base_conditions)
        main_where = base_where
        if status_condition:
            main_where += f" AND {status_condition}"
        
        # Get total count (Filtered)
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabOrder` o
            WHERE {main_where}
        """
        total_result = frappe.db.sql(count_query, base_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated orders (Filtered)
        start = (int(page) - 1) * int(page_size)
        orders_query = f"""
            SELECT 
                o.name as id,
                o.order_type,
                o.merchant_ref_id,
                m.company_name as merchant_name,
                o.customer_name as customer,
                o.order_amount as amount,
                o.fee,
                o.transaction_amount,
                o.status,
                o.utr,
                o.creation as date,
                o.modified
            FROM `tabOrder` o
            LEFT JOIN `tabMerchant` m ON o.merchant_ref_id = m.name
            WHERE {main_where}
            ORDER BY o.{sort_by} {sort_order}
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        orders = frappe.db.sql(orders_query, base_values, as_dict=True)
        
        # Get Status Counts (Using Base Filters ONLY)
        status_counts_query = f"""
            SELECT status, COUNT(*) as count
            FROM (
                SELECT 
                    CASE 
                        WHEN o.status IN ('Failed', 'Cancelled') THEN 'Cancelled'
                        ELSE o.status
                    END AS status
                FROM `tabOrder` o
                WHERE {base_where}
            ) t
            GROUP BY status
        """
        status_counts_raw = frappe.db.sql(status_counts_query, base_values, as_dict=True)
        
        # Format status counts
        status_counts = {row.status: row.count for row in status_counts_raw}
        status_counts['all'] = sum(status_counts.values())
        
        return {
            "orders": orders,
            "total": total,
            "page": int(page),
            "page_size": int(page_size),
            "status_counts": status_counts
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_orders: {str(e)}", "Admin Portal API")
        return {"orders": [], "total": 0, "status_counts": {}}


@frappe.whitelist()
def get_order_details(order_id):
    try:
        check_admin_permission()
        
        order = frappe.db.sql("""
            SELECT 
                o.name as id,
                o.customer_name as customer,
                o.order_amount as amount,
                o.transaction_amount as subtotal,
                o.tax,
                o.fee,
                o.status,
                o.utr,
                o.reason as description,
                o.creation as date,
                o.modified,
                o.product as payment_method,
                m.company_name as merchant_name
            FROM `tabOrder` o
            LEFT JOIN `tabMerchant` m ON o.merchant_ref_id = m.name
            WHERE o.name = %s
        """, (order_id,), as_dict=True)
        
        if not order:
            return None
            
        order = order[0]
        # ledger_entries = frappe.db.sql("""
        #     SELECT name as ledger_id
        #     FROM `tabLedger`
        #     WHERE `order` = %s
        #     ORDER BY creation DESC
        # """, (order['id'],), as_dict=True)
        # order['ledger_ids'] = [entry['ledger_id'] for entry in ledger_entries]
        
        return order
    except Exception as e:
        frappe.log_error(f"Error in get_order_details (admin): {str(e)}", "Admin Portal API")
        return None

@frappe.whitelist()
def get_transactions(filter_data=None, page=1, page_size=20):
    """Get transactions for ALL merchants"""
    try:
        check_admin_permission()
        
        # Base conditions (Always apply, used for status counts)
        base_conditions = ["1=1"]
        base_values = {}
        
        # Status condition (Only apply to main query)
        status_condition = ""
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                status_condition = "t.status = %(status)s"
                base_values["status"] = filters["status"]
            
            if filters.get("start_date"):
                clean_from = normalize_date_filter(filters["start_date"], is_end_date=False)
                base_conditions.append("t.creation >= %(start_date)s")
                base_values["start_date"] = clean_from
            
            if filters.get("end_date"):
                clean_to = normalize_date_filter(filters["end_date"], is_end_date=True)
                base_conditions.append("t.creation <= %(end_date)s")
                base_values["end_date"] = clean_to

            if filters.get("merchant_id"):
                base_conditions.append("t.merchant = %(merchant_id)s")
                base_values["merchant_id"] = filters["merchant_id"]

            if filters.get("product") and filters["product"] != "All Products":
                base_conditions.append("t.product = %(product)s")
                base_values["product"] = filters["product"]

        # Construct Where Clauses
        base_where = " AND ".join(base_conditions)
        main_where = base_where
        if status_condition:
            main_where += f" AND {status_condition}"
        
        # Get total count (Filtered)
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabTransaction` t
            WHERE {main_where}
        """
        total_result = frappe.db.sql(count_query, base_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated transactions (Filtered)
        start = (int(page) - 1) * int(page_size)
        entries_query = f"""
            SELECT 
                t.name as id,
                t.order as order_id,
                t.merchant as merchant_id,
                m.company_name as merchant_name,
                t.product as payment_method,
                t.amount,
                t.status,
                t.transaction_date as date,
                t.transaction_reference_id as utr,
                t.integration,
                o.customer_name
            FROM `tabTransaction` t
            LEFT JOIN `tabMerchant` m ON t.merchant = m.name
            LEFT JOIN `tabOrder` o ON t.order = o.name
            WHERE {main_where}
            ORDER BY t.transaction_date DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        entries = frappe.db.sql(entries_query, base_values, as_dict=True)
        
        # Get Status Counts (Using Base Filters ONLY)
        status_counts_query = f"""
            SELECT status, COUNT(*) as count
            FROM `tabTransaction` t
            WHERE {base_where}
            GROUP BY status
        """
        status_counts_raw = frappe.db.sql(status_counts_query, base_values, as_dict=True)
        
        # Format status counts
        status_counts = {row.status: row.count for row in status_counts_raw}
        status_counts['all'] = sum(status_counts.values())
        
        return {
            "transactions": entries,
            "total": total,
            "page": int(page),
            "page_size": int(page_size),
            "status_counts": status_counts
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_transactions: {str(e)}", "Admin Portal API")
        return {"transactions": [], "total": 0, "status_counts": {}}

@frappe.whitelist()
def get_transaction_details(transaction_id):
    """Fetch specific transaction details for admin"""
    try:
        check_admin_permission()
        
        transaction = frappe.db.sql("""
            SELECT 
                t.name as id,
                t.order as order_id,
                t.merchant as merchant_id,
                m.company_name as merchant_name,
                t.product as payment_method,
                t.amount,
                t.status,
                t.transaction_date as date,
                t.transaction_reference_id as utr,
                t.integration,
                t.crn,
                t.remark as description,
                t.client_ref_id,
                t.creation,
                t.modified,
                o.customer_name
            FROM `tabTransaction` t
            LEFT JOIN `tabMerchant` m ON t.merchant = m.name
            LEFT JOIN `tabOrder` o ON t.order = o.name
            WHERE t.name = %s
        """, (transaction_id,), as_dict=True)
        
        return transaction[0] if transaction else None
    except Exception as e:
        frappe.log_error(f"Error in get_transaction_details: {str(e)}", "Admin Portal API")
        return None

@frappe.whitelist()
def get_van_log_details(log_id):
    """Fetch specific virtual account log details for admin"""
    try:
        check_admin_permission()
        
        log = frappe.db.sql("""
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
                v.owner as merchant_id,
                m.company_name as merchant_name
            FROM `tabVirtual Account Logs` v
            LEFT JOIN `tabMerchant` m ON v.owner = m.name
            WHERE v.name = %s
        """, (log_id,), as_dict=True)
        
        return log[0] if log else None
    except Exception as e:
        frappe.log_error(f"Error in get_van_log_details: {str(e)}", "Admin Portal API")
        return None

@frappe.whitelist()
def get_virtual_account_details(account_id):
    """Fetch specific virtual account details for admin"""
    try:
        check_admin_permission()
        
        account = frappe.db.sql("""
            SELECT 
                va.name as id,
                va.account_number,
                va.ifsc as ifsc_code,
                va.owner as merchant_id,
                m.company_name as merchant_name,
                va.status,
                va.creation as date,
                va.modified
            FROM `tabVirtual Account` va
            LEFT JOIN `tabMerchant` m ON va.owner = m.name
            WHERE va.name = %s
        """, (account_id,), as_dict=True)
        
        return account[0] if account else None
    except Exception as e:
        frappe.log_error(f"Error in get_virtual_account_details: {str(e)}", "Admin Portal API")
        return None

# @frappe.whitelist()
# def get_merchants(page=1, page_size=20, search_text=None, filter_data=None):
#     """Get all merchants with their pricing with searching and filtering"""
#     try:
#         check_admin_permission()
        
#         filter_conditions = ["1=1"]
#         filter_values = {}
        
#         if search_text:
#             filter_conditions.append("(m.name LIKE %(search)s OR m.company_name LIKE %(search)s OR m.company_email LIKE %(search)s)")
#             filter_values["search"] = f"%{search_text}%"
            
#         if filter_data:
#             if isinstance(filter_data, str):
#                 filters = json.loads(filter_data)
#             else:
#                 filters = filter_data
                
#             if filters.get("status") and filters["status"] != "All Status":
#                 filter_conditions.append("m.status = %(status)s")
#                 filter_values["status"] = filters["status"]
                
#         where_clause = " AND ".join(filter_conditions)
#         start = (int(page) - 1) * int(page_size)
        
#         # Get main merchant data
#         merchants_query = f"""
#             SELECT 
#                 m.name,
#                 m.company_name,
#                 m.logo as company_logo,
#                 m.company_email,
#                 m.contact_detail,
#                 m.status,
#                 m.webhook,
#                 m.integration,
#                 m.creation,
#                 m.creation,
#                 COALESCE(w.balance, 0) as wallet_balance,
#                 COALESCE(lw.balance, 0) as lien_balance
#             FROM `tabMerchant` m
#             LEFT JOIN `tabWallet` w ON m.name = w.owner
#             LEFT JOIN `tabLien Wallet` lw ON m.name = lw.merchant_id
#             WHERE {where_clause}
#             ORDER BY m.creation DESC
#             LIMIT {int(page_size)} OFFSET {start}
#         """
#         merchants = frappe.db.sql(merchants_query, filter_values, as_dict=True)
        
#         # Get total count
#         count_query = f"""
#             SELECT COUNT(*) as total
#             FROM `tabMerchant` m
#             WHERE {where_clause}
#         """
#         total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
#         total = total_result[0].total if total_result else 0
        
#         # Fetch child table data for each merchant
#         for merchant in merchants:
#             pricing = frappe.db.sql("""
#                 SELECT 
#                     product,
#                     fee_type,
#                     fee,
#                     tax_fee_type,
#                     tax_fee,
#                     start_value,
#                     end_value
#                 FROM `tabProduct Pricing`
#                 WHERE parent = %s
#             """, (merchant.name,), as_dict=True)
#             merchant['product_pricing'] = pricing

#         # Get counts by status for tabs (ignoring filters)
#         status_counts_raw = frappe.db.sql("""
#             SELECT status, COUNT(*) as count
#             FROM `tabMerchant`
#             GROUP BY status
#         """, as_dict=True)
        
#         status_counts = {row.status: row.count for row in status_counts_raw}
#         status_counts['All'] = sum(status_counts.values())
            
#         return {
#             "merchants": merchants,
#             "total_count": total,
#             "status_counts": status_counts
#         }

#     except Exception as e:
#         frappe.log_error(f"Error in get_merchants: {str(e)}", "Admin Portal API")
#         return {"merchants": [], "total_count": 0}


@frappe.whitelist()
def get_merchants(page=1, page_size=20, search_text=None, filter_data=None):
    """Get all merchants with their TigerBeetle balances, pricing, with searching and filtering"""
    import json
    from iswitch.tigerbeetle_client import get_client
    import tigerbeetle as tb

    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
        if search_text:
            filter_conditions.append("(m.name LIKE %(search)s OR m.company_name LIKE %(search)s OR m.company_email LIKE %(search)s)")
            filter_values["search"] = f"%{search_text}%"
            
        if filter_data:
            if isinstance(filter_data, str):
                filters = json.loads(filter_data)
            else:
                filters = filter_data
                
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("m.status = %(status)s")
                filter_values["status"] = filters["status"]
                
        where_clause = " AND ".join(filter_conditions)
        start = (int(page) - 1) * int(page_size)
        
        # Fetch basic merchant info
        merchants_query = f"""
            SELECT 
                m.name,
                m.company_name,
                m.logo as company_logo,
                m.company_email,
                m.contact_detail,
                m.status,
                m.webhook,
                m.integration,
                m.payin_processor,
                m.creation,
                m.tigerbeetle_id,
                m.lien_tigerbeetle_id
            FROM `tabMerchant` m
            WHERE {where_clause}
            ORDER BY m.creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        merchants = frappe.db.sql(merchants_query, filter_values, as_dict=True)
        
        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM `tabMerchant` m WHERE {where_clause}"
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Initialize TigerBeetle client
        client = get_client()

        for merchant in merchants:
            # Get TB balances
            main_balance = 0.0
            lien_balance = 0.0
            account_ids = []
            if merchant.get("tigerbeetle_id"):
                account_ids.append(int(merchant["tigerbeetle_id"]))
            if merchant.get("lien_tigerbeetle_id"):
                account_ids.append(int(merchant["lien_tigerbeetle_id"]))

            try:
                if account_ids:
                    accounts = client.lookup_accounts(account_ids)
                    for acc in accounts:
                        available = (acc.credits_posted - acc.debits_posted - acc.debits_pending) / 100
                        if merchant.get("tigerbeetle_id") and acc.id == int(merchant["tigerbeetle_id"]):
                            main_balance = available
                        elif merchant.get("lien_tigerbeetle_id") and acc.id == int(merchant["lien_tigerbeetle_id"]):
                            lien_balance = available
            except Exception as tb_error:
                frappe.log_error(f"TigerBeetle balance fetch failed: {tb_error}", "Admin Portal API")
            
            merchant["wallet_balance"] = main_balance
            merchant["lien_balance"] = lien_balance

            # Fetch child table: Product Pricing
            pricing = frappe.db.sql("""
                SELECT 
                    product,
                    fee_type,
                    fee,
                    tax_fee_type,
                    tax_fee,
                    start_value,
                    end_value
                FROM `tabProduct Pricing`
                WHERE parent = %s
            """, (merchant["name"],), as_dict=True)
            merchant['product_pricing'] = pricing
        
        # Status counts
        status_counts_raw = frappe.db.sql("""
            SELECT status, COUNT(*) as count
            FROM `tabMerchant`
            GROUP BY status
        """, as_dict=True)
        status_counts = {row.status: row.count for row in status_counts_raw}
        status_counts['All'] = sum(status_counts.values())
            
        return {
            "merchants": merchants,
            "total_count": total,
            "status_counts": status_counts
        }

    except Exception as e:
        frappe.log_error(f"Error in get_merchants: {str(e)}", "Admin Portal API")
        return {"merchants": [], "total_count": 0}
    
@frappe.whitelist()
def get_processors():
    """Get all integrations (processors)"""
    try:
        check_admin_permission()
        
        processors = frappe.db.sql("""
            SELECT 
                name,
                integration_name,
                integration_type,
                api_endpoint,
                client_id,
                secret_key as _secret_key, -- Start with underscore to indicate sensitive
                COALESCE(balance, 0) as balance,
                is_active,
                `default`
            FROM `tabIntegration`
            ORDER BY creation DESC
        """, as_dict=True)
        
        # Get supported products/pricing for each processor
        for proc in processors:
            pricing = frappe.db.sql("""
                SELECT product
                FROM `tabProduct Pricing`
                WHERE parent = %s
            """, (proc.name,), as_dict=True)
            proc['products'] = [p.product for p in pricing]
            
        return {"processors": processors}

    except Exception as e:
        frappe.log_error(f"Error in get_processors: {str(e)}", "Admin Portal API")
        return {"processors": []}

@frappe.whitelist()
def get_services():
    """Get all products (services)"""
    try:
        check_admin_permission()
        
        services = frappe.db.sql("""
            SELECT 
                name,
                product_name,
                is_active
            FROM `tabProduct`
            ORDER BY product_name ASC
        """, as_dict=True)
        
        return {"services": services}

    except Exception as e:
        frappe.log_error(f"Error in get_services: {str(e)}", "Admin Portal API")
        return {"services": []}

@frappe.whitelist()
def toggle_service_status(service_name, is_active):
    """Activate or deactivate a service"""
    try:
        check_admin_permission()
        
        frappe.db.set_value("Product", service_name, "is_active", 1 if is_active else 0)
        frappe.db.commit()
        
        return {"success": True}

    except Exception as e:
        frappe.log_error(f"Error in toggle_service_status: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def adjust_merchant_funds(merchant, type, amount, remark=None):
    """
    Adjust merchant funds (Hold or Release).
    type: 'Hold' (Main -> Lien) or 'Release' (Lien -> Main)
    amount: Positive float
    remark: Optional string
    """
    try:
        check_admin_permission()
        
        if float(amount) <= 0:
            return {"success": False, "error": "Amount must be greater than zero"}

        if type not in ['Hold', 'Release']:
            return {"success": False, "error": "Invalid adjustment type. Use 'Hold' or 'Release'"}

        # Map type to Adjustment fields
        # If Type is 'Hold', we move FROM Main TO Lien
        # If Type is 'Release', we move FROM Lien TO Main
        from_wallet = 'Main' if type == 'Hold' else 'Lien'
        to_wallet = 'Lien' if type == 'Hold' else 'Main'

        doc = frappe.new_doc("Adjustment")
        doc.merchant_id = merchant
        doc.amount = float(amount)
        doc.set("from", from_wallet) # 'from' is a reserved keyword in Python, use set
        doc.to = to_wallet
        if remark:
            doc.remark = remark
        doc.insert()
        doc.submit()
        
        return {"success": True, "message": "Funds adjusted successfully"}

    except Exception as e:
        frappe.log_error(f"Error in adjust_merchant_funds: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def update_merchant(merchant, status, integration=None, payin_processor=None, webhook=None, pricing=None, rejection_remark=None, documents_to_reupload=None):
    """Update merchant details, pricing, and register Webhook"""
    try:
        check_admin_permission()
        
        doc = frappe.get_doc("Merchant", merchant)
        doc.status = status
        
        if integration is not None:
            doc.integration = integration
        
        if payin_processor is not None:
            doc.payin_processor = payin_processor
        
        # Handle rejection remark
        if status == "Rejected":
            # Save rejection remark when status is Rejected
            if rejection_remark:
                doc.remark = rejection_remark
            # If no remark provided but status is Rejected, keep existing remark or set empty
            elif not doc.remark:
                doc.remark = ""
            
            # Save documents to reupload (JSON string or comma-separated)
            if documents_to_reupload:
                if isinstance(documents_to_reupload, str):
                    doc.documents_to_reupload = documents_to_reupload
                else:
                    doc.documents_to_reupload = json.dumps(documents_to_reupload)
            else:
                # If no specific documents marked, clear the field (merchant can upload all)
                doc.documents_to_reupload = ""
        elif status == "Approved":
            # Clear remark and documents_to_reupload when approved
            doc.remark = ""
            doc.documents_to_reupload = ""
        # For "Submitted" status, preserve the remark and documents_to_reupload so admin can see what was previously wrong
        
        # Webhook Logic (Adapted from user snippet)
        if webhook:
            # Check if Webhook doctype exists for this merchant (using merchant email as name)
            exists = frappe.db.exists("Webhook", merchant)
            
            webhook_json_structure = """{
                "crn":"{{doc.order}}",
                "utr":"{{doc.transaction_reference_id}}",
                "status": "{{doc.status}}",
                "clientRefID": "{{doc.client_ref_id}}"
            }"""
            
            if not exists:
                frappe.get_doc({
                    'doctype': 'Webhook',
                    '__newname': merchant,
                    'webhook_doctype': 'Transaction',
                    'webhook_docevent': 'on_submit',
                    'condition': f"(doc.merchant == '{merchant}') and (doc.status in ['Success', 'Failed', 'Reversed'])",
                    'request_url': webhook,
                    'request_method': 'POST',
                    'request_structure': 'JSON',
                    'background_jobs_queue': 'long',
                    'webhook_json': webhook_json_structure
                }).insert()
            elif doc.webhook != webhook:
                # Update existing webhook if URL changed
                webhook_doc = frappe.get_doc("Webhook", merchant)
                webhook_doc.request_url = webhook
                webhook_doc.save()
        
            doc.webhook = webhook
        
        # Update pricing child table
        if pricing:
            if isinstance(pricing, str):
                pricing = json.loads(pricing)
            
            doc.set("product_pricing", [])
            for p in pricing:
                doc.append("product_pricing", {
                    "product": p.get("product"),
                    "fee_type": p.get("fee_type"),
                    "fee": p.get("fee"),
                    "tax_fee_type": p.get("tax_fee_type"),
                    "tax_fee": p.get("tax_fee"),
                    "start_value": p.get("start_value"),
                    "end_value": p.get("end_value")
                })
        
        
        # Store old status before saving
        old_status = frappe.db.get_value("Merchant", merchant, "status")
        
        doc.save()
        frappe.db.commit()
        
        # Send notification if status changed
        if old_status != status:
            send_status_change_notification(merchant, status, rejection_remark)
        
        return {"success": True}

    except Exception as e:
        frappe.log_error(f"Error in update_merchant: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

def send_status_change_notification(merchant_id, new_status, remark=None):
    """Send notification to merchant when their status changes"""
    try:
        # Prepare notification based on status
        if new_status == "Approved":
            title = "Account Activated ✅"
            message = f"Congratulations! Your merchant account has been activated. You can now start processing transactions."
            priority = "info"
        elif new_status == "Rejected":
            title = "Account Rejected ❌"
            message = f"Your merchant account has been rejected."
            if remark:
                message += f"\n\nReason: {remark}"
            message += "\n\nPlease contact support for more information or resubmit your application with the required changes."
            priority = "urgent"
        elif new_status == "Suspended":
            title = "Account Suspended ⚠️"
            message = "Your merchant account has been suspended. Please contact support for more information."
            if remark:
                message += f"\n\nReason: {remark}"
            priority = "warning"
        elif new_status == "Submitted":
            title = "Account Under Review 📋"
            message = "Your merchant account is now under review. We will notify you once the review is complete."
            priority = "info"
        elif new_status == "Terminated":
            title = "Account Terminated ⛔"
            message = "Your merchant account has been permanently terminated. Access to your account has been revoked."
            if remark:
                message += f"\n\nReason: {remark}"
            priority = "urgent"
        else:
            # For other status changes, send a generic notification
            title = f"Account Status Updated"
            message = f"Your merchant account status has been updated to: {new_status}"
            priority = "info"
        
        # Create notification record
        notification = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": title,
            "email_content": message,
            "for_user": merchant_id,
            "type": "Alert",
            "document_type": "Merchant",
            "document_name": merchant_id
        })
        notification.insert(ignore_permissions=True)
        
        # Emit real-time notification
        frappe.publish_realtime(
            event='merchant_notification',
            message={
                'title': title,
                'message': message,
                'priority': priority,
                'timestamp': frappe.utils.now()
            },
            user=merchant_id
        )
        
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Error sending status change notification to {merchant_id}: {str(e)}", "Status Change Notification")

def send_van_log_notification(merchant_id, status, amount, transaction_type, utr):
    """Send notification to merchant when their VAN log (wallet top-up) status changes"""
    try:
        priority = "info"
        
        # Prepare notification based on status
        if status == "Approved" or status == "Success":
            title = "Wallet Top-up Approved ✅"
            message = f"Your wallet top-up request has been approved.\n\n"
            message += f"Amount: ₹{amount:,.2f}\n"
            message += f"UTR: {utr}\n\n"
            message += "The amount has been credited to your wallet."
        elif status == "Rejected" or status == "Failed":
            title = "Wallet Top-up Rejected ❌"
            message = f"Your wallet top-up request has been rejected.\n\n"
            message += f"Amount: ₹{amount:,.2f}\n"
            message += f"UTR: {utr}\n\n"
            message += "Please contact support for more information."
            priority = "urgent"
        else:
            # Generic update
            title = "Wallet Transaction Updated"
            message = f"Your wallet transaction (UTR: {utr}) status has been updated to: {status}"
        
        # Create notification record
        notification = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": title,
            "email_content": message,
            "for_user": merchant_id,
            "type": "Alert",
            "document_type": "Virtual Account Logs", # Ideally link to the log if possible, but UTR is unique enough usually
            "document_name": utr
        })
        notification.insert(ignore_permissions=True)
        
        # Emit real-time notification
        frappe.publish_realtime(
            event='merchant_notification',
            message={
                'title': title,
                'message': message,
                'priority': priority,
                'timestamp': frappe.utils.now()
            },
            user=merchant_id
        )
        
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Error sending VAN log notification to {merchant_id}: {str(e)}", "VAN Log Notification")


@frappe.whitelist()
def bulk_update_merchants(merchants, action, value):
    """Bulk update merchants"""
    try:
        check_admin_permission()
        
        if isinstance(merchants, str):
            merchants = json.loads(merchants)
            
        if not merchants:
            return {"success": False, "error": "No merchants selected"}

        for merchant in merchants:
            doc = frappe.get_doc("Merchant", merchant)
            if action == 'update_status':
                doc.status = value
            elif action == 'update_integration':
                doc.integration = value
            doc.save()
            
        frappe.db.commit()
        
        return {"success": True}

    except Exception as e:
        frappe.log_error(f"Error in bulk_update_merchants: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def get_van_logs(filter_data=None, page=1, page_size=20):
    """Get Virtual Account Network logs for ALL merchants"""
    try:
        check_admin_permission()
        
        # Base conditions (Always apply, used for status counts)
        base_conditions = ["1=1"]
        base_values = {}
        
        # Status condition (Only apply to main query)
        status_condition = ""
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                status_condition = "v.status = %(status)s"
                base_values["status"] = filters["status"]
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                base_conditions.append("v.creation >= %(from_date)s")
                base_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                base_conditions.append("v.creation <= %(to_date)s")
                base_values["to_date"] = clean_to

            if filters.get("merchant_id"):
                base_conditions.append("v.owner = %(merchant_id)s")
                base_values["merchant_id"] = filters["merchant_id"]
        
        # Construct Where Clauses
        base_where = " AND ".join(base_conditions)
        main_where = base_where
        if status_condition:
            main_where += f" AND {status_condition}"
        
        # Get total count (Filtered)
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabVirtual Account Logs` v
            WHERE {main_where}
        """
        total_result = frappe.db.sql(count_query, base_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get paginated logs (Filtered)
        start = (int(page) - 1) * int(page_size)
        logs_query = f"""
            SELECT 
                v.name as id,
                v.account_number,
                m.company_name as merchant_name,
                v.amount,
                v.transaction_type as type,
                v.utr,
                v.status,
                v.opening_balance,
                v.closing_balance,
                v.remitter_name,
                v.remitter_account_number,
                v.remitter_ifsc_code,
                v.creation as date
            FROM `tabVirtual Account Logs` v
            LEFT JOIN `tabMerchant` m ON v.owner = m.name
            WHERE {main_where}
            ORDER BY v.creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        logs = frappe.db.sql(logs_query, base_values, as_dict=True)
        
        # Get Status Counts (Using Base Filters ONLY)
        status_counts_query = f"""
            SELECT status, COUNT(*) as count
            FROM `tabVirtual Account Logs` v
            WHERE {base_where}
            GROUP BY status
        """
        status_counts_raw = frappe.db.sql(status_counts_query, base_values, as_dict=True)
        
        # Format status counts
        status_counts = {row.status: row.count for row in status_counts_raw}
        status_counts['all'] = sum(status_counts.values())
        
        return {
            "logs": logs,
            "total": total,
            "page": int(page),
            "page_size": int(page_size),
            "status_counts": status_counts
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_van_logs: {str(e)}", "Admin Portal API")
        return {"logs": [], "total": 0, "status_counts": {}}

@frappe.whitelist()
def get_virtual_accounts(filter_data=None, page=1, page_size=20, search_text=None):
    """Get paginated virtual accounts with filtering and search"""
    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
        if search_text:
            filter_conditions.append("(account_number LIKE %(search)s OR merchant_name LIKE %(search)s OR name LIKE %(search)s)")
            filter_values["search"] = f"%{search_text}%"
        
        if filter_data:
            if isinstance(filter_data, str):
                filters = json.loads(filter_data)
            else:
                filters = filter_data
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("status = %(status)s")
                filter_values["status"] = filters["status"]
                
        where_clause = " AND ".join(filter_conditions)
        
        # Get count
        count_query = f"SELECT COUNT(*) as total FROM `tabVirtual Account` WHERE {where_clause}"
        total_result = frappe.db.sql(count_query, filter_values, as_dict=True)
        total = total_result[0].total if total_result else 0
        
        # Get data
        start = (int(page) - 1) * int(page_size)
        query = f"""
            SELECT 
                name,
                account_number,
                ifsc,
                status,
                merchant_name,
                bank_name,
                creation as date
            FROM `tabVirtual Account`
            WHERE {where_clause}
            ORDER BY creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        accounts = frappe.db.sql(query, filter_values, as_dict=True)
        
        return {
            "success": True,
            "accounts": accounts,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_virtual_accounts: {str(e)}", "Admin Portal API")
        return {"success": False, "accounts": [], "total": 0}

@frappe.whitelist()
def export_orders_to_excel(filters=None):
    """Export ALL orders to Excel"""
    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
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
        
        orders = frappe.db.sql(f"""
            SELECT 
                name as order_id,
                merchant_ref_id,
                customer_name,
                order_amount,
                COALESCE(tax, 0) as tax,
                fee,
                COALESCE(transaction_amount, order_amount) as transaction_amount,
                status,
                utr,
                client_ref_id,
                creation
            FROM `tabOrder`
            WHERE {where_clause}
            ORDER BY creation DESC
        """, filter_values, as_dict=True)
        
        data = [["Order ID", "Merchant", "Customer", "Order Amount", "Tax", "Fee", "Transaction Amount", "Status", "UTR", "Client Ref ID","Date"]]
        for order in orders:
            data.append([
                order.order_id,
                order.merchant_ref_id,
                order.customer_name,
                order.order_amount,
                order.tax,
                order.fee,
                order.transaction_amount,
                order.status,
                order.utr,
                order.client_ref_id,
                str(order.creation)
            ])
        
        xlsx_file = make_xlsx(data, "All_Orders")
        
        # Save to file
        saved_file = save_file("all_orders.xlsx", xlsx_file.getvalue(), "User", frappe.session.user, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_orders_to_excel: {str(e)}", "Admin Portal API")
        frappe.throw(_("Error exporting orders"))

@frappe.whitelist()
def export_merchants_to_excel(filters=None):
    """Export ALL merchants to Excel"""
    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("m.status = %(status)s")
                filter_values["status"] = filters["status"]
                
            if filters.get("search_text"):
                filter_conditions.append("(m.name LIKE %(search)s OR m.company_name LIKE %(search)s OR m.company_email LIKE %(search)s)")
                filter_values["search"] = f"%{filters['search_text']}%"
        
        where_clause = " AND ".join(filter_conditions)
        
        merchants = frappe.db.sql(f"""
            SELECT 
                m.name,
                m.company_name,
                m.company_email,
                m.contact_detail,
                m.status,
                m.integration,
                m.creation,
                COALESCE(w.balance, 0) as wallet_balance
            FROM `tabMerchant` m
            LEFT JOIN `tabWallet` w ON m.name = w.merchant_id
            WHERE {where_clause}
            ORDER BY m.creation DESC
        """, filter_values, as_dict=True)
        
        data = [["Merchant ID", "Company Name", "Email", "Contact Detail", "Status", "Integration", "Wallet Balance", "Registered On"]]
        for m in merchants:
            data.append([
                m.name,
                m.company_name,
                m.company_email,
                m.contact_detail,
                m.status,
                m.integration,
                float(m.wallet_balance),
                str(m.creation)
            ])
        
        xlsx_file = make_xlsx(data, "All_Merchants")
        
        # Save to file
        saved_file = save_file("all_merchants.xlsx", xlsx_file.getvalue(), "User", frappe.session.user, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_merchants_to_excel: {str(e)}", "Admin Portal API")
        frappe.throw(_("Error exporting merchants"))

@frappe.whitelist()
def export_ledger_to_excel(filters=None):
    """Export ALL ledger entries to Excel"""
    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
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
        
        entries = frappe.db.sql(f"""
            SELECT 
                l.name as id,
                l.owner,
                l.order as order_id,
                l.transaction_type as type,
                l.transaction_amount,
                l.opening_balance,
                l.closing_balance,
                l.creation as date,
                l.client_ref_id
            FROM `tabLedger` l
            WHERE {where_clause}
            ORDER BY l.creation DESC
        """, filter_values, as_dict=True)
        
        
        data = [["Ledger ID", "Merchant", "Order ID", "Client Ref ID", "Type", "TXN Amount", "Opening Balance", "Closing Balance", "Date"]]
        for entry in entries:
            data.append([
                entry.id,
                entry.owner, # This is usually the merchant email/user
                entry.order_id,
                entry.client_ref_id,
                entry.type,
                entry.transaction_amount,
                entry.opening_balance,
                entry.closing_balance,
                str(entry.date)
            ])
        
        xlsx_file = make_xlsx(data, "All_Ledger")
        
        # Save to file
        saved_file = save_file("all_ledger.xlsx", xlsx_file.getvalue(), "User", frappe.session.user, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_ledger_to_excel: {str(e)}", "Admin Portal API")
        frappe.throw(_("Error exporting ledger"))

@frappe.whitelist()
def export_transactions_to_excel(filters=None):
    """Export ALL transactions to Excel"""
    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("status") and filters["status"] != "All Status":
                filter_conditions.append("t.status = %(status)s")
                filter_values["status"] = filters["status"]
            
            if filters.get("from_date"):
                clean_from = filters["from_date"].replace("T", " ")
                filter_conditions.append("t.transaction_date >= %(from_date)s")
                filter_values["from_date"] = clean_from
            
            if filters.get("to_date"):
                clean_to = filters["to_date"].replace("T", " ")
                filter_conditions.append("t.transaction_date <= %(to_date)s")
                filter_values["to_date"] = clean_to
        
        where_clause = " AND ".join(filter_conditions)
        
        transactions = frappe.db.sql(f"""
            SELECT 
                t.name as id,
                t.order as order_id,
                t.merchant as merchant_name,
                t.product as product_name,
                t.amount,
                t.status,
                t.transaction_date as date,
                t.transaction_reference_id as utr,
                t.integration,
                t.client_ref_id
            FROM `tabTransaction` t
            WHERE {where_clause}
            ORDER BY t.transaction_date DESC
        """, filter_values, as_dict=True)
        
        
        data = [["Transaction ID", "Order ID", "Merchant", "Product", "Amount", "Status", "Date", "UTR", "Integration", "Client Ref ID"]]
        for txn in transactions:
            data.append([
                txn.id,
                txn.order_id,
                txn.merchant_name,
                txn.product_name,
                txn.amount,
                txn.status,
                str(txn.date),
                txn.utr,
                txn.integration,
                txn.client_ref_id
            ])
        
        xlsx_file = make_xlsx(data, "All_Transactions")
        
        # Save to file
        saved_file = save_file("all_transactions.xlsx", xlsx_file.getvalue(), "User", frappe.session.user, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_transactions_to_excel: {str(e)}", "Admin Portal API")
        frappe.throw(_("Error exporting transactions"))

@frappe.whitelist()
def export_van_logs_to_excel(filters=None):
    """Export ALL VAN logs to Excel"""
    try:
        check_admin_permission()
        
        filter_conditions = ["1=1"]
        filter_values = {}
        
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
        
        logs = frappe.db.sql(f"""
            SELECT 
                v.name as id,
                v.account_number,
                m.company_name as merchant_name,
                v.amount,
                v.transaction_type as type,
                v.utr,
                v.status,
                v.opening_balance,
                v.closing_balance,
                v.remitter_name,
                v.remitter_account_number,
                v.remitter_ifsc_code,
                v.creation as date
            FROM `tabVirtual Account Logs` v
            LEFT JOIN `tabMerchant` m ON v.owner = m.personal_email
            WHERE {where_clause}
            ORDER BY v.creation DESC
        """, filter_values, as_dict=True)
        
        
        data = [["Transaction ID", "Account Number", "Merchant", "Amount", "Type", "UTR", "Status", "Opening Balance", "Closing Balance", "Remitter Name", "Remitter Account", "Remitter IFSC", "Date"]]
        for log in logs:
            data.append([
                log.id,
                log.account_number,
                log.merchant_name,
                log.amount,
                log.type,
                log.utr,
                log.status,
                log.opening_balance,
                log.closing_balance,
                log.remitter_name,
                log.remitter_account_number,
                log.remitter_ifsc_code,
                str(log.date)
            ])
        
        xlsx_file = make_xlsx(data, "All_VAN_Logs")
        
        # Save to file
        saved_file = save_file("all_van_logs.xlsx", xlsx_file.getvalue(), "User", frappe.session.user, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_van_logs_to_excel: {str(e)}", "Admin Portal API")
        frappe.throw(_("Error exporting VAN logs"))


@frappe.whitelist()
def generate_api_keys():
    """Generate keys for the currently logged in ADMIN user"""
    # Just reuse the same logic
    try:
        user_id = frappe.session.user
        user_doc = frappe.get_doc("User", user_id)
        
        user_doc.api_key = frappe.generate_hash(length=30) 
        raw = frappe.generate_hash(length=15)
        user_doc.api_secret = raw
        user_doc.save()
        
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
def get_wallet_balance():
    """Get total system wallet balance"""
    try:
        check_admin_permission()
        wallet_data = frappe.db.sql("""
            SELECT SUM(balance) as total_balance
            FROM `tabWallet`
        """, as_dict=True)
        return {"wallet_balance": float(wallet_data[0].total_balance) if wallet_data and wallet_data[0].total_balance else 0}
    except Exception as e:
        frappe.log_error(f"Error in get_wallet_balance: {str(e)}", "Admin Portal API")
        return {"wallet_balance": 0}

@frappe.whitelist()
def get_admin_profile():
    """Get logged in admin profile"""
    try:
        user = frappe.get_doc("User", frappe.session.user)
        return {
            "name": user.full_name,
            "email": user.email,
            "role": user.role_profile_name 
        }
    except Exception as e:
        frappe.log_error(f"Error in get_admin_profile: {str(e)}", "Admin Portal API")
        return {}

# @frappe.whitelist()
# def get_merchant_details(merchant_name):
#     """Get detailed merchant information including KYC documents"""
#     try:
#         check_admin_permission()
        
#         # Get main merchant data
#         merchant = frappe.db.sql("""
#             SELECT 
#                 m.name,
#                 m.company_name,
#                 m.logo as company_logo,
#                 m.company_email,
#                 m.contact_detail,
#                 m.business_type,
#                 m.status,
#                 m.webhook,
#                 m.integration,
#                 m.creation,
#                 m.remark,
#                 m.documents_to_reupload,
#                 m.director_pan,
#                 m.director_adhar,
#                 m.company_pan,
#                 m.company_gst,
#                 COALESCE(w.balance, 0) as wallet_balance,
#                 COALESCE(lw.balance, 0) as lien_balance
#             FROM `tabMerchant` m
#             LEFT JOIN `tabWallet` w ON m.name = w.merchant_id
#             LEFT JOIN `tabLien Wallet` lw ON m.name = lw.merchant_id
#             WHERE m.name = %s
#         """, (merchant_name,), as_dict=True)
        
#         if not merchant:
#             return {"success": False, "error": "Merchant not found"}
            
#         merchant_data = merchant[0]
        
#         # Get pricing configuration
#         pricing = frappe.db.sql("""
#             SELECT 
#                 product,
#                 fee_type,
#                 fee,
#                 tax_fee_type,
#                 tax_fee,
#                 start_value,
#                 end_value
#             FROM `tabProduct Pricing`
#             WHERE parent = %s
#         """, (merchant_name,), as_dict=True)
        
        
#         merchant_data['product_pricing'] = pricing
        
#         # Get bank accounts
#         bank_accounts = frappe.db.sql("""
#             SELECT 
#                 name,
#                 account_holder_name,
#                 account_number,
#                 ifsc_code,
#                 bank_name,
#                 status,
#                 cancel_cheque
#             FROM `tabMerchant Bank Account`
#             WHERE parent = %s
#             ORDER BY creation DESC
#         """, (merchant_name,), as_dict=True)
        
#         merchant_data['bank_accounts'] = bank_accounts
        
#         return {
#             "success": True,
#             "merchant": merchant_data
#         }

#     except Exception as e:
#         frappe.log_error(f"Error in get_merchant_details: {str(e)}", "Admin Portal API")
#         return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_merchant_details(merchant_name):
    """
    Get detailed merchant info including Main & Lien balances from TigerBeetle.
    """
    try:
        check_admin_permission()
        
        merchant_doc = frappe.get_doc("Merchant", merchant_name)
        client = get_client()

        main_balance = 0.0
        lien_balance = 0.0

        account_ids = []

        if merchant_doc.tigerbeetle_id:
            account_ids.append(int(merchant_doc.tigerbeetle_id))

        if merchant_doc.lien_tigerbeetle_id:
            account_ids.append(int(merchant_doc.lien_tigerbeetle_id))

        try:
            if account_ids:
                accounts = client.lookup_accounts(account_ids)
                for acc in accounts:
                    bal = (acc.credits_posted - acc.debits_posted - acc.debits_pending) / 100
                    if merchant_doc.tigerbeetle_id and acc.id == int(merchant_doc.tigerbeetle_id):
                        main_balance = bal
                    elif merchant_doc.lien_tigerbeetle_id and acc.id == int(merchant_doc.lien_tigerbeetle_id):
                        lien_balance = bal
        except Exception as tb_error:
            frappe.log_error(f"TigerBeetle balance fetch failed: {tb_error}", "Admin Portal API")

        # Collect other merchant info as before
        merchant_data = {
            "name": merchant_doc.name,
            "company_name": merchant_doc.company_name,
            "company_logo": merchant_doc.logo,
            "company_email": merchant_doc.company_email,
            "contact_detail": merchant_doc.contact_detail,
            "business_type": merchant_doc.business_type,
            "status": merchant_doc.status,
            "webhook": merchant_doc.webhook,
            "integration": merchant_doc.integration,
            "payin_processor": merchant_doc.payin_processor if hasattr(merchant_doc, 'payin_processor') else None,
            "remark": merchant_doc.remark,
            "documents_to_reupload": merchant_doc.documents_to_reupload,
            "director_pan": merchant_doc.director_pan,
            "director_adhar": merchant_doc.director_adhar,
            "company_pan": merchant_doc.company_pan,
            "company_gst": merchant_doc.company_gst,
            "wallet_balance": main_balance,
            "lien_balance": lien_balance,
            "creation": merchant_doc.creation
        }

        # Product pricing
        pricing = frappe.get_all(
            "Product Pricing",
            filters={"parent": merchant_name},
            fields=["product", "fee_type", "fee", "tax_fee_type", "tax_fee", "start_value", "end_value"]
        )
        merchant_data["product_pricing"] = pricing

        # Bank accounts
        bank_accounts = frappe.get_all(
            "Merchant Bank Account",
            filters={"parent": merchant_name},
            fields=["name", "account_holder_name", "account_number", "ifsc_code", "bank_name", "status", "cancel_cheque"],
            order_by="creation desc"
        )
        merchant_data["bank_accounts"] = bank_accounts

        return {"success": True, "merchant": merchant_data}

    except Exception as e:
        frappe.log_error(f"Error in get_merchant_details: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}
    
@frappe.whitelist()
def update_bank_account_status(bank_account_id, status, remark=None):
    """Update the status of a merchant bank account (Approve/Reject)"""
    try:
        check_admin_permission()
        
        # Validate status
        if status not in ['Approved', 'Rejected']:
            return {"success": False, "error": "Invalid status. Must be 'Approved' or 'Rejected'"}
        
        # Get the bank account
        bank_account = frappe.get_doc("Merchant Bank Account", bank_account_id)
        
        if not bank_account:
            return {"success": False, "error": "Bank account not found"}
        
        # Update status
        bank_account.status = status
        bank_account.save(ignore_permissions=True)
        frappe.db.commit()
        
        if status == "Approved" or status == "Rejected":
             send_bank_account_notification(bank_account.owner, status, bank_account.bank_name, bank_account.account_number, remark)

        return {
            "success": True, 
            "message": f"Bank account {status.lower()} successfully"
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in update_bank_account_status: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

def send_bank_account_notification(merchant_id, status, bank_name, account_number, remark=None):
    """Send notification to merchant when their bank account is approved/rejected"""
    try:
        # Prepare notification based on status
        if status == "Approved":
            title = "Bank Account Approved ✅"
            message = f"Your bank account {bank_name} ({account_number}) has been approved for settlements."
            priority = "info"
        elif status == "Rejected":
            title = "Bank Account Rejected ❌"
            message = f"Your bank account {bank_name} ({account_number}) has been rejected."
            if remark:
                message += f"\n\nReason: {remark}"
            priority = "urgent"
        else:
            return
            
        # Create notification record
        notification = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": title,
            "email_content": message,
            "for_user": merchant_id,
            "type": "Alert",
            "document_type": "Merchant Bank Account",
            "document_name": account_number # Using account number as reference since we might not have ID easily if it's new
        })
        notification.insert(ignore_permissions=True)
        
        # Emit real-time notification
        frappe.publish_realtime(
            event='merchant_notification',
            message={
                'title': title,
                'message': message,
                'priority': priority,
                'timestamp': frappe.utils.now()
            },
            user=merchant_id
        )
        
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Error sending bank account notification to {merchant_id}: {str(e)}", "Bank Account Notification")

@frappe.whitelist()
def approve_wallet_topup(log_id):
    """Approve a pending wallet top-up request"""
    frappe.db.savepoint("topup_process")
    try:
        check_admin_permission()
        
        # Get the log entry
        log = frappe.get_doc("Virtual Account Logs", log_id)
        
        if log.status != "Pending":
            return {"success": False, "error": f"Cannot approve log with status: {log.status}"}
            

        merchant_name = frappe.db.get_value("Virtual Account", log.account_number, 'merchant')

        # wallet_row = frappe.db.sql("""
        #     SELECT balance FROM `tabWallet`
        #     WHERE name = %s FOR UPDATE
        # """, (merchant,), as_dict=True)

        # if not wallet_row:
        #     frappe.throw("Wallet not found for the merchant.")

        # balance = float(wallet_row[0].balance or 0.0)
        
        # new_balance = balance + float(log.amount)
        # if log.transaction_type == "Debit":
        #     new_balance = balance - float(log.amount)
            
        # frappe.db.sql("""
        #     UPDATE `tabWallet`
        #     SET balance = %s
        #     WHERE name = %s
        # """, (new_balance, merchant))
        merchant = frappe.get_doc("Merchant", log.owner)

        if not merchant.tigerbeetle_id:
            frappe.throw("Merchant TigerBeetle account not found.")

        client = get_client()

        merchant_account_id = int(merchant.tigerbeetle_id)
        system_account_id = 1

        # Convert to smallest unit (paise)
        amount = int(float(log.amount) * 100)
        
        # 🔹 POST THE PENDING TRANSFER (Capture the authorization hold)
        import hashlib
        
        def stable_id(value: str) -> int:
            return int(hashlib.sha256(value.encode()).hexdigest()[:32], 16)
        
        # Deterministic IDs
        pending_transfer_id = stable_id(f"van-pending-{log.name}")
        post_transfer_id = stable_id(f"van-post-{log.name}")

        if log.transaction_type == "Credit":
            debit_id = system_account_id
            credit_id = merchant_account_id
        else:  # Debit
            debit_id = merchant_account_id
            credit_id = system_account_id

        # POST the pending transfer (capture)
        transfer = tb.Transfer(
            id=post_transfer_id,
            debit_account_id=debit_id,
            credit_account_id=credit_id,
            amount=amount,
            pending_id=pending_transfer_id,  # Reference to the pending transfer
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=300,
            flags=tb.TransferFlags.POST_PENDING_TRANSFER,  # POST the pending transfer
            timestamp=0,
        )

        errors = client.create_transfers([transfer])

        if errors:
            error = errors[0]
            if error.result == tb.CreateTransferResult.EXISTS:
                frappe.log_error(
                    f"Wallet topup POST transfer already exists: {post_transfer_id}",
                    "TigerBeetle Duplicate Prevention"
                )
            else:
                frappe.throw(f"TigerBeetle POST transfer failed: {error.result}")

        # Fetch updated balance
        accounts = client.lookup_accounts([merchant_account_id])
        account = accounts[0]

        balance = (account.credits_posted - account.debits_posted - account.debits_pending) / 100

        log.db_set("closing_balance", balance)
        log.db_set("opening_balance", balance - float(log.amount)
                    if log.transaction_type == "Credit"
                    else balance + float(log.amount))

        # log.opening_balance = balance
        # log.closing_balance = new_balance
        # log.db_set("opening_balance", balance)
        # log.db_set("closing_balance", new_balance)
        log.status = "Success"
        log.save()
        log.submit()

        
        frappe.set_user(log.owner)
        ledger_entry = frappe.get_doc({
            "doctype": "Ledger",
            "order": f"Wallet Topup ₹{log.amount}, UTR:{log.utr}",  # Empty for VAN transactions
            "transaction_type": log.transaction_type,  # Credit or Debit
            "transaction_amount": float(log.amount),
            "status": "Success",
            "merchant": log.owner,
            "transaction_id": log.utr,  # Use UTR as transaction ID
            "client_ref_id": f"VAN-{log.name}",  # Link back to VAN log
            "opening_balance": log.opening_balance,
            "closing_balance": log.closing_balance
        })
        ledger_entry.insert(ignore_permissions=True)
        ledger_entry.submit()
        frappe.db.commit()
        
        # Send notification to merchant about whitelist approval
        send_van_log_notification(merchant_name, "Approved", log.amount, log.transaction_type, log.utr)
        
        return {"success": True, "message": "Top-up request approved successfully"}   
    
    except Exception as e:
        frappe.db.rollback(save_point = "topup_process")
        frappe.log_error(f"Error in approve_wallet_topup: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def reject_wallet_topup(log_id):
    """Reject a pending wallet top-up request"""
    try:
        check_admin_permission()
        
        log = frappe.get_doc("Virtual Account Logs", log_id)
        
        if log.status != "Pending":
            return {"success": False, "error": f"Cannot reject log with status: {log.status}"}
        
        # 🔹 VOID THE PENDING TRANSFER
        try:
            from iswitch.tigerbeetle_client import get_client
            import tigerbeetle as tb
            from decimal import Decimal
            import hashlib
            
            def stable_id(value: str) -> int:
                return int(hashlib.sha256(value.encode()).hexdigest()[:32], 16)
            
            # Get merchant
            merchant_name = frappe.db.get_value("Virtual Account", log.account_number, 'merchant')
            merchant = frappe.get_doc("Merchant", merchant_name)
            
            if not merchant.tigerbeetle_id:
                frappe.throw("Merchant TigerBeetle account not found")
            
            client = get_client()
            merchant_account_id = int(merchant.tigerbeetle_id)
            system_account_id = 1
            amount = int(float(log.amount) * 100)
            
            # Deterministic IDs
            pending_transfer_id = stable_id(f"van-pending-{log.name}")
            void_transfer_id = stable_id(f"van-void-{log.name}")
            
            # VOID the pending transfer
            if log.transaction_type == "Credit":
                debit_id = system_account_id
                credit_id = merchant_account_id
            else:  # Debit
                debit_id = merchant_account_id
                credit_id = system_account_id
            
            transfer = tb.Transfer(
                id=void_transfer_id,
                debit_account_id=debit_id,
                credit_account_id=credit_id,
                amount=amount,
                pending_id=pending_transfer_id,  # Reference to the pending transfer
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=300,
                flags=tb.TransferFlags.VOID_PENDING_TRANSFER,  # VOID the pending transfer
                timestamp=0,
            )
            
            errors = client.create_transfers([transfer])
            
            if errors:
                error = errors[0]
                if error.result == tb.CreateTransferResult.EXISTS:
                    frappe.log_error(
                        f"Wallet topup VOID transfer already exists: {void_transfer_id}",
                        "TigerBeetle Duplicate Prevention"
                    )
                else:
                    frappe.log_error(
                        f"TigerBeetle VOID transfer failed: {error.result}",
                        "TigerBeetle Error"
                    )
                    frappe.throw(f"Failed to void wallet topup: {error.result}")
        
        except Exception as e:
            frappe.log_error("Error voiding wallet topup PENDING transfer", frappe.get_traceback())
            frappe.throw(f"Failed to void wallet topup: {str(e)}")
            
        log.status = "Failed" # or 'Rejected' if that status exists in dropdown options
        log.save()
        log.submit()
        frappe.db.commit()
        
        # Send notification
        # For rejection, we might need to fetch merchant if not directly available on log object easily, 
        # but log.account_number links to Virtual Account which links to merchant.
        # Let's fetch merchant from Virtual Account
        merchant = frappe.db.get_value("Virtual Account", log.account_number, 'merchant')
        if merchant:
            send_van_log_notification(merchant, "Rejected", log.amount, log.transaction_type, log.utr)
        
        return {"success": True, "message": "Top-up request rejected"}

    except Exception as e:
        frappe.log_error(f"Error in reject_wallet_topup: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def onboard_merchant(personal_name, email, password, pancard="PENDING"):
    """Create a new merchant and user (logic aligned with auth.signup)"""
    try:
        check_admin_permission()
        
        # 1. Validate & Create User
        if frappe.db.exists("User", email):
            return {"success": False, "error": "User with this email already exists"}

        # Validate password length
        if len(password) < 8:
            return {"success": False, "error": "Password must be at least 8 characters long"}
            
        from frappe.utils import validate_email_address

        validate_email_address(email)
        
        user = frappe.new_doc("User")
        user.email = email
        user.first_name = personal_name
        user.enabled = 1
        user.new_password = password
        user.user_type = "System User"
        user.module_profile = "Blinkpe" # Aligned with signup
        user.save(ignore_permissions=True)
        
        # Add Merchant Role
        if not frappe.db.exists("Has Role", {"parent": user.name, "role": "Merchant"}):
            role = user.append("roles", {})
            role.role = "Merchant"
            user.save(ignore_permissions=True)
        
        # from frappe.auth import LoginManager
        # login_manager = LoginManager()
        # login_manager.authenticate(user=email, pwd=password)
        # login_manager.post_login()

        frappe.set_user(user.name)

        # 2. Create Merchant with the merchant user as owner
        if frappe.db.exists("Merchant", email):
             return {"success": False, "error": "Merchant with this email already exists"}

        merchant = frappe.get_doc({
            'doctype': 'Merchant',
            'personal_name': personal_name,
            'personal_email': email,
            'pancard': pancard,
            'status': 'Draft',
            'owner': user.name
        })
        merchant.insert(ignore_permissions=True)
        
        # 3. Create Virtual Account with the merchant user as owner
        virtual_account = frappe.get_doc({
            'doctype': 'Virtual Account',
            'merchant': merchant.name,
            "prefix": '19685', # Constant from signup
            'status': 'Active',
            'owner': user.name
        })
        virtual_account.insert(ignore_permissions=True)

        # 4. Create Wallet with the merchant user as owner
        if not frappe.db.exists("Wallet", email):
            wallet = frappe.new_doc("Wallet")
            wallet.merchant_id = merchant.name
            wallet.balance = 0
            wallet.status = "Active"
            wallet.owner = user.name
            wallet.insert(ignore_permissions=True)
            
        # 5. Create Lean Wallet with the merchant user as owner
        if not frappe.db.exists("Lean Wallet", email):
            lean_wallet = frappe.get_doc({
                "doctype": "Lean Wallet",
                "merchant_id": merchant.name,
                "balance": 0,
                "owner": user.name
            })
            lean_wallet.insert(ignore_permissions=True)

        frappe.db.commit()
        
        return {"success": True}

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in onboard_merchant: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def update_wallet_balance(merchant_id, amount, action):
    """Credit amount to merchant wallet via Virtual Account Log"""
    try:
        check_admin_permission()
        
        if float(amount) <= 0:
            return {"success": False, "error": "Amount must be positive"}

        # 1. Find Active Virtual Account for Merchant
        va_account = frappe.db.get_value("Virtual Account", {"merchant": merchant_id, "status": "Active"}, "account_number")
        # if not va_account:
        #     # Fallback to any account if no active one, or error
        #     va_account = frappe.db.get_value("Virtual Account", {"merchant": merchant_id}, "account_number")
            
        # if not va_account:
        #     return {"success": False, "error": "No Virtual Account found for this merchant. Cannot recharge."}

        frappe.set_user(merchant_id)
        # 2. Create Virtual Account Log (This triggers wallet update via system hooks)
        import time
        utr = f"ADM-RECH-{int(time.time())}"
        
        log = frappe.get_doc({
            "doctype": 'Virtual Account Logs',
            "account_number": va_account,
            "transaction_type": action,
            "amount": float(amount),
            "utr": utr,
            "remitter_name": "Admin",
            "remitter_ifsc_code": "ADM000",
            "remitter_account_number": "ADMINWALLET",
            "status": "Success",
            "merchant": merchant_id
        }).insert(ignore_permissions=True)

        frappe.db.commit()
        
        return {"success": True, "message": "Topup initiated"}

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in credit_wallet: {str(e)}", "Admin Portal API")
        return {"success": False, "error": str(e)}

# Settings Page APIs
@frappe.whitelist()
def get_platform_settings():
    """Get platform settings including products, integrations, and security policies"""
    try:
        check_admin_permission()
        
        # Get all products with their status
        products = frappe.get_all('Product', 
            fields=['name', 'product_name', 'is_active'],
            order_by='product_name asc'
        )
        
        # Get all integrations with balances
        integrations = frappe.get_all('Integration',
            fields=['name', 'integration_name', 'integration_type', 'is_active', 'balance', 'default'],
            order_by='integration_name asc'
        )
        
        # Get integration details with product pricing
        integration_details = []
        for integration in integrations:
            doc = frappe.get_doc('Integration', integration.name)
            integration_details.append({
                'name': doc.name,
                'integration_name': doc.integration_name,
                'integration_type': doc.integration_type,
                'is_active': doc.is_active,
                'balance': doc.balance or 0,
                'default': doc.default,
                'api_endpoint': doc.api_endpoint or '',
                'client_id': doc.get_password('client_id') if doc.client_id else '',
                'secret_key': '********' if doc.secret_key else '',
                'vpa': doc.vpa or '',
                'product_pricing': [{
                    'product': row.product,
                    'fee_type': row.fee_type,
                    'fee': row.fee,
                    'tax_fee_type': row.tax_fee_type,
                    'tax_fee': row.tax_fee
                } for row in doc.product_pricing]
            })
        
        # Get Frappe security settings (only query existing fields)
        security_settings = {
            'session_timeout': frappe.db.get_single_value('System Settings', 'session_expiry') or '170:00',  # Default in hours format
            'allow_login_after_fail': frappe.db.get_single_value('System Settings', 'allow_login_after_fail') or 60,
            'allow_consecutive_login_attempts': frappe.db.get_single_value('System Settings', 'allow_consecutive_login_attempts') or 3,
        }
        
        return {
            'success': True,
            'products': products,
            'integrations': integration_details,
            'security': security_settings
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_platform_settings: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def update_product_status(product_name, is_active):
    """Update product active status"""
    try:
        check_admin_permission()
        
        doc = frappe.get_doc('Product', product_name)
        doc.is_active = int(is_active)
        doc.save()
        frappe.db.commit()
        
        return {'success': True, 'message': f'Product {product_name} updated successfully'}
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in update_product_status: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def update_integration_status(integration_name, is_active):
    """Update integration active status"""
    try:
        check_admin_permission()
        
        doc = frappe.get_doc('Integration', integration_name)
        doc.is_active = int(is_active)
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {'success': True, 'message': f'Integration {integration_name} updated successfully'}
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in update_integration_status: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def update_integration_pricing(integration_name, product, fee_type, fee):
    """Update integration product pricing"""
    try:
        check_admin_permission()
        
        doc = frappe.get_doc('Integration', integration_name)
        
        # Find existing pricing row for this product
        pricing_row = None
        for row in doc.product_pricing:
            if row.product == product:
                pricing_row = row
                break
        
        if pricing_row:
            # Update existing row
            pricing_row.fee_type = fee_type
            pricing_row.fee = float(fee)
        else:
            # Add new row
            doc.append('product_pricing', {
                'product': product,
                'fee_type': fee_type,
                'fee': float(fee),
                'tax_fee_type': 'Percentage',
                'tax_fee': 18.0
            })
        
        doc.save()
        frappe.db.commit()
        
        return {'success': True, 'message': 'Pricing updated successfully'}
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in update_integration_pricing: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def update_security_settings(session_timeout=None, allow_login_after_fail=None, allow_consecutive_login_attempts=None):
    """Update Frappe security settings"""
    try:
        check_admin_permission()
        
        if session_timeout:
            frappe.db.set_single_value('System Settings', 'session_expiry', session_timeout)
        
        if allow_login_after_fail:
            frappe.db.set_single_value('System Settings', 'allow_login_after_fail', int(allow_login_after_fail))
        
        if allow_consecutive_login_attempts:
            frappe.db.set_single_value('System Settings', 'allow_consecutive_login_attempts', int(allow_consecutive_login_attempts))
        
        frappe.db.commit()
        
        return {'success': True, 'message': 'Security settings updated successfully'}
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(f"Error in update_security_settings: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def get_integration_secret(integration_name):
    """Get decrypted secret key for an integration (admin only)"""
    try:
        check_admin_permission()
        
        if not integration_name:
            return {'success': False, 'error': 'Integration name is required'}
        
        doc = frappe.get_doc('Integration', integration_name)
        secret_key = doc.get_password('secret_key')
        
        return {
            'success': True,
            'secret_key': secret_key
        }
    except Exception as e:
        frappe.log_error(f"Error in get_integration_secret: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}


@frappe.whitelist()
def get_2fa_status():
    """Get current user's 2FA status"""
    try:
        user = frappe.session.user
        enabled = False
        verified = False
        
        # Check User 2FA Settings (Source of Truth for Secret)
        if frappe.db.exists('User 2FA Settings', {'user': user}):
            settings = frappe.get_doc('User 2FA Settings', {'user': user})
            verified = settings.verified
            enabled = settings.enabled # Default to settings status
        
        # Check User Doctype (Master Switch)
        user_enable_2fa = frappe.db.get_value("User", user, "enable_2fa")
        
        if user_enable_2fa == 1:
             enabled = True 
        elif user_enable_2fa == 0:
             enabled = False
        else:
             # Fallback if field is None/Unset
             if settings and settings.enabled and settings.verified:
                 enabled = True
             
        # Verification check: If determined enabled, must have verified settings
        if enabled and (not settings or not settings.verified):
            enabled = False

        return {
            'success': True,
            'enabled': bool(enabled),
            'verified': bool(verified),
            'method': 'OTP App' if enabled else None
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_2fa_status: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def verify_2fa_login(otp):
    """Verify OTP during login"""
    try:
        user = frappe.session.user
        import pyotp
        
        if not frappe.db.exists('User 2FA Settings', {'user': user}):
             return {'success': False, 'message': '2FA not set up'}
             
        settings = frappe.get_doc('User 2FA Settings', {'user': user})
        
        if not settings.otp_secret:
            return {'success': False, 'message': '2FA configuration error'}
            
        totp = pyotp.TOTP(settings.otp_secret)
        if totp.verify(otp):
            return {'success': True, 'message': 'Verification successful'}
        else:
            return {'success': False, 'message': 'Invalid OTP'}
            
    except Exception as e:
        frappe.log_error(f"Error in verify_2fa_login: {str(e)}", "Admin Portal API")
        return {'success': False, 'message': str(e)}

@frappe.whitelist()
def setup_2fa():
    """Generate QR code for 2FA setup"""
    try:
        import pyotp
        user = frappe.session.user
        if user == "Guest": frappe.throw(_("Not logged in"))
        
        # Generate new secret
        secret = pyotp.random_base32()
        
        # Generate OTP URI
        app_name = frappe.db.get_single_value("Website Settings", "app_name") or "iSwitch Admin"
        otp_uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user, issuer_name=app_name)
        
        # Store secret in cache for verification step
        frappe.cache().set_value(f"totp_setup_secret:{user}", secret, expires_in_sec=600)
        
        return {
            "secret": secret,
            "otpauth_url": otp_uri,
            "success": True
        }
    except Exception as e:
        frappe.log_error(f"Error in setup_2fa: {str(e)}", "Admin Portal API")
        raise e

@frappe.whitelist()
def verify_2fa_setup(otp):
    """Verify checks token against cached secret, then saves to User 2FA Settings"""
    try:
        import pyotp
        user = frappe.session.user
        secret = frappe.cache().get_value(f"totp_setup_secret:{user}")
        
        if not secret:
            frappe.throw(_("Setup session expired. Please restart setup."))
            
        totp = pyotp.TOTP(secret)
        if totp.verify(otp):
            # Save to User 2FA Settings
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
            frappe.db.set_value("User", user, "enable_2fa", 1)
            frappe.db.commit()
            
            return {"success": True}
        else:
            return {"success": False, "message": "Invalid OTP code"}
            
    except Exception as e:
        frappe.log_error(f"Error in verify_2fa_setup: {str(e)}", "Admin Portal API")
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
def verify_2fa_login(otp):
    """Verify 2FA code during login"""
    try:
        import pyotp
        user = frappe.session.user
        
        # Get 2FA settings
        if not frappe.db.exists('User 2FA Settings', {'user': user}):
             # Fallback check User.enable_2fa?
             # If User.enable_2fa is 1 but settings missing, that's an issue.
             return {'success': False, 'error': '2FA not enabled'}
        
        settings = frappe.get_doc('User 2FA Settings', {'user': user})
        
        if not settings.enabled:
             return {'success': False, 'error': '2FA is disabled'}
             
        totp = pyotp.TOTP(settings.get_password('otp_secret'))
        if totp.verify(otp, valid_window=1):
            return {'success': True, 'message': '2FA verified successfully'}
        else:
            return {'success': False, 'error': 'Invalid OTP code'}
            
    except Exception as e:
        frappe.log_error(f"Error in verify_2fa_login: {str(e)}", "Admin Portal API")
        return {'success': False, 'error': str(e)}

@frappe.whitelist()
def get_ledger_entries(filter_data=None, page=1, page_size=20):
    """Get ledger entries across all merchants for admin portal"""
    try:
        check_admin_permission()
        
        # Build filter conditions
        # Build filter conditions
        filter_conditions = ["1=1"]
        filter_values = {}
        
        filters = filter_data
        if filters:
            if isinstance(filters, str):
                filters = json.loads(filters)
            
            if filters.get("merchant"):
                filter_conditions.append("l.owner = %(merchant)s")
                filter_values["merchant"] = filters["merchant"]
            
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
                l.owner as merchant_id,
                m.personal_name as merchant_name,
                o.customer_name,
                o.status as order_status,
                o.fee,
                o.tax,
                o.order_amount,
                o.product,
                o.modified as completion_date
            FROM `tabLedger` l
            LEFT JOIN `tabOrder` o ON l.order = o.name
            LEFT JOIN `tabMerchant` m ON l.owner = m.name
            WHERE {where_clause}
            ORDER BY l.creation DESC
            LIMIT {int(page_size)} OFFSET {start}
        """
        
        entries = frappe.db.sql(entries_query, filter_values, as_dict=True)
        
        # Transform entries to match frontend expectations
        transformed_entries = []
        for entry in entries:
            transformed_entry = {
                'id': entry['id'],
                'order_id': entry['order_id'],
                'type': entry['type'],
                'merchant_id': entry['merchant_id'],
                'merchant_name': entry['merchant_name'] or 'Unknown',
                'customer_name': entry.get('customer_name'),
                'order_status': entry.get('order_status'),
                'product': entry.get('product'),
                'date': entry['date'],
                # Transform transaction_amount into credit/debit based on type
                'credit': float(entry['transaction_amount'] or 0) if entry['type'] == 'Credit' else 0,
                'debit': float(entry['transaction_amount'] or 0) if entry['type'] == 'Debit' else 0,
                'balance': float(entry['closing_balance'] or 0),
                # Create description from type and status
                'description': f"{entry['type']} - {entry.get('order_status', 'N/A')}" if entry.get('order_status') else entry['type']
            }
            transformed_entries.append(transformed_entry)
        
        return {
            "entries": transformed_entries,
            "total": total,
            "page": int(page),
            "page_size": int(page_size)
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_ledger_entries: {str(e)}", "Admin Portal API")
        return {"entries": [], "total": 0}

@frappe.whitelist()
def get_ledger_details(ledger_id):
    """Fetch specific ledger details with order info for admin portal"""
    try:
        check_admin_permission()
        
        entry = frappe.db.sql("""
            SELECT 
                l.name as id,
                l.order as order_id,
                l.transaction_type as type,
                l.transaction_amount,
                l.opening_balance,
                l.closing_balance,
                l.creation as date,
                l.owner as merchant_id,
                m.personal_name as merchant_name,
                o.customer_name,
                o.status as order_status,
                o.fee,
                o.tax,
                o.order_amount,
                o.product,
                o.modified as completion_date
            FROM `tabLedger` l
            LEFT JOIN `tabOrder` o ON l.order = o.name
            LEFT JOIN `tabMerchant` m ON l.owner = m.name
            WHERE l.name = %s
        """, (ledger_id,), as_dict=True)
        
        return entry[0] if entry else None
    except Exception as e:
        frappe.log_error(f"Error in get_ledger_details: {str(e)}", "Admin Portal API")
        return None

# ============================================================================
# KYC Management APIs
# ============================================================================

@frappe.whitelist()
def get_kyc_submissions(status=None):
    """Get list of KYC submissions filtered by status"""
    try:
        check_admin_permission()
        
        filters = {}
        if status:
            filters['status'] = status
        # If no status provided, return all merchants (no filter)
        
        merchants = frappe.get_all('Merchant',
            filters=filters,
            fields=['name', 'company_name', 'personal_email', 'status', 
                    'remark', 'documents_to_reupload', 'modified'],
            order_by='modified desc'
        )
        
        return {'submissions': merchants}
    
    except Exception as e:
        frappe.log_error(f"Error in get_kyc_submissions: {str(e)}", "Admin Portal API")
        return {'submissions': []}

@frappe.whitelist()
def get_merchant_kyc_details(merchant_id):
    """Get detailed KYC info for a specific merchant"""
    try:
        check_admin_permission()
        
        merchant = frappe.get_doc('Merchant', merchant_id)
        
        # Parse documents_to_reupload
        docs_to_reupload = []
        if merchant.documents_to_reupload:
            docs_to_reupload = [d.strip() for d in merchant.documents_to_reupload.split(',')]
        
        documents = {
            'director_pan': {
                'label': 'Director PAN',
                'file_url': merchant.director_pan,
                'uploaded': bool(merchant.director_pan),
                'requires_reupload': 'director_pan' in docs_to_reupload
            },
            'director_adhar': {
                'label': 'Director Adhar',
                'file_url': merchant.director_adhar,
                'uploaded': bool(merchant.director_adhar),
                'requires_reupload': 'director_adhar' in docs_to_reupload
            },
            'company_pan': {
                'label': 'Company PAN',
                'file_url': merchant.company_pan,
                'uploaded': bool(merchant.company_pan),
                'requires_reupload': 'company_pan' in docs_to_reupload
            },
            'company_gst': {
                'label': 'Company GST',
                'file_url': merchant.company_gst,
                'uploaded': bool(merchant.company_gst),
                'requires_reupload': 'company_gst' in docs_to_reupload
            }
        }
        
        return {
            'merchant_id': merchant.name,
            'company_name': merchant.company_name,
            'email': merchant.personal_email,
            'status': merchant.status,
            'remark': merchant.remark or '',
            'documents_to_reupload': docs_to_reupload,
            'documents': documents
        }
    
    except Exception as e:
        frappe.log_error(f"Error in get_merchant_kyc_details: {str(e)}", "Admin Portal API")
        return None

@frappe.whitelist()
def approve_kyc(merchant_id):
    """Approve merchant KYC"""
    try:
        check_admin_permission()
        
        merchant = frappe.get_doc('Merchant', merchant_id)
        merchant.status = 'Approved'
        merchant.remark = ''
        merchant.documents_to_reupload = ''
        merchant.save()
        frappe.db.commit()
        
        # Send notification
        send_status_change_notification(merchant_id, 'Approved')
        
        return {'success': True, 'message': 'KYC approved successfully'}
    
    except Exception as e:
        frappe.log_error(f"Error in approve_kyc: {str(e)}", "Admin Portal API")
        return {'success': False, 'message': str(e)}

@frappe.whitelist()
def reject_kyc(merchant_id, remark, documents_to_reupload):
    """Reject merchant KYC with specific documents marked for re-upload"""
    try:
        check_admin_permission()
        
        merchant = frappe.get_doc('Merchant', merchant_id)
        merchant.status = 'Rejected'
        merchant.remark = remark
        
        if isinstance(documents_to_reupload, list):
            merchant.documents_to_reupload = ','.join(documents_to_reupload)
        else:
            merchant.documents_to_reupload = documents_to_reupload
        
        merchant.save()
        frappe.db.commit()
        
        # Send notification
        send_status_change_notification(merchant_id, 'Rejected', remark)
        
        return {'success': True, 'message': 'KYC rejected successfully'}
    
    except Exception as e:
        frappe.log_error(f"Error in reject_kyc: {str(e)}", "Admin Portal API")
        return {'success': False, 'message': str(e)}

@frappe.whitelist()
def suspend_merchant(merchant_id, reason=None):
    """Suspend a merchant account"""
    try:
        check_admin_permission()
        
        merchant = frappe.get_doc('Merchant', merchant_id)
        if merchant.status == 'Suspended':
            return {'success': False, 'message': 'Merchant is already suspended'}
            
        merchant.status = 'Suspended'
        if reason:
            merchant.remark = reason
            
        merchant.save()
        frappe.db.commit()
        
        # Send notification
        send_status_change_notification(merchant_id, 'Suspended', reason)
        
        return {'success': True, 'message': 'Merchant suspended successfully'}
        
    except Exception as e:
        frappe.log_error(f"Error in suspend_merchant: {str(e)}", "Admin Portal API")
        return {'success': False, 'message': str(e)}

@frappe.whitelist()
def reactivate_merchant(merchant_id):
    """Reactivate a suspended merchant account"""
    try:
        check_admin_permission()
        
        merchant = frappe.get_doc('Merchant', merchant_id)
        if merchant.status != 'Suspended':
            return {'success': False, 'message': 'Merchant is not suspended'}
            
        merchant.status = 'Approved'
        merchant.remark = ''
        merchant.save()
        frappe.db.commit()
        
        # Send notification
        send_status_change_notification(merchant_id, 'Approved')

        return {'success': True, 'message': 'Merchant reactivated successfully'}
        
    except Exception as e:
        frappe.log_error(f"Error in reactivate_merchant: {str(e)}", "Admin Portal API")
        return {'success': False, 'message': str(e)}
@frappe.whitelist()
def get_merchant_activity_logs(merchant_id):
    """Get activity logs for a specific merchant"""
    try:
        check_admin_permission()
        
        logs = frappe.db.sql("""
            SELECT 
                subject,
                full_name,
                modified,
                operation,
                status,
                ip_address
            FROM `tabActivity Log`
            WHERE user = %s
            ORDER BY modified DESC
            LIMIT 100
        """, (merchant_id,), as_dict=True)
        
        return {"logs": logs}
        
    except Exception as e:
        frappe.log_error(f"Error fetching merchant activity logs: {str(e)}", "Admin Portal API")
        return {"logs": []}

@frappe.whitelist()
def get_products():
    """Get list of all products"""
    try:
        check_admin_permission()
        
        products = frappe.db.sql("""
            SELECT name, product_name
            FROM `tabProduct`
            WHERE is_active = 1
            ORDER BY name
        """, as_dict=True)
        
        return {"products": products}
        
    except Exception as e:
        frappe.log_error(f"Error fetching products: {str(e)}", "Admin Portal API")
        return {"products": []}

@frappe.whitelist()
def update_merchant_pricing(merchant_id, pricing_data):
    """Update or add product pricing for a merchant"""
    try:
        check_admin_permission()
        
        # Parse pricing data if it's a string
        if isinstance(pricing_data, str):
            import json
            pricing_data = json.loads(pricing_data)
        
        # Get merchant document
        merchant_doc = frappe.get_doc("Merchant", merchant_id)
        
        # Clear existing pricing
        merchant_doc.product_pricing = []
        
        # Add new pricing rows
        for pricing in pricing_data:
            merchant_doc.append("product_pricing", {
                "product": pricing.get("product"),
                "fee_type": pricing.get("fee_type"),
                "fee": pricing.get("fee"),
                "tax_fee_type": pricing.get("tax_fee_type"),
                "tax_fee": pricing.get("tax_fee"),
                "start_value": pricing.get("start_value"),
                "end_value": pricing.get("end_value")
            })
        
        # Save the document
        merchant_doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "success": True,
            "message": "Product pricing updated successfully",
            "pricing": merchant_doc.product_pricing
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating merchant pricing: {str(e)}", "Admin Portal API")
        return {
            "success": False,
            "message": str(e)
        }

@frappe.whitelist()
def send_merchant_notification(merchant_id, subject, message):
    """Send a notification to a merchant"""
    try:
        check_admin_permission()
        
        merchant = frappe.get_doc("Merchant", merchant_id)
        
        # The merchant's 'name' field is their user ID (email they log in with)
        target_user = merchant.name
        
        frappe.logger().info(f"[Notification] Sending to merchant: {target_user}")
        frappe.logger().info(f"[Notification] Subject: {subject}")
        frappe.logger().info(f"[Notification] Message: {message}")
            
        # Create Notification Log
        notification_log = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": subject,
            "email_content": message,
            "for_user": target_user,
            "type": "Alert"
        })
        notification_log.insert(ignore_permissions=True)
        frappe.logger().info(f"[Notification] Created notification log: {notification_log.name}")
        
        # Publish Realtime Event
        # According to Frappe docs, events are sent to rooms
        # For user-specific events, use the 'user' parameter
        frappe.publish_realtime(
            event='merchant_notification',
            message={
                'title': subject,
                'message': message,
                'type': 'info',
                'timestamp': frappe.utils.now()
            },
            user=target_user  # This sends to the user:{target_user} room
        )
        
        frappe.logger().info(f"[Notification] Published realtime event to user: {target_user}")
        
        return {
            "success": True, 
            "message": f"Notification sent successfully to {target_user}"
        }
        
    except Exception as e:
        frappe.log_error(f"Error sending notification: {str(e)}", "Admin Portal API")
        frappe.logger().error(f"[Notification] Error: {str(e)}")
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def send_broadcast_notification(title, message, priority='info'):
    """Send broadcast notification to all active merchants via Socket.IO"""
    try:
        check_admin_permission()
        
        # Get all active merchants
        merchants = frappe.db.sql("""
            SELECT name, company_name
            FROM `tabMerchant`
            WHERE status = 'Approved'
        """, as_dict=True)
        
        if not merchants:
            return {"success": False, "message": "No active merchants found"}
        
        # Emit Socket.IO event to all merchants
        for merchant in merchants:
            try:
                # Create notification record for persistence
                notification = frappe.get_doc({
                    "doctype": "Notification Log",
                    "subject": title,
                    "email_content": message,
                    "for_user": merchant.name,
                    "type": "Alert",
                    "document_type": "Merchant",
                    "document_name": merchant.name
                })
                notification.insert(ignore_permissions=True)
                
                # Emit real-time Socket.IO event
                frappe.publish_realtime(
                    event='merchant_notification',
                    message={
                        'title': title,
                        'message': message,
                        'priority': priority,
                        'timestamp': frappe.utils.now()
                    },
                    user=merchant.name
                )
            except Exception as e:
                frappe.log_error(f"Error sending notification to {merchant.name}: {str(e)}", "Broadcast Notification")
                continue
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": f"Broadcast sent to {len(merchants)} merchants"
        }
        
    except Exception as e:
        frappe.log_error(f"Error in send_broadcast_notification: {str(e)}", "Admin Portal API")
        return {"success": False, "message": str(e)}
@frappe.whitelist()
def get_merchants_for_filter():
    """Get simple list of merchants for dropdowns"""
    try:
        check_admin_permission()
        merchants = frappe.db.sql("""
            SELECT name as id, company_name as name 
            FROM `tabMerchant` 
            ORDER BY company_name ASC
        """, as_dict=True)
        return {"merchants": merchants}
    except Exception as e:
        frappe.log_error(f"Error in get_merchants_for_filter: {str(e)}", "Admin Portal API")
        return {"merchants": []}

@frappe.whitelist()
def get_products_for_filter():
    """Get simple list of products for dropdowns"""
    try:
        check_admin_permission()
        products = frappe.db.sql("""
            SELECT name as id, product_name as name 
            FROM `tabProduct` 
            WHERE is_active = 1
            ORDER BY product_name ASC
        """, as_dict=True)
        return {"products": products}
    except Exception as e:
        frappe.log_error(f"Error in get_products_for_filter: {str(e)}", "Admin Portal API")
        return {"products": []}

# ============================================================================
# REPORTS PAGE APIs
# ============================================================================

@frappe.whitelist()
def get_report_metrics(start_date=None, end_date=None, merchant_id=None):
    """Get summary metrics for reports page"""
    try:
        check_admin_permission()
        
        # Set default date range (last 7 days)
        if not end_date:
            end_datetime = datetime.now()
            end_date = end_datetime.strftime('%Y-%m-%d %H:%M:%S')
        if not start_date:
            start_datetime = datetime.now() - timedelta(days=7)
            start_datetime = start_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
            start_date = start_datetime.strftime('%Y-%m-%d %H:%M:%S')
        
        # Parse datetime strings (support both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM' formats)
        try:
            if 'T' in str(start_date):
                start_date = start_date.replace('T', ' ') + ':00'
            elif len(str(start_date)) == 10:
                start_date = start_date + ' 00:00:00'
                
            if 'T' in str(end_date):
                end_date = end_date.replace('T', ' ') + ':59'
            elif len(str(end_date)) == 10:
                end_date = end_date + ' 23:59:59'
        except Exception as e:
            frappe.log_error(f"Error parsing datetime: {str(e)}", "DateTime Parse Error")
        
        # Build filters
        filters = []
        params = []
        
        if start_date:
            filters.append("creation >= %s")
            params.append(start_date)
        if end_date:
            filters.append("creation <= %s")
            params.append(end_date)
        if merchant_id and merchant_id != 'all':
            filters.append("merchant_ref_id = %s")
            params.append(merchant_id)
        
        where_clause = " AND " + " AND ".join(filters) if filters else ""
        
        # Get transaction metrics from tabOrder — revenue = SUM(fee + tax) per order type
        metrics_query = f"""
            SELECT 
                COUNT(*) as total_transactions,
                SUM(CASE WHEN status IN ('Processed', 'Success', 'Completed') THEN 1 ELSE 0 END) as successful_transactions,
                SUM(CASE WHEN status IN ('Failed', 'Cancelled', 'Reversed') THEN 1 ELSE 0 END) as failed_transactions,
                SUM(CASE WHEN status NOT IN ('Failed', 'Cancelled', 'Reversed') THEN COALESCE(order_amount, 0) ELSE 0 END) as total_volume,
                AVG(CASE WHEN status NOT IN ('Failed', 'Cancelled', 'Reversed') THEN COALESCE(order_amount, 0) ELSE NULL END) as avg_transaction,

                -- Payout revenue (order_type = 'Pay'): sum of fee + tax on processed orders
                SUM(CASE WHEN order_type = 'Pay' AND status = 'Processed'
                    THEN COALESCE(fee, 0) + COALESCE(tax, 0) ELSE 0 END) as payout_revenue,
                SUM(CASE WHEN order_type = 'Pay' AND status = 'Processed'
                    THEN COALESCE(order_amount, 0) ELSE 0 END) as payout_volume,

                -- Payin revenue (order_type = 'Topup'): sum of fee + tax on processed orders
                SUM(CASE WHEN order_type = 'Topup' AND status = 'Processed'
                    THEN COALESCE(fee, 0) + COALESCE(tax, 0) ELSE 0 END) as payin_revenue,
                SUM(CASE WHEN order_type = 'Topup' AND status = 'Processed'
                    THEN COALESCE(order_amount, 0) ELSE 0 END) as payin_volume
            FROM `tabOrder`
            WHERE 1=1 {where_clause}
        """
        
        metrics = frappe.db.sql(metrics_query, tuple(params), as_dict=True)[0]
        
        # Calculate success rate
        success_rate = 0
        if metrics['total_transactions'] > 0:
            success_rate = (metrics['successful_transactions'] / metrics['total_transactions']) * 100

        # Overall revenue margin = total revenue / total volume * 100
        total_revenue = float(metrics.get('payout_revenue') or 0) + float(metrics.get('payin_revenue') or 0)
        total_processed_vol = float(metrics.get('payout_volume') or 0) + float(metrics.get('payin_volume') or 0)
        overall_margin = round((total_revenue / total_processed_vol) * 100, 2) if total_processed_vol > 0 else 0.0
        
        # Get new merchants count in date range
        merchant_filters = []
        merchant_params = []
        if start_date:
            merchant_filters.append("DATE(creation) >= %s")
            merchant_params.append(start_date)
        if end_date:
            merchant_filters.append("DATE(creation) <= %s")
            merchant_params.append(end_date)
        
        merchant_where = " AND " + " AND ".join(merchant_filters) if merchant_filters else ""
        
        new_merchants_query = f"""
            SELECT COUNT(*) as count
            FROM `tabMerchant`
            WHERE 1=1 {merchant_where}
        """
        
        new_merchants = frappe.db.sql(new_merchants_query, tuple(merchant_params), as_dict=True)[0]['count']
        
        return {
            'total_volume': float(metrics['total_volume'] or 0),
            'avg_transaction': float(metrics['avg_transaction'] or 0),
            'success_rate': round(success_rate, 2),
            'new_merchants': new_merchants,
            'total_transactions': metrics['total_transactions'],
            'failed_transactions': metrics['failed_transactions'],
            'payout_revenue': float(metrics.get('payout_revenue') or 0),
            'payin_revenue': float(metrics.get('payin_revenue') or 0),
            'overall_revenue_margin': overall_margin
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_report_metrics: {str(e)}", "Admin Portal API")
        return {
            'total_volume': 0,
            'avg_transaction': 0,
            'success_rate': 0,
            'new_merchants': 0,
            'total_transactions': 0,
            'failed_transactions': 0,
            'payout_revenue': 0,
            'payin_revenue': 0,
            'overall_revenue_margin': 0
        }

@frappe.whitelist()
def get_volume_trend(start_date=None, end_date=None, merchant_id=None, grouping='day'):
    """Get volume trend data for chart"""
    try:
        check_admin_permission()
        
        # Set default date range (last 7 days)
        if not end_date:
            end_datetime = datetime.now()
            end_date = end_datetime.strftime('%Y-%m-%d %H:%M:%S')
        if not start_date:
            start_datetime = datetime.now() - timedelta(days=7)
            start_datetime = start_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
            start_date = start_datetime.strftime('%Y-%m-%d %H:%M:%S')
        
        # Normalize datetime strings
        start_date = normalize_date_filter(start_date, is_end_date=False)
        end_date = normalize_date_filter(end_date, is_end_date=True)
        
        # Build filters
        filters = []
        params = []
        
        filters.append("creation >= %s")
        params.append(start_date)
        filters.append("creation <= %s")
        params.append(end_date)
        
        if merchant_id and merchant_id != 'all':
            filters.append("merchant_ref_id = %s")
            params.append(merchant_id)
        
        where_clause = " AND ".join(filters)
        
        # Determine date grouping format
        date_format = {
            'day': '%%Y-%%m-%%d',
            'week': '%%Y-%%u',
            'month': '%%Y-%%m'
        }.get(grouping, '%%Y-%%m-%%d')
        
        # Include Pending/Processing in volume trend
        trend_query = f"""
            SELECT 
                DATE_FORMAT(creation, '{date_format}') as date,
                SUM(CASE WHEN status NOT IN ('Failed', 'Cancelled', 'Reversed') THEN COALESCE(order_amount, 0) ELSE 0 END) as volume,
                COUNT(*) as transaction_count
            FROM `tabOrder`
            WHERE {where_clause}
            GROUP BY DATE_FORMAT(creation, '{date_format}')
            ORDER BY date ASC
        """
        
        trend_data = frappe.db.sql(trend_query, tuple(params), as_dict=True)
        trend_map = {row['date']: row for row in trend_data}
        
        # Fill in missing dates
        final_data = []
        current = datetime.strptime(start_date.split(' ')[0], '%Y-%m-%d')
        end = datetime.strptime(end_date.split(' ')[0], '%Y-%m-%d')
        
        while current <= end:
            date_str = current.strftime('%Y-%m-%d')
            if grouping == 'month':
                date_str = current.strftime('%Y-%m')
            
            # Simple handling for day grouping, can be expanded for week/month logic
            # For now, relying on the loop to generate daily points, 
            # if grouping is day, this matches. If month, this might generate duplicate keys if not careful.
            # Assuming 'day' grouping for the main chart for now as standard.
            
            if grouping == 'day':
                formatted_date = date_str
                next_step = timedelta(days=1)
            else:
                 # Fallback for complex groupings not fully implemented in gap filling
                 formatted_date = date_str
                 next_step = timedelta(days=1)

            entry = trend_map.get(formatted_date, {
                'date': formatted_date,
                'volume': 0,
                'transaction_count': 0
            })
            
            # Ensure float type
            entry['volume'] = float(entry.get('volume') or 0)
            
            final_data.append(entry)
            current += next_step
            
            # Avoid infinite loop if grouping logic is off
            if grouping != 'day' and len(final_data) > 365: 
                break 
                
        # If grouping is not day, revert to original data to safely avoid gap-filling logic errors for now,
        # unless we implement proper month-stepping.
        if grouping != 'day':
             final_data = [
                {
                    'date': row['date'],
                    'volume': float(row['volume'] or 0),
                    'transaction_count': row['transaction_count']
                }
                for row in trend_data
            ]
            
        return {
            'trend_data': final_data
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_volume_trend: {str(e)}", "Admin Portal API")
        return {'trend_data': []}

@frappe.whitelist()
def get_product_distribution(start_date=None, end_date=None, merchant_id=None):
    """Get product distribution for reports"""
    try:
        check_admin_permission()
        
        # Set default date range (last 7 days)
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
        # 1. Get ALL active products first
        all_products = frappe.db.sql("""
            SELECT name as product_name 
            FROM `tabProduct` 
            WHERE is_active = 1
        """, as_dict=True)
        
        product_map = {p['product_name']: {'volume': 0, 'count': 0} for p in all_products}
        
        # 2. Get distribution data
        filters = []
        params = []
        
        filters.append("DATE(creation) >= %s")
        params.append(start_date)
        filters.append("DATE(creation) <= %s")
        params.append(end_date)
        
        if merchant_id and merchant_id != 'all':
            filters.append("merchant_ref_id = %s")
            params.append(merchant_id)
        
        where_clause = " AND ".join(filters)
        
        distribution_query = f"""
            SELECT 
                product,
                SUM(COALESCE(order_amount, 0)) as volume,
                COUNT(*) as transaction_count
            FROM `tabOrder`
            WHERE {where_clause}
            GROUP BY product
        """
        
        distribution_data = frappe.db.sql(distribution_query, tuple(params), as_dict=True)
        
        # 3. Merge data
        total_volume = 0
        for row in distribution_data:
            prod_name = row['product']
            if prod_name:
                vol = float(row['volume'] or 0)
                total_volume += vol
                if prod_name in product_map:
                    product_map[prod_name]['volume'] = vol
                    product_map[prod_name]['count'] = row['transaction_count']
                else:
                    # Handle case where product might rely on a soft link or old name
                    product_map[prod_name] = {'volume': vol, 'count': row['transaction_count']}

        # 4. Format Result
        distribution = []
        for prod_name, data in product_map.items():
            volume = data['volume']
            percentage = (volume / total_volume * 100) if total_volume > 0 else 0
            distribution.append({
                'product': prod_name,
                'volume': volume,
                'percentage': round(percentage, 2),
                'transaction_count': data['count']
            })
            
        # Sort by volume desc
        distribution.sort(key=lambda x: x['volume'], reverse=True)
        
        return {'distribution': distribution}
        
    except Exception as e:
        frappe.log_error(f"Error in get_product_distribution: {str(e)}", "Admin Portal API")
        return {'distribution': []}

@frappe.whitelist()
def get_report_insights(start_date=None, end_date=None, merchant_id=None):
    """Get insights like top merchant and failed products"""
    try:
        check_admin_permission()
        
        # Base filter setup
        conditions = []
        values = {}
        if start_date:
            conditions.append("creation >= %(start_date)s")
            values["start_date"] = f"{start_date} 00:00:00"
        if end_date:
            conditions.append("creation <= %(end_date)s")
            values["end_date"] = f"{end_date} 23:59:59"
        if merchant_id:
            conditions.append("merchant_ref_id = %(merchant_id)s")
            values["merchant_id"] = merchant_id
            
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # 1. Top Merchant
        # If a specific merchant is selected, they are the top merchant effectively
        if merchant_id and merchant_id != 'all':
            merchant_name = frappe.db.get_value("Merchant", merchant_id, "company_name")
            top_merchant = {"name": merchant_name, "percentage": 100}
        else:
            # Included Pending/Processing and used LEFT JOIN
            top_merch_data = frappe.db.sql(f"""
                SELECT merchant_ref_id, SUM(order_amount) as volume
                FROM `tabOrder`
                WHERE {where_clause} AND status NOT IN ('Failed', 'Cancelled', 'Reversed')
                GROUP BY merchant_ref_id
                ORDER BY volume DESC
                LIMIT 1
            """, values, as_dict=True)
            
            if top_merch_data:
                total_vol = frappe.db.sql(f"""
                    SELECT SUM(order_amount) as total 
                    FROM `tabOrder` 
                    WHERE {where_clause} AND status NOT IN ('Failed', 'Cancelled', 'Reversed')
                """, values, as_dict=True)[0].total or 0
                
                percentage = round((top_merch_data[0].volume / total_vol * 100), 1) if total_vol > 0 else 0
                name = top_merch_data[0].merchant_ref_id or "Unknown Merchant"
                top_merchant = {"name": name, "percentage": percentage}
            else:
                top_merchant = {"name": "N/A", "percentage": 0}

        # 2. Failed Product
        failed_prod_data = frappe.db.sql(f"""
            SELECT product, COUNT(*) as count
            FROM `tabOrder`
            WHERE {where_clause} 
            AND status IN ('Failed', 'Cancelled')
            GROUP BY product
            ORDER BY count DESC
            LIMIT 1
        """, values, as_dict=True)
        
        if failed_prod_data:
             failed_product = {"name": failed_prod_data[0].product or "Unknown", "count": failed_prod_data[0].count}
        else:
             failed_product = {"name": "None", "count": 0}

        return {
            "top_merchant": top_merchant,
            "failed_product": failed_product
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_report_insights: {str(e)}", "Admin Portal API")
        return {"top_merchant": {"name": "N/A", "percentage": 0}, "failed_product": {"name": "N/A", "count": 0}}

@frappe.whitelist()
def get_report_transactions(start_date=None, end_date=None, merchant_id=None, product=None, status=None, search=None, page=1, page_size=20):
    """Get transactions for reports page with pagination"""
    try:
        check_admin_permission()
        
        # Set default date range (last 7 days)
        if not end_date:
            end_datetime = datetime.now()
            end_date = end_datetime.strftime('%Y-%m-%d %H:%M:%S')
        if not start_date:
            start_datetime = datetime.now() - timedelta(days=7)
            start_datetime = start_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
            start_date = start_datetime.strftime('%Y-%m-%d %H:%M:%S')
        
        # Parse datetime strings (support both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM' formats)
        try:
            if 'T' in str(start_date):
                # Frontend sends YYYY-MM-DDTHH:MM format, convert to YYYY-MM-DD HH:MM:SS
                start_date = start_date.replace('T', ' ') + ':00'
            elif len(str(start_date)) == 10:
                # Date only, add time
                start_date = start_date + ' 00:00:00'
                
            if 'T' in str(end_date):
                end_date = end_date.replace('T', ' ') + ':59'
            elif len(str(end_date)) == 10:
                # Date only, add time
                end_date = end_date + ' 23:59:59'
        except Exception as e:
            frappe.log_error(f"Error parsing datetime: {str(e)}", "DateTime Parse Error")
        
        # Build filters
        filters = []
        params = []
        
        filters.append("t.creation >= %s")
        params.append(start_date)
        filters.append("t.creation <= %s")
        params.append(end_date)
        
        if merchant_id and merchant_id != 'all':
            filters.append("t.merchant = %s")
            params.append(merchant_id)
        
        if product and product != 'all':
            filters.append("t.product = %s")
            params.append(product)
        
        if status and status != 'all':
            filters.append("t.status = %s")
            params.append(status)
        
        if search:
            filters.append("(t.name LIKE %s OR o.customer_name LIKE %s)")
            search_param = f"%{search}%"
            params.extend([search_param, search_param])
        
        where_clause = " AND ".join(filters)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabTransaction` t
            LEFT JOIN `tabOrder` o ON t.order = o.name
            LEFT JOIN `tabMerchant` m ON t.merchant = m.name
            WHERE {where_clause}
        """
        
        
        total = frappe.db.sql(count_query, tuple(params), as_dict=True)[0]['total']
        
        
        # Calculate offset
        page = int(page)
        page_size = int(page_size)
        offset = (page - 1) * page_size
        
        # Get transactions
        transactions_query = f"""
            SELECT 
                t.name as id,
                t.creation as date,
                t.merchant as merchant,
                m.company_name as merchant_name,
                o.customer_name,
                t.product,
                t.amount,
                t.status
            FROM `tabTransaction` t
            LEFT JOIN `tabOrder` o ON t.order = o.name
            LEFT JOIN `tabMerchant` m ON t.merchant = m.name
            WHERE {where_clause}
            ORDER BY t.creation DESC
            LIMIT {int(page_size)} OFFSET {offset}
        """
        
        
        transactions = frappe.db.sql(transactions_query, tuple(params), as_dict=True)
        
        return {
            "transactions": transactions,
            "total": total,
            "page": page,
            "page_size": page_size
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_report_transactions: {str(e)}", "Admin Portal API")
        return {"transactions": [], "total": 0}

@frappe.whitelist()
def get_report_ledgers(start_date=None, end_date=None, merchant_id=None, entry_type=None, page=1, page_size=20):
    """Get ledger entries for reports page with pagination"""
    try:
        check_admin_permission()
        
        # Set default date range (last 7 days)
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
        # Build filters
        filters = []
        params = []
        
        # Normalize datetime strings
        start_date = normalize_date_filter(start_date, is_end_date=False)
        end_date = normalize_date_filter(end_date, is_end_date=True)
        
        filters.append("l.creation >= %s")
        params.append(start_date)
        filters.append("l.creation <= %s")
        params.append(end_date)
        
        if merchant_id and merchant_id != 'all':
            filters.append("o.merchant_ref_id = %s")
            params.append(merchant_id)
        
        if entry_type and entry_type != 'all':
            filters.append("l.transaction_type = %s")
            params.append(entry_type)
        
        where_clause = " AND ".join(filters)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabLedger` l
            LEFT JOIN `tabOrder` o ON l.order = o.name
            WHERE {where_clause}
        """
        
        total = frappe.db.sql(count_query, tuple(params), as_dict=True)[0]['total']
        
        # Calculate offset
        page = int(page)
        page_size = int(page_size)
        offset = (page - 1) * page_size
        
        # Get ledger entries
        ledgers_query = f"""
            SELECT 
                l.name as id,
                l.creation as date,
                o.merchant_ref_id as merchant,
                m.company_name as merchant_name,
                l.transaction_type as type,
                l.transaction_amount,
                l.opening_balance,
                l.closing_balance,
                l.status
            FROM `tabLedger` l
            LEFT JOIN `tabOrder` o ON l.order = o.name
            LEFT JOIN `tabMerchant` m ON o.merchant_ref_id = m.name
            WHERE {where_clause}
            ORDER BY l.creation DESC
            LIMIT %s OFFSET %s
        """
        
        params.extend([page_size, offset])
        ledgers = frappe.db.sql(ledgers_query, tuple(params), as_dict=True)
        
        return {
            'ledgers': [
                {
                    'id': ledger['id'],
                    'date': str(ledger['date']),
                    'merchant_id': ledger['merchant'],
                    'merchant_name': ledger['merchant_name'] or 'Unknown',
                    'type': ledger['type'] or 'Unknown',
                    'description': f"{ledger['type']} - {ledger['status']}" if ledger.get('status') else ledger['type'],
                    'credit': float(ledger['transaction_amount'] or 0) if ledger['type'] == 'Credit' else 0,
                    'debit': float(ledger['transaction_amount'] or 0) if ledger['type'] == 'Debit' else 0,
                    'balance': float(ledger['closing_balance'] or 0)
                }
                for ledger in ledgers
            ],
            'total': total,
            'page': page,
            'page_size': page_size
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_report_ledgers: {str(e)}", "Admin Portal API")
        return {'ledgers': [], 'total': 0, 'page': 1, 'page_size': 20}


@frappe.whitelist()
def get_report_settlements(start_date=None, end_date=None, merchant_id=None, status=None, page=1, page_size=20):
    """Get settlements (Virtual Account Logs) for reports page with pagination"""
    try:
        check_admin_permission()
        
        # Set default date range (last 7 days)
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
        # Build filters
        filters = []
        params = []
        
        # Normalize datetime strings
        start_date = normalize_date_filter(start_date, is_end_date=False)
        end_date = normalize_date_filter(end_date, is_end_date=True)
        
        filters.append("v.creation >= %s")
        params.append(start_date)
        filters.append("v.creation <= %s")
        params.append(end_date)
        
        if merchant_id and merchant_id != 'all':
            filters.append("va.merchant = %s")
            params.append(merchant_id)
        
        if status and status != 'all':
            filters.append("v.status = %s")
            params.append(status)
        
        where_clause = " AND ".join(filters)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM `tabVirtual Account Logs` v
            LEFT JOIN `tabVirtual Account` va ON v.virtual_account = va.name
            WHERE {where_clause}
        """
        
        total = frappe.db.sql(count_query, tuple(params), as_dict=True)[0]['total']
        
        # Calculate offset
        page = int(page)
        page_size = int(page_size)
        offset = (page - 1) * page_size
        
        # Get settlements
        settlements_query = f"""
            SELECT 
                v.name as id,
                va.merchant,
                m.company_name as merchant_name,
                v.creation as period_start,
                v.modified as period_end,
                v.amount,
                v.fee,
                (v.amount - COALESCE(v.fee, 0)) as net_amount,
                v.status
            FROM `tabVirtual Account Logs` v
            LEFT JOIN `tabVirtual Account` va ON v.virtual_account = va.name
            LEFT JOIN `tabMerchant` m ON va.merchant = m.name
            WHERE {where_clause}
            ORDER BY v.creation DESC
            LIMIT %s OFFSET %s
        """
        
        params.extend([page_size, offset])
        settlements = frappe.db.sql(settlements_query, tuple(params), as_dict=True)
        
        return {
            'settlements': [
                {
                    'id': stl['id'],
                    'merchant_id': stl['merchant'],
                    'merchant_name': stl['merchant_name'] or 'Unknown',
                    'period_start': str(stl['period_start']),
                    'period_end': str(stl['period_end']),
                    'amount': float(stl['amount'] or 0),
                    'fee': float(stl['fee'] or 0),
                    'net_amount': float(stl['net_amount'] or 0),
                    'status': stl['status'] or 'Unknown'
                }
                for stl in settlements
            ],
            'total': total,
            'page': page,
            'page_size': page_size
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_report_settlements: {str(e)}", "Admin Portal API")
        return {'settlements': [], 'total': 0, 'page': 1, 'page_size': 20}

@frappe.whitelist()
def get_merchants_for_filter():
    """Get list of merchants for filter dropdown"""
    try:
        check_admin_permission()
        
        merchants = frappe.db.sql("""
            SELECT 
                name as id,
                company_name as name
            FROM `tabMerchant`
            ORDER BY company_name ASC
        """, as_dict=True)
        
        return {
            'merchants': [
                {
                    'id': m['id'],
                    'name': m['name'] or m['id']
                }
                for m in merchants
            ]
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_merchants_for_filter: {str(e)}", "Admin Portal API")
        return {'merchants': []}

@frappe.whitelist()
def get_products_for_filter():
    """Get list of products for filter dropdown"""
    try:
        check_admin_permission()
        
        products = frappe.db.sql("""
            SELECT 
                product_name as name
            FROM `tabProduct`
            ORDER BY product_name ASC
        """, as_dict=True)
        
        return {
            'products': [
                {
                    'id': p['name'],
                    'name': p['name']
                }
                for p in products
            ]
        }
        
    except Exception as e:
        frappe.log_error(f"Error in get_products_for_filter: {str(e)}", "Admin Portal API")
        return {'products': []}

# @frappe.whitelist()
# def get_report_insights(start_date=None, end_date=None, merchant_id=None):
#     """Get dynamic insights for reports page"""
#     try:
#         check_admin_permission()
        
#         # Set default date range (last 7 days)
#         if not end_date:
#             end_date = datetime.now().strftime('%Y-%m-%d')
#         if not start_date:
#             start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
#         # Build filters
#         filters = []
#         params = []
        
        
#         filters.append("DATE(creation) >= %s")
#         params.append(start_date)
#         filters.append("DATE(creation) <= %s")
#         params.append(end_date)
#         filters.append("status = 'Processed'")
        
#         if merchant_id and merchant_id != 'all':
#             filters.append("merchant_ref_id = %s")
#             params.append(merchant_id)
        
#         where_clause = " AND ".join(filters)
        
#         # Get top performing merchant
#         top_merchant_query = f"""
#             SELECT 
#                 merchant_ref_id,
#                 SUM(COALESCE(order_amount, 0)) as total_volume,
#                 COUNT(*) as transaction_count
#             FROM `tabOrder` o
#             WHERE {where_clause}
#             GROUP BY merchant_ref_id
#             ORDER BY total_volume DESC
#             LIMIT 1
#         """
        
#         top_merchant = frappe.db.sql(top_merchant_query, tuple(params), as_dict=True)
        
#         # Get total volume for percentage calculation
#         total_volume_query = f"""
#             SELECT SUM(COALESCE(order_amount, 0)) as total
#             FROM `tabOrder`
#             WHERE {where_clause}
#         """
        
#         total_volume = frappe.db.sql(total_volume_query, tuple(params), as_dict=True)[0]['total'] or 0
        
#         # Calculate top merchant percentage
#         top_merchant_percentage = 0
#         top_merchant_name = "N/A"
#         if top_merchant and total_volume > 0:
#             top_merchant_percentage = round((top_merchant[0]['total_volume'] / total_volume) * 100, 1)
#             top_merchant_name = top_merchant[0]['company_name'] or top_merchant[0]['merchant_ref_id']
        
#         # Get product with most failures
#         failed_product_query = f"""
#             SELECT 
#                 product,
#                 COUNT(*) as failed_count
#             FROM `tabOrder`
#             WHERE DATE(creation) >= %s 
#                 AND DATE(creation) <= %s
#                 AND status IN ('Cancelled', 'Reversed', 'Failed')
#             GROUP BY product
#             ORDER BY failed_count DESC
#             LIMIT 1
#         """
        
#         failed_product = frappe.db.sql(failed_product_query, (start_date, end_date), as_dict=True)
        
#         failed_product_name = "N/A"
#         failed_count = 0
#         if failed_product:
#             failed_product_name = failed_product[0]['product'] or 'Unknown'
#             failed_count = failed_product[0]['failed_count']
        
#         return {
#             'top_merchant': {
#                 'name': top_merchant_name,
#                 'percentage': top_merchant_percentage
#             },
#             'failed_product': {
#                 'name': failed_product_name,
#                 'count': failed_count
#             }
#         }
        
#     except Exception as e:
#         frappe.log_error(f"Error in get_report_insights: {str(e)}", "Admin Portal API")
#         return {
#             'top_merchant': {'name': 'N/A', 'percentage': 0},
#             'failed_product': {'name': 'N/A', 'count': 0}
#         }

@frappe.whitelist()
def export_report(filters=None, report_type=None):
    """Export report data as CSV"""
    try:
        check_admin_permission()
        
        if isinstance(filters, str):
            filters = json.loads(filters)
            
        if not report_type and filters and filters.get('report_type'):
            report_type = filters.get('report_type')
            
        data = []
        columns = []
        filename = f"{report_type}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        if report_type == 'transactions':
            # Get transactions (reuse logic but no pagination limit ideally, or large limit)
            # For simplicity, we'll fetch up to 5000 records for export
            res = get_transactions(json.dumps(filters), page=1, page_size=5000)
            transactions = res.get('transactions', [])
            
            columns = ['ID', 'Date', 'Merchant', 'Customer', 'Product', 'Amount', 'Status', 'UTR']
            for t in transactions:
                data.append([
                    t.get('id'),
                    t.get('date'),
                    t.get('merchant_name'),
                    t.get('customer_name'),
                    t.get('payment_method'),
                    t.get('amount'),
                    t.get('status'),
                    t.get('utr')
                ])
                
        elif report_type == 'ledgers':
            res = get_ledger_entries(json.dumps(filters), page=1, page_size=5000)
            entries = res.get('entries', [])
            
            columns = ['ID', 'Date', 'Merchant', 'Description', 'Credit', 'Debit', 'Balance']
            for e in entries:
                data.append([
                    e.get('id'),
                    e.get('date'),
                    e.get('merchant_name'),
                    e.get('order_id'),
                    e.get('credit'),
                    e.get('debit'),
                    e.get('balance')
                ])
                
        elif report_type == 'settlements':
            res = get_van_logs(json.dumps(filters), page=1, page_size=5000)
            logs = res.get('logs', []) # get_van_logs returns 'logs'
            
            columns = ['ID', 'Date', 'Merchant', 'Account Number', 'Amount', 'Type', 'Status', 'UTR']
            for l in logs:
                data.append([
                    l.get('id'),
                    l.get('date'),
                    l.get('merchant_name'),
                    l.get('account_number'),
                    l.get('amount'),
                    l.get('type'),
                    l.get('status'),
                    l.get('utr')
                ])


        filename = f"{report_type}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

        # build data with columns as first row
        rows = [columns] + data

        xlsx_file = make_xlsx(rows, report_type)
        saved_file = save_file(filename, xlsx_file.getvalue(), "User", frappe.session.user, is_private=0)
        return {"file_url": saved_file.file_url}

    except Exception as e:
        frappe.log_error(f"Error in export_report: {str(e)}", "Admin Portal API")
        frappe.throw("Failed to generate export")

@frappe.whitelist()
def global_search(query):
    """Search across Transactions, Merchants, Orders, and Virtual Accounts"""
    try:
        check_admin_permission()
        
        if not query or len(query) < 2:
            return {"results": []}
            
        search_term = f"%{query}%"
        results = []
        
        # 1. Search Transactions
        # Search by ID, UTR, Amount
        transactions = frappe.db.sql("""
            SELECT 
                name as id,
                amount,
                status,
                'transaction' as type
            FROM `tabTransaction`
            WHERE name LIKE %s 
               OR transaction_reference_id LIKE %s
               OR CAST(amount AS CHAR) LIKE %s
            LIMIT 5
        """, (search_term, search_term, search_term), as_dict=True)
        
        for t in transactions:
            results.append({
                "type": "transaction",
                "id": t.id,
                "title": t.id,
                "subtitle": f"₹{t.amount} - {t.status}",
                "url": f"/admin/transactions/{t.id}"
            })
            
        # 2. Search Merchants
        # Search by Name, Company Name, Email
        merchants = frappe.db.sql("""
            SELECT 
                name,
                company_name,
                company_email,
                'merchant' as type
            FROM `tabMerchant`
            WHERE name LIKE %s 
               OR company_name LIKE %s
               OR company_email LIKE %s
            LIMIT 5
        """, (search_term, search_term, search_term), as_dict=True)
        
        for m in merchants:
            results.append({
                "type": "merchant",
                "id": m.name,
                "title": m.company_name,
                "subtitle": m.company_email,
                "url": f"/admin/merchants/{m.name}"
            })
            
        # 3. Search Orders
        # Search by ID, Customer Name
        orders = frappe.db.sql("""
            SELECT 
                name as id,
                customer_name,
                order_amount as amount,
                'order' as type
            FROM `tabOrder`
            WHERE name LIKE %s 
               OR customer_name LIKE %s
            LIMIT 5
        """, (search_term, search_term), as_dict=True)
        
        for o in orders:
            results.append({
                "type": "order",
                "id": o.id,
                "title": o.id,
                "subtitle": f"{o.customer_name} - ₹{o.amount}",
                "url": f"/admin/orders?search={o.id}" 
            })

        # 4. Search Virtual Accounts (Settlements/VANs)
        # Search by Account Number, Name
        virtual_accounts = frappe.db.sql("""
            SELECT 
                name as id,
                account_number,
                ifsc,
                'virtual_account' as type
            FROM `tabVirtual Account`
            WHERE name LIKE %s 
               OR account_number LIKE %s
            LIMIT 5
        """, (search_term, search_term), as_dict=True)
        
        for va in virtual_accounts:
            results.append({
                "type": "virtual_account",
                "id": va.id,
                "title": va.account_number,
                "subtitle": va.ifsc,
                "url": f"/admin/virtual-accounts/{va.id}" 
            })

        # 5. Search Settlements (VAN Logs)
        # Search by ID, UTR
        settlements = frappe.db.sql("""
            SELECT 
                name as id,
                amount,
                status,
                utr,
                'settlement' as type
            FROM `tabVirtual Account Logs`
            WHERE name LIKE %s 
               OR utr LIKE %s
            LIMIT 5
        """, (search_term, search_term), as_dict=True)
        
        for s in settlements:
            results.append({
                "type": "settlement",
                "id": s.id,
                "title": s.utr or s.id,
                "subtitle": f"₹{s.amount} - {s.status}",
                "url": f"/admin/settlements/{s.id}" 
            })

        return {"results": results}

    except Exception as e:
        frappe.log_error(f"Error in global_search: {str(e)}", "Admin Portal API")
        return {"results": []}