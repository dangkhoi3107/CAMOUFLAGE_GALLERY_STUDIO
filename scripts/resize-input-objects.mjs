// One-off maintenance script: resize existing INPUT/<folder>/object.* and
// background.* images to match the 512x512 output size.
//
// - object.*: uses fit:'fill' (stretch, no crop) to match main.py's exact
//   `load_image(path, size=(cfg.width, cfg.height))` resize (PIL LANCZOS),
//   which keeps the whole subject visible rather than cropping part of it off.
// - background.*: uses fit:'cover' (crop, no distortion) since backgrounds are
//   generic scene photos where stretching looks worse than a small crop.
//
// Re-run any time newly-added INPUT/ folders bring in object/background images
// that aren't already 512x512.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const inputDir = path.join(root, 'INPUT');

const TARGET_WIDTH = 512;
const TARGET_HEIGHT = 512;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const ROLE_FIT = { object: 'fill', background: 'cover' };

function findRoleFile(files, role) {
  return files.find((file) => {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return false;
    const stem = path.basename(file, path.extname(file)).toLowerCase();
    return stem === role;
  });
}

async function main() {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name);

  let resized = 0;
  let alreadyOk = 0;
  let missing = 0;

  for (const folderName of folders) {
    const folderPath = path.join(inputDir, folderName);
    const files = await fs.readdir(folderPath);

    for (const role of Object.keys(ROLE_FIT)) {
      const roleFile = findRoleFile(files, role);

      if (!roleFile) {
        console.warn(`[WARN] INPUT/${folderName}: no ${role}.* file found, skipping`);
        missing += 1;
        continue;
      }

      const rolePath = path.join(folderPath, roleFile);
      // Read fully into memory first — resizing straight from/to the same path
      // via sharp's own file handles fails with EBUSY-style errors on Windows.
      const original = await fs.readFile(rolePath);
      const metadata = await sharp(original).metadata();

      if (metadata.width === TARGET_WIDTH && metadata.height === TARGET_HEIGHT) {
        alreadyOk += 1;
        continue;
      }

      const buffer = await sharp(original)
        .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: ROLE_FIT[role], kernel: sharp.kernel.lanczos3 })
        .toBuffer();
      await fs.writeFile(rolePath, buffer);

      console.log(`Resized INPUT/${folderName}/${roleFile}: ${metadata.width}x${metadata.height} -> ${TARGET_WIDTH}x${TARGET_HEIGHT} (${ROLE_FIT[role]})`);
      resized += 1;
    }
  }

  console.log(`\nDone. Resized ${resized}, already ${TARGET_WIDTH}x${TARGET_HEIGHT}: ${alreadyOk}, missing file: ${missing}.`);
  if (resized > 0) {
    console.log('Run "npm run build" (or "npm run dev") again to refresh dist/ with the updated images.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
