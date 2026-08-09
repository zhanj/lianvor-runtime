import { describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { BuiltinSkill } from "@opencode-ai/core/skill/builtin"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { testEffect } from "../lib/effect"

const model = (id: string) =>
  ({
    providerID: "test-provider",
    api: { id },
  }) as Parameters<typeof SystemPrompt.provider>[0]

const identity = "You are Lianvor, the product assistant."

const skills: Skill.Info[] = [
  ...BuiltinSkill.all,
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: (agent) =>
            Effect.succeed(
              agent
                ? skills.filter(
                    (skill) =>
                      BuiltinSkill.is(skill) ||
                      Permission.evaluate("skill", skill.name, agent.permission).action !== "deny",
                  )
                : skills,
            ),
        }),
      ),
    ],
  ]),
)

describe("session.system", () => {
  describe("provider identity", () => {
    const cases = [
      ["default", "deepseek-chat", "interactive CLI tool"],
      ["anthropic", "claude-sonnet-4", "TodoWrite"],
      ["beast", "gpt-4o", "keep going"],
      ["gemini", "gemini-2.5-pro", "Core Mandates"],
      ["gpt", "gpt-5", "deeply pragmatic"],
      ["kimi", "kimi-k2", "general AI agent"],
      ["codex", "gpt-5-codex", "Editing constraints"],
      ["trinity", "trinity-large", "Tone and style"],
    ] as const

    for (const [family, id, retainedGuidance] of cases) {
      test(`${family} keeps selection and carries Lianvor identity once`, () => {
        const prompts = SystemPrompt.provider(model(id))
        const assembled = prompts.join("\n")

        expect(prompts).toHaveLength(2)
        expect(assembled.split(identity)).toHaveLength(2)
        expect(assembled).toContain(retainedGuidance)
        expect(assembled).not.toMatch(/You are (?:OpenCode|opencode)/)
        expect(assembled).not.toMatch(/(?:opencode\.ai|github\.com\/anomalyco\/opencode|\/help)/i)
      })
    }

    test("preserves arbitrary model fallback selection", () => {
      expect(SystemPrompt.provider(model("vendor-model"))[1]).toContain("interactive CLI tool")
      expect(SystemPrompt.provider(model("vendor-gpt-experimental"))[1]).toContain("deeply pragmatic")
    })

    test("preserves truthful technical lineage in the identity policy", () => {
      const assembled = SystemPrompt.provider(model("deepseek-chat")).join("\n")
      expect(assembled).toContain("source, version, copyright, and license")
      expect(assembled).toContain("OpenCode")
    })
  })

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("skills output retains built-ins when external skills are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.skills({
        ...build,
        permission: Permission.fromConfig({ skill: "deny" }),
      })

      expect(output).toContain("<name>customize-lianvor</name>")
      expect(output).not.toContain("<name>alpha-skill</name>")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )
})
