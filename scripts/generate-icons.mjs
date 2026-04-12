/**
 * Generates PWA icons from an inline SVG using sharp.
 * Run with: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const iconsDir = join(publicDir, "icons");

mkdirSync(iconsDir, { recursive: true });

// oklch(0.62 0.18 42) ≈ #D97706 / #C96B1A  — the app's primary orange
// We'll use a warm orange that matches the screenshots closely.
const PRIMARY = "#C9651A";
const PRIMARY_FG = "#FFFFFF";

/**
 * SVG for the app icon: orange rounded-rect background + chef hat.
 * The chef hat is derived from the Lucide "ChefHat" icon (MIT).
 */
function makeSvg(size) {
  const r = Math.round(size * 0.22); // corner radius
  // Chef hat path scaled to fit inside the icon at 70% of size
  const pad = size * 0.15;
  const iconSize = size - pad * 2;
  const scale = iconSize / 24;
  const tx = pad;
  const ty = pad;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${PRIMARY}"/>
  <!-- ChefHat icon (Lucide, scaled) -->
  <g transform="translate(${tx},${ty}) scale(${scale})" stroke="${PRIMARY_FG}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.589c.411.197.727.584.727 1.041V20a1 1 0 0 0 1 1Z"/>
    <path d="M3 21h18"/>
    <path d="M7 21v-2"/>
    <path d="M17 21v-2"/>
    <path d="M12 21v-2"/>
  </g>
</svg>`;
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const svg = Buffer.from(makeSvg(size));
  const outPath = join(iconsDir, `icon-${size}x${size}.png`);
  await sharp(svg).png().toFile(outPath);
  console.log(`✓ ${outPath}`);
}

// Also write favicon.ico (32px) and apple-touch-icon (180px)
await sharp(Buffer.from(makeSvg(32))).png().toFile(join(publicDir, "favicon-32.png"));
await sharp(Buffer.from(makeSvg(180))).png().toFile(join(publicDir, "apple-touch-icon.png"));
console.log("✓ favicon-32.png");
console.log("✓ apple-touch-icon.png");
console.log("\nAll icons generated.");
