#!/usr/bin/env python

from make import *

# **************************************************************************************************
# Configurations

configurations = {
    "MacOSX": {
        "platform": "mac",
        "device": "",
        "sdk": "",
        "arch": ""
    }
}

# **************************************************************************************************
# Tests and metrics

tests = ('./tests/core', ['moyatests'])
metrics = ('./metrics', ['benchmarks'])

# **************************************************************************************************

@project
def moyacore(self):
    self.path = "src/core"
    self.exports = { "include" : "MoCore" }
    self.build = Compile() >> LinkStaticLib()

@project
def moyallvm(self):
    self.path = "moyallvm"
    self.build = CompileNodeGyp()
    
# **************************************************************************************************
# Tests and metrics

make(configurations, tests, metrics)
