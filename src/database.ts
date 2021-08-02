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
 * Look up the indicated workflow, using the indicated auth.
 *
 * Resolve if the workflow exists and the secretId (which may be "") matches.
 *
 * Throw Error("Forbidden") if secretId does not match.
 *
 * Throw Error("NotFound") if the specified workflow does not exist.
 */
export async function throwIfWorkflowNotFoundOrForbidden(id: number, secretId: string): Promise<void> {
  const { rows } = await pool.query('SELECT public, secret_id FROM workflow WHERE id = $1', [id])
  if (rows.length === 0) {
    throw new Error("NotFound")
  }
  if (!rows[0].public && !timingSafeSecretsEqual(secretId, rows[0].secret_id)) {
    throw new Error("Forbidden")
  }
}

export async function healthzDatabaseError(): Promise<string | null> {
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    return String(err)
  }
  return null
}
