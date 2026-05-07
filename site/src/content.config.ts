import { defineCollection, z } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Extend Starlight's docsSchema so recipe READMEs (synced from
// cookbook/recipes/<slug>/README.md) pass validation. The recipe
// frontmatter carries cookbook-specific fields beyond Starlight's defaults.
export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        features: z.array(z.string()).optional(),
        time: z.string().optional(),
        difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        stack: z.array(z.string()).optional(),
      }),
    }),
  }),
};
