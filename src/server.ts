import morgan from 'morgan'
import { start, end } from './database'
import createStorage from './storage'
import createApp from './app'

function getResponseTimeAsDurationString(req, res) {
  // Tweaked from https://github.com/expressjs/morgan/blob/19a6aa5369220b522e9dac007975ee66b1c38283/index.js#L228
  // We use _startTime, not _startAt, because millisecond precision is plenty
  if (!req._startTime || !res._startTime) {
    return '???s'
  }

  const ms = res._startTime - req._startTime
  return (ms / 1000).toFixed(3) + 's'
}

function getTotalTime(req, res) {
  if (!req._startTime) {
    return '???s'
  }

  const ms = new Date().getTime() - req._startTime
  return (ms / 1000).toFixed(3) + 's'
}

const morganMiddleware = morgan(function morganFormat(tokens, req, res) {
  const status = tokens.status(req, res)
  // Calculate latency in s, not ms, as per
  // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#HttpRequest
  // ... [adamhooper, 2021-07-30] I can't tell whether Google defines latency
  // as "time to response start" or "time to response end"; but time to response
  // start seems more interesting, so that's what we'll use.
  const latency = getResponseTimeAsDurationString(req, res)
  const requestMethod = tokens.method(req, res)
  const requestUrl = tokens.url(req, res)
  const responseSize = res._header.length + res._contentLength
  return JSON.stringify({
    // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
    severity: status >= 500 ? 'ERROR' : 'INFO',
    timestamp: new Date().toISOString(),
    httpRequest: {
      requestMethod,
      requestUrl,
      status,
      responseSize,
      userAgent: req.headers['user-agent'],
      remoteIp: tokens['remote-addr'](req, res),
      serverIp: req.socket.localAddress,
      referer: req.headers['referer'],
      latency
    },
    message: `${requestMethod} ${requestUrl} => ${status} ${responseSize}b in ${getTotalTime(req, res)}`
  })
})

const middlewares = [morganMiddleware]

const storage = createStorage(process.env)
async function main() {
  await start()
  try {
    const app = createApp({ storage, middlewares })
    app.set('strict routing', true)
    app.set('trust proxy', true)
    await new Promise((resolve, reject) => {
      app.listen(8080)
        .once('listening', () => { console.log('Listening on 0.0.0.0:8080') })
        .once('close', resolve)
        .once('error', reject)
    })
  } finally {
    await end()
  }
}

// Add signal handlers in case we're PID 1
process.on('SIGINT', () => process.exit(-2))
process.on('SIGTERM', () => process.exit(-15))

main()
