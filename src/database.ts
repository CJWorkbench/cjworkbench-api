import { Buffer } from 'buffer'
import { timingSafeEqual } from 'crypto'
import { Pool } from 'pg'

let pool: Pool

export async function start(): Promise<void> {
  pool = new Pool({ connectionTimeoutMillis: 1000, max: 3 })
  await pool.query("SELECT 1")
}

export async function end(): Promise<void> {
  await pool.end()
}

function timingSafeSecretsEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  // compare buffer lengths, not string lengths. timingSafeEqual() needs
  // equal buffer lengths.
  if (aBuffer.length !== bBuffer.length) {
    return false
  }
  return timingSafeEqual(aBuffer, bBuffer)
}

/**
 * Look up the indicated workflow's name, using the indicated auth.
 *
 * * throw Error("Forbidden") if secretId does not match.
 * * throw Error("NotFound") if the specified workflow does not exist.
 *
 * For public workflows, secretId should be "".
 */
export async function lookupAuthenticatedWorkflowName(id: number, secretId: string): Promise<string> {
  const { rows } = await pool.query('SELECT secret_id, name FROM workflow WHERE id = $1', [id])
  if (rows.length === 0) {
    throw new Error("NotFound")
  }
  if (!timingSafeSecretsEqual(secretId, rows[0].secret_id)) {
    throw new Error("Forbidden")
  }
  return rows[0].name
}
