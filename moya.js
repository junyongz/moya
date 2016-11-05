
var fs = require('fs');

var Moya = require('./lib/Moya'),
    parseSource = Moya.parseSource,
    compileSource = Moya.compileSource,
    compileFile = Moya.compileFile;

var XMLWriter = require('./lib/XMLWriter').XMLWriter;

// *************************************************************************************************

var argv = require('minimist')(process.argv.slice(2));

var helpDocs =
"usage: moya [option] ... [-c cmd | -m mod | file] [arg] ...\n" +
"    --debug        print debug output";
"    --print        the name of a probe to enable\n" +
"    --probe        the name of a probe to enable\n" +
"    --dump         a path to write probes to\n";

if (argv.c) {
    compile(argv.c, 'no file', '__source__');
} else if (argv.m) {
    
} else {
    var sourceFilePath = argv._[0];
    if (sourceFilePath) {
        var source = fs.readFileSync(sourceFilePath, 'utf8');
        compile(source, sourceFilePath, 'todo');
    }
}

function compile(source, sourcePath, moduleName) {
    try {
        if (argv.debug == "ast") {
            var result = parseSource(source);
            var writer = new XMLWriter();
            result.toXML(writer);
            var ast = writer.read();
            console.log(ast);
        } else if (argv.debug == "ir") {
            compileSource(moduleName, source, true);
        } else {
            compileSource(moduleName, source);
        }
    } catch (exc) {
        if (exc.hash) {
            var line = exc.hash.loc ? exc.hash.loc.first_line : '0';
            console.error('Exception: syntax error\n<' + sourcePath + '>, line ' + line);
            // D&&D(exc.message);
        } else if (exc.message) {
            if (exc.loc) {
                var lineNo = exc.loc ? exc.loc.first_line : '0';
                var line = source.split('\n')[lineNo-1];
                var indent = ' '.repeat(4+exc.loc.first_column);
                var carets = '^'.repeat(exc.loc.last_column - exc.loc.first_column);
                console.error('Exception: ' + exc.message + '\n<' + sourcePath + '>, line ' + lineNo + '\n    ' + line + '\n' + indent + carets);
            } else {
                console.error('Exception: ' + exc.message + '\n<' + sourcePath + '>');
            }
            // throw exc;
        } else {
            throw exc;
        }
    }
}
