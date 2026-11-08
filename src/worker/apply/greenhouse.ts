import path from "path";
import fs from "fs";
import { Page } from "playwright";
import { ApplyHandler, ApplyContext, ApplyResult, FormAnswer } from "./types";
import { hasBotDetection } from "./bot-detector";
import { resolveAnswer } from "./qa-resolver";

const STORAGE_PATH = process.env.STORAGE_PATH ?? "./uploads";

// ─── Greenhouse Apply Handler ─────────────────────────────────────────────────
export class GreenhouseApplyHandler implements ApplyHandler {
  readonly atsType = "GREENHOUSE";

  async apply(page: Page, ctx: ApplyContext): Promise<ApplyResult> {
    const formAnswers: FormAnswer[] = [];
    const screenshotDir = path.join(STORAGE_PATH, "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    try {
      // Navigate to apply URL
      await page.goto(ctx.jobUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);

      // Check for bot detection
      const botCheck = await hasBotDetection(page);
      if (botCheck.detected) {
        const screenshotPath = path.join(
          screenshotDir,
          `${ctx.applicationId}-captcha.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        return {
          success: false,
          submitted: false,
          screenshotPath,
          needsManualAction: true,
          manualActionReason: botCheck.reason,
        };
      }

      // ── Fill Standard Fields ───────────────────────────────────────────────

      // First Name + Last Name
      const nameParts = ctx.profile.fullName.split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || nameParts[0];

      await this.fillField(page, [
        '#first_name', 'input[name="first_name"]', 'input[id*="first"]',
      ], firstName);

      await this.fillField(page, [
        '#last_name', 'input[name="last_name"]', 'input[id*="last"]',
      ], lastName);

      await this.fillField(page, [
        '#email', 'input[name="email"]', 'input[type="email"]',
      ], ctx.profile.email);

      await this.fillField(page, [
        '#phone', 'input[name="phone"]', 'input[type="tel"]',
      ], ctx.profile.phone);

      // LinkedIn
      if (ctx.profile.linkedinUrl) {
        await this.fillField(page, [
          'input[id*="linkedin"]', 'input[name*="linkedin"]',
          '#job_application_urls_linkedin_linkedin_profile_url',
        ], ctx.profile.linkedinUrl);
      }

      // GitHub  
      if (ctx.profile.githubUrl) {
        await this.fillField(page, [
          'input[id*="github"]', 'input[name*="github"]',
        ], ctx.profile.githubUrl);
      }

      // Portfolio/Website
      if (ctx.profile.portfolioUrl) {
        await this.fillField(page, [
          'input[id*="portfolio"]', 'input[id*="website"]',
          'input[name*="portfolio"]', 'input[name*="website"]',
        ], ctx.profile.portfolioUrl);
      }

      // Location
      await this.fillField(page, [
        'input[id*="location"]', 'input[name*="location"]',
      ], ctx.profile.location);

      // Resume upload
      const resumeInput = await page.$('input[type="file"]');
      if (resumeInput) {
        const absPath = path.resolve(STORAGE_PATH, ctx.resumeFilePath);
        await resumeInput.setInputFiles(absPath);
        await page.waitForTimeout(1000); // Wait for upload processing
      }

      // ── Custom Questions ───────────────────────────────────────────────────
      const customQuestions = await page.$$(
        '.field--custom_field, [id*="custom_question"]'
      );

      for (const questionEl of customQuestions) {
        try {
          const labelEl = await questionEl.$("label");
          const questionText = await labelEl?.textContent() ?? "";
          if (!questionText.trim()) continue;

          const textarea = await questionEl.$("textarea");
          const input = await questionEl.$('input[type="text"]');
          const select = await questionEl.$("select");

          if (textarea || input) {
            const answer = await resolveAnswer(
              questionText,
              ctx.profile,
              ctx.resumeText
            );
            formAnswers.push(answer);

            const field = textarea ?? input!;
            await field.click();
            await field.fill(answer.answer);
          } else if (select) {
            // Handle dropdown selects for work auth, etc.
            const options = await select.$$("option");
            const answer = await resolveAnswer(
              questionText,
              ctx.profile,
              ctx.resumeText
            );
            formAnswers.push(answer);

            // Try to find best matching option
            for (const option of options) {
              const optText = await option.textContent() ?? "";
              if (
                optText.toLowerCase().includes(answer.answer.toLowerCase()) ||
                answer.answer.toLowerCase().includes(optText.toLowerCase())
              ) {
                await select.selectOption({ label: optText });
                break;
              }
            }
          }
        } catch (err) {
          console.warn("[GH Apply] Error filling custom question:", err);
        }
      }

      // Handle work authorization / EEO dropdowns
      await this.handleWorkAuthDropdown(page, ctx.profile, formAnswers);

      // ── Screenshot ─────────────────────────────────────────────────────────
      const screenshotPath = path.join(
        screenshotDir,
        `${ctx.applicationId}-${ctx.isTestRun ? "test" : "pre-submit"}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // ── Submit or Review Mode ──────────────────────────────────────────────
      if (ctx.isTestRun || ctx.mode === "REVIEW") {
        // In test run or review mode, do NOT click submit
        return {
          success: true,
          submitted: false,
          screenshotPath,
          formAnswers,
          confirmationText: "Form filled - awaiting review",
        };
      }

      // Full-Auto: submit
      const submitButton = await page.$(
        'input[type="submit"], button[type="submit"], button:has-text("Submit"), button:has-text("Apply")'
      );

      if (!submitButton) {
        return {
          success: false,
          submitted: false,
          screenshotPath,
          errorMessage: "Submit button not found",
          formAnswers,
        };
      }

      await submitButton.click();

      // Wait for confirmation
      await page.waitForTimeout(3000);

      // Check for bot detection post-submit
      const postSubmitBotCheck = await hasBotDetection(page);
      if (postSubmitBotCheck.detected) {
        const capPath = path.join(
          screenshotDir,
          `${ctx.applicationId}-post-captcha.png`
        );
        await page.screenshot({ path: capPath, fullPage: true });
        return {
          success: false,
          submitted: false,
          screenshotPath: capPath,
          needsManualAction: true,
          manualActionReason: `Post-submit: ${postSubmitBotCheck.reason}`,
          formAnswers,
        };
      }

      const confirmationPath = path.join(
        screenshotDir,
        `${ctx.applicationId}-confirmation.png`
      );
      await page.screenshot({ path: confirmationPath, fullPage: true });

      const confirmationText = await page
        .locator(
          '.confirmation, [class*="success"], [class*="thank"], h1, h2'
        )
        .first()
        .textContent()
        .catch(() => "Application submitted");

      return {
        success: true,
        submitted: true,
        screenshotPath: confirmationPath,
        confirmationText: confirmationText ?? "Application submitted",
        formAnswers,
      };
    } catch (err) {
      const errorPath = path.join(
        screenshotDir,
        `${ctx.applicationId}-error.png`
      );
      await page.screenshot({ path: errorPath, fullPage: true }).catch(() => {});

      return {
        success: false,
        submitted: false,
        screenshotPath: errorPath,
        errorMessage: String(err),
        formAnswers,
      };
    }
  }

  // ─── Fill a field using multiple selectors ──────────────────────────────────
  private async fillField(
    page: Page,
    selectors: string[],
    value: string
  ): Promise<void> {
    for (const selector of selectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          await el.click();
          await el.fill(value);
          return;
        }
      } catch {
        // Try next selector
      }
    }
  }

  // ─── Handle work authorization dropdown ─────────────────────────────────────
  private async handleWorkAuthDropdown(
    page: Page,
    profile: ApplyContext["profile"],
    formAnswers: FormAnswer[]
  ): Promise<void> {
    try {
      const authSelect = await page.$(
        'select[id*="work_auth"], select[name*="work_auth"], select[id*="authorization"]'
      );
      if (authSelect) {
        const options = await authSelect.$$("option");
        const authText = profile.workAuthorization.toLowerCase();

        let matched = false;
        // 1. Direct match
        for (const option of options) {
          const optText = (await option.textContent() ?? "").toLowerCase();
          if (
            optText.includes(authText) ||
            authText.includes(optText.replace(/[^a-z]/g, ""))
          ) {
            const label = (await option.textContent() ?? "").trim();
            await authSelect.selectOption({ label });
            formAnswers.push({
              question: "Work Authorization",
              answer: label,
              source: "PROFILE",
            });
            matched = true;
            break;
          }
        }

        // 2. Semantic fallback for Indian Citizen / Authorized
        if (!matched) {
          const isIndia = /india|indian/i.test(authText);
          const needsSponsor = profile.requireSponsorship;

          for (const option of options) {
            const optText = (await option.textContent() ?? "").toLowerCase().trim();
            if (isIndia && (optText.includes("indian") || optText.includes("citizen") || optText.includes("authorized without") || optText === "yes")) {
              const label = (await option.textContent() ?? "").trim();
              await authSelect.selectOption({ label });
              formAnswers.push({
                question: "Work Authorization",
                answer: label,
                source: "PROFILE",
              });
              break;
            } else if (!needsSponsor && (optText.includes("authorized") || optText.includes("no sponsorship") || optText === "yes")) {
              const label = (await option.textContent() ?? "").trim();
              await authSelect.selectOption({ label });
              formAnswers.push({
                question: "Work Authorization",
                answer: label,
                source: "PROFILE",
              });
              break;
            }
          }
        }
      }
    } catch {
      // Not critical
    }
  }
}
