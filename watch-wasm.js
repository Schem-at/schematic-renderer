const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
// current path
///Users//Documents/GitHub/schematic-renderer

const wasmDestPath = path.resolve(__dirname, 'src/wasm');

// Rust project path
///Users//RustroverProjects/schematic_utils


// const rustProjectPath = path.resolve(__dirname, '~/RustroverProjects/schematic_utils');


// use /Users/harrisonbastian/RustroverProjects/schematic_utils

const rustProjectPath = path.resolve('/Users/harrisonbastian/RustroverProjects/schematic_utils');

//check if the path is correct
console.log(rustProjectPath);
console.log(wasmDestPath);

// Watch Rust project files
chokidar.watch(path.join(rustProjectPath, 'src'), {
    ignored: /(^|[\/\\])\../,
    persistent: true
}).on('change', (path) => {
    console.log(`File ${path} has been changed. Rebuilding WASM...`);
    rebuildWasm();

});

function rebuildWasm() {
    exec('wasm-pack build --target web --features wasm', { cwd: rustProjectPath }, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);

        // Copy WASM files to TypeScript project
        fs.copy(path.join(rustProjectPath, 'pkg'), wasmDestPath, err => {
            if (err) return console.error(err);
            console.log('WASM files copied to TypeScript project');
        });
    });
}

// Initial build
rebuildWasm();