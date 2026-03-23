import frappe
from frappe.model.document import Document
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client

class VirtualAccountLogs(Document):
    def after_insert(self):
        try:
            if self.status == "Success" and self.docstatus == 0:
                # Skip processing if this is a topup-related VAN log (handled by webhook handler)
                if self.utr and frappe.db.exists("Virtual Account Logs", {"utr": self.utr,"name": ["!=", self.name]}):
                    frappe.log_error(f"Skipping VAN log processing for topup order: {self.utr}", "VAN Log Skip")
                    return
                
                # Get merchant - either from Virtual Account or directly from merchant field
                merchant_name = None
                if self.account_number:
                    merchant_name = frappe.db.get_value("Virtual Account", self.account_number, 'merchant')
                elif self.merchant:
                    merchant_name = self.merchant
                else:
                    frappe.throw("Either account_number or merchant must be provided")
                
                merchant = frappe.get_doc("Merchant", merchant_name)
                if not merchant.tigerbeetle_id:
                    frappe.throw("Merchant TigerBeetle account not found.")

                client = get_client()

                merchant_account_id = int(merchant.tigerbeetle_id)
                system_account_id = 1

                # Convert to smallest unit (paise)
                amount = int(float(self.amount) * 100)

                if self.transaction_type == "Credit":
                    debit_id = system_account_id
                    credit_id = merchant_account_id
                else:  # Debit
                    debit_id = merchant_account_id
                    credit_id = system_account_id

                transfer = tb.Transfer(
                    id=tb.id(),
                    debit_account_id=debit_id,
                    credit_account_id=credit_id,
                    amount=amount,
                    pending_id=0,
                    user_data_128=0,
                    user_data_64=0,
                    user_data_32=0,
                    timeout=0,
                    ledger=1,
                    code=300,
                    flags=0,
                    timestamp=0,
                )

                errors = client.create_transfers([transfer])

                if errors:
                    error = errors[0]
                    frappe.throw(f"TigerBeetle transfer failed: {error.result}")

                # Fetch updated balance
                accounts = client.lookup_accounts([merchant_account_id])
                account = accounts[0]

                balance = (account.credits_posted - account.debits_posted - account.debits_pending) / 100

                self.db_set("closing_balance", balance)
                self.db_set("opening_balance", balance - float(self.amount)
                            if self.transaction_type == "Credit"
                            else balance + float(self.amount))

                self.submit()
                frappe.set_user(self.owner)
                ledger_entry = frappe.get_doc({
                    "doctype": "Ledger",
                    "order": f"Admin {self.transaction_type}ed ₹{self.amount}",
                    "transaction_type": self.transaction_type,  # Credit or Debit
                    "transaction_amount": float(self.amount),
                    "status": "Success",
                    "transaction_id": self.utr,  # Use UTR as transaction ID
                    "client_ref_id": f"VAN-{self.name}",  # Link back to VAN log,
                    "merchant": self.owner,
                    "opening_balance": self.opening_balance,
                    "closing_balance": self.closing_balance
                })
                ledger_entry.insert(ignore_permissions=True)
                ledger_entry.submit()
                frappe.db.commit()

            elif self.status == "Failed" and self.docstatus == 0:
                # self.save()
                self.submit()

        except Exception as e:
            frappe.db.rollback(save_point = "wallet_process")
            frappe.log_error("Error in van processing",str(e))

