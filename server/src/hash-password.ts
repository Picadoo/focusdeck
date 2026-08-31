import { hashPassword } from './auth.js'

const password = process.argv[2]
if (!password) {
  console.error('usage: npm run hash-password -- <password>')
  process.exit(1)
}

console.log(hashPassword(password))
