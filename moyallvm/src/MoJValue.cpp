#include "MoJValue.h"

Nan::Persistent<v8::Function> MoJValue::constructor;

MoJValue::MoJValue() {
    value = NULL;
}

MoJValue::~MoJValue() {
}

llvm::Value*
MoJValue::GetValue() const {
    return value;
}

void MoJValue::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Value").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Value").ToLocalChecked(), tpl->GetFunction());
}

v8::Local<v8::Object> MoJValue::Create(llvm::Value* _value) {
    Nan::EscapableHandleScope scope;

    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    v8::Local<v8::Object> instance = cons->NewInstance();

    MoJValue* self = ObjectWrap::Unwrap<MoJValue>(instance);
    self->value = _value;
        
    return scope.Escape(instance);
}

void MoJValue::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  if (info.IsConstructCall()) {
    MoJValue* obj = new MoJValue();
    obj->Wrap(info.This());
    
    info.GetReturnValue().Set(info.This());
  }
}
