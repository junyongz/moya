
var fool = require('fool');

declareEnum(exports, 'SyntaxType', [
    'No',
    'Set',
    'Declaration',
    'Group',
    'Print',
    'Assignment',
    'Binary',
    'Unary',
    'Import',
    'ImportWildcard',
    'Call',
    'Argument',
    'Property',
    'Id',
    'TypeId',
    'Range',
    'Default',
    'Undefined',
    'Int',
    'Long',
    'Float',
    'String',
    'List',
    'Map',
    'Channel',
    'Return',
    'Break',
    'Continue',
    'Throw',
    'Function',
    'Iterator',
    'CFunction',
    'CType',
    'CArgument',
    'If',
    'While',
    'For',
    'Try',
    'Catch',
    'Finally',
    'Cast',
    'Type',
    'Subtype',
    'Where',
    'Is',
    'Has',
    'Transform',
]);

var operatorMap = {};
declareOperator(exports, operatorMap, 'Op', [
    'No', '',
    'Eq', '=',
    'ConcatString', '++',
    'Lookup', '.[]',
    'Index', '[]',
    'Slice', '[]',
    'Or', '|',
    'And', '&',
    'Not', '!',
    'Equals', '=',
    'NotEquals', '!=',
    'GreaterThan', '>',
    'GreaterThanEquals', '>=',
    'LessThan', '<',
    'LessThanEquals', '<=',
    'Is', 'is',
    'IsNot', 'is not',
    'Has', 'has',
    'HasNot', 'has not',
    'IsIn', 'is in',
    'NotIn', 'not in',
    'Add', '+',
    'Subtract', '-',
    'Multiply', '*',
    'Divide', '/',
    'Mod', '%',
    'Pow', '**',
    'Concat', '++',
    'AddEq', '+=',
    'SubtractEq', '-=',
    'MultiplyEq', '*=',
    'DivideEq', '/=',
    'ModEq', '%=',
    'PowEq', '**=',
    'ConcatEq', '++=',
    'Positive', '+',
    'Negative', '-',
    'Delete', 'del',
    'In', 'in',
    'Read', '<<',
    'Write', '>>',
    'WriteAll', '*>>',
    'Bind', ';',
]);

declareEnum(exports, 'Access', [
    'No',
    'Private',
    'Public',
    'Extra',
]);

declareEnum(exports, 'Call', [
    'Immediate',
    'Concurrent',
    'Parallel'
]);

function declareEnum(dest, postfix, names) {
    for (var i = 0, l = names.length; i < l; ++i) {
        var name = names[i] + postfix;
        dest[name] = i;
    }
}

function declareOperator(dest, ops, postfix, names) {
    for (var i = 0, l = names.length; i < l; i += 2) {
        var name = names[i] + postfix;
        dest[name] = i;
        ops[i] = names[i+1];
    }
}

// ************************************************************************************************

function Syntax() {
}

function NumberSyntax() {
}

NumberSyntax.prototype = fool.subclass(Syntax, {
});

// ---------------------------------------------------------------------------------------------

function IntegerSyntax(n, unit) {
    this.number = n;
    this.unit = unit;
}
exports.IntegerSyntax = IntegerSyntax;

IntegerSyntax.prototype = fool.subclass(NumberSyntax, {
    toXML: function(writer) {
        writer.begin('Integer', {value: this.number});
        if (this.unit) {
            writer.attr('unit', this.unit);
        }
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

function FloatSyntax(n, unit) {
    this.number = n;
    this.unit = unit;
}
exports.FloatSyntax = FloatSyntax;

FloatSyntax.prototype = fool.subclass(NumberSyntax, {
    toXML: function(writer) {
        writer.begin('Float', {value: this.number});
        if (this.unit) {
            writer.attr('unit', this.unit);
        }
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

function StringSyntax(str) {
    this.string = str;
}
exports.StringSyntax = StringSyntax;
StringSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.element('String', {value: this.str});
    },
});

// ---------------------------------------------------------------------------------------------

function IdentifierSyntax(id) {
    this.id = id;
}
exports.IdentifierSyntax = IdentifierSyntax;

IdentifierSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.element('Id', {name: this.id});
    },
});

function UnarySyntax(op, operand) {
    this.op = op;
    this.operand = operand;
}
exports.UnarySyntax = UnarySyntax;

UnarySyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('UnaryExpression', {op: '' + opToString(this.op)});
        if (this.operand) {
            this.operand.toXML(writer);
        }
        writer.end();
    },
});

function BinarySyntax(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
}
exports.BinarySyntax = BinarySyntax;

BinarySyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('BinaryExpression', {op: '' + opToString(this.op)});
        this.left.toXML(writer);
        this.right.toXML(writer);
        writer.end();
    },
});

function AssignmentSyntax(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
}
exports.AssignmentSyntax = AssignmentSyntax;

AssignmentSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('AssignmentExpression', {op: '' + opToString(this.op)});
        this.left.toXML(writer);
        this.right.toXML(writer);
        writer.end();
    },
});

function CallSyntax(callable, args, schedule, isImperative) {
    this.callable = callable;
    this.args = args;
    this.schedule = schedule;
    this.isImperative = isImperative;
}
exports.CallSyntax = CallSyntax;

CallSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('CallExpression', {});
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }
        if (this.schedule) {
            writer.begin('schedule');
            this.schedule.toXML(writer);
            writer.end();
        }
        this.callable.toXML(writer);
        for (var i = 0, l = this.args.length; i < l; ++i) {
            this.args[i].toXML(writer);
        }
        writer.end();
    },
});

function SetSyntax(loc, firstValue) {
    this.loc = loc;
    this.statements = firstValue ? [firstValue] : [];
}
exports.SetSyntax = SetSyntax;
SetSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        for (var i = 0, l = this.statements.length; i < l; ++i) {
            this.statements[i].toXML(writer);
        }
    },
    
    append: function(statement) {
        if (statement) {
            this.statements.push(statement);
        }
    },
});

// ---------------------------------------------------------------------------------------------

function FunctionDeclSyntax(id, typeArgs, args, returns, schedule) {
    this.id = id;
    this.typeArgs = typeArgs;
    this.args = args;
    this.returns = returns;
    this.schedule = schedule;
    this.accessMode = null;
    this.block = null;
    this.isImperative = false;
}

exports.FunctionDeclSyntax = SetSyntax;
FunctionDeclSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        var access = this.accessMode == exports.PrivateAccess ? 'private' : 'public';
        var id = this.id ? this.id : '';
        
        writer.begin('FunctionDeclaration', {id: id, access: access});
        if (this.schedule) {
            writer.attr('schedule', this.schedule.id);
        }
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }
        if (this.args) {
            this.args.toXML(writer);
        }

        if (this.returns) {
            writer.begin('returns');
            this.returns.toXML(writer);
            writer.end();
        }
        if (this.block) {
            this.block.toXML(writer);
        }
        writer.end();
    },
});

function ArgumentDeclSyntax(innerName, outerName, type, isVariadic) {
    this.innerName = innerName;
    this.outerName = outerName;
    this.type = type;
    this.isVariadic = isVariadic;
    this.defaultValue = null;
}

exports.ArgumentDeclSyntax = SetSyntax;
ArgumentDeclSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Argument', {name: this.innerName});
        if (this.outerName) {
            writer.attr('outer', this.outerName);
        }
        if (this.isVariadic) {
            writer.attr('variadic', 'true');
        }
        if (this.type) {
            this.type.toXML(writer);
        }
        if (this.defaultValue) {
            this.defaultValue.toXML(writer);
        }
        writer.end();
    },
});

TypeAssignmentSyntax

function TypeAssignmentSyntax(id, type) {
    this.id = id;
    this.type = type;
}
exports.TypeAssignmentSyntax = SetSyntax;
TypeAssignmentSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('TypeAssignment', {id: id});
        if (this.type) {
            this.type.toXML(writer);
        }
        writer.end();
    },
});

function TypeIdSyntax(id) {
    this.id = id;
    this.args = [];
}
exports.TypeIdSyntax = SetSyntax;
TypeIdSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('TypeId', {id: this.id});
        for (var i = 0, l = this.args.length; i < l; ++i) {
            writer.element('arg', {name: this.args[i]});
        }
        writer.end();
    },
    
    add: function(arg) {
        this.args.push(arg);
    }
});

// ---------------------------------------------------------------------------------------------

function opToString(op) {
    return operatorMap[op];
}

// *************************************************************************************************

function parseNumber(text, loc) {
    var m = /^([0-9]+(\.[0-9]+)?)(.*?)$/.exec(text);
    var unit = m[3] || null;
    var node = m[2]
        ? new FloatSyntax(parseFloat(m[1]))
        : new IntegerSyntax(parseInt(m[1]));
    node.loc = loc;
    if (unit) {
        var unitId = parseId(loc, unit);
        var call = new CallSyntax(unitId, [node], null, false);
        call.loc = loc;
        return call;
    }
    return node;
}
exports.parseNumber = parseNumber;

function parseString(text) {
}
exports.parseString = parseString;

function parseId(loc, text) {
    var id = new IdentifierSyntax(text);
    id.loc = loc;
    return id;
}
exports.parseId = parseId;

function parseTypeId(loc, text) {
    var id = new TypeIdSyntax(text);
    id.loc = loc;
    return id;
}
exports.parseId = parseId;

exports.parseAssignment = function(loc, op, left, right) {
    var node = new AssignmentSyntax(op, left, right);
    node.loc = loc;
    return node;
}

exports.parseBinary = function(loc, op, left, right) {
    var node = new BinarySyntax(op, left, right);
    node.loc = loc;
    return node;
}

exports.parseUnary = function(loc, op, operand) {
    if (op == exports.NegativeOp && operand instanceof NumberSyntax) {
        operand.number = -operand.number;
        return operand;
    } else {
        var node = new UnarySyntax(op, operand);
        node.loc = loc;
        return node;
    }
}

exports.parseFuncDecl = function(loc, id, args, returns, schedule) {
    var name = null, typeArgs = null;
    if (id instanceof TypeIdSyntax) {
        name = id.id;
        typeArgs = id.args;
    } else {
        name = id;
    }
    var node = new FunctionDeclSyntax(name, typeArgs, args, returns || null,
                                      schedule || null);
    node.loc = loc;
    return node;
}

exports.parseFuncBlock = function(loc, accessMode, decl, block, isImperative) {
    decl.accessMode = accessMode
    decl.block = block;
    decl.isImperative = isImperative;
    decl.loc = loc;
    return decl;
}

exports.parseArg = function(loc, name, outerName, isVariadic) {
    var innerName = null, type = null;
    if (name instanceof TypeAssignmentSyntax) {
        innerName = name.id;
        type = name.type;
    } else {
        innerName = outerName ? outerName.slice(1) : name;
    }
    if (outerName) {
        outerName = outerName.slice(1);
    }
    var node = new ArgumentDeclSyntax(innerName, outerName, type, isVariadic);
    node.loc = loc;
    return node;
}

exports.parseTypeAssignment = function(loc, name, type) {
    var node = new TypeAssignmentSyntax(name, type);
    node.loc = loc;
    return node;
}

exports.parseTypeId = function(loc, id) {
    var node = new TypeIdSyntax(id);
    node.loc = loc;
    return node;
}

exports.addTypeArg = function(id, arg) {
    id.add(arg);
    return id;
}
