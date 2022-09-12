import { dirname, join, relative } from 'path'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import * as ts from 'typescript'
import { getTransformers, reportDiagnostics, withTransformerOption } from './util'

import type { TransformOptions } from './types'

function getOutputFile (fileName: string, outDir: string, commonDir: string, parsedCommandLine: ts.ParsedCommandLine, outputSuffix?: string) {
  let outputFile = join(outDir, relative(commonDir, fileName))
  if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
    if (parsedCommandLine.options.jsx === ts.JsxEmit.Preserve) {
      outputFile = outputFile.replace(/\.tsx$/, '.jsx')
    } else {
      outputFile = outputFile.replace(/\.(j|t)sx$/, '.js')
    }
  } else {
    outputFile = outputFile.replace(/\.ts$/, '.js')
  }

  if (typeof outputSuffix === 'string') {
    outputFile = outputFile.endsWith('.js') ? (outputFile.replace(/\.js$/, outputSuffix)) : outputFile
  }
  return outputFile
}

function transpileFile (
  fileName: string,
  transformers: ts.CustomTransformers,
  outDir: string,
  commonDir: string,
  parsedCommandLine: ts.ParsedCommandLine,
  options: TransformOptions = {}
): {
  diagnostics: ts.Diagnostic[]
  emittedFiles: string[]
} {
  const {
    ignoreErrorCodes = [],
    outputSuffix
  } = options

  const transpileOutput = ts.transpileModule(readFileSync(fileName, 'utf8'), {
    compilerOptions: parsedCommandLine.options,
    fileName,
    reportDiagnostics: true,
    transformers
  })

  const emittedFiles: string[] = []
  if (!parsedCommandLine.options.noEmit) {
    const outputFile = getOutputFile(fileName, outDir, commonDir, parsedCommandLine, outputSuffix)
  
    mkdirSync(dirname(outputFile), { recursive: true })
    writeFileSync(outputFile, transpileOutput.outputText, 'utf8')
    emittedFiles.push(outputFile)
  
    if (parsedCommandLine.options.sourceMap && transpileOutput.sourceMapText) {
      const sourceMapFile = outputFile + '.map'
      writeFileSync(sourceMapFile, transpileOutput.sourceMapText, 'utf8')
      emittedFiles.push(sourceMapFile)
    }
  }

  let diagnostics: ts.Diagnostic[]
  if (transpileOutput.diagnostics) {
    diagnostics = transpileOutput.diagnostics.filter(d => !ignoreErrorCodes.includes(d.code))
    reportDiagnostics(diagnostics)
  } else {
    diagnostics = []
  }

  return {
    diagnostics,
    emittedFiles
  }
}

export function transpile (tsconfig: string, parsedCommandLine: ts.ParsedCommandLine, options: TransformOptions = {}): ts.EmitResult {
  const {
    customTransformersBefore,
    customTransformersAfter,
  } = options

  const fileNames = parsedCommandLine.fileNames.filter(f => !f.endsWith('.d.ts'))
  let commonDir = ''
  if (fileNames.length === 0) {
    return {
      emitSkipped: true,
      diagnostics: [],
      emittedFiles: []
    }
  }
  if (fileNames.length === 1) {
    commonDir = dirname(fileNames[0])
  } else {
    commonDir = require('commondir')('', fileNames)
  }
  const outDir = parsedCommandLine.options.outDir ?? dirname(parsedCommandLine.options.configFilePath as string)

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

  let fileName = ''
  let allDiagnostics: ts.Diagnostic[] = []
  let allEmittedFiles: string[] = []
  for (let i = 0; i < fileNames.length; ++i) {
    fileName = fileNames[i]
    const result = transpileFile(fileName, transformers, outDir, commonDir, parsedCommandLine, options)
    allDiagnostics = [...allDiagnostics, ...result.diagnostics]
    allEmittedFiles = [...allEmittedFiles, ...result.emittedFiles]
  }
  return {
    emitSkipped: !!parsedCommandLine.options.noEmit,
    diagnostics: allDiagnostics,
    emittedFiles: allEmittedFiles
  }
}
