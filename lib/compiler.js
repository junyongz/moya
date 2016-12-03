
var fool = require('fool');
var fs = require('fs');
var path = require('path');
var parser = require('./grammar').parser;
var p = require('./parsing');
var ops = require('./operator');
var constants = require('./constants'),
    PrivateAccess = constants.PrivateAccess,
    PublicAccess = constants.PublicAccess;
var mods = require('./module'),
    Module = mods.Module,
    GenericFunction = mods.GenericFunction,
    GenericClass = mods.GenericClass;
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    ClassType = types.ClassType,
    FunctionType = types.FunctionType,
    PointerType = types.PointerType,
    StructType = types.StructType,
    OptionalType = types.OptionalType,
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

var shouldThrow = false;
// shouldThrow = true;

const fileExt = '.moya';
const nameSep = '_';

const builtinModuleNames = [
    'moya',
    'List',
];

// *************************************************************************************************

function Compiler(shouldDebug, shouldOptimize, inspectMode) {
    this.builtinModules = null;
    this.moduleCache = {};
    this.typeCache = {};
    this.functionCache = {};
    this.globals = {};
    this.returnFlags = [];
    this.returns = [];
    this.catchers = [];
    this.states = [];
    this.scope = null;
    this.inspectMode = inspectMode;
    
    this.builder = new MILBuilder(shouldDebug, shouldOptimize, inspectMode);
    
    var searchPath = process.env['MOYAPATH'];
    this.searchPaths = searchPath ? searchPath.split(path.delimiter) : [];
            
    for (var name in builtinTypes) {
        var type = builtinTypes[name];
        var key = utils.keyForClass(type.class, []);
        this.typeCache[key] = type;
    }
}
exports.Compiler = Compiler;

Compiler.prototype = {
    save: function() {
        var oldScope = this.scope;
        var state = {scope: this.scope, returnFlags: this.returnFlags,
                     returns: this.returns, catchers: this.catchers,
                     block: this.builder.insertBlock};
        this.states.push(state);
        
        this.scope = null;
        this.returns = [];
        this.returnFlags = [];
        this.catchers = [];
        this.builder.setInsertBlock(null);
        return oldScope;
    },
    
    restore: function() {
        var state = this.states.pop();
        this.scope = state.scope;
        this.returns = state.returns;
        this.returnFlags = state.returnFlags;
        this.catchers = state.catchers;
        this.builder.setInsertBlock(state.block);
    },
    
    pushScope: function(scope) {
        if (!scope) {
            scope = new FunctionScope(this.scope.func);
        }

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
    
    get funcScope() {
        var match = null;
        for (var scope = this.scope; scope; scope = scope.previous) {
            if (scope instanceof FunctionScope) {
                match = scope;
            }
        }
        return match;
    },
    
    markReturned: function(didReturn) {
        if (this.returnFlags.length) {
            this.returnFlags[this.returnFlags.length-1] = didReturn;
        }
    },

    addReturn: function(expr) {
        this.returns.push(expr);
    },
    
    castReturns: function(newType, loc) {
        for (var i = 0, l = this.returns.length; i < l; ++i) {
            var ret = this.returns[i];
            var cast = newType.valueToType(ret.expr, this, loc);
            ret.expr = cast;
        }
    },
    
    // =============================================================================================
    
    get catchFrame() {
        return this.catchers[this.catchers.length-1];
    },
        
    pushCatcher: function() {
        var frame = new CatchFrame();
        this.catchers.push(frame);
        return frame;
    },
    
    popCatcher: function() {
        this.catchers.pop();
        return this.catchers[this.catchers.length-1];
    },
        
    getUnwindBlock: function() {
        var catchFrame = this.catchFrame;
        if (catchFrame.unwindBlock) {
            return catchFrame.unwindBlock;
        } else {
            var insertBlock = this.builder.insertBlock;

            var lpadBlock = this.builder.block('lpad');
            this.builder.setInsertBlock(lpadBlock);
            var landingPad = this.builder.landingPad(this.getLandingPadType(), true, this.loc);
            this.builder.insert(landingPad);
            
            // XXXjoe Cleanup code goes here!
            // catchFrame.unwindBlock = compiler.getTerminateBlock();
            // this.builder.insert(this.builder.call(this.printString,
            //                     [this.builder.string("cleanup")]));
            
            this.builder.resume(landingPad, this.loc);
            
            this.builder.setInsertBlock(insertBlock);

            catchFrame.unwindBlock = lpadBlock;
            return lpadBlock;
        }
    },
            
    getTerminateBlock: function() {
        var funcScope = this.funcScope;
        if (funcScope.terminateBlock) {
            return funcScope.terminateBlock;
        } else {
            var block = this.builder.block('terminate');
            funcScope.terminateBlock = block;
            
            var oldBlock = this.builder.insertBlock;
            
            this.builder.setInsertBlock(block);
            this.builder.insert(this.builder.call(this.moyaTerminate, []));
            this.builder.unreachable();
            
            this.builder.setInsertBlock(oldBlock);
            return block;
        }
    },
    
    // =============================================================================================
    
    findCommonType: function(items, cb) {
        var commonType = null;
        for (var i = 0, l = items.length; i < l; ++i) {
            var itemType = cb(items[i]);
            if (!commonType) {
                commonType = itemType;
            } else {
                commonType = commonType.getCommonType(itemType);
            }
        }
        return commonType;
    },
    
    getFunctionType: function(returnType, argTypes) {
        var key = utils.keyForFunctionType(returnType, argTypes);
        var type = this.typeCache[key];
        if (!type) {
            type = this.builder.functionType(returnType, argTypes);
            this.typeCache[key] = type;
        }
        return type;
    },

    getPointerType: function(type, pointers) {
        type.compile(this.builder);
        var pointerType = type.withPointers(pointers || 1);
        var key = utils.keyForPointerType(pointerType, 0);
        this.typeCache[key] = pointerType;
        return pointerType;
    },

    getOptionalType: function(type, optionals) {
        var optionalType = type.withOptionals(optionals);
        var key = utils.keyForOptionalType(optionalType, 0);
        this.typeCache[key] = optionalType;
        return optionalType;
    },
    
    getLandingPadType: function() {
        if (!this.lpadType) {
            this.lpadType = new StructType('lpad', [POINTER, I32]);
            return this.lpadType;
        } else {
            return this.lpadType;
        }
    },

    int: function(val, size) {
        return this.builder.int(val, size || 32);
    },
    
    global: function(name, value) {
        var gv = this.globals[name];
        if (!gv) {
            gv = this.builder.global(name, value.type, value, false);
            this.globals[name] = {variable: gv, value: value};
        }
        return gv;
    },

    globalConstant: function(name, value) {
        return this.builder.global(name, value.type, value, true);
    },

    log: function(value) {
        var str;
        if (typeof(value) == "string") {
            str = this.builder.string(value);
        } else {
            str = value.valueToString(this);
        }
        this.builder.insert(this.call(this.printString, [str]));
    },
    
    // =============================================================================================
    
    printSourceError: function(message, loc, sourcePath, source) {
        if (!sourcePath) {
            sourcePath = 'no file';
        }

        if (loc && source) {
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
        
    // =============================================================================================

    compileProgram: function(moduleName, sourcePath, source, exeOutPath) {
        var progMod = this.createModule(moduleName || "source", sourcePath, source);
        try {
            this.declareExternals();

            if (this.inspectMode == "ast") {
                var ast = parser.parse(progMod.source);
                console.log(ast+'');
            } else if (this.inspectMode == "ast-expr") {
                var ast = parser.parse(progMod.source);
                console.log(ast.items[0].body+'');
            } else {
                this.compileModule(progMod, false);
                
                for (var i = 0, l = this.builder.classes.length; i < l; ++i) {
                    var cls = this.builder.classes[i];
                    this.inheritMethods(cls);
                }
                
                if (this.inspectMode == "mil") {
                    var output = this.builder.writeMIL();
                    console.log(output);
                } else {
                    this.builder.compile(this.moduleCache, this.globals);

                    if (exeOutPath) {
                        this.builder.makeExecutable(exeOutPath);
                    } else {
                        this.builder.run();
                    }
                }
            }
        } catch (exc) {
            var rootModule = this.scope ? this.scope.rootModule : null;
            var errorPath = rootModule ? rootModule.path : progMod.path;
            var errorSource = rootModule ? rootModule.source : progMod.source;
            if (exc.hash) {
                this.printSourceError('Syntax error', exc.hash.loc, errorPath, errorSource);
            } else if (exc.message) {
                this.printSourceError(exc.message, exc.loc, errorPath, errorSource);
            } else {
                throw exc;
            }
            
            if (shouldThrow) {
                throw exc;
            }
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

        this.moyaAllocException = this.createCFunction('moyaAllocException', POINTER, [I32]);
        this.moyaBeginCatch = this.createCFunction('moyaBeginCatch', POINTER, [POINTER]);
        this.moyaEndCatch = this.createCFunction('moyaEndCatch', VOID, []);
        this.moyaThrow = this.createCFunction('moyaThrow', null, [POINTER, POINTER, POINTER], true);
        this.moyaThrowDest = this.createCFunction('moyaThrowDestructor', VOID, [POINTER]);
        
        this.typeIdFor = this.createCFunction('llvm.eh.typeid.for', I32, [POINTER]);
        
        this.moyaTerminate = this.createCFunction('moyaTerminate', VOID, []);
    },
    
    compileModule: function(mod, isBuiltin) {
        this.save();
        this.scope = new ModuleScope(mod);

        if (!isBuiltin) {
            var builtins = this.getBuiltinModules();
            for (var importName in builtins) {
                mod.declareImport(builtins[importName]);
            }
        }

        var ast = parser.parse(mod.source);
        ast.items.forEach(function(node) {
            node.declareInModule(this, mod);
        }.bind(this));
        
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
    
    // =============================================================================================

    compileImport: function(sourcePath, isBuiltin) {
        var mod = this.moduleCache[sourcePath];
        if (mod) {
            return mod;
        } else {
            var moduleName = sourcePath.replace(/\//g, nameSep);
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
                    var importedModule = this.compileImport(importPath, true);
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
        
        this.builder.module(mod);
            
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
            paths[i] = name.name;
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
    
    // =============================================================================================
    
    declareClass: function(classDecl, mod) {
        var id = classDecl.name;
        var symbolNodes = null;
        if (id.nick == "TypeArguments") {
            symbolNodes = id.args.slice();
            id = symbolNodes.shift().name;
        } else {
            id = id.name;
        }
        
        var cls = new GenericClass(id, null, classDecl.loc);
        cls.ast = classDecl;
        cls.accessMode = classDecl.accessMode;
        cls.base = classDecl.base;
        
        if (symbolNodes) {
            for (var i = 0, l = symbolNodes.length; i < l; ++i) {
                var argItem = symbolNodes[i];
                if (argItem.nick == "TypeId") {
                    cls.symbolNames.push(argItem.name);
                } else {
                    throw new MoyaError("Illegal type argument", argItem.loc);
                }
            }
        }

        classDecl.body.items.forEach(function(node) {
            node.declareInClass(this, cls);
        }.bind(this));
        
        if (!cls.constructors.length) {
            var func = p.parseEmptyFunc(cls.loc, id, cls.accessMode);
            var cons = this.declareConstructor(func, cls);
            cls.constructors.push(cons);
        }

        for (var i = 0, l = cls.constructors.length; i < l; ++i) {
            var cons = cls.constructors[i];
            mod.declareFunction(cons);
        }
        
        return cls;
    },

    declareConstructor: function(funcNode, genericClass) {
        var func = new GenericFunction(genericClass.name, funcNode.loc);
        func.loc = funcNode.loc;
        func.accessMode = funcNode.accessMode;
        func.body = funcNode.block ? funcNode.block.body : null;
        func.args = funcNode.args ? funcNode.args.items : [];
        func.symbolNames = genericClass.symbolNames.slice();
        func.class = genericClass;
        func.isConstructor = true;
        func.minimumArgCount = this.countMinimumArgs(funcNode);
                        
        return func;
    },

    declareFunction: function(funcNode) {
        var name = funcNode.name;
        var symbolNodes = null;
        if (name.nick == "TypeArguments") {
            symbolNodes = name.args.slice();
            name = symbolNodes.shift().name;
        } else {
            name = name.name;
        }

        var func = new GenericFunction(name, funcNode.loc);
        func.loc = funcNode.loc;
        func.accessMode = funcNode.accessMode;
        func.body = funcNode.block ? funcNode.block.body : null;
        func.args = funcNode.args ? funcNode.args.items : [];
        func.returns = funcNode.returns;
        func.operator = funcNode.operator;
        func.minimumArgCount = this.countMinimumArgs(funcNode);

        if (symbolNodes) {
            for (var i = 0, l = symbolNodes.length; i < l; ++i) {
                var symbolItem = symbolNodes[i];
                if (symbolItem.nick == "TypeId") {
                    func.symbolNames.push(symbolItem.name);
                } else {
                    throw new MoyaError("Illegal type argument", symbolItem.loc);
                }
            }
        }
                
        return func;
    },
    
    declareCFunction: function(node, mod, isLocal) {
        var args = [];
        if (node.args) {
            var argItems = node.args.items;
            for (var i = 0, l = argItems.length; i < l; ++i) {
                var argItem = argItems[i];
                args[i] = this.declareCArg(argItem);
            }
        }

        var func = new GenericFunction(node.name, node.loc);
        func.module = mod;
        func.args = args;
        func.returns = this.declareCType(node.type);
        func.accessMode = PrivateAccess;
        func.minimumArgCount = args.length;
        func.isCFunction = true;
        
        if (!isLocal) {
            mod.declareFunction(func);
        }
        
        return func;
    },
        
    declareCArg: function(node) {
        var type = this.declareCType(node.type);
        var assign = p.parseTypeAssignment(node.loc, null, type);
        return p.parseArgDecl(node.loc, assign, null, false);
    },

    declareCType: function(node) {
        if (node.name == 'void') {
            return new p.parseTypeId(node.loc, 'Void');
        } else if (node.name == 'bool') {
            return new p.parseTypeId(node.loc, 'Bool');
        } else if (node.name == 'short') {
            return new p.parseTypeId(node.loc, 'Int16');
        } else if (node.name == 'int' || node.name == 'long') {
            return new p.parseTypeId(node.loc, 'Int32');
        } else if (node.name == 'long long') {
            return new p.parseTypeId(node.loc, 'Int64');
        } else if (node.name == 'float') {
            return new p.parseTypeId(node.loc, 'Float');
        } else if (node.name == 'double') {
            return new p.parseTypeId(node.loc, 'Double');
        } else if (node.name == 'size_t') {
            return new p.parseTypeId(node.loc, 'Int32');
        } else if (node.name == 'char') {
            if (node.pointers == 1) {
                return new p.parseTypeId(node.loc, 'String');
            } else {
                return new p.parseTypeId(node.loc, 'Char', node.pointers);
            }
        } else {
            return new p.parseTypeId(node.loc, 'Int8', node.pointers);
        }
    },

    countMinimumArgs: function(funcNode) {
        var argItems = funcNode.args.items;
        var minimumArgCount = 0;
        var startedDefaults = false;
        for (var i = 0, l = argItems.length; i < l; ++i) {
            var argItem = argItems[i];
            if (!argItem.defaultValue && !(argItem.type && argItem.type.optionals)) {
                if (startedDefaults) {
                    throw new MoyaError("Default value required", argItem.loc);
                } else {
                    minimumArgCount = i+1;
                }
            } else {
                startedDefaults = true;
            }
        }
            
        return minimumArgCount;
    },
    
    // =============================================================================================

    matchClass: function(genericClass, argSymbols) {
        var key = utils.keyForClass(genericClass, argSymbols);
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
            classType.base = genericClass.base.compileType(this);
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
        var loc = classType.class.loc;
        
        var key = classType.class.qualifiedName + '_INIT';
        var genericFunc = new GenericFunction(key, loc);
        genericFunc.module = classType.class.module;

        var instFunc = this.builder.func(genericFunc, [], [classType], [], loc);
        instFunc.type = this.getFunctionType(VOID, [classType]);
        this.functionCache[key] = instFunc;

        var self = this.builder.stub(classType);
        classScope.self = self;
        instFunc.argNames.push('self');
        instFunc.argStubs.push(self);
        
        var block = this.builder.block('entry', instFunc);
        this.builder.setInsertBlock(block);

        if (classType.base) {
            var castSelf = this.builder.bitCast(self, classType.base, loc);
            var ret = this.builder.call(classType.base.initFunc, [castSelf], null, loc);
            this.builder.insert(ret);
        }
        
        var tableVar = this.builder.gep(self, [this.int(0), this.int(0)], null, POINTER, loc);
        var methodTable = this.builder.methodTable(classType);
        var castTable = this.builder.bitCast(methodTable, VTABLEPOINTER, loc);
        this.builder.storeVariable(tableVar, castTable, loc);

        var props = classType.class.props;
        for (var i = 0, l = props.length; i < l; ++i) {
            var genericProp = props[i];
            var prop = classType.addProperty(genericProp.name);
            var loc = genericProp.block.loc;
            
            if (genericProp.type) {
                prop.type = genericProp.type.compileType(this);
            }

            var rhs = genericProp.block.compile(this);
            if (prop.type) {
                rhs = prop.type.valueToType(rhs, this, loc);
            } else {
                prop.type = rhs.type;
            }

            var offset = this.builder.propOffset(classType, prop.name, loc);
            var variable = this.builder.gep(self, [this.int(0), offset], null, prop.type, loc);
            this.builder.storeVariable(variable, rhs, loc);
        }

        this.builder.return(null, loc);
        
        return instFunc;
    },

    // =============================================================================================

    callFunction: function(name, args, argSymbols, loc) {
        var argTypes = args.map(function(arg) { return arg.type; });
        var func = this.matchFunctionCall(name, argTypes, argSymbols);
        if (func) {
            var castArgs = this.completeCallArgs(func, argTypes, args, loc);
            return this.call(func, castArgs, null, null, loc);
        }
    },

    callMethod: function(object, name, args, argSymbols, loc) {
        var argTypes = args.map(function(arg) { return arg.type; });
        var func = this.matchMethodCall(object.type, name, argTypes, argSymbols);
        if (func) {
            var castArgs = args.slice();
            castArgs.unshift(object);
            argTypes.unshift(object.type);
            castArgs = this.completeCallArgs(func, argTypes, castArgs, loc);
                        
            var tableVar = this.builder.gep(object, [this.int(0), this.int(0)], null, POINTER, loc);
            var table = this.builder.loadVariable(tableVar, "table");
            var methodVar = this.builder.gep(table, [this.builder.methodOffset(func)], null,
                                             POINTER, loc);
            var method = this.builder.loadVariable(methodVar, name+".func", loc);
            var castMethod = this.builder.bitCast(method, func.type.pointerType, loc);
            
            return this.call(castMethod, castArgs, func.type.returnType, func, loc);
        }
    },

    call: function(callable, args, returnType, realFunc, loc) {
        if (!realFunc) {
            realFunc = callable;
        }
        
        if (realFunc.throws || realFunc == this.moyaThrow) {
            this.catchFrame.markThrows(realFunc.throws);

            this.funcScope.afterBlock = this.builder.block('after');
            var contBlock = this.funcScope.afterBlock;
            var unwindBlock = this.getUnwindBlock();
            
            var ret = this.builder.invoke(callable, args, returnType, contBlock, unwindBlock, loc);
            this.builder.insert(ret);
            
            this.builder.setInsertBlock(contBlock);

            return ret;
        } else {
            return this.builder.call(callable, args, returnType, loc);
        }
    },
    
    callOpOverride: function(op, object, args, loc) {
        var ret = this.callMethod(object, op.token, args, [], loc);
        if (ret) {
            return ret;
        } else {
            throw new MoyaError('Operator "' + op.token + '" not supported on ' + object.type.name,
                                loc);
        }
    },

    completeCallArgs: function(func, argTypes, args, loc) {
        var castArgs = [];
        
        for (var i = 0, l = args.length; i < l; ++i) {
            var arg = args[i];
            var expectedType = func.argTypes[i];
            
            if (arg.type instanceof OptionalType) {
                var defaultFunc = func.argDefaults[i];
                if (defaultFunc) {
                    var passed = this.compileTruthTest(arg, loc);
                    castArgs[i] = this.compileSingleChoice(passed, function() {
                        return expectedType.valueToType(arg, this, loc);
                    }.bind(this), function() {
                        return this.builder.call(defaultFunc, [], null, loc);
                    }.bind(this), loc);
                } else {
                    castArgs[i] = expectedType.valueToType(arg, this, loc);
                }
            } else {
                castArgs[i] = expectedType.valueToType(arg, this, loc);
            }
        }
        
        for (var i = argTypes.length, l = func.argTypes.length; i < l; ++i) {
            var expectedType = func.argTypes[i];
            var defaultFunc = func.argDefaults[i];
            if (defaultFunc) {
                var defaultValue = this.builder.call(defaultFunc, [], null, loc);
                castArgs[i] = expectedType.valueToType(defaultValue, this, loc);
            } else if (expectedType instanceof OptionalType) {
                castArgs[i] = this.builder.optional(null, expectedType, loc);
            }
        }
        
        return castArgs;
    },
    
    // =============================================================================================
    
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
        var funcScope = this.funcScope;
        
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
            funcScope.declareSymbol(symbolName, argSymbols[i]);
        }
        
        // Define symbols by pulling them from argument values
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var declArg = declArgs[i];
            var argType = argTypes[i];
            if (declArg.type) {
                var symbol = argType.toSymbol();
                declArg.type.expandType(funcScope, symbol);
            }
        }
        
        // Evaluate all type arguments
        for (var i = 0, l = argTypes.length; i < l; ++i) {
            var argType = argTypes[i];
            var declArg = declArgs[i];
            if (declArg.type) {
                var expectedType = declArg.type.compileType(this);
                if (!expectedType || !expectedType.isTypeOrSubclass(argType)) {
                    return null;
                } else {
                    argTypes[i] = expectedType;
                }
            }
        }

        var argDefaults = [];
        for (var i = 0, l = declArgs.length; i < l; ++i) {
            var declArg = declArgs[i];
            if (declArg.defaultValue) {
                var qualifiedName = func.qualifiedName + '.' + declArg.innerName + '_DEFAULT';
                var defaultFunc = this.createExprFunction(qualifiedName, declArg.defaultValue);
                argDefaults[i] = defaultFunc;
            }
        }
        
        for (var i = argTypes.length, l = declArgs.length; i < l; ++i) {
            var declArg = declArgs[i];
            var defaultFunc = argDefaults[i];
            if (defaultFunc) {
                if (declArg.type) {
                    var expectedSymbol = defaultFunc.returnType.toSymbol();
                    declArg.type.expandType(funcScope, expectedSymbol);
                } else {
                    argTypes[i] = defaultFunc.returnType;
                }
            }
            
            if (declArg.type) {
                argTypes[i] = declArg.type.compileType(this);
            }
        }
    
        // Ensure all symbol arguments are defined
        for (var name in funcScope.localSymbols) {
            if (!funcScope.localSymbols[name]) {
                return null;
            }
        }
    
        var funcSymbols = [];
        for (var i = 0, l = func.symbolNames.length; i < l; ++i) {
            var symbolName = func.symbolNames[i];
            var funcSymbol = funcScope.localSymbols[symbolName];
            funcSymbols.push(funcSymbol);
        }
        
        return this.getFunction(func, ownerType, funcSymbols, argTypes, argDefaults);
    },
    
    // =============================================================================================
    
    getFunction: function(func, ownerType, argSymbols, argTypes, argDefaults) {
        var key = ownerType
            ? utils.keyForMethod(ownerType, func.name, argTypes, argSymbols)
            : utils.keyForFunction(func, argTypes, argSymbols);
        var instFunc = this.functionCache[key];
        if (instFunc) {
            return instFunc;
        } else {
            if (func.isCFunction) {
                var returnType = func.returns.compileType(this);
                return this.createCFunction(func.name, returnType, argTypes, false, func.loc);
            } else {
                return this.createFunction(key, func, ownerType, argSymbols, argTypes, argDefaults);
            }
        }
    },
    
    createFunction: function(key, func, ownerType, argSymbols, argTypes, argDefaults) {
        var instFunc = this.builder.func(func, argSymbols, argTypes, argDefaults, func.loc);
        if (key) {
            this.functionCache[key] = instFunc;
        }
        
        var funcScope = this.scope;
        funcScope.func = instFunc;
        
        var catchFrame = this.pushCatcher();
        
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
            
            var classScope = funcScope.previous;
            classScope.setClass(classType);
            
            var objectSize = this.builder.sizeOfObject(classType);
            var raw = this.builder.call(this.newObject, [objectSize], null, func.loc);
            castSelf = this.builder.bitCast(raw, classType, func.loc);
            classScope.self = castSelf;
            
            var called = this.builder.call(classType.initFunc, [castSelf], null, func.loc);
            this.builder.insert(called);
        } else {
            if (func.returns) {
                instFunc.returnType = func.returns.compileType(this);
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

            var classScope = funcScope.previous;
            this.scope.storeVariable('this', argStub, this.builder, func.loc);
            classScope.self = this.scope.lookupVariableValue('this', this.builder, func.loc);
            
            var opReturnType = func.operator && func.operator.returnType;
            if (opReturnType) {
                if (instFunc.returnType && instFunc.returnType != opReturnType) {
                    throw new MoyaError('Operator must return ' + opReturnType, func.loc);
                }
                
                instFunc.returnType = opReturnType;
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

            this.scope.storeVariable(argName, argStub, this.builder, argItem.loc);
        }

        var didReturn = this.compileStatements(func.body);

        if (castSelf) {
            this.builder.return(castSelf, func.loc);
            didReturn = true;
        }
        
        var returnType = explicitReturn
            ? instFunc.returnType
            : this.findCommonType(this.returns, function(ret) { return ret.expr.type; });
        this.castReturns(returnType, func.loc);
        instFunc.returnType = returnType || VOID;
        
        if (!didReturn) {
            if (instFunc.returnType && instFunc.returnType != VOID) {
                var optionalType = instFunc.returnType.withOptionals(1);
                instFunc.returnType = optionalType;
                this.builder.return(this.builder.optional(null, optionalType, func.loc), func.loc);
                this.castReturns(optionalType, func.loc);
            } else {
                instFunc.returnType = VOID;
                this.builder.return(null, func.loc);
            }
        }
        
        instFunc.type = this.getFunctionType(instFunc.returnType, instFunc.argTypes);
        
        this.popCatcher();
        instFunc.throws = catchFrame.throws;
        
        return instFunc;
    },
    
    createExprFunction: function(name, expr) {
        var mod = this.scope.rootModule;
        this.save();
        this.scope = new ModuleScope(mod);
        
        var genericFunc = new GenericFunction(name, expr.loc);
        genericFunc.module = mod;
        
        var instFunc = this.builder.func(genericFunc, [], [], []);

        var block = this.builder.block('entry', instFunc);
        this.builder.setInsertBlock(block);

        var result = expr.compile(this);
        this.builder.return(result, expr.loc);

        instFunc.returnType = result.type;
        instFunc.type = this.getFunctionType(result.type, []);
        
        this.restore();
        return instFunc;
    },

    createCFunction: function(name, returnType, argTypes, doesThrow, loc) {
        var cfunc = this.builder.cfunc(name, returnType, argTypes, !doesThrow);
        cfunc.loc = loc;
        cfunc.type = this.getFunctionType(returnType, argTypes);
        return cfunc;
    },
        
    // =============================================================================================
    
    compileStatements: function(set) {
        if (set) {
            this.returnFlags.push(false);

            var nodes = set.items;
            for (var i = 0, l = nodes.length; i < l; ++i) {
                var expr = nodes[i].compile(this, true);
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
    
    compileExpression: function(set, whereSet) {
        var result = null;

        if (whereSet) {
            this.pushScope();
            
            whereSet.items.forEach(function(node) {
                if (node.nick == "Assignment" && node.op == ops.Eq) {
                    node.compile(this, true);
                } else {
                    throw new MoyaError("Illegal where clause", node.loc);
                }
            }.bind(this));
        }
        
        set.items.forEach(function(node) {
            var val = node.compile(this);
            if (!result) {
                result = val;
            } else if (result.type instanceof ClassType) {
                result = this.callOpOverride(ops.With, result, [val], node.loc);
            } else {
                throw new MoyaError("Illegal types for expression", node.loc);
            }
        }.bind(this));

        if (whereSet) {
            this.popScope();
        }
        
        return result;
    },

    compileVariableDeclare: function(name, type, rhs, loc) {
        if (this.scope.hasVariable(name)) {
            throw new MoyaError("Illegal to re-define variable in same scope", loc);
        }
        
        var cast = type.valueToType(rhs, this, loc);
        return this.scope.storeVariable(name, cast, this.builder, loc);
    },

    compileVariableAssign: function(name, rhs, loc) {
        var classScope = this.scope.isProperty(name);
        if (classScope) {
            return this.compilePropertyAssign(classScope.self, name, rhs, loc);
        } else {
            var type = this.scope.lookupVariableType(name);
            if (!type) {
                type = rhs.type;
            }
            var cast = type.valueToType(rhs, this, loc);
            return this.scope.storeVariable(name, cast, this.builder, loc);
        }
    },

    compilePropertyAssign: function(object, propertyName, rhs, loc) {
        if (object.type instanceof ClassType) {
            var prop = object.type.getProperty(propertyName);
            if (prop) {
                var offset = this.builder.propOffset(object.type, prop.name, loc);
                var variable = this.builder.gep(object, [this.int(0), offset], null,
                                                prop.type, loc);
                var cast = prop.type.valueToType(rhs, this, loc);
                return this.builder.storeVariable(variable, cast, loc);
            } else {
                throw new MoyaError('Property not found', loc);
            }
        } else {
            throw new MoyaError('Property not found', loc);
        }
    },
                            
    compileCall: function(name, object, argNodes, symbolNodes, loc) {
        var argSymbols = symbolNodes
            ? symbolNodes.map(function(node) { return node.compileSymbol(this); }.bind(this))
            : [];
        
        var args = argNodes.map(function(node) { return node.expr.compile(this); }.bind(this));

        if (!object) {
            object = this.scope.getThis();
        }

        var ret = object ? this.callMethod(object, name, args, argSymbols, loc) : null;
        if (ret) {
            return ret;
        }
        
        var local = this.scope.lookupVariableValue(name, this.builder, loc);
        if (local) {
            if (local.type instanceof PointerType && local.type.type instanceof FunctionType) {
                return this.builder.call(local, args, local.type.returnType, loc);
            } else {
                D&&D(local.type+'')
                throw new MoyaError("Object is not a function", loc);
            }
        }
        
        var ret = this.callFunction(name, args, argSymbols, loc);
        if (ret) {
            return ret;
        } else {
            throw new MoyaError('Function not found', loc);
        }
    },
    
    compileTest: function(condition, n, op, loc) {
        if (!op) op = ops.Equals;
        
        if (condition.type == I1 || condition.type == I8 || condition.type == I16
            || condition.type == I32 || condition.type == I64 || condition.type == CHAR) {
            var zero = this.builder.int(n, condition.type.bitSize);
            return this.builder.compare(op, condition, zero, loc);
        } else if (condition.type == F32) {
            var zero = this.builder.float32(n, loc);
            return this.builder.compare(op, condition, zero, loc);
        } else if (condition.type == F64) {
            var zero = this.builder.float64(n, loc);
            return this.builder.compare(op, condition, zero, loc);
        } else if (condition.type instanceof ClassType) {
            var ret = this.callOpOverride(ops.Not, condition, [], loc);
            if (ret) {
                var zero = this.builder.int(n ? 0 : 1, 1);
                return this.builder.compare(op, ret, zero, loc);
            } else {
                throw new MoyaError("Invalid type for truth test", condition.loc);
            }
        } else if (condition.type instanceof OptionalType) {
            var flag = this.builder.extractValue(condition, 1, I8, 'flag', loc);
            return this.compileTest(flag, n, op, loc);
        } else {
            throw new MoyaError("Invalid type for truth test", condition.loc);
        }
    },

    compileTruthTest: function(condition, loc) {
        return this.compileTest(condition, 0, ops.NotEquals, loc);
    },
    
    compileChoice: function(nextCondition, nextPassed, nextFailed, loc) {
        var afterBlock = this.builder.block('result');
        var elseBlock;
        var resultType;
        var exprs = [];
        var blocks = [];
        while (true) {
            var eq = nextCondition(this);
            if (!eq) {
                break;
            }
            
            var ifBlock = this.builder.block('then', null, afterBlock);
            elseBlock = this.builder.block('else', null, afterBlock);

            this.builder.conditionalJump(eq, ifBlock, elseBlock, loc);
            this.builder.setInsertBlock(ifBlock);
            var result = nextPassed(this);
            this.builder.insert(result);
            if (!resultType) {
                resultType = result.type;
            } else if (result.type != resultType) {
                throw new MoyaError("Different types in expression", loc);
            }
            this.builder.jump(afterBlock, loc);
            
            this.builder.setInsertBlock(elseBlock);
            
            exprs.push(result);
            blocks.push(ifBlock);
        }
        
        var elseFailed = nextFailed ? nextFailed(this) : null;
        if (elseFailed) {
            this.builder.insert(elseFailed);
            exprs.push(elseFailed);
            blocks.push(elseBlock);
        } else {
            var result = resultType.defaultValue(this.builder);
            exprs.push(result);
            blocks.push(elseBlock);
        }

        this.builder.jump(afterBlock, loc);
        this.builder.setInsertBlock(afterBlock);

        return this.builder.phi(resultType, exprs, blocks, loc);
    },

    compileSingleChoice: function(condition, passed, failed, loc) {
        var called = false;
        return this.compileChoice(function(compiler) {
            if (!called) {
                called = true;
                return condition;
            }
        }, function(compiler) {
            return passed(compiler);
        }, function(compiler) {
            return failed ? failed(compiler) : null;
        }, loc);
    },
};

// *************************************************************************************************

function CatchFrame() {
    this.throwMap = {};
    this.unwindBlock = null;
}

CatchFrame.prototype = {
    get throws() {
        var throws = null;
        for (var key in this.throwMap) {
            var type = this.throwMap[key];
            if (!throws) {
                throws = [type];
            } else {
                throws.push(type);
            }
        }
        return throws;
    },

    get isEmpty() {
        for (var key in this.throwMap) {
            return false;
        }
        return true;
    },
    
    markThrow: function(type) {
        var key = type+'';
        var throwMap = this.throwMap;
        if (!throwMap[key]) {
            throwMap[key] = type;
        }
    },
    
    markThrows: function(types) {
        if (types) {
            types.forEach(function(type) {
                this.markThrow(type);
            }.bind(this));
        }
    },
    
    catchAll: function() {
        var throws = this.throws;
        this.throwMap = {};
        return throws;
    },
    
    matchThrow: function(type) {
        for (var typeKey in this.throwMap) {
            var throwType = this.throwMap[typeKey];
            if (throwType.isTypeOrSubclass(type)) {
                delete this.throwMap[typeKey];
                return true;
            }
        }
        return false;
    },
};
