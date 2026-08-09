/// <reference path="../markdown.d.ts" />

export * as BuiltinSkill from "./builtin"

import { Skill } from "@opencode-ai/schema/skill"
import customizeLianvorContent from "./builtin/customize-lianvor.md" with { type: "text" }
import { AbsolutePath } from "../schema"

export const all = [
  Skill.Info.make({
    name: "customize-lianvor",
    description:
      "Use ONLY when the user is configuring Lianvor Runtime, including its compatibility config, agents, commands, skills, plugins, MCP servers, themes, or permission rules. Do not use for ordinary application code or unrelated projects.",
    location: AbsolutePath.make("/builtin/customize-lianvor.md"),
    content: customizeLianvorContent,
  }),
] as const

export const isName = (name: string) => all.some((skill) => skill.name === name)

export const is = (skill: { readonly name: string; readonly location: string }) =>
  all.some((builtin) => builtin.name === skill.name && builtin.location === skill.location)
