"""
Webhook handlers for topup and refund orders.
These functions POST or VOID PENDING TigerBeetle transfers based on webhook status.
"""

import frappe
import hashlib
import tigerbeetle as tb
from decimal import Decimal
from iswitch.tigerbeetle_client import get_client
from frappe.utils import now
from iswitch.webhook_dispatcher import dispatch


def stable_id(value: str) -> int:
    """Generate deterministic ID from string"""
    return int(hashlib.sha256(value.encode()).hexdigest()[:32], 16)

def is_already_processed(transaction, ref):
    if not transaction:
        frappe.log_error(f"Missing Transaction for {ref}", "Skip")
        return True
    return transaction.docstatus == 1

def handle_topup_success(order_name, transaction_reference_id):
    """
    POST (capture) the PENDING topup transfer on success webhook.
    
    Args:
        order_name: Order ID
        transaction_reference_id: UTR/RRN from payment gateway
    """
    try:
        order = frappe.db.get_value("Order", order_name, ["name", "merchant_ref_id", "status", "transaction_amount", "client_ref_id"], as_dict=True)
        
        if order.status == "Failed" or order.status == "Processed" or order.status == "Cancelled":
            return
        
        merchant_tb_id = frappe.db.get_value("Merchant", order.merchant_ref_id, "tigerbeetle_id")
        if not merchant_tb_id:
            raise Exception("Merchant TigerBeetle account not configured")
        
        # frappe.set_user(order.merchant_ref_id)
        
        client = get_client()
        merchant_account_id = int(merchant_tb_id)
        system_account_id = 1
        amount = int(Decimal(order.transaction_amount) * 100)

        acc_before = client.lookup_accounts([merchant_account_id])[0]

        opening_balance = (
            acc_before.credits_posted
            - acc_before.debits_posted
            - acc_before.debits_pending
        ) / 100
        # Deterministic IDs
        topup_transfer_id = stable_id(f"topup-{order.name}")
        post_transfer_id = stable_id(f"topup-post-{order.name}")
        
        # POST the pending transfer (capture) - system → merchant credit
        post_transfer = tb.Transfer(
            id=post_transfer_id,
            debit_account_id=system_account_id,  # System pays
            credit_account_id=merchant_account_id,  # Merchant receives
            amount=amount,
            pending_id=topup_transfer_id,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=500,
            flags=tb.TransferFlags.POST_PENDING_TRANSFER,
            timestamp=0,
        )
        
        errors = client.create_transfers([post_transfer])
        
        if errors:
            error = errors[0]
            if error.result == tb.CreateTransferResult.EXISTS:
                frappe.log_error(
                    f"Topup POST transfer already exists: {post_transfer_id}",
                    "TigerBeetle Duplicate Prevention"
                )
            else:
                frappe.log_error(
                    f"TigerBeetle POST failed: {error.result}",
                    "TigerBeetle Error"
                )
                raise Exception(f"Failed to capture topup: {error.result}")
        
        
        frappe.db.set_value("Order", order_name, {"status": "Processed", "utr": transaction_reference_id})
        
        # Get updated balance after POST
        acc_after = client.lookup_accounts([merchant_account_id])[0]
        closing_balance = (
            acc_after.credits_posted
            - acc_after.debits_posted
            - acc_after.debits_pending
        ) / 100
        
        # Create Ledger Credit Entry
        ledger = frappe.get_doc({
            "doctype": "Ledger",
            "order": order.name,
            "transaction_type": "Credit",
            "transaction_amount": order.transaction_amount,
            "status": "Success",
            "client_ref_id": order.client_ref_id,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance
        }).insert(ignore_permissions=True)
        ledger.submit()
        
        frappe.db.set_value(
            "Virtual Account Logs",
            {"utr": order.name, "status": "Pending"},
            {"status": "Success", "utr": transaction_reference_id, "opening_balance": opening_balance, "closing_balance": closing_balance, "docstatus": 1}
        )
        dispatch(order_name, order.merchant_ref_id, "Topup Success")
    except Exception as e:
        frappe.log_error("Error in topup success handler", frappe.get_traceback())
        raise


def handle_topup_failure(order_name, status, error_message):
    """
    VOID the PENDING topup transfer on failure webhook.
    
    Args:
        order_name: Order ID
        status: Failed status
        error_message: Error description
    """
    try:
        order = frappe.db.get_value("Order", order_name, ["name", "status", "merchant_ref_id", "transaction_amount"], as_dict=True)
        
        if order.status == "Failed" or order.status == "Processed" or order.status == "Cancelled":
            return
        
        merchant_tb_id = frappe.db.get_value("Merchant", order.merchant_ref_id, "tigerbeetle_id")
        if not merchant_tb_id:
            raise Exception("Merchant TigerBeetle account not configured")
        
        # frappe.set_user(order.merchant_ref_id)
        
        client = get_client()
        merchant_account_id = int(merchant_tb_id)
        system_account_id = 1
        amount = int(Decimal(order.transaction_amount) * 100)
        
        # Deterministic IDs
        topup_transfer_id = stable_id(f"topup-{order.name}")
        void_transfer_id = stable_id(f"topup-void-{order.name}")
        
        # VOID the pending transfer - system → merchant credit
        void_transfer = tb.Transfer(
            id=void_transfer_id,
            debit_account_id=system_account_id,  # Match PENDING direction
            credit_account_id=merchant_account_id,
            amount=amount,
            pending_id=topup_transfer_id,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=500,
            flags=tb.TransferFlags.VOID_PENDING_TRANSFER,
            timestamp=0,
        )
        
        errors = client.create_transfers([void_transfer])
        
        if errors:
            error = errors[0]
            if error.result == tb.CreateTransferResult.EXISTS:
                frappe.log_error(
                    f"Topup VOID transfer already exists: {void_transfer_id}",
                    "TigerBeetle Duplicate Prevention"
                )
            else:
                frappe.log_error(
                    f"TigerBeetle VOID failed: {error.result}",
                    "TigerBeetle Error"
                )
                raise Exception(f"Failed to void topup: {error.result}")
        
        
        frappe.db.set_value("Order", order_name, {"status": status, "reason": error_message[:100] if error_message else "Payment failed"})
        
        
        frappe.db.set_value(
            "Virtual Account Logs",
            {"utr": order.name, "status": "Pending"},
            {"status": "Failed", "docstatus": 2}
        )
        dispatch(order_name, order.merchant_ref_id, "Topup Failed")
    except Exception as e:
        frappe.log_error("Error in topup failure handler", frappe.get_traceback())
        raise


def handle_refund_success(refund_request_name, transaction_reference_id):
    """
    POST (capture) the PENDING refund transfer on success webhook.
    Updates original order status to "Reversed".
    
    Args:
        refund_request_name: Refund Request ID
        transaction_reference_id: UTR/RRN from payment gateway
    """
    try:
        refund_doc = frappe.db.get_value("Refund Request", refund_request_name,["order_id","transaction_amount","client_id","merchant_id"], as_dict=True)
        # order = frappe.get_doc("Order", refund_doc.order_id)
        transaction = frappe.db.get_value("Transaction", {"order": refund_doc.order_id}, ["name", "docstatus"], as_dict=True)
        # merchant = frappe.get_doc("Merchant", order.merchant_ref_id)
        if is_already_processed(transaction, refund_request_name):
            return

        merchant_td_id = frappe.db.get_value("Merchant", refund_doc.merchant_id, "tigerbeetle_id")
        if not merchant_td_id:
            raise Exception("Merchant TigerBeetle account not configured")
        
        # frappe.set_user(order.merchant_ref_id)
        
        client = get_client()
        merchant_account_id = int(merchant_td_id)
        system_account_id = 1
        amount = int(Decimal(refund_doc.transaction_amount) * 100)
        
        # Deterministic IDs using refund_request.name
        refund_transfer_id = stable_id(f"refund-{refund_doc.order_id}")
        post_transfer_id = stable_id(f"refund-post-{refund_doc.order_id}")

        acc_before = client.lookup_accounts([merchant_account_id])[0]

        opening_balance = (
            acc_before.credits_posted
            - acc_before.debits_posted
            - acc_before.debits_pending
        ) / 100
        
        # POST the pending refund transfer (capture)
        post_transfer = tb.Transfer(
            id=post_transfer_id,
            debit_account_id=system_account_id,
            credit_account_id=merchant_account_id,
            amount=amount,
            pending_id=refund_transfer_id,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=600,
            flags=tb.TransferFlags.POST_PENDING_TRANSFER,
            timestamp=0,
        )
        
        errors = client.create_transfers([post_transfer])
        
        if errors:
            error = errors[0]
            if error.result == tb.CreateTransferResult.EXISTS:
                frappe.log_error(
                    f"Refund POST transfer already exists: {post_transfer_id}",
                    "TigerBeetle Duplicate Prevention"
                )
            else:
                frappe.log_error(
                    f"TigerBeetle refund POST failed: {error.result}",
                    "TigerBeetle Error"
                )
                raise Exception(f"Failed to capture refund: {error.result}")
        
       
        
        frappe.db.set_value("Refund Request", refund_request_name, {"status": "Processed", "utr": transaction_reference_id})
        
        frappe.db.set_value("Order", refund_doc.order_id, {"status": "Reversed"})

        
        frappe.db.set_value("Transaction", {"order": refund_doc.order_id}, {"status": "Reversed", "transaction_reference_id": transaction_reference_id, "docstatus": 1})
        
        # Get updated balance after POST
        acc_after = client.lookup_accounts([merchant_account_id])[0]
        closing_balance = (
            acc_after.credits_posted
            - acc_after.debits_posted
            - acc_after.debits_pending
        ) / 100
        
        # Create ledger credit entry for refund
        ledger = frappe.get_doc({
            "doctype": "Ledger",
            "order": refund_doc.order_id,
            "transaction_type": "Credit",
            "transaction_amount": refund_doc.transaction_amount,
            "status": "Success",
            "transaction_id": transaction_reference_id,
            "client_ref_id": refund_doc.client_id,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance
        }).insert(ignore_permissions=True)
        ledger.submit()
        # frappe.log_error(f"Refund success processed: {refund_request_name}", "Refund Success")
        dispatch(transaction.name, refund_doc.merchant_id, "Reversed")
    except Exception as e:
        frappe.log_error("Error in refund success handler", frappe.get_traceback())
        raise


def handle_refund_failure(refund_request_name, status, error_message):
    """
    VOID the PENDING refund transfer on failure webhook.
    
    Args:
        refund_request_name: Refund Request ID
        status: Failed status
        error_message: Error description
    """
    try:
        refund_doc = frappe.db.get_value("Refund Request", refund_request_name, ["order_id", "client_id","transaction_amount","merchant_id"], as_dict=True)
        # order = frappe.get_doc("Order", refund_doc.order_id)
        # merchant = frappe.get_doc("Merchant", order.merchant_ref_id)
        transaction = frappe.db.get_value("Transaction", {"order": refund_doc.order_id}, ["name", "docstatus"], as_dict=True)
        
        if is_already_processed(transaction, refund_request_name):
            return
        
        merchant_tb_id = frappe.db.get_value("Merchant", refund_doc.merchant_id, "tigerbeetle_id")
        if not merchant_tb_id:
            raise Exception("Merchant TigerBeetle account not configured")
        
        # frappe.set_user(order.merchant_ref_id)
        
        client = get_client()
        merchant_account_id = int(merchant_tb_id)
        system_account_id = 1
        amount = int(Decimal(refund_doc.transaction_amount) * 100)
        
        # Deterministic IDs using refund_request.name
        refund_transfer_id = stable_id(f"refund-{refund_doc.name}")
        void_transfer_id = stable_id(f"refund-void-{refund_doc.name}")
        
        # VOID the pending refund transfer
        void_transfer = tb.Transfer(
            id=void_transfer_id,
            debit_account_id=system_account_id,
            credit_account_id=merchant_account_id,
            amount=amount,
            pending_id=refund_transfer_id,
            user_data_128=0,
            user_data_64=0,
            user_data_32=0,
            timeout=0,
            ledger=1,
            code=600,
            flags=tb.TransferFlags.VOID_PENDING_TRANSFER,
            timestamp=0,
        )
        
        errors = client.create_transfers([void_transfer])
        
        if errors:
            error = errors[0]
            if error.result == tb.CreateTransferResult.EXISTS:
                frappe.log_error(
                    f"Refund VOID transfer already exists: {void_transfer_id}",
                    "TigerBeetle Duplicate Prevention"
                )
            else:
                frappe.log_error(
                    f"TigerBeetle refund VOID failed: {error.result}",
                    "TigerBeetle Error"
                )
                raise Exception(f"Failed to void refund: {error.result}")
        
        frappe.db.set_value("Refund Request", refund_request_name, {"status": "Failed", "remark": error_message})
        frappe.db.set_value("Order", refund_doc.order_id, {"status": "Processed"})
        # transaction.status = "Refund Failed"
        frappe.db.set_value("Transaction", {"order": refund_doc.order_id}, {"status": "Failed", "docstatus": 1})
        dispatch(transaction.name, refund_doc.merchant_id, "Refund Failed")
    except Exception as e:
        frappe.log_error("Error in refund failure handler", frappe.get_traceback())
        raise


def handle_transaction_failure(name, status, error_message):
    """
    Void authorized (pending) transfer on failure webhook.
    """
    try:
        doc = frappe.db.get_value(
            "Order",
            name,
            ["name", "merchant_ref_id", "status", "transaction_amount","client_ref_id"],
            as_dict=True
        )
        
        if doc.status == "Failed" or doc.status == "Processed" or doc.status == "Cancelled":
            return

        # merchant = frappe.get_doc("Merchant", doc.merchant_ref_id)
        merchant_tb_id = frappe.db.get_value(
            "Merchant",
            doc.merchant_ref_id,
            "tigerbeetle_id"
        )

        if not merchant_tb_id:
            raise Exception("Merchant TB account missing")

        # frappe.set_user(doc.merchant_ref_id)

        client = get_client()

        merchant_account_id = int(merchant_tb_id)
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
                raise Exception(f"Void failed: {error.result}")
        
        # 🔹 3️⃣ Balance AFTER void
        acc_after = client.lookup_accounts([merchant_account_id])[0]

        closing_balance = (
            acc_after.credits_posted
            - acc_after.debits_posted
            - acc_after.debits_pending
        ) / 100
        

        frappe.db.set_value(
            "Order",
            doc.name,
            {
                "status":f"{status}",
                "reason": error_message
            },
            update_modified=False
        )

        
        ledger = frappe.get_doc({
            "doctype": 'Ledger',
            "order": doc.name,
            "transaction_type": 'Credit',
            'status': status,
            'client_ref_id': doc.client_ref_id,
            'opening_balance': opening_balance,
            "closing_balance": closing_balance
        }).insert(ignore_permissions=True)
        ledger.submit()
        dispatch(doc.name, doc.merchant_ref_id, status)
    except Exception as e:
        # frappe.db.rollback(save_point="webhook_process")
        frappe.log_error("Void Error", str(e))
        raise

def handle_transaction_success(name, status, transaction_reference_id):
    """
    Capture authorized (pending) transfer on success webhook.
    """
    try:
        doc = frappe.db.get_value("Order", name,["name", "merchant_ref_id", "transaction_amount","client_ref_id"], as_dict=True)
        
        if doc.status == "Failed" or doc.status == "Processed" or doc.status == "Cancelled":
            return

        # merchant = frappe.get_doc("Merchant", doc.merchant_ref_id)
        merchant_tb_id = frappe.db.get_value(
            "Merchant",
            doc.merchant_ref_id,
            "tigerbeetle_id"
        )
        if not merchant_tb_id:
            raise Exception("Merchant TB account missing")

        # frappe.set_user(doc.merchant_ref_id)

        client = get_client()

        merchant_account_id = int(merchant_tb_id)
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
                raise Exception(f"Capture failed: {error.result}")

        
        order_status = "Processed" if status == "Success" else status
        frappe.db.set_value(
            "Order",
            doc.name,
            {
                "status":f"{order_status}",
                "utr":transaction_reference_id
            },
            update_modified=False
        )
        dispatch(doc.name, doc.merchant_ref_id, status)
    except Exception as e:
        # frappe.db.rollback(save_point="webhook_process")
        frappe.log_error("Capture Error", str(e))
        raise