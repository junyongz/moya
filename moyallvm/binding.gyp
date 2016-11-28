{
 'make_global_settings': [
    ['CXX','/usr/bin/clang++'],
    ['LINK','/usr/bin/clang++'],
  ],
  "targets": [
    {
      "target_name": "moyallvm",
      "sources": [
        "src/moyallvm.cpp",
        "src/tests.cpp",
        "src/MoLLVMBridge.cpp",
        "src/MoJBridge.cpp",
        "src/MoJValue.cpp",
        "src/MoJType.cpp",
        "src/MoJDIScope.cpp",
        "src/MoCore.cpp"
       ],
      'conditions': [
        [ 'OS=="mac"', {

        'xcode_settings': {
            'OTHER_CPLUSPLUSFLAGS' : ['-std=c++11','-stdlib=libc++'],
            'OTHER_LDFLAGS': ['-stdlib=libc++', '`llvm-config --cxxflags --ldflags --system-libs --libs all`'],
             'MACOSX_DEPLOYMENT_TARGET': '10.12'
            },
        }],
        ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")",
        "/usr/local/include"
      ]
    }
  ]
}
