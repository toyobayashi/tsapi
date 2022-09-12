import type {
  Program,
  CustomTransformers,
  CompilerOptions
} from 'typescript'

export interface TypeCheckOptions {
  ignoreErrorCodes?: number[]
  optionsToExtend?: CompilerOptions
  customTransformersBefore?: (program: Program) => CustomTransformers
  customTransformersAfter?: (program: Program) => CustomTransformers
}

export interface TransformOptions extends TypeCheckOptions {
  transpileOnly?: boolean
  outputSuffix?: string
}

export interface WatchTransformOptions extends TypeCheckOptions {
  outputSuffix?: string
}
