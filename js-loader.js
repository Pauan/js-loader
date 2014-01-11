"use strict";

var sourceMap = require("source-map")
  , path      = require("path")
  , fs        = require("fs")

// TODO unprintable characters and such
function escapeString(s) {
  return "\"" + s.replace(/[\\\"]/g, "\\$&").replace(/\n/g, "\\n") + "\""
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

// TODO typeof checking for module argument
Bundle.prototype.add = function (type, module, options) {
  if (options == null) {
    options = {}
  }

  if (!(type in types)) {
    throw new Error("expected " + Object.keys(types).join(", ") + " but got " + type)
  }

  if (options.file != null && options.code != null) {
    throw new Error("cannot use both file and code properties at the same time")
  }
  if (options.map != null && options.mapFile != null) {
    throw new Error("cannot use both map and mapFile properties at the same time")
  }

  var file   = options.file
    , code   = options.code
    , map    = options.map
    , source = options.source

  if (file == null) {
    file = module + ".js"
  }
  if (code == null) {
    code = fs.readFileSync(file, { encoding: "utf8" })
  }
  if (typeof code !== "string") {
    throw new Error("the code property must be a string")
  }

  if (map == null) {
    if (options.mapFile != null) {
      map = fs.readFileSync(options.mapFile, { encoding: "utf8" })
    }
  }

  if (source == null) {
    source = code
  }

  this.modules.push({
    type: type,
    name: module,
    source: source,
    code: code,
    map: map
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

  var map = new sourceMap.SourceMapGenerator({ file: sCode/*, sourceRoot: options.sourceRoot*/ })

  self.modules.forEach(function (x) {
    if (self.transforms.length) {
      self.transforms.forEach(function (f) {
        f(x)
      })
    }

    // map is optional
    if (x.map != null) {
      //map.applySourceMap(new sourceMap.SourceMapConsumer(x.map), x.name)
      new sourceMap.SourceMapConsumer(x.map).eachMapping(function (m) {
        // TODO
        if (m.originalLine) {
          map.addMapping({
            generated: { line: m.generatedLine, column: m.generatedColumn },
            original:  { line: m.originalLine,  column: m.originalColumn  },
            source:    x.name,
            name:      m.name
          })
        }
      })
    }

    map.setSourceContent(x.name, x.source)
  })

  var code = self.modules.map(function (x) {
    var s = x.code + "\n//# sourceURL=" + x.name
    if (x.map != null) {
      // TODO this is hacky, but it seems to be the only way...
      s += "\n//# sourceMappingURL=" + path.relative(path.dirname(x.name), sMap)
    }
    return types[x.type](escapeString(x.name), escapeString(s))
  }).join("\n")

  if (self.requires.length) {
    code += "\n" + self.requires.map(function (x) {
      return "require(" + escapeString(x) + ")"
    }).join("\n")
  }

  f(code, ")]}\n" + map)
}