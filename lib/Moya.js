
require('dandy');

var parser = require('./grammar').parser;
var compileModule = require('./Compiler').compileModule;
var XMLWriter = require('./XMLWriter').XMLWriter;

function parseSource(source) {
    return parser.parse(' ' + source + '\n');
}

function compileSource(name, source, debugMode) {
    var result = parseSource(source);
    compileModule(name, result, debugMode);
    
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
