"use strict";

var sourceMap = require("source-map")
  , uglify    = require("uglify-js")
  , path      = require("path")
  , fs        = require("fs")
  , zlib      = require("zlib")

// TODO unprintable characters and such
function escapeString(s) {
  return "\"" + s.replace(/[\\\"]/g, "\\$&").replace(/\n/g, "\\n") + "\""
}

function relative(x, y) {
  return path.relative(path.dirname(y), x)
}

function Bundle(options) {
  if (options == null) {
    options = {}
  }
  if (options.file == null) {
    throw new Error("options.file must be provided")
  }
  if (options.map == null) {
    throw new Error("options.map must be provided")
  }
  if (options.prefix == null) {
    options.prefix = ""
  }
  if (options.minify == null) {
    options.minify = true
  }
  if (options.warn == null) {
    options.warn = false
  }

  this.modules  = []
  this.requires = []
  this.options  = options
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

// TODO maybe rename to `set` ?
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

  if (source == null) {
    source = {}
  }

  if (file == null) {
    file = module + ".js"
  }
  if (source.file == null) {
    source.file = file
  }

  file        = path.join(this.options.prefix, file)
  source.file = path.join(this.options.prefix, source.file)
  if (source.map != null && source.map.file != null) {
    source.map.file = path.join(this.options.prefix, source.map.file)
  }

  if (code == null) {
    code = fs.readFileSync(file, { encoding: "utf8" })
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

  var x = {
    type: type,
    name: module,
    file: file,
    code: code,
    source: source
  }

  if (this.options.minify) {
    var ast = uglify.parse(x.code, {
      filename: x.source.file
    })

    ast.figure_out_scope()
    ast = ast.transform(uglify.Compressor({
      warnings: this.options.warn
    }))
    ast.figure_out_scope()
    ast.compute_char_frequency()

    if (x.type === "commonjs") {
      ast.mangle_names({
        toplevel: true
      })
    } else if (x.type === "global") {
      ast.mangle_names()
    }

    if (x.source.map == null) {
      x.source.map = {}
    }

    var map = uglify.SourceMap({
      orig: x.source.map.code
    })

    var stream = uglify.OutputStream({
      source_map: map
    })

    ast.print(stream)

    x.code            = "" + stream
    x.source.map.code = JSON.parse("" + map)
  }

  if (this.options.transform != null) {
    this.options.transform(x)
  }

  this.modules.push(x)
}

Bundle.prototype.require = function (module) {
  this.requires.push(module)
}

Bundle.prototype.writeFiles = function (options) {
  if (options == null) {
    options = {}
  }

  var self = this
    , o    = self.get()

  if (options.gzip) {
    zlib.gzip(o.code, function (e, code) {
      if (e) throw e
      fs.writeFileSync(self.options.file, code)
    })
    zlib.gzip(o.map, function (e, map) {
      if (e) throw e
      fs.writeFileSync(self.options.map,  map)
    })

  } else {
    fs.writeFileSync(self.options.file, o.code)
    fs.writeFileSync(self.options.map,  o.map)
  }
}

Bundle.prototype.get = function () {
  var self = this

  var output = {
    version: 3,
    file: self.options.file,
    sections: []
  }

  var maps = {}

  self.modules.forEach(function (x) {
    var output = maps[x.type]
    if (output == null) {
      output = maps[x.type] = new sourceMap.SourceMapGenerator({ file: self.options.file/*, sourceRoot: options.sourceRoot*/ })
    }

    if (x.source.map != null) {
      var input = new sourceMap.SourceMapConsumer(x.source.map.code)

      //map.applySourceMap(new sourceMap.SourceMapConsumer(x.map), x.name)
      // TODO should only iterate over the mappings for the first file...?
      input.eachMapping(function (m) {
        // TODO hacky
        if (m.originalLine) {
          // TODO should check (m.source === relative(x.source.file, x.source.map.file)) ?
          output.addMapping({
            generated: { line: m.generatedLine, column: m.generatedColumn },
            original:  { line: m.originalLine,  column: m.originalColumn  },
            source:    x.source.file, // TODO m.source ?
            name:      m.name
          })
        }
      })
    } else {
      output.addMapping({
        generated: { line: 1, column: 0 },
        original:  { line: 1, column: 0 },
        source:    x.source.file,
      })
    }

    // TODO if the original map has a sourceContents, should use that instead ?
    output.setSourceContent(x.source.file, x.source.code)
  })

  if (maps["global"] != null) {
    output.sections.push({
      offset: { line: 0, column: 0 },
      map: JSON.parse("" + maps["global"])
    })
  }

  if (maps["commonjs"] != null) {
    output.sections.push({
      offset: { line: 1, column: 0 },
      map: JSON.parse("" + maps["commonjs"])
    })
  }

  var code = fs.readFileSync(path.join(__dirname, "require.js"), { encoding: "utf8" })

  code += "\n" + self.modules.map(function (x) {
    // TODO shouldn't remove //@ and //# inside strings
    // .replace(/\/\/[@#] *(?:sourceURL|sourceMappingURL)=[^\n]*(?:\n|$)/g, "")
    var s = x.code + "\n//# sourceURL=" + x.source.file

    if (x.source.map != null) {
      // TODO this is hacky, but it seems to be the only way...
      s += "\n//# sourceMappingURL=" + relative(self.options.map, x.source.file)
    }

    return types[x.type](escapeString(x.name), escapeString(s))
  }).join("\n")

  if (self.requires.length) {
    code += "\n" + self.requires.map(function (x) {
      return "require(" + escapeString(x) + ")"
    }).join("\n")
  }

  if (self.options.minify) {
    code = uglify.minify(code, {
      fromString: true
    }).code
  }

  return {
    code: code,
    map: ")]}\n" + JSON.stringify(output)
  }
}