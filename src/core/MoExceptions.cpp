
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <unwind.h>
#include <typeinfo>

extern "C" {

// *************************************************************************************************

typedef void (*unexpected_handler)(void);
typedef void (*terminate_handler)(void);

struct __cxa_exception {
	std::type_info *	exceptionType;
	void (*exceptionDestructor) (void *);
	unexpected_handler	unexpectedHandler;
	terminate_handler	terminateHandler;
	__cxa_exception *	nextException;

	int			handlerCount;
	int			handlerSwitchValue;
	const char *		actionRecord;
	const char *		languageSpecificData;
	void *			catchTemp;
	void *			adjustedPtr;

	_Unwind_Exception	unwindHeader;
};

static inline __cxa_exception*
cxa_exception_from_thrown_object(void* thrown_object) {
    return static_cast<__cxa_exception*>(thrown_object) - 1;
}

static inline __cxa_exception*
cxa_exception_from_exception_unwind_exception(_Unwind_Exception* unwind_exception) {
    return cxa_exception_from_thrown_object(unwind_exception + 1 );
}

// *************************************************************************************************

static char* _ZTIb = (char*)0;
static char* _ZTIc = (char*)1;
static char* _ZTIs = (char*)2;
static char* _ZTIi = (char*)3;
static char* _ZTIx = (char*)4;
static char* _ZTIf = (char*)5;
static char* _ZTId = (char*)6;
static char* _ZTIPc = (char*)7;

// *************************************************************************************************

void* __cxa_allocate_exception(size_t thrown_size);
void __cxa_throw(void* thrown_exception, std::type_info *tinfo, void (*dest)(void*));
void* __cxa_begin_catch(void* exceptionObject);
void __cxa_end_catch();

void
moyaThrowDestructor(void* thrown) {
    // printf("destructor\n");
}

void
moyaThrow(void* thrown, std::type_info* ti) {
    void* exc = __cxa_allocate_exception(sizeof(char*));
    
    char** buf = (char**)exc;
    *buf = (char*)thrown;

    __cxa_throw(exc, ti, moyaThrowDestructor);
    
    printf("Exception not caught!\n");
    exit(0);
}

char*
moyaBeginCatch(_Unwind_Exception* unwind_exception) {
    __cxa_begin_catch(unwind_exception);
    
    __cxa_exception* exception_header = cxa_exception_from_exception_unwind_exception(
        static_cast<_Unwind_Exception*>(unwind_exception));
    
    char** buf = (char**) (exception_header + 1);
    char* exc = *buf;
    
    __cxa_end_catch();
    
    return exc;
}


}
