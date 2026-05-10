import frappe
import requests
import jwt
import json
from datetime import datetime as dt, timedelta as td
import hashlib
from .bank import JSONEncryptionDecryption
from frappe.utils import today, getdate
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client
from Crypto.Hash import HMAC, SHA256
from decimal import Decimal

from iswitch.order_webhook_handlers import (
            handle_transaction_failure,
            handle_transaction_success
        )

def generate_hash(merchant_id, parameters, hashing_method, secret_key, key_order):
    hash_data = str(merchant_id)
    
    for key in key_order:
        value = parameters[key]
        # Convert to string in JavaScript-like manner
        if isinstance(value, float) and value.is_integer():
            # Convert float like 10.0 to "10" (like JavaScript)
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

def handle_transaction(doc):
    try:
        order = frappe.get_doc("Order",doc.order)
        if order.product =="UPI":
            upi_transaction_processing(order)
        else:
            other_transaction_processing(order)
            
    except Exception as e:
        frappe.log_error("Error in transaction handling",str(e))

def upi_transaction_processing(doc):
    try:
        doc.status = "Processing"
        doc.save(ignore_permissions=True)
        
        frappe.db.savepoint("process_transaction")

        processor = frappe.get_doc("Integration", doc.integration_id)
        
        frappe.set_user(doc.merchant_ref_id)
        status = "Pending"
        remark = ""
        utr = ""
        crn = ""

        if processor.name == "Airtel Payment Bank":
            headers = {
                "Content-Type": "application/v2+json "
            }
            
            payload = {
                "amount": str(doc.order_amount),
                "feSessionId": doc.name,
                "hdnOrderID": doc.name,
                "mid": processor.get_password("client_id"),
                "payeeVirtualAdd": processor.vpa,
                "payerMobNo": "9031620313",
                "payerVirtualAdd": doc.vpa,
                "remarks": "Payout",
                "ver": "2.0"
            }

            hash_string = get_hash_string(payload, processor.get_password("secret_key"))
            hash_code = hashlib.sha512(hash_string.encode('utf-8')).hexdigest()

            payload["hash"] = hash_code
            
            url = processor.api_endpoint.rstrip("/") + "/merchant-upi-service/upimercollect"
            frappe.log_error("Request",f"Payload: {payload} url:{url}")
            api_response = requests.post(url, headers = headers, json = payload, timeout = 30)

            try:
                api_data = api_response.json()
                frappe.log_error("API Response", api_data)
                crn = api_data.get("txnId", "")
                utr = api_data.get("rrn", "")
                remark = api_data.get("messageText", "")

            except Exception as e:
                frappe.log_error("API Response", api_response.text)
        
        elif processor.name == "PAYPROCESS2602140315":
            payload = {
                "order_id": doc.name,
                "amount": str(doc.order_amount)
            }
            url = processor.api_endpoint.rstrip("/") + "/pay"
            api_response = requests.post(url, json = payload, timeout = 30)
            try:
                api_data = api_response.json()
                # frappe.log_error("API Response", api_data)
                status = api_data.get("status", "Pending")
                remark = api_data.get("message", "")
                crn = api_data.get("transaction_id", "")

            except Exception as e:
                frappe.log_error("API Response", api_response.text)

            
        if status == "Failed" or status == "Reversed":

            handle_transaction_failure(doc.name, status, remark)

        elif status == "Success":
            handle_transaction_success(doc.name, crn)
        
        elif status == "Pending":
            txn = frappe.db.get_value("Transaction",{"order":doc.name, "merchant":doc.merchant_ref_id}, ['name'])
            transaction = frappe.get_doc("Transaction", txn)
            
            transaction.status = status
            transaction.crn = crn
            transaction.transaction_reference_id = utr
            transaction.remark = remark
            transaction.save(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.db.rollback(save_point = "process_transaction")
        frappe.log_error("Error in transaction processing",str(e))


def other_transaction_processing(doc):
    try:
        doc.status = "Processing"
        doc.save(ignore_permissions=True)
        
        frappe.db.savepoint("process_transaction")

        processor = frappe.get_doc("Integration", doc.integration_id)
        
        frappe.set_user(doc.merchant_ref_id)

        status = "Pending"
        remark = ""
        utr = ""
        crn = ""
        
        if processor.name == "PAYPROCESS2603160001":
            
            merchant_id = processor.get_password("client_id")
            secret_key = processor.get_password("secret_key")
            headers = {
                "merchantID": merchant_id,
                "secretKey": secret_key
            }

            payload = {
                "name": doc.customer_name,
                "bankName": "Dummy",
                "bankBranch": "Dummy",
                "accountNumber": doc.customer_account_number,
                "ifsc": doc.ifsc,
                "amount": doc.order_amount,
                "remarks": "payout",
                "paymentMode": doc.product,
                "paymentReferenceNo" : doc.name
            }

            key_order = [
                "name", "bankName", "bankBranch", "accountNumber", 
                "ifsc", "amount", "remarks", "paymentMode", "paymentReferenceNo"
            ]
            generated_hash = generate_hash(merchant_id, payload, 'sha512', secret_key, key_order)
            payload['hash'] = generated_hash
            
            url = processor.api_endpoint.rstrip("/")+ "/create-payout-transaction"
            
            response = requests.post(url, headers = headers, json = payload)

            api_response = None
            try:
                api_response = response.json()
                frappe.log_error("AlbePay API Response",api_response)
            except Exception as e:
                frappe.log_error("AlbePay invalid json Response", response.text)

            remark = api_response.get("message","")
            status_flag = api_response.get("success")
            
            if not status_flag:
                status = "Failed"
                errors = api_response.get("errors") or []
                if errors:
                    remark = errors[0].get("msg", "")
            else:
                api_data = api_response.get("data",{})
                api_status = api_data.get("updatedStatus","")
                crn = api_data.get("clientRefNo","")

                if api_status == "Failure":
                    status = "Failed"
                elif api_status == "Success":
                    status = "Success"

        if status == "Failed":
            handle_transaction_failure(doc.name, status, remark)
        
        elif status == "Pending":
            doc.utr = utr
            doc.processor_order_id = crn
            doc.save(ignore_permissions=True)
            
    except Exception as e:
        frappe.db.rollback(save_point = "process_transaction")
        frappe.log_error("Error in transaction processing",e)


def get_or_create_customer(doc, processor, headers):
    customer_id = frappe.db.get_value(
        "Customer",
        {"account_number": doc.customer_account_number},
        "customer_id"
    )

    if customer_id:
        return customer_id

    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": doc.customer_name,
        "account_number": doc.customer_account_number,
        "ifsc": doc.ifsc
    }).insert(ignore_permissions=True)

    payload = {
        "firstName": doc.customer_name,
        "lastName": doc.customer_name,
        "email": "demo@gmail.com",
        "mobile": "9999999999",
        "type": "customer",
        "accountType": "bank_account",
        "accountNumber": doc.customer_account_number,
        "ifsc": doc.ifsc,
        "referenceId": customer.name
    }

    url = processor.api_endpoint.rstrip("/") + "/payout/contacts"

    response = requests.post(url, json=payload, headers=headers, timeout=30)

    try:
        data = response.json()
    except Exception:
        frappe.log_error(response.text, "Customer API error")
        frappe.throw("Customer creation failed")

    if data.get("code") != "0x0200":
        frappe.log_error(str(data), "Customer API failed")
        frappe.throw("Customer creation failed")

    customer_id = data.get("data", {}).get("contactId")

    frappe.db.set_value("Customer", customer.name, "customer_id", customer_id)

    return customer_id

def create_payout_order(doc, processor, headers, customer_id):

    payload = {
        "amount": str(doc.order_amount),
        "purpose": "others",
        "mode": doc.product,
        "contactId": customer_id,
        "clientRefId": doc.name,
        "udf1": "",
        "udf2": ""
    }

    url = processor.api_endpoint.rstrip("/") + "/payout/orders"

    response = requests.post(url, json=payload, headers=headers, timeout=30)

    try:
        data = response.json()
    except Exception:
        frappe.log_error(response.text, "Payout API error")
        frappe.throw("Payout API failed")

    if data.get("code") != "0x0200":
        frappe.log_error(str(data), "Payout failed")
        frappe.throw("Payout failed")

    return data

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


def process_order(order_name):
    try:
        doc = frappe.get_doc("Order", order_name)
        merchant = frappe.get_doc("Merchant", doc.merchant_ref_id)

        if not merchant.tigerbeetle_id:
            cancel_order(doc.name)
            return

        client = get_client()

        merchant_account_id = int(merchant.tigerbeetle_id)
        system_account_id = 1

        amount = int(Decimal(doc.transaction_amount) * 100)

        # 🔐 Deterministic transfer ID (IMPORTANT)
        auth_transfer_id = stable_id(f"auth-{doc.name}")

        # 🔹 1️⃣ Check AVAILABLE balance (includes pending)
        accounts = client.lookup_accounts([merchant_account_id])
        if not accounts:
            cancel_order(doc.name)
            return

        acc = accounts[0]

        available_balance = (
            acc.credits_posted
            - acc.debits_posted
            - acc.debits_pending
        )

        if available_balance < amount:
            cancel_order(doc.name)
            return

        opening_balance = (
            acc.credits_posted
            - acc.debits_posted
            - acc.debits_pending
        ) / 100

        # 🔹 2️⃣ Create PENDING transfer (Authorization Hold)
        transfer = tb.Transfer(
            id=auth_transfer_id,
            debit_account_id=merchant_account_id,
            credit_account_id=system_account_id,
            amount=amount,
            pending_id=0,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=400,  # Authorization
            flags=tb.TransferFlags.PENDING,
            timestamp=0,
        )

        errors = client.create_transfers([transfer])

        if errors:
            error = errors[0]
            if error.result != tb.CreateTransferResult.EXISTS:
                cancel_order(doc.name)
                return

        # 🔹 3️⃣ Fetch updated balance (after pending hold)
        accounts_after = client.lookup_accounts([merchant_account_id])
        acc_after = accounts_after[0]

        closing_balance = (
            acc_after.credits_posted
            - acc_after.debits_posted
            - acc_after.debits_pending
        ) / 100


        ledger = frappe.get_doc({
            "doctype": "Ledger",
            "order": doc.name,
            "transaction_type": "Debit",
            "status": "Success",
            "client_ref_id": doc.client_ref_id,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance
        }).insert(ignore_permissions=True)

        ledger.submit()

        frappe.db.commit()  # Commit before external call

        frappe.enqueue("iswitch.transaction_processing.handle_transaction",
            doc = ledger,
            queue="long",
            timeout=300
        )

    except Exception as e:
        frappe.log_error("Authorization Error", str(e))


def cancel_order(order_name):
    
    try:
        frappe.db.sql("""
            UPDATE `tabOrder`
            SET status = 'Cancelled', modified = NOW()
            WHERE name = %s
        """, (order_name,))

    except Exception as e:
        frappe.log_error("Error in cancelling order", str(e))

def stable_id(value: str) -> int:
    return int(hashlib.sha256(value.encode()).hexdigest()[:32], 16)