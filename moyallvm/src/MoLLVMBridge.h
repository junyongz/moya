#ifndef MLVCOMPILER_H
#define MLVCOMPILER_H

#include <nan.h>

#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/DIBuilder.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Type.h"
#include "llvm/Target/TargetMachine.h"
#include "llvm/ExecutionEngine/Orc/ObjectLinkingLayer.h"
#include "llvm/ExecutionEngine/Orc/IRCompileLayer.h"
#include "llvm/ExecutionEngine/Orc/IRTransformLayer.h"

typedef enum {
    MLVDumpNothing = 0,
    MLVDumpUnoptimized = 1,
    MLVDumpOptimized = 2
} MLVDumpMode;

typedef enum {
    MLVOptimizeNothing = 0,
    MLVOptimizeFull = 1
} MLVOptimizeLevel;

class MoLLVMBridge {
public:
    MoLLVMBridge();
    ~MoLLVMBridge();

public:
    static void SetDumpMode(MLVDumpMode);
    static void SetOptimizeLevel(MLVOptimizeLevel);
    
protected:
    llvm::DIType* GetDITypeForType(llvm::Type*);
    
public:
    llvm::DIScope* CreateDebugModule(const std::string& name, const std::string& dirPath);
    llvm::DIScope* CreateDebugFunction(const std::string& name, llvm::DIFile* unit,
                                       llvm::Function* func, int argCount, int lineNo);
    void CreateDebugVariable(const std::string& name, llvm::DIFile* unit, llvm::DIScope* scope,
                             llvm::Value* alloca, llvm::Type* type, int argNo, int lineNo);
    void SetDebugLocation(int line, int col, llvm::DIScope* scope);
        
    llvm::LLVMContext& GetContext();

    llvm::Value* GetGlobal(llvm::Type* type, const std::string& name, llvm::Constant* value,
                           bool isConstant);

    llvm::Type* GetType(int code);
    uint64_t GetTypeSize(llvm::Type* type);
    
    llvm::Type* CreateStructType(const std::string& name);
    uint64_t SetStructBody(llvm::StructType* type, const std::vector<llvm::Type*>& body);

    llvm::Value* CreateStruct(llvm::StructType* type,
                              const std::vector<llvm::Constant*>& values);
    llvm::Value* InsertValue(llvm::Value* agg, unsigned int index, llvm::Value* value);
    llvm::Value* ExtractValue(llvm::Value* agg, unsigned int index, const std::string& name);


    void BeginModule(const std::string& name, bool shouldDebug);
    void EndModule();

    void EmitObject(const std::string& path);
    int ExecuteMain();

    llvm::Value* GetInsertBlock();
    void SetInsertBlock(llvm::Value* block);
    bool IsBlockEmpty(llvm::Value* block);
    void EraseBlock(llvm::Value* block);
    
    llvm::Value* CreateBlock(const std::string& name, llvm::Function* func);

    llvm::Type* GetFunctionSignatureType(llvm::Type* returnType,
                                         const std::vector<llvm::Type*>& argTypes);
        
    llvm::Value* DeclareExternalFunction(std::string& name, llvm::Type* returnType,
                                 const std::vector<llvm::Type*>& argTypes,
                                 bool doesNotThrow);

    std::vector<llvm::Value*> DeclareFunction(std::string& name, llvm::Type* returnType,
                                            const std::vector<llvm::Type*>& args,
                                            const std::vector<std::string>& argNames,
                                            bool doesNotThrow);

    llvm::Value* CreateClassTable(const std::string& name, const std::vector<llvm::Value*> functions);

    llvm::Value* DeclareString(const std::string& str);

    llvm::Value* CompileInteger(size_t size, int value);
    llvm::Value* CompileFloat(float value);
    llvm::Value* CompileDouble(double value);

    llvm::Value* CastNumber(llvm::Value* num, llvm::Type* type);
    llvm::Value* CompileBitcast(llvm::Value* value, llvm::Type* type);

    llvm::Value* CompileCall(llvm::Value* func, std::vector<llvm::Value*>& args);
    llvm::Value* CompileInvoke(llvm::Value* func, llvm::BasicBlock* normalDest,
                               llvm::BasicBlock* unwindDest, std::vector<llvm::Value*>& args);

    llvm::Value* CompileEquals(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileNotEquals(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileGreaterThan(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileGreaterThanEquals(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileLessThan(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileLessThanEquals(llvm::Value* lhs, llvm::Value* rhs);

    llvm::Value* CompileNegate(llvm::Value* operand);
    llvm::Value* CompileAdd(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileSubtract(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileMultiply(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileDivide(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileMod(llvm::Value* lhs, llvm::Value* rhs);

    void CompileReturn(llvm::Value* expr);

    void CompileJump(llvm::Value* label);
    void CompileConditionalJump(llvm::Value* condition, llvm::Value* label1, llvm::Value* label2);
    llvm::Value* CompilePHI(llvm::Type* type, const std::vector<llvm::Value*>& values, const std::vector<llvm::Value*>& blocks);

    llvm::Value* CompileLandingPad(llvm::Type* padType, bool isCleanup,
                                   const std::vector<llvm::Value*>& clauses);
    void CompileResume(llvm::Value* landingPad);
    
    llvm::Value* CompileCatchSwitch(llvm::Value* parentPad, llvm::BasicBlock* unwindBB,
                                    const std::vector<llvm::BasicBlock*>& handlers);
    llvm::Value* CompileCatchPad(llvm::Value* parentPad, const std::vector<llvm::Value*>& args);
    llvm::Value* CompileCatchRet(llvm::CatchPadInst* catchPad, llvm::BasicBlock* afterBlock);
    llvm::Value* CompileCleanupPad(llvm::Value* parentPad, const std::vector<llvm::Value*>& args);
    llvm::Value* CompileCleanupRet(llvm::CleanupReturnInst* cleanupPad, llvm::BasicBlock* unwindBB);

    llvm::Value* CompileNone();
    void CompileUnreachable();
    
    llvm::Value* CreateVariable(const std::string& name, llvm::Type* type);
    void StoreVariable(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* LoadVariable(llvm::Value* alloca, const std::string& name, llvm::Type* type);

    llvm::Value* GetPointer(llvm::Value* pointer, std::vector<llvm::Value*>& offsets, llvm::Type* type);
        
protected:
    llvm::AllocaInst* CreateEntryBlockAlloca(llvm::Function*, const std::string&, llvm::Type*);

private:
    llvm::LLVMContext context;
    llvm::IRBuilder<> builder;

    llvm::DIBuilder* dibuilder;
    llvm::DICompileUnit* diunit;

    llvm::TargetMachine* machine;
    const llvm::DataLayout dataLayout;

    std::unique_ptr<llvm::Module> module;

    llvm::Function* personality;
    
    llvm::orc::ObjectLinkingLayer<> objectLayer;
    llvm::orc::IRCompileLayer<decltype(objectLayer)> compileLayer;
    typedef std::function<std::unique_ptr<llvm::Module>(std::unique_ptr<llvm::Module>)> OptimizeFunction;
    llvm::orc::IRTransformLayer<decltype(compileLayer), OptimizeFunction> optimizeLayer;
};

#endif
