
from make.test import *
import os, os.path, subprocess, re

# **************************************************************************************************
# Constants

outputPath = testOutputPath(__file__)
testLibPath = os.path.abspath(os.path.join(outputPath, "lib"))
sharedLibPath = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "lib"))

codePath = os.path.abspath(os.path.join(__file__, '..', '..', '..', 'lib', 'moya.js'))
moyaExePath = "node %s" % codePath

# **************************************************************************************************

class MoyaTestFixture(TestFixture):
    def setUp(self):
        pass

    def tearDown(self):
        pass

    def launch(self, command, cwd=None, env=None, args=None, source=None):
        if env:
            env2 = dict(os.environ)
            env2.update(env)
            env = env2

        p = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             cwd=cwd, env=env)
        error = p.wait()

        errors = p.stderr.read().strip()
        out = p.stdout.read().strip()

        # Remove stack trace entries from inside the standard library, since
        # line numbers and files there will be moving around often
        reLibTrace = re.compile("^\.\/(moya|json|regex)\.moya, line.*?$\n", re.M)
        errors = reLibTrace.sub("", errors)

        if out and errors:
            out = "%s\n---\n%s" % (out, errors)
        elif errors:
            out = errors

        if error == -11:
            raise RunException(command, error, errors, out, args, source)
        else:
            return out

    def runTest(self, args, source, isExpr=False, eventLoop=True, **kwds):
        if not eventLoop:
            extraArgs = ["--disableEventLoop"]
        else:
            extraArgs = []
            
        if isExpr:
            source = '{ ' + source + '}'
        elif source[0] == '-':
            source = ' ' + source

        escapedSource = source.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        exePath = "%s %s %s -c $'%s'" % (moyaExePath, " ".join(args), " ".join(extraArgs), escapedSource)
        
        if self.buildOnly:
            raise TestAbortException(exePath)

        moyaPath = ":".join([os.environ['MOYAPATH'], sharedLibPath, testLibPath])
        nodePath = "/usr/local/lib/node_modules"
        sysPath = os.environ['PATH']
        
        env = {"MOYAPATH": moyaPath, "NODE_PATH": nodePath, "PATH": sysPath}
        
        metaArgs = args + extraArgs + ["-c", source]

        self.metadata = {"command": moyaExePath, "args": metaArgs, "env": env}
        return self.launch(exePath, env=env, args=args, source=source).strip()

# **************************************************************************************************

class ParseTests(MoyaTestFixture):
    order = 1

    def testParse(self, source, expected, mode="ast", **kwds):
        return self.runTest(["--inspect", mode] if mode else [], source, False, **kwds)

class ExparseTests(MoyaTestFixture):
    order = 1

    def testExparse(self, source, expected, mode="ast", **kwds):
        return self.runTest(["--inspect", mode] if mode else [], source, True, **kwds)

class RunTests(MoyaTestFixture):
    order = 1

    def testRun(self, source, expected, mode="", **kwds):
        args = ["--debug", "--optimize"]
        if mode:
            args += ["--inspect", mode]
            
        exePath = "/Volumes/Moya/appmoya"
        exePath = os.environ['MOYA_EXE_PATH']
        if exePath:
            args += ["-o", exePath]
        return self.runTest(args, source, False, **kwds)

# **************************************************************************************************

# class CompileTests(MoyaTestFixture):
#     order = 1
#
#     def testCompile(self, source, expected, **kwds):
#         return self.runTest(["--inspect", "compile"], source, **kwds)
#
# # **************************************************************************************************
#
# class RuntimeTests(ParseTests):
#     order = 2
#
#     def testRuntime(self, source, expected, **kwds):
#         return self.runTest([], source, **kwds)
