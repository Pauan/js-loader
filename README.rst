What is it?
===========

First I'll tell you what it's **not**:

* It's not a new module system. Just use CommonJS or AMD or globals or whatever.

* It's not a replacement for browserify.

So, what is it, then? It's probably most accurate to call it a `transport format <http://wiki.commonjs.org/wiki/Modules/Transport>`_.

Basically, you want to use CommonJS files in the browser, but that doesn't work because the browser is asynchronous while CommonJS is synchronous.

So then you have things like browserify which can compile CommonJS files to a single big file which can be included in the browser.

And so, what ``js-loader`` does is it makes the task of "take these CommonJS files (and source maps) and mush them into a single big file" a bit easier.

It doesn't handle dependencies, it doesn't minify your files, it just takes JavaScript code + source maps and returns JavaScript code + a source map. That's it.

Some features:

* Modules are only parsed and evaluated when actually used, so the browser can load the JavaScript faster if you load modules on-demand.

* It can combine CommonJS code and code that uses global variables. AMD would be possible to support, but it would bloat up the loader a lot, so it's left out.

* It's *super* small and *super* fast.

* It supports source maps, so if the code has source maps, you'll get back a single big source map for the combined files.

Example
=======

Let's say you had these files:

* foo.js
::
  var bar = require("./bar")
  exports.foo = bar + 20

* foo.js.map
::

* bar.js
::
  var bar = 10

* bar.js.map
::


You could combine them together like this::

  var loader = require("js-loader")

  var bundle = new loader.Bundle()

  bundle.add("commonjs", "foo", {
    file:    "foo.js",     // The file where the JavaScript code is located; defaults to the module name + ".js"
    mapFile: "foo.js.map"  // The file where the source map is located; optional
  })

  bundle.add("global", "bar", {
    mapFile: "bar.js.map"
  })

  // The module that is automatically loaded when the script runs
  bundle.require("foo")

  // Writes the bundle to the file "bundle.js" and the source map to "bundle.js.map"
  bundle.writeFiles("bundle.js", "bundle.js.map")

And the output is::

* bundle.js
::

* bundle.js.map
::

You can then include ``<script src="bundle.js"></script>`` in your HTML page, which will Just Work(tm), including with source maps.

If you prefer to work with JavaScript code as strings (rather than as files), you can do this instead::

  bundle.add("commonjs", "foo", {
    source: "...",  // Original code as a string; defaults to `file` or `code`
    code:   "...",  // Compiled JavaScript code as a string
    map:    "..."   // A source map as a string or JSON object
  })

  // Get the combined code and source map as a string
  bundle.asString("bundle.js", "bundle.js.map", function (code, map) {
    ...
  })

By working with JavaScript strings rather than files, you can write a compiler that targets JavaScript (e.g. CoffeeScript) and generate a single ``bundle.js`` file, without needing to create temporary files. The ``source`` property is especially useful for this, since it can be the original, uncompiled (non-JavaScript) code.

You can also arbitrarily transform the code before output::

  bundle.transform(function (x) {
    x.type    // Module type, the first argument to `add`
    x.name    // Module name, the second argument to `add`
    x.source  // Original code as a string
    x.code    // Compiled JavaScript code as a string
    x.map     // A source map as a string or JSON object
  })

This is useful if you want to minify the code (e.g. using UglifyJS) before bundling.