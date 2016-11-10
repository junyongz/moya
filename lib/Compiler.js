
var fool = require('fool');
var T = require('./syntax');
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    SequenceType = types.SequenceType,
    FunctionType = types.FunctionType,
    ClassType = types.ClassType,
    VOID = types.VOID,
    I1 = types.I1,
    I8 = types.I8,
    I16 = types.I16,
    I32 = types.I32,
    I64 = types.I64,
    F32 = types.F32,
    F64 = types.F64,
    STRING = types.STRING,
    VTABLEPOINTER = types.VTABLEPOINTER;
var scopes = require('./scope'),
    ModuleScope = scopes.ModuleScope,
    FunctionScope = scopes.FunctionScope,
    ClassScope = scopes.ClassScope,
    FunctionStaticScope = scopes.FunctionStaticScope,
    ClassStaticScope = scopes.ClassStaticScope;
var utils = require('./utils'),
    expr = utils.expr,
    MoyaError = utils.MoyaError;
    
var moyallvm = require('../moyallvm/build/Release/moyallvm');

// *************************************************************************************************

exports.compileModule = function(name, ast, debugMode) {
    var compiler = new Compiler();
    compiler.compileModule(name, ast, debugMode);
}

// *************************************************************************************************

function GenericFunction(name) {
    this.name = name;
    this.inputTypes = [];
    this.returns = null;
    this.ast = null;
    this.minimumArgCount = 0;
    this.isConstructor = false;
    this.class = null;
}

GenericFunction.prototype = {
}

// *************************************************************************************************

function RealFunction(name, inputTypes, argTypes, returnType) {
    this.name = name;
    this.inputTypes = inputTypes;
    this.argTypes = argTypes;
    this.returnType = returnType;
    this.generic = null;
    this.native = null;
    this.nativeType = null;
}

RealFunction.prototype = {
    
}

// *************************************************************************************************

function GenericClass(name) {
    this.name = name;
    this.inputTypes = [];
    this.props = [];
    this.methods = [];
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
    
    mergeInputTypes: function(typeMap, typeList) {
        var mergedList = typeList.slice();
        for (var i = 0, l = this.inputTypes.length; i < l; ++i) {
            var typeName = this.inputTypes[i];
            if (typeName in typeMap) {
                mergedList[i] = typeMap[typeName];
            }
        }
        return mergedList;
    },

    lookupMethod: function(name, cb) {
        for (var i = 0, l = this.methods.length; i < l; ++i) {
            var func = this.methods[i];
            if (func.name == name) {
                var ret = cb(func);
                if (ret) {
                    return ret;
                }
            }
        }
    },
}

// *************************************************************************************************

function Compiler() {
    this.bridge = new moyallvm.CompilerBridge();
    this.typeCache = {};
    this.functionCache = {};
    this.functionQueue = [];
    this.classQueue = [];
    this.returns = [];
    this.scope = null;
    
    VOID.native = this.bridge.getType(0);
    I1.native = this.bridge.getType(1);
    I8.native = this.bridge.getType(2);
    I16.native = this.bridge.getType(3);
    I32.native = this.bridge.getType(4);
    I64.native = this.bridge.getType(5);
    F32.native = this.bridge.getType(6);
    F64.native = this.bridge.getType(7);
    STRING.native = this.bridge.getType(8);
    VTABLEPOINTER.native = this.bridge.getType(9);
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
        return scope;
    },
    
    popScope: function() {
        var oldScope = this.scope;
        var previous = oldScope.previous
        this.scope.previous = null;
        this.scope = previous;
        return oldScope;
    },

    markReturned: function(didReturn) {
        if (this.returns.length) {
            this.returns[this.returns.length-1] = didReturn;
        }
    },
    
    compileModule: function(name, ast, debugMode) {
        var moduleScope = new ModuleScope(this.typeMap);
        this.pushScope(moduleScope);
        
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
            var cls = this.declareClass(classes[i]);
            this.scope.declareClass(cls);
        }
                
        for (var i = 0, l = funcs.length; i < l; ++i) {
            var func = this.declareFunction(funcs[i]);
            this.scope.declareFunction(func);
        }

        var main = this.matchFunctionCall('main', [], []);
        
        while (this.classQueue.length || this.functionQueue.length) {
            while (this.functionQueue.length) {
                var info = this.functionQueue.shift();
                this.compileFunction(info.func, info.ownerType, info.argVariables);
            }
            
            while (this.classQueue.length) {
                var info = this.classQueue.shift();
                this.compileClass(info.type, info.self, info.propertyMap);
            }
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

        var hasConstructors = false;
        var nodes = classDecl.body.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.nick == 'Property') {
                cls.props.push({name: node.name, type: node.type, body: node.body});
            } else if (node.nick == 'FunctionDecl') {
                if (node.id.nick == 'TypeId' && node.id.id == 'This') {
                    var func = this.declareConstructor(node, cls);
                    this.scope.declareFunction(func);
                    hasConstructors = true;
                } else {
                    var func = this.declareFunction(node, cls);
                    cls.methods.push(func);
                }
            } else if (node.nick == 'TypeAssignment') {
                throw new MoyaError('Default constructors NYI', node.loc);
            } else if (node.nick == 'Identifier') {
                throw new MoyaError('Illegal property declaration', node.loc);
            }
        }
            
        if (!hasConstructors) {
            var func = T.parseEmptyFuncDecl(cls.loc);
            var cons = this.declareConstructor(func, cls);
            this.scope.declareFunction(cons);
        }
        
        return cls;
    },

    declareConstructor: function(fnDecl, genericClass) {
        var func = new GenericFunction(genericClass.name);
        func.ast = fnDecl;
        func.class = genericClass;
        func.inputTypes = genericClass.inputTypes.slice();
        func.isConstructor = true;
        
        var argItems = fnDecl.args.items;
        var minimumArgCount = -1;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            if (argItem.defaultValue) {
                minimumArgCount = i;
            } else if (minimumArgCount >= 0) {
                throw new MoyaError("Default value required", argItem.loc);
            }
        }
        func.minimumArgCount = minimumArgCount == -1 ? argItems.length : minimumArgCount;
                        
        return func;
    },
    
    matchClass: function(name, argTypes, inputTypes) {
        return this.scope.lookupClass(name, function(genericClass) {
            // Make sure that input types match
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
        var classScope = this.pushScope(new ClassStaticScope(classType, propertyMap));
        var funcScope = this.pushScope(new FunctionStaticScope());
        
        for (var i = 0, l = inputTypes.length; i < l; ++i) {
            var typeVarName = genericClass.inputTypes[i];
            funcScope.declareType(typeVarName, inputTypes[i]);
        }
        
        for (var i = 0, l = genericClass.props.length; i < l; ++i) {
            var genericProp = genericClass.props[i];
            if (genericProp.type) {
                var prop = classType.addProperty(genericProp.name);
                prop.type = funcScope.evaluateType(genericProp.type);
                propertyMap[genericProp.name] = genericProp.body;
            } else {
                var prop = classType.addProperty(genericProp.name);
                propertyMap[genericProp.name] = genericProp.body;
            }
        }

        // Second pass - infer property types and determine order to initialize them
        var structTypes = [VTABLEPOINTER.native];
        for (var propertyName in classType.properties) {
            var prop = classType.properties[propertyName]
            classScope.lookupVariableType(propertyName);
            prop.offset = structTypes.length;
            structTypes.push(prop.type.native);
        }

        this.popScope();
        this.popScope();
        
        classType.size = this.bridge.setStructBody(classType.nativeStruct, structTypes);

        var funcAndArgs = this.bridge.declareFunction(key+'_INIT',
                                                    VOID.native, [classType.native], ['self']);
        classType.initFunc = funcAndArgs.shift();
        var self = funcAndArgs.shift();
        
        this.classQueue.push({type: classType, self: self,
                              propertyMap: classScope.orderedProperties});
        
        return classType;
    },

    compileClass: function(classType, self, propertyMap) {
        var classScope = new ClassScope(classType);
        this.pushScope(classScope);
        classScope.self = self;

        var methods = [];
        for (var i = 0, l = classType.methods.length; i < l; ++i) {
            methods[i] = classType.methods[i].native;
        }
        var methodTable = this.bridge.createClassTable(classType.name + '_FUNCS', methods);

        this.compileClassInit(classType, self, propertyMap, methodTable);

        this.popScope();
    },
    
    compileClassInit: function(classType, self, propertyMap, methodTable) {
        var block = this.bridge.createBlock('entry', classType.initFunc);
        this.bridge.setInsertBlock(block);

        var offset = this.getInt(0);
        var variable = this.bridge.getPointer(self, [this.getInt(0), offset]);
        var castTable = this.bridge.compileBitcast(methodTable, VTABLEPOINTER.native);
        this.bridge.storeVariable(variable, castTable);

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

    // *********************************************************************************************
                
    declareFunction: function(fnDecl) {
        var name = fnDecl.id;
        var inputTypeNodes = null;
        if (name.nick == "TypeArguments") {
            inputTypeNodes = name.args.slice();
            name = inputTypeNodes.shift().id;
        } else {
            name = name.id;
        }

        var func = new GenericFunction(name);
        func.ast = fnDecl;
                
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
        
        var argItems = fnDecl.args.items;
        var minimumArgCount = -1;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            if (argItem.defaultValue) {
                minimumArgCount = i;
            } else if (minimumArgCount > 0) {
                throw new MoyaError("Default value required", argItem.loc);
            }
        }
        
        func.minimumArgCount = minimumArgCount == -1 ? argItems.length : minimumArgCount;
                
        if (fnDecl.returns) {
            func.returns = fnDecl.returns;
        }
        
        return func;
    },

    keyForCall: function(name, argTypes, inputTypes) {
        var key = name;
        for (var i = 0, l = inputTypes.length; i < l; ++i) {
            key += '(' + inputTypes[i].toString() + ')';
        }
        key += '(';
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            key += argTypes[i].toString() + ',';
        }
        key += ')';
        return key;
    },
    
    matchFunctionCall: function(name, argTypes, inputTypes) {
        var key = this.keyForCall(name, argTypes, inputTypes);
        var realFunc = this.functionCache[key];
        if (realFunc) {
            return realFunc;
        }

        return this.scope.lookupFunction(name, function(genericFunc) {
            var funcScope = this.pushScope(new FunctionStaticScope());
            var realFunc = this.matchCall(genericFunc, argTypes, inputTypes);
            this.popScope(funcScope);
            
            if (realFunc) {
                if (!realFunc.native) {
                    if (realFunc.generic.isConstructor && !realFunc.classType) {
                        var genericClass = realFunc.generic.class;
                        var mergedInputs = genericClass.mergeInputTypes(realFunc.inputTypes, inputTypes);
                        realFunc.classType = this.precompileClass(genericClass, mergedInputs);
                    }
                    this.precompileFunction(realFunc);
                }

                this.functionCache[key] = realFunc;
                return realFunc;
            }
        }.bind(this));
    },

    matchMethodCall: function(classType, name, argTypes, inputTypes, scope) {
        var key = classType.keyForMethod(name, argTypes, inputTypes);
        var realFunc = this.functionCache[key];
        if (realFunc) {
            return realFunc;
        }

        var classScope = new ClassScope(classType);

        return classType.class.lookupMethod(name, function(genericFunc) {
            this.pushScope(classScope);
            var funcScope = this.pushScope(new FunctionStaticScope());
            var realFunc = this.matchCall(genericFunc, argTypes, inputTypes);
            this.popScope();
            this.popScope();

            if (realFunc) {
                if (!realFunc.native) {
                    this.precompileFunction(realFunc, classType);
                }

                classType.addMethod(realFunc);
                
                this.functionCache[key] = realFunc;
                return realFunc;
            }
        }.bind(this));
    },

    matchCall: function(func, argTypes, inputTypes) {
        var args = func.ast.args.items;
        if (argTypes.length > args.length || argTypes.length < func.minimumArgCount) {
            return null;
        }
        if (inputTypes.length > func.inputTypes.length) {
            return null;
        }

        argTypes = argTypes.slice();
        
        for (var i = 0, l = func.inputTypes.length; i < l; ++i) {
            var typeVarName = func.inputTypes[i];
            this.scope.declareType(typeVarName, inputTypes[i]);
        }
        
        // Define type arguments by pulling them from actual arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var arg = args[i];
            var argType = argTypes[i];
            if (arg.type) {
                this.scope.expandType(arg.type, argTypes[i]);
            }
        }
        
        for (var i = argTypes.length, l = args.length; i < l; ++i) {
            var arg = args[i];
            if (arg.type && arg.defaultValue) {
                var expectedType = this.inferNode(arg.defaultValue);
                this.scope.expandType(arg.type, expectedType);
            }
        }

        // Evaluate all type arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argType = argTypes[i];
            var arg = args[i];
            if (arg.type) {
                var expectedType = this.scope.evaluateType(arg.type);
                if (!expectedType || !argType.isTypeOrSubclass(expectedType)) {
                    return null;
                }
            }
        }
        
        // Fill in default values for missing arguments
        for (var i = argTypes.length, l = args.length; i < l; ++i) {
            var arg = args[i];
            var expectedType = null;
            if (arg.type) {
                expectedType = this.scope.evaluateType(arg.type);
            } else if (arg.defaultValue) {
                expectedType = this.inferNode(arg.defaultValue);
            }
            
            if (!expectedType) {
                throw new MoyaError("Unknown type for argument", arg.loc);
            }
            
            argTypes.push(expectedType);
        }
        
        // Ensure all type arguments are defined
        for (var name in this.scope.localTypes) {
            if (!this.scope.localTypes[name]) {
                return null;
            }
        }
        
        var returnType = null;
        if (func.returns) {
            returnType = this.scope.evaluateType(func.returns);
        } else if (func.ast.body) {
            var argItems = func.ast.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                var argType = argTypes[i];
                this.scope.storeVariableType(argItem.innerName, argType);
            }
            
            this.inferBlock(func.ast.body);
            
            returnType = this.scope.returnType;
        }

        var realFunc = new RealFunction(func.name, this.scope.localTypes, argTypes, returnType);
        realFunc.generic = func;
        return realFunc;
    },
    
    precompileFunction: function(realFunc, ownerType) {
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
                var defaultFunc = this.precompileDefaultGetter(arg.innerName, nativeArgTypes[i]);
                argDefaults.push(defaultFunc);
            }
        }

        if (ownerType) {
            nativeArgTypes.unshift(ownerType.native);
            argNames.unshift('this');
        }
        
        var nativeReturnType = null;
        if (genericFunc.isConstructor) {
            realFunc.returnType = realFunc.classType;
            nativeReturnType = realFunc.classType.native;
        } else {
            nativeReturnType = realFunc.returnType ? realFunc.returnType.native : VOID.native;
        }
        var funcAndArgs = this.bridge.declareFunction(realFunc.name, nativeReturnType,
                                                      nativeArgTypes, argNames);
        realFunc.native = funcAndArgs.shift();
        realFunc.nativeType = this.bridge.getFunctionType(realFunc.native);
        
        this.functionQueue.push({func: realFunc, ownerType: ownerType, argVariables: funcAndArgs});
    },
        
    compileFunction: function(realFunc, ownerType, argVariables) {
        var block = this.bridge.createBlock("entry", realFunc.native);
        this.bridge.setInsertBlock(block);
        
        if (realFunc.classType) {
            var classType = realFunc.classType;
            
            var classScope = new ClassScope(classType);
            this.pushScope(classScope);

            // XXXjoe Ask LLVM for pointer size
            var ftableSize = 8;
            
            var raw = this.bridge.compileCall(this.newObject,
                                              [this.getInt(classType.size+ftableSize)]);
            var castSelf = this.bridge.compileBitcast(raw, classType.native);
            classScope.self = castSelf;

            this.bridge.compileCall(classType.initFunc, [castSelf]);
        } else if (ownerType) {
            var classScope = new ClassScope(ownerType);
            classScope.self = argVariables[0];
            this.pushScope(classScope);
        }
        
        var scope = new FunctionScope(realFunc);
        this.pushScope(scope);
        
        // Store type arguments on scope
        for (var typeName in realFunc.inputTypes) {
            scope.localTypes[typeName] = realFunc.inputTypes[typeName];
        }

        if (ownerType) {
            var thisVar = argVariables.shift();
            this.scope.storeVariable('this', expr(ownerType, thisVar));
        }
        
        // Store arguments on scope
        var fnDecl = realFunc.generic.ast;
        var argItems = fnDecl.args.items;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            var argName = argItem.innerName;
            var argType = realFunc.argTypes[i];
            var argVar = argVariables[i];
            this.scope.storeVariable(argName, expr(argType, argVar));
        }
        
        var didReturn = this.compileBlock(fnDecl.body);

        this.popScope();
        
        var block = this.bridge.getInsertBlock();
        if (this.bridge.isBlockEmpty(block)) {
            this.bridge.compileReturn();
        }
        
        if (realFunc.classType) {
            var classScope = this.popScope();
            this.bridge.compileReturn(classScope.self);
        } else {
            if (ownerType) {
                this.popScope();
            }
            
            if (!didReturn) {
                if (realFunc.returnType) {
                    throw new MoyaError("Return required", fnDecl.loc);
                } else {
                    this.bridge.compileReturn();
                }
            }
        }
        
        var minArgCount = realFunc.generic.minimumArgCount;
        for (var i = 0, l = realFunc.argDefaults.length; i < l; ++i) {
            var defaultFunc = realFunc.argDefaults[i];
            var defaultNode = argItems[i+minArgCount].defaultValue;
            this.compileDefaultGetter(defaultFunc, defaultNode);
        }
    },

    precompileDefaultGetter: function(name, type) {
        var funcAndArgs = this.bridge.declareFunction(name+"_DEFAULT", type, [], []);
        return funcAndArgs.shift();
    },
    
    compileDefaultGetter: function(defaultFunc, defaultValue) {
        var block = this.bridge.createBlock("entry", defaultFunc);
        this.bridge.setInsertBlock(block);

        var result = this.compileNode(defaultValue);
        this.bridge.compileReturn(result.value);
    },
    
    // *********************************************************************************************

    inferNode: function(node, isStatement) {
        return this['infer'+node.nick](node, isStatement);
    },

    inferBlock: function(block) {
        var nodes = block.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            this.inferNode(nodes[i], true);
        }
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
        if (block){
            var nodes = block.items;
            this.returns.push(false);
            for (var i = 0, l = nodes.length; i < l; ++i) {
                this.compileNode(nodes[i], true);
            }
            var didReturn = this.returns.pop();
            this.markReturned(didReturn);
            
            return didReturn;
        } else {
            return false;
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
            return this.bridge.declareString(val.type.name);
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

    compileCall: function(name, object, argNodes, inputTypeNodes, node) {
        var inputTypes = [];
        if (inputTypeNodes) {
            for (var i = 0, l = inputTypeNodes.length; i < l; ++i) {
                inputTypes[i] = this.scope.evaluateType(inputTypeNodes[i]);
            }
        }

        var argTypes = [];
        var argValues = []
        for (var i = 0, l = argNodes.length; i < l; ++i) {
            var arg = this.compileNode(argNodes[i].expr);
            argTypes[i] = arg.type;
            argValues[i] = arg.value;
        }
        
        if (!object) {
            object = this.scope.getThis();
        }
        
        var func = object ? this.matchMethodCall(object.type, name, argTypes, inputTypes) : null;
        if (func) {
            if (argTypes.length < func.argTypes.length) {
                for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
                    var defaultCall = func.argDefaults[i-argTypes.length];
                    argValues[i] = this.bridge.compileCall(defaultCall, []);
                }
            }
            
            argValues.unshift(object.value);
            
            var tableVar = this.bridge.getPointer(object.value, [this.getInt(0), this.getInt(0)]);
            var table = this.bridge.loadVariable(tableVar, "table");
            var methodVar = this.bridge.getPointer(table, [this.getInt(func.methodOffset)]);
            var method = this.bridge.loadVariable(methodVar, name+".func");
            var castMethod = this.bridge.compileBitcast(method, func.nativeType);
            
            var ret = this.bridge.compileCall(castMethod, argValues);
            return expr(func.returnType, ret);
        } else {
            var func = this.matchFunctionCall(name, argTypes, inputTypes);
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
                throw new MoyaError('Function "' + name + '" not found', node.loc);
            }
        }
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
        
    compileConcat: function(lhs, rhs, node) {
        var left = this.valueToString(lhs);
        var right = this.valueToString(rhs);
        return expr(STRING, this.bridge.compileCall(this.concat, [left, right]));
    },

    compileBinary: function(lhs, rhs, op, node) {
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
            throw new MoyaError("Illegal types for binary operation", node.loc);
        }
    },

    compileComparison: function(lhs, rhs, op, node) {
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
            throw new MoyaError("Illegal types for comparison", node.loc);
        }
    },
    
    compileIfBlock: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.bridge.createBlock('after');
        
        var startReturnCount = pairs.length + 1;
        var returnCount = startReturnCount;
        
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.bridge.createBlock('then');
            var elseBlock = this.bridge.createBlock('else');

            this.bridge.compileConditionalJump(eq.value, ifBlock, elseBlock);
            this.bridge.setInsertBlock(ifBlock);
            var didReturn = this.compileBlock(pair.block);
            
            if (didReturn) {
                --returnCount;
            } else {
                this.bridge.compileJump(afterBlock);
            }

            this.bridge.setInsertBlock(elseBlock);
        }
        
        if (node.else) {
            var didReturn = this.compileBlock(node.else);
            if (didReturn) {
                --returnCount;
            } else {
                this.bridge.compileJump(afterBlock);
            }
        } else {
            this.bridge.compileJump(afterBlock);
        }
        
        if (startReturnCount != returnCount) {
            this.markReturned(!returnCount);
        }
        
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

    inferSet: function(block) {
        var nodes = block.items;
        var inferredType = null;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            inferredType = this.inferNode(nodes[i], true);
        }
        return inferredType;
    },

    Set: function(block, isStatement) {
        var nodes = block.items;
        if (nodes.length == 1) {
            return this.compileNode(nodes[0]);
        } else {
            return this.compileBlock(block);
        }
    },
            
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
        } else if (node.id == 'this') {
            var thiss = this.scope.getThis();
            if (thiss) {
                return thiss.type;
            } else {
                throw new MoyaError('"this" not relevant here', node.loc);
            }
        } else {
            var type = this.scope.lookupVariableType(node.id);
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
        } else if (node.id == 'this') {
            var thiss = this.scope.getThis();
            if (thiss) {
                return thiss;
            } else {
                throw new MoyaError('"this" not relevant here', node.loc);
            }
        } else {
            var result = this.scope.lookupVariableValue(node.id);
            if (result) {
                return result;
            } else {
                throw new MoyaError('"' + node.id + '" not found', node.loc);
            }
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
                var classScope = this.scope.isProperty(node.left.id);
                if (!classScope) {
                    this.scope.storeVariableType(node.left.id, rightType);
                }
                return rightType;
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.scope.evaluateType(node.left.type);
                this.scope.storeVariableType(node.left.name, type);
                return type;
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
                var classScope = this.scope.isProperty(node.left.id);
                if (classScope) {
                    var prop = classScope.classType.properties[node.left.id];
                    if (prop) {
                        var offset = this.getInt(prop.offset);
                        var variable = this.bridge.getPointer(classScope.self, [this.getInt(0), offset]);

                        var cast = this.ensureCorrectType(rhs, prop.type);
                        this.bridge.storeVariable(variable, cast.value);
                    }
                } else {
                    var type = this.scope.lookupVariableType(node.left.id);
                    if (!type) {
                        type = rhs.type;
                    }
                    var cast = this.ensureCorrectType(rhs, type);
                    return this.scope.storeVariable(node.left.id, cast);
                }
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.scope.evaluateType(node.left.type);
                var cast = this.ensureCorrectType(rhs, type);
                return this.scope.storeVariable(node.left.name, cast);
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
        if (!printed.type) {
            throw new MoyaError("Unable to print value", node.expr.loc);
        }
        
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
                throw new MoyaError("Illegal type for negate operation", node.loc);
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
                    var op = this.bridge.compileAdd.bind(this.bridge);
                    return this.compileBinary(lhs, rhs, op, node);
                }
            } else if (node.op == T.SubtractOp) {
                var op = this.bridge.compileSubtract.bind(this.bridge);
                return this.compileBinary(lhs, rhs, op, node);
            } else if (node.op == T.MultiplyOp) {
                var op = this.bridge.compileMultiply.bind(this.bridge);
                return this.compileBinary(lhs, rhs, op, node);
            } else if (node.op == T.DivideOp) {
                var op = this.bridge.compileDivide.bind(this.bridge);
                return this.compileBinary(lhs, rhs, op, node);
            } else if (node.op == T.ModOp) {
                var op = this.bridge.compileMod.bind(this.bridge);
                return this.compileBinary(lhs, rhs, op, node);
            } else if (node.op == T.PowOp) {
                var left = this.castNumber(lhs, F64);
                var right = this.castNumber(rhs, F64);
                return expr(F64, this.bridge.compileCall(this.pow, [left, right]));
            } else if (node.op == T.ConcatOp) {
                return this.compileConcat(lhs, rhs);
            } else if (node.op == T.EqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileEquals.bind(this.bridge), node);
            } else if (node.op == T.NotEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileNotEquals.bind(this.bridge), node);
            } else if (node.op == T.GreaterThanOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileGreaterThan.bind(this.bridge), node);
            } else if (node.op == T.GreaterThanEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileGreaterThanEquals.bind(this.bridge), node);
            } else if (node.op == T.LessThanOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileLessThan.bind(this.bridge), node);
            } else if (node.op == T.LessThanEqualsOp) {
                return this.compileComparison(lhs, rhs, this.bridge.compileLessThanEquals.bind(this.bridge), node);
            } else {
                throw new MoyaError("Operator not yet implemented", node.loc);
            }
        }
    },

    inferCall: function(node, isStatement) {
        var callable = node.callable;
        var inputTypeNodes = null;
        if (callable.nick == "TypeArguments") {
            inputTypeNodes = callable.args.slice();
            callable = inputTypeNodes.shift();
        }

        var argTypes = []
        var argNodes = node.args;
        for (var i = 0, l = argNodes.length; i < l; ++i) {
            argTypes[i] = this.inferNode(argNodes[i].expr);
        }
        
        var inputTypes = [];
        if (inputTypeNodes) {
            for (var i = 0, l = inputTypeNodes.length; i < l; ++i) {
                inputTypes[i] = this.scope.evaluateType(inputTypeNodes[i]);
            }
        }

        if (callable.nick == "Identifier") {
            var thiss = this.scope.getThis();
            var func = thiss
                ? this.matchMethodCall(thiss.type, callable.id, argTypes, inputTypes)
                : null;
            if (func) {
                return func.returnType;
            } else {
                var func = this.matchFunctionCall(callable.id, argTypes, inputTypes);
                if (func) {
                    return func.returnType;
                } else {
                    throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
                }
            }
        } else if (callable.nick == "TypeId") {
            var func = this.matchFunctionCall(callable.id, argTypes, inputTypes);
            if (func) {
                return func.returnType;
            } else {
                throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
            }
        } else if (callable.nick == "Get") {
            var lhsType = this.inferNode(callable.left);
            var func = this.matchMethodCall(lhsType, callable.right, argTypes, inputTypes)
            if (func) {
                return func.returnType;
            } else {
                throw new MoyaError('Function "' + callable.right + '" not found', node.loc);
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
        
        if (callable.nick == "Identifier") {
            return this.compileCall(callable.id, null, node.args, inputTypeNodes, node);
        } else if (callable.nick == "TypeId") {
            return this.compileCall(callable.id, null, node.args, inputTypeNodes, node);
        } else if (callable.nick == "Get") {
            var lhs = this.compileNode(callable.left);
            return this.compileCall(callable.right, lhs, node.args, inputTypeNodes, node);
        } else {
            throw new MoyaError('Call type not yet implemented', node.loc);
        }
    },
        
    inferReturn: function(node, isStatement) {
        var type = this.inferNode(node.expr);
        if (!this.scope.returnType) {
            this.scope.returnType = type;
        } else if (type != this.scope.returnType) {
            throw new MoyaError('Return types don\'t match', node.loc);
        }
    },
    
    Return: function(node, isStatement) {
        this.markReturned(true);
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
        var didReturn = this.compileBlock(node.block);
        if (!didReturn) {
            this.bridge.compileJump(testBlock);
        } else {
            this.markReturned(false);
        }
        
        this.bridge.setInsertBlock(afterBlock);
    },
};
