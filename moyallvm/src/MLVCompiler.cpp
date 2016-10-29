
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

static MLVDumpMode dumpMode = MLVDumpNothing;

extern "C" void
printString(const char* value) {
    printf("%s\n", value);
}

extern "C" double
powerdd(double a, double b) {
    return pow(a, b);
}

extern "C" char*
concatString(const char* left, const char* right) {
    size_t l1 = strlen(left);
    size_t l2 = strlen(right);
    char* buf = (char*)malloc(l1+l2+1);
    strcpy(buf, left);
    strcpy(buf+l1, right);
    return buf;
}

extern "C" char*
intToString(long long num) {
    char nbuf[128];
    snprintf(nbuf, 128, "%lld", num);
    
    size_t l = strlen(nbuf);
    char* buf = (char*)malloc(l+1);
    strcpy(buf, nbuf);
    return buf;
}


extern "C" char*
doubleToString(double num) {
    char nbuf[128];
    snprintf(nbuf, 128, "%lf", num);
    
    size_t l = strlen(nbuf);
    char* buf = (char*)malloc(l+1);
    strcpy(buf, nbuf);
    return buf;
}

static TargetMachine*
InitMachine() {
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

    if (dumpMode == MLVDumpUnoptimized) {
        M->dump();
    }

    auto FPM = llvm::make_unique<legacy::FunctionPassManager>(M.get());
    FPM->add(createInstructionCombiningPass());
    FPM->add(createReassociatePass());
    FPM->add(createGVNPass());
    FPM->add(createCFGSimplificationPass());
    FPM->doInitialization();

    for (auto &F : *M) {
        FPM->run(F);
    }

    if (dumpMode == MLVDumpOptimized) {
        M->dump();
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

void
MLVCompiler::SetDumpMode(MLVDumpMode mode) {
    dumpMode = mode;
}

AllocaInst*
MLVCompiler::CreateEntryBlockAlloca(Function* f, const std::string& name, Type* type) {
  IRBuilder<> TmpB(&f->getEntryBlock(), f->getEntryBlock().begin());
  return TmpB.CreateAlloca(type, 0, name.c_str());
}

LLVMContext&
MLVCompiler::GetContext() { return context; }

llvm::Value*
MLVCompiler::GetInsertBlock() {
    return builder.GetInsertBlock();
}

void
MLVCompiler::SetInsertBlock(llvm::Value* block) {
    builder.SetInsertPoint(static_cast<llvm::BasicBlock*>(block));
}

llvm::Value*
MLVCompiler::CreateBlock(const std::string& name, llvm::Value* func) {
    return BasicBlock::Create(context, name.c_str(), static_cast<llvm::Function*>(func));
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
    
Value*
MLVCompiler::DeclareString(const std::string& str) {
    return builder.CreateGlobalStringPtr(str.c_str());
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
    // XXXjoe Return void here
    builder.CreateRet(ConstantInt::get(context, APInt(32, 0)));
}

llvm::Value*
MLVCompiler::CompileInteger(size_t size, int value) {
    return ConstantInt::get(context, APInt(size, value));
}

llvm::Value*
MLVCompiler::CompileFloat(float value) {
    return ConstantFP::get(context, APFloat(value));
}

llvm::Value*
MLVCompiler::CompileDouble(double value) {
    return ConstantFP::get(context, APFloat(value));
}

llvm::Value*
MLVCompiler::CastNumber(llvm::Value* num, llvm::Type* toType) {
    llvm::Type* fromType = num->getType();
    if (fromType->isIntegerTy()) {
        if (toType->isIntegerTy()) {
            return builder.CreateSExtOrTrunc(num, toType);
        } else if (toType->isFloatTy()) {
            return builder.CreateSIToFP(num, toType);
        } else if (toType->isDoubleTy()) {
            return builder.CreateSIToFP(num, toType);
        }
    } else if (fromType->isFloatTy()) {
        if (toType->isIntegerTy()) {
            return builder.CreateFPToSI(num, toType);
        } else if (toType->isDoubleTy()) {
            return builder.CreateFPExt(num, toType);
        }
    } else if (fromType->isDoubleTy()) {
        if (toType->isIntegerTy()) {
            return builder.CreateFPToSI(num, toType);
        } else if (toType->isFloatTy()) {
            return builder.CreateFPTrunc(num, toType);
        }
    }
    return num;
}

llvm::Value*
MLVCompiler::CompileCall(llvm::Value* func, std::vector<Value*>& args) {
    return builder.CreateCall(func, args);
}

llvm::Value*
MLVCompiler::CompileEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpEQ(lhs, rhs);
    } else {
        return builder.CreateFCmpUEQ(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileNotEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpNE(lhs, rhs);
    } else {
        return builder.CreateFCmpUNE(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileGreaterThan(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSGT(lhs, rhs);
    } else {
        return builder.CreateFCmpUGT(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileGreaterThanEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSGE(lhs, rhs);
    } else {
        return builder.CreateFCmpUGE(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileLessThan(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSLT(lhs, rhs);
    } else {
        return builder.CreateFCmpULT(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileLessThanEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSLE(lhs, rhs);
    } else {
        return builder.CreateFCmpULE(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileNegate(llvm::Value* operand) {
    if (operand->getType()->isIntegerTy()) {
        return builder.CreateNeg(operand);
    } else {
        return builder.CreateFNeg(operand);
    }
}

llvm::Value*
MLVCompiler::CompileAdd(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateAdd(lhs, rhs);
    } else {
        return builder.CreateFAdd(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileSubtract(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateSub(lhs, rhs);
    } else {
        return builder.CreateFSub(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileMultiply(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateMul(lhs, rhs);
    } else {
        return builder.CreateFMul(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileDivide(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateSDiv(lhs, rhs);
    } else {
        return builder.CreateFDiv(lhs, rhs);
    }
}

llvm::Value*
MLVCompiler::CompileMod(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateSRem(lhs, rhs);
    } else {
        return builder.CreateFRem(lhs, rhs);
    }
}

void
MLVCompiler::CompileReturn(llvm::Value* expr) {
    builder.CreateRet(expr);
}

void
MLVCompiler::CompileJump(llvm::Value* label) {
    builder.CreateBr(static_cast<llvm::BasicBlock*>(label));
}

void
MLVCompiler::CompileConditionalJump(llvm::Value* condition, llvm::Value* label1, llvm::Value* label2) {
    builder.CreateCondBr(condition, static_cast<llvm::BasicBlock*>(label1),
                         static_cast<llvm::BasicBlock*>(label2));
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
