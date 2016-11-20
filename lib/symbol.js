
var fool = require('fool');

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
