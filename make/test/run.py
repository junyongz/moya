
import types, sys, os.path, re, imp, time
from .TestRunner import TestRunner
from .TestFixture import TestFixture, RunException, TestAbortException
from .utils import *

# **************************************************************************************************

def runTests(module, writer, testName=None, **options):
    if testName:
        names = testName.split("/")
        if len(names) == 1:
            fixtureName,functionName = names[0],None
        elif len(names) == 2:
            fixtureName,functionName = names
        else:
            return
    else:
        fixtureName = None
        functionName = None

    failureCount = 0
    testCount = 0
    skipCount = 0
    nyiCount = 0

    debugPath = None
    abortMessage = None
    criticalError = None
    buildOnly = options.get('buildOnly')

    # When running all tests, don't let focused tests exclude the others in their file
    options['disregardFocus'] = not testName
    options['ignoreAdHoc'] = not testName

    # Mute all stdout writes so that we only output the desired exe path, intended
    # for external tools and not so much human eyes.  This is kind of sloppy - a
    # generalized method for machine-readable requests would be preferable in the long term.
    if buildOnly:
        stdout = sys.stdout
        sys.stdout = PipeEater()

    c1 = time.time()
    runners = getTestRunners(module, writer, fixtureName)
    for runner in runners:
        try:
            failures, testsRun, testsNYI, testsSkipped = runner.run(functionName, options)
            failureCount += failures
            testCount += testsRun
            nyiCount += testsNYI
            skipCount += testsSkipped
        except RunException,exc:
            # if hasattr(exc, "fileName"):
            #     print sourceLink(exc.fileName, exc.lineNo)
            debugPath = exc.exePath
            break
        except TestAbortException,exc:
            abortMessage = exc.message
            break
        except Exception,exc:
            # if hasattr(exc, "fileName"):
            #     print sourceLink(exc.fileName, exc.lineNo)
            criticalError = exc
            break

    c2 = time.time()

    metas = []
    if skipCount:
        metas.append("%d skipped" % skipCount)
    if nyiCount:
        metas.append("%d NYI" % nyiCount)
    metaMessage = " (%s)" % ", ".join(metas) if metas else ""
    if abortMessage:
        # Restore stdout so we can write the final message
        if buildOnly:
            sys.stdout = stdout
        # print abortMessage
    elif debugPath:
        # print "\nProgram crashed!"

        # Editors can read this directive to get the path of the exe that crashed
        # print "[[DEBUG|%s]]" % debugPath
        return 1
    elif criticalError:
        # print ""
        logException(writer)
        # print "\nException!"
        return 1
    elif failureCount:
        # print "\n%d test%s out of %d failed%s. (%.2f seconds)" \
        #     % (failureCount, "s" if failureCount > 1 else "", testCount, metaMessage, c2-c1)
        return failureCount
    else:
        pass
        # if testCount == 1:
        #     print "\nTest passed%s. (%.2f seconds)" % (metaMessage, c2-c1)
        # else:
        #     print "\nAll %d tests passed%s. (%.2f seconds)" % (testCount, metaMessage, c2-c1)

    return 0

def makeTestCatalog(module):
    catalog = []
    catalog.append({'name': 'All Tests', 'path': ''})
    for runner in getTestRunners(module):
        testNames = list(runner.getTestNames())
        if testNames:
            catalog.append({'name': runner.fixtureName, 'path': runner.fixtureName})
            for testName, testType, testStatus in testNames:
                prettyTestName = testName[4:]
                prettyTestName = prettyTestName[0].lower() + prettyTestName[1:]
                catalog.append({
                    'name': "    %s" % prettyTestName,
                    'path': '%s/%s' % (runner.fixtureName, testName)
                })

    return catalog

def getTestRunners(module, writer=None, fixtureName=None):
    def sortOrder(a, b):
        return 1 if a.order > b.order else (-1 if a.order < b.order else 0)

    runners = list(walkTestRunners(module, writer, fixtureName))
    runners.sort(sortOrder)
    return runners

def walkTestRunners(module, writer, fixtureName=None):
    """ Yields a TestRunner for each test case found within a single module. """

    for attrName in dir(module):
        attrValue = getattr(module, attrName)

        if issubclass(type(attrValue), types.TypeType) \
            and issubclass(attrValue, TestFixture) \
            and attrValue.__module__ == module.__name__:

            if not fixtureName or attrName == fixtureName:
                runner = TestRunner(attrName, attrValue, writer)
                yield runner
