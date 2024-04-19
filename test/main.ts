import { SchematicRenderer } from '../src/schematic_renderer';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const schematicBase64 = "H4sIAAAAAAAAA11P20rEQAw9ncHtdrx8hJ8h6IO44IOLguJ6QSS2aRvsTqETUF/9UT9FM6ywYiAk53BykgRU13XPa1KpS1Snw1i/npESgLkliqJwDrNzlq5X5PaCY6c9XMB8yUqNiT2q1eKybRPr3bfFH3z/Dz9kU+xitoHWexN8WT2x+hlQXtHAquyxv5bI9UStHpFM+RaPwy3XTZTS80s++DHF8e3juKUh8VP29zjYChPFxjhnbPg1X9J7VlXYu5GBF1FFhVPYjJa3PCUZY97osLOSJr+LH/Ay+vAqAQAA";
const adderSchematicBase64String = "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";
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

const renderer = new SchematicRenderer(canvas, adderSchematicBase64String, options);