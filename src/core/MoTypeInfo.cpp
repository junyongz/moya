
#include "MoCore/MoTypeInfo.h"

#include <cstdio>
#include <cstdlib>
#include <string>

// *************************************************************************************************

MoTypeInfo::MoTypeInfo(const char* name)
    : _name(name)
{
}

bool
MoTypeInfo::canCatch(const MoTypeInfo* other) const {
    // printf("Can catch %s == %s\n", _name, other->name()); fflush(stdout);
    return other == this;
}
    
