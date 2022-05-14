/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import { dirname, basename } from 'path'
import * as ts from 'typescript'
import { parseTsConfigToCommandLine, getTransformers, reportDiagnostics } from './util'

function withTransformerOption (
  program: ts.Program,
  {
    customTransformersBefore,
    customTransformersAfter
  }: TransformOptions,
  fn: (transformers: ts.CustomTransformers) => void
): ts.CustomTransformers {
  const transformers = typeof customTransformersBefore === 'function'
    ? customTransformersBefore(program)
    : {}
  fn(transformers)
  if (typeof customTransformersAfter === 'function') {
    const transformersAfter = customTransformersAfter(program)
    transformers.before = [...(transformers.before || (transformers.before = [])), ...(transformersAfter.before || [])]
    transformers.after = [...(transformers.after || (transformers.after = [])), ...(transformersAfter.after || [])]
    transformers.afterDeclarations = [...(transformers.afterDeclarations || (transformers.afterDeclarations = [])), ...(transformersAfter.afterDeclarations || [])]
  }
  return transformers
}

export interface TransformOptions {
  ignoreErrorCodes?: number[]
  customTransformersBefore?: (program: ts.Program) => ts.CustomTransformers
  customTransformersAfter?: (program: ts.Program) => ts.CustomTransformers
}

export function compile (
  tsconfig: string,
  {
    ignoreErrorCodes = [],
    customTransformersBefore,
    customTransformersAfter
  }: TransformOptions = {}
): void {
  const parsedCommandLine = parseTsConfigToCommandLine(tsconfig)
  const compilerHost = ts.createCompilerHost(parsedCommandLine.options)

  const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options, compilerHost)
  const transformers = withTransformerOption(program, { customTransformersBefore, customTransformersAfter }, (transformers) => {
    getTransformers(transformers, tsconfig, parsedCommandLine.options, program)
  })
  const emitResult = program.emit(undefined, undefined, undefined, !!parsedCommandLine.options.emitDeclarationOnly, transformers)

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  const diagnostics = allDiagnostics.filter(d => !ignoreErrorCodes.includes(d.code))
  reportDiagnostics(diagnostics)

  if (emitResult.emitSkipped && !parsedCommandLine.options.noEmit) {
    throw new Error('TypeScript compile failed.')
  }
}

export function watch (
  tsconfig: string,
  {
    ignoreErrorCodes = [],
    customTransformersBefore,
    customTransformersAfter
  }: TransformOptions = {}
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
    undefined,
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    reportDiagnostic
  )

  const origCreateProgram = host.createProgram
  host.createProgram = function (rootNames, options, host, oldProgram) {
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
