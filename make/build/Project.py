
import sys, os.path, traceback, stat, re
from ..util import rootProjectPath, projects, projectPaths, exports
from ..util import sourceLink, getSystemAbbreviation, BuildError
from ..Message import opener, closer
from .Resource import res

# **************************************************************************************************

rePch = re.compile("(^pch\.h|\.pch)$")

# **************************************************************************************************

class Project(object):
    sources = None

    made = False
    external = False

    path = None
    build = None
    version = None
    description = None
    url = None
    author = None
    authorEmail = None

    buildPre = None
    build = None
    buildPost = None

    install = None

    enableProbes = False
    showCommands = False
    formatOutput = True
    installLink = False
    
    nodePath = None
    moyaLib = None
    moyaBin = None
    
    platform = None
    device = None
    sdk = None
    arch = None

    buildPath = None
    installPath = None

    compilerPath = None
    linkerPath = None
    ranlibPath = None

    optimize = "debug"
    warningLevel = 4
    pedantic = False
    linkerFlags = ""
    compilerFlags = ""
    gitVersion = ""

    defines = {}

    _dependencies = None

    def __init__(self, name, fn):
        self.name = name
        self.fn = fn

        self.deps = {}
        self.defines = dict(self.defines)

        self.exclude = []
        self.debugSources = []

        self.alwaysBuild = [] # Source files to rebuild every time
        self.neverLink = [] # Target files to never link

        self.includes = []
        self.libs = []
        self.frameworks = []
        self.ignoreFrameworks = []
        self.ignoreLibs = []

        self.frameworkPaths = []
        self.exports = {}

    def __repr__(self):
        return '<project %s>' % self.path

    @classmethod
    def initWithConfig(self):
        if not sys.platform == "darwin" and not sys.platform == "win32":
            self.defines["_REENTRANT"] = True

        if sys.platform == "darwin":
            self.defines["DARWIN"] = True

        if self.platform == 'ios':
            developerPath = self.osxDeveloper
            if not developerPath:
                raise Exception, "OSX_DEVELOPER environment variable not specified."

            if "Simulator" in self.sdk:
                self.platformPath = "%s/Platforms/iPhoneSimulator.platform" % (developerPath)
            else:
                self.platformPath = "%s/Platforms/iPhoneOS.platform" % (developerPath)

            self.sdkPath = '%s/Developer/SDKs/%s.sdk' % (self.platformPath, self.sdk)
            self.compilerPath = "%s/Developer/usr/bin/gcc-4.2" % self.platformPath
            self.linkerPath = "ar"
            self.ranlibPath = "ranlib"

            self.compilerFlags = ' '.join([
                ('-arch %s' % self.arch) if self.arch else '',
                '-isysroot %s' % self.sdkPath,
                '-fobjc-abi-version=2',
                '-fobjc-legacy-dispatch',
                '-pipe',
                '-std=c99',
                '-fmessage-length=0',
                '-fpascal-strings',
                # '-fasm-blocks',
                '-Wno-trigraphs',
                '-Wreturn-type',
                '-Wunused-variable',
            ])

            self.defines["__IPHONE_OS_VERSION_MIN_REQUIRED"] = 3020
            self.defines["IOS"] = 1

        elif self.platform == 'mac':
            self.compilerFlags = ' '.join([
                ('-arch %s' % self.arch) if self.arch else '',
                '-fobjc-abi-version=2',
                # '-fobjc-legacy-dispatch',
                '-pipe',
                '-fmessage-length=0',
                '-fpascal-strings',
                '-fasm-blocks',
                '-Wno-trigraphs',
                '-Wreturn-type',
                '-Wunused-variable',
                '-DSK_RELEASE',
                '-DMAC',
            ])

        elif self.platform == 'android':
            ndkPath = self.androidNDK
            if not ndkPath:
                raise Exception, "ANDROID_NDK environment variable not specified."
            sourcePath = self.androidSource
            if not sourcePath:
                raise Exception, "ANDROID_SOURCE environment variable not specified."

            self.compilerPath = "%s/build/prebuilt/darwin-x86/arm-eabi-4.4.0/bin/arm-eabi-gcc" % ndkPath
            self.linkerPath = "%s/build/prebuilt/darwin-x86/arm-eabi-4.4.0/bin/arm-eabi-ar" % ndkPath
            self.ranlibPath = "%s/build/prebuilt/darwin-x86/arm-eabi-4.4.0/bin/arm-eabi-ranlib" % ndkPath

            self.includePaths = [
                '-I%s/frameworks/base/core/jni/android/graphics' % sourcePath,
                '-I%s/frameworks/base/include' % sourcePath,
                '-I%s/system/core/include' % sourcePath,
                '-I%s/external/skia/include/core' % sourcePath
            ]

            self.libPaths = [
                '-L%s/out/target/product/generic/system/lib' % sourcePath
            ]

            self.compilerFlags = ' '.join([
                ('-march=%s' % self.arch) if self.arch else '',
                '-I%s/build/platforms/%s/arch-arm/usr/include' % (ndkPath, self.sdk),
                '-mtune=xscale',
                # '-msoft-float',
                '-mfloat-abi=softfp',
                '-mfpu=neon',
                '-mthumb-interwork',
                '-mthumb',
                '-fpic',
                '-fno-rtti',
                '-std=gnu99',
                '-ffunction-sections',
                '-funwind-tables',
                '-fstack-protector',
                '-fno-short-enums',
                '-fomit-frame-pointer',
                '-fno-strict-aliasing',
                '-finline-limit=64',
                '-fno-exceptions',
                '-D__ARM_ARCH_5__',
                '-D__ARM_ARCH_5T__',
                '-D__ARM_ARCH_5E__',
                '-D__ARM_ARCH_5TE__',
                '-DANDROID',
                '-DSK_RELEASE',
            ] + self.includePaths)

            self.linkerFlags = ' '.join([
                '-nostdlib',
                '-lc',
                '-lm',
                '-lstdc++',
                '-llog',
                '-landroid_runtime',
                '-lskia',
                '-L%s/build/platforms/%s/arch-arm/usr/lib' \
                    % (ndkPath, self.sdk),
                '-Wl,--no-whole-archive',
                '-Wl,-rpath=%s/build/platforms/%s/arch-arm/usr/lib' \
                    % (ndkPath, self.sdk),
                '-Wl,--no-undefined',
                '-Wl,-rpath-link=%s/build/platforms/%s/arch-arm/usr/lib' \
                    % (ndkPath, self.sdk),
                '%s/build/prebuilt/darwin-x86/arm-eabi-4.4.0/lib/gcc/arm-eabi/4.2.1/interwork/libgcc.a' \
                    % ndkPath,
             ] + self.libPaths)

        if self.buildPath:
            buildPath = os.path.abspath(self.buildPath)
            self.buildRootPath = os.path.join(buildPath, self.getPlatformName(), self.getBuildName())

    def normalize(self):
        if self.path:
            self.path = os.path.abspath(self.path)
            projectPaths[self.path] = self

        self.buildPath = self.getBuildPath()

        for includePath,shorthand in self.exports.iteritems():
            includePath = os.path.join(self.path, includePath)
            if not self.external:
                symlinkPath = os.path.join(self.path, shorthand)
            else:
                symlinkPath = shorthand

            symlinkPath = self.getBuildPath(symlinkPath)
            symlinkDir = os.path.dirname(symlinkPath)
            if not os.path.exists(symlinkDir):
                os.makedirs(symlinkDir)
            if not os.path.islink(symlinkPath):
                os.symlink(includePath, symlinkPath)

            exports[shorthand] = self

    @classmethod
    def getPlatformName(self):
        names = []
        if self.platform:
            names.append(self.platform)
        if self.sdk:
            names.append(self.sdk)
        if names:
            return "_".join(names)
        else:
            return getSystemAbbreviation()

    @classmethod
    def getBuildName(self):
        if not self.optimize or self.optimize == "debug":
            return "debug"
        else:
            return "release"

    def getBuildPath(self, targetPath=None):
        if self.external:
            rootPath = os.path.join(self.buildRootPath, "external", self.name)
            if targetPath:
                return os.path.join(rootPath, targetPath)
            else:
                return rootPath
        else:
            if not targetPath:
                targetPath = self.path

            if targetPath.startswith(rootProjectPath):
                relPath = targetPath[len(rootProjectPath)+1:] # +1 for the trailing slash
                if relPath:
                    return os.path.join(self.buildRootPath, relPath)
                else:
                    return self.buildPath
            else:
                return targetPath

    def getSources(self):
        if self.sources:
            return self.sources

        sources = self._readSources()
        self.sources = self._sortSources(sources)
        return self.sources

    def getDependencies(self):
        if self._dependencies is not None:
            return self._dependencies

        # Store this here to prevent infinite loop if there is a circular reference
        self._dependencies = []

        deps = {}

        for source in self.getSources():
            for header in source.dependencies:
                if header.project and not deps.get(header.project.name):
                    deps[header.project.name] = header.project

        self._dependencies = deps.values()
        return self._dependencies

    def getExport(self, includePath):
        includeDir = os.path.dirname(includePath)
        includeName = os.path.basename(includePath)
        for includePath,shorthand in self.exports.iteritems():
            if includeDir == shorthand:
                absoluteDir = os.path.join(self.path, includePath, includeName)
                return res(absoluteDir, project=self)

    def getIncludes(self):
        includes = []
        includes.extend(self.includes)

        for dep in self.getDependencies():
            if dep != self:
                includes.extend([name for name in dep.getIncludes() if name not in includes])

        return includes

    def getLibs(self):
        libs = []
        libs.extend(self.libs)

        for dep in self.getDependencies():
            if dep != self and dep not in self.ignoreLibs:
                libs.extend([name for name in dep.getLibs() if name not in libs])

                if dep.build:
                    target = dep.build.getTarget(dep)
                    if target and target not in libs:
                        libs.append(target)

        return libs

    def getFrameworks(self):
        names = []
        names.extend(self.frameworks)

        for dep in self.getDependencies():
            for name in dep.frameworks:
                if name not in names and name not in self.ignoreFrameworks:
                    names.append(name)

        return names

    def make(self, action, out):
        if self.external or self.made:
            return 0

        if not os.path.isdir(self.path):
            raise Exception, "%s not found" % self.path

        out << opener("Project", self.path)

        self.made = True

        result = 0

        # Make sure the working directory is the project path so that all relative paths work
        cwd = os.getcwd()
        os.chdir(self.path)

        try:
            if action == "build":
                self.doBuild(out)
            elif action == "clean":
                self.doClean(out)
            elif action == "install":
                self.doBuild(out)
                self.doInstall(out)
            else:
                raise Exception("The action '%s' is not recognized" % action)

        except BuildError,exc:
            result = exc.code

        except:
            exc = sys.exc_info()
            traceback.print_exception(*exc)
            result = 1

        os.chdir(cwd)

        out << closer()

        return result

    def doBuild(self, out):
        sources = self.getSources()

        if self.buildPre:
            self.buildPre.build(self, out, sources)
        if self.build:
            self.build.build(self, out, sources)
        if self.buildPost:
            self.buildPost.build(self, out, sources)

    def doClean(self, out):
        sources = self.getSources()

        if self.buildPre:
            self.buildPre.clean(self, out, sources)
        if self.build:
            self.build.clean(self, out, sources)
        if self.buildPost:
            self.buildPost.clean(self, out, sources)

    def doInstall(self, out):
        if self.buildPre:
            self.buildPre.install(self, out)
        if self.build:
            self.build.install(self, out)
        if self.buildPost:
            self.buildPost.install(self, out)

    def _readSources(self):
        sources = []

        def searchDir(dirPath):
            for name in os.listdir(dirPath):
                if name.startswith("."):
                    continue

                path = os.path.join(dirPath, name)
                stats = os.stat(path)
                if stat.S_ISDIR(stats.st_mode):
                    if path not in projectPaths:
                        searchDir(path)
                elif stat.S_ISREG(stats.st_mode):
                    if name not in self.exclude:
                        source = res(path, name, stats, project=self)
                        sources.append(source)

        if not self.external:
            searchDir(self.path)

        return sources

    def _sortSources(self, sources):
        """Sort the sources by last modification time so we first build the files you touched most
           recently, with the precompiled header first in the list."""

        sorts = []
        pchFound = None

        for source in sources:
            if rePch.search(source.name):
                pchFound = source
            else:
                sorts.append(source)

        sorts = sorted(sorts, cmp=lambda a,b: cmp(a.stats.st_mtime, b.stats.st_mtime), reverse=True)

        if pchFound:
            sorts.insert(0, pchFound);

        return sorts

# **************************************************************************************************

def project(fn):
    """ Decorator for project declarations."""

    p = Project(fn.__name__, fn)
    projects.append(p)
    return p
