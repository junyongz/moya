#!/usr/bin/env python

from make import *

# **************************************************************************************************
# Tests and metrics

tests = ('./tests/core', ['moyatests'])
metrics = ('./metrics', ['benchmarks'])

make([], tests, metrics)
