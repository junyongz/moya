var T = require('./syntax');
var moyallvm = require('../moyallvm/build/Release/moyallvm');

// *************************************************************************************************

exports.compileModule = function(name, ast) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast);
}
// *************************************************************************************************

function CoreType(name, type) {
    this.name = name;
    this.type = type;
}

var Void = new CoreType('void', 0);
var I8 = new CoreType('i8', 1);
var I16 = new CoreType('i16', 2);
var I32 = new CoreType('i32', 3);
var I64 = new CoreType('i64', 4);
var F32 = new CoreType('f32', 5);
var F64 = new CoreType('f64', 6);
var STRING = new CoreType('string', 7);

function Expr(type, value) {
    this.type = type;
    this.value = value;
}

function expr(type, value) {
    return new Expr(type, value);
}

function Signature(func, ret, args) {
    this.func = func;
    this.returnType = ret;
    this.args = args;
}

// *************************************************************************************************

function Compiler() {
    this.funcMap = {};
    this.typeMap = {
        Void: Void,
        Int8: I8,
        Bool: I8,
        Int16: I16,
        Int32: I32,
        Int: I32,
        Int64: I64,
        Long: I64,
        Float32: F32,
        Float: F32,
        Float64: F64,
        Double: F64,
        String: STRING,
    };
    this.locals = {};
    this.bridge = new moyallvm.CompilerBridge();
}

Compiler.prototype = {
    compileModule: function(name, ast) {
        this.bridge.beginModule(name);
        this.printDouble = this.bridge.declareFunction('printDouble', Void.type, [F64.type]);
        this.printInt = this.bridge.declareFunction('printInt', Void.type, [I32.type], ['n']);
        
        var funcs = [];
        var nodes = ast.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.type == "FunctionDecl") {
                funcs.push(node);
            }
        }
        
        for (var i = 0, l = funcs.length; i < l; ++i) {
            this.compileFunction(funcs[i]);
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
        
        var returns = this.compileTypeId(fnDecl.returns);
        var retType = returns.type;

        var sigArgs = [];
        var argTypes = [];
        var argNames = [];
        if (fnDecl.args) {
            var argItems = fnDecl.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                argNames[i] = argItem.innerName;

                var argType = this.compileTypeId(argItem.type);
                sigArgs[i] = argType;
                argTypes[i] = argType.type;
            }
        }
        
        var funcAndArgs = this.bridge.beginFunction(fnDecl.id, retType, argTypes, argNames);
        var func = funcAndArgs.shift();

        var sig = new Signature(func, returns, sigArgs);
        
        var funcs = this.funcMap[fnDecl.id];
        if (!funcs) {
            funcs = this.funcMap[fnDecl.id] = [];
        }
        funcs.push(sig);

        if (fnDecl.args) {
            var argItems = fnDecl.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                this.locals[argItem.innerName] = expr(sigArgs[i], funcAndArgs[i]);
            }
        }
                        
        var nodes = fnDecl.block.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            this.compileNode(nodes[i]);
        }
        
        this.locals = previousLocals;
        this.bridge.endFunction();
    },
    
    compileTypeId: function(node) {
        return node ? this.typeMap[node.id] : Void;
    },
    
    compileNode: function(node) {
        return this[node.type](node);
    },
    
    lookupFunction: function(name, args) {
        var funcs = this.funcMap[name];
        if (funcs) {
            for (var i = 0, l = funcs.length; i < l; ++i) {
                var sig = funcs[i];
                if (sig.args.length == args.length) {
                    return sig;
                }
            }
        }
    },
    
    // *********************************************************************************************
    
    Integer: function(node) {
        var val = this.bridge.compileInteger(node.value);
        if (node.unit) {
            
        } else {
            return expr(I32, val);
        }
    },
    
    Float: function(node) {
        var val = this.bridge.compileFloat(node.value);
        if (node.unit) {
            
        } else {
            return expr(F64, val);
        }
    },
    
    Identifier: function(node) {
        var local = this.locals[node.id];
        if (local) {
            var val = this.bridge.loadVariable(local.value, node.id);
            return expr(local.type, val);
        } else {
            throw Error("Not found");
        }
    },
    
    Assignment: function(node) {
        if (node.op == T.EqOp) {
            if (node.left.type == "Identifier") {
                var rhs = this.compileNode(node.right);

                var variable = this.bridge.createVariable(node.left.id);
                var local = expr(rhs.type, variable);
                this.locals[node.left.id] = local;
                
                this.bridge.storeVariable(variable, rhs.value);
                return local;
            } else {
            }
        }
    },

    Print: function(node) {
        var printed = this.compileNode(node.expr);
        // XXXjoe convert name to string

        var printer = printed.type == F64 ? this.printDouble : this.printInt;
        this.bridge.compileCall(printer, [printed.value]);
    },

    Unary: function(node) {
        
    },

    Binary: function(node) {
        var lhs = this.compileNode(node.left);
        var rhs = this.compileNode(node.right);
        if (node.op == T.AddOp) {
            return expr(lhs.type, this.bridge.compileAddI(lhs.value, rhs.value));
        } else if (node.op == T.SubtractOp) {
            return expr(lhs.type, this.bridge.compileSubtractI(lhs.value, rhs.value));
        } else if (node.op == T.MultiplyOp) {
            return expr(lhs.type, this.bridge.compileMultiplyI(lhs.value, rhs.value));
        } else if (node.op == T.DivideOp) {
            return expr(lhs.type, this.bridge.compileDivideI(lhs.value, rhs.value));
        }
    },
    
    Call: function(node) {
        var callable = node.callable;
        if (callable.type == "Identifier") {
            var args = [];
            var argValues = []
            var argNodes = node.args;
            for (var i = 0, l = argNodes.length; i < l; ++i) {
                var arg = this.compileNode(argNodes[i].expr);;
                args[i] = arg;
                argValues[i] = arg.value;
            }
            var sig = this.lookupFunction(callable.id, args);
            if (sig) {
                var ret = this.bridge.compileCall(sig.func, argValues);
                return expr(sig.returnType, ret);
            } else {
                throw Error("Function not found");
            }
        } else {
        }
    },
};
