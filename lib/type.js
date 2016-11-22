
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
    MoyaError = utils.MoyaError;

// *************************************************************************************************

var builtinModule = new Module('builtin', null);

// *************************************************************************************************

function Type() {
}
exports.Type = Type;

Type.prototype = {
    get argCount() {
        return 0;
    },
    
    toString: function() {
        return this.name;
    },

    get objectSize() {
        return 0;
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

    defaultValue: function(builder) {
        throw new MoyaError("Type must be initialized");
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
    
    get objectSize() {
        return this.size;
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
    
    defaultValue: function(builder) {
        if (this == F32) {
            return builder.float32(0);
        } else if (this == F64) {
            return builder.float64(0);
        } else {
            return builder.int(0, this.bitSize);
        }
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
    this.native = null;
    this.size = POINTER.size;
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
    
    getCommonType: function(other) {
        for (var base = this; base; base = base.base) {
            for (var otherBase = other; otherBase; otherBase = otherBase.base) {
                if (otherBase == base) {
                    return otherBase;
                }
            }
        }
    },

    defaultValue: function(builder) {
        throw new MoyaError("Default class values NYI");
    },
    
    compile: function(builder) {
        return builder.compileClass(this);
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

    get objectSize() {
        return this.size;
    },
    
    getCommonType: function(other) {
        throw new MoyaError("NYI");
    },

    compile: function(builder) {
        return this.native;
    },
});

// *************************************************************************************************

function PointerType(type) {
    this.type = type;
    this.class = new GenericClass(this.toString(), builtinModule);
    this.native = llvm.getPointerType(type.native);
    this.bitSize = llvm.getTypeSize(this.native);
    this.size = this.bitSize < 8 ? 1 : this.bitSize/8;
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

    get objectSize() {
        return this.size;
    },

    getCommonType: function(other) {
        throw new MoyaError("NYI");
    },

    compile: function(builder) {
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
        return false;
    },

    get objectSize() {
        return this.size;
    },

    getCommonType: function(other) {
        throw new MoyaError("NYI");
    },

    isTypeOrSubclass: function(other) {
        return other instanceof OptionalType && this.type.isTypeOrSubclass(other.type);
    },

    compile: function(builder) {
        if (this.native) return this.native;
        
        var struct = llvm.createStructType(this.class.name);
        llvm.setStructBody(struct, [this.type.compile(builder), I8.native]);
        
        this.native = struct;
        this.bitSize = llvm.getTypeSize(struct);
        this.size = this.bitSize < 8 ? 1 : this.bitSize/8;

        return struct;
    },
});

// *************************************************************************************************

var VOID = exports.VOID = new NumberType('Void', '', llvm.getType(0));
var I1 = exports.I1 = exports.BOOL = new NumberType('Int1', 'i1', llvm.getType(1));
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
};
