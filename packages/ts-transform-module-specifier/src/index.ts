import type {
  TransformerFactory,
  SourceFile,
  Visitor,
  NodeFactory,
  StringLiteral
} from 'typescript'

import * as ts from 'typescript'

const ts5 = Number(ts.version.charAt(0)) >= 5

function replaceModuleSpecifier (
  node: StringLiteral,
  factory: NodeFactory,
  config: Options,
  currentSourceFile: string
) {
  const text = node.text
  const targets = config.targets || []

  let replacer: (currentSourceFile: string, substring: string, ...args: any[]) => string

  for (let i = 0; i < targets.length; ++i) {
    const target = targets[i]

    if (target.test === undefined) {
      if (typeof target.replacer !== 'function') continue
      const result = target.replacer(currentSourceFile, text)
      if (result && typeof result === 'string') {
        return factory.createStringLiteral(result)
      }
      continue
    }

    const regex = typeof target.test === 'string'
      ? new RegExp(target.test)
      : (target.test && (target.test instanceof RegExp))
        ? target.test
        : undefined

    const replacement = typeof target.replacer === 'string'
      ? target.replacer
      : typeof target.replacer === 'function'
        ? (replacer = target.replacer, function (substring: string, ...args: any[]): string {
            return replacer(currentSourceFile, substring, ...args)
          })
        : undefined

    if (regex !== undefined && replacement !== undefined && regex.test(text)) {
      return factory.createStringLiteral(text.replace(regex, replacement as any))
    }
  }

  return node
}

export interface ReplaceTarget {
  test: string | RegExp
  replacer: string | ((currentSourceFile: string, substring: string, ...args: any[]) => string)
}

export interface Options {
  targets: ReplaceTarget[]
}

function defineTransformer (config: Options): TransformerFactory<SourceFile> {
  return (context) => {
    const factory = context.factory

    let currentSourceFile = ''

    const visitor: Visitor = (node) => {
      if (ts.isImportDeclaration(node)) {
        if (ts5) {
          return factory.createImportDeclaration(
            node.modifiers,
            node.importClause,
            replaceModuleSpecifier(node.moduleSpecifier as StringLiteral, factory, config, currentSourceFile)
          )
        }
        return (factory as any).createImportDeclaration(
          (node as any).decorators,
          node.modifiers,
          node.importClause,
          replaceModuleSpecifier(node.moduleSpecifier as StringLiteral, factory, config, currentSourceFile)
        )
      }

      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        if (ts5) {
          return factory.createImportEqualsDeclaration(
            node.modifiers,
            node.isTypeOnly,
            node.name,
            factory.createExternalModuleReference(replaceModuleSpecifier(node.moduleReference.expression as StringLiteral, factory, config, currentSourceFile))
          )
        }
        return (factory as any).createImportEqualsDeclaration(
          (node as any).decorators,
          node.modifiers,
          node.isTypeOnly,
          node.name,
          factory.createExternalModuleReference(replaceModuleSpecifier(node.moduleReference.expression as StringLiteral, factory, config, currentSourceFile))
        )
      }

      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        if (ts5) {
          return factory.createExportDeclaration(
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            replaceModuleSpecifier(node.moduleSpecifier, factory, config, currentSourceFile)
          )
        }
        return (factory as any).createExportDeclaration(
          (node as any).decorators,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          replaceModuleSpecifier(node.moduleSpecifier, factory, config, currentSourceFile)
        )
      }

      if (ts.isCallExpression(node)
        && node.expression
        && ((ts.isIdentifier(node.expression) && node.expression.escapedText === 'require') || node.expression.kind === ts.SyntaxKind.ImportKeyword)
        && node.arguments.length === 1
        && ts.isStringLiteral(node.arguments[0])
      ) {
        return factory.createCallExpression(
          node.expression,
          node.typeArguments,
          [replaceModuleSpecifier(node.arguments[0], factory, config, currentSourceFile)]
        )
      }

      if (ts.isImportTypeNode(node)) {
        if (ts5) {
          return factory.createImportTypeNode(
            factory.createLiteralTypeNode(replaceModuleSpecifier((node.argument as any).literal, factory, config, currentSourceFile)),
            node.assertions,
            node.qualifier,
            node.typeArguments,
            node.isTypeOf
          )
        }
        return (factory as any).createImportTypeNode(
          factory.createLiteralTypeNode(replaceModuleSpecifier((node.argument as any).literal, factory, config, currentSourceFile)),
          node.qualifier,
          node.typeArguments,
          node.isTypeOf
        )
      }

      return ts.visitEachChild(node, visitor, context)
    }

    return (src) => {
      if (src.isDeclarationFile) return src
      currentSourceFile = src.fileName
      return ts.visitEachChild(src, visitor, context)
    }
  }
}

export default defineTransformer
