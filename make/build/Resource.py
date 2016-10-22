
import os.path, mmap, re, stat
from ..util import rootProjectPath, exports

# **************************************************************************************************

resources = {}

reInclude = re.compile(r"""#(?:include|import) (?:"|<)(.*?(?:\.h|\.hpp|))(?:"|>)""")

# **************************************************************************************************

def res(path, name=None, stats=None, project=None):
    resource = resources.get(path)
    if not resource:
        resource = resources[path] = Resource(path, name, stats, project)

    if project:
        resource.project = project
    return resource

# **************************************************************************************************

class Resource(object):
    _includes = None
    _dependencies = None

    def __init__(self, path, name=None, stats=None, project=None):
        self.path = path
        self.name = name or os.path.basename(path)
        self._stats = stats
        self.project = project

    def __repr__(self):
        return self.path

    def needsUpdate(self, target):
        """ Determines if the file is older than another file."""

        return not target.stats or not self.stats or self.stats.st_mtime > target.stats.st_mtime

    def resetStats(self):
        """ Deletes cached stats so they will be read from the file again next time."""

        self._stats = None

    @property
    def isdir(self):
        stats = self.stats
        if stats:
            return stat.S_ISDIR(stats.st_mode)

    @property
    def exists(self):
        return self.stats != 0

    @property
    def stats(self):
        if self._stats:
            return self._stats
        
        try:
            self._stats = os.stat(self.path)
            return self._stats
        except:
            self._stats = 0
            return 0

    @property
    def includes(self):
        if self._includes:
            return self._includes

        fd = os.open(self.path, os.O_RDONLY)
        text = mmap.mmap(fd, self.stats.st_size, access=mmap.ACCESS_READ)
        matches = re.findall(reInclude, text)
        os.close(fd)

        self._includes = matches
        return matches

    @property
    def dependencies(self):
        if self._dependencies is not None:
            return self._dependencies

        # Prevent infinite loop for circular references
        self._dependencies = []

        deps = {}

        dirPath = os.path.dirname(self.path)
        for includePath in self.includes:
            headerPath = os.path.join(dirPath, includePath)
            header = None
            isWithinRoot = headerPath.startswith(rootProjectPath)
            if isWithinRoot and os.path.isfile(headerPath):
                header = res(headerPath)
            else:
                includeDir = os.path.dirname(includePath)
                project = exports.get(includeDir)
                if project:
                    header = project.getExport(includePath)

            if header:
                deps[header.path] = header

                for dep in header.dependencies:
                    deps[dep.path] = dep

        self._dependencies = deps.values()
        return self._dependencies
