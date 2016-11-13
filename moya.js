
require('dandy');

var minimist = require('minimist');
var Compiler = require('./lib/Compiler').Compiler;

// *************************************************************************************************

var argv = minimist(process.argv.slice(2));

var helpDocs =
"usage: moya [option] ... [-c cmd | -m mod | file] [arg] ...\n" +
"    --debug        print debug output";
"    --print        the name of a probe to enable\n" +
"    --probe        the name of a probe to enable\n" +
"    --dump         a path to write probes to\n";


var compiler = new Compiler();

if (argv.c) {
    compiler.compileProgram('__source__', null, argv.c, argv.debug);
} else if (argv.m) {
    compiler.compileProgram(argv.m, null, null, argv.debug);
} else {
    compiler.compileProgram(null, argv._[0], null, argv.debug);
}
