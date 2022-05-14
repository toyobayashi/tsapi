import type {
  TransformerFactory,
  SourceFile,
  Visitor,
  Program,
  Identifier,
  TypeChecker,
  NodeFactory,
  ObjectLiteralElementLike,
  PropertyAccessExpression,
  Expression,
  StringLiteral
} from 'typescript'

import * as ts from 'typescript'

import { runInNewContext } from 'vm'

import { isPlainObject } from 'is-plain-object'

function isVar (node: Identifier): boolean {
  return (
    ts.isFunctionDeclaration(node.parent) ||
    ts.isClassDeclaration(node.parent) ||
    ts.isInterfaceDeclaration(node.parent) ||
    ts.isTypeAliasDeclaration(node.parent) ||
    ts.isEnumDeclaration(node.parent) ||
    ts.isModuleDeclaration(node.parent)
  )
}

export interface DefineOptions {
  defines?: Record<string, any>
  evaluateTypeof?: boolean
}

type CheckResult = {
  result: false
} | {
  result: true
  value: any
}

function canReplaceIdentifier (node: Identifier, typeChecker: TypeChecker, defines: Record<string, any>, defineKeys: string[]): CheckResult {
  const result = Boolean(node.text) && defineKeys.includes(node.text) &&
    !isVar(node) &&
    !hasValueSymbol(node, typeChecker)
  if (result) {
    return { result, value: defines[node.text] }
  }
  return { result }
}

function canReplacePropertyAccessExpression (node: PropertyAccessExpression, typeChecker: TypeChecker, defines: Record<string, any>): CheckResult {
  const symbol = typeChecker.getSymbolAtLocation(node)
  if (symbol?.valueDeclaration && !ts.isPropertySignature(symbol.valueDeclaration)) {
    return { result: false }
  }
  const access = node.getText().split('.')
  let p = defines
  for (let i = 0; i < access.length; ++i) {
    if (typeof p === 'object' && p !== null && Object.keys(p).includes(access[i])) {
      p = p[access[i]]
    } else {
      return { result: false }
    }
  }
  return { result: true, value: p }
}

function hasValueSymbol (node: Identifier, typeChecker: TypeChecker): boolean {
  const nodeSymbol = typeChecker.getSymbolAtLocation(node)
  if (!nodeSymbol) return false
  if (!nodeSymbol.valueDeclaration) return true
  if (ts.isVariableDeclaration(nodeSymbol.valueDeclaration)) {
    if (ts.isVariableStatement(nodeSymbol.valueDeclaration.parent.parent)) {
      return !(nodeSymbol.valueDeclaration.parent.parent.modifiers != null &&
        nodeSymbol.valueDeclaration.parent.parent.modifiers.filter(m => m.kind === ts.SyntaxKind.DeclareKeyword).length > 0)
    }
    return true
  }
  if (
    ts.isFunctionDeclaration(nodeSymbol.valueDeclaration) ||
    ts.isClassDeclaration(nodeSymbol.valueDeclaration) ||
    ts.isEnumDeclaration(nodeSymbol.valueDeclaration) ||
    ts.isModuleDeclaration(nodeSymbol.valueDeclaration)
  ) {
    return !(nodeSymbol.valueDeclaration.modifiers != null &&
      nodeSymbol.valueDeclaration.modifiers.filter(m => m.kind === ts.SyntaxKind.DeclareKeyword).length > 0)
  }
  if (
    ts.isInterfaceDeclaration(nodeSymbol.valueDeclaration) ||
    ts.isTypeAliasDeclaration(nodeSymbol.valueDeclaration)
  ) {
    return false
  }
  return true
}

function toTypeof (value: any, factory: NodeFactory, stringIsCode: boolean): StringLiteral | undefined {
  const type = typeof value
  if (type !== 'string') return factory.createStringLiteral(type)
  if (!stringIsCode) return factory.createStringLiteral('string')
  try {
    const runtimeValue = JSON.parse(value)
    return factory.createStringLiteral(typeof runtimeValue)
  } catch (_) {
    if (value === 'undefined') {
      return factory.createStringLiteral('undefined')
    }
    if (value === 'NaN') {
      return factory.createStringLiteral('number')
    }
    try {
      return factory.createStringLiteral(typeof runInNewContext(value))
    } catch (_) {
      return undefined
    }
  }
}

function toExpression (value: any, factory: NodeFactory, stringIsCode: boolean): Expression | undefined {
  if (value === undefined) {
    return factory.createIdentifier('undefined')
  }
  if (value === null) {
    return factory.createNull()
  }
  if (Number.isNaN(value)) {
    return factory.createIdentifier('NaN')
  }
  if (typeof value === 'number') {
    return factory.createNumericLiteral(value)
  }
  if (typeof value === 'boolean') {
    return value ? factory.createTrue() : factory.createFalse()
  }
  if (typeof value === 'string') {
    return stringIsCode
      ? factory.createIdentifier(value)
      : factory.createStringLiteral(value)
  }
  if (typeof value === 'symbol') {
    const symbolString = value.toString()
    return factory.createCallExpression(
      factory.createIdentifier('Symbol'),
      undefined,
      [factory.createStringLiteral(symbolString.substring(7, symbolString.length - 1))]
    )
  }
  if (typeof value === 'bigint') {
    return factory.createBigIntLiteral(`${String(value)}n`)
  }
  if (typeof value === 'function') {
    return factory.createIdentifier(`(${(value as Function).toString()})`)
  }
  if (Array.isArray(value)) {
    const elements: Expression[] = []
    for (let i = 0; i < value.length; ++i) {
      const exp = toExpression(value[i], factory, true)
      if (exp) {
        elements[i] = exp
      } else {
        elements[i] = factory.createIdentifier('undefined')
      }
    }
    return factory.createCallExpression(
      factory.createIdentifier('Object'),
      undefined,
      [factory.createArrayLiteralExpression(elements, false)]
    )
  }
  if (value instanceof Date) {
    return factory.createParenthesizedExpression(factory.createNewExpression(
      factory.createIdentifier('Date'),
      undefined,
      [factory.createNumericLiteral(value.getTime())]
    ))
  }
  if (value instanceof RegExp) {
    return factory.createRegularExpressionLiteral(value.toString())
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    const properties: ObjectLiteralElementLike[] = []
    for (const k of keys) {
      const exp = toExpression(value[k], factory, true)
      if (exp) {
        properties.push(factory.createPropertyAssignment(
          factory.createIdentifier(k),
          exp
        ))
      }
    }
    return factory.createCallExpression(
      factory.createIdentifier('Object'),
      undefined,
      [factory.createObjectLiteralExpression(properties, false)]
    )
  }
  return undefined
}

function resolveDefines (defines: any): any {
  if (defines === null || typeof defines !== 'object') return defines
  if (Array.isArray(defines)) {
    return defines.map(resolveDefines)
  }
  if (!isPlainObject(defines)) return defines
  const res: any = {}
  const defineKeys = Object.keys(defines)
  for (const key of defineKeys) {
    const value = defines[key]
    const props = key.split('.')
    let i = 0
    let o = res
    let p: string
    for (; i < props.length - 1; ++i) {
      p = props[i]
      o[p] = o[p] || {}
      o = o[p]
    }
    p = props[i]
    o[p] = resolveDefines(value)
  }

  return res
}

function defineTransformer (program: Program, config: DefineOptions): TransformerFactory<SourceFile> {
  const defines = resolveDefines(config.defines ?? {})
  const evaluateTypeof = Boolean(config.evaluateTypeof)
  const defineKeys = Object.keys(defines)
  const typeChecker = program.getTypeChecker()
  return (context) => {
    const factory = context.factory

    const visitor: Visitor = (node) => {
      if (defineKeys.length === 0) return node

      // ignore import and export
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node

      // let name = initializer, name = initializer
      if (ts.isVariableDeclaration(node) && node.initializer) {
        return factory.createVariableDeclaration(
          node.name,
          node.exclamationToken,
          node.type,
          ts.visitNode(node.initializer, visitor)
        )
      }
      // left = right
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        return factory.createBinaryExpression(
          node.left,
          ts.SyntaxKind.EqualsToken,
          ts.visitNode(node.right, visitor)
        )
      }

      // { name: initializer, name: initializer }
      if (ts.isPropertyAssignment(node)) {
        return factory.createPropertyAssignment(node.name, ts.visitNode(node.initializer, visitor))
      }

      // expression(...arguments)
      if (ts.isCallExpression(node)) {
        return factory.createCallExpression(
          node.expression,
          node.typeArguments,
          node.arguments.map(e => ts.visitNode(e, visitor))
        )
      }

      // typeof (identifier)
      if (evaluateTypeof && ts.isTypeOfExpression(node)) {
        let exp: Expression = node.expression
        while (ts.isParenthesizedExpression(exp)) {
          exp = exp.expression
        }

        if (ts.isPropertyAccessExpression(exp)) {
          const check = canReplacePropertyAccessExpression(exp, typeChecker, defines)
          if (check.result) {
            return toTypeof(check.value, factory, true) ?? exp
          }
          return exp
        }

        if (ts.isIdentifier(exp)) {
          const check = canReplaceIdentifier(exp, typeChecker, defines, defineKeys)
          if (check.result) {
            return toTypeof(check.value, factory, true) ?? exp
          }
          return exp
        }

        return ts.visitEachChild(node, visitor, context)
      }

      // obj.prop1.prop2
      if (ts.isPropertyAccessExpression(node)) {
        const check = canReplacePropertyAccessExpression(node, typeChecker, defines)
        if (check.result) {
          const exp = toExpression(check.value, factory, true)
          return exp ?? node
        }
        return node
      }

      if (ts.isIdentifier(node)) {
        const check = canReplaceIdentifier(node, typeChecker, defines, defineKeys)
        if (check.result) {
          const exp = toExpression(check.value, factory, true)
          return exp ?? node
        }
        return node
      }

      return ts.visitEachChild(node, visitor, context)
    }
    return (src) => {
      if (src.isDeclarationFile) return src
      return ts.visitEachChild(src, visitor, context)
    }
  }
}

export default defineTransformer
