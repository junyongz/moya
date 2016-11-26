
require('dandy');

var minimist = require('minimist');
var Compiler = require('./compiler').Compiler;

// *************************************************************************************************

var argv = minimist(process.argv.slice(2));

var helpDocs =
"usage: moya [option] ... [-c cmd | -m mod | file] [arg] ...\n" +
"    --debug        option to compile debug information";
"    --optimize     option to optimize executable";
"    --inspect      the name of a probe to enable\n" +
"    --probe        the name of a probe to enable\n" +
"    --dump         a path to write probes to\n";


var compiler = new Compiler(argv.debug, argv.optimize, argv.inspect);

if (argv.c) {
    compiler.compileProgram('__source__', null, argv.c);
} else if (argv.m) {
    compiler.compileProgram(argv.m, null, null);
} else {
    compiler.compileProgram(null, argv._[0], null);
}
