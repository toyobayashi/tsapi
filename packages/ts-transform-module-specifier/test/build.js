const { join } = require('path')
const { compile, watch } = require('@tybys/tsapi')
const { addAbortSignal } = require('stream')

function removeSuffix (str, suffix) {
  if (suffix == null) {
    const pathList = str.split(/[/\\]/)
    const last = pathList[pathList.length - 1]
    const dot = last.lastIndexOf('.')
    pathList[pathList.length - 1] = dot !== -1 ? last.slice(0, dot) : last
    return pathList.join('/')
  }
  return str.endsWith(suffix) ? str.slice(0, str.length - suffix.length) : str
}

const transformModuleSpecifier = require('..').default

compile(join(__dirname, './tsconfig.json'), {
  outputSuffix: '.cjs'
  // customTransformersBefore (program) {
  //   return {
  //     before: [transformModuleSpecifier({
  //       targets: [
  //         {
  //           replacer: (_currentSourceFile, request) => {
  //             if (request.charAt(0) !== '.') {
  //               return request
  //             }
  //             return removeSuffix(request) + '.mjs'
  //           }
  //         }
  //       ]
  //     })],
  //     after: [transformModuleSpecifier({
  //       targets: [
  //         {
  //           replacer: (_currentSourceFile, request) => {
  //             if (request === 'tslib') {
  //               return '@alias/tslib'
  //             }
  //             return request
  //           }
  //         }
  //       ]
  //     })]
  //   }
  // }
})
