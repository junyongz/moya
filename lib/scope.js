
var fool = require('fool');
var types = require('./type'),
    builtinTypes = types.builtinTypes;
var symbols = require('./symbol'),
    SpecificSymbol = symbols.SpecificSymbol,
    AmbiguousSymbol = symbols.AmbiguousSymbol;
var utils = require('./utils'),
    MoyaError = utils.MoyaError;

// *************************************************************************************************

function Scope(previous) {
    this.previous = null;
}
exports.Scope = Scope;

Scope.prototype = {
    get rootScope() {
        var scope = this;
        while (scope.previous) {
            scope = scope.previous;
        }
        return scope;
    },
    
    get rootModule() {
        var scope = this.rootScope;
        return scope.module;
    },
    
    isProperty: function(name) {
        if (this.previous) {
            return this.previous.isProperty(name);
        }
    },
    
    getThis: function() {
        if (this.previous) {
            return this.previous.getThis();
        }
    },
    
    lookupClass: function(className, cb) {
        if (this.previous) {
            return this.previous.lookupClass(className, cb);
        }
    },

    lookupFunction: function(name, cb) {
        if (this.previous) {
            return this.previous.lookupFunction(name, cb);
        }
    },
    
    lookupVariableValue: function(name, builder, loc) {
        if (this.previous) {
            return this.previous.lookupVariableValue(name, builder, loc);
        }
    },
    
    lookupVariableType: function(name) {
        if (this.previous) {
            return this.previous.lookupVariableType(name);
        }
    },

    evaluateSymbol: function(name) {
        if (this.previous) {
            return this.previous.evaluateSymbol(name);
        }
    },
};

// *************************************************************************************************

function ModuleScope(module) {
    this.module = module;
    this.previous = null;
}
exports.ModuleScope = ModuleScope;

ModuleScope.prototype = fool.subclass(Scope, {
    // ---------------------------------------------------------------------------------------------
    // Scope
    
    lookupClass: function(name, cb) {
        return this.module.lookupClass(name, this.module, cb);
    },

    lookupFunction: function(name, cb) {
        return this.module.lookupFunction(name, this.module, cb);
    },

    evaluateSymbol: function(name) {
        var symbol = null;
        this.module.lookupClass(name, this.module, function(genericClass) {
            if (!symbol) {
                symbol = new AmbiguousSymbol(name);
            }
            
            symbol.candidates.push(genericClass);
        }.bind(this));
        if (symbol) {
            return symbol;
        }
        
        var type = builtinTypes[name];
        if (type) {
            return new SpecificSymbol(name, type);
        }
    },
});

// *************************************************************************************************

function ClassScope(classType) {
    this.classType = null;
    this.self = null;
    this.localSymbols = {};
    this.self = null;
    this.previous = null;
    
    if (classType) {
        this.setClass(classType);
    }
}
exports.ClassScope = ClassScope;

ClassScope.prototype = fool.subclass(Scope, {
    setClass: function(classType) {
        this.classType = classType;
        
        var classSymbolNames = classType.class.symbolNames;
        if (classSymbolNames) {
            for (var i = 0, l = classSymbolNames.length; i < l; ++i) {
                var symbolName = classSymbolNames[i];
                this.localSymbols[symbolName] = classType.argSymbols[i];
            }
        }
    },
    
    // ---------------------------------------------------------------------------------------------
    // Scope

    isProperty: function(name) {
        for (var classType = this.classType; classType; classType = classType.base) {
            var prop = classType.properties[name];
            if (prop) {
                return this;
            }
        }
        return null;
    },

    getThis: function() {
        return this.self;
    },

    lookupFunction: function(name, cb) {
        var localSymbol = this.localSymbols[name];
        if (localSymbol) {
            // XXXjoe WRONG! Iterate constructors of localSymbol's candidates
            return this.previous.lookupFunction(localSymbol.name, cb);
        }
        
        if (this.previous) {
            return this.previous.lookupFunction(name, cb);
        }
    },
    
    lookupVariableValue: function(name, builder, loc) {
        if (name == "this") {
            return this.self;
        } else {
            var prop = this.classType.getProperty(name);
            if (prop) {
                var offset = builder.propOffset(this.classType, name);
                var variable = builder.gep(this.self, [builder.int(0), offset], null, prop.type,
                                           loc);
                return builder.loadVariable(variable, prop.name);
            } else if (this.previous) {
                return this.previous.lookupVariableValue(name, builder, loc);
            }
        }
    },

    lookupVariableType: function(name) {
        if (name == "this") {
            return this.classType;
        } else {
            var prop = this.classType.properties[name];
            if (prop) {
                return prop.type;
            } else if (this.classType.base) {
                var prop = this.classType.base.getProperty(name);
                if (prop) {
                    return prop.type;
                }
            }
            
             if (this.previous) {
                return this.previous.lookupVariableType(name);
            }
        }
    },
    
    evaluateSymbol: function(name, symbol) {
        var localSymbol = this.localSymbols[name];
        if (localSymbol) {
            return localSymbol;
        }

        if (this.previous) {
            return this.previous.evaluateSymbol(name);
        }
    },
});

// *************************************************************************************************

function FunctionScope(func) {
    this.localSymbols = {};
    this.localVars = {};
    this.func = func;
    this.afterBlock = null;
    this.previous = null;
}
exports.FunctionScope = FunctionScope;

FunctionScope.prototype = fool.subclass(Scope, {
    hasSymbol: function(name, symbol) {
        return name in this.localSymbols;
    },

    declareSymbol: function(name, symbol) {
        this.localSymbols[name] = symbol;
    },

    hasVariable: function(name, rhs, builder, loc) {
        return name in this.localVars;
    },
    
    declareVariable: function(name, type, builder, loc) {
        var local = this.localVars[name];
        if (!local) {
            local = builder.createVariable(name, type, loc);
            this.localVars[name] = local;
        }
        return local;
    },

    storeVariable: function(name, rhs, builder, loc) {
        var local = this.declareVariable(name, rhs.type, builder, loc);
        return builder.storeVariable(local, rhs, loc);
    },
    
    // ---------------------------------------------------------------------------------------------
    // Scope
    
    lookupFunction: function(name, cb) {
        var localSymbol = this.localSymbols[name];
        if (localSymbol) {
            return localSymbol.iterateClasses(function(genericClass) {
                for (var i = 0, l = genericClass.constructors.length; i < l; ++i) {
                    var ret = cb(genericClass.constructors[i]);
                    if (ret) {
                        return ret;
                    }
                }
            }.bind(this));
        }
        
        if (this.previous) {
            return this.previous.lookupFunction(name, cb);
        }
    },
    
    lookupVariableValue: function(name, builder, loc) {
        var local = this.localVars[name];
        if (local) {
            return builder.loadVariable(local, name, loc);
        } else if (this.previous) {
            return this.previous.lookupVariableValue(name, builder, loc);
        }
    },
    
    lookupVariableType: function(name) {
        var local = this.localVars[name];
        if (local) {
            return local.type;
        } else if (this.previous) {
            return this.previous.lookupVariableType(name);
        }
    },

    evaluateSymbol: function(name, symbol) {
        var localSymbol = this.localSymbols[name];
        if (localSymbol) {
            return localSymbol;
        }
        
        if (this.previous) {
            return this.previous.evaluateSymbol(name);
        }
    },
});
