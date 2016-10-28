
#include "MLVCompiler.h"

#include "llvm/Pass.h"
#include "llvm/ADT/APFloat.h"
#include "llvm/ADT/APInt.h"
#include "llvm/ADT/APSInt.h"
#include "llvm/ADT/STLExtras.h"
#include "llvm/ADT/SmallVector.h"
#include "llvm/Analysis/Passes.h"
#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/LegacyPassManager.h"
#include "llvm/IR/Metadata.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Type.h"
#include "llvm/IR/Verifier.h"
#include "llvm/IR/DataLayout.h"
#include "llvm/IR/Mangler.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/TargetRegistry.h"
#include "llvm/Support/TargetSelect.h"
#include "llvm/Target/TargetMachine.h"
#include "llvm/Target/TargetOptions.h"
#include "llvm/Transforms/Scalar.h"
#include "llvm/Transforms/Scalar/GVN.h"

#include "llvm/ADT/STLExtras.h"
#include "llvm/ExecutionEngine/ExecutionEngine.h"
#include "llvm/ExecutionEngine/RuntimeDyld.h"
#include "llvm/ExecutionEngine/SectionMemoryManager.h"
#include "llvm/ExecutionEngine/Orc/CompileOnDemandLayer.h"
#include "llvm/ExecutionEngine/Orc/CompileUtils.h"
#include "llvm/ExecutionEngine/Orc/JITSymbol.h"
#include "llvm/ExecutionEngine/Orc/IRCompileLayer.h"
#include "llvm/ExecutionEngine/Orc/IRTransformLayer.h"
#include "llvm/ExecutionEngine/Orc/LambdaResolver.h"
#include "llvm/ExecutionEngine/Orc/ObjectLinkingLayer.h"
#include "llvm/Support/DynamicLibrary.h"
#include "llvm/Support/raw_ostream.h"

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <vector>
 
using namespace llvm;
using namespace llvm::orc;

extern "C" void
printInt(int value) {
    printf("%d\n", value);
}

extern "C" void
printDouble(double value) {
    printf("%f\n", value);
}

static TargetMachine*
InitMachine() {
    // Initialize the target registry etc.
    InitializeAllTargetInfos();
    InitializeAllTargets();
    InitializeAllTargetMCs();
    InitializeAllAsmParsers();
    InitializeAllAsmPrinters();
    
    auto targetTriple = sys::getDefaultTargetTriple();

    std::string Error = "Error message";
    auto target = TargetRegistry::lookupTarget(targetTriple, Error);

    auto cpu = "generic";
    auto features = "";

    TargetOptions opt;
    auto rm = Optional<Reloc::Model>();
    return target->createTargetMachine(targetTriple, cpu, features, opt, rm);
}

static std::string
mangle(const std::string &Name, DataLayout DL) {
    std::string MangledName;
    raw_string_ostream MangledNameStream(MangledName);
    Mangler::getNameWithPrefix(MangledNameStream, Name, DL);
    return MangledNameStream.str();
}

static std::unique_ptr<Module>
optimizeModule(std::unique_ptr<Module> M) {
    llvm::sys::DynamicLibrary::LoadLibraryPermanently(nullptr);

    auto FPM = llvm::make_unique<legacy::FunctionPassManager>(M.get());
    FPM->add(createInstructionCombiningPass());
    FPM->add(createReassociatePass());
    FPM->add(createGVNPass());
    FPM->add(createCFGSimplificationPass());
    FPM->doInitialization();

    for (auto &F : *M) {
        FPM->run(F);
    }

    return M;
}
      
MLVCompiler::MLVCompiler():
    context(),
    builder(context),
    machine(InitMachine()),
    compileLayer(objectLayer, SimpleCompiler(*machine)),
    optimizeLayer(compileLayer,
        [this](std::unique_ptr<Module> M) {
          return optimizeModule(std::move(M));
        })
{
}

MLVCompiler::~MLVCompiler() {
}

LLVMContext&
MLVCompiler::GetContext() { return context; }

AllocaInst*
MLVCompiler::CreateEntryBlockAlloca(Function* f, const std::string& name, Type* type) {
  IRBuilder<> TmpB(&f->getEntryBlock(), f->getEntryBlock().begin());
  return TmpB.CreateAlloca(type, 0, name.c_str());
}

void
MLVCompiler::BeginModule(std::string& name) {
    module = make_unique<Module>(name, context);
    module->setDataLayout(machine->createDataLayout());
}

void
MLVCompiler::EndModule() {
    auto Resolver = createLambdaResolver(
        [&](const std::string &Name) {
        //   if (auto Sym = IndirectStubsMgr->findStub(Name, false))
        //     return Sym.toRuntimeDyldSymbol();
          if (auto Sym = optimizeLayer.findSymbol(Name, false))
            return Sym.toRuntimeDyldSymbol();
          return RuntimeDyld::SymbolInfo(nullptr);
        },
        [](const std::string &Name) {
          if (auto SymAddr =
                RTDyldMemoryManager::getSymbolAddressInProcess(Name))
            return RuntimeDyld::SymbolInfo(SymAddr, JITSymbolFlags::Exported);
          return RuntimeDyld::SymbolInfo(nullptr);
        });
        
    module->dump();

    std::vector<std::unique_ptr<Module>> Ms;
    Ms.push_back(std::move(module));
    optimizeLayer.addModuleSet(std::move(Ms), make_unique<SectionMemoryManager>(),
                               std::move(Resolver));
}

Value*
MLVCompiler::DeclareFunction(std::string& name, Type* returnType, const std::vector<Type*>& argTypes) {
    FunctionType* ft = FunctionType::get(returnType, argTypes, false);
    Function* func = Function::Create(ft, Function::ExternalLinkage, name, module.get());
    return func;
}
    
std::vector<llvm::Value*>
MLVCompiler::BeginFunction(std::string& name, Type* returnType, const std::vector<Type*>& argTypes, const std::vector<std::string>& argNames) {
    FunctionType* ft = FunctionType::get(returnType, argTypes, false);
    Function* func = Function::Create(ft, Function::ExternalLinkage, name, module.get());
    
    BasicBlock* bb = BasicBlock::Create(context, "entry", func);
    builder.SetInsertPoint(bb);

    std::vector<llvm::Value*> argsRet;
    argsRet.push_back(func);
    
    unsigned i = 0;
    for (auto &arg : func->args()) {
        Type* argType = argTypes[i];
        std::string argName = argNames[i++];
        arg.setName(argName);
        
        AllocaInst* alloca = CreateEntryBlockAlloca(func, argName, argType);
        builder.CreateStore(&arg, alloca);
        
        argsRet.push_back(alloca);
    }
        
    return argsRet;
}

void
MLVCompiler::EndFunction() {
    builder.CreateRet(ConstantInt::get(context, APInt(32, 0)));
}

llvm::Value*
MLVCompiler::CompileInteger(int value) {
    return ConstantInt::get(context, APInt(32, value));
}

llvm::Value*
MLVCompiler::CompileFloat(double value) {
    return ConstantFP::get(context, APFloat(value));
}

llvm::Value* MLVCompiler::CompileCall(llvm::Value* func, std::vector<Value*>& args) {
    return builder.CreateCall(func, args);
}

llvm::Value*
MLVCompiler::CompileAddI(llvm::Value* lhs, llvm::Value* rhs) {
    return builder.CreateAdd(lhs, rhs);
}

void
MLVCompiler::CompileReturn(llvm::Value* expr) {
    builder.CreateRet(expr);
}

llvm::Value*
MLVCompiler::CreateVariable(const std::string& name, llvm::Type* type) {
    Function* f = builder.GetInsertBlock()->getParent();
    AllocaInst* alloca = CreateEntryBlockAlloca(f, name, type);
    return alloca;
}

void
MLVCompiler::StoreVariable(llvm::Value* lhs, llvm::Value* rhs) {
    builder.CreateStore(rhs, lhs);
}
    
llvm::Value*
MLVCompiler::LoadVariable(llvm::Value* alloca, const std::string& name) {
    return builder.CreateLoad(alloca, name.c_str());
}
    
int
MLVCompiler::ExecuteMain() {
    if (auto sym = optimizeLayer.findSymbol(mangle("main", machine->createDataLayout()), false)) {
        int (*FP)() = (int (*)())(intptr_t)sym.getAddress();
        return FP();
    } else {
        printf("main no found!\n");
        return 1;
    }
}
