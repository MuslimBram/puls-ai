import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const findings: Array<{
      category: string;
      severity: string;
      title: string;
      details: string;
    }> = [];

    // 1. Check for failed login spikes (brute force detection)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentFailures } = await supabase
      .from("security_events")
      .select("ip_address, user_id")
      .eq("event_type", "login_failed")
      .gte("created_at", oneHourAgo);

    if (recentFailures && recentFailures.length > 0) {
      // Group by IP
      const ipCounts: Record<string, number> = {};
      for (const f of recentFailures) {
        const ip = f.ip_address || "unknown";
        ipCounts[ip] = (ipCounts[ip] || 0) + 1;
      }

      for (const [ip, count] of Object.entries(ipCounts)) {
        if (count >= 10) {
          findings.push({
            category: "brute_force",
            severity: "critical",
            title: `Brute force attack detected from ${ip}`,
            details: `${count} failed logins in the last hour from IP ${ip}`,
          });
        } else if (count >= 5) {
          findings.push({
            category: "brute_force",
            severity: "high",
            title: `Suspicious login activity from ${ip}`,
            details: `${count} failed logins in the last hour from IP ${ip}`,
          });
        }
      }
    }

    // 2. Check for suspicious sessions (multiple IPs per user in short time)
    const { data: suspiciousLogins } = await supabase
      .from("security_events")
      .select("user_id, ip_address")
      .eq("event_type", "login_success")
      .gte("created_at", oneHourAgo);

    if (suspiciousLogins && suspiciousLogins.length > 0) {
      const userIps: Record<string, Set<string>> = {};
      for (const s of suspiciousLogins) {
        if (!s.user_id) continue;
        if (!userIps[s.user_id]) userIps[s.user_id] = new Set();
        if (s.ip_address) userIps[s.user_id].add(s.ip_address);
      }

      for (const [userId, ips] of Object.entries(userIps)) {
        if (ips.size >= 3) {
          findings.push({
            category: "session_anomaly",
            severity: "high",
            title: `Multiple IPs for user ${userId.substring(0, 8)}...`,
            details: `User logged in from ${ips.size} different IPs in 1 hour`,
          });
        }
      }
    }

    // 3. Check for API key abuse
    const { data: apiAbuse } = await supabase
      .from("rate_limit_buckets")
      .select("bucket_key, abuse_flag, abuse_reason, workspace_id")
      .eq("abuse_flag", true);

    if (apiAbuse && apiAbuse.length > 0) {
      for (const a of apiAbuse) {
        findings.push({
          category: "rate_limit_abuse",
          severity: "high",
          title: `Rate limit abuse: ${a.bucket_key}`,
          details: a.abuse_reason || "Sustained rate limit violations",
        });
      }
    }

    // 4. Check for unverified admin roles (privilege escalation)
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "super_admin"]);

    const { data: auditLogs } = await supabase
      .from("audit_logs")
      .select("target_id, action")
      .eq("action", "role_assigned")
      .order("created_at", { ascending: false })
      .limit(100);

    if (adminRoles && adminRoles.length > 0) {
      const auditedIds = new Set(auditLogs?.map((l) => l.target_id) || []);
      for (const r of adminRoles) {
        if (!auditedIds.has(r.user_id)) {
          findings.push({
            category: "privilege_escalation",
            severity: "medium",
            title: `Unaudited ${r.role} role assignment`,
            details: `User ${r.user_id.substring(0, 8)}... has ${r.role} role without audit trail`,
          });
        }
      }
    }

    // 5. Check for stale API keys
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: staleKeys } = await supabase
      .from("api_keys")
      .select("id, label, last_used_at, created_at")
      .eq("is_active", true)
      .or(`last_used_at.is.null,last_used_at.lt.${thirtyDaysAgo}`);

    if (staleKeys && staleKeys.length > 0) {
      findings.push({
        category: "stale_credentials",
        severity: "medium",
        title: `${staleKeys.length} stale API key(s) detected`,
        details: `Active API keys not used in 30+ days should be revoked`,
      });
    }

    // 6. Check dead letter queue for stuck items (potential attack vector)
    const { count: deadLetterCount } = await supabase
      .from("dead_letter_queue")
      .select("*", { count: "exact", head: true })
      .gte("failed_at", new Date(Date.now() - 24 * 3600000).toISOString());

    if (deadLetterCount && deadLetterCount > 50) {
      findings.push({
        category: "infrastructure",
        severity: "medium",
        title: `High dead letter queue volume: ${deadLetterCount}`,
        details: `${deadLetterCount} failed jobs in 24h may indicate an attack or system failure`,
      });
    }

    // Store findings as health checks
    const scanTimestamp = new Date().toISOString();
    for (const f of findings) {
      await supabase.from("system_health_checks").insert({
        check_type: "security_scan",
        target_name: f.category,
        status: f.severity === "critical" ? "down" : f.severity === "high" ? "degraded" : "healthy",
        error_message: f.title,
        metadata: { details: f.details, severity: f.severity, scan_time: scanTimestamp },
      });
    }

    // Notify admins of critical/high findings
    const criticalFindings = findings.filter(
      (f) => f.severity === "critical" || f.severity === "high"
    );

    if (criticalFindings.length > 0) {
      // Get all admin users
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      if (admins && admins.length > 0) {
        const notifications = admins.map((admin) => ({
          user_id: admin.user_id,
          title: `🔒 Security Alert: ${criticalFindings.length} issue(s) found`,
          message: criticalFindings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}`).join(" | "),
          notification_type: "warning",
          category: "security",
          action_url: "/admin",
        }));

        await supabase.from("business_notifications").insert(notifications);
      }
    }

    return new Response(
      JSON.stringify({
        scan_time: scanTimestamp,
        findings_count: findings.length,
        critical: findings.filter((f) => f.severity === "critical").length,
        high: findings.filter((f) => f.severity === "high").length,
        medium: findings.filter((f) => f.severity === "medium").length,
        findings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
