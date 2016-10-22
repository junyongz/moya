%{

var T = require('./syntax');
    
%}

%lex

%x text
%x ccode

escape [0abfnrtvxuU'"?\\}%]
escapeSequence [\\]({escape})
stringChar [^'\\\n]|{escapeSequence}
fstringChar [^"\\\n]|{escapeSequence}
rawTextChar [^%\\"]|{escapeSequence}

ws [ \t]
nl [\n\r]

idLower [a-z][0-9a-zA-Z]*
idUpper [A-Z][0-9a-zA-Z]*
idDots ({idLower}*)([.]{idLower}+)*
idSymbol [%$¢€£¥]+
specialty [a-zA-Z][0-9a-zA-Z]*(@[a-zA-Z][0-9a-zA-Z]*)?
unit [a-zA-Z%$¢€£¥]+

integer [0-9]+
float [0-9]+[\.][0-9]+
floatExp [0-9]+[\.][0-9]+[e][\+\-][0-9]+
hex 0x[0-9A-Fa-f]+

%%

{ws}+                                      { return null; }
"\\"{ws}*{nl}                              { return null; }

"`"[^\n\r]*        		                   { return null; }
"====="[=]+{nl}(.*?){nl}"====="[=]+{nl}    { return null; }
"-----"[-]+{nl}                            { return null; }

"if"                { return 'IF'; }
"else"              { return 'ELSE'; }
"or"{ws}*"else"     { return 'ORELSE'; }

"for"               { return 'FOR'; }
"on"                { return 'ON'; }
"while"             { return 'WHILE'; }
"break"             { return 'BREAK'; }
"continue"          { return 'CONTINUE'; }
"do"                { return 'DO'; }

"try"               { return 'TRY'; }
"catch"             { return 'CATCH'; }
"finally"           { return 'FINALLY'; }
"throw"             { return 'THROW'; }

"..."               { return 'DOT3'; }
".."                { return 'DOT2'; }
"."                 { return 'DOT'; }

","{ws}*{nl}?       { return 'COMMA'; }
";"                 { return 'SEMICOLON'; }

"("{ws}*{nl}*{ws}*  { return 'LP'; }
{nl}*{ws}*")"       { return 'RP'; }
"["{ws}*{nl}*{ws}*  { return 'LB'; }
{nl}*{ws}*"]"       { return 'RB'; }
"{|"{ws}*{nl}*{ws}* { return 'LCBP'; }
{nl}*{ws}*"|}"      { return 'RCBP'; }
"{"{ws}*{nl}*{ws}*  { return 'LCB'; }
{nl}*{ws}*"}"       { return 'RCB'; }

"<-"                { return 'LARROW'; }
"->"                { return 'RARROW'; }
"<<<"               { return 'LARROW3'; }
"<<"                { return 'LARROW2'; }
">>>"               { return 'RARROW3'; }
">>"                { return 'RARROW2'; }
"*>>"               { return 'RARROW2MUL'; }

"+="                { return 'ADD_EQ'; }
"*="                { return 'STAR_EQ'; }
"-="                { return 'SUBTRACT_EQ'; }
"//="               { return 'SLASH2_EQ'; }
"/="                { return 'SLASH_EQ'; }
"**="               { return 'STAR2_EQ'; }
"++="               { return 'CONCAT_EQ'; }

"--"                { return 'DASHDASH'; }
"//"                { return 'SLASH2'; }
"**"                { return 'STAR2'; }
"++"                { return 'CONCAT'; }

"+"                 { return 'ADD'; }
"-"                 { return 'SUBTRACT'; }
"*"                 { return 'STAR'; }
"/"                 { return 'SLASH'; }

"as"                { return 'AS'; }
"is"{ws}+"in"       { return 'ISIN'; }
"is"{ws}+"not"      { return 'ISNOT'; }
"is"                { return 'IS'; }
"not"{ws}+"in"      { return 'NOTIN'; }
"has{ws+}not"       { return 'HASNOT'; }
"has"               { return 'HAS'; }
"in"                { return 'IN'; }

"=="                { return 'EQ2'; }
"!="                { return 'NEQ'; }
"<="                { return 'LTE'; }
"<"                 { return 'LT'; }
">="                { return 'GTE'; }
">"                 { return 'GT'; }

"=>"                { return 'FATARROW'; }
"="                 { return 'EQ'; }

"::"                { return 'COLON2'; }
":="                { return 'COLONEQ'; }
":"                 { return 'COLON'; }

"@"                 { return 'AT'; }
"^"                 { return 'CARET'; }
"_"                 { return 'UNDERSCORE'; }
"#"                 { return 'POUND'; }
"~"                 { return 'TILDE'; }
"&"                 { return 'AMPERSAND'; }
"|"                 { return 'PIPE'; }
"||"                { return 'PIPE2'; }
"?"                 { return 'QUESTION'; }
"!"                 { return 'EXCLAMATION'; }
"\\"                { return 'BACKSLASH'; }

"to"                { return 'TO'; }
"through"           { return 'THROUGH'; }
"by"                { return 'BY'; }
"where"             { return 'WHERE'; }

{nl}{ws}+                           { return 'NEWLINE'; }
{nl}                                { return 'NEWLINE'; }

"C"["]                              { this.begin('ccode'); }
{specialty}?["]                     { this.begin('text'); return 'STRING_OPEN'; }

"0x"[0-9A-Fa-f]+                    { return 'HEX'; }
{floatExp}                          { return 'FLOAT_EXP'; }
[0-9]+[\.][0-9]+{unit}              { return 'FLOAT_UNIT'; }
[0-9]+[\.][0-9]+                    { return 'FLOAT'; }

[0-9]+{unit}                        { return 'INTEGER_UNIT'; }
[0-9]+                              { return 'INTEGER'; }

{idLower} { return 'IDENTIFIER'; }
{idSymbol} { return 'IDENTIFIER'; }
"_"{idLower} { return 'UNIDENTIFIER'; }
{idUpper}  { return 'UIDENTIFIER'; }

"•"{idLower}        { return 'BIDENTIFIER'; }
"•"                 { return 'BULLET'; }

. { throw({message: 'Invalid syntax', loc: yylloc}); }

// ***********************************************************************************************

<text>"%"{idDots}           { return 'STRING_FORMAT'; }
<text>{rawTextChar}+        { return 'STRING'; }
<text>["]                   { this.popState(); return 'STRING_CLOSE'; }
<text>.                     { throw({message: 'Invalid syntax', loc: yylloc}); }

// ***********************************************************************************************

<ccode>{ws}+             { }
<ccode>{nl}              { }

<ccode>["]               { this.popState(); }

<ccode>"("               { return 'LP'; }
<ccode>")"               { return 'RP'; }
<ccode>"*"               { return 'STAR'; }
<ccode>","               { return 'COMMA'; }
<ccode>";"               { return 'SEMICOLON'; }
<ccode>"const"           { return 'CONST'; }
<ccode>"struct"          { return 'STRUCT'; }

<ccode>"void"                  { return 'CPRIMITIVE'; }
<ccode>"bool"                  { return 'CPRIMITIVE'; }
<ccode>"char"                  { return 'CPRIMITIVE'; }
<ccode>"unsigned char"         { return 'CPRIMITIVE'; }
<ccode>"short"                 { return 'CPRIMITIVE'; }
<ccode>"unsigned short"        { return 'CPRIMITIVE'; }
<ccode>"int"                   { return 'CPRIMITIVE'; }
<ccode>"unsigned int"          { return 'CPRIMITIVE'; }
<ccode>"long"                  { return 'CPRIMITIVE'; }
<ccode>"unsigned long"         { return 'CPRIMITIVE'; }
<ccode>"long long"             { return 'CPRIMITIVE'; }
<ccode>"unsigned long long"    { return 'CPRIMITIVE'; }
<ccode>"float"                 { return 'CPRIMITIVE'; }
<ccode>"double"                { return 'CPRIMITIVE'; }
<ccode>"long double"           { return 'CPRIMITIVE'; }
<ccode>{idLower}               { return 'IDENTIFIER'; }
<ccode>{idUpper}               { return 'IDENTIFIER'; }

<ccode>.                       { throw({message: 'Invalid syntax', loc: yylloc}); }

// ***********************************************************************************************

/lex

%token <stringValue> IDENTIFIER
%token <stringValue> UIDENTIFIER
%token <stringValue> UNIDENTIFIER
%token <stringValue> BIDENTIFIER
%token <objectValue> STRING_OPEN
%token <objectValue> STRING_CLOSE
%token <objectValue> STRING
%token <objectValue> STRING_FORMAT
%token <objectValue> INTEGER
%token <objectValue> INTEGER_UNIT
%token <objectValue> FLOAT
%token <objectValue> FLOAT_UNIT
%token <objectValue> FLOAT_EXP
%token <objectValue> HEX
%token <stringValue> CPRIMITIVE
%token <objectValue> CFUNCTION

%left NEWLINE
%left INLINE_EXPR CFUNCTION
%left TRY CATCH FINALLY THROW
%left FOR ON WHILE BREAK CONTINUE DO
%left IF ELSE ORELSE
%left POUND CARET AT UNDERSCORE
%left FATARROW LARROW RARROW LARROW2 RARROW2 RARROW3 LARROW3 RARROW2MUL
%left COLON COLON2 SEMICOLON
%left EQ COLONEQ ADD_EQ SUBTRACT_EQ STAR_EQ SLASH_EQ SLASH2_EQ STAR2_EQ CONCAT_EQ
%left AS IS ISNOT HAS HASNOT IN ISIN NOTIN
%left EQ2 NEQ LT LTE GT GTE CONCAT CONCATSTR
%left ADD SUBTRACT STAR SLASH SLASH2 STAR2
%left DOT DOT2 DOT3 EXCLAMATION QUESTION COMMA DASHDASH TILDE AMPERSAND PIPE PIPE2
%left OPEN_OPERATOR OPEN_OPERATORQ CLOSE_OPERATOR OPERATOR OPERATORQ
%left BACKSLASH BULLET TO THROUGH BY WHERE
%left LP LB LCB LCBP
%left RP RB RCB RCBP
%left CONST STRUCT

%start root

%%

root:
    declarationList
        { return $1; }
    ;

lineEnding:
    NEWLINE
        { $$ = null; }
    ;

declaration:
    importDirective
    | cDeclarations lineEnding
    | declarationBlock
    | block
    | lineEnding
    ;

declarationList:
    declaration
        { $$ = new T.SetSyntax(@1); $$.append($1); }
    | declarationList lineEnding declaration
        { $$ = $1; $1.append($2); }
    ;


declarationBlock:
    accessMode declFunc
        { $$ = T.parseFuncBlock(@1, $1, $2, null, false); }
    | accessMode declFunc block
        { $$ = T.parseFuncBlock(@1, $1, $2, $3, false); }
    | accessMode declFunc DO blockOrTuple
        { $$ = T.parseFuncBlock(@1, $1, $2, $4, true); }
    | accessMode declFunc FATARROW blockOrTuple
        { $$ = T.parseFuncBlock(@1, $1, $2, $4, false); }

    | accessMode declClassId
        { $$ = T.parseClass(@1, $1, $2, null, null); }
    | accessMode declClassId COLON declTypeId
        { $$ = T.parseClass(@1, $1, $2, $3, null); }
    | accessMode declClassId block
        { $$ = T.parseClass(@1, $1, $2, null, $3); }
    | accessMode declClassId COLON declTypeId block
        { $$ = T.parseClass(@1, $1, $2, $4, $5); }

    | accessMode IDENTIFIER EQ blockOrTuple
        { $$ = T.parseProperty(@1, $1, $2, null, $4); }
    | accessMode IDENTIFIER EQ blockOrTuple WHERE blockOrTuple
        { $$ = T.parseProperty(@1, $1, $2, null, $4, $6); }
    | accessMode IDENTIFIER COLON declTypeId EQ blockOrTuple
        { $$ = T.parseProperty(@1, $1, $2, $4, $6); }
    | accessMode IDENTIFIER COLON declTypeId EQ blockOrTuple WHERE blockOrTuple
        { $$ = T.parseProperty(@1, $1, $2, $4, $6, $8); }
    ;

blockOrTuple:
    block
    | tupleExpression
        { $$ = new T.SetSyntax(@1, $1); }
    ;

declFunc:
    declId
        { $$ = T.parseFuncDecl(@1, $1, null, null, null); }
    | declId LP RP
        { $$ = T.parseFuncDecl(@1, $1, null, null, null); }
    | declId LP RP AT IDENTIFIER
        { $$ = T.parseFuncDecl(@1, $1, null, null, $5); }
    | declId LP RP COLON declTypeId
        { $$ = T.parseFuncDecl(@1, $1, null, $5, null); }
    | declId LP RP COLON declTypeId AT IDENTIFIER
        { $$ = T.parseFuncDecl(@1, $1, null, $5, $7); }
    
    | declId LP declArgumentList RP
        { $$ = T.parseFuncDecl(@1, $1, $3); }
    | declId LP declArgumentList RP AT IDENTIFIER
        { $$ = T.parseFuncDecl(@1, $1, $3, null, $6); }
    | declId LP declArgumentList RP COLON declTypeId
        { $$ = T.parseFuncDecl(@1, $1, $3, $6, null); }
    | declId LP declArgumentList RP COLON declTypeId AT IDENTIFIER
        { $$ = T.parseFuncDecl(@1, $1, $3, $6, $8); }
    ;

declClassId:
    UIDENTIFIER
        { $$ = T.parseTypeId(@1, $1); }
    | declClassId BACKSLASH UIDENTIFIER
        { $$ = $1; $1.appendId($3); }
    ;

declId:
    IDENTIFIER
        { $$ = T.parseTypeId(@1, $1); }
    | declId BACKSLASH UIDENTIFIER
        { $$ = $1; $1.appendId($3); }
    ;

declTypeId:
    UIDENTIFIER
        { $$ = T.parseTypeId(@1, $1); }
    | declTypeId BACKSLASH UIDENTIFIER
        { $$ = $1; $1.appendId($3); }
    | declTypeId BACKSLASH LP declTypeId RP
        { $$ = $1; $1.append($4); }
    | LT declTypeId GT
        { $$ = T.parseTypeId(@1, 'Channel'); $$.append($2); }
    | LB declTypeId RB
        { $$ = T.parseTypeId(@1, 'List'); $$.append($2); }
    | LCBG declTypeId RCBG
        { $$ = T.parseTypeId(@1, 'Map'); $$.append($2); }
    ;
    
declArgumentList:
    declArgument
        { $$ = new T.SetSyntax(@1); $$.append($1); }
    | declArgumentList COMMA
        { $$ = $1; }
    | declArgumentList COMMA declArgument
        { $$ = $1; $1.append($3); }
    ;

declArgumentPair:
    IDENTIFIER
        { $$ = T.parseTypeAssignment(@1, $1, null); }
    | IDENTIFIER COLON declTypeId
        { $$ = T.parseTypeAssignment(@1, $1, $3); }
    ;

declArgument:
    declArgumentPair
        { $$ = T.parseArgDecl(@1, $1, null, false); }
    | BIDENTIFIER declArgumentPair
        { $$ = T.parseArgDecl(@1, $2, $1, false); }
    | BIDENTIFIER
        { $$ = T.parseArgDecl(@1, null, $1, false); }
    | DOT3 declArgumentPair
        { $$ = T.parseArgDecl(@1, $2, null, true); }
    | declArgument EQ simpleExpression
        { $$ = $1; $1.defaultValue = $3; }
    ;
    
accessMode:
    ADD
        { $$ = T.PublicAccess; }
    | SUBTRACT
        { $$ = T.PrivateAccess; }
    ;
    
statement:
    rightBlock
    | controlFlowStatement
    // | whileBlock
    // | tryBlock
    | STAR2 declArgument
        { $$ = $2; }
    | lineEnding
    ;

statementList:
    statement
        { $$ = new T.SetSyntax(@1); $$.append($1); }
    | statementList lineEnding statement
        { $$ = $1; $1.append($3); }
    ;

importDirective:
    GT moduleNameList
        { $$ = PARSE_IMPORT(@1, $2); }
    ;

moduleName:
    SLASH id
        { $$ = PARSE_SET(@1); APPEND($$, $2); }
    | moduleName SLASH id
        { $$ = $1; APPEND($$, $3); }
    ;

moduleNameList:
    moduleName
        { $$ = PARSE_SET(@1); APPEND($$, $1); }
    | moduleNameList COMMA moduleName
        { $$ = $1; APPEND($$, $3); }
    ;

controlFlowStatement:
    EQ rightBlock
        { $$ = T.parseReturn(@1, $2); }
    | EQ lineEnding
        { $$ = T.parseReturn(@1, T.parseUndefined(@1)); }
    | CONTINUE lineEnding
        { $$ = T.parseContinue(@1, null); }
    | BREAK lineEnding
        { $$ = T.parseBreak(@1); }
    | THROW rightBlock
        { $$ = T.parseThrow(@1, $2); }
    | THROW lineEnding
        { $$ = T.parseThrow(@1, T.parseUndefined(@1)); }
    ;

whileBlock:
    WHILE right block lineEnding
        { $$ = PARSE_WHILE(@1, $2, $3); }
    ;

tryBlock:
    TRY block lineEnding catchBlockList
        { $$ = PARSE_TRY(@1, $2, $4, NULL); }
    | TRY block lineEnding catchBlockList finallyBlock
        { $$ = PARSE_TRY(@1, $2, $4, $5); }
    | TRY block lineEnding finallyBlock
        { $$ = PARSE_TRY(@1, $2, NULL, $4); }
    ;

catchBlock:
    CATCH block lineEnding
        { $$ = PARSE_CATCH(@1, NULL, $2); }
    | CATCH callExpression lineEnding
        { $$ = PARSE_CATCH(@1, $2, NULL); }
    | CATCH callExpression block lineEnding
        { $$ = PARSE_CATCH(@1, $2, $3); }
    ;

catchBlockList:
    catchBlock
        { $$ = PARSE_SET(@1); APPEND($$, $1); }
    | catchBlockList catchBlock
        { $$ = $1; APPEND($1, $2); }
    ;

finallyBlock:
    FINALLY block lineEnding
        { $$ = PARSE_1(UpFinallySyntaxType, @1, $2); }
    ;

right:
    assignmentExpressionSimple
    ;

rightBlock:
    whereExpression
    ;

rightList:
    right
    | rightList COMMA right
        { $$ = T.ensureSet(@1, $1); $$.append($3); }
    | rightList COMMA
        { $$ = $1; }
    ;

whereExpression:
    blockChain
    | blockChain WHERE blockLeft
        { $$ = PARSE_WHERE(@1, $1, $3); }
    | blockChain WHERE block
        { $$ = PARSE_WHERE(@1, $1, $3); }
    ;

blockChain:
    blockLeft
    | blockLeft blockArguments
        { $$ = APPEND_ARGS($1, $2); }
    ;

blockArguments:
    BIDENTIFIER blockRight
        { $$ = PARSE_ARG(@1, $1, $2, NULL); }
    | BIDENTIFIER blockRight blockArguments
        { $$ = PARSE_ARG(@1, $1, $2, $3); }
    // | BIDENTIFIER assignmentExpression
    //     { $$ = PARSE_ARG(@1, $1, $2, NULL); }
    // | BIDENTIFIER assignmentExpression lineEnding blockArguments
    //     { $$ = PARSE_ARG(@1, $1, $2, $4); }
    
    // | AMPERSAND blockRight
    //     { $$ = PARSE_ARG(@1, NULL, $2, NULL); }
    // | AMPERSAND blockRight blockArguments
    //     { $$ = PARSE_ARG(@1, NULL, $2, $3); }
    // | AMPERSAND assignmentExpression
    //     { $$ = PARSE_ARG(@1, NULL, $2, NULL); }
    // | AMPERSAND assignmentExpression lineEnding blockArguments
    //     { $$ = PARSE_ARG(@1, NULL, $2, $4); }
    ;
    
blockLeft:
    tupleExpression
    // | tupleExpression block
    //     { $$ = APPEND_ARGS($1, PARSE_ARG(@2, NULL, $2, NULL)); }
    // | tupleExpression BULLET assignmentExpression lineEnding
    //     { $$ = $1; /*PARSE_CALL(@1, $1, PARSE_ARG(@2, NULL, $3, NULL));*/ }
    // | tupleExpression BULLET blockRight
    //     { $$ = $1; /*PARSE_CALL(@1, $1, PARSE_ARG(@2, NULL, $3, NULL));*/ }
    // | tupleExpression BIDENTIFIER assignmentExpression lineEnding
    //     { $$ = $1; /*PARSE_CALL(@1, $1, PARSE_ARG(@2, $2, $3, NULL));*/ }
    // | tupleExpression BIDENTIFIER blockRight
    //     { $$ = $1; /*PARSE_CALL(@1, $1, PARSE_ARG(@2, $2, $3, NULL));*/ }
    
    | tupleExpression assignOp assignmentExpression block
        { $$ = PARSE_FUNCTION(@1, T.parseAssignment(@1, $2, $1, $3), $4, false); }
    | tupleExpression assignOp assignmentExpression
        { $$ = T.parseAssignment(@1, $2, $1, $3); }
    | tupleExpression assignOp blockRight
        { $$ = T.parseAssignment(@1, $2, $1, $3); }
    
    | DASHDASH tupleExpression
        { $$ = PARSE_1(UpPrintSyntaxType, @1, $2); }
    | DASHDASH blockRight
        { $$ = PARSE_1(UpPrintSyntaxType, @1, $2); }
    
    // | tupleExpression writeOp assignmentExpressio
    //     { $$ = T.parseBinary(@1, $2, $1, $3); }
    // | tupleExpression writeOp blockRight
    //     { $$ = T.parseBinary(@1, $2, $1, $3); }

    | channelOp assignmentExpression
        { $$ = T.parseUnary(@1, $1, $2); }
    | channelOp
        { $$ = T.parseUnary(@1, $1, null); }
    | channelOp blockRight
        { $$ = T.parseUnary(@1, $1, $2); }
    
    | GT anonFuncArgs assignmentExpression
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs blockRight
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs DO assignmentExpression
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    | GT anonFuncArgs DO blockRight
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    
    // | tupleExpression IS elseLine lineEnding
    //     { $$ = PARSE_IS(@1, $1, $3); }
    // | tupleExpression IS LCB elseLines RCB
    //     { $$ = PARSE_IS(@1, $1, $4); }
    //
    // | IF elseLine lineEnding
    //     { $$ = $2; }
    // | IF LCB elseLines RCB
    //     { $$ = $3; }
    // | IF elseBlocks
    //     { $$ = $2; }
    //
    // | STAR tupleExpression inOn tupleExpression RARROW assignmentExpression lineEnding
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $6, $3, false); }
    // | STAR tupleExpression inOn tupleExpression RARROW blockRight
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $6, $3, false); }
    // | STAR tupleExpression inOn tupleExpression block lineEnding
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $5, $3, false); }
    // | STAR tupleExpression block lineEnding
    //     { $$ = PARSE_ITERATOR(@1, $2, NULL, NULL, $3, 0, false); }
    //
    // | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW assignmentExpression lineEnding
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $8, $3, $5); }
    // | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW blockRight
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $8, $3, $5); }
    // | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression block lineEnding
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $7, $3, $5); }
    // | STAR tupleExpression ifWhile tupleExpression block lineEnding
    //     { $$ = PARSE_ITERATOR(@1, $2, NULL, $4, $5, 0, $3); }
    //
    // | STAR tupleExpression RARROW assignmentExpression lineEnding
    //     { $$ = PARSE_MAPPER(@1, $2, NULL, $4, false, false); }
    // | STAR tupleExpression RARROW blockRight
    //     { $$ = PARSE_MAPPER(@1, $2, NULL, $4, false, false); }
    //
    // | STAR tupleExpression ifWhile tupleExpression RARROW assignmentExpression lineEnding
    //     { $$ = PARSE_MAPPER(@1, $2, $4, $6, false, $3); }
    // | STAR tupleExpression ifWhile tupleExpression RARROW blockRight
    //     { $$ = PARSE_MAPPER(@1, $2, $4, $6, false, $3); }
    ;

anonFuncArgs:
    LP RP
        { $$ = null; }
    | LP declArgumentList RP
        { $$ = $2; }
    ;

blockRight:
    block
    // | tupleExpression assignOp blockRight
    //     { $$ = T.parseAssignment(@1, $2, $1, $3); }
    
    // | tupleExpression BULLET blockRight
    //     { $$ = $1; /*PARSE_CALL(@1, $1, NULL); APPEND_ARGS($$, $3);*/ }
    //
    // | DASHDASH blockRight
    //     { $$ = PARSE_1(UpPrintSyntaxType, @1, $2); }
    
    | tupleExpression writeOp blockRight
        { $$ = T.parseBinary(@1, $2, $1, $3); }
    | channelOp blockRight
        { $$ = T.parseUnary(@1, $1, $2); }
    | channelOp
        { $$ = T.parseUnary(@1, $1, null); }
    
    | GT anonFuncArgs blockRight
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs DO blockRight
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    
    // | tupleExpression IS elseLine lineEnding
    //     { $$ = PARSE_IS(@1, $1, $3); }
    // | tupleExpression IS LCB elseLines RCB
    //     { $$ = PARSE_IS(@1, $1, $4); }
    //
    // | IF elseLine lineEnding
    //     { $$ = $2; }
    // | IF LCB elseLines RCB
    //     { $$ = $3; }
    // | IF elseBlocks
    //     { $$ = $2; }
    //
    // | STAR tupleExpression inOn tupleExpression RARROW blockRight
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $6, $3, false); }
    // | STAR tupleExpression inOn tupleExpression block
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $5, $3, false); }
    // | STAR tupleExpression block
    //     { $$ = PARSE_ITERATOR(@1, $2, NULL, NULL, $3, 0, false); }
    //
    // | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW blockRight
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $8, $3, $5); }
    // | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression block
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $7, $3, $5); }
    // | STAR tupleExpression ifWhile tupleExpression block
    //     { $$ = PARSE_ITERATOR(@1, $2, NULL, $4, $5, 0, $3); }
    //
    // | STAR tupleExpression RARROW blockRight
    //     { $$ = PARSE_MAPPER(@1, $2, NULL, $4, false, false); }
    // | STAR tupleExpression ifWhile tupleExpression RARROW blockRight
    //     { $$ = PARSE_MAPPER(@1, $2, $4, $6, false, $3); }
    ;

assignmentExpression:
    tupleExpression
    | assignmentExpression assignOp tupleExpression
        { $$ = T.parseAssignment(@1, $2, $1, $3); }

    // | tupleExpression BULLET assignmentExpression
    //     { $$ = $1; /*PARSE_CALL(@1, $1, NULL); APPEND_ARGS($$, $3);*/ }
    //
    // | DASHDASH assignmentExpression
    //     { $$ = PARSE_1(UpPrintSyntaxType, @1, $2); }
    //
    // | tupleExpression writeOp assignmentExpression
    //     { $$ = T.parseBinary(@1, $2, $1, $3); }
    | channelOp tupleExpression
        { $$ = T.parseUnary(@1, $1, $2); }
    
    // | tupleExpression funcOp assignmentExpression
    //     { $$ = PARSE_FUNCTION(@1, $1, $3, $2); }
    // | funcOp assignmentExpression
    //     { $$ = PARSE_FUNCTION(@1, NULL, $2, $1); }
    //
    // | STAR tupleExpression inOn tupleExpression RARROW assignmentExpression
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $6, $3, false); }
    //
    // | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW assignmentExpression
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $8, $3, $5); }
    //
    // | STAR tupleExpression RARROW assignmentExpression
    //     { $$ = PARSE_MAPPER(@1, $2, NULL, $4, false, false); }
    // | STAR tupleExpression ifWhile tupleExpression RARROW assignmentExpression
    //     { $$ = PARSE_MAPPER(@1, $2, $4, $6, false, $3); }
    ;

assignmentExpressionSimple:
    simpleExpression
    | simpleExpression assignOp right
        { $$ = T.parseAssignment(@1, $2, $1, $3); }

    // | simpleExpression BULLET right
    //     { $$ = $1; /*PARSE_CALL(@1, $1, NULL); APPEND_ARGS($$, $3);*/ }
    //
    // | DASHDASH right
    //     { $$ = PARSE_1(UpPrintSyntaxType, @1, $2); }
    //
    // | simpleExpression writeOp right
    //     { $$ = T.parseBinary(@1, $2, $1, $3); }
    
    | channelOp right
        { $$ = T.parseUnary(@1, $1, $2); }
    | channelOp
        { $$ = T.parseUnary(@1, $1, right); }
    
    | GT anonFuncArgs right
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs DO right
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    
    // | simpleExpression IS elseLineSimple
    //     { $$ = PARSE_IS(@1, $1, $3); }
    //
    // | IF elseLineSimple
    //     { $$ = $2; }
    //
    // | STAR simpleExpression inOn simpleExpression RARROW right
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, NULL, $6, $3, false); }
    // | STAR simpleExpression inOn simpleExpression ifWhile simpleExpression RARROW right
    //     { $$ = PARSE_ITERATOR(@1, $2, $4, $6, $8, $3, $5); }
    //
    // | STAR simpleExpression RARROW right
    //     { $$ = PARSE_MAPPER(@1, $2, NULL, $4, false, false); }
    // | STAR simpleExpression ifWhile simpleExpression RARROW right
    //     { $$ = PARSE_MAPPER(@1, $2, $4, $6, false, $3); }
    ;

elseBlocks:
    transformBlockList
        { $$ = PARSE_IF(@1, $1, NULL); }
    | transformBlockList ELSE block
        { $$ = PARSE_IF(@1, $1, $3); }
    ;

transformBlockList:
    tupleExpression block lineEnding
        { $$ = PARSE_TRANSFORM(@1, $1, $2); }
    | transformBlockList ELSE IF tupleExpression block lineEnding
        { $$ = APPEND_TRANSFORM($1, PARSE_TRANSFORM(@1, $4, $5)); }
    ;

elseLines:
    transformLineList lineEnding
        { $$ = PARSE_IF(@1, $1, NULL); }
    | transformLineList lineEnding ELSE RARROW tupleExpression lineEnding
        { $$ = PARSE_IF(@1, $1, $5); }
    ;

transformLineList:
    transformExpression
        { $$ = $1; }
    | tupleExpression RARROW block
        { $$ = PARSE_TRANSFORM(@1, $1, $3); }
    | transformLineList lineEnding transformExpression
        { $$ = APPEND_TRANSFORM($1, $3); }
    ;

transformExpression:
    tupleExpression RARROW assignmentExpression
        { $$ = PARSE_TRANSFORM(@1, $1, $3); }
    ;

elseLine:
    transformList
        { $$ = PARSE_IF(@1, $1, NULL); }
    | transformList PIPE2 tupleExpression
        { $$ = PARSE_IF(@1, $1, $3); }
    ;

transformList:
    transformExpression
        { $$ = $1; }
    | transformList PIPE2 transformExpression
        { $$ = APPEND_TRANSFORM($1, $3); }
    ;

elseLineSimple:
    transformListSimple
        { $$ = PARSE_IF(@1, $1, NULL); }
    | transformListSimple PIPE2 simpleExpression
        { $$ = PARSE_IF(@1, $1, $3); }
    ;

transformListSimple:
    transformExpressionSimple
        { $$ = $1; }
    | transformListSimple PIPE2 transformExpressionSimple
        { $$ = APPEND_TRANSFORM($1, $3); }
    ;

transformExpressionSimple:
    simpleExpression RARROW simpleExpression
        { $$ = PARSE_TRANSFORM(@1, $1, $3); }
    ;

tupleExpression:
    simpleExpression
    | simpleExpression COMMA tupleExpression
        { $$ = ENSURE_SET($1); APPEND($$, $3); }
    ;

simpleExpression:
    conditionExpression
    ;

conditionExpression:
    binaryExpression
    ;
    
binaryExpression:
    concatExpression
    | concatExpression UNIDENTIFIER binaryExpression
        { $$ = T.parseInfixOp(@1, $2, $1, $3); }
    ;

concatExpression:
    logicalOrExpression
    | concatExpression CONCATSTR logicalOrExpression
        { $$ = T.parseBinary(@1, T.ConcatStringOp, $1, $3); }
    ;

logicalOrExpression:
    logicalAndExpression
    | logicalOrExpression PIPE logicalAndExpression
        { $$ = T.parseBinary(@1, T.OrOp, $1, $3); }
    | logicalOrExpression TO logicalAndExpression
        { $$ = T.parseRange(@1, $1, $3, null, false); }
    | logicalOrExpression TO logicalAndExpression BY logicalAndExpression
        { $$ = T.parseRange(@1, $1, $3, $5, false); }
    | logicalOrExpression THROUGH logicalAndExpression
        { $$ = T.parseRange(@1, $1, $3, null, true); }
    | logicalOrExpression THROUGH logicalAndExpression BY logicalAndExpression
        { $$ = T.parseRange(@1, $1, $3, $5, true); }
    ;

logicalAndExpression:
    equalityExpression
    | logicalAndExpression AMPERSAND equalityExpression
        { $$ = T.parseBinary(@1, T.AndOp, $1, $3); }
    ;

equalityExpression:
    relationalExpression
    | equalityExpression EQ2 relationalExpression
        { $$ = T.parseBinary(@1, T.EqualsOp, $1, $3); }
    | equalityExpression NEQ relationalExpression
        { $$ = T.parseBinary(@1, T.NotEqualsOp, $1, $3); }
    ;

relationalExpression:
    addExpression
    | relationalExpression LT addExpression
        { $$ = T.parseBinary(@1, T.LessThanOp, $1, $3); }
    | relationalExpression GT addExpression
        { $$ = T.parseBinary(@1, T.GreaterThanOp, $1, $3); }
    | relationalExpression LTE addExpression
        { $$ = T.parseBinary(@1, T.LessThanEqualsOp, $1, $3); }
    | relationalExpression GTE addExpression
        { $$ = T.parseBinary(@1, T.GreaterThanEqualsOp, $1, $3); }
    | relationalExpression ISNOT addExpression
        { $$ = T.parseBinary(@1, T.IsNotOp, $1, $3); }
    | relationalExpression ISIN addExpression
        { $$ = T.parseBinary(@1, T.IsInOp, $1, $3); }
    | relationalExpression NOTIN addExpression
        { $$ = T.parseBinary(@1, T.NotInOp, $1, $3); }
    ;

addExpression:
    multiplyExpression
    | addExpression ADD multiplyExpression
        { $$ = T.parseBinary(@1, T.AddOp, $1, $3); }
    | addExpression SUBTRACT multiplyExpression
        { $$ = T.parseBinary(@1, T.SubtractOp, $1, $3); }
    ;

multiplyExpression:
    unaryExpression
    | multiplyExpression STAR unaryExpression
        { $$ = T.parseBinary(@1, T.MultiplyOp, $1, $3); }
    | multiplyExpression SLASH unaryExpression
        { $$ = T.parseBinary(@1, T.DivideOp, $1, $3); }
    | multiplyExpression SLASH2 unaryExpression
        { $$ = T.parseBinary(@1, T.ModOp, $1, $3); }
    | multiplyExpression STAR2 unaryExpression
        { $$ = T.parseBinary(@1, T.PowOp, $1, $3); }
    | multiplyExpression CONCAT unaryExpression
        { $$ = T.parseBinary(@1, T.ConcatOp, $1, $3); }
    ;

unaryExpression:
    bindExpression
    | SUBTRACT_EQ unaryExpression
        { $$ = T.parseUnary(@1, T.DeleteOp, $2); }
    | SUBTRACT unaryExpression
        { $$ = T.parseUnary(@1, T.NegativeOp, $2); }
    | EXCLAMATION unaryExpression
        { $$ = T.parseUnary(@1, T.NotOp, $2); }
    | IN unaryExpression
        { $$ = T.parseUnary(@1, T.InOp, $2); }
    ;

bindExpression:
    callExpression
    | SEMICOLON bindList
        { $$ = T.parseUnary(@1, T.BindOp, $2); }
    | SEMICOLON block
        { $$ = T.parseUnary(@1, T.BindOp, $2); }
    ;

bindList:
    callExpression
    | bindList SEMICOLON callExpression
        { $$ = T.ensureSet(@1, $1); $$.append($3); }
    ;

callExpression:
    basicExpression
    | IDENTIFIER COLON declTypeId
        { $$ = T.parseTypeAssignment(@1, $1, $3); }
    | callExpression AS basicExpression
        { $$ = T.parseCast(@1, $1, $3); }
    
    | callExpression callArguments
        { $$ = T.parseCall(@1, $1, $2); }
    
    | callExpression DOT IDENTIFIER
        { $$ = T.parseGet(@1, $1, $3); }
    
    | callExpression DOT LB right RB
        { $$ = T.parseBinary(@1, T.LookupOp, $1, $4); }
    | callExpression DOT LB right ELSE right RB
        { $$ = T.parseBinary(@1, T.LookupOp, $1, T.parseDefault(@4, $4, $6)); }
    
    | callExpression LB right RB
        { $$ = T.parseBinary(@1, T.IndexOp, $1, $3); }
    | callExpression LB right ELSE right RB
        { $$ = T.parseBinary(@1, T.IndexOp, $1, T.parseDefault(@3, $3, $5)); }
    ;
    
basicExpression:
    parenExpression
    | listExpression
    | mapExpression
    | channelExpression
    | id
    | literal
    ;

parenExpression:
    LP rightList RP
        { $$ = $2; }
    | LP RP
        { $$ = null; }
    ;

listExpression:
    LB rightList RB
        { $$ = T.parseList(@1, $2); }
    | LB RB
        { $$ = T.parseList(@1, null); }
    ;

mapExpression:
    LCBP mapTupleExpression RCBP
        { $$ = T.parseMap(@1, $2); }
    | LCBP RCBP
        { $$ = T.parseMap(@1, null); }
    ;

channelExpression:
    LT GT
        { $$ = T.parseChannel(@1, null); }
    | LT callExpression GT
        { $$ = T.parseChannel(@1, $2); }
    ;

id:
    IDENTIFIER
        { $$ = T.parseId(@1, $1); }
    | UIDENTIFIER
        { $$ = T.parseTypeId(@1, $1); }
    ;

literal:
    INTEGER
        { $$ = T.parseNumber(@1, $1); }
    | INTEGER_UNIT
        { $$ = T.parseNumber(@1, $1); }
    | FLOAT
        { $$ = T.parseNumber(@1, $1); }
    | FLOAT_UNIT
        { $$ = T.parseNumber(@1, $1); }
    | FLOAT_EXP
        { $$ = T.parseFloatNumber(@1, $1); }
    | HEX
        { $$ = T.parseHex(@1, $1); }
    | string
    | UNDERSCORE
        { $$ = T.parseId(@1, "null"); }
    | CFUNCTION
        { $$ = PARSE_PRIVATE_CFUNCTION($1); }
    | QUESTION
        { $$ = T.parseId(@1, "?"); }
    | STAR
        { $$ = T.parseId(@1, "*"); }
    ;

string:
    STRING_OPEN STRING_CLOSE
        { $$ = T.parseString(@1, ''); }
    | STRING_OPEN stringList STRING_CLOSE
        { $$ = $2; }
    ;

stringList:
    STRING
        { $$ = T.parseString(@1, $1); }
    | STRING_FORMAT
        { $$ = T.parseStringFormat(@1, $1); }
    | stringList STRING
        { $$ = T.addString(@1, $1, T.parseString(@2, $2)); }
    | stringList STRING_FORMAT
        { $$ = T.addString(@1, $1, T.parseStringFormat(@2, $2)); }
    ;
    
assignOp:
    EQ
        { $$ = T.EqOp; }
    | LARROW2
        { $$ = T.ReadOp; }
    | ADD_EQ
        { $$ = T.AddEqOp; }
    | SUBTRACT_EQ
        { $$ = T.SubtractEqOp; }
    | STAR_EQ
        { $$ = T.MultiplyEqOp; }
    | SLASH_EQ
        { $$ = T.DivideEqOp; }
    | SLASH2_EQ
        { $$ = T.ModEqOp; }
    | STAR2_EQ
        { $$ = T.PowEqOp; }
    | CONCAT_EQ
        { $$ = T.ConcatEqOp; }
    ;

channelOp:
    LARROW2
        { $$ = T.ReadOp; }
    | RARROW2
        { $$ = T.WriteOp; }
    | RARROW2MUL
        { $$ = T.WriteAllOp; }
    ;

writeOp:
    RARROW2
        { $$ = T.WriteOp; }
    | RARROW2MUL
        { $$ = T.WriteAllOp; }
    ;

funcOp:
    FATARROW
        { $$ = false; }
    | FATARROW DO
        { $$ = true; }
    ;

ifWhile:
    IF
        { $$ = 0; }
    | WHILE
        { $$ = 1; }
    ;

inOn:
    IN
        { $$ = 0; }
    | ON
        { $$ = 1; }
    ;

block:
    LCB statementList RCB
        { $$ = $2; }
    | LCB RCB
        { $$ = null; }
    ;

callArguments:
    LP RP
        { $$ = null; }
    | LP argumentList RP
        { $$ = $2; }
    ;

argumentList:
    argument
        { $$ = [$1]; }
    | argumentList COMMA argument
        { $$ = $1; $1.push($3); }
    ;

argument:
    right
        { $$ = T.parseArg(@1, $1, null); }
    | BIDENTIFIER right
        { $$ = T.parseArg(@1, $2, $1); }
    ;

mapTupleExpression:
    mapAssignmentExpression
        { $$ = T.ensureSet(@1, $1); }
    | mapTupleExpression COMMA mapAssignmentExpression
        { $$ = T.ensureSet(@1, $1); $$.append($3); }
    | mapTupleExpression COMMA
        { $$ = T.ensureSet(@1, $1); }
    ;

mapAssignmentExpression:
    conditionExpression EQ conditionExpression
        { $$ = T.parseBinary(@1, T.EqOp, $1, $3); }
    ;

//////////////////////////////////////////////////////////////////////////////////////////////////

cDeclarations:
    cDeclaration
        { $$ = PARSE_SET(@2); APPEND($$, $2); }
    | cDeclarations cDeclaration
        { $$ = $1; APPEND($1, $2); }
    ;

cDeclaration:
    cLine
    | cLine SEMICOLON
    ;

cLine:
    cFunction
    ;

cFunction:
    cType IDENTIFIER LP cArgs RP
        { $$ = PARSE_CFUNCTION(@1, $2, $1, $4); }
    | cType IDENTIFIER LP RP
        { $$ = PARSE_CFUNCTION(@1, $2, $1, NULL); }
    ;

cType:
    IDENTIFIER
        { $$ = PARSE_CTYPE(@1, $1); }
    | STRUCT IDENTIFIER
        { $$ = PARSE_CTYPE(@1, $2); }
    | CONST IDENTIFIER
        { $$ = PARSE_CTYPE(@1, $2); }
    | CONST STRUCT IDENTIFIER
        { $$ = PARSE_CTYPE(@1, $3); }
    | CPRIMITIVE
        { $$ = PARSE_CTYPE(@1, $1); }
    | CONST CPRIMITIVE
        { $$ = PARSE_CTYPE(@1, $2); }
    | cType STAR
        { $$ = ADD_CTYPE_POINTER(@1, $1); }
    ;

cArgs:
    cArg
        { $$ = PARSE_SET(@1); APPEND($$, $1); }
    | cArgs COMMA cArg
        { $$ = $1; APPEND($1, $3); }
    ;

cArg:
    cType
        { $$ = PARSE_CARGUMENT(@1, $1, NULL); }
    | cType IDENTIFIER
        { $$ = PARSE_CARGUMENT(@1, $1, $2); }
    ;
