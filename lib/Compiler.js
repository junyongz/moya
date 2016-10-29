var T = require('./syntax');
var moyallvm = require('../moyallvm/build/Release/moyallvm');

// *************************************************************************************************

exports.compileModule = function(name, ast, debugMode) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast, debugMode);
}
// *************************************************************************************************

function CoreType(name, code) {
    this.name = name;
    this.code = code;
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

Signature.prototype = {
    match: function(args) {
        if (this.args.length != args.length) {
            return false;
        }
        for (var i = 0, l = args.length; i < l; ++i) {
            if (args[i].type != this.args[i]) {
                return false;
            }
        }
        return true;
    }
}

// *************************************************************************************************

function Compiler() {
    this.funcMap = {};
    this.typeMap = {
        Void: Void,
        Bool: I8,
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
    compileModule: function(name, ast, debugMode) {
        this.bridge.beginModule(name);
        this.printDouble = this.bridge.declareFunction('printDouble', Void.code, [F64.code]);
        this.printInt = this.bridge.declareFunction('printInt', Void.code, [I32.code]);
        this.pow = this.bridge.declareFunction('powerdd', F64.code, [F64.code, F64.code]);
        
        var funcs = [];
        var nodes = ast.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.nick == "FunctionDecl") {
                funcs.push(node);
            }
        }
        
        for (var i = 0, l = funcs.length; i < l; ++i) {
            this.compileFunction(funcs[i]);
        }
        
        this.bridge.endModule(debugMode ? 1 : 0);
        
        var main = this.funcMap['main'];
        if (main) {
            this.bridge.executeMain();
        }
    },
    
    compileFunction: function(fnDecl) {
        var previousLocals = this.locals;
        this.locals = {};
        
        var returns = this.compileTypeId(fnDecl.returns);

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
                argTypes[i] = argType.code;
            }
        }
        
        var funcAndArgs = this.bridge.beginFunction(fnDecl.id, returns.code, argTypes, argNames);
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
        return this[node.nick](node);
    },
    
    lookupFunction: function(name, args) {
        var funcs = this.funcMap[name];
        if (funcs) {
            for (var i = 0, l = funcs.length; i < l; ++i) {
                var sig = funcs[i];
                if (sig.match(args)) {
                    return sig;
                }
            }
        }
    },
    
    // *********************************************************************************************
    
    Integer: function(node) {
        if (node.unit == 'i8') {
            var val = this.bridge.compileInteger(8, node.value);
            return expr(I8, val);
        } else if (node.unit == 'i16') {
            var val = this.bridge.compileInteger(16, node.value);
            return expr(I16, val);
        } else if (node.unit == 'i32') {
            var val = this.bridge.compileInteger(32, node.value);
            return expr(I32, val);
        } else if (node.unit == 'i64') {
            var val = this.bridge.compileInteger(64, node.value);
            return expr(I64, val);
        } else if (node.unit == 'f') {
            var val = this.bridge.compileFloat(node.value);
            return expr(F32, val);
        } else if (node.unit == 'd') {
            var val = this.bridge.compileDouble(node.value);
            return expr(F64, val);
        } else if (node.unit) {
            
        } else {
            var val = this.bridge.compileInteger(32, node.value);
            return expr(I32, val);
        }
    },
    
    Float: function(node) {
        if (node.unit == 'f') {
            var val = this.bridge.compileFloat(node.value);
            return expr(F32, val);
        } else if (node.unit == 'd') {
            var val = this.bridge.compileDouble(node.value);
            return expr(F64, val);
        } else if (node.unit) {
        
        } else {
            var val = this.bridge.compileDouble(node.value);
            return expr(F64, val);
        }
    },
    
    Identifier: function(node) {
        if (node.id == 'true') {
            var val = this.bridge.compileInteger(8, 1);
            return expr(I8, val);
        } else if (node.id == 'false') {
            var val = this.bridge.compileInteger(8, 0);
            return expr(I8, val);
        } else {
            var local = this.locals[node.id];
            if (local) {
                var val = this.bridge.loadVariable(local.value, node.id);
                return expr(local.type, val);
            } else {
                throw Error('"' + node.id + '" not found');
            }
        }
    },
    
    Assignment: function(node) {
        if (node.op == T.EqOp) {
            var rhs = this.compileNode(node.right);
            if (node.left.nick == "Identifier") {
                var variable = this.bridge.createVariable(node.left.id, rhs.type.code);
                var local = expr(rhs.type, variable);
                this.locals[node.left.id] = local;
                
                this.bridge.storeVariable(variable, rhs.value);
                return local;
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.compileTypeId(node.left.type);
                var variable = this.bridge.createVariable(node.left.name, type.code);
                var local = expr(type, variable);
                this.locals[node.left.name] = local;
                
                this.bridge.storeVariable(variable, rhs.value);
                return local;
            } else {
            }
        }
    },

    Print: function(node) {
        var printed = this.compileNode(node.expr);
        // XXXjoe convert name to string

        if (printed.type == I32) {
            this.bridge.compileCall(this.printInt, [printed.value]);
        } else if (printed.type == I8 || printed.type == I16 || printed.type == I64) {
            var tmp = this.bridge.castNumber(printed.value, I32.code);
            this.bridge.compileCall(this.printInt, [tmp]);
        } else if (printed.type == F64) {
            this.bridge.compileCall(this.printDouble, [printed.value]);
        } else if (printed.type == F32) {
            var tmp = this.bridge.castNumber(printed.value, F64.code);
            this.bridge.compileCall(this.printDouble, [tmp]);
        }
    },

    Unary: function(node) {
        
    },

    Binary: function(node) {
        var lhs = this.compileNode(node.left);
        var rhs = this.compileNode(node.right);
        var op;
        if (node.op == T.AddOp) {
            op = this.bridge.compileAdd.bind(this.bridge);
        } else if (node.op == T.SubtractOp) {
            op = this.bridge.compileSubtract.bind(this.bridge);
        } else if (node.op == T.MultiplyOp) {
            op = this.bridge.compileMultiply.bind(this.bridge);
        } else if (node.op == T.DivideOp) {
            op = this.bridge.compileDivide.bind(this.bridge);
        } else if (node.op == T.ModOp) {
            op = this.bridge.compileMod.bind(this.bridge);
        } else if (node.op == T.PowOp) {
            if (lhs.type != F64) {
                lhs.value = this.bridge.castNumber(lhs.value, F64.code);
            }
            if (rhs.type != F64) {
                rhs.value = this.bridge.castNumber(rhs.value, F64.code);
            }
            return expr(F64, this.bridge.compileCall(this.pow, [lhs.value, rhs.value]));
        }

        if (lhs.type == rhs.type) {
            return expr(lhs.type, op(lhs.value, rhs.value));
        } else if (1/*both are numbers*/) {
            if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.bridge.castNumber(lhs.value, rhs.type.code);
                return expr(rhs.type, op(cast, rhs.value));
            } else {
                var cast = this.bridge.castNumber(rhs.value, lhs.type.code);
                return expr(lhs.type, op(lhs.value, cast));
            }
        } else {
            throw Error("Incompatible");
        }
    },
    
    Call: function(node) {
        var callable = node.callable;
        if (callable.nick == "Identifier") {
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
    
    Return: function(node) {
        var val = this.compileNode(node.expr);
        this.bridge.compileReturn(val.value);
    },
};
