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
    
    void BeginModule(std::string& name);
    void EndModule();
    
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

    llvm::Value* CompileAdd(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileSubtract(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileMultiply(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileDivide(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CompileMod(llvm::Value* lhs, llvm::Value* rhs);

    void CompileReturn(llvm::Value* expr);

    llvm::Value* CreateVariable(const std::string& name, llvm::Type* type);
    void StoreVariable(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* LoadVariable(llvm::Value* alloca, const std::string& name);

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
