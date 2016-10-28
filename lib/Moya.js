
require('dandy');

var parseSource = require('./Parser').parseSource;
var compileModule = require('./Compiler').compileModule;
var XMLWriter = require('./XMLWriter').XMLWriter;

function compileSource(name, source) {
    var result = parseSource(source);
    compileModule(name, result);
    
    return result;
}

function compileFile(sourcePath) {
}

function debugSource(source) {
    var result = parseSource(source);
    D&&D(result);

    var writer = new XMLWriter();
    result.toXML(writer);
    var ast = writer.read();
    D&&D(ast);
    return result;
}

exports.parseSource = parseSource;
exports.compileSource = compileSource;
exports.compileFile = compileFile;
exports.debugSource = debugSource;

if (global.window) {
    window.Moya = exports;
}
