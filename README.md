# 🕷️ OneSpider Server Monitor

A robust, enterprise-grade, zero-cost infrastructure monitoring and alerting system. It actively tracks your server health, records historical uptime into a PostgreSQL database, calculates SLA metrics automatically in Indian Standard Time (IST), sends premium HTML alerts via Amazon SES, and powers an elegant Vercel-inspired minimalist public dashboard.

---

## 🏗️ Architecture Deep-Dive & Logic Explained

### 1. The Pulse Engine (`monitor.js`)
At the core of the system is the "Pulse" engine, triggered automatically every 5 minutes by GitHub Actions.
- **Dual-Layer Checks:** The script first attempts an **ICMP Ping**. If it fails, it double-checks using an **HTTP GET request** to factor out firewalls blocking Ping.
- **Fault-Tolerance:** If both layers fail, the system pauses for exactly **30 seconds** and re-tries. This drastically reduces false-positive "Down" alerts caused by transient DNS blips.
- **State Tracking:** It compares the current check with the last database record. An AWS SES email is sent *only* when the state transitions from UP to DOWN (Incident Started) or DOWN to UP (Service Restored).

### 2. SLA Mathematics (`schema.sql`)
The PostgreSQL database (managed by Supabase) uses advanced SQL Views to automatically slice the `uptime_logs` into actionable chunks (Daily, Weekly, Monthly, Quarterly) anchored precisely to the **Asia/Kolkata (IST)** timezone.
- **Uptime Formula:** `(Successful Checks / Total Checks) * 100` rounded to two decimals.
- **Daily Reporting:** At exactly 00:00 UTC (05:30 IST), GitHub Actions triggers the `summary daily` task. The system fetches the pre-calculated metrics from these SQL Views and dispatches the SLA report email instantly without expensive data crunching in Node.js.

### 3. Public Dashboard Visuals (`index.html`)
The frontend is a fully decoupled HTML/JS package designed for Edge/Vercel/GitHub Pages deployment.
- **The "24 Hour" Timeline:** The horizontal status bars on the dashboard are powered by fetching all checks generated strictly within the last 24 hours using an ISO timestamp filter. It dynamically computes the rolling uptime and latency mathematics on the frontend, ensuring perfect SLA accuracy regardless of GitHub Action delays.

---

## 🛠️ Step-by-Step Installation Guide

### Phase 1: Pre-Requisites
1. **Node.js:** Ensure you have Node.js version `20.10.x` or higher installed (to support the `--env-file` flag natively).
2. **Supabase:** Create a free account at [Supabase](https://supabase.com/).
3. **AWS:** Have an active AWS account with SES (Simple Email Service) configured and out of sandbox mode (or with verified target emails).

### Phase 2: Database Initialization Setup
1. Inside your Supabase Project Dashboard, go to the **SQL Editor**.
2. Open the `schema.sql` file provided in this repository, copy all of its contents, and paste it into the editor.
3. Click **Run**. This will instantly generate:
   - The primary `uptime_logs` table.
   - All Row Level Security (RLS) policies allowing public read-only access.
   - `daily`, `weekly`, `monthly`, and `quarterly` SLA Views.

### Phase 3: Creating your `.env` File
Rename the `.env.example` file to `.env` in the root of your folder. You **must** populate all 15 variables.

| Variable | Description | Where to get it |
| :--- | :--- | :--- |
| `SERVER_ID` | Your internal name for this hardware | E.g. SRV-DEL-061 |
| `STATIC_IP` | The IPv4 Address to be tracked | Your Hosting Provider |
| `ISP_PROVIDER` | The Network Provider name | E.g. NextGen Broadband |
| `SERVER_LOCATION`| Server Physical Geography | E.g. Gurugram, India |
| `MANAGED_BY` | Who manages the infrastructure | E.g. NOC Team |
| `ABUSE_EMAIL` | Contact for data center routing | E.g. abuse@yoursite.com |
| `HARDWARE_VENDOR`| Physical hardware identity | E.g. Dell Inc. / Lenovo |
| `AWS_REGION` | AWS Data center running SES | E.g. ap-south-1 |
| `AWS_ACCESS_KEY_ID`| AWS IAM User key | AWS IAM Console |
| `AWS_SECRET_ACCESS_KEY`| AWS IAM User secret | AWS IAM Console |
| `ADMIN_NAME` | Name of the person receiving alerts | E.g. Shubham V. |
| `ADMIN_EMAIL` | The Inbox where alerts are sent | Your Admin routing |
| `SENDER_EMAIL` | The verified domain sending alerts | E.g. no-reply@yoursite.com |
| `SUPABASE_URL` | Application endpoint | Supabase Project -> API |
| `SUPABASE_KEY` | Administrative write-access key | Use `service_role` secret |

> **⚠️ Security Warning:** Never use the `SUPABASE_PUBLISHABLE_KEY` in the `.env` file for backend tasks. The Node scripts need the `service_role` secret to bypass frontend RLS restrictions for inserting downtime rows.

---

## 🧪 Comprehensive Local Testing

Before pushing to production, verify that your credentials work over your local machine's connection. 

Install your Node dependencies first:
```bash
npm install
```

### Command 1: Test The Pulse Engine
This forces the system to ping your server instantly.
```bash
node --env-file=.env monitor.js pulse
```
**Successful Outcome:**
```
[11 Apr 2026, 01:23:44 am IST] Task: pulse
[11 Apr 2026, 01:23:45 am IST] Pulse logged — ICMP: true, HTTP: true, Latency: 0ms
```
*If you see the above, Supabase insertion and ICMP pinging are fully functional.*

### Command 2: Test Daily SLA Delivery
This will command Supabase to query the `daily_uptime_report` view and dispatch the rich HTML template via AWS SES.
```bash
node --env-file=.env monitor.js summary daily
```
**Successful Outcome:**
```
[11 Apr 2026, 01:25:01 am IST] Task: summary
[11 Apr 2026, 01:25:02 am IST] Email sent via AWS SES: 📊 Daily SLA Report: 100% Uptime
[11 Apr 2026, 01:25:02 am IST] Daily summary sent: 100% uptime
```
*Check your inbox! If you don't receive it, verify your AWS IAM keys have `ses:SendEmail` permissions.*

### Command 3, 4 & 5: Alternative Summary Triggers
You can manually force Weekly, Monthly, and Quarterly metric evaluations anytime:
```bash
node --env-file=.env monitor.js summary weekly
node --env-file=.env monitor.js summary monthly
node --env-file=.env monitor.js summary quarterly
```

---

## 🌐 Deploying the Status Dashboard

The user-facing dashboard located at `index.html` operates uniquely on the frontend and needs its own configuration.

1. Open `index.html` in your IDE.
2. Navigate to line `~360` to find the `const CONFIG = { ... }` block.
3. Update `SUPABASE_URL` with your Supabase link.
4. Update `SUPABASE_PUBLISHABLE_KEY` with your safe, public-facing `anon` key. (DO NOT use the service_role key here!).
5. Re-enter your `STATIC_IP`, `ISP_PROVIDER` and other server metrics.
6. Simply double click `index.html` on your desktop/browser to verify it instantly connects and fetches the beautiful layout. No build-steps required.

---

## 🚀 Pushing to Production (GitHub Actions)

When you are ready to let the system run perpetually without human intervention:

1. Go to your repository on **GitHub**.
2. Click **Settings** > **Secrets and variables** > **Actions**.
3. Under **Repository secrets**, click `New repository secret` and add every single one of the **15 Keys** from your `.env` file exactly as they are named.
4. Push your code to GitHub.
5. The `.github/workflows/pulse.yml` will automatically boot up. It uses Linux VMs to execute `npm install` and run the ping every 5 minutes forever.

**To trigger an action manually via Github:**
1. Go to the "Actions" tab.
2. Select "Infrastructure Check" or "SLA Summary" workflow.
3. Click "Run workflow".
