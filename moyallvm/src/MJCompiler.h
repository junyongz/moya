#ifndef MJCOMPILER_H
#define MJCOMPILER_H

#include <nan.h>
#include "MLVCompiler.h"

class MJCompiler : public Nan::ObjectWrap {
public:
    static void Init(v8::Local<v8::Object> exports);

private:
    MLVCompiler* compiler;
    
    explicit MJCompiler();
    ~MJCompiler();

    static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);

    static void GetType(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void GetFunctionType(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CreateStruct(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void GetTypeSize(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void SetStructBody(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void GetPointerType(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void BeginModule(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void EndModule(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void GetInsertBlock(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void SetInsertBlock(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void IsBlockEmpty(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void EraseBlock(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CreateBlock(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CreateClassTable(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void DeclareString(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void DeclareExternalFunction(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void DeclareFunction(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileInteger(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileFloat(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileDouble(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CastNumber(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileBitcast(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileCall(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileEquals(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileNotEquals(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileGreaterThan(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileGreaterThanEquals(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileLessThan(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileLessThanEquals(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileNegate(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileAdd(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileSubtract(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileMultiply(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileDivide(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileMod(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileReturn(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileJump(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompileConditionalJump(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CompilePhi(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void CreateVariable(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void StoreVariable(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void LoadVariable(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void GetPointer(const Nan::FunctionCallbackInfo<v8::Value>& info);
    static void ExecuteMain(const Nan::FunctionCallbackInfo<v8::Value>& info);

    static Nan::Persistent<v8::Function> constructor;
};

#endif
