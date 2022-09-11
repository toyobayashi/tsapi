import { dirname, join, relative } from 'path'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import * as ts from 'typescript'
import { getTransformers, reportDiagnostics, withTransformerOption } from './util'

import type { TransformOptions } from './types'

export function transpile (tsconfig: string, parsedCommandLine: ts.ParsedCommandLine, options: TransformOptions = {}): void {
  const {
    ignoreErrorCodes = [],
    outputSuffix,
    customTransformersBefore,
    customTransformersAfter,
  } = options

  const fileNames = parsedCommandLine.fileNames.filter(f => !f.endsWith('.d.ts'))
  let commonDir = ''
  if (fileNames.length === 0) return
  if (fileNames.length === 1) {
    commonDir = dirname(fileNames[0])
  } else {
    commonDir = require('commondir')('', fileNames)
  }
  const outDir = parsedCommandLine.options.outDir ?? join(dirname(parsedCommandLine.options.configFilePath as string), 'out')

  const program =
    parsedCommandLine.projectReferences !== undefined
      ? ts.createProgram({
          rootNames: parsedCommandLine.fileNames,
          options: parsedCommandLine.options,
          projectReferences: parsedCommandLine.projectReferences,
        })
      : ts.createProgram([], parsedCommandLine.options)
  
  const transformers = withTransformerOption(program, { customTransformersBefore, customTransformersAfter }, (transformers) => {
    getTransformers(transformers, tsconfig, parsedCommandLine.options, program)
  })

  let outputFile = ''
  for (let i = 0; i < fileNames.length; ++i) {
    const fileName = fileNames[i]
    const transpileOutput = ts.transpileModule(readFileSync(fileName, 'utf8'), {
      compilerOptions: parsedCommandLine.options,
      fileName,
      reportDiagnostics: true,
      transformers
    })

    outputFile = join(outDir, relative(commonDir, fileName))
    if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
      if (parsedCommandLine.options.jsx === ts.JsxEmit.Preserve) {
        outputFile = outputFile.replace(/\.(j|t)sx$/, '.jsx')
      } else {
        outputFile = outputFile.replace(/\.(j|t)sx$/, '.js')
      }
    } else {
      outputFile = outputFile.replace(/\.ts$/, '.js')
    }

    if (typeof outputSuffix === 'string') {
      outputFile = outputFile.endsWith('.js') ? (outputFile.replace(/\.js$/, outputSuffix)) : outputFile
    }
    mkdirSync(dirname(outputFile), { recursive: true })
    writeFileSync(outputFile, transpileOutput.outputText, 'utf8')

    if (parsedCommandLine.options.sourceMap && transpileOutput.sourceMapText) {
      const sourceMapFile = outputFile + '.map'
      writeFileSync(sourceMapFile, transpileOutput.sourceMapText, 'utf8')
    }

    if (transpileOutput.diagnostics) {
      const diagnostics = transpileOutput.diagnostics.filter(d => !ignoreErrorCodes.includes(d.code))
      reportDiagnostics(diagnostics)
    }
  }
}
