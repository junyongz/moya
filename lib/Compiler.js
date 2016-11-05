
var fool = require('fool');
var T = require('./syntax');
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    SequenceType = types.SequenceType,
    FunctionType = types.FunctionType,
    ClassType = types.ClassType;
    
var moyallvm = require('../moyallvm/build/Release/moyallvm');

// *************************************************************************************************

exports.compileModule = function(name, ast, debugMode) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast, debugMode);
}
// *************************************************************************************************

var VOID = new NumberType('void', 0);
var I1 = new NumberType('i1', 1);
var I8 = new NumberType('i8', 8);
var I16 = new NumberType('i16', 16);
var I32 = new NumberType('i32', 32);
var I64 = new NumberType('i64', 64);
var F32 = new NumberType('f32', 32);
var F64 = new NumberType('f64', 64);
var STRING = new SequenceType('string');

var builtinTypes = {
    Void: VOID,
    Bool: I1,
    Int1: I1,
    Int8: I8,
    Bool: I8,
    Int16: I16,
    Int32: I32,
    Int: I32,
    Int64: I64,
    Long: I64,
    Float32: F32,
    Float: F32,
    Float64: F64,
    Double: F64,
    String: STRING,
};

// *************************************************************************************************

function Expr(type, value) {
    this.type = type;
    this.value = value;
}

function expr(type, value) {
    return new Expr(type, value);
}

// *************************************************************************************************

function MoyaError(message, loc) {
    this.message = message;
    this.loc = loc;
}

MoyaError.prototype = fool.subclass(Error, {
    toString: function() {
        return this.message;
    },
});

// *************************************************************************************************

function GenericFunction(name) {
    this.name = name;
    this.inputTypes = [];
    this.returns = null;
    this.ast = null;
    this.minimumArgCount = 0;
}

GenericFunction.prototype = {
    match: function(argTypes, inputTypes, scope) {
        var args = this.ast.args.items;
        if (argTypes.length > args.length  || argTypes.length < this.minimumArgCount) {
            return null;
        }
        if (inputTypes.length > this.inputTypes.length) {
            return null;
        }

        argTypes = argTypes.slice();
        var funcScope = new FunctionMatchScope(scope);
        
        for (var i = 0, l = this.inputTypes.length; i < l; ++i) {
            var typeVarName = this.inputTypes[i];
            funcScope.declareType(typeVarName, inputTypes[i]);
        }
        
        // Define type arguments by pulling them from actual arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var arg = args[i];
            funcScope.expandType(arg.type, argTypes[i]);
        }
        
        // Evaluate all type arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argType = argTypes[i];
            var arg = args[i];
            var expectedType = funcScope.evaluateType(arg.type);
            if (!expectedType || !argType.isTypeOrSubclass(expectedType)) {
                return null;
            }
        }
        
        // Fill in default values for missing arguments
        for (var i = argTypes.length, l = args.length; i < l; ++i) {
            var arg = args[i];
            var expectedType = null;
            if (arg.type) {
                expectedType = funcScope.evaluateType(arg.type);
            } else {
                expectedType = scope.compiler.inferNode(arg.defaultValue);
            }
            
            if (!expectedType) {
                throw new MoyaError("Unknown type for argument");
            }
            
            argTypes.push(expectedType);
        }
        
        // Ensure all type arguments are defined
        for (var name in funcScope.typeLocals) {
            if (!funcScope.typeLocals[name]) {
                return null;
            }
        }
        
        var returnType = this.returns ? funcScope.evaluateType(this.returns) : null;
        var func = new RealFunction(this.name, funcScope.typeLocals, argTypes, returnType);
        func.generic = this;
        return func;
    }
}

function RealFunction(name, inputTypes, argTypes, returnType) {
    this.name = name;
    this.inputTypes = inputTypes;
    this.argTypes = argTypes;
    this.returnType = returnType;
    this.generic = null;
    this.native = null;
}

RealFunction.prototype = {
    
}

// *************************************************************************************************

function GenericClass(name) {
    this.name = name;
    this.inputTypes = [];
    this.ast = null;
}

GenericClass.prototype = {
    keyWithInputs: function(inputTypes) {
        var key = this.name;
        for (var i = 0, l = inputTypes.length; i < l; ++i) {
            key += '(' + inputTypes[i].toString() + ')';
        }
        return key;
    },
}

// *************************************************************************************************

function Scope(previous) {
    this.previous = null;
    this.compiler = null;
}

Scope.prototype = {
    expandType: function(typeNode, argType) {
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
    
    lookupVariableValue: function(name, node) {
        if (this.previous) {
            return this.previous.lookupVariableValue(name, node);
        } else {
            throw new MoyaError('"' + name + '" not found', node.loc);
        }
    },
    
    lookupVariableType: function(name, node) {
        if (this.previous) {
            return this.previous.lookupVariableType(name, node);
        }
    },
};

function ModuleScope() {
    this.genericClasses = {};
    this.previous = null;
    this.compiler = null;
}

ModuleScope.prototype = fool.subclass(Scope, {
    evaluateType: function(typeNode) {
        if (typeNode.nick == 'TypeId') {
            var type = builtinTypes[typeNode.id];
            if (type) {
                return type;
            }
        }
        
        if (this.previous) {
            return this.previous.evaluateType(typeNode);
        }
    },
    
    lookupClass: function(className, cb) {
        var classes = this.genericClasses[className]
        if (!classes) {
            classes = this.genericClasses[className] = [];
        }
        
        for (var i = 0, l = classes.length; i < l; ++i) {
            var cls = classes[i];
            var ret = cb(cls);
            if (ret) {
                return ret;
            }
        }
        
        if (this.previous) {
            return this.previous.lookupClass(className, cb);
        }
    },
    
    declareClass: function(cls) {
        var classes = this.genericClasses[cls.name]
        if (!classes) {
            classes = this.genericClasses[cls.name] = [];
        }
        classes.push(cls);
    },
    
    store: function(name, value) {
        this.locals[name] = value;
    },
});

function FunctionScope(realFunc) {
    this.realFunc = realFunc;
    this.locals = {};
    this.typeLocals = {};
    this.previous = null;
    this.compiler = null;
}

FunctionScope.prototype = fool.subclass(Scope, {
    evaluateType: function(typeNode) {
        if (typeNode.nick == "TypeId") {
            var type = this.typeLocals[typeNode.id];
            if (type) {
                return type;
            }
        } else if (typeNode.nick == "TypeArguments") {
            var className = typeNode.args[0].id;
            var inputTypes = [];
            for (var i = 1, l = typeNode.args.length; i < l; ++i) {
                var typeNodeArg = typeNode.args[i];
                var inputType = this.evaluateType(typeNodeArg);
                if (!inputType) {
                    throw new MoyaError('Type not found', typeNodeArg.loc);
                }
                inputTypes[i-1] = inputType;
            }

            var cls = this.previous.lookupClass(className, function(cls) {
                if (cls.inputTypes.length == inputTypes.length) {
                    return this.compiler.precompileClass(cls, inputTypes);
                }
            }.bind(this));
            if (cls) {
                return cls;
            }
        }
        
        if (this.previous) {
            return this.previous.evaluateType(typeNode);
        } else {
            throw new MoyaError('Type "' + typeNode.id + '" not found', typeNode.loc);
        }
    },

    lookupVariableValue: function(name, node) {
        var local = this.locals[name];
        if (local) {
            var val = this.compiler.bridge.loadVariable(local.value, name);
            return expr(local.type, val);
        } else if (this.previous) {
            return this.previous.lookupVariableValue(name, node);
        } else {
            throw new MoyaError('"' + name + '" not found', node.loc);
        }
    },
    
    lookupVariableType: function(name, node) {
        var local = this.locals[name];
        if (local) {
            return local.type;
        } else if (this.previous) {
            return this.previous.lookupVariableType(name, node);
        }
    },
    
    assign: function(name, type, rhs) {
        if (!type) {
            type = rhs.type;
        }

        if (type != rhs.type) {
            // XXXjoe This is where type conversion should be tried
            throw new MoyaError('Expecting a different type', node.loc);
        }

        var local = this.locals[name];
        if (local) {
            this.compiler.bridge.storeVariable(local.value, rhs.value);
        } else {
            var variable = this.compiler.bridge.createVariable(name, type.native);
            local = expr(type, variable);
            this.locals[name] = local;
            this.compiler.bridge.storeVariable(variable, rhs.value);
        }
        return local;
    },
    
    store: function(name, value) {
        this.locals[name] = value;
    },
});

function ClassScope(classType) {
    this.classType = classType;
    this.self = null;
    this.previous = null;
    this.compiler = null;
}

ClassScope.prototype = fool.subclass(Scope, {
    lookupVariableValue: function(name, node) {
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
                return this.previous.lookupVariableValue(name, node);
            }
        }
    },

    lookupVariableType: function(name, node) {
        if (name == "this") {
            return this.classType;
        } else {
            var prop = this.type.properties[name];
            if (prop) {
                return prop.type;
            } else if (this.previous) {
                return this.previous.lookupVariableType(name, node);
            }
        }
    },
});

function ClassStaticScope(classType, propertyMap) {
    this.classType = classType;
    this.propertyMap = propertyMap;
    this.orderedProperties = {};
    this.inferringProperties = {};
    this.self = null;
    this.previous = null;
    this.compiler = null;
}

ClassStaticScope.prototype = fool.subclass(ClassScope, {
    lookupVariableValue: function(name, node) {
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
                return this.previous.lookupVariableValue(name, node);
            }
        }
    },

    lookupVariableType: function(name, node) {
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
                            throw new MoyaError('Circular reference to "' + name + '"', node.loc);
                        }
                        
                        this.inferringProperties[name] = true;
                        prop.type = this.compiler.inferNode(rhs);
                        this.orderedProperties[name] = this.propertyMap[name];
                        this.inferringProperties[name] = false;
                        return prop.type;
                    }
                }
            } else if (this.previous) {
                return this.previous.lookupVariableType(name, node);
            }
        }
    },
});

function FunctionMatchScope(previous) {
    this.typeLocals = {};
    this.previous = previous;
    this.compiler = previous.compiler;
}

FunctionMatchScope.prototype = fool.subclass(Scope, {
    declareType: function(name, type) {
        this.typeLocals[name] = type;
    },

    expandType: function(typeNode, argType) {
        if (typeNode.nick == "TypeId") {
            if (typeNode.id in this.typeLocals) {
                this.typeLocals[typeNode.id] = argType;
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
            var type = this.typeLocals[typeNode.id];
            if (type) {
                return type;
            }
        } else if (typeNode.nick == "TypeArguments") {
            var className = typeNode.args[0].id;
            var inputTypes = [];
            for (var i = 1, l = typeNode.args.length; i < l; ++i) {
                var typeNodeArg = typeNode.args[i];
                var inputType = this.evaluateType(typeNodeArg);
                if (!inputType) {
                    throw new MoyaError('Type not found', typeNodeArg.loc);
                }
                inputTypes[i-1] = inputType;
            }
            
            var cls = this.previous.lookupClass(className, function(cls) {
                if (cls.inputTypes.length == inputTypes.length) {
                    return this.compiler.precompileClass(cls, inputTypes);
                }
            }.bind(this));
            if (cls) {
                return cls;
            }
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

function Compiler() {
    this.bridge = new moyallvm.CompilerBridge();
    this.genericFunctions = {};
    this.typeCache = {};
    this.functionQueue = [];
    this.classQueue = [];
    this.scope = new Scope();
    
    VOID.native = this.bridge.getType(0);
    I1.native = this.bridge.getType(1);
    I8.native = this.bridge.getType(2);
    I16.native = this.bridge.getType(3);
    I32.native = this.bridge.getType(4);
    I64.native = this.bridge.getType(5);
    F32.native = this.bridge.getType(6);
    F64.native = this.bridge.getType(7);
    STRING.native = this.bridge.getType(8);
}

Compiler.prototype = {
    compileType: function(typeArg) {
        if (typeArg.nick == "TypeId") {
            var type = this.scope.lookupType(typeArg.id);
            if (type) {
                return type;
            } else {
                type = this.classMap[typeArg.id];
                if (type) {
                    return type;
                } else {
                    throw new MoyaError('Type "' + typeArg.id + '" not found', typeArg.loc);
                }
            }
        } else if (typeArg.nick == "TypeArguments") {
            var first = this.compileType(typeArg.args[0].id);
            // XXXjoe Create class instance with type arguments
            for (var i = 0, l = typeArg.args.length; i < l; ++i) {
                var arg = typeArg.args[i].id;
            }
        } else {
            throw new MoyaError("Invalid type", typeArg.loc);
        }
    },
    
    pushScope: function(scope) {
        scope.previous = this.scope;
        scope.compiler = this;
        this.scope = scope;
    },
    
    popScope: function() {
        var previous = this.scope.previous
        this.scope.previous = null;
        this.scope = previous;
    },
    
    compileModule: function(name, ast, debugMode) {
        this.pushScope(new ModuleScope(this.typeMap));
        
        this.bridge.beginModule(name);
        this.printString = this.bridge.declareExternalFunction('printString', VOID.native,
                                                               [STRING.native]);
        this.concat = this.bridge.declareExternalFunction('concatString', STRING.native,
                                                          [STRING.native, STRING.native]);
        this.intToString = this.bridge.declareExternalFunction('intToString', STRING.native,
                                                               [I64.native]);
        this.doubleToString = this.bridge.declareExternalFunction('doubleToString', STRING.native,
                                                                  [F64.native]);
        this.pow = this.bridge.declareExternalFunction('powerdd', F64.native,
                                                       [F64.native, F64.native]);
        this.newObject = this.bridge.declareExternalFunction('newObject', STRING.native,
                                                             [I32.native]);
        
        var funcs = [];
        var classes = [];
        var nodes = ast.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.nick == "FunctionDecl") {
                funcs.push(node);
            } else if (node.nick == "Class") {
                classes.push(node);
            }
        }

        for (var i = 0, l = classes.length; i < l; ++i) {
            this.declareClass(classes[i]);
        }
                
        for (var i = 0, l = funcs.length; i < l; ++i) {
            this.declareFunction(funcs[i]);
        }

        var main = this.matchFunction('main', [], []);
        
        while (this.functionQueue.length) {
            var info = this.functionQueue.shift();
            this.compileFunction(info.func, info.argVariables);
        }

        while (this.classQueue.length) {
            var info = this.classQueue.shift();
            this.compileClass(info.type, info.self, info.propertyMap);
        }
        
        this.bridge.endModule(debugMode ? 1 : 0);
        
        this.popScope();
        
        if (main) {
            this.bridge.executeMain();
        }
    },

    // *********************************************************************************************

    declareClass: function(classDecl) {
        var id = classDecl.id;
        var inputTypeNodes = null;
        if (id.nick == "TypeArguments") {
            inputTypeNodes = id.args.slice();
            id = inputTypeNodes.shift().id;
        } else {
            id = id.id;
        }
        
        var cls = new GenericClass(id);
        cls.ast = classDecl;
        
        if (inputTypeNodes) {
            for (var i = 0, l = inputTypeNodes.length; i < l; ++i) {
                var argItem = inputTypeNodes[i];
                if (argItem.nick == "TypeId") {
                    cls.inputTypes.push(argItem.id);
                } else {
                    throw new MoyaError("Illegal type argument", argItem.loc);
                }
            }
        }

        this.scope.declareClass(cls);
    },

    matchClass: function(name, argTypes, inputTypes) {
        return this.scope.lookupClass(name, function(genericClass) {
            var classType = this.precompileClass(genericClass, inputTypes);
            return classType;
        }.bind(this));
    },

    precompileClass: function(genericClass, inputTypes) {
        var key = genericClass.keyWithInputs(inputTypes);
        var classType = this.typeCache[key];
        if (classType) {
            return classType;
        }
        
        var classType = new ClassType(genericClass, inputTypes);
        this.typeCache[key] = classType;
        classType.nativeStruct = this.bridge.createStruct(key);
        classType.native = this.bridge.getPointerType(classType.nativeStruct);
        
        var propertyMap = {};
        var classScope = new ClassStaticScope(classType, propertyMap);
        this.pushScope(classScope);

        var scope = new FunctionMatchScope(classScope);
        
        for (var i = 0, l = inputTypes.length; i < l; ++i) {
            var typeVarName = genericClass.inputTypes[i];
            scope.declareType(typeVarName, inputTypes[i]);
        }
        

        var classDecl = genericClass.ast;
        if (classDecl.body) {
            // First pass - compile explicitly declared property types
            var nodes = classDecl.body.items;
            for (var i = 0, l = nodes.length; i < l; ++i) {
                var node = nodes[i];
                if (node.nick == 'Assignment') {
                    if (node.left.nick == 'Identifier') {
                        var prop = classType.addProperty(node.left.id);
                        propertyMap[node.left.id] = node.right;
                    } else if (node.left.nick == 'TypeAssignment') {
                        var prop = classType.addProperty(node.left.name);
                        prop.type = scope.evaluateType(node.left.type);
                        propertyMap[node.left.name] = node.right;
                    } else {
                        throw new MoyaError('Illegal property declaration', node.loc);
                    }
                } else if (node.nick == 'TypeAssignment') {
                    throw new MoyaError('Default constructors NYI', node.loc);
                } else if (node.nick == 'Identifier') {
                    throw new MoyaError('Illegal property declaration', node.loc);
                }
            }

            // Second pass - infer property types and determine order to initialize them
            var structTypes = [];
            for (var propertyName in classType.properties) {
                var prop = classType.properties[propertyName]
                classScope.lookupVariableType(propertyName, node);
                prop.offset = structTypes.length;
                structTypes.push(prop.type.native);
            }
        }

        this.popScope();

        // Empty structs crashing in LLVM, so make sure there's at least one type
        if (!structTypes) {
            structTypes = [I32.native];
        }
        
        classType.size = this.bridge.setStructBody(classType.nativeStruct, structTypes);

        var funcAndArgs = this.bridge.declareFunction(key+'_INIT',
                                                    VOID.native, [classType.native], ['self']);
        classType.initFunc = funcAndArgs.shift();
        var self = funcAndArgs.shift();

        funcAndArgs = this.bridge.declareFunction(key+'_CONS', classType.native, [], []);
        classType.consFunc = funcAndArgs.shift();
        
        this.classQueue.push({type: classType, self: self,
                              propertyMap: classScope.orderedProperties});
        
        return classType;
    },

    compileClass:function(classType, self, propertyMap) {
        var classScope = new ClassScope(classType);
        this.pushScope(classScope);
        classScope.self = self;

        this.compileClassInit(classType, self, propertyMap);
        this.compileClassCons(classType);

        this.popScope();
    },
    
    compileClassInit:function(classType, self, propertyMap) {
        var block = this.bridge.createBlock('entry', classType.initFunc);
        this.bridge.setInsertBlock(block);

        for (var propertyName in propertyMap) {
            var prop = classType.properties[propertyName];
            var rhs = this.compileNode(propertyMap[propertyName]);
            var cast = this.ensureCorrectType(rhs, prop.type);

            var offset = this.getInt(prop.offset);
            var variable = this.bridge.getPointer(self, [this.getInt(0), offset]);
            this.bridge.storeVariable(variable, cast.value);
        }

        this.bridge.compileReturn();
    },

    compileClassCons: function(classType) {
        var block = this.bridge.createBlock('entry', classType.consFunc);
        this.bridge.setInsertBlock(block);
        
        var raw = this.bridge.compileCall(this.newObject, [this.getInt(classType.size)]);
        var self = expr(classType, this.bridge.compileBitcast(raw, classType.native));
        
        this.bridge.compileCall(classType.initFunc, [self.value]);
        this.bridge.compileReturn(self.value);
    },

    // *********************************************************************************************
                
    declareFunction: function(fnDecl) {
        var id = fnDecl.id;
        var inputTypeNodes = null;
        if (id.nick == "TypeArguments") {
            inputTypeNodes = id.args.slice();
            id = inputTypeNodes.shift().id;
        } else {
            id = id.id;
        }

        var func = new GenericFunction(id);
        func.ast = fnDecl;
        
        var funcs = this.genericFunctions[id]
        if (!funcs) {
            funcs = this.genericFunctions[id] = [];
        }
        funcs.push(func);
        
        if (inputTypeNodes) {
            for (var i = 0, l = inputTypeNodes.length; i < l; ++i) {
                var argItem = inputTypeNodes[i];
                if (argItem.nick == "TypeId") {
                    func.inputTypes.push(argItem.id);
                } else {
                    throw new MoyaError("Illegal type argument", argItem.loc);
                }
            }
        }
        
        var minimumArgCount = 0;
        var argItems = fnDecl.args.items;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            if (argItem.defaultValue) {
                minimumArgCount = i;
                break;
            }
        }
        func.minimumArgCount = minimumArgCount;
                
        if (fnDecl.returns) {
            func.returns = fnDecl.returns;
        }
    },
    
    matchFunction: function(name, argTypes, inputTypes) {
        var funcs = this.genericFunctions[name];
        if (!funcs) {
            return null;
        }
        
        for (var i = 0, l = funcs.length; i < l; ++i) {
            var func = funcs[i];
            var realFunc = func.match(argTypes, inputTypes, this.scope);
            if (realFunc) {
                if (!realFunc.native) {
                    this.precompileFunction(realFunc);
                }
                return realFunc;
            }
        }
    },

    precompileFunction: function(realFunc) {
        if (realFunc.native) {
            return;
        }

        var genericFunc = realFunc.generic;
        var fnDecl = genericFunc.ast;

        var argNames = [];
        var nativeArgTypes = [];
        var argItems = fnDecl.args ? fnDecl.args.items : null;
        for (var i = 0, l = realFunc.argTypes.length; i < l; ++i) {
            nativeArgTypes[i] = realFunc.argTypes[i].native;
            argNames[i] = argItems[i].innerName;
        }
        
        var argDefaults = realFunc.argDefaults = [];
        var args = fnDecl.args.items;
        for (var i = 0, l = args.length; i < l; ++i) {
            var arg = args[i];
            if (arg.defaultValue) {
                var defaultFunc = this.precompileDefault(arg.innerName, nativeArgTypes[i]);
                argDefaults.push(defaultFunc);
            }
        }
        
        var nativeReturnType = realFunc.returnType ? realFunc.returnType.native : VOID.native;
        var funcAndArgs = this.bridge.declareFunction(realFunc.name, nativeReturnType,
                                                      nativeArgTypes, argNames);
        realFunc.native = funcAndArgs.shift();

        this.functionQueue.push({func: realFunc, argVariables: funcAndArgs});
    },
        
    compileFunction: function(realFunc, argVariables) {
        var generic = realFunc.generic;
        var scope = new FunctionScope(realFunc);
        for (var typeName in realFunc.inputTypes) {
            scope.typeLocals[typeName] = realFunc.inputTypes[typeName];
        }
        
        this.pushScope(scope);
        // XXXjoe Store type variables from realFunc in type map
        
        var fnDecl = realFunc.generic.ast;
        
        var block = this.bridge.createBlock("entry", realFunc.native);
        this.bridge.setInsertBlock(block);
        
        var argItems = fnDecl.args.items;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            var argName = argItem.innerName;
            var argType = realFunc.argTypes[i];
            var argVar = argVariables[i];
            var argRef = this.bridge.createVariable(argName, argType.native);
            this.bridge.storeVariable(argRef, argVar);
            this.scope.store(argName, expr(argType, argRef));
        }
        
        this.compileBlock(fnDecl.block);
        
        this.popScope();
        this.bridge.compileReturn();
        
        for (var i = 0, l = realFunc.argDefaults.length; i < l; ++i) {
            var defaultFunc = realFunc.argDefaults[i];
            var defaultNode = argItems[i+generic.minimumArgCount].defaultValue;
            this.compileDefault(defaultFunc, defaultNode);
        }
    },

    precompileDefault: function(name, type) {
        var funcAndArgs = this.bridge.declareFunction(name+"_DEFAULT", type, [], []);
        return funcAndArgs.shift();
    },
    
    compileDefault: function(defaultFunc, defaultValue) {
        var block = this.bridge.createBlock("entry", defaultFunc);
        this.bridge.setInsertBlock(block);

        var result = this.compileNode(defaultValue);
        this.bridge.compileReturn(result.value);
    },
    
    // *********************************************************************************************

    inferNode: function(node, isStatement) {
        return this['infer'+node.nick](node, isStatement);
    },

    inferPropertyType: function(classType, propertyName) {
        var prop = classType.properties[propertyName];
        if (prop) {
            return prop.type;
        }
    },

    inferMath: function(lhsType, rhsType) {
        if (lhsType.isNumber && rhsType.isNumber) {
            if (lhsType == rhsType) {
                return lhsType;
            } else if (rhsType == F64 || rhsType == F32) {
                return rhsType;
            } else {
                return lhsType;
            }
        } else {
            throw new MoyaError("Illegal types for binary operation", lhs.loc);
        }
    },
    
    // *********************************************************************************************
        
    compileBlock: function(block) {
        var nodes = block.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            this.compileNode(nodes[i], true);
        }
    },
    
    compileNode: function(node, isStatement) {
        return this[node.nick](node, isStatement);
    },

    valueToString: function(val) {
        if (val.type == STRING) {
            return val.value;
        } else if (val.type.isNumber) {
            if (val.type == I1 || val.type == I8 || val.type == I16 || val.type == I32) {
                return this.bridge.compileCall(this.intToString, [this.castNumber(val, I64)]);
            } else if (val.type == I64) {
                return this.bridge.compileCall(this.intToString, [val.value]);
            } else if (val.type == F32) {
                return this.bridge.compileCall(this.doubleToString, [this.castNumber(val, F64)]);
            } else if (val.type == F64) {
                return this.bridge.compileCall(this.doubleToString, [val.value]);
            }
        } else {
            throw new MoyaError("Can't convert object to string");
        }
    },

    ensureCorrectType: function(value, expectedType) {
        if (!expectedType) {
            return value;
        }
        
        if (expectedType == value.type) {
            return value;
        } else if (expectedType.isNumber) {
            var cast = this.castNumber(value, expectedType);
            return expr(expectedType, cast);
        } else {
            throw new MoyaError("Object type conversion not yet implemented");
        }
    },
            
    castNumber: function(val, type) {
        if (val.type == type) {
            return val.value;
        } else if (type == STRING) {
            return this.valueToString(val);
        } else if (type.isNumber) {
            return this.bridge.castNumber(val.value, type.native);
        } else {
            throw new MoyaError("Illegal cast");
        }
    },

    getTypeDefault: function(type) {
        if (type.isNumber) {
            if (type == F32) {
                return expr(type, this.bridge.compileFloat(0));
            } else if (type == F64) {
                return expr(type, this.bridge.compileDouble(0));
            } else {
                return expr(type, this.bridge.compileInteger(type.size, 0));
            }
        } else {
            throw new MoyaError("Default constructor NYI");
        }
    },
    
    getInt: function(val, size) {
        return this.bridge.compileInteger(size || 32, val);
    },
    
    compileTest: function(condition, n) {
        if (condition.type == I1 || condition.type == I8 || condition.type == I16
            || condition.type == I32 || condition.type == I64) {
            var zero = this.bridge.compileInteger(condition.type.size, n);
            return expr(I1, this.bridge.compileEquals(condition.value, zero));
        } else if (condition.type == F32) {
            var zero = this.bridge.compileFloat(n);
            return expr(I1, this.bridge.compileEquals(condition.value, zero));
        } else if (condition.type == F64) {
            var zero = this.bridge.compileDouble(n);
            return expr(I1, this.bridge.compileEquals(condition.value, zero));
        } else {
            throw new MoyaError("Null check not yet implemented", condition.loc);
        }
    },
        
    compileConcat: function(lhs, rhs) {
        var left = this.valueToString(lhs);
        var right = this.valueToString(rhs);
        return expr(STRING, this.bridge.compileCall(this.concat, [left, right]));
    },

    compileBinary: function(lhs, rhs, op) {
        if (lhs.type.isNumber && rhs.type.isNumber) {
            if (lhs.type == rhs.type) {
                return expr(lhs.type, op(lhs.value, rhs.value));
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.bridge.castNumber(lhs.value, rhs.type.native);
                return expr(rhs.type, op(cast, rhs.value));
            } else {
                var cast = this.bridge.castNumber(rhs.value, lhs.type.native);
                return expr(lhs.type, op(lhs.value, cast));
            }
        } else {
            throw new MoyaError("Illegal types for binary operation", lhs.loc);
        }
    },

    compileComparison: function(lhs, rhs, op) {
        if (lhs.type.isNumber && rhs.type.isNumber) {
            if (lhs.type == rhs.type) {
                return expr(I1, op(lhs.value, rhs.value));
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.bridge.castNumber(lhs.value, rhs.type.native);
                return expr(I1, op(cast, rhs.value));
            } else {
                var cast = this.bridge.castNumber(rhs.value, lhs.type.native);
                return expr(I1, op(lhs.value, cast));
            }
        } else {
            throw new MoyaError("Illegal types for comparison", lhs.loc);
        }
    },
    
    compileIfBlock: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.bridge.createBlock('after');

        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then');
            var elseBlock = this.bridge.createBlock('else');

            this.bridge.compileConditionalJump(eq.value, ifBlock, elseBlock);
            this.bridge.setInsertBlock(ifBlock);
            this.compileBlock(pair.block);
            
            this.bridge.compileJump(afterBlock);

            this.bridge.setInsertBlock(elseBlock);
        }
        
        if (node.else) {
            this.compileBlock(node.else);
        }

        this.bridge.compileJump(afterBlock);
        this.bridge.setInsertBlock(afterBlock);
    },
    
    compileIfExpression: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.bridge.createBlock('result');
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then');
            elseBlock = this.bridge.createBlock('else');

            this.bridge.compileConditionalJump(eq.value, ifBlock, elseBlock);
            this.bridge.setInsertBlock(ifBlock);
            var result = this.compileNode(pair.block);
            if (!resultType) {
                resultType = result.type;
            } else if (result.type != resultType) {
                throw new MoyaError("Different types in expression", pair.block.loc);
            }
            this.bridge.compileJump(afterBlock);

            this.bridge.setInsertBlock(elseBlock);
            
            exprs.push(result.value);
            blocks.push(ifBlock);
        }
        
        if (node.else) {
            var result = this.compileNode(node.else);
            exprs.push(result.value);
            blocks.push(elseBlock);
        } else {
            var result = this.getTypeDefault(resultType);
            exprs.push(result.value);
            blocks.push(elseBlock);
        }

        this.bridge.compileJump(afterBlock);
        this.bridge.setInsertBlock(afterBlock);

        return expr(resultType, this.bridge.compilePhi(resultType.native, exprs, blocks));
    },

    compileLogic: function(left, right, isAnd) {
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        var one = this.bridge.compileInteger(1, 1);
        var zero = this.bridge.compileInteger(1, 0);
        
        var condition1 = this.compileNode(left);
        var eq1 = this.compileTest(condition1, 0);
        
        var startBlock = this.bridge.getInsertBlock();
        var thenBlock = this.bridge.createBlock('then');
        var failedBlock = this.bridge.createBlock('failed');
        var afterBlock = this.bridge.createBlock('after');

        if (isAnd) {
            this.bridge.compileConditionalJump(eq1.value, afterBlock, thenBlock);
        } else {
            this.bridge.compileConditionalJump(eq1.value, thenBlock, afterBlock);
        }

        this.bridge.setInsertBlock(thenBlock);
        var condition2 = this.compileNode(right);
        var eq2 = this.compileTest(condition2, 0);

        if (isAnd) {
            this.bridge.compileConditionalJump(eq2.value, failedBlock, afterBlock);
        } else {
            this.bridge.compileConditionalJump(eq2.value, afterBlock, failedBlock);
        }

        if (isAnd) {
            exprs.push(zero);
            exprs.push(one);
            exprs.push(zero);
        } else {
            exprs.push(one);
            exprs.push(zero);
            exprs.push(one);
        }
        
        blocks.push(startBlock);
        blocks.push(thenBlock);
        blocks.push(failedBlock);

        this.bridge.setInsertBlock(failedBlock);
        this.bridge.compileJump(afterBlock);
        this.bridge.setInsertBlock(afterBlock);

        return expr(I1, this.bridge.compilePhi(I1.native, exprs, blocks));
    },
                                            
    // *********************************************************************************************

    inferInteger: function(node, isStatement) {
        if (node.unit == 'i1') {
            return I1;
        } else if (node.unit == 'i8') {
            return I8;
        } else if (node.unit == 'i16') {
            return I16;
        } else if (node.unit == 'i32') {
            return I32;
        } else if (node.unit == 'i64') {
            return I64;
        } else if (node.unit == 'f') {
            return F32;
        } else if (node.unit == 'd') {
            return F64;
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            return I32;
        }
    },
        
    Integer: function(node, isStatement) {
        if (node.unit == 'i1') {
            var val = this.bridge.compileInteger(1, node.value);
            return expr(I1, val);
        } else if (node.unit == 'i8') {
            var val = this.bridge.compileInteger(8, node.value);
            return expr(I8, val);
        } else if (node.unit == 'i16') {
            var val = this.bridge.compileInteger(16, node.value);
            return expr(I16, val);
        } else if (node.unit == 'i32') {
            var val = this.bridge.compileInteger(32, node.value);
            return expr(I32, val);
        } else if (node.unit == 'i64') {
            var val = this.bridge.compileInteger(64, node.value);
            return expr(I64, val);
        } else if (node.unit == 'f') {
            var val = this.bridge.compileFloat(node.value);
            return expr(F32, val);
        } else if (node.unit == 'd') {
            var val = this.bridge.compileDouble(node.value);
            return expr(F64, val);
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            var val = this.bridge.compileInteger(32, node.value);
            return expr(I32, val);
        }
    },

    inferFloat: function(node, isStatement) {
        if (node.unit == 'f') {
            return F32;
        } else if (node.unit == 'd') {
            return F64;
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            return F64;
        }
    },
        
    Float: function(node, isStatement) {
        if (node.unit == 'f') {
            var val = this.bridge.compileFloat(node.value);
            return expr(F32, val);
        } else if (node.unit == 'd') {
            var val = this.bridge.compileDouble(node.value);
            return expr(F64, val);
        } else if (node.unit) {
        
        } else {
            var val = this.bridge.compileDouble(node.value);
            return expr(F64, val);
        }
    },
    
    inferString: function(node, isStatement) {
        return STRING;
    },
    
    String: function(node, isStatement) {
        return expr(STRING, this.bridge.declareString(node.string));
    },
    
    inferIdentifier: function(node, isStatement) {
        if (node.id == 'true' || node.id == 'false') {
            return I1;
        } else {
            var type = this.scope.lookupVariableType(node.id, node);
            if (type) {
                return type;
            } else {
                throw new MoyaError('"' + node.id + '" not found', node.loc);
            }
        }
    },
        
    Identifier: function(node, isStatement) {
        if (node.id == 'true') {
            var val = this.bridge.compileInteger(1, 1);
            return expr(I1, val);
        } else if (node.id == 'false') {
            var val = this.bridge.compileInteger(1, 0);
            return expr(I1, val);
        } else {
            var result = this.scope.lookupVariableValue(node.id, node);
            return result;
        }
    },

    inferGet: function(node, isStatement) {
        var lhs = this.inferNode(node.left);
        if (lhs instanceof ClassType) {
            var prop = lhs.properties[node.right];
            if (prop) {
                return prop.type;
            } else {
                throw new MoyaError('Property "' + node.right + '" not found', node.loc);
            }
        } else {
            throw new MoyaError('Property "' + node.right + '" not found', node.loc);
        }
    },
    
    Get: function(node, isStatement) {
        var lhs = this.compileNode(node.left);
        if (lhs.type instanceof ClassType) {
            var prop = lhs.type.properties[node.right];
            if (prop) {
                var offset = this.getInt(prop.offset);
                var variable = this.bridge.getPointer(lhs.value, [this.getInt(0), offset]);
                return expr(prop.type, this.bridge.loadVariable(variable, node.right));
            } else {
                throw new MoyaError('Property "' + node.right + '" not found', node.loc);
            }
        } else {
            throw new MoyaError('Property "' + node.right + '" not found', node.loc);
        }
    },
    
    inferAssignment: function(node, isStatement) {
        if (node.op == T.EqOp) {
            var rightType = this.inferNode(node.right);
            if (node.left.nick == "Identifier") {
                this.scope.declareType(node.left.id, rightType);
                return rightType;
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.scope.evaluateType(node.left.type);
                if (type == rightType) {
                    this.scope.declareType(node.left.name, type);
                    return type;
                } else {
                    throw new MoyaError("Invalid type", node.loc);
                }
            } else if (node.left.nick == "Get") {
                var leftType = this.inferNode(node.left.left);
                if (leftType instanceof ClassType) {
                    var propType = this.inferPropertyType(leftType, node.left.right);
                    if (propType) {
                        return propType;
                    } else {
                        throw new MoyaError('Property "' + node.left.right + '" not found', node.loc);
                    }
                } else {
                    throw new MoyaError('Property "' + node.left.right + '" not found', node.loc);
                }
                return rhs;
            } else {
                throw new MoyaError("Illegal assignment", node.loc);
            }
        } else {
            throw new MoyaError("Operator not yet supported", node.loc);
        }
    },
    
    Assignment: function(node, isStatement) {
        if (node.op == T.EqOp) {
            var rhs = this.compileNode(node.right);
            if (node.left.nick == "Identifier") {
                var type = this.scope.lookupVariableType(node.left.id);
                if (!type) {
                    type = rhs.type;
                }
                var cast = this.ensureCorrectType(rhs, type);
                return this.scope.assign(node.left.id, type, rhs);
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.scope.evaluateType(node.left.type);
                var cast = this.ensureCorrectType(rhs, type);
                return this.scope.assign(node.left.name, type, cast);
            } else if (node.left.nick == "Get") {
                var object = this.compileNode(node.left.left);
                if (object.type instanceof ClassType) {
                    var prop = object.type.properties[node.left.right];
                    if (prop) {
                        var offset = this.getInt(prop.offset);
                        var variable = this.bridge.getPointer(object.value, [this.getInt(0), offset]);
                        this.bridge.storeVariable(variable, rhs.value);
                    } else {
                        throw new MoyaError('Property "' + node.left.right + '" not found', node.loc);
                    }
                } else {
                    throw new MoyaError('Property "' + node.left.right + '" not found', node.loc);
                }
                return rhs;
            } else {
                throw new MoyaError("Illegal assignment", node.loc);
            }
        } else {
            throw new MoyaError("Operator not yet supported", node.loc);
        }
    },

    inferPrint: function(node, isStatement) {
        return STRING;
    },
    
    Print: function(node, isStatement) {
        var printed = this.compileNode(node.expr);
        var asString = this.valueToString(printed);
        this.bridge.compileCall(this.printString, [asString]);
    },

    Unary: function(node, isStatement) {
        var operandType = this.inferNode(node.operand);
        if (node.op == T.NegativeOp) {
            return operandType;
        } else if (node.op == T.NotOp) {
            return I1;
        } else {
            throw new MoyaError("Operator not yet implemented", node.loc);
        }
    },

    Unary: function(node, isStatement) {
        var operand = this.compileNode(node.operand);
        if (node.op == T.NegativeOp) {
            if (operand.type.isNumber) {
                return expr(operand.type, this.bridge.compileNegate(operand.value));
            } else {
                throw new MoyaError("Illegal type for negate operation", operand.loc);
            }
        } else if (node.op == T.NotOp) {
            return this.compileTest(operand, 0);
        } else {
            throw new MoyaError("Operator not yet implemented", node.loc);
        }
    },
    
    inferBinary: function(node, isStatement) {
        if (node.op == T.AndOp) {
            return I1;
        } else if (node.op == T.OrOp) {
            return I1;
        } else {
            var lhsType = this.inferNode(node.left);
            var rhsType = this.inferNode(node.right);
            if (node.op == T.AddOp) {
                return this.inferMath(lhsType, rhsType);
            } else if (node.op == T.SubtractOp) {
                return this.inferMath(lhsType, rhsType);
            } else if (node.op == T.MultiplyOp) {
                return this.inferMath(lhsType, rhsType);
            } else if (node.op == T.DivideOp) {
                return this.inferMath(lhsType, rhsType);
            } else if (node.op == T.ModOp) {
                return this.inferMath(lhsType, rhsType);
            } else if (node.op == T.PowOp) {
                return F64;
            } else if (node.op == T.ConcatOp) {
                return STRING;
            } else if (node.op == T.EqualsOp) {
                return I1;
            } else if (node.op == T.NotEqualsOp) {
                return I1;
            } else if (node.op == T.GreaterThanOp) {
                return I1;
            } else if (node.op == T.GreaterThanEqualsOp) {
                return I1;
            } else if (node.op == T.LessThanOp) {
                return I1;
            } else if (node.op == T.LessThanEqualsOp) {
                return I1;
            } else {
                throw new MoyaError("Operator not yet implemented", node.loc);
            }
        }
    },
                
    Binary: function(node, isStatement) {
        if (node.op == T.AndOp) {
            return this.compileLogic(node.left, node.right, true);
        } else if (node.op == T.OrOp) {
            return this.compileLogic(node.left, node.right, false);
        } else {
            var lhs = this.compileNode(node.left);
            var rhs = this.compileNode(node.right);
            if (node.op == T.AddOp) {
                if (lhs.type == STRING || rhs.type == STRING) {
                    return this.compileConcat(lhs, rhs);
                } else {
                    return this.compileBinary(lhs, rhs, this.bridge.compileAdd.bind(this.bridge));
                }
            } else if (node.op == T.SubtractOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileSubtract.bind(this.bridge));
            } else if (node.op == T.MultiplyOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileMultiply.bind(this.bridge));
            } else if (node.op == T.DivideOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileDivide.bind(this.bridge));
            } else if (node.op == T.ModOp) {
                return this.compileBinary(lhs, rhs, this.bridge.compileMod.bind(this.bridge));
            } else if (node.op == T.PowOp) {
                var left = this.castNumber(lhs, F64);
                var right = this.castNumber(rhs, F64);
                return expr(F64, this.bridge.compileCall(this.pow, [left, right]));
            } else if (node.op == T.ConcatOp) {
                return this.compileConcat(lhs, rhs);
            } else if (node.op == T.EqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileEquals.bind(this.bridge));
            } else if (node.op == T.NotEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileNotEquals.bind(this.bridge));
            } else if (node.op == T.GreaterThanOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileGreaterThan.bind(this.bridge));
            } else if (node.op == T.GreaterThanEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileGreaterThanEquals.bind(this.bridge));
            } else if (node.op == T.LessThanOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileLessThan.bind(this.bridge));
            } else if (node.op == T.LessThanEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileLessThanEquals.bind(this.bridge));
            } else {
                throw new MoyaError("Operator not yet implemented", node.loc);
            }
        }
    },

    inferCall: function(node, isStatement) {
        var callable = node.callable;

        var argTypes = []
        var argNodes = node.args;
        for (var i = 0, l = argNodes.length; i < l; ++i) {
            argTypes[i] = this.inferNode(argNodes[i].expr);
        }
        
        var inputTypes = [];
        // XXjoe Calculate input types

        if (callable.nick == "Identifier") {
            var func = this.matchFunction(callable.id, argTypes, inputTypes);
            if (func) {
                return func.returnType;
            } else {
                throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
            }
        } else if (callable.nick == "TypeId") {
            var classType = this.matchClass(callable.id, argTypes, inputTypes);
            if (classType) {
                return classType;
            } else {
                throw new MoyaError('Type "' + callable.id + '" not found', callable.loc);
            }
        } else {
            throw new MoyaError('Call type not yet implemented', node.loc);
        }
    },
    
    Call: function(node, isStatement) {
        var callable = node.callable;
        var inputTypeNodes = null;
        if (callable.nick == "TypeArguments") {
            inputTypeNodes = callable.args.slice();
            callable = inputTypeNodes.shift();
        }

        var inputTypes = [];
        if (inputTypeNodes) {
            for (var i = 0, l = inputTypeNodes.length; i < l; ++i) {
                inputTypes[i] = this.scope.evaluateType(inputTypeNodes[i]);
            }
        }
        
        if (callable.nick == "Identifier") {
            var argTypes = [];
            var argValues = []
            var argNodes = node.args;
            for (var i = 0, l = argNodes.length; i < l; ++i) {
                var arg = this.compileNode(argNodes[i].expr);
                argTypes[i] = arg.type;
                argValues[i] = arg.value;
            }
            
            var func = this.matchFunction(callable.id, argTypes, inputTypes);
            if (func) {
                if (argTypes.length < func.argTypes.length) {
                    for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
                        var defaultCall = func.argDefaults[i-argTypes.length];
                        argValues[i] = this.bridge.compileCall(defaultCall, []);
                    }
                }
                
                var ret = this.bridge.compileCall(func.native, argValues);
                return expr(func.returnType, ret);
            } else {
                throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
            }
        } else if (callable.nick == "TypeId") {
            var classType = this.matchClass(callable.id, argTypes, inputTypes);
            if (classType) {
                return expr(classType, this.bridge.compileCall(classType.consFunc, []));
            } else {
                throw new MoyaError('Type "' + callable.id + '" not found', callable.loc);
            }
        } else {
            throw new MoyaError('Call type not yet implemented', node.loc);
        }
    },
        
    inferReturn: function(node, isStatement) {
        var type = this.inferNode(node.expr);
        if (!this.returnType) {
            this.returnType = type;
        } else if (type != this.returnType) {
            throw new MoyaError('Return types don\'t match', node.loc);
        }
    },
    
    Return: function(node, isStatement) {
        var value = this.compileNode(node.expr);
        var expectedType = this.scope.realFunc.returnType;
        if (!expectedType) {
            throw new MoyaError("Unexpected return", node.loc);
        } else {
            var cast = this.ensureCorrectType(value, expectedType);
            this.bridge.compileReturn(cast.value);
        }
    },
    
    inferIf: function(node, isStatement) {
        var pairs = node.transforms.pairs;
        if (isStatement) {
            for (var i = 0, l = pairs.length; i < l; ++i) {
                this.inferBlock(pairs[i].block);
            }
            
            if (node.else) {
                this.inferBlock(node.else);
            }
        } else {
            var resultType;
            for (var i = 0, l = pairs.length; i < l; ++i) {
                var pair = pairs[i];
                var result = this.inferNode(pair.block);
                if (!resultType) {
                    resultType = result.type;
                } else if (result.type != resultType) {
                    throw new MoyaError("Different types in expression", pair.block.loc);
                }
            }
            
            if (node.else) {
                var result = this.inferNode(node.else);
                if (!resultType) {
                    resultType = result.type;
                } else if (result.type != resultType) {
                    throw new MoyaError("Different types in expression", pair.block.loc);
                }
            }
            
            return resultType;
        }
    },
    
    If: function(node, isStatement) {
        if (isStatement) {
            return this.compileIfBlock(node);
        } else {
            return this.compileIfExpression(node);
        }
    },
    
    inferWhile: function(node, isStatement) {
        this.inferBlock(node.block);
    },
    
    While: function(node, isStatement) {
        var testBlock = this.bridge.createBlock('test');
        var loopBlock = this.bridge.createBlock('loop');
        var afterBlock = this.bridge.createBlock('after');

        this.bridge.compileJump(testBlock);

        this.bridge.setInsertBlock(testBlock);
        var condition = this.compileNode(node.clause);
        var eq = this.compileTest(condition, 1);
        this.bridge.compileConditionalJump(eq.value, loopBlock, afterBlock);
        
        this.bridge.setInsertBlock(loopBlock);
        this.compileBlock(node.block);
        this.bridge.compileJump(testBlock);
        
        this.bridge.setInsertBlock(afterBlock);
    },
};
