import type {
  TransformerFactory,
  SourceFile,
  Visitor
} from 'typescript'

import * as ts from 'typescript'

const transformerFactory: TransformerFactory<SourceFile> = (context) => {
  const visitor: Visitor = (node) => {
    if (
      ts.isParenthesizedExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isPartiallyEmittedExpression(node.expression.expression)
    ) {
      const leadingComments = ts.getSyntheticLeadingComments(node)
      if (leadingComments && leadingComments.length === 1 && leadingComments[0].text === '* @class ') {
        leadingComments[0].text = '#__PURE__'
        // ts.setSyntheticLeadingComments(node, leadingComments)
      }
    }
    return ts.visitEachChild(node, visitor, context)
  }

  return (src) => {
    if (src.isDeclarationFile) return src
    return ts.visitEachChild(src, visitor, context)
  }
}

export default transformerFactory
