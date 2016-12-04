
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

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

function MILBuilder(shouldDebug, shouldOptimize, inspectMode) {
    this.modules = [];
    this.cfuncs = [];
    this.funcs = [];
    this.classes = [];
    this.moduleCache = {};
    this.globals = {};
    this.shouldDebug = shouldDebug;
    this.shouldOptimize = shouldOptimize;
    this.inspectMode = inspectMode;
    this.insertBlock = null;
    this.names = {};
}
exports.MILBuilder = MILBuilder;

MILBuilder.prototype = {
    compile: function(moduleCache, globals) {
        llvm.beginModule("Moya",
                         this.shouldDebug ? 1 : 0,
                         this.shouldOptimize ? 1 : 0,
                         this.inspectMode == 'ir' ? 1 : (this.inspectMode == 'ir-opt' ? 2 : 0));
        this.compileCode();
        this.compileMain(moduleCache, globals);
        llvm.endModule();
    },
        
    run: function() {
        llvm.executeMain();
    },

    makeExecutable: function(exeOutPath) {
        var outDirPath = path.dirname(exeOutPath);
        
        var objectPath = exeOutPath + '.o';
        llvm.emitObject(objectPath, this.shouldOptimize ? 1 : 0);
        
        this.linkExecutable(exeOutPath, objectPath);
    },
    
    linkExecutable: function(exeOutPath, objectPath) {
        var libPath = process.env['MOYA_BUILD_PATH'];
        var libs = ["./moya/src/core/libmoyacore.a"];
        
        var args = [objectPath];
        if (false) {
            var llvmPath = process.env['LLVM_SOURCE_PATH'];
            args.push(llvmPath + "/projects/libcxx/build/lib/libc++.a");
            args.push(llvmPath + "/projects/libcxxabi/build/lib/libc++abi.a");
        } else {
            args.push("-lstdc++");
        }
        
        for (var i = 0, l = libs.length; i < l; ++i) {
            args.push("-Wl,-force_load," + path.join(libPath, libs[i]));
        }
        args.push('-o', exeOutPath);
        
		this.runExecutable('clang', args).then(function(output) {
            // fs.unlinkSync(objectPath);
            console.log(output);
    		this.runExecutable(exeOutPath).then(function(output) {
                // fs.unlinkSync(exeOutPath);;
    			console.log(output);
    		}.bind(this));
		}.bind(this));
    },
    
    runExecutable: function(exePath, args) {
		return new Promise(function(resolve, reject) {
			var p = spawn(exePath, args, {});
            var data = [];
            
			p.stdout.on('data', function(buf) {
				data.push(buf);
			}.bind(this));

			p.stderr.on('data', function (buf) {
				data.push(buf);
			}.bind(this));

			p.on('exit', function (code) {
				setTimeout(function() { resolve(data.join('')); }, 50);
			}.bind(this));
		}.bind(this));
	},
    
    uniqueName: function(name) {
        return name;
        if (name in this.names) {
            return name + (++this.names[name]);
        } else {
            this.names[name] = 1;
            return name;
        }
    },
    
    // ---------------------------------------------------------------------------------------------
    
    compileCode: function() {
        if (this.shouldDebug) {

            for (var i = 0, l = this.modules.length; i < l; ++i) {
                var mod = this.modules[i];
                var name = mod.path ? path.basename(mod.path) : '__source__';
                var dirPath = mod.path ? path.dirname(mod.path) : '';
                mod.diunit = llvm.createDebugModule(name, dirPath);
            }
        }
        
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
    
    compileMain: function(moduleCache, globals) {
        var funcAndArgs = llvm.declareFunction('main', I32.native, [], []);
        var main = funcAndArgs.shift();
        
        var block = llvm.createBlock('entry', main);
        llvm.setInsertBlock(block);
        
        for (var name in globals) {
            var gv = globals[name];
            llvm.storeVariable(gv.variable.compile(this), gv.value.compile(this));
        }
        
        for (var key in moduleCache) {
            var mod = moduleCache[key];
            if (mod.main) {
                llvm.compileCall(mod.main.compile(this), []);
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

    module: function(mod) {
        this.modules.push(mod);
    },
    
    block: function(name, func, before) {
        name = this.uniqueName(name);
        
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
    
    func: function(genericFunc, argSymbols, argTypes, argDefaults, loc) {
        var node = new mil.InstanceFunction(genericFunc, argSymbols, argTypes, argDefaults);
        this.funcs.push(node);
        node.loc = loc;
        return node;
    },

    cfunc: function(name, returnType, argTypes, doesNotThrow, loc) {
        var node = new mil.CFunction(name, returnType, argTypes, doesNotThrow);
        this.cfuncs.push(node);
        node.loc = loc;
        return node;
    },
    
    funcPointer: function(func, loc) {
        var node = new mil.FunctionPointer(func);
        node.loc = loc;
        return node;
    },
    
    global: function(name, type, value, isConstant) {
        var glob = this.globals[name];
        if (!glob) {
            glob = this.Global(name, type, value, isConstant);
            this.globals[name] = glob;
        }
        return glob;
    },
    
    // ---------------------------------------------------------------------------------------------
    // Expressions

    true: function(loc) {
        var node = new mil.Bool(true);
        node.loc = loc;
        return node;
    },

    false: function(loc) {
        var node = new mil.Bool(false);
        node.loc = loc;
        return node;
    },

    null: function(type, loc) {
        var node = new mil.Null(type);
        node.loc = loc;
        return node;
    },
    
    int: function(value, bitSize, loc) {
        var node;
        if (!bitSize) {
            node = new mil.Number(value, I32);
        } else if (bitSize == 1) {
            node = new mil.Number(value, I1);
        } else if (bitSize == 8) {
            node = new mil.Number(value, I8);
        } else if (bitSize == 16) {
            node = new mil.Number(value, I16);
        } else if (bitSize == 32) {
            node = new mil.Number(value, I32);
        } else if (bitSize == 64) {
            node = new mil.Number(value, I64);
        } else {
            throw new MoyaError("Illegal integer bit size of " + bitSize, loc);
        }

        node.loc = loc;
        return node;
    },

    float32: function(value, loc) {
        var node = new mil.Number(value, F32);
        node.loc = loc;
        return node;
    },
    
    float64: function(value, loc) {
        var node = new mil.Number(value, F64);
        node.loc = loc;
        return node;
    },
    
    string: function(str, loc) {
        var node = new mil.String(str);
        node.loc = loc;
        return node;
    },
    
    struct: function(type, fields, loc) {
        var node = new mil.Struct(type, fields);
        node.loc = loc;
        return node;
    },
    
    optional: function(value, optionalType, loc) {
        var node;
        if (value) {
            node = new mil.Optional(value, true, optionalType);
        } else {
            node = new mil.Optional(null, false, optionalType);
        }
        node.loc = loc;
        return node;
    },
    
    numCast: function(value, type, loc) {
        var node = new mil.NumCast(value, type);
        node.loc = loc;
        return node;
    },

    bitCast: function(value, type, loc) {
        var node = new mil.BitCast(value, type);
        node.loc = loc;
        return node;
    },

    sizeOfType: function(typeToSize, loc) {
        var node = new mil.SizeOfType(typeToSize);
        node.loc = loc;
        return node;
    },

    sizeOfObject: function(typeToSize, loc) {
        var node = new mil.SizeOfObject(typeToSize);
        node.loc = loc;
        return node;
    },
    
    global: function(name, type, value) {
        var node = new mil.Global(name, type, value);
        return node;
    },
    
    propOffset: function(classType, propertyName, loc) {
        var node = new mil.PropertyOffset(classType, propertyName);
        node.loc = loc;
        return node;
    },

    methodOffset: function(instFunc, loc) {
        var node = new mil.MethodOffset(instFunc);
        node.loc = loc;
        return node;
    },
    
    methodTable: function(classType, loc) {
        var node = new mil.MethodTable(classType);
        node.loc = loc;
        return node;
    },
    
    stub: function(type, loc) {
        var node = new mil.Stub(type);
        node.loc = loc;
        return node;
    },
    
    createVariable: function(name, type, loc) {
        var node = new mil.CreateVariable(name, type);
        node.loc = loc;
        return node;
    },

    loadVariable: function(variable, name, loc) {
        var node = new mil.LoadVariable(variable, name);
        node.loc = loc;
        return node;
    },
    
    extractValue: function(agg, index, type, name, loc) {
        var node = new mil.ExtractValue(agg, index, type, name);
        node.loc = loc;
        return node;
    },

    insertValue: function(agg, index, value, loc) {
        var node = new mil.InsertValue(agg, index, value);
        node.loc = loc;
        return node;
    },

    gep: function(object, offsets, gepType, type, loc) {
        var node = new mil.GEP(object, offsets, gepType, type);
        node.loc = loc;
        return node;
    },
    
    phi: function(type, exprs, blocks, loc) {
        var node = new mil.Phi(type, exprs, blocks);
        node.loc = loc;
        return node;
    },
    
    call: function(callable, args, returnType, loc) {
        var node = new mil.Call(callable, args, returnType);
        node.loc = loc;
        return node;
    },
    
    invoke: function(callable, args, returnType, contBlock, unwindBlock, loc) {
        var node = new mil.Invoke(callable, args, returnType, contBlock, unwindBlock);
        node.loc = loc;
        return node;
    },
    
    math: function(op, lhs, rhs, loc) {
        var node = new mil.Math(op, lhs, rhs);
        node.loc = loc;
        return node;
    },

    negate: function(operand, loc) {
        var node = new mil.Negate(operand);
        node.loc = loc;
        return node;
    },

    compare: function(op, lhs, rhs, loc) {
        var node = new mil.Compare(op, lhs, rhs);
        node.loc = loc;
        return node;
    },

    landingPad: function(type, isCleanup, loc) {
        var node = new mil.LandingPad(type, isCleanup);
        node.loc = loc;
        return node;
    },

    resume: function(landingPad, loc) {
        var node = new mil.Resume(landingPad);
        this.insert(node);
        node.loc = loc;
        return node;
    },

    catchSwitch: function(parentPad, unwindBlock, loc) {
        var node = new mil.CatchSwitch(parentPad, unwindBlock);
        node.loc = loc;
        return node;
    },

    catchPad: function(parentPad, args, loc) {
        var node = new mil.CatchPad(parentPad, args);
        node.loc = loc;
        return node;
    },

    catchRet: function(catchPad, afterBlock, loc) {
        var node = new mil.CatchRet(catchPad, afterBlock);
        node.loc = loc;
        return node;
    },

    cleanupPad: function(parentPad, args, loc) {
        var node = new mil.CleanupPad(parentPad, args);
        node.loc = loc;
        return node;
    },

    cleanupRet: function(cleanupPad, unwindBlock, loc) {
        var node = new mil.CleanupRet(cleanupPad, unwindBlock);
        node.loc = loc;
        return node;
    },

    // ---------------------------------------------------------------------------------------------
    // Statements
    
    storeVariable: function(variable, value, loc) {
        var node = new mil.StoreVariable(variable, value);
        this.insert(node);
        node.loc = loc;
        return node;
    },

    jump: function(block, loc){
        var node = new mil.Jump(block);
        this.insert(node);
        node.loc = loc;
        return node;
    },

    conditionalJump: function(condition, trueBlock, falseBlock, loc) {
        var node = new mil.ConditionalJump(condition, trueBlock, falseBlock);
        this.insert(node);
        node.loc = loc;
        return node;
    },
    
    return: function(expr, loc) {
        var node = new mil.Return(expr);
        this.insert(node);
        if (!this.insertBlock.returned) {
            this.insertBlock.returned = expr;
        }
        node.loc = loc;
        return node;
    },
    
    unreachable: function() {
        var node = new mil.Unreachable();
        this.insert(node);
        return node;
    },
};
