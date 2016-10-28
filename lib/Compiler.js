var T = require('./syntax');
var moyallvm = require('../moyallvm/build/Release/moyallvm');

exports.compileModule = function(name, ast) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast);
}

function Compiler() {
    this.funcMap = {};
    this.locals = {};
    this.bridge = new moyallvm.CompilerBridge();
}

Compiler.prototype = {
    compileModule: function(name, ast) {
        this.bridge.beginModule(name);
        
        var nodes = ast.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.type == "FunctionDecl") {
                this.funcMap[node.id] = node;
            }
        }
        
        for (var name in this.funcMap) {
            var func = this.funcMap[name];
            this.compileFunction(func);
        }
        
        this.bridge.endModule();
        
        var main = this.funcMap['main'];
        if (main) {
            this.bridge.executeMain();
        }
    },
    
    compileFunction: function(fnDecl) {
        var previousLocals = this.locals;
        this.locals = {};

        var argTypes = [];
        var argNames = [];
        if (fnDecl.args) {
            var argItems = fnDecl.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                argTypes[i] = 1;
                argNames[i] = argItem.innerName;
            }
        }

        var funcArgs = this.bridge.beginFunction(fnDecl.id, argTypes, argNames);
        if (fnDecl.args) {
            var argItems = fnDecl.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                this.locals[argItem.innerName] = funcArgs[i];
            }
        }
                        
        var nodes = fnDecl.block.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            this.compileNode(nodes[i]);
        }
        
        this.locals = previousLocals;
        this.bridge.endFunction();
    },
    
    compileNode: function(node) {
        var compiler = compilers[node.type];
        return compiler(this, node);
    },
};

// *************************************************************************************************

var compilers = {
    Integer: function(compiler, node) {
        var val = compiler.bridge.compileInteger(node.value);
        if (node.unit) {
            
        } else {
            return val;
        }
    },
    
    Float: function(compiler, node) {
        var val = compiler.bridge.compileFloat(node.value);
        if (node.unit) {
            
        } else {
            return val;
        }
    },
    
    Identifier: function(compiler, node) {
        var vname = compiler.locals[node.id];
        if (vname) {
            return compiler.bridge.loadVariable(vname, node.id);
        } else {
            throw Error("Not found");
        }
    },
    
    Assignment: function(compiler, node) {
        if (node.op == T.EqOp) {
            if (node.left.type == "Identifier") {
                var rhs = compiler.compileNode(node.right);

                var variable = compiler.bridge.createVariable(node.left.id);
                compiler.locals[node.left.id] = variable;
                
                compiler.bridge.storeVariable(variable, rhs);
                return variable;
            } else {
            }
        }
    },

    Print: function(compiler, node) {
        var vname = compiler.compileNode(node.expr);
        // XXXjoe convert name to string

        var printer = node.expr.type == 'Float' ? 'printDouble' : 'printInt';
        return compiler.bridge.compileCall(printer, [vname]);
    },

    Unary: function(compiler, node) {
        
    },

    Binary: function(compiler, node) {
        var lhs = compiler.compileNode(node.left);
        var rhs = compiler.compileNode(node.right);
        if (node.op == T.AddOp) {
            return compiler.bridge.compileAddI(lhs, rhs);
        } else if (node.op == T.SubtractOp) {
            return compiler.bridge.compileSubtractI(lhs, rhs);
        } else if (node.op == T.MultiplyOp) {
            return compiler.bridge.compileMultiplyI(lhs, rhs);
        } else if (node.op == T.DivideOp) {
            return compiler.bridge.compileDivideI(lhs, rhs);
        }
    },
    
    Call: function(compiler, node) {
        var callable = node.callable;
        if (callable.type == "Identifier") {
            var args = []
            var argNodes = node.args;
            for (var i = 0, l = argNodes.length; i < l; ++i) {
                args[i] = compiler.compileNode(argNodes[i].expr);
            }
            
            return compiler.bridge.compileCall(callable.id, args);
        } else {
        }
    },
    
};
