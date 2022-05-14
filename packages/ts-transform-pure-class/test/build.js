const { join } = require('path')
const { compile } = require('@tybys/tsapi')

compile(join(__dirname, './tsconfig.json'))
