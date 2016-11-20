
var fool = require('fool');

// *************************************************************************************************

function Operator(name, token) {
    this.name = name;
    this.token = token;
}
exports.Operator = Operator;

Operator.prototype = {
    toString: function() {
        return this.token;
    },
};

// *************************************************************************************************

function MathOperator(name, token) {
    this.name = name;
    this.token = token;
}
exports.MathOperator = MathOperator;

MathOperator.prototype = fool.subclass(Operator, {
});

// *************************************************************************************************

function MathIncrementOperator(name, token) {
    this.name = name;
    this.token = token;
}
exports.MathIncrementOperator = MathIncrementOperator;

MathIncrementOperator.prototype = fool.subclass(MathOperator, {
});

// *************************************************************************************************

function ConcatOperator(name, token) {
    this.name = name;
    this.token = token;
}
exports.ConcatOperator = ConcatOperator;

ConcatOperator.prototype = fool.subclass(Operator, {
});

// *************************************************************************************************

function ConcatIncrementOperator(name, token) {
    this.name = name;
    this.token = token;
}
exports.ConcatIncrementOperator = ConcatIncrementOperator;

ConcatIncrementOperator.prototype = fool.subclass(ConcatOperator, {
});

// *************************************************************************************************

function CompareOperator(name, token) {
    this.name = name;
    this.token = token;
}
exports.CompareOperator = CompareOperator;

CompareOperator.prototype = fool.subclass(Operator, {
});

// *************************************************************************************************

function UnaryOperator(name, token) {
    this.name = name;
    this.token = token;
}
exports.UnaryOperator = UnaryOperator;

UnaryOperator.prototype = fool.subclass(Operator, {
});

// *************************************************************************************************

function declareOperator(dest, cons, names) {
    for (var i = 0, l = names.length; i < l; i += 2) {
        var name = names[i];
        var token = names[i+1];
        dest[name] = new cons(name, token);
    }
}

// *************************************************************************************************

declareOperator(exports, Operator, [
    'No', '',
    'Eq', '=',
    'Lookup', '.[]',
    'LookupSet', '.[]=',
    'Index', '[]',
    'IndexSet', '[]=',
    'Slice', '[to]',
    'SliceSet', '[to]=',
    'Or', '|',
    'And', '&',
    'In', 'in this',
    'Read', '<<',
    'Write', '>>',
    'WriteAll', '*>>',
    'Bind', ';',
]);

declareOperator(exports, MathOperator, [
    'Add', '+',
    'Subtract', '-',
    'Multiply', '*',
    'Divide', '/',
    'Mod', '//',
    'Pow', '**',
]);

declareOperator(exports, MathIncrementOperator, [
    'AddEq', '+=',
    'SubtractEq', '-=',
    'MultiplyEq', '*=',
    'DivideEq', '/=',
    'ModEq', '//=',
    'PowEq', '**=',
    'ConcatEq', '++=',
]);

declareOperator(exports, ConcatOperator, [
    'Concat', '++',
]);

declareOperator(exports, ConcatIncrementOperator, [
    'ConcatEq', '++=',
]);

declareOperator(exports, CompareOperator, [
    'Equals', '==',
    'NotEquals', '!=',
    'GreaterThan', '>',
    'GreaterThanEquals', '>=',
    'LessThan', '<',
    'LessThanEquals', '<=',
    'Is', 'is',
    'IsNot', 'is not',
    'Has', 'has',
    'HasNot', 'has not',
    'IsIn', 'is in',
    'NotIn', 'not in',
]);

declareOperator(exports, UnaryOperator, [
    'Not', '!',
    'Positive', '+',
    'Negative', '-',
    'Delete', '-=del',
    'In', 'in this',
]);
