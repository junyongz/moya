
// *************************************************************************************************

function MILWriter() {
    this.funcs = [];
    this.lines = [];
    this.indentation = 0;
    this.count = 0;
    this.stack = [{indentation: this.indentation, count: this.count, lines: this.lines}];
}
exports.MILWriter = MILWriter;

MILWriter.prototype = {
    begin: function() {
        this.stack.push({indentation: this.indentation, count: this.count, lines: this.lines});
        this.lines = [];
        this.count = 0;
        this.indentation = 0;
        this.funcs.push(this.lines);
    },

    end: function() {
        var frame = this.stack.pop();
        this.lines = frame.lines;
        this.count = frame.count;
        this.indentation = frame.indentation;
    },
    
    temp: function(line, prefix) {
        var name = this.name(prefix);
        this.write(name + ' = ' + line);
        return name;
    },
    
    name: function(prefix) {
        ++this.count;
        if (prefix) {
            return '%' + prefix + this.count;
        } else {
            return '%' + this.count;
        }
    },
    
    indent: function(n) {
        this.indentation += n;
    },
    
    write: function(line) {
        if (this.indentation) {
            line = '    '.repeat(this.indentation) + line;
        }
        this.lines.push(line);
    },
    
    dump: function() {
        var lines = this.lines.join('\n');
        var funcs = this.funcs.map(function(lines) {
            return lines.join('\n');
        });
        return lines + '\n' + funcs.join('\n\n');
    },
};
