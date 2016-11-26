
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <math.h>

// *************************************************************************************************

static char*
copyString(const char* nbuf) {
    size_t l = strlen(nbuf);
    char* buf = (char*)malloc(l+1);
    strcpy(buf, nbuf);
    return buf;
}

// *************************************************************************************************

extern "C" void
printString(const char* value) {
    printf("%s\n", value);
}

extern "C" double
powerdd(double a, double b) {
    return pow(a, b);
}

extern "C" char*
concatString(const char* left, const char* right) {
    size_t l1 = strlen(left);
    size_t l2 = strlen(right);
    char* buf = (char*)malloc(l1+l2+1);
    strcpy(buf, left);
    strcpy(buf+l1, right);
    return buf;
}

extern "C" const char*
boolToString(bool num) {
    if (num) {
        return copyString("true");
    } else {
        return copyString("false");
    }
}

extern "C" char*
charToString(char c) {
    char nbuf[2];
    snprintf(nbuf, 2, "%c", c);
    return copyString(nbuf);
}

extern "C" char*
intToString(long long num) {
    char nbuf[128];
    snprintf(nbuf, 128, "%lld", num);
    
    size_t l = strlen(nbuf);
    char* buf = (char*)malloc(l+1);
    strcpy(buf, nbuf);
    return buf;
}

extern "C" char*
doubleToString(double num) {
    char nbuf[128];
    snprintf(nbuf, 128, "%lf", num);
    
    size_t l = strlen(nbuf);
    char* buf = (char*)malloc(l+1);
    strcpy(buf, nbuf);
    return buf;
}

extern "C" char*
newObject(int size) {
    char* buf = (char*)malloc(size);
    memset(buf, 0, size);
    return buf;
}

extern "C" char*
newBuffer(int itemSize, int count) {
    size_t size = count * itemSize;
    char* buf = (char*)malloc(size);
    memset(buf, 0, size);
    return buf;
}

extern "C" char*
resizeBuffer(char* buf, int oldSize, int newSize) {
    buf = (char*)realloc(buf, newSize);
    memset(buf + oldSize, 0, newSize - oldSize);
    return buf;
}

extern "C" double
moyaModf64(double n, double* rem) {
    return modf(n, rem);
}

extern "C" void
crashForFun() {
    abort();
}
