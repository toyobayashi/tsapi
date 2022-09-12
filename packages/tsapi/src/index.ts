/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import { dirname, basename } from 'path'
import * as ts from 'typescript'

import {
  parseTsConfigToCommandLine,
  getTransformers,
  reportDiagnostics,
  withTransformerOption
} from './util'

import type { TransformOptions, TypeCheckOptions, WatchTransformOptions } from './types'
import { transpile } from './transpile'

export type { TransformOptions, TypeCheckOptions, WatchTransformOptions }

export interface CompileResult {
  result: boolean
  emitResult: ts.EmitResult
  diagnostics: readonly ts.Diagnostic[]
}

export function compile (
  tsconfig: string,
  options: TransformOptions = {}
): CompileResult {
  const {
    transpileOnly = false,
    ignoreErrorCodes = [],
    optionsToExtend,
    outputSuffix,
    customTransformersBefore,
    customTransformersAfter,
  } = options
  const parsedCommandLine = parseTsConfigToCommandLine(tsconfig, optionsToExtend)
  let emitResult: ts.EmitResult
  if (transpileOnly) {
    emitResult = transpile(tsconfig, parsedCommandLine, options)
    return {
      result: true,
      emitResult,
      diagnostics: emitResult.diagnostics
    }
  }

  const compilerHost = ts.createCompilerHost(parsedCommandLine.options)

  if (typeof outputSuffix === 'string') {
    const originalWriteFile = compilerHost.writeFile
    compilerHost.writeFile = function (this: any, fileName, data, writeByteOrderMark, onError, sourceFiles) {
      const name = fileName.endsWith('.js') ? (fileName.replace(/\.js$/, outputSuffix)) : fileName
      originalWriteFile.call(this, name, data, writeByteOrderMark, onError, sourceFiles)
    }
  }

  const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options, compilerHost)
  const transformers = withTransformerOption(program, { customTransformersBefore, customTransformersAfter }, (transformers) => {
    getTransformers(transformers, tsconfig, parsedCommandLine.options, program)
  })
  emitResult = program.emit(undefined, undefined, undefined, !!parsedCommandLine.options.emitDeclarationOnly, transformers)

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  const diagnostics = allDiagnostics.filter(d => !ignoreErrorCodes.includes(d.code))
  reportDiagnostics(diagnostics)

  return {
    result: !(emitResult.emitSkipped && !parsedCommandLine.options.noEmit),
    emitResult,
    diagnostics
  }
}

export function watch (
  tsconfig: string,
  {
    ignoreErrorCodes = [],
    optionsToExtend,
    outputSuffix,
    customTransformersBefore,
    customTransformersAfter
  }: WatchTransformOptions = {}
): ts.WatchOfConfigFile<ts.SemanticDiagnosticsBuilderProgram> {
  const configPath = ts.findConfigFile(
    dirname(tsconfig),
    ts.sys.fileExists,
    basename(tsconfig)
  )

  if (!configPath) {
    throw new Error(`TSConfig not found: ${tsconfig}`)
  }

  function reportDiagnostic (diagnostic: ts.Diagnostic): void {
    if (ignoreErrorCodes.includes(diagnostic.code)) return
    reportDiagnostics([diagnostic])
  }

  const host = ts.createWatchCompilerHost(
    configPath,
    optionsToExtend,
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    reportDiagnostic
  )

  const origCreateProgram = host.createProgram
  host.createProgram = function (rootNames, options, host, oldProgram) {
    if (outputSuffix) {
      if (host && host.writeFile) {
        const originalWriteFile = host.writeFile
        host.writeFile = function (this: any, fileName, data, writeByteOrderMark, onError, sourceFiles) {
          const name = fileName.endsWith('.js') ? (fileName.replace(/\.js$/, outputSuffix)) : fileName
          originalWriteFile.call(this, name, data, writeByteOrderMark, onError, sourceFiles)
        }
      }
    }
    return origCreateProgram.call(this, rootNames, options, host, oldProgram)
  }

  host.afterProgramCreate = builderProgram => {
    const program = builderProgram.getProgram()
    const writeFileName = (s: string): void => ts.sys.write(s + ts.sys.newLine)
    const compilerOptions = builderProgram.getCompilerOptions()
    const newLine = (ts as any).getNewLineCharacter(compilerOptions, function () { return ts.sys.newLine })
    const transformers = withTransformerOption(program, { customTransformersBefore, customTransformersAfter }, (transformers) => {
      getTransformers(transformers, tsconfig, compilerOptions, program)
    })
    ;(ts as any).emitFilesAndReportErrors(builderProgram, reportDiagnostic, writeFileName, function (errorCount: any) {
      return host.onWatchStatusChange?.((ts as any).createCompilerDiagnostic((ts as any).getWatchErrorSummaryDiagnosticMessage(errorCount), errorCount), newLine, compilerOptions, errorCount)
    }, undefined, undefined, !!compilerOptions.emitDeclarationOnly, transformers)
  }

  return ts.createWatchProgram(host)
}

export function typeCheck (
  tsconfig: string,
  options: TypeCheckOptions = {}
): CompileResult {
  const { transpileOnly, ...opts } = options as any
  opts.optionsToExtend = opts.optionsToExtend || {}
  opts.optionsToExtend.noEmit = true
  return compile(tsconfig, opts)
}
