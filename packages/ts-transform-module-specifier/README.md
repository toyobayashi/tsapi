# ts-transform-module-specifier

## Usage

```bash
npm install -D @tybys/ts-transform-module-specifier
```

<details>
<summary>ttypescript</summary><br />

```json
{
  "compilerOptions": {
    "target": "ES5",
    "module": "ESNext",
    "importHelpers": true,
    "noEmitHelpers": true,
    "plugins": [
      {
        "transform": "@tybys/ts-transform-module-specifier",
        "type": "config",
        "targets": [
          {
            "test": "^(\\./[^.]+)$",
            "replacer": "$1.mjs"
          },
          {
            "test": "^(\\./.+)(\\.[^.]+)$",
            "replacer": "$1.mjs"
          }
        ]
      },
      {
        "transform": "@tybys/ts-transform-module-specifier",
        "type": "config",
        "after": true,
        "targets": [
          {
            "test": "^tslib$",
            "replacer": "my-tslib"
          }
        ]
      }
    ]
  }
}
```

<br />
</details>

<details>
<summary>webpack</summary><br />

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              getCustomTransformers (program) {
                return {
                  before: [
                    require('@tybys/ts-transform-module-specifier').default({
                      targets: [
                        {
                          replacer: (_currentSourceFile, request) => {
                            if (request.charAt(0) !== '.') {
                              return request
                            }
                            return removeSuffix(request) + '.mjs'
                          }
                        }
                      ]
                    })
                  ],
                  after: [
                    require('@tybys/ts-transform-module-specifier').default({
                      targets: [
                        {
                          replacer: (_currentSourceFile, request) => {
                            if (request === 'tslib') {
                              return 'my-tslib'
                            }
                            return request
                          }
                        }
                      ]
                    })
                  ],
                }
              }
            }
          }
        ]
      }
    ]
  }
}
```

<br />
</details>

<details>
<summary>rollup</summary><br />

```js
// rollup.config.js
import { join } from 'path'
import typescript from '@rollup/plugin-typescript'

export default {
  plugins: [
    typescript({
      transformers: {
        before: [
          require('@tybys/ts-transform-module-specifier').default({
            targets: [
              {
                replacer: (_currentSourceFile, request) => {
                  if (request.charAt(0) !== '.') {
                    return request
                  }
                  return removeSuffix(request) + '.mjs'
                }
              }
            ]
          })
        ],
        after: [
          require('@tybys/ts-transform-module-specifier').default({
            targets: [
              {
                replacer: (_currentSourceFile, request) => {
                  if (request === 'tslib') {
                    return 'my-tslib'
                  }
                  return request
                }
              }
            ]
          })
        ]
      }
    })
  ]
}
```

<br />
</details>
