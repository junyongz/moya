#include <cmath>
#include <nan.h>

#include "MJCompiler.h"
#include "MJValue.h"

// void Compile(const Nan::FunctionCallbackInfo<v8::Value>& info) {
//     testComp();
// }

void Init(v8::Local<v8::Object> exports) {
    MJValue::Init(exports);
    MJCompiler::Init(exports);

    // exports->Set(Nan::New("compile").ToLocalChecked(),
    //              Nan::New<v8::FunctionTemplate>(Compile)->GetFunction());
}

NODE_MODULE(moyallvm, Init)
