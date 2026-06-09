<p align="center">
  <img src="assets/inaria-banner.png" alt="Inaria" width="600">
</p>

# Inaria

Condensed Lighthouse audits as small JSON — built for piping into AI tools.

## Prerequisites

- Node.js 22+
- Google Chrome or Chromium installed and discoverable on your system

## Install

```bash
npm install
npm link
```

After `npm link`, the `inaria` command is available globally.

## Command-line options

Run `inaria --help` for full usage. Options:

| Option | Description |
|--------|-------------|
| `[url]` | Page to audit (`http` or `https`). Omit when using `--sitemap`. |
| `--desktop` | Run a desktop Lighthouse audit. **Default** when neither `--desktop` nor `--mobile` is set. |
| `--mobile` | Run a mobile Lighthouse audit. Combine with `--desktop` to run both. |
| `--sitemap <url>` | Fetch a sitemap (including nested sitemap indexes) and audit every listed URL. Replaces `[url]`. |
| `-c, --concurrency <n>` | Parallel Chrome workers for `--sitemap` scans. Default: half your CPU cores, max 4. Higher values scan faster but use more memory. |
| `-o, --output <file>` | Write JSON to a file instead of stdout. Progress and errors still go to stderr. |
| `-h, --help` | Show usage, options, and examples. |

**Modes**

- **Single page:** `inaria <url> [options]` — one object, or a two-item array if both form factors are requested.
- **Sitemap:** `inaria --sitemap <sitemap-url> [options]` — summary object with a `pages` array (one entry per URL).

**Streams**

- **stdout** — audit JSON only (pipe-friendly).
- **stderr** — progress, status, and errors (not mixed into JSON output).

## Usage

```bash
# Desktop audit (default)
inaria https://example.com

# Mobile only
inaria https://example.com --mobile

# Both desktop and mobile
inaria https://example.com --desktop --mobile

# Write to file
inaria https://example.com -o report.json

# Scan every URL in a sitemap (shows live progress on stderr)
inaria --sitemap https://example.com/sitemap.xml --desktop --mobile -o sitemap-report.json

# Sitemap with 6 parallel workers
inaria --sitemap https://example.com/sitemap.xml -c 6 -o sitemap-report.json
```

### Sitemap scans

Pass `--sitemap` instead of a page URL. Inaria fetches the sitemap (including nested sitemap indexes), then audits URLs in parallel (default: half your CPU cores, max 4 Chrome workers). Use `-c` / `--concurrency` to tune.

Progress prints to stderr in real time:

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

When stderr is not a TTY (e.g. piped to a log file), each completed URL is logged on its own line instead.

Stdout (or `-o` file) receives a summary object:

```json
{
  "sitemap": "https://example.com/sitemap.xml",
  "total": 24,
  "scanned": 24,
  "pages": [
    {
      "url": "https://example.com/",
      "audits": { "scores": { "performance": 92 }, "issues": [] }
    }
  ]
}
```

If a single page fails, the scan continues and that page includes an `error` field instead of `audits`.

## Output

Each audit returns a small JSON object with:

- `url` — final audited URL
- `formFactor` — `desktop` or `mobile`
- `fetchTime` — ISO timestamp
- `scores` — category scores (0–100) for performance, accessibility, best-practices, and SEO
- `metrics` — core web vitals and related performance metrics
- `issues` — up to 25 failing audits, worst first, each including:
  - `description` — audit explanation text
  - `failingElements` — DOM nodes tied to the issue (`label`, `selector`, `snippet`, `explanation`)
  - `resources` — URLs and savings for performance opportunity audits

When both form factors are requested, output is a JSON array of two objects.

## Example

```bash
inaria https://example.com | jq '.issues[0]'
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
    },
    {
      "label": "pre.astro-code.github-dark",
      "selector": "pre.astro-code.github-dark",
      "snippet": "<pre class=\"astro-code github-dark\">"
    }
  ]
}
```

## Using with AI

Inaria is designed to be run by an AI coding agent, not just pasted into chat manually. Give the agent the tool definition below, then ask it to audit your site and fix what it finds.

### Presenting the tool to AI

Add this to your project's `AGENTS.md`, Cursor rules, or similar agent context:

```markdown
## Inaria (Lighthouse CLI)

`inaria` is a global CLI that runs condensed Lighthouse audits and prints small JSON to stdout.

**Prerequisites:** Node.js 22+, Chrome/Chromium installed, `npm link` run in the Inaria repo.

**Command:**
inaria <url> [--desktop] [--mobile] [-o <file>]
inaria --sitemap <sitemap-url> [--desktop] [--mobile] [-c <n>] [-o <file>]

**Defaults:** `--desktop` if no form factor flag is given.

**Output:** JSON with `scores`, `metrics`, and `issues`. Each issue may include
`failingElements` (label, selector, snippet, explanation) and `resources` (URLs, wasted bytes).

**Workflow:**
1. Run `inaria <url> --desktop --mobile` against the local or deployed URL.
2. Read `issues` — prioritize score 0 items and low category scores.
3. Use `failingElements.selector` / `snippet` to locate the source in the codebase.
4. Apply fixes in the repo.
5. Re-run `inaria` to confirm scores improved and issues are gone.
```

### Example prompt

Copy and adapt this when asking an AI agent to work on your site:

```text
Run Inaria against https://localhost:4321 (or our staging URL) for both desktop
and mobile:

  inaria https://localhost:4321 --desktop --mobile

Use the JSON output to fix every failing audit you can in this codebase. For each
issue, use failingElements (selector, snippet, label) to find the matching
component or stylesheet. Fix accessibility contrast issues, SEO gaps, and
performance opportunities listed under resources.

After making changes, run Inaria again and confirm scores went up and resolved
issues no longer appear. Summarize what you fixed and the before/after scores.
```

### Example agent workflow

```bash
# 1. Audit
inaria http://localhost:3000 --desktop --mobile -o audit.json

# 2. Agent reads audit.json, edits source files

# 3. Verify
inaria http://localhost:3000 --desktop --mobile
```

**Tips for agents:**

- Audit the URL the dev server actually serves (include port and `http` vs `https`).
- `failingElements.label` is often the element tag or visible text; `selector` is the CSS path Lighthouse used.
- Performance issues with `resources` point at specific scripts or images to optimize or defer.
- Run both form factors — mobile and desktop can surface different issues.
