/* globals describe, expect, test */
import { Buffer } from 'buffer'

import createStorage from '../src/storage'

describe.each([
  {'CJW_STORAGE_ENGINE': 's3', 'CJW_STORAGE_ENDPOINT': 'http://s3-server', 'CJW_STORAGE_BUCKET': 'datasets.test'},
  {'CJW_STORAGE_ENGINE': 'gcs', 'CJW_STORAGE_ENDPOINT': 'http://gcs-server', 'CJW_STORAGE_BUCKET': 'datasets.test'},
])('with $CJW_STORAGE_ENGINE', env => {
  const storage = createStorage(env)

  test('1. readBytes() when file exists returns a Buffer', async () => {
    const datapackage = await storage.readBytes('wf-1/datapackage.json')
    const actual = datapackage.toString('utf-8')
    const expected = '{"id":"https://datasets.test/1-stream-dataset","resources":[{}]}'
    expect(actual).toEqual(expected)
  })

  test('2. readBytes() when file does not exist raises KeyNotFoundError', async () => {
    await expect(storage.readBytes('wf-2/datapackage.json')).rejects.toThrow('NotFound')
  })

  test('3. createReader() streams file contents', async () => {
    const reader = await storage.createReader('wf-3/r1/README.md')
    expect(reader.contentLength).toEqual(19)
    expect(reader.stream.readableFlowing).toBe(null) // not started yet
    const contents: Buffer = await new Promise((resolve, reject) => {
      const chunks: Array<Buffer> = []
      reader.stream
        .on('data', chunk => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject)
    })
    const actual = contents.toString('utf-8')
    const expected = '# Readme\n\n(please)\n'
    expect(actual).toEqual(expected)
  })

  test('4. createReader() throws NotFound', async () => {
    await expect(storage.createReader('wf-4/r1/README.md')).rejects.toThrow('NotFound')
  })

  test('5. healthzStorageError() returns null on success', async () => {
    const result = await storage.healthzStorageError()
    expect(result).toBe(null)
  })

  test('6. healthzStorageError() returns a message', async () => {
    const badStorage = createStorage({ ...env, CJW_STORAGE_ENDPOINT: 'http://not-a-valid-endpoint.local' })
    const result = await badStorage.healthzStorageError()
    expect(result).not.toBe(null)
  })
})
