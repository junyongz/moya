
var fool = require('fool');
var fs = require('fs');
var path = require('path');
var T = require('./syntax');
var llvm = require('./llvm');
var parser = require('./grammar').parser;
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    FunctionType = types.FunctionType,
    ClassType = types.ClassType,
    Symbol = types.Symbol,
    GenericClass = types.GenericClass,
    builtinTypes = types.builtinTypes,
    PointerType = types.PointerType,
    VOID = types.VOID,
    BOOL = types.BOOL,
    I1 = types.I1,
    I8 = types.I8,
    I16 = types.I16,
    I32 = types.I32,
    I64 = types.I64,
    F32 = types.F32,
    F64 = types.F64,
    CHAR = types.CHAR,
    STRING = types.STRING,
    POINTER = types.POINTER,
    VTABLEPOINTER = types.VTABLEPOINTER;
var Module = require('./module').Module;
var scopes = require('./scope'),
    ModuleScope = scopes.ModuleScope,
    FunctionScope = scopes.FunctionScope,
    ClassScope = scopes.ClassScope,
    FunctionStaticScope = scopes.FunctionStaticScope,
    ClassStaticScope = scopes.ClassStaticScope;
var utils = require('./utils'),
    expr = utils.expr,
    MoyaError = utils.MoyaError;

// *************************************************************************************************

const fileExt = '.moya';
const nameSep = '_';
const llvmPrefix = 'MOYA:';

const builtinModuleNames = [
    'moya',
    'List',
];

// *************************************************************************************************

function GenericFunction(name) {
    this.name = name;
    this.loc = null;
    this.symbolNames = [];
    this.args = null;
    this.returns = null;
    this.minimumArgCount = 0;
    this.isConstructor = false;
    this.isCFunction = false;
    this.module = null;
    this.class = null;
}

GenericFunction.prototype = {
    get qualifiedName() {
        return (this.class ? this.class.qualifiedName : this.module.name) + ':' + this.name;
    },
    
    keyForCall: function(argTypes, argSymbols) {
        var key = this.qualifiedName;
        for (var i = 0, l = argSymbols.length; i < l; ++i) {
            key += '(' + argSymbols[i].toString() + ')';
        }
        key += '(';
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            key += argTypes[i].toString() + ',';
        }
        key += ')';
        return key;
    },
};

// *************************************************************************************************

function RealFunction(func, argSymbols, argTypes, returnType) {
    this.name = func.name;
    this.generic = func;
    this.argSymbols = argSymbols;
    this.argTypes = argTypes;
    this.returnType = returnType;
    this.methodOffset = -1;
    this.native = null;
    this.nativeType = null;
}

RealFunction.prototype = {
    signatureKey: function() {
        var key = this.name;
        for (var i = 0, l = this.argSymbols.length; i < l; ++i) {
            key += '(' + this.argSymbols[i].toString() + ')';
        }
        key += '(';
        for (var i = 0, l = this.argTypes.length; i < l; ++i) {
            key += this.argTypes[i].toString() + ',';
        }
        key += ')';
        return key;
    },
}

// *************************************************************************************************

function Compiler(debugMode) {
    this.moduleCache = {};
    this.typeCache = {};
    this.functionCache = {};
    this.functionQueue = [];
    this.classQueue = [];
    this.returns = [];
    this.builtinModules = null;
    this.scope = null;
    this.debugMode = debugMode;
    
    this.searchPaths = process.env['MOYAPATH'].split(path.delimiter);
            
    for (var name in builtinTypes) {
        var type = builtinTypes[name];
        var key = type.class.keyWithSymbols([]);
        this.typeCache[key] = type;
    }
}
exports.Compiler = Compiler;

Compiler.prototype = {
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

    typeWithPointers: function(type, pointers) {
        var pointerType = type.withPointers(pointers);
        var key = pointerType.class.keyWithSymbols([]);
        this.typeCache[key] = pointerType;
        return pointerType;
    },

    printSourceError: function(message, loc, sourcePath, source) {
        if (!sourcePath) {
            sourcePath = 'no file';
        }

        if (loc) {
            var lineNo = loc ? loc.first_line : '0';
            var line = source.split('\n')[lineNo-1];
            var indent = ' '.repeat(4+loc.first_column);
            var carets;
            if (loc.last_line > loc.first_line) {
                carets = '^'.repeat(line.length - loc.first_column);
            } else {
                carets = '^'.repeat(loc.last_column - loc.first_column);
            }
            
            console.error(
                'Exception: ' + message + '\n' +
                '<' + sourcePath + '>, line ' + lineNo + '\n' +
                '    ' + line + '\n' +
                indent + carets
            );
        } else {
            console.error(
                'Exception: ' + message + '\n' +
                '<' + sourcePath + '>'
            );
        }
    },
        
    evaluateType: function(typeNode) {
        var symbol = this.evaluateSymbol(typeNode);
        
        if (typeNode.nick == 'TypeId') {
            var type = symbol.matchArgs(0, function(genericClass, argSymbols) {
                return this.precompileClass(genericClass, argSymbols);
            }.bind(this));
            if (type) {
                return typeNode.pointers? this.typeWithPointers(type, typeNode.pointers) : type;
            }
        } else if (typeNode.nick == 'TypeArguments') {
            var argNodes = typeNode.args;
            var type = symbol.matchArgs(argNodes.length-1, function(genericClass, argSymbols) {
                return this.precompileClass(genericClass, argSymbols);
            }.bind(this));
            if (type) {
                return typeNode.pointers ? this.typeWithPointers(type, typeNode.pointers) : type;
            }
        }
        
        throw new MoyaError("Type not found", typeNode.loc);
    },
    
    evaluateSymbol: function(typeNode) {
        if (typeNode.nick == 'TypeId') {
            var symbol = this.scope.evaluateSymbol(typeNode.id);
            if (symbol) {
                return symbol;
            }
        } else if (typeNode.nick == 'TypeArguments') {
            var argNodes = typeNode.args;

            var symbol = this.scope.evaluateSymbol(argNodes[0].id);
            if (symbol) {
                symbol = symbol.clone();
                for (var i = 1, l = argNodes.length; i < l; ++i) {
                    var subsymbol = this.evaluateSymbol(argNodes[i]);
                    symbol.argSymbols[i-1] = subsymbol;
                }
                return symbol;
            }
        }

        throw new MoyaError("Type not found", typeNode.loc);
    },
    
    // *********************************************************************************************
    
    compileProgram: function(moduleName, sourcePath, source) {
        if (!source) {
            if (!sourcePath) {
                if (moduleName) {
                    sourcePath = this.findModule(moduleName, sourcePath);
                } else {
                    throw new MoyaError("Nothing to compile");
                }
            }
                        
            source = fs.readFileSync(sourcePath, 'utf8').trim() + '\n';
        }

        try {
            if (this.debugMode == "ast") {
                var ast = parser.parse(source);
                console.log(ast+'');
            } else {
                llvm.beginModule("Moya");
                this.declareExternals();
                this.compileModule(moduleName, sourcePath, source, false);
                this.compileCode();
                this.compileMain();
                llvm.endModule(this.debugMode == 'ir' ? 1 : 0);
                llvm.executeMain();
            }
        } catch (exc) {
            var rootModule = this.scope ? this.scope.rootModule : null;
            var errorPath = rootModule ? rootModule.path : sourcePath;
            var errorSource = rootModule ? rootModule.source : source;
            if (exc.hash) {
                this.printSourceError('Syntax error', exc.hash.loc, errorPath, errorSource);
            } else if (exc.message) {
                this.printSourceError(exc.message, exc.loc, errorPath, errorSource);
            } else {
                throw exc;
            }
            throw exc;
        }
    },
    
    declareExternals: function() {
        this.printString = llvm.declareExternalFunction('printString', VOID.native,
                                                        [STRING.native]);
        this.concat = llvm.declareExternalFunction('concatString', STRING.native,
                                                   [STRING.native, STRING.native]);
        this.boolToString = llvm.declareExternalFunction('boolToString', STRING.native, [I1.native]);
        this.charToString = llvm.declareExternalFunction('charToString', STRING.native, [CHAR.native]);
        this.intToString = llvm.declareExternalFunction('intToString', STRING.native, [I64.native]);
        this.doubleToString = llvm.declareExternalFunction('doubleToString', STRING.native,
                                                           [F64.native]);
        this.pow = llvm.declareExternalFunction('powerdd', F64.native, [F64.native, F64.native]);
        this.newObject = llvm.declareExternalFunction('newObject', POINTER.native, [I32.native]);
        this.newBuffer = llvm.declareExternalFunction('newBuffer', POINTER.native, [I32.native, I32.native]);
    },

    compileModule: function(moduleName, sourcePath, source, isBuiltin) {
        var mod = new Module(moduleName, sourcePath, source);
        this.moduleCache[sourcePath] = mod;

        var oldScope = this.scope;
        this.scope = new ModuleScope(mod);
        
        var ast = parser.parse(source);

        var imports = [];
        var cfuncs = [];
        var classes = [];
        var funcs = [];
        
        var nodes = ast.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            if (node.nick == "FunctionDecl") {
                funcs.push(node);
            } else if (node.nick == "Class") {
                classes.push(node);
            } else if (node.nick == "Import") {
                this.collectImportSet(node, imports, sourcePath);
            } else if (node.nick == "Set") {
                for (var j = 0, jl = node.items.length; j < jl; ++j) {
                    var item = node.items[j];
                    if (item.nick == "CFunction") {
                        cfuncs.push(item);
                    } else {
                        throw new MoyaError("Syntax NYI", node.loc);
                    }
                }
            } else {
                throw new MoyaError("Syntax NYI", node.loc);
            }
        }

        if (!isBuiltin) {
            var builtins = this.getBuiltinModules();
            for (var importName in builtins) {
                mod.declareImport(builtins[importName]);
            }
        }
        
        for (var i = 0, l = imports.length; i < l; ++i) {
            var info = imports[i];
            var importedModule = this.compileImport(info.name, info.path);
            mod.declareImport(importedModule);
        }

        for (var i = 0, l = cfuncs.length; i < l; ++i) {
            var func = this.declareCFunction(cfuncs[i], mod);
            mod.declareFunction(func);
        }
                
        for (var i = 0, l = classes.length; i < l; ++i) {
            var cls = this.declareClass(classes[i]);
            mod.declareClass(cls);
            
            for (var j = 0, jl = cls.constructors.length; j < jl; ++j) {
                var cons = cls.constructors[j];
                mod.declareFunction(cons);
            }
        }
                
        for (var i = 0, l = funcs.length; i < l; ++i) {
            var func = this.declareFunction(funcs[i]);
            mod.declareFunction(func);
        }

        mod.main = this.matchFunctionCall('@main', [], []);
                
        this.scope = oldScope;
        
        return mod;
    },
    
    getBuiltinModules: function() {
        if (!this.builtinModules) {
            this.builtinModules = {};
            
            for (var i = 0, l = builtinModuleNames.length; i < l; ++i) {
                var simpleName = builtinModuleNames[i];
                var importPath = this.findModule(simpleName);
                if (importPath) {
                    var importName = importPath.replace(/\//g, nameSep);
                    var importedModule = this.compileImport(importName, importPath, true);
                    this.builtinModules[simpleName] = importedModule;
                } else {
                    throw new MoyaError("Core module " + simpleName + " not found");
                }
            }
        }
        
        return this.builtinModules;
    },
    
    compileCode: function() {
        while (this.classQueue.length) {
            var info = this.classQueue.shift();
            this.inheritMethods(info.type);
            this.compileClass(info.type, info.self, info.propertyMap);
        }

        while (this.functionQueue.length) {
            var info = this.functionQueue.shift();
            this.compileFunction(info.func, info.ownerType, info.argVariables);
        }
                        
        if (this.classQueue.length && this.functionQueue.length) {
            throw new MoyaError("Oops, forgot to pre-compile something");
        }
    },

    inheritMethods: function(classType) {
        var baseType = classType.base;
        if (baseType) {
            this.inheritMethods(baseType);

            for (var i = 0, l = baseType.methods.length; i < l; ++i) {
                var method = baseType.methods[i];
                this.matchMethodCall(classType, method.name, method.argTypes, method.argSymbols);
            }
        }
    },
    
    compileMain: function() {
        var funcAndArgs = llvm.declareFunction('main', I32.native, [], []);
        var main = funcAndArgs.shift();
        
        var block = llvm.createBlock('entry', main);
        llvm.setInsertBlock(block);
        
        for (var key in this.moduleCache) {
            var mod = this.moduleCache[key];
            if (mod.main) {
                llvm.compileCall(mod.main.native, []);
            }
        }
        
        llvm.compileReturn(this.getInt(0));
    },
    
    // *********************************************************************************************

    compileImport: function(moduleName, sourcePath, isBuiltin) {
        var mod = this.moduleCache[sourcePath];
        if (mod) {
            return mod;
        } else {
            var source = fs.readFileSync(sourcePath, 'utf8').trim() + '\n';
            return this.compileModule(moduleName, sourcePath, source, isBuiltin);
        }
    },
    
    findModule: function(modulePath, basePath) {
        return this.tryModulePaths(modulePath, basePath, function(fullPath) {
            if (fs.existsSync(fullPath)) {
                var stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    var parts = modulePath.split(path.sep);
                    fullPath = fullPath + path.sep + parts[parts.length-1] + fileExt;
                }
            } else {
                fullPath = fullPath + fileExt;
            }
        
            if (fs.existsSync(fullPath)) {
                var stat = fs.statSync(fullPath);
                if (stat.isFile()) {
                    return fullPath;
                }
            }
        });
    },

    tryModulePaths: function(modulePath, basePath, cb) {
        if (modulePath[0] == '.') {
            var base = basePath ? path.dirname(basePath) : process.cwd();
            return cb(path.resolve(base, modulePath));
        } else {
            for (var i = 0, l = this.searchPaths.length; i < l; ++i) {
                var fullPath = path.resolve(this.searchPaths[i], modulePath);
                fullPath = cb(fullPath);
                if (fullPath) {
                    return fullPath;
                }
            }
        }
    },
    
    collectImportSet: function(importNode, imports, basePath) {
        var names = importNode.moduleNames;
        for (var i = 0, l = names.length; i < l; ++i) {
            this.collectImportNames(names[i], imports, basePath);
        }
    },
    
    collectImportNames: function(nameSet, imports, basePath) {
        var paths = [];
        for (var i = 0, l = nameSet.items.length; i < l; ++i) {
            var name = nameSet.items[i];
            paths[i] = name.id;
        }
        
        var modulePath = paths.join(path.sep);
        var fullPath = this.findModule(modulePath, basePath);
        if (fullPath) {
            var moduleName = modulePath.replace(/\//g, nameSep);
            imports.push({name: moduleName, path: fullPath});
        } else {
            throw new MoyaError("File not found", nameSet.loc);
        }
    },
    
    // *********************************************************************************************
    
    declareClass: function(classDecl) {
        var id = classDecl.id;
        var symbolNodes = null;
        if (id.nick == "TypeArguments") {
            symbolNodes = id.args.slice();
            id = symbolNodes.shift().id;
        } else {
            id = id.id;
        }
        
        var cls = new GenericClass(id);
        cls.ast = classDecl;
        cls.accessMode = classDecl.accessMode;
        cls.base = classDecl.base;
        
        if (symbolNodes) {
            for (var i = 0, l = symbolNodes.length; i < l; ++i) {
                var argItem = symbolNodes[i];
                if (argItem.nick == "TypeId") {
                    cls.symbolNames.push(argItem.id);
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
                    var cons = this.declareConstructor(node, cls);
                    cls.constructors.push(cons);
                    hasConstructors = true;
                } else {
                    var func = this.declareFunction(node);
                    func.class = cls;
                    cls.methods.push(func);
                }
            } else if (node.nick == 'TypeAssignment') {
                throw new MoyaError('Default constructors NYI', node.loc);
            } else if (node.nick == 'Identifier') {
                throw new MoyaError('Illegal property declaration', node.loc);
            }
        }
            
        if (!hasConstructors) {
            var func = T.parseEmptyFuncDecl(cls.loc, id, cls.accessMode);
            var cons = this.declareConstructor(func, cls);
            cls.constructors.push(cons);
        }
        
        return cls;
    },

    declareConstructor: function(fnDecl, genericClass) {
        var func = new GenericFunction(genericClass.name);
        func.loc = fnDecl.loc;
        func.accessMode = fnDecl.accessMode;
        func.body = fnDecl.body;
        func.args = fnDecl.args ? fnDecl.args.items : [];
        func.symbolNames = genericClass.symbolNames.slice();
        func.class = genericClass;
        func.isConstructor = true;
        
        var argItems = func.args;
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

    declareFunction: function(fnDecl) {
        var name = fnDecl.id;
        var symbolNodes = null;
        if (name.nick == "TypeArguments") {
            symbolNodes = name.args.slice();
            name = symbolNodes.shift().id;
        } else {
            name = name.id;
        }

        var func = new GenericFunction(name);
        func.loc = fnDecl.loc;
        func.accessMode = fnDecl.accessMode;
        func.args = fnDecl.args ? fnDecl.args.items : [];
        func.returns = fnDecl.returns;
        func.body = fnDecl.body;
        
        if (symbolNodes) {
            for (var i = 0, l = symbolNodes.length; i < l; ++i) {
                var symbolItem = symbolNodes[i];
                if (symbolItem.nick == "TypeId") {
                    func.symbolNames.push(symbolItem.id);
                } else {
                    throw new MoyaError("Illegal type argument", symbolItem.loc);
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
                
                
        return func;
    },

    // *********************************************************************************************

    declareCFunction: function(node, mod) {
        var args = [];
        if (node.args) {
            var argItems = node.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                args[i] = this.compileCArg(argItem);
            }
        }

        var func = new GenericFunction(node.name);
        func.module = mod;
        func.args = args;
        func.returns = this.compileCType(node.type);
        func.accessMode = T.PrivateAccess;
        func.minimumArgCount = args.length;
        func.isCFunction = true;
        return func;
    },
        
    compileCArg: function(node) {
        var type = this.compileCType(node.type);
        var assign = T.parseTypeAssignment(node.loc, null, type);
        return T.parseArgDecl(node.loc, assign, null, false);
    },

    compileCType: function(node) {
        if (node.name == 'void') {
            return new T.parseTypeId(node.loc, 'Void');
        } else if (node.name == 'bool') {
            return new T.parseTypeId(node.loc, 'Bool');
        } else if (node.name == 'short') {
            return new T.parseTypeId(node.loc, 'Int16');
        } else if (node.name == 'int' || node.name == 'long') {
            return new T.parseTypeId(node.loc, 'Int32');
        } else if (node.name == 'long long') {
            return new T.parseTypeId(node.loc, 'Int64');
        } else if (node.name == 'float') {
            return new T.parseTypeId(node.loc, 'Float');
        } else if (node.name == 'double') {
            return new T.parseTypeId(node.loc, 'Double');
        } else if (node.name == 'size_t') {
            return new T.parseTypeId(node.loc, 'Int32');
        } else if (node.name == 'char') {
            if (node.pointers == 1) {
                return new T.parseTypeId(node.loc, 'String');
            } else {
                return new T.parseTypeId(node.loc, 'Int8', node.pointers);
            }
        } else {
            return new T.parseTypeId(node.loc, 'Int8', node.pointers);
        }
    },
    
    // *********************************************************************************************
    
    precompileClass: function(genericClass, argSymbols) {
        var key = genericClass.keyWithSymbols(argSymbols);
        var classType = this.typeCache[key];
        if (classType) {
            return classType;
        }
        
        var oldScope = this.scope;
        this.scope = new ModuleScope(genericClass.module);
        
        var classType = new ClassType(genericClass, argSymbols);
        this.typeCache[key] = classType;

        if (genericClass.base) {
            classType.base = this.evaluateType(genericClass.base);
        }

        classType.nativeStruct = llvm.createStruct(key);
        classType.native = llvm.getPointerType(classType.nativeStruct);
        
        var classScope = this.pushScope(new ClassStaticScope(classType));
        var funcScope = this.pushScope(new FunctionStaticScope());
                
        for (var i = 0, l = genericClass.props.length; i < l; ++i) {
            var genericProp = genericClass.props[i];
            if (genericProp.type) {
                var prop = classType.addProperty(genericProp.name);
                prop.type = this.evaluateType(genericProp.type);
                classScope.declareProperty(genericProp.name, genericProp.body);
            } else {
                var prop = classType.addProperty(genericProp.name);
                classScope.declareProperty(genericProp.name, genericProp.body);
            }
        }

        // Second pass - infer property types and determine order to initialize them
        var structTypes = [VTABLEPOINTER.native];
        
        for (var baseType = classType.base; baseType; baseType = baseType.base) {
            for (var propertyName in baseType.properties) {
                var prop = baseType.properties[propertyName]
                structTypes.push(prop.type.native);
            }
        }

        for (var propertyName in classType.properties) {
            var prop = classType.properties[propertyName];
            var propType = classScope.lookupVariableType(propertyName);
            if (!propType) {
                throw new MoyaError("Could not determine property type", prop.loc);
            }
            
            prop.offset = structTypes.length;
            structTypes.push(prop.type.native);
        }

        this.popScope();
        this.popScope();
        
        classType.structSize = llvm.setStructBody(classType.nativeStruct, structTypes);

        var funcAndArgs = llvm.declareFunction(llvmPrefix+key+'_INIT',
                                               VOID.native, [classType.native], ['self']);
        classType.initFunc = funcAndArgs.shift();
        var self = funcAndArgs.shift();
        
        this.classQueue.push({type: classType, self: self,
                              propertyMap: classScope.orderedProperties});
        
        this.scope = oldScope;
        
        return classType;
    },

    compileClass: function(classType, self, propertyMap) {
        var oldScope = this.scope;
        
        this.scope = new ModuleScope(classType.class.module);
        
        var classScope = new ClassScope(classType);
        this.pushScope(classScope);
        classScope.self = self;

        var methods = [];
        this.collectMethods(classType, methods, {});
        var methodTable = llvm.createClassTable(classType.name + '_FUNCS', methods);

        this.compileClassInit(classType, self, propertyMap, methodTable);

        this.popScope();
        
        this.scope = oldScope;
    },
        
    collectMethods: function(classType, methods, cache) {
        if (classType.base) {
            this.collectMethods(classType.base, methods, cache);
        }
            
        for (var i = 0, l = classType.methods.length; i < l; ++i) {
            var realFunc = classType.methods[i];
            
            var key = realFunc.signatureKey();
            if (key in cache) {
                realFunc.methodOffset = cache[key];
            } else {
                realFunc.methodOffset = methods.length;
                cache[key] = realFunc.methodOffset;
            }
            methods[realFunc.methodOffset] = realFunc.native;
        }
    },
    
    compileClassInit: function(classType, self, propertyMap, methodTable) {
        var block = llvm.createBlock('entry', classType.initFunc);
        llvm.setInsertBlock(block);

        if (classType.base) {
            var castSelf = llvm.compileBitcast(self, classType.base.native);
            llvm.compileCall(classType.base.initFunc, [castSelf]);
        }
        
        var offset = this.getInt(0);
        var variable = llvm.getPointer(self, [this.getInt(0), offset]);
        var castTable = llvm.compileBitcast(methodTable, VTABLEPOINTER.native);
        llvm.storeVariable(variable, castTable);

        for (var propertyName in propertyMap) {
            var prop = classType.properties[propertyName];
            var rhs = this.compileNode(propertyMap[propertyName]);
            var cast = this.ensureCorrectType(rhs, prop.type);

            var offset = this.getInt(prop.offset);
            var variable = llvm.getPointer(self, [this.getInt(0), offset]);
            llvm.storeVariable(variable, cast.value);
        }

        llvm.compileReturn();
    },

    // *********************************************************************************************
                
    matchFunctionCall: function(name, argTypes, argSymbols) {
        var oldScope = this.scope;
            
        var result = this.scope.lookupFunction(name, function(genericFunc) {
            this.scope = new ModuleScope(genericFunc.module);
            
            var funcScope = this.pushScope(new FunctionStaticScope());
            var realFunc = this.matchCall(genericFunc, null, argTypes, argSymbols);
            this.popScope(funcScope);
            
            if (realFunc) {
                if (!realFunc.native) {
                    if (realFunc.generic.isConstructor && !realFunc.classType) {
                        var genericClass = realFunc.generic.class;
                        realFunc.classType = this.precompileClass(genericClass, realFunc.argSymbols);
                    }
                    if (genericFunc.isCFunction) {
                        this.precompileCFunction(realFunc);
                    } else {
                        this.precompileFunction(realFunc);
                    }
                }
                
                return realFunc;
            }
        }.bind(this));

        this.scope = oldScope;
        
        return result;
    },

    matchMethodCall: function(classType, name, argTypes, argSymbols) {
        var oldScope = this.scope;

        var result = classType.lookupMethod(name, function(genericFunc, ownerType) {
            this.scope = new ModuleScope(ownerType.class.module);
            this.pushScope(new ClassScope(ownerType));
            this.pushScope(new FunctionStaticScope());
            var realFunc = this.matchCall(genericFunc, ownerType, argTypes, argSymbols);
            this.popScope();
            this.popScope();

            if (realFunc) {
                if (!realFunc.native) {
                    this.precompileFunction(realFunc, ownerType);
                }
                
                return realFunc;
            }
        }.bind(this));

        this.scope = oldScope;
        
        return result;
    },

    matchCall: function(func, ownerType, argTypes, argSymbols) {
        var argNodes = func.args;
        if (argTypes.length > argNodes.length || argTypes.length < func.minimumArgCount) {
            return null;
        }
        if (argSymbols.length > func.symbolNames.length) {
            return null;
        }

        argTypes = argTypes.slice();
        
        for (var i = 0, l = func.symbolNames.length; i < l; ++i) {
            var symbolName = func.symbolNames[i];
            this.scope.declareSymbol(symbolName, argSymbols[i]);
        }
        
        // Define type arguments by pulling them from actual arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argNode = argNodes[i];
            var argType = argTypes[i];
            if (argNode.type) {
                var symbol = argTypes[i].toSymbol();
                this.scope.expandType(argNode.type, symbol);
            }
        }
        
        for (var i = argTypes.length, l = argNodes.length; i < l; ++i) {
            var argNode = argNodes[i];
            if (argNode.type && argNode.defaultValue) {
                var expectedType = this.inferNode(argNode.defaultValue);
                var expectedSymbol = expectedType.toSymbol();
                this.scope.expandType(argNode.type, expectedSymbol);
            }
        }
        
        // Evaluate all type arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argType = argTypes[i];
            var argNode = argNodes[i];
            if (argNode.type) {
                var expectedType = this.evaluateType(argNode.type);
                if (!expectedType || !expectedType.isTypeOrSubclass(argType)) {
                    return null;
                }
            }
        }
    
        // Fill in default values for missing arguments
        for (var i = argTypes.length, l = argNodes.length; i < l; ++i) {
            var argNode = argNodes[i];
            var expectedType = null;
            if (argNode.type) {
                expectedType = this.evaluateType(argNode.type);
            } else if (argNode.defaultValue) {
                expectedType = this.inferNode(argNode.defaultValue);
            }
            
            if (!expectedType) {
                throw new MoyaError("Unknown type for argument", argNode.loc);
            }
            
            argTypes.push(expectedType);
        }
        
        // Ensure all symbol arguments are defined
        for (var name in this.scope.localSymbols) {
            if (!this.scope.localSymbols[name]) {
                return null;
            }
        }

        if (func.body) {
            for (var i = 0, l = argNodes.length; i < l; ++i) {
                var argNode = argNodes[i];
                var argType = argTypes[i];
                this.scope.storeVariableType(argNode.innerName, argType);
            }
            
            this.inferBlock(func.body);
        }
        
        var returnType = null;
        if (func.returns) {
            returnType = this.evaluateType(func.returns);
        } else if (func.body) {
            returnType = this.scope.returnType;
        }
        
        var funcSymbols = [];
        for (var i = 0, l = func.symbolNames.length; i < l; ++i) {
            var symbolName = func.symbolNames[i];
            var funcSymbol = this.scope.localSymbols[symbolName];
            funcSymbols.push(funcSymbol);
        }
        
        var key = ownerType
            ? ownerType.keyForMethod(func.name, argTypes, funcSymbols)
            : func.keyForCall(argTypes, funcSymbols);
        var realFunc = this.functionCache[key];
        if (!realFunc) {
            realFunc = new RealFunction(func, funcSymbols, argTypes, returnType);
            this.functionCache[key] = realFunc;
        }
        return realFunc;
    },
    
    precompileCFunction: function(realFunc) {
        if (realFunc.native) {
            return;
        }

        var genericFunc = realFunc.generic;

        var nativeArgTypes = [];
        var args = genericFunc.args;
        for (var i = 0, l = realFunc.argTypes.length; i < l; ++i) {
            nativeArgTypes[i] = realFunc.argTypes[i].native;
        }
        var nativeReturnType = realFunc.returnType ? realFunc.returnType.native : VOID.native;

        realFunc.native = llvm.declareExternalFunction(realFunc.name, nativeReturnType,
                                                       nativeArgTypes);
    },
    
    precompileFunction: function(realFunc, ownerType) {
        if (realFunc.native) {
            return;
        }

        var genericFunc = realFunc.generic;

        var argNames = [];
        var nativeArgTypes = [];
        var args = genericFunc.args;
        for (var i = 0, l = realFunc.argTypes.length; i < l; ++i) {
            nativeArgTypes[i] = realFunc.argTypes[i].native;
            argNames[i] = args[i].innerName;
        }
        
        var argDefaults = realFunc.argDefaults = [];
        for (var i = 0, l = args.length; i < l; ++i) {
            var arg = args[i];
            if (arg.defaultValue) {
                var defaultFunc = this.precompileDefaultGetter(genericFunc, arg.innerName,
                                                               nativeArgTypes[i]);
                argDefaults.push(defaultFunc);
            }
        }

        if (ownerType) {
            realFunc.selfType = ownerType;
            ownerType.addMethod(realFunc);
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
        var funcAndArgs = llvm.declareFunction(llvmPrefix+genericFunc.qualifiedName,
                                               nativeReturnType, nativeArgTypes, argNames);
        realFunc.native = funcAndArgs.shift();
        realFunc.nativeType = llvm.getFunctionType(realFunc.native);
        
        this.functionQueue.push({func: realFunc, ownerType: ownerType, argVariables: funcAndArgs});
    },
        
    compileFunction: function(realFunc, ownerType, argVariables) {
        var oldScope = this.scope;
        
        this.scope = new ModuleScope(realFunc.generic.module);

        var block = llvm.createBlock("entry", realFunc.native);
        llvm.setInsertBlock(block);
        
        if (realFunc.classType) {
            var classType = realFunc.classType;
            
            var classScope = new ClassScope(classType);
            this.pushScope(classScope);

            var allocSize = VTABLEPOINTER.size + classType.structSize;
            var raw = llvm.compileCall(this.newObject, [this.getInt(allocSize)]);
            var castSelf = llvm.compileBitcast(raw, classType.native);
            classScope.self = castSelf;

            llvm.compileCall(classType.initFunc, [castSelf]);
        } else if (ownerType) {
            var classScope = new ClassScope(ownerType);
            classScope.self = argVariables[0];
            this.pushScope(classScope);
        }
        
        var scope = new FunctionScope(realFunc);
        this.pushScope(scope);
        
        if (ownerType) {
            var thisVar = argVariables.shift();
            this.scope.storeVariable('this', expr(ownerType, thisVar));
        }
        
        // Store arguments on scope
        var argItems = realFunc.generic.args;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            var argName = argItem.innerName;
            var argType = realFunc.argTypes[i];
            var argVar = argVariables[i];
            this.scope.storeVariable(argName, expr(argType, argVar));
        }
        
        var didReturn = this.compileStatements(realFunc.generic.body);

        this.popScope();
        
        var block = llvm.getInsertBlock();
        if (llvm.isBlockEmpty(block)) {
            llvm.compileReturn();
        }
        
        if (realFunc.classType) {
            var classScope = this.popScope();
            llvm.compileReturn(classScope.self);
        } else {
            if (ownerType) {
                this.popScope();
            }
            
            if (!didReturn) {
                if (realFunc.returnType) {
                    throw new MoyaError("Return required", realFunc.generic.loc);
                } else {
                    llvm.compileReturn();
                }
            }
        }
        
        var minArgCount = realFunc.generic.minimumArgCount;
        for (var i = 0, l = realFunc.argDefaults.length; i < l; ++i) {
            var defaultFunc = realFunc.argDefaults[i];
            var defaultNode = argItems[i+minArgCount].defaultValue;
            this.compileDefaultGetter(defaultFunc, defaultNode);
        }
        
        this.scope = oldScope;
    },

    precompileDefaultGetter: function(func, name, type) {
        var fullName = func.qualifiedName + '.' + name + '_DEFAULT';
        var funcAndArgs = llvm.declareFunction(llvmPrefix+fullName, type, [], []);
        return funcAndArgs.shift();
    },
    
    compileDefaultGetter: function(defaultFunc, defaultValue) {
        var block = llvm.createBlock("entry", defaultFunc);
        llvm.setInsertBlock(block);

        var result = this.compileNode(defaultValue);
        llvm.compileReturn(result.value);
    },
    
    // *********************************************************************************************

    inferNode: function(node, isStatement) {
        if (!node) console.trace();
        var ff = this['infer'+node.nick];
        if (!ff) { D&&D(node.nick); }
        return ff.call(this, node, isStatement);
    },

    inferBlock: function(block) {
        var nodes = block.items;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            this.inferNode(nodes[i], true);
        }
    },

    inferPropertyType: function(classType, propertyName) {
        var prop = classType.getProperty(propertyName);
        if (prop) {
            return prop.type;
        }
    },

    inferMath: function(lhsType, rhsType, node) {
        if (lhsType instanceof NumberType && rhsType instanceof NumberType) {
            if (lhsType == rhsType) {
                return lhsType;
            } else if (rhsType == F64 || rhsType == F32) {
                return rhsType;
            } else {
                return lhsType;
            }
        } else if (lhsType instanceof PointerType && rhsType instanceof NumberType) {
            return lhsType;
        } else {
            throw new MoyaError("Illegal types for binary operation", node.loc);
        }
    },
    
    // *********************************************************************************************

    compileStatements: function(block) {
        if (block) {
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
        
    inferExpression: function(block) {
        var nodes = block.items;
        var resultType = null;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            var valType = this.inferNode(node);
            if (!resultType) {
                resultType = valType;
            } else if (resultType instanceof ClassType) {
                var withFunc = this.matchMethodCall(resultType, 'with', [valType], []);
                if (withFunc) {
                    resultType = withFunc.returnType;
                } else {
                    throw new MoyaError("with() not defined on " + val.type.name, node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for expression", node.loc);
            }
        }
        return resultType;
    },
    
    compileExpression:function(block) {
        var nodes = block.items;
        var result = null;
        for (var i = 0, l = nodes.length; i < l; ++i) {
            var node = nodes[i];
            var val = this.compileNode(node);
            if (!result) {
                result = val;
            } else if (result.type instanceof ClassType) {
                var ret = this.callMethod(result, 'with', [val], []);
                if (ret) {
                    result = ret;
                } else {
                    throw new MoyaError("with() not defined on " + val.type.name, node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for expression", node.loc);
            }
        }
        return result;
    },
    
    compileNode: function(node, isStatement) {
        var ff = this[node.nick];
        if (!ff) { D&&D(node.nick); }
        return ff.call(this, node, isStatement);
    },

    valueToString: function(val) {
        if (val.type == STRING) {
            return val.value;
        } else if (val.type == CHAR) {
            return llvm.compileCall(this.charToString, [val.value]);
        } else if (val.type instanceof NumberType) {
            if (val.type == I1) {
                return llvm.compileCall(this.boolToString, [val.value]);
            } else if (val.type == I1 || val.type == I8 || val.type == I16 || val.type == I32 || val.type == CHAR) {
                return llvm.compileCall(this.intToString, [this.castNumber(val, I64)]);
            } else if (val.type == I64) {
                return llvm.compileCall(this.intToString, [val.value]);
            } else if (val.type == F32) {
                return llvm.compileCall(this.doubleToString, [this.castNumber(val, F64)]);
            } else if (val.type == F64) {
                return llvm.compileCall(this.doubleToString, [val.value]);
            }
        } else {
            // XXXjoe We should be calling toString method on object
            return llvm.declareString(val.type.toString());
        }
    },

    ensureCorrectType: function(value, expectedType, castObjects) {
        if (!expectedType) {
            return value;
        }
        
        if (expectedType == value.type) {
            return value;
        } else if (expectedType instanceof NumberType) {
            var cast = this.castNumber(value, expectedType);
            return expr(expectedType, cast);
        } else if (castObjects) {
            return expr(expectedType, value.value);
        } else if (expectedType.isTypeOrSubclass(value.type)) {
            return expr(expectedType, llvm.compileBitcast(value.value, expectedType.native));
        } else {
            D&&D(expectedType)
            D&&D(value.type)
            console.trace()
            throw new MoyaError("Object type conversion not yet implemented");
        }
    },
            
    castNumber: function(val, type) {
        if (val.type == type) {
            return val.value;
        } else if (type == STRING) {
            return this.valueToString(val);
        } else if (type instanceof NumberType) {
            return llvm.castNumber(val.value, type.native);
        } else {
            throw new MoyaError("Illegal cast");
        }
    },

    getTypeDefault: function(type) {
        if (type instanceof NumberType) {
            if (type == F32) {
                return expr(type, llvm.compileFloat(0));
            } else if (type == F64) {
                return expr(type, llvm.compileDouble(0));
            } else {
                return expr(type, llvm.compileInteger(type.bitSize, 0));
            }
        } else {
            throw new MoyaError("Default constructor NYI");
        }
    },
    
    getInt: function(val, size) {
        return llvm.compileInteger(size || 32, val);
    },

    callMethod: function(object, name, args, argSymbols) {
        var argTypes = [];
        var argValues = []
        for (var i = 0, l = args.length; i < l; ++i) {
            var arg = args[i];
            argTypes[i] = arg.type;
            argValues[i] = arg.value;
        }

        var func = this.matchMethodCall(object.type, name, argTypes, argSymbols);
        if (func) {
            if (argTypes.length < func.argTypes.length) {
                for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
                    var defaultCall = func.argDefaults[i-argTypes.length];
                    argValues[i] = llvm.compileCall(defaultCall, []);
                }
            }
            
            var castSelf = llvm.compileBitcast(object.value, func.selfType.native);
            argValues.unshift(castSelf);
            
            var tableVar = llvm.getPointer(object.value, [this.getInt(0), this.getInt(0)]);
            var table = llvm.loadVariable(tableVar, "table");
            var methodVar = llvm.getPointer(table, [this.getInt(func.methodOffset)]);
            var method = llvm.loadVariable(methodVar, name+".func");
            var castMethod = llvm.compileBitcast(method, func.nativeType);
                
            var ret = llvm.compileCall(castMethod, argValues);
            return expr(func.returnType, ret);
        }
    },
    
    callFunction: function(name, args, argSymbols) {
        var argTypes = [];
        var argValues = []
        for (var i = 0, l = args.length; i < l; ++i) {
            var arg = args[i];
            argTypes[i] = arg.type;
            argValues[i] = arg.value;
        }

        var func = this.matchFunctionCall(name, argTypes, argSymbols);
        if (func) {
            if (argTypes.length < func.argTypes.length) {
                for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
                    var defaultCall = func.argDefaults[i-argTypes.length];
                    argValues[i] = llvm.compileCall(defaultCall, []);
                }
            }
            
            var ret = llvm.compileCall(func.native, argValues);
            return expr(func.returnType, ret);
        }
    },
    
    compileCall: function(name, object, argNodes, symbolNodes, node) {
        var argSymbols = [];
        if (symbolNodes) {
            for (var i = 0, l = symbolNodes.length; i < l; ++i) {
                argSymbols[i] = this.evaluateSymbol(symbolNodes[i]);
            }
        }
        
        var args = [];
        for (var i = 0, l = argNodes.length; i < l; ++i) {
            args[i] = this.compileNode(argNodes[i].expr);
        }
        
        if (!object) {
            object = this.scope.getThis();
        }
        
        var ret = object ? this.callMethod(object, name, args, argSymbols) : null;
        if (ret) {
            return ret;
        } else {
            var ret = this.callFunction(name, args, argSymbols);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError('Function "' + name + '" not found', node.loc);
            }
        }
    },
    
    compileTest: function(condition, n) {
        if (condition.type == I1 || condition.type == I8 || condition.type == I16
            || condition.type == I32 || condition.type == I64 || condition.type == CHAR) {
            var zero = llvm.compileInteger(condition.type.bitSize, n);
            return expr(BOOL, llvm.compileEquals(condition.value, zero));
        } else if (condition.type == F32) {
            var zero = llvm.compileFloat(n);
            return expr(BOOL, llvm.compileEquals(condition.value, zero));
        } else if (condition.type == F64) {
            var zero = llvm.compileDouble(n);
            return expr(BOOL, llvm.compileEquals(condition.value, zero));
        } else if (condition.type instanceof ClassType) {
            var ret = this.callMethod(condition, '!', [], []);
            if (ret) {
                var zero = llvm.compileInteger(1, n ? 0 : 1);
                return expr(BOOL, llvm.compileEquals(ret.value, zero));
            } else {
                throw new MoyaError("Invalid type for truth test", condition.loc);
            }
        } else {
            throw new MoyaError("Invalid type for truth test", condition.loc);
        }
    },
        
    instructionForOp: function(op, lhs, rhs) {
        if (op == T.AddOp || op == T.AddEqOp) {
            if (lhs.type == STRING || rhs.type == STRING) {
                return this.compileConcat();
            } else if (lhs.type instanceof PointerType) {
                return this.compilePointerAdd();
            } else {
                return this.compileBinary(llvm.compileAdd.bind(llvm));
            }
        } else if (op == T.SubtractOp || op == T.SubtractEqOp) {
            return this.compileBinary(llvm.compileSubtract.bind(llvm));
        } else if (op == T.MultiplyOp || op == T.MultiplyEqOp) {
            return this.compileBinary(llvm.compileMultiply.bind(llvm));
        } else if (op == T.DivideOp || op == T.DivideEqOp) {
            return this.compileBinary(llvm.compileDivide.bind(llvm));
        } else if (op == T.ModOp || op == T.ModEqOp) {
            return this.compileBinary(llvm.compileMod.bind(llvm));
        } else if (op == T.PowOp || op == T.PowEqOp) {
            return function(lhs, rhs, node) {
                var left = this.castNumber(lhs, F64);
                var right = this.castNumber(rhs, F64);
                return expr(F64, llvm.compileCall(this.pow, [left, right]));
            }.bind(this);
        } else if (op == T.ConcatOp || op == T.ConcatEqOp) {
            return this.compileConcat();
        } else if (op == T.EqualsOp) {
            return this.compileComparison(llvm.compileEquals.bind(llvm));
        } else if (op == T.NotEqualsOp) {
            return this.compileComparison(llvm.compileNotEquals.bind(llvm));
        } else if (op == T.GreaterThanOp) {
            return this.compileComparison(llvm.compileGreaterThan.bind(llvm));
        } else if (op == T.GreaterThanEqualsOp) {
            return this.compileComparison(llvm.compileGreaterThanEquals.bind(llvm));
        } else if (op == T.LessThanOp) {
            return this.compileComparison(llvm.compileLessThan.bind(llvm));
        } else if (op == T.LessThanEqualsOp) {
            return this.compileComparison(llvm.compileLessThanEquals.bind(llvm));
        }
    },

    compileBinary: function(op) {
        return function(lhs, rhs, node) {
            if (lhs.type instanceof NumberType && rhs.type instanceof NumberType) {
                if (lhs.type == rhs.type) {
                    return expr(lhs.type, op(lhs.value, rhs.value));
                } else if (rhs.type == F64 || rhs.type == F32) {
                    var cast = llvm.castNumber(lhs.value, rhs.type.native);
                    return expr(rhs.type, op(cast, rhs.value));
                } else {
                    var cast = llvm.castNumber(rhs.value, lhs.type.native);
                    return expr(lhs.type, op(lhs.value, cast));
                }
            } else {
                throw new MoyaError("Illegal types for binary operation", node.loc);
            }
        }.bind(this);
    },

    compileConcat: function() {
        return function(lhs, rhs, node) {
            var left = this.valueToString(lhs);
            var right = this.valueToString(rhs);
            return expr(STRING, llvm.compileCall(this.concat, [left, right]));
        }.bind(this);
    },
    
    compilePointerAdd: function() {
        return function(lhs, rhs, node) {
            if (!rhs.type instanceof NumberType) {
                throw new MoyaError("Illegal pointer math", node.loc);
            }
        
            var variable = llvm.getPointer(lhs.value, [rhs.value]);
            return expr(lhs.type, variable);
        }
    },
    
    compileComparison: function(op) {
        return function(lhs, rhs, node) {
            if (lhs.type instanceof NumberType && rhs.type instanceof NumberType) {
                if (lhs.type == rhs.type) {
                    return expr(BOOL, op(lhs.value, rhs.value));
                } else if (rhs.type == F64 || rhs.type == F32) {
                    var cast = llvm.castNumber(lhs.value, rhs.type.native);
                    return expr(BOOL, op(cast, rhs.value));
                } else {
                    var cast = llvm.castNumber(rhs.value, lhs.type.native);
                    return expr(BOOL, op(lhs.value, cast));
                }
            } else {
                throw new MoyaError("Illegal types for comparison", node.loc);
            }
        }.bind(this);
    },

    compileAssignment: function(left, rhs, isStatement) {
        if (left.nick == "Identifier") {
            var classScope = this.scope.isProperty(left.id);
            if (classScope) {
                var prop = classScope.classType.getProperty(left.id);
                if (prop) {
                    var offset = this.getInt(prop.offset);
                    var variable = llvm.getPointer(classScope.self, [this.getInt(0), offset]);

                    var cast = this.ensureCorrectType(rhs, prop.type);
                    llvm.storeVariable(variable, cast.value);
                }
            } else {
                var type = this.scope.lookupVariableType(left.id);
                if (!type) {
                    type = rhs.type;
                }
                var cast = this.ensureCorrectType(rhs, type);
                return this.scope.storeVariable(left.id, cast);
            }
        } else if (left.nick == "TypeAssignment") {
            var type = this.evaluateType(left.type);
            var cast = this.ensureCorrectType(rhs, type);
            return this.scope.storeVariable(left.name, cast);
        } else if (left.nick == "Get") {
            var object = this.compileNode(left.left);
            if (object.type instanceof ClassType) {
                var prop = object.type.getProperty(left.right);
                if (prop) {
                    var offset = this.getInt(prop.offset);
                    var variable = llvm.getPointer(object.value, [this.getInt(0), offset]);
                    return llvm.storeVariable(variable, rhs.value);
                } else {
                    throw new MoyaError('Property "' + left.right + '" not found', left.loc);
                }
            } else {
                throw new MoyaError('Property "' + left.right + '" not found', left.loc);
            }
            return rhs;
        } else if (left.nick == "Binary") {
            if (left.op == T.IndexOp) {
                var object = this.compileNode(left.left);
                var index = this.compileNode(left.right);
                if (object.type instanceof PointerType) {
                    var variable = llvm.getPointer(object.value, [index.value]);
                    return llvm.storeVariable(variable, rhs.value);
                } else if (object.type instanceof ClassType) {
                    var ret = this.callMethod(object, '[]=', [index, rhs], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Index operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal operation", left.loc);
                }
            } else if (left.op == T.LookupOp) {
                var object = this.compileNode(left.left);
                if (object.type instanceof ClassType) {
                    var index = this.compileNode(left.right);
                    var ret = this.callMethod(object, '.[]=', [index, rhs], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Index operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal operation", left.loc);
                }
            } else if (left.op == T.SliceOp) {
                var object = this.compileNode(left.left);
                if (object.type instanceof ClassType) {
                    var range = left.right;
                    var from = this.compileNode(range.from);
                    var to = this.compileNode(range.to);
                    var by = range.by ? this.compileNode(range.by) : null;
                    var args = [rhs, from, to];
                    if (by) {
                        args.push(by);
                    }
                    
                    var ret = this.callMethod(object, '[to]=', args, []);
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Index operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for slice", node.loc);
                }
            } else {
                throw new MoyaError("Illegal assignment", left.loc);
            }
        } else {
            throw new MoyaError("Illegal assignment", left.loc);
        }
    },
        
    compileIncrement: function(node, rhs) {
        var lhs = this.compileNode(node.left);
        if (lhs.type instanceof ClassType) {
            var ret = this.callMethod(lhs, T.opToString(node.op), [rhs], []);
            if (ret) {
                return ret;
            } else {
                throw new MoyaError("Operator not supported", node.loc);
            }
        } else {
           var op = this.instructionForOp(node.op, lhs, rhs);
           var incremented = op(lhs, rhs, node);
           return this.compileAssignment(node.left, incremented);
       }
    },
    
    compileIfBlock: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = llvm.createBlock('after');
        
        var startReturnCount = pairs.length + 1;
        var returnCount = startReturnCount;
        
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = llvm.createBlock('then');
            var elseBlock = llvm.createBlock('else');

            llvm.compileConditionalJump(eq.value, ifBlock, elseBlock);
            llvm.setInsertBlock(ifBlock);
            var didReturn = this.compileStatements(pair.block);
            
            if (didReturn) {
                --returnCount;
            } else {
                llvm.compileJump(afterBlock);
            }

            llvm.setInsertBlock(elseBlock);
        }
        
        if (node.else) {
            var didReturn = this.compileStatements(node.else);
            if (didReturn) {
                --returnCount;
            } else {
                llvm.compileJump(afterBlock);
            }
        } else {
            llvm.compileJump(afterBlock);
        }
        
        if (startReturnCount != returnCount) {
            this.markReturned(!returnCount);
        }
        
        llvm.setInsertBlock(afterBlock);
    },
    
    compileIfExpression: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = llvm.createBlock('result');
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = llvm.createBlock('then');
            elseBlock = llvm.createBlock('else');

            llvm.compileConditionalJump(eq.value, ifBlock, elseBlock);
            llvm.setInsertBlock(ifBlock);
            var result = this.compileNode(pair.block);
            if (!resultType) {
                resultType = result.type;
            } else if (result.type != resultType) {
                throw new MoyaError("Different types in expression", pair.block.loc);
            }
            llvm.compileJump(afterBlock);

            llvm.setInsertBlock(elseBlock);
            
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

        llvm.compileJump(afterBlock);
        llvm.setInsertBlock(afterBlock);

        return expr(resultType, llvm.compilePhi(resultType.native, exprs, blocks));
    },

    compileLogic: function(left, right, isAnd) {
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        var one = llvm.compileInteger(1, 1);
        var zero = llvm.compileInteger(1, 0);
        
        var condition1 = this.compileNode(left);
        var eq1 = this.compileTest(condition1, 0);
        
        var startBlock = llvm.getInsertBlock();
        var thenBlock = llvm.createBlock('then');
        var failedBlock = llvm.createBlock('failed');
        var afterBlock = llvm.createBlock('after');

        if (isAnd) {
            llvm.compileConditionalJump(eq1.value, afterBlock, thenBlock);
        } else {
            llvm.compileConditionalJump(eq1.value, thenBlock, afterBlock);
        }

        llvm.setInsertBlock(thenBlock);
        var condition2 = this.compileNode(right);
        var eq2 = this.compileTest(condition2, 0);

        if (isAnd) {
            llvm.compileConditionalJump(eq2.value, failedBlock, afterBlock);
        } else {
            llvm.compileConditionalJump(eq2.value, afterBlock, failedBlock);
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

        llvm.setInsertBlock(failedBlock);
        llvm.compileJump(afterBlock);
        llvm.setInsertBlock(afterBlock);

        return expr(BOOL, llvm.compilePhi(BOOL.native, exprs, blocks));
    },
                                            
    // *********************************************************************************************

    inferSet: function(block) {
        var nodes = block.items;
        if (nodes.length == 1) {
            return this.inferNode(nodes[0], true);
        } else {
            return this.inferExpression(block);
        }
    },

    Set: function(block, isStatement) {
        var nodes = block.items;
        if (nodes.length == 1) {
            return this.compileNode(nodes[0]);
        } else {
            return this.compileExpression(block);
        }
    },
            
    inferTypeId: function(node, isStatement) {
        return I32;
    },
    
    TypeId: function(node, isStatement) {
        var type = this.evaluateType(node);
        return expr(I32, this.getInt(type.size));
    },
    
    inferCast: function(node, isStatement) {
        return this.evaluateType(node.type);
    },
    
    Cast: function(node, isStatement) {
        var type = this.evaluateType(node.type);
        var value = this.compileNode(node.expr);
        return this.ensureCorrectType(value, type, true);
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
        } else if (node.unit == 'c') {
            return CHAR;
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            return I32;
        }
    },
        
    Integer: function(node, isStatement) {
        if (node.unit == 'i1') {
            var val = llvm.compileInteger(1, node.value);
            return expr(I1, val);
        } else if (node.unit == 'i8') {
            var val = llvm.compileInteger(8, node.value);
            return expr(I8, val);
        } else if (node.unit == 'i16') {
            var val = llvm.compileInteger(16, node.value);
            return expr(I16, val);
        } else if (node.unit == 'i32') {
            var val = llvm.compileInteger(32, node.value);
            return expr(I32, val);
        } else if (node.unit == 'i64') {
            var val = llvm.compileInteger(64, node.value);
            return expr(I64, val);
        } else if (node.unit == 'f') {
            var val = llvm.compileFloat(node.value);
            return expr(F32, val);
        } else if (node.unit == 'd') {
            var val = llvm.compileDouble(node.value);
            return expr(F64, val);
        } else if (node.unit == 'c') {
            var val = llvm.compileInteger(8, node.value);
            return expr(CHAR, val);
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            var val = llvm.compileInteger(32, node.value);
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
            var val = llvm.compileFloat(node.value);
            return expr(F32, val);
        } else if (node.unit == 'd') {
            var val = llvm.compileDouble(node.value);
            return expr(F64, val);
        } else if (node.unit) {
        
        } else {
            var val = llvm.compileDouble(node.value);
            return expr(F64, val);
        }
    },
    
    inferString: function(node, isStatement) {
        return STRING;
    },
    
    String: function(node, isStatement) {
        return expr(STRING, llvm.declareString(node.string));
    },
    
    inferList: function(node, isStatement) {
        var listClass = this.builtinModules['List'].genericClasses['List'][0];
        var commonType = null;
        var items = node.items.items;
        for (var i = 0, l = items.length; i < l; ++i) {
            var itemType = this.inferNode(items[i]);
            if (!commonType) {
                commonType = itemType;
            } else {
                commonType = commonType.getCommonType(itemType);
            }
            if (!commonType) {
                throw new MoyaError("Incompatible types in list", node.loc);
            }
        }
        
        var symbol = commonType.toSymbol();
        var listType = this.precompileClass(listClass, [symbol]);
        listType.itemType = commonType;
        return listType;
    },
    
    List: function(node, isStatement) {
        var listType = this.inferList(node);
        var listCons = this.matchFunctionCall('List', [], listType.argSymbols);
        var listNative = llvm.compileCall(listCons.native, []);
        var listObj = expr(listType, listNative);

        var itemType = listType.itemType;
        var addFunc = this.matchMethodCall(listType, "add", [itemType], []);
        var items = node.items.items;
        for (var i = 0, l = items.length; i < l; ++i) {
            var item = this.compileNode(items[i]);
            var cast = this.ensureCorrectType(item, itemType);
            llvm.compileCall(addFunc.native, [listObj.value, cast.value]);
        }

        return listObj;
    },

    inferIdentifier: function(node, isStatement) {
        if (node.id == 'true' || node.id == 'false') {
            return BOOL;
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
            var val = llvm.compileInteger(1, 1);
            return expr(BOOL, val);
        } else if (node.id == 'false') {
            var val = llvm.compileInteger(1, 0);
            return expr(BOOL, val);
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
            var prop = lhs.getProperty(node.right);
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
            var prop = lhs.type.getProperty(node.right);
            if (prop) {
                var offset = this.getInt(prop.offset);
                var variable = llvm.getPointer(lhs.value, [this.getInt(0), offset]);
                return expr(prop.type, llvm.loadVariable(variable, node.right));
            } else {
                throw new MoyaError('Property "' + node.right + '" not found', node.loc);
            }
        } else {
            throw new MoyaError('Property "' + node.right + '" not found', node.loc);
        }
    },
    
    inferAssignment: function(node, isStatement) {
        var rhsType = this.inferNode(node.right);
        if (node.op == T.EqOp) {
            if (node.left.nick == "Identifier") {
                var classScope = this.scope.isProperty(node.left.id);
                if (!classScope) {
                    this.scope.storeVariableType(node.left.id, rhsType);
                }
                return rhsType;
            } else if (node.left.nick == "TypeAssignment") {
                var type = this.evaluateType(node.left.type);
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
            } else if (node.left.nick == "Binary") {
                if (node.left.op == T.IndexOp) {
                    var lhsBinaryType = this.inferNode(node.left.left);
                    var rhsBinaryType = this.inferNode(node.left.right);
                    if (lhsBinaryType instanceof ClassType) {
                        this.matchMethodCall(lhsBinaryType, '[]=', [rhsBinaryType, rhsType], []);
                        return rhsType;
                    } else if (lhsBinaryType instanceof PointerType) {
                        return rhsType;
                    }
                } else if (node.left.op == T.LookupOp) {
                    var lhsBinaryType = this.inferNode(node.left.left);
                    var rhsBinaryType = this.inferNode(node.left.right);
                    if (lhsBinaryType instanceof ClassType) {
                        this.matchMethodCall(lhsBinaryType, '.[]=', [rhsBinaryType, rhsType], []);
                        return rhsType;
                    }
                } else if (node.left.op == T.SliceOp) {
                    var lhsBinaryType = this.inferNode(node.left.left);
                    if (lhsBinaryType instanceof ClassType) {
                        var range = node.left.right;
                        var fromType = this.inferNode(range.from);
                        var toType = this.inferNode(range.to);
                        var byType = range.by ? this.inferNode(range.by) : I32;

                        this.matchMethodCall(lhsBinaryType, '[to]=', [fromType, toType, byType, rhsType], []);
                        return rhsType;
                    }
                }
            }
            
            throw new MoyaError("Illegal assignment", node.loc);
        } else if (node.op == T.AddEqOp || node.op == T.SubtractEqOp || node.op == T.MultiplyEqOp
                   || node.op == T.DivideEqOp || node.op == T.ModEqOp || node.op == T.PowEqOp
                   || node.op == T.ConcatEqOp) {
            var lhsType = this.inferNode(node.left);
            if (lhsType instanceof ClassType) {
                var func = this.matchMethodCall(lhsType, T.opToString(node.op), [rhsType], []);
                if (func) {
                    return func.returnType;
                } else {
                    throw new MoyaError("Operator not supported", node.loc);
                }
            } else {
                return rhsType;
            }
        } else {
            throw new MoyaError("Operator not yet supported", node.loc);
        }
    },
    
    Assignment: function(node, isStatement) {
        var rhs = this.compileNode(node.right);

        if (node.op == T.EqOp) {
            return this.compileAssignment(node.left, rhs);
        } else if (T.isIncrementOp(node.op)) {
            return this.compileIncrement(node, rhs);
        } else {
            throw new MoyaError("Operator not yet supported", node.loc);
        }
    },

    inferPrint: function(node, isStatement) {
        this.inferNode(node.expr);
        return STRING;
    },
    
    Print: function(node, isStatement) {
        var printed = this.compileNode(node.expr);
        if (!printed.type) {
            throw new MoyaError("Unable to print value", node.expr.loc);
        }
        
        var asString = this.valueToString(printed);
        llvm.compileCall(this.printString, [asString]);
    },

    inferUnary: function(node, isStatement) {
        if (node.op == T.DeleteOp) {
            if (node.operand.nick == 'Binary') {
                var operandType = this.inferNode(node.operand.left);
                if (node.operand.op == T.IndexOp) {
                    var indexType = this.inferNode(node.operand.right);
                    if (operandType instanceof ClassType) {
                        var func = this.matchMethodCall(operandType, '-=[]', [indexType], [])
                        if (func) {
                            return func.returnType;
                        } else {
                            throw new MoyaError("Operator not supported", node.loc);
                        }
                    } else {
                        throw new MoyaError("Illegal type for operation", node.loc);
                    }
                } else if (node.operand.op == T.LookupOp) {
                    var indexType = this.inferNode(node.operand.right);
                    if (operandType instanceof ClassType) {
                        var func = this.matchMethodCall(operandType, '-=.[]', [indexType], [])
                        if (func) {
                            return func.returnType;
                        } else {
                            throw new MoyaError("Operator not supported", node.loc);
                        }
                    } else {
                        throw new MoyaError("Illegal type for operation", node.loc);
                    }
                } else if (node.operand.op == T.SliceOp) {
                    if (operandType instanceof ClassType) {
                        var range = node.operand.right;
                        var fromType = this.inferNode(range.from);
                        var toType = this.inferNode(range.to);
                        var argTypes = [fromType, toType];
                        if (range.by) {
                            argTypes.push(this.inferNode(range.by));
                        }
                        
                        var func = this.matchMethodCall(operandType, '-=[to]', argTypes, []);
                        if (func) {
                            return func.returnType;
                        } else {
                            throw new MoyaError("Operator not supported", node.loc);
                        }
                    } else {
                        throw new MoyaError("Illegal type for operation", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for operation", node.loc);
            }
        } else {
            var operandType = this.inferNode(node.operand);
            if (node.op == T.NegativeOp) {
                if (operandType instanceof NumberType || operandType instanceof PointerType) {
                    return operandType;
                } else if (operandType instanceof ClassType) {
                    var func = this.matchMethodCall(operandType, '-neg', [], [])
                    if (func) {
                        return func.returnType;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else if (node.op == T.NotOp) {
                if (operandType instanceof NumberType || operandType instanceof PointerType) {
                    return BOOL;
                } else if (operandType instanceof ClassType) {
                    var func = this.matchMethodCall(operandType, '!', [], [])
                    if (func) {
                        if (func.returnType != BOOL) {
                            throw new MoyaError("Operator must return Bool", node.loc);
                        }
                        return BOOL;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else if (node.op == T.InOp) {
                if (operandType instanceof ClassType) {
                    var func = this.matchMethodCall(operandType, 'in', [], [])
                    if (func) {
                        return func.returnType;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else {
                throw new MoyaError("Operator not yet implemented", node.loc);
            }
        }
    },

    Unary: function(node, isStatement) {
        if (node.op == T.DeleteOp) {
            if (node.operand.nick == 'Binary') {
                var operand = this.compileNode(node.operand.left);
                if (operand.type instanceof ClassType) {
                    if (node.operand.op == T.IndexOp) {
                        var index = this.compileNode(node.operand.right);
                        var ret = this.callMethod(operand, '-=[]', [index], [])
                        if (ret) {
                            return ret;
                        } else {
                            throw new MoyaError("Operator not supported", node.loc);
                        }
                    } else if (node.operand.op == T.LookupOp) {
                        var index = this.compileNode(node.operand.right);
                        var ret = this.callMethod(operand, '-=.[]', [index], [])
                        if (ret) {
                            return ret;
                        } else {
                            throw new MoyaError("Operator not supported", node.loc);
                        }
                    } else if (node.operand.op == T.SliceOp) {
                        var range = node.operand.right;
                        var from = this.compileNode(range.from);
                        var to = this.compileNode(range.to);
                        var by = range.by ? this.compileNode(range.by) : null;
                        var args = [from, to];
                        if (by) {
                            args.push(by);
                        }
                        
                        var ret = this.callMethod(operand, '-=[to]', args, []);
                        if (ret) {
                            return ret;
                        } else {
                            throw new MoyaError("Operator not supported", node.loc);
                        }
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for operation", node.loc);
            }
        } else {
            var operand = this.compileNode(node.operand);
            if (node.op == T.NegativeOp) {
                if (operand.type instanceof NumberType) {
                    return expr(operand.type, llvm.compileNegate(operand.value));
                } else if (operand.type instanceof ClassType) {
                    var ret = this.callMethod(operand, '-neg', [], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else if (node.op == T.NotOp) {
                if (operand.type instanceof NumberType || operand.type instanceof PointerType) {
                    return this.compileTest(operand, 0);
                } else if (operand.type instanceof ClassType) {
                    var ret = this.callMethod(operand, '!', [], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else if (node.op == T.InOp) {
                if (operand.type instanceof ClassType) {
                    var ret = this.callMethod(operand, 'in', [], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            } else {
                throw new MoyaError("Operator not yet implemented", node.loc);
            }
        }
    },
        
    inferBinary: function(node, isStatement) {
        if (node.op == T.IndexOp) {
            if (node.left.nick == 'TypeId' || node.left.nick == 'TypeAssignment') {
                var lhsType = this.evaluateType(node.left);
                var rhsType = this.inferNode(node.right);
                return this.typeWithPointers(lhsType, 1);
            } else {
                var lhsType = this.inferNode(node.left);
                var rhsType = this.inferNode(node.right);
                if (lhsType instanceof NumberType) {
                    throw new MoyaError("Illegal operation", node.loc);
                } else if (lhsType instanceof PointerType) {
                    return lhsType.type;
                } else if (lhsType instanceof ClassType) {
                    var func = this.matchMethodCall(lhsType, '[]', [rhsType], []);
                    if (func) {
                        return func.returnType;
                    } else {
                        throw new MoyaError("Index operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            }
        } else if (node.op == T.SliceOp) {
            var lhsType = this.inferNode(node.left);
            if (lhsType instanceof ClassType) {
                var range = node.right;
                var fromType = this.inferNode(range.from);
                var toType = this.inferNode(range.to);
                var argTypes = [fromType, toType];
                if (range.by) {
                    argTypes.push(this.inferNode(range.by));
                }
                
                var func = this.matchMethodCall(lhsType, '[to]', argTypes, []);
                if (func) {
                    return func.returnType;
                } else {
                    throw new MoyaError("Operator not supported", node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for operation", node.loc);
            }
        } else {
            var lhsType = this.inferNode(node.left);
            var rhsType = this.inferNode(node.right);
            if (node.op == T.AndOp || node.op == T.OrOp) {
                if (lhsType instanceof ClassType) {
                    this.matchMethodCall(lhsType, '!', [],[]);
                }
                if (rhsType instanceof ClassType) {
                    this.matchMethodCall(rhsType, '!', [],[]);
                }
                return BOOL;
            } else if (lhsType == STRING) {
                return STRING;
            } else if (lhsType instanceof NumberType) {
                if (rhsType == STRING) {
                    return STRING;
                } else if (node.op == T.PowOp) {
                    return F64;
                } else if (node.op == T.ConcatOp) {
                    return STRING;
                } else if (T.isMathOp(node.op)) {
                    return this.inferMath(lhsType, rhsType, node);
                } else if (T.isComparisonOp(node.op)) {
                    return BOOL;
                } else {
                    throw new MoyaError("Operator not yet implemented", node.loc);
                }
            } else if (lhsType instanceof PointerType) {
                return lhsType;
            } else if (lhsType instanceof ClassType) {
                var func = this.matchMethodCall(lhsType, T.opToString(node.op), [rhsType], []);
                if (func) {
                    return func.returnType;
                } else if (node.op == T.EqualsOp || node.op == T.NotEqualsOp) {
                    return BOOL;
                } else if (node.op == T.IsInOp || node.op == T.NotInOp) {
                    return BOOL;
                } else {
                    throw new MoyaError("Operator not supported", node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for operation", node.loc);
            }
        }
    },
                
    Binary: function(node, isStatement) {
        if (node.op == T.AndOp) {
            return this.compileLogic(node.left, node.right, true);
        } else if (node.op == T.OrOp) {
            return this.compileLogic(node.left, node.right, false);
        } else if (node.op == T.IndexOp) {
            if (node.left.nick == 'TypeId' || node.left.nick == 'TypeAssignment') {
                var lhsType = this.evaluateType(node.left);
                var bufferType = this.typeWithPointers(lhsType, 1);
                var rhs = this.compileNode(node.right);
                var itemSize = this.getInt(lhsType.size);
                var raw = llvm.compileCall(this.newBuffer, [itemSize, rhs.value]);
                var cast = llvm.compileBitcast(raw, bufferType.native);
                return expr(bufferType, cast);
            } else {
                var lhs = this.compileNode(node.left);
                var index = this.compileNode(node.right);
                if (lhs.type instanceof PointerType) {
                    var variable = llvm.getPointer(lhs.value, [index.value]);
                    var value = llvm.loadVariable(variable);
                    return expr(lhs.type.type, value);
                } else if (lhs.type instanceof ClassType) {
                    var ret = this.callMethod(lhs, '[]', [index], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Index operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal type for operation", node.loc);
                }
            }
        } else if (node.op == T.SliceOp) {
            var left = this.compileNode(node.left);
            if (left.type instanceof ClassType) {
                var range = node.right;
                var from = this.compileNode(range.from);
                var to = this.compileNode(range.to);
                var by = range.by ? this.compileNode(range.by) : null;
                var args = [from, to];
                if (by) {
                    args.push(by);
                }
                
                var ret = this.callMethod(left, '[to]', args, []);
                if (ret) {
                    return ret;
                } else {
                    throw new MoyaError("Index operator not supported", node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for operation", node.loc);
            }
        } else {
            var lhs = this.compileNode(node.left);
            var rhs = this.compileNode(node.right);
            if (lhs.type instanceof NumberType || lhs.type instanceof PointerType) {
                var op = this.instructionForOp(node.op, lhs, rhs);
                if (op) {
                    return op(lhs, rhs, node);
                } else {
                    throw new MoyaError("Operator unknown", node.loc);
                }
            } else if (lhs.type instanceof ClassType) {
                var ret = this.callMethod(lhs, T.opToString(node.op), [rhs], []);
                if (ret) {
                    if (T.isComparisonOp(node.op) && ret.type != BOOL) {
                        throw new MoyaError("Function returned non-boolean type", node.loc);
                    }
                    
                    return ret;
                } else if (node.op == T.EqualsOp) {
                    return expr(BOOL, llvm.compileEquals(lhs.value, rhs.value));
                } else if (node.op == T.NotEqualsOp) {
                    var ret = this.callMethod(lhs, '==', [rhs], []);
                    if (ret) {
                        return this.compileTest(ret, 0);
                    } else {
                        return expr(BOOL, llvm.compileNotEquals(lhs.value, rhs.value));
                    }
                } else if (node.op == T.NotInOp) {
                    var ret = this.callMethod(lhs, 'is in', [rhs], []);
                    if (ret) {
                        return this.compileTest(ret, 0);
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Operator not supported", node.loc);
                }
            } else {
                throw new MoyaError("Illegal type for operation", node.loc);
            }
        }
    },

    inferCall: function(node, isStatement) {
        var callable = node.callable;
        var symbolNodes = null;
        if (callable.nick == "TypeArguments") {
            symbolNodes = callable.args.slice();
            callable = symbolNodes.shift();
        }

        var argTypes = []
        var argNodes = node.args;
        for (var i = 0, l = argNodes.length; i < l; ++i) {
            argTypes[i] = this.inferNode(argNodes[i].expr);
        }
        
        var argSymbols = [];
        if (symbolNodes) {
            for (var i = 0, l = symbolNodes.length; i < l; ++i) {
                argSymbols[i] = this.evaluateSymbol(symbolNodes[i]);
            }
        }

        if (callable.nick == "Identifier") {
            var thiss = this.scope.getThis();
            var func = thiss
                ? this.matchMethodCall(thiss.type, callable.id, argTypes, argSymbols)
                : null;
            if (func) {
                return func.returnType;
            } else {
                var func = this.matchFunctionCall(callable.id, argTypes, argSymbols);
                if (func) {
                    return func.returnType;
                } else {
                    throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
                }
            }
        } else if (callable.nick == "TypeId") {
            var func = this.matchFunctionCall(callable.id, argTypes, argSymbols);
            if (func) {
                return func.returnType;
            } else {
                throw new MoyaError('Function "' + callable.id + '" not found', node.loc);
            }
        } else if (callable.nick == "Get") {
            var lhsType = this.inferNode(callable.left);
            var func = this.matchMethodCall(lhsType, callable.right, argTypes, argSymbols)
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
        var symbolNodes = null;
        if (callable.nick == "TypeArguments") {
            symbolNodes = callable.args.slice();
            callable = symbolNodes.shift();
        }
        
        if (callable.nick == "Identifier") {
            return this.compileCall(callable.id, null, node.args, symbolNodes, node);
        } else if (callable.nick == "TypeId") {
            return this.compileCall(callable.id, null, node.args, symbolNodes, node);
        } else if (callable.nick == "Get") {
            var lhs = this.compileNode(callable.left);
            return this.compileCall(callable.right, lhs, node.args, symbolNodes, node);
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
            llvm.compileReturn(cast.value);
        }
    },
    
    inferIf: function(node, isStatement) {
        var pairs = node.transforms.pairs;
        if (isStatement) {
            for (var i = 0, l = pairs.length; i < l; ++i) {
                var pair = pairs[i];
                var clauseType = this.inferNode(pair.clause);
                if (clauseType instanceof ClassType) {
                    this.matchMethodCall(clauseType, '!', [], []);
                }
                
                this.inferBlock(pair.block);
            }
            
            if (node.else) {
                this.inferBlock(node.else);
            }
        } else {
            var resultType;
            for (var i = 0, l = pairs.length; i < l; ++i) {
                var pair = pairs[i];
                var clauseType = this.inferNode(pair.clause);
                if (clauseType instanceof ClassType) {
                    this.matchMethodCall(clauseType, '!', [], []);
                }

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
        var clauseType = this.inferNode(node.clause);
        if (clauseType instanceof ClassType) {
            this.matchMethodCall(clauseType, '!', [], []);
        }
        this.inferBlock(node.block);
    },
    
    While: function(node, isStatement) {
        var testBlock = llvm.createBlock('test');
        var loopBlock = llvm.createBlock('loop');
        var afterBlock = llvm.createBlock('after');

        llvm.compileJump(testBlock);

        llvm.setInsertBlock(testBlock);
        var condition = this.compileNode(node.clause);
        var eq = this.compileTest(condition, 1);
        llvm.compileConditionalJump(eq.value, loopBlock, afterBlock);
        
        llvm.setInsertBlock(loopBlock);
        var didReturn = this.compileStatements(node.block);
        if (!didReturn) {
            llvm.compileJump(testBlock);
        } else {
            this.markReturned(false);
        }
        
        llvm.setInsertBlock(afterBlock);
    },
};
