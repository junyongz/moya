var fool = require('fool');
var T = require('./syntax');
var moyallvm = require('../moyallvm/build/Release/moyallvm');

// *************************************************************************************************

exports.compileModule = function(name, ast, debugMode) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast, debugMode);
}
// *************************************************************************************************

function CoreType(name, code, size, isNumber) {
    this.name = name;
    this.code = code;
    this.size = size;
    this.isNumber = isNumber || false;
}

var Void = new CoreType('void', 0, 0, false);
var I1 = new CoreType('i1', 1, 1, true);
var I8 = new CoreType('i8', 2, 8, true);
var I16 = new CoreType('i16', 3, 16, true);
var I32 = new CoreType('i32', 4, 32, true);
var I64 = new CoreType('i64', 5, 64, true);
var F32 = new CoreType('f32', 6, 32, true);
var F64 = new CoreType('f64', 7, 64, true);
var STRING = new CoreType('string', 8, 64, false);

// *************************************************************************************************

function Expr(type, value) {
    this.type = type;
    this.value = value;
}

function expr(type, value) {
    return new Expr(type, value);
}

// *************************************************************************************************

function MoyaError(message, loc) {
    this.message = message;
    this.loc = loc;
}

MoyaError.prototype = fool.subclass(Error, {
    toString: function() {
        return this.message;
    },
});

// *************************************************************************************************

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
        Bool: I1,
        Int1: I1,
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

    compileModule: function(name, ast, debugMode) {
        this.bridge.beginModule(name);
        this.printString = this.bridge.declareFunction('printString', Void.code, [STRING.code]);
        this.concat = this.bridge.declareFunction('concatString', STRING.code, [STRING.code, STRING.code]);
        this.intToString = this.bridge.declareFunction('intToString', STRING.code, [I64.code]);
        this.doubleToString = this.bridge.declareFunction('doubleToString', STRING.code, [F64.code]);
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
        this.activeFunc = func;
        
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

        this.compileBlock(fnDecl.block);
        
        this.activeFunc = null;
        this.locals = previousLocals;
        this.bridge.endFunction();
    },
    
    compileTypeId: function(node) {
        return node ? this.typeMap[node.id] : Void;
    },
    
    compileBlock: function(block) {
        var nodes = block.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            this.compileNode(nodes[i], true);
        }
    },
    
    compileNode: function(node, isStatement) {
        return this[node.nick](node, isStatement);
    },

    valueToString: function(val) {
        if (val.type == STRING) {
            return val.value;
        } else if (val.type.isNumber) {
            if (val.type == I1 || val.type == I8 || val.type == I16 || val.type == I32) {
                return this.bridge.compileCall(this.intToString, [this.castNumber(val, I64)]);
            } else if (val.type == I64) {
                return this.bridge.compileCall(this.intToString, [val.value]);
            } else if (val.type == F32) {
                return this.bridge.compileCall(this.doubleToString, [this.castNumber(val, F64)]);
            } else if (val.type == F64) {
                return this.bridge.compileCall(this.doubleToString, [val.value]);
            }
        }
    },

    castNumber: function(val, type) {
        if (val.type == type) {
            return val.value;
        } else if (type == STRING) {
            return this.valueToString(val);
        } else if (type.isNumber) {
            return this.bridge.castNumber(val.value, type.code);
        } else {
            throw new MoyaError("Illegal cast");
        }
    },

    getTypeDefault: function(type) {
        if (type.isNumber) {
            if (type == F32) {
                return expr(type, this.bridge.compileFloat(0));
            } else if (type == F64) {
                return expr(type, this.bridge.compileDouble(0));
            } else {
                return expr(type, this.bridge.compileInteger(type.size, 0));
            }
        } else {
        }
    },
    
    compileTest: function(condition, n) {
        if (condition.type.code >= 1 && condition.type.code <= 5) {
            var zero = this.bridge.compileInteger(condition.type.size, n);
            return expr(I1, this.bridge.compileEquals(condition.value, zero));
        } else if (condition.type == F32) {
            var zero = this.bridge.compileFloat(n);
            return expr(I1, this.bridge.compileEquals(condition.value, zero));
        } else if (condition.type == F64) {
            var zero = this.bridge.compileDouble(n);
            return expr(I1, this.bridge.compileEquals(condition.value, zero));
        } else {
            throw new MoyaError("Null check not yet implemented", condition.loc);
        }
    },
        
    compileConcat: function(lhs, rhs) {
        var left = this.valueToString(lhs);
        var right = this.valueToString(rhs);
        return expr(STRING, this.bridge.compileCall(this.concat, [left, right]));
    },

    compileBinary: function(lhs, rhs, op) {
        if (lhs.type.isNumber && rhs.type.isNumber) {
            if (lhs.type == rhs.type) {
                return expr(lhs.type, op(lhs.value, rhs.value));
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.bridge.castNumber(lhs.value, rhs.type.code);
                return expr(rhs.type, op(cast, rhs.value));
            } else {
                var cast = this.bridge.castNumber(rhs.value, lhs.type.code);
                return expr(lhs.type, op(lhs.value, cast));
            }
        } else {
            throw new MoyaError("Illegal types for binary operation", lhs.loc);
        }
    },

    compileComparison: function(lhs, rhs, op) {
        if (lhs.type.isNumber && rhs.type.isNumber) {
            if (lhs.type == rhs.type) {
                return expr(I1, op(lhs.value, rhs.value));
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.bridge.castNumber(lhs.value, rhs.type.code);
                return expr(I1, op(cast, rhs.value));
            } else {
                var cast = this.bridge.castNumber(rhs.value, lhs.type.code);
                return expr(I1, op(lhs.value, cast));
            }
        } else {
            throw new MoyaError("Illegal types for comparison", lhs.loc);
        }
    },
    
    compileIfBlock: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.bridge.createBlock('after', this.activeFunc);

        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then', this.activeFunc);
            var elseBlock = this.bridge.createBlock('else', this.activeFunc);

            this.bridge.compileConditionalJump(eq.value, ifBlock, elseBlock);
            this.bridge.setInsertBlock(ifBlock);
            this.compileBlock(pair.block);
            
            this.bridge.compileJump(afterBlock);

            this.bridge.setInsertBlock(elseBlock);
        }
        
        if (node.else) {
            this.compileBlock(node.else);
        }

        this.bridge.compileJump(afterBlock);
        this.bridge.setInsertBlock(afterBlock);
    },
    
    compileIfExpression: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.bridge.createBlock('result', this.activeFunc);
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then', this.activeFunc);
            elseBlock = this.bridge.createBlock('else', this.activeFunc);

            this.bridge.compileConditionalJump(eq.value, ifBlock, elseBlock);
            this.bridge.setInsertBlock(ifBlock);
            var result = this.compileNode(pair.block);
            if (!resultType) {
                resultType = result.type;
            } else if (result.type != resultType) {
                throw new MoyaError("Different types in expression", pair.block.loc);
            }
            this.bridge.compileJump(afterBlock);

            this.bridge.setInsertBlock(elseBlock);
            
            exprs.push(result.value);
            blocks.push(ifBlock);
        }
        
        if (node.else) {
            var result = this.compileNode(node.else);
            exprs.push(result.value);
            blocks.push(elseBlock);
        } else {
            var result = this.getTypeDefault(resultType);
            exprs.push(result.value);
            blocks.push(elseBlock);
        }

        this.bridge.compileJump(afterBlock);
        this.bridge.setInsertBlock(afterBlock);

        return expr(resultType, this.bridge.compilePhi(resultType.code, exprs, blocks));
    },

    compileLogic: function(left, right, isAnd) {
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        var one = this.bridge.compileInteger(1, 1);
        var zero = this.bridge.compileInteger(1, 0);
        
        var condition1 = this.compileNode(left);
        var eq1 = this.compileTest(condition1, 0);
        
        var startBlock = this.bridge.getInsertBlock();
        var thenBlock = this.bridge.createBlock('then', this.activeFunc);
        var failedBlock = this.bridge.createBlock('failed', this.activeFunc);
        var afterBlock = this.bridge.createBlock('after', this.activeFunc);

        if (isAnd) {
            this.bridge.compileConditionalJump(eq1.value, afterBlock, thenBlock);
        } else {
            this.bridge.compileConditionalJump(eq1.value, thenBlock, afterBlock);
        }

        this.bridge.setInsertBlock(thenBlock);
        var condition2 = this.compileNode(right);
        var eq2 = this.compileTest(condition2, 0);

        if (isAnd) {
            this.bridge.compileConditionalJump(eq2.value, failedBlock, afterBlock);
        } else {
            this.bridge.compileConditionalJump(eq2.value, afterBlock, failedBlock);
        }

        if (isAnd) {
            exprs.push(zero);
            exprs.push(one);
            exprs.push(zero);
        } else {
            exprs.push(one);
            exprs.push(zero);
            exprs.push(one);
        }
        
        blocks.push(startBlock);
        blocks.push(thenBlock);
        blocks.push(failedBlock);

        this.bridge.setInsertBlock(failedBlock);
        this.bridge.compileJump(afterBlock);
        this.bridge.setInsertBlock(afterBlock);

        return expr(I1, this.bridge.compilePhi(I1.code, exprs, blocks));
    },
                                            
    // *********************************************************************************************
    
    Integer: function(node, isStatement) {
        if (node.unit == 'i1') {
            var val = this.bridge.compileInteger(1, node.value);
            return expr(I1, val);
        } else if (node.unit == 'i8') {
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
    
    Float: function(node, isStatement) {
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
    
    String: function(node, isStatement) {
        return expr(STRING, this.bridge.declareString(node.string));
    },
    
    Identifier: function(node, isStatement) {
        if (node.id == 'true') {
            var val = this.bridge.compileInteger(1, 1);
            return expr(I1, val);
        } else if (node.id == 'false') {
            var val = this.bridge.compileInteger(1, 0);
            return expr(I1, val);
        } else {
            var local = this.locals[node.id];
            if (local) {
                var val = this.bridge.loadVariable(local.value, node.id);
                return expr(local.type, val);
            } else {
                throw new MoyaError('"' + node.id + '" not found', node.loc);
            }
        }
    },
    
    Assignment: function(node, isStatement) {
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

    Print: function(node, isStatement) {
        var printed = this.compileNode(node.expr);
        var asString = this.valueToString(printed);
        this.bridge.compileCall(this.printString, [asString]);
    },

    Unary: function(node, isStatement) {
        var operand = this.compileNode(node.operand);
        if (node.op == T.NegativeOp) {
            if (operand.type.isNumber) {
                return expr(operand.type, this.bridge.compileNegate(operand.value));
            } else {
                throw new MoyaError("Illegal type for negate operation", operand.loc);
            }
        } else if (node.op == T.NotOp) {
            return this.compileTest(operand, 0);
        } else {
            throw new MoyaError("Operator not yet implemented", node.loc);
        }
    },
            
    Binary: function(node, isStatement) {
        if (node.op == T.AndOp) {
            // a && b -> if a -> if b -> 1 else 0 else 0
            return this.compileLogic(node.left, node.right, true);
        } else if (node.op == T.OrOp) {
            // a && b -> if a -> if b -> 1 else 0 else 0
            return this.compileLogic(node.left, node.right, false);
        } else {
            var lhs = this.compileNode(node.left);
            var rhs = this.compileNode(node.right);
            if (node.op == T.AddOp) {
                if (lhs.type == STRING || rhs.type == STRING) {
                    return this.compileConcat(lhs, rhs);
                } else {
                    return this.compileBinary(lhs, rhs, this.bridge.compileAdd.bind(this.bridge));
                }
            } else if (node.op == T.SubtractOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileSubtract.bind(this.bridge));
            } else if (node.op == T.MultiplyOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileMultiply.bind(this.bridge));
            } else if (node.op == T.DivideOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileDivide.bind(this.bridge));
            } else if (node.op == T.ModOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileMod.bind(this.bridge));
            } else if (node.op == T.PowOp) {
                var left = this.castNumber(lhs, F64);
                var right = this.castNumber(rhs, F64);
                return expr(F64, this.bridge.compileCall(this.pow, [left, right]));
            } else if (node.op == T.ConcatOp) {
                return this.compileConcat(lhs, rhs);
            } else if (node.op == T.EqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileEquals.bind(this.bridge));
            } else if (node.op == T.NotEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileNotEquals.bind(this.bridge));
            } else if (node.op == T.GreaterThanOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileGreaterThan.bind(this.bridge));
            } else if (node.op == T.GreaterThanEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileGreaterThanEquals.bind(this.bridge));
            } else if (node.op == T.LessThanOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileLessThan.bind(this.bridge));
            } else if (node.op == T.LessThanEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileLessThanEquals.bind(this.bridge));
            } else {
                throw new MoyaError("Operator not yet implemented", node.loc);
            }
        }
    },
    
    Call: function(node, isStatement) {
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
                throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
            }
        } else {
            throw new MoyaError('Call type not yet implemented', node.loc);
        }
    },
    
    Return: function(node, isStatement) {
        var val = this.compileNode(node.expr);
        this.bridge.compileReturn(val.value);
    },
    
    If: function(node, isStatement) {
        if (isStatement) {
            return this.compileIfBlock(node);
        } else {
            return this.compileIfExpression(node);
        }
    },
};
