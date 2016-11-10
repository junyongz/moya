
var fool = require('fool');

// *************************************************************************************************

function Expr(type, value) {
    this.type = type;
    this.value = value;
}

function expr(type, value) {
    return new Expr(type, value);
}
exports.expr = expr;

// *************************************************************************************************

function MoyaError(message, loc) {
    this.message = message;
    this.loc = loc;
}
exports.MoyaError = MoyaError;

MoyaError.prototype = fool.subclass(Error, {
    toString: function() {
        return this.message;
    },
});
