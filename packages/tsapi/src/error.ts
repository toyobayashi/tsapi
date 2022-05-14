export class TSError extends Error {
  constructor (msg: string, public code: number) {
    super(msg)
  }
}

Object.defineProperty(TSError.prototype, 'name', {
  configurable: true,
  value: 'TSError'
})
