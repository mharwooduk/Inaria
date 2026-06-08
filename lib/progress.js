import os from 'node:os';

const ESC = '\x1b';
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const GREEN = `${ESC}[32m`;
const RED = `${ESC}[31m`;
const CYAN = `${ESC}[36m`;
const YELLOW = `${ESC}[33m`;
const RESET = `${ESC}[0m`;

const BAR_WIDTH = 28;
const MAX_ACTIVE = 5;
const MAX_RECENT = 4;

/**
 * @param {number} ms
 */
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * @param {number} current
 * @param {number} total
 */
function progressBar(current, total) {
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const pct = Math.round(ratio * 100);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total} (${pct}%)`;
}

/**
 * @param {string} url
 * @param {number} [max]
 */
function shortenUrl(url, max = 72) {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

/**
 * @param {number} [limit]
 */
export function defaultConcurrency(limit = 4) {
  const cores = os.cpus().length;
  return Math.max(1, Math.min(limit, Math.floor(cores / 2) || 1));
}

/**
 * @param {number} total
 */
export function createSitemapProgress(total) {
  const isInteractive = Boolean(process.stderr.isTTY);
  const startTime = Date.now();
  let completed = 0;
  let failed = 0;
  let renderedLines = 0;
  /** @type {Set<string>} */
  const active = new Set();
  /** @type {Array<{ url: string, ok: boolean }>} */
  const recent = [];

  function finishRender() {
    if (!isInteractive || renderedLines === 0) return;
    process.stderr.write(`${ESC}[${renderedLines}A`);
    renderedLines = 0;
  }

  function writeRender(lines) {
    finishRender();
    for (const line of lines) {
      process.stderr.write(`${ESC}[2K${line}\n`);
    }
    renderedLines = lines.length;
  }

  function renderInteractive() {
    const elapsed = Date.now() - startTime;
    const rate = completed > 0 ? elapsed / completed : 0;
    const remaining = total - completed;
    const eta = completed > 0 && remaining > 0 ? formatDuration(rate * remaining) : '—';

    const lines = [
      `${BOLD}inaria${RESET}  sitemap scan`,
      `${CYAN}${progressBar(completed, total)}${RESET}  ${DIM}elapsed ${formatDuration(elapsed)}  eta ${eta}${RESET}`,
      `${DIM}ok ${completed - failed}  fail ${failed}  running ${active.size}${RESET}`,
    ];

    if (active.size > 0) {
      lines.push('');
      lines.push(`${YELLOW}running${RESET}`);
      for (const url of [...active].slice(0, MAX_ACTIVE)) {
        lines.push(`  ${DIM}•${RESET} ${shortenUrl(url)}`);
      }
      if (active.size > MAX_ACTIVE) {
        lines.push(`  ${DIM}…and ${active.size - MAX_ACTIVE} more${RESET}`);
      }
    }

    if (recent.length > 0) {
      lines.push('');
      lines.push(`${DIM}recent${RESET}`);
      for (const entry of recent.slice(-MAX_RECENT)) {
        const mark = entry.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
        lines.push(`  ${mark} ${shortenUrl(entry.url)}`);
      }
    }

    writeRender(lines);
  }

  return {
    onStart(url) {
      active.add(url);
      if (isInteractive) {
        renderInteractive();
      }
    },

    onComplete(url, ok) {
      active.delete(url);
      completed += 1;
      if (!ok) failed += 1;
      recent.push({ url, ok });
      if (recent.length > MAX_RECENT * 2) {
        recent.splice(0, recent.length - MAX_RECENT);
      }

      if (isInteractive) {
        renderInteractive();
        return;
      }

      const mark = ok ? 'ok' : 'fail';
      process.stderr.write(
        `inaria: [${completed}/${total}] ${mark} ${url}\n`,
      );
    },

    finish() {
      if (isInteractive) {
        finishRender();
        process.stderr.write('\n');
        process.stderr.write(
          `${BOLD}inaria${RESET}  done  ${GREEN}${completed - failed} ok${RESET}  ${failed > 0 ? `${RED}${failed} failed${RESET}` : `${DIM}0 failed${RESET}`}  ${DIM}${formatDuration(Date.now() - startTime)}${RESET}\n`,
        );
        return;
      }

      process.stderr.write(
        `inaria: finished ${completed}/${total} (${failed} failed) in ${formatDuration(Date.now() - startTime)}\n`,
      );
    },
  };
}

/** @deprecated Use createSitemapProgress for sitemap scans */
export function reportScanProgress(current, total, url) {
  const line = `inaria: scanning ${current}/${total} — ${url}`;
  process.stderr.write(`\r${line.padEnd(80)}`);
}

export function clearScanProgress() {
  if (!process.stderr.isTTY) return;
  process.stderr.write(`\r${' '.repeat(80)}\r`);
}

/**
 * @param {string} url
 * @param {'desktop' | 'mobile'} formFactor
 */
export function reportSingleAudit(url, formFactor) {
  process.stderr.write(`inaria: auditing ${url} (${formFactor})\n`);
}
