import path from "path";
import fs from "fs";
import { Page } from "playwright";
import { ApplyHandler, ApplyContext, ApplyResult, FormAnswer } from "./types";
import { hasBotDetection } from "./bot-detector";
import { resolveAnswer } from "./qa-resolver";

const STORAGE_PATH = process.env.STORAGE_PATH ?? "./uploads";

// ─── Ashby Apply Handler ──────────────────────────────────────────────────────
export class AshbyApplyHandler implements ApplyHandler {
  readonly atsType = "ASHBY";

  async apply(page: Page, ctx: ApplyContext): Promise<ApplyResult> {
    const formAnswers: FormAnswer[] = [];
    const screenshotDir = path.join(STORAGE_PATH, "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    try {
      await page.goto(ctx.jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2000);

      // Click Apply button if on job detail page
      const applyBtn = await page.$(
        'a:has-text("Apply"), button:has-text("Apply Now"), a:has-text("Apply Now")'
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

      // Ashby uses data-testid attributes
      await this.fill(page, [
        '[data-testid*="first"], [name*="firstName"], input[placeholder*="First"]',
      ], firstName);
      await this.fill(page, [
        '[data-testid*="last"], [name*="lastName"], input[placeholder*="Last"]',
      ], lastName);
      await this.fill(page, [
        '[data-testid*="email"], input[type="email"]',
      ], ctx.profile.email);
      await this.fill(page, [
        '[data-testid*="phone"], input[type="tel"]',
      ], ctx.profile.phone);
      await this.fill(page, [
        '[data-testid*="linkedin"], input[placeholder*="LinkedIn"]',
      ], ctx.profile.linkedinUrl ?? "");
      await this.fill(page, [
        '[data-testid*="github"], input[placeholder*="GitHub"]',
      ], ctx.profile.githubUrl ?? "");
      await this.fill(page, [
        '[data-testid*="portfolio"], [data-testid*="website"]',
      ], ctx.profile.portfolioUrl ?? "");

      // Resume upload
      const resumeInput = await page.$('input[type="file"]');
      if (resumeInput) {
        const absPath = path.resolve(STORAGE_PATH, ctx.resumeFilePath);
        await resumeInput.setInputFiles(absPath);
        await page.waitForTimeout(2000);
      }

      // Custom questions
      const questionContainers = await page.$$('[data-testid*="question"], .ashby-application-form-question');
      for (const container of questionContainers) {
        try {
          const label = await container.$eval('label, [class*="label"]', (el) => el.textContent ?? "").catch(() => "");
          if (!label.trim()) continue;

          const textarea = await container.$("textarea");
          const input = await container.$('input[type="text"]');
          if (textarea || input) {
            const answer = await resolveAnswer(label, ctx.profile, ctx.resumeText);
            formAnswers.push(answer);
            const target = textarea ?? input!;
            await target.fill(answer.answer);
          }
        } catch { /* continue */ }
      }

      const screenshotPath = path.join(screenshotDir, `${ctx.applicationId}-${ctx.isTestRun ? "test" : "pre-submit"}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      if (ctx.isTestRun || ctx.mode === "REVIEW") {
        return { success: true, submitted: false, screenshotPath, formAnswers, confirmationText: "Form filled - awaiting review" };
      }

      const submitBtn = await page.$('button[type="submit"], [data-testid*="submit"]');
      if (!submitBtn) {
        return { success: false, submitted: false, screenshotPath, errorMessage: "Submit button not found", formAnswers };
      }

      await submitBtn.click();
      await page.waitForTimeout(3000);

      const confirmPath = path.join(screenshotDir, `${ctx.applicationId}-confirmation.png`);
      await page.screenshot({ path: confirmPath, fullPage: true });
      const confirmText = await page.locator("h1, h2, [class*='success']").first().textContent().catch(() => "Applied");

      return { success: true, submitted: true, screenshotPath: confirmPath, confirmationText: confirmText ?? "Applied", formAnswers };
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
