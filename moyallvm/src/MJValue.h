#ifndef MJVALUE_H
#define MJVALUE_H

#include <nan.h>

#include "llvm/IR/Metadata.h"

class MJValue : public Nan::ObjectWrap {
public:
    static void Init(v8::Local<v8::Object> exports);

    static v8::Local<v8::Object> Create(llvm::Value*);
    
    llvm::Value* GetValue() const;
    
private:
    llvm::Value* value;
    
private:
    MJValue();
    ~MJValue();

    static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);

    static void BeginModule(const Nan::FunctionCallbackInfo<v8::Value>& info);

    static Nan::Persistent<v8::Function> constructor;
};

#endif
