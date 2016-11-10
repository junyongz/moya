
var fool = require('fool');

// *************************************************************************************************

function Type(name) {
    this.name = name;
    this.native = null;
    this.base = null;
}

Type.prototype = {
    isNumber: false,

    toString: function() {
        return this.name;
    },

    isTypeOrSubclass: function(other) {
        if (other == this) {
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
    this.native = null;
    this.size = size;
    this.base = null;
}

NumberType.prototype = fool.subclass(Type, {
    isNumber: true,
});

// *************************************************************************************************

function SequenceType(name) {
    this.name = name;
    this.native = null;
    this.base = null;
}

SequenceType.prototype = fool.subclass(Type, {
});

// *************************************************************************************************

function FunctionType(name) {
    this.name = name;
    this.native = null;
    this.base = null;
}

FunctionType.prototype = fool.subclass(Type, {
    toString: function() {
        return this.name;
    },
});

// *************************************************************************************************

function ClassType(genericClass, inputTypes) {
    this.name = genericClass.name;
    this.class = genericClass;
    this.inputTypes = inputTypes;
    this.properties = {};
    this.methods = [];
    this.size = 0;
    this.initFunc = null;
    this.native = null;
    this.base = null;
}

ClassType.prototype = fool.subclass(Type, {
    toString: function() {
        var key = this.name;
        for (var i = 0, l = this.inputTypes.length; i < l; ++i) {
            var inputType = this.inputTypes[i];
            key += '(' + inputType.toString() + ')';
        }
        return key;
    },

    keyForMethod: function(name, argTypes, inputTypes) {
        var key = this + '::' + name;
        for (var i = 0, l = inputTypes.length; i < l; ++i) {
            key += '(' + inputTypes[i].toString() + ')';
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

var VOID = exports.VOID = new NumberType('void', 0);
var I1 = exports.I1 = new NumberType('i1', 1);
var I8 = exports.I8 = new NumberType('i8', 8);
var I16 = exports.I16 = new NumberType('i16', 16);
var I32 = exports.I32 = new NumberType('i32', 32);
var I64 = exports.I64 = new NumberType('i64', 64);
var F32 = exports.F32 = new NumberType('f32', 32);
var F64 = exports.F64 = new NumberType('f64', 64);
var STRING = exports.STRING = new SequenceType('string');
var VTABLEPOINTER = exports.VTABLEPOINTER = new SequenceType('i8');

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
};

// *************************************************************************************************

exports.Type = Type;
exports.NumberType = NumberType;
exports.SequenceType = SequenceType;
exports.ClassType = ClassType;
