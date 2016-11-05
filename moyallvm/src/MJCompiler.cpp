#include "MJCompiler.h"
#include "MJValue.h"
#include "MJType.h"

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
  Nan::SetPrototypeMethod(tpl, "getType", GetType);
  Nan::SetPrototypeMethod(tpl, "createStruct", CreateStruct);
  Nan::SetPrototypeMethod(tpl, "setStructBody", SetStructBody);
  Nan::SetPrototypeMethod(tpl, "getPointerType", GetPointerType);
  Nan::SetPrototypeMethod(tpl, "beginModule", BeginModule);
  Nan::SetPrototypeMethod(tpl, "endModule", EndModule);
  Nan::SetPrototypeMethod(tpl, "getInsertBlock", GetInsertBlock);
  Nan::SetPrototypeMethod(tpl, "setInsertBlock", SetInsertBlock);
  Nan::SetPrototypeMethod(tpl, "isBlockEmpty", IsBlockEmpty);
  Nan::SetPrototypeMethod(tpl, "eraseBlock", EraseBlock);
  Nan::SetPrototypeMethod(tpl, "createBlock", CreateBlock);
  Nan::SetPrototypeMethod(tpl, "declareExternalFunction", DeclareExternalFunction);
  Nan::SetPrototypeMethod(tpl, "declareFunction", DeclareFunction);
  Nan::SetPrototypeMethod(tpl, "declareString", DeclareString);
  Nan::SetPrototypeMethod(tpl, "compileInteger", CompileInteger);
  Nan::SetPrototypeMethod(tpl, "compileFloat", CompileFloat);
  Nan::SetPrototypeMethod(tpl, "compileDouble", CompileDouble);
  Nan::SetPrototypeMethod(tpl, "castNumber", CastNumber);
  Nan::SetPrototypeMethod(tpl, "compileBitcast", CompileBitcast);
  Nan::SetPrototypeMethod(tpl, "compileCall", CompileCall);
  Nan::SetPrototypeMethod(tpl, "compileEquals", CompileEquals);
  Nan::SetPrototypeMethod(tpl, "compileNotEquals", CompileNotEquals);
  Nan::SetPrototypeMethod(tpl, "compileGreaterThan", CompileGreaterThan);
  Nan::SetPrototypeMethod(tpl, "compileGreaterThanEquals", CompileGreaterThanEquals);
  Nan::SetPrototypeMethod(tpl, "compileLessThan", CompileLessThan);
  Nan::SetPrototypeMethod(tpl, "compileLessThanEquals", CompileLessThanEquals);
  Nan::SetPrototypeMethod(tpl, "compileNegate", CompileNegate);
  Nan::SetPrototypeMethod(tpl, "compileAdd", CompileAdd);
  Nan::SetPrototypeMethod(tpl, "compileSubtract", CompileSubtract);
  Nan::SetPrototypeMethod(tpl, "compileMultiply", CompileMultiply);
  Nan::SetPrototypeMethod(tpl, "compileDivide", CompileDivide);
  Nan::SetPrototypeMethod(tpl, "compileMod", CompileMod);
  Nan::SetPrototypeMethod(tpl, "compileReturn", CompileReturn);
  Nan::SetPrototypeMethod(tpl, "compileJump", CompileJump);
  Nan::SetPrototypeMethod(tpl, "compileConditionalJump", CompileConditionalJump);
  Nan::SetPrototypeMethod(tpl, "compilePhi", CompilePhi);
  Nan::SetPrototypeMethod(tpl, "createVariable", CreateVariable);
  Nan::SetPrototypeMethod(tpl, "storeVariable", StoreVariable);
  Nan::SetPrototypeMethod(tpl, "loadVariable", LoadVariable);
  Nan::SetPrototypeMethod(tpl, "getPointer", GetPointer);
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

void MJCompiler::GetType(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    int typeCode = info[0]->NumberValue();
    llvm::Type* retType = bridge->compiler->GetType(typeCode);

    info.GetReturnValue().Set(MJType::Create(retType));
}

void MJCompiler::CreateStruct(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* retType = bridge->compiler->CreateStruct(name);
    info.GetReturnValue().Set(MJType::Create(retType));
}

void MJCompiler::SetStructBody(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    MJType* mjtype = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[0]));
    llvm::StructType* structType = static_cast<llvm::StructType*>(mjtype->GetType());
    
    std::vector<llvm::Type*> body;
    Handle<Array> array1 = Handle<Array>::Cast(info[1]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        Handle<Value> val = array1->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MJType* mjtype = ObjectWrap::Unwrap<MJType>(object);
        llvm::Type* type = mjtype->GetType();
        body.push_back(type);
    }
    
    uint64_t size = bridge->compiler->SetStructBody(structType, body);

    info.GetReturnValue().Set(Nan::New<v8::Number>(size));
}

void MJCompiler::GetPointerType(const Nan::FunctionCallbackInfo<Value>& info) {
    // MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    MJType* mjtype = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[0]));
    llvm::Type* type = static_cast<llvm::StructType*>(mjtype->GetType());
    
    info.GetReturnValue().Set(MJType::Create(type->getPointerTo()));
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

void MJCompiler::GetInsertBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    llvm::Value* value = bridge->compiler->GetInsertBlock();
    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::SetInsertBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
    MJValue* block = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->SetInsertBlock(block->GetValue());
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::IsBlockEmpty(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
    MJValue* block = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    
    bool isEmpty = bridge->compiler->IsBlockEmpty(block->GetValue());
    
    info.GetReturnValue().Set(Nan::New<v8::Boolean>(isEmpty));
}

void MJCompiler::EraseBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
    MJValue* block = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->EraseBlock(block->GetValue());
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::CreateBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Function* func = NULL;
    if (info.Length() > 1) {
        MJValue* funcWrapped = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
        func = static_cast<llvm::Function*>(funcWrapped->GetValue());
    }
    
    llvm::Value* value = bridge->compiler->CreateBlock(name, func);
    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::DeclareExternalFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* retType = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[1]))->GetType();
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Type* type = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(array1->Get(i)))->GetType();
        argTypes.push_back(type);
    }

    llvm::Value* ret = bridge->compiler->DeclareExternalFunction(name, retType, argTypes);
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::DeclareFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* retType = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[1]))->GetType();
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Type* type = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(array1->Get(i)))->GetType();
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
    
    std::vector<llvm::Value*> ret = bridge->compiler->DeclareFunction(name, retType, argTypes,
                                                                      argNames);

    Isolate* isolate = info.GetIsolate();
    Local<Array> returns = Array::New(isolate);

    unsigned i = 0;
    for (llvm::Value* retValue : ret) {
        returns->Set(i, MJValue::Create(retValue));
        ++i;
    }

    info.GetReturnValue().Set(returns);
}

void MJCompiler::DeclareString(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    String::Utf8Value _str(info[0]->ToString());
    std::string str = std::string(*_str);

    llvm::Value* ret = bridge->compiler->DeclareString(str);
    info.GetReturnValue().Set(MJValue::Create(ret));
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
    llvm::Type* type = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[1]))->GetType();
    
    llvm::Value* value = bridge->compiler->CastNumber(numValue->GetValue(), type);

    info.GetReturnValue().Set(MJValue::Create(value));
}

void MJCompiler::CompileBitcast(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    MJValue* value = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJType* type = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileBitcast(value->GetValue(), type->GetType());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CreateVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* type = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[1]))->GetType();
    
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

void MJCompiler::GetPointer(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* obj = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));

    Handle<Array> jsArray = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> offsets(jsArray->Length());
    for (unsigned int i = 0; i < jsArray->Length(); i++) {
        Handle<Value> val = jsArray->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MJValue* offset = ObjectWrap::Unwrap<MJValue>(object);
        offsets[i] = offset->GetValue();
    }

    llvm::Value* ret = bridge->compiler->GetPointer(obj->GetValue(), offsets);
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

void MJCompiler::CompileEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileNotEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileNotEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileGreaterThan(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileGreaterThan(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileGreaterThanEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileGreaterThanEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileLessThan(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileLessThan(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
}

void MJCompiler::CompileLessThanEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* lhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* rhs = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileLessThanEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MJValue::Create(ret));
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
  
    if (info.Length()) {
        MJValue* expr = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
        bridge->compiler->CompileReturn(expr->GetValue());
    } else {
        bridge->compiler->CompileReturn(NULL);
    }
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::CompileJump(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* label = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->CompileJump(label->GetValue());
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::CompileConditionalJump(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    MJValue* cond = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[0]));
    MJValue* label1 = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[1]));
    MJValue* label2 = ObjectWrap::Unwrap<MJValue>(Handle<Object>::Cast(info[2]));
    
    bridge->compiler->CompileConditionalJump(cond->GetValue(), label1->GetValue(), label2->GetValue());
    info.GetReturnValue().Set(Nan::Undefined());
}

void MJCompiler::CompilePhi(const Nan::FunctionCallbackInfo<Value>& info) {
    MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
  
    llvm::Type* phiType = ObjectWrap::Unwrap<MJType>(Handle<Object>::Cast(info[0]))->GetType();

    Handle<Array> jsExprs = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> exprs(jsExprs->Length());
    for (unsigned int i = 0; i < jsExprs->Length(); i++) {
        Handle<Value> val = jsExprs->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MJValue* arg = ObjectWrap::Unwrap<MJValue>(object);
        exprs[i] = arg->GetValue();
    }

    Handle<Array> jsBlocks = Handle<Array>::Cast(info[2]);
    std::vector<llvm::Value*> blocks(jsBlocks->Length());
    for (unsigned int i = 0; i < jsBlocks->Length(); i++) {
        Handle<Value> val = jsBlocks->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MJValue* arg = ObjectWrap::Unwrap<MJValue>(object);
        blocks[i] = arg->GetValue();
    }
    
    llvm::Value* phi = bridge->compiler->CompilePHI(phiType, exprs, blocks);
    info.GetReturnValue().Set(MJValue::Create(phi));
}

void MJCompiler::ExecuteMain(const Nan::FunctionCallbackInfo<Value>& info) {
  MJCompiler* bridge = ObjectWrap::Unwrap<MJCompiler>(info.Holder());
    
  bridge->compiler->ExecuteMain();
  
  info.GetReturnValue().Set(Nan::Undefined());
}
