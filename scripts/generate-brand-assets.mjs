// Run with Node after npm ci. Sharp is also used by the installed Next.js image pipeline.
import { readFile, writeFile, copyFile } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("public/brand/mortgagementor.svg", root));
for (const size of [120, 512, 1024]) {
  await sharp(source).resize(size, size).png().toFile(
    new URL(`public/brand/mortgagementor-${size}.png`, root).pathname,
  );
}
await copyFile(new URL("public/brand/mortgagementor.svg", root), new URL("app/icon.svg", root));
await sharp(source).resize(180, 180).flatten({ background: "#102f40" }).png()
  .toFile(new URL("app/apple-icon.png", root).pathname);

// ICO directory followed by PNG payloads, supported by modern browsers/Windows.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL("app/favicon.ico", root), Buffer.concat([header, ...images]));
