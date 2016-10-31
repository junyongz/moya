
var fool = require('fool');
var T = require('./syntax');
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    SequenceType = types.SequenceType,
    ObjectType = types.ObjectType;
    
var moyallvm = require('../moyallvm/build/Release/moyallvm');

// *************************************************************************************************

exports.compileModule = function(name, ast, debugMode) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast, debugMode);
}
// *************************************************************************************************

var VOID = new Type('void', 0);
var I1 = new NumberType('i1', 1);
var I8 = new NumberType('i8', 8);
var I16 = new NumberType('i16', 16);
var I32 = new NumberType('i32', 32);
var I64 = new NumberType('i64', 64);
var F32 = new NumberType('f32', 32);
var F64 = new NumberType('f64', 64);
var STRING = new SequenceType('string', 64);

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
            if (!args[i].type.isTypeOrSubclass(this.args[i])) {
                return false;
            }
        }
        return true;
    }
}

// *************************************************************************************************

function Scope(previous) {
    this.previous = null;
    this.compiler = null;
}

Scope.prototype = {
}

function FunctionScope() {
    this.locals = {};
    this.previous = null;
    this.compiler = null;
}

FunctionScope.prototype = fool.subclass(Scope, {
    lookup: function(name, node) {
        var local = this.locals[name];
        if (local) {
            var val = this.compiler.bridge.loadVariable(local.value, name);
            return expr(local.type, val);
        } else if (this.previous) {
            return this.previous.lookup(name, node);
        } else {
            throw new MoyaError('"' + name + '" not found', node.loc);
        }
    },
    
    assign: function(name, type, rhs) {
        if (!type) {
            type = rhs.type;
        }

        var local = this.locals[name];
        if (local) {
            if (type && type != local.type) {
                // XXXjoe This is where type conversion should be tried
                throw new MoyaError('Expecting a different type', node.loc);
            }
            
            this.compiler.bridge.storeVariable(local.value, rhs.value);
        } else {
            var variable = this.compiler.bridge.createVariable(name, type.code);
            local = expr(type, variable);
            this.locals[name] = local;
            this.compiler.bridge.storeVariable(variable, rhs.value);
        }
        return local;
    },
    
    store: function(name, value) {
        this.locals[name] = value;
    },
});

function ClassScope(previous) {
    this.previous = null;
    this.compiler = null;
    this.type = null;
    this.object = null;
}

ClassScope.prototype = fool.subclass(Scope, {
    lookup: function(name, node) {
        var prop = this.type.properties[name];
        if (prop) {
            var variable = this.compiler.bridge.getPointer(this.object, [this.getInt(0), offset]);
            return this.compiler.bridge.loadVariable(variable);
        } else {
            return this.previous.lookup(name, node);
        }
    },
});

// *************************************************************************************************

function Compiler() {
    this.bridge = new moyallvm.CompilerBridge();
    this.funcMap = {};
    this.classMap = {};
    this.scope = new Scope();
    
    VOID.code = this.bridge.getType(0);
    I1.code = this.bridge.getType(1);
    I8.code = this.bridge.getType(2);
    I16.code = this.bridge.getType(3);
    I32.code = this.bridge.getType(4);
    I64.code = this.bridge.getType(5);
    F32.code = this.bridge.getType(6);
    F64.code = this.bridge.getType(7);
    STRING.code = this.bridge.getType(8);
    
    this.typeMap = {
        Void: VOID,
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

    pushScope: function(scope) {
        scope.previous = this.scope;
        scope.compiler = this;
        this.scope = scope;
    },
    
    popScope: function() {
        this.scope.previous = null;
        this.scope = this.scope.previous;
    },
    
    compileModule: function(name, ast, debugMode) {
        this.bridge.beginModule(name);
        this.printString = this.bridge.declareFunction('printString', VOID.code, [STRING.code]);
        this.concat = this.bridge.declareFunction('concatString', STRING.code, [STRING.code, STRING.code]);
        this.intToString = this.bridge.declareFunction('intToString', STRING.code, [I64.code]);
        this.doubleToString = this.bridge.declareFunction('doubleToString', STRING.code, [F64.code]);
        this.pow = this.bridge.declareFunction('powerdd', F64.code, [F64.code, F64.code]);
        this.newObject = this.bridge.declareFunction('newObject', STRING.code, [I32.code]);
        
        var funcs = [];
        var classes = [];
        var nodes = ast.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.nick == "FunctionDecl") {
                funcs.push(node);
            } else if (node.nick == "Class") {
                classes.push(node);
            }
        }

        for (var i = 0, l = classes.length; i < l; ++i) {
            this.compileClass(classes[i]);
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

    compileClass: function(classDecl) {
        var className = classDecl.name.id;
        this.pushScope(new ClassScope());
        
        var type = new ObjectType(className);
        type.structCode = this.bridge.createStruct(className);
        type.code = this.bridge.getPointerType(type.structCode);
        this.classMap[className] = type;
        
        var funcAndArgs = this.bridge.beginFunction(className+'_INIT',
                                                    VOID.code, [type.code], ['self']);
        var initFunc = funcAndArgs.shift();
        var self = funcAndArgs.shift();

        var propValuePairs = [];
        var structTypes = [];
        if (classDecl.body) {
            var nodes = classDecl.body.items;
            for (var i = 0, l = nodes.length; i < l; ++i) {
                var node = nodes[i];
                if (node.nick == "Assignment") {
                    if (node.left.nick == "Identifier") {
                        var prop = type.addProperty(node.left.id);
                        var rhs = this.compileNode(node.right);
                        prop.type = rhs.type;
                        prop.offset = structTypes.length;
                        
                        structTypes.push(prop.type.code);
                        propValuePairs.push(prop);
                        propValuePairs.push(rhs);
                    } else {
                        throw new MoyaError("Illegal property declaration", node.loc);
                    }
                }
            }
        }

        var size = this.bridge.setStructBody(type.structCode, structTypes);
                
        for (var i = 0, l = propValuePairs.length; i < l; i += 2) {
            var prop = propValuePairs[i];
            var rhs = propValuePairs[i+1];
            
            var offset = this.getInt(prop.offset);
            var variable = this.bridge.getPointer(self, [this.getInt(0), offset]);
            this.bridge.storeVariable(variable, rhs.value);
        }

        this.bridge.endFunction();
        
        this.compileConstructor(type, size, initFunc);

        this.popScope();
    },
    
    compileConstructor: function(type, size, initFunc) {
        var funcAndArgs = this.bridge.beginFunction(type.name, type.code, [], []);
        type.constructor = funcAndArgs.shift();
        
        var raw = this.bridge.compileCall(this.newObject, [this.getInt(size)]);
        var self = expr(type, this.bridge.compileBitcast(raw, type.code));
        
        this.bridge.compileCall(initFunc, [self.value]);
        this.bridge.compileReturn(self.value);
        
        this.bridge.endFunction();
    },
    
    compileFunction: function(fnDecl) {
        this.pushScope(new FunctionScope());
        
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
                var name = argItem.innerName;
                var type = sigArgs[i];
                var arg = funcAndArgs[i];
                var argRef = this.bridge.createVariable(name, type.code);
                this.bridge.storeVariable(argRef, funcAndArgs[i]);
                this.scope.store(name, expr(type, argRef));
            }
        }

        this.compileBlock(fnDecl.block);
        
        this.scope = this.scope.previous;
        this.bridge.endFunction();
    },
    
    compileTypeId: function(node) {
        return node ? this.typeMap[node.id] : VOID;
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
        } else {
            D&&D(val.type.name)
            throw new MoyaError("Can't convert object to string");
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
    
    getInt: function(val, size) {
        return this.bridge.compileInteger(size || 32, val);
    },
    
    compileTest: function(condition, n) {
        if (condition.type == I1 || condition.type == I8 || condition.type == I16
            || condition.type == I32 || condition.type == I64) {
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
        
        var afterBlock = this.bridge.createBlock('after');

        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then');
            var elseBlock = this.bridge.createBlock('else');

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
        
        var afterBlock = this.bridge.createBlock('result');
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then');
            elseBlock = this.bridge.createBlock('else');

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
        var thenBlock = this.bridge.createBlock('then');
        var failedBlock = this.bridge.createBlock('failed');
        var afterBlock = this.bridge.createBlock('after');

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
            return this.scope.lookup(node.id, node);
        }
    },
    
    Get: function(node, isStatement) {
        var lhs = this.compileNode(node.left);
        if (lhs.type instanceof ObjectType) {
            var prop = lhs.type.properties[node.right];
            if (prop) {
                var offset = this.getInt(prop.offset);
                var variable = this.bridge.getPointer(lhs.value, [this.getInt(0), offset]);
                return expr(prop.type, this.bridge.loadVariable(variable));
            } else {
                throw new MoyaError('Property "' + node.right + '" not found', node.loc);
            }
        } else {
            throw new MoyaError('Property "' + node.right + '" not found', node.loc);
        }
    },
    
    Assignment: function(node, isStatement) {
        if (node.op == T.EqOp) {
            var rhs = this.compileNode(node.right);
            if (node.left.nick == "Identifier") {
                return this.scope.assign(node.left.id, null, rhs);
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.compileTypeId(node.left.type);
                return this.scope.assign(node.left.name, type, rhs);
            } else if (node.left.nick == "Get") {
                var object = this.compileNode(node.left.left);
                if (object.type instanceof ObjectType) {
                    var prop = object.type.properties[node.left.right];
                    if (prop) {
                        var offset = this.getInt(prop.offset);
                        var variable = this.bridge.getPointer(object.value, [this.getInt(0), offset]);
                        this.bridge.storeVariable(variable, rhs.value);
                    } else {
                        throw new MoyaError('Property "' + node.left.right + '" not found', node.loc);
                    }
                } else {
                    throw new MoyaError('Property "' + node.left.right + '" not found', node.loc);
                }
                return rhs;
            } else {
                throw new MoyaError("Illegal assignment", node.loc);
            }
        } else {
            throw new MoyaError("Operator not yet supported", node.loc);
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
            return this.compileLogic(node.left, node.right, true);
        } else if (node.op == T.OrOp) {
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
        } else if (callable.nick == "TypeId") {
            var cls = this.classMap[callable.id];
            if (cls) {
                return expr(cls, this.bridge.compileCall(cls.constructor, []));
            } else {
                throw new MoyaError('Type "' + callable.id + '" not found', callable.loc);
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
    
    While: function(node, isStatement) {
        var testBlock = this.bridge.createBlock('test');
        var loopBlock = this.bridge.createBlock('loop');
        var afterBlock = this.bridge.createBlock('after');

        this.bridge.compileJump(testBlock);

        this.bridge.setInsertBlock(testBlock);
        var condition = this.compileNode(node.clause);
        var eq = this.compileTest(condition, 1);
        this.bridge.compileConditionalJump(eq.value, loopBlock, afterBlock);
        
        this.bridge.setInsertBlock(loopBlock);
        this.compileBlock(node.block);
        this.bridge.compileJump(testBlock);
        
        this.bridge.setInsertBlock(afterBlock);
    },
};
