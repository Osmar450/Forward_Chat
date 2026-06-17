/* Genera los íconos de launcher Android (y los de la PWA) a partir del
 * ícono oficial de la app: icono/icono.ico. Si no existe, usa el PNG previo. */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SOURCE_ICO = path.join(__dirname, "..", "icono", "icono.ico");
const SOURCE_PNG = path.join(__dirname, "..", "public", "icons", "icon-512.png");
const PWA_ICONS = path.join(__dirname, "..", "public", "icons");
const RES = path.join(__dirname, "..", "android", "app", "src", "main", "res");

const DENSITIES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

/** Devuelve un buffer PNG cuadrado de la mejor resolución disponible. */
async function loadSource() {
  if (fs.existsSync(SOURCE_ICO)) {
    const { decodeIco } = await import("icojs");
    const buf = fs.readFileSync(SOURCE_ICO);
    const images = await decodeIco(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "image/png");
    if (images.length) {
      const best = images.reduce((a, b) => (b.width > a.width ? b : a));
      console.log(`Fuente: icono.ico (frame ${best.width}x${best.height})`);
      // Normalizar a 512px para que los resize hacia abajo sean nítidos
      return sharp(Buffer.from(best.buffer)).resize(512, 512, { fit: "cover" }).png().toBuffer();
    }
  }
  console.log("Fuente: public/icons/icon-512.png (no se encontró icono.ico)");
  return fs.readFileSync(SOURCE_PNG);
}

async function main() {
  const SOURCE = await loadSource();
  // Íconos de la PWA con la misma fuente (consistencia web/Android)
  fs.mkdirSync(PWA_ICONS, { recursive: true });
  fs.writeFileSync(path.join(PWA_ICONS, "icon-512.png"), await sharp(SOURCE).resize(512, 512).png().toBuffer());
  fs.writeFileSync(path.join(PWA_ICONS, "icon-192.png"), await sharp(SOURCE).resize(192, 192).png().toBuffer());

  for (const [folder, size] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    const square = await sharp(SOURCE).resize(size, size, { fit: "cover" }).png().toBuffer();
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), square);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), square);
    // Foreground adaptativo: ícono al 60% centrado sobre lienzo transparente
    const fgSize = Math.round(size * 2.25); // 108dp vs 48dp base
    const inner = Math.round(fgSize * 0.6);
    const fg = await sharp(SOURCE)
      .resize(inner, inner, { fit: "cover" })
      .extend({
        top: Math.round((fgSize - inner) / 2),
        bottom: Math.ceil((fgSize - inner) / 2),
        left: Math.round((fgSize - inner) / 2),
        right: Math.ceil((fgSize - inner) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(dir, "ic_launcher_foreground.png"), fg);
    console.log(`${folder}: ${size}px OK`);
  }
  console.log("Íconos Android generados.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
