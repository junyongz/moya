
import inspect, os.path, traceback, sys, imp, re

# **************************************************************************************************
     
UnknownType = 0
FixtureType = 1
SuiteType = 2
WrapperType = 3
FunctionType = 4
InspectorType = 5
ExeType = 6

testTypeNames = {
    UnknownType: "Unknown",
    FixtureType: "Fixture",
    SuiteType: "Suite",
    WrapperType: "Wrapper",
    FunctionType: "Function",
    InspectorType: "Inspector",
    ExeType: "Exe",
}

testFilesDirName = "__tests__"

reFunctionPrefix = re.compile("test(.+)")

# **************************************************************************************************

def sourceLink(path, line=-1, col=-1):
    if line >= 0:
        if col >= 0:
            return "[[%s:%s:%s]]" % (path, line, col)
        else:
            return "[[%s:%s]]" % (path, line)
    else:
        return "[[%s]]" % (path,)

# **************************************************************************************************

def logException(writer, printStack=False):
    fileName, lineNo = getTracebackSource()
    description = traceback.format_exc()
    print description.strip()

# **************************************************************************************************

def testOutputPath(path):
    return os.path.join(os.environ['HOME'], 'Library', 'Caches', 'moyatests')

def testFunctionPrefix(name):
    m = reFunctionPrefix.match(name)
    if m:
        testPrefix = m.groups()[0]
        return testPrefix[0].lower() + testPrefix[1:]
    
def functionNameToTestFilePattern(obj, name):
    # Find the directory of the module that the class belongs to
    modFilePath = findModule(obj.__module__)
    modFileDirPath = os.path.dirname(modFilePath)
    
    return os.path.join(modFileDirPath, "%s*.test" % name)
    
def testFileName(obj, name):
    # Find the directory of the module that the class belongs to
    modFilePath = findModule(obj.__module__)
    modFileDirPath = os.path.dirname(modFilePath)
    
    return os.path.join(modFileDirPath, "%s.test" % name)

def testFileFunctionName(filePath):
    fileName = os.path.basename(filePath)
    fnPrefix,ext = os.path.splitext(fileName)
    fnPrefix = fnPrefix[0].upper() + fnPrefix[1:]
    return "test%s" % fnPrefix

def testFileFunctionHiddenName(name):
    return "__%s__" % name

# **************************************************************************************************

def findModule(moduleName, finder=imp.find_module):
    """ Gets the absolute path of a module."""
    
    path = None
    for name in moduleName.split("."):
        y,path,z = finder(name, [path] if path else None)
    return path

def getTracebackSource(exc=None):
    if not exc:
        exc = sys.exc_info()
        
    try:
        msg, (filename, lineno, offset, badline) = exc[1]
        return filename, lineno
    except:
        tb = exc[2]
        while tb.tb_next:
            tb = tb.tb_next
        
        try:
            info = inspect.getframeinfo(tb.tb_frame)
            return info[0:2]
        except:
            return (None,None)

def copyToClipboard(text):
    assert sys.platform == "darwin", "Clipboard copying only supported on Mac OS X"

    stream = os.popen("pbcopy", "w")
    stream.write(text)
    stream.close()

# **************************************************************************************************

class PipeEater(object):
    def write(self, *args):
        pass
