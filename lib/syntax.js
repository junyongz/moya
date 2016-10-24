
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
    'Slice', '[to]',
    'Or', '|',
    'And', '&',
    'Not', '!',
    'Equals', '==',
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
    'Mod', '//',
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
        writer.element('String', {value: this.string});
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

function ArgumentSyntax(expr, outerName) {
    this.expr = expr;
    this.outerName = outerName;
}
exports.ArgumentSyntax = ArgumentSyntax;

ArgumentSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('arg', {});
        if (this.outerName) {
            writer.attr('name', this.outerName);
        }
        this.expr.toXML(writer);
        writer.end();
    },
});

function GetSyntax(left, right) {
    this.left = left;
    this.right = right;
}
exports.GetSyntax = GetSyntax;

GetSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('GetExpression', {name: this.right});
        this.left.toXML(writer);
        writer.end();
    },
});

function DefaultSyntax(expr, defaultValue) {
    this.expr = expr;
    this.defaultValue = defaultValue;
}
exports.DefaultSyntax = DefaultSyntax;

DefaultSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Default', {});
        this.expr.toXML(writer);
        this.defaultValue.toXML(writer);
        writer.end();
    },
});

function SetSyntax(loc, firstValue) {
    this.loc = loc;
    this.items = firstValue ? [firstValue] : [];
}
exports.SetSyntax = SetSyntax;
SetSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        for (var i = 0, l = this.items.length; i < l; ++i) {
            this.items[i].toXML(writer);
        }
    },
    
    append: function(item) {
        if (item) {
            this.items.push(item);
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

exports.FunctionDeclSyntax = FunctionDeclSyntax;
FunctionDeclSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        var access = this.accessMode == exports.PrivateAccess ? 'private' : 'public';
        var id = this.id ? this.id : '';
        
        writer.begin('FunctionDeclaration', {id: id, access: access});
        if (this.schedule) {
            writer.attr('schedule', this.schedule);
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

exports.ArgumentDeclSyntax = ArgumentDeclSyntax;
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

function ClassSyntax(access, name, base, body) {
    this.access = access;
    this.name = name;
    this.base = base;
    this.body = body;
}

exports.ClassSyntax = ClassSyntax;
ClassSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        var access = this.access == exports.PrivateAccess ? 'private' :'public';
        writer.begin('Class', {access: access});
        this.name.toXML(writer);
        if (this.base) {
            writer.begin('base');
            this.base.toXML(writer);
            writer.end();
        }
        if (this.body) {
            this.body.toXML(writer);
        }
        writer.end();
    },
});

function PropertySyntax(access, name, type, body, clause) {
    this.access = access;
    this.name = name;
    this.type = type;
    this.body = body;
    this.clause = clause;
}

exports.PropertySyntax = PropertySyntax;
PropertySyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        var access = this.access == exports.PrivateAccess ? 'private' :'public';
        writer.begin('Property', {name: this.name, access: access});
        if (this.type) {
            this.type.toXML(writer);
        }
        if (this.clause) {
            writer.begin('clause');
            this.clause.toXML(writer);
            writer.end();
        }
        if (this.body) {
            this.body.toXML(writer);
        }
        writer.end();
    },
});

function TypeAssignmentSyntax(name, type) {
    this.name = name;
    this.type = type;
}
exports.TypeAssignmentSyntax = TypeAssignmentSyntax;
TypeAssignmentSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('TypeAssignment', {name: this.name});
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
exports.TypeIdSyntax = TypeIdSyntax;
TypeIdSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('TypeId', {id: this.id});
        for (var i = 0, l = this.args.length; i < l; ++i) {
            this.args[i].toXML(writer);
        }
        writer.end();
    },
    
    append: function(arg) {
        this.args.push(arg);
    },

    appendList: function(items) {
        if (items instanceof Array) {
            for (var i = 0, l = items.length; i < l; ++i) {
                this.args.push(items[i]);
            }
        } else {
            this.args.push(items);
        }
    },
    
    appendId: function(id) {
        this.append(new TypeIdSyntax(id));
    }
});

function AnonFuncSyntax(args, block, isImperative) {
    this.args = args;
    this.block = block;
    this.isImperative = isImperative;
}

exports.AnonFuncSyntax = AnonFuncSyntax;
AnonFuncSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Function', {});
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }
        if (this.args) {
            for (var i = 0, l = this.args.length; i < l; ++i) {
                this.args[i].toXML(writer);
            }
        }
        if (this.block) {
            this.block.toXML(writer);
        }
        writer.end();
    },
});

function CallSyntax(callable, args) {
    this.callable = callable;
    this.args = args || [];
}

exports.CallSyntax = CallSyntax;
CallSyntax.prototype = fool.subclass(Syntax, {
    addArg: function(arg) {
        if (arg) {
            this.args.push(arg);
        }
    },
    
    toXML: function(writer) {
        writer.begin('CallExpression', {});
        this.callable.toXML(writer);
        if (this.args) {
            for (var i = 0, l = this.args.length; i < l; ++i) {
                this.args[i].toXML(writer);
            }
        }
        writer.end();
    },
});

function RangeSyntax(from, to, by, isThrough) {
    this.from = from;
    this.to = to;
    this.by = by;
    this.isThrough = isThrough;
}

exports.RangeSyntax = RangeSyntax;
RangeSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Range', {});
        if (this.isThrough) {
            writer.attr('through', 'true');
        }
        this.from.toXML(writer);
        this.to.toXML(writer);
        if (this.by) {
            this.by.toXML(writer);
        }
        writer.end();
    },
});

function ListSyntax(items) {
    this.items = items;
}

exports.ListSyntax = ListSyntax;
ListSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('List', {});
        if (this.items) {
            this.items.toXML(writer);
        }
        writer.end();
    },
});

function MapSyntax(pairs) {
    this.pairs = pairs;
}

exports.MapSyntax = MapSyntax;
MapSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Map', {});
        if (this.pairs) {
            this.pairs.toXML(writer);
        }
        writer.end();
    },
});

function BreakSyntax() {
}

exports.BreakSyntax = BreakSyntax;
BreakSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Break', {});
        writer.end();
    },
});

function ContinueSyntax() {
}

exports.ContinueSyntax = ContinueSyntax;
ContinueSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Continue', {});
        writer.end();
    },
});

function ReturnSyntax(expr) {
    this.expr = expr;
}

exports.ReturnSyntax = ReturnSyntax;
ReturnSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Return', {});
        if (this.expr) {
            this.expr.toXML(writer);
        }
        writer.end();
    },
});

function ThrowSyntax(expr) {
    this.expr = expr;
}

exports.ThrowSyntax = ThrowSyntax;
ThrowSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Throw', {});
        if (this.expr) {
            this.expr.toXML(writer);
        }
        writer.end();
    },
});

function CastSyntax(expr, type) {
    this.expr = expr;
    this.type = type;
}

exports.CastSyntax = CastSyntax;
CastSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('Cast', {});
        this.expr.toXML(writer);
        this.type.toXML(writer);
        writer.end();
    },
});

function IfSyntax(clause, block) {
    this.clause = clause;
    this.block = block;
    this.elseIfs = [];
    this.else = null;
}

exports.IfSyntax = IfSyntax;
IfSyntax.prototype = fool.subclass(Syntax, {
    toXML: function(writer) {
        writer.begin('If', {});
        this.clause.toXML(writer);
        this.block.toXML(writer);
        for (var i = 0, l = this.elseIfs.length; i < l; ++i) {
            var elseIf = this.elseIfs[i];
            writer.begin('elseIf');
            elseIf.clause.toXML(writer);
            elseIf.block.toXML(writer);
            writer.end();
        }
        if (this.else) {
            writer.begin('else');
            this.else.toXML(writer);
            writer.end();
        }
        writer.end();
    },
    
    addIf: function(clause, block) {
        if (clause) {
            this.elseIfs.push({clause: clause, block: block});
        } else {
            if (this.else) {
                throw Error('Only one else allowed');
            }
            this.else = block;
        }
    },
    
    setElse: function(block) {
        this.else = block;
    }
});

// ---------------------------------------------------------------------------------------------

function opToString(op) {
    return operatorMap[op];
}

// *************************************************************************************************

function parseNumber(loc, text) {
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

function parseFloatNumber(loc, text) {
    var node = new FloatSyntax(parseFloat(text));
    node.loc = loc;
    return node;
}
exports.parseFloatNumber = parseFloatNumber;

function parseHex(loc, text) {
    return parseNumber(loc, parseInt(text, 16));
}
exports.parseHex = parseHex;

function parseString(loc, str) {
    var escapeMap = {
        'n': '\n',
        't': '\t',
    };

    str = str.replace(/\\x(..)/g, function(s, c) {
        var c = parseInt(c, '16');
        return String.fromCharCode(c);
    });
    
    str = str.replace(/\\(.)/g, function(s, c) {
        if (c in escapeMap) {
            return escapeMap[c];
        } else {
            return c;
        }
    });
    
    var node = new StringSyntax(str);
    node.loc = loc;
    return node;
}
exports.parseString = parseString;

function parseQuotes(loc, quote, str){
    if (quote.length > 1) {
        var name = quote.slice(0, quote.length-1);
        var id = parseId(loc, name);
        var call = exports.parseCall(loc, id, [str]);
        return call;
    } else {
        return str;
    }
}
exports.parseQuotes = parseQuotes;

function parseStringFormat(loc, str) {
    var parts = str.split('.');
    var id = parts[0]
    if (parts == '%') {
        return parseString(loc, id);
    } else {
        id = id.slice(1);
    }
    var left = exports.parseId(loc, parts[0].slice(1));
    left.loc = loc;
    for (var i = 1, l = parts.length; i < l; ++i) {
        left = exports.parseGet(loc, left, parts[i]);
        left.loc = loc;
    }
    return left;
}
exports.parseStringFormat = parseStringFormat;

function addString(loc, left, right) {
    var node = new BinarySyntax(exports.ConcatOp, left, right);
    node.loc = loc;
    return node;
}
exports.addString = addString;

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
    if (op == exports.IndexOp && right instanceof RangeSyntax) {
        op = exports.SliceOp;
    }
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

exports.parseArgDecl = function(loc, name, outerName, isVariadic) {
    var innerName = null, type = null;
    if (name instanceof TypeAssignmentSyntax) {
        innerName = name.name;
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

exports.parseClass = function(loc, access, name, base, body) {
    var node = new ClassSyntax(access, name, base, body);
    node.loc = loc;
    return node;
}

exports.parseProperty = function(loc, access, name, type, body, clause) {
    var node = new PropertySyntax(access, name, type, body, clause);
    node.loc = loc;
    return node;
}

exports.parseAnonFunc = function(loc, args, isImperative, body) {
    var argList = null;
    if (args instanceof Array) {
        argList = args;
    } else if (args instanceof SetSyntax) {
        argList = args.items.slice();
    } else if (args instanceof Syntax) {
        argList = [args];
    }
    var node = new AnonFuncSyntax(argList, body, isImperative);
    node.loc = loc;
    return node;
}

exports.parseCall = function(loc, callable, args) {
    var node = new CallSyntax(callable, args);
    node.loc = loc;
    return node;
}

exports.parseCallBlock = function(loc, callable, arg) {
    if (callable instanceof CallSyntax) {
        if (arg) {
            callable.args.push(arg);
        }
        return callable;
    } else {
        return exports.parseCall(loc, callable, arg ? [arg] : null);
    }
}

exports.parseArg = function(loc, expr, outerName) {
    if (expr) {
        var node = new ArgumentSyntax(expr, outerName ? outerName.slice(1) : null);
        node.loc = loc;
        return node;
    }
}

exports.parseGet = function(loc, left, name) {
    var node = new GetSyntax(left, name);
    node.loc = loc;
    return node;
}

exports.parseDefault = function(loc, expr, defaultValue) {
    var node = new DefaultSyntax(expr, defaultValue);
    node.loc = loc;
    return node;
}

exports.parseUndefined = function(loc) {
    return exports.parseId(loc, "undefined");
}

exports.parseRange = function(loc, from, to, by, isThrough) {
    var node = new RangeSyntax(from, to, by, isThrough);
    node.loc = loc;
    return node;
}

exports.parseInfixOp = function(loc, op, left, right) {
    var callable = new IdentifierSyntax(op.slice(1));
    var node = new CallSyntax(callable, [left, right]);
    node.loc = loc;
    return node;
}
        
exports.ensureSet = function(loc, set) {
    if (set instanceof SetSyntax) {
        return set;
    } else {
        return new SetSyntax(loc, set);
    }
}

exports.parseList = function(loc, items) {
    var node = new ListSyntax(items);
    node.loc = loc;
    return node;
}

exports.parseMap = function(loc, pairs) {
    var node = new MapSyntax(pairs);
    node.loc = loc;
    return node;
}

exports.parseChannel = function(loc, items) {
    var node = new ChannelSyntax(items);
    node.loc = loc;
    return node;
}

exports.parseBreak = function(loc) {
    var node = new BreakSyntax();
    node.loc = loc;
    return node;
}

exports.parseContinue = function(loc) {
    var node = new ContinueSyntax();
    node.loc = loc;
    return node;
}

exports.parseThrow = function(loc, expr) {
    var node = new ThrowSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseReturn = function(loc, expr) {
    var node = new ReturnSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseCast = function(loc, expr, type) {
    var node = new CastSyntax(expr, type);
    node.loc = loc;
    return node;
}

exports.parseIf = function(loc, clause, block) {
    var node = new IfSyntax(clause, block);
    node.loc = loc;
    return node;
}
