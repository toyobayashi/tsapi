declare const TEST: any
declare const NULL: 0
declare const predefinedNestedObject: any
const a = TEST

function f (TEST) {}

console.log(TEST.e)

class A {
  a (TEST) {

  }
}

console.log(typeof TEST)
console.log(process.env)
console.log(typeof process.env)
console.log(process.env.NODE_ENV)
console.log(typeof process.env.NODE_ENV)
console.log(NULL)
console.log(typeof NULL)
console.log(predefinedNestedObject)
console.log(typeof predefinedNestedObject)
console.log(predefinedNestedObject.array)
console.log(typeof predefinedNestedObject.array)
