
class Message(object):
    def __init__(self):
        pass

    def __str__(self):
        pass

    def getJSON(self):
        pass

    def affect(self, stream):
        pass

class error(Message):
    def __init__(self, text, source=None, line=0, col=0):
        self.kind = 'error'
        self.text = text
        self.source = source
        self.line = line
        self.col = col

    def __str__(self):
        if self.source:
            if self.line:
                return '* %s: %s (%s:%s)' \
                        % (self.kind.upper(), self.text, self.source, self.line)
            else:
                return '* %s: %s (%s)' \
                        % (self.kind.upper(), self.text, self.source)
        else:
            return '* %s: %s' % (self.kind.upper(), self.text)

    def getJSON(self):
        packet = {"type": self.kind, "description": self.text}
        if self.source:
            packet['path'] = self.source
            packet['line'] = self.line
            packet['col'] = self.col
        return packet

    def affect(self, stream):
        stream.errorCount += 1

class warning(error):
    def __init__(self, *args):
        super(warning, self).__init__(*args)
        self.kind = 'warning'

    def affect(self, stream):
        stream.warningCount += 1

class opener(Message):
    def __init__(self, text, source=None, line=0):
        self.text = text
        self.source = source
        self.line = 0

    def __str__(self):
        if self.source:
            return '> %s [[%s:%s]]' % (self.text, self.source, self.line)
        else:
            return '> %s' % (self.text)

    def getJSON(self):
        packet = {"type": "opener", "description": self.text}
        if self.source:
            packet['path'] = self.source
            packet['line'] = self.line
        return packet

class closer(Message):
    def __str__(self):
        return ''

    def getJSON(self):
        return {"type": "closer"}

class command(Message):
    def __init__(self, text, source=None, line=0, col=0):
        self.text = text
        self.source = source
        self.line = line
        self.col = col

    def __str__(self):
        if self.source:
            if self.line:
                return '* %s (%s:%s)' \
                        % (self.text, self.source, self.line)
            else:
                return '* %s (%s)' \
                        % (self.text, self.source)
        else:
            return '* %' % (self.text)

    def getJSON(self):
        packet = {"type": "command", "description": self.text}
        if self.source:
            packet['path'] = self.source
            packet['line'] = self.line
        return packet

    def affect(self, stream):
        stream.commandCount += 1

class summary(Message):
    def __init__(self, text):
        self.text = text

    def __str__(self):
        return self.text

    def getJSON(self):
        return {"type": "summary", "description": self.text}

#####################################################################################

class testBegin(Message):
    def __init__(self, result, testName, sourcePath):
        self.result = result
        self.testName = testName
        self.sourcePath = sourcePath

    def __str__(self):
        return '* Begin %s' % self.testName

    def getJSON(self):
        return {"type": "test-begin", "path": self.sourcePath, "test": self.testName}

class testComplete(Message):
    def __init__(self):
        pass

    def __str__(self):
        return ''

    def getJSON(self):
        return {"type": "test-complete"}

class testPassed(Message):
    def __str__(self):
        return 'PASS'

    def getJSON(self):
        return {"type": "test-passed"}

class testNYI(Message):
    def __str__(self):
        return 'PASS'

    def getJSON(self):
        return {"type": "test-nyi"}

class testFailure(Message):
    def __init__(self, reason, sourcePath, line, expected=None, actual=None,
                 args=None, source=None):
        self.reason = reason
        self.sourcePath = sourcePath
        self.line = line
        self.expected = expected
        self.actual = actual
        self.args = args
        self.source = source

    def __str__(self):
        return self.result

    def getJSON(self):
        packet = {"type": "test-failed", "reason": self.reason, "path": self.sourcePath,
                  "line": self.line}
        if self.expected:
            packet['expected'] = self.expected
        if self.actual:
            packet['actual'] = self.actual
        if self.args:
            packet['args'] = self.args
        if self.source:
            packet['source'] = self.source
        return packet


class testMetadata(Message):
    def __init__(self, metadata):
        self.metadata = metadata

    def getJSON(self):
        return {"type": "test-metadata", "metadata": self.metadata}
