#ifndef MJTYPE_H
#define MJTYPE_H

#include <nan.h>

#include "llvm/IR/Metadata.h"

class MoJType : public Nan::ObjectWrap {
public:
    static void Init(v8::Local<v8::Object> exports);

    static v8::Local<v8::Object> Create(llvm::Type*);
    
    llvm::Type* GetType() const;
    
private:
    llvm::Type* type;
    
private:
    MoJType();
    ~MoJType();

    static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
        
    static Nan::Persistent<v8::Function> constructor;
};

#endif
