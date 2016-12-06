
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

    hasVariableName: function(name) {
        if (this.previous) {
            return this.previous.hasVariableName(name);
        }
    },
    
    updateVariable: function(compiler, name, rhs, loc) {
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

    hasVariableName: function(name) {
        for (var classType = this.classType; classType; classType = classType.base) {
            var prop = classType.properties[name];
            if (prop) {
                return this;
            }
        }

        if (this.previous) {
            return this.previous.hasVariableName(name);
        }
    },

    updateVariable: function(compiler, name, rhs, loc) {
        return this.classType.storeProperty(compiler, this.self, name, rhs, loc);
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
    this.lazyVars = {};
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
    
    declareVariable: function(name, type, builder, loc) {
        var local = this.localVars[name];
        if (!local) {
            var value = builder.createVariable(name, type, loc);
            local = {value: value, isConst: false};
            this.localVars[name] = local;
        }
        return local.value;
    },

    defineVariable: function(name, isConst, rhs, builder, loc) {
        if (name in this.localVars) {
            throw new MoyaError("Redefining variable in same scope", loc);
        } else if (name in this.lazyVars) {
            throw new MoyaError("Redefining constant", loc);
        }
        
        if (isConst) {
            this.localVars[name] = {value: rhs, isConst: true};
            return rhs;
        } else {
            var local = this.declareVariable(name, rhs.type, builder, loc);
            return builder.storeVariable(local, rhs, loc);
        }
    },
        
    evaluateName: function(name) {
        var local = this.localVars[name];
        if (local) {
            if (local.isConst) {
                return local.value;
            } else {
                return this.compiler.builder.loadVariable(local.value, name, local.value.loc);
            }
        } else {
            var expr = this.lazyVars[name];
            if (expr) {
                delete this.lazyVars[name];

                var rhs = expr.compile(this.compiler);
                this.localVars[name] = {value: rhs, isConst: true};
                return rhs;
            } else {
                return null;
            }
        }
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
        var localVar = this.evaluateName(name);
        if (localVar) {
            return localVar;
        } else if (this.previous) {
            return this.previous.lookupVariableValue(name, builder, loc);
        }
    },
    
    lookupVariableType: function(name) {
        var local = this.evaluateName(name);
        if (local) {
            return local.type;
        } else if (this.previous) {
            return this.previous.lookupVariableType(name);
        }
    },

    hasVariableName: function(name) {
        if (name in this.localVars || name in this.lazyVars) {
            return this;
        } else if (this.previous) {
            return this.previous.hasVariableName(name);
        }
    },

    defineLazyVariable: function(name, rhs, loc) {
        if (name in this.lazyVars) {
            throw new MoyaError("Redudant definition", loc);
        }
        
        this.lazyVars[name] = rhs;
    },
    
    updateVariable: function(compiler, name, rhs, loc) {
        var local = this.localVars[name];
        var cast = local.value.type.valueToType(rhs, compiler, loc);
        return compiler.builder.storeVariable(local.value, cast, loc);
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
