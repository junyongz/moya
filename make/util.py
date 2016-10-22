
import os.path, subprocess, sys

# **************************************************************************************************

projects = []
projectPaths = {}
exports = {}

rootProjectPath = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))

# **************************************************************************************************

def sourceLink(path, line=-1, col=-1):
    if line >= 0:
        if col >= 0:
            return "[[%s:%s:%s]]" % (path, line, col)
        else:
            return "[[%s:%s]]" % (path, line)
    else:
        return "[[%s]]" % (path,)

def getSystemAbbreviation():
    import sys
    if sys.platform == "win32":
        return "win"
    if sys.platform == "darwin":
        return "mac"
    return "unix"

def importLocalModule(modName, modPath):
    sys.path.append(modPath)
    module = __import__(modName)
    sys.path.remove(modPath)
    return module

# **************************************************************************************************

def formatTable(columns, divider='=', separator='|', margin=' ', padding=5):
    rowFormats = []
    headerRow = []
    rows = []
    totalWidth = 0
    pad = ' ' * padding

    maxHeight = 0
    processedColumns = []
    for header,data in columns:
        lines = data.split("\n")
        count = len(lines)
        
        processedColumns.append((header, lines, count))
        if count > maxHeight:
            maxHeight = count    

    format = []
    for header,lines,count in processedColumns:
        maxWidth = len(header) if header else 0

        lr = len(rows)
        ll = len(lines)+1
        if lr < ll:
            for i in xrange(lr, ll-1):
                rows.append([])

        headerRow.append(header)
        
        i = 0
        for line in lines:
            maxWidth = max(len(line), maxWidth)
            row = rows[i]
            row.append(line)
            i += 1

        for i in xrange(count, maxHeight):
            row = rows[i]
            row.append('')

        totalWidth += maxWidth

        if rowFormats:
            rowFormat = "".join(("%-", str(maxWidth), "s"))
            totalWidth += padding*2 + len(separator)
        else:
            rowFormat = "".join(("%-", str(maxWidth), "s"))
        rowFormats.append(rowFormat)

    totalWidth -= padding + len(separator)
    totalWidth += len(margin)*2

    s = "".join((pad, separator, pad))
    rowFormat = margin + s.join(rowFormats) + margin

    # Filling missing columns 
    formattedRows = [rowFormat % tuple(row) for row in rows]

    if headerRow:
        head = [rowFormat % tuple(headerRow)]
    else:
        head = []
    if divider:
        div = [divider * (totalWidth + padding + len(separator))]
    else:
        div = []

    lines = div + head + div + formattedRows + div
    return "\n".join(lines)

# **************************************************************************************************

def sublaunch(command, cwd=None, env=None, echo=False):
    import subprocess, pty, traceback, fcntl, select, sys

    master, slave = pty.openpty()
    process = subprocess.Popen(command, bufsize=1, shell=True, stdout=slave, stderr=slave,
                               cwd=cwd, env=env)
    
    # Make the pty non-blocking, or we will hang sometimes reading the last bits of output
    fl = fcntl.fcntl(master, fcntl.F_GETFL)
    fcntl.fcntl(master, fcntl.F_SETFL, fl | os.O_NDELAY)

    stdout = os.fdopen(master)

    reads = []
    error = 0
    while True:
        try:
            r, w, e = select.select([stdout], [], [], 0.1)
            if r:
                text = stdout.read()
                reads.append(text)
                if echo:
                    sys.stdout.write(text)

            error = process.poll()
            if error != None:
                break
        
        except SystemExit,exc:
            process.send_signal(exc.code)
            raise
        except KeyboardInterrupt:
            process.terminate()
            import sys
            from signal import SIGTERM
            sys.exit(SIGTERM)
        except:
            traceback.print_exc()
            break

    stdout.close()
    os.close(slave)

    output = "".join(reads)
    return output, error

def subread(command, cwd=None, env=None, echo=False):
    import subprocess, sys

    process = subprocess.Popen(command, bufsize=1, shell=True, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, cwd=cwd, env=env)

    reads = []
    while process.returncode == None:
        text = process.stdout.read()
        reads.append(text)
        if echo:
            sys.stdout.write(text)
        process.poll()
    
    error = process.returncode
    output = "".join(reads)
    return output, error

# **************************************************************************************************

class BuildError(Exception):
    def __init__(self, code=0, description=None):
        self.code = code
        self.description = description
