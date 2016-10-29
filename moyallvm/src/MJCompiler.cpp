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
  Nan::SetPrototypeMethod(tpl, "declareString", DeclareString);
  Nan::SetPrototypeMethod(tpl, "declareFunction", DeclareFunction);
  Nan::SetPrototypeMethod(tpl, "beginFunction", BeginFunction);
  Nan::SetPrototypeMethod(tpl, "endFunction", EndFunction);
  Nan::SetPrototypeMethod(tpl, "compileInteger", CompileInteger);
  Nan::SetPrototypeMethod(tpl, "compileFloat", CompileFloat);
  Nan::SetPrototypeMethod(tpl, "compileDouble", CompileDouble);
  Nan::SetPrototypeMethod(tpl, "castNumber", CastNumber);
  Nan::SetPrototypeMethod(tpl, "compileCall", CompileCall);
  Nan::SetPrototypeMethod(tpl, "compileAdd", CompileAdd);
  Nan::SetPrototypeMethod(tpl, "compileNegate", CompileNegate);
  Nan::SetPrototypeMethod(tpl, "compileSubtract", CompileSubtract);
  Nan::SetPrototypeMethod(tpl, "compileMultiply", CompileMultiply);
  Nan::SetPrototypeMethod(tpl, "compileDivide", CompileDivide);
  Nan::SetPrototypeMethod(tpl, "compileMod", CompileMod);
  Nan::SetPrototypeMethod(tpl, "compileReturn", CompileReturn);
  Nan::SetPrototypeMethod(tpl, "createVariable", CreateVariable);
  Nan::SetPrototypeMethod(tpl, "storeVariable", StoreVariable);
  Nan::SetPrototypeMethod(tpl, "loadVariable", LoadVariable);
  Nan::SetPrototypeMethod(tpl, "executeMain", ExecuteMain);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("CompilerBridge").ToLocalChecked(), tpl->GetFunction());
}

llvm::Type*
MJCompiler::TypeForEnum(int num) {
    if (num == 1) {
        return llvm::Type::getInt8Ty(compiler->GetContext());
    } else if (num == 2) {
        return llvm::Type::getInt16Ty(compiler->GetContext());
    } else if (num == 3) {
        return llvm::Type::getInt32Ty(compiler->GetContext());
    } else if (num == 4) {
        return llvm::Type::getInt64Ty(compiler->GetContext());
    } else if (num == 5) {
        return llvm::Type::getFloatTy(compiler->GetContext());
    } else if (num == 6) {
        return llvm::Type::getDoubleTy(compiler->GetContext());
    } else if (num == 7) {
        return llvm::Type::getInt8Ty(compiler->GetContext())->getPointerTo();
    } else {
        return llvm::Type::getVoidTy(compiler->GetContext());
    }
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

  int mode = info[0]->NumberValue();
  MLVCompiler::SetDumpMode((MLVDumpMode)mode);

  bridge->compiler->EndModule();

  info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::DeclareString(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _str(info[0]->ToString());
    std::string str = std::string(*_str);

    llvm::Value* ret = bridge->compiler->DeclareString(str);
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::DeclareFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    int retEnum = info[1]->NumberValue();
    llvm::Type* retType = bridge->TypeForEnum(retEnum);
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        Handle<Value> val = array1->Get(i);
        int num = val->NumberValue();
        llvm::Type* type = bridge->TypeForEnum(num);
        argTypes.push_back(type);
    }

    llvm::Value* ret = bridge->compiler->DeclareFunction(name, retType, argTypes);
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::BeginFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    int retEnum = info[1]->NumberValue();
    llvm::Type* retType = bridge->TypeForEnum(retEnum);
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        Handle<Value> val = array1->Get(i);
        int num = val->NumberValue();
        llvm::Type* type = bridge->TypeForEnum(num);
        argTypes.push_back(type);
    }

    std::vector<std::string> argNames;
    Handle<Array> array2 = Handle<Array>::Cast(info[3]);
    for (unsigned int i = 0; i < array2->Length(); i++) {
        Handle<Value> val = array2->Get(i);
        String::Utf8Value _argName(val->ToString());
        std::string argName = std::string(*_argName);
        argNames.push_back(argName);
    }
    
    std::vector<llvm::Value*> ret = bridge->compiler->BeginFunction(name, retType, argTypes, argNames);

    Isolate* isolate = info.GetIsolate();
    Local<Array> returns = Array::New(isolate);

    unsigned i = 0;
    for (llvm::Value* retValue : ret) {
        returns->Set(i, MJValue::Create(retValue));
        ++i;
    }

    info.GetReturnValue().Set(returns);
}

void MJCompiler::EndFunction(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  bridge->compiler->EndFunction();

  info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::CompileInteger(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    size_t size = info[0]->NumberValue();
    int num = info[1]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileInteger(size, num);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CompileFloat(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    float num = info[0]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileFloat(num);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CompileDouble(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    double num = info[0]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileDouble(num);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CastNumber(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
    MJValue* numValue = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    int typeEnum = info[1]->NumberValue();
    llvm::Type* type = bridge->TypeForEnum(typeEnum);
    
    llvm::Value* value = bridge->compiler->CastNumber(numValue->GetValue(), type);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CreateVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    int typeEnum = info[1]->NumberValue();
    llvm::Type* type = bridge->TypeForEnum(typeEnum);
    
    llvm::Value* value = bridge->compiler->CreateVariable(name, type);

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
  
    MJValue* callable = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));

    Handle<Array> jsArray = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> args(jsArray->Length());
    for (unsigned int i = 0; i < jsArray->Length(); i++) {
        Handle<Value> val = jsArray->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MJValue* arg = ObjectWrap::Unwrap<MJValue>(object);
        args[i] = arg->GetValue();
    }
        
    llvm::Value* ret = bridge->compiler->CompileCall(callable->GetValue(), args);
    if (ret) {
        info.GetReturnValue().Set(MJValue::Create(ret));
    } else {
        info.GetReturnValue().Set(Nan::Undefined());
    }
}

void MJCompiler::CompileNegate(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* operand = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    
    llvm::Value* ret = bridge->compiler->CompileNegate(operand->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileAdd(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileAdd(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileSubtract(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileSubtract(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileMultiply(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileMultiply(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileDivide(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileDivide(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileMod(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileMod(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileReturn(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* expr = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->CompileReturn(expr->GetValue());
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::ExecuteMain(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
  bridge->compiler->ExecuteMain();
  
  info.GetReturnValue().Set(Nan::Undefined());
}
