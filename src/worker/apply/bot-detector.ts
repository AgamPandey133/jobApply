import { Page } from "playwright";

// Known bot-detection/CAPTCHA selectors
const BOT_DETECTION_SELECTORS = [
  'iframe[src*="turnstile"]',
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  "#cf-wrapper",
  "#challenge-stage",
  ".cf-browser-verification",
  '[data-testid="challenge-form"]',
  'script[src*="hcaptcha.com"]',
  'script[src*="recaptcha"]',
];

// ─── Check if page has bot detection ─────────────────────────────────────────
export async function hasBotDetection(page: Page): Promise<{
  detected: boolean;
  reason: string;
}> {
  for (const selector of BOT_DETECTION_SELECTORS) {
    try {
      const el = await page.$(selector);
      if (el) {
        return {
          detected: true,
          reason: `Bot protection detected: ${selector}`,
        };
      }
    } catch {
      // Selector might not be valid in all contexts
    }
  }

  // Check page title for Cloudflare challenge patterns
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|ddos protection/i.test(title)) {
    return {
      detected: true,
      reason: `Bot protection detected in page title: "${title}"`,
    };
  }

  // Check for common error page patterns
  const url = page.url();
  if (/captcha|challenge|verify/i.test(url)) {
    return {
      detected: true,
      reason: `Bot protection URL pattern: ${url}`,
    };
  }

  return { detected: false, reason: "" };
}
