import { execa } from 'execa'
import path from 'path'
import { fileURLToPath } from 'url' 

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const tsc = path.join(__dirname, '../node_modules/.bin/tsc')

async function build (p) {
  await execa(tsc, ['-p', path.join(__dirname, '../packages', p, 'tsconfig.json')], { stdio: 'inherit' })
}

await build('tsapi')
await build('ts-transform-pure-class')
await build('ts-transform-define')
