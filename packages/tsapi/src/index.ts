import { dirname, basename } from 'path'
import * as ts from 'typescript'
import { parseTsConfigToCommandLine, getTransformers, reportDiagnostics } from './util'

export interface TransformOptions {
  ignoreErrorCodes?: number[]
}

export function compile (tsconfig: string, { ignoreErrorCodes = [] }: TransformOptions = {}): void {
  const parsedCommandLine = parseTsConfigToCommandLine(tsconfig)
  const compilerHost = ts.createCompilerHost(parsedCommandLine.options)

  const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options, compilerHost)
  const customTransformers = getTransformers(tsconfig, parsedCommandLine.options, program)
  const emitResult = program.emit(undefined, undefined, undefined, !!parsedCommandLine.options.emitDeclarationOnly, customTransformers)

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  const diagnostics = allDiagnostics.filter(d => !ignoreErrorCodes.includes(d.code))
  reportDiagnostics(diagnostics)

  if (emitResult.emitSkipped && !parsedCommandLine.options.noEmit) {
    throw new Error('TypeScript compile failed.')
  }
}

export function watch (tsconfig: string, { ignoreErrorCodes = [] }: TransformOptions = {}): ts.WatchOfConfigFile<ts.SemanticDiagnosticsBuilderProgram> {
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
    const customTransformers = getTransformers(tsconfig, compilerOptions, program)
    ;(ts as any).emitFilesAndReportErrors(builderProgram, reportDiagnostic, writeFileName, function (errorCount: any) {
      return host.onWatchStatusChange?.((ts as any).createCompilerDiagnostic((ts as any).getWatchErrorSummaryDiagnosticMessage(errorCount), errorCount), newLine, compilerOptions, errorCount)
    }, undefined, undefined, !!compilerOptions.emitDeclarationOnly, customTransformers)
  }

  return ts.createWatchProgram(host)
}
