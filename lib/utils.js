
var fool = require('fool');

// *************************************************************************************************

exports.mainName = '@main';

// *************************************************************************************************

function MoyaError(message, loc) {
    // console.trace();
    this.message = message;
    this.loc = loc;
}
exports.MoyaError = MoyaError;

MoyaError.prototype = fool.subclass(Error, {
    toString: function() {
        return this.message;
    },
});

// *************************************************************************************************

exports.keyForFunction = function(func, argTypes, argSymbols) {
    return exports.keyForCall(func.qualifiedName, argTypes, argSymbols);
}

exports.keyForMethod = function(classType, name, argTypes, argSymbols) {
    var key = classType.class.qualifiedName + '::' + name;
    return exports.keyForCall(key, argTypes, argSymbols);
}

exports.localKeyForMethod = function(name, argTypes, argSymbols) {
    return exports.keyForCall(name, argTypes, argSymbols, true);
}

exports.keyForCall = function(name, argTypes, argSymbols, isRelativeMethod) {
    var key = name;
    for (var i = 0, l = argSymbols.length; i < l; ++i) {
        key += '(' + argSymbols[i].toString() + ')';
    }
    key += '(';
    for (var i = isRelativeMethod ? 1 : 0, l = argTypes.length; i < l; ++i) {
        key += argTypes[i].toString() + ',';
    }
    key += ')';
    return key;
}

exports.keyForClass = function(genericClass, argSymbols) {
    var key = genericClass.qualifiedName;
    if (argSymbols) {
        for (var i = 0, l = argSymbols.length; i < l; ++i) {
            key += '(' + argSymbols[i].toString() + ')';
        }
    }
    return key;
}

exports.keyForFunctionType = function(returnType, argTypes) {
    var key = 'FunctionType::(';
    for (var i = 0, l = argTypes.length; i < l; ++i) {
        key += argTypes[i].toString() + ',';
    }
    if (returnType) {
        key += '):' + returnType.toString();
    } else {
        key += '):void';
    }
    return key;
}

exports.keyForPointerType = function(pointerType, pointers) {
    return exports.keyForClass(pointerType.class, []) + '*'.repeat(pointers);
}

exports.keyForOptionalType = function(optionalType, optionals) {
    return exports.keyForClass(optionalType.class, []) + '?'.repeat(optionals);
}
