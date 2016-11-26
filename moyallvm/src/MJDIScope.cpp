#include "MJDIScope.h"

Nan::Persistent<v8::Function> MJDIScope::constructor;

MJDIScope::MJDIScope() {
    scope = NULL;
}

MJDIScope::~MJDIScope() {
}

llvm::DIScope*
MJDIScope::GetScope() const {
    return scope;
}

void MJDIScope::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("DIScope").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("DIScope").ToLocalChecked(), tpl->GetFunction());
}

v8::Local<v8::Object> MJDIScope::Create(llvm::DIScope* _scope) {
    Nan::EscapableHandleScope scope;

    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    v8::Local<v8::Object> instance = cons->NewInstance();

    MJDIScope* self = ObjectWrap::Unwrap<MJDIScope>(instance);
    self->scope = _scope;
        
    return scope.Escape(instance);
}

void MJDIScope::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  if (info.IsConstructCall()) {
    MJDIScope* obj = new MJDIScope();
    obj->Wrap(info.This());
    
    info.GetReturnValue().Set(info.This());
  }
}
