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
  Node,
  ParenthesizedExpression,
  StringLiteral
} from 'typescript'

import * as ts from 'typescript'

import * as vm from 'vm'

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
}

type CheckResultFalse = {
  result: false
  stop?: boolean
}

type CheckResultTrue<T = any> = {
  result: true
  value: T
  stop?: boolean
}

type CheckResult = CheckResultFalse | CheckResultTrue

function canReplaceIdentifier (node: Identifier, typeChecker: TypeChecker, defines: Record<string, any>, defineKeys: string[]): CheckResult {
  const result = Boolean(node.text) && defineKeys.includes(node.text) &&
    !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    !isVar(node) &&
    !hasValueSymbol(node, typeChecker)
  if (result) {
    return { result, value: defines[node.text] }
  }
  return { result }
}

function isValidPropertyAccessExpression (node: PropertyAccessExpression): boolean {
  if (!ts.isIdentifier(node.name)) return false
  if (ts.isPropertyAccessExpression(node.expression)) {
    return isValidPropertyAccessExpression(node.expression)
  }
  return ts.isIdentifier(node.expression)
}

function canReplacePropertyAccessExpression (node: PropertyAccessExpression, typeChecker: TypeChecker, defines: Record<string, any>): CheckResult {  
  if (!isValidPropertyAccessExpression(node)) {
    return { result: false }
  }

  const symbol = typeChecker.getSymbolAtLocation(node)
  if (symbol?.valueDeclaration && !ts.isPropertySignature(symbol.valueDeclaration)) {
    return { result: false }
  }

  const access = node.getText().split('.').map(s => s.trim())
  let p = defines
  for (let i = 0; i < access.length; ++i) {
    if (typeof p === 'object' && p !== null && Object.keys(p).includes(access[i])) {
      p = p[access[i]]
    } else {
      return { result: false, stop: Boolean(access.length === 3 && access[0] === 'process' && access[1] === 'env' && access[2]) }
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
      return factory.createStringLiteral(typeof vm.runInNewContext(value))
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
    if (value === 0) {
      if (1 / value < 0) {
        return factory.createNumericLiteral('-0')
      }
      factory.createNumericLiteral(0)
    }
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
    // return factory.createCallExpression(
    //   factory.createIdentifier('Object'),
    //   undefined,
    //   [factory.createArrayLiteralExpression(elements, false)]
    // )
    return factory.createArrayLiteralExpression(elements, false)
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
    // return factory.createCallExpression(
    //   factory.createIdentifier('Object'),
    //   undefined,
    //   [factory.createObjectLiteralExpression(properties, false)]
    // )
    return factory.createObjectLiteralExpression(properties, false)
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

function tryApply<R extends Node> (
  node: Node,
  typeChecker: TypeChecker,
  defines: Record<string, any>,
  defineKeys: string[],
  replacer: (check: CheckResult) => R | undefined
): R | undefined {
  if (ts.isParenthesizedExpression(node)) {
    let exp: Node = node
    do {
      exp = (exp as ParenthesizedExpression).expression
    } while (exp && ts.isParenthesizedExpression(exp))
    return tryApply(exp, typeChecker, defines, defineKeys, replacer)
  }

  // obj.prop1.prop2
  if (ts.isPropertyAccessExpression(node)) {
    const check = canReplacePropertyAccessExpression(node, typeChecker, defines)
    return replacer(check)
  }

  if (ts.isIdentifier(node)) {
    const check = canReplaceIdentifier(node, typeChecker, defines, defineKeys)
    return replacer(check)
  }

  return undefined
}

function defineTransformer (program: Program, config: DefineOptions): TransformerFactory<SourceFile> {
  const defines = resolveDefines(config.defines ?? {})
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
        if (ts.isCallChain(node)) {
          return factory.createCallChain(
            tryApply(
              node.expression, typeChecker, defines, defineKeys,
              (check) => (
                check.result && typeof check.value === 'function'
                  ? toExpression(check.value, factory, true)!
                  : (check.stop ? node.expression : undefined)
              )
            ) ?? ts.visitNode(node.expression, visitor),
            node.questionDotToken,
            node.typeArguments,
            node.arguments.map(e => ts.visitNode(e, visitor))
          )
        }
        return factory.createCallExpression(
          tryApply(
            node.expression, typeChecker, defines, defineKeys,
            (check) => (
              check.result && typeof check.value === 'function'
                ? toExpression(check.value, factory, true)!
                : (check.stop ? node.expression : undefined)
            )
          ) ?? ts.visitNode(node.expression, visitor),
          node.typeArguments,
          node.arguments.map(e => ts.visitNode(e, visitor))
        )
      }

      // typeof (identifier)
      if (ts.isTypeOfExpression(node)) {
        return tryApply(
          node.expression, typeChecker, defines, defineKeys,
          (check) => check.result ? toTypeof(check.value, factory, true) : (check.stop ? node.expression : undefined)
        ) ?? ts.visitEachChild(node, visitor, context)
      }

      return tryApply(
        node, typeChecker, defines, defineKeys,
        (check) => check.result ? toExpression(check.value, factory, true) : (check.stop ? node : undefined)
      ) ?? ts.visitEachChild(node, visitor, context)
    }

    return (src) => {
      if (src.isDeclarationFile) return src
      return ts.visitEachChild(src, visitor, context)
    }
  }
}

export default defineTransformer
