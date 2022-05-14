# ts-transform-pure-class

Replace `/** @class */` to `/*#__PURE__*/` in ES5 class output for better tree shaking.

Input:

```ts
class C {}
```

Output:

```js
var C = /*#__PURE__*/ (function () {
    function C() {
    }
    return C;
}());
```

## Usage

```bash
npm install -D @tybys/ts-transform-pure-class
```

<details>
<summary>ttypescript</summary><br />

```json
{
  "compilerOptions": {
    "removeComments": false,
    "target": "ES5",
    "plugins": [
      {
        "transform": "@tybys/ts-transform-pure-class",
        "type": "raw",
        "after": true
      }
    ]
  }
}
```

<br />
</details>

<details>
<summary>webpack</summary><br />

```json
{
  "compilerOptions": {
    "removeComments": false,
    "target": "ES5"
  }
}
```

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
              getCustomTransformers () {
                return {
                  after: [require('@tybys/ts-transform-pure-class').default]
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

```json
{
  "compilerOptions": {
    "removeComments": false,
    "target": "ES5",
    "module": "ESNext"
  }
}
```

```js
// rollup.config.js
import { join } from 'path'
import typescript from '@rollup/plugin-typescript'

export default {
  plugins: [
    typescript({
      transformers: {
        after: [require('@tybys/ts-transform-pure-class').default]
      }
    })
  ]
}
```

<br />
</details>
