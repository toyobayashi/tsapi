import type {
  TransformerFactory,
  SourceFile,
  Visitor
} from 'typescript'

import {
  isParenthesizedExpression,
  isCallExpression,
  isPartiallyEmittedExpression,
  getSyntheticLeadingComments,
  // setSyntheticLeadingComments,
  visitEachChild
} from 'typescript'

const transformerFactory: TransformerFactory<SourceFile> = (context) => {
  const visitor: Visitor = (node) => {
    if (
      isParenthesizedExpression(node) &&
      isCallExpression(node.expression) &&
      isPartiallyEmittedExpression(node.expression.expression)
    ) {
      const leadingComments = getSyntheticLeadingComments(node)
      if (leadingComments && leadingComments.length === 1 && leadingComments[0].text === '* @class ') {
        leadingComments[0].text = '#__PURE__'
        // setSyntheticLeadingComments(node, leadingComments)
      }
    }
    return visitEachChild(node, visitor, context)
  }

  return (src) => {
    if (src.isDeclarationFile) return src
    return visitEachChild(src, visitor, context)
  }
}

export default transformerFactory
