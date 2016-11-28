
#include <nan.h>

#include "MoJBridge.h"
#include "MoJValue.h"
#include "MoJType.h"
#include "MoJDIScope.h"

void Init(v8::Local<v8::Object> exports) {
    MoJValue::Init(exports);
    MoJType::Init(exports);
    MoJDIScope::Init(exports);
    MoJBridge::Init(exports);
}

NODE_MODULE(moyallvm, Init)
