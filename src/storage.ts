import { Buffer } from 'buffer'
import { PassThrough, Readable } from 'stream'
import { Storage, Bucket } from '@google-cloud/storage'
import { ApiError } from '@google-cloud/common'
import { S3 } from '@aws-sdk/client-s3'

class StorageReader {
  stream: Readable

  constructor(stream: Readable) {
    this.stream = stream
  }
}

export interface StorageInterface {
  readBytes(key: string): Promise<Buffer>
  createReader(key: string): Promise<StorageReader>
}

export class GCSStorage {
  client: Storage
  bucket: Bucket

  constructor(endpoint: string, bucket: string) {
    this.client = new Storage({ apiEndpoint: endpoint })
    this.bucket = this.client.bucket(bucket)
  }

  async readBytes(key: string): Promise<Buffer> {
    const file = this.bucket.file(key)
    let data
    try {
      data = await file.download()
    } catch (err) {
      switch (err.code) {
        case 404: throw new Error("NotFound")
        default: throw err
      }
    }
    return data[0]
  }

  createReader(key: string): Promise<StorageReader> {
    return new Promise((resolve, reject) => {
      const stream = this.bucket.file(key).createReadStream()
      // To kick off the request, we need to call stream.pipe() ... before
      // the caller adds its own signal handlers. This would normally eat data.
      // We use a PassThrough so the caller's return value won't be started.
      const passthrough = new PassThrough()
      stream.on('response', response => {
        if (response.statusCode > 199 && response.statusCode < 300) {
          resolve(new StorageReader(passthrough))
        } // otherwise the 'error' event will be emitted
      })
      stream.on('error', err => {
        // reject() is a no-op if resolve() was already called
        if (err instanceof ApiError) {
          switch (err.code) {
            case 404: return reject(new Error("NotFound"))
          }
        }
        reject(err)
      })
      stream.pipe(passthrough)
    })
  }
}

export class S3Storage {
  s3: S3
  bucket: string

  constructor(endpoint: string, bucket: string) {
    // force path style for minio (used in our test suite)
    this.s3 = new S3({ endpoint, forcePathStyle: true, region: 'us-east-1' })
    this.bucket = bucket
  }

  async readBytes(key: string): Promise<Buffer> {
    const reader = await this.createReader(key)

    function streamToBuffer(stream: Readable): Promise<Buffer> {
      return new Promise((resolve, reject) => {
        const chunks: Array<Buffer> = []
        stream.on("data", chunk => { chunks.push(chunk) })
        stream.on("error", reject)
        stream.on("end", () => resolve(Buffer.concat(chunks)))
      })
    }

    return await streamToBuffer(reader.stream)
  }

  async createReader(key: string): Promise<StorageReader> {
    let response
    try {
      response = await this.s3.getObject({ Bucket: this.bucket, Key: key })
    } catch (err) {
      switch (err.name) {
        case "NoSuchKey": throw new Error("NotFound")
        default: throw err
      }
    }

    return new StorageReader(response.Body)
  }
}

export default function createStorage(env) {
  const endpoint: string = env["CJW_STORAGE_ENDPOINT"]
  const bucket: string = env["CJW_STORAGE_BUCKET"]
  const engine: string = env["CJW_STORAGE_ENGINE"]

  switch (engine) {
    case "gcs": return new GCSStorage(endpoint, bucket)
    case "s3": return new S3Storage(endpoint, bucket)
    default: throw new Error(`Unknown engine: "${engine}"`)
  }
}
