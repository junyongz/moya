
var moyallvm = require('../moyallvm/build/Release/moyallvm');

var llvm = new moyallvm.CompilerBridge();
module.exports = llvm;
