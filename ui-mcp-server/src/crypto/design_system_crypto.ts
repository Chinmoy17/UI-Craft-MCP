/**
 * Design system encryption utilities.
 *
 * Uses AES-256-GCM (authenticated encryption) to protect confidential
 * design system specs at rest. Key from UI_CRAFT_DS_KEY env var.
 *
 * File format (.enc): [16B IV][16B AuthTag][Ciphertext]
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_ENV = 'UI_CRAFT_DS_KEY'

function deriveKey(passphrase: string): Buffer {
  return createHash('sha256').update(passphrase).digest()
}

export function getEncryptionKey(): Buffer | null {
  const raw = process.env[KEY_ENV]
  if (!raw || raw.trim().length === 0) return null
  return deriveKey(raw.trim())
}

export function encryptDesignSystem(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted])
}

export function decryptDesignSystem(encBuffer: Buffer, key: Buffer): string {
  if (encBuffer.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted design system file is too short or corrupt.')
  }
  const iv = encBuffer.subarray(0, IV_LENGTH)
  const authTag = encBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = encBuffer.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf-8')
}
