## Checks

Run `vp run verify` to check your work. CI and the pre-push hook run the same script, so new checks go in it.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on this repo via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
