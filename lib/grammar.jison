%{

var p = require('./parsing');
var ops = require('./operator');
var constants = require('./constants'),
    PrivateAccess = constants.PrivateAccess,
    PublicAccess = constants.PublicAccess;
    
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

id [a-zA-Z][0-9a-zA-Z]*
idLower [a-z][0-9a-zA-Z]*
idUpper [A-Z][0-9a-zA-Z]*
idDots ({idLower}*)([.]{idLower}+)*
idSymbol [%$¢€£¥π˚]+
specialty [a-zA-Z][0-9a-zA-Z]*(@[a-zA-Z][0-9a-zA-Z]*)?
unit [a-zA-Z%$¢€£¥][a-zA-Z%$¢€£¥0-9]*

integer [0-9]+
float [0-9]+[\.][0-9]+
floatExp [0-9]+[\.][0-9]+[e][\+\-][0-9]+
hex 0x[0-9A-Fa-f]+

%%

{ws}+                                      { return null; }
"\\"{ws}*{nl}                              { return null; }

"`"[^\n\r]+{nl}       		               { return null; }
"`"{nl}       		                       { return null; }
"====="[=]+{nl}(.*?){nl}"====="[=]+{nl}    { return null; }
"-----"[-]+{nl}                            { return null; }

"if"                { return 'IF'; }
"else"              { return 'ELSE'; }
"or"                { return 'OR'; }

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
"||"                { return 'PIPE2'; }
"|"                 { return 'PIPE'; }
"?"                 { return 'QUESTION'; }
"!"                 { return 'EXCLAMATION'; }
"\\"                { return 'BACKSLASH'; }

"to"                { return 'TO'; }
"through"           { return 'THROUGH'; }
"by"                { return 'BY'; }
"where"             { return 'WHERE'; }

"this"              { return 'THIS'; }

{nl}{ws}+                           { return 'NEWLINE'; }
{nl}                                { return 'NEWLINE'; }

"C@"{id}["]                         { this.begin('ccode'); return 'CCODE_OPEN'; }
"C"["]                              { this.begin('ccode'); return 'CCODE_OPEN'; }
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

<ccode>["]               { this.popState(); return 'CCODE_CLOSE'; }

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
<ccode>"short"                 { return 'CPRIMITIVE'; }
<ccode>"unsigned char"         { return 'CPRIMITIVE'; }
<ccode>"unsigned short"        { return 'CPRIMITIVE'; }
<ccode>"unsigned int"          { return 'CPRIMITIVE'; }
<ccode>"unsigned long long"    { return 'CPRIMITIVE'; }
<ccode>"unsigned long"         { return 'CPRIMITIVE'; }
<ccode>"int"                   { return 'CPRIMITIVE'; }
<ccode>"float"                 { return 'CPRIMITIVE'; }
<ccode>"double"                { return 'CPRIMITIVE'; }
<ccode>"long long"             { return 'CPRIMITIVE'; }
<ccode>"long double"           { return 'CPRIMITIVE'; }
<ccode>"long"                  { return 'CPRIMITIVE'; }
<ccode>"size_t"                { return 'CPRIMITIVE'; }
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
%token <objectValue> CCODE_OPEN
%token <objectValue> CCODE_CLOSE
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
%left IF ELSE OR
%left POUND CARET AT UNDERSCORE
%left FATARROW LARROW RARROW LARROW2 RARROW2 RARROW3 LARROW3 RARROW2MUL
%left COLON COLON2 SEMICOLON
%left EQ COLONEQ ADD_EQ SUBTRACT_EQ STAR_EQ SLASH_EQ SLASH2_EQ STAR2_EQ CONCAT_EQ
%left AS IS ISNOT HAS HASNOT IN ISIN NOTIN
%left EQ2 NEQ LT LTE GT GTE CONCAT CONCATSTR
%left ADD SUBTRACT STAR SLASH SLASH2 STAR2
%left DOT DOT2 DOT3 EXCLAMATION QUESTION COMMA DASHDASH TILDE AMPERSAND PIPE PIPE2
%left OPEN_OPERATOR OPEN_OPERATORQ CLOSE_OPERATOR OPERATOR OPERATORQ
%left BACKSLASH BULLET TO THROUGH BY WHERE THIS
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

declarationList:
    declaration
        { $$ = p.parseSet(@$, $1); }
    | declarationList lineEnding declaration
        { $$ = $1; if ($3) $1.append($3); }
    | declarationList lineEnding
        { $$ = $1; }
    ;

declarationSet:
    LCB declarationList RCB
        { $$ = $2; }
    | LCB RCB
        { $$ = null; }
    ;

declaration:
    importDirective
    | cCode
    | declarationBlock
    | block
    ;

declarationBlock:
    accessMode declFunc
        { $$ = p.parseFuncBlock(@$, $1, $2, null, null, false); }
    | accessMode declFunc block
        { $$ = p.parseFuncBlock(@$, $1, $2, $3, null, false); }
    | accessMode declFunc funcOp blockOrRight
        { $$ = p.parseFuncBlock(@$, $1, $2, $4, null, $3); }

    | accessMode declFunc block WHERE blockOrRight
        { $$ = p.parseFuncBlock(@$, $1, $2, $3, $5, false); }
    | accessMode declFunc funcOp blockOrRight WHERE blockOrRight
        { $$ = p.parseFuncBlock(@$, $1, $2, $4, $6, $3); }

    | accessMode declClassId
        { $$ = p.parseClass(@$, $1, $2, null, null); }
    | accessMode declClassId COLON declTypeId
        { $$ = p.parseClass(@$, $1, $2, $3, null); }
    | accessMode declClassId declarationSet
        { $$ = p.parseClass(@$, $1, $2, null, $3); }
    | accessMode declClassId COLON declTypeId declarationSet
        { $$ = p.parseClass(@$, $1, $2, $4, $5); }

    | accessMode IDENTIFIER EQ blockOrRight
        { $$ = p.parseProperty(@$, $1, $2, null, $4); }
    | accessMode IDENTIFIER EQ blockOrRight WHERE blockOrRight
        { $$ = p.parseProperty(@$, $1, $2, null, $4, $6); }
    | accessMode IDENTIFIER COLON declTypeId EQ blockOrRight
        { $$ = p.parseProperty(@$, $1, $2, $4, $6); }
    | accessMode IDENTIFIER COLON declTypeId EQ blockOrRight WHERE blockOrRight
        { $$ = p.parseProperty(@$, $1, $2, $4, $6, $8); }
    
    | DO block
        { $$ = p.parseFuncBlock(@$, PrivateAccess, p.parseFunc(@$, p.parseId(@$, '@main')), $2); }
    ;
    
blockOrRight:
    block
    | right
        { $$ = p.parseSet(@$, $1); }
    ;

declFunc:
    declId
        { $$ = p.parseFunc(@$, $1, null, null, null); }
    | declId LP RP
        { $$ = p.parseFunc(@$, $1, null, null, null); }
    | declId LP RP AT IDENTIFIER
        { $$ = p.parseFunc(@$, $1, null, null, $5); }
    | declId LP RP COLON declTypeId
        { $$ = p.parseFunc(@$, $1, null, $5, null); }
    | declId LP RP COLON declTypeId AT IDENTIFIER
        { $$ = p.parseFunc(@$, $1, null, $5, $7); }
    
    | declId LP declArgumentList RP
        { $$ = p.parseFunc(@$, $1, $3); }
    | declId LP declArgumentList RP AT IDENTIFIER
        { $$ = p.parseFunc(@$, $1, $3, null, $6); }
    | declId LP declArgumentList RP COLON declTypeId
        { $$ = p.parseFunc(@$, $1, $3, $6, null); }
    | declId LP declArgumentList RP COLON declTypeId AT IDENTIFIER
        { $$ = p.parseFunc(@$, $1, $3, $6, $8); }

    | declClassId LP RP
        { $$ = p.parseFunc(@$, $1, null, null, null); }
    | declClassId LP declArgumentList RP
        { $$ = p.parseFunc(@$, $1, $3); }

    | LP operatorArgs RP
        { $$ = p.parseFunc(@$, null, $2, null, null); }
    | LP operatorArgs RP AT identifier
        { $$ = p.parseFunc(@$, null, $2, null, $5); }
    | LP operatorArgs RP COLON declTypeId
        { $$ = p.parseFunc(@$, null, $2, $5, null); }
    | LP operatorArgs RP COLON declTypeId AT IDENTIFIER
        { $$ = p.parseFunc(@$, null, $2, $5, $7); }
    ;

operatorArgs:
    ADD THIS
        { $$ = p.parseOpFunc(@$, ops.Positive); }
    | SUBTRACT THIS
        { $$ = p.parseOpFunc(@$, ops.Negative); }
    | EXCLAMATION THIS
        { $$ = p.parseOpFunc(@$, ops.Not); }
    | IN THIS
        { $$ = p.parseOpFunc(@$, ops.In); }

    | THIS op declArgument
        { $$ = p.parseOpFunc(@$, $2, p.parseSet(@3, $3)); }

    | LB declArgument RB
        { $$ = p.parseOpFunc(@$, ops.Index, p.parseSet(@2, $2)); }
    | LB declArgument RB EQ declArgument
        { $$ = p.parseOpFunc(@$, ops.IndexAssign, p.parseSet(@2, $2).append($5)); }
    | SUBTRACT_EQ LB declArgument RB
        { $$ = p.parseOpFunc(@$, ops.IndexDelete, p.parseSet(@3, $3)); }

    | LB declArgumentNoDefault TO declArgumentNoDefault BY declArgument RB
        { $$ = p.parseOpFunc(@$, ops.Slice, p.parseSet(@2, $2).append($4).append($6)); }
    | LB declArgumentNoDefault TO declArgumentNoDefault BY declArgument RB EQ declArgument
        { $$ = p.parseOpFunc(@$, ops.SliceAssign,
                               p.parseSet(@2, $9).append($2).append($4).append($6)); }
    | SUBTRACT_EQ LB declArgumentNoDefault TO declArgumentNoDefault BY declArgument RB
        { $$ = p.parseOpFunc(@$, ops.SliceDelete, p.parseSet(@3, $3).append($5).append($7)); }

    | DOT LB declArgument RB
        { $$ = p.parseOpFunc(@$, ops.Lookup, p.parseSet(@3, $3)); }
    | DOT LB declArgument RB EQ declArgument
        { $$ = p.parseOpFunc(@$, ops.LookupAssign, p.parseSet(@3, $3).append($6)); }
    | SUBTRACT_EQ DOT LB declArgument RB
        { $$ = p.parseOpFunc(@$, ops.LookupDelete, p.parseSet(@4, $4)); }
    ;

    
declClassId:
    UIDENTIFIER
        { $$ = p.parseTypeId(@$, $1); }
    | declClassId BACKSLASH UIDENTIFIER
        { $$ = p.ensureTypeArguments(@$, $1); $$.append(p.parseTypeId(@3, $3)); }
    ;

declId:
    IDENTIFIER
        { $$ = p.parseId(@$, $1); }
    | declId BACKSLASH UIDENTIFIER
        { $$ = p.ensureTypeArguments(@$, $1); $$.append(p.parseTypeId(@3, $3)); }
    ;

declTypeId:
    UIDENTIFIER
        { $$ = p.parseTypeId(@$, $1); }
    | GT LP declTypeIdList RP COLON declTypeId
        { $$ = p.parseTypeArguments(@$, p.parseTypeId(@$, 'Function')); $$.append($6); $$.appendList($3); }
    | LT GT
        { $$ = p.parseTypeArguments(@$, p.parseTypeId(@$, 'Channel')); }
    | LT declTypeId GT
        { $$ = p.parseTypeArguments(@$, p.parseTypeId(@$, 'Channel')); $$.append($2); }
    | LB declTypeId RB
        { $$ = p.parseTypeArguments(@$, p.parseTypeId(@$, 'List')); $$.append($2); }
    | LCBP declTypeId EQ declTypeId RCBP
        { $$ = p.parseTypeArguments(@$, p.parseTypeId(@$, 'Map')); $$.append($2); $$.append($4); }

    | declTypeId BACKSLASH UIDENTIFIER
        { $$ = p.ensureTypeArguments(@$, $1); $$.append(p.parseTypeId(@3, $3)); }
    | declTypeId BACKSLASH LP declTypeId RP
        { $$ = p.ensureTypeArguments(@$, $1); $$.append($4); }
    ;

declTypeIdList:
    declTypeId
        { $$ = [$1]; }
    | declTypeIdList COMMA declTypeId
        { $$ = $1; $1.push($3); }
    ;
    
declArgumentList:
    declArgument
        { $$ = p.parseSet(@$, $1); }
    | declArgumentList COMMA
        { $$ = $1; }
    | declArgumentList COMMA declArgument
        { $$ = $1; $1.append($3); }
    ;

declArgumentPair:
    IDENTIFIER
        { $$ = p.parseTypeAssignment(@$, $1, null); }
    | IDENTIFIER COLON declTypeId
        { $$ = p.parseTypeAssignment(@$, $1, $3); }
    ;

declArgumentNoDefault:
    declArgumentPair
        { $$ = p.parseArgDecl(@$, $1, null, false); }
    | BIDENTIFIER declArgumentPair
        { $$ = p.parseArgDecl(@$, $2, $1, false); }
    | BIDENTIFIER
        { $$ = p.parseArgDecl(@$, null, $1, false); }
    | DOT3 declArgumentPair
        { $$ = p.parseArgDecl(@$, $2, null, true); }
    ;

declArgument:
    declArgumentNoDefault
    | declArgument EQ simpleExpression
        { $$ = $1; $1.defaultValue = $3; }
    ;
    
accessMode:
    ADD
        { $$ = PublicAccess; }
    | SUBTRACT
        { $$ = PrivateAccess; }
    ;
    
statement:
    rightBlock
    | controlFlowStatement
    | whileBlock
    | tryBlock
    | STAR2 declArgument
        { $$ = $2; }
    ;

statementList:
    statement
        { $$ = p.parseSet(@$, $1); }
    | statementList lineEnding statement
        { $$ = $1; if ($3) $1.append($3); }
    | statementList lineEnding
        { $$ = $1; }
    ;

importDirective:
    GT moduleNameList
        { $$ = p.parseImport(@$, $2); }
    ;

moduleName:
    SLASH id
        { $$ = p.parseSet(@$, $2); }
    | id
        { $$ = p.parseSet(@$, p.parseId(@$, ".")); $$.append($1); }
    | moduleName SLASH id
        { $$ = $1; $1.append($3); }
    ;

moduleNameList:
    moduleName
        { $$ = [$1]; }
    | moduleNameList COMMA moduleName
        { $$ = $1; $1.push($3); }
    ;

controlFlowStatement:
    EQ rightBlock
        { $$ = p.parseReturn(@$, $2); }
    | EQ
        { $$ = p.parseReturn(@$, p.parseUndefined(@$)); }
    | CONTINUE
        { $$ = p.parseContinue(@$); }
    | BREAK
        { $$ = p.parseBreak(@$); }
    | THROW rightBlock
        { $$ = p.parseThrow(@$, $2); }
    | THROW
        { $$ = p.parseThrow(@$, p.parseUndefined(@$)); }
    ;

whileBlock:
    WHILE right block
        { $$ = p.parseWhile(@$, $2, $3); }
    | WHILE block
        { $$ = p.parseWhile(@$, p.parseNumber(@$, '1'), $2); }
    ;

tryBlock:
    TRY block catchBlockList
        { $$ = p.parseTry(@$, $2, $3, null); }
    | TRY block catchBlockList FINALLY block
        { $$ = p.parseTry(@$, $2, $3, $5); }
    | TRY block FINALLY block
        { $$ = p.parseTry(@$, $2, null, $4); }
    ;

catchBlock:
    CATCH block
        { $$ = p.parseCatch(@$, null, $2); }
    | CATCH callExpression lineEnding
        { $$ = p.parseCatch(@$, $2, null); }
    | CATCH callExpression block
        { $$ = p.parseCatch(@$, $2, $3); }
    ;

catchBlockList:
    catchBlock
        { $$ = p.parseSet(@$, $1); }
    | catchBlockList catchBlock
        { $$ = $1; $1.append($2); }
    ;

right:
    assignmentExpressionSimple
    ;

rightBlock:
    whereExpression
    | block
    ;

rightList:
    right
    | rightList COMMA right
        { $$ = p.ensureSet(@$, $1); $$.append($3); }
    | rightList COMMA
        { $$ = $1; }
    ;

whereExpression:
    blockChain
    | blockChain WHERE blockLeft
        { $$ = p.parseWhere(@$, $1, $3); }
    | blockChain WHERE block
        { $$ = p.parseWhere(@$, $1, $3); }
    ;

blockChain:
    blockLeft
    ;

callBlock:
    tupleExpression
    | tupleExpression block
        { $$ = p.parseCallBlock(@$, $1); $$.addArg(p.parseArg(@2, $2, null)); }
    | callBlock BULLET block
        { $$ = p.parseCallBlock(@$, $1); $$.addArg(p.parseArg(@3, $3, null)); }
    | callBlock BULLET anonFunc
        { $$ = p.parseCallBlock(@$, $1); $$.addArg(p.parseArg(@3, $3, null)); }
    | callBlock BIDENTIFIER block
        { $$ = p.parseCallBlock(@$, $1); $$.addArg(p.parseArg(@3, $3, $2)); }
    | callBlock BIDENTIFIER anonFunc
        { $$ = p.parseCallBlock(@$, $1); $$.addArg(p.parseArg(@3, $3, $2)); }
    ;
    
blockLeft:
    callBlock
    | anonFunc
    
    // | tupleExpression assignOp assignmentExpression block
    //     { $$ = PARSE_FUNCTION(@$, p.parseAssignment(@$, $2, $1, $3), $4, false); }
    | tupleExpression assignOp assignmentExpression
        { $$ = p.parseAssignment(@$, $2, $1, $3); }
    | tupleExpression assignOp blockRight
        { $$ = p.parseAssignment(@$, $2, $1, $3); }
    
    | DASHDASH tupleExpression
        { $$ = p.parsePrint(@$, $2); }
    | DASHDASH blockRight
        { $$ = p.parsePrint(@$, $2); }
    
    | tupleExpression writeOp assignmentExpression
        { $$ = p.parseBinary(@2, $2, $1, $3); }
    | tupleExpression writeOp blockRight
        { $$ = p.parseBinary(@2, $2, $1, $3); }

    | channelOp assignmentExpression
        { $$ = p.parseUnary(@$, $1, $2); }
    | channelOp
        { $$ = p.parseUnary(@$, $1, null); }
    | channelOp blockRight
        { $$ = p.parseUnary(@$, $1, $2); }
        
    | isBlock
    | ifBlock
    
    | STAR tupleExpression inOn tupleExpression RARROW assignmentExpression
        { $$ = p.parseIterator(@$, $2, $4, null, $6, $3, false); }
    | STAR tupleExpression inOn tupleExpression RARROW blockRight
        { $$ = p.parseIterator(@$, $2, $4, null, $6, $3, false); }
    | STAR tupleExpression inOn tupleExpression block
        { $$ = p.parseIterator(@$, $2, $4, null, $5, $3, false); }
    | STAR tupleExpression block
        { $$ = p.parseIterator(@$, $2, null, null, $3, 0, false); }
    
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = p.parseIterator(@$, $2, $4, $6, $8, $3, $5); }
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = p.parseIterator(@$, $2, $4, $6, $8, $3, $5); }
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression block
        { $$ = p.parseIterator(@$, $2, $4, $6, $7, $3, $5); }
    | STAR tupleExpression ifWhile tupleExpression block
        { $$ = p.parseIterator(@$, $2, null, $4, $5, 0, $3); }
    
    | STAR tupleExpression RARROW assignmentExpression
        { $$ = p.parseMapper(@$, $2, null, $4, false, false); }
    | STAR tupleExpression RARROW blockRight
        { $$ = p.parseMapper(@$, $2, null, $4, false, false); }
    
    | STAR tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = p.parseMapper(@$, $2, $4, $6, false, $3); }
    | STAR tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = p.parseMapper(@$, $2, $4, $6, false, $3); }
    ;

anonFunc:
    GT anonFuncArgs assignmentExpression
        { $$ = p.parseAnonFunc(@$, $2, false, $3); }
    | GT anonFuncArgs blockRight
        { $$ = p.parseAnonFunc(@$, $2, false, $3); }
    | GT anonFuncArgs DO assignmentExpression
        { $$ = p.parseAnonFunc(@$, $2, true, $4); }
    | GT anonFuncArgs DO blockRight
        { $$ = p.parseAnonFunc(@$, $2, true, $4); }
    ;
    
anonFuncArgs:
    LP RP
        { $$ = null; }
    | LP declArgumentList RP
        { $$ = $2; }
    ;

isBlock:
    tupleExpression IS matchExpr
        { $$ = p.parseIs(@$, $1, $3); }
    | tupleExpression IS matchExpr ELSE blockOrRight
        { $$ = p.parseIs(@$, $1, $3, $5); }
    | tupleExpression IS LCB matchList RCB
        { $$ = p.parseIs(@$, $1, $4); }
    | tupleExpression IS LCB matchList lineEnding ELSE RARROW blockOrRight RCB
        { $$ = p.parseIs(@$, $1, $4, $8); }
    ;
    
ifBlock:
    IF elseIfChain
        { $$ = p.parseIf(@$, $2, null); }
    | IF elseIfChain ELSE blockOrRight
        { $$ = p.parseIf(@$, $2, $4); }
    | IF LCB matchList RCB
        { $$ = p.parseIf(@$, $3); }
    | IF LCB matchList lineEnding ELSE RARROW blockOrRight RCB
        { $$ = p.parseIf(@$, $3, $7); }
    ;

elseIfChain:
    tupleExpression block
        { $$ = p.parseTransform(@$, $1, $2); }
    | elseIfChain ELSE IF tupleExpression block
        { $$ = $1; $$.addPair($4, $5); }
    ;

matchList:
    tupleExpression RARROW blockOrRight
        { $$ = p.parseTransform(@$, $1, $3); }
    | matchList lineEnding tupleExpression RARROW blockOrRight
        { $$ = $1; $$.addPair($3, $5); }
    | matchList lineEnding
        { $$ = $1; }
    | lineEnding
    ;

ifExpr:
    IF matchExpr
        { $$ = p.parseIf(@$, $2, null);  }
    | IF matchExpr ELSE binaryExpression
        { $$ = p.parseIf(@$, $2, $4); }
    ;

matchExpr:
    binaryExpression RARROW binaryExpression
        { $$ = p.parseTransform(@$, $1, $3); }
    | matchExpr OR binaryExpression RARROW binaryExpression
        { $$ = $1; $$.addPair($3, $5); }
    ;
        
blockRight:
    block
    // | tupleExpression assignOp blockRight
    //     { $$ = p.parseAssignment(@$, $2, $1, $3); }
    
    // | tupleExpression BULLET blockRight
    //     { $$ = $1; /*PARSE_CALL(@$, $1, null); APPEND_ARGS($$, $3);*/ }
    
    | DASHDASH blockRight
        { $$ = p.parsePrint(@$, $2); }
    
    | tupleExpression writeOp blockRight
        { $$ = p.parseBinary(@$, $2, $1, $3); }
    | channelOp blockRight
        { $$ = p.parseUnary(@$, $1, $2); }
    | channelOp
        { $$ = p.parseUnary(@$, $1, null); }
    
    | GT anonFuncArgs blockRight
        { $$ = p.parseAnonFunc(@$, $2, false, $3); }
    | GT anonFuncArgs DO blockRight
        { $$ = p.parseAnonFunc(@$, $2, true, $4); }
    
    | isBlock
    | ifBlock

    | STAR tupleExpression inOn tupleExpression RARROW blockRight
        { $$ = p.parseIterator(@$, $2, $4, null, $6, $3, false); }
    | STAR tupleExpression inOn tupleExpression block
        { $$ = p.parseIterator(@$, $2, $4, null, $5, $3, false); }
    | STAR tupleExpression block
        { $$ = p.parseIterator(@$, $2, null, null, $3, 0, false); }
    
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = p.parseIterator(@$, $2, $4, $6, $8, $3, $5); }
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression block
        { $$ = p.parseIterator(@$, $2, $4, $6, $7, $3, $5); }
    | STAR tupleExpression ifWhile tupleExpression block
        { $$ = p.parseIterator(@$, $2, null, $4, $5, 0, $3); }
    
    | STAR tupleExpression RARROW blockRight
        { $$ = p.parseMapper(@$, $2, null, $4, false, false); }
    | STAR tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = p.parseMapper(@$, $2, $4, $6, false, $3); }
    ;

assignmentExpression:
    tupleExpression
    | assignmentExpression assignOp tupleExpression
        { $$ = p.parseAssignment(@$, $2, $1, $3); }

    // | tupleExpression BULLET assignmentExpression
    //     { $$ = $1; /*PARSE_CALL(@$, $1, null); APPEND_ARGS($$, $3);*/ }

    | DASHDASH assignmentExpression
        { $$ = p.parsePrint(@$, $2); }

    // | assignmentExpression writeOp tupleExpression
    //     { $$ = p.parseBinary(@$, $2, $1, $3); }
    | channelOp tupleExpression
        { $$ = p.parseUnary(@$, $1, $2); }
    
    // | tupleExpression funcOp assignmentExpression
    //     { $$ = PARSE_FUNCTION(@$, $1, $3, $2); }
    // | funcOp assignmentExpression
    //     { $$ = PARSE_FUNCTION(@$, null, $2, $1); }

    | STAR tupleExpression inOn tupleExpression RARROW assignmentExpression
        { $$ = p.parseIterator(@$, $2, $4, null, $6, $3, false); }
    
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = p.parseIterator(@$, $2, $4, $6, $8, $3, $5); }
    
    | STAR tupleExpression RARROW assignmentExpression
        { $$ = p.parseMapper(@$, $2, null, $4, false, false); }
    | STAR tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = p.parseMapper(@$, $2, $4, $6, false, $3); }
    ;

assignmentExpressionSimple:
    simpleExpression
    | simpleExpression assignOp right
        { $$ = p.parseAssignment(@$, $2, $1, $3); }
    
    // | simpleExpression BULLET right
    //     { $$ = $1; /*PARSE_CALL(@$, $1, null); APPEND_ARGS($$, $3);*/ }
    
    | DASHDASH right
        { $$ = p.parsePrint(@$, $2); }
    
    | simpleExpression writeOp right
        { $$ = p.parseBinary(@2, $2, $1, $3); }
    
    | channelOp right
        { $$ = p.parseUnary(@$, $1, $2); }
    | channelOp
        { $$ = p.parseUnary(@$, $1, null); }
    
    | GT anonFuncArgs right
        { $$ = p.parseAnonFunc(@$, $2, false, $3); }
    | GT anonFuncArgs DO right
        { $$ = p.parseAnonFunc(@$, $2, true, $4); }
    
    | simpleExpression IS matchExpr
        { $$ = p.parseIs(@$, $1, $3, null);  }
    | simpleExpression IS matchExpr ELSE right
        { $$ = p.parseIs(@$, $1, $3, $5); }

    | STAR simpleExpression inOn simpleExpression RARROW right
        { $$ = p.parseIterator(@$, $2, $4, null, $6, $3, false); }
    | STAR simpleExpression inOn simpleExpression ifWhile simpleExpression RARROW right
        { $$ = p.parseIterator(@$, $2, $4, $6, $8, $3, $5); }
    
    | STAR simpleExpression RARROW right
        { $$ = p.parseMapper(@$, $2, null, $4, false, false); }
    | STAR simpleExpression ifWhile simpleExpression RARROW right
        { $$ = p.parseMapper(@$, $2, $4, $6, false, $3); }
    ;

tupleExpression:
    simpleExpression
    | simpleExpression COMMA tupleExpression
        { $$ = p.ensureSet(@$, $1); $$.append($3); }
    ;

simpleExpression:
    conditionExpression
    ;

conditionExpression:
    ifExpr
    | binaryExpression
    ;
    
binaryExpression:
    concatExpression
    | concatExpression UNIDENTIFIER binaryExpression
        { $$ = p.parseInfixOp(@$, $2, $1, $3); }
    ;

concatExpression:
    logicalOrExpression
    | concatExpression CONCATSTR logicalOrExpression
        { $$ = p.parseBinary(@2, ops.Concat, $1, $3); }
    ;

logicalOrExpression:
    logicalAndExpression
    | logicalOrExpression PIPE logicalAndExpression
        { $$ = p.parseBinary(@2, ops.Or, $1, $3); }
    | logicalOrExpression TO logicalAndExpression
        { $$ = p.parseRange(@$, $1, $3, null, false); }
    | logicalOrExpression TO logicalAndExpression BY logicalAndExpression
        { $$ = p.parseRange(@$, $1, $3, $5, false); }
    | logicalOrExpression THROUGH logicalAndExpression
        { $$ = p.parseRange(@$, $1, $3, null, true); }
    | logicalOrExpression THROUGH logicalAndExpression BY logicalAndExpression
        { $$ = p.parseRange(@$, $1, $3, $5, true); }
    ;

logicalAndExpression:
    equalityExpression
    | logicalAndExpression AMPERSAND equalityExpression
        { $$ = p.parseBinary(@2, ops.And, $1, $3); }
    ;

equalityExpression:
    relationalExpression
    | equalityExpression EQ2 relationalExpression
        { $$ = p.parseBinary(@2, ops.Equals, $1, $3); }
    | equalityExpression NEQ relationalExpression
        { $$ = p.parseBinary(@2, ops.NotEquals, $1, $3); }
    ;

relationalExpression:
    addExpression
    | relationalExpression LT addExpression
        { $$ = p.parseBinary(@2, ops.LessThan, $1, $3); }
    | relationalExpression GT addExpression
        { $$ = p.parseBinary(@2, ops.GreaterThan, $1, $3); }
    | relationalExpression LTE addExpression
        { $$ = p.parseBinary(@2, ops.LessThanEquals, $1, $3); }
    | relationalExpression GTE addExpression
        { $$ = p.parseBinary(@2, ops.GreaterThanEquals, $1, $3); }
    | relationalExpression ISNOT addExpression
        { $$ = p.parseBinary(@2, ops.IsNot, $1, $3); }
    | relationalExpression ISIN addExpression
        { $$ = p.parseBinary(@2, ops.IsIn, $1, $3); }
    | relationalExpression NOTIN addExpression
        { $$ = p.parseBinary(@2, ops.NotIn, $1, $3); }
    ;

addExpression:
    multiplyExpression
    | addExpression ADD multiplyExpression
        { $$ = p.parseBinary(@2, ops.Add, $1, $3); }
    | addExpression SUBTRACT multiplyExpression
        { $$ = p.parseBinary(@2, ops.Subtract, $1, $3); }
    ;

multiplyExpression:
    unaryExpression
    | multiplyExpression STAR unaryExpression
        { $$ = p.parseBinary(@2, ops.Multiply, $1, $3); }
    | multiplyExpression SLASH unaryExpression
        { $$ = p.parseBinary(@2, ops.Divide, $1, $3); }
    | multiplyExpression SLASH2 unaryExpression
        { $$ = p.parseBinary(@2, ops.Mod, $1, $3); }
    | multiplyExpression STAR2 unaryExpression
        { $$ = p.parseBinary(@2, ops.Pow, $1, $3); }
    | multiplyExpression CONCAT unaryExpression
        { $$ = p.parseBinary(@2, ops.Concat, $1, $3); }
    ;

unaryExpression:
    bindExpression
    | SUBTRACT_EQ unaryExpression
        { $$ = p.parseUnary(@$, ops.Delete, $2); }
    | SUBTRACT unaryExpression
        { $$ = p.parseUnary(@$, ops.Negative, $2); }
    | EXCLAMATION unaryExpression
        { $$ = p.parseUnary(@$, ops.Not, $2); }
    | IN unaryExpression
        { $$ = p.parseUnary(@$, ops.In, $2); }
    ;

bindExpression:
    callExpression
    | SEMICOLON bindList
        { $$ = p.parseUnary(@$, ops.Bind, $2); }
    | SEMICOLON block
        { $$ = p.parseUnary(@$, ops.Bind, $2); }
    ;

bindList:
    callExpression
    | bindList SEMICOLON callExpression
        { $$ = p.ensureSet(@$, $1); $$.append($3); }
    ;

callExpression:
    basicExpression
    | IDENTIFIER COLON declTypeId
        { $$ = p.parseTypeAssignment(@$, $1, $3); }
    | callExpression AS declTypeId
        { $$ = p.parseCast(@$, $1, $3); }
    
    | callExpression callArguments
        { $$ = p.parseCall(@$, $1, $2); }
    
    | callExpression DOT IDENTIFIER
        { $$ = p.parseGet(@$, $1, $3); }
    
    | callExpression DOT LB right RB
        { $$ = p.parseBinary(@$, ops.Lookup, $1, $4); }
    | callExpression DOT LB right PIPE2 right RB
        { $$ = p.parseBinary(@$, ops.Lookup, $1, p.parseDefault(@4, $4, $6)); }
    
    | callExpression LB right RB
        { $$ = p.parseBinary(@$, ops.Index, $1, $3); }
    | callExpression LB right PIPE2 right RB
        { $$ = p.parseBinary(@$, ops.Index, $1, p.parseDefault(@3, $3, $5)); }
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
        { $$ = p.parseList(@$, $2); }
    | LB RB
        { $$ = p.parseList(@$, null); }
    ;

mapExpression:
    LCBP mapTupleExpression RCBP
        { $$ = p.parseMap(@$, $2); }
    | LCBP RCBP
        { $$ = p.parseMap(@$, null); }
    ;

channelExpression:
    LT GT
        { $$ = p.parseChannel(@$, null); }
    | LT callExpression GT
        { $$ = p.parseChannel(@$, $2); }
    ;

id:
    IDENTIFIER
        { $$ = p.parseId(@$, $1); }
    | UIDENTIFIER
        { $$ = p.parseTypeId(@$, $1); }
    | THIS
        { $$ = p.parseId(@$, 'this'); }
    | id BACKSLASH UIDENTIFIER
        { $$ = p.ensureTypeArguments(@$, $1); $$.append(p.parseTypeId(@3, $3)); }
    | id BACKSLASH LP id RP
        { $$ = p.ensureTypeArguments(@$, $1); $$.append($4); }
    ;

literal:
    INTEGER
        { $$ = p.parseNumber(@$, $1); }
    | INTEGER_UNIT
        { $$ = p.parseNumber(@$, $1); }
    | FLOAT
        { $$ = p.parseNumber(@$, $1); }
    | FLOAT_UNIT
        { $$ = p.parseNumber(@$, $1); }
    | FLOAT_EXP
        { $$ = p.parseFloatNumber(@$, $1); }
    | HEX
        { $$ = p.parseHex(@$, $1); }
    | string
    | UNDERSCORE
        { $$ = p.parseId(@$, "null"); }
    | QUESTION
        { $$ = p.parseId(@$, "?"); }
    | STAR
        { $$ = p.parseId(@$, "*"); }
    ;

string:
    STRING_OPEN STRING_CLOSE
        { $$ = p.parseQuotes(@$, $1, p.parseString(@$, '')); }
    | STRING_OPEN stringList STRING_CLOSE
        { $$ = p.parseQuotes(@$, $1, $2); }
    ;

stringList:
    STRING
        { $$ = p.parseString(@$, $1); }
    | STRING_FORMAT
        { $$ = p.parseStringFormat(@$, $1); }
    | stringList STRING
        { $$ = p.addString(@$, $1, p.parseString(@2, $2)); }
    | stringList STRING_FORMAT
        { $$ = p.addString(@$, $1, p.parseStringFormat(@2, $2)); }
    ;

op:
    ADD  { $$ = ops.Add; }
    | SUBTRACT { $$ = ops.Subtract; }
    | STAR { $$ = ops.Multiply; }
    | SLASH { $$ = ops.Divide; }
    | SLASH2 { $$ = ops.Mod; }
    | STAR2 { $$ = ops.Pow; }
    | CONCAT { $$ = ops.Concat; }
    | ADD_EQ { $$ = ops.AddEq; }
    | SUBTRACT_EQ { $$ = ops.SubtractEq; }
    | STAR_EQ { $$ = ops.MultiplyEq; }
    | SLASH_EQ { $$ = ops.DivideEq; }
    | SLASH2_EQ { $$ = ops.ModEq; }
    | STAR2_EQ { $$ = ops.PowEq; }
    | CONCAT_EQ { $$ = ops.ConcatEq; }
    | EQ2 { $$ = ops.Equals; }
    | NEQ { $$ = ops.NotEquals; }
    | GT { $$ = ops.GreaterThan; }
    | GTE { $$ = ops.GreaterThanEquals; }
    | LT { $$ = ops.LessThan; }
    | LTE { $$ = ops.LessThanEquals; }
    | ISIN { $$ = ops.IsIn; }
    | NOTIN { $$ = ops.NotIn; }
    ;
    
assignOp:
    EQ
        { $$ = ops.Eq; }
    | LARROW2
        { $$ = ops.Read; }
    | ADD_EQ
        { $$ = ops.AddEq; }
    | SUBTRACT_EQ
        { $$ = ops.SubtractEq; }
    | STAR_EQ
        { $$ = ops.MultiplyEq; }
    | SLASH_EQ
        { $$ = ops.DivideEq; }
    | SLASH2_EQ
        { $$ = ops.ModEq; }
    | STAR2_EQ
        { $$ = ops.PowEq; }
    | CONCAT_EQ
        { $$ = ops.ConcatEq; }
    ;

channelOp:
    LARROW2
        { $$ = ops.Read; }
    | RARROW2
        { $$ = ops.Write; }
    | RARROW2MUL
        { $$ = ops.WriteAll; }
    ;

writeOp:
    RARROW2
        { $$ = ops.Write; }
    | RARROW2MUL
        { $$ = ops.WriteAll; }
    ;

funcOp:
    FATARROW
        { $$ = false; }
    | DO
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
        { $$ = p.parseArg(@$, $1, null); }
    | BIDENTIFIER right
        { $$ = p.parseArg(@$, $2, $1); }
    ;

mapTupleExpression:
    mapAssignmentExpression
        { $$ = p.ensureSet(@$, $1); }
    | mapTupleExpression COMMA mapAssignmentExpression
        { $$ = p.ensureSet(@$, $1); $$.append($3); }
    | mapTupleExpression COMMA
        { $$ = p.ensureSet(@$, $1); }
    ;

mapAssignmentExpression:
    simpleExpression EQ simpleExpression
        { $$ = p.parseBinary(@$, ops.Eq, $1, $3); }
    ;

//////////////////////////////////////////////////////////////////////////////////////////////////

cCode:
    CCODE_OPEN cDeclarations CCODE_CLOSE
        { $$ = $2; p.setLibrary($2, $1); }
    ;
    
cDeclarations:
    cDeclaration
        { $$ = p.parseSet(@$, $1); }
    | cDeclarations cDeclaration
        { $$ = $1; $1.append($2); }
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
        { $$ = p.parseCFunction(@$, $1, $2, $4); }
    | cType IDENTIFIER LP RP
        { $$ = p.parseCFunction(@$, $1, $2, null); }
    ;

cType:
    IDENTIFIER
        { $$ = p.parseCType(@$, $1); }
    | STRUCT IDENTIFIER
        { $$ = p.parseCType(@$, $2); }
    | CONST IDENTIFIER
        { $$ = p.parseCType(@$, $2); }
    | CONST STRUCT IDENTIFIER
        { $$ = p.parseCType(@$, $3); }
    | CPRIMITIVE
        { $$ = p.parseCType(@$, $1); }
    | CONST CPRIMITIVE
        { $$ = p.parseCType(@$, $2); }
    | cType STAR
        { $$ = $1; $1.addPointer(@$, $1); }
    ;

cArgs:
    cArg
        { $$ = p.parseSet(@$, $1); }
    | cArgs COMMA cArg
        { $$ = $1; $1.append($3); }
    ;

cArg:
    cType
        { $$ = p.parseCArgument(@$, $1, null); }
    | cType IDENTIFIER
        { $$ = p.parseCArgument(@$, $1, $2); }
    ;
