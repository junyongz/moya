
var fool = require('fool');

// *************************************************************************************************

function Type(name, size) {
    this.name = name;
    this.code = null;
    this.size = size;
    this.base = null;
}

Type.prototype = {
    isNumber: false,

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
    this.code = null;
    this.size = size;
    this.base = null;
}

NumberType.prototype = fool.subclass(Type, {
    isNumber: true,
});

// *************************************************************************************************

function SequenceType(name, size) {
    this.name = name;
    this.code = null;
    this.size = size;
    this.base = null;
}

SequenceType.prototype = fool.subclass(Type, {
});

// *************************************************************************************************

function ObjectType(name) {
    this.name = name;
    this.code = null;
    this.size = 64;
    this.base = null;
    this.properties = {};
}

ObjectType.prototype = fool.subclass(Type, {
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
exports.ObjectType = ObjectType;
