app_name = "iswitch"
app_title = "iswitch"
app_publisher = "Blinkpe"
app_description = "Blinkpe Technology"
app_email = "tinkal@blinkpe.net"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "iswitch",
# 		"logo": "/assets/iswitch/logo.png",
# 		"title": "iswitch",
# 		"route": "/iswitch",
# 		"has_permission": "iswitch.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/iswitch/css/iswitch.css"
# app_include_js = "/assets/iswitch/js/iswitch.js"

# include js, css files in header of web template
# web_include_css = "/assets/iswitch/css/iswitch.css"
# web_include_js = "/assets/iswitch/js/iswitch.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "iswitch/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "iswitch/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "homepage"
# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "iswitch.utils.jinja_methods",
# 	"filters": "iswitch.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "iswitch.install.before_install"
# after_install = "iswitch.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "iswitch.uninstall.before_uninstall"
# after_uninstall = "iswitch.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "iswitch.utils.before_app_install"
# after_app_install = "iswitch.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "iswitch.utils.before_app_uninstall"
# after_app_uninstall = "iswitch.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "iswitch.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"User": "iswitch.permissions.get_user_permission_query_conditions",
# }
#
# has_permission = {
# 	"User": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"Blinkpe Webhook":{
# 		"on_submit": "iswitch.webhook.process_webhook"
# 	}
# }

# api= {
# 	"methods":[
# 		"iswitch.api.create_order",
# 		"iswitch.auth.signup",
# 		"iswitch.auth.login"
# 		"iswitch.webhook.xettle_webhook"
# 	]
# }

# Scheduled Tasks
# ---------------

scheduler_events = {
	"cron": {
        "*/10 * * * *": [
            "iswitch.refetch.update_record"
        ],
		"*/2 * * * *": [
            "iswitch.balance_fetch.fetch_processor_balance"
        ]
    }
}

# Testing
# -------

# before_tests = "iswitch.install.before_tests"

# Overriding Methods
# ------------------------------
#
override_whitelisted_methods = {
	"order": "iswitch.api.create_order",
	"init_upi": "iswitch.upi.initiate_upi",
	"onboard_merchant": "iswitch.auth.signup",
	"generate_token": "iswitch.auth.login",
	"payin": "iswitch.wallet.topup_order",
	"update_record": "iswitch.api.update_transaction_status",
	"requery": "iswitch.api.get_order_status",
	"albepay": "iswitch.webhook.albepay_webhook",
	"wallet": "iswitch.api.get_wallet_balance",
	"read_email": "iswitch.email_reader.process_gmail_emails",
	"recharge": "iswitch.wallet.recharge_wallet",
	"processor_balance": "iswitch.wallet.get_wallet_balance",
	"authenticate": "iswitch.bank.bank_login",
	"callback": "iswitch.bank.bank_webhook"
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "iswitch.task.get_dashboard_data"
# }
# website_route_rules = [
#     {
#         "from_route": "/api/callbacks/airtelbank",
#         "to_route": "iswitch.webhook.airtelbank"
#     }
# ]
# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["iswitch.utils.before_request"]
# after_request = ["iswitch.utils.after_request"]

# Job Events
# ----------
# before_job = ["iswitch.utils.before_job"]
# after_job = ["iswitch.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"iswitch.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }


website_route_rules = [{'from_route': '/portal/<path:app_path>', 'to_route': 'portal'},{'from_route': '/portal', 'to_route': 'portal'}]

on_login = "iswitch.merchant_portal_api.activate_team_member_on_login"