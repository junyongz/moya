
var fool = require('fool');
var utils = require('./utils'),
    expr = utils.expr,
    MoyaError = utils.MoyaError;
var builtinTypes = require('./type').builtinTypes;

// *************************************************************************************************

function Scope(previous) {
    this.previous = null;
    this.compiler = null;
}
exports.Scope = Scope;

Scope.prototype = {
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

    evaluateType: function(typeNode) {
        if (this.previous) {
            return this.previous.evaluateType(typeNode);
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
};

// *************************************************************************************************

function ModuleScope() {
    this.genericClasses = {};
    this.genericFunctions = {};
    this.previous = null;
    this.compiler = null;
}
exports.ModuleScope = ModuleScope;

ModuleScope.prototype = fool.subclass(Scope, {
    declareClass: function(cls) {
        var classes = this.genericClasses[cls.name]
        if (!classes) {
            classes = this.genericClasses[cls.name] = [];
        }
        classes.push(cls);
    },
    
    declareFunction: function(func) {
        var funcs = this.genericFunctions[func.name]
        if (!funcs) {
            funcs = this.genericFunctions[func.name] = [];
        }
        funcs.push(func);
    },

    lookupClass: function(name, cb) {
        var classes = this.genericClasses[name]
        if (!classes) {
            classes = this.genericClasses[name] = [];
        }
        
        for (var i = 0, l = classes.length; i < l; ++i) {
            var ret = cb(classes[i]);
            if (ret) {
                return ret;
            }
        }
    },

    lookupFunction: function(name, cb) {
        var funcs = this.genericFunctions[name]
        if (!funcs) {
            funcs = this.genericFunctions[name] = [];
        }
        
        for (var i = 0, l = funcs.length; i < l; ++i) {
            var ret = cb(funcs[i]);
            if (ret) {
                return ret;
            }
        }
    },

    evaluateType: function(typeNode) {
        if (typeNode.nick == 'TypeId') {
            var cls = this.lookupClass(typeNode.id, function(cls) {
                if (cls.inputTypes.length == 0) {
                    return this.compiler.precompileClass(cls, []);
                }
            }.bind(this));
            if (cls) {
                return cls;
            }

            var type = builtinTypes[typeNode.id];
            if (type) {
                return type;
            }
        } else if (typeNode.nick == "TypeArguments") {
            var className = typeNode.args[0].id;
            var inputTypes = [];
            for (var i = 1, l = typeNode.args.length; i < l; ++i) {
                var typeNodeArg = typeNode.args[i];
                var inputType = this.compiler.scope.evaluateType(typeNodeArg);
                if (!inputType) {
                    throw new MoyaError('Type not found', typeNodeArg.loc);
                }
                inputTypes[i-1] = inputType;
            }

            var cls = this.lookupClass(className, function(cls) {
                if (cls.inputTypes.length == inputTypes.length) {
                    return this.compiler.precompileClass(cls, inputTypes);
                }
            }.bind(this));
            if (cls) {
                return cls;
            }
        }
    },
});

// *************************************************************************************************

function FunctionScope(realFunc) {
    this.realFunc = realFunc;
    this.localVars = {};
    this.localTypes = {};
    this.previous = null;
    this.compiler = null;
}
exports.FunctionScope = FunctionScope;

FunctionScope.prototype = fool.subclass(Scope, {
    evaluateType: function(typeNode) {
        if (typeNode.nick == "TypeId") {
            var type = this.localTypes[typeNode.id];
            if (type) {
                return type;
            }
        }
        
        if (this.previous) {
            return this.previous.evaluateType(typeNode);
        } else {
            throw new MoyaError('Type "' + typeNode.id + '" not found', typeNode.loc);
        }
    },

    lookupVariableValue: function(name) {
        var local = this.localVars[name];
        if (local) {
            var val = this.compiler.bridge.loadVariable(local.value, name);
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
    
    storeVariable: function(name, rhs) {
        var local = this.localVars[name];
        if (local) {
            this.compiler.bridge.storeVariable(local.value, rhs.value);
        } else {
            var variable = this.compiler.bridge.createVariable(name, rhs.type.native);
            local = expr(rhs.type, variable);
            this.localVars[name] = local;
            this.compiler.bridge.storeVariable(variable, rhs.value);
        }
        return local;
    },
});

// *************************************************************************************************

function FunctionStaticScope() {
    this.localVarTypes = {};
    this.localTypes = {};
    this.previous = null;
    this.compiler = null;
}
exports.FunctionStaticScope = FunctionStaticScope;

FunctionStaticScope.prototype = fool.subclass(Scope, {
    declareType: function(name, type) {
        this.localTypes[name] = type;
    },

    expandType: function(typeNode, argType) {
        if (typeNode.nick == "TypeId") {
            if (typeNode.id in this.localTypes) {
                this.localTypes[typeNode.id] = argType;
                return argType;
            }
        } else if (typeNode.nick == "TypeArguments") {
            var className = typeNode.args[0].id;
            return this.previous.lookupClass(className, function(cls) {
                if (cls == argType.class && typeNode.args.length-1 == argType.inputTypes.length) {
                    for (var i = 1, l = typeNode.args.length; i < l; ++i) {
                        var typeNodeArg = typeNode.args[i];
                        var inputType = argType.inputTypes[i-1];
                        this.expandType(typeNodeArg, inputType);
                    }
                }
            }.bind(this));
        }
    },

    evaluateType: function(typeNode) {
        if (typeNode.nick == "TypeId") {
            var type = this.localTypes[typeNode.id];
            if (type) {
                return type;
            }
        }

        if (this.previous) {
            return this.previous.evaluateType(typeNode);
        } else {
            throw new MoyaError('Type "' + typeNode.id + '" not found', typeNode.loc);
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

    storeVariableType: function(name, type) {
        this.localVarTypes[name] = type;
    },
});

// *************************************************************************************************

function ClassScope(classType) {
    this.classType = classType;
    this.self = null;
    this.previous = null;
    this.compiler = null;
}
exports.ClassScope = ClassScope;

ClassScope.prototype = fool.subclass(Scope, {
    isProperty: function(name) {
        var prop = this.classType.properties[name];
        return prop ? this : null;
    },

    getThis: function() {
        return expr(this.classType, this.self);
    },

    lookupFunction: function(name, cb) {
        // Find constructors for types stored in type variables
        var classInputNames = this.classType.class.inputTypes;
        for (var i = 0, l = classInputNames.length; i < l; ++i) {
            var inputTypeName = classInputNames[i];
            if (inputTypeName == name) {
                var c = this.classType.inputTypes[i];
                return this.previous.lookupFunction(c.name, cb);
            }
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
                var variable = this.compiler.bridge.getPointer(this.self, [zero, offset]);
                return expr(prop.type, this.compiler.bridge.loadVariable(variable));
            } else if (this.previous) {
                return this.previous.lookupVariableValue(name);
            }
        }
    },

    lookupVariableType: function(name) {
        if (name == "this") {
            return this.classType;
        } else {
            var prop = this.type.properties[name];
            if (prop) {
                return prop.type;
            } else if (this.previous) {
                return this.previous.lookupVariableType(name);
            }
        }
    },

    evaluateType: function(typeNode) {
        if (typeNode.nick == "TypeId") {
            var classInputNames = this.classType.class.inputTypes;
            for (var i = 0, l = classInputNames.length; i < l; ++i) {
                var inputTypeName = classInputNames[i];
                if (inputTypeName == typeNode.id) {
                    var c = this.classType.inputTypes[i];
                    return c;
                }
            }
        } else if (typeNode.nick == "TypeArguments") {
            throw new MoyaError("NYI", typeNode.loc);
        } else {
            throw new MoyaError("Illegal type", typeNode.loc);
        }

        if (this.previous) {
            return this.previous.evaluateType(typeNode);
        } else {
            throw new MoyaError('Type "' + typeNode.id + '" not found', typeNode.loc);
        }
    },
});

// *************************************************************************************************

function ClassStaticScope(classType, propertyMap) {
    this.classType = classType;
    this.propertyMap = propertyMap;
    this.orderedProperties = {};
    this.inferringProperties = {};
    this.self = null;
    this.previous = null;
    this.compiler = null;
}
exports.ClassStaticScope = ClassStaticScope;

ClassStaticScope.prototype = fool.subclass(ClassScope, {
    lookupVariableValue: function(name) {
        if (name == "this") {
            return expr(this.classType, this.self);
        } else {
            var prop = this.classType.properties[name];
            if (prop) {
                var zero = this.compiler.getInt(0);
                var offset = this.compiler.getInt(prop.offset);
                var variable = this.compiler.bridge.getPointer(this.self, [zero, offset]);
                return expr(prop.type, this.compiler.bridge.loadVariable(variable));
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
});
