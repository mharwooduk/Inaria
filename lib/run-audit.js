import * as chromeLauncher from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';
import { condense } from './condense.js';

const LIGHTHOUSE_FLAGS = {
  logLevel: 'error',
  output: 'json',
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
};

/**
 * @param {string} url
 * @param {'desktop' | 'mobile'} formFactor
 * @param {number} port
 */
async function runSingleAudit(url, formFactor, port) {
  const config = formFactor === 'desktop' ? desktopConfig : undefined;
  const runner = await lighthouse(url, { ...LIGHTHOUSE_FLAGS, port }, config);

  if (!runner?.lhr) {
    throw new Error(`Lighthouse returned no result for ${formFactor} audit`);
  }

  return condense(runner.lhr);
}

/**
 * @param {string} url
 * @param {Array<'desktop' | 'mobile'>} formFactors
 */
export async function runAudits(url, formFactors) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

  try {
    const results = [];
    for (const formFactor of formFactors) {
      results.push(await runSingleAudit(url, formFactor, chrome.port));
    }
    return results;
  } finally {
    try {
      await chrome.kill();
    } catch (error) {
      // Windows may briefly lock Chrome profile dir after kill.
      if (error?.code !== 'EPERM') {
        throw error;
      }
    }
  }
}
