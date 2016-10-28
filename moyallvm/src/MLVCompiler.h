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

class MLVCompiler {
public:
    MLVCompiler();
    ~MLVCompiler();

    llvm::LLVMContext& GetContext();
    
    void BeginModule(std::string& name);
    void EndModule();
    
    std::vector<llvm::Value*> BeginFunction(std::string& name, const std::vector<llvm::Type*>& args,
                       const std::vector<std::string>& argNames);
    void EndFunction();
    
    llvm::Value* CompileInteger(int value);
    llvm::Value* CompileFloat(double value);
    llvm::Value* CompileCall(const std::string& name, std::vector<llvm::Value*>& args);
    llvm::Value* CompileAddI(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* CreateVariable(const std::string& name);
    void StoreVariable(llvm::Value* lhs, llvm::Value* rhs);
    llvm::Value* LoadVariable(llvm::Value* alloca, const std::string& name);

    int ExecuteMain();
        
protected:
    llvm::AllocaInst* CreateEntryBlockAlloca(llvm::Function*, const std::string&);

private:
    llvm::LLVMContext context;
    llvm::IRBuilder<> builder;
    llvm::TargetMachine* machine;
    std::unique_ptr<llvm::Module> module;
    std::map<std::string, llvm::Function*> functionMap;

    
    llvm::orc::ObjectLinkingLayer<> objectLayer;
    llvm::orc::IRCompileLayer<decltype(objectLayer)> compileLayer;

    typedef std::function<std::unique_ptr<llvm::Module>(std::unique_ptr<llvm::Module>)> OptimizeFunction;
    llvm::orc::IRTransformLayer<decltype(compileLayer), OptimizeFunction> optimizeLayer;
};

#endif
