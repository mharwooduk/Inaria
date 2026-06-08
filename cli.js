#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { runAudits } from './lib/run-audit.js';

function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`URL must use http or https: ${url}`);
  }

  return parsed.href;
}

function resolveFormFactors(options) {
  const factors = [];
  if (options.mobile) factors.push('mobile');
  if (options.desktop || factors.length === 0) factors.push('desktop');
  return factors;
}

const program = new Command();

program
  .name('inaria')
  .description('Run Lighthouse audits and output condensed JSON')
  .argument('<url>', 'URL to audit')
  .option('--desktop', 'run desktop audit')
  .option('--mobile', 'run mobile audit')
  .option('-o, --output <file>', 'write JSON to file instead of stdout')
  .action(async (url, options) => {
    try {
      const validatedUrl = validateUrl(url);
      const formFactors = resolveFormFactors(options);
      const results = await runAudits(validatedUrl, formFactors);
      const output = results.length === 1 ? results[0] : results;
      const json = `${JSON.stringify(output, null, 2)}\n`;

      if (options.output) {
        writeFileSync(options.output, json, 'utf8');
      } else {
        process.stdout.write(json);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`inaria: ${message}\n`);
      process.exit(1);
    }
  });

program.parse();
