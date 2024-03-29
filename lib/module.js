
var constants = require('./constants'),
    PrivateAccess = constants.PrivateAccess,
    PublicAccess = constants.PublicAccess;

// *************************************************************************************************

function Module(name, path, source) {
    this.name = name;
    this.path = path;
    this.source = source;
    this.main = null;
    this.imports = [];
    this.props = [];
    this.classes = {};
    this.typeAliases = {};
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

    declareTypeAlias: function(left, right, accessMode) {
        var alias = new TypeAlias(left, right, accessMode);
        if (right) {
            this.typeAliases[left] = alias;
        }
        return alias;
    },
    
    declareFunction: function(func, alias) {
        if (!alias) {
            alias = func.name;
        }
        var funcs = this.funcs[alias]
        if (!funcs) {
            funcs = this.funcs[alias] = [];
        }
        func.module = this;
        funcs.push(func);
    },

    lookupClass: function(name, accessModule, cb) {
        var classes = this.classes[name]
        if (classes) {
            for (var i = 0, l = classes.length; i < l; ++i) {
                var cls = classes[i];
                if (cls.accessMode == PublicAccess || accessModule == this) {
                    var ret = cb(cls);
                    if (ret) {
                        return ret;
                    }
                }
            }
        }
        
        var alias = this.typeAliases[name];
        if (alias) {
            if (alias.accessMode == PublicAccess || accessModule == this) {
                var ret = alias.evaluateAlias(accessModule, cb);
                if (ret) {
                    return ret;
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
            for (var i = funcs.length-1; i >= 0; --i) {
                var func = funcs[i];
                if (func.accessMode == PublicAccess || accessModule == this) {
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

exports.GenericFunction = function(name, loc) {
    this.name = name;
    this.loc = loc;
    this.accessMode = PrivateAccess;
    this.symbolNames = [];
    this.args = null;
    this.returns = null;
    this.minimumArgCount = 0;
    this.isConstructor = false;
    this.isCFunction = false;
    this.module = null;
    this.class = null;
    this.operator = null;
}

exports.GenericFunction.prototype = {
    get qualifiedName() {
        if (this.isCFunction) {
            return this.name;
        } else if (this.name) {
            var qualifier = this.class
                ? this.class.qualifiedName
                : (this.module
                    ? this.module.name
                    : '');
            return qualifier + ':' + this.name;
        } else {
            return null;
        }
    },
};

// *************************************************************************************************

exports.GenericClass = function(name, module, loc) {
    this.name = name;
    this.loc = loc;
    this.module = module;
    this.symbolNames = [];
    this.props = [];
    this.constructors = [];
    this.methods = [];
    this.ast = null;
}

exports.GenericClass.prototype = {
    get qualifiedName() {
        return this.module.name + ':' + this.name;
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

function TypeAlias(name, right, accessMode) {
    this.name = name;
    this.right = right;
    this.accessMode = accessMode;
}
exports.TypeAlias = TypeAlias;

exports.TypeAlias.prototype = {
    get qualifiedName() {
        return this.left;
    },

    evaluateAlias: function(accessModule, cb) {
        if (this.right) {
            return this.right.evaluateAlias(accessModule, cb);
        } else {
            return accessModule.lookupClass(this.name, accessModule, cb);
        }
    },
}
