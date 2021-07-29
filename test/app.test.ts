/* global afterAll, beforeAll, describe, expect, test */
import { start, end } from '../src/database'
import { S3Storage } from '../src/storage'
import createApp from '../src/app'
import supertest from 'supertest'

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
