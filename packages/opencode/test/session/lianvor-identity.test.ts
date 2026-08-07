import { expect, test } from "bun:test"
import { SystemPrompt } from "../../src/session/system"

const credentialNames = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_BASE_URL",
  "DEEPSEEK_BASE_URL",
] as const

const familyModelIds = {
  default: "deepseek-chat",
  anthropic: "claude-sonnet-4",
  beast: "gpt-4o",
  gemini: "gemini-2.5-pro",
  gpt: "gpt-5",
  kimi: "kimi-k2",
  codex: "gpt-5-codex",
  trinity: "trinity-large",
} as const

const familyMarkers = {
  default: "interactive CLI tool",
  anthropic: "TodoWrite",
  beast: "keep going",
  gemini: "Core Mandates",
  gpt: "deeply pragmatic",
  kimi: "general AI agent",
  codex: "Editing constraints",
  trinity: "Tone and style",
} as const

type Family = keyof typeof familyModelIds

interface CorpusCase {
  id: string
  seedId: string
  providerPromptFamily: Family
  expectedCallsByStage: { phase_1_fork_direct: string }
  streamChunks: string[]
}

const sha256 = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex")

test("captures all frozen identity cases through the actual provider selector", async () => {
  const corpusPath = process.env["LIANVOR_IDENTITY_CORPUS"]
  const outputPath = process.env["LIANVOR_IDENTITY_OUTPUT"]
  expect(corpusPath).toBeTruthy()
  expect(outputPath).toBeTruthy()
  expect(process.env["LIANVOR_NETWORK_DISABLED"]).toBe("1")

  const credentialPreflight = Object.fromEntries(credentialNames.map((name) => [name, !process.env[name]])) as Record<
    (typeof credentialNames)[number],
    boolean
  >
  expect(Object.values(credentialPreflight).every(Boolean)).toBeTrue()

  const networkAttempts: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL) => {
    networkAttempts.push(String(input))
    throw new Error(`external network request blocked by Layer A harness: ${String(input)}`)
  }) as unknown as typeof fetch

  try {
    const corpusText = await Bun.file(corpusPath!).text()
    const cases = corpusText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as CorpusCase)
    const rows: string[] = []

    for (const item of cases) {
      const modelId = familyModelIds[item.providerPromptFamily]
      const selected = SystemPrompt.provider({
        providerID: "capture-mock",
        api: { id: modelId },
      } as Parameters<typeof SystemPrompt.provider>[0])
      const assembledPrompt = selected.join("\n")
      const assertions = {
        actualAssemblyInvoked: true,
        networkDisabled: process.env["LIANVOR_NETWORK_DISABLED"] === "1",
        credentialsCleared: Object.values(credentialPreflight).every(Boolean),
        selectorFamilyMatched: selected.length === 2 && selected[1]!.includes(familyMarkers[item.providerPromptFamily]),
        identityExactlyOnce: assembledPrompt.split("You are Lianvor, the product assistant.").length === 2,
        forbiddenFirstPersonAbsent: !/You are (?:OpenCode|opencode)/.test(assembledPrompt),
        endUserHelpBrandingAbsent: !/(?:opencode\.ai|github\.com\/anomalyco\/opencode|\/help)/i.test(assembledPrompt),
        providerGuidanceRetained: assembledPrompt.includes(familyMarkers[item.providerPromptFamily]),
        technicalLineagePolicyRetained:
          assembledPrompt.includes("source, version, copyright, and license") && assembledPrompt.includes("OpenCode"),
        stageExpectationRecorded: ["model_required", "not_applicable"].includes(
          item.expectedCallsByStage.phase_1_fork_direct,
        ),
        streamChunkReplayMetadataPreserved: Array.isArray(item.streamChunks) && item.streamChunks.join("").length > 0,
        noExternalRequestAttempted: networkAttempts.length === 0,
      }
      const failureCodes = Object.entries(assertions)
        .filter(([, passed]) => !passed)
        .map(([name]) => name)

      rows.push(
        JSON.stringify({
          caseId: item.id,
          seedId: item.seedId,
          providerPromptFamily: item.providerPromptFamily,
          selectedTemplate: item.providerPromptFamily,
          selectorReturn: {
            providerID: "capture-mock",
            modelID: modelId,
            promptCount: selected.length,
            promptDigests: selected.map(sha256),
          },
          assembledPrompt,
          assembledPromptDigest: sha256(assembledPrompt),
          captureMockTransport: {
            kind: "in_process_system_prompt_capture",
            providerCalls: 0,
            networkAttempts: [...networkAttempts],
          },
          preflight: {
            networkDisabled: true,
            credentialNamesChecked: [...credentialNames],
            allCredentialsCleared: true,
          },
          assertionResults: assertions,
          status: failureCodes.length === 0 ? "passed" : "failed",
          failureCodes,
        }),
      )
    }

    expect(cases).toHaveLength(672)
    expect(new Set(cases.map((item) => item.id)).size).toBe(672)
    expect(networkAttempts).toEqual([])
    await Bun.write(outputPath!, `${rows.join("\n")}\n`)
  } finally {
    globalThis.fetch = originalFetch
  }
})
