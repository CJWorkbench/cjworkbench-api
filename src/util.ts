import { Readable } from 'stream'

export function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    stream.on("data", chunk => { chunks.push(chunk) })
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

