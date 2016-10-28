#include "llvm/IR/Mangler.h"
#include "llvm/Support/DynamicLibrary.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Target/TargetMachine.h"


#include "llvm/Pass.h"
#include "llvm/ADT/APFloat.h"
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
#include "llvm/IR/DataLayout.h"
#include "llvm/IR/Mangler.h"
#include "llvm/Support/DynamicLibrary.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Target/TargetMachine.h"

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <memory>
#include <string>
#include <vector>
 #include <dlfcn.h>
 
using namespace llvm;
using namespace llvm::orc;

static std::string mangle(const std::string &Name, DataLayout DL) {
    std::string MangledName;
    raw_string_ostream MangledNameStream(MangledName);
    Mangler::getNameWithPrefix(MangledNameStream, Name, DL);
    return MangledNameStream.str();
}

static std::unique_ptr<Module> optimizeModule(std::unique_ptr<Module> M) {
    // Create a function pass manager.
    auto FPM = llvm::make_unique<legacy::FunctionPassManager>(M.get());

    // Add some optimizations.
    FPM->add(createInstructionCombiningPass());
    FPM->add(createReassociatePass());
    // FPM->add(createGVNPass());
    FPM->add(createCFGSimplificationPass());
    FPM->doInitialization();

    // Run the optimizations over all functions in the module being added to
    // the JIT.
    for (auto &F : *M)
      FPM->run(F);

    return M;
  }
  
extern "C" double poop() {
    printf("take a poop\n");
    return 42.0;
}

extern "C" int testComp() {
    LLVMContext TheContext;
    IRBuilder<> Builder(TheContext);

    // Initialize the target registry etc.
    InitializeAllTargetInfos();
    InitializeAllTargets();
    InitializeAllTargetMCs();
    InitializeAllAsmParsers();
    InitializeAllAsmPrinters();
    
    auto TargetTriple = sys::getDefaultTargetTriple();

    std::string Error;
    auto Target = TargetRegistry::lookupTarget(TargetTriple, Error);

    auto CPU = "generic";
    auto Features = "";

    TargetOptions opt;
    auto RM = Optional<Reloc::Model>();
    auto theTargetMachine = Target->createTargetMachine(TargetTriple, CPU, Features, opt, RM);
    auto DL = theTargetMachine->createDataLayout();

    std::unique_ptr<Module> TheModule = llvm::make_unique<Module>("test module", TheContext);
    TheModule->setTargetTriple(TargetTriple);
    TheModule->setDataLayout(DL);

    ObjectLinkingLayer<> ObjectLayer;
    IRCompileLayer<decltype(ObjectLayer)> CompileLayer(ObjectLayer,
                                                       SimpleCompiler(*theTargetMachine));
    typedef std::function<std::unique_ptr<Module>(std::unique_ptr<Module>)> OptimizeFunction;
    IRTransformLayer<decltype(CompileLayer), OptimizeFunction> OptimizeLayer(CompileLayer,
                      [](std::unique_ptr<Module> M) {
                        return optimizeModule(std::move(M));
                    });

    auto Resolver = createLambdaResolver(
        [&](const std::string &Name) {
            printf("find %s", Name.c_str());
        //   if (auto Sym = IndirectStubsMgr->findStub(Name, false))
        //     return Sym.toRuntimeDyldSymbol();
          if (auto Sym = OptimizeLayer.findSymbol(Name, false))
            return Sym.toRuntimeDyldSymbol();
          return RuntimeDyld::SymbolInfo(nullptr);
        },
        [](const std::string &Name) {
            printf("find2 %s", Name.c_str());
          if (auto SymAddr =
                RTDyldMemoryManager::getSymbolAddressInProcess(Name))
            return RuntimeDyld::SymbolInfo(SymAddr, JITSymbolFlags::Exported);
          return RuntimeDyld::SymbolInfo(nullptr);
        });
          
    std::vector<Type*> poopret(0, Type::getDoubleTy(TheContext));
    FunctionType* poopsig = FunctionType::get(Type::getDoubleTy(TheContext), poopret, false);
    Function* poopfn = Function::Create(poopsig, Function::ExternalLinkage, "poop", TheModule.get());
    
    std::vector<Type*> funny(0, Type::getDoubleTy(TheContext));
    FunctionType *FT = FunctionType::get(Type::getDoubleTy(TheContext), funny, false);
    Function *F  = Function::Create(FT, Function::ExternalLinkage, "funny", TheModule.get());

    BasicBlock *BB = BasicBlock::Create(TheContext, "entry", F);
    Builder.SetInsertPoint(BB);

    std::vector<Value *> ArgsV;
    Value* calltmp = Builder.CreateCall(poopfn, ArgsV, "calltmp");

    Builder.CreateRet(calltmp);

    TheModule->dump();

    std::vector<std::unique_ptr<Module>> Ms;
    Ms.push_back(std::move(TheModule));
    OptimizeLayer.addModuleSet(std::move(Ms),
                                      make_unique<SectionMemoryManager>(),
                                      std::move(Resolver));

    llvm::sys::DynamicLibrary::LoadLibraryPermanently(nullptr);

    printf("looking...");
    // if (auto sym = Resolver->findSymbol(mangle("funny", DL))) {
    if (auto sym = OptimizeLayer.findSymbol(mangle("funny", DL), false)) {
        printf("found!\n");
        double (*FP)() = (double (*)())(intptr_t)sym.getAddress();
        double got = FP();
        printf("returned %f\n", got);
    } else {
        printf("NOT found\n");
    }
    
    // auto SymAddr = RTDyldMemoryManager::getSymbolAddressInProcess("poop");
    // printf("poop is %lld", SymAddr);
    // if (SymAddr) {
    //     auto sym = RuntimeDyld::SymbolInfo(SymAddr, JITSymbolFlags::Exported);
    //     void (*FP)() = (void (*)())(intptr_t)sym.getAddress();
    //     FP();
    // }
    
    // std::vector<GenericValue> Args(0)
    // GenericValue GV = EE->runFunction(F, Args);
    
    // auto Filename = "/Users/joehewitt/Desktop/output.o";
    // std::error_code EC;
    // raw_fd_ostream dest(Filename, EC, sys::fs::F_None);
    //
    // if (EC) {
    //     errs() << "Could not open file: " << EC.message();
    //     return 1;
    // }
    //
    // legacy::PassManager pass;
    // auto FileType = TargetMachine::CGFT_ObjectFile;
    //
    // if (theTargetMachine->addPassesToEmitFile(pass, dest, FileType)) {
    // errs() << "TheTargetMachine can't emit a file of this type";
    //     return 1;
    // }
    // pass.run(*TheModule);
    // dest.flush();

    return 0;
}
