var require
;(function (top, external) {
  "use strict";

  var modules = {}
    , cache   = {}

  function global(s, x) {
    modules[s] = {
      type: "global",
      value: x
    }
  }

  function define(s, x) {
    modules[s] = {
      type: "define",
      value: x
    }
  }

  function abs(s, path) {
    var p = s.split(/\/+/g) // Handles things like foo//bar
    if (p[0] === "." || p[0] === "..") {
      var r = path.slice()
      for (var i = 0; i < p.length; ++i) {
        if (p[i] === "..") {
          if (r.length) {
            r.pop()
          } else {
            // TODO test
            throw new Error("too many .. in module path \"" + s + "\"")
          }
        } else if (p[i] !== ".") {
          r.push(p[i])
        }
      }
      return r
    } else {
      return p
    }
  }

  function require1(sTop, path) {
    var p = abs(sTop, path)
      , s = p.join("/")

    if (!(s in cache)) {
      if (s in modules) {
        var m = modules[s]
        if (m.type === "define") {
          var module = {}

          cache[s] = module.exports = {}

          var require = makeRequire(p.slice(0, -1)) // TODO is this correct ?
            , value   = m.value

          if (typeof value === "string") {
            // Can't use `new Function` because then the source mapping is incorrect in Chrome 33.0.1734.0 dev
            // TODO Use top.eval ?
            value = (0, eval)("(function (require, exports, module) {\n" + value + "\n})")
          }
          value.call(module.exports, require, module.exports, module)

          cache[s] = module.exports

        } else if (m.type === "global") {
          cache[s] = top
          // TODO Use top.eval ?
          (0, eval)(m.value)

        } else {
          throw new Error("invalid module type: " + m.type)
        }

      } else if (typeof external === "function") {
        cache[s] = external(sTop) // TODO should this be s or sTop?

      } else {
        throw new Error("module \"" + sTop + "\" does not exist")
      }
    }
    return cache[s]
  }

  function makeRequire(path) {
    var require = function (s) {
      return require1(s, path)
    }
    return require
  }

  top.require = makeRequire([])
  top.define  = define
  top.global  = global
})(this, require)