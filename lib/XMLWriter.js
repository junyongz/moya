
function XMLWriter() {
    this.indent = 0;
    this.lines = [];
    this.nameStack = [];
    this.contentStack = [0];
    this.isNested = false;
}
exports.XMLWriter = XMLWriter;
XMLWriter.prototype = {
    read: function() {
        return this.lines.join('\n');
    },
    
    _checkContent: function() {
        var hasContent = this.contentStack[this.contentStack.length-1];
        ++this.contentStack[this.contentStack.length-1];
        if (hasContent == 0) {
            this.write('>');
        }
    },
    
    begin: function(name, attrs) {
        this._checkContent();
        var line = '<' + name;
        for (var attrName in attrs) {
            line += ' ' + attrName + '="' + attrs[attrName] + '"';
        }
        
        this.writeLine(line);
        this.indent += 1;
        this.nameStack.push(name);
        this.contentStack.push(0);
    },

    end: function() {
        var name = this.nameStack.pop();
        var hasContent = this.contentStack.pop();
        this.indent -= 1;
        if (hasContent) {
            this.writeLine('</' + name + '>');
        } else {
            this.write('/>');
        }
    },

    attr: function(name, value) {
        this.write(' ' + name + '="' + value + '"');
    },

    element: function(name, attrs) {
        this._checkContent();
        var line = '<' + name;
        for (var attrName in attrs) {
            line += ' ' + attrName + '="' + attrs[attrName] + '"';
        }
        line += '/>';
        
        this.writeLine(line);
    },
    
    write: function(text) {
        var line = this.lines[this.lines.length-1];
        this.lines[this.lines.length-1] = line + text;
    },
    
    writeLine: function(line) {
        var indent = '';
        for (var i = 0; i < this.indent; ++i) {
            indent += '    ';
        }
        this.lines.push(indent + line);
    }
};
