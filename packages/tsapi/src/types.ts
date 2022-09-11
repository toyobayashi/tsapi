import type {
  Program,
  CustomTransformers,
  CompilerOptions
} from 'typescript'

export interface TransformOptions {
  transpileOnly?: boolean
  ignoreErrorCodes?: number[]
  optionsToExtend?: CompilerOptions
  outputSuffix?: string
  customTransformersBefore?: (program: Program) => CustomTransformers
  customTransformersAfter?: (program: Program) => CustomTransformers
}
