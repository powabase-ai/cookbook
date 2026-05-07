// Copies cookbook/recipes/<slug>/README.md → src/content/docs/recipes/<slug>/index.md
// and cookbook/recipes/<slug>/assets/ → src/content/docs/recipes/<slug>/assets/
//
// Run on every dev / build (see package.json `predev` / `prebuild`).
//
// Why a sync step instead of a direct import: Astro's content loader reads
// from src/content/, so we mirror the recipes there. Co-locating the
// markdown with assets/ in the same folder keeps relative `./assets/foo.png`
// references in the README working both on GitHub and on the rendered site.

import { readFile, writeFile, mkdir, cp, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = resolve(__dirname, "..", "..", "recipes");
const TARGET_DIR = resolve(__dirname, "..", "src", "content", "docs", "recipes");

async function main() {
  if (!existsSync(RECIPES_DIR)) {
    console.error(`Recipes directory not found: ${RECIPES_DIR}`);
    process.exit(1);
  }

  // Wipe target so removed recipes don't linger as orphan pages.
  if (existsSync(TARGET_DIR)) {
    await rm(TARGET_DIR, { recursive: true });
  }
  await mkdir(TARGET_DIR, { recursive: true });

  const entries = await readdir(RECIPES_DIR, { withFileTypes: true });
  let count = 0;

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    const srcRecipe = join(RECIPES_DIR, slug);
    const srcReadme = join(srcRecipe, "README.md");

    if (!existsSync(srcReadme)) {
      console.log(`  skip ${slug} (no README.md)`);
      continue;
    }

    const destDir = join(TARGET_DIR, slug);
    await mkdir(destDir, { recursive: true });

    const readmeContent = await readFile(srcReadme, "utf-8");
    await writeFile(join(destDir, "index.md"), readmeContent);
    console.log(`✓ ${slug}/index.md`);

    const srcAssets = join(srcRecipe, "assets");
    if (existsSync(srcAssets)) {
      const destAssets = join(destDir, "assets");
      await cp(srcAssets, destAssets, { recursive: true });
      console.log(`  → ${slug}/assets/`);
    }

    count++;
  }

  console.log(`\nSynced ${count} recipe(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
