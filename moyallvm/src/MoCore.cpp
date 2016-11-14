
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <math.h>

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
    return buf;
}
