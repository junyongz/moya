
import os.path, json, re

reFormat = re.compile('%(\((.*?)\))?((ll)?[diuoxXfFeEgGaAcspn%])')

IntegerType = 1
LongType = 2
FloatType = 3
CharType = 4
StringType = 5

cTypeForSlotType = {
    IntegerType: 'uint32_t',
    LongType: 'uint64_t',
    FloatType: 'double',
    CharType: 'char',
    StringType: 'uint32_t',
}

sizeForSlotType = {
    IntegerType: 4,
    LongType: 8,
    FloatType: 8,
    CharType: 1,
    StringType: 4,
}

typeForLetter = {
    'd': IntegerType,
    'i': IntegerType,
    'u': IntegerType,
    'o': IntegerType,
    'x': IntegerType,
    'X': IntegerType,
    'lld': LongType,
    'lli': LongType,
    'llu': LongType,
    'llo': LongType,
    'llx': LongType,
    'llX': LongType,
    'f': FloatType,
    'F': FloatType,
    'e': FloatType,
    'E': FloatType,
    'g': FloatType,
    'G': FloatType,
    'a': FloatType,
    'A': FloatType,
    'c': CharType,
    's': StringType,
    'p': IntegerType,
}

class Probe(object):
    def __init__(self, name):
        self.name = name
        self.isData = False
        self.slots = []

    @property
    def upperName(self):
        name = re.sub(re.compile('([A-Z])'), '_\g<0>', self.name)
        return name.upper()

    @property
    def enumName(self):
        return 'UpProbe%s' % camelCaseName(self.name)

    def dataTypeNameForMacro(self, macroName):
        return 'Up%s%s%s' % (macroName, self.name[0].upper(), self.name[1:])

    @property
    def argNames(self):
        return ['_ARG%d' % i for i in xrange(0, len(self.slots))]

    @property
    def structSizes(self):
        yield sizeForSlotType[CharType]
        yield sizeForSlotType[IntegerType]
        yield sizeForSlotType[FloatType]
        for slot in self.slots:
            yield sizeForSlotType[slot['type']]

    def parse(self, format, mappings):
        if isinstance(format, list):
            format = format[0]
            self.isData = True

        index = 0
        parts = []

        while 1:
            m = reFormat.search(format, index)
            if m and not m.groups()[0]:
                start = m.start()
                if start > index:
                    parts.append(format[index:start])

                letter = m.groups()[2]
                if letter == '%':
                    parts.append('%')
                elif letter == 'n':
                    pass
                else:
                    parts.append('%%%s' % letter)

                    slotType = typeForLetter[letter]
                    self.slots.append({'type': slotType})

                index = m.end()
            elif m:
                start = m.start()
                if start > index:
                    parts.append(format[index:start])

                name = m.groups()[1]
                if name not in mappings:
                    mappings[name] = len(mappings)+1
                parts.append('%(' + str(mappings[name]) + ')s')

                self.slots.append({'type': IntegerType})

                index = m.end()
            else:
                break

        if index+1 < len(format):
            parts.append(format[index:])

        self.formatString = ''.join(parts)

def probeMake(jsonPath):
    jsonPath = os.path.abspath(jsonPath)
    f = open(jsonPath)
    source = f.read()
    f.close()

    data = json.loads(source)
    probes = []
    mappings = {}
    for probeName,format in data.iteritems():
        probe = Probe(probeName)
        probe.parse(format, mappings)
        probes.append(probe)

    hSource,cSource = renderFiles(probes, mappings)

    dirPath = os.path.dirname(jsonPath)
    fileName = os.path.basename(jsonPath)
    basePath,ext = os.path.splitext(fileName)

    hPath = "%s/include/%s.h" % (dirPath, basePath)
    hFile = open(hPath, 'w')
    hFile.write(hSource)
    hFile.close()

    cPath = "%s/%s.c" % (dirPath, basePath)
    cFile = open(cPath, 'w')
    cFile.write(cSource)
    cFile.close()

def renderFiles(probes, mappings):
    hLines = [hHeader]
    cLines = [cHeader]

    hLines.append('typedef enum {')
    hLines.append('    UpProbeNull,')

    for probe in probes:
        hLines.append('    %s,' % probe.enumName)

    hLines.append('} UpProbeType;')
    hLines.append('')

    hLines.append('typedef enum {')
    hLines.append('    UpProbeMappingNull,')

    for mapping in mappings:
        hLines.append('    UpProbeMapping%s = %s,' % (camelCaseName(mapping), mappings[mapping]))

    hLines.append('} UpProbeMapping;')
    hLines.append('')

    for probe in probes:
        hLines.append('extern bool %sEnabled;' % probe.enumName)

    hLines.append('')

    for probe in probes:
        if probe.isData:
            hLines.append(structForProbe(probe, 'Do'))
        else:
            hLines.append(structForProbe(probe, 'Begin', 'double time;'))
            hLines.append(structForProbe(probe, 'End', 'double time;'))
            hLines.append(structForProbe(probe, 'Count'))

    for probe in probes:
        if probe.isData:
            hLines.append(macroForProbe(probe, 'Do', 7))
        else:
            hLines.append(macroForProbe(probe, 'Begin', 5, 'UpGetProbeTime()'))
            hLines.append(macroForProbe(probe, 'End', 6, 'UpGetProbeTime()'))
            hLines.append(macroForProbe(probe, 'Count', 7))

    hLines.append('bool* UpGetProbeFlag(const char* name);')
    hLines.append('void UpInitProbes();')

    hLines.append('#else\n')

    for probe in probes:
        if probe.isData:
            hLines.append('#define DO_%s(%s)' % (probe.upperName, ', '.join(probe.argNames)))
        else:
            hLines.append('#define BEGIN_%s(%s)' % (probe.upperName, ', '.join(probe.argNames)))
            hLines.append('#define END_%s(%s)' % (probe.upperName, ', '.join(probe.argNames)))
            hLines.append('#define COUNT_%s(%s)' % (probe.upperName, ', '.join(probe.argNames)))

    hLines.append(hFooter)

    for probe in probes:
        cLines.append('bool %sEnabled = false;' % probe.enumName)

    first = True
    cLines.append('')
    cLines.append('bool* UpGetProbeFlag(const char* name) {')
    for probe in probes:
        cLines.append('    %sif (!strcmp(name, "%s")) {' % ('' if first else '} else ', probe.name))
        cLines.append('        return &%sEnabled;' % probe.enumName)
        first = False
    cLines.append('    }')
    cLines.append('    return NULL;')
    cLines.append('}')

    cLines.append('')
    cLines.append('void UpInitProbes() {')
    for probe in probes:
        format = probe.formatString
        cLines.append('    {')
        cLines.append('    char* name = "%s";' % probe.name)
        cLines.append('    char* format = "%s";' % format)
        cLines.append('    UpDeclareProbe probe = {2, %s, %s, %s, %d};' \
                % (probe.enumName, len(probe.name), len(format), 1 if probe.isData else 0))
        cLines.append('    UpProbe(&probe, sizeof(probe));')
        cLines.append('    UpProbe(name, sizeof(char) * %s);' % len(probe.name))
        cLines.append('    UpProbe(format, sizeof(char) * %s);' % len(format))
        cLines.append('    }')

    cLines.append('    {')
    cLines.append('    UpDeclareProbe probe = {2, 0, 0, 0, 0};')
    cLines.append('    UpProbe(&probe, sizeof(probe));')
    cLines.append('    }')

    cLines.append('}')

    cLines.append(cFooter)

    return '\n'.join(hLines), '\n'.join(cLines)

def structForProbe(probe, name, defs=None):
    lines = []
    lines.append('typedef struct __attribute__((__packed__)) {')
    lines.append('    uint8_t type;')
    lines.append('    uint8_t probe;')
    if defs:
        lines.append('    %s' % defs)
    for i,slot in zip(xrange(0, len(probe.slots)), probe.slots):
        lines.append('    %s _ARG%s;' % (cTypeForSlotType[slot['type']], i))
    lines.append('} %s;\n' % probe.dataTypeNameForMacro(name))
    return '\n'.join(lines)

def macroForProbe(probe, name, number, initializers=None):
    if initializers:
        initializers = initializers + ','
    else:
        initializers = ''

    lines = []
    lines.append('#define %s_%s(%s) \\' % (name.upper(), probe.upperName,
                  ', '.join(probe.argNames)))
    lines.append('    if (%sEnabled) { \\' % probe.enumName)

    argNames = []
    for i,slot in zip(xrange(0, len(probe.slots)), probe.slots):
        if slot['type'] == StringType:
            lines.append('        uint32_t len%s = sizeof(char) * strlen(_ARG%s); \\' % (i, i))
            argNames.append('len%s' % i)
        else:
            argNames.append('(%s)_ARG%s' % (cTypeForSlotType[slot['type']], i))

    lines.append('        %s probe = {%s, %s,%s %s}; \\' %
        (probe.dataTypeNameForMacro(name), number, probe.enumName, initializers, ', '.join(argNames)))
    lines.append('        UpProbe(&probe, sizeof(probe)); \\')

    for i,slot in zip(xrange(0, len(probe.slots)), probe.slots):
        if slot['type'] == StringType:
            lines.append('        UpProbe((void*)_ARG%s, len%s); \\' %  (i, i))

    lines.append('    }\n')
    return '\n'.join(lines)

def camelCaseName(name):
    return '%s%s' % (name[0].upper(), name[1:])

# **************************************************************************************************

hHeader = """
// Do not edit this file. It is generated!

#ifndef UP_PROBES_H
#define UP_PROBES_H

#include "Up/UpGlobal.h"

#ifdef UP_ENABLE_PROBES
"""

hFooter = """
#endif

#endif // UP_PROBES_H
"""

cHeader = """
// Do not edit this file. It is generated!

#ifdef UP_ENABLE_PROBES

#include "pch.h"
#include "UpInternal.h"
#include "Up/UpProbes.h"
#include "Up/UpContext.h"

typedef struct __attribute__((__packed__)) {
    uint8_t type;
    uint8_t probe;
    uint32_t name;
    uint32_t format;
    uint8_t isData;
} UpDeclareProbe;

"""

cFooter = """
#endif

"""
