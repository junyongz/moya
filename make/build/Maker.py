
import re, os.path, sys, shutil, json
from .Resource import res
from ..util import subread, sourceLink, BuildError
from ..Message import error, warning, command
# **************************************************************************************************

# commonLibs = ["stdc++"]
commonLibs = []

rePch = re.compile("(^pch\.h|\.pch)$")
reLexFiles = re.compile(r"\.(lex)$")
reBisonFiles = re.compile(r"\.(y)$")
reCFiles = re.compile(r"\.(cpp|c|cxx|m|mm)$")
reCPPFiles = re.compile(r"\.(cpp|cc)$")

reExtraLine = re.compile(r"\s\s\s(.*?)\n")

# **************************************************************************************************

class Maker(object):
    def __init__(self):
        self.nextMaker = None
        self.previousMaker = None

    def __rshift__(self, other):
        self.nextMaker = other
        other.previousMaker = self
        return other

    def build(self, project, out, sources):
        if self.previousMaker:
            sources = self.previousMaker.build(project, out, sources)

    def clean(self, project, out, sources):
        pass

    def install(self, project, out):
        pass

    def printResult(self, project, out, text):
        for line in text.splitlines():
            out << "    %s" % line

class MakerOneToOne(Maker):
    def needsUpdate(self, project, source, target):
        return False

    def getTarget(self, project, source):
        return ""

    def build(self, project, out, sources):
        if self.previousMaker:
            sources = self.previousMaker.build(project, out, sources)

        targets = []

        for source in sources:
            target = self.getTarget(project, source)
            if not target:
                continue

            targets.append(target)

            targetDir = os.path.dirname(target.path)
            if not os.path.exists(targetDir):
                os.makedirs(targetDir)

            if source.needsUpdate(target) or self.needsUpdate(project, source, target):
                status = self.buildTarget(project, out, source, target)
                if status != 0:
                    raise BuildError(status)
                else:
                    target.resetStats()

        return targets

    def clean(self, project, out, sources):
        if self.previousMaker:
            sources = self.previousMaker.clean(project, out, sources)

        targets = []

        for source in sources:
            target = self.getTarget(project, source)
            if not target:
                continue

            targets.append(target)

            out << command('remove', target.path)
            deleteTarget(target)

        return targets

class MakerManyToOne(Maker):
    def needsUpdate(self, project, target):
        return False

    def getTarget(self, project):
        return ""

    def build(self, project, out, sources):
        # Check projects we depend on and build those first
        for dep in project.getDependencies():
            dep.make("build", out)

        if self.previousMaker:
            sources = self.previousMaker.build(project, out, sources)

        targets = []

        target = self.getTarget(project)
        if not target:
            return

        targets.append(target)

        targetDir = os.path.dirname(target.path)
        if not os.path.exists(targetDir):
            os.makedirs(targetDir)

        needUpdate = self.needsUpdate(project, target)
        if not needUpdate:
            for source in sources:
                if source.needsUpdate(target):
                    needUpdate = True
                    break

        if needUpdate:
            out << command('link', target.path)
            result = self.buildTarget(project, out, sources, target)
            if result != 0:
                raise BuildError(result)
            else:
                target.resetStats()

        return targets

    def clean(self, project, out, sources):
        if self.previousMaker:
            sources = self.previousMaker.clean(project, out, sources)

        targets = []

        target = self.getTarget(project)
        if not target:
            return

        targets.append(target)

        out << command('remove', target.path)
        deleteTarget(target)

        return targets

class Preprocessor(Maker):
    def needsUpdate(self, project, source, target):
        return False

    def getTarget(self, project, source):
        return ""

    def build(self, project, out, sources):
        if self.previousMaker:
            sources = self.previousMaker.build(project, out, sources)

        targets = []

        for source in sources:
            target = self.getTarget(project, source)
            if not target:
                targets.append(source)
            else:
                targets.append(target)

                if source.needsUpdate(target) or self.needsUpdate(project, source, target):
                    status = self.buildTarget(project, out, source, target)
                    if status != 0:
                        raise BuildError(status)

        return targets

    def clean(self, project, out, sources):
        if self.previousMaker:
            sources = self.previousMaker.clean(project, out, sources)

        targets = []

        for source in sources:
            target = self.getTarget(project, source)
            if not target:
                targets.append(source)
            else:
                targets.append(target)

                out << command('remove', target.path)
                deleteTarget(target)

        return targets

# **************************************************************************************************

class Compile(MakerOneToOne):
    path = "gcc"

    patterns = re.compile(r"""
        (?P<Include>^In file included from (.*?):(\d*?),$)|
        (?P<Unknown>^g\+\+:\s(.+?):\s(.+?)$)|
        (?P<Problem>^([^\s]*?):(\d*?):(\d*?):\s(warning|error|note):\s(.*?)$)|
        (?P<Problem2>^([^\s]*?):(\d*?):\s(warning|error|note):\s(.*?)$)|
        (?P<Problem3>^([^\s]*?):\s(warning|error|note):\s(.*?)$)
    """, re.M | re.VERBOSE)

    def needsUpdate(self, project, source, target):
        if source.name in project.alwaysBuild:
            return True

        for header in source.dependencies:
            if header.needsUpdate(target):
                return True

        return False

    def getTarget(self, project, source):
        if rePch.search(source.name):
            targetName = "%s.gch" % source.path
            return res(targetName)

        elif reCFiles.search(source.name):
            targetName = re.sub(r"\.(cpp|c|cxx|m|mm)$", r".o", source.path)
            return res(project.getBuildPath(targetName))

    def buildTarget(self, project, out, source, target):
        out << command('compile', source.path)
        args = self.getBaseArgs(project, source, target)

        if project.pedantic:
            args += " -pedantic"

        # If for some reason a header makes it in here (e.g. pch.h), treat it like this
        name,ext = os.path.splitext(source.name)
        # if ext == ".h":
        #     args += " -x c++-header"
        if ext == ".pch":
            args += " -x objective-c-header"

        compilerPath = project.compilerPath if project.compilerPath else self.path
        line = "%s %s -c -o %s %s" % (compilerPath, args, target, source)
        #c1 = time.time()
        result = executeCommand(line, project, out, self)
        #c2 = time.time()
        #out << "built %s in %f" % (source, c2-c1)
        return result

    def getBaseArgs(self, project, source, target):
        # The "no-long-double" option seems to be a mac-only thing
        if sys.platform == "darwin":
            # Causes error on Snow Leopard
            #args = "-Wno-long-double "
            args = ""
        else:
            args = ""

        if not reCPPFiles.search(source.name):
            args += ' -std=gnu99'
        else:
            args += ' -std=c++11'
            
        if project.compilerFlags:
            args += project.compilerFlags + " "

        args += self.getOptimizeFlag(project)

        # XXXjoe Building on some unix machines without this flag causes a link error on some libs
        #args += " -fPIC"

        if project.enableProbes:
            args += ' -DUP_ENABLE_PROBES'

        if project.gitVersion:
            args += ' -DGIT_VERSION=\"%s\"' % project.gitVersion

        for name,value in project.defines.iteritems():
            if value:
                args += ' -D%s=%s' % (name, value)

        args += " -I%s" % project.path
        args += " -I%s" % project.buildPath
        for include in project.getIncludes():
            args += " -I%s" % include
        for dep in project.getDependencies():
            if dep != project:
                args += " -I%s" % dep.buildPath

        return args

    def getOptimizeFlag(self, project):
        vals = {"size": "-Os", "speed": "-O3", "full": "-O3"}
        if project.optimize in vals:
            return vals[project.optimize]
        else:
            return "-O0 -gdwarf-2 -DDEBUG -D_DEBUG"

    def printResult(self, project, out, text):
        m = self.patterns.search(text)
        if not m:
            if text:
                out << text

        else:
            # Find the appropriate handler to pretty print the matched text
            while m:
                groupdict = m.groupdict()
                groups = m.groups()
                offset = m.end()

                for name in groupdict:
                    if groupdict[name]:
                        extras = ""
                        m2 = reExtraLine.match(text, offset+1)
                        while m2:
                            extras += m2.groups()[0]
                            offset = m2.end()
                            m2 = reExtraLine.match(text, offset)

                        handler = globals()["print%s" % name]
                        if handler:
                            index = self.patterns.groupindex[name]
                            handler(groups[index:], extras, project, out)

                m = self.patterns.search(text, offset)

class Link(MakerManyToOne):
    path = "gcc"

    def needsUpdate(self, project, target):
        for dep in project.getDependencies():
            if dep.build:
                depTarget = dep.build.getTarget(dep)
                if depTarget and depTarget.needsUpdate(target):
                    return True

    def buildTarget(self, project, out, sources, target):
        if target.name in project.neverLink:
            return 0

        # Object files must appear before libraries on the link line (see http://tinyurl.com/s97do)
        args = self.getSourceArgs(project, sources, target)
        args += " " + self.getBaseArgs(project, sources, target)

        linkerPath = project.linkerPath if project.linkerPath else self.path
        line = "%s %s" % (linkerPath, args)
        return executeCommand(line, project, out, self)

    def install(self, project, out):
        buildTarget = self.getTarget(project)
        buildInstallPath = self.getInstallPath(project, buildTarget)
        if buildInstallPath:
            installDir = os.path.dirname(buildInstallPath)
            if not os.path.exists(installDir):
                os.makedirs(installDir)

            out << command('install to', buildInstallPath)
            if project.installLink:
                if not os.path.exists(str(buildInstallPath)):
                    os.symlink(str(buildTarget), str(buildInstallPath))
            else:
                shutil.copy2(str(buildTarget), str(buildInstallPath))

        if project.exports:
            for includePath,shorthand in project.exports.iteritems():
                includePath = os.path.join(project.path, includePath)

                installIncludePath = os.path.join(project.installPath, "include")
                if not os.path.isdir(installIncludePath):
                    os.makedirs(installIncludePath)

                includeInstallPath = os.path.join(installIncludePath, shorthand)

                out << command('install exports to', includeInstallPath)
                if project.installLink:
                    if not os.path.exists(includeInstallPath):
                        os.symlink(includePath, includeInstallPath)
                else:
                    if os.path.isdir(includeInstallPath):
                        shutil.rmtree(includeInstallPath)
                    shutil.copytree(includePath, includeInstallPath)

    def getSourceArgs(self, project, sources, target):
        def isPrecompiledHeader(name):
            return name.endswith(".gch")

        return " ".join([source.path for source in sources if not isPrecompiledHeader(source.name)])

    def getBaseArgs(self, project, sources, target):
        args = "-o %s" % target

        # Add compiler-specific link flags
        if project.linkerFlags:
            args += " " + project.linkerFlags

        # XXXblake On Linux, link order matters, so our stripping of duplicates in getDependencies()
        # busts the link. Allowing duplicates while still preventing recursion is tricky, however...
        # for example, right now, the Suade serialize and memory projects depend on each other. For
        # now, we use the "grouping" option to force the linker to keep checking the archives until
        # all references are resolved. This has a significant performance cost, as the docs note.
        if not sys.platform == "darwin":
            args += " -Xlinker --start-group"

        libs = project.getLibs()

        # XXXjoe On Mac, link order matters also, but we don't have the luxury of --start-group,
        # so the only hack I can think of is to list libraries twice
        if sys.platform == "darwin":
            libs *= 2

        for libName in libs:
            args += " %s" % libName

        if not sys.platform == "darwin":
            args += " -Xlinker --end-group"

        for libName in commonLibs:
            args += " -l%s" % libName

        for name in project.getFrameworks():
            args += " -framework %s" % name

        # Ensure that we use the NPTL version of libc on Unix (see http://tinyurl.com/rv49a)
        #if not sys.platform == "win32" and not sys.platform == "darwin":
        #    args += " -L/usr/lib/nptl"

        return args

class LinkExecutable(Link):
    def getTarget(self, project):
        exePath = os.path.join(project.path, project.name)
        return res(project.getBuildPath(exePath))

    def getInstallPath(self, project, targetPath):
        targetName = os.path.basename(str(targetPath))
        installPath = os.path.join(project.installPath, "bin", targetName)
        return installPath

class LinkStaticLib(Link):
    path = "libtool"

    def needsUpdate(self, project, target):
        return False

    def getTarget(self, project):
        libPath = os.path.join(project.path, "lib%s.a" % project.name)
        return res(project.getBuildPath(libPath))

    def getBaseArgs(self, project, sources, target):
        if not sys.platform == "darwin":
            return "--mode=link gcc -static -o %s" % target
        else:
            return "-static -o %s" % target

    def getInstallPath(self, project, targetPath):
        targetName = os.path.basename(str(targetPath))
        installPath = os.path.join(project.installPath, "lib", targetName)
        return installPath

    # We need to override Link's build() method so we can format the arg string in the proper order,
    # i.e. we need the base args to come before the source args here
    def buildTarget(self, project, out, sources, target):
        if target.name in project.neverLink:
            return 0

        linkerPath = project.linkerPath if project.linkerPath else 'ar'
        line1 = "%s cru %s" % (linkerPath, target.path)
        line1 += " " + self.getSourceArgs(project, sources, target)
        result = executeCommand(line1, project, out, self)
        if result != 0:
            return result

        ranlibPath = project.ranlibPath if project.ranlibPath else 'ranlib'
        line2 = "%s %s" % (ranlibPath, target.path)
        result = executeCommand(line2, project, out, self)
        return result

        # #xxxJoe This is the old way using libtool
        #args = self.getBaseArgs(project, sources, target)
        #args += " " + self.getSourceArgs(project, sources, target)

        #line = "%s %s" % (self.path, args)
        #return executeCommand(line, project, out, self)

class LinkDynamicLib(Link):
    def getTarget(self, project):
        return res(project.getBuildPath("%s.so" % os.path.join(project.path, project.name)))

    def getBaseArgs(self, project, sources, target):
        args = Link.getBaseArgs(self, project, sources, target)

        if sys.platform == "darwin":
            args += " -bundle -undefined dynamic_lookup"
        else:
            args += " -shared"

        return args

    def getInstallPath(self, project, targetPath):
        targetName = os.path.basename(str(targetPath))
        installPath = os.path.join(project.installPath, "lib", targetName)
        return installPath

class LinkPythonModule(LinkDynamicLib):
    # XXXjoe There could someday be Python-specific goodies here
    pass

class Probes(Preprocessor):
    def getTarget(self, project, source):
        if source.path.endswith('/UpProbes.json'):
            outputPath = source.path.replace(".json", ".c")
            return res(outputPath)

    def buildTarget(self, project, out, source, target):
        out << command('make probes', source.path)
        from .ProbeMaker import probeMake
        try:
            probeMake(source.path)
            return 0
        except Exception,exc:
            out << error('Unable to parse json.', source.path)
            out << error(str(exc))
            return -1

class FlexParse(Preprocessor):
    path = "/usr/bin/env flex"

    def getTarget(self, project, source):
        if reLexFiles.search(source.name):
            outputPath = re.sub(reLexFiles, r".yy.c", source.path)
            return res(outputPath)

    def buildTarget(self, project, out, source, target):
        out << command('flex', source.path)

        headerPath = re.sub(reLexFiles, r".yy.h", source.path)
        line = "%s --header-file=%s -o%s %s" % (self.path, headerPath, target, source)
        return executeCommand(line, project, out, self)

class BisonParse(Preprocessor):
    path = "/usr/bin/env bison"

    def getTarget(self, project, source):
        if reBisonFiles.search(source.name):
            outputPath = re.sub(reBisonFiles, r".tab.c", source.path)
            return res(outputPath)

    def buildTarget(self, project, out, source, target):
        out << command('bison', source.path)

        line = "%s -r solved -v -d -o %s %s" % (self.path, target, source)
        return executeCommand(line, project, out, self)

class ConfigureMake(MakerManyToOne):
    def getTarget(self, project):
        output = getattr(project, "output", None)
        if output:
            return res(os.path.abspath(output))

    def build(self, project, out, source, target):
        line = "make clean"
        result = executeCommand(project, self, out, line)

        if project.configure:
            line = project.configure
        else:
            line = "./configure"
        result = executeCommand(project, self, out, line)

        line = "make"
        result = executeCommand(project, self, out, line)

        line = "cp %s %s" % (self.getTarget(project), target)
        result = executeCommand(project, self, out, line)
        return result

class StaticFiles(MakerManyToOne):
    def install(self, project, out):
        if project.install:
            for source,dest in project.install:
                sourcePath = os.path.abspath(source)
                destPath = os.path.join(project.installPath, dest)

                out << command('install files to', destPath)
                if project.installLink:
                    if not os.path.exists(destPath):
                        os.symlink(sourcePath, destPath)
                else:
                    if os.path.isdir(destPath):
                        shutil.rmtree(destPath)
                    shutil.copytree(sourcePath, destPath)

class GitVersion(Preprocessor):
    def getTarget(self, project, source):
        # This file will have changed after each commit
        if source.name == "master":
            versionPath = os.path.join(project.path, "..", "..", "..", "..", ".upversion")
            return res(os.path.abspath(versionPath))

    def buildTarget(self, project, out, sources, target):
        output,error = subread("git describe --always --tags --abbrev=1000")
        if error:
            return 0

        parts = output.strip().split('-')
        if len(parts) == 1:
            tag = parts[0]
            commit = ''
        elif len(parts) >= 3:
            tag = "-".join(parts[0:-2])
            commit = parts[-1]
        else:
            tag = '(no tag)'
            commit = ''

        if tag.startswith('v'):
            tag = tag[1:]

        if commit:
            gitVersion = "%s (%s)" % (tag, commit)
        else:
            gitVersion = tag

        from ..util import projects
        for globalProject in projects:
            globalProject.gitVersion = gitVersion

        f = open(str(target), "w")
        f.write(gitVersion)
        f.close()
        return 0

# **************************************************************************************************

def printInclude(m, extras, project, out):
    fileName = os.path.basename(m[0])
    out << "File included from: %s" % sourceLink(m[0], int(m[1]))
    out << "In %s (line %s)" % (fileName, m[1])

def printFrom(m, extras, project, out):
    fileName = os.path.basename(m[0])
    out << "From %s (line %s)" % (fileName, m)

def printProblem(m, extras, project, out):
    fileName = os.path.basename(m[0])
    message = m[4] + extras

    if m[3] == "error":
        out << error(message, m[0], int(m[1]), int(m[2]))
    else:
        out << warning(message, m[0], int(m[1]), int(m[2]))

def printProblem2(m, extras, project, out):
    fileName = os.path.basename(m[0])
    message = m[3] + extras

    if m[2] == "error":
        out << error(message, m[0], int(m[1]))
    else:
        out << error(warning, m[0], int(m[1]))

def printProblem3(m, extras, project, out):
    fileName = os.path.basename(m[0])
    message = m[2] + extras
    
    if m[1] == "error":
        out << error(message, m[0])
    else:
        out << warning(message, m[0], 0, 0)

def printUnknown(m, extras, project, out):
    out << "%s %s" % (m[1], m[0])

# **************************************************************************************************

def executeCommand(command, project, out, maker):
    if project.showCommands:
        out << command

    output, error = subread(command)

    if output:
        if project.formatOutput:
            maker.printResult(project, out, output)
        else:
            out << output

    return error

def deleteTarget(target):
    if target.isdir:
        shutil.rmtree(target.path)
    elif os.path.isfile(target.path):
        os.remove(target.path)
