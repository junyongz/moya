
#include <cstdio>

typedef struct {
    char* vtable;
    int field;
} MoyaObject;

extern "C" void ctest1() {
    printf("received!");
}

extern "C" void ctest2a(int n) {
    printf("received %d", n);
}

extern "C" void ctest2b(bool n) {
    printf("received %d", n);
}

extern "C" void ctest2c(double n) {
    printf("received %f", n);
}

extern "C" void ctest2d(long long n) {
    printf("received %lld", n);
}

extern "C" void ctest2e(char* n) {
    printf("received '%s'", n);
}

extern "C" void ctest2f(MoyaObject* n) {
    printf("received %d", n->field);
}

extern "C" int ctest4a() {
    return 42;
}

extern "C" long long ctest4b() {
    return 9223372036854775807L;
}

extern "C" double ctest4c() {
    return 42.1234;
}

extern "C" const char* ctest4d() {
    return "foo";
}
