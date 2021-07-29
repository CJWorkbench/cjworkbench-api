import express from 'express'
import { healthzDatabaseError, throwIfWorkflowNotFoundOrForbidden } from './database'
import createStorage, { StorageInterface } from './storage'

function readUtf8Json(bytes: Buffer): any {
  const utf8 = bytes.toString('utf-8')
  return JSON.parse(utf8)
}

interface HttpFailureHeaders {
  location?: string
}

class HttpFailure {
  status: number
  text: string
  headers: HttpFailureHeaders

  constructor(status: number, text: string, headers: HttpFailureHeaders={}) {
    this.status = status
    this.text = text
    this.headers = headers
  }
}

function reqSecretId(req): string {
  if (req.headers["authorization"]) {
    // Overwrite secretId based on user input
    const header = req.headers["authorization"]
    if (!header.startsWith('Bearer ')) {
      throw new HttpFailure(400, "Badly-formed Authorization header")
    }
    const tokenBase64 = header.slice('Bearer '.length)
    try {
      return Buffer.from(tokenBase64, 'base64').toString('utf-8')
    } catch (err) {
      throw new HttpFailure(400, "Badly-formed Authorization header")
    }
  }
  return ""
}

async function accessWorkflowIdOrThrowHttpFailure(workflowSlug: string, req, res): Promise<number> {
  const secretId = reqSecretId(req) // or throw HttpFailure(400)
  const id = workflowSlug.includes('-')
    ? Number(workflowSlug.substring(0, workflowSlug.indexOf('-')))
    : Number(workflowSlug)

  if (!Number.isInteger(id)) {
    throw new HttpFailure(404, "Workflow must start with an integer")
  }

  try {
    await throwIfWorkflowNotFoundOrForbidden(id, secretId)
    return id
  } catch (err) {
    switch (err.message) {
      case "NotFound": throw new HttpFailure(404, "Workflow not found")
      case "Forbidden": throw new HttpFailure(403, "Wrong Authorization token")
      default: throw err
    }
  }
}

interface DataPackage {
  name: string
}

async function readDataPackageOrThrowHttpFailure(storage: StorageInterface, path: string): Promise<[Buffer, DataPackage]> {
  let buf: Buffer
  try {
    buf = await storage.readBytes(path)
  } catch (err) {
    switch (err.message) {
      case "NotFound": throw new HttpFailure(404, "This dataset is not published")
      default: throw err
    }
  }

  let json
  try  {
    json = readUtf8Json(buf)
  } catch (err) {
    throw new HttpFailure(500, "Invalid datapackage.json")
  }
  if (!json.hasOwnProperty('name') || typeof json.name !== 'string') {
    throw new HttpFailure(500, "Invalid datapackage.json")
  }

  return [buf, json]
}

function handleHttpFailure(err, res, next) {
  if (err instanceof HttpFailure) {
    res.status(err.status).set(err.headers).send(err.text)
  } else {
    next(err)
  }
}

function throwRedirectOnInvalidSlug(actualSlug, datapackage, subpath): void {
  const canonicalName: string = datapackage.name
  if (actualSlug !== canonicalName) {
    throw new HttpFailure(302, "", {"location": `/v1/datasets/${canonicalName}/${subpath}`})
  }
}

export default function createApp(options) {
  const storage: StorageInterface = options.storage
  const app = express()

  app.get('/healthz', (req, res, next) => {
    Promise.all([ healthzDatabaseError(), storage.healthzStorageError() ])
      .then(([ databaseError, storageError ]) => {
        res.status(databaseError === null && storageError === null ? 200 : 500)
        res.json({
          database: databaseError === null ? 'ok' : databaseError,
          storage: storageError === null ? 'ok' : storageError
        })
      })
      .catch(next)
  })

  app.get('/v1/datasets/:workflowSlug/datapackage.json', async (req, res, next) => {
    const { workflowSlug } = req.params
    accessWorkflowIdOrThrowHttpFailure(workflowSlug, req, res)
      .then(async (workflowId: number) => {
        const [buf, datapackage] = await readDataPackageOrThrowHttpFailure(storage, `/wf-${workflowId}/datapackage.json`)
        throwRedirectOnInvalidSlug(workflowSlug, datapackage, 'datapackage.json')
        res.type('json').send(buf)
      })
      .catch(err => { handleHttpFailure(err, res, next) })
  })

  app.get('/v1/datasets/:workflowSlug/:revision/datapackage.json', (req, res, next) => {
    const { workflowSlug, revision } = req.params
    accessWorkflowIdOrThrowHttpFailure(workflowSlug, req, res)
      .then(async (workflowId: number) => {
        const [buf, datapackage] = await readDataPackageOrThrowHttpFailure(storage, `/wf-${workflowId}/${revision}/datapackage.json`)
        throwRedirectOnInvalidSlug(workflowSlug, datapackage, `${revision}/datapackage.json`)
        res.type('json').send(buf)
      })
      .catch(err => { handleHttpFailure(err, res, next) })
  })

  // app.get(/\/v1\/datasets\/(?<workflowSlug>[-0-9a-z]+)\/(?<subpath>(?<revision>r\d+)\/(?:README.md|data\/(?:[-a-z0-9]+_(?<nameEnd>parquet\.parquet|csv\.csv\.gz|json\.json\.gz))))$/, (req, res, next) => {
  app.get(/\/v1\/datasets\/([-0-9a-z]+)\/((r\d+)\/(?:README.md|data\/(?:[-a-z0-9]+_(parquet\.parquet|csv\.csv\.gz|json\.json\.gz))))$/, (req, res, next) => {
    const { 0: workflowSlug, 1: subpath, 2: revision, 3: nameEnd } = req.params
    accessWorkflowIdOrThrowHttpFailure(workflowSlug, req, res)
      .then(async (workflowId: number) => {
        const [_, datapackage] = await readDataPackageOrThrowHttpFailure(storage, `/wf-${workflowId}/${revision}/datapackage.json`)
        throwRedirectOnInvalidSlug(workflowSlug, datapackage, subpath)

        let reader
        try {
          reader = await storage.createReader(`/wf-${workflowId}/${subpath}`)
        } catch (err) {
          switch (err.message) {
            case "NotFound": throw new HttpFailure(404, 'This file is not in the dataset')
            default: throw err
          }
        }

        const resultType = {
          'parquet.parquet': 'application/x-parquet',
          'csv.csv.gz': 'application/gzip',
          'json.json.gz': 'application/gzip',
          'md': 'text/markdown; charset=utf-8'
        }[nameEnd || 'md']
        res.type(resultType)
        res.set('Content-Length', String(reader.contentLength))

        reader.stream.pipe(res)
      })
      .catch(err => { handleHttpFailure(err, res, next) })
  })

  return app
}
