
var fool = require('fool');
var llvm = require('./llvm');
var utils = require('./utils'),
    expr = utils.expr,
    MoyaError = utils.MoyaError;
var types = require('./type'),
    builtinTypes = types.builtinTypes,
    SpecificSymbol = types.SpecificSymbol,
    AmbiguousSymbol = types.AmbiguousSymbol;

// *************************************************************************************************

function Scope(previous) {
    this.previous = null;
    this.compiler = null;
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
    
    lookupVariableValue: function(name) {
        if (this.previous) {
            return this.previous.lookupVariableValue(name);
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
    this.compiler = null;
}
exports.ModuleScope = ModuleScope;

ModuleScope.prototype = fool.subclass(Scope, {
    // *********************************************************************************************
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

function ClassStaticScope(classType) {
    this.classType = classType;
    this.localSymbols = {};
    this.propertyMap = {};
    this.orderedProperties = {};
    this.inferringProperties = {};
    this.self = null;
    this.previous = null;
    this.compiler = null;

    var classSymbolNames = classType.class.symbolNames;
    for (var i = 0, l = classSymbolNames.length; i < l; ++i) {
        var symbolName = classSymbolNames[i];
        this.localSymbols[symbolName] = classType.argSymbols[i];
    }
}
exports.ClassStaticScope = ClassStaticScope;

ClassStaticScope.prototype = fool.subclass(Scope, {
    declareProperty: function(name, body) {
        this.propertyMap[name] = body;
    },
    
    // *********************************************************************************************
    // Scope

    getThis: function() {
        return expr(this.classType, this.self);
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
    
    lookupVariableValue: function(name) {
        if (name == "this") {
            return expr(this.classType, this.self);
        } else {
            var prop = this.classType.properties[name];
            if (prop) {
                var zero = this.compiler.getInt(0);
                var offset = this.compiler.getInt(prop.offset);
                var variable = llvm.getPointer(this.self, [zero, offset]);
                return expr(prop.type, llvm.loadVariable(variable));
            } else if (this.previous) {
                return this.previous.lookupVariableValue(name);
            }
        }
    },

    lookupVariableType: function(name) {
        if (name == "this") {
            return this.classType;
        } else {
            var prop = this.classType.properties[name];
            if (prop) {
                if (prop.type) {
                    this.orderedProperties[name] = this.propertyMap[name];
                    return prop.type;
                } else {
                    var rhs = this.propertyMap[name];
                    if (rhs) {
                        if (this.inferringProperties[name]) {
                            throw new MoyaError('Circular reference to "' + name + '"', rhs.loc);
                        }
                        
                        this.inferringProperties[name] = true;
                        prop.type = this.compiler.inferNode(rhs);
                        this.orderedProperties[name] = this.propertyMap[name];
                        this.inferringProperties[name] = false;
                        return prop.type;
                    }
                }
            } else if (this.previous) {
                return this.previous.lookupVariableType(name);
            }
        }
    },
    
    evaluateSymbol: function(name) {
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

function ClassScope(classType) {
    this.classType = classType;
    this.localSymbols = {};
    this.self = null;
    this.previous = null;
    this.compiler = null;

    var classSymbolNames = classType.class.symbolNames;
    for (var i = 0, l = classSymbolNames.length; i < l; ++i) {
        var symbolName = classSymbolNames[i];
        this.localSymbols[symbolName] = classType.argSymbols[i];
    }
}
exports.ClassScope = ClassScope;

ClassScope.prototype = fool.subclass(Scope, {
    // *********************************************************************************************
    // Scope

    isProperty: function(name) {
        var prop = this.classType.properties[name];
        return prop ? this : null;
    },

    getThis: function() {
        return expr(this.classType, this.self);
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
    
    lookupVariableValue: function(name) {
        if (name == "this") {
            return expr(this.classType, this.self);
        } else {
            var prop = this.classType.properties[name];
            if (prop) {
                var zero = this.compiler.getInt(0);
                var offset = this.compiler.getInt(prop.offset);
                var variable = llvm.getPointer(this.self, [zero, offset]);
                return expr(prop.type, llvm.loadVariable(variable));
            } else if (this.previous) {
                return this.previous.lookupVariableValue(name);
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
            } else if (this.previous) {
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

function FunctionStaticScope() {
    this.localVarTypes = {};
    this.localSymbols = {};
    this.previous = null;
    this.compiler = null;
}
exports.FunctionStaticScope = FunctionStaticScope;

FunctionStaticScope.prototype = fool.subclass(Scope, {
    declareSymbol: function(name, symbol) {
        this.localSymbols[name] = symbol;
    },

    storeVariableType: function(name, type) {
        this.localVarTypes[name] = type;
    },

    expandType: function(typeNode, argSymbol) {
        if (typeNode.nick == "TypeId") {
            if (typeNode.id in this.localSymbols) {
                this.localSymbols[typeNode.id] = argSymbol;
            }
        } else if (typeNode.nick == "TypeArguments") {
            var className = typeNode.args[0].id;
            return this.previous.lookupClass(className, function(genericClass) {
                argSymbol.matchClass(genericClass, typeNode.args.length-1,
                function(genericClass, argSymbols) {
                    for (var i = 1, l = typeNode.args.length; i < l; ++i) {
                        this.expandType(typeNode.args[i], argSymbols[i-1]);
                    }
                }.bind(this));
            }.bind(this));
        }
    },

    // *********************************************************************************************
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

    lookupVariableType: function(name) {
        var type = this.localVarTypes[name];
        if (type) {
            return type;
        }
        
        if (this.previous) {
            return this.previous.lookupVariableType(name);
        }
    },

    evaluateSymbol: function(name) {
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

function FunctionScope(realFunc) {
    this.realFunc = realFunc;
    this.localSymbols = {};
    this.localVars = {};
    this.previous = null;
    this.compiler = null;

    var funcSymbolNames = realFunc.generic.symbolNames;
    for (var i = 0, l = funcSymbolNames.length; i < l; ++i) {
        var symbolName = funcSymbolNames[i];
        this.localSymbols[symbolName] = realFunc.argSymbols[i];
    }
}
exports.FunctionScope = FunctionScope;

FunctionScope.prototype = fool.subclass(Scope, {
    storeVariable: function(name, rhs) {
        var local = this.localVars[name];
        if (local) {
            llvm.storeVariable(local.value, rhs.value);
        } else {
            var variable = llvm.createVariable(name, rhs.type.native);
            local = expr(rhs.type, variable);
            this.localVars[name] = local;
            llvm.storeVariable(variable, rhs.value);
        }
        return local;
    },
    
    // *********************************************************************************************
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
    
    lookupVariableValue: function(name) {
        var local = this.localVars[name];
        if (local) {
            var val = llvm.loadVariable(local.value, name);
            return expr(local.type, val);
        } else if (this.previous) {
            return this.previous.lookupVariableValue(name);
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
