
var fool = require('fool');
var MoyaError = require('./utils').MoyaError;
var llvm = require('./llvm');
var Module = require('./module').Module;

// *************************************************************************************************

var builtinModule = new Module('builtin', null);

// *************************************************************************************************

function Type(name) {
    this.name = name;
    this.class = new GenericClass(name, builtinModule);
    this.native = null;
    this.base = null;
}

Type.prototype = {
    isNumber: false,
    
    get argCount() {
        return 0;
    },
    
    toString: function() {
        return this.name;
    },

    toSymbol: function() {
        return new SpecificSymbol(this.name, this);
    },

    isTypeOrSubclass: function(other) {
        if (other == this || other instanceof PointerType) {
            return true;
        }
        
        if (other.base) {
            return this.isTypeOrSubclass(other.base);
        } else {
            return false;
        }
    },
};

// *************************************************************************************************

function NumberType(name, size) {
    this.name = name;
    this.class = new GenericClass(name, builtinModule);
    this.native = null;
    this.size = size;
    this.base = null;
}

NumberType.prototype = fool.subclass(Type, {
    isNumber: true,

    isTypeOrSubclass: function(other) {
        return other.isNumber == true;
    },
});

// *************************************************************************************************

function SequenceType(name) {
    this.name = name;
    this.class = new GenericClass(name, builtinModule);
    this.native = null;
    this.base = null;
}

SequenceType.prototype = fool.subclass(Type, {
});

// *************************************************************************************************

function PointerType(name) {
    this.name = name;
    this.class = new GenericClass(name, builtinModule);
    this.native = null;
    this.base = null;
}

PointerType.prototype = fool.subclass(Type, {
    isTypeOrSubclass: function(other) {
        return true;
    },
});

// *************************************************************************************************

function FunctionType(name) {
    this.name = name;
    this.class = new GenericClass(name, builtinModule);
    this.native = null;
    this.base = null;
}

FunctionType.prototype = fool.subclass(Type, {
    toString: function() {
        return this.name;
    },
});

// *************************************************************************************************

function ClassType(genericClass, argSymbols) {
    this.name = genericClass.name;
    this.class = genericClass;
    this.argSymbols = argSymbols;
    this.properties = {};
    this.methods = [];
    this.size = 0;
    this.initFunc = null;
    this.native = null;
    this.base = null;
}

ClassType.prototype = fool.subclass(Type, {
    get argCount() {
        return this.argSymbols.length;
    },
    
    toString: function() {
        var key = this.class.qualifiedName;
        for (var i = 0, l = this.argSymbols.length; i < l; ++i) {
            key += '(' + this.argSymbols[i].toString() + ')';
        }
        return key;
    },

    keyForMethod: function(name, argTypes, argSymbols) {
        var key = this.class.qualifiedName + '::' + name;
        for (var i = 0, l = argSymbols.length; i < l; ++i) {
            key += '(' + argSymbols[i].toString() + ')';
        }
        key += '(';
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            key += argTypes[i].toString() + ',';
        }
        key += ')';
        return key;
    },

    addProperty: function(name) {
        var prop = {name: name, offset: -1, type: null};
        this.properties[name] = prop;
        return prop;
    },
    
    addMethod: function(realFunc) {
        realFunc.methodOffset = this.methods.length;
        this.methods.push(realFunc);
    },
});

// *************************************************************************************************

function Symbol(name) {
    this.name = name;
}
exports.Symbol = Symbol;

Symbol.prototype = {
    clone: function(cloneArgs) {
    },
    
    iterateClasses: function(cb) {
    },

    matchArgs: function(symbolCount, cb) {
    },
    
    matchClass: function(genericClass, symbolCount, cb) {
    }
};

// *************************************************************************************************

function SpecificSymbol(name, classType) {
    this.name = name;
    this.classType = classType;
    this.argSymbols = [];
}
exports.SpecificSymbol = SpecificSymbol;

SpecificSymbol.prototype = fool.subclass(Symbol, {
    toString: function() {
        return this.classType.toString();
    },

    clone: function(cloneArgs) {
        var clone = new SpecificSymbol(this.name);
        clone.classType = this.classType;
        clone.argSymbols = [];
        if (cloneArgs) {
            for (var i = 0, l = this.argSymbols.length; i < l; ++i) {
                clone.argSymbols[i] = this.argSymbols[i].clone(true);
            }
        }
        return clone;
    },
    
    iterateClasses: function(cb) {
        return cb(this.classType.class);
    },

    matchArgs: function(symbolCount, cb) {
        if (this.classType.argCount == symbolCount || this.argSymbols.length == symbolCount) {
            if (this.argSymbols.length) {
                return cb(this.classType.class, this.argSymbols);
            } else {
                return cb(this.classType.class, this.classType.argSymbols);
            }
        }
    },
    
    matchClass: function(genericClass, symbolCount, cb) {
        if (genericClass == this.classType.class) {
            if (this.classType.argCount == symbolCount) {
                if (this.argSymbols.length) {
                    return cb(this.classType.class, this.argSymbols);
                } else {
                    return cb(this.classType.class, this.classType.argSymbols);
                }
            }
        }
    },
});

// *************************************************************************************************

function AmbiguousSymbol(name) {
    this.name = name;
    this.argSymbols = [];
    this.candidates = [];
}
exports.AmbiguousSymbol = AmbiguousSymbol;

AmbiguousSymbol.prototype = fool.subclass(Symbol, {
    toString: function() {
        var key = this.name;
        for (var i = 0, l = this.argSymbols.length; i < l; ++i) {
            var symbol = this.argSymbols[i];
            key += '(' + symbol + ')';
        }
        return key;
    },

    clone: function(cloneArgs) {
        var clone = new AmbiguousSymbol(this.name);
        clone.candidates = this.candidates.slice();
        clone.argSymbols = [];
        if (cloneArgs) {
            for (var i = 0, l = this.argSymbols.length; i < l; ++i) {
                clone.argSymbols[i] = this.argSymbols[i].clone(true);
            }
        }
        return clone;
    },
    
    iterateClasses: function(cb) {
        for (var i = 0, l = this.candidates.length; i < l; ++i) {
            var candidate = this.candidates[i];
            var ret = cb(candidate);
            if (ret) {
                return ret;
            }
        }
    },

    matchArgs: function(symbolCount, cb) {
        for (var i = 0, l = this.candidates.length; i < l; ++i) {
            var candidate = this.candidates[i];
            if (candidate.symbolNames.length == symbolCount) {
                return cb(candidate, this.argSymbols);
            }
        }
    },
    
    matchClass: function(genericClass, symbolCount, cb) {
        for (var i = 0, l = this.candidates.length; i < l; ++i) {
            var candidate = this.candidates[i];
            if (candidate == genericClass && candidate.symbolNames.length == symbolCount) {
                return cb(candidate, this.argSymbols);
            }
        }
    },
});

// *************************************************************************************************

function GenericClass(name, module) {
    this.name = name;
    this.symbolNames = [];
    this.props = [];
    this.constructors = [];
    this.methods = [];
    this.module = module;
    this.ast = null;
}
exports.GenericClass = GenericClass;

GenericClass.prototype = {
    get qualifiedName() {
        return this.module.name + ':' + this.name;
    },
    
    keyWithSymbols: function(argSymbols) {
        var key = this.qualifiedName;
        if (argSymbols) {
            for (var i = 0, l = argSymbols.length; i < l; ++i) {
                key += '(' + argSymbols[i].toString() + ')';
            }
        }
        return key;
    },
    
    lookupMethod: function(name, cb) {
        for (var i = 0, l = this.methods.length; i < l; ++i) {
            var func = this.methods[i];
            if (func.name == name) {
                var ret = cb(func);
                if (ret) {
                    return ret;
                }
            }
        }
    },
}

// *************************************************************************************************

var VOID = exports.VOID = new NumberType('Void', 0);
var I1 = exports.I1 = new NumberType('Int1', 1);
var I8 = exports.I8 = new NumberType('Int8', 8);
var I16 = exports.I16 = new NumberType('Int16', 16);
var I32 = exports.I32 = new NumberType('Int32', 32);
var I64 = exports.I64 = new NumberType('Int64', 64);
var F32 = exports.F32 = new NumberType('Float32', 32);
var F64 = exports.F64 = new NumberType('Float64', 64);
var STRING = exports.STRING = new SequenceType('String');
var POINTER = exports.POINTER = new PointerType('Pointer');
var VTABLEPOINTER = exports.VTABLEPOINTER = new PointerType('VTablePointer');

VOID.native = llvm.getType(0);
I1.native = llvm.getType(1);
I8.native = llvm.getType(2);
I16.native = llvm.getType(3);
I32.native = llvm.getType(4);
I64.native = llvm.getType(5);
F32.native = llvm.getType(6);
F64.native = llvm.getType(7);
STRING.native = llvm.getType(8);
POINTER.native = llvm.getPointerType(I8.native);
VTABLEPOINTER.native = llvm.getType(9);

exports.builtinTypes = {
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
    Pointer: POINTER,
    VTablePointer: VTABLEPOINTER,
};

// *************************************************************************************************

exports.Type = Type;
exports.NumberType = NumberType;
exports.SequenceType = SequenceType;
exports.PointerType = PointerType;
exports.FunctionType = FunctionType;
exports.ClassType = ClassType;
