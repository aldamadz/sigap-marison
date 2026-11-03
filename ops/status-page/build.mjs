import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const source = resolve(import.meta.dirname, 'page.mjs');
const logo = resolve(root, 'public/logo-marison.png');
const output = resolve(import.meta.dirname, 'dist/page.mjs');

const template = await readFile(source, 'utf8');
const terms = await readFile(resolve(import.meta.dirname, 'terms.mjs'), 'utf8');
const privacy = await readFile(resolve(import.meta.dirname, 'privacy.mjs'), 'utf8');
const landing = await readFile(resolve(import.meta.dirname, 'landing-links.mjs'), 'utf8');
const image = await readFile(logo);
if (image.length > 100_000) throw new Error('Status page logo exceeds 100 KB');
const compiled = template.replace('__LOGO_BASE64__', image.toString('base64'))
  .replace("import { TERMS } from './terms.mjs';", terms.replace(/^export /gm, ''))
  .replace("import { PRIVACY } from './privacy.mjs';", privacy.replace(/^export /gm, ''))
  .replace("import { LANDING_LINKS_CSS, LANDING_LINKS_JS, enhanceLanding, renderLandingPreview } from './landing-links.mjs';", landing.replace(/^export /gm, ''));
if (compiled === template) throw new Error('Logo placeholder not found');
await mkdir(resolve(import.meta.dirname, 'dist'), { recursive: true });
await writeFile(output, compiled);
process.stdout.write(`Built ${output} (${Buffer.byteLength(compiled)} bytes)\n`);
