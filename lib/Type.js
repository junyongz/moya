
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
    this.size = 0;
    this.initFunc = null;
    this.consFunc = null;
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
    
    addProperty: function(name) {
        var prop = {name: name, offset: -1, type: null};
        this.properties[name] = prop;
        return prop;
    },
});

// *************************************************************************************************

exports.Type = Type;
exports.NumberType = NumberType;
exports.SequenceType = SequenceType;
exports.ClassType = ClassType;
