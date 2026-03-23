import frappe
import requests
import json
from frappe.utils import now_datetime

TRANSACTION_STATUS_EVENT_MAP = {
    "Success":      "TRANSACTION_SUCCESS",
    "Failed":       "TRANSACTION_FAILED",
    "Reversed":     "REVERSED",
    "Refund Failed":"REFUND_FAILED",
    "Topup Success":"TOPUP_SUCCESS",
    "Topup Failed": "TOPUP_FAILED",
}

def dispatch(transaction_name: str, merchant: str, status: str):
    """Enqueue webhook dispatch — non-blocking."""
    frappe.enqueue(
        "iswitch.webhook_dispatcher.send_webhook",
        transaction_name=transaction_name,
        merchant=merchant,
        status=status,
        queue="short",
        timeout=300,
    )

def send_webhook(transaction_name: str, merchant: str, status: str):
    """
    Fetch merchant's webhook URL and POST transaction payload.
    Called in background via frappe.enqueue.
    """
    try:
        frappe.set_user(merchant)
        webhook_url = frappe.db.get_value("Merchant", merchant, "webhook")
        if not webhook_url:
            frappe.log_error(f"No webhook URL for merchant {merchant}", "Webhook Skip")
            return

        event = TRANSACTION_STATUS_EVENT_MAP.get(status, "UNKNOWN")
        
        doc = frappe.get_doc("Transaction",transaction_name)

        payload = {
            "event": event,
            "crn": doc.order,
            "clientRefID": doc.client_ref_id,
            "status": status,
            "utr": doc.transaction_reference_id,
            "timestamp": str(now_datetime())
        }

        response = requests.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )

        # Log the attempt
        _log_webhook(
            order_name=doc.order,
            transaction_name=transaction_name,
            webhook_url=webhook_url,
            payload=payload,
            status_code=response.status_code,
            response_text=response.text,
            success=response.ok,
            merchant = merchant
        )

    except Exception:
        frappe.log_error("Webhook Dispatch Error", frappe.get_traceback())


def _log_webhook(order_name, transaction_name, webhook_url, payload, status_code, response_text, success, merchant):
    """Persist webhook attempt log using Frappe's built-in Webhook Request Log."""
    frappe.get_doc({
        "doctype": "Webhook Request Log",
        "reference_document": transaction_name,   # Data field — plain string
        "webhook": merchant,
        "url": webhook_url,
        "data": json.dumps(payload, indent=2),    # JSON Code field
        "headers": json.dumps({                   # JSON Code field
            "Content-Type": "application/json"
        }, indent=2),
        "user": merchant,
        "response": response_text[:500] if response_text else None,
        "error": None if success else f"HTTP {status_code}: {response_text[:300]}",  # store failure info here
    }).insert(ignore_permissions=True)
