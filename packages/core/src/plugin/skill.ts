export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { SkillV2 } from "../skill"
import { BuiltinSkill } from "../skill/builtin"

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      for (const skill of BuiltinSkill.all)
        draft.source(
          SkillV2.EmbeddedSource.make({
            type: "embedded",
            skill,
          }),
        )
    })
  }),
})
