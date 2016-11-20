
var fool = require('fool');
var fs = require('fs');
var path = require('path');
var T = require('./syntax');
var parser = require('./grammar').parser;
var mods = require('./module'),
    Module = mods.Module,
    GenericFunction = mods.GenericFunction,
    GenericClass = mods.GenericClass;
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    PointerType = types.PointerType,
    FunctionType = types.FunctionType,
    ClassType = types.ClassType,
    builtinTypes = types.builtinTypes,
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
var scopes = require('./scope'),
    ModuleScope = scopes.ModuleScope,
    FunctionScope = scopes.FunctionScope,
    ClassScope = scopes.ClassScope;

var mils = require('./mil'),
    Expression = mils.Expression;
var MILBuilder = require('./milbuilder').MILBuilder;
var utils = require('./utils'),
    MoyaError = utils.MoyaError;

// *************************************************************************************************

const fileExt = '.moya';
const nameSep = '_';

const builtinModuleNames = [
    'moya',
    'List',
];

// *************************************************************************************************

function Compiler(debugMode) {
    this.moduleCache = {};
    this.typeCache = {};
    this.functionCache = {};
    this.returnFlags = [];
    this.returns = [];
    this.builtinModules = null;
    this.states = [];
    this.scope = null;
    this.debugMode = debugMode;
    this.builder = new MILBuilder(debugMode);
    
    this.searchPaths = process.env['MOYAPATH'].split(path.delimiter);
            
    for (var name in builtinTypes) {
        var type = builtinTypes[name];
        var key = type.class.keyWithSymbols([]);
        this.typeCache[key] = type;
    }
}
exports.Compiler = Compiler;

Compiler.prototype = {
    save: function() {
        var oldScope = this.scope;
        var state = {scope: this.scope, returnFlags: this.returnFlags,
                     returns: this.returns, block: this.builder.insertBlock};
        this.states.push(state);
        
        this.scope = null;
        this.returns = [];
        this.returnFlags = [];
        this.builder.setInsertBlock(null);
        return oldScope;
    },
    
    restore: function() {
        var state = this.states.pop();
        this.scope = state.scope;
        this.returns = state.returns;
        this.returnFlags = state.returnFlags;
        this.builder.setInsertBlock(state.block);
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
        if (this.returnFlags.length) {
            this.returnFlags[this.returnFlags.length-1] = didReturn;
        }
    },

    addReturn: function(expr) {
        this.returns.push(expr);
    },
    
    keyForPointerType: function(pointerType, pointers) {
        return pointerType.class.keyWithSymbols([]) + '*'.repeat(pointers);
    },
    
    keyForFunctionType: function(returnType, argTypes) {
        var key = 'FunctionType:(';
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            key += argTypes[i].toString() + ',';
        }
        if (returnType) {
            key += '):' + returnType.toString();
        } else {
            key += '):void';
        }
        return key;
    },

    getPointerType: function(type, pointers) {
        var pointerType = type.withPointers(pointers);
        var key = this.keyForPointerType(pointerType, 0);
        this.typeCache[key] = pointerType;
        return pointerType;
    },
    
    getFunctionType: function(returnType, argTypes) {
        var key = this.keyForFunctionType(returnType, argTypes);
        var type = this.typeCache[key];
        if (!type) {
            type = this.builder.functionType(returnType, argTypes);
            this.typeCache[key] = type;
        }
        return type;
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
                return this.matchClass(genericClass, argSymbols);
            }.bind(this));
            if (type) {
                return typeNode.pointers ? this.getPointerType(type, typeNode.pointers) : type;
            }
        } else if (typeNode.nick == 'TypeArguments') {
            var argNodes = typeNode.args;
            var type = symbol.matchArgs(argNodes.length-1, function(genericClass, argSymbols) {
                return this.matchClass(genericClass, argSymbols);
            }.bind(this));
            if (type) {
                return typeNode.pointers ? this.getPointerType(type, typeNode.pointers) : type;
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
    
    // ---------------------------------------------------------------------------------------------

    compileProgram: function(moduleName, sourcePath, source) {
        var progMod = this.createModule(moduleName, sourcePath, source);

        this.declareExternals();

        try {
            if (this.debugMode == "ast") {
                var ast = parser.parse(progMod.source);
                console.log(ast+'');
            } else {
                this.compileModule(progMod, false);
                
                for (var i = 0, l = this.builder.classes.length; i < l; ++i) {
                    var cls = this.builder.classes[i];
                    this.inheritMethods(cls);
                }
                
                if (this.debugMode == "mil") {
                    var output = this.builder.writeMIL();
                    console.log(output);
                } else {
                    this.builder.compile(this.moduleCache);
                    
                    if (this.debugMode != "ir") {
                        this.builder.run();
                    }
                }
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
            // throw exc;
        }
    },

    declareExternals: function() {
        this.printString = this.createCFunction('printString', VOID, [STRING]);
        this.concatString = this.createCFunction('concatString', STRING, [STRING, STRING]);
        this.boolToString = this.createCFunction('boolToString', STRING, [BOOL]);
        this.charToString = this.createCFunction('charToString', STRING, [CHAR]);
        this.intToString = this.createCFunction('intToString', STRING, [I64]);
        this.doubleToString = this.createCFunction('doubleToString', STRING, [F64]);
        this.powerdd = this.createCFunction('powerdd', F64, [F64, F64]);
        this.newObject = this.createCFunction('newObject', POINTER, [I32]);
        this.newBuffer = this.createCFunction('newBuffer', POINTER, [I32, I32]);
    },
    
    compileModule: function(mod, isBuiltin) {
        var ast = parser.parse(mod.source);

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
                this.collectImportSet(node, imports, mod.path);
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

        this.save();
        this.scope = new ModuleScope(mod);
        mod.main = this.matchFunctionCall('@main', [], []);
        this.restore();
        
        return mod;
    },

    inheritMethods: function(classType) {
        var baseType = classType.base;
        if (baseType) {
            this.inheritMethods(baseType);

            for (var i = 0, l = baseType.methods.length; i < l; ++i) {
                var method = baseType.methods[i];
                var argTypes = method.argTypes.slice();
                argTypes.shift(); // Remove the "self" arg
                this.matchMethodCall(classType, method.name, argTypes, method.argSymbols);
            }
        }
    },
    
    // ---------------------------------------------------------------------------------------------

    compileImport: function(moduleName, sourcePath, isBuiltin) {
        var mod = this.moduleCache[sourcePath];
        if (mod) {
            return mod;
        } else {
            mod = this.createModule(moduleName, sourcePath);
            return this.compileModule(mod, isBuiltin);
        }
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
    
    createModule: function(moduleName, sourcePath, source) {
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
        
        var mod = new Module(moduleName, sourcePath, source);
        this.moduleCache[sourcePath] = mod;
        return mod;
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
    
    // ---------------------------------------------------------------------------------------------
    
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

    // ---------------------------------------------------------------------------------------------

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
                return new T.parseTypeId(node.loc, 'Char', node.pointers);
            }
        } else {
            return new T.parseTypeId(node.loc, 'Int8', node.pointers);
        }
    },

    createCFunction: function(name, returnType, argTypes) {
        var cfunc = this.builder.cfunc(name, returnType, argTypes);
        cfunc.type = this.getFunctionType(returnType, argTypes);
        return cfunc;
    },
        
    // ---------------------------------------------------------------------------------------------

    matchClass: function(genericClass, argSymbols) {
        var key = genericClass.keyWithSymbols(argSymbols);
        var classType = this.typeCache[key];
        if (classType) {
            return classType;
        } else {
            return this.createClass(key, genericClass, argSymbols);
        }
    },
    
    createClass: function(key, genericClass, argSymbols) {
        var classType = new ClassType(genericClass, argSymbols);
        this.typeCache[key] = classType;
        this.builder.classes.push(classType);
        
        this.save();
        this.scope = new ModuleScope(genericClass.module);
        
        if (genericClass.base) {
            classType.base = this.evaluateType(genericClass.base);
        }

        var classScope = this.pushScope(new ClassScope(classType));
        var funcScope = this.pushScope(new FunctionScope());
                
        classType.initFunc = this.compileClassInit(classType, classScope);

        this.popScope();
        this.popScope();
        this.restore();
        
        return classType;
    },

    compileClassInit: function(classType, classScope) {
        var name = classType.class.qualifiedName + '_INIT';
        var genericFunc = new GenericFunction(name);
        genericFunc.module = classType.class.module;

        var instFunc = this.builder.func(genericFunc, [], [classType], []);
        instFunc.type = this.getFunctionType(VOID, [classType]);
        this.functionCache[name] = instFunc;

        var self = this.builder.stub(classType);
        classScope.self = self;
        instFunc.argNames.push('self');
        instFunc.argStubs.push(self);
        
        var block = this.builder.block('entry', instFunc);
        this.builder.setInsertBlock(block);

        if (classType.base) {
            var castSelf = this.builder.bitCast(self, classType.base);
            var ret = this.builder.call(classType.base.initFunc, [castSelf]);
            this.builder.insert(ret);
        }
        
        var tableVar = this.builder.gep(self, [this.int(0), this.int(0)], POINTER);
        var methodTable = this.builder.methodTable(classType);
        var castTable = this.builder.bitCast(methodTable, VTABLEPOINTER);
        this.builder.storeVariable(tableVar, castTable);

        var props = classType.class.props;
        for (var i = 0, l = props.length; i < l; ++i) {
            var genericProp = props[i];
            var prop = classType.addProperty(genericProp.name);
            if (genericProp.type) {
                prop.type = this.evaluateType(genericProp.type);
            }

            var rhs = this.compileNode(genericProp.body);
            if (prop.type) {
                rhs = this.valueToType(rhs, prop.type);
            } else {
                prop.type = rhs.type;
            }

            var offset = this.builder.propOffset(classType, prop.name);
            var variable = this.builder.gep(self, [this.int(0), offset], prop.type);
            this.builder.storeVariable(variable, rhs);
        }

        this.builder.return();
        
        return instFunc;
    },

    // ---------------------------------------------------------------------------------------------

    callFunction: function(name, args, argSymbols) {
        var argTypes = args.map(function(arg) { return arg.type; });
        var func = this.matchFunctionCall(name, argTypes, argSymbols);
        if (func) {
            var castArgs = args.map(function(arg, i) {
                return this.valueToType(arg, func.argTypes[i])
            }.bind(this));
                        
            for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
                var defaultFunc = func.argDefaults[i];
                if (defaultFunc) {
                    var defaultValue = this.builder.call(defaultFunc, []);
                    castArgs[i] = this.valueToType(defaultValue, func.argTypes[i]);
                }
            }
            
            return this.builder.call(func, castArgs);
        }
    },

    callMethod: function(object, name, args, argSymbols) {
        var argTypes = args.map(function(arg) { return arg.type; });
        var func = this.matchMethodCall(object.type, name, argTypes, argSymbols);
        if (func) {
            var castArgs = args.slice();
            castArgs.unshift(object);

            castArgs = castArgs.map(function(arg, i) {
                return this.valueToType(arg, func.argTypes[i])
            }.bind(this));

            if (castArgs.length < func.argTypes.length) {
                for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
                    var defaultFunc = func.argDefaults[i];
                    if (defaultFunc) {
                        var defaultValue = this.builder.call(defaultFunc, []);
                        castArgs[i] = this.valueToType(defaultValue, func.argTypes[i]);
                    }
                }
            }
                        
            var tableVar = this.builder.gep(object, [this.int(0), this.int(0)], POINTER);
            var table = this.builder.loadVariable(tableVar, "table");
            var methodVar = this.builder.gep(table, [this.builder.methodOffset(func)], POINTER);
            var method = this.builder.loadVariable(methodVar, name+".func");
            var castMethod = this.builder.bitCast(method, func.type.pointerType);
                
            return this.builder.call(castMethod, castArgs, func.type.returnType);
        }
    },
                    
    matchFunctionCall: function(name, argTypes, argSymbols) {
        var oldScope = this.save();
            
        var result = oldScope.lookupFunction(name, function(genericFunc) {
            this.scope = new ModuleScope(genericFunc.module);
            if (genericFunc.isConstructor) {
                this.pushScope(new ClassScope(null));
            }
            this.pushScope(new FunctionScope());
            var instFunc = this.matchCall(genericFunc, null, argTypes, argSymbols);
            this.popScope();
                        
            if (instFunc) {
                return instFunc;
            }
        }.bind(this));

        this.restore();
        
        return result;
    },

    matchMethodCall: function(classType, name, argTypes, argSymbols) {
        this.save();

        var result = classType.lookupMethod(name, function(genericFunc, ownerType) {
            this.scope = new ModuleScope(ownerType.class.module);
            this.pushScope(new ClassScope(ownerType));
            this.pushScope(new FunctionScope());
            var instFunc = this.matchCall(genericFunc, ownerType, argTypes, argSymbols);
            this.popScope();
            this.popScope();

            if (instFunc) {
                return instFunc;
            }
        }.bind(this));

        this.restore();
        
        return result;
    },

    matchCall: function(func, ownerType, argTypes, argSymbols) {
        var declArgs = func.args;
        if (argTypes.length > declArgs.length || argTypes.length < func.minimumArgCount) {
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
        
        // Define symbols by pulling them from argument values
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var declArg = declArgs[i];
            var argType = argTypes[i];
            if (declArg.type) {
                var symbol = argType.toSymbol();
                this.scope.expandType(declArg.type, symbol);
            }
        }
        
        // Evaluate all type arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argType = argTypes[i];
            var declArg = declArgs[i];
            if (declArg.type) {
                var expectedType = this.evaluateType(declArg.type);
                if (!expectedType || !expectedType.isTypeOrSubclass(argType)) {
                    return null;
                } else {
                    argTypes[i] = expectedType;
                }
            }
        }

        var argDefaults = [];
        for (var i = argTypes.length, l = declArgs.length; i < l; ++i) {
            var declArg = declArgs[i];
            
            if (declArg.defaultValue) {
                var qualifiedName = func.qualifiedName + '.' + declArg.innerName + '_DEFAULT';
                var defaultFunc = this.createExprFunction(qualifiedName, declArg.defaultValue);
                argDefaults[i] = defaultFunc;
                
                if (declArg.type) {
                    var expectedSymbol = defaultFunc.returnType.toSymbol();
                    this.scope.expandType(declArg.type, expectedSymbol);
                } else {
                    argTypes[i] = defaultFunc.returnType;
                }
            }
            
            if (declArg.type) {
                argTypes[i] = this.evaluateType(declArg.type);
            }
        }
    
        // Ensure all symbol arguments are defined
        for (var name in this.scope.localSymbols) {
            if (!this.scope.localSymbols[name]) {
                return null;
            }
        }
    
        var funcSymbols = [];
        for (var i = 0, l = func.symbolNames.length; i < l; ++i) {
            var symbolName = func.symbolNames[i];
            var funcSymbol = this.scope.localSymbols[symbolName];
            funcSymbols.push(funcSymbol);
        }
        
        return this.getFunction(func, ownerType, funcSymbols, argTypes, argDefaults);
    },
    
    getFunction: function(func, ownerType, argSymbols, argTypes, argDefaults) {
        var key = ownerType
            ? ownerType.keyForMethod(func.name, argTypes, argSymbols)
            : func.keyForCall(argTypes, argSymbols);
        var instFunc = this.functionCache[key];
        if (instFunc) {
            return instFunc;
        } else {
            if (func.isCFunction) {
                var returnType = this.evaluateType(func.returns);
                return this.createCFunction(func.name, returnType, argTypes);
            } else {
                return this.createFunction(key, func, ownerType, argSymbols, argTypes, argDefaults);
            }
        }
    },
    
    createFunction: function(key, func, ownerType, argSymbols, argTypes, argDefaults) {
        var instFunc = this.builder.func(func, argSymbols, argTypes, argDefaults);
        this.functionCache[key] = instFunc;
        
        var block = this.builder.block('entry', instFunc);
        this.builder.setInsertBlock(block);

        var argNames = instFunc.argNames;
        var argStubs = instFunc.argStubs;
        var castSelf = null;
        var explicitReturn = false;
        
        if (func.isConstructor) {
            var classType = this.matchClass(func.class, argSymbols);
            instFunc.classType = classType;
            instFunc.returnType = classType;
            explicitReturn = true;
            
            var classScope = this.scope.previous;
            classScope.setClass(classType);
            
            var objectSize = this.builder.sizeOfObject(classType);
            var raw = this.builder.call(this.newObject, [objectSize]);
            castSelf = this.builder.bitCast(raw, classType);
            classScope.self = castSelf;
            
            var called = this.builder.call(classType.initFunc, [castSelf]);
            this.builder.insert(called);
        } else {
            if (func.returns) {
                instFunc.returnType = this.evaluateType(func.returns);
                explicitReturn = true;
            }
        }

        if (ownerType) {
            instFunc.selfType = ownerType;
            ownerType.addMethod(instFunc);
            
            var argStub = this.builder.stub(ownerType);
            argStubs.push(argStub);
            argNames.push('this');
            instFunc.argTypes.unshift(ownerType);
            instFunc.argDefaults.unshift(null);

            var classScope = this.scope.previous;
            this.scope.storeVariable('this', argStub, this.builder);
            classScope.self = this.scope.lookupVariableValue('this', this.builder);
            
            if (func.isBoolOverride) {
                if (instFunc.returnType && instFunc.returnType != BOOL) {
                    throw new MoyaError("Comparison operators must return bool", func.loc);
                }
                
                instFunc.returnType = BOOL;
                explicitReturn = true;
            }
        }
                        
        // Store arguments on scope
        var argItems = func.args;
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argItem = argItems[i];
            var argName = argItem.innerName;
            var argType = argTypes[i];
                        
            var argStub = this.builder.stub(argType);
            argStubs.push(argStub);
            argNames.push(argName);

            this.scope.storeVariable(argName, argStub, this.builder);
        }

        var didReturn = this.compileStatements(func.body);

        if (castSelf) {
            this.builder.return(castSelf);
            didReturn = true;
        }
        
        var returnType = explicitReturn ? instFunc.returnType : null;
        if (!explicitReturn) {
            for (var i = 0, l = this.returns.length; i < l; ++i) {
                var ret = this.returns[i];
                if (!returnType) {
                    returnType = ret.expr.type;
                } else {
                    returnType = returnType.getCommonType(ret.expr.type);
                }
            }
        }
        
        for (var i = 0, l = this.returns.length; i < l; ++i) {
            var ret = this.returns[i];
            var cast = this.valueToType(ret.expr, returnType);
            ret.expr = cast;
        }
        
        instFunc.returnType = returnType || VOID;
        
        if (!didReturn) {
            if (instFunc.returnType && instFunc.returnType != VOID) {
                throw new MoyaError("Return required", instFunc.func.loc);
            } else {
                instFunc.returnType = VOID;
                this.builder.return();
            }
        }
        
        instFunc.type = this.getFunctionType(instFunc.returnType, instFunc.argTypes);

        return instFunc;
    },
    
    createExprFunction: function(name, expr) {
        var mod = this.scope.rootModule;
        this.save();
        this.scope = new ModuleScope(mod);
        
        var genericFunc = new GenericFunction(name);
        genericFunc.module = mod;
        
        var instFunc = this.builder.func(genericFunc, [], [], []);

        var block = this.builder.block('entry', instFunc);
        this.builder.setInsertBlock(block);

        var result = this.compileNode(expr);
        this.builder.return(result);

        instFunc.returnType = result.type;
        instFunc.type = this.getFunctionType(result.type, []);
        
        this.restore();
        return instFunc;
    },
    
    // ---------------------------------------------------------------------------------------------

    int: function(val, size) {
        return this.builder.int(val, size || 32);
    },
    
    valueToType: function(value, expectedType, castObjects) {
        if (!expectedType) {
            return value;
        } else if (expectedType == value.type) {
            return value;
        } else if (expectedType == BOOL) {
            return this.compileTest(value, 0, T.NotEqualsOp);
        } else if (expectedType instanceof NumberType) {
            return this.valueToNumber(value, expectedType);
        } else if (castObjects) {
            return value;
        } else if (expectedType.isTypeOrSubclass(value.type)) {
            return this.builder.bitCast(value, expectedType);
        } else {
            throw new MoyaError("Object type conversion not yet implemented");
        }
    },
            
    valueToNumber: function(val, type) {
        if (val.type == type) {
            return val;
        } else if (type == STRING) {
            return this.valueToString(val);
        } else if (type instanceof NumberType) {
            return this.builder.numCast(val, type);
        } else {
            throw new MoyaError("Illegal cast");
        }
    },

    valueToString: function(val, node) {
        if (!val.type || val.type == VOID) {
            throw new MoyaError('Unable to convert to string', node ? node.loc : null);
        } else if (val.type == STRING) {
            return val;
        } else if (val.type == CHAR) {
            return this.builder.call(this.charToString, [val]);
        } else if (val.type instanceof NumberType) {
            if (val.type == I1) {
                return this.builder.call(this.boolToString, [val]);
            } else if (val.type == I1 || val.type == I8 || val.type == I16 || val.type == I32 || val.type == CHAR) {
                return this.builder.call(this.intToString, [this.valueToNumber(val, I64)]);
            } else if (val.type == I64) {
                return this.builder.call(this.intToString, [val]);
            } else if (val.type == F32) {
                return this.builder.call(this.doubleToString, [this.valueToNumber(val, F64)]);
            } else if (val.type == F64) {
                return this.builder.call(this.doubleToString, [val]);
            }
        } else {
            // XXXjoe We should be calling toString method on object
            return this.builder.string(val.type.toString());
        }
    },

    getTypeDefault: function(type) {
        if (type instanceof NumberType) {
            if (type == F32) {
                return this.builder.float32(0);
            } else if (type == F64) {
                return this.builder.float64(0);
            } else {
                return this.builder.int(0, type.bitSize);
            }
        } else {
            throw new MoyaError("Default constructor NYI");
        }
    },
    
    // ---------------------------------------------------------------------------------------------
    
    compileStatements: function(block) {
        if (block) {
            var nodes = block.items;
            this.returnFlags.push(false);
            for (var i = 0, l = nodes.length; i < l; ++i) {
                var expr = this.compileNode(nodes[i], true);
                if (expr instanceof Expression) {
                    this.builder.insert(expr);
                }
            }
            var didReturn = this.returnFlags.pop();
            this.markReturned(didReturn);
            
            return didReturn;
        } else {
            return false;
        }
    },
    
    compileExpression: function(block) {
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
                throw new MoyaError("Illegal types for expression", node.loc);
            }
        }
        return result;
    },
    
    compileNode: function(node, isStatement) {
        var ff = this[node.nick];
        if (!ff) { D&&D(node.nick); }
        return ff.call(this, node, isStatement);
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
                throw new MoyaError('Function not found', node.loc);
            }
        }
    },
    
    compileTest: function(condition, n, op) {
        if (!op) op = T.EqualsOp;
        
        if (condition.type == I1 || condition.type == I8 || condition.type == I16
            || condition.type == I32 || condition.type == I64 || condition.type == CHAR) {
            var zero = this.builder.int(n, condition.type.bitSize);
            return this.builder.compare(op, condition, zero);
        } else if (condition.type == F32) {
            var zero = this.builder.float32(n);
            return this.builder.compare(op, condition, zero);
        } else if (condition.type == F64) {
            var zero = this.builder.float64(n);
            return this.builder.compare(op, condition, zero);
        } else if (condition.type instanceof ClassType) {
            var ret = this.callMethod(condition, '!', [], []);
            if (ret) {
                var zero = this.builder.int(n ? 0 : 1, 1);
                return this.builder.compare(op, ret, zero);
            } else {
                throw new MoyaError("Invalid type for truth test", condition.loc);
            }
        } else {
            throw new MoyaError("Invalid type for truth test", condition.loc);
        }
    },
        
    compileBinary: function(op, lhs, rhs, node) {
        if (lhs.type instanceof ClassType) {
            var ret = this.callMethod(lhs, T.opToString(node.op), [rhs], []);
            if (ret) {
                if (T.isComparisonOp(node.op) && ret.type != BOOL) {
                    throw new MoyaError("Function returned non-boolean type", node.loc);
                }
                
                return ret;
            } else if (node.op == T.EqualsOp) {
                return this.builder.compare(T.EqualsOp, lhs, rhs);
            } else if (node.op == T.NotEqualsOp) {
                var ret = this.callMethod(lhs, '==', [rhs], []);
                if (ret) {
                    return this.compileTest(ret, 0);
                } else {
                    return this.builder.compare(T.NotEqualsOp, lhs, rhs);
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
            if (lhs.type == STRING) {
                return this.compileStringMath(op, lhs, rhs, node);
            } else if (lhs.type instanceof PointerType) {
                return this.compilePointerMath(op, lhs, rhs, node);
            } else if (op == T.PowOp || op == T.PowEqOp) {
                return this.compilePow(lhs, rhs, node);
            } else if (op == T.ConcatOp || op == T.ConcatEqOp) {
                return this.compileConcat(lhs, rhs, node);
            } else if (T.isMathOp(op)) {
                return this.compileBinaryMath(op, lhs, rhs, node);
            } else if (T.isComparisonOp(op)) {
                return this.compileComparison(op, lhs, rhs, node);
            } else {
                throw new MoyaError("Operator unknown", node.loc);
            }
        }
    },

    compileBinaryMath: function(op, lhs, rhs, node) {
        if (lhs.type instanceof NumberType && rhs.type instanceof NumberType) {
            if (lhs.type == rhs.type) {
                return this.builder.math(op, lhs, rhs);
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.builder.numCast(lhs, rhs.type);
                return this.builder.math(op, cast, rhs);
            } else {
                var cast = this.builder.numCast(rhs, lhs.type);
                return this.builder.math(op, lhs, cast);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
        
    compilePointerMath: function(op, lhs, rhs, node) {
        if (!(rhs.type instanceof NumberType)) {
            throw new MoyaError("Illegal types for operation", node.loc);
        }

        if (op == T.AddOp || op == T.AddEqOp) {
            return this.builder.gep(lhs, [rhs], lhs.type);
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },

    compileStringMath: function(op, lhs, rhs, node) {
        if (op == T.AddOp || op == T.AddEqOp || op == T.ConcatOp || op == T.ConcatEqOp) {
            return this.compileConcat(lhs, rhs, node);
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },

    compilePow: function(lhs, rhs, node) {
        var left = this.valueToNumber(lhs, F64);
        var right = this.valueToNumber(rhs, F64);
        return this.builder.call(this.powerdd, [left, right]);
    },
    
    compileConcat: function(lhs, rhs, node) {
        var left = this.valueToString(lhs);
        var right = this.valueToString(rhs);
        return this.builder.call(this.concatString, [left, right]);
    },
    
    compileComparison: function(op, lhs, rhs, node) {
        if (lhs.type instanceof NumberType && rhs.type instanceof NumberType) {
            if (lhs.type == rhs.type) {
                return this.builder.compare(op, lhs, rhs);
            } else if (rhs.type == F64 || rhs.type == F32) {
                var cast = this.valueToNumber(lhs, rhs.type);
                return this.builder.compare(op, cast, rhs);
            } else {
                var cast = this.valueToNumber(rhs, lhs.type);
                return this.builder.compare(op, lhs, cast);
            }
        } else {
            throw new MoyaError("Illegal types for operation", node.loc);
        }
    },
                
    compileAssignment: function(left, rhs, isStatement) {
        if (left.nick == "Identifier") {
            var classScope = this.scope.isProperty(left.id);
            if (classScope) {
                var prop = classScope.classType.getProperty(left.id);
                if (prop) {
                    var offset = this.builder.propOffset(classScope.classType, prop.name);
                    var offsets = [this.int(0), offset];
                    var variable = this.builder.gep(classScope.self, offsets, prop.type);

                    var cast = this.valueToType(rhs, prop.type);
                    this.builder.storeVariable(variable, cast);
                }
            } else {
                var type = this.scope.lookupVariableType(left.id, this);
                if (!type) {
                    type = rhs.type;
                }
                var cast = this.valueToType(rhs, type);
                return this.scope.storeVariable(left.id, cast, this.builder);
            }
        } else if (left.nick == "TypeAssignment") {
            var type = this.evaluateType(left.type);
            var cast = this.valueToType(rhs, type);
            return this.scope.storeVariable(left.name, cast, this.builder);
        } else if (left.nick == "Get") {
            var object = this.compileNode(left.left);
            if (object.type instanceof ClassType) {
                var prop = object.type.getProperty(left.right);
                if (prop) {
                    var offset = this.builder.propOffset(object.type, prop.name);
                    var variable = this.builder.gep(object, [this.int(0), offset], prop.type);
                    return this.builder.storeVariable(variable, rhs);
                } else {
                    throw new MoyaError('Property not found', left.loc);
                }
            } else {
                throw new MoyaError('Property not found', left.loc);
            }
            return rhs;
        } else if (left.nick == "Binary") {
            if (left.op == T.IndexOp) {
                var object = this.compileNode(left.left);
                var index = this.compileNode(left.right);
                if (object.type instanceof PointerType) {
                    var variable = this.builder.gep(object, [index], object.type.type);
                    return this.builder.storeVariable(variable, rhs);
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
                    throw new MoyaError("Illegal types for operation", node.loc);
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
           var incremented = this.compileBinary(node.op, lhs, rhs, node);
           return this.compileAssignment(node.left, incremented);
       }
    },
    
    compileIfBlock: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.builder.block('after');
        
        var startReturnCount = pairs.length + 1;
        var returnCount = startReturnCount;
        
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.builder.block('then');
            var elseBlock = this.builder.block('else');

            this.builder.conditionalJump(eq, ifBlock, elseBlock);
            this.builder.setInsertBlock(ifBlock);
            var didReturn = this.compileStatements(pair.block);
            
            if (didReturn) {
                --returnCount;
            } else {
                this.builder.jump(afterBlock);
            }

            this.builder.setInsertBlock(elseBlock);
        }
        
        if (node.else) {
            var didReturn = this.compileStatements(node.else);
            if (didReturn) {
                --returnCount;
            } else {
                this.builder.jump(afterBlock);
            }
        } else {
            this.builder.jump(afterBlock);
        }
        
        if (startReturnCount != returnCount) {
            this.markReturned(!returnCount);
        }
        
        this.builder.setInsertBlock(afterBlock);
    },
    
    compileIfExpression: function(node) {
        var pairs = node.transforms.pairs;
        
        var afterBlock = this.builder.block('result');
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        for (var i = 0, l = pairs.length; i < l; ++i) {
            var pair = pairs[i];
            var condition = this.compileNode(pair.clause);
            var eq = this.compileTest(condition, 1);
            
            var ifBlock = this.builder.block('then');
            elseBlock = this.builder.block('else');

            this.builder.conditionalJump(eq, ifBlock, elseBlock);
            this.builder.setInsertBlock(ifBlock);
            var result = this.compileNode(pair.block);
            if (!resultType) {
                resultType = result.type;
            } else if (result.type != resultType) {
                throw new MoyaError("Different types in expression", pair.block.loc);
            }
            this.builder.jump(afterBlock);

            this.builder.setInsertBlock(elseBlock);
            
            exprs.push(result);
            blocks.push(ifBlock);
        }
        
        if (node.else) {
            var result = this.compileNode(node.else);
            exprs.push(result);
            blocks.push(elseBlock);
        } else {
            var result = this.getTypeDefault(resultType);
            exprs.push(result);
            blocks.push(elseBlock);
        }

        this.builder.jump(afterBlock);
        this.builder.setInsertBlock(afterBlock);

        return this.builder.phi(resultType, exprs, blocks);
    },

    compileLogic: function(left, right, isAnd) {
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        var one = this.builder.int(1, 1);
        var zero = this.builder.int(0, 1);
        
        var condition1 = this.compileNode(left);
        var eq1 = this.compileTest(condition1, 0);
        
        var startBlock = this.builder.insertBlock;
        var thenBlock = this.builder.block('then');
        var failedBlock = this.builder.block('failed');
        var afterBlock = this.builder.block('after');

        if (isAnd) {
            this.builder.conditionalJump(eq1, afterBlock, thenBlock);
        } else {
            this.builder.conditionalJump(eq1, thenBlock, afterBlock);
        }

        this.builder.setInsertBlock(thenBlock);
        var condition2 = this.compileNode(right);
        var eq2 = this.compileTest(condition2, 0);

        if (isAnd) {
            this.builder.conditionalJump(eq2, failedBlock, afterBlock);
        } else {
            this.builder.conditionalJump(eq2, afterBlock, failedBlock);
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

        this.builder.setInsertBlock(failedBlock);
        this.builder.jump(afterBlock);
        this.builder.setInsertBlock(afterBlock);

        return this.builder.phi(BOOL, exprs, blocks);
    },
                                            
    // ---------------------------------------------------------------------------------------------

    Set: function(block, isStatement) {
        var nodes = block.items;
        if (nodes.length == 1) {
            return this.compileNode(nodes[0]);
        } else {
            return this.compileExpression(block);
        }
    },
            
    TypeId: function(node, isStatement) {
        var type = this.evaluateType(node);
        return this.builder.sizeOfType(type);
    },
        
    Cast: function(node, isStatement) {
        var type = this.evaluateType(node.type);
        var value = this.compileNode(node.expr);
        return this.valueToType(value, type, true);
    },
        
    Integer: function(node, isStatement) {
        if (node.unit == 'i1') {
            return this.builder.int(node.value, 1);
        } else if (node.unit == 'i8') {
            return this.builder.int(node.value, 8);
        } else if (node.unit == 'i16') {
            return this.builder.int(node.value, 16);
        } else if (node.unit == 'i32') {
            return this.builder.int(node.value, 32);
        } else if (node.unit == 'i64') {
            return this.builder.int(node.value, 64);
        } else if (node.unit == 'f') {
            return this.builder.float32(node.value);
        } else if (node.unit == 'd') {
            return this.builder.float64(node.value);
        } else if (node.unit == 'c') {
            return this.builder.int(node.value, 8);
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            return this.builder.int(node.value, 32);
        }
    },
        
    Float: function(node, isStatement) {
        if (node.unit == 'f') {
            return this.builder.float32(node.value);
        } else if (node.unit == 'd') {
            return this.builder.float64(node.value);
        } else if (node.unit) {
            throw new MoyaError("Units not yet implemented", node.loc);
        } else {
            return this.builder.float64(node.value);
        }
    },
        
    String: function(node, isStatement) {
        return this.builder.string(node.string);
    },
    
    List: function(node, isStatement) {
        var commonType = null;
        var itemValues = [];
        var items = node.items.items;
        for (var i = 0, l = items.length; i < l; ++i) {
            var itemValue = this.compileNode(items[i]);
            itemValues[i] = itemValue;
            if (!commonType) {
                commonType = itemValue.type;
            } else {
                commonType = commonType.getCommonType(itemValue.type);
            }
            if (!commonType) {
                throw new MoyaError("Incompatible types in list", node.loc);
            }
        }
        
        var symbol = commonType.toSymbol();
        var listClass = this.builtinModules['List'].classes['List'][0];
        var listType = this.matchClass(listClass, [symbol]);

        var listCons = this.matchFunctionCall('List', [], listType.argSymbols);
        var listObj = this.builder.call(listCons, []);

        var addFunc = this.matchMethodCall(listType, "add", [commonType], []);
        for (var i = 0, l = itemValues.length; i < l; ++i) {
            var item = itemValues[i];
            var cast = this.valueToType(item, commonType);
            var ret = this.builder.call(addFunc, [listObj, cast]);
            this.builder.insert(ret);
        }

        return listObj;
    },
    
    Identifier: function(node, isStatement) {
        if (node.id == 'true') {
            return this.builder.true();
        } else if (node.id == 'false') {
            return this.builder.false();
        } else if (node.id == 'this') {
            var thiss = this.scope.getThis();
            if (thiss) {
                return thiss;
            } else {
                throw new MoyaError('"this" not relevant here', node.loc);
            }
        } else {
            var result = this.scope.lookupVariableValue(node.id, this.builder);
            if (result) {
                return result;
            } else {
                throw new MoyaError('Name not found', node.loc);
            }
        }
    },
    
    Get: function(node, isStatement) {
        var lhs = this.compileNode(node.left);
        if (lhs.type instanceof ClassType) {
            var prop = lhs.type.getProperty(node.right);
            if (prop) {
                var offset = this.builder.propOffset(lhs.type, prop.name);
                var variable = this.builder.gep(lhs, [this.int(0), offset], prop.type);
                return this.builder.loadVariable(variable, node.right);
            } else {
                throw new MoyaError('Property not found', node.loc);
            }
        } else {
            throw new MoyaError('Property not found', node.loc);
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
    
    Print: function(node, isStatement) {
        var printed = this.compileNode(node.expr);
        var asString = this.valueToString(printed, node.expr);
        return this.builder.call(this.printString, [asString]);
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
                    throw new MoyaError("Illegal types for operation", node.loc);
                }
            } else {
                throw new MoyaError("Illegal types for operation", node.loc);
            }
        } else {
            var operand = this.compileNode(node.operand);
            if (node.op == T.NegativeOp) {
                if (operand.type instanceof NumberType) {
                    return this.builder.negate(operand);
                } else if (operand.type instanceof ClassType) {
                    var ret = this.callMethod(operand, '-neg', [], []);
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal types for operation", node.loc);
                }
            } else if (node.op == T.NotOp) {
                if (operand.type instanceof NumberType || operand.type instanceof PointerType) {
                    return this.compileTest(operand, 0);
                } else if (operand.type instanceof ClassType) {
                    var ret = this.callMethod(operand, '!', [], []);
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal types for operation", node.loc);
                }
            } else if (node.op == T.InOp) {
                if (operand.type instanceof ClassType) {
                    var ret = this.callMethod(operand, 'in', [], []);
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal types for operation", node.loc);
                }
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
        } else if (node.op == T.IndexOp) {
            if (node.left.nick == 'TypeId' || node.left.nick == 'TypeAssignment') {
                var lhsType = this.evaluateType(node.left);
                var bufferType = this.getPointerType(lhsType, 1);
                var itemSize = this.builder.sizeOfType(lhsType);
                var rhs = this.compileNode(node.right);
                var rawBuffer = this.builder.call(this.newBuffer, [itemSize, rhs]);
                return this.builder.bitCast(rawBuffer, bufferType);
            } else {
                var lhs = this.compileNode(node.left);
                var index = this.compileNode(node.right);
                if (lhs.type instanceof PointerType) {
                    var variable = this.builder.gep(lhs, [index], lhs.type.type);
                    return this.builder.loadVariable(variable);
                } else if (lhs.type instanceof ClassType) {
                    var ret = this.callMethod(lhs, '[]', [index], [])
                    if (ret) {
                        return ret;
                    } else {
                        throw new MoyaError("Index operator not supported", node.loc);
                    }
                } else {
                    throw new MoyaError("Illegal types for operation", node.loc);
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
                throw new MoyaError("Illegal types for operation", node.loc);
            }
        } else {
            var lhs = this.compileNode(node.left);
            var rhs = this.compileNode(node.right);
            return this.compileBinary(node.op, lhs, rhs, node);
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
    
    Return: function(node, isStatement) {
        this.markReturned(true);
        
        var value = this.compileNode(node.expr);
        var returned = this.builder.return(value);
        this.addReturn(returned);
    },
    
    If: function(node, isStatement) {
        if (isStatement) {
            return this.compileIfBlock(node);
        } else {
            return this.compileIfExpression(node);
        }
    },
    
    While: function(node, isStatement) {
        var testBlock = this.builder.block('test');
        var loopBlock = this.builder.block('loop');
        var afterBlock = this.builder.block('after');

        this.builder.jump(testBlock);

        this.builder.setInsertBlock(testBlock);
        var condition = this.compileNode(node.clause);
        var eq = this.compileTest(condition, 1);
        this.builder.conditionalJump(eq, loopBlock, afterBlock);
        
        this.builder.setInsertBlock(loopBlock);
        var didReturn = this.compileStatements(node.block);
        if (!didReturn) {
            this.builder.jump(testBlock);
        } else {
            this.markReturned(false);
        }
        
        this.builder.setInsertBlock(afterBlock);
    },
};
