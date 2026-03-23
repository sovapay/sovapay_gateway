import frappe
import requests
import jwt
import json
from datetime import datetime as dt, timedelta as td
import hashlib
from .bank import JSONEncryptionDecryption
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client
from decimal import Decimal
from Crypto.Hash import HMAC, SHA256
from iswitch.order_webhook_handlers import (
            handle_topup_success,
            handle_topup_failure,
            handle_refund_success,
            handle_refund_failure,
            handle_transaction_failure,
            handle_transaction_success
        )

def generate_hash(merchant_id, parameters, hashing_method, secret_key, key_order):
    hash_data = str(merchant_id)
    
    for key in key_order:
        value = parameters[key]
        # Convert to string in JavaScript-like manner
        if isinstance(value, float) and value.is_integer():
            # Convert Decimal like 10.0 to "10" (like JavaScript)
            value_str = str(int(value))
        else:
            value_str = str(value)
        hash_data += '|' + value_str
    
    hash_data += '|' + str(secret_key)
    
    if len(hash_data) > 0:
        # Create hash using the specified method
        hash_obj = hashlib.new(hashing_method)
        hash_obj.update(hash_data.encode('utf-8'))
        return hash_obj.hexdigest().lower()
    
    return None


@frappe.whitelist(allow_guest=True)
def update_record():
    results = frappe.db.sql("""
        SELECT name, integration_id FROM `tabOrder`
        WHERE status IN ('Queued', 'Processing')
    """, as_dict=True)
    frappe.log_error("Order to processed",results)
    
    for result in results:
        frappe.db.savepoint("status_process")
        try:
            txn_status = ""
            utr = ""
            remark = ""

            if result.integration_id == "PAYPROCESS2603160001":
                processor = frappe.get_doc("Integration", result.integration_id)
                merchant_id = processor.get_password("client_id")
                secret_key = processor.get_password("secret_key")
                headers = {
                    "merchantID": merchant_id,
                    "secretKey": secret_key
                }

                payload = {
                    "paymentReferenceNo" : result.name
                }
                key_order = ["paymentReferenceNo"]
                generated_hash = generate_hash(merchant_id, payload, 'sha512', secret_key, key_order)
                payload['hash'] = generated_hash
                url = processor.api_endpoint.rstrip("/")+ "/check-payout-transaction-status"

                response = requests.post(url, headers = headers, json = payload)
                api_response = None
                try:
                    api_response = response.json()
                    frappe.log_error(f"AlbePay status fetch Response {result.name}",api_response)
                except Exception as e:
                    frappe.log_error(f"AblePay Invalid json Response {result.name}",response.text)
                
                success = api_response.get("success", False)
                remark = api_response.get("message", "")

                if success:
                    api_data = api_response.get("data")[0]
                    order_id = api_data.get("paymentReferenceNo","")
                    status = api_data.get("updatedStatus","")
                    utr = api_data.get("utrId","")
                    
                    if status == "Failure":
                        txn_status = "FAILED"
                    elif status == "Success":
                        txn_status = "SUCCESS"
                    else:
                        txn_status = "Pending"
            

            # if txn_status == "Success":
            #     handle_transaction_success(result.name, utr)
            #     frappe.db.commit()

            # elif txn_status == "Failed" or txn_status == "Reversed":
            #     handle_transaction_failure(result.name, txn_status, f"Transaction status is {txn_status}")
            #     frappe.db.commit()
            order_id = result.name
            if frappe.db.exists("Refund Request", order_id):
                refund_doc = frappe.get_doc("Refund Request", order_id)
                
                # Check if already processed
                if refund_doc.status == "Processed":
                    frappe.log_error(f"Refund already processed: {order_id}", "Duplicate Webhook")
                    return {"success": True, "message": f"Refund {order_id} already processed"}
                
                if txn_status == "SUCCESS":
                    handle_refund_success(order_id, utr)
                    frappe.db.commit()
                    return {"success": True, "message": f"Refund {order_id} processed successfully"}
                elif txn_status == "FAILED":
                    handle_refund_failure(order_id, "Failed", remark)
                    frappe.db.commit()
                    return {"success": True, "message": f"Refund {order_id} marked as failed"}
            
            # Otherwise, it's a regular order (Pay or Topup)
            else:
                order = frappe.get_doc("Order", order_id)
                
                # Route based on order type
                if order.order_type and order.order_type == "Topup":
                    # Topup order webhook
                    if txn_status == "SUCCESS":
                        handle_topup_success(order_id, utr)
                        frappe.db.commit()
                        # return {"success": True, "message": f"Topup {order_id} processed successfully"}
                    elif txn_status == "FAILED":
                        handle_topup_failure(order_id, "Failed", remark)
                        frappe.db.commit()
                        # return {"success": True, "message": f"Topup {order_id} marked as failed"}
                
                elif order.order_type and order.order_type == "Pay":
                    # Payout order webhook (existing logic)
                    if txn_status == "SUCCESS":
                        handle_transaction_success(order.name, "Success", utr)
                        frappe.db.commit()
                        # return {"success": True, "message": f"Payout {order_id} processed successfully"}
                    elif txn_status == "FAILED":
                        handle_transaction_failure(order.name, "Failed", remark)
                        frappe.db.commit()
                        # return {"success": True, "message": f"Payout {order_id} marked as failed"}
                
                # else:
                #     frappe.log_error(f"Unknown order type: {order.order_type}", "Webhook Error")
                #     return {"success": False, "error": f"Unknown order type: {order.order_type}"}

        except Exception as e:
            frappe.db.rollback(save_point = "status_process")
            frappe.log_error(frappe.get_traceback(), f"Error updating transaction for Order: {result.name}")


def get_hash_string(payload, secret_key):
    """
    Dynamically generate hash string from all payload fields.
    """
    try:
        # Get all payload values in the order they were defined
        hash_parts = [str(value) for value in payload.values()]
        
        # Add secret key at the end
        hash_parts.append(secret_key)
        
        # Join with # delimiter
        hash_string = "#".join(hash_parts)
        
        return hash_string
        
    except Exception as e:
        frappe.log_error("Error in hash string generation", str(e))
        raise
