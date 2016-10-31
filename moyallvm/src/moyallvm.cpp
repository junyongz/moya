#include <cmath>
#include <nan.h>

#include "MJCompiler.h"
#include "MJValue.h"
#include "MJType.h"

void Init(v8::Local<v8::Object> exports) {
    MJValue::Init(exports);
    MJType::Init(exports);
    MJCompiler::Init(exports);
}

NODE_MODULE(moyallvm, Init)
