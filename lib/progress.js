/**
 * @param {number} current
 * @param {number} total
 * @param {string} url
 */
export function reportScanProgress(current, total, url) {
  const line = `inaria: scanning ${current}/${total} — ${url}`;
  process.stderr.write(`\r${line.padEnd(80)}`);
}

export function clearScanProgress() {
  process.stderr.write(`\r${' '.repeat(80)}\r`);
}
