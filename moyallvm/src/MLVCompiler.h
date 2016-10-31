#ifndef MLVCOMPILER_H
#define MLVCOMPILER_H

#include <nan.h>

#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/LLVMContext.h"
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

class MLVCompiler {
public:
    MLVCompiler();
    ~MLVCompiler();

    static void SetDumpMode(MLVDumpMode);
    
    llvm::LLVMContext& GetContext();
    
    llvm::Type* GetType(int code);
    llvm::Type* CreateStruct(const std::string& name);
    
    void BeginModule(const std::string& name);
    void EndModule();

    llvm::Value* GetInsertBlock();
    void SetInsertBlock(llvm::Value* block);

    llvm::Value* CreateBlock(const std::string& name, llvm::Value* func);
    
    llvm::Value* DeclareString(const std::string& str);
    
    llvm::Value* DeclareFunction(std::string& name, llvm::Type* returnType,
                                 const std::vector<llvm::Type*>& argTypes);

    std::vector<llvm::Value*> BeginFunction(std::string& name, llvm::Type* returnType,
                                            const std::vector<llvm::Type*>& args,
                                            const std::vector<std::string>& argNames);
    void EndFunction();

    llvm::Value* CompileInteger(size_t size, int value);
    llvm::Value* CompileFloat(float value);
    llvm::Value* CompileDouble(double value);

    llvm::Value* CastNumber(llvm::Value* num, llvm::Type* type);

    llvm::Value* CompileCall(llvm::Value* func, std::vector<llvm::Value*>& args);

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
    
    llvm::Value* CreateVariable(const std::string& name, llvm::Type* type);
    void StoreVariable(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* LoadVariable(llvm::Value* alloca, const std::string& name);

    llvm::Value* CompileGetPointer(llvm::Value* pointer, llvm::Value* index);

    int ExecuteMain();
        
protected:
    llvm::AllocaInst* CreateEntryBlockAlloca(llvm::Function*, const std::string&, llvm::Type*);

private:
    llvm::LLVMContext context;
    llvm::IRBuilder<> builder;
    llvm::TargetMachine* machine;
    std::unique_ptr<llvm::Module> module;
    
    llvm::orc::ObjectLinkingLayer<> objectLayer;
    llvm::orc::IRCompileLayer<decltype(objectLayer)> compileLayer;

    typedef std::function<std::unique_ptr<llvm::Module>(std::unique_ptr<llvm::Module>)> OptimizeFunction;
    llvm::orc::IRTransformLayer<decltype(compileLayer), OptimizeFunction> optimizeLayer;
};

#endif
