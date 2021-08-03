/* global afterAll, beforeAll, describe, expect, test */
import fs from 'fs'

import supertest from 'supertest'

import { start, end } from '../src/database'
import { S3Storage } from '../src/storage'
import { streamToBuffer } from '../src/util'
import createApp from '../src/app'

let storage: S3Storage
let app
let request

beforeAll(start)
beforeAll(() => {
  storage = new S3Storage('http://s3-server', 'datasets.test')
  app = createApp({ storage })
  request = supertest(app)
})
afterAll(end)

describe('GET /v1/datasets/:workflow/datapackage.json', () => {
  test('9. redirect on wrong slug', async () => {
    const response = await request.get('/v1/datasets/9-wrong-slug/datapackage.json')
    expect(response.statusCode).toBe(302)
    expect(response.headers["location"]).toEqual('/v1/datasets/9-right-slug/datapackage.json')
  })

  test('10. return bytes on correct slug', async () => {
    const response = await request.get('/v1/datasets/10-right-slug/datapackage.json')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/^application\/json/)
    expect(response.body).toEqual({ name: "10-right-slug", resources:[{ data:[] }] })
  })

  test('11. HTTP Forbidden on missing secret', async () => {
    const response = await request.get('/v1/datasets/11-right-slug/datapackage.json')
    expect(response.statusCode).toBe(403)
    expect(response.text).toEqual('Wrong Authorization token')
  })

  test('12. HTTP Forbidden on incorrect secret', async () => {
    const auth = `Bearer ${Buffer.from('wrong-secret').toString('base64')}`
    const response = await request.get('/v1/datasets/12-right-slug/datapackage.json').set('Authorization', auth)
    expect(response.statusCode).toBe(403)
    expect(response.text).toEqual('Wrong Authorization token')
  })

  test('13. HTTP Bad Request on badly-input secret', async () => {
    const auth = `Bear ${Buffer.from('right-secret').toString('base64')}`
    const response = await request.get('/v1/datasets/13-right-slug/datapackage.json').set('Authorization', auth)
    expect(response.statusCode).toBe(400)
    expect(response.text).toEqual('Badly-formed Authorization header')
  })

  test('14. HTTP OK on correct secret', async () => {
    const auth = `Bearer ${Buffer.from('right-secret').toString('base64')}`
    const response = await request.get('/v1/datasets/14-right-slug/datapackage.json').set('Authorization', auth)
    expect(response.statusCode).toBe(200)
  })

  test('15. HTTP Not Found on missing workflow in database', async () => {
    const response = await request.get('/v1/datasets/15-not-in-database/datapackage.json')
    expect(response.statusCode).toBe(404)
    expect(response.text).toEqual('Workflow not found')
  })

  test('16. HTTP Not Found on missing file from storage', async () => {
    const response = await request.get('/v1/datasets/16-in-database-not-storage/datapackage.json')
    expect(response.statusCode).toBe(404)
    expect(response.text).toEqual('This dataset is not published')
  })

  test('17. redirect on no slug at all, just ID', async () => {
    const response = await request.get('/v1/datasets/17/datapackage.json')
    expect(response.statusCode).toBe(302)
    expect(response.headers["location"]).toEqual('/v1/datasets/17-added-slug/datapackage.json')
  })
})

describe('GET /v1/datasets/:workflow/r:revision/datapackage.json', () => {
  test('18. redirect on wrong slug (i.e., slug of a different revision)', async () => {
    const response = await request.get('/v1/datasets/18-slug-2/r1/datapackage.json')
    expect(response.statusCode).toBe(302)
    expect(response.headers["location"]).toEqual('/v1/datasets/18-slug-1/r1/datapackage.json')
  })

  test('19. return JSON on correct slug', async () => {
    const response = await request.get('/v1/datasets/19-right-slug/r1/datapackage.json')
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ name: "19-right-slug", resources:[{ data:[] }] })
  })

  test('20. HTTP Forbidden on missing secret', async () => {
    const response = await request.get('/v1/datasets/20-missing-secret/r1/datapackage.json')
    expect(response.statusCode).toBe(403)
    expect(response.text).toEqual('Wrong Authorization token')
  })

  test('21. HTTP Not Found on missing file from storage', async () => {
    const response = await request.get('/v1/datasets/21-wrong-revision/r2/datapackage.json')
    expect(response.statusCode).toBe(404)
    expect(response.text).toEqual('This dataset is not published')
  })

  test('22. HTTP Not Found on invalid revision', async () => {
    const response = await request.get('/v1/datasets/22-invalid-revision/hi/datapackage.json')
    expect(response.statusCode).toBe(404)
    expect(response.text).toEqual('This dataset is not published')
  })
})

describe('GET /v1/datasets/:workflow/r:revision/:file', () => {
  test('23. redirect on wrong slug (i.e., slug of a different revision)', async () => {
    const response = await request.get('/v1/datasets/23-wrong-slug/r1/data/tab-1.csv')
    expect(response.statusCode).toBe(302)
    expect(response.headers["location"]).toEqual('/v1/datasets/23-right-slug/r1/data/tab-1.csv')
  })

  test('24. return text/markdown README.md', async () => {
    const response = await request.get('/v1/datasets/24-readme-md/r1/README.md')
    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toEqual('text/markdown; charset=utf-8')
    expect(response.text).toEqual('# Readme\n\n(please)\n')
  })

  test('25. HTTP Forbidden on missing secret', async () => {
    const response = await request.get('/v1/datasets/25-missing-secret/r1/README.md')
    expect(response.statusCode).toBe(403)
    expect(response.text).toEqual('Wrong Authorization token')
  })

  test('26. HTTP Not Found on missing file from storage', async () => {
    const response = await request.get('/v1/datasets/26-wrong-subpath/r1/data/tab-2.csv')
    expect(response.statusCode).toBe(404)
    expect(response.text).toEqual('This file is not in the dataset')
  })

  test('27. HTTP Not Found on missing revision', async () => {
    const response = await request.get('/v1/datasets/27-missing-revision/r2/data/tab-2.csv')
    expect(response.statusCode).toBe(404)
    expect(response.text).toEqual('This dataset is not published')
  })

  test('28. return application/gzip CSV', async () => {
    const response = await request.get('/v1/datasets/28-csv/r1/data/tab-1.csv')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toEqual('text/csv; charset=utf-8')
    expect(response.headers['content-length']).toEqual('38') // file size
    expect(response.text).toEqual('testdata')
  })

  test('29. return application/gzip JSON', async () => {
    const response = await request.get('/v1/datasets/29-json/r1/data/tab-1.json')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toEqual('application/json; charset=utf-8')
    expect(response.headers['content-length']).toEqual('41') // file size
    expect(response.body).toEqual([{"A":1}])
  })

  test('30. return application/x-parquet', async () => {
    // Parquet has no MIME type yet. https://issues.apache.org/jira/browse/PARQUET-1889
    const response = await request.get('/v1/datasets/30-parquet/r1/data/tab-1.parquet')
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toEqual('application/x-parquet')
    expect(response.headers['content-length']).toEqual('8') // file size
    expect(response.text).toEqual('testdata')
  })
})

describe('GET /healthz', () => {
  test('31. succeed', async () => {
    const response = await request.get('/healthz')
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ database: 'ok', storage: 'ok' })
  })

  test('32. fail if storage fails', async () => {
    const failingStorage = new S3Storage('http://endpoint-that-will-certainly-error.local', 'datasets.test')
    const failingApp = createApp({ storage: failingStorage })
    const response = await supertest(failingApp).get('/healthz')
    expect(response.statusCode).toBe(500)
    expect(response.body.storage).toMatch(/ENOTFOUND/)
  })

  test('33. fail if database fails', async () => {
    try {
      await end()
      const response = await request.get('/healthz')
      expect(response.statusCode).toBe(500)
      expect(response.body.database).toEqual('Error: Cannot use a pool after calling end on the pool')
    } finally {
      await start()
    }
  })
})
