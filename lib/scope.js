
var fool = require('fool');
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
        if (this.previous) {
            return this.previous.rootScope;
        } else {
            return this;
        }
    },
    
    get rootModule() {
        var scope = this.rootScope;
        return scope.module;
    },

    get innerClass() {
        if (this.previous) {
            return this.previous.innerClass;
        } else {
            return null;
        }
    },

    get innerFunction() {
        if (this.previous) {
            return this.previous.innerFunction;
        } else {
            return null;
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
    
    lookupVariableValue: function(name, accessModule, builder, loc) {
        if (this.previous) {
            return this.previous.lookupVariableValue(name, accessModule, builder, loc);
        }
    },
    
    getVariable: function(name, accessModule, builder, loc) {
    },
    
    updateVariable: function(compiler, name, accessModule, builder, rhs, loc) {
    },
    
    evaluateAll: function() {
        if (this.previous) {
            this.previous.evaluateAll();
        }
    },
    
    evaluateSymbol: function(name) {
        if (this.previous) {
            return this.previous.evaluateSymbol(name);
        }
    },

    cleanup: function(compiler) {
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
            var value = builder.global(name, type, type.defaultValue(builder, loc), false, loc);
            this.globalVars[name] = {isPublic: isPublic, value: value};
            return value;
        } else {
            return gv.value;
        }
        return gv;
    },

    getVariableOwner: function(name, accessModule, builder) {
        var gv = this.globalVars[name];
        if (gv && (gv.isPublic || accessModule == this.module)) {
            return this;
        } else {
            var imports = this.module.imports;
            for (var i = 0, l = imports.length; i < l; ++i) {
                var mod = imports[i];
                var scope = builder.getModuleScope(mod);
                var ownerScope = scope.getVariableOwner(name, accessModule, builder);
                if (ownerScope) {
                    return ownerScope;
                }
            }
        }
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

    getVariable: function(name, accessModule, builder, loc) {
        var gv = this.globalVars[name];
        if (gv && (gv.isPublic || accessModule == this.module)) {
            return gv.value;
        } else {
            var imports = this.module.imports;
            for (var i = 0, l = imports.length; i < l; ++i) {
                var mod = imports[i];
                var scope = builder.getModuleScope(mod);
                var localVar = scope.getVariable(name, accessModule, builder, loc);
                if (localVar) {
                    return localVar;
                }
            }
        }
    },
    
    updateVariable: function(compiler, name, accessModule, builder, rhs, loc) {
        var ownerScope = this.getVariableOwner(name, accessModule, builder);
        if (ownerScope) {
            var gv = ownerScope.globalVars[name];
            var cast = gv.value.type.valueToType(rhs, compiler, loc);
            compiler.builder.storeVariable(gv.value, cast, loc);
            return cast;
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

    hasVariableName: function(name) {
        for (var classType = this.classType; classType; classType = classType.base) {
            var prop = classType.properties[name];
            if (prop) {
                return true;
            }
        }
    },
    
    // ---------------------------------------------------------------------------------------------
    // Scope

    get innerClass() {
        return this.classType;
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

    updateVariable: function(compiler, name, accessModule, builder, rhs, loc) {
        if (this.hasVariableName(name)) {
            return this.classType.storeProperty(compiler, this.self, name, rhs, loc);
        } else if (this.previous) {
            return this.previous.updateVariable(compiler, name, accessModule, builder, rhs, loc);
        }
    },

    evaluateAll: function() {
        if (this.previous) {
            this.previous.evaluateAll();
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
    this.func = func;
    this.localSymbols = {};
    this.localVars = {};
    this.lazyVars = {};
    this.deferred = [];
    this.afterBlock = null;
    this.cleaningUp = false;
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
            builder.storeVariable(local, rhs, loc);
            return local;
        }
    },
        
    evaluateName: function(name, makeVariable) {
        var local = this.localVars[name];
        if (local) {
            if (local.isConst) {
                if (makeVariable) {
                    // XXXjoe Convert to variable
                }
                
                return local.value;
            } else {
                return this.compiler.builder.loadVariable(local.value, name, local.value.loc);
            }
        } else {
            var expr = this.lazyVars[name];
            if (expr) {
                delete this.lazyVars[name];

                var rhs = expr.compile(this.compiler);
                if (makeVariable) {
                    // XXXjoe
                } else {
                    // this.localVars[name] = {value: rhs, isConst: true};
                    // return rhs;
                }
                var local = this.defineVariable(name, false, rhs, this.compiler.builder, rhs.loc);
                return this.compiler.builder.loadVariable(local, name, rhs.loc);
            } else {
                return null;
            }
        }
    },
    
    defer: function(expr) {
        this.deferred.unshift(expr);
    },
    
    // ---------------------------------------------------------------------------------------------
    // Scope

    get innerFunction() {
        return this.func;
    },
    
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

    getVariable: function(name, accessModule, builder, loc) {
        if (name in this.localVars) {
            var localVar = this.localVars[name];
            this.func.addToClosure(localVar);
            return localVar ? localVar.value : null;
        } else if (name in this.lazyVars) {
            throw new MoyaError("Lazy variable can't be accessed here", loc);
        }
    },
        
    defineLazyVariable: function(name, rhs, loc) {
        if (name in this.lazyVars) {
            throw new MoyaError("Redundant definition", loc);
        }
        
        this.lazyVars[name] = rhs;
    },
    
    updateVariable: function(compiler, name, accessModule, builder, rhs, loc) {
        var local = this.localVars[name];
        if (local) {
            var cast = local.value.type.valueToType(rhs, compiler, loc);
            compiler.builder.storeVariable(local.value, cast, loc);
            return local.value;
        } else if (this.previous) {
            return this.previous.updateVariable(compiler, name, accessModule, builder, rhs, loc);
        }
    },

    evaluateAll: function() {
        for (var name in this.lazyVars) {
            this.evaluateName(name);
        }

        if (this.previous) {
            this.previous.evaluateAll();
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
    
    get isCleaningUp() {
        for (var scope = this; scope; scope = scope.previous) {
            if (scope.cleaningUp) {
                return true;
            }
        }
    },
    
    cleanup: function(compiler) {
        this.cleaningUp = true;
        this.deferred.forEach(function(cb) {
            cb();
        }.bind(this));
        this.cleaningUp = false;
    },
});

// *************************************************************************************************

function ClosureScope(closureType) {
    this.closureType = closureType;
    this.parentScope = closureType.parentScope;
    this.previous = null;
}
exports.ClosureScope = ClosureScope;

ClosureScope.prototype = fool.subclass(Scope, {
    lookupVariableInClosures: function(name, accessModule, builder, loc, cb) {
        var stack = [];
        var scope = this.parentScope;
        var previousFuncScope = null;
        while (scope) {
            if (scope instanceof ClosureScope) {
                stack.push(scope);
                scope = scope.parentScope;
            } else if (scope instanceof FunctionScope) {
                var localVar = name == 'this'
                    ? scope.getThis()
                    : scope.getVariable(name, accessModule, builder, loc);
                if (localVar) {
                    scope.func.addToClosure(localVar);
                    return this.loadFromClosures(localVar, stack, builder, loc, cb);
                } else {
                    previousFuncScope = scope;
                    scope = scope.previous;
                }
            } else if (scope instanceof ClassScope) {
                var prop = scope.classType.getProperty(name);
                if (prop) {
                    var thisVar = previousFuncScope.getThis();
                    previousFuncScope.func.addToClosure(thisVar);
                    
                    return this.loadFromClosures(thisVar, stack, builder, loc, function(ptr, type) {
                        var that = builder.loadVariable(ptr, type, loc);
                        var propOffset = builder.propOffset(scope.classType, name);
                        var offsets = [builder.int(0), propOffset];
                        var propVar = builder.gep(that, offsets, null, prop.type, loc);
                        return cb(propVar, prop.type);
                    });
                }
            } else {
                return cb(null, null, scope);
            }
        }
    },
    
    loadFromClosures: function(localVar, stack, builder, loc, cb) {
        var closureStub = this.closureStub;
        for (var i = stack.length-1; i >= 0; --i) {
            var closureScope = stack[i];
            closureScope.closureFunction.addToClosure(closureScope.closureStub);

            var offsets = [builder.int(0), builder.int(closureScope.closureStub.closureIndex)];
            var val = builder.gep(closureStub, offsets, null, closureScope.closureStub.type, loc);
            closureStub = builder.loadVariable(val, closureScope.closureStub.type, loc);
        }

        var offsets = [builder.int(0), builder.int(localVar.closureIndex)];
        var ptr = builder.gep(closureStub, offsets, null, localVar.type, loc);
        return cb(ptr, localVar.type);
    },
    
    // ---------------------------------------------------------------------------------------------
    // Scope
    
    get rootScope() {
        return this.parentScope.rootScope;
    },

    get innerClass() {
        return this.parentScope.innerClass;
    },

    get innerFunction() {
        return this.parentScope.innerFunction;
    },
    
    lookupVariableValue: function(name, accessModule, builder, loc) {
        return this.lookupVariableInClosures(name, accessModule, builder, loc,
        function(ptr, type, defaultScope) {
            if (defaultScope) {
                return defaultScope.lookupVariableValue(name, accessModule, builder, loc);
            } else {
                return builder.loadVariable(ptr, type, loc);
            }
        });
    },

    updateVariable: function(compiler, name, accessModule, builder, rhs, loc) {
        return this.lookupVariableInClosures(name, accessModule, builder, loc,
        function(ptr, type, defaultScope) {
            if (defaultScope) {
                return defaultScope.updateVariable(compiler, name, accessModule, builder, rhs, loc);
            } else {
                builder.storeVariable(ptr, rhs, loc);
                return rhs;
            }
        });
    },
    
    evaluateAll: function() {
        return this.parentScope.evaluateAll();
    },
});
