/**
 * Encrypts a design system JSON file into .enc format.
 * Usage: UI_CRAFT_DS_KEY="your-passphrase" node scripts/encrypt-design-system.js bytemethod
 */
const fs = require('fs')
const path = require('path')
const { createCipheriv, createHash, randomBytes } = require('crypto')

const name = process.argv[2]
if (!name) {
  console.error('Usage: UI_CRAFT_DS_KEY="passphrase" node scripts/encrypt-design-system.js <name>')
  process.exit(1)
}

const rawKey = process.env.UI_CRAFT_DS_KEY
if (!rawKey) {
  console.error('Error: UI_CRAFT_DS_KEY environment variable is not set.')
  process.exit(1)
}

const srcDir = path.join(__dirname, '..', 'src', 'content', 'kb', 'design-system')
const jsonFile = path.join(srcDir, `${name}.json`)
const encFile = path.join(srcDir, `${name}.enc`)

if (!fs.existsSync(jsonFile)) {
  console.error(`Error: ${jsonFile} not found.`)
  process.exit(1)
}

const plaintext = fs.readFileSync(jsonFile, 'utf-8')
const derivedKey = createHash('sha256').update(rawKey.trim()).digest()
const iv = randomBytes(16)
const cipher = createCipheriv('aes-256-gcm', derivedKey, iv)
const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
const authTag = cipher.getAuthTag()
const output = Buffer.concat([iv, authTag, encrypted])

fs.writeFileSync(encFile, output)
console.log(`Encrypted: ${encFile} (${output.length} bytes)`)
console.log(`You can now remove ${name}.json from version control.`)
