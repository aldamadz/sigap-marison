import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const diagramDirectory = path.resolve("docs/diagrams");
const outputDirectory = path.join(diagramDirectory, "spreadsheet");
const diagrams = ["workflow-permohonan-aset", "workflow-permohonan-unit"];

await mkdir(outputDirectory, { recursive: true });

for (const diagram of diagrams) {
  const input = path.join(diagramDirectory, `${diagram}.full.png`);
  const compactOutput = path.join(diagramDirectory, `${diagram}.png`);

  await sharp(input)
    .resize({ height: 4096, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(compactOutput);

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowAlpha = (row) => {
    let total = 0;
    const rowStart = row * info.width * info.channels;

    for (let x = 0; x < info.width; x += 4) {
      total += data[rowStart + x * info.channels + 3];
    }

    return total;
  };

  const findQuietRow = (target) => {
    const radius = Math.min(600, Math.floor(info.height / 10));
    const start = Math.max(1, target - radius);
    const end = Math.min(info.height - 1, target + radius);
    let bestRow = target;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let row = start; row <= end; row += 2) {
      const score = rowAlpha(row);
      if (score < bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }

    return bestRow;
  };

  const firstCut = findQuietRow(Math.round(info.height / 3));
  const secondCut = findQuietRow(Math.round((info.height * 2) / 3));
  const boundaries = [0, firstCut, secondCut, info.height];

  for (let index = 0; index < 3; index += 1) {
    const top = boundaries[index];
    const height = boundaries[index + 1] - top;
    const output = path.join(
      outputDirectory,
      `${diagram}-${String(index + 1).padStart(2, "0")}.png`,
    );

    const segment = await sharp(input)
      .extract({ left: 0, top, width: info.width, height })
      .png()
      .toBuffer();

    await sharp(segment)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: 48,
        right: 48,
        bottom: 48,
        left: 48,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(output);
  }

  await rm(input);
}
