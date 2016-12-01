
#include <unwind.h>
#include <typeinfo>
             
extern "C" {

// *************************************************************************************************
// Emulating C++ Exception unwinder functions which are private

struct __cxa_exception {
    std::type_info *	exceptionType;
    void (*exceptionDestructor) (void *);
    void (*unexpectedHandler) (void);
    void (*terminateHandler) (void);
    __cxa_exception* nextException;

    int handlerCount;
    int handlerSwitchValue;
    const char* actionRecord;
    const char* languageSpecificData;
    void* catchTemp;
    void* adjustedPtr;

    _Unwind_Exception	unwindHeader;
};

void* __cxa_allocate_exception(size_t thrown_size);
void __cxa_throw(void* thrown_exception, std::type_info *tinfo, void (*dest)(void*));
void* __cxa_begin_catch(void* exceptionObject);
void __cxa_end_catch();

static inline __cxa_exception*
cxa_exception_from_thrown_object(void* thrown_object) {
    return static_cast<__cxa_exception*>(thrown_object) - 1;
}

static inline __cxa_exception*
cxa_exception_from_exception_unwind_exception(_Unwind_Exception* unwind_exception) {
    return cxa_exception_from_thrown_object(unwind_exception + 1 );
}

// *************************************************************************************************

char*
moyaBeginCatch(_Unwind_Exception* unwind_exception) {
    __cxa_begin_catch(unwind_exception);
    
    __cxa_exception* exception_header = cxa_exception_from_exception_unwind_exception(
        static_cast<_Unwind_Exception*>(unwind_exception));
    
    return (char*)(exception_header + 1);
}
    
void
moyaThrowDestructor(void* thrown) {
    // printf("destructor\n");
}

}
