
var llvm = require('./llvm');
var mil = require('./mil');
var MILWriter = require('./milwriter').MILWriter;
var types = require('./type'),
    Type = types.Type,
    NumberType = types.NumberType,
    PointerType = types.PointerType,
    FunctionType = types.FunctionType,
    ClassType = types.ClassType,
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
var utils = require('./utils'),
    MoyaError = utils.MoyaError;

// *************************************************************************************************

const llvmPrefix = 'MOYA:';

// *************************************************************************************************

function MILBuilder(debugMode) {
    this.cfuncs = [];
    this.funcs = [];
    this.classes = [];
    this.moduleCache = {};
    this.debugMode = debugMode;
    this.insertBlock = null;
}
exports.MILBuilder = MILBuilder;

MILBuilder.prototype = {
    compile: function(moduleCache) {
        llvm.beginModule("Moya");
        this.compileCode();
        this.compileMain(moduleCache);
        llvm.endModule(this.debugMode == 'ir' ? 1 : 0);
    },
        
    run: function() {
        llvm.executeMain();
    },
    
    // ---------------------------------------------------------------------------------------------
    
    compileCode: function() {
        for (var i = 0, l = this.cfuncs.length; i < l; ++i) {
            this.cfuncs[i].compile(this);
        }

        for (var i = 0, l = this.funcs.length; i < l; ++i) {
            this.funcs[i].compile(this);
        }

        for (var i = 0, l = this.classes.length; i < l; ++i) {
            this.compileClass(this.classes[i]);
        }

        for (var i = 0, l = this.classes.length; i < l; ++i) {
            this.generateClass(this.classes[i]);
        }

        for (var i = 0, l = this.funcs.length; i < l; ++i) {
            this.funcs[i].generateFunc(this);
        }
    },
    
    writeMIL: function() {
        var writer = new MILWriter();

        for (var i = 0, l = this.cfuncs.length; i < l; ++i) {
            this.cfuncs[i].write(writer);
        }

        for (var i = 0, l = this.funcs.length; i < l; ++i) {
            this.funcs[i].write(writer);
        }

        for (var i = 0, l = this.classes.length; i < l; ++i) {
            // this.classes[i].write(writer);
        }

        for (var i = 0, l = this.classes.length; i < l; ++i) {
            // this.generateClass(this.classes[i]);
        }

        for (var i = 0, l = this.funcs.length; i < l; ++i) {
            this.funcs[i].write(writer);
        }

        return writer.dump();
    },
    
    compileMain: function(moduleCache) {
        var funcAndArgs = llvm.declareFunction('main', I32.native, [], []);
        var main = funcAndArgs.shift();
        
        var block = llvm.createBlock('entry', main);
        llvm.setInsertBlock(block);

        for (var key in moduleCache) {
            var mod = moduleCache[key];
            if (mod.main) {
                llvm.compileCall(mod.main.native, []);
            }
        }
        
        var result = llvm.compileInteger(32, 0);
        llvm.compileReturn(result);
    },
    
    // ---------------------------------------------------------------------------------------------
    
    compileClass: function(classType) {
        if (classType.native) return classType.native;

        var name = llvmPrefix + classType.class.qualifiedName;
        classType.nativeStruct = llvm.createStructType(name);
        classType.native = llvm.getPointerType(classType.nativeStruct);
                
        return classType.native;
    },
        
    generateClass: function(classType) {
        var structTypes = [VTABLEPOINTER.native];
        this.collectProperties(classType, structTypes);
        classType.structSize = llvm.setStructBody(classType.nativeStruct, structTypes);

        var methods = [];
        this.collectMethods(classType, methods, {});
        var tableName = classType.class.qualifiedName+'_FUNCS';
        classType.methodTable = llvm.createClassTable(tableName, methods);
    },
        
    collectProperties: function(classType, structTypes) {
        for (var baseType = classType.base; baseType; baseType = baseType.base) {
            this.compileClass(classType);
            
            for (var propertyName in baseType.properties) {
                var prop = baseType.properties[propertyName]
                structTypes.push(prop.type.native);
            }
        }
    
        for (var propertyName in classType.properties) {
            var prop = classType.properties[propertyName]
            prop.offset = structTypes.length;
            structTypes.push(prop.type.native);
        }
    },

    collectMethods: function(classType, methods, cache) {
        if (classType.base) {
            this.collectMethods(classType.base, methods, cache);
        }
    
        for (var i = 0, l = classType.methods.length; i < l; ++i) {
            var instFunc = classType.methods[i];
            var key = utils.localKeyForMethod(instFunc.name, instFunc.argTypes,
                                              instFunc.argSymbols);
            if (key in cache) {
                instFunc.methodOffset = cache[key];
            } else {
                instFunc.methodOffset = methods.length;
                cache[key] = instFunc.methodOffset;
            }
            methods[instFunc.methodOffset] = instFunc.compile(this);
        }
    },
        
    functionType: function(returnType, argTypes) {
        var type = new FunctionType(returnType, argTypes);

        var returnNative = returnType ? returnType.compile(this) : VOID.native;
        var argsNative = argTypes.map(function(type) { return type.compile(this); }.bind(this));
        type.native = llvm.getFunctionSignatureType(returnNative, argsNative);
        
        type.withPointers(1);
        
        return type;
    },
    
    // ---------------------------------------------------------------------------------------------

    block: function(name, func, before) {
        var targetFunc = func || this.insertFunc;
        var block = new mil.Block(name, targetFunc);
        if (before) {
            var index = targetFunc.blocks.indexOf(before);
            if (index >= 0) {
                targetFunc.blocks.splice(index, 0, block);
            } else {
                targetFunc.blocks.push(block);
            }
        } else {
            targetFunc.blocks.push(block);
        }
        return block;
    },
    
    setInsertBlock: function(block) {
        this.insertBlock = block;
        this.insertFunc = block ? block.func : null;
    },
    
    insert: function(node) {
        this.insertBlock.statements.push(node);
    },
    
    // ---------------------------------------------------------------------------------------------
    
    func: function(genericFunc, argSymbols, argTypes, argDefaults) {
        var funcInst = new mil.InstanceFunction(genericFunc, argSymbols, argTypes, argDefaults);
        this.funcs.push(funcInst);
        return funcInst;
    },

    cfunc: function(name, returnType, argTypes) {
        var cfunc = new mil.CFunction(name, returnType, argTypes);
        this.cfuncs.push(cfunc);
        return cfunc;
    },

    // ---------------------------------------------------------------------------------------------
    // Expressions

    true: function() {
        return new mil.Bool(true);
    },

    false: function() {
        return new mil.Bool(false);
    },
    
    int: function(value, bitSize) {
        if (!bitSize) {
            return new mil.Number(value, I32);
        } else if (bitSize == 1) {
            return new mil.Number(value, I1);
        } else if (bitSize == 8) {
            return new mil.Number(value, I8);
        } else if (bitSize == 16) {
            return new mil.Number(value, I16);
        } else if (bitSize == 32) {
            return new mil.Number(value, I32);
        } else if (bitSize == 64) {
            return new mil.Number(value, I64);
        } else {
            throw new MoyaError("Illegal integer bit size of " + bitSize);
        }
    },

    float32: function(value) {
        return new mil.Number(value, F32);
    },
    
    float64: function(value) {
        return new mil.Number(value, F64);
    },
    
    string: function(str) {
        return new mil.String(str);
    },

    optional: function(value, optionalType) {
        if (optionalType) {
            return new mil.Optional(value, true, optionalType);
        } else {
            return new mil.Optional(null, false, value);
        }
    },
    
    numCast: function(value, type) {
        return new mil.NumCast(value, type);
    },

    bitCast: function(value, type) {
        return new mil.BitCast(value, type);
    },

    sizeOfType: function(typeToSize) {
        return new mil.SizeOfType(typeToSize);
    },

    sizeOfObject: function(typeToSize) {
        return new mil.SizeOfObject(typeToSize);
    },
    
    propOffset: function(classType, propertyName) {
        return new mil.PropertyOffset(classType, propertyName);
    },

    methodOffset: function(instFunc) {
        return new mil.MethodOffset(instFunc);
    },
    
    methodTable: function(classType) {
        return new mil.MethodTable(classType);
    },
    
    stub: function(type) {
        return new mil.Stub(type);
    },
    
    createVariable: function(name, type) {
        return new mil.CreateVariable(name, type);
    },

    loadVariable: function(variable, name) {
        return new mil.LoadVariable(variable, name);
    },
    
    extractValue: function(agg, index, type, name) {
        return new mil.ExtractValue(agg, index, type, name);
    },

    insertValue: function(agg, index, value) {
        return new mil.InsertValue(agg, index, value);
    },

    gep: function(object, offsets, gepType, type) {
        return new mil.GEP(object, offsets, gepType, type);
    },
    
    phi: function(type, exprs, blocks) {
        return new mil.Phi(type, exprs, blocks);
    },
    
    call: function(callable, args, returnType) {
        return new mil.Call(callable, args, returnType);
    },
    
    math: function(op, lhs, rhs) {
        return new mil.Math(op, lhs, rhs);
    },

    negate: function(operand) {
        return new mil.Negate(operand);
    },

    compare: function(op, lhs, rhs) {
        return new mil.Compare(op, lhs, rhs);
    },

    // ---------------------------------------------------------------------------------------------
    // Statements
    
    storeVariable: function(variable, value) {
        var node = new mil.StoreVariable(variable, value);
        this.insert(node);
        return node;
    },

    jump: function(block){
        var node = new mil.Jump(block);
        this.insert(node);
        return node;
    },

    conditionalJump: function(condition, trueBlock, falseBlock) {
        var node = new mil.ConditionalJump(condition, trueBlock, falseBlock);
        this.insert(node);
        return node;
    },
    
    return: function(expr) {
        var node = new mil.Return(expr);
        this.insert(node);
        if (!this.insertBlock.returned) {
            this.insertBlock.returned = expr;
        }
        return node;
    },
};
