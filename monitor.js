const axios = require('axios');
const ping = require('ping');
const { createClient } = require('@supabase/supabase-js');
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// ─── Config ─────────────────────────────────────────
const IP = process.env.STATIC_IP;
const META = {
    provider: process.env.ISP_PROVIDER || 'N/A',
    id: process.env.SERVER_ID || 'N/A',
    location: process.env.SERVER_LOCATION || 'N/A',
    managed: process.env.MANAGED_BY || 'N/A',
    abuse: process.env.ABUSE_EMAIL || 'N/A',
    hardware: process.env.HARDWARE_VENDOR || 'N/A'
};
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const IST = 'Asia/Kolkata';

// ─── IST Helpers ────────────────────────────────────
function formatIST(date) {
    return new Date(date).toLocaleString('en-IN', {
        timeZone: IST, year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

function nowIST() {
    return formatIST(new Date());
}

// ─── Email Notification ─────────────────────────────
const sesClient = new SESClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function notify(subject, html) {
    try {
        const command = new SendEmailCommand({
            Destination: { ToAddresses: [process.env.ADMIN_EMAIL] },
            Message: {
                Body: { Html: { Charset: "UTF-8", Data: html } },
                Subject: { Charset: "UTF-8", Data: subject }
            },
            Source: `OneSpider Monitor <${process.env.SENDER_EMAIL}>`
        });

        await sesClient.send(command);
        console.log(`[${nowIST()}] Email sent via AWS SES: ${subject}`);
    } catch (e) {
        console.error(`[${nowIST()}] Critical Network/AWS Error sending email:`, e.name, e.message);
    }
}

// ─── Health Check Engine ────────────────────────────
async function performPulse() {
    const pRes = await ping.promise.probe(IP, { timeout: 10 });
    let http = false, err = null;
    try {
        await axios.get(`http://${IP}`, { timeout: 10000, validateStatus: false });
        http = true;
    } catch (e) { err = e.code || e.message; }
    return { icmp: pRes.alive, http, latency: parseFloat(pRes.avg) || 0, err };
}

// ─── Summary Email Template ─────────────────────────
function buildSummaryHTML(config, data, periodDate) {
    const uptime = data.uptime_percentage;
    const latency = data.avg_latency_ms ?? 0;
    const totalChecks = data.total_checks;
    const downtimeChecks = data.total_downtime_checks || 0;
    const downtimeMin = downtimeChecks * 5;

    const slaColor = uptime >= 99.9 ? '#22c55e' : uptime >= 99 ? '#f59e0b' : '#ef4444';
    const slaStatus = uptime >= 99.9 ? 'Excellent' : uptime >= 99 ? 'Acceptable' : 'Critical';

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title></title>
    <!--[if mso]>
    <style>
        table {border-collapse:collapse;border-spacing:0;border:none;margin:0;}
        div, td {padding:0;}
        div {margin:0 !important;}
    </style>
    <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#0f172a;">
    <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#0f172a;">
        <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:#0f172a;">
            <tr>
                <td align="center" style="padding:20px 0;">
                    <!--[if mso]>
                    <table role="presentation" align="center" style="width:600px;"><tr><td>
                    <![endif]-->
                    <table role="presentation" style="width:100%;max-width:600px;border:none;border-spacing:0;text-align:left;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#e2e8f0;background-color:#1e293b;border-radius:12px;overflow:hidden;">
                        <tr>
                            <td style="padding:24px;text-align:center;background-color:#334155;">
                                <h1 style="margin:0;font-size:22px;color:#f8fafc;font-family:Arial,sans-serif;">${config.emoji} OneSpider ${config.label} Report</h1>
                                <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;font-family:Arial,sans-serif;">Generated: ${nowIST()} IST</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px;">
                                <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                    <tr>
                                        <td align="center" style="padding:20px;background-color:#0f172a;border-radius:8px;">
                                            <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">Uptime SLA</p>
                                            <p style="margin:0;font-size:42px;font-weight:700;color:${slaColor};font-family:Arial,sans-serif;">${uptime}%</p>
                                            <p style="margin:8px 0 0;font-size:13px;color:${slaColor};font-family:Arial,sans-serif;">&#9679; ${slaStatus}</p>
                                        </td>
                                    </tr>
                                    <tr><td height="16" style="font-size:16px;line-height:16px;">&nbsp;</td></tr>
                                </table>
                                <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                    <tr>
                                        <td valign="top" style="width:48%;background-color:#0f172a;border-radius:8px;">
                                            <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                                <tr>
                                                    <td style="padding:16px;text-align:center;">
                                                        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Avg Latency</p>
                                                        <p style="margin:0;font-size:24px;font-weight:600;color:#38bdf8;font-family:Arial,sans-serif;">${latency}ms</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                        <td style="width:4%;">&nbsp;</td>
                                        <td valign="top" style="width:48%;background-color:#0f172a;border-radius:8px;">
                                            <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                                <tr>
                                                    <td style="padding:16px;text-align:center;">
                                                        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Total Checks</p>
                                                        <p style="margin:0;font-size:24px;font-weight:600;color:#a78bfa;font-family:Arial,sans-serif;">${totalChecks}</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr><td height="16" colspan="3" style="font-size:16px;line-height:16px;">&nbsp;</td></tr>
                                </table>
                                <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                    <tr>
                                        <td valign="top" style="width:48%;background-color:#0f172a;border-radius:8px;">
                                            <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                                <tr>
                                                    <td style="padding:16px;text-align:center;">
                                                        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Est. Downtime</p>
                                                        <p style="margin:0;font-size:24px;font-weight:600;color:#f97316;font-family:Arial,sans-serif;">~${downtimeMin} min</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                        <td style="width:4%;">&nbsp;</td>
                                        <td valign="top" style="width:48%;background-color:#0f172a;border-radius:8px;">
                                            <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                                <tr>
                                                    <td style="padding:16px;text-align:center;">
                                                        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Period</p>
                                                        <p style="margin:0;font-size:14px;font-weight:600;color:#34d399;font-family:Arial,sans-serif;">${periodDate}</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr><td height="16" colspan="3" style="font-size:16px;line-height:16px;">&nbsp;</td></tr>
                                </table>
                                <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                    <tr>
                                        <td style="padding:16px;background-color:#0f172a;border-left:4px solid ${slaColor};border-radius:4px;">
                                            <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;font-family:Arial,sans-serif;">
                                                <b style="color:#f8fafc;">Server:</b> ${META.id} &nbsp;|&nbsp; <b style="color:#f8fafc;">IP:</b> ${IP}
                                            </p>
                                            <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;font-family:Arial,sans-serif;">
                                                <b style="color:#f8fafc;">ISP:</b> ${META.provider} &nbsp;|&nbsp; <b style="color:#f8fafc;">Hardware:</b> ${META.hardware}
                                            </p>
                                            <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;font-family:Arial,sans-serif;">
                                                <b style="color:#f8fafc;">Location:</b> ${META.location}
                                            </p>
                                            <p style="margin:0;color:#94a3b8;font-size:13px;font-family:Arial,sans-serif;">
                                                <b style="color:#f8fafc;">Managed By:</b> ${META.managed} &nbsp;|&nbsp; <b style="color:#f8fafc;">Abuse:</b> <a href="mailto:${META.abuse}" style="color:#38bdf8;text-decoration:none;">${META.abuse}</a>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:12px;text-align:center;background-color:#0f172a;">
                                <p style="margin:0;color:#475569;font-size:11px;font-family:Arial,sans-serif;">OneSpider Infrastructure Monitor • Automated ${config.label} Report</p>
                            </td>
                        </tr>
                    </table>
                    <!--[if mso]>
                    </td></tr></table>
                    <![endif]-->
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;
}

// ─── Summary Report Generator ───────────────────────
async function sendSummary(type) {
    const viewMap = {
        daily:     { view: 'daily_uptime_report',     label: 'Daily',     emoji: '📊', period: 'report_date' },
        weekly:    { view: 'weekly_uptime_report',     label: 'Weekly',    emoji: '📈', period: 'report_week' },
        monthly:   { view: 'monthly_uptime_report',    label: 'Monthly',   emoji: '📋', period: 'report_month' },
        quarterly: { view: 'quarterly_uptime_report',  label: 'Quarterly', emoji: '📑', period: 'report_quarter' }
    };

    const config = viewMap[type];
    if (!config) { console.error(`[${nowIST()}] Unknown summary type: ${type}`); return; }

    const { data, error } = await supabase.from(config.view).select('*').limit(1).single();
    if (error || !data) { console.log(`[${nowIST()}] No data for ${type} summary.`); return; }

    const periodDate = formatIST(data[config.period]);
    const html = buildSummaryHTML(config, data, periodDate);

    await notify(`${config.emoji} ${config.label} SLA Report: ${data.uptime_percentage}% Uptime`, html);
    console.log(`[${nowIST()}] ${config.label} summary sent: ${data.uptime_percentage}% uptime`);
}

// ─── Incident Alert Templates ───────────────────────
function buildIncidentHTML(type, details) {
    const isDown = type === 'down';
    const accent = isDown ? '#ef4444' : '#22c55e';
    const headerBg = isDown ? '#dc2626' : '#166534';
    const title = isDown ? '🚨 Infrastructure Offline' : '✅ Service Restored';
    const subtitle = isDown ? `Incident detected at ${nowIST()} IST` : `Resolved at ${nowIST()} IST`;
    const subtitleColor = isDown ? '#fecaca' : '#bbf7d0';

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title></title>
    <!--[if mso]>
    <style>
        table {border-collapse:collapse;border-spacing:0;border:none;margin:0;}
        div, td {padding:0;}
        div {margin:0 !important;}
    </style>
    <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#0f172a;">
    <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#0f172a;">
        <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:#0f172a;">
            <tr>
                <td align="center" style="padding:20px 0;">
                    <!--[if mso]>
                    <table role="presentation" align="center" style="width:600px;"><tr><td>
                    <![endif]-->
                    <table role="presentation" style="width:100%;max-width:600px;border:none;border-spacing:0;text-align:left;font-family:Arial,sans-serif;font-size:14px;line-height:22px;color:#e2e8f0;background-color:#1e293b;border-radius:12px;overflow:hidden;">
                        <tr>
                            <td style="padding:24px;text-align:center;background-color:${headerBg};">
                                <h1 style="margin:0;font-size:22px;color:#ffffff;font-family:Arial,sans-serif;">${title}</h1>
                                <p style="margin:8px 0 0;color:${subtitleColor};font-size:13px;font-family:Arial,sans-serif;">${subtitle}</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px;">
                                <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                                    <tr>
                                        <td style="padding:16px;background-color:#0f172a;border-left:4px solid ${accent};border-radius:4px;font-family:Arial,sans-serif;">
                                            ${details}
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:12px;text-align:center;background-color:#0f172a;">
                                <p style="margin:0;color:#475569;font-size:11px;font-family:Arial,sans-serif;">OneSpider Infrastructure Monitor • Incident Alert</p>
                            </td>
                        </tr>
                    </table>
                    <!--[if mso]>
                    </td></tr></table>
                    <![endif]-->
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────
async function start() {
    const task = process.argv[2];
    console.log(`[${nowIST()}] Task: ${task}`);

    // ── Summary Reports ──
    if (task === 'summary') {
        const type = process.argv[3] || 'daily';
        await sendSummary(type);
        return;
    }

    // ── Pulse Check ──
    let check = await performPulse();
    if (!check.icmp && !check.http) {
        console.log(`[${nowIST()}] Potential downtime. Verifying in 30s...`);
        await new Promise(r => setTimeout(r, 30000));
        check = await performPulse();
    }

    const { data: last } = await supabase.from('uptime_logs').select('*').order('created_at', { ascending: false }).limit(1).single();
    const wasUp = last ? (last.icmp_up || last.http_up) : true;
    const isUp = check.icmp || check.http;

    // ── State Transition Alerts ──
    if (wasUp && !isUp) {
        const details = `
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">Server:</b> <span style="color: #94a3b8;">${META.id} (${IP})</span></p>
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">ISP:</b> <span style="color: #94a3b8;">${META.provider}</span></p>
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">Location:</b> <span style="color: #94a3b8;">${META.location}</span></p>
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">ICMP:</b> <span style="color: #ef4444;">DOWN</span></p>
            <p style="margin: 0;"><b style="color: #f8fafc;">HTTP:</b> <span style="color: #ef4444;">DOWN</span></p>`;
        await notify("🚨 CRITICAL: Incident Started", buildIncidentHTML('down', details));
    } else if (!wasUp && isUp) {
        // Find the last time it was UP to calculate total downtime duration
        const { data: lastUpRecord } = await supabase.from('uptime_logs')
            .select('created_at')
            .or('icmp_up.eq.true,http_up.eq.true')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
        // If no last UP record exists, assume the earliest record is the start
        const startTime = lastUpRecord ? new Date(lastUpRecord.created_at) : new Date(last.created_at);
        const duration = Math.round((new Date() - startTime) / 60000);
        
        const details = `
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">Server:</b> <span style="color: #94a3b8;">${META.id} (${IP})</span></p>
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">ISP:</b> <span style="color: #94a3b8;">${META.provider}</span></p>
            <p style="margin: 0 0 8px;"><b style="color: #f8fafc;">Total Downtime:</b> <span style="color: #fbbf24;">${duration} Minutes</span></p>
            <p style="margin: 0;"><b style="color: #f8fafc;">Status:</b> <span style="color: #22c55e;">OPERATIONAL</span></p>`;
        await notify("✅ FIXED: Service Restored", buildIncidentHTML('up', details));
    }

    // ── Log to Database ──
    await supabase.from('uptime_logs').insert([{
        icmp_up: check.icmp,
        http_up: check.http,
        latency_ms: check.latency,
        error_message: check.err
    }]);

    console.log(`[${nowIST()}] Pulse logged — ICMP: ${check.icmp}, HTTP: ${check.http}, Latency: ${check.latency}ms`);
}

start();
