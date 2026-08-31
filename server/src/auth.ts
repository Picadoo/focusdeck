import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

export function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(hashHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function secretKey(secret: string) {
  return createHash('sha256').update(secret).digest()
}

export async function signToken(username: string, secret: string) {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(secret))
}

export async function verifyToken(token: string, secret: string) {
  const { payload } = await jwtVerify(token, secretKey(secret))
  return String(payload.sub ?? '')
}

export { TOKEN_TTL_SECONDS }
