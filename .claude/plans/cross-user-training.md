# Cross-User Agent Training (Future)

## Idea
Build on the agent feedback layer to create a shared, community-driven ruleset that teaches agents better patterns. Every hall-pass user benefits from the collective wisdom of the community.

## Possible directions

### 1. Community rule contributions
- Ship hall-pass with a seed set of feedback rules
- Users can submit new rules via PRs
- Rules get reviewed, tested, and merged into the default set
- Each release ships with a better ruleset

### 2. Telemetry-driven pattern discovery
- Opt-in anonymous telemetry: what commands get blocked by feedback rules, what the agent tries instead
- Identify common anti-patterns across users
- Use data to prioritize new rules

### 3. User-extensible rules
- Config in `~/.config/hall-pass/rules.toml` for custom feedback rules
- Teams can share rule configs for their stack
- Project-level `.hall-pass-rules.toml` for repo-specific patterns

### 4. Rule sharing format
- Standardized rule format that can be published/consumed
- npm packages? GitHub repos? Something simpler?
- Versioned rulesets that users can pin

## Open questions
- How to balance "opinionated defaults" vs "user choice"?
- Should rules be purely blocking, or also advisory (warn but allow)?
- How to handle false positives gracefully?
- Privacy implications of any telemetry approach?
- Could this eventually feed back into model training?

## Prerequisites
- Agent feedback layer (the current work) must ship first
- Need real-world usage data before designing the sharing mechanism
