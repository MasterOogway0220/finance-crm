// Run this once to convert your logo PNG to icon.ico
// Usage: node make-icon.js <path-to-logo.png>
const pngToIco = require('png-to-ico')
const fs = require('fs')
const path = require('path')

const input = process.argv[2]
if (!input) {
  console.error('Usage: node make-icon.js <path-to-logo.png>')
  process.exit(1)
}

pngToIco(input)
  .then(buf => {
    const out = path.join(__dirname, 'assets', 'icon.ico')
    fs.writeFileSync(out, buf)
    console.log('Icon saved to:', out)
  })
  .catch(err => {
    console.error('Failed:', err.message)
  })
