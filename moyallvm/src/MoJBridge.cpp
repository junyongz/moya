#include "MoJBridge.h"
#include "MoJValue.h"
#include "MoJType.h"
#include "MoJDIScope.h"

#include "llvm/ADT/APInt.h"
#include "llvm/ADT/APSInt.h"

using namespace v8;

Nan::Persistent<Function> MoJBridge::constructor;

MoJBridge::MoJBridge() {
    compiler = new MoLLVMBridge();
}

MoJBridge::~MoJBridge() {
    delete compiler;
}

void MoJBridge::Init(Local<Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  Local<FunctionTemplate> tpl = Nan::New<FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("CompilerBridge").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(tpl, "createDebugModule", CreateDebugModule);
  Nan::SetPrototypeMethod(tpl, "createDebugFunction", CreateDebugFunction);
  Nan::SetPrototypeMethod(tpl, "createDebugVariable", CreateDebugVariable);
  Nan::SetPrototypeMethod(tpl, "setDebugLocation", SetDebugLocation);

  Nan::SetPrototypeMethod(tpl, "getType", GetType);
  Nan::SetPrototypeMethod(tpl, "getGlobal", GetGlobal);
  Nan::SetPrototypeMethod(tpl, "getFunctionType", GetFunctionType);
  Nan::SetPrototypeMethod(tpl, "getFunctionSignatureType", GetFunctionSignatureType);
  Nan::SetPrototypeMethod(tpl, "getPointerType", GetPointerType);
  Nan::SetPrototypeMethod(tpl, "getTypeSize", GetTypeSize);
  Nan::SetPrototypeMethod(tpl, "createStructType", CreateStructType);
  Nan::SetPrototypeMethod(tpl, "setStructBody", SetStructBody);
  Nan::SetPrototypeMethod(tpl, "createStruct", CreateStruct);
  Nan::SetPrototypeMethod(tpl, "extractValue", ExtractValue);
  Nan::SetPrototypeMethod(tpl, "insertValue", InsertValue);
  Nan::SetPrototypeMethod(tpl, "beginModule", BeginModule);
  Nan::SetPrototypeMethod(tpl, "endModule", EndModule);
  Nan::SetPrototypeMethod(tpl, "emitObject", EmitObject);
  Nan::SetPrototypeMethod(tpl, "getInsertBlock", GetInsertBlock);
  Nan::SetPrototypeMethod(tpl, "setInsertBlock", SetInsertBlock);
  Nan::SetPrototypeMethod(tpl, "isBlockEmpty", IsBlockEmpty);
  Nan::SetPrototypeMethod(tpl, "eraseBlock", EraseBlock);
  Nan::SetPrototypeMethod(tpl, "createBlock", CreateBlock);
  Nan::SetPrototypeMethod(tpl, "createClassTable", CreateClassTable);
  Nan::SetPrototypeMethod(tpl, "declareExternalFunction", DeclareExternalFunction);
  Nan::SetPrototypeMethod(tpl, "declareFunction", DeclareFunction);
  Nan::SetPrototypeMethod(tpl, "declareString", DeclareString);
  Nan::SetPrototypeMethod(tpl, "compileNull", CompileNull);
  Nan::SetPrototypeMethod(tpl, "compileInteger", CompileInteger);
  Nan::SetPrototypeMethod(tpl, "compileFloat", CompileFloat);
  Nan::SetPrototypeMethod(tpl, "compileDouble", CompileDouble);
  Nan::SetPrototypeMethod(tpl, "castNumber", CastNumber);
  Nan::SetPrototypeMethod(tpl, "compileBitcast", CompileBitcast);
  Nan::SetPrototypeMethod(tpl, "compileCall", CompileCall);
  Nan::SetPrototypeMethod(tpl, "compileInvoke", CompileInvoke);
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
  Nan::SetPrototypeMethod(tpl, "compileLandingPad", CompileLandingPad);
  Nan::SetPrototypeMethod(tpl, "compileResume", CompileResume);
  Nan::SetPrototypeMethod(tpl, "compileCatchSwitch", CompileCatchSwitch);
  Nan::SetPrototypeMethod(tpl, "compileCatchPad", CompileCatchPad);
  Nan::SetPrototypeMethod(tpl, "compileCatchRet", CompileCatchRet);
  Nan::SetPrototypeMethod(tpl, "compileCleanupPad", CompileCleanupPad);
  Nan::SetPrototypeMethod(tpl, "compileCleanupRet", CompileCleanupRet);
  Nan::SetPrototypeMethod(tpl, "compileUnreachable", CompileUnreachable);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("CompilerBridge").ToLocalChecked(), tpl->GetFunction());
}

void MoJBridge::New(const Nan::FunctionCallbackInfo<Value>& info) {
  if (info.IsConstructCall()) {
    MoJBridge* obj = new MoJBridge();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  }
}

void MoJBridge::CreateDebugModule(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);
    
    String::Utf8Value _dirPath(info[1]->ToString());
    std::string dirPath = std::string(*_dirPath);

    llvm::DIScope* scope = bridge->compiler->CreateDebugModule(name, dirPath);
    info.GetReturnValue().Set(MoJDIScope::Create(scope));
}

void MoJBridge::CreateDebugFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);
    MoJDIScope* unitv = ObjectWrap::Unwrap<MoJDIScope>(Handle<Object>::Cast(info[1]));
    llvm::DIFile* unit = static_cast<llvm::DIFile*>(unitv->GetScope());
    
    MoJValue* funcv = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[2]));
    llvm::Function* func = static_cast<llvm::Function*>(funcv->GetValue());
    int argCount = info[3]->NumberValue();
    int lineNo = info[4]->NumberValue();
    
    llvm::DIScope* scope = bridge->compiler->CreateDebugFunction(name, unit, func, argCount,
                                                                 lineNo);

    info.GetReturnValue().Set(MoJDIScope::Create(scope));
}

void MoJBridge::CreateDebugVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);
    
    MoJDIScope* unitv = ObjectWrap::Unwrap<MoJDIScope>(Handle<Object>::Cast(info[1]));
    llvm::DIFile* unit = static_cast<llvm::DIFile*>(unitv->GetScope());
    
    llvm::DIScope* scope = ObjectWrap::Unwrap<MoJDIScope>(Handle<Object>::Cast(info[2]))->GetScope();

    llvm::Value* alloca = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[3]))->GetValue();
    llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[4]))->GetType();
    
    int argNo = info[5]->NumberValue();
    int lineNo = info[6]->NumberValue();
    
    bridge->compiler->CreateDebugVariable(name, unit, scope, alloca, type, argNo, lineNo);

    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::SetDebugLocation(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    int line = info[0]->NumberValue();
    int col = info[1]->NumberValue();
    MoJDIScope* unitv = ObjectWrap::Unwrap<MoJDIScope>(Handle<Object>::Cast(info[2]));

    bridge->compiler->SetDebugLocation(line, col, unitv->GetScope());

    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::GetType(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    int typeCode = info[0]->NumberValue();
    llvm::Type* retType = bridge->compiler->GetType(typeCode);

    info.GetReturnValue().Set(MoJType::Create(retType));
}

void MoJBridge::GetGlobal(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]))->GetType();

    String::Utf8Value _name(info[1]->ToString());
    std::string name = std::string(*_name);
    
    MoJValue* valv = info[2] != Nan::Null()
        ? ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[2]))
        : NULL;
    llvm::Constant* value = valv
        ? static_cast<llvm::Constant*>(valv->GetValue())
        : NULL;
    
    llvm::Value* val = bridge->compiler->GetGlobal(type, name, value);
    info.GetReturnValue().Set(MoJValue::Create(val));
}

void MoJBridge::GetFunctionSignatureType(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Type* retType = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]))->GetType();
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[1]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(array1->Get(i)))->GetType();
        argTypes.push_back(type);
    }

    llvm::Type* funcType = bridge->compiler->GetFunctionSignatureType(retType, argTypes);
    info.GetReturnValue().Set(MoJType::Create(funcType));
}

void MoJBridge::GetFunctionType(const Nan::FunctionCallbackInfo<Value>& info) {
    // MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJValue* value = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    llvm::Function* function = static_cast<llvm::Function*>(value->GetValue());
    llvm::Type* funcType = function->getFunctionType()->getPointerTo();
    
    info.GetReturnValue().Set(MoJType::Create(funcType));
}

void MoJBridge::GetPointerType(const Nan::FunctionCallbackInfo<Value>& info) {
    // MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJType* mjtype = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]));
    llvm::Type* type = static_cast<llvm::StructType*>(mjtype->GetType());
    
    info.GetReturnValue().Set(MoJType::Create(type->getPointerTo()));
}

void MoJBridge::GetTypeSize(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJType* mjtype = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]));
    llvm::Type* type = mjtype->GetType();
    uint64_t size = bridge->compiler->GetTypeSize(type);
    
    info.GetReturnValue().Set(Nan::New<v8::Number>(size));
}

void MoJBridge::CreateStructType(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* retType = bridge->compiler->CreateStructType(name);
    info.GetReturnValue().Set(MoJType::Create(retType));
}

void MoJBridge::SetStructBody(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJType* mjtype = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]));
    llvm::StructType* structType = static_cast<llvm::StructType*>(mjtype->GetType());
    
    std::vector<llvm::Type*> body;
    Handle<Array> array1 = Handle<Array>::Cast(info[1]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        Handle<Value> val = array1->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJType* mjtype = ObjectWrap::Unwrap<MoJType>(object);
        llvm::Type* type = mjtype->GetType();
        body.push_back(type);
    }
    
    uint64_t size = bridge->compiler->SetStructBody(structType, body);

    info.GetReturnValue().Set(Nan::New<v8::Number>(size));
}

void MoJBridge::CreateStruct(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJType* mjtype = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]));
    llvm::StructType* structType = static_cast<llvm::StructType*>(mjtype->GetType());

    std::vector<llvm::Constant*> values;
    Handle<Array> array1 = Handle<Array>::Cast(info[1]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Value* value = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(array1->Get(i)))->GetValue();
        values.push_back((llvm::Constant*)value);
    }
    
    llvm::Value* structVal = bridge->compiler->CreateStruct(structType, values);
    info.GetReturnValue().Set(MoJValue::Create(structVal));
}

void MoJBridge::ExtractValue(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJValue* agg = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    int index = info[1]->NumberValue();

    if (info.Length() > 2) {
        String::Utf8Value _name(info[2]->ToString());
        std::string name = std::string(*_name);
        
        llvm::Value* ret = bridge->compiler->ExtractValue(agg->GetValue(), index, name);
        info.GetReturnValue().Set(MoJValue::Create(ret));
    } else {
        llvm::Value* ret = bridge->compiler->ExtractValue(agg->GetValue(), index, "");
        info.GetReturnValue().Set(MoJValue::Create(ret));
    }
}

void MoJBridge::InsertValue(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJValue* agg = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    int index = info[1]->NumberValue();
    MoJValue* value = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[2]));

    llvm::Value* ret = bridge->compiler->InsertValue(agg->GetValue(), index, value->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::BeginModule(const Nan::FunctionCallbackInfo<Value>& info) {
  MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  String::Utf8Value _name(info[0]->ToString());
  std::string name = std::string(*_name);

  bool shouldDebug = info[1]->NumberValue();

  bool optLevel = info[2]->NumberValue();
  MoLLVMBridge::SetOptimizeLevel((MLVOptimizeLevel)optLevel);
  
  int mode = info[3]->NumberValue();
  MoLLVMBridge::SetDumpMode((MLVDumpMode)mode);
  
  bridge->compiler->BeginModule(name, shouldDebug);

  info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::EndModule(const Nan::FunctionCallbackInfo<Value>& info) {
  MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

  bridge->compiler->EndModule();

  info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::EmitObject(const Nan::FunctionCallbackInfo<Value>& info) {
  MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

  String::Utf8Value _path(info[0]->ToString());
  std::string path = std::string(*_path);

  int optLevel = info[1]->NumberValue();
  MoLLVMBridge::SetOptimizeLevel((MLVOptimizeLevel)optLevel);
  
  bridge->compiler->EmitObject(path);

  info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::ExecuteMain(const Nan::FunctionCallbackInfo<Value>& info) {
  MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

  bridge->compiler->ExecuteMain();
  
  info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::GetInsertBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    llvm::Value* value = bridge->compiler->GetInsertBlock();
    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::SetInsertBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    
    MoJValue* block = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->SetInsertBlock(block->GetValue());
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::IsBlockEmpty(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    
    MoJValue* block = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    
    bool isEmpty = bridge->compiler->IsBlockEmpty(block->GetValue());
    
    info.GetReturnValue().Set(Nan::New<v8::Boolean>(isEmpty));
}

void MoJBridge::EraseBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    
    MoJValue* block = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->EraseBlock(block->GetValue());
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::CreateBlock(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Function* func = NULL;
    if (info.Length() > 1) {
        MoJValue* funcWrapped = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
        func = static_cast<llvm::Function*>(funcWrapped->GetValue());
    }
    
    llvm::Value* value = bridge->compiler->CreateBlock(name, func);
    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::CreateClassTable(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);
    
    std::vector<llvm::Value*> functions;
    Handle<Array> array1 = Handle<Array>::Cast(info[1]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Value* value = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(array1->Get(i)))->GetValue();
        functions.push_back(value);
    }

    llvm::Value* table = bridge->compiler->CreateClassTable(name, functions);
    info.GetReturnValue().Set(MoJValue::Create(table));
}

void MoJBridge::DeclareExternalFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* retType = info[1] != Nan::Null()
        ? ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[1]))->GetType()
        : NULL;
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(array1->Get(i)))->GetType();
        argTypes.push_back(type);
    }

    llvm::Value* ret = bridge->compiler->DeclareExternalFunction(name, retType, argTypes);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::DeclareFunction(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* retType = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[1]))->GetType();
    
    std::vector<llvm::Type*> argTypes;
    Handle<Array> array1 = Handle<Array>::Cast(info[2]);
    for (unsigned int i = 0; i < array1->Length(); i++) {
        llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(array1->Get(i)))->GetType();
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

    int doesNotThrow = info[4]->NumberValue();
    
    std::vector<llvm::Value*> ret = bridge->compiler->DeclareFunction(name, retType, argTypes,
                                                                      argNames, doesNotThrow);
    
    Isolate* isolate = info.GetIsolate();
    Local<Array> returns = Array::New(isolate);

    unsigned i = 0;
    for (llvm::Value* retValue : ret) {
        returns->Set(i, MoJValue::Create(retValue));
        ++i;
    }

    info.GetReturnValue().Set(returns);
}

void MoJBridge::DeclareString(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    String::Utf8Value _str(info[0]->ToString());
    std::string str = std::string(*_str);

    llvm::Value* ret = bridge->compiler->DeclareString(str);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileNull(const Nan::FunctionCallbackInfo<Value>& info) {
    // MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]))->GetType();
    llvm::Value* null = llvm::Constant::getNullValue(type);
    
    info.GetReturnValue().Set(MoJValue::Create(null));
}

void MoJBridge::CompileInteger(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    size_t size = info[0]->NumberValue();
    int num = info[1]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileInteger(size, num);

    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::CompileFloat(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    float num = info[0]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileFloat(num);

    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::CompileDouble(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    double num = info[0]->NumberValue();
    llvm::Value* value = bridge->compiler->CompileDouble(num);

    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::CastNumber(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
    
    MoJValue* numValue = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[1]))->GetType();
    
    llvm::Value* value = bridge->compiler->CastNumber(numValue->GetValue(), type);

    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::CompileBitcast(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJValue* value = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJType* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileBitcast(value->GetValue(), type->GetType());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CreateVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    String::Utf8Value _name(info[0]->ToString());
    std::string name = std::string(*_name);

    llvm::Type* type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[1]))->GetType();
    
    llvm::Value* value = bridge->compiler->CreateVariable(name, type);

    info.GetReturnValue().Set(MoJValue::Create(value));
}

void MoJBridge::StoreVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    bridge->compiler->StoreVariable(lhs->GetValue(), rhs->GetValue());
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::LoadVariable(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* alloca = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    
    String::Utf8Value _name(info[1]->ToString());
    std::string name = std::string(*_name);
    
    llvm::Type* type = NULL;
    if (info.Length() > 2) {
        type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[2]))->GetType();
    }
    
    llvm::Value* ret = bridge->compiler->LoadVariable(alloca->GetValue(), name, type);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::GetPointer(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* obj = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));

    Handle<Array> jsArray = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> offsets(jsArray->Length());
    for (unsigned int i = 0; i < jsArray->Length(); i++) {
        Handle<Value> val = jsArray->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* offset = ObjectWrap::Unwrap<MoJValue>(object);
        offsets[i] = offset->GetValue();
    }

    llvm::Type* type = NULL;
    if (info.Length() > 2) {
        type = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[2]))->GetType();
    }

    llvm::Value* ret = bridge->compiler->GetPointer(obj->GetValue(), offsets, type);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileCall(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* callable = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));

    Handle<Array> jsArray = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> args(jsArray->Length());
    for (unsigned int i = 0; i < jsArray->Length(); i++) {
        Handle<Value> val = jsArray->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        args[i] = arg->GetValue();
    }
        
    llvm::Value* ret = bridge->compiler->CompileCall(callable->GetValue(), args);
    if (ret) {
        info.GetReturnValue().Set(MoJValue::Create(ret));
    } else {
        info.GetReturnValue().Set(Nan::Undefined());
    }
}

void MoJBridge::CompileInvoke(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* callable = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));

    Handle<Array> jsArray = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> args(jsArray->Length());
    for (unsigned int i = 0; i < jsArray->Length(); i++) {
        Handle<Value> val = jsArray->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        args[i] = arg->GetValue();
    }

    MoJValue* block1v = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[2]));
    llvm::BasicBlock* normalDest = static_cast<llvm::BasicBlock*>(block1v->GetValue());
    MoJValue* block2v = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[3]));
    llvm::BasicBlock* unwindDest = static_cast<llvm::BasicBlock*>(block2v->GetValue());
        
    llvm::Value* ret = bridge->compiler->CompileInvoke(callable->GetValue(), normalDest,
                                                       unwindDest, args);
    if (ret) {
        info.GetReturnValue().Set(MoJValue::Create(ret));
    } else {
        info.GetReturnValue().Set(Nan::Undefined());
    }
}

void MoJBridge::CompileEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileNotEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileNotEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileGreaterThan(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileGreaterThan(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileGreaterThanEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileGreaterThanEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileLessThan(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileLessThan(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileLessThanEquals(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileLessThanEquals(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileNegate(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* operand = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    
    llvm::Value* ret = bridge->compiler->CompileNegate(operand->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileAdd(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileAdd(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileSubtract(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileSubtract(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileMultiply(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileMultiply(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileDivide(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileDivide(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileMod(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* lhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* rhs = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    
    llvm::Value* ret = bridge->compiler->CompileMod(lhs->GetValue(), rhs->GetValue());
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileReturn(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    if (info.Length()) {
        MoJValue* expr = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
        bridge->compiler->CompileReturn(expr->GetValue());
    } else {
        bridge->compiler->CompileReturn(NULL);
    }
    
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::CompileJump(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* label = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    
    bridge->compiler->CompileJump(label->GetValue());
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::CompileConditionalJump(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    MoJValue* cond = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    MoJValue* label1 = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    MoJValue* label2 = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[2]));
    
    bridge->compiler->CompileConditionalJump(cond->GetValue(), label1->GetValue(), label2->GetValue());
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::CompilePhi(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    llvm::Type* phiType = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]))->GetType();

    Handle<Array> jsExprs = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> exprs(jsExprs->Length());
    for (unsigned int i = 0; i < jsExprs->Length(); i++) {
        Handle<Value> val = jsExprs->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        exprs[i] = arg->GetValue();
    }

    Handle<Array> jsBlocks = Handle<Array>::Cast(info[2]);
    std::vector<llvm::Value*> blocks(jsBlocks->Length());
    for (unsigned int i = 0; i < jsBlocks->Length(); i++) {
        Handle<Value> val = jsBlocks->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        blocks[i] = arg->GetValue();
    }
    
    llvm::Value* phi = bridge->compiler->CompilePHI(phiType, exprs, blocks);
    info.GetReturnValue().Set(MoJValue::Create(phi));
}

void MoJBridge::CompileLandingPad(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Type* padType = ObjectWrap::Unwrap<MoJType>(Handle<Object>::Cast(info[0]))->GetType();

    bool isCleanup = info[1]->NumberValue();

    Handle<Array> arg1 = Handle<Array>::Cast(info[2]);
    std::vector<llvm::Value*> clauses(arg1->Length());
    for (unsigned int i = 0; i < arg1->Length(); i++) {
        Handle<Value> val = arg1->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        clauses[i] = static_cast<llvm::Value*>(arg->GetValue());
    }
    
    llvm::Value* ret = bridge->compiler->CompileLandingPad(padType, isCleanup, clauses);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileResume(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Value* lpad = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]))->GetValue();
    
    bridge->compiler->CompileResume(lpad);
    info.GetReturnValue().Set(Nan::Undefined());
}

void MoJBridge::CompileCatchSwitch(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Value* parentPad = info[0] != Nan::Null()
        ? ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]))->GetValue()
        : bridge->compiler->CompileNone();

    MoJValue* ubv = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    llvm::BasicBlock* unwindBlock = ubv ? static_cast<llvm::BasicBlock*>(ubv->GetValue()) : NULL;

    Handle<Array> jsBlocks = Handle<Array>::Cast(info[2]);
    std::vector<llvm::BasicBlock*> handlers(jsBlocks->Length());
    for (unsigned int i = 0; i < jsBlocks->Length(); i++) {
        Handle<Value> val = jsBlocks->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        handlers[i] = static_cast<llvm::BasicBlock*>(arg->GetValue());
    }
    
    llvm::Value* ret = bridge->compiler->CompileCatchSwitch(parentPad, unwindBlock, handlers);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileCatchPad(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Value* parentPad = info[0] != Nan::Null()
        ? ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]))->GetValue()
        : bridge->compiler->CompileNone();

    Handle<Array> jsBlocks = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> args(jsBlocks->Length());
    for (unsigned int i = 0; i < jsBlocks->Length(); i++) {
        Handle<Value> val = jsBlocks->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        args[i] = arg->GetValue();
    }
    
    llvm::Value* ret = bridge->compiler->CompileCatchPad(parentPad, args);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileCatchRet(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    MoJValue* ppv = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]));
    llvm::CatchPadInst* catchPad = ppv ? static_cast<llvm::CatchPadInst*>(ppv->GetValue()) : NULL;

    MoJValue* ubv = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    llvm::BasicBlock* afterBlock = ubv ? static_cast<llvm::BasicBlock*>(ubv->GetValue()) : NULL;
    
    llvm::Value* ret = bridge->compiler->CompileCatchRet(catchPad, afterBlock);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileCleanupPad(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Value* parentPad = info[0] != Nan::Null()
        ? ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]))->GetValue()
        : bridge->compiler->CompileNone();

    Handle<Array> jsBlocks = Handle<Array>::Cast(info[1]);
    std::vector<llvm::Value*> args(jsBlocks->Length());
    for (unsigned int i = 0; i < jsBlocks->Length(); i++) {
        Handle<Value> val = jsBlocks->Get(i);
        Handle<Object> object = Handle<Object>::Cast(val);
        MoJValue* arg = ObjectWrap::Unwrap<MoJValue>(object);
        args[i] = arg->GetValue();
    }
    
    llvm::Value* ret = bridge->compiler->CompileCleanupPad(parentPad, args);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileCleanupRet(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());

    llvm::Value* arg0 = info[0] != Nan::Null()
        ? ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[0]))->GetValue()
        : bridge->compiler->CompileNone();

    llvm::CleanupReturnInst* cleanupPad = static_cast<llvm::CleanupReturnInst*>(arg0);
    
    MoJValue* ubv = ObjectWrap::Unwrap<MoJValue>(Handle<Object>::Cast(info[1]));
    llvm::BasicBlock* unwindBlock = ubv ? static_cast<llvm::BasicBlock*>(ubv->GetValue()) : NULL;
    
    llvm::Value* ret = bridge->compiler->CompileCleanupRet(cleanupPad, unwindBlock);
    info.GetReturnValue().Set(MoJValue::Create(ret));
}

void MoJBridge::CompileUnreachable(const Nan::FunctionCallbackInfo<Value>& info) {
    MoJBridge* bridge = ObjectWrap::Unwrap<MoJBridge>(info.Holder());
  
    bridge->compiler->CompileUnreachable();
    info.GetReturnValue().Set(Nan::Undefined());
}
