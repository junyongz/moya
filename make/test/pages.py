
import os.path, markdown, cgi
from .run import getTestRunners

def renderTestPages(testModule, outDirPath):
    if not os.path.isdir(outDirPath):
        raise "Directory doesn't exist at %s" % outDirPath
    
    links = []
    for runner in getTestRunners(testModule):
        for testName, x, y in runner.getTestNames():
            fixture = runner.fixtureClass(testName, None)
            testCase = getattr(fixture, testName)
            if 1 or testCase.testFilePath.find('parseStringWhitespace') >= 0:
                groups, hasFocus = testCase.walkTextGroups()
                                
                fileName = os.path.basename(testCase.testFilePath)
                fileName,ext = os.path.splitext(fileName)

                content = renderGroups(groups, fileName)
                
                pagePath = os.path.join(outDirPath, fileName+'.html')
                f = file(pagePath, 'w')
                f.write(content)
                f.close()
                
                link = linkTemplate % (fileName+'.html', fileName)
                links.append(link)

    content = "\n".join(links)
    indexContent = indexTemplate % {"content": content}
    indexPath = os.path.join(outDirPath, 'index.html')
    f = file(indexPath, 'w')
    f.write(indexContent)
    f.close()
            

def renderGroups(groups, fileName):
    sections = []
    for group in groups:
        comment = group.comment
        comment = comment.decode('utf8').encode('ascii', 'xmlcharrefreplace')
        comment = markdown.markdown(comment)
        sections.append(comment)
            
        for test in group.tests:
            source = cgi.escape(test.source)
            source = source.decode('utf8').encode('ascii', 'xmlcharrefreplace')
            
            expected = cgi.escape(test.expected)
            expected = expected.decode('utf8').encode('ascii', 'xmlcharrefreplace')
            
            testContent = testTemplate % {"source": source, "expected": expected}
            sections.append(testContent)
            
    pageContent =  "\n".join(sections)
    
    return pageTemplate % {"title": fileName, "content": pageContent}


indexTemplate = """
<html>
<head>
<title>Up Tests</title>
<style type="text/css">@import "tests.css"</style>
</head>
<body>
%(content)s
</body>
</html>
"""
    
pageTemplate = """
<html>
<head>
<title>%(title)s</title>
<style type="text/css">@import "tests.css"</style>
</head>
<body>
<div class="content">
%(content)s
</div>
</body>
</html>
"""

testTemplate = """
<table class="test-table">
<tr>
<td class="test-source"><code>%(source)s</code></td>
<td class="test-expected"><code>%(expected)s</code></td>
</tr>
</table>
"""

linkTemplate = """
<div><a href="%s">%s</a></div>
"""
