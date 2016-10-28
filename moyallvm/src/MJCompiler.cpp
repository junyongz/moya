#include "MJCompiler.h"
#include "MJValue.h"

#include "llvm/ADT/APInt.h"
#include "llvm/ADT/APSInt.h"

using namespace v8;

Nan::Persistent<Function> MJCompiler::constructor;

MJCompiler::MJCompiler() {
    compiler = new MLVCompiler();
}

MJCompiler::~MJCompiler() {
    delete compiler;
}

void MJCompiler::Init(Local<Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  Local<FunctionTemplate> tpl = Nan::New<FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("CompilerBridge").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(tpl, "beginModule", BeginModule);
  Nan::SetPrototypeMethod(tpl, "endModule", EndModule);
  Nan::SetPrototypeMethod(tpl, "beginFunction", BeginFunction);
  Nan::SetPrototypeMethod(tpl, "endFunction", EndFunction);
  Nan::SetPrototypeMethod(tpl, "compileInteger", CompileInteger);
  Nan::SetPrototypeMethod(tpl, "compileFloat", CompileFloat);
  Nan::SetPrototypeMethod(tpl, "compileCall", CompileCall);
  Nan::SetPrototypeMethod(tpl, "compileAddI", CompileAddI);
  Nan::SetPrototypeMethod(tpl, "createVariable", CreateVariable);
  Nan::SetPrototypeMethod(tpl, "storeVariable", StoreVariable);
  Nan::SetPrototypeMethod(tpl, "loadVariable", LoadVariable);
  Nan::SetPrototypeMethod(tpl, "executeMain", ExecuteMain);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("CompilerBridge").ToLocalChecked(), tpl->GetFunction());
}

void MJCompiler::New(const Nan::FunctionCallbackInfo<Value>& info) {
  if (info.IsConstructCall()) {
    MJCompiler* obj = new MJCompiler();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  }
}

void MJCompiler::BeginModule(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  String::Utf8Value _name(info[0]->ToString());
  std::string name = std::string(*_name);
  bridge->compiler->BeginModule(name);

  info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::EndModule(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  bridge->compiler->EndModule();

  info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::BeginFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[1]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        Handle<Value> val = array1->Get(i);
        int num = val->NumberValue();
        if (num == 1) {
            argTypes.push_back(llvm::Type::getInt32Ty(bridge->compiler->GetContext()));
        }
    }

    std::vector<std::string> argNames;
    Handle<Array> array2 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array2->Length(); i++) {
        Handle<Value> val = array2->Get(i);
        String::Utf8Value _argName(val->ToString());
        std::string argName = std::string(*_argName);
        argNames.push_back(argName);
    }
    
    std::vector<llvm::Value*> argsRet = bridge->compiler->BeginFunction(name, argTypes, argNames);

    Isolate* isolate = info.GetIsolate();
    Local<Array> argsRetNode = Array::New(isolate);
    unsigned i = 0;
    for (llvm::Value* arg : argsRet) {
        argsRetNode->Set(i, MJValue::Create(arg));
        ++i;
    }

    info.GetReturnValue().Set(argsRetNode);
}

void MJCompiler::EndFunction(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  bridge->compiler->EndFunction();

  info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::CompileInteger(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    int num = info[0]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileInteger(num);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CompileFloat(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    double num = info[0]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileFloat(num);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CreateVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);
    
    llvm::Value* value = bridge->compiler->CreateVariable(name);
    
    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::StoreVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    bridge->compiler->StoreVariable(lhs->GetValue(), rhs->GetValue());
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::LoadVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* alloca = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    String::Utf8Value _name(info[1]->ToString());
    std::string name = std::string(*_name);
    
    llvm::Value* ret = bridge->compiler->LoadVariable(alloca->GetValue(), name);
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileCall(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    Handle<Array> jsArray = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> args(jsArray->Length());
    for (unsigned int i = 0; i < jsArray->Length(); i++) {
        Handle<Value> val = jsArray->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MJValue* arg = ObjectWrap::Unwrap<MJValue>(object);
        args[i] = arg->GetValue();
    }
    
    llvm::Value* ret = bridge->compiler->CompileCall(name, args);
    if (ret) {
        info.GetReturnValue().Set(MJValue::Create(ret));
    } else {
        info.GetReturnValue().Set(Nan::Undefined());
    }
}

void MJCompiler::CompileAddI(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileAddI(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::ExecuteMain(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  bridge->compiler->ExecuteMain();
  
  info.GetReturnValue().Set(Nan::Undefined());
}
