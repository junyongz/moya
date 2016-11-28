#include "MoJDIScope.h"

Nan::Persistent<v8::Function> MoJDIScope::constructor;

MoJDIScope::MoJDIScope() {
    scope = NULL;
}

MoJDIScope::~MoJDIScope() {
}

llvm::DIScope*
MoJDIScope::GetScope() const {
    return scope;
}

void MoJDIScope::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("DIScope").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("DIScope").ToLocalChecked(), tpl->GetFunction());
}

v8::Local<v8::Object> MoJDIScope::Create(llvm::DIScope* _scope) {
    Nan::EscapableHandleScope scope;

    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    v8::Local<v8::Object> instance = cons->NewInstance();

    MoJDIScope* self = ObjectWrap::Unwrap<MoJDIScope>(instance);
    self->scope = _scope;
        
    return scope.Escape(instance);
}

void MoJDIScope::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  if (info.IsConstructCall()) {
    MoJDIScope* obj = new MoJDIScope();
    obj->Wrap(info.This());
    
    info.GetReturnValue().Set(info.This());
  }
}
