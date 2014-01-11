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

          var x = (typeof m.value === "function"
                    ? m.value.call(module.exports, require, module.exports, module)
                    : new Function("require", "exports", "module", m.value).call(module.exports, require, module.exports, module))

          // For Require.js style modules
          if (typeof x !== "undefined") {
            cache[s] = module.exports = x
          }

        } else if (m.type === "global") {
          // TODO call top.eval ?
          (0, eval)(m.value)
          cache[s] = top

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
    return function (s) {
      return require1(s, path)
    }
  }

  top.require = makeRequire([])
  top.define  = define
  top.global  = global
})(this, require)