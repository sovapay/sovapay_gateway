from pydoc import doc
import frappe
import json
import hmac
import hashlib
import base64
from typing import Dict, Any, Tuple
from frappe import _
from frappe.utils import now, get_datetime
from decimal import Decimal
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client
from iswitch.order_webhook_handlers import (
            handle_topup_success,
            handle_topup_failure,
            handle_refund_success,
            handle_refund_failure,
            handle_transaction_failure,
            handle_transaction_success
        )


@frappe.whitelist(allow_guest=True)
def albepay_webhook():
    """
    SovaPay webhook endpoint to handle payment notifications.
    """
    try:
        if frappe.request.method != "POST":
            return frappe.response.update({
                "http_status_code": 405,
                "message": "Only POST method allowed",
                "status": "failed"
            })

        # Parse JSON payload
        try:
            payload = json.loads(frappe.request.data)
            webhook = frappe.get_doc({
                "doctype":"SovaPay Webhook",
                "webhook_data":payload,
                "integration": "AlbePay"
            }).insert(ignore_permissions=True)
            webhook.submit()
            frappe.db.commit()
            frappe.enqueue("iswitch.webhook.process_webhook",
                doc=webhook,
                queue="short",
                timeout=300)
                
            return {"status": "success", "message": "Webhook processed"}
            
        except json.JSONDecodeError:
            frappe.log_error("Invalid JSON in webhook request", "Xettle Webhook")
            return frappe.response.update({
                "http_status_code": 400,
                "message": "Invalid JSON payload",
                "status": "failed"
            })

    except Exception as e:
        frappe.log_error("Webhook processing error", str(e))
        return {
            "http_status_code": 500,
            "message": "Internal server error",
            "status": "failed"
        }

@frappe.whitelist(allow_guest=True)
def albepay_payin_webhook():
    """
    SovaPay webhook endpoint to handle payment notifications.
    """
    try:
        if frappe.request.method != "POST":
            return frappe.response.update({
                "http_status_code": 405,
                "message": "Only POST method allowed",
                "status": "failed"
            })

        # Parse JSON payload
        try:
            payload = json.loads(frappe.request.data)
            webhook = frappe.get_doc({
                "doctype":"SovaPay Webhook",
                "webhook_data":payload,
                "integration": "AlbePay Payin"
            }).insert(ignore_permissions=True)
            webhook.submit()
            frappe.db.commit()
            frappe.enqueue("iswitch.webhook.process_webhook",
                doc=webhook,
                queue="short",
                timeout=300)
                
            return {"status": "success", "message": "Webhook processed"}
            
        except json.JSONDecodeError:
            frappe.log_error("Invalid JSON in webhook request", "Xettle Webhook")
            return frappe.response.update({
                "http_status_code": 400,
                "message": "Invalid JSON payload",
                "status": "failed"
            })

    except Exception as e:
        frappe.log_error("Webhook processing error", str(e))
        return {
            "http_status_code": 500,
            "message": "Internal server error",
            "status": "failed"
        }

def process_webhook(doc):
    frappe.db.savepoint("webhook_process")
    try:
        webhook_response, integration = frappe.db.get_value(
            "SovaPay Webhook", doc.name, ["webhook_data", "integration"]
        )

        payload = json.loads(webhook_response)

        if integration == "AlbePay":
            process_albepay_webhook(payload)
        elif integration == "AlbePay Payin":
            process_albepay_payin_webhook(payload)

    except Exception as e:
        frappe.db.rollback(save_point = "webhook_process")
        frappe.log_error("Error in processing webhook", str(e))

def process_albepay_payin_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process Albepay Payment Bank webhook.
    Routes to appropriate handler based on order type (Pay, Topup, Refund).
    """
    try:
        status = payload.get("updatedStatus","")
        client_id = payload.get("clientRefNo","")
        utr = payload.get("utr","")
        remark = payload.get("reason","")
        order_id = frappe.db.get_value("Order",{"processor_order_id":client_id}, "name")
        
        if not order_id:
            frappe.log_error(f"Order not found processor_id {client_id}","Skip")

        if status == "FAILURE" or status == "FAILED":
            handle_topup_failure(order_id, "Failed", remark)
            frappe.db.commit()
            
        elif status == "SUCCESS":
            handle_topup_success(order_id, utr)
            frappe.db.commit()

    except Exception as e:
        frappe.log_error(f"Albepay webhook processing error: {str(e)}", frappe.get_traceback())
        return {"success": False, "error": str(e)}       

def process_albepay_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process Albepay Payment Bank webhook.
    Routes to appropriate handler based on order type (Pay, Topup, Refund).
    """
    try:
        status = payload.get("updatedStatus","")
        client_id = payload.get("clientRefNo","")
        utr = payload.get("utr","")
        remark = payload.get("reason","")
        order_id = frappe.db.get_value("Order",{"processor_order_id":client_id}, "name")
        
        if not order_id:
            frappe.log_error(f"Order not found processor_id {client_id}","Skip")

        if status == "Failure":
            handle_transaction_failure(order_id, "Failed", remark)
            frappe.db.commit()
            
        elif status == "Success":
            handle_transaction_success(order_id, "Success", utr)
            frappe.db.commit()

    except Exception as e:
        frappe.log_error(f"Albepay webhook processing error: {str(e)}", frappe.get_traceback())
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def update_webhook(webhook_url):
    try:
        user = frappe.session.user
        merchant = frappe.get_doc("Merchant", user)

        exists = frappe.db.exists("Webhook", user, cache=True)
        if not exists:
            frappe.get_doc({
                'doctype': 'Webhook',
                '__newname': user,
                'webhook_doctype': 'Transaction',
                'webhook_docevent': 'on_submit',
                'condition': f"(doc.merchant == '{user}') and (doc.status in ['Success', 'Failed', 'Reversed'])",
                'request_url': webhook_url,
                'request_method': 'POST',
                'request_structure': 'JSON',
                'background_jobs_queue': 'long',
                'webhook_json': 
                """{
                    "crn":"{{doc.order}}",
                    "utr":"{{doc.transaction_reference_id}}",
                    "status": "{{doc.status}}",
                    "clientRefID": "{{doc.client_ref_id}}"
                }"""
            }).insert(ignore_permissions=True)

            merchant.webhook = webhook_url
            merchant.save(ignore_permissions=True)
            frappe.db.commit()
            return {"status": "created"}

        elif merchant.webhook != webhook_url:
            webhook_doc = frappe.get_doc("Webhook", user)
            webhook_doc.request_url = webhook_url
            webhook_doc.save(ignore_permissions=True)

            merchant.webhook = webhook_url
            merchant.save(ignore_permissions=True)
            frappe.db.commit()
            return {"status": "updated"}
        
        else:
            # Webhook URL is the same, no update needed
            return {"status": "unchanged"}

    except Exception as e:
        frappe.log_error("Error in webhook updation", str(e))
        return {"status": "error", "message": str(e)}