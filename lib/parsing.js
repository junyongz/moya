
var ops = require('./operator');

var syntax = require('./syntax'),
    Syntax = syntax.Syntax,
    NumberSyntax = syntax.NumberSyntax,
    FloatSyntax = syntax.FloatSyntax,
    IntegerSyntax = syntax.IntegerSyntax,
    StringSyntax = syntax.StringSyntax,
    IdentifierSyntax = syntax.IdentifierSyntax,
    GetSyntax = syntax.GetSyntax,
    BinarySyntax = syntax.BinarySyntax,
    UnarySyntax = syntax.UnarySyntax,
    AssignmentSyntax = syntax.AssignmentSyntax,
    FunctionSyntax = syntax.FunctionSyntax,
    ArgumentDeclSyntax = syntax.ArgumentDeclSyntax,
    TypeIdSyntax = syntax.TypeIdSyntax,
    TypeAssignmentSyntax = syntax.TypeAssignmentSyntax,
    TypeArgumentsSyntax = syntax.TypeArgumentsSyntax,
    TypeDefSyntax = syntax.TypeDefSyntax,
    ImplementsSyntax = syntax.ImplementsSyntax,
    ClassSyntax = syntax.ClassSyntax,
    PropertySyntax = syntax.PropertySyntax,
    AnonFuncSyntax = syntax.AnonFuncSyntax,
    CallSyntax = syntax.CallSyntax,
    ArgumentSyntax = syntax.ArgumentSyntax,
    DefaultSyntax = syntax.DefaultSyntax,
    RangeSyntax = syntax.RangeSyntax,
    TupleSyntax = syntax.TupleSyntax,
    ListSyntax = syntax.ListSyntax,
    MapSyntax = syntax.MapSyntax,
    ChannelSyntax = syntax.ChannelSyntax,
    BreakSyntax = syntax.BreakSyntax,
    ContinueSyntax = syntax.ContinueSyntax,
    ReturnSyntax = syntax.ReturnSyntax,
    ThrowSyntax = syntax.ThrowSyntax,
    ReadSyntax = syntax.ReadSyntax,
    WriteSyntax = syntax.WriteSyntax,
    YieldSyntax = syntax.YieldSyntax,
    DeferSyntax = syntax.DeferSyntax,
    UseSyntax = syntax.UseSyntax,
    CastSyntax = syntax.CastSyntax,
    TransformSyntax = syntax.TransformSyntax,
    IfSyntax = syntax.IfSyntax,
    IsSyntax = syntax.IsSyntax,
    BlockSyntax = syntax.BlockSyntax,
    IteratorSyntax = syntax.IteratorSyntax,
    ImportSyntax = syntax.ImportSyntax,
    TrySyntax = syntax.TrySyntax,
    CatchSyntax = syntax.CatchSyntax,
    WhileSyntax = syntax.WhileSyntax,
    CFunctionSyntax = syntax.CFunctionSyntax,
    CTypeSyntax = syntax.CTypeSyntax,
    CArgumentSyntax = syntax.CArgumentSyntax,
    PrintSyntax = syntax.PrintSyntax;
    
// *************************************************************************************************

exports.parseArray = function() {
    var array = [];
    for (var i = 0, l = arguments.length; i < l; ++i) {
        array[i] = arguments[i];
    }
    return array;
}

exports.ensureArray = function(obj) {
    if (obj instanceof Array) {
        return obj;
    } else {
        return [obj];
    }
}

function parseNumber(loc, text) {
    var m = /^([0-9]+(\.[0-9]+)?)(.*?)$/.exec(text);
    var unit = m[3] || null;
    var node = m[2]
        ? new FloatSyntax(parseFloat(m[1]))
        : new IntegerSyntax(parseInt(m[1]));
    node.loc = loc;
    if (unit) {
        node.unit = unit;
    }
    return node;
}
exports.parseNumber = parseNumber;

function parseFloatNumber(loc, text) {
    var node = new FloatSyntax(parseFloat(text));
    node.loc = loc;
    return node;
}
exports.parseFloatNumber = parseFloatNumber;

function parseHex(loc, text) {
    return parseNumber(loc, parseInt(text, 16));
}
exports.parseHex = parseHex;

function parseString(loc, str) {
    var escapeMap = {
        'n': '\n',
        't': '\t',
    };

    str = str.replace(/\\x(..)/g, function(s, c) {
        var c = parseInt(c, '16');
        return String.fromCharCode(c);
    });
    
    str = str.replace(/\\(.)/g, function(s, c) {
        if (c in escapeMap) {
            return escapeMap[c];
        } else {
            return c;
        }
    });
    
    var node = new StringSyntax(str);
    node.loc = loc;
    return node;
}
exports.parseString = parseString;

function parseQuotes(loc, quote, str){
    if (quote.length > 1) {
        var name = quote.slice(0, quote.length-1);
        var id = parseId(loc, name);
        var call = exports.parseCall(loc, id, [str]);
        return call;
    } else {
        return str;
    }
}
exports.parseQuotes = parseQuotes;

function parseStringFormat(loc, str) {
    var parts = str.split('.');
    var id = parts[0]
    if (parts == '%') {
        return parseString(loc, id);
    } else {
        id = id.slice(1);
    }
    var left = exports.parseId(loc, parts[0].slice(1));
    left.loc = loc;
    for (var i = 1, l = parts.length; i < l; ++i) {
        left = exports.parseGet(loc, left, parts[i]);
        left.loc = loc;
    }
    return left;
}
exports.parseStringFormat = parseStringFormat;

function addString(loc, left, right) {
    var node = new BinarySyntax(ops.Concat, left, right);
    node.loc = loc;
    return node;
}
exports.addString = addString;

function parseId(loc, text) {
    var id = new IdentifierSyntax(text);
    id.loc = loc;
    return id;
}
exports.parseId = parseId;

exports.parseAssignment = function(loc, op, left, right) {
    var node = new AssignmentSyntax(op, left, right);
    node.loc = loc;
    return node;
}

exports.parseBinary = function(loc, op, left, right) {
    if (op == ops.Index && right instanceof RangeSyntax) {
        op = ops.Slice;
    }
    var node = new BinarySyntax(op, left, right);
    node.loc = loc;
    return node;
}

exports.parseUnary = function(loc, op, operand) {
    if (op == ops.Negative && operand instanceof NumberSyntax) {
        operand.value = -operand.value;
        return operand;
    } else {
        var node = new UnarySyntax(op, operand);
        node.loc = loc;
        return node;
    }
}

exports.parseEmptyFunc = function(loc, id, accessMode) {
    var node = new FunctionSyntax(id, [], null);
    node.accessMode = accessMode;
    node.loc = loc;
    return node;
}

exports.parseOpFunc = function(loc, op, args, returns, schedule) {
    var func = exports.parseFunc(loc, exports.parseId(op, op.token), args, returns, schedule);
    func.operator = op;
    return func;
}

exports.parseFunc = function(loc, id, args, returns, schedule) {
    if (!id && args instanceof FunctionSyntax) {
        var node = args;
        node.returns = returns;
        node.schedule = schedule;
        node.loc = loc;
        return node;
    } else {
        var node = new FunctionSyntax(id, args, returns || null, schedule || null);
        node.loc = loc;
        return node;
    }
}

exports.parseFuncBlock = function(loc, accessMode, decl, block) {
    decl.accessMode = accessMode
    decl.block = block;
    decl.loc = loc;
    return decl;
}

exports.parseArgDecl = function(loc, name, outerName, isVariadic) {
    var innerName = null, type = null;
    if (name instanceof TypeAssignmentSyntax) {
        innerName = name.name;
        type = name.type;
    } else {
        innerName = outerName ? outerName.slice(1) : name;
    }
    if (outerName) {
        outerName = outerName.slice(1);
    }
    var node = new ArgumentDeclSyntax(innerName, outerName, type, isVariadic);
    node.loc = loc;
    return node;
}

exports.parseTypeAssignment = function(loc, name, type, pointers) {
    var node = new TypeAssignmentSyntax(name, type, pointers);
    node.loc = loc;
    return node;
}

exports.parseTypeId = function(loc, id, pointers) {
    var node = new TypeIdSyntax(id, pointers);
    node.loc = loc;
    return node;
}

exports.parseTypeArguments = function(loc, id) {
    var node = new TypeArgumentsSyntax(id);
    node.loc = loc;
    return node;
}

exports.ensureTypeArguments = function(loc, other) {
    if (other instanceof TypeArgumentsSyntax) {
        return other;
    } else {
        return this.parseTypeArguments(loc, other);
    }
}

exports.parseTypeDef = function(loc, access, name, base) {
    var node = new TypeDefSyntax(access, name, base);
    node.loc = loc;
    return node;
}

exports.parseImplements = function(loc, left, right) {
    var node = new ImplementsSyntax(left, right);
    node.loc = loc;
    return node;
}

exports.parseClass = function(loc, access, name, base, body) {
    var node = new ClassSyntax(access, name, base, body);
    node.loc = loc;
    return node;
}

exports.parseProperty = function(loc, access, name, type, block) {
    var node = new PropertySyntax(access, name, type, block);
    node.loc = loc;
    return node;
}

exports.parseAnonFunc = function(loc, args, body) {
    var argList = null;
    if (args instanceof Array) {
        argList = args;
    } else if (args instanceof Array) {
        argList = args.slice();
    } else if (args instanceof Syntax) {
        argList = [args];
    }
    var node = new AnonFuncSyntax(argList, body);
    node.loc = loc;
    return node;
}

exports.parseCall = function(loc, callable, args) {
    var node = new CallSyntax(callable, args);
    node.loc = loc;
    return node;
}

exports.parseCallBlock = function(loc, callable, arg) {
    if (callable instanceof CallSyntax) {
        if (arg) {
            callable.args.push(arg);
        }
        return callable;
    } else {
        return exports.parseCall(loc, callable, arg ? [arg] : null);
    }
}

exports.parseArg = function(loc, expr, outerName) {
    if (expr) {
        var node = new ArgumentSyntax(expr, outerName ? outerName.slice(1) : null);
        node.loc = loc;
        return node;
    }
}

exports.parseGet = function(loc, left, name) {
    var node = new GetSyntax(left, name);
    node.loc = loc;
    return node;
}

exports.parseDefault = function(loc, expr, defaultValue) {
    var node = new DefaultSyntax(expr, defaultValue);
    node.loc = loc;
    return node;
}

exports.parseUndefined = function(loc) {
    return exports.parseId(loc, "undefined");
}

exports.parseRange = function(loc, from, to, by, isThrough) {
    var node = new RangeSyntax(from, to, by, isThrough);
    node.loc = loc;
    return node;
}

exports.parseInfixOp = function(loc, op, left, right) {
    var callable = new IdentifierSyntax(op.slice(1));
    var node = new CallSyntax(callable, [left, right]);
    node.loc = loc;
    return node;
}

exports.parseTuple = function(loc, items) {
    if (!items) {
        items = [];
    } else if (items instanceof Array) {
        if (items.length == 1) {
            return items;
        }
    } else {
        return items;
    }
    
    var node = new TupleSyntax(items);
    node.loc = loc;
    return node;
}

exports.ensureTuple = function(loc, tuple, item) {
    if (!(tuple instanceof TupleSyntax)) {
        tuple = new TupleSyntax([tuple]);
    }
    tuple.loc = loc;
        
    tuple.items.push(item);
    return tuple;
}

exports.ensureTupleRight = function(loc, item, tuple) {
    if (!(tuple instanceof TupleSyntax)) {
        tuple = new TupleSyntax([tuple]);
    }
    tuple.loc = loc;
        
    tuple.items.unshift(item);
    return tuple;
}
        
exports.parseList = function(loc, items) {
    if (!items) {
        items = [];
    } else if (!(items instanceof Array)) {
        items = [items];
    }
    var node = new ListSyntax(items);
    node.loc = loc;
    return node;
}

exports.parseMap = function(loc, pairs) {
    if (!pairs) {
        pairs = [];
    } else if (!(pairs instanceof Array)) {
        pairs = [pairs];
    }
    var node = new MapSyntax(pairs);
    node.loc = loc;
    return node;
}

exports.parseChannel = function(loc, items) {
    var node = new ChannelSyntax(items);
    node.loc = loc;
    return node;
}

exports.parseBreak = function(loc) {
    var node = new BreakSyntax();
    node.loc = loc;
    return node;
}

exports.parseContinue = function(loc) {
    var node = new ContinueSyntax();
    node.loc = loc;
    return node;
}

exports.parseReturn = function(loc, expr) {
    var node = new ReturnSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseThrow = function(loc, expr) {
    var node = new ThrowSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseDefer = function(loc, expr) {
    var node = new DeferSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseUse = function(loc, expr) {
    var node = new UseSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseCast = function(loc, expr, type) {
    var node = new CastSyntax(expr, type);
    node.loc = loc;
    return node;
}

exports.parseTransform = function(loc, pair) {
    var node = new TransformSyntax();
    if (pair) {
        node.addPair(pair);
    }
    node.loc = loc;
    return node;
}

exports.parseTransformPair = function(clause, body) {
    return {clause: clause, body: body};
}

exports.parseIf = function(loc, transforms, elsex) {
    var node = new IfSyntax(transforms, elsex);
    node.loc = loc;
    return node;
}

exports.parseIfExpr = function(loc, transforms, elsex) {
    var node = new IfSyntax(transforms, elsex);
    node.loc = loc;
    return node;
}

exports.parseIs = function(loc, object, transforms, elsex) {
    var node = new IsSyntax(object, transforms, elsex);
    node.loc = loc;
    return node;
}

exports.parseBlock = function(loc, block, where, isImperative, throwsIf) {
    if (!block) {
        block = [];
    } else if (!(block instanceof Array)) {
        block = [block];
    }
    if (!where) {
        where = null;
    } else if (!(where instanceof Array)) {
        where = [where];
    }

    if (block.length == 1 && !where && !isImperative && !throwsIf) {
        return block[0];
    }

    var node = new BlockSyntax(block, where, throwsIf, isImperative);
    node.loc = loc;
    return node;
}

exports.ensureBlock = function(loc, block, where, isImperative) {
    if (block instanceof BlockSyntax) {
        if (where) {
            block.where = where instanceof Array ? where : [where];
        }
        block.isImperative = isImperative;
        block.loc = loc;
        return block;
    } else {
        return this.parseBlock(loc, block, where, isImperative);
    }
}

exports.parseIterator = function(loc, decl, iterable, clause, body, inOn, ifWhile) {
    var node = new IteratorSyntax(decl, iterable, clause, body, inOn, ifWhile);
    node.loc = loc;
    return node;
}

exports.parseMapper = function(loc, decl, clause, body, inOn, ifWhile) {
    var iterable = exports.parseId(loc, 'iterable');
    var node = new IteratorSyntax(decl, iterable, clause, body, inOn, ifWhile);
    node.loc = loc;
    var arg = exports.parseArgDecl(loc, 'iterable', null, false);
    var fn = exports.parseAnonFunc(loc, [arg], exports.ensureBlock(loc, node));
    return fn;
}

exports.parseImport = function(loc, moduleNames) {
    var node = new ImportSyntax(moduleNames);
    node.loc = loc;
    return node;
}

exports.parseTry = function(loc, block, catchers) {
    var node = new TrySyntax(block, catchers);
    node.loc = loc;
    return node;
}

exports.parseCatch = function(loc, decl, block) {
    var node = new CatchSyntax(decl, block);
    node.loc = loc;
    return node;
}

exports.parseWhile = function(loc, clause, block) {
    var node = new WhileSyntax(clause, block);
    node.loc = loc;
    return node;
}

exports.parseCFunction = function(loc, type, name, args) {
    var node = new CFunctionSyntax(type, name, args);
    node.loc = loc;
    return node;
}

exports.parseCType = function(loc, name) {
    var node = new CTypeSyntax(name);
    node.loc = loc;
    return node;
}

exports.parseCArgument = function(loc, type, name) {
    var node = new CArgumentSyntax(type, name);
    node.loc = loc;
    return node;
}

exports.setLibrary = function(func, cprefix) {
    var library = cprefix.slice(2, cprefix.length-1);
    if (library) {
        func.library = library;
    }
}

exports.parsePrint = function(loc, expr) {
    var node = new PrintSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseRead = function(loc, expr) {
    var node = new ReadSyntax(expr);
    node.loc = loc;
    return node;
}

exports.parseWrite = function(loc, left, right, isWriteAll) {
    var node = new WriteSyntax(left, right, isWriteAll);
    node.loc = loc;
    return node;
}

exports.parseYield = function(loc, expr, isYieldAll) {
    var node = new YieldSyntax(expr, isYieldAll);
    node.loc = loc;
    return node;
}
