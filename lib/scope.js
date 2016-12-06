
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
    
    lookupVariableValue: function(name, accessModule, builder, loc) {
        if (this.previous) {
            return this.previous.lookupVariableValue(name, accessModule, builder, loc);
        }
    },
    
    hasVariableName: function(name, accessModule, builder) {
        if (this.previous) {
            return this.previous.hasVariableName(name, accessModule, builder);
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
    this.globalVars = {};
    this.module = module;
    this.previous = null;
}
exports.ModuleScope = ModuleScope;

ModuleScope.prototype = fool.subclass(Scope, {
    declareVariable: function(name, type, isPublic, builder, loc) {
        var gv = this.globalVars[name];
        if (!gv) {
            var value = builder.global(name, type, type.defaultValue(builder), false, loc);
            this.globalVars[name] = {isPublic: isPublic, value: value};
            return value;
        } else {
            return gv.value;
        }
        return gv;
    },
    
    updateVariable: function(compiler, name, rhs, loc) {
        var gv = this.globalVars[name];
        var cast = gv.value.type.valueToType(rhs, compiler, loc);
        return compiler.builder.storeVariable(gv.value, cast, loc);
    },

    // ---------------------------------------------------------------------------------------------
    // Scope
    
    lookupClass: function(name, cb) {
        return this.module.lookupClass(name, this.module, cb);
    },

    lookupFunction: function(name, cb) {
        return this.module.lookupFunction(name, this.module, cb);
    },
    
    lookupVariableValue: function(name, accessModule, builder, loc) {
        var gv = this.globalVars[name];
        if (gv && (gv.isPublic || accessModule == this.module)) {
            return builder.loadVariable(gv.value, name, loc);
        } else {
            var imports = this.module.imports;
            for (var i = 0, l = imports.length; i < l; ++i) {
                var mod = imports[i];
                var scope = builder.getModuleScope(mod);
                var value = scope.lookupVariableValue(name, accessModule, builder, loc);
                if (value) {
                    return value;
                }
            }
        }
    },

    hasVariableName: function(name, accessModule, builder) {
        var gv = this.globalVars[name];
        if (gv && (gv.isPublic || accessModule == this.module)) {
            return this;
        } else {
            var imports = this.module.imports;
            for (var i = 0, l = imports.length; i < l; ++i) {
                var mod = imports[i];
                var scope = builder.getModuleScope(mod);
                var ownerScope = scope.hasVariableName(name, accessModule, builder);
                if (ownerScope) {
                    return ownerScope;
                }
            }
        }
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
    
    lookupVariableValue: function(name, accessModule, builder, loc) {
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
                return this.previous.lookupVariableValue(name, accessModule, builder, loc);
            }
        }
    },
    
    hasVariableName: function(name, accessModule, builder) {
        for (var classType = this.classType; classType; classType = classType.base) {
            var prop = classType.properties[name];
            if (prop) {
                return this;
            }
        }

        if (this.previous) {
            return this.previous.hasVariableName(name, accessModule, builder);
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
    
    lookupVariableValue: function(name, accessModule, builder, loc) {
        var localVar = this.evaluateName(name);
        if (localVar) {
            return localVar;
        } else if (this.previous) {
            return this.previous.lookupVariableValue(name, accessModule, builder, loc);
        }
    },
    
    hasVariableName: function(name, accessModule, builder) {
        if (name in this.localVars || name in this.lazyVars) {
            return this;
        } else if (this.previous) {
            return this.previous.hasVariableName(name, accessModule, builder);
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
