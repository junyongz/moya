
var fool = require('fool');
var T = require('./syntax');
var ops = require('./operator');
var MILWriter = require('./milwriter').MILWriter;
var types = require('./type'),
    NumberType = types.NumberType,
    ClassType = types.ClassType,
    FunctionType = types.FunctionType,
    PointerType = types.PointerType,
    OptionalType = types.OptionalType,
    VOID = types.VOID,
    BOOL = types.BOOL,
    I1 = types.I1,
    I8 = types.I8,
    I16 = types.I16,
    I32 = types.I32,
    I64 = types.I64,
    F32 = types.F32,
    F64 = types.F64,
    CHAR = types.CHAR,
    STRING = types.STRING,
    POINTER = types.POINTER,
    VTABLEPOINTER = types.VTABLEPOINTER;

var llvm = require('./llvm');

// *************************************************************************************************
    
const llvmPrefix = 'MOYA:';

// *************************************************************************************************

function Node() {
}

exports.Node = Node;

Node.prototype = {
    toString: function() {
        var writer = new MILWriter();
        var result = this.write(writer);
        var rest = writer.dump();
        if (rest) {
            return rest + '\n' + result;
        } else {
            return result;
        }
    },

    write: function(writer) {
        if (this.serial) {
            return this.serial;
        }
        this.serial = this.serialize(writer);
        return this.serial;
    },
    
    serialize: function(writer) {
        return '';
    },

    valueToString: function(compiler, loc) {
        return this.type.valueToString(this, compiler, loc);
    },
    
    compile: function(builder) {
        if (this.compiled) {
            return this.compiled;
        }
        this.compiled = this.generate(builder);
        return this.compiled;
    },
};
    
// *************************************************************************************************

function Expression(type) {
    this.type = type;
}
exports.Expression = Expression;

Expression.prototype = fool.subclass(Node, {
    generate: function(builder) {
    },
});

// *************************************************************************************************

function Statement() {
}
exports.Statement = Statement;

Statement.prototype = fool.subclass(Node, {
    generate: function(builder) {
    },
});

// *************************************************************************************************

exports.InstanceFunction = function(func, argSymbols, argTypes, argDefaults) {
    this.name = func.name;
    this.func = func;
    this.argSymbols = argSymbols.slice();
    this.argTypes = argTypes.slice();
    this.argDefaults = argDefaults.slice();
    this.argNames = [];
    this.argStubs = [];
    this.returnType = null;
    this.methodOffset = -1;
    this.blocks = [];
    this.native = null;
    this.type = null;
}

exports.InstanceFunction.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        writer.begin();
        var args = this.argTypes.map(function(type) { return type + ''; });
        writer.write('func ' + this.name + '(' + args + '): ' + this.returnType + ' {');
        this.blocks.forEach(function(block) { if (!block.isEmpty) block.write(writer); });
        writer.write('}');
        writer.end();
        return this.name;
    },
            
    generate: function(builder) {
        var returnType = this.type.returnType;
        var returnTypeNative = returnType ? returnType.compile(builder) : VOID.native;
        var argTypes = this.argTypes.map(function(type) { return type.compile(builder); });
        
        var name = llvmPrefix + this.func.qualifiedName;
        var funcAndArgs = llvm.declareFunction(name, returnTypeNative, argTypes, this.argNames);
        this.native = funcAndArgs.shift();

        for (var i = 0, l = this.argStubs.length; i < l; ++i) {
            var argStub = this.argStubs[i];
            argStub.value = funcAndArgs[i];
        }

        return this.native;
    },
    
    generateFunc: function(builder) {
        for (var i = 0, l = this.blocks.length; i < l; ++i) {
            var block = this.blocks[i];
            if (!block.isEmpty) {
                var nativeBlock = block.compile(builder);
                llvm.setInsertBlock(nativeBlock);
            
                block.compileStatements(builder);
            }
        }
    },
});

// *************************************************************************************************

exports.CFunction = function(name, returnType, argTypes) {
    this.name = name;
    this.returnType = returnType;
    this.argTypes = argTypes;
    this.native = null;
    this.type = null;
}

exports.CFunction.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var args = this.argTypes.map(function(type) { return type + ''; });
        var returns = this.returnType + '';

        writer.begin();
        writer.write('cfunc ' + this.name + '(' + args + '): ' + returns);
        writer.end();
        return this.name;
    },

    generate: function(builder) {
        var returnType = this.returnType.compile(builder);
        var argTypes = this.argTypes.map(function(argType) { return argType.compile(builder); });
        
        this.native = llvm.declareExternalFunction(this.name, returnType, argTypes);
        this.type = llvm.getFunctionType(this.native);
        return this.native;
    },
});

// *************************************************************************************************

exports.Block = function(name, func) {
    this.name = name;
    this.func = func;
    this.statements = [];
    this.returned = null;
}

exports.Block.prototype = fool.subclass(Node, {
    serialize: function(writer) {
        writer.write(this.name + ':');
        writer.indent(1);
        this.statements.forEach(function(statement) {
            statement.write(writer);
        });
        writer.indent(-1);
    },

    get isEmpty() {
        return this.statements.length == 0;
    },

    compileStatements: function(builder) {
        for (var i = 0, l = this.statements.length; i < l; ++i) {
            var statement = this.statements[i];
            statement.compile(builder);
        }
    },
    
    // ---------------------------------------------------------------------------------------------
    
    generate: function(builder) {
        return llvm.createBlock(this.name, this.func.compile(builder));
    },
});

// *************************************************************************************************

exports.Stub = function(type) {
    this.value = null;
    this.type = type;
}

exports.Stub.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return 'STUB (' + this.type + ')';
    },

    generate: function(builder) {
        return this.value;
    },
});

// *************************************************************************************************

exports.Bool = function(truth) {
    this.truth = truth;
    this.type = BOOL;
}

exports.Bool.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return this.truth + '';
    },

    generate: function(builder) {
        return llvm.compileInteger(1, this.truth);
    },
});

// *************************************************************************************************

exports.Number = function(value, type) {
    this.value = value;
    this.type = type;
}

exports.Number.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return this.value + '' + this.type.shortName;
    },

    generate: function(builder) {
        if (this.type == F32) {
            return llvm.compileFloat(this.value);
        } else if (this.type == F64) {
            return llvm.compileDouble(this.value);
        } else {
            return llvm.compileInteger(this.type.bitSize, this.value);
        }
    },
});

// *************************************************************************************************

exports.String = function(string) {
    this.string = string;
    this.type = STRING;
}

exports.String.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return '"' + this.string + '"';
    },

    generate: function(builder) {
        return llvm.declareString(this.string);
    },
});

// *************************************************************************************************

exports.Optional = function(value, hasValue, optionalType) {
    this.value = value;
    this.hasValue = hasValue;
    this.type = optionalType;
}

exports.Optional.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        if (this.hasValue) {
            var value = this.value.write(writer);
            return writer.temp('' + value + '?');
        } else {
            return writer.temp('XXX?');
        }
    },

    generate: function(builder) {
        var t = this.type.compile(builder);
        var structVar = llvm.createVariable('opt', t);
        var struct = llvm.loadVariable(structVar, 'optvar');

        if (this.hasValue) {
            var value = this.value.compile(builder);
            struct = llvm.insertValue(struct, 0, value);
        } else {
            var value = this.type.type.defaultValue(builder).compile(builder);
            struct = llvm.insertValue(struct, 0, value);
        }

        var exists = llvm.compileInteger(8, this.hasValue ? 1 : 0);
        struct = llvm.insertValue(struct, 1, exists);

        return struct;
    },
});

// *************************************************************************************************

exports.NumCast = function(value, type) {
    this.value = value;
    this.type = type;
}

exports.NumCast.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var value = this.value.write(writer);
        return writer.temp('NUMCAST ' + value + ' AS ' + this.type, 'num');
    },

    generate: function(builder) {
        return llvm.castNumber(this.value.compile(builder), this.type.compile(builder));
    },
});

// *************************************************************************************************

exports.BitCast = function(value, type) {
    this.value = value;
    this.type = type;
}

exports.BitCast.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var value = this.value.write(writer);
        return writer.temp('BITCAST (' + value + ') AS (' + this.type + ')', 'cast');
    },

    generate: function(builder) {
        return llvm.compileBitcast(this.value.compile(builder), this.type.compile(builder));
    },
});

// *************************************************************************************************

exports.SizeOfObject = function(typeToSize) {
    this.typeToSize = typeToSize;
    this.type = I32;
}

exports.SizeOfObject.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return writer.temp('SIZEOFOBJ (' + this.typeToSize + ')', 'size');
    },

    generate: function(builder) {
        return llvm.compileInteger(32, this.typeToSize.objectSize);
    },
});

// *************************************************************************************************

exports.SizeOfType = function(typeToSize) {
    this.typeToSize = typeToSize;
    this.type = I32;
}

exports.SizeOfType.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return writer.temp('SIZEOF (' + this.typeToSize + ')', 'size');
    },

    generate: function(builder) {
        return llvm.compileInteger(32, this.typeToSize.size);
    },
});

// *************************************************************************************************

exports.PropertyOffset = function(classType, propertyName) {
    this.classType = classType;
    this.propertyName = propertyName;
    this.type = I32;
}

exports.PropertyOffset.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return writer.temp('PROPOFFSET (' + this.propertyName + ') OF (' + this.classType + ')', 'poff');
    },

    generate: function(builder) {
        var prop = this.classType.getProperty(this.propertyName);
        return llvm.compileInteger(32, prop.offset);
    },
});

// *************************************************************************************************

exports.MethodOffset = function(instFunc) {
    this.instFunc = instFunc;
    this.type = I32;
}

exports.MethodOffset.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var func = this.instFunc.name;
        return writer.temp('METHODOFFSET (' + func + ')', 'moff');
    },

    generate: function(builder) {
        return llvm.compileInteger(32, this.instFunc.methodOffset);
    },
});

// *************************************************************************************************

exports.MethodTable = function(classType) {
    this.classType = classType;
    this.type = POINTER;
}

exports.MethodTable.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        return writer.temp('METHODTABLE (' + this.classType + ')', 'table');
    },

    generate: function(builder) {
        return this.classType.methodTable;
    },
});

// *************************************************************************************************

exports.GEP = function(object, offsets, gepType, type) {
    this.object = object;
    this.offsets = offsets;
    this.gepType = gepType;
    this.type = type;
}

exports.GEP.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var obj = this.object.write(writer);
        var offsets = this.offsets.map(function(offset) { return offset.write(writer); });
        return writer.temp('GEP ' + obj + ' [' + offsets.join(', ') + ']', 'ptr');
    },

    generate: function(builder) {
        var object = this.object.compile(builder);
        var offsets = this.offsets.map(function(offset) { return offset.compile(builder); });
        var gepType = this.gepType ? this.gepType.compile(builder) : null;
        if (gepType) {
            return llvm.getPointer(object, offsets, gepType);
        } else {
            return llvm.getPointer(object, offsets);
        }
    },
});

// *************************************************************************************************

exports.Phi = function(type, exprs, blocks) {
    this.type = type;
    this.exprs = exprs;
    this.blocks = blocks;
}

exports.Phi.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var exprs = this.exprs.map(function(expr) { return expr.write(writer); });
        var blocks = this.blocks.map(function(block) { return block.name; });
        var pairs = exprs.map(function(expr, i) { return '[' + expr + ', ' + blocks[i] + ']'; });
        return writer.temp('PHI ' + pairs.join(', '), 'phi');
    },

    generate: function(builder) {
        var exprs = this.exprs.map(function(expr) { return expr.compile(builder); });
        var blocks = this.blocks.map(function(block) { return block.compile(builder); });
        return llvm.compilePhi(this.type.compile(builder), exprs, blocks);
    },
});

// *************************************************************************************************

exports.Call = function(callable, args, returnType) {
    this.callable = callable;
    this.args = args;
    this.type = returnType || callable.type.returnType;
}

exports.Call.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var callable = this.callable.write(writer);
        var args = this.args.map(function(args) { return args.write(writer); });
        return writer.temp('CALL ' + callable + '(' + args.join(', ') + ')', 'call');
    },

    generate: function(builder) {
        var llfunc = this.callable.compile(builder);
        var args = this.args.map(function(arg) { return arg.compile(builder); });
        return llvm.compileCall(llfunc, args);
    },
});

// *************************************************************************************************

exports.Negate = function(operand) {
    this.operand = operand;
    this.type = operand.type;
}

exports.Negate.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var operand = this.operand.write(writer);
        return writer.temp('NEG ' + operand, 'neg');
    },

    generate: function(builder) {
        var operand = this.operand.compile(builder);
        return llvm.compileNegate(operand);
    },
});

// *************************************************************************************************

exports.Math = function(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
    this.type = left.type;
}

exports.Math.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var left = this.left.write(writer);
        var right = this.right.write(writer);
        return writer.temp('MATH ' + this.op.token + ' ' + left + ', ' + right, 'math');
    },

    generate: function(builder) {
        var op = this.op;
        var lhs = this.left.compile(builder);
        var rhs = this.right.compile(builder);
        
        if (op == ops.Add || op == ops.AddEq) {
            return llvm.compileAdd(lhs, rhs);
        } else if (op == ops.Subtract || op == ops.SubtractEq) {
            return llvm.compileSubtract(lhs, rhs);
        } else if (op == ops.Multiply || op == ops.MultiplyEq) {
            return llvm.compileMultiply(lhs, rhs);
        } else if (op == ops.Divide || op == ops.DivideEq) {
            return llvm.compileDivide(lhs, rhs);
        } else if (op == ops.Mod || op == ops.ModEq) {
            return llvm.compileMod(lhs, rhs);
        }
    },
});

// *************************************************************************************************

exports.Compare = function(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
    this.type = BOOL;
}

exports.Compare.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var left = this.left.write(writer);
        var right = this.right.write(writer);
        return writer.temp('CMP ' + this.op.token + ' ' + left + ', ' + right, 'cmp');
    },

    generate: function(builder) {
        var op = this.op;
        var lhs = this.left.compile(builder);
        var rhs = this.right.compile(builder);
        
        if (op == ops.Equals) {
            return llvm.compileEquals(lhs, rhs);
        } else if (op == ops.NotEquals) {
            return llvm.compileNotEquals(lhs, rhs);
        } else if (op == ops.GreaterThan) {
            return llvm.compileGreaterThan(lhs, rhs);
        } else if (op == ops.GreaterThanEquals) {
            return llvm.compileGreaterThanEquals(lhs, rhs);
        } else if (op == ops.LessThan) {
            return llvm.compileLessThan(lhs, rhs);
        } else if (op == ops.LessThanEquals) {
            return llvm.compileLessThanEquals(lhs, rhs);
        }
    },
});

// *************************************************************************************************

exports.ExtractValue = function(agg, index, type, name) {
    this.agg = agg;
    this.index = index;
    this.name = name;
    this.type = type;
}

exports.ExtractValue.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var agg = this.agg.write(writer);
        return writer.temp('EXTRACT ' + agg + ' [' + this.index + ']', 'ex');
    },

    generate: function(builder) {
        return llvm.extractValue(this.agg.compile(builder), this.index, this.name);
    },
});

// *************************************************************************************************

exports.CreateVariable = function(name, type) {
    this.name = name;
    this.type = type;
}

exports.CreateVariable.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        writer.write('CREATE ' + this.name + ' (' + this.type + ')');
        return '@' + this.name;
    },

    generate: function(builder) {
        return llvm.createVariable(this.name, this.type.compile(builder));
    },
});

// *************************************************************************************************

exports.LoadVariable = function(variable, name) {
    this.name = name;
    this.variable = variable;
    this.type = variable.type;
}

exports.LoadVariable.prototype = fool.subclass(Expression, {
    serialize: function(writer) {
        var variable = this.variable.write(writer);
        return writer.temp('LOAD ' + variable, this.name);
    },

    generate: function(builder) {
        return llvm.loadVariable(this.variable.compile(builder), this.name);
    },
});

// *************************************************************************************************

exports.StoreVariable = function(variable, value) {
    this.variable = variable;
    this.value = value;
}

exports.StoreVariable.prototype = fool.subclass(Statement, {
    serialize: function(writer) {
        var variable = this.variable.write(writer);
        var value = this.value.write(writer);
        writer.write('STORE ' + variable + ' = ' + value);
    },

    generate: function(builder) {
        llvm.storeVariable(this.variable.compile(builder), this.value.compile(builder));
    },
});

// *************************************************************************************************

exports.Jump = function(block) {
    this.block = block;
}

exports.Jump.prototype = fool.subclass(Statement, {
    serialize: function(writer) {
        writer.write('JUMP ' + this.block.name);
    },

    generate: function(builder) {
        llvm.compileJump(this.block.compile(builder));
    },
});

// *************************************************************************************************

exports.ConditionalJump = function(condition, trueBlock, falseBlock) {
    this.condition = condition;
    this.trueBlock = trueBlock;
    this.falseBlock = falseBlock;
}

exports.ConditionalJump.prototype = fool.subclass(Statement, {
    serialize: function(writer) {
        var cond = this.condition.write(writer);
        writer.write('JUMP IF ' + cond + ' ? ' + this.trueBlock.name + ' : ' + this.falseBlock.name);
    },

    generate: function(builder) {
        var condition = this.condition.compile(builder);
        var trueBlock = this.trueBlock.compile(builder);
        var falseBlock = this.falseBlock.compile(builder);
        llvm.compileConditionalJump(condition, trueBlock, falseBlock);
    },
});

        
// *************************************************************************************************

exports.Return = function(expr) {
    this.expr = expr;
}

exports.Return.prototype = fool.subclass(Statement, {
    serialize: function(writer) {
        if (this.expr) {
            var expr = this.expr.write(writer);
            writer.write('RETURN ' + expr);
        } else {
            writer.write('RETURN');
        }
    },

    generate: function(builder) {
        if (this.expr) {
            llvm.compileReturn(this.expr.compile(builder));
        } else {
            llvm.compileReturn();
        }
    },
});
