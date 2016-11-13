
var T = require('./syntax');

// *************************************************************************************************

function Module(name, path) {
    this.name = name;
    this.path = path;
    this.main = null;
    this.imports = [];
    this.genericClasses = {};
    this.genericFunctions = {};
}

exports.Module = Module;

Module.prototype = {
    declareImport: function(module) {
        this.imports.unshift(module);
    },
    
    declareClass: function(cls) {
        var classes = this.genericClasses[cls.name]
        if (!classes) {
            classes = this.genericClasses[cls.name] = [];
        }
        cls.module = this;
        classes.push(cls);
        
        for (var i = 0, l = cls.methods.length; i < l; ++i) {
            var func = cls.methods[i];
            func.module = this;
        }
    },
    
    declareFunction: function(func) {
        var funcs = this.genericFunctions[func.name]
        if (!funcs) {
            funcs = this.genericFunctions[func.name] = [];
        }
        func.module = this;
        funcs.push(func);
    },

    lookupClass: function(name, accessModule, cb) {
        var classes = this.genericClasses[name]
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
        var funcs = this.genericFunctions[name]
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
