# Copyright (c) 2025, Xettle and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client

class Adjustment(Document):

    def on_submit(self):
        """
        Move funds between main (tigerbeetle_id) and lien (lien_tigerbeetle_id) accounts
        """
        client = get_client()

        merchant = frappe.get_doc("Merchant", self.merchant_id)
        if not merchant.tigerbeetle_id or not merchant.lien_tigerbeetle_id:
            frappe.throw("Merchant TigerBeetle accounts missing")

        main_account_id = int(merchant.tigerbeetle_id)
        lien_account_id = int(merchant.lien_tigerbeetle_id)
        amount = int(float(self.amount) * 100)  # Convert to smallest unit

        # -------------------------
        # 1️⃣ Fetch current balances
        # -------------------------
        accounts = client.lookup_accounts([main_account_id, lien_account_id])
        main_acc = next((a for a in accounts if a.id == main_account_id), None)
        lien_acc = next((a for a in accounts if a.id == lien_account_id), None)

        if not main_acc or not lien_acc:
            frappe.throw("Failed to fetch TigerBeetle accounts")

        # Fetch balances including pending
        main_balance = main_acc.credits_posted - main_acc.debits_posted - main_acc.debits_pending
        lien_balance = lien_acc.credits_posted - lien_acc.debits_posted - lien_acc.debits_pending
        
        # -------------------------
        # 2️⃣ Create transfer
        # -------------------------
        if self.to == "Main":
            # Release: Lien -> Main
            if lien_balance < amount:
                frappe.throw("Insufficient funds in Lien TB account")
                
            transfer_id = abs(hash(f"adjust-{self.name}")) % (2**63)

            transfer = tb.Transfer(
                id=transfer_id,
                debit_account_id=lien_account_id,
                credit_account_id=main_account_id,
                amount=amount,
                pending_id=0,
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=400,
                flags=0,
                timestamp=0,
            )

            opening = main_balance / 100
        else:
            # Hold: Main -> Lien
            if main_balance < amount:
                frappe.throw("Insufficient funds in Main account")

            transfer = tb.Transfer(
                id=tb.id(),
                debit_account_id=main_account_id,
                credit_account_id=lien_account_id,
                amount=amount,
                pending_id=0,
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=401,
                flags=0,
                timestamp=0,
            )

            opening = main_balance / 100

        errors = client.create_transfers([transfer])
        if errors:
            frappe.throw(f"TigerBeetle transfer failed: {errors[0].result}")

        # -------------------------
        # 3️⃣ Fetch updated balance
        # -------------------------
        accounts_after = client.lookup_accounts([main_account_id, lien_account_id])
        main_acc_after = next((a for a in accounts_after if a.id == main_account_id), None)
        closing = (main_acc_after.credits_posted - main_acc_after.debits_posted - main_acc_after.debits_pending) / 100

        # -------------------------
        # 4️⃣ Create Ledger entry
        # -------------------------
        self.create_ledger_entry(
            "Credit" if self.to == "Main" else "Debit",
            float(self.amount),
            opening,
            closing
        )

        self.db_set("status", "Success")


    def on_cancel(self):
        """
        Reverse the transfer if adjustment is cancelled
        """
        client = get_client()

        merchant = frappe.get_doc("Merchant", self.merchant_id)
        main_account_id = int(merchant.tigerbeetle_id)
        lien_account_id = int(merchant.lien_tigerbeetle_id)
        amount = int(float(self.amount) * 100)

        # Reverse transfer
        if self.to == "Main":
            # Reverse: Main -> Lien
            transfer = tb.Transfer(
                id=tb.id(),
                debit_account_id=main_account_id,
                credit_account_id=lien_account_id,
                amount=amount,
                pending_id=0,
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=401,
                flags=0,
                timestamp=0,
            )
        else:
            # Reverse: Lien -> Main
            transfer = tb.Transfer(
                id=tb.id(),
                debit_account_id=lien_account_id,
                credit_account_id=main_account_id,
                amount=amount,
                pending_id=0,
                user_data_128=0,
                user_data_64=0,
                user_data_32=0,
                timeout=0,
                ledger=1,
                code=401,
                flags=0,
                timestamp=0,
            )

        errors = client.create_transfers([transfer])
        if errors:
            frappe.throw(f"TigerBeetle reverse transfer failed: {errors[0].result}")

        # Update Ledger
        self.cancel_ledger_entry()
        self.db_set("status", "Cancelled")


    def create_ledger_entry(self, type, amount, opening, closing):
        """
        Creates Frappe Ledger entry
        """
        frappe.set_user(self.merchant_id)
        # Base remark
        base_remark = self.remark or ""

        if type == "Debit":
            action = "Lien Marked"
            symbol = "🔒"
        elif type == "Credit":
            action = "Lien Released"
            symbol = "🔓"
        else:
            action = "Lien Adjustment"
            symbol = "ℹ️"

        # Final description
        text = f"{symbol} {action} ₹{amount}"
        if base_remark:
            text += f" - {base_remark}"

        ledger = frappe.get_doc({
            "doctype": "Ledger",
            "transaction_type": type,
            "status": "Success",
            "transaction_amount": amount,
            "transaction_id": self.name,
            "merchant": self.merchant_id,
            "opening_balance": opening,
            "closing_balance": closing,
            "order": text
        })
        ledger.insert(ignore_permissions=True)
        ledger.submit()


    def cancel_ledger_entry(self):
        """
        Cancel ledger entry for this adjustment
        """
        ledgers = frappe.get_all("Ledger", filters={"transaction_id": self.name}, pluck="name")
        for ledger_name in ledgers:
            try:
                l_doc = frappe.get_doc("Ledger", ledger_name)
                if l_doc.docstatus == 1:
                    l_doc.cancel()
            except Exception as e:
                frappe.log_error(f"Failed to cancel ledger {ledger_name}: {str(e)}")