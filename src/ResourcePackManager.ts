// ResourcePackManager.ts

interface StoredResourcePack {
    name: string;
    data: Blob;
    enabled: boolean;
    order: number;
  }
  
export type DefaultPackCallback = () => Promise<Blob>;

  export class ResourcePackManager {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void>;
  
    constructor() {
      this.initPromise = this.initDB();
    }
  
    private async initDB(): Promise<void> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('ResourcePacksDB', 2); // Increased version number
  
        request.onerror = () => reject("Error opening database");
  
        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve();
        };
  
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const store = db.createObjectStore('packs', { keyPath: 'name' });
          store.createIndex('order', 'order', { unique: false });
        };
      });
    }
  
    private async ensureDbInitialized(): Promise<void> {
      await this.initPromise;
    }
  
    async uploadPack(file: File): Promise<void> {
        await this.ensureDbInitialized();
        const pack = await this.readFileToPack(file);
        await this.savePack(pack);
      }

    private async readFileToPack(file: File): Promise<StoredResourcePack> {
        const name = file.name;
        return { 
          name, 
          data: file, 
          enabled: true,  // Default to enabled
          order: await this.getNextOrder()  // Get the next available order
        };
      }
      
      private async getNextOrder(): Promise<number> {
        const packs = await this.listPacks();
        return packs.length > 0 ? Math.max(...packs.map(p => p.order)) + 1 : 0;
      }
  
      private async savePack(pack: StoredResourcePack): Promise<void> {
        await this.ensureDbInitialized();
        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject("Database not initialized");
            return;
          }
      
          const transaction = this.db.transaction(['packs'], 'readwrite');
          const store = transaction.objectStore('packs');
          const request = store.put({
            name: pack.name,
            data: pack.data,
            enabled: pack.enabled !== undefined ? pack.enabled : true,
            order: pack.order !== undefined ? pack.order : 0
          });
      
          request.onerror = () => reject("Error saving pack");
          request.onsuccess = () => resolve();
        });
      }
  
    async clearPacks(): Promise<void> {
      await this.ensureDbInitialized();
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject("Database not initialized");
          return;
        }
  
        const transaction = this.db.transaction(['packs'], 'readwrite');
        const store = transaction.objectStore('packs');
        const request = store.clear();
  
        request.onerror = () => reject("Error clearing packs");
        request.onsuccess = () => resolve();
      });
    }
  
    async listPacks(): Promise<{ name: string; enabled: boolean; order: number }[]> {
      await this.ensureDbInitialized();
        return new Promise((resolve, reject) => {
            if (!this.db) {
            reject("Database not initialized");
            return;
            }
    
            const transaction = this.db.transaction(['packs'], 'readwrite');
            const store = transaction.objectStore('packs');
            const request = store.getAll();
    
            request.onerror = () => reject("Error getting packs");
            request.onsuccess = () => {
            const packs = request.result as StoredResourcePack[];
            resolve(packs.map(pack => ({ name: pack.name, enabled: pack.enabled, order: pack.order })));
            };
        });

    }
  
    async getResourcePackBlobs(defaultPacks: Record<string, DefaultPackCallback>): Promise<Blob[]> {
        await this.ensureDbInitialized();
        return new Promise(async (resolve, reject) => {
          if (!this.db) {
            reject("Database not initialized");
            return;
          }
    
          const transaction = this.db.transaction(['packs'], 'readwrite');
          const store = transaction.objectStore('packs');
          const request = store.getAll();
    
          request.onerror = () => reject("Error getting packs");
          request.onsuccess = async () => {
            let packs = request.result as StoredResourcePack[];
            const storedPackNames = new Set(packs.map(pack => pack.name));
            
            // Fetch and store default packs that don't exist in the database
            for (const [name, callback] of Object.entries(defaultPacks)) {
              if (!storedPackNames.has(name)) {
                try {
                  const blob = await callback();
                  const newPack: StoredResourcePack = { 
                    name, 
                    data: blob, 
                    enabled: true, 
                    order: packs.length // Add to the end by default
                  };
                  await this.savePack(newPack);
                  packs.push(newPack);
                } catch (error) {
                  console.error(`Failed to fetch default pack ${name}:`, error);
                }
              }
            }
    
            // Sort packs by order and filter enabled ones
            packs = packs.sort((a, b) => a.order - b.order).filter(pack => pack.enabled);
    
            resolve(packs.map(pack => pack.data));
          };
        });
      }

      async togglePackEnabled(name: string, enabled: boolean): Promise<void> {
        await this.ensureDbInitialized();
        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject("Database not initialized");
            return;
          }
    
          const transaction = this.db.transaction(['packs'], 'readwrite');
          const store = transaction.objectStore('packs');
          const request = store.get(name);
    
          request.onerror = () => reject("Error getting pack");
          request.onsuccess = () => {
            const pack = request.result as StoredResourcePack;
            if (pack) {
              pack.enabled = enabled;
              store.put(pack);
              resolve();
            } else {
              reject(`Pack ${name} not found`);
            }
          };
        });
      }
    
      async reorderPack(name: string, newOrder: number): Promise<void> {
        await this.ensureDbInitialized();
        return new Promise((resolve, reject) => {
          if (!this.db) {
            reject("Database not initialized");
            return;
          }
    
          const transaction = this.db.transaction(['packs'], 'readwrite');
          const store = transaction.objectStore('packs');
          const request = store.getAll();
    
          request.onerror = () => reject("Error getting packs");
          request.onsuccess = () => {
            let packs = request.result as StoredResourcePack[];
            const packIndex = packs.findIndex(p => p.name === name);
            
            if (packIndex === -1) {
              reject(`Pack ${name} not found`);
              return;
            }
    
            // Remove the pack from its current position
            const [pack] = packs.splice(packIndex, 1);
    
            // Insert the pack at its new position
            packs.splice(newOrder, 0, pack);
    
            // Update order for all packs
            packs.forEach((p, index) => {
              p.order = index;
              store.put(p);
            });
    
            resolve();
          };
        });
      }
  }