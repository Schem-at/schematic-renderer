const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');

// Nucleation project path
const nucleationPath = path.resolve('/Users/harrison/RustroverProjects/Nucleation');

console.log('Watching Nucleation source:', path.join(nucleationPath, 'src'));
console.log('Build script:', path.join(nucleationPath, 'build-wasm.sh'));

// Watch Nucleation Rust source files
chokidar.watch(path.join(nucleationPath, 'src'), {
    ignored: /(^|[\/\\])\../,
    persistent: true
}).on('change', (filePath) => {
    console.log(`File ${filePath} has been changed. Rebuilding Nucleation WASM...`);
    rebuildWasm();
});

function rebuildWasm() {
    exec('./build-wasm.sh', { cwd: nucleationPath }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Build error: ${error}`);
            return;
        }
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);

        // The file: dependency in package.json means pkg/ is already linked
        console.log('Nucleation WASM rebuild complete. Package linked via file: dependency.');
    });
}

// Initial build
rebuildWasm();
