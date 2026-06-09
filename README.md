<p align="center">
  <img src="assets/inaria-banner.png" alt="Inaria" width="600">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/inaria"><img src="https://img.shields.io/npm/v/inaria.svg" alt="npm version"></a>
  <a href="https://github.com/mharwooduk/Inaria/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="node >=22">
</p>

**Lighthouse shaped for AI agents, not HTML reports.**

Thin wrapper around Lighthouse + Chrome. Real value is `condense()` — turns megabytes of audit noise into a few kilobytes of actionable context for coding agents.

## Quick start

```bash
npx inaria https://example.com
pnpm dlx inaria https://example.com
yarn dlx inaria https://example.com

# Check installed version
npx inaria --version
```

**Prerequisites:** Node.js 22+, Google Chrome or Chromium on your system.

## Why Inaria

Running Lighthouse is easy. Feeding the output to an AI agent is not.

| | Raw Lighthouse JSON | Inaria output |
|---|---|---|
| **Size** | Often 1–5+ MB | Typically a few KB |
| **Audits** | Hundreds, traces, tables | Scores, core metrics, top 25 failures |
| **DOM context** | Buried in `details.items` | `failingElements` with selector, snippet, explanation |
| **Streams** | Progress mixed with output | stdout = JSON only, stderr = progress |

For an agent that needs to find and fix issues in a codebase, that condensation is the point. Full Lighthouse JSON wastes context, adds noise, and makes prioritization harder.

## What it is

- **Lighthouse → agent-ready JSON.** Scores, metrics, failing audits with DOM selectors and snippets.
- **Sitemap sweeps.** Parallel Chrome workers with live TTY progress on stderr.
- **Pipe-friendly.** Compact JSON on stdout by default. Progress never pollutes the JSON stream.

## What it isn't

| Need | Use instead |
|------|-------------|
| Full audit fidelity (80+ a11y failures) | `--all-issues` or `--fullreport`, or raw `npx lighthouse` |
| Real-user field data (CrUX) | PageSpeed Insights API |
| CI score gates and regression tracking | Lighthouse CI (`@lhci/cli`) |
| Human-readable HTML dashboards | Lighthouse CLI `--view`, Unlighthouse |
| Deep perf debugging (waterfall, flame charts) | Chrome DevTools |
| Zero-setup cloud audits | PSI API (still needs local Chrome for Inaria) |

Default output caps at **25 issues** and **15 elements per issue** — tuned for agent context, not compliance sign-off. Escape hatches below.

## Usage

```bash
# Desktop audit (default)
npx inaria https://example.com

# Mobile only
npx inaria https://example.com --mobile

# Both form factors (JSON array of two objects)
npx inaria https://example.com --desktop --mobile

# Write pretty JSON to file
npx inaria https://example.com -o report.json

# Sitemap crawl with live progress on stderr
npx inaria --sitemap https://example.com/sitemap.xml --desktop --mobile -o sitemap-report.json

# 6 parallel workers
npx inaria --sitemap https://example.com/sitemap.xml -c 6
```

Run `inaria --help` for the full CLI reference.

### CLI reference

```text
INARIA

VERSION                 -V, --version

USAGE
  inaria <url> [options]
  inaria --sitemap <sitemap-url> [options]

FORM FACTORS
  Desktop only            (default)
  Mobile only             --mobile
  Desktop + Mobile        --desktop --mobile

OUTPUT MODES
  Default                 Scores, metrics, top 25 issues
  --all-issues            All failing audits and elements
  --fullreport            Full Lighthouse JSON (1–5+ MB)

JSON FORMATTING
  stdout                  Compact JSON (default)
  --compact               Force compact JSON
  --pretty                Force pretty JSON
  -o, --output <file>     Save formatted JSON to file

STREAMS
  stdout                  JSON output only
  stderr                  Progress, status, errors

SITEMAP RESULT
  ┌─────────────────────────────────────┐
  │ sitemap                             │
  │ total                               │
  │ scanned                             │
  │ pages[]                             │
  │   ├─ url                            │
  │   └─ audits | error                 │
  └─────────────────────────────────────┘
```

| Option | Description |
|--------|-------------|
| `[url]` | Page to audit (`http` or `https`). Omit when using `--sitemap`. |
| `--sitemap <url>` | Fetch sitemap (nested indexes supported) and audit every URL. |
| `-c, --concurrency <n>` | Parallel Chrome workers for sitemap scans. Default: half CPU cores, max 4. |
| `-V, --version` | Print the CLI version and exit. |
| `-h, --help` | Show usage, options, and examples. |

### Sitemap progress

```text
inaria: found 24 URLs — 4 parallel worker(s)

inaria  sitemap scan
[████████░░░░░░░░░░░░░░░░░░░░] 8/24 (33%)  elapsed 1m12s  eta 2m30s
ok 7  fail 1  running 3

running
  • https://example.com/contact
  • https://example.com/blog

recent
  ✓ https://example.com/about
  ✗ https://example.com/broken

inaria  done  23 ok  1 failed  3m45s
```

When stderr is not a TTY, each completed URL logs on its own line.

## Output

### Default (condensed)

Each audit returns a small JSON object:

- `url` — final audited URL
- `formFactor` — `desktop` or `mobile`
- `fetchTime` — ISO timestamp
- `scores` — category scores (0–100): performance, accessibility, best-practices, SEO
- `metrics` — core web vitals and related performance metrics
- `issues` — up to 25 failing audits, worst first, each with:
  - `description` — audit explanation
  - `failingElements` — DOM nodes (`label`, `selector`, `snippet`, `explanation`)
  - `resources` — URLs and savings for performance opportunities

```bash
npx inaria https://example.com | jq '.issues[0]'
```

```json
{
  "id": "color-contrast",
  "title": "Background and foreground colors do not have a sufficient contrast ratio.",
  "description": "Low-contrast text is difficult or impossible for many users to read.",
  "score": 0,
  "failingElements": [
    {
      "label": "span",
      "selector": "pre.astro-code.github-dark > code > span",
      "snippet": "<span style=\"color: rgb(227, 148, 220);\">",
      "explanation": "Fix any of the following:\n  Element has insufficient color contrast..."
    }
  ]
}
```

### Output modes

| Mode | Flag | Best for |
|------|------|----------|
| Default | — | Scores, metrics, top 25 issues. AI fix loops. |
| All issues | `--all-issues` | Every failing audit and element, still agent-shaped. |
| Full report | `--fullreport` | Full Lighthouse JSON (1–5+ MB). Debug and archival. |

### JSON formatting

| Target | Format |
|--------|--------|
| stdout | Compact JSON (default) |
| `-o, --output <file>` | Pretty JSON (default) |
| `--compact` | Force compact JSON |
| `--pretty` | Force pretty JSON |

LLMs parse JSON reliably. Inaria's main token win is `condense()`, not the serialization format.

## Using with AI

Inaria is built to be run by a coding agent, not pasted into chat manually.

See **[AGENTS.md](AGENTS.md)** for a copy-paste tool definition (Cursor rules, `AGENTS.md` in your repo, etc.).

### Example prompt

```text
Run Inaria against https://localhost:4321 for both desktop and mobile:

  npx inaria https://localhost:4321 --desktop --mobile

Use the JSON output to fix every failing audit you can in this codebase. For each
issue, use failingElements (selector, snippet, label) to find the matching
component or stylesheet.

After making changes, run Inaria again and confirm scores improved. Summarize
what you fixed and the before/after scores.
```

### Agent workflow

```bash
# 1. Audit
npx inaria http://localhost:3000 --desktop --mobile -o audit.json

# 2. Agent reads audit.json, edits source files

# 3. Verify
npx inaria http://localhost:3000 --desktop --mobile
```

## Alternatives

| Tool | Best for |
|------|----------|
| **Inaria** | Small JSON for AI agents — selectors, snippets, fix loops |
| `npx lighthouse` | Full JSON/HTML reports, every audit, official defaults |
| `@lhci/cli` | PR checks, score budgets, historical reports |
| Unlighthouse | Whole-site scans with HTML UI |
| PageSpeed Insights API | Lab + field data from Google's infra, no local Chrome |

None of these optimize for small AI-consumable JSON with `failingElements` the way Inaria does.

## Where it shines

- Local and staging URLs in agent-driven fix loops
- Sitemap sweeps piped into scripts that feed an LLM
- stdout/stderr contract that keeps JSON clean for pipes

## Install from source

```bash
git clone https://github.com/mharwooduk/Inaria.git
cd Inaria
npm install
npm link   # optional: global `inaria` command
```

## License

MIT — free to use, fork, modify, and redistribute. See [LICENSE](LICENSE).
