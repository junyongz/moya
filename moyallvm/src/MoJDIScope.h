#ifndef MJDISCOPE_H
#define MJDISCOPE_H

#include <nan.h>

#include "llvm/IR/DIBuilder.h"

class MoJDIScope : public Nan::ObjectWrap {
public:
    static void Init(v8::Local<v8::Object> exports);

    static v8::Local<v8::Object> Create(llvm::DIScope*);
    
    llvm::DIScope* GetScope() const;
    
private:
    llvm::DIScope* scope;
    
private:
    MoJDIScope();
    ~MoJDIScope();

    static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
        
    static Nan::Persistent<v8::Function> constructor;
};

#endif
