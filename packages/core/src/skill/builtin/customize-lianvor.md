# Customizing Lianvor Runtime

Lianvor Runtime validates its configuration strictly. Use the current schema
and the compatibility paths below instead of guessing field names or shapes.

## Configuration source of truth

The current runtime remains wire- and configuration-compatible with its pinned
upstream baseline. Until a separately versioned Lianvor configuration migration
is published, its compatibility schema is:

**<https://opencode.ai/config.json>**

The compatibility configuration filename is `opencode.json` or
`opencode.jsonc`. These are technical identifiers, not the product identity.
When writing one, include:

```json
{
  "$schema": "https://opencode.ai/config.json"
}
```

If an option is not documented here, read the schema before editing. An invalid
field can prevent Lianvor Runtime from starting.

## Applying changes

Configuration is loaded at startup. After changing configuration, agents,
commands, Skills, plugins, or MCP definitions, tell the user to restart Lianvor
Runtime. Do not claim that a running process has hot-reloaded these files.

## Compatibility paths

| Scope            | Current path                                                        |
| ---------------- | ------------------------------------------------------------------- |
| Project config   | `./opencode.json`, `./opencode.jsonc`, or `.opencode/opencode.json` |
| Global config    | `~/.config/opencode/opencode.json`                                  |
| Project agents   | `.opencode/agent/<name>.md` or `.opencode/agents/<name>.md`         |
| Global agents    | `~/.config/opencode/agent(s)/<name>.md`                             |
| Project commands | `.opencode/command/<name>.md` or `.opencode/commands/<name>.md`     |
| Project Skills   | `.opencode/skill(s)/<name>/SKILL.md`                                |
| Global Skills    | `~/.config/opencode/skill(s)/<name>/SKILL.md`                       |

Project configuration overrides global configuration. Unknown top-level fields
are rejected.

## Common configuration shape

Every field is optional. Confirm exact fields against the schema.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "provider/model-id",
  "small_model": "provider/model-id",
  "default_agent": "agent-name",
  "instructions": ["AGENTS.md", "docs/style.md"],
  "skills": {
    "paths": [".opencode/skills"],
    "urls": ["https://example.com/.well-known/skills/"]
  },
  "agent": {
    "reviewer": {
      "description": "Reviews changes without editing files.",
      "mode": "subagent",
      "permission": { "edit": "deny", "bash": "ask" }
    }
  },
  "mcp": {
    "example": {
      "type": "local",
      "command": ["example-mcp"],
      "enabled": true
    }
  },
  "permission": {
    "edit": "ask",
    "bash": { "git status": "allow", "*": "ask" }
  }
}
```

Important shape rules:

- Model IDs include a provider prefix.
- `skills` is an object containing `paths` and/or `urls`.
- `agent` and `command` are objects keyed by name.
- A local MCP `command` is an array of strings.
- Loading a Skill does not grant its suggested tools. Tool permissions still
  control writes, commands, network access, MCP, and other side effects.

## Skills

A Skill lives in its own directory and uses an exact `SKILL.md` filename:

```text
.opencode/skills/my-skill/SKILL.md
```

```markdown
---
name: my-skill
description: Use when the request matches this workflow.
---

# My Skill

Instructions, examples, and relative references.
```

Use lowercase hyphen-separated names. Make the description state both what the
Skill does and when it should be selected. Relative references resolve from the
Skill directory.

## Agents

For non-trivial agents, prefer a Markdown file:

```markdown
---
description: Reviews changes without editing files.
mode: subagent
model: provider/model-id
permission:
  edit: deny
  bash: ask
---

Review correctness, tests, and operational risk.
```

Keep permissions narrow. A Skill may explain how to perform an operation, but
the operation must still pass the configured tool permission.

## Validation checklist

Before finishing a configuration change:

1. Validate the file against the current schema.
2. Preserve compatibility filenames and directory spelling.
3. Do not write secrets into examples, logs, or committed files.
4. Confirm that write, command, network, and MCP permissions remain intentional.
5. Restart Lianvor Runtime and verify startup plus one read-only session.
