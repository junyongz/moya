
var fool = require('fool');
var constants = require('./constants'),
    PrivateAccess = constants.PrivateAccess,
    PublicAccess = constants.PublicAccess;
var ops = require('./operator');
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
var MoyaError = require('./utils').MoyaError;
var XMLWriter = require('./xmlwriter').XMLWriter;

// ************************************************************************************************

function Syntax() {
}
exports.Syntax = Syntax;

Syntax.prototype = {
    toString: function() {
        var writer = new XMLWriter();
        this.write(writer);
        return writer.read();
    },

    write: function(writer) {
    },
    
    compile: function(compiler, isStatement) {
        throw new MoyaError("Syntax NYI", this.loc);
    },
};

// *************************************************************************************************

function SetSyntax(loc, firstValue) {
    this.loc = loc;
    this.items = firstValue ? [firstValue] : [];
}
exports.SetSyntax = SetSyntax;

SetSyntax.prototype = fool.subclass(Syntax, {
    nick: "Set",

    write: function(writer) {
        for (var i = 0, l = this.items.length; i < l; ++i) {
            this.items[i].write(writer);
        }
    },
    
    compile: function(compiler, isStatement) {
        var nodes = this.items;
        if (nodes.length == 1) {
            return nodes[0].compile(compiler);
        } else {
            return compiler.compileExpression(this);
        }
    },
    
    // ---------------------------------------------------------------------------------------------

    append: function(item) {
        if (item) {
            this.items.push(item);
        }
        return this;
    },

    
});

function WhereSyntax(block, where) {
    this.block = block
    this.where = where;
}

exports.WhereSyntax = WhereSyntax;
WhereSyntax.prototype = fool.subclass(Syntax, {
    nick: "Where",

    write: function(writer) {
        writer.begin('Where', {});
        this.block.write(writer);
        writer.begin('where', {});
        this.where.write(writer);
        writer.end();
        writer.end();
    },
});

// *************************************************************************************************

function FunctionSyntax(name, args, returns, schedule) {
    this.name = name;
    this.args = args || new SetSyntax();
    this.returns = returns;
    this.schedule = schedule;
    this.accessMode = null;
    this.body = null;
    this.where = null;
    this.isImperative = false;
}
exports.FunctionSyntax = FunctionSyntax;

FunctionSyntax.prototype = fool.subclass(Syntax, {
    nick: "Function",

    write: function(writer) {
        var access = this.accessMode == PrivateAccess ? 'private' : 'public';
        
        writer.begin('FunctionDeclaration', {access: access});
        if (this.schedule) {
            writer.attr('schedule', this.schedule);
        }
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }

        this.name.write(writer);
        if (this.args) {
            this.args.write(writer);
        }

        if (this.returns) {
            writer.begin('returns');
            this.returns.write(writer);
            writer.end();
        }
        if (this.where) {
            writer.begin('where');
            this.where.write(writer);
            writer.end();
        }
        if (this.body) {
            this.body.write(writer);
        }
        writer.end();
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

    write: function(writer) {
        writer.begin('Function', {});
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }
        if (this.args) {
            for (var i = 0, l = this.args.length; i < l; ++i) {
                this.args[i].write(writer);
            }
        }
        if (this.body) {
            this.body.write(writer);
        }
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

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
    
    write: function(writer) {
        writer.begin('Argument', {name: this.innerName});
        if (this.outerName) {
            writer.attr('outer', this.outerName);
        }
        if (this.isVariadic) {
            writer.attr('variadic', 'true');
        }
        if (this.type) {
            this.type.write(writer);
        }
        if (this.defaultValue) {
            this.defaultValue.write(writer);
        }
        writer.end();
    },
});

// *************************************************************************************************

function CFunctionSyntax(type, name, args) {
    this.type = type;
    this.name = name;
    this.library = null;
    this.args = args;
}

exports.CFunctionSyntax = CFunctionSyntax;
CFunctionSyntax.prototype = fool.subclass(Syntax, {
    nick: "CFunction",

    write: function(writer) {
        writer.begin('CFunction', {name: this.name});
        if (this.library) {
            writer.attr('library', this.library);
        }
        if (this.args) {
            this.args.write(writer);
        }
        this.type.write(writer);
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

function CTypeSyntax(name) {
    this.name = name;
    this.pointers = 0;
}

exports.CTypeSyntax = CTypeSyntax;
CTypeSyntax.prototype = fool.subclass(Syntax, {
    nick: "CType",

    write: function(writer) {
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


function CArgumentSyntax(type, name) {
    this.type = type;
    this.name = name;
}
exports.CArgumentSyntax = CArgumentSyntax;

CArgumentSyntax.prototype = fool.subclass(Syntax, {
    nick: "CArgument",

    write: function(writer) {
        writer.begin('CArgument', {});
        if (this.name) {
            writer.attr('name', this.name);
        }
        this.type.write(writer);
        writer.end();
    },
});


// *************************************************************************************************

function ClassSyntax(access, name, base, body) {
    this.accessMode = access;
    this.name = name;
    this.base = base;
    this.body = body || new SetSyntax();
}
exports.ClassSyntax = ClassSyntax;

ClassSyntax.prototype = fool.subclass(Syntax, {
    nick: "Class",

    write: function(writer) {
        var access = this.accessMode == PrivateAccess ? 'private' :'public';
        writer.begin('Class', {access: access});
        this.name.write(writer);
        if (this.base) {
            writer.begin('base');
            this.base.write(writer);
            writer.end();
        }
        if (this.body) {
            this.body.write(writer);
        }
        writer.end();
    },
});

// ---------------------------------------------------------------------------------------------

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

    write: function(writer) {
        var access = this.accessMode == PrivateAccess ? 'private' :'public';
        writer.begin('Property', {name: this.name, access: access});
        if (this.type) {
            this.type.write(writer);
        }
        if (this.clause) {
            writer.begin('clause');
            this.clause.write(writer);
            writer.end();
        }
        if (this.body) {
            this.body.write(writer);
        }
        writer.end();
    },
});

// *************************************************************************************************

function NumberSyntax() {
}
exports.NumberSyntax = NumberSyntax;

NumberSyntax.prototype = fool.subclass(Syntax, {
});

function IntegerSyntax(value, unit) {
    this.value = value;
    this.unit = unit;
}
exports.IntegerSyntax = IntegerSyntax;

IntegerSyntax.prototype = fool.subclass(NumberSyntax, {
    nick: "Integer",

    write: function(writer) {
        writer.begin('Integer', {value: this.value});
        if (this.unit) {
            writer.attr('unit', this.unit);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        if (this.unit == 'i1') {
            return compiler.builder.int(this.value, 1, this.loc);
        } else if (this.unit == 'i8') {
            return compiler.builder.int(this.value, 8, this.loc);
        } else if (this.unit == 'i16') {
            return compiler.builder.int(this.value, 16, this.loc);
        } else if (this.unit == 'i32') {
            return compiler.builder.int(this.value, 32, this.loc);
        } else if (this.unit == 'i64') {
            return compiler.builder.int(this.value, 64, this.loc);
        } else if (this.unit == 'f') {
            return compiler.builder.float32(this.value, this.loc);
        } else if (this.unit == 'd') {
            return compiler.builder.float64(this.value, this.loc);
        } else if (this.unit == 'c') {
            return compiler.builder.int(this.value, 8, this.loc);
        } else if (this.unit) {
            throw new MoyaError("Units not yet implemented", this.loc);
        } else {
            return compiler.builder.int(this.value, 32, this.loc);
        }
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

    write: function(writer) {
        writer.begin('Float', {value: this.value});
        if (this.unit) {
            writer.attr('unit', this.unit);
        }
        writer.end();
    },
    
    compile: function(compiler, isStatement) {
        if (this.unit == 'f') {
            return compiler.builder.float32(this.value, this.loc);
        } else if (this.unit == 'd') {
            return compiler.builder.float64(this.value, this.loc);
        } else if (this.unit) {
            throw new MoyaError("Units not yet implemented", this.loc);
        } else {
            return compiler.builder.float64(this.value, this.loc);
        }
    },
});

// ---------------------------------------------------------------------------------------------

function StringSyntax(str) {
    this.string = str;
}
exports.StringSyntax = StringSyntax;

StringSyntax.prototype = fool.subclass(Syntax, {
    nick: "String",

    write: function(writer) {
        writer.element('String', {value: this.string});
    },

    compile: function(compiler, isStatement) {
        return compiler.builder.string(this.string, this.loc);
    },
});

// *************************************************************************************************

function ListSyntax(items) {
    this.items = items;
}
exports.ListSyntax = ListSyntax;

ListSyntax.prototype = fool.subclass(Syntax, {
    nick: "List",
    
    write: function(writer) {
        writer.begin('List', {});
        if (this.items) {
            this.items.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var itemValues = [];
        var items = this.items.items;
        for (var i = 0, l = items.length; i < l; ++i) {
            var itemValue = items[i].compile(compiler);
            itemValues[i] = itemValue;
        }
        var commonType = compiler.findCommonType(itemValues, function(item) { return item.type; });
        if (!commonType) {
            throw new MoyaError("Incompatible types in list", node.loc);
        }
        
        var symbol = commonType.toSymbol();
        var listClass = compiler.builtinModules['List'].classes['List'][0];
        var listType = compiler.matchClass(listClass, [symbol]);

        var listCons = compiler.matchFunctionCall('List', [], listType.argSymbols);
        var listObj = compiler.builder.call(listCons, [], null, this.loc);

        var addFunc = compiler.matchMethodCall(listType, "add", [commonType], []);
        for (var i = 0, l = itemValues.length; i < l; ++i) {
            var item = itemValues[i];
            var cast = commonType.valueToType(item, compiler, this.loc);
            var ret = compiler.builder.call(addFunc, [listObj, cast], null, this.loc);
            compiler.builder.insert(ret);
        }

        return listObj;
    },
});

function MapSyntax(pairs) {
    this.pairs = pairs;
}
exports.MapSyntax = MapSyntax;

MapSyntax.prototype = fool.subclass(Syntax, {
    nick: "Map",

    write: function(writer) {
        writer.begin('Map', {});
        if (this.pairs) {
            this.pairs.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("Maps NYI", this);
    },
});

function ChannelSyntax(items) {
    this.items = items;
}
exports.ChannelSyntax = ChannelSyntax;

ChannelSyntax.prototype = fool.subclass(Syntax, {
    nick: "Channel",

    write: function(writer) {
        writer.begin('Channel', {});
        if (this.items) {
            this.items.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("Channels NYI", this);
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

    write: function(writer) {
        writer.begin('Range', {});
        if (this.isThrough) {
            writer.attr('through', 'true');
        }
        this.from.write(writer);
        this.to.write(writer);
        if (this.by) {
            this.by.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("Ranges NYI", this);
    },
});

// *************************************************************************************************

function IdentifierSyntax(name) {
    this.name = name;
}
exports.IdentifierSyntax = IdentifierSyntax;

IdentifierSyntax.prototype = fool.subclass(Syntax, {
    nick: "Identifier",

    write: function(writer) {
        writer.element('Id', {name: this.name});
    },

    compile: function(compiler, isStatement) {
        if (this.name == 'true') {
            return compiler.builder.true(this.loc);
        } else if (this.name == 'false') {
            return compiler.builder.false(this.loc);
        } else if (this.name == 'compiler') {
            var thiss = compiler.scope.getThis();
            if (thiss) {
                return thiss;
            } else {
                throw new MoyaError('"this" not relevant here', this.loc);
            }
        } else {
            var result = compiler.scope.lookupVariableValue(this.name, compiler.builder, this.loc);
            if (result) {
                return result;
            } else {
                throw new MoyaError('Name not found', this.loc);
            }
        }
    },
});

function GetSyntax(left, right) {
    this.left = left;
    this.right = right;
}
exports.GetSyntax = GetSyntax;

GetSyntax.prototype = fool.subclass(Syntax, {
    nick: "Get",

    write: function(writer) {
        writer.begin('GetExpression', {name: this.right});
        this.left.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var lhs = this.left.compile(compiler);
        if (lhs.type instanceof ClassType) {
            var prop = lhs.type.getProperty(this.right);
            if (prop) {
                var offset = compiler.builder.propOffset(lhs.type, prop.name);
                var variable = compiler.builder.gep(lhs, [compiler.int(0), offset], null,
                                                    prop.type, this.loc);
                return compiler.builder.loadVariable(variable, this.right, this.loc);
            } else {
                throw new MoyaError('Property not found', this.loc);
            }
        } else {
            throw new MoyaError('Property not found', this.loc);
        }
    },
});

// *************************************************************************************************

function TypeIdSyntax(name, pointers) {
    this.name = name;
    this.pointers = pointers || 0;
}
exports.TypeIdSyntax = TypeIdSyntax;

TypeIdSyntax.prototype = fool.subclass(Syntax, {
    nick: "TypeId",
    
    write: function(writer) {
        writer.element('TypeId', {name: this.name});
    },

    compile: function(compiler, isStatement) {
        var type = compiler.evaluateType(this);
        return compiler.builder.sizeOfType(type);
    },
});

function TypeArgumentsSyntax(arg) {
    this.args = arg ? [arg] : [];
    this.optionals = 0;
}
exports.TypeArgumentsSyntax = TypeArgumentsSyntax;

TypeArgumentsSyntax.prototype = fool.subclass(Syntax, {
    nick: "TypeArguments",
    
    write: function(writer) {
        writer.begin('TypeArguments', {});
        if (this.optionals) {
            writer.attr('optionals', this.optionals);
        }
        
        for (var i = 0, l = this.args.length; i < l; ++i) {
            this.args[i].write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var type = compiler.evaluateType(this);
        return compiler.builder.sizeOfType(type);
    },
    // ---------------------------------------------------------------------------------------------
    
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

// *************************************************************************************************

function UnarySyntax(op, operand) {
    this.op = op;
    this.operand = operand;
}
exports.UnarySyntax = UnarySyntax;

UnarySyntax.prototype = fool.subclass(Syntax, {
    nick: "Unary",

    write: function(writer) {
        writer.begin('UnaryExpression', {op: '' + this.op.token});
        if (this.operand) {
            this.operand.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        return this.op.compile(compiler, this);
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

    write: function(writer) {
        writer.begin('BinaryExpression', {op: '' + this.op.token});
        this.left.write(writer);
        this.right.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        return this.op.compile(compiler, this);
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

    write: function(writer) {
        writer.begin('Is', {});
        this.object.write(writer);
        var pairs = this.transforms.pairs;
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            writer.begin('if');
            pair.clause.write(writer);
            pair.block.write(writer);
            writer.end();
        }
        if (this.else) {
            writer.begin('else');
            this.else.write(writer);
            writer.end();
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("NYI", this.loc);
    },
});

function CastSyntax(expr, type) {
    this.expr = expr;
    this.type = type;
}
exports.CastSyntax = CastSyntax;

CastSyntax.prototype = fool.subclass(Syntax, {
    nick: "Cast",

    write: function(writer) {
        writer.begin('Cast', {});
        this.expr.write(writer);
        this.type.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var type = compiler.evaluateType(this.type);
        var value = this.expr.compile(compiler);
        return type.valueToType(value, compiler, this.loc);
    },
});

function PrintSyntax(expr) {
    this.expr = expr;
}
exports.PrintSyntax = PrintSyntax;

PrintSyntax.prototype = fool.subclass(Syntax, {
    nick: "Print",

    write: function(writer) {
        writer.begin('Print', {});
        this.expr.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var printed = this.expr.compile(compiler);
        var asString = printed.valueToString(compiler, this.loc);
        return compiler.builder.call(compiler.printString, [asString], null, this.loc);
    },
});

// *************************************************************************************************

function CallSyntax(callable, args) {
    this.callable = callable;
    this.args = args || [];
}
exports.CallSyntax = CallSyntax;

CallSyntax.prototype = fool.subclass(Syntax, {
    nick: "Call",

    write: function(writer) {
        writer.begin('CallExpression', {});
        this.callable.write(writer);
        if (this.args) {
            for (var i = 0, l = this.args.length; i < l; ++i) {
                this.args[i].write(writer);
            }
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var callable = this.callable;
        var symbolNodes = null;
        if (callable.nick == "TypeArguments") {
            symbolNodes = callable.args.slice();
            callable = symbolNodes.shift();
        }
        
        if (callable.nick == "Identifier") {
            return compiler.compileCall(callable.name, null, this.args, symbolNodes, this);
        } else if (callable.nick == "TypeId") {
            return compiler.compileCall(callable.name, null, this.args, symbolNodes, this);
        } else if (callable.nick == "Get") {
            var lhs = callable.left.compile(compiler);
            return compiler.compileCall(callable.right, lhs, this.args, symbolNodes, this);
        } else {
            throw new MoyaError('Call type not yet implemented', this.loc);
        }
    },
    
    // ---------------------------------------------------------------------------------------------

    addArg: function(arg) {
        if (arg) {
            this.args.push(arg);
        }
    },
});

// ---------------------------------------------------------------------------------------------

function ArgumentSyntax(expr, outerName) {
    this.expr = expr;
    this.outerName = outerName;
}
exports.ArgumentSyntax = ArgumentSyntax;

ArgumentSyntax.prototype = fool.subclass(Syntax, {
    nick: "Argument",

    write: function(writer) {
        writer.begin('arg', {});
        if (this.outerName) {
            writer.attr('name', this.outerName);
        }
        this.expr.write(writer);
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

    write: function(writer) {
        writer.begin('Default', {});
        this.expr.write(writer);
        this.defaultValue.write(writer);
        writer.end();
    },
});

// *************************************************************************************************

function AssignmentSyntax(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
}
exports.AssignmentSyntax = AssignmentSyntax;

AssignmentSyntax.prototype = fool.subclass(Syntax, {
    nick: "Assignment",

    write: function(writer) {
        writer.begin('AssignmentExpression', {op: '' + this.op.token});
        this.left.write(writer);
        this.right.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        return this.op.compile(compiler, this);
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

    write: function(writer) {
        writer.begin('TypeAssignment', {name: this.name});
        if (this.type) {
            this.type.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        if (isStatement) {
            var type = compiler.evaluateType(this.type);
            var optional;
            if (type instanceof OptionalType) {
                optional = compiler.builder.optional(null, type, this.loc);
            } else {
                type = compiler.getOptionalType(type, 1);
                optional = compiler.builder.optional(null, type, this.loc);
            }
            return compiler.compileVariableDeclare(this.name, type, optional, this.loc);
        } else {
            throw new MoyaError("Invalid syntax", this.loc);
        }
    },
});

// *************************************************************************************************

function BreakSyntax() {
}
exports.BreakSyntax = BreakSyntax;

BreakSyntax.prototype = fool.subclass(Syntax, {
    nick: "Break",

    write: function(writer) {
        writer.begin('Break', {});
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("NYI", this);
    },
});

function ContinueSyntax() {
}
exports.ContinueSyntax = ContinueSyntax;

ContinueSyntax.prototype = fool.subclass(Syntax, {
    nick: "Continue",

    write: function(writer) {
        writer.begin('Continue', {});
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("NYI", this);
    },
});

function ReturnSyntax(expr) {
    this.expr = expr;
}
exports.ReturnSyntax = ReturnSyntax;

ReturnSyntax.prototype = fool.subclass(Syntax, {
    nick: "Return",

    write: function(writer) {
        writer.begin('Return', {});
        if (this.expr) {
            this.expr.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        compiler.markReturned(true);
        
        var value = this.expr.compile(compiler);
        var returned = compiler.builder.return(value, this.loc);
        compiler.addReturn(returned);
    },
});

function ThrowSyntax(expr) {
    this.expr = expr;
}
exports.ThrowSyntax = ThrowSyntax;

ThrowSyntax.prototype = fool.subclass(Syntax, {
    nick: "Throw",

    write: function(writer) {
        writer.begin('Throw', {});
        if (this.expr) {
            this.expr.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        compiler.scope.func.hasThrow = true;
        compiler.markReturned(true);
        
        var exc = this.expr.compile(compiler);
        compiler.catchFrame.markThrow(exc.type);
        
        var excSize = compiler.builder.sizeOfType(exc.type);
        var excBuf = compiler.call(compiler.moyaAllocException, [excSize], null, this.loc);
        var excBufCast = compiler.builder.bitCast(excBuf, compiler.getPointerType(exc.type));
        compiler.builder.storeVariable(excBufCast, exc, this.loc);
        
        var typeInfo = exc.type.typeInfo(compiler);
        
        var dest = compiler.builder.bitCast(compiler.moyaThrowDest, POINTER);
        var args = [excBuf, compiler.builder.bitCast(typeInfo, POINTER), dest];
        var ret = compiler.call(compiler.moyaThrow, args, null, this.loc);
        compiler.builder.insert(ret);
        compiler.builder.unreachable(this.loc);
    },
});

// *************************************************************************************************

function IfSyntax(transforms, elsex) {
    this.transforms = transforms;
    this.else = elsex;
}
exports.IfSyntax = IfSyntax;

IfSyntax.prototype = fool.subclass(Syntax, {
    nick: "If",

    write: function(writer) {
        writer.begin('If', {});
        var pairs = this.transforms.pairs;
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            writer.begin('if');
            pair.clause.write(writer);
            pair.block.write(writer);
            writer.end();
        }
        if (this.else) {
            writer.begin('else');
            this.else.write(writer);
            writer.end();
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        if (isStatement) {
            return this.compileIfBlock(compiler);
        } else {
            return this.compileIfExpression(compiler);
        }
    },
    
    compileIfBlock: function(compiler) {
        var pairs = this.transforms.pairs;
        
        var afterBlock = compiler.builder.block('after');
        
        var startReturnCount = pairs.length + 1;
        var returnCount = startReturnCount;
        
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = pair.clause.compile(compiler);
            var eq = compiler.compileTruthTest(condition, pair.clause.loc);
            
            var ifBlock = compiler.builder.block('then', null, afterBlock);
            var elseBlock = compiler.builder.block('else', null, afterBlock);

            compiler.builder.conditionalJump(eq, ifBlock, elseBlock, this.loc);
            compiler.builder.setInsertBlock(ifBlock);
            var didReturn = compiler.compileStatements(pair.block);
            
            if (didReturn) {
                --returnCount;
            } else {
                compiler.builder.jump(afterBlock, this.loc);
            }

            compiler.builder.setInsertBlock(elseBlock);
        }
        
        if (this.else) {
            var didReturn = compiler.compileStatements(this.else);
            if (didReturn) {
                --returnCount;
            } else {
                compiler.builder.jump(afterBlock, this.loc);
            }

            if (startReturnCount != returnCount) {
                compiler.markReturned(!returnCount);
            }
        } else {
            compiler.builder.jump(afterBlock, this.loc);

            compiler.markReturned(!returnCount);
        }
                
        compiler.builder.setInsertBlock(afterBlock);
    },
    
    compileIfExpression: function(compiler) {
        var pairs = this.transforms.pairs;
        var elss = this.else;
        var i = 0;
        
        function conditions(compiler) {
            if (i < pairs.length) {
                var pair = pairs[i];
                var clause = pair.clause.compile(compiler);
                return compiler.compileTruthTest(clause, pair.clause.loc);
            }
        }

        function passes(compiler) {
            var pair = pairs[i++];
            return pair.block.compile(compiler);;
        }

        function fails(compiler) {
            if (elss) {
                return elss.compile(compiler);
            }
        }
        
        return compiler.compileChoice(conditions, passes, fails, this.loc);
    },
});

// ---------------------------------------------------------------------------------------------

function TransformSyntax(clause, block) {
    this.pairs = [{clause: clause, block: block}];
}
exports.TransformSyntax = TransformSyntax;

TransformSyntax.prototype = fool.subclass(Syntax, {
    nick: "Transform",

    write: function(writer) {
    },
    
    addPair: function(clause, block) {
        this.pairs.push({clause: clause, block: block});
    },
});

// *************************************************************************************************

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

    write: function(writer) {
        writer.begin('Iterator', {});
        if (this.inOn) {
            writer.attr('on', 'true');
        }
        if (this.ifWhile) {
            writer.attr('while', 'true');
        }
        writer.begin('left', {});
        this.left.write(writer);
        writer.end();
        if (this.iterable) {
            writer.begin('iterable', {});
            this.iterable.write(writer);
            writer.end();
        }
        if (this.clause) {
            writer.begin('clause', {});
            this.clause.write(writer);
            writer.end();
        }
        this.body.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        throw new MoyaError("NYI", this.loc);
    },
});

function WhileSyntax(clause, block) {
    this.clause = clause;
    this.block = block;
}
exports.WhileSyntax = WhileSyntax;

WhileSyntax.prototype = fool.subclass(Syntax, {
    nick: "While",

    write: function(writer) {
        writer.begin('While', {});
        if (this.clause) {
            this.clause.write(writer);
        }
        this.block.write(writer);
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var testBlock = compiler.builder.block('test');
        var loopBlock = compiler.builder.block('loop');
        var afterBlock = compiler.builder.block('after');

        compiler.builder.jump(testBlock, this.clause.loc);

        compiler.builder.setInsertBlock(testBlock);
        var condition = this.clause.compile(compiler);
        var eq = compiler.compileTruthTest(condition, this.clause.loc);
        compiler.builder.conditionalJump(eq, loopBlock, afterBlock, this.clause.loc);

        compiler.builder.setInsertBlock(loopBlock);
        var didReturn = compiler.compileStatements(this.block);
        if (!didReturn) {
            compiler.builder.jump(testBlock, this.clause.loc);
        } else {
            compiler.markReturned(false);
        }

        compiler.builder.setInsertBlock(afterBlock);
    },
});

// *************************************************************************************************

function TrySyntax(block, catchers) {
    this.block = block;
    this.catchers = catchers;
}
exports.TrySyntax = TrySyntax;

TrySyntax.prototype = fool.subclass(Syntax, {
    nick: "Try",

    write: function(writer) {
        writer.begin('Try', {});
        this.block.write(writer);
        if (this.catchers) {
            this.catchers.write(writer);
        }
        writer.end();
    },

    compile: function(compiler, isStatement) {
        var catchers = this.catchers.items;
        var startReturnCount = catchers.length + 1;
        var returnCount = startReturnCount;
        
        var lpadBlock = compiler.builder.block('lpad');

        var funcScope = compiler.funcScope;
        funcScope.afterBlock = null;
        compiler.pushScope();
        
        var catchFrame = compiler.pushCatcher();
        catchFrame.unwindBlock = lpadBlock;
                
        var didReturn = compiler.compileStatements(this.block);
        if (didReturn) {
            --returnCount;
        }
        
        compiler.popCatcher();
        compiler.popScope();
        
        if (!catchFrame.throws) {
            throw new MoyaError("Try without possible exceptions", this.loc);
        }
        
        var afterTryBlock = compiler.builder.block('after');
        compiler.builder.jump(afterTryBlock);
        funcScope.afterBlock = afterTryBlock;

        compiler.builder.setInsertBlock(lpadBlock);
        var landingPad = compiler.builder.landingPad(compiler.getLandingPadType(), false, this.loc);
        compiler.builder.insert(landingPad);
        
        var exc = compiler.builder.extractValue(landingPad, 0, POINTER, 'exco');
        var sel = compiler.builder.extractValue(landingPad, 1, I32, 'sel');
        compiler.builder.insert(exc);
        compiler.builder.insert(sel);
        
        compiler.builder.setInsertBlock(lpadBlock);
            
        // XXXjoe Put cleanup here
        // catchFrame.unwindBlock = compiler.getTerminateBlock();
        
        var clauses = landingPad.clauses = [];
        var matches = this.matchCatchers(compiler, catchers, catchFrame);
        for (var key in matches) {
            if (key) {
                var catcher = matches[key];
                lpadBlock = compileCatch(catcher.name, catcher.type, catcher.body, catcher.loc);
            }
        }
        
        var catchAll = matches[''];
        if (catchAll) {
            var throws = catchFrame.catchAll();
            if (catchAll.name) {
                for (var i = 0, l = throws.length; i < l; ++i) {
                    var type = throws[i];
                    lpadBlock = compileCatch(catchAll.name, type, catchAll.body, catchAll.loc);
                }

                compiler.builder.jump(funcScope.afterBlock);
            } else {
                clauses.push(compiler.builder.null(POINTER));

                var excVar = compiler.builder.call(compiler.moyaBeginCatch, [exc]);
                compiler.builder.insert(excVar);

                compiler.pushScope();
                
                var didReturn = compiler.compileStatements(catchAll.body);
                if (didReturn) {
                    --returnCount;
                }
                compiler.popScope();

                compiler.builder.jump(funcScope.afterBlock);
            }
        } else if (!catchFrame.isEmpty) {
            var resumeBlock = compiler.builder.block('resume');
            var unreachableBlock = compiler.builder.block('unreachable');

            var hasMore = compiler.builder.compare(ops.LessThan, sel, compiler.int(0));
            compiler.builder.conditionalJump(hasMore, unreachableBlock, resumeBlock);

            compiler.builder.setInsertBlock(resumeBlock);
            compiler.builder.resume(landingPad, this.loc);

            compiler.builder.setInsertBlock(unreachableBlock);
            compiler.builder.unreachable(this.loc);
        } else {
            compiler.builder.jump(funcScope.afterBlock);
        }
        
        if (startReturnCount != returnCount) {
            compiler.markReturned(!returnCount);
        }
        
        compiler.builder.setInsertBlock(afterTryBlock);
        
        compiler.catchFrame.markThrows(catchFrame.throws);
        
        // =========================================================================================
        
        function compileCatch(name, type, body, loc) {
            var nextBlock = compiler.builder.block('dispatch');
            var catchBlock = compiler.builder.block('catch');
            compiler.builder.setInsertBlock(catchBlock);

            compiler.pushScope();
            
            excAlloc = compiler.scope.declareVariable(name, type, compiler.builder, loc);

            var excBuf = compiler.builder.call(compiler.moyaBeginCatch, [exc]);
            
            var excBufCast = compiler.builder.bitCast(excBuf, compiler.getPointerType(type));
            var excVar = compiler.builder.loadVariable(excBufCast, 'exc', loc);
            compiler.scope.storeVariable(name, excVar, compiler.builder, loc);

            compiler.builder.insert(compiler.builder.call(compiler.moyaEndCatch, []));
            
            var ti = type.typeInfo(compiler);
            var clause = compiler.builder.bitCast(ti, POINTER);
            clauses.push(clause);

            var didReturn = compiler.compileStatements(body);
            if (didReturn) {
                --returnCount;
            }

            compiler.builder.jump(funcScope.afterBlock);

            compiler.builder.setInsertBlock(lpadBlock);
            var typeId = compiler.builder.call(compiler.typeIdFor, [clause]);
            var matched = compiler.builder.compare(ops.Equals, typeId, sel);
            compiler.builder.conditionalJump(matched, catchBlock, nextBlock);

            compiler.builder.setInsertBlock(nextBlock);
            
            compiler.popScope();
            return nextBlock;
        }
    },
            
    matchCatchers: function(compiler, catchers, catchFrame) {
        var matches = {};
        var catchAll = null;
        
        for (var i = 0, l = catchers.length; i < l; ++i) {
            var catcher = catchers[i];
            
            if (!catcher.decl) {
                if (catchAll) {
                    throw new MoyaError("Multiple catch-alls", catcher.loc);
                }
                
                catchAll = {name: null, type: null, body: catcher.block, loc: catcher.loc};
            } else if (catcher.decl.nick == "Identifier") {
                if (catchAll) {
                    throw new MoyaError("Multiple catch-alls", catcher.loc);
                }

                catchAll = {name: catcher.decl.name, type: null, body: catcher.block,
                            loc: catcher.loc};
            } else if (catcher.decl.nick == "TypeAssignment") {
                var type = compiler.evaluateType(catcher.decl.type);
                var key = type+'';
                if (key in matches) {
                    throw new MoyaError("Redundant type for catch", catcher.loc);
                }
                
                var match = null;
                if (catchFrame.matchThrow(type)) {
                    matches[key] = {name: catcher.decl.name, type: type, body: catcher.block,
                                    loc: catcher.loc};
                } else {
                    throw new MoyaError("Catch for type not thrown", catcher.loc);
                }
            } else {
                throw new MoyaError("Invalid exception type", catcher.decl.loc);
            }
        }
        
        if (catchAll) {
            if (catchFrame.isEmpty) {
                throw new MoyaError("Nothing to catch here", catchAll.loc);
            }
            
            matches[''] = catchAll;
        }
        
        return matches;
    },
});

// ---------------------------------------------------------------------------------------------

function CatchSyntax(decl, block) {
    this.decl = decl;
    this.block = block;
}
exports.CatchSyntax = CatchSyntax;

CatchSyntax.prototype = fool.subclass(Syntax, {
    nick: "Catch",

    write: function(writer) {
        writer.begin('Catch', {});
        if (this.decl) {
            this.decl.write(writer);
        }
        this.block.write(writer);
        writer.end();
    },
});

// *************************************************************************************************

function ImportSyntax(moduleNames) {
    this.moduleNames = moduleNames;
}
exports.ImportSyntax = ImportSyntax;

ImportSyntax.prototype = fool.subclass(Syntax, {
    nick: "Import",

    write: function(writer) {
        writer.begin('Import', {});
        for (var i = 0, l = this.moduleNames.length; i < l; ++i) {
            writer.begin('module');
            this.moduleNames[i].write(writer);
            writer.end();
        }
        writer.end();
    },
});
