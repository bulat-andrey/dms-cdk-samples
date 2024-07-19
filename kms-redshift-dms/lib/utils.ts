import * as crypto from 'crypto';

/**
 * Hashes the given value using the SHA-256 algorithm.
 *
 * @param value - The value to be hashed.
 * @returns The hashed value as a hexadecimal string.
 */
export function hashValue(value: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
}