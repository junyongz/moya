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

id [a-zA-Z][0-9a-zA-Z]*
idLower [a-z][0-9a-zA-Z]*
idUpper [A-Z][0-9a-zA-Z]*
idDots ({idLower}*)([.]{idLower}+)*
idSymbol [%$¢€£¥]+
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

declarationList:
    declaration
        { $$ = T.parseSet(@1, $1); }
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
        { $$ = T.parseFuncBlock(@1, $1, $2, null, null, false); }
    | accessMode declFunc block
        { $$ = T.parseFuncBlock(@1, $1, $2, $3, null, false); }
    | accessMode declFunc funcOp blockOrRight
        { $$ = T.parseFuncBlock(@1, $1, $2, $4, null, $3); }

    | accessMode declFunc block WHERE blockOrRight
        { $$ = T.parseFuncBlock(@1, $1, $2, $3, $5, false); }
    | accessMode declFunc funcOp blockOrRight WHERE blockOrRight
        { $$ = T.parseFuncBlock(@1, $1, $2, $4, $6, $3); }

    | accessMode declClassId
        { $$ = T.parseClass(@1, $1, $2, null, null); }
    | accessMode declClassId COLON declTypeId
        { $$ = T.parseClass(@1, $1, $2, $3, null); }
    | accessMode declClassId declarationSet
        { $$ = T.parseClass(@1, $1, $2, null, $3); }
    | accessMode declClassId COLON declTypeId declarationSet
        { $$ = T.parseClass(@1, $1, $2, $4, $5); }

    | accessMode IDENTIFIER EQ blockOrRight
        { $$ = T.parseProperty(@1, $1, $2, null, $4); }
    | accessMode IDENTIFIER EQ blockOrRight WHERE blockOrRight
        { $$ = T.parseProperty(@1, $1, $2, null, $4, $6); }
    | accessMode IDENTIFIER COLON declTypeId EQ blockOrRight
        { $$ = T.parseProperty(@1, $1, $2, $4, $6); }
    | accessMode IDENTIFIER COLON declTypeId EQ blockOrRight WHERE blockOrRight
        { $$ = T.parseProperty(@1, $1, $2, $4, $6, $8); }
    ;
    
blockOrRight:
    block
    | right
        { $$ = T.parseSet(@1, $1); }
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

    | declClassId LP RP
        { $$ = T.parseFuncDecl(@1, $1, null, null, null); }
    | declClassId LP declArgumentList RP
        { $$ = T.parseFuncDecl(@1, $1, $3); }
    ;

declClassId:
    UIDENTIFIER
        { $$ = T.parseTypeId(@1, $1); }
    | declClassId BACKSLASH UIDENTIFIER
        { $$ = T.ensureTypeArguments(@1, $1); $$.append(T.parseTypeId(@3, $3)); }
    ;

declId:
    IDENTIFIER
        { $$ = T.parseId(@1, $1); }
    | declId BACKSLASH UIDENTIFIER
        { $$ = T.ensureTypeArguments(@1, $1); $$.append(T.parseTypeId(@3, $3)); }
    ;

declTypeId:
    UIDENTIFIER
        { $$ = T.parseTypeId(@1, $1); }
    | GT LP declTypeIdList RP COLON declTypeId
        { $$ = T.parseTypeArguments(@1, T.parseTypeId(@1, 'Function')); $$.append($6); $$.appendList($3); }
    | LT GT
        { $$ = T.parseTypeArguments(@1, T.parseTypeId(@1, 'Channel')); }
    | LT declTypeId GT
        { $$ = T.parseTypeArguments(@1, T.parseTypeId(@1, 'Channel')); $$.append($2); }
    | LB declTypeId RB
        { $$ = T.parseTypeArguments(@1, T.parseTypeId(@1, 'List')); $$.append($2); }
    | LCBP declTypeId EQ declTypeId RCBP
        { $$ = T.parseTypeArguments(@1, T.parseTypeId(@1, 'Map')); $$.append($2); $$.append($4); }

    | declTypeId BACKSLASH UIDENTIFIER
        { $$ = T.ensureTypeArguments(@1, $1); $$.append(T.parseTypeId(@3, $3)); }
    | declTypeId BACKSLASH LP declTypeId RP
        { $$ = T.ensureTypeArguments(@1, $1); $$.append($4); }
    ;

declTypeIdList:
    declTypeId
        { $$ = [$1]; }
    | declTypeIdList COMMA declTypeId
        { $$ = $1; $1.push($3); }
    ;
    
declArgumentList:
    declArgument
        { $$ = T.parseSet(@1, $1); }
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
    | whileBlock
    | tryBlock
    | STAR2 declArgument
        { $$ = $2; }
    ;

statementList:
    statement
        { $$ = T.parseSet(@1, $1); }
    | statementList lineEnding statement
        { $$ = $1; if ($3) $1.append($3); }
    | statementList lineEnding
        { $$ = $1; }
    ;

importDirective:
    GT moduleNameList
        { $$ = T.parseImport(@1, $2); }
    ;

moduleName:
    SLASH id
        { $$ = T.parseSet(@1, $2); }
    | id
        { $$ = T.parseSet(@1, T.parseId(@1, ".")); $$.append($1); }
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
        { $$ = T.parseReturn(@1, $2); }
    | EQ
        { $$ = T.parseReturn(@1, T.parseUndefined(@1)); }
    | CONTINUE
        { $$ = T.parseContinue(@1); }
    | BREAK
        { $$ = T.parseBreak(@1); }
    | THROW rightBlock
        { $$ = T.parseThrow(@1, $2); }
    | THROW
        { $$ = T.parseThrow(@1, T.parseUndefined(@1)); }
    ;

whileBlock:
    WHILE right block
        { $$ = T.parseWhile(@1, $2, $3); }
    | WHILE block
        { $$ = T.parseWhile(@1, T.parseNumber(@1, '1'), $2); }
    ;

tryBlock:
    TRY block catchBlockList
        { $$ = T.parseTry(@1, $2, $3, null); }
    | TRY block catchBlockList FINALLY block
        { $$ = T.parseTry(@1, $2, $3, $5); }
    | TRY block FINALLY block
        { $$ = T.parseTry(@1, $2, null, $4); }
    ;

catchBlock:
    CATCH block
        { $$ = T.parseCatch(@1, null, $2); }
    | CATCH callExpression lineEnding
        { $$ = T.parseCatch(@1, $2, null); }
    | CATCH callExpression block
        { $$ = T.parseCatch(@1, $2, $3); }
    ;

catchBlockList:
    catchBlock
        { $$ = T.parseSet(@1, $1); }
    | catchBlockList catchBlock
        { $$ = $1; $1.append($2); }
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
        { $$ = T.parseWhere(@1, $1, $3); }
    | blockChain WHERE block
        { $$ = T.parseWhere(@1, $1, $3); }
    ;

blockChain:
    blockLeft
    ;

callBlock:
    tupleExpression
    | tupleExpression block
        { $$ = T.parseCallBlock(@1, $1); $$.addArg(T.parseArg(@2, $2, null)); }
    | callBlock BULLET block
        { $$ = T.parseCallBlock(@1, $1); $$.addArg(T.parseArg(@3, $3, null)); }
    | callBlock BULLET anonFunc
        { $$ = T.parseCallBlock(@1, $1); $$.addArg(T.parseArg(@3, $3, null)); }
    | callBlock BIDENTIFIER block
        { $$ = T.parseCallBlock(@1, $1); $$.addArg(T.parseArg(@3, $3, $2)); }
    | callBlock BIDENTIFIER anonFunc
        { $$ = T.parseCallBlock(@1, $1); $$.addArg(T.parseArg(@3, $3, $2)); }
    ;
    
blockLeft:
    callBlock
    | anonFunc
    
    // | tupleExpression assignOp assignmentExpression block
    //     { $$ = PARSE_FUNCTION(@1, T.parseAssignment(@1, $2, $1, $3), $4, false); }
    | tupleExpression assignOp assignmentExpression
        { $$ = T.parseAssignment(@1, $2, $1, $3); }
    | tupleExpression assignOp blockRight
        { $$ = T.parseAssignment(@1, $2, $1, $3); }
    
    | DASHDASH tupleExpression
        { $$ = T.parsePrint(@1, $2); }
    | DASHDASH blockRight
        { $$ = T.parsePrint(@1, $2); }
    
    | tupleExpression writeOp assignmentExpression
        { $$ = T.parseBinary(@2, $2, $1, $3); }
    | tupleExpression writeOp blockRight
        { $$ = T.parseBinary(@2, $2, $1, $3); }

    | channelOp assignmentExpression
        { $$ = T.parseUnary(@1, $1, $2); }
    | channelOp
        { $$ = T.parseUnary(@1, $1, null); }
    | channelOp blockRight
        { $$ = T.parseUnary(@1, $1, $2); }
        
    | isBlock
    | ifBlock
    
    | STAR tupleExpression inOn tupleExpression RARROW assignmentExpression
        { $$ = T.parseIterator(@1, $2, $4, null, $6, $3, false); }
    | STAR tupleExpression inOn tupleExpression RARROW blockRight
        { $$ = T.parseIterator(@1, $2, $4, null, $6, $3, false); }
    | STAR tupleExpression inOn tupleExpression block
        { $$ = T.parseIterator(@1, $2, $4, null, $5, $3, false); }
    | STAR tupleExpression block
        { $$ = T.parseIterator(@1, $2, null, null, $3, 0, false); }
    
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = T.parseIterator(@1, $2, $4, $6, $8, $3, $5); }
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = T.parseIterator(@1, $2, $4, $6, $8, $3, $5); }
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression block
        { $$ = T.parseIterator(@1, $2, $4, $6, $7, $3, $5); }
    | STAR tupleExpression ifWhile tupleExpression block
        { $$ = T.parseIterator(@1, $2, null, $4, $5, 0, $3); }
    
    | STAR tupleExpression RARROW assignmentExpression
        { $$ = T.parseMapper(@1, $2, null, $4, false, false); }
    | STAR tupleExpression RARROW blockRight
        { $$ = T.parseMapper(@1, $2, null, $4, false, false); }
    
    | STAR tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = T.parseMapper(@1, $2, $4, $6, false, $3); }
    | STAR tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = T.parseMapper(@1, $2, $4, $6, false, $3); }
    ;

anonFunc:
    GT anonFuncArgs assignmentExpression
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs blockRight
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs DO assignmentExpression
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    | GT anonFuncArgs DO blockRight
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    ;
    
anonFuncArgs:
    LP RP
        { $$ = null; }
    | LP declArgumentList RP
        { $$ = $2; }
    ;

isBlock:
    tupleExpression IS matchExpr
        { $$ = T.parseIs(@1, $1, $3); }
    | tupleExpression IS matchExpr ELSE blockOrRight
        { $$ = T.parseIs(@1, $1, $3, $5); }
    | tupleExpression IS LCB matchList RCB
        { $$ = T.parseIs(@1, $1, $4); }
    | tupleExpression IS LCB matchList lineEnding ELSE RARROW blockOrRight RCB
        { $$ = T.parseIs(@1, $1, $4, $8); }
    ;
    
ifBlock:
    IF elseIfChain
        { $$ = T.parseIf(@1, $2, null); }
    | IF elseIfChain ELSE blockOrRight
        { $$ = T.parseIf(@1, $2, $4); }
    | IF LCB matchList RCB
        { $$ = T.parseIf(@1, $3); }
    | IF LCB matchList lineEnding ELSE RARROW blockOrRight RCB
        { $$ = T.parseIf(@1, $3, $7); }
    ;

elseIfChain:
    tupleExpression block
        { $$ = T.parseTransform(@1, $1, $2); }
    | elseIfChain ELSE IF tupleExpression block
        { $$ = $1; $$.addPair($4, $5); }
    ;

matchList:
    tupleExpression RARROW blockOrRight
        { $$ = T.parseTransform(@1, $1, $3); }
    | matchList lineEnding tupleExpression RARROW blockOrRight
        { $$ = $1; $$.addPair($3, $5); }
    | matchList lineEnding
        { $$ = $1; }
    | lineEnding
    ;

ifExpr:
    IF matchExpr
        { $$ = T.parseIf(@1, $2, null);  }
    | IF matchExpr ELSE binaryExpression
        { $$ = T.parseIf(@1, $2, $4); }
    ;

matchExpr:
    binaryExpression RARROW binaryExpression
        { $$ = T.parseTransform(@1, $1, $3); }
    | matchExpr OR binaryExpression RARROW binaryExpression
        { $$ = $1; $$.addPair($3, $5); }
    ;
        
blockRight:
    block
    // | tupleExpression assignOp blockRight
    //     { $$ = T.parseAssignment(@1, $2, $1, $3); }
    
    // | tupleExpression BULLET blockRight
    //     { $$ = $1; /*PARSE_CALL(@1, $1, null); APPEND_ARGS($$, $3);*/ }
    
    | DASHDASH blockRight
        { $$ = T.parsePrint(@1, $2); }
    
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
    
    | isBlock
    | ifBlock

    | STAR tupleExpression inOn tupleExpression RARROW blockRight
        { $$ = T.parseIterator(@1, $2, $4, null, $6, $3, false); }
    | STAR tupleExpression inOn tupleExpression block
        { $$ = T.parseIterator(@1, $2, $4, null, $5, $3, false); }
    | STAR tupleExpression block
        { $$ = T.parseIterator(@1, $2, null, null, $3, 0, false); }
    
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = T.parseIterator(@1, $2, $4, $6, $8, $3, $5); }
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression block
        { $$ = T.parseIterator(@1, $2, $4, $6, $7, $3, $5); }
    | STAR tupleExpression ifWhile tupleExpression block
        { $$ = T.parseIterator(@1, $2, null, $4, $5, 0, $3); }
    
    | STAR tupleExpression RARROW blockRight
        { $$ = T.parseMapper(@1, $2, null, $4, false, false); }
    | STAR tupleExpression ifWhile tupleExpression RARROW blockRight
        { $$ = T.parseMapper(@1, $2, $4, $6, false, $3); }
    ;

assignmentExpression:
    tupleExpression
    | assignmentExpression assignOp tupleExpression
        { $$ = T.parseAssignment(@1, $2, $1, $3); }

    // | tupleExpression BULLET assignmentExpression
    //     { $$ = $1; /*PARSE_CALL(@1, $1, null); APPEND_ARGS($$, $3);*/ }

    | DASHDASH assignmentExpression
        { $$ = T.parsePrint(@1, $2); }

    // | assignmentExpression writeOp tupleExpression
    //     { $$ = T.parseBinary(@1, $2, $1, $3); }
    | channelOp tupleExpression
        { $$ = T.parseUnary(@1, $1, $2); }
    
    // | tupleExpression funcOp assignmentExpression
    //     { $$ = PARSE_FUNCTION(@1, $1, $3, $2); }
    // | funcOp assignmentExpression
    //     { $$ = PARSE_FUNCTION(@1, null, $2, $1); }

    | STAR tupleExpression inOn tupleExpression RARROW assignmentExpression
        { $$ = T.parseIterator(@1, $2, $4, null, $6, $3, false); }
    
    | STAR tupleExpression inOn tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = T.parseIterator(@1, $2, $4, $6, $8, $3, $5); }
    
    | STAR tupleExpression RARROW assignmentExpression
        { $$ = T.parseMapper(@1, $2, null, $4, false, false); }
    | STAR tupleExpression ifWhile tupleExpression RARROW assignmentExpression
        { $$ = T.parseMapper(@1, $2, $4, $6, false, $3); }
    ;

assignmentExpressionSimple:
    simpleExpression
    | simpleExpression assignOp right
        { $$ = T.parseAssignment(@1, $2, $1, $3); }
    
    // | simpleExpression BULLET right
    //     { $$ = $1; /*PARSE_CALL(@1, $1, null); APPEND_ARGS($$, $3);*/ }
    
    | DASHDASH right
        { $$ = T.parsePrint(@1, $2); }
    
    | simpleExpression writeOp right
        { $$ = T.parseBinary(@2, $2, $1, $3); }
    
    | channelOp right
        { $$ = T.parseUnary(@1, $1, $2); }
    | channelOp
        { $$ = T.parseUnary(@1, $1, null); }
    
    | GT anonFuncArgs right
        { $$ = T.parseAnonFunc(@1, $2, false, $3); }
    | GT anonFuncArgs DO right
        { $$ = T.parseAnonFunc(@1, $2, true, $4); }
    
    | simpleExpression IS matchExpr
        { $$ = T.parseIs(@1, $1, $3, null);  }
    | simpleExpression IS matchExpr ELSE right
        { $$ = T.parseIs(@1, $1, $3, $5); }

    | STAR simpleExpression inOn simpleExpression RARROW right
        { $$ = T.parseIterator(@1, $2, $4, null, $6, $3, false); }
    | STAR simpleExpression inOn simpleExpression ifWhile simpleExpression RARROW right
        { $$ = T.parseIterator(@1, $2, $4, $6, $8, $3, $5); }
    
    | STAR simpleExpression RARROW right
        { $$ = T.parseMapper(@1, $2, null, $4, false, false); }
    | STAR simpleExpression ifWhile simpleExpression RARROW right
        { $$ = T.parseMapper(@1, $2, $4, $6, false, $3); }
    ;

tupleExpression:
    simpleExpression
    | simpleExpression COMMA tupleExpression
        { $$ = T.ensureSet(@1, $1); $$.append($3); }
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
        { $$ = T.parseInfixOp(@1, $2, $1, $3); }
    ;

concatExpression:
    logicalOrExpression
    | concatExpression CONCATSTR logicalOrExpression
        { $$ = T.parseBinary(@2, T.ConcatStringOp, $1, $3); }
    ;

logicalOrExpression:
    logicalAndExpression
    | logicalOrExpression PIPE logicalAndExpression
        { $$ = T.parseBinary(@2, T.OrOp, $1, $3); }
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
        { $$ = T.parseBinary(@2, T.AndOp, $1, $3); }
    ;

equalityExpression:
    relationalExpression
    | equalityExpression EQ2 relationalExpression
        { $$ = T.parseBinary(@2, T.EqualsOp, $1, $3); }
    | equalityExpression NEQ relationalExpression
        { $$ = T.parseBinary(@2, T.NotEqualsOp, $1, $3); }
    ;

relationalExpression:
    addExpression
    | relationalExpression LT addExpression
        { $$ = T.parseBinary(@2, T.LessThanOp, $1, $3); }
    | relationalExpression GT addExpression
        { $$ = T.parseBinary(@2, T.GreaterThanOp, $1, $3); }
    | relationalExpression LTE addExpression
        { $$ = T.parseBinary(@2, T.LessThanEqualsOp, $1, $3); }
    | relationalExpression GTE addExpression
        { $$ = T.parseBinary(@2, T.GreaterThanEqualsOp, $1, $3); }
    | relationalExpression ISNOT addExpression
        { $$ = T.parseBinary(@2, T.IsNotOp, $1, $3); }
    | relationalExpression ISIN addExpression
        { $$ = T.parseBinary(@2, T.IsInOp, $1, $3); }
    | relationalExpression NOTIN addExpression
        { $$ = T.parseBinary(@2, T.NotInOp, $1, $3); }
    ;

addExpression:
    multiplyExpression
    | addExpression ADD multiplyExpression
        { $$ = T.parseBinary(@2, T.AddOp, $1, $3); }
    | addExpression SUBTRACT multiplyExpression
        { $$ = T.parseBinary(@2, T.SubtractOp, $1, $3); }
    ;

multiplyExpression:
    unaryExpression
    | multiplyExpression STAR unaryExpression
        { $$ = T.parseBinary(@2, T.MultiplyOp, $1, $3); }
    | multiplyExpression SLASH unaryExpression
        { $$ = T.parseBinary(@2, T.DivideOp, $1, $3); }
    | multiplyExpression SLASH2 unaryExpression
        { $$ = T.parseBinary(@2, T.ModOp, $1, $3); }
    | multiplyExpression STAR2 unaryExpression
        { $$ = T.parseBinary(@2, T.PowOp, $1, $3); }
    | multiplyExpression CONCAT unaryExpression
        { $$ = T.parseBinary(@2, T.ConcatOp, $1, $3); }
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
    | callExpression AS declTypeId
        { $$ = T.parseCast(@1, $1, $3); }
    
    | callExpression callArguments
        { $$ = T.parseCall(@1, $1, $2); }
    
    | callExpression DOT IDENTIFIER
        { $$ = T.parseGet(@1, $1, $3); }
    
    | callExpression DOT LB right RB
        { $$ = T.parseBinary(@1, T.LookupOp, $1, $4); }
    | callExpression DOT LB right PIPE2 right RB
        { $$ = T.parseBinary(@1, T.LookupOp, $1, T.parseDefault(@4, $4, $6)); }
    
    | callExpression LB right RB
        { $$ = T.parseBinary(@1, T.IndexOp, $1, $3); }
    | callExpression LB right PIPE2 right RB
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
    | id BACKSLASH UIDENTIFIER
        { $$ = T.ensureTypeArguments(@1, $1); $$.append(T.parseTypeId(@3, $3)); }
    | id BACKSLASH LP id RP
        { $$ = T.ensureTypeArguments(@1, $1); $$.append($4); }
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
    | QUESTION
        { $$ = T.parseId(@1, "?"); }
    | STAR
        { $$ = T.parseId(@1, "*"); }
    ;

string:
    STRING_OPEN STRING_CLOSE
        { $$ = T.parseQuotes(@1, $1, T.parseString(@1, '')); }
    | STRING_OPEN stringList STRING_CLOSE
        { $$ = T.parseQuotes(@1, $1, $2); }
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
    simpleExpression EQ simpleExpression
        { $$ = T.parseBinary(@1, T.EqOp, $1, $3); }
    ;

//////////////////////////////////////////////////////////////////////////////////////////////////

cCode:
    CCODE_OPEN cDeclarations CCODE_CLOSE
        { $$ = $2; T.setLibrary($2, $1); }
    ;
    
cDeclarations:
    cDeclaration
        { $$ = T.parseSet(@1, $1); }
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
        { $$ = T.parseCFunction(@1, $1, $2, $4); }
    | cType IDENTIFIER LP RP
        { $$ = T.parseCFunction(@1, $1, $2, null); }
    ;

cType:
    IDENTIFIER
        { $$ = T.parseCType(@1, $1); }
    | STRUCT IDENTIFIER
        { $$ = T.parseCType(@1, $2); }
    | CONST IDENTIFIER
        { $$ = T.parseCType(@1, $2); }
    | CONST STRUCT IDENTIFIER
        { $$ = T.parseCType(@1, $3); }
    | CPRIMITIVE
        { $$ = T.parseCType(@1, $1); }
    | CONST CPRIMITIVE
        { $$ = T.parseCType(@1, $2); }
    | cType STAR
        { $$ = $1; $1.addPointer(@1, $1); }
    ;

cArgs:
    cArg
        { $$ = T.parseSet(@1, $1); }
    | cArgs COMMA cArg
        { $$ = $1; $1.append($3); }
    ;

cArg:
    cType
        { $$ = T.parseCArgument(@1, $1, null); }
    | cType IDENTIFIER
        { $$ = T.parseCArgument(@1, $1, $2); }
    ;
