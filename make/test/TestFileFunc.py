
import os.path, functools, re, sys, shutil
from .utils import testOutputPath, testFileFunctionHiddenName, copyToClipboard

# **************************************************************************************************

reCommentSep = re.compile("^={10,}$")
reTestSep1 = re.compile("^-{10,}$")
reTestSep2 = re.compile("^(- ){10,}[-]?$")
reFocus = re.compile("^\\\{10,}?$")
reDisabler = re.compile("^///{10,}?$")
reComment = re.compile("#\s*(.*)\s*$")
reArg = re.compile("%\s*(.*)\s*$")
reArgPair = re.compile("%\s*(.+?)\s*:\s*(.+?)\s*$")
reTag = re.compile("@(([^/\s]+/)*([^/\s]+)?)")

# **************************************************************************************************

class TestFileFunc:
    def __init__(self, fixture, filePath, methodName):
        self.fixture = fixture
        self.testFilePath = filePath
        self.methodName = methodName
        self.testContainer = True

    def __call__(self):
        fn = getattr(self.fixture, self.methodName)
        disregardFocus = getattr(self.fixture, "disregardFocus", True)
        
        outputPath = None

        for source,expected,args,files,lineNo in self.walkTextTests(disregardFocus):
            if "adhoc" in args and disregardFocus:
                runner = lambda *args, **kwds: 0
                runner.skip = True
                yield runner, self.testFilePath, lineNo
            elif "skip" in args:
                runner = lambda *args, **kwds: 0
                runner.skip = True
                yield runner, self.testFilePath, lineNo
            elif "nyi" in args:
                runner = lambda *args, **kwds: 0
                runner.nyi = True
                yield runner, self.testFilePath, lineNo
            else:
                if files:
                    outputPath = testOutputPath(self.testFilePath)
                    if not os.path.isdir(outputPath):
                        os.makedirs(outputPath)

                    for testPath in files:
                        subPath = os.path.dirname(testPath)
                        dirPath = os.path.join(outputPath, subPath)
                        fileName = os.path.basename(testPath)
                        filePath = os.path.join(dirPath, fileName)
                        if not os.path.isdir(dirPath):
                            os.makedirs(dirPath)
                        
                        f = file(filePath, "w")
                        f.write(files[testPath])
                        f.close()
                
                printFn, copyOutput, testFn = self.extractArgs(args, "print", "copy", "test")
                printOutput = printFn and not callable(printFn)                
                if testFn:
                    runner = functools.partial(self.runTest, testFn, source, expected, args,
                        copyOutput, printOutput, printFn)
                else:
                    runner = functools.partial(self.runTest, fn, source, expected, args,
                        copyOutput, printOutput, printFn)

                sys.path.append(os.path.dirname(self.testFilePath))
                if outputPath:
                    sys.path.append(outputPath)

                    if not os.path.isdir(outputPath):
                        os.makedirs(outputPath)

                    wd = os.getcwd()
                    os.chdir(outputPath)

                yield runner, self.testFilePath, lineNo

                sys.path.remove(os.path.dirname(self.testFilePath))
                if outputPath:
                    sys.path.remove(outputPath)
                    os.chdir(wd)

                    if "keepfiles" not in args:
                        if os.path.isdir(outputPath):
                            shutil.rmtree(outputPath)

                    outputPath = None

    def walkTextGroups(self, disregardFocus=False):
        lines = [line for line in file(self.testFilePath)]
        return walkTextBlocks(lines, self.testFilePath, disregardFocus)
        
    def walkTextTests(self, disregardFocus=False):
        groups, hasFocus = self.walkTextGroups(disregardFocus)
        if hasFocus:
            for group in groups:
                for test in group.tests:
                    if test.isFocused:
                        yield test.source, test.expected, test.args, test.files, test.lineNo
        else:
            for group in groups:
                for test in group.tests:
                    yield test.source, test.expected, test.args, test.files, test.lineNo

    def extractArgs(self, args, *names):
        for name in names:
            if not name in args:
                yield None
            else:
                value = args[name]
                del args[name]

                if not isinstance(value, str):
                    yield True
                else:
                    hiddenName = testFileFunctionHiddenName(value)
                    if hasattr(self.fixture, hiddenName):
                        fn = getattr(self.fixture, hiddenName)
                        yield fn
                    else:
                        self.fixture.warn("Test '%s' is not defined" % value)
                        yield None

    def runTest(self, fn, source, expected, args, copyOutput, printOutput, printFn):
        from .TestFixture import TestException, RunException, TestAbortException

        try:
            if callable(printFn):
                print printFn(source, expected, **args)

            actual = fn(source, expected, **args)
            if copyOutput:
                copyToClipboard(actual)
            if printOutput:
                print actual
            if actual != None:
                self.fixture.assertEqualString(actual, expected)
        except TestAbortException, exc:
            raise
        except TestException, exc:
            raise
        except RunException, exc:
            raise
        except:
            self.fixture.assertException(expected)

# **************************************************************************************************

class TestTag(object):
    def __init__(self, names):
        self.names = names
    
    def isContained(self, other):
        pass
            
class TestGroup(object):
    def __init__(self):
        self.comment = ''
        self.tags = []
        self.tests = []
            
class TestBlock(object):
    def __init__(self):
        self.source = ''
        self.expected = ''
        self.comment = ''
        self.args = {}
        self.files = {}
        self.lineNo = 0
        self.isFocused = False

# **************************************************************************************************

ExpectRoot = 1
ExpectEndComment = 2
ExpectSource = 3
ExpectExpected = 4
ExpectFile = 5

class ParseState(object):
    def __init__(self):
        self.expect = ExpectRoot
        
        self.isDisabled = False
        self.hasFocus = False
        self.currentGroup = None
        self.currentTest = None
        self.currentFile = None
        self.currentFilePath = None
        self.groups = []
        self.lineNo = 0

def walkTextBlocks(lines, testFilePath, disregardFocus=False):
    state = ParseState()
    
    def consumeArg(line):
        m = reArgPair.match(line)
        if m:
            argName = m.groups()[0]
            argValue = m.groups()[1]          
            
            if argName == "file":
                state.expect = ExpectFile
                state.currentFile = ''
                state.currentFilePath = argValue
            else:
                state.currentTest.args[argName] = argValue
            return True
        else:
            m = reArg.match(line)
            if m:
                instruction = m.groups()[0]
                state.currentTest.args[instruction] = True            
                return True
    
    while lines:
        line = lines[0]
        del lines[0]
        
        state.lineNo += 1

        if state.expect == ExpectRoot:
            if reCommentSep.match(line):
                state.currentGroup = TestGroup()
                
                state.expect = ExpectEndComment

            elif reTestSep1.match(line):
                state.currentTest = TestBlock()
                state.currentTest.lineNo = state.lineNo

                state.expect = ExpectSource

        elif state.expect == ExpectEndComment:
            if reCommentSep.match(line):
                state.groups.append(state.currentGroup)

                state.expect = ExpectRoot
            else:
                m = reTag.findall(line)
                if m:
                    state.currentGroup.tags = list([mm[0] for mm in m])
                else:
                    state.currentGroup.comment += line
        
        elif state.expect == ExpectSource:
            if consumeArg(line):
                pass
            elif reComment.match(line):
                state.currentTest.comment += line
            elif reFocus.match(line):
                state.currentTest.isFocused = True
                state.hasFocus = True
            elif reDisabler.match(line):
                state.isDisabled = True
            elif reTestSep2.match(line):                
                state.currentTest.lineNo = state.lineNo
                state.expect = ExpectExpected
            else:
                state.currentTest.source += line

        elif state.expect == ExpectExpected:
            if consumeArg(line):
                pass                
            elif reTestSep2.match(line):                
                state.currentTest.lineNo = state.lineNo
                state.expect = ExpectExpected
            elif reTestSep1.match(line) or reCommentSep.match(line):
                if not state.isDisabled:
                    if not state.currentGroup:
                        state.currentGroup = TestGroup()
                        state.groups.append(state.currentGroup)
                    state.currentGroup.tests.append(state.currentTest)
                
                state.currentTest.source = state.currentTest.source.strip('\n')
                state.currentTest.expected = state.currentTest.expected.strip('\n')
                state.currentTest = None
                state.expect = ExpectRoot
                
                lines.insert(0, line)
                state.lineNo -= 1
            else:
                state.currentTest.expected += line

        elif state.expect == ExpectFile:
            if reTestSep2.match(line):   
                state.currentTest.files[state.currentFilePath] = state.currentFile             
                state.currentTest.lineNo = state.lineNo
                state.currentFile = None
                
                state.expect = ExpectExpected
            else:
                state.currentFile += line
        
    return state.groups, state.hasFocus

def coerceArgs(args):
    for name,value in args.iteritems():
        try:
            args[name] = int(value)
        except:
            if value.lower() == "false":
                args[name] = False
            elif value.lower() == "true":
                args[name] = True
