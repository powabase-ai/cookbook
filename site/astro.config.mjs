// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://cookbook.powabase.ai",
  integrations: [
    starlight({
      title: "Powabase Cookbook",
      description: "Goal-oriented recipes for building on Powabase.",
      logo: {
        src: "./src/assets/powabase-icon.svg",
        alt: "Powabase",
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/powabase-ai/cookbook",
        },
      ],
      sidebar: [
        {
          label: "Recipes",
          items: [
            {
              label: "01 — Multi-agent customer support team",
              slug: "recipes/01-multi-agent-support-team",
            },
            {
              label: "02 — HITL invoice extraction queue",
              slug: "recipes/02-hitl-invoice-extraction",
            },
          ],
        },
      ],
    }),
  ],
});
