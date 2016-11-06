
var parser = require('./grammar').parser;

exports.parseSource = function(source) {
    // parser.lexer = new MoyaLexer(parser.lexer);
    return parser.parse(' ' + source + '\n');
}

// function MoyaLexer(lexer) {
//     this.lexer = lexer
//
//     this.lex = function() {
//         var token = lexer.lex();
//         D&&D(token);
//         return token;
//     }
//
//     this.input = function() {
//         return lexer.input();
//     }
//
//     this.setInput = function(input, yy) {
//         return lexer.setInput(input, yy);
//     }
// }
