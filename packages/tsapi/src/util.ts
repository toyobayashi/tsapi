import { dirname, basename, resolve } from 'path'
import { createRequire } from 'module'
import { TSError } from './error'
import * as ts from 'typescript'
import type { TransformOptions } from './types'

export function reportDiagnostics (diagnostics: ts.Diagnostic[]): void {
  if (diagnostics.length) {
    const host = {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (_: any) => _,
      getNewLine: () => ts.sys.newLine
    }
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  }
}

export function parseTsConfigToCommandLine (tsconfig: string, optionsToExtend?: ts.CompilerOptions): ts.ParsedCommandLine {
  const configFileName = ts.findConfigFile(
    dirname(tsconfig),
    ts.sys.fileExists,
    basename(tsconfig)
  )
  if (!configFileName) {
    throw new Error(`TSConfig not found: ${tsconfig}`)
  }

  const parseConfigHost = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => {
      reportDiagnostics([diagnostic])
      throw new TSError(typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText, diagnostic.code)
    }
  }

  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(configFileName, optionsToExtend, parseConfigHost, undefined, undefined, undefined)!
  if (parsedCommandLine.errors.length) {
    reportDiagnostics(parsedCommandLine.errors)
    const messageText = typeof parsedCommandLine.errors[0].messageText === 'string'
      ? parsedCommandLine.errors[0].messageText
      : parsedCommandLine.errors[0].messageText.messageText
    throw new TSError(messageText, parsedCommandLine.errors[0].code)
  }
  return parsedCommandLine
}

function getDefault (mod: any): any {
  const esModuleDesc = Object.getOwnPropertyDescriptor(mod, '__esModule')
  if (
    esModuleDesc &&
    !esModuleDesc.enumerable &&
    !esModuleDesc.configurable &&
    !esModuleDesc.writable &&
    esModuleDesc.value === true
  ) {
    return mod.default
  }
  return mod
}

function getTransformer (
  target: any,
  type: string | undefined,
  config: Record<string,
  any>,
  compilerOptions: ts.CompilerOptions,
  program: ts.Program
): ts.TransformerFactory<any> | ts.CustomTransformerFactory {
  if (type === undefined || type === 'program') {
    return target(program, config)
  }
  if (type === 'config') {
    return target(config)
  }
  if (type === 'checker') {
    return target(program.getTypeChecker(), config)
  }
  if (type === 'raw') {
    return target
  }
  if (type === 'compilerOptions') {
    return target(compilerOptions, config)
  }
  throw new TypeError(`Unsupport plugin type: ${type}`)
}

export interface PluginConfig {
  transform: string
  import?: string
  type?: 'program' | 'config' | 'checker' | 'raw' | 'compilerOptions'
  after?: boolean
  afterDeclarations?: boolean
  [options: string]: any
}

export function getTransformers (customTransformers: ts.CustomTransformers, tsconfig: string, compilerOptions: ts.CompilerOptions, program: ts.Program): void {
  const _require = createRequire(resolve(tsconfig))
  if (Array.isArray(compilerOptions.plugins)) {
    const plugins = compilerOptions.plugins as any as Array<PluginConfig | string>
    for (let i = 0; i < plugins.length; ++i) {
      let plugin = plugins[i]
      if (typeof plugin === 'string') plugin = { transform: plugin }
      const { transform, type, after, afterDeclarations, ...config } = plugin
      delete config.import
      const mod = _require(transform)
      const target = plugin.import ? mod[plugin.import] : getDefault(mod)
      const timing = after ? 'after' : (afterDeclarations ? 'afterDeclarations' : 'before')
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ;(customTransformers[timing] || (customTransformers[timing] = [])).push(
        getTransformer(target, type, config, compilerOptions, program)
      )
    }
  }
}

export function withTransformerOption (
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
