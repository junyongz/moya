
import inspect, types, sys, os.path, re, glob
from .TestFileFunc import TestFileFunc
from utils import testOutputPath, findModule, testFunctionPrefix, testFileFunctionHiddenName
from utils import functionNameToTestFilePattern, testFileFunctionName

# **************************************************************************************************

class TestFixture:
    metadata = None

    class __metaclass__(type):
        def __new__(cls, *args):
            newClass = super(cls, cls).__new__(cls, *args)

            for name in dir(newClass):
                attr = getattr(newClass, name)
                if type(attr) == types.UnboundMethodType:
                    args, varags, varkwds, defaults = inspect.getargspec(attr)
                    if len(args) < 2:
                        continue

                    functionName = testFunctionPrefix(name)
                    if not functionName:
                        continue

                    delattr(newClass, name)
                    hiddenName = testFileFunctionHiddenName(functionName)
                    setattr(newClass, hiddenName, attr)

                    # Create a new function for every test file whose name matches the class name
                    pattern = functionNameToTestFilePattern(newClass, functionName)
                    for filePath in glob.glob(pattern):
                        fnName = testFileFunctionName(filePath)
                        filePath = os.path.abspath(filePath)
                        setattr(newClass, fnName, TestFileFunc(newClass, filePath, hiddenName))

            return newClass

    def __new__(cls, *args, **kwds):
        obj = object.__new__(cls, *args)
        for name in dir(obj):
            value = getattr(obj, name)
            if isinstance(value, TestFileFunc):
                setattr(obj, name, TestFileFunc(fixture=obj, filePath=value.testFilePath,
                    methodName=value.methodName))
        return obj

    def __init__(self, testName=None, writer=None, *args, **kwds):
        self.testName = testName
        self.writer = writer
        for name,value in kwds.iteritems():
            setattr(self, name, value)

    def setUp(self):
        pass

    def tearDown(self):
        pass

    def assert_(self, truth):
        if not truth:
            raise TestException("Assertion")

    def assertEqual(self, actual, expected):
        if not actual == expected:
            raise TestException("Equality Assertion", Actual=str(actual), Expected=str(expected))

    def assertEqualString(self, actual, expected):
        a = str(actual).strip()
        e = str(expected).strip()
        if not a == e:
            raise TestException("Equality Assertion", Actual=a, Expected=e)

    def assertNotEqual(self, actual, expected):
        if actual == expected:
            raise TestException("Not Equal Assertion", Actual=str(actual), Expected=str(expected))

    def assertIn(self, item, container):
        if not item in container:
            raise TestException("Contained Assertion", item=str(item), container=str(container))

    def assertNotIn(self, item, container):
        if item in container:
            raise TestException("Not Contained Assertion",
                item=str(item), container=str(container))

    def assertType(self, actual, expected):
        if not isinstance(actual, expected):
            raise TestException("Type Assertion", Actual=str(actual), Expected=str(expected))

    def assertException(self, expected):
        exceptionPrefix = "Exception:"
        if expected.startswith(exceptionPrefix):
            actual = "%s %s" % (exceptionPrefix, sys.exc_value)
            if not actual == expected:
                # logException(log)
                raise TestException("Exception Assertion", Actual=str(actual), Expected=str(expected))
        else:
            raise# sys.exc_value

    def logAttributes(self, object, *names):
      lines = []
      for name in names:
        value = getattr(object, name)
        line = "%s: %s" % (name, value)
        lines.append(line)

      result = "\n".join(lines)
      print result, "\n"

    def warn(self, message):
        print message

    def fail(self):
        raise TestException("Failure")

# **************************************************************************************************

class TestException(Exception):
    def __init__(self, title, **vars):
        self.title = title
        self.vars = vars

class TestAbortException(Exception):
    def __init__(self, message=""):
        self.message = message

class RunException(Exception):
    def __init__(self, exePath, code, errors, out, args=None, source=None):
        self.exePath = exePath
        self.code = code
        self.errors = errors
        self.out = out
        self.args = args
        self.source = source
