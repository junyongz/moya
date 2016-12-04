
#include "MoLLVMBridge.h"

#include "llvm/Pass.h"
#include "llvm/ADT/APFloat.h"
#include "llvm/ADT/APInt.h"
#include "llvm/ADT/APSInt.h"
#include "llvm/ADT/STLExtras.h"
#include "llvm/ADT/SmallVector.h"
#include "llvm/Analysis/Passes.h"
#include "llvm/IR/IRPrintingPasses.h"
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

// Not used, just need this here so it gets linked
#include "MoCore/MoCore.h"

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
static MLVOptimizeLevel optimizeLevel = MLVOptimizeNothing;

// *************************************************************************************************

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

static void
configurePasses(legacy::PassManagerBase& fpm) {
    if (optimizeLevel == MLVOptimizeFull) {
        fpm.add(createPromoteMemoryToRegisterPass());
        fpm.add(createInstructionCombiningPass());
        fpm.add(createReassociatePass());
        fpm.add(createGVNPass());
        fpm.add(createCFGSimplificationPass());
        fpm.add(createReassociatePass());

        // if (dumpMode == MLVDumpOptimized) {
        //     fpm.add(llvm::createPrintModulePass(outs()));
        // }
    }
}
    
static std::unique_ptr<Module>
optimizeModule(std::unique_ptr<Module> module) {
    llvm::sys::DynamicLibrary::LoadLibraryPermanently(nullptr);

    if (dumpMode == MLVDumpUnoptimized) {
        module->dump();
    }

    legacy::FunctionPassManager fpm(module.get());
    configurePasses(fpm);
    fpm.doInitialization();
    
    for (auto &func : *module) {
        fpm.run(func);
    }

    // fpm.doFinalization();

    return module;
}

// *************************************************************************************************

MoLLVMBridge::MoLLVMBridge():
    context(),
    builder(context),
    dibuilder(NULL),
    diunit(NULL),
    machine(InitMachine()),
    dataLayout(machine->createDataLayout()),
    compileLayer(objectLayer, SimpleCompiler(*machine)),
    optimizeLayer(compileLayer,
        [this](std::unique_ptr<Module> M) {
          return optimizeModule(std::move(M));
    })
{
}

MoLLVMBridge::~MoLLVMBridge() {
    delete dibuilder;
}

// *************************************************************************************************

void
MoLLVMBridge::SetDumpMode(MLVDumpMode mode) {
    dumpMode = mode;
}

void
MoLLVMBridge::SetOptimizeLevel(MLVOptimizeLevel level) {
    optimizeLevel = level;
}

DIType*
MoLLVMBridge::GetDITypeForType(Type* type) {
    int size = dataLayout.getTypeSizeInBits(type);
    if (type->isIntegerTy()) {
        return dibuilder->createBasicType("int", size, size, dwarf::DW_ATE_signed);
    } else if (type->isFloatTy()) {
        return dibuilder->createBasicType("float", size, size, dwarf::DW_ATE_float);
    } else if (type->isDoubleTy()) {
        return dibuilder->createBasicType("double", size, size, dwarf::DW_ATE_float);
    } else {
        return NULL;
    }
}

// *************************************************************************************************

AllocaInst*
MoLLVMBridge::CreateEntryBlockAlloca(Function* f, const std::string& name, Type* type) {
  IRBuilder<> TmpB(&f->getEntryBlock(), f->getEntryBlock().begin());
  return TmpB.CreateAlloca(type, 0, name.c_str());
}

LLVMContext&
MoLLVMBridge::GetContext() { return context; }

llvm::Value*
MoLLVMBridge::GetInsertBlock() {
    return builder.GetInsertBlock();
}

void
MoLLVMBridge::SetInsertBlock(Value* block) {
    builder.SetInsertPoint(static_cast<BasicBlock*>(block));
}

bool
MoLLVMBridge::IsBlockEmpty(Value* block) {
    return static_cast<BasicBlock*>(block)->empty();
}

void
MoLLVMBridge::EraseBlock(Value* block) {
    static_cast<BasicBlock*>(block)->eraseFromParent();
}

Value*
MoLLVMBridge::CreateBlock(const std::string& name, llvm::Function* func) {
    if (!func) {
        func = builder.GetInsertBlock()->getParent();
    }
    return BasicBlock::Create(context, name.c_str(), func);
}

Type*
MoLLVMBridge::GetType(int code) {
    if (code == 1) {
        return Type::getInt1Ty(context);
    } else if (code == 2) {
        return Type::getInt8Ty(context);
    } else if (code == 3) {
        return Type::getInt16Ty(context);
    } else if (code == 4) {
        return Type::getInt32Ty(context);
    } else if (code == 5) {
        return Type::getInt64Ty(context);
    } else if (code == 6) {
        return Type::getFloatTy(context);
    } else if (code == 7) {
        return Type::getDoubleTy(context);
    } else {
        return Type::getVoidTy(context);
    }
}

llvm::Type*
MoLLVMBridge::CreateStructType(const std::string& name) {
    return StructType::create(context, name);
}

llvm::Value*
MoLLVMBridge::InsertValue(llvm::Value* agg, unsigned int index, llvm::Value* value) {
    std::vector<unsigned int> indices;
    indices.push_back(index);
    return builder.CreateInsertValue(agg, value, indices);
}

llvm::Value*
MoLLVMBridge::ExtractValue(llvm::Value* agg, unsigned int index, const std::string& name) {
    std::vector<unsigned int> indices;
    indices.push_back(index);
    return builder.CreateExtractValue(agg, indices, name);
}

uint64_t
MoLLVMBridge::SetStructBody(llvm::StructType* type, const std::vector<llvm::Type*>& body) {
    type->setBody(body);

    const llvm::StructLayout* layout = dataLayout.getStructLayout(type);
    return layout->getSizeInBytes();
}

llvm::Value*
MoLLVMBridge::CreateStruct(llvm::StructType* type, const std::vector<llvm::Constant*>& values) {
    return llvm::ConstantStruct::get(type, values);
}

uint64_t
MoLLVMBridge::GetTypeSize(llvm::Type* type) {
    return dataLayout.getTypeSizeInBits(type);
}

void
MoLLVMBridge::BeginModule(const std::string& name, bool shouldDebug) {
    module = make_unique<Module>(name, context);
    module->setDataLayout(dataLayout);
    
    FunctionType* ft = FunctionType::get(Type::getInt32Ty(context), true);
    personality = Function::Create(ft, Function::ExternalLinkage,
                                   "__moya_personality_v0", module.get());
    
    if (shouldDebug) {
        dibuilder = new DIBuilder(*module);
        diunit = dibuilder->createCompileUnit(dwarf::DW_LANG_C, "moya", ".", "Moya", 0, "", 0);
    }
}

void
MoLLVMBridge::EndModule() {
    if (dibuilder) {
        dibuilder->finalize();
    }
}

void
MoLLVMBridge::EmitObject(const std::string& path) {
    std::error_code EC;
    raw_fd_ostream dest(path, EC, sys::fs::F_None);

    if (EC) {
      errs() << "Could not open file: " << EC.message();
      return;
    }

    // llvm::verifyModule(*module.get());

    legacy::PassManager fpm;
    configurePasses(fpm);
    
    auto FileType = TargetMachine::CGFT_ObjectFile;
    if (machine->addPassesToEmitFile(fpm, dest, FileType)) {
      errs() << "TargetMachine can't emit a file of this type";
      return;
    }

    if (dumpMode == MLVDumpUnoptimized) {
        module->dump();
    }

    fpm.run(*module);

    if (dumpMode == MLVDumpOptimized) {
        module->dump();
    }

    dest.flush();
    dest.close();
}

int
MoLLVMBridge::ExecuteMain() {
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

    // llvm::verifyModule(*module.get());
    
    std::vector<std::unique_ptr<Module>> Ms;
    Ms.push_back(std::move(module));
    
    auto moduleSet = optimizeLayer.addModuleSet(std::move(Ms),
                                        make_unique<SectionMemoryManager>(),
                                        std::move(Resolver));

    optimizeLayer.emitAndFinalize(moduleSet);

    if (auto sym = optimizeLayer.findSymbol(mangle("main", dataLayout), false)) {
        int (*FP)() = (int (*)())(intptr_t)sym.getAddress();
        return FP();
    } else {
        return -1;
    }
}

// *************************************************************************************************

DIScope* MoLLVMBridge::CreateDebugModule(const std::string& name, const std::string& dirPath) {
    if (!dibuilder) return NULL;
    
    return dibuilder->createFile(name, dirPath);
}

DIScope* MoLLVMBridge::CreateDebugFunction(const std::string& name, DIFile* unit, Function* func,
                                          int argCount, int lineNo) {
    if (!dibuilder) return NULL;
    
    SmallVector<Metadata *, 8> argTypes;
    // DIType *DblTy = KSDbgInfo.getDoubleTy();
    // EltTys.push_back(DblTy);
    
    DITypeRefArray argTypesRef = dibuilder->getOrCreateTypeArray(argTypes);
    DISubroutineType* ftype = dibuilder->createSubroutineType(argTypesRef);

    DISubprogram* sp = dibuilder->createFunction(unit, name, StringRef(), unit, lineNo, ftype,
                                                false, true, lineNo, DINode::FlagPrototyped, false);
    func->setSubprogram(sp);
    return sp;
}

void MoLLVMBridge::CreateDebugVariable(const std::string& name, DIFile* unit, DIScope* scope,
                                      Value* alloca, Type* type, int argNo, int lineNo) {
    DIType* ditype = GetDITypeForType(type);
    if (!ditype) return;
    
    DILocalVariable* pv;
    if (argNo) {
        pv = dibuilder->createParameterVariable(scope, name, argNo, unit, lineNo, ditype, true);
    } else {
        pv = dibuilder->createAutoVariable(scope, name, unit, lineNo, ditype, true);
    }
    dibuilder->insertDeclare(alloca, pv, dibuilder->createExpression(),
                             DebugLoc::get(lineNo, 0, scope),
                             builder.GetInsertBlock());
}
    
void MoLLVMBridge::SetDebugLocation(int line, int col, DIScope* scope) {
    if (dibuilder) {
        // printf("loc %d:%d %d %d\n", line, col, scope, diunit); fflush(stdout);
        builder.SetCurrentDebugLocation(DebugLoc::get(line, col, scope));
    }
}

Type*
MoLLVMBridge::GetFunctionSignatureType(Type* returnType, const std::vector<Type*>& argTypes) {
    return FunctionType::get(returnType, argTypes, false);
}

Value*
MoLLVMBridge::DeclareExternalFunction(std::string& name, Type* returnType,
                                     const std::vector<Type*>& argTypes, bool doesNotThrow) {
    FunctionType* ft = FunctionType::get(returnType ? returnType : Type::getVoidTy(context),
                                         argTypes, false);
    Function* func = Function::Create(ft, Function::ExternalLinkage, name, module.get());
    if (doesNotThrow) {
        func->setDoesNotThrow();
    }

    if (!returnType) {
        func->addFnAttr(Attribute::NoReturn);
    }

    return func;
}
    
std::vector<llvm::Value*>
MoLLVMBridge::DeclareFunction(std::string& name, Type* returnType, const std::vector<Type*>& argTypes, const std::vector<std::string>& argNames, bool doesNotThrow) {
    FunctionType* ft = FunctionType::get(returnType ? returnType : Type::getVoidTy(context),
                                         argTypes, false);
    Function* func = Function::Create(ft, Function::ExternalLinkage, name, module.get());
    func->setPersonalityFn(personality);
    
    if (doesNotThrow) {
        func->setDoesNotThrow();
    }
    
    if (!returnType) {
        func->addFnAttr(Attribute::NoReturn);
    }
    
    std::vector<llvm::Value*> argsRet;
    argsRet.push_back(func);
    
    unsigned i = 0;
    for (auto &arg : func->args()) {
        std::string argName = argNames[i++];
        arg.setName(argName);
                
        argsRet.push_back(&arg);
    }
        
    return argsRet;
}

llvm::Value*
MoLLVMBridge::CreateClassTable(const std::string& name, const std::vector<Value*> functions) {
    Type* i8p = Type::getInt8Ty(context)->getPointerTo();
    ArrayType* arrayType = ArrayType::get(i8p, functions.size());
    
    std::vector<Constant*> castFuncs;
    for (auto value : functions) {
        Value* val = builder.CreateBitCast(value, i8p);
        Constant* con = static_cast<Constant*>(val);
        castFuncs.push_back(con);
    }
    
    Constant* array123 = ConstantArray::get(arrayType, castFuncs);
    
    module->getOrInsertGlobal(name, arrayType);
    llvm::GlobalVariable* variable = module->getNamedGlobal(name);
    variable->setConstant(true);
    variable->setAlignment(8);
    variable->setInitializer(array123);
    
    return variable;
}

llvm::Value*
MoLLVMBridge::GetGlobal(llvm::Type* type, const std::string& name, llvm::Constant* value,
                        bool isConstant) {
 	if (value) {
        return new GlobalVariable(*module, type, isConstant, GlobalValue::PrivateLinkage, value,
                                  name);
    } else {
        return new GlobalVariable(*module, type, isConstant, GlobalValue::ExternalLinkage, NULL,
                                  name);
    }
}

llvm::Value*
MoLLVMBridge::DeclareString(const std::string& str) {
    return builder.CreateGlobalStringPtr(str.c_str());
}

llvm::Value*
MoLLVMBridge::CompileInteger(size_t size, int value) {
    return ConstantInt::get(context, APInt(size, value));
}

llvm::Value*
MoLLVMBridge::CompileFloat(float value) {
    return ConstantFP::get(context, APFloat(value));
}

llvm::Value*
MoLLVMBridge::CompileDouble(double value) {
    return ConstantFP::get(context, APFloat(value));
}

llvm::Value*
MoLLVMBridge::CastNumber(llvm::Value* num, llvm::Type* toType) {
    llvm::Type* fromType = num->getType();
    if (fromType->isIntegerTy()) {
        if (toType->isIntegerTy()) {
            return builder.CreateSExtOrTrunc(num, toType);
        } else if (toType->isFloatTy()) {
            return builder.CreateSIToFP(num, toType);
        } else if (toType->isDoubleTy()) {
            return builder.CreateSIToFP(num, toType);
        } else if (toType->isPointerTy()) {
            return builder.CreateIntToPtr(num, toType);
        }
    } else if (fromType->isFloatTy()) {
        if (toType->isIntegerTy()) {
            return builder.CreateFPToSI(num, toType);
        } else if (toType->isDoubleTy()) {
            return builder.CreateFPExt(num, toType);
        } else if (toType->isPointerTy()) {
            llvm::Value* i = builder.CreateFPToSI(num, Type::getInt64Ty(context));
            return builder.CreateIntToPtr(i, toType);
        }
    } else if (fromType->isDoubleTy()) {
        if (toType->isIntegerTy()) {
            return builder.CreateFPToSI(num, toType);
        } else if (toType->isFloatTy()) {
            return builder.CreateFPTrunc(num, toType);
        } else if (toType->isPointerTy()) {
            llvm::Value* i = builder.CreateFPToSI(num, Type::getInt64Ty(context));
            return builder.CreateIntToPtr(i, toType);
        }
    }
    return num;
}

llvm::Value*
MoLLVMBridge::CompileBitcast(llvm::Value* value, llvm::Type* type) {
    llvm::Type* fromType = value->getType();
    if (fromType->isPointerTy() && type->isIntegerTy()) {
        return builder.CreatePtrToInt(value, type);
    } else {
        return builder.CreateBitCast(value, type);
    }
}

llvm::Value*
MoLLVMBridge::CompileCall(llvm::Value* func, std::vector<Value*>& args) {
    return builder.CreateCall(func, args);
}

llvm::Value*
MoLLVMBridge::CompileInvoke(Value* func, BasicBlock* normalDest,
                            BasicBlock* unwindDest, std::vector<Value*>& args) {
    return builder.CreateInvoke(func, normalDest, unwindDest, args);
}

llvm::Value*
MoLLVMBridge::CompileEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isFloatTy() || lhs->getType()->isDoubleTy()) {
        return builder.CreateFCmpUEQ(lhs, rhs);
    } else {
        return builder.CreateICmpEQ(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileNotEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isFloatTy() || lhs->getType()->isDoubleTy()) {
        return builder.CreateFCmpUNE(lhs, rhs);
    } else {
        return builder.CreateICmpNE(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileGreaterThan(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSGT(lhs, rhs);
    } else {
        return builder.CreateFCmpUGT(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileGreaterThanEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSGE(lhs, rhs);
    } else {
        return builder.CreateFCmpUGE(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileLessThan(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSLT(lhs, rhs);
    } else {
        return builder.CreateFCmpULT(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileLessThanEquals(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateICmpSLE(lhs, rhs);
    } else {
        return builder.CreateFCmpULE(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileNegate(llvm::Value* operand) {
    if (operand->getType()->isIntegerTy()) {
        return builder.CreateNeg(operand);
    } else {
        return builder.CreateFNeg(operand);
    }
}

llvm::Value*
MoLLVMBridge::CompileAdd(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateAdd(lhs, rhs);
    } else {
        return builder.CreateFAdd(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileSubtract(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateSub(lhs, rhs);
    } else {
        return builder.CreateFSub(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileMultiply(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateMul(lhs, rhs);
    } else {
        return builder.CreateFMul(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileDivide(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateSDiv(lhs, rhs);
    } else {
        return builder.CreateFDiv(lhs, rhs);
    }
}

llvm::Value*
MoLLVMBridge::CompileMod(llvm::Value* lhs, llvm::Value* rhs) {
    if (lhs->getType()->isIntegerTy()) {
        return builder.CreateSRem(lhs, rhs);
    } else {
        return builder.CreateFRem(lhs, rhs);
    }
}

void
MoLLVMBridge::CompileReturn(llvm::Value* expr) {
    if (expr) {
        builder.CreateRet(expr);
    } else {
        builder.CreateRetVoid();
    }
}

void
MoLLVMBridge::CompileJump(llvm::Value* label) {
    builder.CreateBr(static_cast<llvm::BasicBlock*>(label));
}

void
MoLLVMBridge::CompileConditionalJump(llvm::Value* condition, llvm::Value* label1, llvm::Value* label2) {
    builder.CreateCondBr(condition, static_cast<llvm::BasicBlock*>(label1),
                         static_cast<llvm::BasicBlock*>(label2));
}

llvm::Value*
MoLLVMBridge::CompilePHI(llvm::Type* type, const std::vector<llvm::Value*>& values, const std::vector<llvm::Value*>& blocks) {
    llvm::PHINode* phi = builder.CreatePHI(type, values.size());
    
    for(int i = 0, l = values.size(); i < l; ++i) {
        llvm::Value* val = values[i];
        llvm::BasicBlock* block = static_cast<llvm::BasicBlock*>(blocks[i]);
        phi->addIncoming(val, block);
    }
    return phi;
}

llvm::Value*
MoLLVMBridge::CompileLandingPad(llvm::Type* padType, bool isCleanup,
                                const std::vector<llvm::Value*>& clauses) {
    LandingPadInst* pad = builder.CreateLandingPad(padType, clauses.size());
    
    if (isCleanup) {
        pad->setCleanup(true);
    }
    
    for(int i = 0, l = clauses.size(); i < l; ++i) {
        llvm::Constant* clause = static_cast<llvm::Constant*>(clauses[i]);
        pad->addClause(clause);
    }
    
    return pad;
}

void
MoLLVMBridge::CompileResume(llvm::Value* landingPad) {
    builder.CreateResume(landingPad);
}

llvm::Value*
MoLLVMBridge::CompileCatchSwitch(llvm::Value* parentPad, llvm::BasicBlock* unwindBB,
                                 const std::vector<llvm::BasicBlock*>& handlers) {
    CatchSwitchInst* csi = builder.CreateCatchSwitch(parentPad, unwindBB, handlers.size());
    for(int i = 0, l = handlers.size(); i < l; ++i) {
        llvm::BasicBlock* handler = handlers[i];
        csi->addHandler(handler);
    }
    
    return csi;
}

llvm::Value*
MoLLVMBridge::CompileCatchPad(llvm::Value* parentPad, const std::vector<llvm::Value*>& args) {
    return builder.CreateCatchPad(parentPad, args);
}

llvm::Value*
MoLLVMBridge::CompileCatchRet(llvm::CatchPadInst* catchPad, llvm::BasicBlock* afterBlock) {
    return builder.CreateCatchRet(catchPad, afterBlock);
}

llvm::Value*
MoLLVMBridge::CompileCleanupPad(llvm::Value* parentPad, const std::vector<llvm::Value*>& args) {
    return builder.CreateCleanupPad(parentPad, args);
}

llvm::Value*
MoLLVMBridge::CompileCleanupRet(llvm::CleanupReturnInst* cleanupPad, llvm::BasicBlock* unwindBB) {
    return builder.CreateCatchPad(cleanupPad, unwindBB);
}

llvm::Value*
MoLLVMBridge::CompileNone() {
    return llvm::ConstantTokenNone::get(context);
}

void
MoLLVMBridge::CompileUnreachable() {
    builder.CreateUnreachable();
}

llvm::Value*
MoLLVMBridge::CreateVariable(const std::string& name, llvm::Type* type) {
    Function* f = builder.GetInsertBlock()->getParent();
    AllocaInst* alloca = CreateEntryBlockAlloca(f, name, type);
    return alloca;
}

void
MoLLVMBridge::StoreVariable(llvm::Value* lhs, llvm::Value* rhs) {
    builder.CreateStore(rhs, lhs);
}
    
llvm::Value*
MoLLVMBridge::LoadVariable(llvm::Value* alloca, const std::string& name, llvm::Type* type) {
    if (type) {
        return builder.CreateLoad(type, alloca, name.c_str());
    } else {
        return builder.CreateLoad(alloca, name.c_str());
    }
}

llvm::Value*
MoLLVMBridge::GetPointer(llvm::Value* pointer, std::vector<llvm::Value*>& offsets, llvm::Type* type){
    if (type) {
        return builder.CreateInBoundsGEP(type, pointer, offsets);
    } else {
        return builder.CreateInBoundsGEP(pointer, offsets);
    }
}
