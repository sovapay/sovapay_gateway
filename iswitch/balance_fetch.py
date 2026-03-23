import frappe
import requests

@frappe.whitelist()
def fetch_processor_balance():
    try:
        processors = frappe.db.get_list("Integration", filters={"is_active": 1}, pluck="name")

        for processor_name in processors:
            processor = frappe.get_doc("Integration", processor_name)
            balance = 0
            if processor_name == "PAYPROCESS2603160001":
                headers = {
                    "merchantID": processor.get_password("client_id"),
                    "secretkey": processor.get_password("secret_key"),
                    "Content-Type": "application/json"
                }
                url = processor.api_endpoint.rstrip("/") + "/balance"

                response = requests.get(url, headers = headers, timeout = 30)
                api_response = None
                try:
                    api_response = response.json()
                except Exception as e:
                    frappe.log_error(f"Error in balance fetch {processor_name}", response.text)
                frappe.log_error("AlbePay Balance", api_response)
                if api_response and api_response.get("success"):
                    balance = api_response.get("data", {}).get("currentBalance", 0.0)

            processor.balance = balance
            processor.save(ignore_permissions = True)
            frappe.db.commit() 

    except Exception as e:
        frappe.log_error("Error in balance fetching", str(e))