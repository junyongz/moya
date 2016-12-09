
var fool = require('fool');
var llvm = require('./llvm');
var symbols = require('./symbol'),
    SpecificSymbol = symbols.SpecificSymbol,
    AmbiguousSymbol = symbols.AmbiguousSymbol;
var mods = require('./module'),
    Module = mods.Module,
    GenericFunction = mods.GenericFunction,
    GenericClass = mods.GenericClass;
var utils = require('./utils'),
    llvmPrefix = utils.llvmPrefix,
    MoyaError = utils.MoyaError;

// *************************************************************************************************

var builtinModule = new Module('builtin', null);

// *************************************************************************************************

function Type() {
}
exports.Type = Type;

Type.prototype = {
    name: null,
    native: null,
    bitSize: 0,
    size: 0,
    pointerType: null,
    optionalType: null,
    
    get argCount() {
        return 0;
    },
    
    toString: function() {
        return this.name;
    },

    get objectSize() {
        return this.size;
    },

    toSymbol: function() {
        return new SpecificSymbol(this.name, this);
    },
    
    withPointers: function(n) {
        var t = this;
        for (var i = 0; i < n; ++i) {
            if (!t.pointerType) {
                t.pointerType = new PointerType(t);
            }
            t = t.pointerType;
        }
        return t;
    },
    
    withOptionals: function(n) {
        var t = this;
        for (var i = 0; i < n; ++i) {
            if (!t.optionalType) {
                t.optionalType = new OptionalType(t);
            }
            t = t.optionalType;
        }
        return t;
    },

    typeInfo: function(compiler) {
        if (!this.typeInfoVar) {
            this.typeInfoVar = this.getTypeInfo(compiler);
        }
        return this.typeInfoVar;
    },
    
    getTypeInfo: function(compiler) {
        var name = this+'TypeInfo';
        var d = compiler.builder.constStruct(TYPEINFO, [compiler.builder.string(name)]);
        return compiler.globalConstant(name, d);
    },

    isTypeOrSubclass: function(other) {
        return other == this;
    },

    getCommonType: function(other) {
        throw new MoyaError("NYI");
    },
    
    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else {
            throw new MoyaError("Illegal cast", loc);
        }
    },
        
    valueToString: function(value, compiler, loc) {
        compiler.builder.insert(value);
        return compiler.builder.string(this.toString(), loc);
    },
    
    defaultValue: function(builder) {
        throw new MoyaError("Type must be initialized");
    },

    loadProperty: function(compiler, object, propertyName, loc) {
        throw new MoyaError('Property not found', loc);
    },
    
    storeProperty: function(compiler, object, propertyName, rhs, loc) {
        throw new MoyaError('Property not found', loc);
    },
    
    indexGet: function(compiler, op, object, indexNode, loc) {
        throw new MoyaError("Illegal types for operation", loc);
    },

    indexSet: function(compiler, op, object, indexNode, rhs, loc) {
        throw new MoyaError("Illegal operation", loc);
    },

    call: function(compiler, callable, args, loc) {
        throw new MoyaError("Object is not callable", loc);
    },

    increment: function(compiler, op, lhs, rhs, assignNode) {
        throw new MoyaError("Illegal increment", loc);
    },
    
    compile: function(builder) {
    },
};

// *************************************************************************************************

function NumberType(name, shortName, native) {
    this.name = name;
    this.shortName = shortName;
    this.class = new GenericClass(name, builtinModule);
    this.native = native;
    this.bitSize = name == 'Void' ? 0 : llvm.getTypeSize(native);
    this.size = this.bitSize < 8 ? 1 : this.bitSize/8;
    this.pointerType = null;
    this.optionalType = null;
}
exports.NumberType = NumberType;

NumberType.prototype = fool.subclass(Type, {
    isTypeOrSubclass: function(other) {
        if (other instanceof NumberType) {
            return true;
        } else if (other instanceof PointerType && other != STRING) {
            return true;
        } else if (other instanceof OptionalType) {
            return this.isTypeOrSubclass(other.type)
        } else {
            return false;
        }
    },
    
    getCommonType: function(other) {
        if (other instanceof NumberType) {
            if (this == F32) {
                if (other == F32) {
                    return this;
                } else {
                    return F64;
                }
            } else if (this == F64) {
                return F64;
            } else {
                if (other == F32 || other == F64) {
                    return other;
                } else if (other.bitSize > this.bitSize) {
                    return other;
                } else {
                    return this;
                }
            }
        }
    },
    
    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else if (this == BOOL) {
            return compiler.compileTruthTest(value, loc);
        } else if (value.type instanceof NumberType) {
            return compiler.builder.numCast(value, this, loc);
        } else if (value.type instanceof OptionalType) {
            // XXXjoe Soon to be illegal
            var extracted = compiler.builder.extractValue(value, 0, value.type.type, 'opt', loc);
            return this.valueToType(extracted, compiler, loc);
        } else {
            throw new MoyaError("Illegal cast", loc);
        }
    },

    valueToString: function(value, compiler, loc) {
        if (this == CHAR) {
            return compiler.builder.call(compiler.charToString, [value], null, loc);
        } else if (this == I1) {
            return compiler.builder.call(compiler.boolToString, [value], null,  loc);
        } else if (this == I8 || this == I16 || this == I32) {
            return compiler.builder.call(compiler.intToString,
                                         [I64.valueToType(value, compiler, loc)], null, loc);
        } else if (this == I64) {
            return compiler.builder.call(compiler.intToString, [value], null, loc);
        } else if (this == F32) {
            return compiler.builder.call(compiler.doubleToString,
                                         [F64.valueToType(value, compiler, loc)], null, loc);
        } else if (this == F64) {
            return compiler.builder.call(compiler.doubleToString, [value], null, loc);
        } else {
            throw new MoyaError("Illegal string conversion", loc);
        }
    },
    
    defaultValue: function(builder) {
        if (this == F32) {
            return builder.float32(0);
        } else if (this == F64) {
            return builder.float64(0);
        } else {
            return builder.int(0, this.bitSize);
        }
    },

    increment: function(compiler, op, lhs, rhs, assignNode) {
        var incremented = op.incrementOp.combine(compiler, assignNode, lhs, rhs);
        return op.assignOp.compileAssign(compiler, assignNode, incremented);
    },
    
    compile: function(builder) {
        return this.native;
    },
});

// *************************************************************************************************

function ClassType(genericClass, argSymbols) {
    this.name = genericClass.name;
    this.class = genericClass;
    this.argSymbols = argSymbols ? argSymbols.slice() : [];
    this.properties = {};
    this.methods = [];
    this.initFunc = null;
    this.nativeStruct = null;
    this.native = null;
    this.bitSize = 0;
    this.size = 0;
    this.base = null;
    this.pointerType = null;
    this.optionalType = null;
}
exports.ClassType = ClassType;

ClassType.prototype = fool.subclass(Type, {
    toString: function() {
        return utils.keyForClass(this.class, this.argSymbols);
    },

    get argCount() {
        return this.argSymbols.length;
    },

    addProperty: function(name) {
        var prop = {name: name, offset: -1, type: null};
        this.properties[name] = prop;
        return prop;
    },
    
    getProperty: function(name) {
        var prop = this.properties[name];
        if (prop) {
            return prop;
        } else if (this.base) {
            return this.base.getProperty(name);
        }
    },
    
    addMethod: function(realFunc) {
        this.methods.push(realFunc);
    },

    lookupMethod: function(name, cb) {
        var ret = this.class.lookupMethod(name, function(genericFunc) {
            return cb(genericFunc, this);
        }.bind(this));
        if (ret) {
            return ret;
        }
        
        if (this.base) {
            return this.base.lookupMethod(name, cb);
        }
    },
    
    // ---------------------------------------------------------------------------------------------

    get objectSize() {
        return this.structSize;
    },

    isTypeOrSubclass: function(other) {
        if (other == this || (other instanceof PointerType && other != STRING)) {
            return true;
        } else if (other instanceof OptionalType) {
            return this.isTypeOrSubclass(other.type)
        }
        
        if (other.base) {
            return this.isTypeOrSubclass(other.base);
        } else {
            return false;
        }
    },
    
    getCommonType: function(other) {
        for (var base = this; base; base = base.base) {
            for (var otherBase = other; otherBase; otherBase = otherBase.base) {
                if (otherBase == base) {
                    return otherBase;
                }
            }
        }
    },

    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else if (this.isTypeOrSubclass(value.type)) {
            return compiler.builder.bitCast(value, this, loc);
        } else if (value.type instanceof OptionalType) {
            // XXXjoe Soon to be illegal
            var extracted = compiler.builder.extractValue(value, 0, value.type.type, 'opt', loc);
            return this.valueToType(extracted, compiler, loc);
        } else {
            throw new MoyaError("Class type conversion NYI");
        }
    },
    
    defaultValue: function(builder) {
        return builder.bitCast(builder.int(0, this.bitSize), this);
    },
    
    loadProperty: function(compiler, object, propertyName, loc) {
        var prop = this.getProperty(propertyName);
        if (prop) {
            var offset = compiler.builder.propOffset(this, prop.name);
            var pv = compiler.builder.gep(object, [compiler.int(0), offset], null, prop.type, loc);
            return compiler.builder.loadVariable(pv, propertyName, loc);
        } else {
            throw new MoyaError('Property not found', loc);
        }
    },
    
    storeProperty: function(compiler, object, propertyName, rhs, loc) {
        var prop = this.getProperty(propertyName);
        if (prop) {
            var offset = compiler.builder.propOffset(this, propertyName, loc);
            var pv = compiler.builder.gep(object, [compiler.int(0), offset], null, prop.type, loc);
            var cast = prop.type.valueToType(rhs, compiler, loc);
            compiler.builder.storeVariable(pv, cast, loc);
            return cast;
        } else {
            throw new MoyaError('Property not found', loc);
        }
    },
    
    indexGet: function(compiler, op, object, indexNode, loc) {
        var index = indexNode.compile(compiler);
        return compiler.callOpOverride(op, object, [index], loc);
    },

    indexSet: function(compiler, op, object, indexNode, rhs, loc) {
        var index = indexNode.compile(compiler);
        return compiler.callOpOverride(op, object, [index, rhs], loc);
    },
        
    call: function(compiler, callable, args, loc) {
        var ret = compiler.callMethod(callable, "call", args, [], loc);
        if (ret) {
            return ret;
        } else {
            console.trace()
            throw new MoyaError('Operator "call" not supported on ' + this.name, loc);
        }
    },
    
    increment: function(compiler, op, lhs, rhs, assignNode) {
        var ret = compiler.callMethod(lhs, op.token, [rhs], [], assignNode.loc);
        if (ret) {
            return ret;
        } else {
            var incremented = op.incrementOp.combine(compiler, assignNode, lhs, rhs);
            return op.assignOp.compileAssign(compiler, assignNode, incremented);
        }
    },
        
    compile: function(builder) {
        if (this.native) return this.native;

        var name = llvmPrefix + this.class.qualifiedName;
        this.nativeStruct = llvm.createStructType(name);
        this.native = llvm.getPointerType(this.nativeStruct);
        this.bitSize = llvm.getTypeSize(this.native);
        this.size = this.bitSize < 8 ? 1 : this.bitSize/8;
                
        return this.native;
    },
});

// *************************************************************************************************

function FunctionType(returnType, argTypes) {
    this.class = new GenericClass('Function', builtinModule);
    this.argTypes = argTypes.slice();
    this.returnType = returnType;
    this.selfType = null;
    this.native = null;
    this.bitSize = 0;
    this.size = 0;
    this.pointerType = null;
    this.optionalType = null;
}
exports.FunctionType = FunctionType;

FunctionType.prototype = fool.subclass(Type, {
    toString: function() {
        var args = this.argTypes.map(function(type) { return type.toString(); });
        return '>( ' + args + '): ' + this.returnType;
    },
    
    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else {
            throw new MoyaError("Illegal cast", loc);
        }
    },

    call: function(compiler, callable, args, loc) {
        return compiler.builder.call(callable, args, this.returnType, loc);
    },

    compile: function(builder) {
        if (this.native) return this.native;
    
        var returnNative = this.returnType ? this.returnType.compile(builder) : VOID.native;
        var argsNative = this.argTypes.map(function(type) {
            return type.compile(builder);
        }.bind(this));
        this.native = llvm.getFunctionSignatureType(returnNative, argsNative);
    
        return this.native;
    },
});

// *************************************************************************************************

function ClosureType(genericFunc, parentScope) {
    this.name = genericFunc.name;
    this.class = new GenericClass('Closure', builtinModule);
    this.genericFunc = genericFunc;
    this.parentScope = parentScope;
    this.native = null;
    this.bitSize = 0;
    this.size = 0;
    this.pointerType = null;
    this.optionalType = null;
}
exports.ClosureType = ClosureType;

ClosureType.prototype = fool.subclass(Type, {
    toString: function() {
        return 'CLOSURE:' + this.genericFunc.qualifiedName;
    },
    
    call: function(compiler, callable, args, loc) {
        var argTypes = args.map(function(arg) { return arg.type; });

        var func = compiler.matchClosureCall(this, argTypes);
        if (func) {
            args = args.slice();
            args.unshift(callable);
            return compiler.call(func, args, func.type.returnType, null, loc);
        } else {
            throw new MoyaError("Illegal arguments to closure", loc);
        }
    },

    compile: function(builder) {
        if (this.native) return this.native;
        
        var closureFunc = this.parentScope.func;
        var closure = closureFunc.compileClosure(builder);
        if (closure) {
            this.native = closure.type.compile(builder);
        } else {
            this.native = POINTER.compile(builder);
        }
        
        this.bitSize = llvm.getTypeSize(this.native);
        this.size = this.bitSize < 8 ? 1 : this.bitSize/8;

        return this.native;
    },
});

// *************************************************************************************************

function PointerType(type) {
    this.type = type;
    this.class = new GenericClass(this.toString(), builtinModule);
    this.native = null;
    this.bitSize = 0;
    this.size = 0;
    this.pointerType = null;
    this.optionalType = null;
}
exports.PointerType = PointerType;

PointerType.prototype = fool.subclass(Type, {
    toString: function() {
        if (this.type instanceof PointerType) {
            return '(' + this.type + ')*';
        } else {
            return this.type + '*';
        }
    },
    
    isTypeOrSubclass: function(other) {
        if (other instanceof PointerType || other instanceof ClassType) {
            return true;
        } else if (other instanceof OptionalType) {
            return this.isTypeOrSubclass(other.type);
        } else {
            return this != STRING || other == STRING;
        }
    },

    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else if (value.type instanceof NumberType) {
            return compiler.builder.numCast(value, this, loc);
        } else if (value.type instanceof ClassType) {
            return compiler.builder.bitCast(value, this, loc);
        } else if (value.type instanceof PointerType) {
            return compiler.builder.bitCast(value, this, loc);
        } else if (this == STRING) {
            return value.valueToString(compiler, loc);
        } else if (value.type instanceof OptionalType) {
            // XXXjoe Soon to be illegal
            var extracted = compiler.builder.extractValue(value, 0, value.type.type, 'opt', loc);
            return this.valueToType(extracted, compiler, loc);
        } else {
            throw new MoyaError("Illegal cast", loc);
        }
    },

    valueToString: function(value, compiler, loc) {
        if (this == STRING) {
            return value;
        } else {
            // XXXjoe Temporary
            return compiler.builder.string(this.toString(), loc);
        }
    },

    defaultValue: function(builder) {
        return builder.null(this);
    },
        
    indexGet: function(compiler, op, object, indexNode, loc) {
        var index = indexNode.compile(compiler);
        var variable = compiler.builder.gep(object, [index], null, this.type, loc);
        return compiler.builder.loadVariable(variable, 'index', loc);
    },
        
    indexSet: function(compiler, op, object, indexNode, rhs, loc) {
        var index = indexNode.compile(compiler);
        var variable = compiler.builder.gep(object, [index], null, this.type, loc);
        return compiler.builder.storeVariable(variable, rhs, loc);
    },
    
    call: function(compiler, callable, args, loc) {
        if (this.type instanceof FunctionType) {
            return this.type.call(compiler, callable, args, loc);
        } else {
            throw new MoyaError("Object is not callable", loc);
        }
    },

    increment: function(compiler, op, lhs, rhs, assignNode) {
        var incremented = op.incrementOp.combine(compiler, assignNode, lhs, rhs);
        return op.assignOp.compileAssign(compiler, assignNode, incremented);
    },

    compile: function(builder) {
        if (this.native) return this.native;
        
        var pointeeNative = this.type.compile(builder);
        this.native = llvm.getPointerType(pointeeNative);
        this.bitSize = llvm.getTypeSize(this.native);
        this.size = this.bitSize < 8 ? 1 : this.bitSize/8;

        return this.native;
    },
});

// *************************************************************************************************

function StructType(name, fields) {
    this.name = name;
    this.native = null;
    this.bitSize = 0;
    this.size = 0;
    this.pointerType = null;
    this.optionalType = null;
    this.fieldNames = [];
    if (fields) {
        if (fields instanceof Array) {
            this.fieldTypes = fields.slice();
        } else {
            this.fieldTypes = [];
            for (var fieldName in fields) {
                this.fieldNames.push(fieldName);
                this.fieldTypes.push(fields[fieldName]);
            }
        }
    } else {
        this.fieldTypes = [];
    }

    this.class = new GenericClass(this.toString(), builtinModule);
}
exports.StructType = StructType;

StructType.prototype = fool.subclass(Type, {
    toString: function() {
        var fields = this.fieldTypes.map(function(type, i) {
            var name = this.fieldNames[i];
            return (name ? name + ':' : '') + type;
        }.bind(this));
        return (this.name || '') + '{' + fields.join(', ') + '}';
    },

    clone: function(compiler, object, index, rhs, loc) {
        if (index > this.fieldTypes.length) {
            throw new MoyaError("Index out of bounds", loc);
        } else if (index == this.fieldTypes.length) {
            return this.extend(compiler, object, index, rhs, loc);
        } else {
            return this.replace(compiler, object, index, rhs, loc);
        }
    },
    
    replace: function(compiler, object, index, rhs, loc) {
        var fields = this.fieldTypes.map(function(type, i) {
            return i == index
                ? rhs.valueToType(type, compiler)
                : compiler.builder.extractValue(object, i, type, 'tuple', loc);
        }.bind(this));

        return compiler.builder.tuple(this, fields, loc);
    },
                
    extend: function(compiler, object, index, rhs, loc) {
        var fields = this.fieldTypes.map(function(type, i) {
            return compiler.builder.extractValue(object, i, type, 'tuple', loc);
        }.bind(this));
        fields[index] = rhs;

        var newType = new StructType(this.name);
        newType.fieldNames = this.fieldNames.slice();
        newType.fieldTypes = this.fieldTypes.slice();
        newType.fieldNames[index] = null;
        newType.fieldTypes[index] = rhs.type;
        return compiler.builder.tuple(newType, fields, loc);
    },

    truncate: function(compiler, object, length, loc) {
        var fields = [];
        for (var i = 0; i < length; ++i) {
            var type = this.fieldTypes[i];
            fields[i] = compiler.builder.extractValue(object, i, type, 'tuple', loc);
        }

        var newType = new StructType(this.name);
        newType.fieldNames = this.fieldNames.slice(0, length);
        newType.fieldTypes = this.fieldTypes.slice(0, length);
        return compiler.builder.tuple(newType, fields, loc);
    },
    
    // =============================================================================================
    
    isTypeOrSubclass: function(other) {
        return other == this;
    },

    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else {
            throw new MoyaError("Illegal cast", loc);
        }
    },

    valueToString: function(value, compiler, loc) {
        var fields = this.fieldTypes.map(function(type, i) {
            var extracted = compiler.builder.extractValue(value, i, type, 'tuple', loc);
            return extracted.valueToString(compiler, loc);
        }.bind(this));
        
        var str = null;
        var delim = compiler.builder.string(', ', '_COMMADELIM');
        fields.forEach(function(value) {
            if (!str) {
                str = value;
            } else {
                str = compiler.call(compiler.concatString, [str, delim]);
                str = compiler.call(compiler.concatString, [str, value]);
            }
        });
        return str;
    },

    defaultValue: function(builder) {
        throw new MoyaError("Illegal default value", loc);
    },
    
    loadProperty: function(compiler, object, propertyName, loc) {
        if (propertyName == "length") {
            return compiler.int(this.fieldTypes.length);
        } else {
            throw new MoyaError('Property not found', loc);
        }
    },

    storeProperty: function(compiler, object, propertyName, rhs, loc) {
        if (propertyName == "length") {
            var length = rhs.valueAsConstant(loc);
            return this.truncate(compiler, object, length, loc);
        } else {
            var value = valueNode.compile(compiler);
            throw new MoyaError('NYI', loc);
        }
    },
    
    indexGet: function(compiler, op, object, indexNode, loc) {
        var index = indexNode.asConstant();
        if (index >= this.fieldTypes.length) {
            throw new MoyaError("Index out of bounds", loc);
        }
        return compiler.builder.extractValue(object, index, this.fieldTypes[index], loc);
    },
            
    indexSet: function(compiler, op, object, indexNode, rhs, loc) {
        var index = indexNode.asConstant();
        return this.clone(compiler, object, index, rhs, loc);
    },

    increment: function(compiler, op, lhs, rhs, assignNode) {
        var index = this.fieldTypes.length;
        return this.clone(compiler, lhs, index, rhs, assignNode.loc);
    },
    
    compile: function(builder) {
        if (this.native) return this.native;
        
        var fieldTypes = this.fieldTypes.map(function(t) { return t.compile(builder); });
        this.native = llvm.createStructType(this.name || '');
        llvm.setStructBody(this.native, fieldTypes)
        this.bitSize = llvm.getTypeSize(this.native);
        this.size = this.bitSize < 8 ? 1 : this.bitSize/8;
        
        return this.native;
    },
});

// *************************************************************************************************

function OptionalType(type) {
    this.type = type;
    this.class = new GenericClass(this.toString(), builtinModule);
    this.native = null;
    this.bitSize = 0;
    this.size = 0;
}
exports.OptionalType = OptionalType;

OptionalType.prototype = fool.subclass(Type, {
    toString: function() {
        return '(' + this.type + ')?';
    },
    
    isTypeOrSubclass: function(other) {
        return other instanceof OptionalType && this.type.isTypeOrSubclass(other.type);
    },

    valueToType: function(value, compiler, loc) {
        if (value.type == this) {
            return value;
        } else if (this.type.isTypeOrSubclass(value.type)) {
            var cast = this.type.valueToType(value, compiler, loc);
            return compiler.builder.optional(cast, this, loc);
        } else {
            console.trace()
            throw new MoyaError("Illegal cast", loc);
        }
    },

    valueToString: function(value, compiler, loc) {
        var passed = compiler.compileTruthTest(value, loc);
        return compiler.compileSingleChoice(
            compiler.compileTruthTest(value, loc),
            function(compiler) {
                var extracted = compiler.builder.extractValue(value, 0, value.type.type, 'opt',
                                                              loc);
                return extracted.valueToString(compiler, loc);
            },
            function(compiler) {
                return compiler.builder.string('unknown', loc);
            },
            loc
        );
    },
    
    compile: function(builder) {
        if (this.native) return this.native;
        
        this.native = llvm.createStructType(this.class.name);
        llvm.setStructBody(this.native, [this.type.compile(builder), I8.native]);
        this.bitSize = llvm.getTypeSize(this.native);
        this.size = this.bitSize < 8 ? 1 : this.bitSize/8;

        return this.native;
    },
});

// *************************************************************************************************

var VOID = exports.VOID = new NumberType('Void', '', llvm.getType(0));
var I1 = exports.I1 = new NumberType('Int1', 'i1', llvm.getType(1));
var BOOL = exports.BOOL = I1;
var I8 = exports.I8 = new NumberType('Int8', 'b', llvm.getType(2));
var I16 = exports.I16 = new NumberType('Int16', 'w', llvm.getType(3));
var I32 = exports.I32 = new NumberType('Int32', '', llvm.getType(4));
var I64 = exports.I64 = new NumberType('Int64', 'lld', llvm.getType(5));
var F32 = exports.F32 = new NumberType('Float32', 'f', llvm.getType(6));
var F64 = exports.F64 = new NumberType('Float64', 'd', llvm.getType(7));
var CHAR = exports.CHAR = new NumberType('Char', 'c', llvm.getType(2));
var STRING = exports.STRING = exports.CHAR.withPointers(1);
var POINTER = exports.POINTER = exports.I8.withPointers(1);
var VTABLEPOINTER = exports.VTABLEPOINTER = exports.I8.withPointers(2);
var TYPEINFO = exports.TYPEINFO = new StructType('Type', [STRING]);

exports.builtinTypes = {
    Void: exports.VOID,
    Bool: exports.I1,
    Int1: exports.I1,
    Int8: exports.I8,
    Int16: exports.I16,
    Int32: exports.I32,
    Int: exports.I32,
    Int64: exports.I64,
    Long: exports.I64,
    Float32: exports.F32,
    Float: exports.F32,
    Float64: exports.F64,
    Double: exports.F64,
    Char: exports.CHAR,
    String: exports.STRING,
    Pointer: exports.POINTER,
    VTablePointer: exports.VTABLEPOINTER,
    TypeInfo: exports.TYPEINFO,
};
