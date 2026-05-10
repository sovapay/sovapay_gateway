# Copyright (c) 2025, Xettle and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import tigerbeetle as tb
from iswitch.tigerbeetle_client import get_client
from decimal import Decimal

class Order(Document):
    def before_insert(self):
        if self.product != "PAYIN":
            merchant = frappe.get_doc("Merchant", self.owner)
            if merchant.status != "Approved":
                frappe.throw(
                    f"Your Account is in {merchant.status} stage. Please contact Admin"
                )
            if not merchant.integration:
                frappe.throw(
                    "Processor isn't configured yet to process your order. Please contact Admin"
                )
                
            if Decimal(self.order_amount or 0) < 0:
                frappe.throw("Order amount must be greater than zero.")
                
            if not frappe.db.exists("Product", {"product_name": self.product, "is_active": 1}):
                frappe.throw(
                    f"Product '{self.product}' is not available or inactive."
                )
            
            product_pricing = frappe.db.sql("""
                SELECT tax_fee_type, tax_fee, fee_type, fee FROM `tabProduct Pricing`
                WHERE parent=%s AND product=%s
                AND %s BETWEEN start_value AND end_value
            """, (merchant.name, self.product, self.order_amount), as_dict=True)
            
            if not product_pricing:
                frappe.throw(
                    "This payment mode or transaction limit is not active for you"
                )

            pricing = product_pricing[0]
            fee = Decimal(pricing.get("fee", 0))
            tax = Decimal(pricing.get("tax_fee", 0))

            if pricing["fee_type"] == "Percentage":
                fee = (self.order_amount * Decimal(pricing.get("fee", 0))) / 100

            if pricing["tax_fee_type"] == "Percentage":
                tax = (fee * Decimal(pricing.get("tax_fee", 0))) / 100

            total_amount = self.order_amount + fee + tax

            # Get balance from TigerBeetle
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
                    frappe.throw(
                        "Insufficient wallet balance to process this order. Please recharge your wallet"
                    )

            self.fee = fee
            self.tax = tax
            self.integration_id = merchant.integration
            self.merchant_ref_id = self.owner
            self.transaction_amount = total_amount

        self.owner = self.merchant_ref_id
    def after_insert(self):
        if self.channel == "Web" and self.product != "PAYIN":
            integration_id = frappe.db.get_value("Merchant", self.owner, "integration")
            self.db_set("integration_id", integration_id)
            self.db_set("order_type", "Pay")
            frappe.db.savepoint("order_insert")
            try:

                frappe.enqueue("iswitch.transaction_processing.process_order",
                    order_name=self.name,
                    queue="long",
                    timeout=300)
                
            except Exception as e:
                frappe.db.rollback(save_point="order_insert")
                frappe.log_error("Order Processing Error", str(e))
                frappe.throw(str(e))