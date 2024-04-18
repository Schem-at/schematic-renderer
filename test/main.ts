import { SchematicRenderer } from '../src/schematic_renderer';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const schematicBase64 = "H4sIAAAAAAAAA11P20rEQAw9ncHtdrx8hJ8h6IO44IOLguJ6QSS2aRvsTqETUF/9UT9FM6ywYiAk53BykgRU13XPa1KpS1Snw1i/npESgLkliqJwDrNzlq5X5PaCY6c9XMB8yUqNiT2q1eKybRPr3bfFH3z/Dz9kU+xitoHWexN8WT2x+hlQXtHAquyxv5bI9UStHpFM+RaPwy3XTZTS80s++DHF8e3juKUh8VP29zjYChPFxjhnbPg1X9J7VlXYu5GBF1FFhVPYjJa3PCUZY97osLOSJr+LH/Ay+vAqAQAA";
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("minecraftDB", 1);
        request.onupgradeneeded = function(event) {
            const db = event?.target?.result;
            if (!db.objectStoreNames.contains("jars")) {
                db.createObjectStore("jars");
            }
        };
        request.onsuccess = function(event) {
            resolve(event?.target?.result);
        };
        request.onerror = function(event) {
            reject("Error opening IndexedDB.");
        };
    });
}

function base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function getCachedMinecraftJarUrl() {
    console.log("Checking IndexedDB for cached Minecraft jar...");
    const jarURL = 'http://localhost:3000/proxy/minecraft-jar';
    const jarUrlHash = "fd19469fed4a4b4c15b2d5133985f0e3e7816a8a";
    const db = await openDatabase();
    const transaction = db.transaction(["jars"], "readonly");
    const objectStore = transaction.objectStore("jars");
    const request = objectStore.get(jarUrlHash);
    return new Promise(async (resolve, reject) => {
        request.onsuccess = function(event) {
            if (request.result) {
                console.log("Jar found in IndexedDB.");
                resolve(URL.createObjectURL(request.result));
            } else {
                console.log(
                    "Jar not found in IndexedDB, fetching from Mojang..."
                );
                fetch(jarURL)
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error("HTTP error " + response.status);
                        }
                        console.log("Jar fetched from Mojang, unzipping...");
                        const blob = response.blob();
                        console.log(blob);
                        return blob;
                    })
                    .then((blob) => {
                        console.log(
                            "Jar fetched from Mojang, storing in IndexedDB..."
                        );
                        return blob;
                    })
                    .then((blob) => {
                        const addRequest = db
                            .transaction(["jars"], "readwrite")
                            .objectStore("jars")
                            .add(blob, jarUrlHash);

                        addRequest.onsuccess = function(event) {
                            resolve(URL.createObjectURL(blob));
                        };
                        addRequest.onerror = function(event) {
                            reject("Error storing jar in IndexedDB.");
                        };
                    })
                    .catch((error) => {
                        reject("Error fetching jar from Mojang.");
                    });
            }
        };
        request.onerror = function(event) {
            reject("Error fetching jar from IndexedDB.");
        };
    });
}
const defaultSchematicOptions = {
    getClientJarUrl: async (props) => {
        return await getCachedMinecraftJarUrl();
    },
};


const options = {
    ...defaultSchematicOptions,
};

const renderer = new SchematicRenderer(canvas, schematicBase64, options);