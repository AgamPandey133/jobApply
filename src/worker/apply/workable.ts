import path from "path";
import fs from "fs";
import { Page } from "playwright";
import { ApplyHandler, ApplyContext, ApplyResult, FormAnswer } from "./types";
import { hasBotDetection } from "./bot-detector";
import { resolveAnswer } from "./qa-resolver";

const STORAGE_PATH = process.env.STORAGE_PATH ?? "./uploads";

export class WorkableApplyHandler implements ApplyHandler {
  readonly atsType = "WORKABLE";

  async apply(page: Page, ctx: ApplyContext): Promise<ApplyResult> {
    const formAnswers: FormAnswer[] = [];
    const screenshotDir = path.join(STORAGE_PATH, "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    try {
      await page.goto(ctx.jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2000);

      // Click "Apply" or "Apply now" button if on overview page
      const applyBtn = await page.$(
        'a[data-ui="apply-button"], button[data-ui="apply-button"], a:has-text("Apply"), button:has-text("Apply")'
      );
      if (applyBtn) {
        await applyBtn.click();
        await page.waitForTimeout(2000);
      }

      const botCheck = await hasBotDetection(page);
      if (botCheck.detected) {
        const screenshotPath = path.join(screenshotDir, `${ctx.applicationId}-captcha.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return { success: false, submitted: false, screenshotPath, needsManualAction: true, manualActionReason: botCheck.reason };
      }

      const nameParts = ctx.profile.fullName.split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || nameParts[0];

      await this.fill(page, ['input[name="firstname"]', 'input[id*="first_name"]', 'input[placeholder*="First"]'], firstName);
      await this.fill(page, ['input[name="lastname"]', 'input[id*="last_name"]', 'input[placeholder*="Last"]'], lastName);
      await this.fill(page, ['input[name="email"]', 'input[type="email"]'], ctx.profile.email);
      await this.fill(page, ['input[name="phone"]', 'input[type="tel"]'], ctx.profile.phone);

      if (ctx.profile.location) {
        await this.fill(page, ['input[name="address"]', 'input[id*="location"]', 'input[placeholder*="Location"]'], ctx.profile.location);
      }

      if (ctx.profile.linkedinUrl) {
        await this.fill(page, ['input[name*="social_links_linkedin"]', 'input[placeholder*="LinkedIn"]'], ctx.profile.linkedinUrl);
      }

      if (ctx.profile.githubUrl) {
        await this.fill(page, ['input[name*="social_links_github"]', 'input[placeholder*="GitHub"]'], ctx.profile.githubUrl);
      }

      if (ctx.profile.portfolioUrl) {
        await this.fill(page, ['input[name*="social_links_portfolio"]', 'input[placeholder*="Portfolio"]', 'input[placeholder*="Website"]'], ctx.profile.portfolioUrl);
      }

      // Resume upload
      const fileInput = await page.$('input[type="file"]');
      if (fileInput && ctx.resumeFilePath) {
        const absPath = path.resolve(STORAGE_PATH, ctx.resumeFilePath);
        await fileInput.setInputFiles(absPath);
        await page.waitForTimeout(2000);
      }

      // Resolve questions
      const formGroups = await page.$$('[data-ui*="field"], .field, .form-group');
      for (const group of formGroups) {
        try {
          const label = await group.$eval('label', (el) => el.textContent ?? "").catch(() => "");
          if (!label.trim()) continue;

          const textarea = await group.$('textarea');
          const input = await group.$('input[type="text"]');
          if (textarea || input) {
            const answer = await resolveAnswer(label, ctx.profile, ctx.resumeText);
            formAnswers.push(answer);
            const target = textarea ?? input!;
            await target.fill(answer.answer);
          }
        } catch { /* skip */ }
      }

      const screenshotPath = path.join(screenshotDir, `${ctx.applicationId}-${ctx.isTestRun ? "test" : "pre-submit"}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      if (ctx.isTestRun || ctx.mode === "REVIEW") {
        return { success: true, submitted: false, screenshotPath, formAnswers, confirmationText: "Form filled - ready for review" };
      }

      const submitBtn = await page.$('button[type="submit"], button[data-ui="submit-application"], button:has-text("Submit application")');
      if (!submitBtn) {
        return { success: false, submitted: false, screenshotPath, errorMessage: "Submit button not found", formAnswers };
      }

      await submitBtn.click();
      await page.waitForTimeout(3000);

      const confirmPath = path.join(screenshotDir, `${ctx.applicationId}-confirmation.png`);
      await page.screenshot({ path: confirmPath, fullPage: true });
      const confirmText = await page.locator("h1, h2, [data-ui='success-message']").first().textContent().catch(() => "Application Submitted");

      return { success: true, submitted: true, screenshotPath: confirmPath, confirmationText: confirmText ?? "Submitted", formAnswers };
    } catch (err) {
      const errorPath = path.join(screenshotDir, `${ctx.applicationId}-error.png`);
      await page.screenshot({ path: errorPath, fullPage: true }).catch(() => {});
      return { success: false, submitted: false, screenshotPath: errorPath, errorMessage: String(err), formAnswers };
    }
  }

  private async fill(page: Page, selectors: string[], value: string): Promise<void> {
    if (!value) return;
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); await el.fill(value); return; }
      } catch { /* try next */ }
    }
  }
}
