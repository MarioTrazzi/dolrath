#!/usr/bin/env node

/**
 * Uploads SVG placeholder assets from `cloudinary-test-assets/` into Cloudinary public IDs.
 *
 * Signed mode (recommended):
 *   - Set `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`
 *
 * Unsigned mode (if you don't want to use secrets locally):
 *   - Set `CLOUDINARY_CLOUD_NAME=<cloud_name>`
 *   - Set `CLOUDINARY_UPLOAD_PRESET=<unsigned_upload_preset_name>`
 *   - The preset must allow specifying `public_id` (disallow_public_id=false)
 */

const fs = require('fs');
const path = require('path');

// Load local env (gitignored) so we don't need to pass secrets via CLI.
// This is safe as long as you do NOT commit `.env`.
try {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch {
  // dotenv is optional; script also works with process env vars.
}

const cloudinary = require('cloudinary').v2;

const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'cloudinary-test-assets');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    overwrite: true,
    invalidate: false,
    tag: 'dolrath-test',
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-overwrite') args.overwrite = false;
    else if (arg === '--invalidate') args.invalidate = true;
    else if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
    else {
      console.error(`Unknown arg: ${arg}`);
      process.exit(2);
    }
  }

  return args;
}

function getAllSvgFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllSvgFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.svg')) {
      files.push(full);
    }
  }

  return files;
}

function fileToPublicId(filePath) {
  // `cloudinary-test-assets/items/sword.svg` -> `items/sword`
  const relative = path.relative(ASSETS_DIR, filePath);
  const withoutExt = relative.replace(/\.svg$/i, '');
  return withoutExt.split(path.sep).join('/');
}

function hasSignedConfig() {
  const cfg = cloudinary.config();
  return Boolean(cfg && cfg.cloud_name && cfg.api_key && cfg.api_secret);
}

async function uploadOne({ filePath, publicId, opts, mode }) {
  const uploadOptions = {
    public_id: publicId,
    resource_type: 'image',
    overwrite: opts.overwrite,
    invalidate: opts.invalidate,
    tags: [opts.tag],
  };

  if (opts.dryRun) {
    console.log(`[dry-run] ${filePath} -> ${publicId} (${mode})`);
    return;
  }

  if (mode === 'signed') {
    const res = await cloudinary.uploader.upload(filePath, uploadOptions);
    console.log(`uploaded ${publicId} -> ${res.secure_url}`);
    return;
  }

  if (mode === 'unsigned') {
    const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!preset) throw new Error('Missing CLOUDINARY_UPLOAD_PRESET for unsigned upload');

    const res = await cloudinary.uploader.unsigned_upload(filePath, preset, uploadOptions);
    console.log(`uploaded ${publicId} -> ${res.secure_url}`);
    return;
  }

  throw new Error(`Unknown upload mode: ${mode}`);
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`Assets folder not found: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const svgFiles = getAllSvgFiles(ASSETS_DIR);
  if (svgFiles.length === 0) {
    console.error(`No .svg files found under ${ASSETS_DIR}`);
    process.exit(1);
  }

  // Configure Cloudinary from env (cloudinary package reads CLOUDINARY_URL automatically)
  // but we also support setting cloud_name via CLOUDINARY_CLOUD_NAME / NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.
  if (!cloudinary.config().cloud_name) {
    const cloudNameFromEnv =
      process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (cloudNameFromEnv) {
      cloudinary.config({ cloud_name: cloudNameFromEnv });
    }
  }

  const mode = hasSignedConfig() ? 'signed' : (process.env.CLOUDINARY_UPLOAD_PRESET ? 'unsigned' : null);

  if (!mode) {
    console.error('Cloudinary is not configured. Use either:');
    console.error('- Signed: set CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>');
    console.error('- Unsigned: set CLOUDINARY_CLOUD_NAME=<cloud_name> and CLOUDINARY_UPLOAD_PRESET=<preset>');
    process.exit(1);
  }

  console.log(`Found ${svgFiles.length} SVG(s) in ${path.relative(ROOT, ASSETS_DIR)}`);
  console.log(`Upload mode: ${mode}${opts.dryRun ? ' (dry-run)' : ''}`);

  // Upload sequentially to keep output readable and avoid rate limit surprises.
  for (const filePath of svgFiles) {
    const publicId = fileToPublicId(filePath);
    await uploadOne({ filePath, publicId, opts, mode });
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
