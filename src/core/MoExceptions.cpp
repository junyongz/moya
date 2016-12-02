
#include "MoCore/MoExceptions.h"
#include "MoCore/MoTypeInfo.h"

#include <stdio.h>
#include <stdlib.h>
#include <cstring>

// *************************************************************************************************
// Taken from libcxxabi cxa_exception_storage.cpp
// *************************************************************************************************

#if defined(_LIBCXXABI_HAS_NO_THREADS)

extern "C" {
    static __cxa_eh_globals eh_globals;
    __cxa_eh_globals *__cxa_get_globals() { return &eh_globals; }
    __cxa_eh_globals *__cxa_get_globals_fast() { return &eh_globals; }
    }
}

#elif defined(HAS_THREAD_LOCAL)

    __cxa_eh_globals * __globals () {
        static thread_local __cxa_eh_globals eh_globals;
        return &eh_globals;
        }

extern "C" {
    __cxa_eh_globals * __cxa_get_globals      () { return __globals (); }
    __cxa_eh_globals * __cxa_get_globals_fast () { return __globals (); }
}

#endif

// *************************************************************************************************
// Taken from libcxxabi cxa_exception.cpp
// *************************************************************************************************

static
inline
__cxa_exception*
cxa_exception_from_thrown_object(void* thrown_object)
{
    return static_cast<__cxa_exception*>(thrown_object) - 1;
}

// Note:  This is never called when exception_header is masquerading as a
//        __cxa_dependent_exception.
static
inline
void*
thrown_object_from_cxa_exception(__cxa_exception* exception_header)
{
    return static_cast<void*>(exception_header + 1);
}

//  Get the exception object from the unwind pointer.
//  Relies on the structure layout, where the unwind pointer is right in
//  front of the user's exception object
static
inline
__cxa_exception*
cxa_exception_from_exception_unwind_exception(_Unwind_Exception* unwind_exception)
{
    return cxa_exception_from_thrown_object(unwind_exception + 1 );
}

static
inline
size_t
cxa_exception_size_from_exception_thrown_size(size_t size)
{
    return size + sizeof (__cxa_exception);
}

static bool isOurExceptionClass(const _Unwind_Exception* unwind_exception) {
    return (unwind_exception->exception_class & get_vendor_and_language) ==
           (kOurExceptionClass                & get_vendor_and_language);
}

static bool isDependentException(_Unwind_Exception* unwind_exception) {
    return (unwind_exception->exception_class & 0xFF) == 0x01;
}

static inline int incrementHandlerCount(__cxa_exception *exception) {
    return ++exception->handlerCount;
}

//  This does not need to be atomic
static inline  int decrementHandlerCount(__cxa_exception *exception) {
    return --exception->handlerCount;
}


void __cxa_free_dependent_exception (void * dependent_exception) {
    free(dependent_exception);
}

void __cxa_free_exception(void *thrown_object) throw() {
    free(cxa_exception_from_thrown_object(thrown_object));
}

void
__cxa_decrement_exception_refcount(void *thrown_object) throw() {
    if (thrown_object != NULL )
    {
        __cxa_exception* exception_header = cxa_exception_from_thrown_object(thrown_object);
        if (__sync_sub_and_fetch(&exception_header->referenceCount, size_t(1)) == 0)
        {
            if (NULL != exception_header->exceptionDestructor)
                exception_header->exceptionDestructor(thrown_object);
            __cxa_free_exception(thrown_object);
        }
    }
}

void
exception_cleanup_func(_Unwind_Reason_Code reason, _Unwind_Exception* unwind_exception)
{
    __cxa_exception* exception_header = cxa_exception_from_exception_unwind_exception(unwind_exception);
    if (_URC_FOREIGN_EXCEPTION_CAUGHT != reason) {
        std::set_terminate(exception_header->terminateHandler);
        std::terminate();
    }
    // Just in case there exists a dependent exception that is pointing to this,
    //    check the reference count and only destroy this if that count goes to zero.
    __cxa_decrement_exception_refcount(unwind_exception + 1);
}

static void failed_throw(__cxa_exception* exception_header) {
//  Section 2.5.3 says:
//      * For purposes of this ABI, several things are considered exception handlers:
//      ** A terminate() call due to a throw.
//  and
//      * Upon entry, Following initialization of the catch parameter,
//          a handler must call:
//      * void *__cxa_begin_catch(void *exceptionObject );
    (void) moyaBeginCatch(&exception_header->unwindHeader);
    std::set_terminate(exception_header->terminateHandler);
    std::terminate();
}

// *************************************************************************************************

// Adapted from libcxxa __cxa_allocate_exception
extern "C" void*
moyaAllocException(size_t thrown_size) {
    size_t actual_size = cxa_exception_size_from_exception_thrown_size(thrown_size);
    __cxa_exception *exception_header =
        static_cast<__cxa_exception *>(malloc(actual_size));
    if (NULL == exception_header)
        std::terminate();
    std::memset(exception_header, 0, actual_size);
    return thrown_object_from_cxa_exception(exception_header);
}

extern "C" void
moyaThrowDestructor(void* thrown) {
    // printf("destructor\n");
}

extern "C" void
moyaTerminator() {
    abort();
}

// Adapted from libcxxa __cxa_throw
extern "C" void
moyaThrow(void* thrown_object, MoTypeInfo* tinfo, void (*dest)(void*)) {
    __cxa_eh_globals *globals = __cxa_get_globals();
    __cxa_exception* exception_header = cxa_exception_from_thrown_object(thrown_object);

    exception_header->unexpectedHandler = std::get_unexpected();
    exception_header->terminateHandler  = moyaTerminator;
    exception_header->exceptionType = tinfo;
    exception_header->exceptionDestructor = dest;
    exception_header->unwindHeader.exception_class = kOurExceptionClass;
    exception_header->referenceCount = 1;  // This is a newly allocated exception, no need for thread safety.

    globals->uncaughtExceptions += 1;   // Not atomically, since globals are thread-local

    exception_header->unwindHeader.exception_cleanup = exception_cleanup_func;
    _Unwind_RaiseException(&exception_header->unwindHeader);

    fprintf(stderr, "Uncaught exception\n");
    failed_throw(exception_header);
}

// Adapted from libcxxa __cxa_begin_catch
extern "C" void*
moyaBeginCatch(_Unwind_Exception* unwind_arg) {
    _Unwind_Exception* unwind_exception = static_cast<_Unwind_Exception*>(unwind_arg);
    bool native_exception = isOurExceptionClass(unwind_exception);
    __cxa_eh_globals* globals = __cxa_get_globals();
    // exception_header is a hackish offset from a foreign exception, but it
    //   works as long as we're careful not to try to access any __cxa_exception
    //   parts.
    __cxa_exception* exception_header =
            cxa_exception_from_exception_unwind_exception
            (
                static_cast<_Unwind_Exception*>(unwind_exception)
            );
    if (native_exception)
    {
        // Increment the handler count, removing the flag about being rethrown
        exception_header->handlerCount = exception_header->handlerCount < 0 ?
            -exception_header->handlerCount + 1 : exception_header->handlerCount + 1;
        //  place the exception on the top of the stack if it's not already
        //    there by a previous rethrow
        if (exception_header != globals->caughtExceptions)
        {
            exception_header->nextException = globals->caughtExceptions;
            globals->caughtExceptions = exception_header;
        }
        globals->uncaughtExceptions -= 1;   // Not atomically, since globals are thread-local
#if LIBCXXABI_ARM_EHABI
        return reinterpret_cast<void*>(exception_header->unwindHeader.barrier_cache.bitpattern[0]);
#else
        return exception_header->adjustedPtr;
#endif
    }
    // Else this is a foreign exception
    // If the caughtExceptions stack is not empty, terminate
    if (globals->caughtExceptions != 0)
        std::terminate();
    // Push the foreign exception on to the stack
    globals->caughtExceptions = exception_header;
    return unwind_exception + 1;
}

// Adapted from libcxxa __cxa_end_catch
extern "C" void
moyaEndCatch() {
  static_assert(sizeof(__cxa_exception) == sizeof(__cxa_dependent_exception),
                "sizeof(__cxa_exception) must be equal to "
                "sizeof(__cxa_dependent_exception)");
  static_assert(__builtin_offsetof(__cxa_exception, referenceCount) ==
                    __builtin_offsetof(__cxa_dependent_exception,
                                       primaryException),
                "the layout of __cxa_exception must match the layout of "
                "__cxa_dependent_exception");
  static_assert(__builtin_offsetof(__cxa_exception, handlerCount) ==
                    __builtin_offsetof(__cxa_dependent_exception, handlerCount),
                "the layout of __cxa_exception must match the layout of "
                "__cxa_dependent_exception");
    __cxa_eh_globals* globals = __cxa_get_globals_fast(); // __cxa_get_globals called in __cxa_begin_catch
    __cxa_exception* exception_header = globals->caughtExceptions;
    // If we've rethrown a foreign exception, then globals->caughtExceptions
    //    will have been made an empty stack by __cxa_rethrow() and there is
    //    nothing more to be done.  Do nothing!
    if (NULL != exception_header)
    {
        bool native_exception = isOurExceptionClass(&exception_header->unwindHeader);
        if (native_exception)
        {
            // This is a native exception
            if (exception_header->handlerCount < 0)
            {
                //  The exception has been rethrown by __cxa_rethrow, so don't delete it
                if (0 == incrementHandlerCount(exception_header))
                {
                    //  Remove from the chain of uncaught exceptions
                    globals->caughtExceptions = exception_header->nextException;
                    // but don't destroy
                }
                // Keep handlerCount negative in case there are nested catch's
                //   that need to be told that this exception is rethrown.  Don't
                //   erase this rethrow flag until the exception is recaught.
            }
            else
            {
                // The native exception has not been rethrown
                if (0 == decrementHandlerCount(exception_header))
                {
                    //  Remove from the chain of uncaught exceptions
                    globals->caughtExceptions = exception_header->nextException;
                    // Destroy this exception, being careful to distinguish
                    //    between dependent and primary exceptions
                    if (isDependentException(&exception_header->unwindHeader))
                    {
                        // Reset exception_header to primaryException and deallocate the dependent exception
                        __cxa_dependent_exception* dep_exception_header =
                            reinterpret_cast<__cxa_dependent_exception*>(exception_header);
                        exception_header =
                            cxa_exception_from_thrown_object(dep_exception_header->primaryException);
                        __cxa_free_dependent_exception(dep_exception_header);
                    }
                    // Destroy the primary exception only if its referenceCount goes to 0
                    //    (this decrement must be atomic)
                    __cxa_decrement_exception_refcount(thrown_object_from_cxa_exception(exception_header));
                }
            }
        }
        else
        {
            // The foreign exception has not been rethrown.  Pop the stack
            //    and delete it.  If there are nested catch's and they try
            //    to touch a foreign exception in any way, that is undefined
            //     behavior.  They likely can't since the only way to catch
            //     a foreign exception is with catch (...)!
            _Unwind_DeleteException(&globals->caughtExceptions->unwindHeader);
            globals->caughtExceptions = 0;
        }
    }
}
