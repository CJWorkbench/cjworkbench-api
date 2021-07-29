import { Buffer } from 'buffer'
import { PassThrough, Readable } from 'stream'
import { Storage, Bucket } from '@google-cloud/storage'
import { ApiError } from '@google-cloud/common'
import { S3 } from '@aws-sdk/client-s3'
import { streamToBuffer } from './util'

class StorageReader {
  stream: Readable
  contentLength: number

  constructor(stream: Readable, contentLength: number) {
    this.stream = stream
    this.contentLength = contentLength
  }
}

export interface StorageInterface {
  readBytes(key: string): Promise<Buffer>
  createReader(key: string): Promise<StorageReader>
  healthzStorageError(): Promise<string | null>
}

export class GCSStorage {
  client: Storage
  healthzClient: Storage
  bucket: Bucket
  healthzBucket: Bucket

  constructor(endpoint: string, bucket: string) {
    this.client = new Storage({
      apiEndpoint: endpoint,
    })
    this.healthzClient = new Storage({
      apiEndpoint: endpoint,
      retryOptions: { autoRetry: false, totalTimeout: 1, maxRetries: 0 }
    })
    this.bucket = this.client.bucket(bucket)
    this.healthzBucket = this.healthzClient.bucket(bucket)
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
          resolve(new StorageReader(passthrough, Number(response.headers['content-length'])))
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

  async healthzStorageError(): Promise<string | null> {
    try {
      await this.healthzBucket.file("healthz").exists() // we don't care whether it exists
    } catch (err) {
      return String(err)
    }

    return null
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

    return new StorageReader(response.Body, response.ContentLength)
  }

  async healthzStorageError(): Promise<string | null> {
    try {
      await this.s3.headObject({
        Bucket: this.bucket,
        Key: 'healthz' // we don't care whether it's there
      })
    } catch (err) {
      switch (err.name) {
        case "NotFound": return null // not NoSuchKey, for some reason
        default: return String(err)
      }
    }
    return null
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
