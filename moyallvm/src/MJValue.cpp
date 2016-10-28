#include "MJValue.h"

Nan::Persistent<v8::Function> MJValue::constructor;

MJValue::MJValue() {
    value = NULL;
}

MJValue::~MJValue() {
    // delete compiler;
}

llvm::Value*
MJValue::GetValue() const {
    return value;
}

void MJValue::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Value").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(tpl, "beginModule", BeginModule);
  
  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Value").ToLocalChecked(), tpl->GetFunction());
}

v8::Local<v8::Object> MJValue::Create(llvm::Value* _value) {
    Nan::EscapableHandleScope scope;

    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    v8::Local<v8::Object> instance = cons->NewInstance();

    MJValue* self = ObjectWrap::Unwrap<MJValue>(instance);
    self->value = _value;
        
    return scope.Escape(instance);
}

void MJValue::New(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  if (info.IsConstructCall()) {
    MJValue* obj = new MJValue();
    obj->Wrap(info.This());
    
    info.GetReturnValue().Set(info.This());
  }
}

void MJValue::BeginModule(const Nan::FunctionCallbackInfo<v8::Value>& info) {
  MJValue* self = ObjectWrap::Unwrap<MJValue>(info.Holder());
  // v8::String::Utf8Value _name(info[0]->ToString());
  // std::string name = std::string(*_name);
  // bridge->compiler->BeginModule(name);
  //
  // info.GetReturnValue().Set(Nan::New(3));
}
