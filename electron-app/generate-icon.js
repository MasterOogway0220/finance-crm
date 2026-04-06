// Generates assets/icon.ico from the Kesar Securities brand colors
// Run: node generate-icon.js
const { Jimp } = require('jimp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')
const fs = require('fs')
const path = require('path')

async function generate() {
  const size = 256
  // Jimp v1: create via fromBitmap
  const bitmap = {
    data: Buffer.alloc(size * size * 4, 255), // all white RGBA
    width: size,
    height: size,
  }
  const img = Jimp.fromBitmap(bitmap)

  // Red upward arrow background block (top-right quadrant)
  for (let y = 0; y < size * 0.55; y++) {
    for (let x = size * 0.45; x < size; x++) {
      img.setPixelColor(0xFFFFFFFF, x, y)
    }
  }

  // Draw a bold "K" shape in red (left side)
  const red   = 0xCC1111FF
  const blue  = 0x2255AAFF
  const black = 0x111111FF

  // Thick vertical bar for K (red)
  for (let y = 40; y < 180; y++) {
    for (let x = 30; x < 70; x++) {
      img.setPixelColor(red, x, y)
    }
  }
  // Upper arm of K (red)
  for (let i = 0; i < 80; i++) {
    const x = 70 + i
    const y = 40 + Math.round(i * 0.6)
    for (let t = -18; t < 18; t++) {
      img.setPixelColor(red, x, y + t)
    }
  }
  // Lower arm of K (red)
  for (let i = 0; i < 80; i++) {
    const x = 70 + i
    const y = 140 - Math.round(i * 0.6)
    for (let t = -18; t < 18; t++) {
      img.setPixelColor(red, x, y + t)
    }
  }

  // "e" block (black) - middle
  for (let y = 60; y < 160; y++) {
    for (let x = 155; x < 190; x++) {
      img.setPixelColor(black, x, y)
    }
  }
  // e horizontal cut
  for (let y = 100; y < 120; y++) {
    for (let x = 155; x < 190; x++) {
      img.setPixelColor(0xFFFFFFFF, x, y)
    }
  }

  // "S" in blue
  const sx = 195, sy = 55
  for (let y = sy; y < sy + 110; y++) {
    for (let x = sx; x < sx + 42; x++) {
      img.setPixelColor(blue, x, y)
    }
  }
  // S cutouts to make it look like S
  for (let y = sy + 5; y < sy + 45; y++) {
    for (let x = sx + 5; x < sx + 37; x++) {
      img.setPixelColor(0xFFFFFFFF, x, y)
    }
  }
  for (let y = sy + 65; y < sy + 105; y++) {
    for (let x = sx + 5; x < sx + 37; x++) {
      img.setPixelColor(0xFFFFFFFF, x, y)
    }
  }
  // S middle connector
  for (let y = sy + 45; y < sy + 65; y++) {
    for (let x = sx; x < sx + 42; x++) {
      img.setPixelColor(blue, x, y)
    }
  }

  // Red upward arrow (top right)
  for (let i = 0; i < 60; i++) {
    const ax = 185 + i
    const ay = 170 - i
    for (let t = -10; t < 10; t++) {
      if (ax + t >= 0 && ax + t < size && ay >= 0 && ay < size) {
        img.setPixelColor(red, ax + t, ay)
      }
    }
  }
  // Arrowhead
  for (let i = 0; i < 30; i++) {
    for (let j = -i; j <= i; j++) {
      const ax = 240 - i
      const ay = 115 + j
      if (ax >= 0 && ax < size && ay >= 0 && ay < size) {
        img.setPixelColor(red, ax, ay)
      }
    }
  }

  // Bottom line (black underline)
  for (let x = 30; x < 230; x++) {
    for (let y = 188; y < 196; y++) {
      img.setPixelColor(black, x, y)
    }
  }

  // "Securities Pvt. Ltd." text area (dark bar at bottom)
  for (let y = 200; y < 240; y++) {
    for (let x = 20; x < 236; x++) {
      img.setPixelColor(0x222222FF, x, y)
    }
  }

  const pngPath = path.join(__dirname, 'assets', 'icon-temp.png')
  const icoPath = path.join(__dirname, 'assets', 'icon.ico')

  await img.write(pngPath)
  console.log('PNG generated:', pngPath)

  const buf = await pngToIco(pngPath)
  fs.writeFileSync(icoPath, buf)
  fs.unlinkSync(pngPath)
  console.log('Icon saved to:', icoPath)
}

generate().catch(console.error)
