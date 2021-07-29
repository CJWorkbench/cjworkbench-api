import express from 'express'
import { throwIfWorkflowNotFoundOrForbidden } from './database'
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

export default function createApp(options) {
  const storage: StorageInterface = options.storage
  const app = express()

  app.get('/v1/datasets/:workflowSlug/datapackage.json', (req, res, next) => {
    const { workflowSlug } = req.params
    accessWorkflowIdOrThrowHttpFailure(workflowSlug, req, res)
      .then((workflowId: number) => {
        return readDataPackageOrThrowHttpFailure(storage, `/wf-${workflowId}/datapackage.json`)
      })
      .then(([buf, datapackage]) => {
        const canonicalName: string = datapackage.name
        if (workflowSlug !== canonicalName) {
          throw new HttpFailure(302, "", {"location": `/v1/datasets/${canonicalName}/datapackage.json`})
        }

        res.type('json').send(buf)
      })
      .catch(err => {
        if (err instanceof HttpFailure) {
          res.status(err.status).set(err.headers).send(err.text)
        } else {
          next(err)
        }
      })
  })

  return app
}
