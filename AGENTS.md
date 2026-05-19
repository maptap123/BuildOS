<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## GitHub Commit Workflow

Use the GitHub plugin for all repository commits and pushes.

Do not rely on local `git push` or GitHub CLI authentication in this workspace. The local Codex sandbox may block writes to `.git` and may not have GitHub credentials available.

When the user asks to commit or push:
1. Inspect local changes.
2. Confirm no secrets or generated artifacts are included.
3. Use the GitHub plugin to create or update files in `maptap123/BuildOS`.
4. Create the commit through the GitHub plugin.
5. Report the GitHub commit URL.

Repository: https://github.com/maptap123/BuildOS

Never ask the user to run terminal commands for GitHub pushing unless the GitHub plugin is unavailable.
