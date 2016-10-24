
var fs = require('fs');

var Moya = require('./lib/Moya'),
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
    compile(argv.c, 'no file');
} else if (argv.m) {
    
} else {
    var sourceFilePath = argv._[0];
    if (sourceFilePath) {
        var source = fs.readFileSync(sourceFilePath, 'utf8');
        compile(source, sourceFilePath);
    }
}

function compile(source, sourcePath) {
    try {
        var result = compileSource(source);
        writeResult(result);
    } catch (exc) {
        if (exc.hash) {
            var line = exc.hash.loc ? exc.hash.loc.first_line : '0';
            console.log('Exception: syntax error\n<' + sourcePath + '>, line ' + line);
            // D&&D(exc.message);
        } else if (exc.message) {
            var line = exc.loc ? exc.loc.first_line : '0';
            console.log('Exception: ' + exc.message + '\n<' + sourcePath + '>, line ' + line);
            throw exc;
        } else {
            throw exc;
        }
    }
}

function writeResult(result) {
    if (argv.debug == "ast") {
        var writer = new XMLWriter();
        result.toXML(writer);
        var ast = writer.read();
        console.log(ast);
    } else if (argv.debug == "compile") {
    } else if (argv.debug == "bytecode") {
    } else {
    }
}
