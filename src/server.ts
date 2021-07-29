import { start, end } from './database'
import createStorage from './storage'
import createApp from './app'

const storage = createStorage(process.env)
async function main() {
  await start()
  try {
    const app = createApp({ storage })
    await new Promise((resolve, reject) => {
      app.listen(8080).once('listening', resolve).once('error', reject)
    })
  } finally {
    await end()
  }
}

main()
