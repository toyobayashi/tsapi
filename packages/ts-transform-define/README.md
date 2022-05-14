# ts-transform-define

Similar to `webpack.DefinePlugin`

## Usage

```bash
npm install -D @tybys/ts-transform-define
```

<details>
<summary>ttypescript</summary><br />

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "@tybys/ts-transform-define",
        "evaluateTypeof": true,
        "defines": {
          "process.env": {
            "NODE_ENV": "'development'"
          },
          "NULL": 0,
          "predefinedNestedObject": {
            "array": [{ "value": 0 }]
          }
        }
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
                    require('@tybys/ts-transform-define').default(program, {
                      defines: {
                        'process.env': {
                          NODE_ENV: "'development'"
                        },
                        NULL: 0,
                        predefinedNestedObject: {
                          array: [{ value: 0 }]
                        }
                      }
                    })
                  ]
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
           {
            type: 'program',
            factory: (program) => {
              return require('@tybys/ts-transform-define').default(program, {
                defines: {
                  'process.env': {
                    NODE_ENV: "'development'"
                  },
                  NULL: 0,
                  predefinedNestedObject: {
                    array: [{ value: 0 }]
                  }
                }
              })
            }
          }
        ]
      }
    })
  ]
}
```

<br />
</details>

Input:

```ts
console.log(process.env)
console.log(typeof process.env)
console.log(process.env.NODE_ENV)
console.log(typeof process.env.NODE_ENV)
console.log(NULL)
console.log(typeof NULL)
console.log(predefinedNestedObject)
console.log(predefinedNestedObject.array)
console.log(typeof predefinedNestedObject.array)
```

Output:

```js
console.log(Object({ NODE_ENV: 'development' }));
console.log("object");
console.log('development');
console.log("string");
console.log(0);
console.log("number");
console.log(Object({ array: Object([Object({ value: 0 })]) }));
console.log(Object([Object({ value: 0 })]));
console.log("object");
```
