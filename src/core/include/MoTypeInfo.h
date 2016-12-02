
#ifndef MOTYPEINFO_H
#define MOTYPEINFO_H

class MoTypeInfo {
public:
    MoTypeInfo(const char* name);
    
    const char* name() const { return _name; }
    
    bool canCatch(const MoTypeInfo* other) const;
    
private:
    const char* _name;
};

#endif
