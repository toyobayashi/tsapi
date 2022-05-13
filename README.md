# tsapi

Building typescript project by programming way.

Also support ttypescript transformers in `compilerOptions.plugins`

```js
const { compile, watch } = require('@tybys/tsapi')

compile('./tsconfig.json') // tsc -p ./tsconfig.json

watch('./tsconfig.json') // tsc -w -p ./tsconfig.json
```
