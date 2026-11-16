---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the local copy of the guidelines in `references/command.md` (vendored from https://github.com/vercel-labs/web-interface-guidelines, MIT License). If that file is missing, fetch a fresh copy from:
   `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
2. Read the specified files (or prompt the user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Usage

When a user provides a file or pattern argument:
1. Load the guidelines as described above
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files are specified, ask the user which files to review.

The original upstream skill always fetched the live URL. This copy prefers the vendored file so Cursor, Codex and Gemini work offline and stay on a reviewed snapshot. Prepared by Grok Bot.
