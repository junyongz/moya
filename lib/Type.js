
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
    this.methodCache = {};
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
        var key = name;
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
    
    matchMethod: function(name, argTypes, inputTypes, scope) {
        var key = this.keyForMethod(name, argTypes, inputTypes);
        var realFunc = this.methodCache[key];
        if (realFunc) {
            return realFunc;
        }
        
        var methods = this.class.methods;
        for (var i = 0, l = methods.length; i < l; ++i) {
            var func = methods[i];
            if (func.name == name) {
                var realFunc = func.match(argTypes, inputTypes, scope);
                if (realFunc) {
                    realFunc.methodOffset = this.methods.length;
                    this.methods.push(realFunc);
                    this.methodCache[key] = realFunc;
                    return realFunc;
                }
            }
        }
    },
});

// *************************************************************************************************

exports.Type = Type;
exports.NumberType = NumberType;
exports.SequenceType = SequenceType;
exports.ClassType = ClassType;
