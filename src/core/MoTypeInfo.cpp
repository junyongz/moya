
// *************************************************************************************************
// Emulating the std::type_info class with our own MoyaTypeInfo
// The C++ exception unwinder expect objects that fit this interface

class MoyaTypeInfo {
public:
    virtual ~MoyaTypeInfo();

private:
    MoyaTypeInfo& operator=(const MoyaTypeInfo&);
    MoyaTypeInfo(const MoyaTypeInfo&);
    
protected:
    const char *__name;
    
public:
    explicit MoyaTypeInfo(const char *__n)
        : __name(__n) {
    }
    
public:
    const char* name() const { return __name; }

    bool before(const MoyaTypeInfo& __arg) const { return __name < __arg.__name; }
    bool operator==(const MoyaTypeInfo& __arg) const { return __name == __arg.__name; }
    bool operator!=(const MoyaTypeInfo& __arg) const { return !operator==(__arg); }
    
  public:
    virtual bool __is_pointer_p() const;
    virtual bool __is_function_p() const;

    virtual bool
    __do_catch(const MoyaTypeInfo *__thr_type, void **__thr_obj, unsigned __outer) const;

    virtual bool
    __do_upcast(const MoyaTypeInfo *__target, void **__obj_ptr) const;
};

// *************************************************************************************************

MoyaTypeInfo::MoyaTypeInfo(const MoyaTypeInfo&  other) {
}

MoyaTypeInfo::~MoyaTypeInfo() {
}

MoyaTypeInfo&
MoyaTypeInfo::operator=(const MoyaTypeInfo& other) {
    return *this;
}
    
bool
MoyaTypeInfo::__is_pointer_p() const {
    return false;
}

bool
MoyaTypeInfo::__is_function_p() const {
    return false;
}

bool
MoyaTypeInfo::__do_catch(const MoyaTypeInfo *__thr_type, void **__thr_obj, unsigned __outer) const {
    return false;
}

bool
MoyaTypeInfo::__do_upcast(const MoyaTypeInfo*__target, void **__obj_ptr) const {
    return false;
}

// *************************************************************************************************

extern "C" char*
moyaCreateTypeInfo(const char* name) {
    MoyaTypeInfo* ti = new MoyaTypeInfo(name);
    return (char*)ti;
}
