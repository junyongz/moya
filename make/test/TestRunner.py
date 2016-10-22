
from .TestFileFunc import TestFileFunc
from .utils import FunctionType, sourceLink
from ..Message import testBegin, testComplete, testFailure, testPassed, testMetadata, testNYI

# **************************************************************************************************

class TestRunner:
    def __init__(self, fixtureName, fixtureClass, writer=None):
        self.fixtureName = fixtureName
        self.fixtureClass = fixtureClass
        self.writer = writer
        self.order = getattr(fixtureClass, "order", None)

    def getTestNames(self):
        for attrName in dir(self.fixtureClass):
            if attrName.find("test") != 0 and attrName.find("inspect") != 0:
                continue

            attrValue = getattr(self.fixtureClass, attrName)
            if callable(attrValue):
                if hasattr(attrValue, "__status__"):
                    testStatus = attrValue.__status__
                    if testStatus == "ignore":
                        continue
                else:
                    testStatus = ""

                if isinstance(attrValue, TestFileFunc) and attrValue.fixture != self.fixtureClass:
                    continue
                yield attrName, FunctionType, testStatus

    def run(self, targetName=None, options=None):
        failureCount = 0
        self.testCount = 0
        self.nyiCount = 0
        self.skipCount = 0

        for testName, testType, testStatus in self.getTestNames():
            if not testStatus == "skip" and (not targetName or testName == targetName):
                self.fixture = self.fixtureClass(testName, self.writer, **options)

                testCase = getattr(self.fixture, testName)

                self.writer << testBegin("Run", testName, testCase.testFilePath)

                failures = []

                try:
                    failures = self.runTestCase(testCase)
                    failureCount += len(failures)

                except Exception, exc:
                    self.writer << testComplete()
                    raise

                self.writer << testComplete()

        return failureCount, self.testCount, self.nyiCount, self.skipCount

    def runTestCase(self, testCase):
        failures = []

        if hasattr(testCase, "testContainer"):
            for childTest, fileName, lineNo in testCase():
                failure = self.callTestCase(childTest, failures, fileName, lineNo)
                if failure:
                    failures.append(failure)

        else:
            failure = self.callTestCase(testCase)
            if failure:
                failures.append(failure)

        return failures

    def callTestCase(self, testCase, failures, fileName=None, lineNo=None):
        from .TestFixture import TestException, RunException, TestAbortException

        if getattr(testCase, "nyi", None):
            self.nyiCount += 1
            self.writer << testNYI()
        elif getattr(testCase, "skip", None):
            self.skipCount += 1
            self.writer << testResult("skip")
        else:
            self.testCount += 1

            self.fixture.setUp()

            try:
                testCase()
                self.writer << testPassed()

            except TestAbortException, exc:
                raise

            except TestException, exc:
                fixupException(exc, fileName, lineNo)
                self.writer << testFailure("failed", fileName, lineNo,
                                           exc.vars['Expected'], exc.vars['Actual'])
                return exc

            except RunException, exc:
                fixupException(exc, fileName, lineNo)
                self.writer << testFailure("exception", fileName, lineNo, None,
                                           exc.errors, exc.args, exc.source)
                raise

            except Exception,exc:
                fixupException(exc, fileName, lineNo)
                self.writer << testFailure("exception", fileName, lineNo)
                raise
            finally:
                if self.fixture.metadata:
                    self.writer << testMetadata(self.fixture.metadata)
                self.fixture.tearDown()

def fixupException(exc, fileName, lineNo):
    if not fileName:
        fileName, lineNo = getTracebackSource()

    exc.fileName = fileName
    exc.lineNo = lineNo

def sideBySide(left, right, leftHeader=None, rightHeader=None):
    leftLines = left.split("\n")
    rightLines = right.split("\n")
    ll = len(leftLines)
    rl = len(rightLines)

    maxWidthL = len(leftHeader) if leftHeader else 0
    for line in leftLines:
        maxWidthL = max(len(line), maxWidthL)

    maxWidthR = len(rightHeader) if rightHeader else 0
    for line in rightLines:
        maxWidthR = max(len(line), maxWidthR)

    format = "".join(["| %-", str(maxWidthL), "s | %-", str(maxWidthR), "s |"])
    lines = []

    if leftHeader and rightHeader:
        lines.append(format % (leftHeader, rightHeader))
        lines.append("=" * (maxWidthL + maxWidthR + 7))

    for i in xrange(0, max(ll, rl)):
        leftLine = leftLines[i] if i < ll else ""
        rightLine = rightLines[i] if i < rl else ""

        lines.append(format % (leftLine, rightLine))

    return "\n".join(lines)
