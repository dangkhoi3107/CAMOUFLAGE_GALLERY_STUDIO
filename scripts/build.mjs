import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const inputDir = path.join(root, 'INPUT');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const distGalleryDir = path.join(distDir, 'gallery');

// Priority order used only when a folder has more than one file for the same
// role (e.g. output.png AND output.jpg) — first match wins, deterministically.
const IMAGE_EXTENSION_PRIORITY = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
const IMAGE_EXTENSION_SET = new Set(IMAGE_EXTENSION_PRIORITY);
const ROLES = ['output', 'object', 'background'];

function isPresent(value) {
  return value !== undefined && value !== null && value !== '';
}

// Reads a field preferring meta.job.<key> (the specific generation job) over
// the shared top-level batch config, since job.* holds the per-card values.
function pickField(meta, keys) {
  if (!meta) return undefined;
  if (meta.job && typeof meta.job === 'object') {
    for (const key of keys) {
      if (isPresent(meta.job[key])) return meta.job[key];
    }
  }
  for (const key of keys) {
    if (isPresent(meta[key])) return meta[key];
  }
  return undefined;
}

function capitalize(value) {
  const str = String(value);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function findRoleFile(folderName, files, role) {
  const candidates = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSION_SET.has(ext)) return false;
    const stem = path.basename(file, path.extname(file)).toLowerCase();
    return stem === role;
  });

  if (candidates.length === 0) return null;

  if (candidates.length > 1) {
    candidates.sort((a, b) => {
      const rank = (file) => IMAGE_EXTENSION_PRIORITY.indexOf(path.extname(file).toLowerCase());
      return rank(a) - rank(b);
    });
    console.warn(
      `[WARN] INPUT/${folderName}: multiple "${role}" files found (${candidates.join(', ')}) — using "${candidates[0]}" by format priority (png > jpg > jpeg > webp > avif)`
    );
  }

  return candidates[0];
}

// Folder names follow "<group>" or "<group>_<variation>" (e.g. "2", "2_002").
// The suffix is the variation number; a bare group folder is variation 1.
function parseFolderName(folderName) {
  const match = folderName.match(/^(\d+)(?:_(\d+))?$/);
  if (!match) return { group: folderName, variation: 1, matched: false };
  return { group: match[1], variation: match[2] ? Number(match[2]) : 1, matched: true };
}

async function readMeta(folderName, folderPath) {
  const metaPath = path.join(folderPath, 'meta.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[WARN] INPUT/${folderName}: missing meta.json — using fallback title/description`);
    } else {
      console.warn(`[WARN] INPUT/${folderName}: invalid meta.json (${error.message}) — using fallback title/description`);
    }
    return null;
  }
}

function variationLabel(variation) {
  return `Variation ${String(variation).padStart(2, '0')}`;
}

function buildFallbackTitle(folderName, animal, variation, matched) {
  if (animal) return `${capitalize(animal)} Camouflage · ${variationLabel(variation)}`;
  if (matched && variation > 1) return `Camouflage Variation · ${folderName}`;
  return `Camouflage Study · Card ${folderName}`;
}

function withIndefiniteArticle(word) {
  return /^[aeiou]/i.test(word) ? `An ${word}` : `A ${word}`;
}

function buildFallbackDescription(animal) {
  const subject = animal ? withIndefiniteArticle(animal) : 'A subject';
  return `${subject} is subtly integrated into the background through latent-space blending and structural guidance, preserving the dominant scene texture while keeping the subject recognizable at closer inspection.`;
}

function buildFallbackTags(animal, maskMode, blendProfile) {
  return [animal, maskMode, blendProfile].filter(Boolean).map((tag) => String(tag).toLowerCase());
}

function buildTechnical(meta) {
  const technical = {};
  const animal = pickField(meta, ['animals', 'animal']);
  const seed = pickField(meta, ['seed']);
  const bgStrength = pickField(meta, ['bg_strength']);
  const guidanceScale = pickField(meta, ['guidance_scale']);
  const guidanceSub = pickField(meta, ['guidance_sub']);
  const guidanceBg = pickField(meta, ['guidance_bg']);
  const maskMode = pickField(meta, ['mask_mode']);
  const blendProfile = pickField(meta, ['blend_profile']);
  const controlScales = pickField(meta, ['control_scales']);

  if (isPresent(animal)) technical.animal = capitalize(animal);
  if (isPresent(seed)) technical.seed = seed;
  if (isPresent(bgStrength)) technical.backgroundStrength = bgStrength;
  if (isPresent(guidanceScale)) technical.guidanceScale = guidanceScale;
  if (isPresent(guidanceSub)) technical.subjectGuidance = guidanceSub;
  if (isPresent(guidanceBg)) technical.backgroundGuidance = guidanceBg;
  if (isPresent(maskMode)) technical.maskMode = maskMode;
  if (isPresent(blendProfile)) technical.blendProfile = blendProfile;
  if (Array.isArray(controlScales) && controlScales.length) technical.controlScales = controlScales;

  return technical;
}

async function buildManifest() {
  await fs.mkdir(inputDir, { recursive: true });
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const cards = [];

  for (const folderName of folders) {
    const folderPath = path.join(inputDir, folderName);
    const files = await fs.readdir(folderPath);

    const roleFiles = Object.fromEntries(ROLES.map((role) => [role, findRoleFile(folderName, files, role)]));
    const missingRoles = ROLES.filter((role) => !roleFiles[role]);

    if (missingRoles.length) {
      console.warn(`[WARN] Skipped INPUT/${folderName}: missing ${missingRoles.join(', ')} image`);
      continue;
    }

    const meta = await readMeta(folderName, folderPath);
    const { group, variation, matched } = parseFolderName(folderName);
    const animal = pickField(meta, ['animals', 'animal']);
    const maskMode = pickField(meta, ['mask_mode']);
    const blendProfile = pickField(meta, ['blend_profile']);
    const animalLower = isPresent(animal) ? String(animal).toLowerCase() : null;

    const title = meta && typeof meta.title === 'string' && meta.title.trim()
      ? meta.title.trim()
      : buildFallbackTitle(folderName, animalLower, variation, matched);

    const description = meta && typeof meta.description === 'string' && meta.description.trim()
      ? meta.description.trim()
      : buildFallbackDescription(animalLower);

    const tags = meta && Array.isArray(meta.tags) && meta.tags.length
      ? meta.tags
      : buildFallbackTags(animalLower, maskMode, blendProfile);

    const destFolder = path.join(distGalleryDir, folderName);
    await fs.mkdir(destFolder, { recursive: true });
    await Promise.all(
      ROLES.map((role) => fs.copyFile(path.join(folderPath, roleFiles[role]), path.join(destFolder, roleFiles[role])))
    );

    cards.push({
      id: folderName,
      folder: folderName,
      group,
      variation,
      animal: animalLower,
      title,
      description,
      tags: tags.slice(0, 8),
      featured: Boolean(meta && meta.featured),
      images: {
        output: `/gallery/${encodeURIComponent(folderName)}/${encodeURIComponent(roleFiles.output)}`,
        object: `/gallery/${encodeURIComponent(folderName)}/${encodeURIComponent(roleFiles.object)}`,
        background: `/gallery/${encodeURIComponent(folderName)}/${encodeURIComponent(roleFiles.background)}`
      },
      technical: buildTechnical(meta)
    });
  }

  const totalSpecies = new Set(cards.map((card) => card.animal).filter(Boolean)).size;
  const totalGroups = new Set(cards.map((card) => card.group)).size;

  return {
    generatedAt: new Date().toISOString(),
    scannedFolders: folders.length,
    totalCards: cards.length,
    totalSpecies,
    totalGroups,
    cards
  };
}

async function copyExtraPublicAssets() {
  // Anything under public/ other than "gallery" (a legacy demo source) is
  // copied through as-is, e.g. a favicon or robots.txt added later.
  let entries;
  try {
    entries = await fs.readdir(publicDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    if (entry.name === 'gallery') continue;
    await fs.cp(path.join(publicDir, entry.name), path.join(distDir, entry.name), { recursive: true });
  }
}

async function main() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.mkdir(distGalleryDir, { recursive: true });

  for (const file of ['index.html', 'styles.css', 'app.js', 'qrcode.min.js']) {
    await fs.copyFile(path.join(root, file), path.join(distDir, file));
  }

  await copyExtraPublicAssets();

  const manifest = await buildManifest();
  await fs.writeFile(path.join(distGalleryDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Scanned ${manifest.scannedFolders} folder(s) in INPUT/.`);
  console.log(`Built ${manifest.totalCards} gallery card(s) into dist/ (${manifest.totalSpecies} species, ${manifest.totalGroups} groups).`);
  const skipped = manifest.scannedFolders - manifest.totalCards;
  if (skipped > 0) {
    console.log(`Skipped ${skipped} folder(s) — see warnings above.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
