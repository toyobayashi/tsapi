import { execa } from 'execa'
import path from 'path'

const __dirname = path.dirname(import.meta.url.substring(8))

async function build (p) {
  try {
    await execa('npm', ['publish'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../packages', p)
    })
  } catch (err) {
    console.error(err)
  }
}

await build('tsapi')
await build('ts-transform-pure-class')
await build('ts-transform-define')
