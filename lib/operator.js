
var fool = require('fool');

var types = require('./type'),
    NumberType = types.NumberType,
    PointerType = types.PointerType,
    FunctionType = types.FunctionType,
    ClassType = types.ClassType,
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
var MoyaError = require('./utils').MoyaError;

var ops = exports;
    
// *************************************************************************************************

function Operator(token) {
    this.token = token;
}
exports.Operator = Operator;

Operator.prototype = {
    toString: function() {
        return this.token;
    },

    compile: function(compiler, node) {
        throw new MoyaError("Operator not yet supported", node.loc);
    },
};

// *************************************************************************************************

function CompareOperator(token) {
    this.token = token;
}
exports.CompareOperator = CompareOperator;

CompareOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var lhs = compiler.compileNode(node.left);
        var rhs = compiler.compileNode(node.right);

        if (lhs.type instanceof ClassType) {
            var ret = compiler.callMethod(lhs, this.token, [rhs], []);
            if (ret) {
                if (ret.type != BOOL) {
                    throw new MoyaError("Function returned non-boolean type", node.loc);
                }

                return ret;
            } else if (this == ops.Equals) {
                return compiler.builder.compare(this, lhs, rhs);
            } else if (this == ops.NotEquals) {
                var ret = compiler.callMethod(lhs, '==', [rhs], []);
                if (ret) {
                    return compiler.compileTest(ret, 0);
                } else {
                    return compiler.builder.compare(ops.NotEquals, lhs, rhs);
                }
            } else if (this == ops.NotIn) {
                var ret = compiler.callMethod(lhs, 'is in', [rhs], []);
                if (ret) {
                    return compiler.compileTest(ret, 0);
                }
            }

            throw new MoyaError("Operator not supported", node.loc);
        } else if (lhs.type instanceof PointerType) {
            throw new MoyaError("Pointer comparison NYI", node.loc);
        } else if (lhs.type instanceof NumberType && rhs.type instanceof NumberType) {
            if (lhs.type == rhs.type) {
                return compiler.builder.compare(this, lhs, rhs);
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = compiler.valueToNumber(lhs, rhs.type);
                return compiler.builder.compare(this, cast, rhs);
            } else {
                var cast = compiler.valueToNumber(rhs, lhs.type);
                return compiler.builder.compare(this, lhs, cast);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

function LogicOperator(token, isAnd) {
    this.token = token;
    this.isAnd = isAnd;
}
exports.LogicOperator = LogicOperator;

LogicOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        var one = compiler.builder.int(1, 1);
        var zero = compiler.builder.int(0, 1);
        
        var condition1 = compiler.compileNode(node.left);
        var eq1 = compiler.compileTest(condition1, 0);
        
        var startBlock = compiler.builder.insertBlock;
        var thenBlock = compiler.builder.block('then');
        var failedBlock = compiler.builder.block('failed');
        var afterBlock = compiler.builder.block('after');

        if (this.isAnd) {
            compiler.builder.conditionalJump(eq1, afterBlock, thenBlock);
        } else {
            compiler.builder.conditionalJump(eq1, thenBlock, afterBlock);
        }

        compiler.builder.setInsertBlock(thenBlock);
        var condition2 = compiler.compileNode(node.right);
        var eq2 = compiler.compileTest(condition2, 0);

        if (this.isAnd) {
            compiler.builder.conditionalJump(eq2, failedBlock, afterBlock);
        } else {
            compiler.builder.conditionalJump(eq2, afterBlock, failedBlock);
        }

        if (this.isAnd) {
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

        compiler.builder.setInsertBlock(failedBlock);
        compiler.builder.jump(afterBlock);
        compiler.builder.setInsertBlock(afterBlock);

        return compiler.builder.phi(BOOL, exprs, blocks);
    },
});

function NotOperator(token) {
    this.token = token;
}
exports.NotOperator = NotOperator;

NotOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var operand = compiler.compileNode(node.operand);
        
        if (operand.type instanceof ClassType) {
            var ret = compiler.callMethod(operand, this.token, [], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

// *************************************************************************************************

function UnaryOperator(token) {
    this.token = token;
}
exports.UnaryOperator = UnaryOperator;

UnaryOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var operand = compiler.compileNode(node.operand);
        
        if (operand.type instanceof ClassType) {
            var ret = compiler.callMethod(operand, this.token, [], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

// *************************************************************************************************

function NegateOperator(token) {
    this.token = token;
}
exports.NegateOperator = NegateOperator;

NegateOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var operand = compiler.compileNode(node.operand);
        
        if (operand.type instanceof ClassType) {
            var ret = compiler.callMethod(operand, this.token, [], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

// *************************************************************************************************

function BinaryOperator(token) {
    this.token = token;
}
exports.BinaryOperator = BinaryOperator;

BinaryOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var lhs = compiler.compileNode(node.left);
        var rhs = compiler.compileNode(node.right);
        return this.combine(compiler, node, lhs, rhs);
    },
    
    combine: function(compiler, node, lhs, rhs) {
    },
});

function MathOperator(token) {
    this.token = token;
}
exports.MathOperator = MathOperator;

MathOperator.prototype = fool.subclass(BinaryOperator, {
    combine: function(compiler, node, lhs, rhs) {
        if (lhs.type instanceof ClassType) {
            var ret = compiler.callMethod(lhs, this.token, [rhs], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else if (lhs.type == STRING) {
            if (this == ops.Add || this == ops.AddEq) {
                var lhsCast = compiler.valueToString(lhs);
                var rhsCast = compiler.valueToString(rhs);
                return compiler.builder.call(compiler.concatString, [lhsCast, rhsCast]);
            } else {
                throw new MoyaError("Illegal types for operation", node.loc);
            }
        } else if (lhs.type instanceof PointerType) {
            if (!(rhs.type instanceof NumberType)) {
                throw new MoyaError("Illegal types for operation", node.loc);
            }

            if (this == ops.Add || this == ops.AddEq) {
                return compiler.builder.gep(lhs, [rhs], lhs.type);
            } else {
                throw new MoyaError("Illegal types for operation", node.loc);
            }
        } else if (lhs.type instanceof NumberType) {
            if (lhs.type == rhs.type) {
                return compiler.builder.math(this, lhs, rhs);
            } else if (rhs.type == F64 || rhs.type == F32) {
                var lhsCast = compiler.builder.numCast(lhs, rhs.type);
                return compiler.builder.math(this, lhsCast, rhs);
            } else {
                var rhsCast = compiler.builder.numCast(rhs, lhs.type);
                return compiler.builder.math(this, lhs, rhsCast);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

// *************************************************************************************************

function PowOperator(token) {
    this.token = token;
}
exports.PowOperator = PowOperator;

PowOperator.prototype = fool.subclass(BinaryOperator, {
    combine: function(compiler, node, lhs, rhs) {
        if (lhs.type instanceof ClassType) {
            var ret = compiler.callMethod(lhs, this.token, [rhs], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else if (lhs.type instanceof NumberType) {
            var lhsCast = compiler.valueToNumber(lhs, F64);
            var rhsCast = compiler.valueToNumber(rhs, F64);
            return compiler.builder.call(compiler.powerdd, [lhsCast, rhsCast]);
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

// *************************************************************************************************

function ConcatOperator(token) {
    this.token = token;
}
exports.ConcatOperator = ConcatOperator;

ConcatOperator.prototype = fool.subclass(BinaryOperator, {
    combine: function(compiler, node, lhs, rhs) {
        if (lhs.type instanceof ClassType) {
            var ret = compiler.callMethod(lhs, this.token, [rhs], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else if (lhs.type == STRING) {
            var lhsCast = compiler.valueToString(lhs);
            var rhsCast = compiler.valueToString(rhs);
            return compiler.builder.call(compiler.concatString, [lhsCast, rhsCast]);
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

// *************************************************************************************************

function AssignOperator(token) {
    this.token = token;
}
exports.AssignOperator = AssignOperator;

AssignOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var rhs = compiler.compileNode(node.right);
        return this.assign(compiler, node, rhs);
    },
    
    assign: function(compiler, node, rhs) {
        if (node.left.nick == "Identifier") {
            return compiler.compileVariableAssign(node.left.id, rhs);
        } else if (node.left.nick == "TypeAssignment") {
            var type = compiler.evaluateType(node.left.type);
            return compiler.compileVariableDeclare(node.left.name, type, rhs);
        } else if (node.left.nick == "Get") {
            var object = compiler.compileNode(node.left.left);
            return compiler.compilePropertyAssign(object, node.left.right, rhs, node.left.loc);
        } else if (node.left.nick == "Binary" ) {
            var assignOp = node.left.op.assignOp;
            if (assignOp) {
                return assignOp.assign(compiler, node, rhs);
            } else {
                throw new MoyaError("Illegal assignment", node.loc);
            }
        } else {
            throw new MoyaError("Illegal assignment", node.loc);
        }
    },
});

function DeleteOperator(token) {
    this.token = token;
}
exports.DeleteOperator = DeleteOperator;

DeleteOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var deleteOp = node.operand.deleteOp;
        if (deleteOp) {
            return deleteOp.delete(compiler, node);
        } else {
            throw new MoyaError("Illegal delete", node.loc);
        }
    },
});

// *************************************************************************************************

function IncrementOperator(token, incrementOp, assignOp) {
    this.token = token;
    this.incrementOp = incrementOp;
    this.assignOp = assignOp;
}
exports.IncrementOperator = IncrementOperator;

IncrementOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var lhs = compiler.compileNode(node.left);
        var rhs = compiler.compileNode(node.right);
        
        if (lhs.type instanceof ClassType) {
            var ret = compiler.callMethod(lhs, this.token, [rhs], []);
            if (ret) {
                return ret;
            } else {
                var incremented = this.incrementOp.combine(compiler, node, lhs, rhs);
                return this.assignOp.assign(compiler, node, incremented);
            }
        } else {
            var incremented = this.incrementOp.combine(compiler, node, lhs, rhs);
            return this.assignOp.assign(compiler, node, incremented);
        }
    },
});

// *************************************************************************************************

function IndexOperator(token, assignOp, deleteOp) {
    this.token = token;
    this.assignOp = assignOp;
    this.deleteOp = deleteOp;
}
exports.IndexOperator = IndexOperator;

IndexOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        if (node.left.nick == 'TypeId' || node.left.nick == 'TypeAssignment') {
            var lhsType = compiler.evaluateType(node.left);
            var bufferType = compiler.getPointerType(lhsType, 1);
            var itemSize = compiler.builder.sizeOfType(lhsType);
            var rhs = compiler.compileNode(node.right);
            var rawBuffer = compiler.builder.call(compiler.newBuffer, [itemSize, rhs]);
            return compiler.builder.bitCast(rawBuffer, bufferType);
        } else {
            var object = compiler.compileNode(node.left);
            var index = compiler.compileNode(node.right);
            if (object.type instanceof ClassType) {
                var ret = compiler.callMethod(object, this.token, [index], [])
                if (ret) {
                    return ret;
                } else {
                    throw new MoyaError("Operator not supported", node.loc);
                }
            } else if (object.type instanceof PointerType) {
                var variable = compiler.builder.gep(object, [index], object.type.type);
                return compiler.builder.loadVariable(variable);
            } else {
                throw new MoyaError("Illegal types for operation", node.loc);
            }
        }
    },
});

function IndexAssignOperator(token) {
    this.token = token;
}
exports.IndexAssignOperator = IndexAssignOperator;

IndexAssignOperator.prototype = fool.subclass(AssignOperator, {
    assign: function(compiler, node, rhs) {
        var left = node.left;
        var object = compiler.compileNode(left.left);
        var index = compiler.compileNode(left.right);
        if (object.type instanceof ClassType) {
            var ret = compiler.callMethod(object, this.token, [index, rhs], [])
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else if (object.type instanceof PointerType) {
            var variable = compiler.builder.gep(object, [index], object.type.type);
            return compiler.builder.storeVariable(variable, rhs);
        } else {
            throw new MoyaError("Illegal operation", left.loc);
        }
    },
});

function IndexDeleteOperator(token) {
    this.token = token;
}
exports.IndexDeleteOperator = IndexDeleteOperator;

IndexDeleteOperator.prototype = fool.subclass(Operator, {
    delete: function(compiler, node) {
        var operand = node.operand;
        var index = this.compileNode(node.operand.right);
        var ret = compiler.callMethod(operand, this.token, [index], [])
        if (ret) {
            return ret;
        } else {
            throw new MoyaError("Operator not supported", node.loc);
        }
    },
});

// *************************************************************************************************

function LookupOperator(token, assignOp, deleteOp) {
    this.token = token;
    this.assignOp = assignOp;
    this.deleteOp = deleteOp;
}
exports.LookupOperator = LookupOperator;

LookupOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var object = compiler.compileNode(node.left);
        if (object.type instanceof ClassType) {
            var index = compiler.compileNode(node.right);
            var ret = compiler.callMethod(object, this.token, [index], [])
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal operation", node.loc);
        }
    },
});

function LookupAssignOperator(token) {
    this.token = token;
}
exports.LookupAssignOperator = LookupAssignOperator;

LookupAssignOperator.prototype = fool.subclass(AssignOperator, {
    assign: function(compiler, node, rhs) {
        var left = node.left;
        var object = compiler.compileNode(left.left);
        if (object.type instanceof ClassType) {
            var index = compiler.compileNode(left.right);
            var ret = compiler.callMethod(object, this.token, [index, rhs], [])
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal operation", node.loc);
        }
    },
});

function LookupDeleteOperator(token) {
    this.token = token;
}
exports.LookupDeleteOperator = LookupDeleteOperator;

LookupDeleteOperator.prototype = fool.subclass(Operator, {
    delete: function(compiler, node) {
        var operand = node.operand;
        var index = compiler.compileNode(node.operand.right);
        var ret = compiler.callMethod(operand, this.token, [index], [])
        if (ret) {
            return ret;
        } else {
            throw new MoyaError("Operator not supported", node.loc);
        }
    },
});

// *************************************************************************************************

function SliceOperator(token, assignOp, deleteOp) {
    this.token = token;
    this.assignOp = assignOp;
    this.deleteOp = deleteOp;
}
exports.SliceOperator = SliceOperator;

SliceOperator.prototype = fool.subclass(Operator, {
    compile: function(compiler, node) {
        var object = compiler.compileNode(node.left);
        if (object.type instanceof ClassType) {
            var range = node.right;
            var from = compiler.compileNode(range.from);
            var to = compiler.compileNode(range.to);
            var by = range.by ? compiler.compileNode(range.by) : null;
            var args = [from, to];
            if (by) {
                args.push(by);
            }
            
            var ret = compiler.callMethod(object, this.token, args, []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Index operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

function SliceAssignOperator(token) {
    this.token = token;
}
exports.SliceAssignOperator = SliceAssignOperator;

SliceAssignOperator.prototype = fool.subclass(AssignOperator, {
    assign: function(compiler, node, rhs) {
        var left = node.left;
        var object = compiler.compileNode(left.left);
        if (object.type instanceof ClassType) {
            var range = left.right;
            var from = compiler.compileNode(range.from);
            var to = compiler.compileNode(range.to);
            var by = range.by ? compiler.compileNode(range.by) : null;
            var args = [rhs, from, to];
            if (by) {
                args.push(by);
            }
            
            var ret = compiler.callMethod(object, this.token, args, []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Index operator not supported", node.loc);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
});

function SliceDeleteOperator(token) {
    this.token = token;
}
exports.SliceDeleteOperator = SliceDeleteOperator;

SliceDeleteOperator.prototype = fool.subclass(Operator, {
    delete: function(compiler, node) {
        var range = node.operand.right;
        var from = compiler.compileNode(range.from);
        var to = compiler.compileNode(range.to);
        var by = range.by ? compiler.compileNode(range.by) : null;
        var args = [from, to];
        if (by) {
            args.push(by);
        }
        
        var ret = compiler.callMethod(operand, this.token, args, []);
        if (ret) {
            return ret;
        } else {
            throw new MoyaError("Operator not supported", node.loc);
        }
    },
});

// *************************************************************************************************

function declareOperator(dest, cons, names) {
    for (var i = 0, l = names.length; i < l; i += 2) {
        var op = new cons();
        op.name = names[i];
        op.token = names[i+1];
        dest[op.name] = op;
    }
}

function declareAssignableOperator(dest, cons, names) {
    for (var i = 0, l = names.length; i < l; i += 4) {
        var op = new cons();
        op.name = names[i];
        op.token = names[i+1];
        op.assignOp = dest[names[i+2]];
        op.deleteOp = dest[names[i+3]];
        dest[op.name] = op;
    }
}

function declareIncOperator(dest, cons, names) {
    for (var i = 0, l = names.length; i < l; i += 4) {
        var op = new cons();
        op.name = names[i];
        op.token = names[i+1];
        op.incrementOp = dest[names[i+2]];
        op.assignOp = dest[names[i+3]];
        dest[op.name] = op;
    }
}

// *************************************************************************************************

ops.Equals = new CompareOperator('==');
ops.NotEquals = new CompareOperator('!=');
ops.GreaterThan = new CompareOperator('>');
ops.GreaterThanEquals = new CompareOperator('>=');
ops.LessThan = new CompareOperator('<');
ops.LessThanEquals = new CompareOperator('<=');
ops.Is = new CompareOperator('is');
ops.IsNot = new CompareOperator('is not');
ops.Has = new CompareOperator('has');
ops.HasNot = new CompareOperator('has not');
ops.IsIn = new CompareOperator('is in');
ops.NotIn = new CompareOperator('not in');

ops.And = new LogicOperator('&', true);
ops.Or = new LogicOperator('|', false);
ops.Not = new NotOperator('!');

ops.In = new UnaryOperator('in this');
ops.Positive = new UnaryOperator('+pos');
ops.Negative = new NegateOperator('-neg');

ops.Add = new MathOperator('+');
ops.Subtract = new MathOperator('-');
ops.Multiply = new MathOperator('*');
ops.Divide = new MathOperator('/');
ops.Mod = new MathOperator('//');
ops.Pow = new MathOperator('**');
ops.Pow = new PowOperator('**');
ops.Concat = new ConcatOperator('++');

ops.Eq = new AssignOperator('=');
ops.Delete = new DeleteOperator('-=del');

ops.AddEq = new IncrementOperator('+=', ops.Add, ops.Eq);
ops.SubtractEq = new IncrementOperator('-=', ops.Subtract, ops.Eq);
ops.MultiplyEq = new IncrementOperator('*=', ops.Multiply, ops.Eq);
ops.DivideEq = new IncrementOperator('/=', ops.Divide, ops.Eq);
ops.ModEq = new IncrementOperator('//=', ops.Mod, ops.Eq);
ops.PowEq = new IncrementOperator('**=', ops.Pow, ops.Eq);
ops.ConcatEq = new IncrementOperator('++=', ops.Concat, ops.Eq);

ops.IndexAssign = new IndexAssignOperator('[]=');
ops.IndexDelete = new IndexDeleteOperator('-=[]');
ops.Index = new IndexOperator('[]', ops.IndexAssign, ops.IndexDelete);

ops.LookupAssign = new LookupAssignOperator('.[]=');
ops.LookupDelete = new LookupDeleteOperator('-=.[]');
ops.Lookup = new LookupOperator('.[]', ops.LookupAssign, ops.LookupDelete);

ops.SliceAssign = new SliceAssignOperator('[to]=');
ops.SliceDelete = new SliceDeleteOperator('-=[to]');
ops.Slice = new SliceOperator('[to]', ops.SliceAssign, ops.SliceDelete);

ops.Read = new Operator('<<');
ops.Write = new Operator('>>');
ops.WriteAll = new Operator('*>>');
ops.In = new Operator('in this');

ops.Bind = new Operator(';');
