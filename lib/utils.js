
var fool = require('fool');

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
