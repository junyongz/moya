#include "MoJType.h"

Nan::Persistent<v8::Function> MoJType::constructor;

MoJType::MoJType() {
    type = NULL;
}

MoJType::~MoJType() {
}

llvm::Type*
MoJType::GetType() const {
    return type;
}

void MoJType::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Type").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Type").ToLocalChecked(), tpl->GetFunction());
}

v8::Local<v8::Object> MoJType::Create(llvm::Type* _type) {
    Nan::EscapableHandleScope scope;

    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    v8::Local<v8::Object> instance = cons->NewInstance();

    MoJType* self = ObjectWrap::Unwrap<MoJType>(instance);
    self->type = _type;
        
    return scope.Escape(instance);
}

void MoJType::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  if (info.IsConstructCall()) {
    MoJType* obj = new MoJType();
    obj->Wrap(info.This());
    
    info.GetReturnValue().Set(info.This());
  }
}
