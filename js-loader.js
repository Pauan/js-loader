"use strict";

var sourceMap = require("source-map")
  , path      = require("path")
  , fs        = require("fs")

// TODO unprintable characters and such
function escapeString(s) {
  return "\"" + s.replace(/[\\\"]/g, "\\$&").replace(/\n/g, "\\n") + "\""
}

function relative(x, y) {
  return path.relative(path.dirname(y), x)
}

function Bundle() {
  this.modules    = []
  this.requires   = []
  this.transforms = []
}
exports.Bundle = Bundle

var types = {
  "commonjs": function (name, code) {
    return "define(" + name + ", " + code + ")"
  },
  "global": function (name, code) {
    return "global(" + name + ", " + code + ")"
  }
}

Bundle.prototype.add = function (type, module, options) {
  if (options == null) {
    options = {}
  }

  if (!(type in types)) {
    throw new Error("expected " + Object.keys(types).join(", ") + " but got " + type)
  }

  var file   = options.file
    , code   = options.code
    , source = options.source

  if (file == null) {
    file = module + ".js"
  }
  if (code == null) {
    code = fs.readFileSync(file, { encoding: "utf8" })
  }

  if (source == null) {
    source = {}
  }
  if (source.file == null) {
    source.file = file
  }
  if (source.code == null) {
    source.code = fs.readFileSync(source.file, { encoding: "utf8" })
  }

  // source.map is optional
  if (source.map != null) {
    if (source.map.file == null && source.map.code == null) {
      throw new Error("if `source.map` is used, it must have a `source.map.file` and/or `source.map.code` property")
    }
    if (source.map.code == null) {
      source.map.code = fs.readFileSync(source.map.file, { encoding: "utf8" })
    }
    if (typeof source.map.code === "string") {
      // Strip )]} at the beginning, as per the spec
      source.map.code = JSON.parse(source.map.code.replace(/^\)\]\}[^\n]*(?:\n|$)/, ""))
    }
  }

  this.modules.push({
    type: type,
    name: module,
    file: file,
    code: code,
    source: source
  })
}

Bundle.prototype.require = function (module) {
  this.requires.push(module)
}

Bundle.prototype.transform = function (f) {
  this.transforms.push(f)
}

Bundle.prototype.writeFiles = function (sCode, sMap) {
  this.asString(sCode, sMap, function (code, map) {
    fs.writeFileSync(sCode, code)
    fs.writeFileSync(sMap, map)
  })
}

Bundle.prototype.asString = function (sCode, sMap, f) {
  var self = this

  var output = new sourceMap.SourceMapGenerator({ file: sCode/*, sourceRoot: options.sourceRoot*/ })

  self.modules.forEach(function (x) {
    if (self.transforms.length) {
      self.transforms.forEach(function (f) {
        f(x)
      })
    }

    if (x.source.map != null) {
      var input = new sourceMap.SourceMapConsumer(x.source.map.code)
      //map.applySourceMap(new sourceMap.SourceMapConsumer(x.map), x.name)
      // TODO should only iterate over the mappings for the first file...?
      input.eachMapping(function (m) {
        // TODO should check (m.source === relative(x.source.file, x.source.map.file)) ?
        output.addMapping({
          generated: { line: m.generatedLine, column: m.generatedColumn },
          original:  { line: m.originalLine,  column: m.originalColumn  },
          source:    x.source.file, // TODO m.source ?
          name:      m.name
        })
      })

      output.setSourceContent(x.source.file, x.source.code)
    }
  })

  var code = fs.readFileSync(path.join(__dirname, "require.js"), { encoding: "utf8" })

  code += "\n" + self.modules.map(function (x) {
    // TODO shouldn't remove //@ and //# inside strings
    // .replace(/\/\/[@#] *(?:sourceURL|sourceMappingURL)=[^\n]*(?:\n|$)/g, "")
    var s = x.code + "\n//# sourceURL=" + x.source.file

    if (x.source.map != null) {
      // TODO this is hacky, but it seems to be the only way...
      s += "\n//# sourceMappingURL=" + relative(sMap, x.source.file)
    }

    return types[x.type](escapeString(x.name), escapeString(s))
  }).join("\n")

  if (self.requires.length) {
    code += "\n" + self.requires.map(function (x) {
      return "require(" + escapeString(x) + ")"
    }).join("\n")
  }

  f(code, ")]}\n" + output)
}