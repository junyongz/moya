#!/usr/bin/env python

import time, os.path, sys, argparse, json, traceback
from .build.Project import Project, projects
from .util import BuildError, importLocalModule
from .Message import Message, summary
from .JSONWriter import JSONWriter

# **************************************************************************************************

def parseArguments():
    parser = argparse.ArgumentParser(description='Make')
    parser.add_argument("action", default="build")

    # General options
    parser.add_argument('--showCommands', dest='showCommands', action='store_true',
                        default=False,
                        help='Show literal command line tasks as as they are performed')
    parser.add_argument('--formatOutput', dest='formatOutput', action='store_true',
                        default=True,
                        help='Parse command line output and reformat it.')

    # Build options
    parser.add_argument('--build', dest='buildPath', action='store',
                        help='Path to store build files.')
    parser.add_argument('--config', dest='configName', action='store',
                        default="MacOSX",
                        help='Name of configuration to build.')
    parser.add_argument('--optimize', dest='optimize', action='store',
                        help='Optimize setting (speed or size)')
    parser.add_argument('--enableProbes', dest='enableProbes', action='store_true',
                        default=False,
                        help='Enable probes in the build')
    parser.add_argument('--osxDeveloper', dest='osxDeveloper', action='store',
                        default='',
                        help='Path to the Xcode Developer directory.')
    parser.add_argument('--androidSDK', dest='androidSDK', action='store',
                        default='',
                        help='Path to the Android SDK.')
    parser.add_argument('--androidNDK', dest='androidNDK', action='store',
                        default='',
                        help='Path to the Android NDK.')
    parser.add_argument('--androidSource', dest='androidSource', action='store',
                        default='',
                        help='Path to the Android source repository.')

    # Install options
    parser.add_argument('--install', dest='installPath', action='store',
                        help='Path to install files to.')
    parser.add_argument('--link', dest='installLink', action='store_true',
                        default=False,
                        help='Install files as symbolic links.')

    # Test options
    parser.add_argument('--test', dest='test', action='store',
                        default=None,
                        help='Name of test to run.')
    parser.add_argument('--build-only', dest='buildOnly', action='store_true',
                        default=False,
                        help='Compile tests but do not run them.')

    # Metrics options
    parser.add_argument('--analyst', dest='analyst', action='store',
                        default=None,
                        help='Name of analyst to run.')
    parser.add_argument('--dump', dest='dump', action='store',
                        default=None,
                        help='Path of file to read probe data from.')

    parser.add_argument('--output', dest='outputPath', action='store',
                        default=None,
                        help='Path of directory to write generated pages to.')

    args = parser.parse_args()

    pairs = []
    for name,value in loadConf().iteritems():
        if isinstance(value, bool):
            if value:
                pairs +=["--%s" % name]
        else:
            pairs +=["--%s" % name, str(value)]

    # Parser requires action parameter, so restate the one we already have
    pairs.append(args.action)

    # Pass the json config dictionary through parser so the "dest" mappings are honored
    # This allows me to reuse argparser.
    args2 = parser.parse_known_args(pairs)
    for name,value in vars(args2[0]).iteritems():
        if value != parser.get_default(name):
            setattr(args, name, value)

    return args

# **************************************************************************************************

def make(configurations, testInfo, metricInfo):
    from signal import signal, SIGTERM
    signal(SIGTERM, lambda num, frame: sys.exit(SIGTERM))

    out = JSONOutput(sys.stdout)

    args = parseArguments()
    args.tests = testInfo
    args.metrics = metricInfo

    if args.action == "test":
        makeTests(out, args)
    elif args.action == "testCatalog":
        makeTestCatalog(out, args)
    elif args.action == "testCommands":
        makeTestCommands(out, args)
    elif args.action == "testPages":
        makeTestPages(out, args)
    elif args.action == "analyze":
        makeAnalysis(out, args)
    elif args.action == "metricsCatalog":
        makeMetricsCatalog(out, args)
    else:
        makeProjects(out, args.action, args, configurations)

def makeProjects(out, action, args, configurations):
    if not args.buildPath:
        sys.stderr.write("Required 'build' argument is missing.\n")
        sys.exit(1)

    for name,value in vars(args).iteritems():
        setattr(Project, name, value)

    basicConfig = configurations.get(Project.configName)
    if not basicConfig:
        raise Exception, "Configuration %s not found" % args.config

    for name,value in basicConfig.iteritems():
        setattr(Project, name, value)

    c1 = time.time()

    Project.initWithConfig()

    for project in projects:
        project.fn(project)
        project.normalize()

    result = 0

    for project in projects:
        result = project.make(action, out)
        if result != 0:
            break

    c2 = time.time()

    if out.commandCount:
        message = "Finished in %.2f seconds. " % (c2-c1)
        if out.errorCount:
            message += "%d errors. " % out.errorCount
        if out.warningCount:
            message += "%d warnings. " % out.warningCount

        out << summary(message)
    else:
        out << summary("Nothing to do.")

    sys.exit(result)

def makeTests(out, args):
    from .test import runTests

    modulesPath, moduleNames = args.tests
    errors = False
    for moduleName in moduleNames:
        testModule = importLocalModule(moduleName, modulesPath)
        if runTests(testModule, out, args.test, runAll=not args.test, buildOnly=args.buildOnly):
            errors = True

    sys.exit(1 if errors else 0)

def makeTestCommands(out, args):
    from .test import runTests

    modulesPath, moduleNames = args.tests
    errors = False
    for moduleName in moduleNames:
        testModule = importLocalModule(moduleName, modulesPath)
        if runTests(testModule, out, args.test, runAll=not args.test, buildOnly=args.buildOnly):
            errors = True

    sys.exit(1 if errors else 0)

def makeTestPages(out, args):
    from .test import renderTestPages

    modulesPath, moduleNames = args.tests
    errors = False
    for moduleName in moduleNames:
        testModule = importLocalModule(moduleName, modulesPath)
        if renderTestPages(testModule, args.outputPath):
            errors = True

    sys.exit(1 if errors else 0)

def makeTestCatalog(out, args):
    from .test import makeTestCatalog

    catalogs = []

    modulesPath, moduleNames = args.tests
    for moduleName in moduleNames:
        testModule = importLocalModule(moduleName, modulesPath)
        catalog = makeTestCatalog(testModule)
        catalogs += catalog

    print '{"tests": %s}' % json.dumps(catalogs)

def makeAnalysis(out, args):
    from .metric import Analyst

    if not args.analyst:
        raise Exception("Analyst name not specified")

    if not args.dump:
        raise Exception("Probes file not specified")

    modules = importModules(*args.metrics)
    analystClass = Analyst.scanForAnalyst(modules, args.analyst)
    if not analystClass:
        raise Exception("Analyst '%s' not found" % args.analyst)

    try:
        analyst = analystClass()
        analyst.analyze(args.dump)
    except Exception,exc:
        print "ERROR: %s" % exc
        raise

def makeMetricsCatalog(out, args):
    from .metric import Analyst

    modules = importModules(*args.metrics)
    catalog = Analyst.scanCatalog(modules)
    print json.dumps(catalog)

# **************************************************************************************************

def loadConf():
    confPath = os.environ.get("UPCONF")
    if confPath and os.path.isfile(confPath):
        f = file(confPath)
        data = f.read()
        f.close()
        return json.loads(data)
    else:
        return {}

def importModules(modulesPath, moduleNames):
    for moduleName in moduleNames:
        yield importLocalModule(moduleName, modulesPath)

# **************************************************************************************************

class JSONOutput(object):
    def __init__(self, stdout=sys.stdout):
        self.writer = JSONWriter(stdout)
        self.commandCount = 0
        self.errorCount = 0
        self.warningCount = 0

    def __lshift__(self, message):
        if isinstance(message, Message):
            message.affect(self)
            self.writer.write(message.getJSON())
        else:
            self.writer.write({"type": "text", "text": str(message)})

        return self

    def write(self, text):
        self << text

# **************************************************************************************************

class TextOutput(object):
    def __init__(self, stdout=sys.stdout):
        self.stdout = stdout
        self.commandCount = 0
        self.errorCount = 0
        self.warningCount = 0

    def __lshift__(self, message):
        self.stdout.write(str(message)+ '\n')
        return self

    def write(self, text):
        self.stdout.write(str(text) + '\n')
