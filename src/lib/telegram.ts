import prisma from "./db";

// ─── Send a simple text message via Telegram Bot API ────────────────────────────
export async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[Telegram] Bot token or Chat ID not configured, skipping notification");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Telegram] Message delivery note (${res.status}):`, errText);
    }
  } catch (err) {
    console.error("[Telegram] Failed to send message:", err);
  }
}


// ─── Notify: New job discovered (Instant Alert) ──────────────────────────────
export async function notifyNewJobDiscovered(params: {
  jobTitle: string;
  company: string;
  location: string;
  isRemote: boolean;
  jobUrl: string;
  applyMode: string;
  atsType?: string;
  appUrl?: string;
}): Promise<void> {
  const {
    jobTitle,
    company,
    location,
    isRemote,
    jobUrl,
    applyMode,
    atsType,
    appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  } = params;

  const modeBadge =
    applyMode === "FULL_AUTO"
      ? "⚡ *Full Auto applying...*"
      : applyMode === "REVIEW"
      ? "📋 *Review mode queued*"
      : "🔔 *Alert only*";

  const loc = isRemote ? "🌐 Remote" : (location || "Not specified");

  const message = `🚨 *New Job Just Opened!*

*${jobTitle}* @ ${company}
📍 Location: ${loc}
🏢 ATS: \`${atsType ?? "Direct"}\`
⚙️ Mode: ${modeBadge}

[View Job Posting](${jobUrl}) | [Open Dashboard](${appUrl}/jobs)`;

  await sendTelegram(message);
  await createInAppNotification({
    title: `New Opening: ${jobTitle} @ ${company}`,
    message: `${loc} • ${modeBadge.replace(/\*/g, "")}`,
    type: "INFO",
    link: jobUrl,
    metadata: { jobTitle, company, location, isRemote, jobUrl, applyMode },
  });
}

// ─── Notify: New job awaiting review ──────────────────────────────────────────
export async function notifyJobAwaitingReview(params: {
  jobTitle: string;
  company: string;
  jobUrl: string;
  matchScore: number;
  resumeLabel: string;
  matchReason: string;
  applicationId: string;
  appUrl?: string;
}): Promise<void> {
  const {
    jobTitle,
    company,
    jobUrl,
    matchScore,
    resumeLabel,
    matchReason,
    applicationId,
    appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  } = params;

  const reviewUrl = `${appUrl}/applications/${applicationId}`;

  const message = `🎯 *New Job Match — Awaiting Your Review*

*${jobTitle}* @ ${company}
📊 Match Score: *${matchScore.toFixed(0)}%*
📄 Resume: ${resumeLabel}
💡 _${matchReason}_

[View Job Posting](${jobUrl})
[Review & Submit Application](${reviewUrl})`;

  await sendTelegram(message);
  await createInAppNotification({
    title: `New Match: ${jobTitle} @ ${company}`,
    message: `${matchScore.toFixed(0)}% match. Resume: ${resumeLabel}. ${matchReason}`,
    type: "ACTION_REQUIRED",
    link: reviewUrl,
    metadata: { applicationId, jobTitle, company, matchScore },
  });
}

// ─── Notify: Application submitted ────────────────────────────────────────────
export async function notifyApplicationSubmitted(params: {
  jobTitle: string;
  company: string;
  jobUrl: string;
  matchScore: number;
  resumeLabel: string;
  applicationId: string;
  screenshotPath?: string;
  appUrl?: string;
}): Promise<void> {
  const {
    jobTitle,
    company,
    jobUrl,
    matchScore,
    resumeLabel,
    applicationId,
    appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  } = params;

  const detailUrl = `${appUrl}/applications/${applicationId}`;

  const message = `✅ *Application Submitted*

*${jobTitle}* @ ${company}
📊 Score: *${matchScore.toFixed(0)}%* | Resume: ${resumeLabel}

[Job Posting](${jobUrl}) | [View Application](${detailUrl})`;

  await sendTelegram(message);
  await createInAppNotification({
    title: `Applied: ${jobTitle} @ ${company}`,
    message: `Application submitted successfully. Score: ${matchScore.toFixed(0)}%.`,
    type: "SUCCESS",
    link: detailUrl,
  });
}

// ─── Notify: Needs manual action (CAPTCHA, etc.) ──────────────────────────────
export async function notifyNeedsManualAction(params: {
  jobTitle: string;
  company: string;
  jobUrl: string;
  reason: string;
  applicationId: string;
  appUrl?: string;
}): Promise<void> {
  const {
    jobTitle,
    company,
    jobUrl,
    reason,
    applicationId,
    appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  } = params;

  const detailUrl = `${appUrl}/applications/${applicationId}`;

  const message = `⚠️ *Manual Action Required*

*${jobTitle}* @ ${company}
Reason: ${reason}

[Apply Manually](${jobUrl})
[View in JobSniper](${detailUrl})`;

  await sendTelegram(message);
  await createInAppNotification({
    title: `Action Required: ${jobTitle} @ ${company}`,
    message: `Manual action needed: ${reason}`,
    type: "ACTION_REQUIRED",
    link: jobUrl,
  });
}

// ─── Notify: Low match score ───────────────────────────────────────────────────
export async function notifyLowMatch(params: {
  jobTitle: string;
  company: string;
  jobUrl: string;
  matchScore: number;
  threshold: number;
  applicationId: string;
  appUrl?: string;
}): Promise<void> {
  const {
    jobTitle,
    company,
    jobUrl,
    matchScore,
    threshold,
    appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  } = params;

  const message = `⏭️ *Job Skipped — Low Match*

*${jobTitle}* @ ${company}
Score: ${matchScore.toFixed(0)}% (threshold: ${threshold}%)

[View Job](${jobUrl})`;

  await sendTelegram(message);
}

// ─── In-App Notification ──────────────────────────────────────────────────────
export async function createInAppNotification(params: {
  title: string;
  message: string;
  type: "INFO" | "ACTION_REQUIRED" | "SUCCESS" | "WARNING" | "ERROR";
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        title: params.title,
        message: params.message,
        type: params.type as never,
        link: params.link,
        metadata: params.metadata as any,
      },
    });
  } catch (err) {
    console.error("[Notifier] Failed to create in-app notification:", err);
  }
}
