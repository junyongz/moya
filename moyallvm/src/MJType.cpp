#include "MJType.h"

Nan::Persistent<v8::Function> MJType::constructor;

MJType::MJType() {
    type = NULL;
}

MJType::~MJType() {
}

llvm::Type*
MJType::GetType() const {
    return type;
}

void MJType::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Type").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Type").ToLocalChecked(), tpl->GetFunction());
}

v8::Local<v8::Object> MJType::Create(llvm::Type* _type) {
    Nan::EscapableHandleScope scope;

    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    v8::Local<v8::Object> instance = cons->NewInstance();

    MJType* self = ObjectWrap::Unwrap<MJType>(instance);
    self->type = _type;
        
    return scope.Escape(instance);
}

void MJType::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  if (info.IsConstructCall()) {
    MJType* obj = new MJType();
    obj->Wrap(info.This());
    
    info.GetReturnValue().Set(info.This());
  }
}
