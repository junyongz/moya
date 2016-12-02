#ifndef MOEXCEPTIONS_H
#define MOEXCEPTIONS_H

#include "MoCore/MoTypeInfo.h"

#include <exception>
#include <unwind.h>

// *************************************************************************************************

extern "C" void* moyaAllocException(size_t thrown_size);
extern "C" void moyaThrow(void* thrown_exception, MoTypeInfo* type, void (*dest)(void*));

extern "C" void* moyaBeginCatch(_Unwind_Exception* unwind_arg);
extern "C" void moyaEndCatch();

// *************************************************************************************************
// Taken from libcxxabi cxa_exception.hpp
// *************************************************************************************************

static const uint64_t kOurExceptionClass          = 0x434C4E47432B2B00; // CLNGC++\0
static const uint64_t kOurDependentExceptionClass = 0x434C4E47432B2B01; // CLNGC++\1
static const uint64_t get_vendor_and_language     = 0xFFFFFFFFFFFFFF00; // mask for CLNGC++

struct __cxa_exception {
#if defined(__LP64__) || LIBCXXABI_ARM_EHABI
    // This is a new field to support C++ 0x exception_ptr.
    // For binary compatibility it is at the start of this
    // struct which is prepended to the object thrown in
    // __cxa_allocate_exception.
    size_t referenceCount;
#endif

    //  Manage the exception object itself.
    MoTypeInfo *exceptionType;
    void (*exceptionDestructor)(void *);
    std::unexpected_handler unexpectedHandler;
    std::terminate_handler  terminateHandler;

    __cxa_exception *nextException;

    int handlerCount;

#if LIBCXXABI_ARM_EHABI
    __cxa_exception* nextPropagatingException;
    int propagationCount;
#else
    int handlerSwitchValue;
    const unsigned char *actionRecord;
    const unsigned char *languageSpecificData;
    void *catchTemp;
    void *adjustedPtr;
#endif

#if !defined(__LP64__) && !LIBCXXABI_ARM_EHABI
    // This is a new field to support C++ 0x exception_ptr.
    // For binary compatibility it is placed where the compiler
    // previously adding padded to 64-bit align unwindHeader.
    size_t referenceCount;
#endif

    _Unwind_Exception unwindHeader;
};

// http://sourcery.mentor.com/archives/cxx-abi-dev/msg01924.html
// The layout of this structure MUST match the layout of __cxa_exception, with
// primaryException instead of referenceCount.
struct __cxa_dependent_exception {
#if defined(__LP64__) || LIBCXXABI_ARM_EHABI
    void* primaryException;
#endif

    MoTypeInfo *exceptionType;
    void (*exceptionDestructor)(void *);
    std::unexpected_handler unexpectedHandler;
    std::terminate_handler terminateHandler;

    __cxa_exception *nextException;

    int handlerCount;

#if LIBCXXABI_ARM_EHABI
    __cxa_exception* nextPropagatingException;
    int propagationCount;
#else
    int handlerSwitchValue;
    const unsigned char *actionRecord;
    const unsigned char *languageSpecificData;
    void * catchTemp;
    void *adjustedPtr;
#endif

#if !defined(__LP64__) && !LIBCXXABI_ARM_EHABI
    void* primaryException;
#endif

    _Unwind_Exception unwindHeader;
};

struct __cxa_eh_globals {
    __cxa_exception *   caughtExceptions;
    unsigned int        uncaughtExceptions;
#if LIBCXXABI_ARM_EHABI
    __cxa_exception* propagatingExceptions;
#endif
};

extern "C" __cxa_eh_globals * __cxa_get_globals      ();
extern "C" __cxa_eh_globals * __cxa_get_globals_fast ();

#endif
