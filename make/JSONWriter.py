
import json, sys

class JSONWriter(object):
    def __init__(self, stream=sys.stdout):
        self.stream = stream
        self.dataUIDs = 0
        self.dataQueue = {}

    def write(self, content):
        if self.dataQueue:
            dataSummary = {}
            for key,value in self.dataQueue.iteritems():
                if value:
                    dataSummary[key] = len(value)

            packet = json.dumps({"data": dataSummary, "content": content})
        else:
            packet = json.dumps({"content": content})

        self.stream.write('%s\n' % len(packet))
        self.stream.write(packet)

        for key,value in self.dataQueue.iteritems():
            if value:
                self.stream.write(str(value))

        self.stream.flush()

        self.dataQueue.clear()

    def enqueueData(self, data, typeName=None):
        self.dataUIDs += 1
        uid = self.dataUIDs
        self.dataQueue[uid] = data
        return uid
