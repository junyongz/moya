
var fool = require('fool');
var XMLWriter = require('./xmlwriter').XMLWriter;

// *************************************************************************************************

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
    'TypeArguments',
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
    'LookupSet', '.[]=',
    'Index', '[]',
    'IndexSet', '[]=',
    'Slice', '[to]',
    'SliceSet', '[to]=',
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
    'ModEq', '//=',
    'PowEq', '**=',
    'ConcatEq', '++=',
    'Positive', '+',
    'Negative', '-',
    'Delete', '-=del',
    'In', 'in this',
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

Syntax.prototype = {
    toString: function() {
        var writer = new XMLWriter();
        this.toXML(writer);
        return writer.read();
    },
};

// ---------------------------------------------------------------------------------------------

function NumberSyntax() {
}

NumberSyntax.prototype = fool.subclass(Syntax, {
});

// ---------------------------------------------------------------------------------------------

function IntegerSyntax(value, unit) {
    this.value = value;
    this.unit = unit;
}
exports.IntegerSyntax = IntegerSyntax;

IntegerSyntax.prototype = fool.subclass(NumberSyntax, {
    nick: "Integer",

    toXML: function(writer) {
        writer.begin('Integer', {value: this.value});
        if (this.unit) {
            writer.attr('unit', this.unit);
        }
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

function FloatSyntax(value, unit) {
    this.value = value;
    this.unit = unit;
}
exports.FloatSyntax = FloatSyntax;

FloatSyntax.prototype = fool.subclass(NumberSyntax, {
    nick: "Float",

    toXML: function(writer) {
        writer.begin('Float', {value: this.value});
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
    nick: "String",

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
    nick: "Identifier",

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
    nick: "Unary",

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
    nick: "Binary",

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
    nick: "Assignment",

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
    nick: "Argument",

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
    nick: "Get",

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
    nick: "Default",

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
    nick: "Set",

    toXML: function(writer) {
        for (var i = 0, l = this.items.length; i < l; ++i) {
            this.items[i].toXML(writer);
        }
    },
    
    append: function(item) {
        if (item) {
            this.items.push(item);
        }
        return this;
    },
});

// ---------------------------------------------------------------------------------------------

function FunctionDeclSyntax(id, args, returns, schedule) {
    this.id = id;
    this.args = args || new SetSyntax();
    this.returns = returns;
    this.schedule = schedule;
    this.accessMode = null;
    this.body = null;
    this.where = null;
    this.isImperative = false;
}

exports.FunctionDeclSyntax = FunctionDeclSyntax;
FunctionDeclSyntax.prototype = fool.subclass(Syntax, {
    nick: "FunctionDecl",

    toXML: function(writer) {
        var access = this.accessMode == exports.PrivateAccess ? 'private' : 'public';
        
        writer.begin('FunctionDeclaration', {access: access});
        if (this.schedule) {
            writer.attr('schedule', this.schedule);
        }
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }

        this.id.toXML(writer);
        if (this.args) {
            this.args.toXML(writer);
        }

        if (this.returns) {
            writer.begin('returns');
            this.returns.toXML(writer);
            writer.end();
        }
        if (this.where) {
            writer.begin('where');
            this.where.toXML(writer);
            writer.end();
        }
        if (this.body) {
            this.body.toXML(writer);
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
    nick: "ArgumentDecl",
    
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

function ClassSyntax(access, id, base, body) {
    this.accessMode = access;
    this.id = id;
    this.base = base;
    this.body = body || new SetSyntax();
}

exports.ClassSyntax = ClassSyntax;
ClassSyntax.prototype = fool.subclass(Syntax, {
    nick: "Class",

    toXML: function(writer) {
        var access = this.accessMode == exports.PrivateAccess ? 'private' :'public';
        writer.begin('Class', {access: access});
        this.id.toXML(writer);
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
    this.accessMode = access;
    this.name = name;
    this.type = type;
    this.body = body;
    this.clause = clause;
}

exports.PropertySyntax = PropertySyntax;
PropertySyntax.prototype = fool.subclass(Syntax, {
    nick: "Property",

    toXML: function(writer) {
        var access = this.accessMode == exports.PrivateAccess ? 'private' :'public';
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

function TypeAssignmentSyntax(name, type, pointers) {
    this.name = name;
    this.type = type;
    this.pointers = pointers || 0;
}
exports.TypeAssignmentSyntax = TypeAssignmentSyntax;
TypeAssignmentSyntax.prototype = fool.subclass(Syntax, {
    nick: "TypeAssignment",

    toXML: function(writer) {
        writer.begin('TypeAssignment', {name: this.name});
        if (this.type) {
            this.type.toXML(writer);
        }
        writer.end();
    },
});

function TypeIdSyntax(id, pointers) {
    this.id = id;
    this.pointers = pointers || 0;
}
exports.TypeIdSyntax = TypeIdSyntax;
TypeIdSyntax.prototype = fool.subclass(Syntax, {
    nick: "TypeId",
    
    toXML: function(writer) {
        writer.element('TypeId', {id: this.id});
    },
});

function TypeArgumentsSyntax(arg) {
    this.args = arg ? [arg] : [];
}
exports.TypeArgumentsSyntax = TypeArgumentsSyntax;
TypeArgumentsSyntax.prototype = fool.subclass(Syntax, {
    nick: "TypeArguments",
    
    toXML: function(writer) {
        writer.begin('TypeArguments', {});
        for (var i = 0, l = this.args.length; i < l; ++i) {
            this.args[i].toXML(writer);
        }
        writer.end();
    },
    
    append: function(arg) {
        this.args.push(arg);
        return this;
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
});

function AnonFuncSyntax(args, body, isImperative) {
    this.args = args;
    this.body = body;
    this.isImperative = isImperative;
}

exports.AnonFuncSyntax = AnonFuncSyntax;
AnonFuncSyntax.prototype = fool.subclass(Syntax, {
    nick: "AnonFunc",

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
        if (this.body) {
            this.body.toXML(writer);
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
    nick: "Call",

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

    addArg: function(arg) {
        if (arg) {
            this.args.push(arg);
        }
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
    nick: "Range",

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
    nick: "List",
    
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
    nick: "Map",

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
    nick: "Break",

    toXML: function(writer) {
        writer.begin('Break', {});
        writer.end();
    },
});

function ContinueSyntax() {
}

exports.ContinueSyntax = ContinueSyntax;
ContinueSyntax.prototype = fool.subclass(Syntax, {
    nick: "Continue",

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
    nick: "Return",

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
    nick: "Throw",

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
    nick: "Cast",

    toXML: function(writer) {
        writer.begin('Cast', {});
        this.expr.toXML(writer);
        this.type.toXML(writer);
        writer.end();
    },
});

function TransformSyntax(clause, block) {
    this.pairs = [{clause: clause, block: block}];
}

exports.TransformSyntax = TransformSyntax;
TransformSyntax.prototype = fool.subclass(Syntax, {
    nick: "Transform",

    toXML: function(writer) {
    },
    
    addPair: function(clause, block) {
        this.pairs.push({clause: clause, block: block});
    },
});

function IfSyntax(transforms, elsex) {
    this.transforms = transforms;
    this.else = elsex;
}

exports.IfSyntax = IfSyntax;
IfSyntax.prototype = fool.subclass(Syntax, {
    nick: "If",

    toXML: function(writer) {
        writer.begin('If', {});
        var pairs = this.transforms.pairs;
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            writer.begin('if');
            pair.clause.toXML(writer);
            pair.block.toXML(writer);
            writer.end();
        }
        if (this.else) {
            writer.begin('else');
            this.else.toXML(writer);
            writer.end();
        }
        writer.end();
    },
});

function IsSyntax(object, transforms, elsex) {
    this.object = object;
    this.transforms = transforms || [];
    this.else = elsex;
}

exports.IsSyntax = IsSyntax;
IsSyntax.prototype = fool.subclass(Syntax, {
    nick: "Is",

    toXML: function(writer) {
        writer.begin('Is', {});
        this.object.toXML(writer);
        var pairs = this.transforms.pairs;
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            writer.begin('if');
            pair.clause.toXML(writer);
            pair.block.toXML(writer);
            writer.end();
        }
        if (this.else) {
            writer.begin('else');
            this.else.toXML(writer);
            writer.end();
        }
        writer.end();
    },
});

function WhereSyntax(block, where) {
    this.block = block
    this.where = where;
}

exports.WhereSyntax = WhereSyntax;
WhereSyntax.prototype = fool.subclass(Syntax, {
    nick: "Where",

    toXML: function(writer) {
        writer.begin('Where', {});
        this.block.toXML(writer);
        writer.begin('where', {});
        this.where.toXML(writer);
        writer.end();
        writer.end();
    },
});

function IteratorSyntax(left, iterable, clause, body, inOn, ifWhile) {
    this.left = left;
    this.iterable = iterable;
    this.clause = clause;
    this.body = body;
    this.inOn = inOn;
    this.ifWhile = ifWhile;
}

exports.IteratorSyntax = IteratorSyntax;
IteratorSyntax.prototype = fool.subclass(Syntax, {
    nick: "Iterator",

    toXML: function(writer) {
        writer.begin('Iterator', {});
        if (this.inOn) {
            writer.attr('on', 'true');
        }
        if (this.ifWhile) {
            writer.attr('while', 'true');
        }
        writer.begin('left', {});
        this.left.toXML(writer);
        writer.end();
        if (this.iterable) {
            writer.begin('iterable', {});
            this.iterable.toXML(writer);
            writer.end();
        }
        if (this.clause) {
            writer.begin('clause', {});
            this.clause.toXML(writer);
            writer.end();
        }
        this.body.toXML(writer);
        writer.end();
    },
});

function ImportSyntax(moduleNames) {
    this.moduleNames = moduleNames;
}

exports.ImportSyntax = ImportSyntax;
ImportSyntax.prototype = fool.subclass(Syntax, {
    nick: "Import",

    toXML: function(writer) {
        writer.begin('Import', {});
        for (var i = 0, l = this.moduleNames.length; i < l; ++i) {
            writer.begin('module');
            this.moduleNames[i].toXML(writer);
            writer.end();
        }
        writer.end();
    },
});

function TrySyntax(block, catchers, final) {
    this.block = block;
    this.catchers = catchers;
    this.final = final;
}

exports.TrySyntax = TrySyntax;
TrySyntax.prototype = fool.subclass(Syntax, {
    nick: "Try",

    toXML: function(writer) {
        writer.begin('Try', {});
        this.block.toXML(writer);
        if (this.catchers) {
            this.catchers.toXML(writer);
        }
        if (this.final) {
            writer.begin('finally', {});
            this.final.toXML(writer);
            writer.end();
        }
        writer.end();
    },
});

function CatchSyntax(decl, block) {
    this.decl = decl;
    this.block = block;
}

exports.CatchSyntax = CatchSyntax;
CatchSyntax.prototype = fool.subclass(Syntax, {
    nick: "Catch",

    toXML: function(writer) {
        writer.begin('Catch', {});
        if (this.decl) {
            this.decl.toXML(writer);
        }
        this.block.toXML(writer);
        writer.end();
    },
});

function WhileSyntax(clause, block) {
    this.clause = clause;
    this.block = block;
}

exports.WhileSyntax = WhileSyntax;
WhileSyntax.prototype = fool.subclass(Syntax, {
    nick: "While",

    toXML: function(writer) {
        writer.begin('While', {});
        if (this.clause) {
            this.clause.toXML(writer);
        }
        this.block.toXML(writer);
        writer.end();
    },
});

function CTypeSyntax(name) {
    this.name = name;
    this.pointers = 0;
}

exports.CTypeSyntax = CTypeSyntax;
CTypeSyntax.prototype = fool.subclass(Syntax, {
    nick: "CType",

    toXML: function(writer) {
        writer.begin('CType', {name: this.name});
        if (this.pointers) {
            writer.attr('pointers', this.pointers);
        }
        writer.end();
    },

    addPointer: function() {
        this.pointers += 1;
    },
});

function CFunctionSyntax(type, name, args) {
    this.type = type;
    this.name = name;
    this.library = null;
    this.args = args;
}

exports.CFunctionSyntax = CFunctionSyntax;
CFunctionSyntax.prototype = fool.subclass(Syntax, {
    nick: "CFunction",

    toXML: function(writer) {
        writer.begin('CFunction', {name: this.name});
        if (this.library) {
            writer.attr('library', this.library);
        }
        if (this.args) {
            this.args.toXML(writer);
        }
        this.type.toXML(writer);
        writer.end();
    },
});

function CArgumentSyntax(type, name) {
    this.type = type;
    this.name = name;
}

exports.CArgumentSyntax = CArgumentSyntax;
CArgumentSyntax.prototype = fool.subclass(Syntax, {
    nick: "CArgument",

    toXML: function(writer) {
        writer.begin('CArgument', {});
        if (this.name) {
            writer.attr('name', this.name);
        }
        this.type.toXML(writer);
        writer.end();
    },
});

function PrintSyntax(expr) {
    this.expr = expr;
}

exports.PrintSyntax = PrintSyntax;
PrintSyntax.prototype = fool.subclass(Syntax, {
    nick: "Print",

    toXML: function(writer) {
        writer.begin('Print', {});
        this.expr.toXML(writer);
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

function opToString(op) {
    return operatorMap[op];
}
exports.opToString = opToString;

function isMathOp(op) {
    return op == exports.AddOp || op == exports.AddEqOp
        || op == exports.SubtractOp || op == exports.SubtractEqOp
        || op == exports.MultiplyOp || op == exports.MultiplyEqOp
        || op == exports.DivideOp || op == exports.DivideEqOp
        || op == exports.ModOp || op == exports.ModEqOp
        || op == exports.PowOp || op == exports.PowEqOp;
}
exports.isMathOp = isMathOp;

function isIncrementOp(op) {
    return op == exports.AddEqOp || op == exports.SubtractEqOp
        || op == exports.MultiplyEqOp || op == exports.DivideEqOp
        || op == exports.ModEqOp || op == exports.PowEqOp
        || op == exports.ConcatEqOp;
}
exports.isIncrementOp = isIncrementOp;

function isComparisonOp(op) {
    return op == exports.EqualsOp || op == exports.NotEqualsOp
        || op == exports.GreaterThanOp || op == exports.GreaterThanEqualsOp
        || op == exports.LessThanOp || op == exports.LessThanEqualsOp;
}
exports.isComparisonOp = isComparisonOp;

// *************************************************************************************************

exports.parseSet = function(loc, item) {
    var node = new SetSyntax(loc);
    node.append(item);
    return node;
}

function parseNumber(loc, text) {
    var m = /^([0-9]+(\.[0-9]+)?)(.*?)$/.exec(text);
    var unit = m[3] || null;
    var node = m[2]
        ? new FloatSyntax(parseFloat(m[1]))
        : new IntegerSyntax(parseInt(m[1]));
    node.loc = loc;
    if (unit) {
        node.unit = unit;
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
        operand.value = -operand.value;
        return operand;
    } else {
        var node = new UnarySyntax(op, operand);
        node.loc = loc;
        return node;
    }
}

exports.parseEmptyFuncDecl = function(loc, id, accessMode) {
    var node = new FunctionDeclSyntax(id, new SetSyntax(), null, null);
    node.accessMode = accessMode;
    node.loc = loc;
    return node;
}

exports.parseFuncDecl = function(loc, id, args, returns, schedule) {
    if (!id && args instanceof FunctionDeclSyntax) {
        var node = args;
        node.returns = returns;
        node.schedule = schedule;
        node.loc = loc;
        return node;
    } else {
        var node = new FunctionDeclSyntax(id, args, returns || null, schedule || null);
        node.loc = loc;
        return node;
    }
}

exports.parseFuncBlock = function(loc, accessMode, decl, body, where, isImperative) {
    decl.accessMode = accessMode
    decl.body = body;
    decl.where = where;
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

exports.parseTypeAssignment = function(loc, name, type, pointers) {
    var node = new TypeAssignmentSyntax(name, type, pointers);
    node.loc = loc;
    return node;
}

exports.parseTypeId = function(loc, id, pointers) {
    var node = new TypeIdSyntax(id, pointers);
    node.loc = loc;
    return node;
}

exports.parseTypeArguments = function(loc, id) {
    var node = new TypeArgumentsSyntax(id);
    node.loc = loc;
    return node;
}

exports.ensureTypeArguments = function(loc, other) {
    if (other instanceof TypeArgumentsSyntax) {
        return other;
    } else {
        return this.parseTypeArguments(loc, other);
    }
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

exports.parseTransform = function(loc, clause, block) {
    var node = new TransformSyntax(clause, block);
    node.loc = loc;
    return node;
}

exports.parseIf = function(loc, transforms, elsex) {
    var node = new IfSyntax(transforms, elsex);
    node.loc = loc;
    return node;
}

exports.parseIs = function(loc, object, transforms, elsex) {
    var node = new IsSyntax(object, transforms, elsex);
    node.loc = loc;
    return node;
}

exports.parseWhere = function(loc, block, where) {
    var node = new WhereSyntax(block, where);
    node.loc = loc;
    return node;
}

exports.parseIterator = function(loc, decl, iterable, clause, body, inOn, ifWhile) {
    var node = new IteratorSyntax(decl, iterable, clause, body, inOn, ifWhile);
    node.loc = loc;
    return node;
}

exports.parseMapper = function(loc, decl, clause, body, inOn, ifWhile) {
    var iterable = exports.parseId(loc, 'iterable');
    var node = new IteratorSyntax(decl, iterable, clause, body, inOn, ifWhile);
    node.loc = loc;
    var arg = exports.parseArgDecl(loc, 'iterable', null, false);
    var fn = exports.parseAnonFunc(loc, [arg], false, node);
    return fn;
}

exports.parseImport = function(loc, moduleNames) {
    var node = new ImportSyntax(moduleNames);
    node.loc = loc;
    return node;
}

exports.parseTry = function(loc, block, catchers, final) {
    var node = new TrySyntax(block, catchers, final);
    node.loc = loc;
    return node;
}

exports.parseCatch = function(loc, decl, block) {
    var node = new CatchSyntax(decl, block);
    node.loc = loc;
    return node;
}

exports.parseWhile = function(loc, clause, block) {
    var node = new WhileSyntax(clause, block);
    node.loc = loc;
    return node;
}

exports.parseCType = function(loc, name) {
    var node = new CTypeSyntax(name);
    node.loc = loc;
    return node;
}

exports.parseCFunction = function(loc, type, name, args) {
    var node = new CFunctionSyntax(type, name, args);
    node.loc = loc;
    return node;
}

exports.parseCArgument = function(loc, type, name) {
    var node = new CArgumentSyntax(type, name);
    node.loc = loc;
    return node;
}

exports.setLibrary = function(funcs, cprefix) {
    var library = cprefix.slice(2, cprefix.length-1);
    if (library) {
        for (var i = 0, l = funcs.items.length; i < l; ++i) {
            var func = funcs.items[i];
            func.library = library;
        }
    }
}

exports.parsePrint = function(loc, expr) {
    var node = new PrintSyntax(expr);
    node.loc = loc;
    return node;
}
