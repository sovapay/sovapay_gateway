import { useState } from "react";

// Minimal Card replica
function Card({ className = "", children }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

// Inline badge
function Badge({ children, color = "slate" }) {
  const colors = {
    red: "bg-red-50 text-red-700 border border-red-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    green: "bg-green-50 text-green-700 border border-green-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
    slate: "bg-slate-100 text-slate-600 border border-slate-200",
    purple: "bg-purple-50 text-purple-700 border border-purple-200",
    cyan: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  };
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[color]}`}>
      {children}
    </span>
  );
}

// Method pill
function Method({ m }) {
  return (
    <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded font-mono">
      {m}
    </span>
  );
}

// Section anchor heading
function SectionTitle({ id, children }) {
  return (
    <h3 id={id} className="text-xl font-bold mb-1 scroll-mt-6">
      {children}
    </h3>
  );
}

// Field heading
function FieldLabel({ children }) {
  return <p className="text-sm font-semibold text-slate-700 mb-2">{children}</p>;
}

// Code block
function CodeBlock({ children }) {
  return (
    <pre className="bg-slate-50 border border-slate-200 rounded-md p-3 overflow-x-auto text-xs font-mono text-slate-700 leading-relaxed whitespace-pre">
      {children}
    </pre>
  );
}

// Endpoint display
function Endpoint({ method = "POST", path }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <Method m={method} />
      <code className="text-sm font-mono text-slate-800">{path}</code>
    </div>
  );
}

// Params table
function ParamsTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 text-slate-500 font-semibold w-40">Parameter</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold w-20">Type</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold w-24">Required</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
              {r.group ? (
                <td colSpan={4} className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {r.group}
                </td>
              ) : (
                <>
                  <td className="px-3 py-2.5 align-top">
                    <code className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded text-[11px]">{r.name}</code>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <code className="text-blue-600 text-[11px]">{r.type}</code>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {r.req === "required" && <Badge color="red">Required</Badge>}
                    {r.req === "optional" && <Badge color="slate">Optional</Badge>}
                    {r.req === "conditional" && <Badge color="amber">Conditional</Badge>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-slate-500 leading-relaxed">{r.desc}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Notice box
function Notice({ color = "blue", title, children }) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    green: "bg-green-50 border-green-200 text-green-900",
    red: "bg-red-50 border-red-200 text-red-900",
    purple: "bg-purple-50 border-purple-200 text-purple-900",
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={`rounded-md border p-3 ${colors[color]}`}>
      {title && <p className="text-xs font-semibold mb-1">{title}</p>}
      <div className="text-xs leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

// Tab switcher
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 mb-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`text-xs px-3 py-1.5 rounded border font-mono transition-colors ${active === t.id
              ? "bg-blue-50 text-blue-700 border-blue-300 font-semibold"
              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Error codes table
function ErrorCodesTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 text-slate-500 font-semibold w-28">Code</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold w-24">HTTP</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold w-48">Status</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
              <td className="px-3 py-2.5 align-top">
                <code className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded text-[11px]">{r.code}</code>
              </td>
              <td className="px-3 py-2.5 align-top">
                <span className={`font-semibold ${String(r.http).startsWith("2") ? "text-green-600" :
                    String(r.http).startsWith("4") ? "text-amber-600" : "text-red-600"
                  }`}>{r.http}</span>
              </td>
              <td className="px-3 py-2.5 align-top">
                <code className="text-[11px] text-slate-600">{r.status}</code>
              </td>
              <td className="px-3 py-2.5 align-top text-slate-500 leading-relaxed">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Documentation() {
  const [payoutTab, setPayoutTab] = useState("bank");
  const [payoutResTab, setPayoutResTab] = useState("bank");
  const [whTab, setWhTab] = useState("topup_success");

  return (
    <div className="space-y-10 text-slate-800">

      {/* ── OVERVIEW ── */}
      <div>
        <h3 className="text-2xl font-bold mb-1">API Documentation</h3>
        <p className="text-slate-500 mb-4 text-sm">
          Complete reference for integrating with SovaPay payment services — covering pay-ins (collections), pay-outs (disbursements), order management, wallet operations, and webhook notifications.
        </p>
        <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Base URL</h4>
            <code className="block bg-white rounded px-3 py-2 font-mono text-sm border border-slate-200">https://v2.sovapay.net</code>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: "Pay-In", endpoint: "POST /api/method/payin" },
              { label: "Pay-Out", endpoint: "POST /api/method/order" },
              { label: "Requery", endpoint: "POST /api/method/requery" },
              { label: "Wallet", endpoint: "POST /api/method/wallet" },
              { label: "Auth Token", endpoint: "POST /api/method/generate_token" },
            ].map((e) => (
              <div key={e.label} className="bg-white border border-slate-200 rounded px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{e.label}</p>
                <code className="text-[11px] font-mono text-slate-700">{e.endpoint}</code>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Notice color="amber" title="⚠️ IP Whitelisting Required">
            All API requests must originate from a <strong>whitelisted IP address</strong>. Requests from non-whitelisted IPs will be blocked with a <code>0x0401 UNAUTHORIZED ACCESS</code> error and the incident will be logged. Add your server IPs in the <strong>IP Whitelist</strong> tab of your dashboard before making API calls.
          </Notice>
        </div>
      </div>

      {/* ── AUTHENTICATION ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="authentication">Authentication</SectionTitle>
          <p className="text-sm text-slate-500">
            The SovaPay API uses token-based authentication. Once generated, tokens remain valid for the lifetime of the account unless regenerated. Every API request (except token generation) must include the <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">Authorization</code> header.
          </p>
        </div>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-semibold mb-0.5">Generate Token</h4>
              <p className="text-xs text-slate-500">Authenticate with your merchant credentials to receive an <code className="bg-slate-100 px-1 rounded">api_key</code> and <code className="bg-slate-100 px-1 rounded">api_secret</code>.</p>
            </div>
            <Method m="POST" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Endpoint</FieldLabel>
            <Endpoint path="/api/method/generate_token" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Headers</FieldLabel>
            <CodeBlock>{"Content-Type: application/json"}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Request Body</FieldLabel>
            <CodeBlock>{`{
  "usr": "merchant@example.com",
  "pwd": "your_secure_password"
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "usr", type: "string", req: "required", desc: "Merchant account email address registered with SovaPay." },
              { name: "pwd", type: "string", req: "required", desc: "Merchant account password." },
            ]} />
          </div>

          <div className="space-y-1">
            <FieldLabel>Response</FieldLabel>
            <CodeBlock>{`{
  "message": {
    "code": "0x0200",
    "message": "Logged in",
    "user_id": "merchant@example.com",
    "api_key": "a1b2c3d4e5f6789",
    "api_secret": "9z8y7x6w5v4u3t2s1r0q9p8o7n6m5l"
  },
  "home_page": "/app",
  "full_name": "John Merchant"
}`}</CodeBlock>
          </div>

          <Notice color="blue" title="🔑 Using credentials in subsequent requests">
            <p className="mb-2">Combine <code>api_key</code> and <code>api_secret</code> separated by a colon in the <code>Authorization</code> header for all subsequent calls:</p>
            <code className="block bg-blue-100 rounded px-2 py-1 font-mono text-[11px] mt-1">Authorization: Token {"{"}{"{api_key}"}:{"{api_secret}"}{"}"}</code>
            <p className="mt-2 mb-1 text-blue-700 font-medium">Example:</p>
            <code className="block bg-blue-100 rounded px-2 py-1 font-mono text-[11px]">Authorization: Token a1b2c3d4e5f6789:9z8y7x6w5v4u3t2s1r0q9p8o7n6m5l</code>
            <p className="mt-2">Both <code>Token</code> (key:secret) and <code>Basic</code> (base64-encoded key:secret) auth schemes are supported.</p>
          </Notice>
        </Card>
      </div>

      {/* ── PAY-IN ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="payin">Pay-In (Collections)</SectionTitle>
          <p className="text-sm text-slate-500">
            Pay-In allows you to collect payments from customers via UPI. A UPI deep-link is returned which you render as a QR code. The customer scans it with any UPI app to complete the payment. Track completion via polling (<a href="#requery" className="text-blue-600 underline">Requery</a>) or real-time <a href="#webhooks" className="text-blue-600 underline">webhooks</a>.
          </p>
        </div>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-semibold mb-0.5">Create Pay-In</h4>
              <p className="text-xs text-slate-500">Initiate a UPI collection request. Returns a QR string the customer scans to pay.</p>
            </div>
            <Method m="POST" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Endpoint</FieldLabel>
            <Endpoint path="/api/method/payin" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Headers</FieldLabel>
            <CodeBlock>{`Content-Type: application/json
Authorization: Token {api_key}:{api_secret}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Request Body</FieldLabel>
            <CodeBlock>{`{
  "amount":      "10",
  "mode":        "payin",
  "clientRefId": "YOUR_UNIQUE_REF_001"
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "amount", type: "string", req: "required", desc: `Amount to collect in INR. Pass as a string (e.g. "10", "500.50"). Minimum and maximum limits apply per your account configuration.` },
              { name: "mode", type: "string", req: "required", desc: `Must always be "topup" (case-insensitive) for pay-in / collection requests. Any other value will be rejected.` },
              { name: "clientRefId", type: "string", req: "required", desc: "Your unique reference ID for this transaction. Must be globally unique — duplicate IDs are rejected with a 409 error. Used to reconcile and requery status." },
            ]} />
          </div>

          <div className="space-y-1">
            <FieldLabel>Success Response</FieldLabel>
            <CodeBlock>{`{
  "message": {
    "code":     "0x0200",
    "status":   "Success",
    "order_id": "h9uo9khl6a",
    "qr":       "upi://pay?pa=kdas2024@nsdlpbma&pn=KDAS%20TECHNOLOGIES%20OPC%20PRIVATE%20LIMITED&mc=7372&tr=536276781798654053&tn=SchedulerTest&am=10.00&cu=INR&mode=05&orgid=181046&purpose=00",
    "message":  "Transaction initiated"
  }
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Response Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "code", type: "string", req: "optional", desc: `"0x0200" indicates the request was accepted successfully.` },
              { name: "status", type: "string", req: "optional", desc: `"Success" — pay-in order created, awaiting customer payment.` },
              { name: "order_id", type: "string", req: "optional", desc: "SovaPay's internal order identifier. Store this alongside your clientRefId for reconciliation." },
              { name: "qr", type: "string", req: "optional", desc: `A fully-formed UPI deep-link URI (upi://pay?...). Pass this string to any QR generation library to render a scannable QR code.` },
              { name: "message", type: "string", req: "optional", desc: "Human-readable status message." },
            ]} />
          </div>

          {/* Pay-In terminal statuses */}
          <div className="rounded-md bg-cyan-50 p-3 border border-cyan-200">
            <p className="text-xs font-semibold text-cyan-900 mb-2">Pay-In Terminal Status Values (via Webhook)</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { s: "Topup Success", c: "green", d: "Customer payment received and credited to your wallet. utr is present." },
                { s: "Topup Failed", c: "red", d: "Payment was not completed or rejected. utr is null." },
              ].map((item) => (
                <div key={item.s} className="flex gap-2 items-start">
                  <Badge color={item.c}>{item.s}</Badge>
                  <p className="text-xs text-cyan-800 leading-relaxed">{item.d}</p>
                </div>
              ))}
            </div>
          </div>

          <Notice color="cyan" title="📱 Rendering the QR code">
            Pass the <code>qr</code> string to any QR library (e.g. <code>qrcode.js</code>, <code>python-qrcode</code>, <code>react-qr-code</code>) to generate a scannable image. Present it to the customer — once they complete payment in GPay, PhonePe, Paytm, or any UPI app, you will receive a webhook and the order status will update.
          </Notice>

          <Notice color="amber" title="⏱ Tracking payment completion">
            After generating the QR, either poll <code>POST /api/method/requery</code> with your <code>clientRefId</code>, or configure a webhook endpoint to get an instant push notification when payment is received. See <strong>Requery</strong> and <strong>Webhooks</strong> sections below.
          </Notice>

          <div className="space-y-1">
            <FieldLabel>Error Response — Service Unavailable</FieldLabel>
            <CodeBlock>{`{
  "code":    "0x0500",
  "status":  "FAILED",
  "message": "Error in topup"
}`}</CodeBlock>
          </div>
        </Card>
      </div>

      {/* ── PAY-OUT ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="payout">Pay-Out (Disbursements)</SectionTitle>
          <p className="text-sm text-slate-500">
            Pay-Out sends funds from your SovaPay wallet to a beneficiary via UPI or bank transfer (IMPS / NEFT / RTGS). Orders are validated, deducted from your wallet balance (including fee + GST), and processed asynchronously. The wallet must have sufficient balance before placing an order.
          </p>
        </div>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-semibold mb-0.5">Create Pay-Out</h4>
              <p className="text-xs text-slate-500">Supports UPI (VPA-based) and Bank Transfer (account + IFSC). Choose the appropriate request body for your mode.</p>
            </div>
            <Method m="POST" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Endpoint</FieldLabel>
            <Endpoint path="/api/method/order" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Headers</FieldLabel>
            <CodeBlock>{`Content-Type: application/json
Authorization: Token {api_key}:{api_secret}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Request Body</FieldLabel>
            <Tabs
              tabs={[{ id: "bank", label: "Bank Transfer" }, { id: "upi", label: "UPI" }]}
              active={payoutTab}
              onChange={setPayoutTab}
            />
            {payoutTab === "bank" && (
              <CodeBlock>{`{
  "customer_name": "Yash Kumar",
  "accountNo":     "123456789012",
  "ifsc":          "HDFC0001234",
  "bank":          "HDFC Bank",
  "amount":        "2500",
  "purpose":       "OTHERS",
  "mode":          "imps",
  "narration":     "Salary payment for employee",
  "remark":        "Monthly salary transfer",
  "clientRefId":   "TXN_20250908_001"
}`}</CodeBlock>
            )}
            {payoutTab === "upi" && (
              <CodeBlock>{`{
  "customer_name":  "Demo User",
  "customer_email": "demo@gmail.com",
  "customer_phone": "+919999999999",
  "amount":         "100",
  "mode":           "UPI",
  "purpose":        "OTHERS",
  "vpa":            "9005718311@ybl",
  "clientRefId":    "TXN_20250908_002"
}`}</CodeBlock>
            )}
          </div>

          <div className="space-y-1">
            <FieldLabel>Parameters</FieldLabel>
            <ParamsTable rows={[
              { group: "Common — All Modes" },
              { name: "customer_name", type: "string", req: "required", desc: "Full name of the beneficiary." },
              { name: "amount", type: "string", req: "required", desc: "Transfer amount in INR, passed as a string. Must fall within your configured transaction limits." },
              { name: "mode", type: "string", req: "required", desc: `Transfer rail: "UPI", "imps", "neft", or "rtgs" (case-insensitive).` },
              { name: "purpose", type: "string", req: "required", desc: `Purpose code for the transfer. Common values: "OTHERS", "SALARY", "VENDOR_PAYMENT".` },
              { name: "clientRefId", type: "string", req: "required", desc: "Your unique reference ID. Duplicate values are rejected with a 409. Used for requery and webhook matching." },
              { name: "remark", type: "string", req: "optional", desc: "Internal remark for your records. Not sent to the bank." },
              { group: `UPI Only — mode: "UPI"` },
              { name: "customer_email", type: "string", req: "required", desc: "Email address of the beneficiary." },
              { name: "customer_phone", type: "string", req: "required", desc: `Beneficiary phone number with country code (e.g. "+919876543210").` },
              { name: "vpa", type: "string", req: "required", desc: `Beneficiary's UPI Virtual Payment Address (e.g. "9876543210@ybl", "name@upi").` },
              { group: `Bank Transfer Only — mode: "imps" | "neft" | "rtgs"` },
              { name: "accountNo", type: "string", req: "required", desc: "Beneficiary's bank account number." },
              { name: "ifsc", type: "string", req: "required", desc: "IFSC code of the beneficiary's bank branch (11 characters)." },
              { name: "bank", type: "string", req: "required", desc: `Beneficiary bank name (e.g. "HDFC Bank"). Stored for reference.` },
              { name: "narration", type: "string", req: "required", desc: "Transaction narration that appears on the bank statement." },
            ]} />
          </div>

          <Notice color="slate" title="💰 Wallet Deduction">
            The total amount deducted from your wallet is: <strong>order amount + applicable fee + GST on fee</strong>. Fee and tax rates are determined by your account pricing configuration. If your wallet balance is insufficient for the total amount, the order is rejected with <code>INSUFFICIENT_BALANCE</code>.
          </Notice>

          <div className="space-y-1">
            <FieldLabel>Response</FieldLabel>
            <Tabs
              tabs={[{ id: "bank", label: "Bank Transfer" }, { id: "upi", label: "UPI" }]}
              active={payoutResTab}
              onChange={setPayoutResTab}
            />
            {payoutResTab === "bank" && (
              <CodeBlock>{`{
                "message": {
                  "code":    "0x0200",
                  "message": "Order accepted successfully",
                  "status":  "SUCCESS",
                  "data": {
                    "clientRefId": "TXN_20250908_001",
                    "orderRefId":  "SVORD2509080083106",
                    "status":      "Queued"
                  }
                }
              }`}</CodeBlock>
            )}
            {payoutResTab === "upi" && (
              <CodeBlock>{`{
                "message":{
                  "code":    "0x0200",
                  "message": "Order accepted successfully",
                  "status":  "SUCCESS",
                  "data": {
                    "name":       "Demo User",
                    "orderRefId": "SVORD25121900009",
                    "status":     "Queued"
                  }
                }
              }`}</CodeBlock>
            )}
          </div>

          <div className="space-y-1">
            <FieldLabel>Response Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "code", type: "string", req: "optional", desc: `"0x0200" confirms the order was accepted into the queue.` },
              { name: "status", type: "string", req: "optional", desc: `"SUCCESS" — order created and queued for processing.` },
              { name: "data.clientRefId", type: "string", req: "optional", desc: "Your original reference ID echoed back for confirmation." },
              { name: "data.orderRefId", type: "string", req: "optional", desc: "SovaPay's internal order reference number. Use this or clientRefId to requery status." },
              { name: "data.status", type: "string", req: "optional", desc: `Initial order status — always "Queued" on successful creation.` },
            ]} />
          </div>

          {/* Pay-Out terminal statuses */}
          <div className="rounded-md bg-amber-50 p-3 border border-amber-200">
            <p className="text-xs font-semibold text-amber-900 mb-2">Pay-Out Terminal Status Values (via Webhook)</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { s: "Success", c: "green", d: "Transfer completed. Funds delivered to the beneficiary. utr is present." },
                { s: "Failed", c: "red", d: "Transfer failed at the bank. Amount automatically reversed to your wallet. utr is null." },
                { s: "Reversed", c: "red", d: "Transfer was initially successful but subsequently reversed by the bank. utr may still be present." },
              ].map((item) => (
                <div key={item.s} className="flex gap-2 items-start">
                  <Badge color={item.c}>{item.s}</Badge>
                  <p className="text-xs text-amber-800 leading-relaxed">{item.d}</p>
                </div>
              ))}
            </div>
          </div>

          <Notice color="blue" title="ℹ️ Asynchronous Processing">
            Pay-out orders are processed asynchronously after being accepted. The response confirms the order is queued — actual bank transfer happens in the background. Use the <strong>Requery</strong> endpoint or configure <strong>webhooks</strong> to be notified of the final outcome.
          </Notice>
        </Card>
      </div>

      {/* ── REQUERY ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="requery">Check Order Status (Requery)</SectionTitle>
          <p className="text-sm text-slate-500">
            Query the real-time status and settlement details of any transaction — both pay-ins and pay-outs — using your original <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">clientRefId</code> or SovaPay's <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">orderRefId</code>.
          </p>
        </div>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-semibold mb-0.5">Requery</h4>
              <p className="text-xs text-slate-500">Fetch current status, UTR, fee, and tax for any order. Works for both pay-in and pay-out transactions.</p>
            </div>
            <Method m="POST" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Endpoint</FieldLabel>
            <Endpoint path="/api/method/requery" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Headers</FieldLabel>
            <CodeBlock>{`Authorization: Token {api_key}:{api_secret}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Request Body</FieldLabel>
            <CodeBlock>{`{
  "clientRefId": "TXN_20250908_001"

  // OR use orderRefId:
  // "orderRefId": "SVORD2509080083106"
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "clientRefId", type: "string", req: "conditional", desc: "Your original client reference ID. Either this or orderRefId must be provided." },
              { name: "orderRefId", type: "string", req: "conditional", desc: "SovaPay's internal order reference number (returned during order creation). Either this or clientRefId must be provided." },
            ]} />
          </div>

          <div className="space-y-1">
            <FieldLabel>Success Response</FieldLabel>
            <CodeBlock>{`{
  "message": {
    "code":    "0x0200",
    "status":  "SUCCESS",
    "message": "Record fetched successfully.",
    "data": {
      "clientRefId": "TXN_20250908_001",
      "accountNo":   "123456789012",       // null for UPI / pay-in
      "orderRefId":  "SVORD2509080083106",
      "currency":    "INR",
      "amount":      2500.0,               // original order amount
      "fee":         5.0,                  // fee charged
      "tax":         0.9,                  // GST on fee
      "mode":        "IMPS",
      "utr":         "425020416966",       // null if pending or failed
      "status":      "Processed"
    }
  }
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Response Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "clientRefId", type: "string", req: "optional", desc: "Your original reference ID." },
              { name: "accountNo", type: "string", req: "optional", desc: "Beneficiary account number (bank transfers only). null for UPI and pay-in orders." },
              { name: "orderRefId", type: "string", req: "optional", desc: "SovaPay's internal order reference number." },
              { name: "currency", type: "string", req: "optional", desc: `Always "INR".` },
              { name: "amount", type: "number", req: "optional", desc: "The original order amount (excluding fee and tax)." },
              { name: "fee", type: "number", req: "optional", desc: "Fee charged for this transaction per your pricing plan." },
              { name: "tax", type: "number", req: "optional", desc: "GST applied on the fee (18%)." },
              { name: "mode", type: "string", req: "optional", desc: `Payment rail used: "IMPS", "NEFT", "RTGS", "UPI", or "TOPUP" for pay-in.` },
              { name: "utr", type: "string|null", req: "optional", desc: "Unique Transaction Reference assigned by the bank. Present when status is Processed. null for pending or failed orders." },
              { name: "status", type: "string", req: "optional", desc: "Current order status. See status values below." },
            ]} />
          </div>

          <div className="rounded-md bg-amber-50 p-3 border border-amber-200">
            <p className="text-xs font-semibold text-amber-900 mb-2">Order Status Values</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { s: "Queued", c: "amber", d: "Order received and waiting in queue." },
                { s: "Processing", c: "blue", d: "Submitted to the bank / payment rail." },
                { s: "Processed", c: "green", d: "Transfer completed. UTR is available." },
                { s: "Cancelled", c: "slate", d: "Cancelled before bank submission." },
                { s: "Failed", c: "red", d: "Transfer failed at the bank." },
                { s: "Reversed", c: "red", d: "Completed but reversed by the bank." },
              ].map((item) => (
                <div key={item.s} className="flex gap-2 items-start">
                  <Badge color={item.c}>{item.s}</Badge>
                  <p className="text-xs text-amber-800 leading-relaxed">{item.d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Error Response — Order Not Found</FieldLabel>
            <CodeBlock>{`{
  "code":    "0x0404",
  "status":  "NOT_FOUND",
  "message": "Order not found"
}`}</CodeBlock>
          </div>
        </Card>
      </div>

      {/* ── WALLET ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="wallet">Wallet</SectionTitle>
          <p className="text-sm text-slate-500">Retrieve the current balance and status of your SovaPay merchant wallet. The balance reflects funds available for pay-out orders after accounting for any in-flight (pending) transfers.</p>
        </div>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-semibold mb-0.5">Get Wallet Balance</h4>
              <p className="text-xs text-slate-500">Returns live available balance in INR and wallet operational status.</p>
            </div>
            <Method m="POST" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Endpoint</FieldLabel>
            <Endpoint path="/api/method/wallet" />
          </div>

          <div className="space-y-1">
            <FieldLabel>Headers</FieldLabel>
            <CodeBlock>{`Authorization: Token {api_key}:{api_secret}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Success Response</FieldLabel>
            <CodeBlock>{`{
  "message": "Wallet fetched successfully",
  "balance": 95500.75,
  "status":  "Active"
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Response Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "message", type: "string", req: "optional", desc: `"Wallet fetched successfully" on success.` },
              { name: "balance", type: "number", req: "optional", desc: "Available wallet balance in INR. This is net of any pending (in-flight) debit holds. Use this value to validate sufficient funds before placing pay-out orders." },
              { name: "status", type: "string", req: "optional", desc: `Wallet status: "Active" (operational), "Inactive" (disabled), or "Suspended" (contact support).` },
            ]} />
          </div>

          <Notice color="slate" title="📊 Balance Calculation">
            The returned balance is: <strong>Total Credits Posted − Total Debits Posted − Pending Debits</strong>. A pending pay-out order will reduce the available balance immediately upon creation, even before the bank processes it.
          </Notice>
        </Card>
      </div>

      {/* ── WEBHOOKS ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="webhooks">Webhooks</SectionTitle>
          <p className="text-sm text-slate-500">
            SovaPay pushes real-time status notifications to your configured endpoint URL when a transaction reaches a terminal state. Webhooks fire for <strong>both pay-in and pay-out</strong> orders. The payload includes an <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">event</code> field for programmatic routing — use this instead of relying on the human-readable <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">status</code> string.
          </p>
        </div>

        <Card className="space-y-4">
          <div>
            <h4 className="text-base font-semibold mb-0.5">Webhook Configuration</h4>
            <p className="text-xs text-slate-500">Register your endpoint URL in the <strong>Webhooks</strong> tab of your SovaPay dashboard, or contact SovaPay support. Your endpoint must return HTTP <code>200</code> to acknowledge receipt.</p>
          </div>

          <div className="space-y-1">
            <FieldLabel>Delivery Details</FieldLabel>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["HTTP Method", "POST"],
                    ["Content-Type", "application/json"],
                    ["Trigger", "Any terminal status: Success, Failed, Reversed, Topup Success, Topup Failed"],
                    ["Applies To", "Pay-In and Pay-Out orders"],
                    ["Expected Response", "HTTP 200 to acknowledge. Non-200 may trigger retries."],
                  ].map(([k, v], i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-semibold text-slate-600 w-40 bg-slate-50">{k}</td>
                      <td className="px-3 py-2 text-slate-500">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Webhook Payload Schema</FieldLabel>
            <CodeBlock>{`{
  "event":       "TRANSACTION_SUCCESS",     // Machine-readable event type — see table below
  "crn":         "SVORD2509080083106",      // SovaPay's internal order reference
  "clientRefID": "TXN_20250908_001",       // Your original reference ID
  "status":      "Success",                // Human-readable terminal status
  "utr":         "425020416966",           // Bank UTR — null if status is Failed
  "timestamp":   "2025-09-08 14:32:10.123456"
}`}</CodeBlock>
          </div>

          <div className="space-y-1">
            <FieldLabel>Payload Parameters</FieldLabel>
            <ParamsTable rows={[
              { name: "event", type: "string", req: "optional", desc: "Machine-readable event type. Use this field to programmatically route and handle incoming webhooks. See Event Types table below." },
              { name: "crn", type: "string", req: "optional", desc: "SovaPay's internal order reference number — equivalent to orderRefId returned during order creation." },
              { name: "clientRefID", type: "string", req: "optional", desc: "The reference ID you submitted when creating the order. Use this to match the webhook to your internal record." },
              { name: "status", type: "string", req: "optional", desc: `Human-readable terminal status string (e.g. "Success", "Topup Failed"). See terminal status values per order type.` },
              { name: "utr", type: "string|null", req: "optional", desc: "Unique Transaction Reference assigned by the bank. Present on success; null for failed transactions." },
              { name: "timestamp", type: "string", req: "optional", desc: `ISO-style datetime of when the webhook was dispatched (UTC), e.g. "2025-09 -08 14: 32:10.123456"."` },
            ]} />
          </div>

          {/* Event types reference table */}
          <div className="space-y-1">
            <FieldLabel>Event Types</FieldLabel>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold w-48">event</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold w-36">status</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold w-24">Order Type</th>
                    <th className="text-left px-3 py-2 text-slate-500 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { event: "TOPUP_SUCCESS", status: "Topup Success", type: "Pay-In", utr: true, desc: "Customer payment received and credited to your wallet." },
                    { event: "TOPUP_FAILED", status: "Topup Failed", type: "Pay-In", utr: false, desc: "Customer payment was not completed or was rejected." },
                    { event: "TRANSACTION_SUCCESS", status: "Success", type: "Pay-Out", utr: true, desc: "Transfer completed. Funds delivered to the beneficiary." },
                    { event: "TRANSACTION_FAILED", status: "Failed", type: "Pay-Out", utr: false, desc: "Transfer failed at the bank. Amount auto-reversed to wallet." },
                    { event: "REVERSED", status: "Reversed", type: "Pay-Out", utr: true, desc: "Transfer was successful but subsequently reversed by the bank." },
                    { event: "REFUND_FAILED", status: "Refund Failed", type: "Refund", utr: false, desc: "A refund disbursement failed at the bank." },
                  ].map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 align-top">
                        <code className="text-purple-700 bg-purple-50 px-1 py-0.5 rounded text-[11px]">{r.event}</code>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <code className="text-[11px] text-slate-600">{r.status}</code>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Badge color={r.type === "Pay-In" ? "cyan" : r.type === "Refund" ? "purple" : "blue"}>{r.type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 align-top text-slate-500 leading-relaxed">
                        {r.desc}{" "}
                        {r.utr
                          ? <span className="text-green-600 font-medium">utr present.</span>
                          : <span className="text-slate-400">utr is null.</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel>Example Payloads</FieldLabel>
            <Tabs
              tabs={[
                { id: "topup_success", label: "✅ Topup Success" },
                { id: "topup_failed", label: "❌ Topup Failed" },
                { id: "success", label: "✅ Payout Success" },
                { id: "failed", label: "❌ Payout Failed" },
                { id: "reversed", label: "↩ Reversed" },
              ]}
              active={whTab}
              onChange={setWhTab}
            />
            {whTab === "topup_success" && (
              <CodeBlock>{`{
  "event":       "TOPUP_SUCCESS",
  "crn":         "SVORD2509080083109",
  "clientRefID": "YOUR_UNIQUE_REF_001",
  "status":      "Topup Success",
  "utr":         "425020416970",
  "timestamp":   "2025-09-08 14:32:10.123456"
}`}</CodeBlock>
            )}
            {whTab === "topup_failed" && (
              <CodeBlock>{`{
  "event":       "TOPUP_FAILED",
  "crn":         "SVORD2509080083110",
  "clientRefID": "YOUR_UNIQUE_REF_002",
  "status":      "Topup Failed",
  "utr":         null,
  "timestamp":   "2025-09-08 14:35:22.654321"
}`}</CodeBlock>
            )}
            {whTab === "success" && (
              <CodeBlock>{`{
  "event":       "TRANSACTION_SUCCESS",
  "crn":         "SVORD2509080083106",
  "clientRefID": "TXN_20250908_001",
  "status":      "Success",
  "utr":         "425020416966",
  "timestamp":   "2025-09-08 15:10:05.987654"
}`}</CodeBlock>
            )}
            {whTab === "failed" && (
              <CodeBlock>{`{
  "event":       "TRANSACTION_FAILED",
  "crn":         "SVORD2509080083107",
  "clientRefID": "TXN_20250908_002",
  "status":      "Failed",
  "utr":         null,
  "timestamp":   "2025-09-08 15:12:44.112233"
}`}</CodeBlock>
            )}
            {whTab === "reversed" && (
              <CodeBlock>{`{
  "event":       "REVERSED",
  "crn":         "SVORD2509080083108",
  "clientRefID": "TXN_20250908_003",
  "status":      "Reversed",
  "utr":         "425020416967",
  "timestamp":   "2025-09-08 16:00:01.445566"
}`}</CodeBlock>
            )}
          </div>

          <Notice color="green" title="✅ Idempotency & Reconciliation">
            Always use <code>clientRefID</code> from the webhook payload to look up your internal order record. Use the <code>event</code> field for programmatic routing — do not rely solely on <code>status</code> strings, which are human-readable labels. If your system does not receive a webhook (network issues), fall back to polling <code>/api/method/requery</code> for final status confirmation.
          </Notice>
        </Card>
      </div>

      {/* ── ERROR CODES ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="errors">Error Codes</SectionTitle>
          <p className="text-sm text-slate-500">All API responses include a <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">code</code> field. Use this to programmatically handle error conditions.</p>
        </div>

        <Card>
          <ErrorCodesTable rows={[
            { code: "0x0200", http: 200, status: "SUCCESS", desc: "Request accepted and processed successfully." },
            { code: "0x0203", http: 203, status: "MISSING_PARAMETER", desc: "A required field is missing from the request body. The message will identify which field." },
            { code: "0x0400", http: 400, status: "MISSING_PARAMETER", desc: "Validation error — one or more required fields are absent or empty." },
            { code: "0x0401", http: 401, status: "MISSING_HEADER", desc: "Authorization header is absent or malformed." },
            { code: "0x0401", http: 401, status: "UNAUTHORIZED", desc: "Invalid API key or secret, or the request originated from a non-whitelisted IP address." },
            { code: "0x0401", http: 401, status: "UNAUTHORIZED ACCESS", desc: "Request IP is not in the merchant's whitelist. The incident is logged." },
            { code: "0x0403", http: 403, status: "FORBIDDEN", desc: "Account not approved, payment mode not enabled, or mode/limits not configured for your account." },
            { code: "0x0404", http: 404, status: "NOT_FOUND", desc: "Order or resource not found for the given reference ID." },
            { code: "0x0404", http: 404, status: "VALIDATION_ERROR", desc: "Merchant account is not in Approved status. Contact admin." },
            { code: "0x0409", http: 409, status: "DUPLICATE_REFERENCE", desc: "The clientRefId provided already exists in the system. Each request must use a unique clientRefId." },
            { code: "0x0409", http: 409, status: "INSUFFICIENT_BALANCE", desc: "Wallet balance is insufficient to cover order amount + fee + tax." },
            { code: "0x0422", http: 422, status: "UNPROCESSIBLE_ENTITY", desc: "No payment processor is configured for this merchant account." },
            { code: "0x0500", http: 500, status: "SERVER_DOWN", desc: "The requested payment mode is currently unavailable. Retry after some time." },
            { code: "0x0500", http: 500, status: "PROCESSING_ERROR", desc: "Internal error during order processing. Retry after some time." },
            { code: "0x0500", http: 500, status: "FAILED", desc: "Pay-in processing failed at the payment gateway." },
            { code: "0x0504", http: 504, status: "TIMEOUT", desc: "Request to the upstream bank timed out. Check order status via requery before retrying." },
          ]} />
        </Card>
      </div>

      {/* ── INTEGRATION GUIDE ── */}
      <div className="space-y-4">
        <div>
          <SectionTitle id="guide">Integration Guide</SectionTitle>
          <p className="text-sm text-slate-500">A high-level walkthrough of the recommended integration flow for both pay-in and pay-out.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="space-y-3">
            <h4 className="text-sm font-bold text-slate-700">Pay-In Flow</h4>
            {[
              ["1", "Whitelist your server IP", "Add your server's outbound IP in the IP Whitelist tab."],
              ["2", "Generate Token", "Call /api/method/generate_token to get api_key and api_secret."],
              ["3", "Create Pay-In", `POST /api/method/payin with amount, mode: "topup", and your unique clientRefId.`],
              ["4", "Render QR", "Pass the qr string to a QR library and show it to your customer."],
              ["5", "Await payment", "Customer scans and pays via their UPI app."],
              ["6", "Receive webhook", `SovaPay POSTs with event: "TOPUP_SUCCESS" or "TOPUP_FAILED".`],
              ["7", "Confirm via requery", "Optionally call /api/method/requery to independently verify status."],
            ].map(([n, title, desc]) => (
              <div key={n} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{title}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </Card>

          <Card className="space-y-3">
            <h4 className="text-sm font-bold text-slate-700">Pay-Out Flow</h4>
            {[
              ["1", "Whitelist your server IP", "Add your server's outbound IP in the IP Whitelist tab."],
              ["2", "Generate Token", "Call /api/method/generate_token to get api_key and api_secret."],
              ["3", "Check Wallet Balance", "Call /api/method/wallet to confirm sufficient funds (amount + fee + tax)."],
              ["4", "Create Pay-Out Order", "POST /api/method/order with beneficiary details and a unique clientRefId."],
              ["5", "Store orderRefId", "Save the returned orderRefId alongside your clientRefId for reconciliation."],
              ["6", "Receive webhook", `SovaPay POSTs with event: "TRANSACTION_SUCCESS", "TRANSACTION_FAILED", or "REVERSED".`],
              ["7", "Confirm via requery", "Call /api/method/requery any time to check live order status and UTR."],
            ].map(([n, title, desc]) => (
              <div key={n} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{title}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* ── CHANGELOG ── */}
      <Card className="space-y-3">
        <h3 className="text-xl font-bold">Changelog</h3>
        {[
          {
            version: "Version 1.3",
            items: [
              "Updated webhook payload: added event and timestamp fields; crn is now the order reference key",
              "Introduced event-based routing: TOPUP_SUCCESS, TOPUP_FAILED, TRANSACTION_SUCCESS, TRANSACTION_FAILED, REVERSED, REFUND_FAILED",
              "Clarified pay-in terminal statuses: Topup Success and Topup Failed",
              "Clarified pay-out terminal statuses: Success, Failed, and Reversed",
              "Added Event Types reference table in the Webhooks section",
            ],
          },
          {
            version: "Version 1.2",
            items: [
              "Added Pay-In (collection) endpoint — POST /api/method/payin",
              "Unified requery and webhook documentation to cover both pay-in and pay-out",
              "Added comprehensive error codes reference table",
              "Added IP whitelisting documentation and integration guide",
            ],
          },
          {
            version: "Version 1.1",
            items: ["Added UPI payout support in the Create Order endpoint"],
          },
          {
            version: "Version 1.0",
            items: [
              "Initial API release",
              "Basic authentication and order management",
              "Webhook notifications for order status updates",
              "Wallet balance inquiry",
            ],
          },
        ].map((entry) => (
          <div key={entry.version}>
            <h4 className="text-sm font-semibold mb-1">{entry.version}</h4>
            <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
              {entry.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        ))}
      </Card>

    </div>
  );
}
