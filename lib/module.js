
var T = require('./syntax');

// *************************************************************************************************

function Module(name, path, source) {
    this.name = name;
    this.path = path;
    this.source = source;
    this.main = null;
    this.imports = [];
    this.classes = {};
    this.funcs = {};
}

exports.Module = Module;

Module.prototype = {
    declareImport: function(module) {
        this.imports.unshift(module);
    },
    
    declareClass: function(cls) {
        var classes = this.classes[cls.name]
        if (!classes) {
            classes = this.classes[cls.name] = [];
        }
        cls.module = this;
        classes.push(cls);
        
        for (var i = 0, l = cls.methods.length; i < l; ++i) {
            var func = cls.methods[i];
            func.module = this;
        }
    },
    
    declareFunction: function(func) {
        var funcs = this.funcs[func.name]
        if (!funcs) {
            funcs = this.funcs[func.name] = [];
        }
        func.module = this;
        funcs.push(func);
    },

    lookupClass: function(name, accessModule, cb) {
        var classes = this.classes[name]
        if (classes) {
            for (var i = 0, l = classes.length; i < l; ++i) {
                var cls = classes[i];
                if (cls.accessMode == T.PublicAccess || accessModule == this) {
                    var ret = cb(cls);
                    if (ret) {
                        return ret;
                    }
                }
            }
        }
        
        var imports = this.imports;
        for (var i = 0, l = imports.length; i < l; ++i) {
            var mod = imports[i];
            var ret = mod.lookupClass(name, accessModule, cb);
            if (ret) {
                return ret;
            }
        }
    },
    
    lookupFunction: function(name, accessModule, cb) {
        var funcs = this.funcs[name]
        if (funcs) {
            for (var i = 0, l = funcs.length; i < l; ++i) {
                var func = funcs[i];
                if (func.accessMode == T.PublicAccess || accessModule == this) {
                    var ret = cb(funcs[i]);
                    if (ret) {
                        return ret;
                    }
                }
            }
        }
        
        var imports = this.imports;
        for (var i = 0, l = imports.length; i < l; ++i) {
            var mod = imports[i];
            var ret = mod.lookupFunction(name, accessModule, cb);
            if (ret) {
                return ret;
            }
        }
    },
};

// *************************************************************************************************

exports.GenericFunction = function(name) {
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

exports.GenericFunction.prototype = {
    get qualifiedName() {
        return (this.class ? this.class.qualifiedName : this.module.name) + ':' + this.name;
    },
    
    get isBoolOverride() {
        if (this.name == '!') {
            return true;
        } else {
            return false;
        }
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

exports.GenericClass = function(name, module) {
    this.name = name;
    this.symbolNames = [];
    this.props = [];
    this.constructors = [];
    this.methods = [];
    this.module = module;
    this.ast = null;
}

exports.GenericClass.prototype = {
    get qualifiedName() {
        return this.module.name + ':' + this.name;
    },
    
    keyWithSymbols: function(argSymbols) {
        var key = this.qualifiedName;
        if (argSymbols) {
            for (var i = 0, l = argSymbols.length; i < l; ++i) {
                key += '(' + argSymbols[i].toString() + ')';
            }
        }
        return key;
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
