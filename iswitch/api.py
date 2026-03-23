import frappe
from frappe import _
import json
import base64
import hashlib
import requests
from datetime import datetime as dt, timedelta as td
from frappe.auth import validate_auth
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client
from decimal import Decimal

def stable_id(value: str) -> int:
    return int(hashlib.sha256(value.encode()).hexdigest()[:32], 16)

def handle_transaction_failure(name, status, error_message):
    """
    Void authorized (pending) transfer on failure webhook.
    """
    try:
        doc = frappe.get_doc("Order", name)
        transaction = frappe.get_doc("Transaction", {"order": name})
        if transaction.docstatus == 1:
            frappe.throw("Transaction already processed")

        merchant = frappe.get_doc("Merchant", doc.merchant_ref_id)

        if not merchant.tigerbeetle_id:
            frappe.throw("Merchant TB account missing")

        # frappe.set_user(doc.merchant_ref_id)

        client = get_client()

        merchant_account_id = int(merchant.tigerbeetle_id)
        system_account_id = 1
        amount = int(Decimal(doc.transaction_amount) * 100)

        # 🔹 1️⃣ Balance BEFORE void
        acc_before = client.lookup_accounts([merchant_account_id])[0]

        opening_balance = (
            acc_before.credits_posted
            - acc_before.debits_posted
            - acc_before.debits_pending
        ) / 100

        # 🔐 Deterministic IDs
        auth_transfer_id = stable_id(f"auth-{doc.name}")
        void_transfer_id = stable_id(f"void-{doc.name}")

        # 🔹 VOID pending transfer
        void_transfer = tb.Transfer(
            id=void_transfer_id,
            debit_account_id=merchant_account_id,
            credit_account_id=system_account_id,
            amount=amount,
            pending_id=auth_transfer_id,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=400,
            flags=tb.TransferFlags.VOID_PENDING_TRANSFER,
            timestamp=0,
        )

        errors = client.create_transfers([void_transfer])

        if errors:
            error = errors[0]
            if error.result != tb.CreateTransferResult.EXISTS:
                frappe.throw(f"Void failed: {error.result}")
        
        # 🔹 3️⃣ Balance AFTER void
        acc_after = client.lookup_accounts([merchant_account_id])[0]

        closing_balance = (
            acc_after.credits_posted
            - acc_after.debits_posted
            - acc_after.debits_pending
        ) / 100
        
        # 🔹 Update Order
        doc.status = status
        doc.reason = error_message[:100]
        doc.save(ignore_permissions=True)

        # 🔹 Update Transaction
        # transaction = frappe.get_doc("Transaction", {"order": name})
        transaction.status = "Failed"
        transaction.save(ignore_permissions=True)
        transaction.submit()
        
        ledger = frappe.get_doc({
            "doctype": 'Ledger',
            "order": doc.name,
            "transaction_type": 'Credit',
            'status': 'Reversed',
            'transaction_id': transaction.name,
            'client_ref_id': doc.client_ref_id,
            'opening_balance': opening_balance,
            "closing_balance": closing_balance
        }).insert(ignore_permissions=True)
        ledger.submit()
        
    except Exception as e:
        frappe.log_error("Void Error", str(e))
        frappe.throw(_("Error in processing transaction failure: {0}").format(str(e)))
        # frappe.db.rollback(save_point="update_record")
        
        

def handle_transaction_success(name, transaction_reference_id):
    """
    Capture authorized (pending) transfer on success webhook.
    """
    try:
        doc = frappe.get_doc("Order", name)
        transaction = frappe.get_doc("Transaction", {"order": name})

        if transaction.docstatus == 1:
            frappe.throw("Transaction already processed")

        merchant = frappe.get_doc("Merchant", doc.merchant_ref_id)

        if not merchant.tigerbeetle_id:
            frappe.throw("Merchant TB account missing")

        # frappe.set_user(doc.merchant_ref_id)

        client = get_client()

        merchant_account_id = int(merchant.tigerbeetle_id)
        system_account_id = 1
        amount = int(Decimal(doc.transaction_amount) * 100)

        # 🔐 Deterministic IDs
        auth_transfer_id = stable_id(f"auth-{doc.name}")
        capture_transfer_id = stable_id(f"capture-{doc.name}")

        # 🔹 POST pending transfer (Capture)
        capture = tb.Transfer(
            id=capture_transfer_id,
            debit_account_id=merchant_account_id,
            credit_account_id=system_account_id,
            amount=amount,
            pending_id=auth_transfer_id,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=400,
            flags=tb.TransferFlags.POST_PENDING_TRANSFER,
            timestamp=0,
        )

        errors = client.create_transfers([capture])

        if errors:
            error = errors[0]
            if error.result != tb.CreateTransferResult.EXISTS:
                frappe.throw(f"Capture failed: {error.result}")

        # 🔹 Update Order
        doc.status = "Processed"
        doc.utr = transaction_reference_id
        doc.save(ignore_permissions=True)

        # 🔹 Update Transaction
        # transaction = frappe.get_doc("Transaction", {"order": name})
        transaction.status = "Success"
        transaction.transaction_reference_id = transaction_reference_id
        transaction.save(ignore_permissions=True)
        transaction.submit()

    except Exception as e:
        # frappe.db.rollback(save_point="update_record")
        frappe.log_error("Capture Error", str(e))
        frappe.throw(_("Error in processing transaction success: {0}").format(str(e)))

@frappe.whitelist()
def create_order():
    data = frappe.request.get_json()

    ip_address = None
    user_id = None
    if frappe.request.headers.get('X-Real-Ip'):
        ip_address = frappe.request.headers.get('X-Real-Ip').split(',')[0]
    else:
        ip_address = frappe.request.remote_addr
    
    authorization_header = frappe.get_request_header("Authorization", "")

    if not authorization_header:
        response = {
            "code": "0x0401",
            "status": "MISSING_HEADER",
            "message": "Authorization header is missing."
        }
        frappe.local.response.http_status_code = 401
        return response
    
    authorization_header = authorization_header.split(" ")
    try:
        validate_auth()

    except Exception:
        response = {
            "code": "0x0401",
            "status": "MISSING_HEADER",
            "message": "Invalid Authorization Header"
        }
        frappe.local.response.http_status_code = 401
        return response

    auth_type, auth_token = authorization_header
    if auth_type.lower() == "basic":
        api_key, api_secret = frappe.safe_decode(base64.b64decode(auth_token)).split(":")
        user_id = frappe.db.get_value(doctype="User", filters={"api_key": api_key}, fieldname=["name"])
    elif auth_type.lower() == "token":
        api_key, api_secret = auth_token.split(":")
        user_id = frappe.db.get_value(doctype="User", filters={"api_key": api_key}, fieldname=["name"])

    if not user_id:
        response = {
            "code": "0x0401",
            "status": "UNAUTHORIZED", 
            "message": "Invalid API Key or Secret"
        }
        frappe.local.response.http_status_code = 401
        return response
    
    if user_id == "Guest":
        response = {
            "code": "0x0401",
            "status": "UNAUTHORIZED", 
            "message": "Authentication required"
        }
        frappe.local.response.http_status_code = 401
        return response
    
    # frappe.set_user(user_id)

    request_response = frappe.get_doc({
        "doctype":"Request Response",
        "request": data,
        "method": "POST",
        "endpoint": "/api/method/order",
        "header": json.dumps(authorization_header),
        "user": user_id,
        "ip_address": ip_address
    }).insert(ignore_permissions=True)

    if not frappe.db.exists("Whitelist IP",{'merchant':user_id,'whitelisted_ip':ip_address}):
        response = {
            "code": "0x0401",
            "status": "UNAUTHORIZED ACCESS", 
            "message": f"Originating IP {ip_address} is blocked by central firewall system. This incident will be reported."
        }

        return log_and_return(request_response, response, "401")

    merchant = frappe.get_doc("Merchant", user_id)
    if merchant.status != "Approved":
        response =  {
            "code": "0x0403",
            "status": "FORBIDDEN",
            "message": f"Your Account is in {merchant.status} stage. Please contact Admin"
        }
        return log_and_return(request_response, response, "403")

    if not merchant.integration:
        response =  {
            "code": "0x0422",
            "status": "UNPROCESSIBLE_ENTITY",
            "message": "Processor isn't configured yet to process your order. Please try after sometime."
        }
        return log_and_return(request_response, response, "422")

    
    if "mode" not in data:
        response = {
            "code": "0x0203",
            "status": "MISSING_PARAMETER",
            "message": "mode is required"
        }
        return log_and_return(request_response, response, "203")

    product = frappe.db.exists("Product", {"product_name": data["mode"].upper(), "is_active":1})
    if not product:
        response = {
            "code": "0x0500",
            "status": "SERVER_DOWN",
            "message":f"{data['mode']} payment mode is down. Please try again after sometime."
        }
        return log_and_return(request_response, response, "500")

    processor = frappe.get_doc("Integration", merchant.integration)

    mode_verification = frappe.db.sql("""
        SELECT tax_fee_type, tax_fee, fee_type, fee
        FROM `tabProduct Pricing`
        WHERE parent = %s AND product = %s
    """, (processor.name, data["mode"].upper()), as_dict=True)

    if not mode_verification:
        response = {
            "code": "0x0403",
            "status": "FORBIDDEN",
            "message": "This payment mode is down at bank end. Please contact Admin"
        }
        return log_and_return(request_response, response, "403")

    # frappe.log_error("User",user_id)
    fields = ["customer_name", "accountNo", "ifsc", "bank", "amount", "purpose", "mode", "clientRefId"]
    if data.get("mode","").upper() == "UPI":
        fields = ["customer_name", "customer_email", "customer_phone", "amount", "vpa", "clientRefId"]

    frappe.db.savepoint("start_transaction") 
    try:
        
        # Field validation
        for field in fields:
            if field not in data or not data[field]:
                # frappe.db.rollback(save_point = "start_transaction")
                response = {
                    "code": "0x0203",
                    "status": "MISSING_PARAMETER", 
                    "message": {f"{field}": [f"{field} is missing."]}
                }
                return log_and_return(request_response, response, "203")
            
        order_amount = Decimal(data["amount"])

        product_pricing = frappe.db.sql("""
            SELECT tax_fee_type, tax_fee, fee_type, fee
            FROM `tabProduct Pricing`
            WHERE parent = %s AND product = %s
            AND %s >= start_value AND %s <= end_value
        """, (merchant.name, data["mode"].upper(), order_amount, order_amount), as_dict=True)
        
        if not product_pricing:
            response = {
                "code": "0x0403",
                "status": "FORBIDDEN",
                "message": "This payment mode or transaction limit is not active for you. Please contact Admin"
            }
            return log_and_return(request_response, response, "403")
    
        # Check duplicate client ref id
        existing_order = frappe.db.exists("Order", {"client_ref_id": data["clientRefId"]})
        if existing_order:
            # frappe.db.rollback(save_point = "start_transaction")
            response = {
                "code": "0x0409",
                "status": "DUPLICATE_CLIENT_REF_ID",
                "message": {"clientRefId": ["Client Ref Id already exists."]}
            }
            return log_and_return(request_response, response, "409")
            
        pricing = product_pricing[0]
        fee = Decimal(pricing.get("fee", 0))
        tax = Decimal(pricing.get("tax_fee", 0))

        if pricing["fee_type"] == "Percentage":
            fee = (order_amount * Decimal(pricing.get("fee", 0))) / 100

        if pricing["tax_fee_type"] == "Percentage":
            tax = (fee * Decimal(pricing.get("tax_fee", 0))) / 100

        total_amount = order_amount + fee + tax
        balance = 0

        if merchant.tigerbeetle_id:
            client = get_client()
            account_id = int(merchant.tigerbeetle_id)

            accounts = client.lookup_accounts([account_id])

            if accounts:
                account = accounts[0]
                balance = (
                    account.credits_posted
                    - account.debits_posted
                    - account.debits_pending
                ) / 100

        if balance < total_amount:
            response = {
                "code": "0x0409",
                "status": "INSUFFICIENT_BALANCE",
                "message": "Your wallet balance is insufficient to place this order. Please recharge your wallet."
            }
            return log_and_return(request_response, response, "409")
        
        # CREATE ORDER
        order = None
        if data.get("mode", "").upper() != "UPI":
            order = frappe.get_doc({
                "doctype": "Order",
                "customer_name": data["customer_name"],
                "customer_account_number": data["accountNo"],
                "ifsc": data["ifsc"],
                "bank": data["bank"].upper(),
                "order_amount": order_amount,
                "purpose": data["purpose"],
                "product": data["mode"].upper(),
                "merchant_ref_id": merchant.name,
                "narration": data.get("narration", ""),
                "remark": data.get("remark", ""),
                "channel": "API",
                "order_type": "Pay",
                "client_ref_id": data["clientRefId"],
                "integration_id": processor.name,
                "tax": tax,
                "fee": fee,
                "transaction_amount": total_amount
            }).insert(ignore_permissions=True)
        else:
            order = frappe.get_doc({
                "doctype": "Order",
                "customer_name": data["customer_name"],
                "order_amount": order_amount,
                "purpose": data["purpose"],
                "product": "UPI",
                "merchant_ref_id": merchant.name,
                "remark": data.get("remark", ""),
                "channel": "API",
                "order_type": "Pay",
                "client_ref_id": data["clientRefId"],
                "integration_id": processor.name,
                "vpa": data.get("vpa",""),
                "tax": tax,
                "fee": fee,
                "transaction_amount": total_amount
            }).insert(ignore_permissions=True)

        # CREATE TRANSACTION
        transaction = frappe.get_doc({
            "doctype": 'Transaction',
            "order": order.name,
            "merchant": order.merchant_ref_id,
            "amount": order.transaction_amount,
            "integration": order.integration_id,
            "status": "Processing",
            "product": order.product,
            "transaction_date": frappe.utils.now()
        }).insert(ignore_permissions=True)
        
        frappe.db.commit()

        response = {
            "code": "0x0200",
            "message": "Order accepted successfully",
            "status": "SUCCESS",
            "data": {
                "clientRefId": order.client_ref_id,
                "orderRefId": order.name,
                "status": order.status
            }
        }

        frappe.enqueue("iswitch.transaction_processing.process_order",
            order_name=order.name,
            queue="long",
            timeout=300)

        return log_and_return(request_response, response, "200")

    # except frappe.ValidationError as e:
    #     frappe.db.rollback(save_point = "start_transaction")
    #     response = {
    #         "code": "0x0400",
    #         "status": "VALIDATION_ERROR", 
    #         "message": "Validation failed"
    #     }
    #     return log_and_return(request_response, response, "400")
        
    except Exception as e:
        frappe.db.rollback(save_point = "start_transaction")
        frappe.log_error("Order Creation Error", frappe.get_traceback())
        response = {
            "code": "0x0500",
            "status": "ERROR",
            "message": "Error in order creation"
        }
        return log_and_return(request_response, response, "500")


def log_and_return(request_response, response, status_code):
    request_response.response = json.dumps(response)
    request_response.status_code = status_code
    request_response.save(ignore_permissions=True)
    request_response.submit()
    frappe.local.response.http_status_code = int(status_code)
    frappe.db.commit()
    return response

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

@frappe.whitelist()
def get_order_status():
    """Get order status using Token authentication"""

    data = frappe.request.get_json()

    ip_address = None
    user_id = None
    if frappe.request.headers.get('X-Real-Ip'):
        ip_address = frappe.request.headers.get('X-Real-Ip').split(',')[0]
    else:
        ip_address = frappe.request.remote_addr
    
    authorization_header = frappe.get_request_header("Authorization", "").split(" ")

    if not authorization_header:
        response = {
            "code": "0x0401",
            "status": "MISSING_HEADER",
            "message": "Authorization header is missing."
        }
        return response

    try:
        validate_auth()

    except frappe.AuthenticationError:
        response = {
            "code": "0x0401",
            "status": "MISSING_HEADER",
            "message": "Invalid Authorization Header"
        }
        return response

    auth_type, auth_token = authorization_header
    if auth_type.lower() == "basic":
        api_key, api_secret = frappe.safe_decode(base64.b64decode(auth_token)).split(":")
        user_id = frappe.db.get_value(doctype="User", filters={"api_key": api_key}, fieldname=["name"])
    elif auth_type.lower() == "token":
        api_key, api_secret = auth_token.split(":")
        user_id = frappe.db.get_value(doctype="User", filters={"api_key": api_key}, fieldname=["name"])

    frappe.set_user(user_id)

    request_response = frappe.get_doc({
        "doctype":"Request Response",
        "request": data,
        "method": "GET",
        "endpoint": "/api/method/requery",
        "header": json.dumps(authorization_header),
        "user": user_id,
        "ip_address": ip_address
    }).insert(ignore_permissions=True)
    try:
        if not frappe.db.exists("Whitelist IP",{'merchant':user_id,'whitelisted_ip':ip_address}):
            response = {
                "code": "0x0401",
                "status": "UNAUTHORIZED ACCESS", 
                "message": f"Originating IP {ip_address} is blocked by central firewall system. This incident will be reported."
            }

            return log_and_return(request_response, response, "401")
        
        if not data.get('orderRefId') and not data.get('clientRefId'):
            response = {
                "code": "0x0203",
                "status": "MISSING_PARAMETER",
                "message": "Either orderRefId or clientRefId is required"
            }
            return log_and_return(request_response, response, "203")

        filters = {"owner": user_id}
        
        if data.get('orderRefId'):
            filters["name"] = data['orderRefId']
        elif data.get('clientRefId'):
            filters["client_ref_id"] = data['clientRefId']
        
        # order = frappe.get_doc("Order", filters)
        name = frappe.db.get_value("Order", filters)
        if not name:
            response = {
                "code": "0x0404",
                "status": "NOT_FOUND",
                "message": "Order not found"
            }
            return log_and_return(request_response, response, "404")
        order = frappe.get_doc("Order", name)
        
        response = {
            "code": "0x0200",
            "status": "SUCCESS",
            "message": "Record fetched successfully.",
            "data": {
                "clientRefId": order.client_ref_id,
                "accountNo": order.customer_account_number,
                "orderRefId": order.name,
                "currency": "INR",
                "amount": order.order_amount,
                "fee": order.fee,
                "tax": order.tax,
                "mode": order.product,
                "utr": order.utr,
                "status": order.status
            }
        }
        return log_and_return(request_response, response, "200")
        
    except frappe.DoesNotExistError:
        response = {
            "code": "0x0404",
            "status": "NOT_FOUND",
            "message": "Order not found"
        }
        return log_and_return(request_response, response, "404")

    except Exception as e:
        response = {
            "code": "0x0500",
            "status": "ERROR",
            "message": "Error fetching order status",
            "data": str(e)
        }
        return log_and_return(request_response, response, "500")

@frappe.whitelist()
def get_api_access():
    try:
        user_id = frappe.session.user
        user_doc = frappe.get_doc("User",user_id)

        user_doc.api_key = frappe.generate_hash(length=15)
        raw = frappe.generate_hash(length=30)
        user_doc.api_secret = raw
        user_doc.save(ignore_permissions=True)
        frappe.db.commit()
        return {
            "public_key": user_doc.api_key,
            "secret_key": raw
        }
    except Exception as e:
        frappe.throw("Error in generating key",str(e))

@frappe.whitelist()
def get_wallet_balance():
    ip_address = None
    user_id = None
    if frappe.request.headers.get('X-Real-Ip'):
        ip_address = frappe.request.headers.get('X-Real-Ip').split(',')[0]
    else:
        ip_address = frappe.request.remote_addr
    
    authorization_header = frappe.get_request_header("Authorization", "").split(" ")

    if not authorization_header:
        response = {
            "code": "0x0401",
            "status": "MISSING_HEADER",
            "message": "Authorization header is missing."
        }
        return response

    try:
        validate_auth()

    except frappe.AuthenticationError:
        response = {
            "code": "0x0401",
            "status": "MISSING_HEADER",
            "message": "Invalid Authorization Header"
        }
        return response

    auth_type, auth_token = authorization_header
    if auth_type.lower() == "basic":
        api_key, api_secret = frappe.safe_decode(base64.b64decode(auth_token)).split(":")
        user_id = frappe.db.get_value(doctype="User", filters={"api_key": api_key}, fieldname=["name"])
    elif auth_type.lower() == "token":
        api_key, api_secret = auth_token.split(":")
        user_id = frappe.db.get_value(doctype="User", filters={"api_key": api_key}, fieldname=["name"])

    frappe.set_user(user_id)
    request_response = frappe.get_doc({
        "doctype":"Request Response",
        "header": json.dumps(authorization_header),
        "user": user_id,
        "method": "GET",
        "ip_address": ip_address,
        "endpoint": "/api/method/wallet"
    }).insert(ignore_permissions=True)

    try:

        if not frappe.db.exists("Whitelist IP",{'merchant':user_id,'whitelisted_ip':ip_address}):
            response = {
                "code": "0x0401",
                "status": "UNAUTHORIZED ACCESS", 
                "message": f"Originating IP {ip_address} is blocked by central firewall system. This incident will be reported."
            }
            
            return log_and_return(request_response, response, "401")

        merchant = frappe.get_doc("Merchant", user_id)
        if merchant.status != "Approved":
            response = {
                "code": "0x0403",
                "status": "VALIDATION_ERROR",
                "message": "Validation failed",
                "data": f"Your Account is in {merchant.status} stage. Please contact Admin"
            }
            
            return log_and_return(request_response, response, "403")

        balance = 0
        status = "Active"
        if merchant.tigerbeetle_id:
            client = get_client()
            account_id = int(merchant.tigerbeetle_id)

            accounts = client.lookup_accounts([account_id])
            if accounts:
                account = accounts[0]
                balance = (account.credits_posted - account.debits_posted - account.debits_pending) / 100

        response = {
            "message": "Wallet fetched successfully",
            "balance": balance, 
            "status": status
        }
        
        return log_and_return(request_response, response, "200")

    except Exception as e:
        frappe.log_error("Error in fetching wallet balance", str(e))
        response = {
            "code": "0x0500",
            "status": "SERVER_ERROR",
            "message": "Error in fetching wallet"
        }
        
        return log_and_return(request_response, response, "500")

@frappe.whitelist()
def get_existing_keys():
    try: 
        user_doc = frappe.get_doc("User", frappe.session.user)
        api_key = user_doc.api_key
        
        context = {
            "has_keys": bool(api_key),
            "api_key": api_key or ""
        }
        
        from frappe import render_template
        from werkzeug.wrappers import Response
        html = render_template("templates/includes/api_keys_display.html", context)
        return Response(html)
    except Exception as e:
        frappe.log_error("Error in key fetching", str(e))
        from werkzeug.wrappers import Response
        return Response(f'<div class="empty-state"><h3>Error loading API keys</h3><p>{str(e)}</p></div>')

@frappe.whitelist()
def generate_api_keys():
    """Generate or regenerate API keys for the current user"""
    try:
        
        user_id = frappe.session.user
        user_doc = frappe.get_doc("User", user_id)
        
        # # Check if keys already exist and regenerate flag is not set
        # if user_doc.api_key and not int(regenerate):
        #     return {
        #         "success": False,
        #         "error": "API keys already exist. Use regenerate option to create new keys."
        #     }
        
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
def update_transaction_status():
    frappe.db.savepoint("update_record")
    try:
        data = frappe.request.get_json()
        order_id = data.get("order_id","")
        status = data.get("status","")
        utr = data.get("utr","")
        remark = data.get("remark","")

        doc = frappe.get_doc("Order",order_id)

        frappe.set_user(doc.merchant_ref_id)

        txn_name = frappe.db.get_value("Transaction", {"order": order_id})
        transaction = frappe.get_doc("Transaction", txn_name)

        if transaction.docstatus == 1:
            frappe.log_error(f"Transaction {transaction.name} is submitted. Current status: {transaction.docstatus}", "Webhook Processing")
            return {
                "Transaction is already submitted"
            }

        if status == "FAILED":

            handle_transaction_failure(order_id,"Failed",remark)
            frappe.db.commit()
            return {
                "Record updated successfully"
            }

        elif status == "REVERSED":

            handle_transaction_failure(order_id,"Reversed",remark)
            frappe.db.commit()
            return {
                "Record updated successfully"
            }
            
        elif status == "SUCCESS":
            handle_transaction_success(order_id, utr)
            frappe.db.commit()
            return {
                "Record updated successfully"
            }
        
    except Exception as e:
        frappe.db.rollback(save_point = "update_record")
        frappe.log_error("Error in transaction update",str(e))
        return {
            f"Error in transaction updation {str(e)}"
        }


@frappe.whitelist()
def raise_refund(order_id):
    frappe.db.savepoint("refund_process")
    try:
        doc = frappe.get_doc("Order", order_id)
        processor = frappe.get_doc("Integration", doc.integration_id)

        frappe.set_user(doc.merchant_ref_id)

        if doc.status != "Processed":
            return {
                "Only processed orders can be refunded"
            }
        
        
        refund_doc = frappe.get_doc({
            "doctype":"Refund Request",
            "order_id": doc.name,
            "status": "Initiated",
        }).insert(ignore_permissions=True)

        # 🔹 CREATE PENDING TIGERBEETLE TRANSFER (Refund Authorization Hold)
        # This prevents duplicate refund processing and will be POST/VOID based on webhook
        try:
            
            client = get_client()
            
            # Get merchant TigerBeetle account
            merchant = frappe.get_doc("Merchant", doc.merchant_ref_id)
            if not merchant.tigerbeetle_id:
                frappe.throw("Merchant TigerBeetle account not configured")
            
            merchant_account_id = int(merchant.tigerbeetle_id)
            system_account_id = 1  # System account
            amount = int(Decimal(doc.transaction_amount) * 100)  # Convert to cents
            
            # Deterministic transfer ID using refund_request.name for unique ledger entries
            refund_transfer_id = stable_id(f"refund-{refund_doc.name}")
            
            # Create PENDING transfer (refund authorization hold)
            # For refund, we're crediting merchant (reversing the original debit)
            transfer = tb.Transfer(
                id=refund_transfer_id,
                debit_account_id=system_account_id,  # Debit from system
                credit_account_id=merchant_account_id,  # Credit to merchant
                amount=amount,
                pending_id=0,
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=600,  # Code for refund
                flags=tb.TransferFlags.PENDING,
                timestamp=0,
            )
            
            errors = client.create_transfers([transfer])
            
            if errors:
                error = errors[0]
                if error.result == tb.CreateTransferResult.EXISTS:
                    # Transfer already exists - verify it matches
                    frappe.log_error(
                        f"Refund transfer already exists: {refund_transfer_id}",
                        "TigerBeetle Duplicate Prevention"
                    )
                    existing_transfers = client.lookup_transfers([refund_transfer_id])
                    if existing_transfers:
                        existing = existing_transfers[0]
                        if existing.amount != amount:
                            frappe.throw(f"Duplicate refund with different amount: expected {amount}, got {existing.amount}")
                    # If transfer exists and matches, continue (idempotent)
                else:
                    # Other errors are critical
                    frappe.log_error(
                        f"TigerBeetle refund transfer failed: {error.result}",
                        "TigerBeetle Error"
                    )
                    frappe.throw(f"Failed to create refund authorization: {error.result}")
        
        except Exception as e:
            frappe.log_error("Error creating refund PENDING transfer", frappe.get_traceback())
            frappe.throw(f"Failed to create refund authorization: {str(e)}")
        

        # CREATE TRANSACTION
        transaction = frappe.get_doc({
            "doctype": 'Transaction',
            "order": doc.name,
            "merchant": doc.merchant_ref_id,
            "amount": doc.transaction_amount,
            "integration": doc.integration_id,
            "status": "Processing",
            "product": doc.product,
            "transaction_date": frappe.utils.now()
        }).insert(ignore_permissions=True)

        if processor.name == "Airtel Payment Bank":
            payload = {
                "merchantId": processor.get_password("client_id"),
                "ver": "2.0",
                "orgOrderID": doc.name,
                "hdnOrderID": refund_doc.name,
                "remark": "Refund",
                "amount": str(doc.order_amount)
            }

            hash_string = get_hash_string(payload, processor.get_password("secret_key"))
            hash_code = hashlib.sha512(hash_string.encode('utf-8')).hexdigest()

            payload["isMerchantInitiated"] = 1
            payload["hash"] = hash_code

            url = processor.api_endpoint.rstrip("/") + "/upitxnrefund"

            headers = {
                "Content-Type" : "application/v2+json"
            }
            # Make API call
            frappe.log_error("Refund Payload", payload)
            api_response = requests.post(url, headers=headers, json=payload, timeout=30)
            try:
                api_data = api_response.json()
                frappe.log_error("Refund Response", api_data)
                if api_data.get("meta" ,None):
                    # frappe.db.rollback(save_point = "refund_process")
                    frappe.throw("Error in refund processing", str(api_data.get("meta",{}).get("description","")))

                else:
                    # Update Order and Transaction status
                    doc.status = "Refund Processing"
                    doc.save(ignore_permissions=True)

                    refund_doc.status = "Processing"
                    refund_doc.utr = api_data.get("rrn","")
                    refund_doc.save(ignore_permissions=True)

                    transaction.status = "Refund Pending"
                    transaction.transaction_reference_id = api_data.get("rrn","")
                    transaction.crn = api_data.get("txnId","")
                    transaction.save(ignore_permissions=True)
                    
                    frappe.db.commit()
                    return {
                        "Refund initiated successfully"
                    }
            except Exception as e:
                frappe.db.rollback(save_point = "refund_process")
                frappe.log_error(f"Error in refund processing {api_response.text}",str(e))
                frappe.throw("Error in refund processing",str(e))
        
        elif processor.name == "PAYPROCESS2602140315":
            payload = {
                "order_id": refund_doc.name,
                "amount": str(doc.order_amount)
            }
            headers = {
                "Content-Type" : "application/v2+json"
            }
            url = processor.api_endpoint.rstrip("/") + "/refund"

            api_response = requests.post(url, headers=headers, json=payload, timeout=30)
            try:
                if api_response.status_code == 200:
                    # Update Order and Transaction status
                    doc.status = "Refund Processing"
                    doc.save(ignore_permissions=True)

                    refund_doc.status = "Processing"
                    refund_doc.utr = api_data.get("rrn","")
                    refund_doc.save(ignore_permissions=True)

                    transaction.status = "Refund Pending"
                    transaction.transaction_reference_id = api_data.get("rrn","")
                    transaction.crn = api_data.get("txnId","")
                    transaction.save(ignore_permissions=True)
                    
                    frappe.db.commit()
                    return {
                        "Refund initiated successfully"
                    }
            except Exception as e:
                frappe.db.rollback(save_point = "refund_process")
                frappe.log_error(f"Error in refund processing {api_response.text}",str(e))
                frappe.throw("Error in refund processing",str(e))


    except Exception as e:
        frappe.db.rollback(save_point = "refund_process")
        frappe.log_error("Error in refund processing",str(e))
        frappe.throw("Error in refund processing",str(e))