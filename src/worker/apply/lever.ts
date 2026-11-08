import path from "path";
import fs from "fs";
import { Page } from "playwright";
import { ApplyHandler, ApplyContext, ApplyResult, FormAnswer } from "./types";
import { hasBotDetection } from "./bot-detector";
import { resolveAnswer } from "./qa-resolver";

const STORAGE_PATH = process.env.STORAGE_PATH ?? "./uploads";

// ─── Lever Apply Handler ──────────────────────────────────────────────────────
export class LeverApplyHandler implements ApplyHandler {
  readonly atsType = "LEVER";

  async apply(page: Page, ctx: ApplyContext): Promise<ApplyResult> {
    const formAnswers: FormAnswer[] = [];
    const screenshotDir = path.join(STORAGE_PATH, "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    // Build Lever apply URL from job URL
    const applyUrl = ctx.jobUrl.includes("/apply")
      ? ctx.jobUrl
      : `${ctx.jobUrl}/apply`;

    try {
      await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);

      // Bot detection
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

      // ── Standard Lever Fields ─────────────────────────────────────────────
      const nameParts = ctx.profile.fullName.split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || nameParts[0];

      // Lever form field selectors
      await this.fill(page, [
        'input[name="name"]',
        '#name',
        'input[id*="name"][placeholder*="First"]',
      ], ctx.profile.fullName);

      // Some Lever forms split first/last
      await this.fill(page, ['input[name="first"]', '#first'], firstName);
      await this.fill(page, ['input[name="last"]', '#last'], lastName);

      await this.fill(page, [
        'input[name="email"]', '#email', 'input[type="email"]',
      ], ctx.profile.email);

      await this.fill(page, [
        'input[name="phone"]', '#phone', 'input[type="tel"]',
      ], ctx.profile.phone);

      await this.fill(page, [
        'input[name="org"]', '#org', 'input[name*="company"]',
      ], ""); // Current company - leave blank or use last employer

      await this.fill(page, [
        'input[name="urls[LinkedIn]"]', 'input[id*="linkedin"]',
      ], ctx.profile.linkedinUrl ?? "");

      // Resume upload
      const resumeInput = await page.$('input[type="file"]');
      if (resumeInput) {
        const absPath = path.resolve(STORAGE_PATH, ctx.resumeFilePath);
        await resumeInput.setInputFiles(absPath);
        await page.waitForTimeout(1500);
      }

      // ── Lever Custom Questions ─────────────────────────────────────────────
      // Lever custom questions appear under .application-field or [data-qa="custom-question"]
      const customFields = await page.$$(
        '.application-field, [data-qa*="question"]'
      );

      for (const field of customFields) {
        try {
          const label = await field.$eval(
            "label, .field-label",
            (el) => el.textContent ?? ""
          ).catch(() => "");

          if (!label.trim()) continue;

          const textarea = await field.$("textarea");
          const input = await field.$('input[type="text"]');
          const select = await field.$("select");
          const radioButtons = await field.$$('input[type="radio"]');
          const checkboxes = await field.$$('input[type="checkbox"]');

          if (textarea || input) {
            const answer = await resolveAnswer(label, ctx.profile, ctx.resumeText);
            formAnswers.push(answer);
            const target = textarea ?? input!;
            await target.click();
            await target.fill(answer.answer);
          } else if (select) {
            const answer = await resolveAnswer(label, ctx.profile, ctx.resumeText);
            formAnswers.push(answer);
            const options = await select.$$("option");
            for (const option of options) {
              const optText = await option.textContent() ?? "";
              if (optText.toLowerCase().includes(answer.answer.toLowerCase().slice(0, 10))) {
                await select.selectOption({ label: optText });
                break;
              }
            }
          } else if (radioButtons.length > 0) {
            const answer = await resolveAnswer(label, ctx.profile, ctx.resumeText);
            formAnswers.push(answer);
            // Click the first radio that matches
            for (const radio of radioButtons) {
              const radioLabel = await radio.evaluate(
                (el) => document.querySelector(`label[for="${el.id}"]`)?.textContent ?? (el as HTMLInputElement).value
              ).catch(() => "");
              if (radioLabel.toLowerCase().includes(answer.answer.toLowerCase().slice(0, 5))) {
                await radio.click();
                break;
              }
            }
          } else if (checkboxes.length > 0) {
            const answer = await resolveAnswer(label, ctx.profile, ctx.resumeText);
            formAnswers.push(answer);
            if (/yes|true|agree/i.test(answer.answer)) {
              await checkboxes[0]?.click();
            }
          }
        } catch (err) {
          console.warn("[LV Apply] Error filling custom field:", err);
        }
      }

      // ── Screenshot ─────────────────────────────────────────────────────────
      const screenshotPath = path.join(
        screenshotDir,
        `${ctx.applicationId}-${ctx.isTestRun ? "test" : "pre-submit"}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      if (ctx.isTestRun || ctx.mode === "REVIEW") {
        return {
          success: true,
          submitted: false,
          screenshotPath,
          formAnswers,
          confirmationText: "Form filled - awaiting review",
        };
      }

      // ── Submit ─────────────────────────────────────────────────────────────
      const submitBtn = await page.$(
        'button[type="submit"], input[type="submit"], [data-qa="btn-submit"]'
      );

      if (!submitBtn) {
        return {
          success: false,
          submitted: false,
          screenshotPath,
          errorMessage: "Submit button not found on Lever form",
          formAnswers,
        };
      }

      await submitBtn.click();
      await page.waitForTimeout(3000);

      // Post-submit bot check
      const postBot = await hasBotDetection(page);
      if (postBot.detected) {
        const capPath = path.join(screenshotDir, `${ctx.applicationId}-post-captcha.png`);
        await page.screenshot({ path: capPath, fullPage: true });
        return {
          success: false,
          submitted: false,
          screenshotPath: capPath,
          needsManualAction: true,
          manualActionReason: `Post-submit: ${postBot.reason}`,
          formAnswers,
        };
      }

      const confirmPath = path.join(
        screenshotDir,
        `${ctx.applicationId}-confirmation.png`
      );
      await page.screenshot({ path: confirmPath, fullPage: true });

      const confirmText = await page
        .locator("[class*='confirmation'], [class*='thank'], h1, h2")
        .first()
        .textContent()
        .catch(() => "Application submitted");

      return {
        success: true,
        submitted: true,
        screenshotPath: confirmPath,
        confirmationText: confirmText ?? "Application submitted",
        formAnswers,
      };
    } catch (err) {
      const errorPath = path.join(screenshotDir, `${ctx.applicationId}-error.png`);
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

  private async fill(
    page: Page,
    selectors: string[],
    value: string
  ): Promise<void> {
    if (!value) return;
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await el.fill(value);
          return;
        }
      } catch {
        // try next
      }
    }
  }
}
