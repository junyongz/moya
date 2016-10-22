
import types, os.path, struct, json, fnmatch, pandas
from ..util import formatTable, importLocalModule

# **************************************************************************************************

kProbeIterate = 1
kProbeBegin = 2
kProbeBegin2 = 3
kProbeEnd = 4
kProbeEnd2 = 5
kProbeCount = 6
kProbeCount2 = 7
kProbeLog = 8
kProbeSymbol = 9

sortAscending = 1
sortDescending = 2

metricsMetadata = {
    'name': 'Metrics',
    'index': ['METRIC'],
    'columns': [{'name': 'METRIC'}, {'name': 'VALUE', 'sort': sortDescending}],
    'rows': {}
}

defaultCatalog = {
    'analysts': [],
    'scripts': [],
    'scriptRoot': ''
}

# **************************************************************************************************

def probe(probeName, summarize=False, format=None):
    def handler(cls):
        if not cls.probeNames:
            cls.probeNames = [probeName]
        else:
            cls.probeNames.append(probeName)
        
        if summarize:
            @metric(format=format)
            def measurer(self, **tables):
                total = 0
                counts = self.counts.get(probeName, {})
                for probeId,count in counts.iteritems():
                    total += len(count)
                return total

            setattr(cls, probeName, measurer)
        return cls
    return handler

def table(fn):
    fn.isTable = True
    fn.columns = []
    fn.formats = {}
    fn.index = []
    fn.sort = {}
    return fn

def column(name, format=None, sort=None, index=False):
    def handler(fn):
        fn.columns.insert(0, name)
        fn.formats[name] = format if format else ''
        if sort:
            fn.sort[name] = sort
        if index:
            fn.index.insert(0, name)
        return fn
    return handler

def metric(fn=None, format='', persist=True):
    """ Expected to return a dictionary of numbers. """

    if hasattr(fn, "__call__"):
        fn.isSummary = True
        fn.format = ''
        fn.isPersisted = True
        return fn
    else:
        def handler(fn):
            fn.isSummary = True
            fn.isPersisted = persist
            fn.format = format
            return fn
        return handler

# **************************************************************************************************

class Analyst(object):
    probeNames = None
    repeat = False
    inputPath = None
    breaker = None

    @classmethod
    def scanAnalysts(self, modules):
        for module in modules:
            for analystClass in vars(module).itervalues():
                if isinstance(analystClass, types.TypeType) and issubclass(analystClass, Analyst) \
                and analystClass not in [Analyst, ProbeAnalyst] and analystClass.probeNames:
                    yield analystClass

    @classmethod
    def scanForAnalyst(self, modules, analystName):
        for analystClass in self.scanAnalysts(modules):
            if analystClass.__name__ == analystName:
                return analystClass

    @classmethod
    def scanCatalog(self, modules):
        catalog = dict(defaultCatalog)
        analysts = catalog['analysts']

        for analystClass in self.scanAnalysts(modules):
            analyst = analystClass()

            tables = [name for name,tabulator in analyst.tabulators]
            metrics = [name for name,measurer in analyst.measurers]
            if tables or metrics:
                analysts.append({
                    'name': analyst.analystName,
                    'repeat': analyst.repeat,
                    'probes': analyst.probeNames,
                    'tables': tables,
                    'metrics': metrics,
                })

        scriptsPath = os.path.normpath(os.path.join(__file__, '..', '..', '..', 'metrics'))
        catalog['scriptRoot'] = scriptsPath

        scripts = catalog['scripts']
        for root, dirs, files in os.walk(scriptsPath):
            for fileName in files:
                sourcePath = os.path.join(root, fileName)
                if fnmatch.fnmatch(sourcePath, "*.up"):
                    scripts.append(sourcePath)

        return catalog

    @property
    def analystName(self):
        return self.__class__.__name__

    @property
    def tabulators(self):
        for name in dir(self):
            tabulator = getattr(self, name)
            if getattr(tabulator, "isTable", None):
                yield name,tabulator

    @property
    def measurers(self):
        for name in dir(self):
            measurer = getattr(self, name)
            if getattr(measurer, "isSummary", None):
                yield name,measurer

    def analyze(self, inputPath=None):
        pass

    def tabulate(self):
        pass

    def summarize(self, **tables):
        pass

    def finalize(self, **metrics):
        pass

    def saveTable(self, tableName, tabulator, table):
        analystsDirPath = os.path.dirname(self.inputPath)

        tablePath = os.path.join(analystsDirPath, "%s.csv" % tableName)
        f = open(tablePath, 'w')
        table.to_csv(f)
        f.close()

        metadataPath = os.path.join(analystsDirPath, "%s.json" % tableName)
        entry = self._entryForTable(tabulator)

        metadata = json.dumps(entry)
        f = open(metadataPath, 'w')
        f.write(metadata)
        f.close()

    def saveMetrics(self, metrics):
        analystsPath = os.path.dirname(self.inputPath)

        tablePath = os.path.join(analystsPath, "Metrics.csv")
        metricMap = openTableAsMap(tablePath)

        # XXXjoe Will DataFrame.combine_first() do all this work for me?
        rows = []
        for metricName,(measurer, metric) in metrics.iteritems():
            if measurer.isPersisted:
                metricMap[metricName] = metric

        for s,v in metricMap.iteritems():
            rows.append((s,v))

        columns = ['METRIC', 'VALUE']
        table = pandas.DataFrame.from_records(rows, columns=columns, index='METRIC')
        f = open(tablePath, 'w')
        table.to_csv(f)
        f.close()       

        metadataPath = os.path.join(analystsPath, "Metrics.json")
        if os.path.isfile(metadataPath):
            entry = self._loadTable(metadataPath)
        else:
            entry = metricsMetadata

        metricRows = entry['rows']
        for metricName,(measurer, metric) in metrics.iteritems():
            if measurer.isPersisted:
                metricRows[metricName] = measurer.format

        metadata = json.dumps(entry)
        f = open(metadataPath, 'w')
        f.write(metadata)
        f.close()

    def _loadTable(self, tablePath):
        f = open(tablePath, 'r')
        text = f.read()
        f.close()

        return json.loads(text)

    def _entryForTable(self, tabulator):
        columns = []
        for name in tabulator.columns:
            column = {'name': name}
            if name in tabulator.sort:
                column['sort'] = tabulator.sort[name]
            if name in tabulator.formats:
                column['format'] = tabulator.formats[name]
            columns.append(column)

        return {
            'name': tabulator.__name__,
            'columns': columns,
            'index': tabulator.index
        }

# **************************************************************************************************

class ProbeAnalyst(Analyst):
    def stackTrace(self, stack):
        pass

    def analyze(self, inputPath=None):
        self.inputPath = inputPath

        try:
            probeFile = open(inputPath, 'rb')
        except Exception,exc:
            raise Exception("Probes file not found at %s" % inputPath)

        tableReps = []
        metricReps = []

        probeBuffer = probeFile.read()
        probeOffset = 0

        while True:
            probeOffset = self._readProbes(probeBuffer, probeOffset)
            tables, metrics = self._analyzeProbes()
            tableReps.append(tables)
            metricReps.append(metrics)

            if probeOffset == -1:
                break

        probeFile.close()

        repeatCount = len(tableReps)
        if len(tableReps) > 1:
            tables, metrics = self._combineRepetitions(tableReps, metricReps)
        
        for name,(tabulator,table) in tables.iteritems():
            self.saveTable(name, tabulator, table)

        self.saveMetrics(metrics)

    def _readProbes(self, buf, offset):
        logSize,done, = struct.unpack_from('IB', buf, offset)
        offset += 5

        symbolMap = {}
        startMaps = {}
        stackMaps = {}
        timeMaps = {}
        countMaps = {}

        self.times = timeMaps
        self.counts = countMaps

        breaker = self.breaker

        bufferSize = len(buf)
        while offset < bufferSize:
            b, = struct.unpack_from('B', buf, offset)
            if b == 0:
                return -1
            elif b == kProbeIterate:
                offset += 1
                return offset
            elif b == kProbeBegin:
                entry = struct.unpack_from('BIId', buf, offset)
                _,n,d,time = entry
                offset += 24

                probeName = symbolMap.get(n, "")
                probeId = symbolMap.get(d, "")
                time = int(time)*1e-6

                if probeName not in stackMaps:
                    stackMaps[probeName] = [probeId]
                else:
                    stackMaps[probeName].append(probeId)

                if probeName not in startMaps:
                    starts = startMaps[probeName] = {}
                else:
                    starts = startMaps[probeName]

                if probeId not in starts:
                    starts[probeId] = [time]
                else:
                    starts[probeId].append(time)
            elif b == kProbeEnd:
                entry = struct.unpack_from('BIId', buf, offset)
                _,n,d,time = entry
                offset += 24

                probeName = symbolMap.get(n, "")
                probeId = symbolMap.get(d, "")
                time = int(time)*1e-6

                start = startMaps[probeName][probeId].pop()
                elapsed = time - start

                stack = stackMaps[probeName]
                stack.pop()

                # For recursion, only count the outermost time
                if probeId in stack:
                    elapsed = 0

                if probeName not in timeMaps:
                    times = timeMaps[probeName] = {}
                else:
                    times = timeMaps[probeName]

                if probeId not in times:
                    times[probeId] = [elapsed]
                else:
                    times[probeId].append(elapsed)
            elif b == kProbeCount:
                _,n,d,data = struct.unpack_from('BIId', buf, offset)
                offset += 24

                probeName = symbolMap.get(n, "")
                probeId = symbolMap.get(d, "")

                # if breaker:
                #     stackTraceProbe = breaker(b, (probeName, probeId, data))
                #     if stackTraceProbe:
                #         stack = stackMaps.get(stackTraceProbe, [])
                #         self.stackTrace(stack)
                #         # break

                if probeName not in countMaps:
                    counts = countMaps[probeName] = {}
                else:
                    counts = countMaps[probeName]

                if probeId not in counts:
                    counts[probeId] = [data]
                else:
                    counts[probeId].append(data)
            elif b == kProbeCount2:
                _,n,d,d2,data = struct.unpack_from('BIIId', buf, offset)
                offset += 24

                probeName = symbolMap.get(n, "")
                probeId = symbolMap.get(d, "")
                probeId2 = symbolMap.get(d2, "")

                # if breaker:
                #     stackTraceProbe = breaker(b, (probeName, probeId, probeId2, data))
                #     if stackTraceProbe:
                #         stack = stackMaps.get(stackTraceProbe, [])
                #         self.stackTrace(stack)
                #         # break

                if probeName not in countMaps:
                    counts = countMaps[probeName] = {}
                else:
                    counts = countMaps[probeName]

                key = (probeId,probeId2)
                if key not in counts:
                    counts[key] = [data]
                else:
                    counts[key].append(data)
            elif b == kProbeLog:
                _,n,length = struct.unpack_from('BII', buf, offset)
                offset += 12

                content = buf[offset:offset+length]
                offset += length
                print content
            elif b == kProbeSymbol:
                _,symbol,length = struct.unpack_from('BII', buf, offset)
                offset += 12

                content = buf[offset:offset+length]
                offset += length
                
                symbolMap[symbol] = content

                # print "%s:: '%s'" % (symbol, content)
            else:
                pass
                # sys.stderr.write("Unrecognized probe %s" % b)

        return -1

    def _analyzeProbes(self):
        self.tabulate()

        tables = {}
        tabulatorTables = {}
        for name,tabulator in self.tabulators:
            table = tabulator()
            tables[name] = (tabulator, table)
            tabulatorTables[name] = table

        self.summarize(**tabulatorTables)

        metrics = {}
        for name,measurer in self.measurers:
            metric = measurer(**tabulatorTables)
            metrics[name] = (measurer, metric)

        self.finalize(**metrics)

        return tables, metrics

    def _combineRepetitions(self, tableReps, metricReps):
        tableAvgs = {}
        metricAvgs = {}

        repeatCount = len(tableReps)

        for tables in tableReps:
            for tableName in tables:
                if tableName in tableAvgs:
                    tabler,next = tables[tableName]
                    tabler,avg = tableAvgs[tableName]

                    for name in avg.columns:
                        col = pandas.Series([min(a,b) for a,b in zip(avg[name], next[name])])
                        col.index = avg.index
                    avg[name] = col
                else:
                    tableAvgs[tableName] = tables[tableName]

        for metrics in metricReps:
            for metricName in metrics:
                if metricName in metricAvgs:
                    measurer,next = metrics[metricName]
                    measurer,avg = metricAvgs[metricName]
                    metricAvgs[metricName] = (measurer,min(avg, next))
                else:
                    metricAvgs[metricName] = metrics[metricName]

        return tableAvgs, metricAvgs

# **************************************************************************************************

def openTableAsMap(tablePath):
    tableMap = {}
    if os.path.isfile(tablePath):
        table = pandas.DataFrame.from_csv(tablePath)
        for columnName,series in table.iterrows():
            for value in series:
                tableMap[columnName] = value
    return tableMap
