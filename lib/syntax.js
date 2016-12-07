
var path = require('path');
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
    StructType = types.StructType,
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
var utils = require('./utils'),
    MoyaError = utils.MoyaError;
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

    asConstant: function() {
        throw new MoyaError("Expected constant", this.loc);
    },
        
    declareInModule: function(compiler, module) {
        throw new MoyaError("Invalid syntax", this.loc);
    },

    declareInClass: function(compiler, cls) {
        throw new MoyaError("Invalid syntax", this.loc);
    },

    compile: function(compiler) {
        var expr = this.compileAsExpression(compiler);
        if (!expr.type || expr.type == VOID) {
            throw new MoyaError("Illegal use of void", this.loc);
        } else {
            return expr;
        }
    },
    
    compileAsExpression: function(compiler) {
        throw new MoyaError("Illegal expression", this.loc);
    },

    compileAsStatement: function(compiler) {
        var expr = this.compileAsExpression(compiler);
        compiler.builder.insert(expr);
        return false;
    },

    compileAsLazyStatement: function(compiler) {
        throw new MoyaError("Illegal declaration", this.loc);
    },

    compileAsBlock: function(compiler) {
        return this.compileAsStatement(compiler);
    },

    compileAsFunction: function(compiler) {
        compiler.markReturned(true);

        var expr = this.compile(compiler);
        var returned = compiler.builder.return(expr, this.loc);
        compiler.addReturn(returned);

        return true;
    },

    compileAssign: function(compiler, assignNode, rhs) {
        throw new MoyaError("Illegal assignment", assignNode.loc);
    },
        
    compileCall: function(compiler, symbolNodes, argNodes, loc) {
        throw new MoyaError('Call type not yet implemented', this.loc);
    },
};

// *************************************************************************************************

function BlockSyntax(body, where, throwsIf, isImperative) {
    this.body = body;
    this.where = where;
    this.throwsIf = throwsIf;
    this.isImperative = isImperative;
}

exports.BlockSyntax = BlockSyntax;
BlockSyntax.prototype = fool.subclass(Syntax, {
    nick: "Block",

    write: function(writer) {
        writer.begin('Block', {});
        if (this.isImperative) {
            writer.attr('imperative', 'true');
        }
        if (this.body) {
            this.body.forEach(function(item) { item.write(writer); });
        }
        if (this.where) {
            writer.begin('where', {});
            this.where.forEach(function(item) { item.write(writer); });
            writer.end();
        }
        if (this.throwsIf) {
            writer.begin('throwsIf', {});
            this.throwsIf.write(writer);
            writer.end();
        }
        writer.end();
    },

    declareInModule: function(compiler, module) {
        var funcNode = new exports.FunctionSyntax(new exports.IdentifierSyntax(utils.mainName));
        funcNode.accessMode = PrivateAccess;
        funcNode.block = this;
        funcNode.loc = this.loc;

        var func = compiler.declareFunction(funcNode);
        module.declareFunction(func);
    },
    
    compileAsExpression: function(compiler) {
        if (this.isImperative) {
            throw new MoyaError("Illegal imperative block", this.loc);
        }
        
        compiler.pushScope();
        var expr = compiler.compileExpression(this.body, this.where, this.throwsIf, this.loc);
        compiler.builder.insert(expr);
        compiler.popScope();
        return expr;
    },

    compileAsStatement: function(compiler) {
        if (this.isImperative) {
            return this.compileAsBlock(compiler);
        } else {
            var expr = this.compile(compiler);
            compiler.builder.insert(expr);
            return false;
        }
    },

    compileAsBlock: function(compiler) {
        compiler.pushScope();
        var didReturn = compiler.compileStatements(this.body);
        compiler.popScope(didReturn);
        return didReturn;
    },

    compileAsFunction: function(compiler) {
        if (this.isImperative) {
            return this.compileAsBlock(compiler);
        } else {
            compiler.markReturned(true);
            
            var expr = this.compile(compiler);
            var returned = compiler.builder.return(expr, this.loc);
            compiler.addReturn(returned);

            return true;
        }
    },
});

// *************************************************************************************************

function FunctionSyntax(name, args, returns, schedule) {
    this.name = name;
    this.args = args || [];
    this.returns = returns;
    this.schedule = schedule;
    this.accessMode = null;
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

        this.name.write(writer);
        if (this.args) {
            this.args.forEach(function(item) { item.write(writer); });
        }

        if (this.returns) {
            writer.begin('returns');
            this.returns.write(writer);
            writer.end();
        }
        if (this.block) {
            this.block.write(writer);
        }
        writer.end();
    },
    
    declareInModule: function(compiler, module) {
        var func = compiler.declareFunction(this);
        module.declareFunction(func);
    },

    declareInClass: function(compiler, cls) {
        if (this.name.nick == 'TypeId' && this.name.name == 'This') {
            var cons = compiler.declareConstructor(this, cls);
            cls.constructors.push(cons);
        } else {
            var func = compiler.declareFunction(this);
            func.class = cls;
            cls.methods.push(func);
        }
    },
});

function AnonFuncSyntax(args, block) {
    this.args = args;
    this.block = block;
}
exports.AnonFuncSyntax = AnonFuncSyntax;

AnonFuncSyntax.prototype = fool.subclass(Syntax, {
    nick: "AnonFunc",

    write: function(writer) {
        writer.begin('Function', {});
        if (this.args) {
            for (var i = 0, l = this.args.length; i < l; ++i) {
                this.args[i].write(writer);
            }
        }
        if (this.block) {
            this.block.write(writer);
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
            this.args.forEach(function(item) { item.write(writer); });
        }
        this.type.write(writer);
        writer.end();
    },

    declareInModule: function(compiler, module) {
        compiler.declareCFunction(this, module);
    },
    
    compileAsExpression: function(compiler) {
        var cfunc = compiler.declareCFunction(this, compiler.scope.rootModule, true);
        var argTypes = cfunc.args.map(function(arg) { return arg.type.compileType(compiler); });

        var func = compiler.getFunction(cfunc, null, [], argTypes, []);
        return compiler.builder.funcPointer(func, this.loc);
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
    this.body = body || [];
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
            this.body.forEach(function(item) { item.write(writer); });
        }
        writer.end();
    },
    
    declareInModule: function(compiler, module) {
        var cls = compiler.declareClass(this, module);
        module.declareClass(cls);
    },
});

// ---------------------------------------------------------------------------------------------

function PropertySyntax(access, name, type, block) {
    this.accessMode = access;
    this.name = name;
    this.type = type;
    this.block = block;
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
        if (this.block) {
            this.block.write(writer);
        }
        writer.end();
    },

    declareInModule: function(compiler, module) {
        module.props.push({name: this.name, accessMode: this.accessMode,
                           type: this.type, block: this.block});
    },

    declareInClass: function(compiler, cls) {
        cls.props.push({name: this.name, type: this.type, block: this.block});
    },
});

// *************************************************************************************************

function NumberSyntax() {
}
exports.NumberSyntax = NumberSyntax;

NumberSyntax.prototype = fool.subclass(Syntax, {
    asConstant: function() {
        return this.value;
    },
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

    compileAsExpression: function(compiler) {
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
    
    compileAsExpression: function(compiler) {
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

    compileAsExpression: function(compiler) {
        return compiler.builder.string(this.string, null, this.loc);
    },
});

// *************************************************************************************************

function TupleSyntax(items) {
    this.items = items || [];
}
exports.TupleSyntax = TupleSyntax;

TupleSyntax.prototype = fool.subclass(Syntax, {
    nick: "List",
    
    write: function(writer) {
        writer.begin('Tuple', {});
        if (this.items) {
            this.items.forEach(function(item) { item.write(writer); });
        }
        writer.end();
    },

    compileAsExpression: function(compiler) {
        var values = this.items.map(function(node) { return node.compile(compiler); });
        var types = values.map(function(value) { return value.type; });
        var type = new StructType('Tuple', types);
        return compiler.builder.tuple(type, values);
    },

    compileAssign: function(compiler, assignNode, rhs) {
        var tupleType = rhs.type;
        if (!(tupleType instanceof StructType)) {
            throw new MoyaError("Tuple expected", this.loc);
        }

        if (tupleType.fieldTypes.length != this.items.length) {
            throw new MoyaError("Tuple sizes don't match", this.loc);
        }
        
        this.items.forEach(function(node, i) {
            var type = tupleType.fieldTypes[i];
            var value = compiler.builder.extractValue(rhs, compiler.int(i), type, this.loc);
            node.compileAssign(compiler, assignNode, value);
        }.bind(this));
        
        return rhs;
    },
    
    // =============================================================================================
    
    push: function(item) {
        this.items.push(item);
    },
});

function ListSyntax(items) {
    this.items = items || [];
}
exports.ListSyntax = ListSyntax;

ListSyntax.prototype = fool.subclass(Syntax, {
    nick: "List",
    
    write: function(writer) {
        writer.begin('List', {});
        if (this.items) {
            this.items.forEach(function(item) { item.write(writer); });
        }
        writer.end();
    },

    compileAsExpression: function(compiler) {
        var itemValues = [];
        var items = this.items;
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
            this.pairs.forEach(function(item) { item.write(writer); });
        }
        writer.end();
    },

    compileAsExpression: function(compiler) {
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
            this.items.forEach(function(item) { item.write(writer); });
        }
        writer.end();
    },

    compileAsExpression: function(compiler) {
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

    compileAsExpression: function(compiler) {
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

    declareInClass: function(compiler, cls) {
        throw new MoyaError('Illegal property declaration', this.loc);
    },

    compileAsExpression: function(compiler) {
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
            var result = compiler.lookupVariableValue(this.name, this.loc);
            if (result) {
                return result;
            } else {
                throw new MoyaError('Name not found', this.loc);
            }
        }
    },

    compileAssign: function(compiler, assignNode, rhs) {
        compiler.compileVariableAssign(this.name, rhs, assignNode.loc);
        return rhs;
    },

    compileCall: function(compiler, symbolNodes, argNodes, loc) {
        return compiler.compileCall(this.name, null, argNodes, symbolNodes, loc);
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

    compileAsExpression: function(compiler) {
        var lhs = this.left.compile(compiler);
        return lhs.type.loadProperty(compiler, lhs, this.right, this.loc);
    },

    compileAssign: function(compiler, assignNode, rhs) {
        var lhs = this.left.compile(compiler);
        return compiler.compilePropertyAssign(lhs, this.right, rhs, this.loc);
    },

    compileCall: function(compiler, symbolNodes, argNodes, loc) {
        var lhs = this.left.compile(compiler);
        return compiler.compileCall(this.right, lhs, argNodes, symbolNodes, this.loc);
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

    compileAsExpression: function(compiler) {
        var type = this.compileType(compiler);
        return compiler.builder.sizeOfType(type);
    },

    compileCall: function(compiler, symbolNodes, argNodes, loc) {
        return compiler.compileCall(this.name, null, argNodes, symbolNodes, loc);
    },

    expandType: function(scope, argSymbol) {
        if (scope.hasSymbol(this.name)) {
            scope.declareSymbol(this.name, argSymbol);
        }
    },
    
    compileType: function(compiler) {
        var symbol = this.compileSymbol(compiler);

        var type = symbol.matchArgs(0, function(genericClass, argSymbols) {
            return compiler.matchClass(genericClass, argSymbols);
        });
        if (type) {
            return this.pointers ? compiler.getPointerType(type, this.pointers) : type;
        } else {
            throw new MoyaError("Type not found", this.loc);
        }
    },
    
    compileSymbol: function(compiler) {
        var symbol = compiler.scope.evaluateSymbol(this.name);
        if (symbol) {
            return symbol;
        } else {
            throw new MoyaError("Type not found", this.loc);
        }
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

    compileAsExpression: function(compiler) {
        var type = this.compileType(compiler);
        return compiler.builder.sizeOfType(type);
    },

    expandType: function(scope, argSymbol) {
        var className = this.args[0].name;
        return scope.previous.lookupClass(className, function(genericClass) {
            argSymbol.matchClass(genericClass, this.args.length-1,
            function(genericClass, argSymbols) {
                for (var i = 1, l = this.args.length; i < l; ++i) {
                    this.args[i].expandType(scope, argSymbols[i-1]);
                }
            }.bind(this));
        }.bind(this));
    },

    compileType: function(compiler) {
        var symbol = this.compileSymbol(compiler);

        var type = symbol.matchArgs(this.args.length-1, function(genericClass, argSymbols) {
            return compiler.matchClass(genericClass, argSymbols);
        });
        if (type) {
            if (type.pointers) {
                type = compiler.getPointerType(type, this.pointers);
            }
                
            if (this.optionals) {
                type = compiler.getOptionalType(type, this.optionals);
            }

            return type;
        } else {
            throw new MoyaError("Type not found", this.loc);
        }
    },
    
    compileSymbol: function(compiler) {
        var argNodes = this.args;
        var symbol = compiler.scope.evaluateSymbol(argNodes[0].name);
        if (symbol) {
            symbol = symbol.clone();
            for (var i = 1, l = argNodes.length; i < l; ++i) {
                var subsymbol = argNodes[i].compileSymbol(compiler);
                symbol.argSymbols[i-1] = subsymbol;
            }
            return symbol;
        } else {
            throw new MoyaError("Type not found", this.loc);
        }
    },
    
    compileCall: function(compiler, symbolNodes, argNodes, loc) {
        if (this.optionals) {
            throw new MoyaError("Illegal call", loc);
        }
        
        var symbolNodes = this.args.slice();
        var callable = symbolNodes.shift();
        return callable.compileCall(compiler, symbolNodes, argNodes, loc);
    },
        
    // ---------------------------------------------------------------------------------------------
    
    push: function(arg) {
        this.args.push(arg);
        return this;
    },

    pushList: function(items) {
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

    compileAsExpression: function(compiler) {
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

    compileAsExpression: function(compiler) {
        return this.op.compile(compiler, this);
    },

    compileAssign: function(compiler, assignNode, rhs) {
        var assignOp = this.op.assignOp;
        if (assignOp) {
            return assignOp.compileAssign(compiler, assignNode, rhs);
        } else {
            throw new MoyaError("Illegal assignment", assignNode.loc);
        }
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
            pair.body.write(writer);
            writer.end();
        }
        if (this.else) {
            writer.begin('else');
            this.else.write(writer);
            writer.end();
        }
        writer.end();
    },

    compileAsExpression: function(compiler) {
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

    compileAsExpression: function(compiler) {
        var type = this.type.compileType(compiler);
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

    compileAsStatement: function(compiler) {
        var printed = this.expr.compile(compiler);
        var asString = printed.valueToString(compiler, this.loc);
        var ret = compiler.call(compiler.printString, [asString], null, null, this.loc);
        compiler.builder.insert(ret);
        return false;
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
    
    compileAsExpression: function(compiler) {
        return this.callable.compileCall(compiler, null, this.args, this.loc);
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

    compileAsExpression: function(compiler) {
        return this.op.compile(compiler, this);
    },
    
    compileAsStatement: function(compiler) {
        var ret = this.op.compile(compiler, this);
        compiler.builder.insert(ret);
        return false;
    },

    compileAsLazyStatement: function(compiler) {
        if (!(this.op == ops.Eq && this.left instanceof IdentifierSyntax)) {
            throw new MoyaError("Illegal declaration", this.loc);
        }
        
        return compiler.scope.defineLazyVariable(this.left.name, this.right, this.loc);
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
    
    declareInClass: function(compiler, cls) {
        throw new MoyaError('Default constructors NYI', this.loc);
    },

    compileAsStatement: function(compiler) {
        if (!this.type) {
            throw new MoyaError("Syntax error", this.loc);
        }
        
        var type = this.type.compileType(compiler);
        var optional;
        if (type instanceof OptionalType) {
            optional = compiler.builder.optional(null, type, this.loc);
        } else {
            type = compiler.getOptionalType(type, 1);
            optional = compiler.builder.optional(null, type, this.loc);
        }
        var ret = compiler.compileVariableDeclare(this.name, type, optional, this.loc);
        compiler.builder.insert(ret);
        return false;
    },

    compileAssign: function(compiler, assignNode, rhs) {
        var type = this.type
            ? this.type.compileType(compiler)
            : type = rhs.type;
        compiler.compileVariableDeclare(this.name, type, rhs, assignNode.loc);
        return rhs;
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

    compileAsStatement: function(compiler) {
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

    compileAsStatement: function(compiler) {
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

    compileAsStatement: function(compiler) {
        if (compiler.scope.isCleaningUp) {
            throw new MoyaError("Illegal deferred statement", this.loc);
        }

        var value = this.expr.compile(compiler);
                
        compiler.cleanupAll();

        compiler.markReturned(true);
        var returned = compiler.builder.return(value, this.loc);
        compiler.addReturn(returned);
        return returned;
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
        
    compileAsStatement: function(compiler) {
        return compiler.compileThrow(this.expr, this.loc);
    },
});

function DeferSyntax(expr) {
    this.expr = expr;
}

exports.DeferSyntax = DeferSyntax;

DeferSyntax.prototype = fool.subclass(Syntax, {
    nick: "Defer",

    write: function(writer) {
        writer.begin('Defer', {});
        this.expr.write(writer);
        writer.end();
    },

    compileAsStatement: function(compiler) {
        if (compiler.scope.isCleaningUp) {
            throw new MoyaError("Illegal deferred statement", this.loc);
        }

        compiler.defer(function() {
            this.expr.compileAsBlock(compiler);
        }.bind(this));
    },
});

function UseSyntax(expr) {
    this.expr = expr;
}

exports.UseSyntax = UseSyntax;

UseSyntax.prototype = fool.subclass(Syntax, {
    nick: "Use",

    write: function(writer) {
        writer.begin('Use', {});
        this.expr.write(writer);
        writer.end();
    },

    compileAsExpression: function(compiler) {
        var object = this.expr.compile(compiler);
        compiler.scope.defer(function() {
            var ret = compiler.callMethod(object, "dispose", [], [], this.loc);
            if (ret) {
                compiler.builder.insert(ret);
            } else {
                throw new MoyaError("Object can not be used", this.loc);
            }
        }.bind(this));
        
        return object;
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
        this.transforms.write(writer);
        if (this.else) {
            writer.begin('else');
            this.else.write(writer);
            writer.end();
        }
        writer.end();
    },

    compileAsExpression: function(compiler) {
        return this.compileIfExpression(compiler);
    },
    
    compileAsStatement: function(compiler) {
        return this.compileIfBlock(compiler);
    },
    
    // =============================================================================================
    
    compileIfBlock: function(compiler) {
        var pairs = this.transforms.pairs;
        
        var afterBlock = compiler.builder.block('after');
        
        var allReturned = false;
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
            
            compiler.pushScope();
            var didReturn = pair.body.compileAsBlock(compiler);
            compiler.popScope(didReturn);
            
            if (didReturn) {
                --returnCount;
            } else {
                compiler.builder.jump(afterBlock, this.loc);
            }

            compiler.builder.setInsertBlock(elseBlock);
        }
        
        if (this.else) {
            compiler.pushScope();
            var didReturn = this.else.compileAsBlock(compiler);
            compiler.popScope(didReturn);

            if (didReturn) {
                --returnCount;
            } else {
                compiler.builder.jump(afterBlock, this.loc);
            }

            allReturned = startReturnCount != returnCount && !returnCount;
        } else {
            compiler.builder.jump(afterBlock, this.loc);

            allReturned = !returnCount;
        }
                
        compiler.builder.setInsertBlock(afterBlock);

        compiler.markReturned(allReturned);
        return allReturned;
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
            return pair.body.compile(compiler);
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

function TransformSyntax() {
    this.pairs = [];
}
exports.TransformSyntax = TransformSyntax;

TransformSyntax.prototype = fool.subclass(Syntax, {
    nick: "Transform",

    write: function(writer) {
        var pairs = this.pairs;
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            writer.begin('if');
            pair.clause.write(writer);
            pair.body.write(writer);
            writer.end();
        }
    },
    
    addPair: function(pair) {
        this.pairs.push(pair);
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
    
    compileAsStatement: function(compiler) {
        throw new MoyaError("NYI", this);
    },
});

function WhileSyntax(clause, body) {
    this.clause = clause;
    this.body = body;
}
exports.WhileSyntax = WhileSyntax;

WhileSyntax.prototype = fool.subclass(Syntax, {
    nick: "While",

    write: function(writer) {
        writer.begin('While', {});
        if (this.clause) {
            this.clause.write(writer);
        }
        this.body.forEach(function(item) { item.write(writer); });
        writer.end();
    },

    compileAsStatement: function(compiler) {
        var testBlock = compiler.builder.block('test');
        var loopBlock = compiler.builder.block('loop');
        var afterBlock = compiler.builder.block('after');

        compiler.builder.jump(testBlock, this.clause.loc);

        compiler.builder.setInsertBlock(testBlock);
        var condition = this.clause.compile(compiler);
        var eq = compiler.compileTruthTest(condition, this.clause.loc);
        compiler.builder.conditionalJump(eq, loopBlock, afterBlock, this.clause.loc);

        compiler.builder.setInsertBlock(loopBlock);
        
        compiler.pushScope();
        var didReturn = compiler.compileStatements(this.body);
        compiler.popScope(didReturn);

        if (!didReturn) {
            compiler.builder.jump(testBlock, this.clause.loc);
        } else {
            compiler.markReturned(false);
        }

        compiler.builder.setInsertBlock(afterBlock);
    },
});

// *************************************************************************************************

function TrySyntax(body, catchers) {
    this.body = body;
    this.catchers = catchers;
}
exports.TrySyntax = TrySyntax;

TrySyntax.prototype = fool.subclass(Syntax, {
    nick: "Try",

    write: function(writer) {
        writer.begin('Try', {});
        this.body.forEach(function(item) { item.write(writer); });
        if (this.catchers) {
            this.catchers.forEach(function(item) { return item.write(writer); });
        }
        writer.end();
    },

    compileAsStatement: function(compiler) {
        var startReturnCount = this.catchers.length + 1;
        var returnCount = startReturnCount;
        
        compiler.pushScope();
        
        var catchFrame = compiler.pushCatcher();
        catchFrame.afterUnwindBlock = compiler.builder.block('afterUnwind');
         
        catchFrame.catchers = this.precompileCatchers(compiler);
                
        var didReturn = compiler.compileStatements(this.body);
        if (didReturn) {
            --returnCount;
        }
        
        compiler.popCatcher();
        compiler.popScope();

        compiler.builder.jump(catchFrame.afterUnwindBlock);
        compiler.builder.setInsertBlock(catchFrame.afterUnwindBlock);
        
        if (!catchFrame.didCatch) {
            throw new MoyaError("Try without possible exceptions", this.loc);
        }
        
        for (var key in catchFrame.catchers) {
            var catcher = catchFrame.catchers[key];
            if (!catcher.catchCount) {
                throw new MoyaError("Nothing to catch here", catcher.loc);
            }
        }
                
        compiler.catchFrame.markThrows(catchFrame.throws);
        
        return didReturn || catchFrame.didReturn;
    },
                
    precompileCatchers: function(compiler) {
        var matches = {};
        this.catchers.forEach(function(catchNode) {
            var catcher = catchNode.precompile(compiler)
            if (catcher.type) {
                var key = catcher.type+'';
                if (key in matches) {
                    throw new MoyaError("Redundant type for catch", catchNode.loc);
                }

                matches[key] = catcher;
            } else if (!matches['']) {
                matches[''] = catcher;
            } else {
                throw new MoyaError("Multiple catch-alls", catchNode.loc);
            }
        }.bind(this));
        return matches;
    },
});

// ---------------------------------------------------------------------------------------------

function CatchSyntax(decl, body) {
    this.decl = decl;
    this.body = body || [];
}
exports.CatchSyntax = CatchSyntax;

CatchSyntax.prototype = fool.subclass(Syntax, {
    nick: "Catch",

    write: function(writer) {
        writer.begin('Catch', {});
        if (this.decl) {
            this.decl.write(writer);
        }
        this.body.forEach(function(item) { item.write(writer); });
        writer.end();
    },
    
    // =============================================================================================
    
    precompile: function(compiler) {
        if (!this.decl) {
            return new Catcher(null, null, this.body, this.loc);
        } else if (this.decl.nick == "Identifier") {
            return new Catcher(this.decl.name, null, this.body, this.loc);
        } else if (this.decl.nick == "TypeAssignment") {
            var type = this.decl.type.compileType(compiler);
            return new Catcher(this.decl.name, type, this.body, this.loc);
        } else {
            throw new MoyaError("Invalid exception type", this.decl.loc);
        }
    },
});

function Catcher(name, type, body, loc) {
    this.name = name;
    this.type = type;
    this.body = body;
    this.loc = loc;
    this.catchCount = 0;
}

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
            this.moduleNames[i].forEach(function(item) { return item.write(writer); });
            writer.end();
        }
        writer.end();
    },
    
    declareInModule: function(compiler, module) {
        this.moduleNames.forEach(function(nameSet) {
            var paths = nameSet.map(function(name) { return name.name; });
            var modulePath = paths.join(path.sep);
            var fullPath = compiler.findModule(modulePath, module.path);
            if (fullPath) {
                var importedModule = compiler.compileImport(fullPath);
                module.declareImport(importedModule);
            } else {
                throw new MoyaError("File not found", this.loc);
            }
        }.bind(this));
    },
});
