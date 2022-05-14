class EmptyClass {}

class NormalClass {
  public constructor (public prop: any) {}

  public method () {}
}

class SubClass extends NormalClass {
  public constructor () {
    super(1)
  }
}

class Nested {
  public C = class {}
  public static S = class {}
}

const DoNotReplace = /** @class */ (function () {
  return function () {}
}())

function f (...args: any[]) {}

f(class X {}, [class Y {}])
